import {test} from "node:test";
import assert from "node:assert/strict";
import {createOperationsService,vettingCriteria} from "../operations-service.js";
import {hash,customerPath} from "../service.js";
import {memoryStore} from "./memory-store.mjs";

const start=Date.parse("2026-10-31T10:00:00Z"),future=new Date(start+86400000).toISOString();
function setup(enabled=true){
 const store=memoryStore();let now=start,serial=0;
 const service=createOperationsService({store,enabled,clock:()=>now,uuid:()=>"id-"+(++serial),
  policyVersion:"driver-policy-1",managerUids:["reviewer"],financeUids:["finance1","finance2"],
  verifyToken:async token=>{if(token==="invalid")throw Error("secret");return {uid:token,email:token+"@test.invalid",email_verified:token!=="unverified",firebase:{sign_in_provider:token==="password"?"password":"google.com"}};},
  authorizeStaff:async token=>{if(!["reviewer","dispatcher","finance1","finance2"].includes(token))throw Error("Directory failed");return {uid:token,role:"dispatcher"};},
  lookupUser:async uid=>({email:uid+"@test.invalid",emailVerified:true,disabled:false,providerData:[{providerId:"google.com"}]}),
  saveProof:async({customerUid,shipmentId})=>({path:"delivery-proofs/"+hash(customerUid)+"/"+shipmentId+"/proof.pdf",generation:"123"})
 });
 const call=(actor,path,body,key)=>service.handle({method:body===undefined?"GET":"POST",path,headers:{authorization:"Bearer "+actor,"content-type":"application/json","idempotency-key":key||"request-"+(++serial)},body});
 const seedDriver=(uid="driver")=>store.data.set("dispatchDrivers/"+hash(uid),{id:hash(uid),uid,email:uid+"@test.invalid",name:uid,status:"approved",validUntil:future,vehicle:"car",region:"Johannesburg",createdAt:new Date(start).toISOString()});
 const seedShipment=()=>{
  const path=customerPath("customer")+"/shipments/shipment";
  store.data.set(path,{id:"shipment",reference:"F24-TEST",status:"confirmed",carrierReference:"REAL-CARRIER",pickupArea:"Johannesburg",deliveryArea:"Pretoria",pickupAddress:"Private collection",deliveryAddress:"Private recipient",recipientName:"Test recipient",recipientPhone:"+27110000000",events:[],createdAt:new Date(start).toISOString()});
 };
 const offer=async()=>{seedDriver();seedShipment();return call("dispatcher","/api/operations/jobs",{customerUid:"customer",shipmentId:"shipment",driverId:hash("driver"),feeMinor:15000,feePolicyVersion:"driver-policy-1",dueAt:future});};
 const checks=()=>Object.fromEntries(vettingCriteria.map(k=>[k,{result:"verified",evidenceRef:"private-evidence-"+k,expiresAt:future}]));
 return {store,call,seedDriver,seedShipment,offer,checks,setTime:value=>{now=value;}};
}
const driverJob=(id,action)=>"/api/driver/jobs/"+id+(action?"/"+action:"");

