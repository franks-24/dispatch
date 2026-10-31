import {DispatcherAccessError} from "./dispatcher-auth.js";

const fail=(status,msg)=>{throw new DispatcherAccessError(status,msg);};
const limit=(v,n)=>typeof v==="string"?v.trim().slice(0,n):"";
const MAX_IMAGE=3*1024*1024;
export function normalizeAISuggestion(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return {};
 const fields={
  name:120,sku:80,barcode:100,notes:300,orderReference:120,
  pickupAddress:250,deliveryAddress:250,requestedTime:120,driverName:120
 };
 const result={};
 for(const [key,max] of Object.entries(fields)){
  const value=limit(raw[key],max);
  if(value)result[key]=value;
 }
 if(Number.isSafeInteger(raw.quantity)&&raw.quantity>0&&raw.quantity<=10000)
  result.quantity=raw.quantity;
 return result;
}
export function validateCaptureInput(body){
 if(!body||typeof body!=="object"||Array.isArray(body)||
   Object.keys(body).some(k=>!["text","image"].includes(k)))fail(400,"Invalid AI capture request.");
 const text=limit(body.text,4000);
 let image=null;
 if(body.image!==undefined){
  if(!body.image||typeof body.image!=="object"||body.image.mime!=="image/jpeg"||
   typeof body.image.base64!=="string"||body.image.base64.length>Math.ceil(MAX_IMAGE*4/3)||
   body.image.base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(body.image.base64))
   fail(400,"AI accepts a JPEG image.");
  const bytes=Buffer.from(body.image.base64,"base64");
  if(bytes.length===0||bytes.length>MAX_IMAGE||
   bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff||
   bytes.toString("base64")!==body.image.base64)fail(400,"Invalid JPEG image.");
  image={mimeType:"image/jpeg",data:body.image.base64};
 }
 if(!text&&!image)fail(400,"Provide a photo or text to analyze.");
 return {text,image};
}
export function createSmartCaptureService({authorizer,model,checkQuota,enabled=false}={}){
 const headers={"Cache-Control":"private, no-store","Content-Type":"application/json","X-Content-Type-Options":"nosniff"};
 return {async handle({method,path,headers:requestHeaders={},body}){
  try{
   if(!enabled||!authorizer||!model||!checkQuota)fail(503,"AI assist is not enabled.");
   if(method!=="POST"||path!=="/api/dispatcher/ai/suggest")fail(404,"Unknown AI route.");
   const auth=(requestHeaders.authorization||requestHeaders.Authorization||"").match(/^Bearer ([^\s]+)$/)?.[1];
   if(!auth)fail(401,"Sign in to use AI assist.");
   const staff=await authorizer.authorize(auth);
   const input=validateCaptureInput(body);
   await checkQuota(staff.uid);
   const raw=await model(input);
   const suggestion=normalizeAISuggestion(raw);
   return {status:200,headers,body:{suggestion,requiresConfirmation:true,source:"ai_proposal"}};
  }catch(e){
   return {status:e instanceof DispatcherAccessError?e.status:503,headers,
    body:{error:e instanceof DispatcherAccessError?e.message:"AI assist is unavailable."}};
  }
 }};
}
