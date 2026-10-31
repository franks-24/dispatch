import {createHmac,createHash,timingSafeEqual} from "node:crypto";
import {DispatcherAccessError} from "./dispatcher-auth.js";

const reject=(status,msg)=>{throw new DispatcherAccessError(status,msg);};
const only=(v,max=300)=>typeof v==="string"?v.trim().slice(0,max):"";
const fieldKeys={
 order:"orderReference", "order number":"orderReference",reference:"orderReference",
 product:"itemDescription",item:"itemDescription",description:"itemDescription",
 sku:"sku","item number":"sku",barcode:"barcode",quantity:"quantity",qty:"quantity",
 pickup:"pickupAddress",collection:"pickupAddress","pickup address":"pickupAddress",
 delivery:"deliveryAddress","delivery address":"deliveryAddress",address:"deliveryAddress",dropoff:"deliveryAddress",
 time:"requestedTime","delivery time":"requestedTime","requested time":"requestedTime",
 driver:"driverName","driver name":"driverName"
};

// Deliberately conservative parser: ONLY explicit labels are suggested.
// Ambiguous forwarded text must not be turned into a delivery instruction.
export function suggestFromMessage(message){
 const raw=only(message,4000),fields={};
 for(const line of raw.split(/\r?\n/).slice(0,40)){
  const match=line.match(/^\s*([a-z][a-z ]{1,30}):\s*(.+)\s*$/i);
  if(!match)continue;
  const key=fieldKeys[match[1].trim().toLowerCase()];
  if(!key)continue;
  const value=only(match[2],key==="deliveryAddress"||key==="pickupAddress"?250:120);
  if(!value)continue;
  if(key==="quantity"){
   const qty=Number(value);
   if(Number.isSafeInteger(qty)&&qty>=1&&qty<=10000)fields.quantity=qty;
  }else fields[key]=value;
 }
 return fields;
}
export function verifyMetaSignature(rawBody,signature,secret){
 if(!Buffer.isBuffer(rawBody)||!Buffer.isBuffer(Buffer.from(secret||""))||!secret||
  typeof signature!=="string"||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 const expected="sha256="+createHmac("sha256",secret).update(rawBody).digest("hex");
 return timingSafeEqual(Buffer.from(signature,"ascii"),Buffer.from(expected,"ascii"));
}
export async function ingestWhatsAppEvent({rawBody,signature,secret,phoneNumberId,store,receivedAt=new Date().toISOString()}){
 if(!verifyMetaSignature(rawBody,signature,secret))reject(401,"Invalid webhook signature.");
 if(rawBody.length>256*1024)reject(413,"Webhook exceeds allowed size.");
 let input;
 try{input=JSON.parse(rawBody.toString("utf8"));}
 catch{reject(400,"Invalid webhook JSON.");}
 if(input?.object!=="whatsapp_business_account"||!Array.isArray(input.entry))reject(400,"Unsupported event.");
 let inserted=0,skipped=0;
 for(const entry of input.entry.slice(0,10)){
  for(const change of (Array.isArray(entry.changes)?entry.changes:[]).slice(0,10)){
   const value=change.value;
   if(change.field!=="messages"||value?.messaging_product!=="whatsapp"||
    value.metadata?.phone_number_id!==phoneNumberId)continue;
   for(const msg of (Array.isArray(value.messages)?value.messages:[]).slice(0,30)){
    if(msg?.type!=="text"||typeof msg.text?.body!=="string"||!msg.text.body.trim()||
      !msg.id||!msg.from){skipped++;continue;}
    const text=only(msg.text.body,4000),fingerprint=createHash("sha256").update(msg.id).digest("hex");
    const suggestion=suggestFromMessage(text);
    const item={id:fingerprint,source:"whatsapp",messageType:"text",sourcePhone:only(msg.from,30),
     text,suggestion,receivedAt,status:"needs_review",messageTimestamp:only(msg.timestamp,24)};
    const isNew=await store.createIfNew(item);
    if(isNew)inserted++;
   }
  }
 }
 return {inserted,skipped};
}
export function createWhatsAppInboxService({authorizer,store,enabled=false}={}){
 const headers={"Cache-Control":"private, no-store","Content-Type":"application/json","X-Content-Type-Options":"nosniff"};
 return {async handle({method,path,headers:requestHeaders={},body}){
  try{
   if(!enabled||!authorizer||!store)reject(503,"WhatsApp inbox is not enabled.");
   const auth=(requestHeaders.authorization||requestHeaders.Authorization||"").match(/^Bearer ([^\s]+)$/)?.[1];
   if(!auth)reject(401,"Staff sign-in required.");
   const staff=await authorizer.authorize(auth);
   const u=new URL(path,"https://franks24.invalid");
   if(u.search)reject(400,"Unrecognized inbox filter.");
   if(method==="GET"&&u.pathname==="/api/dispatcher/whatsapp/drafts"){
    const drafts=await store.list(30);
    return {status:200,headers,body:{drafts}};
   }
   const found=u.pathname.match(/^\/api\/dispatcher\/whatsapp\/drafts\/([a-f0-9]{64})\/review$/);
   if(method==="POST"&&found){
    if(!body||Object.keys(body).length!==1||!["reviewed","dismissed"].includes(body.status))
     reject(400,"Choose reviewed or dismissed.");
    const draft=await store.review(found[1],body.status,staff.uid);
    if(!draft)reject(404,"WhatsApp draft not found.");
    return {status:200,headers,body:{draft}};
   }
   reject(404,"Unknown WhatsApp inbox endpoint.");
  }catch(e){
   const status=e instanceof DispatcherAccessError?e.status:503;
   return {status,headers,body:{error:e instanceof DispatcherAccessError?e.message:"WhatsApp inbox unavailable."}};
  }
 }};
}
