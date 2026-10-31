import {firebaseConfig} from "./config.js";
import {createIdentitySession} from "./identity-session.js";
import {CURRENT_POLICY_VERSION, acceptancePath} from "./consent-policy.js";

const $ = (id) => document.getElementById(id);
const views = ["landing","loading","auth-error","onboarding","dashboard"];
const state = {user:null, profile:null, role:"worker", hasAgreement:false, approvedEmployer:false, auth:null, db:null, api:null};
const GOOGLE_MARKUP = '<span class="google-g" aria-hidden="true"><svg viewBox="0 0 48 48" width="22" height="22"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.76 7.18l7.73 6C44.42 38.03 46.98 31.88 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.6.27-3.15.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.92 7.51 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span>';
let toastTimer;
function toast(message,error=false){const el=$("toast");el.textContent=message;el.classList.toggle("error",error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,6500)}
function showView(name){for(const v of views)$("view-"+v).hidden=v!==name;document.querySelectorAll(".nav-public").forEach(el=>el.hidden=name!=="landing");document.querySelector(".nav-login").hidden=name!=="landing";$("nav-signout").hidden=name==="landing";window.scrollTo({top:0,behavior:"instant"})}
function setText(id,value){$(id).textContent=value??""}
function showOnboarding(renewal=false){
 const form=$("onboarding-form");form.reset();$("consent-error").hidden=true;
 $("profile-fields").hidden=renewal;
 ["profile-name","profile-location","profile-phone","profile-skills"].forEach(id=>{$(id).disabled=renewal});
 $("onboard-stage").textContent=renewal?"Review updated agreements":"Create your workspace";
 setText("onboarding-heading",renewal?"Review your agreements":"Make Dispatch yours.");
 setText("onboarding-description",renewal?"Your profile is saved. Review and accept the current policies to re-enter your workspace.":"A few details, clear agreements, and your workspace is ready.");
 $("onboard-submit").textContent=renewal?"Accept & enter workspace ↗":"Agree & create my workspace ↗";
 if(!renewal){
  state.role="worker";
  document.querySelectorAll("[data-role]").forEach(button=>{const selected=button.dataset.role==="worker";button.classList.toggle("selected",selected);button.setAttribute("aria-pressed",String(selected))});
  $("skills-label").hidden=false;$("profile-name").value=state.user?.displayName||"";
 }
 showView("onboarding");
}
function allAcknowledged(){return ["consent-terms","consent-privacy","consent-ownership"].every(id=>$(id).checked)}
function isConfigured(){return Boolean(firebaseConfig?.apiKey&&firebaseConfig?.authDomain&&firebaseConfig?.projectId&&firebaseConfig?.appId)}
function errorMessage(error){const code=error?.code||"";if(code==="auth/popup-closed-by-user"||code==="auth/cancelled-popup-request")return "";if(code==="auth/unauthorized-domain")return "This website must be added to Firebase Authentication's authorized domains.";if(code==="auth/operation-not-allowed")return "Google sign-in must be enabled in Firebase Authentication.";if(code==="permission-denied")return "Access denied. Check the Firestore security rules.";if(code==="unavailable"||code==="auth/network-request-failed")return "Your connection was interrupted. Retry when you are online.";if(code==="invalid-profile-role"||error?.message==="invalid-profile-role")return "This account needs administrator review before a workspace can be opened.";return "We couldn't complete that action. Please try again."}
function loginAvailability(enabled,message=""){
 document.querySelectorAll("[data-login]").forEach(button=>button.disabled=!enabled);
 $("identity-notice").textContent=message;
}
function clearPrivateWorkspace(){
 state.profile=null;state.hasAgreement=false;state.approvedEmployer=false;
 ["jobs-list","profile-details"].forEach(id=>$(id).replaceChildren());
 ["user-name","user-role","dashboard-heading","onboard-email"].forEach(id=>setText(id,""));
 $("job-form").reset();$("job-form").hidden=true;$("new-job-button").hidden=true;$("save-job").disabled=false;
 $("onboarding-form").reset();$("onboard-submit").disabled=false;
}
const identitySession=createIdentitySession({
 async load(user){
  const {doc,getDoc}=state.api;
  const [profile,agreement]=await Promise.all([
   getDoc(doc(state.db,"users",user.uid)),
   getDoc(doc(state.db,...acceptancePath(user.uid)))
  ]);
  return {profile:profile.exists()?profile.data():null,hasAgreement:agreement.exists()};
 },
 publish(result){
  clearPrivateWorkspace();state.user=result.user;
  state.profile=result.profile;state.hasAgreement=result.hasAgreement;
  if(result.phase==="signed_out"){showView("landing");loginAvailability(true);return}
  loginAvailability(false,result.phase==="loading"?"Restoring your secure workspace…":"");
  if(result.phase==="loading"){showView("loading");return}
  if(result.phase==="error"){setText("auth-error-detail",errorMessage(result.error));showView("auth-error");return}
  setText("onboard-email",result.user.email||"Google account");
  if(result.phase==="ready")showDashboard();
  else showOnboarding(Boolean(result.profile));
 }
});
async function initializeFirebase(){
 loginAvailability(false,"Checking sign-in availability…");
 if(!isConfigured()){showView("landing");loginAvailability(false,"Google sign-in is not active yet. Firebase project configuration is required.");return}
 try{
  const {connectFirebase}=await import("./firebase-client.js");
  const client=await connectFirebase(firebaseConfig);
  state.auth=client.auth;state.db=client.db;state.api=client.api;
  // Observe sessions instead of assuming a popup result is a complete profile.
  state.api.onAuthStateChanged(state.auth,user=>identitySession.resolve(user));
 }catch(error){loginAvailability(false,"");setText("auth-error-detail","Sign-in could not start. Check your connection and try again.");showView("auth-error")}
}
async function login(){
 if(!isConfigured()||!state.api)return;
 const provider=new state.api.GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});
 loginAvailability(false,"Opening Google sign-in…");
 try{await state.api.signInWithPopup(state.auth,provider)}
 catch(error){
  if(error?.code==="auth/popup-blocked"||error?.code==="auth/operation-not-supported-in-this-environment"){
   toast("Allow popups for this site and try again. In an in-app browser, open this page in Safari, Chrome or Edge.",true);
  }else{const message=errorMessage(error);if(message)toast(message,true)}
 }finally{if(!state.auth.currentUser)loginAvailability(true)}
}
async function logout(){
 if(!state.auth)return;
 identitySession.resolve(null); // Clear private UI and invalidate in-flight work immediately.
 try{await state.api.signOut(state.auth)}
 catch(error){await identitySession.resolve(state.auth.currentUser);toast("Sign-out did not complete. Please try again.",true)}
}
$("retry-identity").addEventListener("click",()=>state.auth?identitySession.resolve(state.auth.currentUser):location.reload());
$("error-signout").addEventListener("click",logout);
document.querySelectorAll("[data-login]").forEach(button=>button.addEventListener("click",login));
$("nav-signout").addEventListener("click",logout);
$("onboarding-signout").addEventListener("click",logout);
document.querySelectorAll(".agreement-option input").forEach(input=>input.addEventListener("change",()=>{$("consent-error").hidden=true}));
document.querySelectorAll("[data-role]").forEach(button=>button.addEventListener("click",()=>{state.role=button.dataset.role;document.querySelectorAll("[data-role]").forEach(b=>{const selected=b===button;b.classList.toggle("selected",selected);b.setAttribute("aria-pressed",String(selected))});$("skills-label").hidden=state.role==="employer"}));
$("onboarding-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!state.user||!state.db||!state.api)return;
 if(!allAcknowledged()){$("consent-error").hidden=false;$("consent-terms").focus();return}
 const form=event.currentTarget;if(!form.reportValidity())return;
 const btn=$("onboard-submit");btn.disabled=true;const user=state.user;const uid=user.uid;const version=identitySession.generation;
 try{
  // This document is immutable: Security Rules enforce the Google UID, the pinned
  // policy release, each affirmative acknowledgment, and a server-side timestamp.
  const ref=state.api.doc(state.db,...acceptancePath(uid));
  const existing=await state.api.getDoc(ref);
  if(!existing.exists()){
   await state.api.setDoc(ref,{uid,email:user.email||"",version:CURRENT_POLICY_VERSION,
    termsAccepted:true,privacyAcknowledged:true,ownershipAcknowledged:true,
    acceptedAt:state.api.serverTimestamp()});
  }
  if(!identitySession.isCurrent(version))return;
  state.hasAgreement=true;
  if(!state.profile){
   const profile={displayName:$("profile-name").value.trim(),email:user.email||"",
     location:$("profile-location").value.trim(),phone:$("profile-phone").value.trim(),
     skills:state.role==="worker"?$("profile-skills").value.trim():"",
     role:state.role,photoURL:user.photoURL||"",
     createdAt:state.api.serverTimestamp(),updatedAt:state.api.serverTimestamp()};
   if(!profile.displayName||!profile.location){toast("Please complete your name and location.",true);return}
   const saved=await state.api.runTransaction(state.db,async transaction=>{
    const ref=state.api.doc(state.db,"users",uid);
    const snapshot=await transaction.get(ref);
    if(snapshot.exists())return snapshot.data();
    transaction.set(ref,profile);return profile;
   });
   if(!identitySession.isCurrent(version))return;
   state.profile=saved;
  }
  if(!identitySession.isCurrent(version))return;
  showDashboard();toast("Your workspace is ready.");
 }catch(error){if(identitySession.isCurrent(version))toast(errorMessage(error),true)}finally{if(identitySession.isCurrent(version))btn.disabled=false}
});
function showDashboard(){
 const profile=state.profile; if(!profile||!state.hasAgreement)return;
 const employer=profile.role==="employer";setText("dashboard-heading","Welcome, "+(profile.displayName||"there").split(" ")[0]+".");
 setText("user-initial",(profile.displayName||"D").charAt(0).toUpperCase());setText("user-name",profile.displayName);setText("user-role",employer?"Hiring team":"Job seeker");
 setText("dashboard-intro",employer?"Manage your openings and connect with people.":"Find opportunities and take your next step.");
 setText("jobs-nav-label",employer?"My jobs":"Opportunities");setText("jobs-heading",employer?"Your job posts":"Available opportunities");
 setText("jobs-description",employer?"Post and manage opportunities for your team.":"Jobs published by hiring teams appear here.");
 state.approvedEmployer=false;
 $("new-job-button").hidden=true;$("job-form").hidden=true;
 $("employer-approval-banner").hidden=!employer;
 showView("dashboard");showPanel("jobs");renderProfile();loadJobs();
 if(employer) refreshEmployerApproval();
}
async function refreshEmployerApproval(){
 if(!state.user||state.profile?.role!=="employer")return;
 const uid=state.user.uid;const version=identitySession.generation;
 const banner=$("employer-approval-banner"), title=$("employer-approval-heading");
 const description=$("employer-approval-description"), button=$("refresh-employer-approval");
 state.approvedEmployer=false;$("new-job-button").hidden=true;$("job-form").hidden=true;banner.hidden=false;
 title.textContent="Verification pending";
 description.textContent="You can use your workspace, but a Dispatch administrator must verify your hiring account before you can publish jobs.";
 button.disabled=true;button.textContent="Checking…";
 try{
  const docRef=state.api.doc(state.db,"employerApprovals",uid);
  const result=await state.api.getDoc(docRef);
  if(!identitySession.isCurrent(version))return;
  const status=result.exists()?result.data().status:"pending";
  state.approvedEmployer=status==="approved";
  $("new-job-button").hidden=!state.approvedEmployer;
  if(state.approvedEmployer){
   title.textContent="Employer verified";
   description.textContent="Your hiring account has been approved. You can now publish opportunities.";
  }else if(status==="rejected"||status==="suspended"){
   title.textContent=status==="suspended"?"Verification suspended":"Verification not approved";
   description.textContent="Publishing is disabled. Contact the Dispatch administrator if you need a review.";
  }
 }catch(error){
  if(!identitySession.isCurrent(version))return;
  state.approvedEmployer=false;
  title.textContent="Verification unavailable";
  description.textContent="We couldn't confirm your approval status. Publishing remains disabled. Try checking again.";
  toast(errorMessage(error),true);
 }finally{
  if(identitySession.isCurrent(version)){button.disabled=false;button.textContent="Check status";renderProfile()}
 }
}
$("refresh-employer-approval").addEventListener("click",refreshEmployerApproval);
function showPanel(panel){document.querySelectorAll(".dashboard-panel").forEach(x=>x.hidden=x.id!=="panel-"+panel);document.querySelectorAll("[data-panel]").forEach(x=>x.classList.toggle("active",x.dataset.panel===panel))}
document.querySelectorAll("[data-panel]").forEach(button=>button.addEventListener("click",()=>showPanel(button.dataset.panel)));
function renderProfile(){const container=$("profile-details");container.replaceChildren();const p=state.profile||{};for(const [label,value] of [["Name",p.displayName],["Email",p.email],["Account type",p.role==="employer"?"Hiring team":"Job seeker"],["Location",p.location],["Phone",p.phone||"Not provided"],["Skills",p.skills||"Not provided"],...(p.role==="employer"?[["Employer approval",state.approvedEmployer?"Verified":"Pending / not approved"]]:[])]){const box=document.createElement("div");box.className="profile-item";const l=document.createElement("span");l.textContent=label;const v=document.createElement("strong");v.textContent=value||"—";box.append(l,v);container.append(box)}}
function emptyState(heading,detail){const root=document.createElement("div");root.className="empty-state";const icon=document.createElement("div");icon.className="empty-mark";icon.textContent="↗";const h=document.createElement("h3");h.textContent=heading;const p=document.createElement("p");p.textContent=detail;root.append(icon,h,p);return root}
async function loadJobs(){
 const version=identitySession.generation;const uid=state.user?.uid;
 const list=$("jobs-list");list.replaceChildren(emptyState("Loading opportunities","Checking the latest information."));
 try{
 const employer=state.profile?.role==="employer";
 const q=state.api.query(state.api.collection(state.db,"jobs"),state.api.where(employer?"createdBy":"status","==",employer?uid:"open"));
 const docs=await state.api.getDocs(q);
 if(!identitySession.isCurrent(version))return;
 list.replaceChildren();
 if(docs.empty){list.append(emptyState(employer?"No jobs posted yet":"Nothing open just yet",employer?"Create your first job post to start connecting with candidates.":"New opportunities will appear here when employers publish them."));return}
 const sorted=docs.docs.slice().sort((a,b)=>(b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0));
 sorted.forEach(docSnap=>{const job=docSnap.data();const item=document.createElement("article");item.className="job-card";const main=document.createElement("div");const meta=document.createElement("div");meta.className="job-meta";meta.textContent=[job.type,job.location,job.compensation,job.status==="closed"?"Closed":""].filter(Boolean).join(" · ");const h=document.createElement("h3");h.textContent=job.title||"Opportunity";const p=document.createElement("p");p.textContent=job.description||"";main.append(meta,h,p);item.append(main);
 if(!employer&&job.status==="open"){const btn=document.createElement("button");btn.type="button";btn.className="button button-dark";btn.textContent="Apply ↗";btn.addEventListener("click",()=>applyForJob(docSnap.id,btn));item.append(btn)}
 if(employer){const badge=document.createElement("div");badge.className="job-meta";badge.textContent=job.status==="open"?"OPEN":"CLOSED";item.append(badge)}
 list.append(item)});
 }catch(error){if(!identitySession.isCurrent(version))return;list.replaceChildren(emptyState("Unable to load jobs", "Please try refreshing or contact the Dispatch administrator."));toast(errorMessage(error),true)}
}
async function applyForJob(jobId,button){
 if(!state.user||state.profile?.role!=="worker")return;
 const version=identitySession.generation;const uid=state.user.uid;
 button.disabled=true;try{
 const id=jobId+"_"+uid;const ref=state.api.doc(state.db,"applications",id);
 const existing=await state.api.getDoc(ref);if(!identitySession.isCurrent(version))return;
 if(existing.exists()){toast("You have already applied for this opportunity.");button.textContent="Applied ✓";return}
 await state.api.setDoc(ref,{jobId,applicantId:uid,status:"submitted",createdAt:state.api.serverTimestamp()});
 if(!identitySession.isCurrent(version))return;
 button.textContent="Applied ✓";toast("Application submitted successfully.");
 }catch(error){if(identitySession.isCurrent(version)){button.disabled=false;toast(errorMessage(error),true)}}
}
$("new-job-button").addEventListener("click",()=>{
 if(!state.approvedEmployer){toast("Employer verification is required before publishing.",true);return}
 $("job-form").hidden=false;$("job-title").focus()
});
$("cancel-job").addEventListener("click",()=>{$("job-form").reset();$("job-form").hidden=true});
$("job-form").addEventListener("submit",async event=>{
 event.preventDefault();if(state.profile?.role!=="employer")return;
 if(!state.approvedEmployer){toast("Your employer account must be verified before publishing.",true);return}
 if(!event.currentTarget.reportValidity())return;
 const version=identitySession.generation;const uid=state.user.uid;
 const button=$("save-job");button.disabled=true;
 try{await state.api.addDoc(state.api.collection(state.db,"jobs"),{title:$("job-title").value.trim(),location:$("job-location").value.trim(),type:$("job-type").value,compensation:$("job-compensation").value.trim(),description:$("job-description").value.trim(),status:"open",createdBy:uid,createdAt:state.api.serverTimestamp(),updatedAt:state.api.serverTimestamp()});if(!identitySession.isCurrent(version))return;$("job-form").reset();$("job-form").hidden=true;toast("Opportunity published.");await loadJobs()}catch(error){if(identitySession.isCurrent(version))toast(errorMessage(error),true)}finally{if(identitySession.isCurrent(version))button.disabled=false}
});
$("year").textContent=String(new Date().getFullYear());
showView("landing");
initializeFirebase();
