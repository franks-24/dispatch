import {test,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {initializeTestEnvironment,assertFails} from "@firebase/rules-unit-testing";
import {doc,getDoc,setDoc} from "firebase/firestore";
import {createFirestoreStore} from "../firestore-store.js";
import {createService,createOperator,customerPath} from "../service.js";

if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error("Firestore emulator is required; never run against production.");
const projectId="demo-franks24-deliveries",app=initializeApp({projectId},"delivery-integration");
const db=getFirestore(app),store=createFirestoreStore(db);
const env=await initializeTestEnvironment({projectId,firestore:{rules:await readFile(new URL("../../firestore.rules",import.meta.url),"utf8")}});
after(async()=>{await env.cleanup();await db.terminate();await deleteApp(app);});
const acceptance={version:"approved-test",terms:true,privacy:true,ownership:true};
const body={pickupArea:"Johannesburg",deliveryArea:"Pretoria",weightKg:1,lengthCm:20,widthCm:10,heightCm:10,service:"economy",acceptance};
const options={store,enabled:true,policyVersion:acceptance.version,verifyToken:async uid=>({uid,email_verified:true,firebase:{sign_in_provider:"google.com"}}),readProof:async()=>Buffer.from("%PDF-test")};
const api=createService(options),operator=createOperator(options);
const call=(method,path,body,uid,key)=>api.handle({method,path:`/api/deliveries${path}`,body,headers:{authorization:`Bearer ${uid}`,"content-type":"application/json","idempotency-key":key}});

test("Firestore transaction stores one quote across concurrent duplicate requests",async()=>{
  const uid="emulator-quote-customer";
  const responses=await Promise.all(Array.from({length:5},()=>call("POST","/quotes",body,uid,"same-request-key")));
  assert.ok(responses.every(r=>r.status===201),JSON.stringify(responses));
  assert.equal(new Set(responses.map(r=>r.body.id)).size,1);
  const page=await call("GET","/quotes",undefined,uid);
  assert.equal(page.body.items.length,1);
  assert.equal((await db.collection(`${customerPath(uid)}/agreements`).get()).size,1);
});
test("Firestore transactions permit only one booking for a quote under contention",async()=>{
  const uid="emulator-booking-customer";
  const quote=await call("POST","/quotes",body,uid,"new-quote-key");assert.equal(quote.status,201);
  await operator.issueQuote(uid,quote.body.id,{totalMinor:25000,expiresAt:new Date(Date.now()+600000).toISOString(),coverageApproved:true,operator:"emulator-operator"});
  const booking={quoteId:quote.body.id,pickupAddress:"1 Test Street",deliveryAddress:"2 Test Road",recipientName:"Test Person",recipientPhone:"+27115550100",acceptance};
  const responses=await Promise.all([call("POST","/bookings",booking,uid,"booking-key-one"),call("POST","/bookings",booking,uid,"booking-key-two")]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409],JSON.stringify(responses));
  const page=await call("GET","/shipments",undefined,uid);assert.equal(page.body.items.length,1);
  assert.equal((await call("GET",`/shipments/${page.body.items[0].id}`,undefined,"other-account")).status,404);
});
test("even authenticated owners cannot bypass the delivery API through browser Firestore writes or reads",async()=>{
  const uid="emulator-rule-customer",path=`${customerPath(uid)}/quotes/private-quote`;
  await db.doc(path).set({id:"private-quote",status:"pending",createdAt:new Date().toISOString()});
  const client=env.authenticatedContext(uid,{email:"test@example.test",email_verified:true,firebase:{sign_in_provider:"google.com"}}).firestore();
  await assertFails(getDoc(doc(client,path)));
  await assertFails(setDoc(doc(client,path),{status:"quoted",totalMinor:1}));
  await assertFails(setDoc(doc(client,`${customerPath(uid)}/agreements/forged`),{terms:true}));
});
test("Firestore pagination orders by created time and stays inside the customer's collection",async()=>{
  const uid="emulator-pages";
  for(const [id,createdAt]of [["older","2026-01-01T00:00:00Z"],["newer","2026-02-01T00:00:00Z"]])await db.doc(`${customerPath(uid)}/quotes/${id}`).set({id,createdAt,status:"pending"});
  const first=await call("GET","/quotes?limit=1",undefined,uid);assert.equal(first.status,200);assert.equal(first.body.items[0].id,"newer");assert.equal(first.body.nextCursor,"newer");
  const next=await call("GET","/quotes?limit=1&cursor=newer",undefined,uid);assert.equal(next.body.items[0].id,"older");assert.equal(next.body.nextCursor,null);
});

