import {firebaseConfig} from "../assets/config.js";
import {deliveryConfig as config} from "./config.js";
import {createDeliveryApi} from "./api.js";
import {dispatcherConfig} from "../dispatcher/config.js";
import {isVerifiedDispatcher} from "../dispatcher/route.js";
import {quoteInput, bookingInput, bookable, money, statuses} from "./model.js";
const $ = id => document.getElementById(id);
let user = null, auth, sdk, quotes = [], epoch = 0, roleResolved = !dispatcherConfig.enabled, authStatus = "loading";
let shipmentCursor=null,quoteCursor=null;
const attempts = new Map();
const ready = () => Boolean(user && roleResolved && config.enabled && config.policiesApproved);
const api = createDeliveryApi({base:config.apiBase, origin:location.origin, getUser:()=>user});
function message(text, form) {
  $("message").textContent = text;
  if(form){
    let feedback=form.querySelector(".form-message");
    if(!feedback){feedback=document.createElement("p");feedback.className="message form-message";feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");form.append(feedback);}
    feedback.textContent=text;
  }
}
function requireReady(form) {
  if(ready())return true;
  const reason=!config.enabled||!config.policiesApproved
    ? "Live delivery requests are not open yet. You can enter and review your details, but nothing has been sent."
    : !user ? "Sign in with Google before sending this request. Your entries stay on this page."
    : "Your workspace access has not been verified. Please try again after verification is available.";
  message(reason,form);return false;
}
function syncControls() {
  // Capturing a draft is local. Authentication and launch gates apply when sending it.
  for (const id of ["quote-fields","booking-fields","tracking-fields","acceptance-fields","profile-fields","privacy-fields","refresh"]) $(id).disabled = false;
  $("login").hidden = Boolean(user); $("logout").hidden = !user;
  $("identity").textContent = user ? `Signed in as ${user.email || "Google user"}.` : "Sign in to access your quotes and private shipment history.";
  $("availability").textContent = !config.enabled || !config.policiesApproved ? "Preview — delivery requests are not open yet. You can enter and review details. No bookings or payments are accepted, and entries are not saved after leaving this page." : "Enter your details, then sign in to send a request. Collection is subject to booking confirmation and route availability.";
}
function clearPrivate() {
  epoch++; roleResolved=!dispatcherConfig.enabled; quotes = []; attempts.clear();
  shipmentCursor=null;quoteCursor=null;$("more-shipments").hidden=true;$("more-quotes").hidden=true;
  for (const id of ["quote-form","booking-form","tracking-form","profile-form","privacy-form"]) $(id).reset();
  document.querySelectorAll('form button[type="submit"]').forEach(button=>button.disabled=false);
  document.querySelectorAll('.form-message').forEach(item=>item.remove());
  for (const id of ["history","tracking-result","quotes"]) $(id).replaceChildren();
  $("history-note").textContent = "Sign in to see your shipments. No sample deliveries are shown.";
  for (const id of ["terms","privacy","ownership"]) $(id).checked = false;
  quoteOptions(); message("");
}
function acceptance() {
  if (!ready()) throw new Error("Delivery requests are not available yet.");
  if (!["terms","privacy","ownership"].every(id => $(id).checked)) throw new Error("Read and acknowledge each delivery policy before sending a request.");
  return {version:config.policyVersion, terms:true, privacy:true, ownership:true};
}
function node(tag,text,className) {const item=document.createElement(tag);item.textContent=text;if(className)item.className=className;return item;}
function quoteOptions() {
  const select=$("quote-select"); const previous=select.value; select.replaceChildren();
  const available=quotes.filter(q=>bookable(q));
  const first=node("option",available.length ? "Select an issued quote" : "No current quotes"); first.value="";select.append(first);
  for(const q of available){const option=node("option",`${q.id} · ${money(q)} · expires ${new Date(q.expiresAt).toLocaleString("en-ZA")}`);option.value=q.id;select.append(option);}
  select.value=available.some(q=>q.id===previous)?previous:"";
  $("quote-availability").textContent=available.length ? "Choose an issued quote to request collection." : "No issued quotes are available. You can fill the addresses and recipient details now; an issued quote is required before collection can be requested.";
}
function quoteCard(q) {const row=node("article","","shipment");row.append(node("h4",q.id),node("p",`${money(q)} · ${q.status === "quoted" ? (bookable(q) ? "Ready to book" : "Quote expired or unavailable") : q.status==="booked"?"Booked":"Awaiting review"}`));return row;}
function shipmentCard(shipment) {
  const card=node("article","","shipment");
  card.append(node("h3",shipment.reference || shipment.id || "Shipment"),node("span",statuses[shipment.status] || "Status unavailable","badge"));
  if (shipment.pickupArea && shipment.deliveryArea) card.append(node("p",`${shipment.pickupArea} → ${shipment.deliveryArea}`));
  if (shipment.updatedAt && Number.isFinite(Date.parse(shipment.updatedAt))) card.append(node("p",`Updated ${new Date(shipment.updatedAt).toLocaleString("en-ZA")}`));
  if (shipment.status === "delivered" && shipment.proofAvailable === true) {
    const button=node("button","Download proof of delivery ↓");button.type="button";
    button.addEventListener("click",async()=>{const version=epoch;button.disabled=true;try{const blob=await api.proof(shipment.id);if(version!==epoch)return;const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="Franks24-proof-of-delivery.pdf";link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){if(version===epoch)message(error.message);}finally{if(version===epoch)button.disabled=false;}});
    card.append(button);
  } else card.append(node("p","Proof of delivery has not been recorded."));
  return card;
}
async function refresh() {
  if(!requireReady($("refresh").parentElement))return;
  const version=epoch;
  $("refresh").disabled=true;$("history-note").textContent="Loading your workspace…";
  try {
    const [quotePage, shipmentPage,customer]=await Promise.all([api.quotes(),api.shipments(),api.profile()]);
    if(version!==epoch)return;
    if(!Array.isArray(quotePage.items)||!Array.isArray(shipmentPage.items))throw new Error("The delivery service returned an invalid workspace.");
    $("customer-name").value=customer.profile?.displayName||"";
    $("customer-phone").value=customer.profile?.phone||"";
    quotes=quotePage.items;quoteOptions();
    quoteCursor=quotePage.nextCursor;shipmentCursor=shipmentPage.nextCursor;
    $("more-quotes").hidden=!quoteCursor;$("more-shipments").hidden=!shipmentCursor;
    $("quotes").replaceChildren();
    for(const q of quotes)$("quotes").append(quoteCard(q));
    if(!quotes.length)$("quotes").append(node("p","No quote requests yet."));
    $("history").replaceChildren(...shipmentPage.items.map(shipmentCard));
    $("history-note").textContent=shipmentPage.items.length ? (shipmentCursor ? "Showing your latest shipments. Load older shipments below." : "Your recorded shipments are shown below.") : "No shipments yet. Request a quote to get started.";
  } catch(error){if(version===epoch){$("history").replaceChildren();$("quotes").replaceChildren();quotes=[];quoteOptions();shipmentCursor=null;quoteCursor=null;$("more-shipments").hidden=true;$("more-quotes").hidden=true;$("history-note").textContent="Unable to load your workspace. Use Refresh to try again.";message(error.message);}}
  finally{if(version===epoch)syncControls();}
}
function idempotency(name, body) {const fingerprint=JSON.stringify(body);const prior=attempts.get(name);if(prior?.fingerprint===fingerprint)return prior.key;const key=crypto.randomUUID();attempts.set(name,{fingerprint,key});return key;}
function submit(id, build, send, after) {
  $(id).addEventListener("submit",async event=>{
    event.preventDefault();if(!requireReady(event.currentTarget))return;
    const form=event.currentTarget;if(!form.reportValidity())return;
    const button=form.querySelector('button[type="submit"]');const version=epoch;button.disabled=true;
    try {const consent=acceptance();const body=build(Object.fromEntries(new FormData(form)));const result=await send(body,consent,idempotency(id,{...body,acceptance:consent}));if(version!==epoch)return;attempts.delete(id);after(result);await refresh();}
    catch(error){if(version===epoch)message(error.message,form);}
    finally{if(version===epoch)button.disabled=false;}
  });
}
submit("profile-form",data=>({displayName:data.displayName.trim(),phone:data.phone.trim()}),(body,consent,key)=>api.saveProfile(body,consent,key),()=>message("Customer details saved with your current policy acknowledgments."));
$("privacy-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!requireReady(event.currentTarget))return;
 const version=epoch,form=event.currentTarget,button=form.querySelector("button");
 const body=Object.fromEntries(new FormData(form));button.disabled=true;
 try{const result=await api.privacyRequest(body,idempotency("privacy-form",body));if(version!==epoch)return;attempts.delete("privacy-form");form.reset();message("Privacy request "+result.request.id+" recorded for human review. This does not confirm data export or erasure.");}
 catch(error){if(version===epoch)message(error.message,form);}
 finally{if(version===epoch)button.disabled=false;}
});
submit("quote-form",quoteInput,(body,consent,key)=>api.quote(body,consent,key),result=>message(`Quote request received${result.id ? `: ${result.id}` : ""}. A price will appear after review.`));
submit("booking-form",data=>bookingInput(data,quotes.find(q=>q.id===data.quoteId)),(body,consent,key)=>api.book(body,consent,key),result=>{$("booking-form").reset();message(result.status==="confirmed" ? `Booking confirmed: ${result.reference || result.id}.` : `Booking request received${result.id ? `: ${result.id}` : ""}. Await confirmation before handing over your parcel.`);});
$("tracking-form").addEventListener("submit",async event=>{
  event.preventDefault();if(!requireReady(event.currentTarget))return;const version=epoch;const form=event.currentTarget;const button=form.querySelector("button");button.disabled=true;$("tracking-result").replaceChildren();
  try{const shipment=await api.track(String(new FormData(form).get("reference")).trim());if(version!==epoch)return;const card=shipmentCard(shipment);if(Array.isArray(shipment.events)){const timeline=node("ol","","timeline");for(const event of shipment.events){const timestamp=Number.isFinite(Date.parse(event.at))?new Date(event.at).toLocaleString("en-ZA"):"Time unavailable";timeline.append(node("li",`${statuses[event.status] || "Status update"} · ${timestamp}${event.description ? ` — ${event.description}` : ""}`));}card.append(timeline);}$("tracking-result").append(card);}
  catch(error){if(version===epoch)message(error.message,form);}finally{if(version===epoch)button.disabled=false;}
});
$("refresh").addEventListener("click",refresh);
for(const kind of ["shipments","quotes"])$("more-"+kind).addEventListener("click",async()=>{
  if(!ready())return;const version=epoch,button=$("more-"+kind),cursor=kind==="shipments"?shipmentCursor:quoteCursor;
  if(!cursor)return;button.disabled=true;
  try{const page=await api[kind](cursor);if(version!==epoch)return;if(!Array.isArray(page.items))throw new Error("Unable to load older records.");if(kind==="shipments"){$("history").append(...page.items.map(shipmentCard));shipmentCursor=page.nextCursor;}else{quotes.push(...page.items);$("quotes").append(...page.items.map(quoteCard));quoteCursor=page.nextCursor;quoteOptions();}button.hidden=!page.nextCursor;}
  catch(error){if(version===epoch)message(error.message);}finally{button.disabled=false;}
});
$("login").addEventListener("click",async()=>{if(!auth||!sdk){message(authStatus==="loading"?"Google sign-in is still loading. Please try again in a moment.":"Google sign-in is currently unavailable. You can still prepare your delivery details on this page.");$("message").focus();return;}$("login").disabled=true;try{await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());}catch(error){message(error.code==="auth/popup-closed-by-user"?"Sign-in cancelled.":"Google sign-in could not complete. Please try again.");}finally{$("login").disabled=false;}});
$("logout").addEventListener("click",async()=>{try{await sdk.signOut(auth);}catch{message("Sign-out could not complete. Please try again.");}});
async function initialize() {
  syncControls();
  if(!firebaseConfig?.apiKey||!firebaseConfig?.authDomain||!firebaseConfig?.projectId||!firebaseConfig?.appId){authStatus="unavailable";message("Google sign-in is not configured yet. You can prepare delivery details, but delivery requests remain closed.");return;}
  try{
    const [app,authSdk]=await Promise.all([import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")]);
    sdk=authSdk;auth=sdk.getAuth(app.initializeApp(firebaseConfig,"franks24-deliveries"));
    await sdk.setPersistence(auth,sdk.browserSessionPersistence);
    sdk.onAuthStateChanged(auth,async current=>{
      // Initial auth resolution and first sign-in must not erase a draft just typed.
      // Clear all private data when leaving or switching an authenticated account.
      if(user&&user.uid!==current?.uid)clearPrivate();
      else{epoch++;roleResolved=!dispatcherConfig.enabled;}
      user=current;syncControls();
      const version=epoch;
      if(current && dispatcherConfig.enabled){
        try {
          const staff=await isVerifiedDispatcher({user:current,enabled:true,endpoint:dispatcherConfig.sessionApi,origin:location.origin});
          if(version!==epoch || auth.currentUser?.uid!==current.uid)return;
          if(staff){location.replace("../dispatcher/");return;}
          roleResolved=true;syncControls();
        } catch {
          if(version===epoch)message("Workspace directory verification is unavailable. Delivery actions remain locked.");
          return;
        }
      }
      if(ready())refresh();
    });
    authStatus="ready";$("login").disabled=false;
  }catch{authStatus="unavailable";$("login").disabled=false;message("Google sign-in is temporarily unavailable. You can still prepare your delivery details on this page.");}
}
initialize();

