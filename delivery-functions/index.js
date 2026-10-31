import {onRequest} from "firebase-functions/v2/https";
import {createService} from "./service.js";
import {createRuntime} from "./runtime.js";

let runtime;
async function service() {
  if(!runtime)runtime=createRuntime().catch(error=>{runtime=undefined;throw error;});
  return createService({...await runtime,enabled:true,policyVersion:process.env.DELIVERY_POLICY_VERSION});
}
export const deliveriesApi=onRequest({region:"europe-west1",cors:false,maxInstances:2,concurrency:20,timeoutSeconds:30,memory:"256MiB"},async(req,res)=>{
  res.set({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
  if(process.env.DELIVERY_ENABLED!=="true"||!process.env.DELIVERY_POLICY_VERSION||process.env.DELIVERY_POLICY_VERSION.includes("draft"))return res.status(503).json({error:"Delivery service is not open."});
  if(req.rawBody?.length>16384)return res.status(413).json({error:"Request is too large."});
  try {
    const response=await (await service()).handle({method:req.method,path:req.originalUrl,headers:req.headers,body:req.body});
    res.set(response.headers);return Buffer.isBuffer(response.body)?res.status(response.status).send(response.body):res.status(response.status).json(response.body);
  }catch{return res.status(503).json({error:"Delivery service unavailable."});}
});

// Staff API: same-origin Hosting rewrite; no browser-side privileged credentials.
export {dispatcherApi} from "./dispatcher-function.js";

// Meta webhook validates raw body signatures before storing review-only drafts.
export {whatsappInbound} from "./whatsapp-function.js";
