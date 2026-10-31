import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {initializeApp,getApps,applicationDefault} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {ingestWhatsAppEvent} from "./whatsapp-intake.js";

const appSecret=defineSecret("WHATSAPP_APP_SECRET");
const verifyToken=defineSecret("WHATSAPP_VERIFY_TOKEN");
let storage;
const getStore=()=>{
 if(storage)return storage;
 const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
 const databaseId=process.env.DISPATCH_DATABASE_ID;
 if(project!=="dispatch-1491f"||!databaseId)throw Error("WhatsApp database not configured.");
 const app=getApps().find(a=>a.name==="franks24-wa")||
  initializeApp({credential:applicationDefault(),projectId:project},"franks24-wa");
 const collection=getFirestore(app,databaseId).collection("dispatchWhatsAppDrafts");
 storage={
  createIfNew:async item=>{
   try{await collection.doc(item.id).create(item);return true;}
   catch(e){if(e.code===6||e.code==="already-exists")return false;throw e;}
  }
 };
 return storage;
};
export const whatsappInbound=onRequest({
 region:"europe-west1",cors:false,maxInstances:2,concurrency:20,
 timeoutSeconds:30,memory:"256MiB",secrets:[appSecret,verifyToken]
},async(req,res)=>{
 res.set({"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 if(process.env.DISPATCH_WHATSAPP_ENABLED!=="true")
  return res.status(503).send("WhatsApp intake is disabled.");
 if(req.method==="GET"){
  const q=req.query||{};
  const good=q["hub.mode"]==="subscribe"&&
   typeof q["hub.challenge"]==="string"&&/^[0-9]{1,24}$/.test(q["hub.challenge"])&&
   q["hub.verify_token"]===verifyToken.value();
  return good?res.status(200).type("text/plain").send(q["hub.challenge"]):
   res.status(403).send("Forbidden.");
 }
 if(req.method!=="POST")return res.status(405).send("Method not allowed.");
 if(!req.rawBody||req.rawBody.length>256*1024)return res.status(413).send("Webhook too large.");
 if(!process.env.WHATSAPP_PHONE_NUMBER_ID||!appSecret.value())return res.status(503).send("Webhook not configured.");
 try{
  await ingestWhatsAppEvent({
   rawBody:req.rawBody,signature:req.get("x-hub-signature-256"),
   secret:appSecret.value(),phoneNumberId:process.env.WHATSAPP_PHONE_NUMBER_ID,
   store:getStore()
  });
  return res.status(200).type("text/plain").send("EVENT_RECEIVED");
 }catch(e){
  // Never log message content, sender identifiers, signatures or credentials.
  const status=e?.status===401?401:e?.status===400?400:503;
  return res.status(status).send(status===401?"Invalid signature.":"Webhook processing unavailable.");
 }
});
