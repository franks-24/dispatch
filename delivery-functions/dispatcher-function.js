import {randomUUID,createHash} from "node:crypto";
import {onRequest} from "firebase-functions/v2/https";
import {initializeApp,getApps,applicationDefault} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {createDispatcherAuthorizer,createDispatcherSessionService,DispatcherAccessError} from "./dispatcher-auth.js";
import {createWorkspaceDirectory} from "./dispatcher-directory.js";
import {createInventoryService} from "./inventory-service.js";
import {createWhatsAppInboxService} from "./whatsapp-intake.js";
import {createSmartCaptureService} from "./smart-capture.js";
import {GoogleGenAI} from "@google/genai";
import {validatePrivateBucket} from "./proof-policy.js";

let instance;
const failure=(status,message)=>{throw new DispatcherAccessError(status,message);};

function createRuntime(){
 const env=process.env,projectId=env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT;
 if(projectId!=="dispatch-1491f"||!env.DISPATCH_WORKSPACE_CUSTOMER_ID||
  !env.DISPATCH_GROUP_EMAIL||!env.DISPATCH_DELEGATED_ADMIN_EMAIL)
  throw Error("Dispatcher identity not configured.");
 const app=getApps().find(a=>a.name==="franks24-dispatcher")||
  initializeApp({credential:applicationDefault(),projectId},"franks24-dispatcher");
 const directory=createWorkspaceDirectory({delegatedAdminEmail:env.DISPATCH_DELEGATED_ADMIN_EMAIL});
 const authorizer=createDispatcherAuthorizer({
  verifyToken:token=>getAuth(app).verifyIdToken(token,true),
  lookupDirectoryUser:directory.lookupDirectoryUser,
  checkGroupMembership:directory.checkGroupMembership,
  workspaceCustomerId:env.DISPATCH_WORKSPACE_CUSTOMER_ID,
  dispatcherGroup:env.DISPATCH_GROUP_EMAIL
 });
 const session=createDispatcherSessionService({authorizer,enabled:true});
 let smartCapture;
 if(env.DISPATCH_AI_ENABLED==="true"){
  const db=getFirestore(app,env.DISPATCH_DATABASE_ID||"(default)");
  const quota=db.collection("dispatchAiQuota");
  const modelId=env.DISPATCH_AI_MODEL||"gemini-2.5-flash";
  if(modelId!=="gemini-2.5-flash")throw Error("AI model not approved.");
  const client=new GoogleGenAI({vertexai:true,project:projectId,location:env.DISPATCH_AI_LOCATION||"global"});
  smartCapture=createSmartCaptureService({
   authorizer,enabled:true,
   checkQuota:async uid=>{
    const date=new Date().toISOString().slice(0,10);
    const ref=quota.doc(uid+"-"+date);
    await db.runTransaction(async tx=>{
     const previous=await tx.get(ref);
     const count=previous.exists?previous.data().count||0:0;
     if(count>=10)failure(429,"AI assist daily limit reached.");
     tx.set(ref,{count:count+1,day:date,updatedAt:new Date().toISOString()});
    });
   },
   model:async input=>{
    const prompt="Extract only explicitly visible product or delivery fields from the supplied photo or text. "+
     "Return JSON with only keys: name, sku, barcode, quantity, notes, orderReference, "+
     "pickupAddress, deliveryAddress, requestedTime, driverName. "+
     "Never invent information. Omit fields that are not clearly visible. "+
     "Do not interpret the result as confirmation of a dispatch or delivery.";
    const parts=[{text:prompt}];
    if(input.text)parts.push({text:input.text});
    if(input.image)parts.push({inlineData:input.image});
    const response=await client.models.generateContent({
     model:modelId,contents:[{role:"user",parts}],
     config:{responseMimeType:"application/json",temperature:0,maxOutputTokens:900}
    });
    return JSON.parse(response.text||"{}");
   }
  });
 }
 let whatsapp;
 if(env.DISPATCH_WHATSAPP_ENABLED==="true"&&env.DISPATCH_DATABASE_ID){
  const db=getFirestore(app,env.DISPATCH_DATABASE_ID);
  const col=db.collection("dispatchWhatsAppDrafts"),audit=db.collection("dispatchInventoryAudit");
  const store={
   list:async limit=>{
    const snapshot=await col.where("status","==","needs_review").orderBy("receivedAt","desc").limit(limit).get();
    return snapshot.docs.map(doc=>doc.data());
   },
   review:async(id,status,actor)=>db.runTransaction(async tx=>{
    const ref=col.doc(id),snap=await tx.get(ref);
    if(!snap.exists)return null;
    const existing=snap.data();
    if(existing.status!=="needs_review")return existing;
    const reviewedAt=new Date().toISOString();
    const updated={...existing,status,reviewedAt,reviewedBy:actor};
    tx.update(ref,{status,reviewedAt,reviewedBy:actor});
    tx.create(audit.doc(),{action:"whatsapp-review",draftId:id,status,actor,at:reviewedAt});
    return updated;
   })
  };
  whatsapp=createWhatsAppInboxService({authorizer,store,enabled:true});
 }
 let inventory;
 if(env.DISPATCH_INVENTORY_ENABLED==="true"&&env.DISPATCH_DATABASE_ID){
  const db=getFirestore(app,env.DISPATCH_DATABASE_ID);
  const col=db.collection("dispatchInventory"),audit=db.collection("dispatchInventoryAudit"),requests=db.collection("dispatchInventoryRequests");
  const storage=async()=>{
   if(!env.DISPATCH_INVENTORY_BUCKET)throw Error("Private inventory bucket missing.");
   const bucket=getStorage(app).bucket(env.DISPATCH_INVENTORY_BUCKET);
   const [[metadata],[iam]]=await Promise.all([bucket.getMetadata(),bucket.iam.getPolicy()]);
   validatePrivateBucket(metadata,iam);return bucket;
  };
  const store={
   list:async limit=>{
    const snap=await col.orderBy("createdAt","desc").limit(limit).get();
    return snap.docs.map(doc=>{const {photo,createdBy,...data}=doc.data();return data;});
   },
   get:async id=>{const snap=await col.doc(id).get();return snap.exists?snap.data():null;},
   create:async(item,actor,key,serialized)=>{
    const hash=value=>createHash("sha256").update(value).digest("hex");
    const requestRef=requests.doc(hash(actor+":"+key)),digest=hash(serialized);
    return db.runTransaction(async tx=>{
     const prior=await tx.get(requestRef);
     if(prior.exists){
      if(prior.data().digest!==digest)failure(409,"Request key reused for a different item.");
      return prior.data().item;
     }
     tx.create(col.doc(item.tracking),item);
     tx.create(requestRef,{digest,item,createdAt:item.createdAt,actor});
     tx.create(audit.doc(),{action:"registered",tracking:item.tracking,actor,at:item.createdAt});
     return item;
    });
   },
   advance:async(id,status,steps,actor,at)=>{
    const ref=col.doc(id);
    return db.runTransaction(async tx=>{
     const snap=await tx.get(ref);
     if(!snap.exists)failure(404,"Item not found.");
     const current=snap.data();
     if(steps[current.status]!==status)failure(409,"Invalid status change.");
     const item={...current,status,updatedAt:at};
     tx.update(ref,{status,updatedAt:at});
     tx.create(audit.doc(),{action:"status-changed",tracking:id,actor,status,at});
     const {photo,createdBy,...safe}=item;return safe;
    });
   },
   attachPhoto:async(id,photo,actor,at)=>{
    const ref=col.doc(id);
    await db.runTransaction(async tx=>{
     const snap=await tx.get(ref);
     if(!snap.exists)failure(404,"Item not found.");
     if(snap.data().photoAvailable)failure(409,"Photo already exists.");
     tx.update(ref,{photo,photoAvailable:true,updatedAt:at});
     tx.create(audit.doc(),{action:"photo-attached",tracking:id,actor,at});
    });
   }
  };
  inventory=createInventoryService({authorizer,store,enabled:true,
   savePhoto:async({tracking,bytes,mime})=>{
    const bucket=await storage();
    const path="inventory/"+tracking+"/"+randomUUID();
    const file=bucket.file(path);
    await file.save(bytes,{resumable:false,contentType:mime,validation:"crc32c",
     metadata:{cacheControl:"private, no-store"},preconditionOpts:{ifGenerationMatch:0}});
    const [meta]=await file.getMetadata();
    return {path,generation:String(meta.generation),mime};
   },
   readPhoto:async photo=>{
    if(!photo.path||!photo.path.startsWith("inventory/")||!/^\d+$/.test(photo.generation))
     throw Error("Invalid stored photo metadata.");
    const bucket=await storage();
    const file=bucket.file(photo.path,{generation:photo.generation});
    const [bytes]=await file.download({validation:"crc32c"});
    if(bytes.length>3*1024*1024)throw Error("Invalid stored photo.");
    return {bytes,mime:photo.mime};
   }
  });
 }
 return {session,inventory,whatsapp,smartCapture};
}
export const dispatcherApi=onRequest({
 region:"europe-west1",cors:false,maxInstances:2,concurrency:10,timeoutSeconds:40,
 memory:"512MiB"
},async(req,res)=>{
 res.set({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
 if(process.env.DISPATCH_SESSION_ENABLED!=="true")
  return res.status(503).json({error:"Dispatcher identity is not active."});
 if(req.rawBody?.length>4500000)return res.status(413).json({error:"Request is too large."});
 try{
  if(!instance)instance=createRuntime();
  const {session,inventory,whatsapp,smartCapture}=instance;
  const pathname=req.path;
  const response=pathname==="/api/dispatcher/session"
   ? await session.handle({method:req.method,headers:req.headers})
   : pathname==="/api/dispatcher/ai/suggest"
   ? smartCapture ? await smartCapture.handle({method:req.method,path:pathname,headers:req.headers,body:req.body})
     : {status:503,headers:{"Cache-Control":"no-store"},body:{error:"AI assist is not enabled."}}
   : pathname.startsWith("/api/dispatcher/whatsapp/")
   ? whatsapp ? await whatsapp.handle({method:req.method,path:req.originalUrl,headers:req.headers,body:req.body})
     : {status:503,headers:{"Cache-Control":"no-store"},body:{error:"WhatsApp intake is not active."}}
   : inventory ? await inventory.handle({method:req.method,path:req.originalUrl,headers:req.headers,body:req.body})
   : {status:503,headers:{"Cache-Control":"no-store"},body:{error:"Inventory is not active."}};
  res.set(response.headers);
  if(Buffer.isBuffer(response.body))return res.status(response.status).send(response.body);
  return res.status(response.status).json(response.body);
 }catch{
  instance=undefined;
  return res.status(503).json({error:"Dispatcher service unavailable."});
 }
});
