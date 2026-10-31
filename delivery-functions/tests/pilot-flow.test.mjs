import {test} from "node:test";
import assert from "node:assert/strict";
import {createService,hash,customerPath} from "../service.js";
import {createOperationsService} from "../operations-service.js";
import {memoryStore} from "./memory-store.mjs";

// This is a deterministic, simulated acceptance journey. It must never be
// reported as a live courier booking, an actual bank payment or Google SSO.
test("pilot: one customer request completes reviewed dispatch, POD and dual-control settlement without leaking private data",async()=>{
 const clockTime=Date.parse("2026-10-31T09:00:00Z");
 const future=new Date(clockTime+86400000).toISOString();
 const store=memoryStore();let serial=0;
 const uuid=()=> "pilot-"+(++serial);
 const identity=uid=>({uid,email:uid+"@example.invalid",email_verified:true,
   firebase:{sign_in_provider:"google.com"}});
 const customer=createService({store,enabled:true,clock:()=>clockTime,uuid,
   policyVersion:"delivery-approved-fixture",verifyToken:async token=>identity(token)});
 const courier=createOperationsService({store,enabled:true,clock:()=>clockTime,uuid,
   policyVersion:"driver-approved-fixture",managerUids:["reviewer"],financeUids:["finance1","finance2"],
   verifyToken:async token=>identity(token),
   authorizeStaff:async token=>{
     if(!["reviewer","dispatcher","finance1","finance2"].includes(token))throw Error("Directory denied");
     return {uid:token,role:"dispatcher"};
   },
   lookupUser:async()=>{throw Error("not used in this fixture");},
   saveProof:async({customerUid,shipmentId,bytes})=>{
     assert.match(bytes.toString("utf8"),/^%PDF-/);
     return {path:"delivery-proofs/"+hash(customerUid)+"/"+shipmentId+"/pilot-evidence.pdf",generation:"1"};
   }
 });
 const customerCall=(who,path,body,key)=>customer.handle({
   method:body===undefined?"GET":"POST",path:"/api/deliveries/"+path,
   body,headers:{authorization:"Bearer "+who,"content-type":"application/json","idempotency-key":key}});
 let nextKey=0;
 const call=(who,path,body,key)=>courier.handle({method:body===undefined?"GET":"POST",path,body,
   headers:{authorization:"Bearer "+who,"content-type":"application/json",
   "idempotency-key":key||"pilot-request-"+(++nextKey)}});
 // A staff-approved credential record must already be present. The public
 // applicant UI cannot create or elevate this record.
 await store.transaction(tx=>{
   tx.create("dispatchDrivers/"+hash("driver"),{id:hash("driver"),uid:"driver",
     name:"Fixture courier",email:"driver@example.invalid",status:"approved",
     policyVersion:"driver-approved-fixture",vehicle:"car",region:"Johannesburg",
     validUntil:future,createdAt:new Date(clockTime).toISOString()});
 });
 assert.equal((await call("unapproved","/api/driver/session")).status,403);
 const consent={version:"delivery-approved-fixture",terms:true,privacy:true,ownership:true};
 const quote=await customerCall("customer","quotes",{pickupArea:"Johannesburg",deliveryArea:"Pretoria",
   weightKg:1,lengthCm:20,widthCm:15,heightCm:10,service:"economy",acceptance:consent},"quote-unique-001");
 assert.equal(quote.status,201,JSON.stringify(quote.body));
 const queued=await call("dispatcher","/api/operations/quotes");
 assert.equal(queued.status,200);assert.equal(queued.body.items.length,1);
 const issue=await call("dispatcher","/api/operations/quotes/"+queued.body.items[0].id+"/issue",
   {totalMinor:21000,expiresAt:future,coverageApproved:true,
    rateEvidenceRef:"restricted-carrier-quote-fixture"});
 assert.equal(issue.status,201,JSON.stringify(issue.body));
 const booking=await customerCall("customer","bookings",{quoteId:quote.body.id,
   pickupAddress:"Fixture collection location",deliveryAddress:"Fixture destination",
   recipientName:"Fixture recipient",recipientPhone:"+27110000000",
   acceptance:consent},"booking-unique-001");
 assert.equal(booking.status,201,JSON.stringify(booking.body));
 assert.equal((await customerCall("other","shipments")).body.items.length,0);
 const queue=(await call("dispatcher","/api/operations/shipments")).body.items[0];
 assert.equal((await call("dispatcher","/api/operations/shipments/"+queue.id+"/confirm",
   {carrierReference:"EXTERNAL-CARRIER-FIXTURE",bookingVerified:true})).status,201);
 const offered=await call("dispatcher","/api/operations/jobs",
   {customerUid:queue.customerUid,shipmentId:queue.shipmentId,driverId:hash("driver"),
    feeMinor:14000,feePolicyVersion:"driver-approved-fixture",dueAt:future});
 assert.equal(offered.status,201,JSON.stringify(offered.body));
 const jobId=offered.body.job.id,jobRoute="/api/driver/jobs/"+jobId;
 const before=await call("driver",jobRoute);
 assert.equal(before.status,200);
 assert.equal(before.body.delivery,undefined,"recipient fields must not be exposed by an offer");
 assert.equal((await call("outsider",jobRoute)).status,403);
 const accept={feePolicyVersion:"driver-approved-fixture"};
 const accepted=await Promise.all([
   call("driver",jobRoute+"/accept",accept,"fixed-accept-key"),
   call("driver",jobRoute+"/accept",accept,"fixed-accept-key")
 ]);
 assert.deepEqual(accepted.map(x=>x.status),[201,201]);
 assert.equal((await call("driver",jobRoute)).body.delivery.recipientName,"Fixture recipient");
 for(const status of ["collected","in_transit","out_for_delivery"]){
   const result=await call("driver",jobRoute+"/status",{status,description:"Verified fixture event "+status});
   assert.equal(result.status,201,JSON.stringify(result.body));
 }
 assert.equal((await call("driver",jobRoute+"/status",
   {status:"delivered",description:"Fixture delivery completed"})).status,409);
 assert.equal((await call("driver",jobRoute+"/proof",
   {base64:Buffer.from("%PDF-1.7 fixture proof").toString("base64")})).status,201);
 assert.equal((await call("driver",jobRoute+"/status",
   {status:"delivered",description:"Fixture recipient handover"})).status,201);
 const delivered=await store.get(customerPath("customer")+"/shipments/"+queue.shipmentId);
 assert.equal(delivered.status,"delivered");
 assert.equal(delivered.events.at(-1).status,"delivered");
 assert.equal((await call("driver",jobRoute)).body.delivery,undefined);
 const earning=(await call("driver","/api/driver/ledger")).body.items;
 assert.equal(earning.length,1);
 assert.equal(earning[0].amountMinor,14000);
 assert.equal(earning[0].type,"earning");
 const external=await call("finance1","/api/operations/settlements",
   {jobId,bankReference:"BANK-PAYMENT-FIXTURE",evidenceRef:"private-statement-fixture"});
 assert.equal(external.status,201);
 assert.equal((await call("finance1","/api/operations/settlements/"+jobId+"/reconcile",
   {statementReference:"BANK-STATEMENT-FIXTURE"})).status,409);
 assert.equal((await call("finance2","/api/operations/settlements/"+jobId+"/reconcile",
   {statementReference:"BANK-STATEMENT-FIXTURE"})).status,201);
 const entries=(await call("driver","/api/driver/ledger")).body.items;
 assert.equal(entries.length,2);
 assert.equal(new Set(entries.map(x=>x.type)).size,2);
 assert.equal(entries.find(x=>x.type==="external_settlement").amountMinor,14000);
 assert.equal((await call("finance1","/api/operations/settlements",
   {jobId,bankReference:"DUPLICATE-BANK-FIXTURE",evidenceRef:"private-statement-fixture"})).status,409);
 assert.equal((await call("reviewer","/api/operations/drivers/"+hash("driver")+"/suspend",
   {reason:"Test suspension after delivery"})).status,201);
 assert.equal((await call("driver","/api/driver/ledger")).status,403);
});
