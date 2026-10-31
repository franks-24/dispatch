import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {getAuth} from "firebase-admin/auth";
import {randomUUID} from "node:crypto";
import {createRuntime} from "./runtime.js";
import {createDispatcherAuthorizer} from "./dispatcher-auth.js";
import {createWorkspaceDirectory} from "./dispatcher-directory.js";
import {createOperationsService} from "./operations-service.js";
import {hash} from "./service.js";

const directorySecret=defineSecret("DISPATCH_DIRECTORY_SA_JSON");
let pending;
async function initialize(){
 const env=process.env;
 if((env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT)!=="dispatch-1491f"||
  !env.DISPATCH_WORKSPACE_CUSTOMER_ID||!env.DISPATCH_GROUP_EMAIL||!env.DISPATCH_DELEGATED_ADMIN_EMAIL)
  throw Error("Workspace authorization is not configured.");
 const runtime=await createRuntime(env);
 const directory=createWorkspaceDirectory({credentialsJson:directorySecret.value(),delegatedAdminEmail:env.DISPATCH_DELEGATED_ADMIN_EMAIL});
 const authorizer=createDispatcherAuthorizer({
  verifyToken:runtime.verifyToken,lookupDirectoryUser:directory.lookupDirectoryUser,
  checkGroupMembership:directory.checkGroupMembership,workspaceCustomerId:env.DISPATCH_WORKSPACE_CUSTOMER_ID,
  dispatcherGroup:env.DISPATCH_GROUP_EMAIL
 });
 const uidList=value=>(value||"").split(",").map(v=>v.trim()).filter(Boolean);
 return createOperationsService({
  ...runtime,authorizeStaff:token=>authorizer.authorize(token),
  lookupUser:uid=>getAuth(runtime.app).getUser(uid),
  enabled:true,policyVersion:env.DISPATCH_DRIVER_POLICY_VERSION,
  managerUids:uidList(env.DISPATCH_REVIEWER_UIDS),financeUids:uidList(env.DISPATCH_FINANCE_UIDS),
  async saveProof({customerUid,shipmentId,bytes}){
   const bucket=await runtime.proofBucket();
   const path="delivery-proofs/"+hash(customerUid)+"/"+shipmentId+"/"+randomUUID()+".pdf",file=bucket.file(path);
   await file.save(bytes,{resumable:false,contentType:"application/pdf",validation:"crc32c",
    metadata:{cacheControl:"private, no-store"},preconditionOpts:{ifGenerationMatch:0}});
   const [metadata]=await file.getMetadata();
   if(metadata.metadata?.firebaseStorageDownloadTokens)throw Error("Public proof tokens are prohibited.");
   return {path,generation:String(metadata.generation)};
  }
 });
}
export const courierOperationsApi=onRequest({
 region:"europe-west1",cors:false,maxInstances:2,concurrency:10,timeoutSeconds:40,memory:"512MiB",secrets:[directorySecret]
},async(req,res)=>{
 res.set({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
 if(process.env.DISPATCH_OPERATIONS_ENABLED!=="true")
  return res.status(503).json({error:"Courier operations are not active."});
 if(req.rawBody?.length>2900000)return res.status(413).json({error:"Request too large."});
 try{
  if(!pending)pending=initialize().catch(error=>{pending=undefined;throw error;});
  const service=await pending;
  const response=await service.handle({method:req.method,path:req.originalUrl,headers:req.headers,body:req.body});
  res.set(response.headers);return res.status(response.status).json(response.body);
 }catch{return res.status(503).json({error:"Courier operations unavailable."});}
});
