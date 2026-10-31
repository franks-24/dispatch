import {randomUUID} from "node:crypto";
import {HttpError,hash,customerPath} from "./service.js";
import {DispatcherAccessError} from "./dispatcher-auth.js";

const requireValue=(ok,status,message)=>{if(!ok)throw new HttpError(status,message);};
const id=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const string=(value,min=1,max=300)=>{
 requireValue(typeof value==="string"&&value.trim().length>=min&&value.trim().length<=max,400,"Invalid fields.");
 return value.trim();
};
const fields=(body,keys)=>requireValue(body&&typeof body==="object"&&!Array.isArray(body)&&Object.keys(body).every(k=>keys.includes(k)),400,"Unexpected fields.");
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=body=>hash(JSON.stringify(canonical(body)));
const driverPath=uid=>"dispatchDrivers/"+hash(uid);
const jobPath=jobId=>"dispatchJobs/"+jobId;
const queueEntry=(job,status,at)=>({id:hash(job.customerUid+":"+job.shipmentId),customerUid:job.customerUid,shipmentId:job.shipmentId,reference:job.reference,status,pickupArea:job.pickupArea,deliveryArea:job.deliveryArea,createdAt:job.createdAt,updatedAt:at});
const activeStatuses=["accepted","collected","in_transit","out_for_delivery","exception"];
const transitions={accepted:["collected","exception"],collected:["in_transit","exception"],in_transit:["out_for_delivery","exception"],out_for_delivery:["delivered","exception"],exception:["in_transit","out_for_delivery"]};
export const vettingCriteria=Object.freeze(["eligibility","identity","rightToWork","contact","licence","prdp","vehicle","insurance","riskReview","beneficiary","agreement","safety"]);

export function validateVetting(checks,{vehicle,prdpRequired,clock=Date.now}){
 fields(checks,vettingCriteria);
 const now=clock();let validUntil=now+366*86400000;
 for(const criterion of vettingCriteria){
  const check=checks[criterion];fields(check,["result","evidenceRef","expiresAt"]);
  const notApplicable=(criterion==="licence"&&vehicle==="bicycle")||(criterion==="prdp"&&!prdpRequired);
  requireValue(check.result==="verified"||(notApplicable&&check.result==="not_applicable"),400,"Every required vetting criterion must be verified.");
  string(check.evidenceRef,3,200);
  if(["licence","prdp","vehicle","insurance","beneficiary"].includes(criterion)&&check.result==="verified"){
   const expiry=Date.parse(check.expiresAt);
   requireValue(Number.isFinite(expiry)&&expiry>now,400,"Vetting evidence is expired or has no expiry.");
   validUntil=Math.min(validUntil,expiry);
  }
 }
 return new Date(validUntil).toISOString();
}