test("operations fail closed and reject non-Google, revoked and unverified identities",async()=>{
 const closed=setup(false);assert.equal((await closed.call("reviewer","/api/operations/session")).status,503);
 const s=setup();
 for(const [uid,code]of [["invalid",401],["unverified",403],["password",403],["driver",403]])assert.equal((await s.call(uid,"/api/driver/session")).status,code);
 assert.equal((await s.call("driver","/api/operations/session")).status,503);
});
test("reviewer approval requires every verified unexpired criterion and matching separate identity",async()=>{
 const s=setup(),path="/api/operations/applications";
 assert.equal((await s.call("dispatcher",path,{name:"Driver",email:"driver@test.invalid",vehicle:"car",region:"Johannesburg"})).status,403);
 const result=await s.call("reviewer",path,{name:"Driver",email:"driver@test.invalid",vehicle:"car",region:"Johannesburg"});
 const approve=path+"/"+result.body.application.id+"/approve",checks=s.checks();
 checks.identity.result="unverified";
 assert.equal((await s.call("reviewer",approve,{driverUid:"driver",checks,hold:false,prdpRequired:false})).status,400);
 checks.identity.result="verified";checks.licence.expiresAt=new Date(start-1).toISOString();
 assert.equal((await s.call("reviewer",approve,{driverUid:"driver",checks,hold:false,prdpRequired:false})).status,400);
 checks.licence.expiresAt=future;
 assert.equal((await s.call("reviewer",approve,{driverUid:"other",checks,hold:false,prdpRequired:false})).status,400);
 assert.equal((await s.call("reviewer",approve,{driverUid:"driver",checks,hold:false,prdpRequired:false})).status,201);
 assert.equal((await s.call("driver","/api/driver/session")).status,200);
});
test("expiry and manual suspension revoke current access without trusting claims",async()=>{
 const s=setup();s.seedDriver();s.setTime(start+86400001);
 assert.equal((await s.call("driver","/api/driver/session")).status,403);
 s.setTime(start);
 assert.equal((await s.call("reviewer","/api/operations/drivers/"+hash("driver")+"/suspend",{reason:"Manual review hold"})).status,201);
 assert.equal((await s.call("driver","/api/driver/session")).status,403);
});
test("one confirmed shipment produces one offered job and offers omit recipient details",async()=>{
 const s=setup();const result=await s.offer();assert.equal(result.status,201);
 const id=result.body.job.id;
 const before=await s.call("driver",driverJob(id));assert.equal(before.body.delivery,undefined);
 const again=await s.call("dispatcher","/api/operations/jobs",{customerUid:"customer",shipmentId:"shipment",driverId:hash("driver"),feeMinor:15000,feePolicyVersion:"driver-policy-1",dueAt:future});
 assert.equal(again.status,409);
 s.seedDriver("other");assert.equal((await s.call("other",driverJob(id))).status,404);
});
test("concurrent offer acceptance is transactional and idempotency conflicts are rejected",async()=>{
 const s=setup(),id=(await s.offer()).body.job.id,path=driverJob(id,"accept"),body={feePolicyVersion:"driver-policy-1"};
 const pair=await Promise.all([s.call("driver",path,body,"same-key-123"),s.call("driver",path,body,"same-key-123")]);
 assert.deepEqual(pair.map(r=>r.status),[201,201]);assert.deepEqual(pair[0].body,pair[1].body);
 assert.equal((await s.call("driver",path,body)).status,409);
 assert.equal((await s.call("driver",path,{feePolicyVersion:"other"},"same-key-123")).status,400);
 assert.equal((await s.call("driver",driverJob(id))).body.delivery.deliveryAddress,"Private recipient");
});
test("reassignment revokes previous driver reads and even previously successful replays",async()=>{
 const s=setup(),id=(await s.offer()).body.job.id;s.seedDriver("other");
 await s.call("driver",driverJob(id,"accept"),{feePolicyVersion:"driver-policy-1"},"old-driver-key");
 assert.equal((await s.call("dispatcher","/api/operations/jobs/"+id+"/offer",{driverId:hash("other"),reason:"Driver unavailable"})).status,201);
 assert.equal((await s.call("driver",driverJob(id))).status,404);
 assert.equal((await s.call("driver",driverJob(id,"accept"),{feePolicyVersion:"driver-policy-1"},"old-driver-key")).status,404);
 const page=await s.call("driver","/api/driver/jobs");assert.equal(page.body.items.length,0);
});
async function finish(s){
 const id=(await s.offer()).body.job.id;
 await s.call("driver",driverJob(id,"accept"),{feePolicyVersion:"driver-policy-1"});
 for(const status of ["collected","in_transit","out_for_delivery"])assert.equal((await s.call("driver",driverJob(id,"status"),{status,description:"Verified test event"})).status,201);
 return id;
}
test("sequential driver progress requires private proof and creates one immutable earning",async()=>{
 const s=setup(),id=await finish(s),path=driverJob(id,"status");
 assert.equal((await s.call("driver",path,{status:"delivered",description:"Handover confirmed"})).status,409);
 assert.equal((await s.call("driver",driverJob(id,"proof"),{base64:Buffer.from("not PDF").toString("base64")})).status,400);
 assert.equal((await s.call("driver",driverJob(id,"proof"),{base64:Buffer.from("%PDF-1.7 test").toString("base64")})).status,201);
 const pair=await Promise.all([s.call("driver",path,{status:"delivered",description:"Handover confirmed"},"delivered-key"),s.call("driver",path,{status:"delivered",description:"Handover confirmed"},"delivered-key")]);
 assert.deepEqual(pair.map(r=>r.status),[201,201]);
 const ledger=await s.call("driver","/api/driver/ledger");assert.equal(ledger.body.items.length,1);assert.equal(ledger.body.items[0].amountMinor,15000);
 const performance=await s.call("dispatcher","/api/operations/drivers/"+hash("driver")+"/performance?days=7");
 assert.equal(performance.body.completed,1);assert.equal(performance.body.onTime,1);assert.equal(performance.body.accepted,1);assert.equal(performance.body.proofCompliancePercent,100);
 const shipment=await s.store.get(customerPath("customer")+"/shipments/shipment");assert.equal(shipment.status,"delivered");assert.ok(shipment.proof);
 assert.equal((await s.call("driver",driverJob(id))).body.delivery,undefined);
});
test("recorded external settlement needs a different authorized finance reviewer",async()=>{
 const s=setup(),id=await finish(s);
 await s.call("driver",driverJob(id,"proof"),{base64:Buffer.from("%PDF-1.7 test").toString("base64")});
 await s.call("driver",driverJob(id,"status"),{status:"delivered",description:"Handover confirmed"});
 const submit={jobId:id,bankReference:"EXTERNAL-BANK-REF",evidenceRef:"private-bank-evidence"};
 assert.equal((await s.call("dispatcher","/api/operations/settlements",submit)).status,403);
 assert.equal((await s.call("finance1","/api/operations/settlements",submit)).status,201);
 const path="/api/operations/settlements/"+id+"/reconcile";
 assert.equal((await s.call("finance1",path,{statementReference:"statement-1"})).status,409);
 assert.equal((await s.call("finance2",path,{statementReference:"statement-1"})).status,201);
 assert.equal((await s.call("finance2",path,{statementReference:"statement-1"})).status,409);
 const ledger=await s.call("driver","/api/driver/ledger");assert.equal(ledger.body.items.length,2);
});
test("GPS is accepted only on an active assignment with current consent; stale coordinates are hidden",async()=>{
 const s=setup(),id=(await s.offer()).body.job.id,path=driverJob(id,"location");
 const body={consent:true,policyVersion:"driver-policy-1",latitude:-26.2,longitude:28.0,accuracy:20,capturedAt:new Date(start).toISOString()};
 assert.equal((await s.call("driver",path,body)).status,409);
 await s.call("driver",driverJob(id,"accept"),{feePolicyVersion:"driver-policy-1"});
 assert.equal((await s.call("driver",path,body)).status,201);
 s.setTime(start+121000);
 const page=await s.call("dispatcher","/api/operations/jobs");assert.equal(page.body.items[0].location.stale,true);assert.equal(page.body.items[0].location.latitude,undefined);
 assert.equal((await s.call("driver",path,body)).status,400);
 assert.equal((await s.call("driver",path,{consent:false,policyVersion:"driver-policy-1"})).status,201);
 assert.equal((await s.store.get("dispatchJobs/"+id)).location,null);
});
test("messages are assignment scoped and have no invented delivery or read receipt",async()=>{
 const s=setup(),id=(await s.offer()).body.job.id,path=driverJob(id,"messages");
 assert.equal((await s.call("driver",path,{text:"Parked safely"})).status,409);
 await s.call("driver",driverJob(id,"accept"),{feePolicyVersion:"driver-policy-1"});
 const response=await s.call("driver",path,{text:"Parked safely"},"message-key");
 assert.equal(response.status,201);assert.equal(response.body.message.role,"driver");
 assert.equal(response.body.message.read,undefined);
 assert.equal((await s.call("driver",path,{text:"different"},"message-key")).status,409);
 s.seedDriver("other");assert.equal((await s.call("other",path)).status,404);
});
test("client role, price overrides, unknown fields and malformed identifiers are rejected",async()=>{
 const s=setup();s.seedDriver();
 assert.equal((await s.call("reviewer","/api/operations/applications",{name:"Bad",email:"driver@test.invalid",vehicle:"car",region:"JHB",status:"approved"})).status,400);
 assert.equal((await s.call("driver","/api/driver/jobs/../../operations/session")).status,400);
 const result=await s.call("reviewer","/api/operations/applications?limit=999");assert.equal(result.status,400);
});

