import {randomBytes} from "node:crypto";
import {DispatcherAccessError} from "./dispatcher-auth.js";

const safeId=value=>typeof value==="string"&&/^F24-[0-9]{8}-[A-F0-9]{14}$/.test(value);
const string=(value,max=120)=>typeof value==="string" ? value.trim().slice(0,max+1) : "";
const err=(status,message)=>{throw new DispatcherAccessError(status,message);};
const headers={"Cache-Control":"private, no-store","Content-Type":"application/json","X-Content-Type-Options":"nosniff"};
const steps={registered:"packed",packed:"dispatched",dispatched:"delivered"};
const maxImage=3*1024*1024;

export function validateInventoryItem(body){
 if(!body||typeof body!=="object"||Array.isArray(body)||
   Object.keys(body).some(key=>!["name","sku","barcode","quantity","notes"].includes(key)))
  err(400,"Invalid item information.");
 const name=string(body.name,120),sku=string(body.sku,80),barcode=string(body.barcode,100),
   notes=string(body.notes,300);
 if(!name||name.length>120||sku.length>80||barcode.length>100||notes.length>300||
   !Number.isInteger(body.quantity)||body.quantity<1||body.quantity>10000)
  err(400,"Enter an item name and a valid quantity (1 to 10,000).");
 return {name,sku,barcode,quantity:body.quantity,notes};
}

function validateImage(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
   Object.keys(input).some(k=>!["mime","base64"].includes(k)))err(400,"Invalid photo.");
 if(!["image/jpeg","image/png","image/webp"].includes(input.mime)||typeof input.base64!=="string"||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)||input.base64.length>Math.ceil(maxImage*4/3)+16)
  err(400,"Use a JPEG, PNG or WebP photo under 3 MB.");
 const data=Buffer.from(input.base64,"base64");
 if(data.length===0||data.length>maxImage||data.toString("base64")!==input.base64)
  err(400,"Invalid photo data.");
 const jpeg=data[0]===0xff&&data[1]===0xd8&&data[2]===0xff;
 const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=data.subarray(0,4).toString()==="RIFF"&&data.subarray(8,12).toString()==="WEBP";
 if(!(input.mime==="image/jpeg"&&jpeg||input.mime==="image/png"&&png||input.mime==="image/webp"&&webp))
  err(400,"Photo type does not match its file content.");
 return data;
}

// The adapter must create records and audit entries atomically.
// Each request rechecks Firebase token and live Workspace group membership.
export function createInventoryService({authorizer,store,savePhoto,readPhoto,enabled=false,clock=()=>new Date(),newTracking}={}){
 const reference=newTracking||(()=> "F24-"+clock().toISOString().slice(0,10).replaceAll("-","")+
  "-"+randomBytes(7).toString("hex").toUpperCase());
 return {async handle({method,path,headers:requestHeaders={},body}){
  try{
   if(!enabled||!authorizer||!store)err(503,"Dispatcher inventory is not configured.");
   const bearer=(requestHeaders.authorization||requestHeaders.Authorization||"").match(/^Bearer ([^\s]+)$/)?.[1];
   if(!bearer)err(401,"Sign in to continue.");
   const staff=await authorizer.authorize(bearer);
   const route=new URL(path,"https://franks24.invalid");
   if(!route.pathname.startsWith("/api/dispatcher/items"))err(404,"Unknown inventory endpoint.");
   if(method==="GET"&&route.pathname==="/api/dispatcher/items"&&route.searchParams.size===0){
    const items=await store.list(50);
    return {status:200,headers,body:{items}};
   }
   if(method==="POST"&&route.pathname==="/api/dispatcher/items"&&route.searchParams.size===0){
    const data=validateInventoryItem(body);
    const id=reference();
    if(!safeId(id))err(503,"Could not generate a tracking reference.");
    const at=clock().toISOString();
    const item={tracking:id,...data,status:"registered",photoAvailable:false,createdAt:at,updatedAt:at,createdBy:staff.uid};
    await store.create(item,staff.uid);
    return {status:201,headers,body:{item}};
   }
   const photo=route.pathname.match(/^\/api\/dispatcher\/items\/(F24-[0-9]{8}-[A-F0-9]{14})\/photo$/);
   if(photo&&method==="POST"&&route.searchParams.size===0){
    if(typeof savePhoto!=="function")err(503,"Private photo storage is unavailable.");
    const data=validateImage(body);
    const item=await store.get(photo[1]);
    if(!item)err(404,"Item not found.");
    if(item.photoAvailable)err(409,"A photo is already attached.");
    const result=await savePhoto({tracking:photo[1],bytes:data,mime:body.mime});
    await store.attachPhoto(photo[1],result,staff.uid,clock().toISOString());
    return {status:200,headers,body:{tracking:photo[1],photoAvailable:true}};
   }
   if(photo&&method==="GET"&&route.searchParams.size===0){
    if(typeof readPhoto!=="function")err(503,"Private photo storage is unavailable.");
    const item=await store.get(photo[1]);
    if(!item?.photoAvailable||!item.photo)err(404,"Photo not found.");
    const result=await readPhoto(item.photo);
    return {status:200,headers:{...headers,"Content-Type":result.mime,"Content-Disposition":"inline"},body:result.bytes};
   }
   const state=route.pathname.match(/^\/api\/dispatcher\/items\/(F24-[0-9]{8}-[A-F0-9]{14})\/status$/);
   if(state&&method==="POST"&&route.searchParams.size===0){
    if(!body||typeof body!=="object"||Array.isArray(body)||
       Object.keys(body).some(k=>k!=="status")||!Object.values(steps).includes(body.status))
      err(400,"Invalid inventory status.");
    const item=await store.advance(state[1],body.status,steps,staff.uid,clock().toISOString());
    return {status:200,headers,body:{item}};
   }
   err(404,"Unknown inventory endpoint.");
  }catch(error){
   return {status:error instanceof DispatcherAccessError?error.status:503,headers,
    body:{error:error instanceof DispatcherAccessError?error.message:"Inventory service is unavailable."}};
  }
 }};
}