export function createOperationsService({store,verifyToken,authorizeStaff,lookupUser,saveProof,
 enabled=false,policyVersion,managerUids=[],financeUids=[],clock=Date.now,uuid=randomUUID}){
 const headers={"Cache-Control":"private, no-store","Content-Type":"application/json","X-Content-Type-Options":"nosniff"};
 const approved=driver=>requireValue(driver?.status==="approved"&&Date.parse(driver.validUntil)>clock(),403,"Driver approval is missing, suspended or expired.");
 const manager=actor=>requireValue(actor.staff&&managerUids.includes(actor.uid),403,"An authorized driver reviewer is required.");
 const finance=actor=>requireValue(actor.staff&&financeUids.includes(actor.uid),403,"An authorized finance reviewer is required.");
 const metricPath=(driverId,at)=>"dispatchDrivers/"+driverId+"/metrics/"+at.slice(0,10);
 const metric=(prior,changes)=>Object.fromEntries(["offered","accepted","acceptanceMs","completed","onTime","proofCompliant","exceptions"].map(key=>[key,(prior?.[key]||0)+(changes[key]||0)]));
 async function driverGuard(tx,actor,jobId){
  if(actor.staff)return;
  const driver=await tx.get(driverPath(actor.uid));approved(driver);
  requireValue(driver.email===actor.email,403,"Driver identity changed.");
  if(jobId){const job=await tx.get(jobPath(jobId));requireValue(job?.driverId===hash(actor.uid),404,"No matching assignment.");}
 }
 async function mutate(actor,route,key,body,work,jobId){
  requireValue(id(key)&&key.length>=8,400,"An idempotency key is required.");
  const path="dispatchOperationRequests/"+hash(actor.uid+":"+route+":"+key),requestDigest=digest(body);
  return store.transaction(async tx=>{
   const prior=await tx.get(path);
   await driverGuard(tx,actor,jobId);
   if(prior){requireValue(prior.digest===requestDigest,409,"Idempotency key conflicts with an earlier request.");return prior.response;}
   const at=new Date(clock()).toISOString();
   const response=await work(tx,at);
   tx.create(path,{digest:requestDigest,response,createdAt:at});
   tx.create("dispatchOperationsAudit/"+uuid(),{id:uuid(),actor:actor.uid,role:actor.staff?"dispatcher":"driver",route,requestDigest,createdAt:at});
   return response;
  });
 }
 const pageOptions=url=>{
  const limit=Number(url.searchParams.get("limit")||30),cursor=url.searchParams.get("cursor")||null;
  requireValue(Number.isInteger(limit)&&limit>=1&&limit<=100&&(!cursor||id(cursor)),400,"Invalid page.");
  return {limit,cursor};
 };
 function jobView(job,staff=false){
  const {id,reference,status,pickupArea,deliveryArea,feeMinor,currency,createdAt,updatedAt,driverId,proof,location}=job;
  const view={id,reference,status,pickupArea,deliveryArea,feeMinor,currency,createdAt,updatedAt,proofAvailable:!!proof};
  if(staff){
   view.driverId=driverId;
   view.location=location?{lastSeen:location.at,accuracy:location.accuracy,stale:clock()-Date.parse(location.at)>120000,...(clock()-Date.parse(location.at)<=120000?{latitude:location.latitude,longitude:location.longitude}:{})}:null;
  }
  return view;
 }
 async function execute(actor,method,url,body,key){
  const route=url.pathname,isDriver=!actor.staff,options=pageOptions(url);
  const write=(work,jobId)=>mutate(actor,route,key,body,work,jobId);
  if(method==="GET"&&route===(isDriver?"/api/driver/session":"/api/operations/session"))
   return {role:isDriver?"driver":"dispatcher",canReview:actor.staff&&managerUids.includes(actor.uid),canReconcile:actor.staff&&financeUids.includes(actor.uid)};
  const performance=route.match(/^\/api\/operations\/drivers\/([a-f0-9]{64})\/performance$/);
  if(!isDriver&&method==="GET"&&performance){
   const days=Number(url.searchParams.get("days")||30);
   requireValue([7,30,90].includes(days),400,"Choose a 7, 30 or 90 day window.");
   const end=new Date(clock());end.setUTCHours(0,0,0,0);
   const rows=await Promise.all(Array.from({length:days},(_,i)=>store.get(metricPath(performance[1],new Date(end.getTime()-i*86400000).toISOString()))));
   const totals=rows.reduce((sum,row)=>metric(sum,row||{}),null);
   return {days,through:new Date(clock()).toISOString(),...totals,onTimePercent:totals.completed?100*totals.onTime/totals.completed:null,proofCompliancePercent:totals.completed?100*totals.proofCompliant/totals.completed:null,meanAcceptanceSeconds:totals.accepted?totals.acceptanceMs/totals.accepted/1000:null};
  }
  if(!isDriver&&method==="GET"&&["applications","drivers","jobs","settlements","quotes","shipments","privacy"].some(c=>route==="/api/operations/"+c)){
   const collection=route.split("/").at(-1);
   if(collection==="applications")manager(actor);
   if(collection==="privacy")manager(actor);
   if(collection==="settlements")finance(actor);
   const names={applications:"dispatchDriverApplications",drivers:"dispatchDrivers",jobs:"dispatchJobs",settlements:"dispatchSettlements",quotes:"dispatchQuoteQueue",shipments:"dispatchShipmentQueue",privacy:"dispatchPrivacyQueue"};
   const page=await store.list(names[collection],options);
   return {...page,items:page.items.map(record=>collection==="jobs"?jobView(record,true):collection==="drivers"?{id:record.id,name:record.name,email:record.email,status:record.status,validUntil:record.validUntil,vehicle:record.vehicle,region:record.region}:record)};
  }
  let queueMatch=route.match(/^\/api\/operations\/(quotes|shipments)\/([a-f0-9]{64})\/(issue|confirm)$/);
  const bookingDetail=route.match(/^\/api\/operations\/shipments\/([a-f0-9]{64})$/);
  if(!isDriver&&method==="GET"&&bookingDetail){
   return store.transaction(async tx=>{
    const entry=await tx.get("dispatchShipmentQueue/"+bookingDetail[1]);requireValue(entry,404,"Booking unavailable.");
    const shipment=await tx.get(customerPath(entry.customerUid)+"/shipments/"+entry.shipmentId);requireValue(shipment,404,"Booking unavailable.");
    tx.create("dispatchOperationsAudit/"+uuid(),{actor:actor.uid,action:"booking-detail-read",shipmentId:entry.shipmentId,createdAt:new Date(clock()).toISOString()});
    const {id,reference,status,pickupArea,deliveryArea,pickupAddress,deliveryAddress,recipientName,recipientPhone,totalMinor,currency}=shipment;
    return {shipment:{id,reference,status,pickupArea,deliveryArea,pickupAddress,deliveryAddress,recipientName,recipientPhone,...(Number.isSafeInteger(totalMinor)?{totalMinor,currency}:{})}};
   });
  }
  if(!isDriver&&method==="POST"&&queueMatch){
   const [,type,queueId,action]=queueMatch;
   requireValue(type==="quotes"&&action==="issue"||type==="shipments"&&action==="confirm",404,"Unknown queue action.");
   if(type==="quotes"){
    fields(body,["totalMinor","expiresAt","coverageApproved","rateEvidenceRef"]);
    requireValue(Number.isSafeInteger(body.totalMinor)&&body.totalMinor>0&&body.totalMinor<=100000000&&Date.parse(body.expiresAt)>clock()&&body.coverageApproved===true,400,"Verify coverage, inclusive ZAR amount and future quote expiry.");
    string(body.rateEvidenceRef,3,200);
   }else{
    fields(body,["carrierReference","bookingVerified"]);string(body.carrierReference,3,160);
    requireValue(body.bookingVerified===true,400,"Record an actual carrier booking before confirmation.");
   }
   return write(async(tx,at)=>{
    const queuePath=(type==="quotes"?"dispatchQuoteQueue/":"dispatchShipmentQueue/")+queueId,entry=await tx.get(queuePath);
    requireValue(entry,404,"Queue record unavailable.");
    const recordPath=customerPath(entry.customerUid)+(type==="quotes"?"/quotes/"+entry.quoteId:"/shipments/"+entry.shipmentId),record=await tx.get(recordPath);
    requireValue(record?.status===(type==="quotes"?"pending":"requested"),409,"This request has already changed.");
    if(type==="quotes"){
     tx.set(recordPath,{...record,status:"quoted",totalMinor:body.totalMinor,currency:"ZAR",expiresAt:new Date(body.expiresAt).toISOString(),coverageApproved:true,updatedAt:at});
     tx.set(queuePath,{...entry,status:"quoted",rateEvidenceRef:body.rateEvidenceRef,updatedAt:at});
    }else{
     tx.set(recordPath,{...record,status:"confirmed",carrierReference:body.carrierReference,updatedAt:at,events:[...record.events,{status:"confirmed",at,description:"Operator recorded the confirmed carrier booking."}]});
     tx.set(queuePath,{...entry,status:"confirmed",updatedAt:at});
    }
    return {id:queueId,status:type==="quotes"?"quoted":"confirmed"};
   });
  }
  if(!isDriver&&method==="POST"&&route==="/api/operations/applications"){
   manager(actor);fields(body,["name","email","vehicle","region"]);
   const name=string(body.name,2,120),email=string(body.email,3,200).toLowerCase(),region=string(body.region,2,120);
   requireValue(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)&&["bicycle","motorbike","car","bakkie","van"].includes(body.vehicle),400,"Select a valid email and vehicle.");
   return write(async(tx,at)=>{
    const applicationId=uuid();
    const application={id:applicationId,name,email,vehicle:body.vehicle,region,status:"in_review",createdAt:at,createdBy:actor.uid};
    tx.create("dispatchDriverApplications/"+applicationId,application);
    return {application};
   });
  }
  let match=route.match(/^\/api\/operations\/applications\/([A-Za-z0-9_-]{1,128})\/approve$/);
  if(!isDriver&&method==="POST"&&match){
   manager(actor);fields(body,["driverUid","checks","prdpRequired","hold"]);
   requireValue(id(body.driverUid)&&body.driverUid!==actor.uid&&body.hold===false&&typeof body.prdpRequired==="boolean",400,"A separate verified driver identity and cleared hold are required.");
   const user=await lookupUser(body.driverUid);
   requireValue(user?.emailVerified===true&&user.disabled===false&&user.providerData?.some(p=>p.providerId==="google.com"),400,"Link a verified active Google identity.");
   const applicationId=match[1];
   return write(async(tx,at)=>{
    const application=await tx.get("dispatchDriverApplications/"+applicationId),prior=await tx.get(driverPath(body.driverUid));
    requireValue(application?.status==="in_review"&&!prior,409,"Application is unavailable or driver identity already linked.");
    requireValue(user.email?.toLowerCase()===application.email,400,"Driver identity does not match the reviewed application.");
    const validUntil=validateVetting(body.checks,{vehicle:application.vehicle,prdpRequired:body.prdpRequired,clock});
    const driver={id:hash(body.driverUid),uid:body.driverUid,name:application.name,email:application.email,vehicle:application.vehicle,region:application.region,status:"approved",validUntil,createdAt:at,approvedBy:actor.uid,applicationId};
    tx.set("dispatchDriverApplications/"+applicationId,{...application,status:"approved",checks:body.checks,approvedAt:at,approvedBy:actor.uid,driverId:driver.id});
    tx.create(driverPath(body.driverUid),driver);
    return {driver:{id:driver.id,status:driver.status,validUntil}};
   });
  }
  match=route.match(/^\/api\/operations\/drivers\/([a-f0-9]{64})\/suspend$/);
  if(!isDriver&&method==="POST"&&match){
   manager(actor);fields(body,["reason"]);const reason=string(body.reason,3,300),driverId=match[1];
   return write(async(tx,at)=>{
    const path="dispatchDrivers/"+driverId,driver=await tx.get(path);requireValue(driver,404,"Driver not found.");
    tx.set(path,{...driver,status:"suspended",suspendedAt:at,suspendedBy:actor.uid,reason});
    return {id:driverId,status:"suspended"};
   });
  }
  if(!isDriver&&method==="POST"&&route==="/api/operations/jobs"){
   fields(body,["customerUid","shipmentId","driverId","feeMinor","feePolicyVersion","dueAt"]);
   requireValue(id(body.customerUid)&&id(body.shipmentId)&&/^[a-f0-9]{64}$/.test(body.driverId)&&Number.isSafeInteger(body.feeMinor)&&body.feeMinor>0&&body.feeMinor<=100000000&&body.feePolicyVersion===policyVersion&&Date.parse(body.dueAt)>clock(),400,"Select a confirmed shipment, driver, agreed ZAR fee and future due time.");
   const jobId=hash(body.customerUid+":"+body.shipmentId),shipmentPath=customerPath(body.customerUid)+"/shipments/"+body.shipmentId;
   return write(async(tx,at)=>{
    const driver=await tx.get("dispatchDrivers/"+body.driverId),shipment=await tx.get(shipmentPath),existing=await tx.get(jobPath(jobId));
    const dayMetric=await tx.get(metricPath(body.driverId,at));
    approved(driver);requireValue(!existing,409,"This shipment already has a dispatch job.");
    requireValue(shipment?.status==="confirmed"&&shipment.carrierReference,409,"Shipment requires actual operator booking confirmation.");
    const job={id:jobId,reference:shipment.reference,customerUid:body.customerUid,shipmentId:body.shipmentId,driverId:body.driverId,status:"offered",pickupArea:shipment.pickupArea,deliveryArea:shipment.deliveryArea,feeMinor:body.feeMinor,currency:"ZAR",feePolicyVersion:policyVersion,dueAt:new Date(body.dueAt).toISOString(),offeredAt:at,createdAt:at,updatedAt:at};
    tx.create(jobPath(jobId),job);
    tx.set("dispatchShipmentQueue/"+hash(body.customerUid+":"+body.shipmentId),{id:hash(body.customerUid+":"+body.shipmentId),customerUid:body.customerUid,shipmentId:body.shipmentId,reference:shipment.reference,status:"offered",pickupArea:shipment.pickupArea,deliveryArea:shipment.deliveryArea,createdAt:shipment.createdAt||at,updatedAt:at});
    tx.create("dispatchDrivers/"+body.driverId+"/jobs/"+jobId,{id:jobId,createdAt:at});
    tx.set(metricPath(body.driverId,at),metric(dayMetric,{offered:1}));
    return {job:jobView(job,true)};
   });
  }
  match=route.match(/^\/api\/(driver|operations)\/jobs\/([A-Za-z0-9_-]{1,128})(?:\/(accept|status|proof|location|messages|offer))?$/);
  if(match){
   const jobId=match[2],action=match[3],path=jobPath(jobId);
   const job=await store.transaction(async tx=>{await driverGuard(tx,actor,jobId);return tx.get(path);});
   requireValue(job,404,"No matching assignment.");
   const shipmentPath=customerPath(job.customerUid)+"/shipments/"+job.shipmentId;
   if(method==="GET"&&!action){
    const shipment=await store.get(shipmentPath);
    return {job:jobView(job,actor.staff),...(job.status!=="offered"&&activeStatuses.includes(job.status)?{delivery:{pickupAddress:shipment?.pickupAddress,deliveryAddress:shipment?.deliveryAddress,recipientName:shipment?.recipientName,recipientPhone:shipment?.recipientPhone}}:{})};
   }
   if(method==="GET"&&action==="messages"){
    requireValue(activeStatuses.includes(job.status),409,"Messages require an active accepted assignment.");
    const page=await store.list(path+"/messages",options);
    return page;
   }
   requireValue(method==="POST"&&action,404,"Unknown operations route.");
   if(action==="offer"){
    requireValue(actor.staff,403,"Dispatcher access required.");fields(body,["driverId","reason"]);
    requireValue(/^[a-f0-9]{64}$/.test(body.driverId),400,"Select a driver.");const reason=string(body.reason,3,300);
    return write(async(tx,at)=>{
     const current=await tx.get(path),driver=await tx.get("dispatchDrivers/"+body.driverId),index=await tx.get("dispatchDrivers/"+body.driverId+"/jobs/"+jobId);
     const dayMetric=await tx.get(metricPath(body.driverId,at));
     approved(driver);requireValue(["offered","accepted"].includes(current.status),409,"Reassignment after collection requires exception handling.");
     const updated={...current,driverId:body.driverId,status:"offered",offeredAt:at,location:null,updatedAt:at,reassignmentReason:reason};
     tx.set(path,updated);
     tx.set("dispatchShipmentQueue/"+hash(current.customerUid+":"+current.shipmentId),{id:hash(current.customerUid+":"+current.shipmentId),customerUid:current.customerUid,shipmentId:current.shipmentId,reference:current.reference,status:"offered",pickupArea:current.pickupArea,deliveryArea:current.deliveryArea,createdAt:current.createdAt,updatedAt:at});
     if(!index)tx.create("dispatchDrivers/"+body.driverId+"/jobs/"+jobId,{id:jobId,createdAt:at});
     tx.set(metricPath(body.driverId,at),metric(dayMetric,{offered:1}));
     return {job:jobView(updated,true)};
    });
   }
   if(action==="accept"){
    requireValue(isDriver,403,"The offered driver must accept.");fields(body,["feePolicyVersion"]);
    requireValue(body.feePolicyVersion===policyVersion,400,"Accept the current fee policy.");
    return write(async(tx,at)=>{
     const current=await tx.get(path);requireValue(current.status==="offered",409,"Offer is no longer available.");
     const dayMetric=await tx.get(metricPath(current.driverId,at));
     const updated={...current,status:"accepted",acceptedAt:at,updatedAt:at};
     tx.set(path,updated);tx.set("dispatchShipmentQueue/"+hash(current.customerUid+":"+current.shipmentId),queueEntry(updated,"accepted",at));tx.set(metricPath(current.driverId,at),metric(dayMetric,{accepted:1,acceptanceMs:Math.max(0,Date.parse(at)-Date.parse(current.offeredAt||current.createdAt))}));return {job:jobView(updated)};
    },jobId);
   }
   if(action==="messages"){
    fields(body,["text"]);const text=string(body.text,1,1000);
    return write(async(tx,at)=>{
     const current=await tx.get(path);requireValue(activeStatuses.includes(current.status),409,"Messages require an active accepted assignment.");
     const message={id:uuid(),text,role:actor.staff?"dispatcher":"driver",createdAt:at};
     tx.create(path+"/messages/"+message.id,message);return {message};
    },jobId);
   }
   if(action==="location"){
    requireValue(isDriver,403,"Only the assigned driver can share location.");fields(body,["consent","policyVersion","latitude","longitude","accuracy","capturedAt"]);
    requireValue(typeof body.consent==="boolean"&&body.policyVersion===policyVersion,400,"Explicit current trip-location consent is required.");
    let location=null;
    if(body.consent){
     requireValue(Number.isFinite(body.latitude)&&Math.abs(body.latitude)<=90&&Number.isFinite(body.longitude)&&Math.abs(body.longitude)<=180&&Number.isFinite(body.accuracy)&&body.accuracy>=0&&body.accuracy<=10000&&Math.abs(clock()-Date.parse(body.capturedAt))<=120000,400,"Invalid or stale location.");
     location={latitude:body.latitude,longitude:body.longitude,accuracy:body.accuracy,at:new Date(clock()).toISOString()};
    }
    return write(async(tx,at)=>{
     const current=await tx.get(path);requireValue(activeStatuses.includes(current.status),409,"Location sharing requires an active assignment.");
     tx.set(path,{...current,location,locationConsent:{accepted:body.consent,version:policyVersion,at},updatedAt:at});
     return {shared:body.consent,lastSeen:location?.at||null};
    },jobId);
   }
   if(action==="proof"){
    requireValue(isDriver&&typeof saveProof==="function",403,"Assigned-driver proof upload required.");
    fields(body,["base64"]);
    requireValue(typeof body.base64==="string"&&body.base64.length<=2800000&&!/[^A-Za-z0-9+/=]/.test(body.base64),400,"Select a PDF no larger than 2 MiB.");
    const bytes=Buffer.from(body.base64,"base64");
    requireValue(bytes.length>5&&bytes.length<=2*1024*1024&&bytes.subarray(0,5).toString()==="%PDF-"&&bytes.toString("base64")===body.base64,400,"Invalid PDF proof.");
    requireValue(job.status==="out_for_delivery",409,"Proof is accepted only during final delivery.");
    requireValue(id(key)&&key.length>=8,400,"An idempotency key is required.");
    // Storage I/O is outside the retryable database transaction. Orphan objects stay private.
    const proof=await saveProof({customerUid:job.customerUid,shipmentId:job.shipmentId,bytes});
    requireValue(proof?.path?.startsWith("delivery-proofs/"+hash(job.customerUid)+"/"+job.shipmentId+"/")&&/^\d+$/.test(String(proof.generation)),503,"Private proof could not be verified.");
    return write(async(tx,at)=>{
     const current=await tx.get(path);requireValue(current.status==="out_for_delivery"&&!current.proof,409,"Proof already attached or assignment changed.");
     tx.set(path,{...current,proof,updatedAt:at});return {proofAvailable:true};
    },jobId);
   }
   if(action==="status"){
    requireValue(isDriver,403,"The assigned driver must report progress.");fields(body,["status","description"]);
    const description=string(body.description,3,300);
    return write(async(tx,at)=>{
     const current=await tx.get(path),shipment=await tx.get(shipmentPath);
     const dayMetric=await tx.get(metricPath(current.driverId,at));
     requireValue(transitions[current.status]?.includes(body.status)&&shipment,409,"Invalid job transition.");
     requireValue(transitions[current.status]?.includes(body.status)&&shipment.status===(current.status==="accepted"?"confirmed":current.status),409,"Shipment changed; request dispatcher review.");
     requireValue(body.status!=="delivered"||current.proof,409,"Attach private proof before delivery completion.");
     requireValue(shipment.events.length<200,409,"Shipment event limit reached.");
     const updated={...current,status:body.status,location:body.status==="delivered"?null:current.location||null,updatedAt:at};
     tx.set(path,updated);
     tx.set(metricPath(current.driverId,at),metric(dayMetric,{completed:body.status==="delivered"?1:0,onTime:body.status==="delivered"&&Date.parse(at)<=Date.parse(current.dueAt)?1:0,proofCompliant:body.status==="delivered"&&current.proof?1:0,exceptions:body.status==="exception"?1:0}));
     tx.set("dispatchShipmentQueue/"+hash(current.customerUid+":"+current.shipmentId),queueEntry(updated,body.status,at));
     tx.set(shipmentPath,{...shipment,status:body.status,updatedAt:at,events:[...shipment.events,{status:body.status,description,at}],...(body.status==="delivered"?{proof:current.proof}:{})});
     if(body.status==="delivered")tx.create("dispatchDrivers/"+current.driverId+"/ledger/earning-"+jobId,{id:"earning-"+jobId,type:"earning",jobId,amountMinor:current.feeMinor,currency:"ZAR",createdAt:at,onTime:Date.parse(at)<=Date.parse(current.dueAt)});
     return {job:jobView(updated)};
    },jobId);
   }
   throw new HttpError(404,"Unknown operations route.");
  }
  if(isDriver&&method==="GET"&&route==="/api/driver/jobs"){
   const page=await store.list(driverPath(actor.uid)+"/jobs",options);
   const jobs=await Promise.all(page.items.map(record=>store.get(jobPath(record.id))));
   return {...page,items:jobs.filter(job=>job?.driverId===hash(actor.uid)).map(job=>jobView(job))};
  }
  if(isDriver&&method==="GET"&&route==="/api/driver/ledger")return store.list(driverPath(actor.uid)+"/ledger",options);
  if(!isDriver&&method==="POST"&&route==="/api/operations/settlements"){
   finance(actor);fields(body,["jobId","bankReference","evidenceRef"]);
   requireValue(id(body.jobId),400,"Invalid job.");const bankReference=string(body.bankReference,3,160),evidenceRef=string(body.evidenceRef,3,200);
   return write(async(tx,at)=>{
    const job=await tx.get(jobPath(body.jobId)),prior=await tx.get("dispatchSettlements/"+body.jobId);
    requireValue(job?.status==="delivered"&&!prior,409,"Only a delivered unpaid job can be submitted.");
    const driver=await tx.get("dispatchDrivers/"+job.driverId);requireValue(driver,404,"Driver record unavailable.");
    const settlement={id:body.jobId,jobId:body.jobId,driverId:job.driverId,status:"awaiting_independent_reconciliation",amountMinor:job.feeMinor,currency:"ZAR",bankReference,evidenceRef,submittedBy:actor.uid,createdAt:at};
    tx.create("dispatchSettlements/"+body.jobId,settlement);
    return {settlement};
   });
  }
  match=route.match(/^\/api\/operations\/settlements\/([A-Za-z0-9_-]{1,128})\/reconcile$/);
  if(!isDriver&&method==="POST"&&match){
   finance(actor);fields(body,["statementReference"]);const statementReference=string(body.statementReference,3,200),settlementId=match[1];
   return write(async(tx,at)=>{
    const path="dispatchSettlements/"+settlementId,settlement=await tx.get(path);
    requireValue(settlement?.status==="awaiting_independent_reconciliation"&&settlement.submittedBy!==actor.uid,409,"A different authorized finance reviewer must verify the external settlement.");
    const driver=await tx.get("dispatchDrivers/"+settlement.driverId);requireValue(driver,404,"Driver record unavailable.");
    tx.set(path,{...settlement,status:"externally_reconciled",reconciledBy:actor.uid,statementReference,reconciledAt:at});
    tx.create("dispatchDrivers/"+settlement.driverId+"/ledger/settlement-"+settlementId,{id:"settlement-"+settlementId,type:"external_settlement",jobId:settlement.jobId,amountMinor:settlement.amountMinor,currency:"ZAR",createdAt:at});
    return {id:settlementId,status:"externally_reconciled"};
   });
  }
  throw new HttpError(404,"Unknown operations route.");
 }
 return {async handle({method,path,headers:requestHeaders={},body}){
  try{
   requireValue(enabled&&policyVersion&&!policyVersion.toLowerCase().includes("draft"),503,"Courier operations are not active.");
   requireValue(["GET","POST"].includes(method),405,"Method not allowed.");
   const token=requestHeaders.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
   requireValue(token&&token.length<=8192,401,"Sign in to continue.");
   let identity;try{identity=await verifyToken(token);}catch{throw new HttpError(401,"Invalid or revoked session.");}
   requireValue(id(identity?.uid)&&identity.email_verified===true&&identity.firebase?.sign_in_provider==="google.com",403,"A verified Google identity is required.");
   requireValue(typeof path==="string"&&!path.split("?")[0].split("/").some(p=>p==="."||p===".."),400,"Invalid route.");
   const url=new URL(path,"https://operations.invalid");
   requireValue(url.pathname.startsWith("/api/operations/")||url.pathname.startsWith("/api/driver/"),404,"Unknown operations route.");
   const staff=url.pathname.startsWith("/api/operations/");
   if(staff){const role=await authorizeStaff(token);requireValue(role?.uid===identity.uid&&role.role==="dispatcher",403,"Dispatcher access required.");}
   const actor={uid:identity.uid,email:identity.email?.toLowerCase(),staff};
   if(!staff){const driver=await store.get(driverPath(actor.uid));approved(driver);requireValue(driver.email===actor.email,403,"Driver identity changed.");}
   if(method==="POST"){
    requireValue(requestHeaders["content-type"]?.split(";")[0]==="application/json",415,"JSON required.");
    requireValue(Buffer.byteLength(JSON.stringify(body)||"")<=2900000,413,"Request too large.");
   }
   await store.transaction(async tx=>{
    const minute=Math.floor(clock()/60000),path="dispatchOperationLimits/"+hash(actor.uid+":"+minute),limit=await tx.get(path);
    requireValue((limit?.count||0)<120,429,"Too many operations requests.");
    tx.set(path,{count:(limit?.count||0)+1,expiresAt:new Date((minute+120)*60000)});
   });
   const result=await execute(actor,method,url,body,requestHeaders["idempotency-key"]);
   return {status:method==="POST"?201:200,headers,body:result};
  }catch(error){
   const known=error instanceof HttpError||error instanceof DispatcherAccessError;
   return {status:known?error.status:503,headers,body:{error:known?error.message:"Courier operations unavailable."}};
  }
 }};
}