test("customer request flows through staff pricing, booking confirmation and driver offer without ID entry",async()=>{
 const s=setup();s.seedDriver();
 const {createService}=await import("../service.js");
 const customer=createService({store:s.store,enabled:true,policyVersion:"customer-policy-1",clock:()=>start,uuid:(()=>{let i=0;return ()=>"customer-record-"+(++i);})(),
  verifyToken:async()=>({uid:"customer",email_verified:true,firebase:{sign_in_provider:"google.com"}})});
 const acceptance={version:"customer-policy-1",terms:true,privacy:true,ownership:true};
 const call=(path,body,key)=>customer.handle({method:"POST",path:"/api/deliveries/"+path,body,headers:{authorization:"Bearer customer","content-type":"application/json","idempotency-key":key}});
 const quote=await call("quotes",{pickupArea:"Johannesburg",deliveryArea:"Pretoria",weightKg:1,lengthCm:10,widthCm:10,heightCm:10,service:"economy",acceptance},"customer-quote-key");
 assert.equal(quote.status,201);
 const quoteQueue=await s.call("dispatcher","/api/operations/quotes");assert.equal(quoteQueue.body.items.length,1);
 assert.equal((await s.call("dispatcher","/api/operations/quotes/"+quoteQueue.body.items[0].id+"/issue",{totalMinor:20000,expiresAt:future,coverageApproved:true,rateEvidenceRef:"verified-rate-evidence"})).status,201);
 const booking=await call("bookings",{quoteId:quote.body.id,pickupAddress:"Private collection",deliveryAddress:"Private destination",recipientName:"Fixture recipient",recipientPhone:"+27110000000",acceptance},"customer-booking-key");
 assert.equal(booking.status,201);
 const shipments=await s.call("dispatcher","/api/operations/shipments"),entry=shipments.body.items[0];
 assert.equal((await s.call("dispatcher","/api/operations/shipments/"+entry.id+"/confirm",{carrierReference:"ACTUAL-CARRIER-BOOKING",bookingVerified:true})).status,201);
 const offered=await s.call("dispatcher","/api/operations/jobs",{customerUid:entry.customerUid,shipmentId:entry.shipmentId,driverId:hash("driver"),feeMinor:15000,feePolicyVersion:"driver-policy-1",dueAt:future});
 assert.equal(offered.status,201);
 const jobs=await s.call("driver","/api/driver/jobs");assert.equal(jobs.body.items[0].id,offered.body.job.id);
});
