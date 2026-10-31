import {firebaseConfig} from "../assets/config.js";
import {operationsConfig} from "./config.js";
const $=id=>document.getElementById(id),mode=document.body.dataset.workspace;
const prefix=mode==="driver"?"/api/driver":"/api/operations";
let auth,sdk,user=null,epoch=0,viewVersion=0,controller=new AbortController(),session=null,selected=mode==="driver"?"jobs":"quotes",watch=null,sharingJob=null,lastPosition=0;
const keys=new Map(),money=value=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(value/100);
const note=text=>{$("status").textContent=text;};
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
function stopGPS(){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;sharingJob=null;}
function lock(){epoch++;viewVersion++;controller.abort();controller=new AbortController();stopGPS();session=null;selected=mode==="driver"?"jobs":"quotes";keys.clear();$("workspace").hidden=true;$("content").replaceChildren();$("tabs").replaceChildren();$("account").textContent="";}
async function request(path,body){
 if(!user)throw Error("Sign in to continue.");
 const identity=user,version=epoch,url=new URL(path,location.origin);
 if(url.origin!==location.origin||!url.pathname.startsWith(prefix+"/"))throw Error("Invalid workspace endpoint.");
 const fingerprint=path+JSON.stringify(body||null);
 if(body&&!keys.has(fingerprint))keys.set(fingerprint,crypto.randomUUID());
 const token=await identity.getIdToken();
 if(version!==epoch)throw Error("Session changed.");
 const response=await fetch(url.href,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json",...(body?{"Content-Type":"application/json","Idempotency-Key":keys.get(fingerprint)}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store",redirect:"error",signal:controller.signal});
 if(version!==epoch)throw Error("Session changed.");
 const json=(response.headers.get("content-type")||"").startsWith("application/json")?await response.json():null;
 if(version!==epoch)throw Error("Session changed.");
 if(!response.ok||!json){if(response.status===401||response.status===403){lock();note(json?.error||"Workspace access revoked.");}throw Error(json?.error||"Workspace service unavailable.");}
 if(body)keys.delete(fingerprint);return json;
}
function button(label,work,parent){
 const b=el("button",label);b.type="button";
 b.addEventListener("click",async()=>{const version=epoch;b.disabled=true;try{await work();}catch(error){if(version===epoch)note(error.message);}finally{if(version===epoch)b.disabled=false;}});
 parent.append(b);return b;
}
function field(form,label,name,{type="text",value="",options,required=true}={}){
 const wrapper=el("label"),caption=el("span",label);let input;
 if(options){input=el("select");for(const [val,text]of options){const option=el("option",text);option.value=val;input.append(option);}}
 else input=el(type==="textarea"?"textarea":"input");
 if(input.tagName==="INPUT")input.type=type;
 input.name=name;input.required=required;if(type!=="file")input.value=value;
 if(type==="number"){input.min="0.01";input.step="0.01";}
 if(type==="checkbox"){input.required=required;input.value="yes";}
 wrapper.append(caption,input);if(type==="checkbox")wrapper.prepend(input);form.append(wrapper);return input;
}
function form(title,parent,setup,submitLabel,work){
 const f=el("form");f.append(el("h3",title));const data=setup(f)||{};const submit=el("button",submitLabel);submit.type="submit";f.append(submit);
 f.addEventListener("submit",async event=>{event.preventDefault();const version=epoch;submit.disabled=true;try{await work(data,new FormData(f));if(version===epoch)note("Saved. Refresh to see the latest state.");}catch(error){if(version===epoch)note(error.message);}finally{if(version===epoch)submit.disabled=false;}});
 parent.append(f);return f;
}
const values=(f,names)=>Object.fromEntries(names.map(name=>[name,f.get(name)]));
async function list(name,render,cursor=""){
 const version=epoch,view=++viewVersion;
 $("content").replaceChildren(el("p","Loading this workspace view.","muted"));
 const page=await request(prefix+"/"+name+"?limit=30"+(cursor?"&cursor="+encodeURIComponent(cursor):""));
 if(version!==epoch||view!==viewVersion)return;
 if(!Array.isArray(page.items))throw Error("The workspace returned an invalid record list. Refresh to try again.");
 const records=el("div");await render(records,page.items);
 if(version!==epoch||view!==viewVersion)return;
 const cards=Array.from(records.children).filter(node=>node.classList?.contains("card"));
 const wrapper=el("section",undefined,"records-page");
 const tools=el("div",undefined,"list-toolbar");
 const search=el("input");search.type="search";search.autocomplete="off";
 search.placeholder="Search loaded records";search.setAttribute("aria-label","Search records on this page");
 tools.append(search);
 const statuses=[...new Set(page.items.map(item=>item.status).filter(v=>typeof v==="string"&&v))].sort();
 let filter;
 if(statuses.length){
  filter=el("select");filter.setAttribute("aria-label","Filter records by status");
  for(const value of ["",...statuses]){const option=el("option",value||"All statuses");option.value=value;filter.append(option);}
  tools.append(filter);
 }
 const count=el("p",undefined,"muted");count.setAttribute("role","status");count.setAttribute("aria-live","polite");
 const snapshot=el("p",undefined,"muted");
 if(statuses.length)snapshot.textContent="This page only: "+statuses.map(status=>status+" "+page.items.filter(item=>item.status===status).length).join(" · ")+". Not a fleet-wide total.";
 const apply=()=>{
  const term=search.value.trim().toLocaleLowerCase(),status=filter?.value||"";
  let visible=0;
  for(const [i,card]of cards.entries()){
   const show=(!status||page.items[i]?.status===status)&&(!term||card.textContent.toLocaleLowerCase().includes(term));
   card.hidden=!show;if(show)visible++;
  }
  count.textContent="Showing "+visible+" of "+cards.length+" loaded records on this page.";
 };
 search.addEventListener("input",apply);filter?.addEventListener("change",apply);
 wrapper.append(tools,count,snapshot,records);
 if(page.nextCursor)button("Next page",()=>list(name,render,page.nextCursor),wrapper);
 apply();
 $("content").replaceChildren(wrapper);
}
function card(root,title,status){const node=el("article",undefined,"card");node.append(el("h3",title),el("span",status,"pill"));root.append(node);return node;}
async function load(){
 const version=epoch;if(!session)return;stopGPS();
 if(mode==="driver"){
  if(selected==="ledger")return list("ledger",async(root,records)=>{
   root.append(el("p","Earnings and independently recorded external settlements are separate entries. This workspace does not transfer money."));
   for(const entry of records){const c=card(root,entry.type==="earning"?"Delivery earning":"External settlement recorded",entry.createdAt);c.append(el("p",money(entry.amountMinor),"money"),el("p","Job "+entry.jobId));}
  });
  return list("jobs",async(root,jobs)=>{
   root.append(el("p","Use these controls only when safely parked. Offers show areas and agreed fees; recipient details appear after you accept."));
   if(!jobs.length)root.append(el("p","No assigned offers or trips."));
   for(const job of jobs){
    const c=card(root,job.pickupArea+" → "+job.deliveryArea,job.status);c.append(el("p",money(job.feeMinor),"money"),el("p","Agreed delivery deadline: "+(Number.isFinite(Date.parse(job.dueAt))?new Date(job.dueAt).toLocaleString("en-ZA"):"Contact dispatch")),el("small","Reference "+job.reference));
    if(job.status==="offered")button("Accept offer and agreed fee terms",async()=>{await request(prefix+"/jobs/"+job.id+"/accept",{feePolicyVersion:operationsConfig.policyVersion});await load();},c);
    if(["accepted","collected","in_transit","out_for_delivery","exception"].includes(job.status))button("Open trip",()=>openTrip(job.id),c);
   }
  });
 }
 const collection=selected;
 return list(collection,async(root,items)=>{
  if(collection==="applications"){
   if(!session.canReview){root.append(el("p","Your current account cannot review driver applications."));return;}
   form("Start a reviewed application",root,f=>{
    field(f,"Applicant name","name");field(f,"Verified recovery email","email",{type:"email"});
    field(f,"Vehicle","vehicle",{options:["bicycle","motorbike","car","bakkie","van"].map(v=>[v,v])});field(f,"Approved service region","region");
   },"Save application for review",async(_,f)=>{await request(prefix+"/applications",values(f,["name","email","vehicle","region"]));await load();});
   for(const application of items){
    const c=card(root,application.name,application.status);c.append(el("p",application.email+" · "+application.vehicle+" · "+application.region));
    if(application.status!=="in_review")continue;
    const detail=el("details"),summary=el("summary","Review mandatory checks");detail.append(summary);c.append(detail);
    form("Human approval",detail,f=>{
     field(f,"Verified Google driver account reference","driverUid");
     field(f,"A professional driving permit is legally required","prdpRequired",{type:"checkbox",required:false});
     field(f,"No unresolved hold; evidence and agreement independently checked","clearHold",{type:"checkbox"});
     for(const criterion of ["eligibility","identity","rightToWork","contact","licence","prdp","vehicle","insurance","riskReview","beneficiary","agreement","safety"]){
      const group=el("fieldset");group.append(el("legend",criterion));
      field(group,"Decision",criterion+"Result",{options:[["","Select a decision"],["verified","Verified"],["not_applicable","Not applicable where permitted"]]});
      field(group,"Private evidence reference",criterion+"Evidence");
      if(["licence","prdp","vehicle","insurance","beneficiary"].includes(criterion))field(group,"Evidence expiry",criterion+"Expiry",{type:"datetime-local",required:false});
      f.append(group);
     }
    },"Approve reviewed driver",async(_,f)=>{
     const checks={};for(const criterion of ["eligibility","identity","rightToWork","contact","licence","prdp","vehicle","insurance","riskReview","beneficiary","agreement","safety"]){
      checks[criterion]={result:f.get(criterion+"Result"),evidenceRef:f.get(criterion+"Evidence")};
      if(f.get(criterion+"Expiry"))checks[criterion].expiresAt=new Date(f.get(criterion+"Expiry")).toISOString();
     }
     await request(prefix+"/applications/"+application.id+"/approve",{driverUid:f.get("driverUid"),checks,prdpRequired:f.get("prdpRequired")==="yes",hold:f.get("clearHold")!=="yes"});await load();
    });
   }
  }else if(collection==="drivers"){
   for(const driver of items){const c=card(root,driver.name,driver.status);c.append(el("p",driver.region+" · "+driver.vehicle),el("p","Approval expires "+driver.validUntil));
    const performance=el("p","Performance uses recorded events, with denominators; no automatic driver rating.");c.append(performance);
    for(const days of [7,30,90])button(days+" day performance",async()=>{
     const result=await request(prefix+"/drivers/"+driver.id+"/performance?days="+days);
     performance.textContent=days+" UTC calendar days through "+result.through+": "+result.completed+" completed, "+result.onTime+"/"+result.completed+" on time, "+result.proofCompliant+"/"+result.completed+" with proof, "+result.exceptions+" exception events. Mean offer acceptance: "+(result.meanAcceptanceSeconds===null?"no accepted offers":Math.round(result.meanAcceptanceSeconds)+" s across "+result.accepted+" acceptances")+".";
    },c);
    if(session.canReview&&driver.status==="approved")form("Suspend operational access",c,f=>field(f,"Reason for review hold","reason"),"Suspend driver",async(_,f)=>{await request(prefix+"/drivers/"+driver.id+"/suspend",{reason:f.get("reason")});await load();});
   }
  }else if(collection==="quotes"){
   root.append(el("p","Enter an actual inclusive carrier price only after confirming service coverage. No automatic rates or customer payments are created."));
   for(const quote of items){const c=card(root,quote.pickupArea+" → "+quote.deliveryArea,quote.status);c.append(el("p",quote.weightKg+" kg · "+quote.service),el("p","Parcel: "+quote.lengthCm+" × "+quote.widthCm+" × "+quote.heightCm+" cm (length × width × height)"));
    if(quote.status==="pending")form("Issue verified quote",c,f=>{
     field(f,"Inclusive amount in ZAR","total",{type:"number"});field(f,"Quote expires","expiresAt",{type:"datetime-local"});field(f,"Private carrier rate evidence reference","rateEvidenceRef");field(f,"Coverage and all required charges verified","coverageApproved",{type:"checkbox"});
    },"Issue quote",async(_,f)=>{await request(prefix+"/quotes/"+quote.id+"/issue",{totalMinor:Math.round(Number(f.get("total"))*100),expiresAt:new Date(f.get("expiresAt")).toISOString(),rateEvidenceRef:f.get("rateEvidenceRef"),coverageApproved:f.get("coverageApproved")==="yes"});await load();});
   }
  }else if(collection==="shipments"){
   const drivers=await request(prefix+"/drivers?limit=100");if(version!==epoch)return;
   for(const shipment of items){const c=card(root,shipment.pickupArea+" → "+shipment.deliveryArea,shipment.status);c.append(el("p","Reference "+shipment.reference));
    button("View private booking details",async()=>{
     const detail=await request(prefix+"/shipments/"+shipment.id);
     const node=el("div");for(const [key,value]of Object.entries(detail.shipment))node.append(el("p",key.replaceAll(/([A-Z])/g," $1")+": "+String(value??"")));
     c.append(node);
    },c);
    if(shipment.status==="requested")form("Record actual carrier booking",c,f=>{field(f,"Carrier booking reference","carrierReference");field(f,"Carrier has confirmed this booking","bookingVerified",{type:"checkbox"});},"Confirm booked collection",async(_,f)=>{await request(prefix+"/shipments/"+shipment.id+"/confirm",{carrierReference:f.get("carrierReference"),bookingVerified:f.get("bookingVerified")==="yes"});await load();});
    if(shipment.status==="confirmed")form("Offer to approved driver",c,f=>{
     field(f,"Driver","driverId",{options:[["","Choose an approved driver"],...drivers.items.filter(d=>d.status==="approved").map(d=>[d.id,d.name+" · "+d.region])]});
     field(f,"Agreed driver fee in ZAR","fee",{type:"number"});field(f,"Agreed delivery due time","dueAt",{type:"datetime-local"});
    },"Send driver offer",async(_,f)=>{await request(prefix+"/jobs",{customerUid:shipment.customerUid,shipmentId:shipment.shipmentId,driverId:f.get("driverId"),feeMinor:Math.round(Number(f.get("fee"))*100),feePolicyVersion:operationsConfig.policyVersion,dueAt:new Date(f.get("dueAt")).toISOString()});await load();});
   }
  }else if(collection==="jobs"){
   root.append(el("p","These are recorded events for this page of jobs. No estimated position, fabricated ETA or driver rating is shown."));
   for(const job of items){const c=card(root,job.pickupArea+" → "+job.deliveryArea,job.status);c.append(el("p","Reference "+job.reference),el("p","Agreed fee "+money(job.feeMinor)));
    if(job.location)c.append(el("p",(job.location.stale?"Location stale":"Location recently reported")+" · "+job.location.lastSeen+" · accuracy "+job.location.accuracy+" m"));
    if(["accepted","collected","in_transit","out_for_delivery","exception"].includes(job.status))button("Open shipment messages",()=>openTrip(job.id),c);
    if(job.status==="delivered"&&session.canReconcile)form("Record an external payment",c,f=>{field(f,"Bank payment reference","bankReference");field(f,"Private settlement evidence reference","evidenceRef");},"Submit for independent reconciliation",async(_,f)=>{await request(prefix+"/settlements",{jobId:job.id,...values(f,["bankReference","evidenceRef"])});await load();});
   }
  }else if(collection==="privacy"){
   root.append(el("p","These requests require a human privacy review, identity checks and the applicable retention process. Listing a request does not mean export or erasure is complete."));
   for(const record of items){const c=card(root,record.type,record.status);c.append(el("p",record.details),el("small","Request "+record.id+" · "+record.createdAt));}
  }else if(collection==="settlements"){
   root.append(el("p","Verify payment evidence outside this application. A second authorized finance reviewer must reconcile each entry. This action does not make a bank transfer."));
   for(const record of items){const c=card(root,money(record.amountMinor),record.status);c.append(el("p","Bank reference "+record.bankReference),el("p","Evidence "+record.evidenceRef));
    if(record.status==="awaiting_independent_reconciliation")form("Independent bank reconciliation",c,f=>field(f,"Verified bank statement reference","statementReference"),"Record independently verified settlement",async(_,f)=>{await request(prefix+"/settlements/"+record.id+"/reconcile",{statementReference:f.get("statementReference")});await load();});
   }
  }
 });
}
async function openTrip(id){
 const version=epoch,view=++viewVersion;stopGPS();const data=await request(prefix+"/jobs/"+id);if(version!==epoch||view!==viewVersion)return;
 const root=$("content");root.replaceChildren();button("Back to jobs",()=>load(),root);
 const job=data.job,c=card(root,job.pickupArea+" → "+job.deliveryArea,job.status);
 c.append(el("p","Agreed delivery deadline: "+(Number.isFinite(Date.parse(job.dueAt))?new Date(job.dueAt).toLocaleString("en-ZA"):"Contact dispatch")));
 if(data.delivery)for(const [key,value]of Object.entries(data.delivery))c.append(el("p",key.replaceAll(/([A-Z])/g," $1")+": "+(value||"")));
 if(!["accepted","collected","in_transit","out_for_delivery","exception"].includes(job.status))return;
 if(mode==="driver"){
  const next={accepted:"collected",collected:"in_transit",in_transit:"out_for_delivery",out_for_delivery:"delivered"};
  const targets=job.status==="exception"?["in_transit","out_for_delivery"]:[next[job.status],"exception"].filter(Boolean);
  for(const target of targets)form("Report "+target.replaceAll("_"," "),c,f=>field(f,"Factual event or exception note","description"),"Record "+target.replaceAll("_"," "),async(_,f)=>{await request(prefix+"/jobs/"+id+"/status",{status:target,description:f.get("description")});await openTrip(id);});
  if(job.status==="out_for_delivery"&&!job.proofAvailable)form("Private delivery evidence",c,f=>({file:field(f,"Proof PDF, maximum 2 MiB","proof",{type:"file"})}),"Attach proof PDF",async({file})=>{
   const chosen=file.files[0];if(!chosen||chosen.size>2*1024*1024)throw Error("Choose a PDF no larger than 2 MiB.");
   const bytes=new Uint8Array(await chosen.arrayBuffer());let text="";for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
   await request(prefix+"/jobs/"+id+"/proof",{base64:btoa(text)});await openTrip(id);
  });
  const location=el("details",undefined,"card");location.append(el("summary","Optional active-trip location"),el("p","Sharing sends your precise location to authorized dispatch staff while this trip stays open. Stop sharing or sign out to stop collection. Your device may show a permission request."));
  button("Start optional trip location",async()=>{
   if(!navigator.geolocation)throw Error("Location is unavailable on this device.");
   stopGPS();sharingJob=id;
   watch=navigator.geolocation.watchPosition(async position=>{
    if(version!==epoch||sharingJob!==id||Date.now()-lastPosition<30000)return;lastPosition=Date.now();
    try{await request(prefix+"/jobs/"+id+"/location",{consent:true,policyVersion:operationsConfig.policyVersion,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,capturedAt:new Date(position.timestamp).toISOString()});if(version===epoch)note("Trip location shared with dispatch.");}
    catch(error){if(version===epoch)note(error.message);}
   },()=>{stopGPS();if(version===epoch)note("Location permission was denied or location is unavailable.");},{enableHighAccuracy:true,maximumAge:10000,timeout:15000});
   note("Trip location requested. Keep this page open only when safe.");
  },location);
  button("Stop trip location and clear last position",async()=>{stopGPS();await request(prefix+"/jobs/"+id+"/location",{consent:false,policyVersion:operationsConfig.policyVersion});note("Trip location sharing stopped.");},location);root.append(location);
 }
 const inbox=el("section",undefined,"card");inbox.append(el("h3","Shipment messages"),el("p","Send messages only when safely parked. Message storage does not prove that the recipient has read it."));
 const messages=await request(prefix+"/jobs/"+id+"/messages");if(version!==epoch||view!==viewVersion)return;
 const history=el("div");
 const rows=page=>[...page.items].reverse().map(msg=>el("p",msg.role+" · "+msg.createdAt+"\n"+msg.text,"message"));
 history.append(...rows(messages));inbox.append(history);
 let messageCursor=messages.nextCursor||null;
 if(messageCursor){
  const older=button("Load older messages",async()=>{
   const page=await request(prefix+"/jobs/"+id+"/messages?cursor="+encodeURIComponent(messageCursor));
   if(version!==epoch)return;
   history.prepend(...rows(page));messageCursor=page.nextCursor||null;older.hidden=!messageCursor;
  },inbox);
 }
 form("Send a shipment message",inbox,f=>field(f,"Message","text",{type:"textarea"}),"Send message",async(_,f)=>{await request(prefix+"/jobs/"+id+"/messages",{text:f.get("text")});await openTrip(id);});root.append(inbox);
}
function workspaceViews(){
 return mode==="driver"?[["jobs","Offers & trips"],["ledger","Earnings & settlements"]]:[["quotes","Quote requests"],["shipments","Bookings"],["jobs","Dispatch queue"],["drivers","Drivers"],...(session?.canReview?[["applications","Vetting review"],["privacy","Privacy requests"]]:[]),...(session?.canReconcile?[["settlements","Reconciliation"]]:[])];
}
function tabs(){
 const names=workspaceViews();
 $("tabs").replaceChildren();
 for(const [value,label]of names){const b=button(label,async()=>{selected=value;history.replaceState(null,"","#"+value);tabs();await load();},$("tabs"));b.setAttribute("aria-pressed",String(selected===value));}
}
window.addEventListener("hashchange",()=>{
 if(!session)return;
 const requested=location.hash.slice(1);
 if(workspaceViews().some(([id])=>id===requested)&&selected!==requested){selected=requested;tabs();load().catch(error=>note(error.message));}
});
async function authorize(identity){
 lock();user=identity;$("logout").hidden=!identity;if(!identity){note("Choose your own approved Google account.");return;}
 const version=epoch;
 try{session=await request(prefix+"/session");if(version!==epoch)return;
  if(session.role!==(mode==="driver"?"driver":"dispatcher"))throw Error("Workspace access not verified.");
  const requested=location.hash.slice(1);if(workspaceViews().some(([id])=>id===requested))selected=requested;
  $("account").textContent=identity.email||"Verified account";$("workspace").hidden=false;tabs();await load();if(version===epoch)note("Current workspace access verified.");
 }catch(error){if(version===epoch){lock();note(error.message);}}
}
$("refresh").addEventListener("click",()=>load().catch(error=>note(error.message)));
$("login").addEventListener("click",async()=>{
 if(!auth)return;$("login").disabled=true;
 try{const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});await sdk.signInWithPopup(auth,provider);}
 catch(error){note(error.code==="auth/popup-closed-by-user"?"Sign-in cancelled.":error.code==="auth/unauthorized-domain"?"This host is not authorized for Google sign-in.":"Google sign-in unavailable. Open this page in Safari, Chrome or Edge and allow the sign-in popup.");}
 finally{$("login").disabled=false;}
});
$("logout").addEventListener("click",async()=>{lock();user=null;try{await sdk.signOut(auth);note("Signed out. Private workspace cleared.");}catch{note("Sign-out failed. Close this tab and contact your administrator.");}});
window.addEventListener("pagehide",stopGPS);
setInterval(()=>{if(user&&session)request(prefix+"/session").catch(error=>note(error.message));},60000);
async function start(){
 if(!operationsConfig.enabled){
  $("login").textContent="Sign-in paused — staging only";
  $("login").disabled=true;
  note("This workspace is not active. Driver approval and operational APIs must be deployed and accepted before sign-in opens.");return;
 }
 $("login").textContent="Continue with Google";
 if(firebaseConfig?.projectId!=="dispatch-1491f"||!firebaseConfig.apiKey){note("Google identity is not configured.");return;}
 try{
  const [apps,identity]=await Promise.all([import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")]);
  sdk=identity;const app=apps.getApps().find(a=>a.name==="franks24-deliveries")||apps.initializeApp(firebaseConfig,"franks24-deliveries");
  auth=sdk.getAuth(app);await sdk.setPersistence(auth,sdk.browserSessionPersistence);
  sdk.onAuthStateChanged(auth,authorize,()=>{lock();note("Identity verification failed.");});$("login").disabled=false;
 }catch{note("Google identity is unavailable. Try again when connected.");}
}
start();

