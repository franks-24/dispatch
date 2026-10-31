// WhatsApp Cloud API incoming messages appear here only after signed staff verification.
const $=id=>document.getElementById(id);
const base="/api/dispatcher/whatsapp/drafts";
let staff=null,epoch=0,drafts=[];
const info=text=>{$("whatsapp-status").textContent=text;};
async function call(path,method="GET",body,identity=staff){
 if(!identity)throw Error("Staff sign-in required.");
 const url=new URL(path,location.origin);
 if(url.origin!==location.origin||!url.pathname.startsWith("/api/dispatcher/whatsapp/"))throw Error("Invalid inbox URL.");
 const token=await identity.getIdToken();
 const response=await fetch(url,{method,headers:{Authorization:"Bearer "+token,Accept:"application/json",
  ...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store",redirect:"error"});
 if(!response.ok){let reason="Inbox unavailable.";try{reason=(await response.json()).error||reason;}catch{}throw Error(reason);}
 return response.json();
}
function render(){
 const root=$("whatsapp-drafts");root.replaceChildren();
 const pending=drafts.filter(d=>d.status==="needs_review");
 if(!pending.length){
  const label=document.createElement("p");label.textContent="No unreviewed WhatsApp order messages.";
  root.append(label);return;
 }
 for(const draft of pending){
  const card=document.createElement("article");card.className="whatsapp-draft";
  const heading=document.createElement("strong");heading.textContent="Received "+new Date(draft.receivedAt).toLocaleString();
  const raw=document.createElement("pre");raw.textContent=draft.text||"";raw.className="whatsapp-original";
  const suggestion=document.createElement("p");
  const entries=Object.entries(draft.suggestion||{}).map(([k,v])=>k+": "+v);
  suggestion.textContent=entries.length?"Suggested fields (verify): "+entries.join(" · "):
   "No labeled fields recognized; review the original message.";
  const controls=document.createElement("div");controls.className="inventory-row-actions";
  const fill=document.createElement("button");fill.type="button";fill.textContent="Use product details in capture form";
  fill.addEventListener("click",()=>{
   const s=draft.suggestion||{};
   if(s.itemDescription)$("item-name").value=s.itemDescription;
   if(s.sku)$("item-sku").value=s.sku;
   if(s.barcode)$("item-barcode").value=s.barcode;
   if(s.quantity)$("item-quantity").value=s.quantity;
   if(s.orderReference)$("item-notes").value="Order: "+s.orderReference;
   $("item-name").focus();
   info("Draft product fields copied for review. Address, time and driver details stay in the WhatsApp draft and are not dispatched.");
  });
  controls.append(fill);
  for(const value of ["reviewed","dismissed"]){
   const button=document.createElement("button");button.type="button";
   button.textContent=value==="reviewed"?"Mark reviewed":"Dismiss";
   button.addEventListener("click",async()=>{
    button.disabled=true;
    try{
     await call(base+"/"+encodeURIComponent(draft.id)+"/review","POST",{status:value});
     draft.status=value;render();info("WhatsApp draft "+value+".");
    }catch(error){button.disabled=false;info(error.message);}
   });controls.append(button);
  }
  card.append(heading,raw,suggestion,controls);
  root.append(card);
 }
}
async function refresh(user=staff,version=epoch){
 if(!user)return;
 try{
  const response=await call(base,"GET",undefined,user);
  if(version!==epoch)return;
  drafts=Array.isArray(response.drafts)?response.drafts:[];
  render();
  info(drafts.filter(x=>x.status==="needs_review").length+" WhatsApp messages awaiting staff review.");
 }catch(error){if(version===epoch)info(error.message);}
}
export function setWhatsAppSession(identity){
 epoch++;staff=identity;drafts=[];
 $("whatsapp-panel").hidden=!identity;
 $("whatsapp-drafts").replaceChildren();
 if(identity)refresh(identity,epoch);
 else info("Available only to verified Franks24 dispatchers.");
}
$("whatsapp-refresh").addEventListener("click",()=>refresh());
