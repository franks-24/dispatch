import {randomUUID,createHash} from "node:crypto";
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {initializeApp,getApps,applicationDefault} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {createDispatcherAuthorizer,createDispatcherSessionService,DispatcherAccessError} from "./dispatcher-auth.js";
import {createWorkspaceDirectory} from "./dispatcher-directory.js";
import {createInventoryService} from "./inventory-service.js";
import {validatePrivateBucket} from "./proof-policy.js";

const directorySecret=defineSecret("DISPATCH_DIRECTORY_SA_JSON");
let instance;
const failure=(status,message)=>{throw new DispatcherAccessError(status,message);};

function createRuntime(){
 const env=process.env,projectId=env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT;
 if(projectId!=="dispatch-1491f"||!env.DISPATCH_WORKSPACE_CUSTOMER_ID||
  !env.DISPATCH_GROUP_EMAIL||!env.DISPATCH_DELEGATED_ADMIN_EMAIL||!directorySecret.value())
  throw Error("Dispatcher identity not configured.");
 const app=getApps().find(a=>a.name==="franks24-dispatcher")||
  initializeApp({credential:applicationDefault(),projectId},"franks24-dispatcher");
 const directory=createWorkspaceDirectory({
  credentialsJson:directorySecret.value(),delegatedAdminEmail:env.DISPATCH_DELEGATED_ADMIN_EMAIL
 });
 const authorizer=createDispatcherAuthorizer({
  verifyToken:token=>getAuth(app).verifyIdToken(token,true),
  lookupDirectoryUser:directory.lookupDirectoryUser,
  checkGroupMembership:directory.checkGroupMembership,
  workspaceCustomerId:env.DISPATCH_WORKSPACE_CUSTOMER_ID,
  dispatcherGroup:env.DISPATCH_GROUP_EMAIL
 });
 const session=createDispatcherSessionService({authorizer,enabled:true});
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
 return {session,inventory};
}
export const dispatcherApi=onRequest({
 region:"europe-west1",cors:false,maxInstances:2,concurrency:10,timeoutSeconds:40,
 memory:"512MiB",secrets:[directorySecret]
},async(req,res)=>{
 res.set({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
 if(process.env.DISPATCH_SESSION_ENABLED!=="true")
  return res.status(503).json({error:"Dispatcher identity is not active."});
 if(req.rawBody?.length>4500000)return res.status(413).json({error:"Request is too large."});
 try{
  if(!instance)instance=createRuntime();
  const {session,inventory}=instance;
  const pathname=req.path;
  const response=pathname==="/api/dispatcher/session"
   ? await session.handle({method:req.method,headers:req.headers})
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
