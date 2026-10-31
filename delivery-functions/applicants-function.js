import {onRequest} from "firebase-functions/v2/https";
import {createRuntime} from "./runtime.js";
import {createOperationsService} from "./operations-service.js";

// Isolated applicant entrypoint: this function never exposes operational,
// staff, trip or payment endpoints, even when the full courier API is offline.
let pending;
async function service(){
 if(!pending)pending=(async()=>{
  const runtime=await createRuntime();
  return createOperationsService({
   store:runtime.store,verifyToken:runtime.verifyToken,
   enabled:true,policyVersion:process.env.DISPATCH_DRIVER_POLICY_VERSION
  });
 })().catch(error=>{pending=undefined;throw error;});
 return pending;
}
export const driverApplicationsApi=onRequest({
 region:"europe-west1",cors:false,maxInstances:2,concurrency:10,timeoutSeconds:30,memory:"256MiB"
},async(req,res)=>{
 res.set({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
 const pathname=new URL(req.originalUrl,"https://applicant.invalid").pathname;
 if(pathname!=="/api/driver/application")return res.status(404).json({error:"Unknown route."});
 if(process.env.DISPATCH_APPLICANTS_ENABLED!=="true"||
    process.env.DISPATCH_POLICIES_APPROVED!=="true"||
    !process.env.DISPATCH_DRIVER_POLICY_VERSION||
    process.env.DISPATCH_DRIVER_POLICY_VERSION.toLowerCase().includes("draft")||
    !/^[a-f0-9]{64}$/.test(process.env.DISPATCH_POLICY_RELEASE_SHA256||""))
  return res.status(503).json({error:"Driver applications are not yet open."});
 if(req.rawBody?.length>4096)return res.status(413).json({error:"Application request is too large."});
 try{
  const response=await(await service()).handle({
   method:req.method,path:req.originalUrl,headers:req.headers,body:req.body
  });
  res.set(response.headers);return res.status(response.status).json(response.body);
 }catch{return res.status(503).json({error:"Driver application service unavailable."});}
});
