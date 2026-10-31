// Franks24 mobile inventory capture. The camera is never used until staff taps Scan.
// Only the trusted Dispatcher API persists records and generates tracking references.
const $=id=>document.getElementById(id);
let staff=null,epoch=0,items=[],stream=null,scanTimer=null,uploading=false,previewURL=null,saveRequestKey=null,pendingPhoto=null,scanRequest=0;
const status=text=>{$("inventory-status").textContent=text;};
const nextState={registered:"packed",packed:"dispatched",dispatched:"delivered"};
const endpoint="/api/dispatcher/items";
function stopScan(){
 scanRequest++;
 if(scanTimer){clearTimeout(scanTimer);scanTimer=null;}
 if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
 const video=$("barcode-video");
 if(video){video.pause();video.srcObject=null;video.hidden=true;}
 $("scan-barcode").textContent="Scan barcode";
}
function photoPreview(){
 if(previewURL)URL.revokeObjectURL(previewURL);
 previewURL=null;
 const file=$("item-photo").files?.[0];
 const img=$("photo-preview");
 img.hidden=!file;
 if(file){previewURL=URL.createObjectURL(file);img.src=previewURL;}
 else img.removeAttribute("src");
}
async function request(path,method="GET",body,identity=staff,extraHeaders={}){
 if(!identity)throw Error("Sign in to manage inventory.");
 const token=await identity.getIdToken();
 const url=new URL(path,location.origin);
 if(url.origin!==location.origin||!url.pathname.startsWith("/api/dispatcher/items"))throw Error("Invalid inventory route.");
 const response=await fetch(url.href,{method,headers:{
   Authorization:"Bearer "+token,Accept:"application/json",
   ...(body?{"Content-Type":"application/json"}:{}),...extraHeaders
 },body:body?JSON.stringify(body):undefined,cache:"no-store",redirect:"error"});
 if(!response.ok){
  let message="Inventory request failed.";
  try{const result=await response.json();message=result.error||message;}catch{}
  throw Error(message);
 }
 if(!(response.headers.get("content-type")||"").startsWith("application/json"))throw Error("Invalid server response.");
 return response.json();
}
function recommend(){
 const input=$("item-name"),lookup=$("product-suggestions"),hint=$("product-match-hint");
 if(!input||!lookup||!hint)return;
 const query=(input.value||$("item-sku").value||$("item-barcode").value).trim().toLowerCase();
 lookup.replaceChildren();hint.textContent="";
 if(query.length<2)return;
 const seen=new Set();
 const matches=items.filter(x=>{
  const key=(x.sku||x.barcode||x.name||"").toLowerCase();
  if(!key||seen.has(key))return false;
  const hit=[x.name,x.sku,x.barcode].some(v=>String(v||"").toLowerCase().includes(query));
  if(hit)seen.add(key);return hit;
 }).sort((a,b)=>{
  const score=x=>[x.barcode,x.sku,x.name].some(v=>String(v||"").toLowerCase()===query)?0:1;
  return score(a)-score(b);
 }).slice(0,6);
 for(const item of matches){
  const button=document.createElement("button");button.type="button";
  button.className="product-suggestion";
  button.textContent=item.name+" · "+(item.sku||item.barcode||"Previous item");
  button.addEventListener("click",()=>{
   $("item-name").value=item.name;
   $("item-sku").value=item.sku||"";
   $("item-barcode").value=item.barcode||"";
   // Quantity and dispatch-specific fields must be confirmed by Frank.
   lookup.replaceChildren();hint.textContent="Product details suggested from earlier inventory. Verify quantity and condition.";
   $("item-quantity").focus();
  });lookup.append(button);
 }
 if(matches.length)hint.textContent="Select a previous item to reuse its description, SKU and barcode.";
}
function render(){
 const root=$("inventory-list");root.replaceChildren();
 const query=$("inventory-search").value.trim().toLowerCase();
 const shown=items.filter(item=>[item.tracking,item.sku,item.barcode,item.name]
  .some(value=>String(value||"").toLowerCase().includes(query)));
 if(!shown.length){
  const empty=document.createElement("p");
  empty.textContent=query?"No matching inventory records.":"No inventory items recorded yet.";
  root.append(empty);return;
 }
 for(const item of shown){
  const article=document.createElement("article");article.className="inventory-record";
  const heading=document.createElement("strong");heading.textContent=item.name+" · "+item.tracking;
  const details=document.createElement("p");
  details.textContent="SKU: "+(item.sku||"—")+" · Barcode: "+(item.barcode||"—")+
   " · Qty: "+item.quantity+" · "+item.status;
  article.append(heading,details);
  const actions=document.createElement("div");actions.className="inventory-row-actions";
  const next=nextState[item.status];
  if(next){
   const button=document.createElement("button");button.type="button";
   button.textContent="Mark "+next.replaceAll("_"," ");
   button.disabled=uploading;
   button.addEventListener("click",async()=>{
    if(next==="dispatched"&&!confirm("Confirm this inventory item has physically left your possession?"))return;
    button.disabled=true;
    try{
     const result=await request(endpoint+"/"+encodeURIComponent(item.tracking)+"/status","POST",{status:next});
     const at=items.findIndex(x=>x.tracking===item.tracking);if(at>=0)items[at]=result.item;
     status(item.tracking+" updated to "+next+".");render();
    }catch(error){status(error.message);button.disabled=false;}
   });actions.append(button);
  }
  if(item.photoAvailable){
   const photo=document.createElement("button");photo.type="button";photo.textContent="View private photo";
   photo.addEventListener("click",async()=>{
    photo.disabled=true;
    try{
     const token=await staff.getIdToken();
     const response=await fetch(endpoint+"/"+encodeURIComponent(item.tracking)+"/photo",{
      headers:{Authorization:"Bearer "+token},cache:"no-store",redirect:"error"});
     if(!response.ok||!(response.headers.get("content-type")||"").startsWith("image/"))throw Error("Photo unavailable.");
     const blob=await response.blob(),url=URL.createObjectURL(blob);
     const opened=window.open(url,"_blank","noopener,noreferrer");
     if(!opened)status("Allow a new tab to view this private photo.");
     setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){status(error.message);}finally{photo.disabled=false;}
   });actions.append(photo);
  }
  article.append(actions);root.append(article);
 }
}
async function refresh(user=staff,version=epoch){
 if(!user)return;
 try{
  const result=await request(endpoint,"GET",undefined,user);
  if(version!==epoch)return;
  items=Array.isArray(result.items)?result.items:[];
  render();recommend();status("Inventory synchronized. "+items.length+" recent records.");
 }catch(error){if(version===epoch)status(error.message);}
}
async function photoPayload(file){
 if(!file||!file.type.startsWith("image/"))throw Error("Select an item photo.");
 let canvas=document.createElement("canvas");
 let image;
 if("createImageBitmap" in window){image=await createImageBitmap(file);}
 else{
  image=await new Promise((resolve,reject)=>{
   const im=new Image(),src=URL.createObjectURL(file);
   im.onload=()=>{URL.revokeObjectURL(src);resolve(im);};
   im.onerror=()=>{URL.revokeObjectURL(src);reject(Error("Could not read photo."));};
   im.src=src;
  });
 }
 const scale=Math.min(1,1440/Math.max(image.width,image.height));
 canvas.width=Math.max(1,Math.round(image.width*scale));
 canvas.height=Math.max(1,Math.round(image.height*scale));
 canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
 if(typeof image.close==="function")image.close();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.75));
 if(!blob||blob.size>3*1024*1024)throw Error("Photo is too large. Take a smaller picture.");
 const bytes=new Uint8Array(await blob.arrayBuffer());
 let binary="";
 for(let pos=0;pos<bytes.length;pos+=8192)binary+=String.fromCharCode(...bytes.subarray(pos,pos+8192));
 return {mime:"image/jpeg",base64:btoa(binary)};
}
export function setInventorySession(identity){
 epoch++;staff=identity;items=[];stopScan();
 $("inventory-panel").hidden=!identity;
 $("inventory-list").replaceChildren();
 if(!identity){
  $("inventory-form").reset();saveRequestKey=null;pendingPhoto=null;photoPreview();status("Sign in as approved Dispatcher staff.");
  return;
 }
 refresh(identity,epoch);
}
$("inventory-search").addEventListener("input",render);
for(const id of ["item-name","item-sku","item-barcode"])$(id).addEventListener("input",recommend);
$("item-photo").addEventListener("change",photoPreview);
$("inventory-refresh").addEventListener("click",()=>refresh());
$("scan-barcode").addEventListener("click",async()=>{
 if(stream){stopScan();status("Camera stopped.");return;}
 if(!staff)return;
 if(!navigator.mediaDevices?.getUserMedia||!window.BarcodeDetector){
  status("Live barcode scanning is unavailable on this browser. Enter the code manually or take an item photo.");
  $("item-barcode").focus();return;
 }
 const version=epoch,attempt=++scanRequest;
 try{
  const formats=await BarcodeDetector.getSupportedFormats();
  if(version!==epoch||attempt!==scanRequest||!staff)return;
  const usable=["code_128","code_39","ean_13","ean_8","upc_a","upc_e","qr_code","itf"].filter(v=>formats.includes(v));
  if(!usable.length)throw Error("No supported barcode formats.");
  const detector=new BarcodeDetector({formats:usable});
  const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}}});
  if(version!==epoch||attempt!==scanRequest||!staff){for(const track of acquired.getTracks())track.stop();return;}
  stream=acquired;
  const video=$("barcode-video");
  video.hidden=false;video.srcObject=stream;await video.play();
  if(version!==epoch||attempt!==scanRequest||!staff){if(stream===acquired)stopScan();return;}
  $("scan-barcode").textContent="Stop scanning";
  status("Point the camera at the barcode.");
  const scan=async()=>{
   if(!stream||version!==epoch)return;
   try{
    const results=await detector.detect(video);
    if(version!==epoch||attempt!==scanRequest||!staff)return;
    if(results.length&&results[0].rawValue){
     $("item-barcode").value=results[0].rawValue.trim().slice(0,100);
     stopScan();status("Barcode captured. Confirm the item name, SKU and quantity.");
     return;
    }
   }catch{}
   scanTimer=setTimeout(scan,260);
  };
  scan();
 }catch(error){if(version===epoch&&attempt===scanRequest){stopScan();status("Camera unavailable. Enter the barcode manually or take a photo.");}}
});
$("inventory-form").addEventListener("submit",async event=>{
 event.preventDefault();
 if(!staff||uploading)return;
 const form=event.currentTarget,identity=staff,version=epoch;
 const payload={
  name:$("item-name").value.trim(),sku:$("item-sku").value.trim(),
  barcode:$("item-barcode").value.trim(),
  quantity:Number($("item-quantity").value),notes:$("item-notes").value.trim()
 };
 if(!pendingPhoto&&(!payload.name||!Number.isInteger(payload.quantity)||payload.quantity<1)){
  status("Item name and a positive whole-number quantity are required.");return;
 }
 uploading=true;$("inventory-save").disabled=true;
 try{
  let tracking=pendingPhoto?.tracking;
  if(!pendingPhoto){
   saveRequestKey ||= crypto.randomUUID().replaceAll("-","")+"inventory";
   const result=await request(endpoint,"POST",payload,identity,{"Idempotency-Key":saveRequestKey});
   if(version!==epoch)return;
   tracking=result.item.tracking;
   const image=$("item-photo").files?.[0];
   if(image)pendingPhoto={tracking,file:image};
  }
  if(pendingPhoto){
   status("Item recorded: "+tracking+". Uploading private photo.");
   try{
    // A retry always targets the already saved tracking reference.
    const photo=await photoPayload(pendingPhoto.file);
    if(version!==epoch)return;
    await request(endpoint+"/"+encodeURIComponent(tracking)+"/photo","POST",photo,identity);
   }catch(error){
    if(version!==epoch)return;
    // The server may have committed an upload whose response was lost.
    await refresh(identity,version);
    if(!items.some(item=>item.tracking===tracking&&item.photoAvailable)){
     $("inventory-save").textContent="Retry photo for "+tracking;
     status("Item "+tracking+" is saved. Photo not attached: "+error.message+". Tap Retry photo; this will not create another item.");
     return;
    }
   }
  }
  if(version!==epoch)return;
  pendingPhoto=null;form.reset();saveRequestKey=null;photoPreview();recommend();await refresh(identity,version);
  if(version!==epoch)return;
  $("inventory-save").textContent="Save inventory item";
  status("Saved inventory item "+tracking+".");
 }catch(error){if(version===epoch)status(error.message);}
 finally{uploading=false;$("inventory-save").disabled=false;}
});
window.addEventListener("pagehide",stopScan);