test("real Firestore permits one driver acceptance and one earning under concurrent retries",async()=>{
 const {createOperationsService}=await import("../operations-service.js"),{hash}=await import("../service.js");
 const uid="emulator-ops-driver",driverId=hash(uid),future=new Date(Date.now()+86400000).toISOString();
 await db.doc("dispatchDrivers/"+driverId).set({id:driverId,uid,email:uid+"@test.invalid",status:"approved",validUntil:future,policyVersion:"driver-approved-test",createdAt:new Date().toISOString()});
 await db.doc(customerPath("emulator-ops-customer")+"/shipments/ops-shipment").set({id:"ops-shipment",reference:"OPS-EMULATOR",status:"confirmed",carrierReference:"ACTUAL-TEST-CARRIER",pickupArea:"Johannesburg",deliveryArea:"Pretoria",events:[],createdAt:new Date().toISOString()});
 const service=createOperationsService({store,enabled:true,policyVersion:"driver-approved-test",
  verifyToken:async token=>({uid:token,email:token+"@test.invalid",email_verified:true,firebase:{sign_in_provider:"google.com"}}),
  authorizeStaff:async token=>({uid:token,role:"dispatcher"}),
  saveProof:async()=>({path:"delivery-proofs/"+hash("emulator-ops-customer")+"/ops-shipment/evidence.pdf",generation:"1"})
 });
 let key=0;
 const request=(uid,path,body,idempotency)=>service.handle({method:body?"POST":"GET",path,body,headers:{authorization:"Bearer "+uid,"content-type":"application/json","idempotency-key":idempotency||"emulator-operation-"+(++key)}});
 const offered=await request("dispatcher","/api/operations/jobs",{customerUid:"emulator-ops-customer",shipmentId:"ops-shipment",driverId,feeMinor:15000,feePolicyVersion:"driver-approved-test",dueAt:future});
 assert.equal(offered.status,201,JSON.stringify(offered));const id=offered.body.job.id;
 const accepted=await Promise.all([request(uid,"/api/driver/jobs/"+id+"/accept",{feePolicyVersion:"driver-approved-test"}),request(uid,"/api/driver/jobs/"+id+"/accept",{feePolicyVersion:"driver-approved-test"})]);
 assert.deepEqual(accepted.map(r=>r.status).sort(),[201,409],JSON.stringify(accepted));
 for(const status of ["collected","in_transit","out_for_delivery"])assert.equal((await request(uid,"/api/driver/jobs/"+id+"/status",{status,description:"Emulator verified progress"})).status,201);
 assert.equal((await request(uid,"/api/driver/jobs/"+id+"/proof",{base64:Buffer.from("%PDF-test").toString("base64")})).status,201);
 const completed=await Promise.all([request(uid,"/api/driver/jobs/"+id+"/status",{status:"delivered",description:"Verified handover"},"same-delivery-key"),request(uid,"/api/driver/jobs/"+id+"/status",{status:"delivered",description:"Verified handover"},"same-delivery-key")]);
 assert.deepEqual(completed.map(r=>r.status),[201,201],JSON.stringify(completed));
 assert.equal((await db.collection("dispatchDrivers/"+driverId+"/ledger").get()).size,1);
 const day=new Date().toISOString().slice(0,10),metrics=(await db.doc("dispatchDrivers/"+driverId+"/metrics/"+day).get()).data();
 assert.equal(metrics.accepted,1);assert.equal(metrics.completed,1);
 await db.doc("dispatchDrivers/"+driverId).update({status:"suspended"});
 assert.equal((await request(uid,"/api/driver/jobs/"+id)).status,403);
});
test("browser users cannot read or overwrite driver, KYC, operations, finance or message records",async()=>{
 const client=env.authenticatedContext("emulator-ops-driver",{email:"driver@test.invalid",email_verified:true,role:"dispatcher",firebase:{sign_in_provider:"google.com"}}).firestore();
 for(const path of ["dispatchDrivers/private","dispatchDriverApplications/private","dispatchJobs/private","dispatchJobs/private/messages/private","dispatchSettlements/private","dispatchQuoteQueue/private","dispatchShipmentQueue/private","dispatchPrivacyQueue/private","dispatchOperationsAudit/private"]){
  await db.doc(path).set({private:true});
  await assertFails(getDoc(doc(client,path)));
  await assertFails(setDoc(doc(client,path),{status:"approved"}));
 }
});
