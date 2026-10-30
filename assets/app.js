import {firebaseConfig} from "./config.js";

const $ = (id) => document.getElementById(id);
const views = ["landing","onboarding","dashboard"];
const state = {user:null, profile:null, role:"worker", auth:null, db:null, api:null};
const GOOGLE_MARKUP = '<span class="google-g" aria-hidden="true"><svg viewBox="0 0 48 48" width="22" height="22"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.76 7.18l7.73 6C44.42 38.03 46.98 31.88 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.6.27-3.15.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.92 7.51 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span>';
let toastTimer;
function toast(message,error=false){const el=$("toast");el.textContent=message;el.classList.toggle("error",error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,6500)}
function showView(name){for(const v of views)$("view-"+v).hidden=v!==name;document.querySelectorAll(".nav-public").forEach(el=>el.hidden=name!=="landing");document.querySelector(".nav-login").hidden=name!=="landing";$("nav-signout").hidden=name==="landing";window.scrollTo({top:0,behavior:"instant"})}
function setText(id,value){$(id).textContent=value??""}
function isConfigured(){return Boolean(firebaseConfig?.apiKey&&firebaseConfig?.authDomain&&firebaseConfig?.projectId&&firebaseConfig?.appId)}
function errorMessage(error){const code=error?.code||"";if(code==="auth/popup-closed-by-user"||code==="auth/cancelled-popup-request")return "";if(code==="auth/unauthorized-domain")return "This website must be added to Firebase Authentication's authorized domains.";if(code==="auth/operation-not-allowed")return "Google sign-in must be enabled in Firebase Authentication.";if(code==="permission-denied")return "Access denied. Check the Firestore security rules.";return "We couldn't complete that action. Please try again."}
async function initializeFirebase(){
 if(!isConfigured())return;
 try{
  const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,onAuthStateChanged,signOut},{getFirestore,doc,getDoc,setDoc,addDoc,collection,query,where,getDocs,serverTimestamp}] = await Promise.all([
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js")
  ]);
  const app=initializeApp(firebaseConfig);state.auth=getAuth(app);state.db=getFirestore(app);
  state.api={GoogleAuthProvider,signInWithPopup,signInWithRedirect,onAuthStateChanged,signOut,doc,getDoc,setDoc,addDoc,collection,query,where,getDocs,serverTimestamp};
  onAuthStateChanged(state.auth,async user=>{try{state.user=user;if(!user){state.profile=null;showView("landing");return}setText("onboard-email",user.email||"Google account");const profileRef=doc(state.db,"users",user.uid);const snapshot=await getDoc(profileRef);if(snapshot.exists()){state.profile=snapshot.data();showDashboard()}else{state.profile=null;setText("profile-name",user.displayName||"");$("profile-name").value=user.displayName||"";showView("onboarding")}}catch(error){toast(errorMessage(error),true)}});
 }catch(error){console.error("Firebase initialization failed",error);toast("Google sign-in is temporarily unavailable.",true)}
}
async function login(){
 if(!isConfigured()){toast("Google sign-in is being connected. Please check back shortly.",true);return}
 if(!state.api){toast("Sign-in is loading. Try again in a moment.",true);return}
 const provider=new state.api.GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});
 try{await state.api.signInWithPopup(state.auth,provider)}catch(error){if(error?.code==="auth/popup-blocked"||error?.code==="auth/operation-not-supported-in-this-environment"){try{await state.api.signInWithRedirect(state.auth,provider)}catch(e){toast(errorMessage(e),true)}}else{const msg=errorMessage(error);if(msg)toast(msg,true)}}
}
async function logout(){if(!state.auth)return;try{await state.api.signOut(state.auth)}catch(e){toast(errorMessage(e),true)}}
document.querySelectorAll("[data-login]").forEach(button=>button.addEventListener("click",login));
$("nav-signout").addEventListener("click",logout);
document.querySelectorAll("[data-role]").forEach(button=>button.addEventListener("click",()=>{state.role=button.dataset.role;document.querySelectorAll("[data-role]").forEach(b=>{const selected=b===button;b.classList.toggle("selected",selected);b.setAttribute("aria-pressed",String(selected))});$("skills-label").hidden=state.role==="employer"}));
$("onboarding-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!state.user||!state.db)return;
 const form=event.currentTarget;if(!form.reportValidity())return;const btn=$("onboard-submit");btn.disabled=true;
 try{
  const profile={displayName:$("profile-name").value.trim(),email:state.user.email||"",location:$("profile-location").value.trim(),phone:$("profile-phone").value.trim(),skills:state.role==="worker"?$("profile-skills").value.trim():"",role:state.role,photoURL:state.user.photoURL||"",createdAt:state.api.serverTimestamp(),updatedAt:state.api.serverTimestamp()};
  if(!profile.displayName||!profile.location){toast("Please complete your name and location.",true);return}
  await state.api.setDoc(state.api.doc(state.db,"users",state.user.uid),profile);
  state.profile=profile;showDashboard();toast("Your workspace is ready.")
 }catch(error){toast(errorMessage(error),true)}finally{btn.disabled=false}
});
function showDashboard(){
 const profile=state.profile; if(!profile)return;
 const employer=profile.role==="employer";setText("dashboard-heading","Welcome, "+(profile.displayName||"there").split(" ")[0]+".");
 setText("user-initial",(profile.displayName||"D").charAt(0).toUpperCase());setText("user-name",profile.displayName);setText("user-role",employer?"Hiring team":"Job seeker");
 setText("dashboard-intro",employer?"Manage your openings and connect with people.":"Find opportunities and take your next step.");
 setText("jobs-nav-label",employer?"My jobs":"Opportunities");setText("jobs-heading",employer?"Your job posts":"Available opportunities");
 setText("jobs-description",employer?"Post and manage opportunities for your team.":"Jobs published by hiring teams appear here.");
 $("new-job-button").hidden=!employer;$("job-form").hidden=true;showView("dashboard");showPanel("jobs");renderProfile();loadJobs();
}
function showPanel(panel){document.querySelectorAll(".dashboard-panel").forEach(x=>x.hidden=x.id!=="panel-"+panel);document.querySelectorAll("[data-panel]").forEach(x=>x.classList.toggle("active",x.dataset.panel===panel))}
document.querySelectorAll("[data-panel]").forEach(button=>button.addEventListener("click",()=>showPanel(button.dataset.panel)));
function renderProfile(){const container=$("profile-details");container.replaceChildren();const p=state.profile||{};for(const [label,value] of [["Name",p.displayName],["Email",p.email],["Account type",p.role==="employer"?"Hiring team":"Job seeker"],["Location",p.location],["Phone",p.phone||"Not provided"],["Skills",p.skills||"Not provided"]]){const box=document.createElement("div");box.className="profile-item";const l=document.createElement("span");l.textContent=label;const v=document.createElement("strong");v.textContent=value||"—";box.append(l,v);container.append(box)}}
function emptyState(heading,detail){const root=document.createElement("div");root.className="empty-state";const icon=document.createElement("div");icon.className="empty-mark";icon.textContent="↗";const h=document.createElement("h3");h.textContent=heading;const p=document.createElement("p");p.textContent=detail;root.append(icon,h,p);return root}
async function loadJobs(){
 const list=$("jobs-list");list.replaceChildren(emptyState("Loading opportunities","Checking the latest information."));
 try{
 const employer=state.profile?.role==="employer";
 const q=state.api.query(state.api.collection(state.db,"jobs"),state.api.where(employer?"createdBy":"status","==",employer?state.user.uid:"open"));
 const docs=await state.api.getDocs(q);
 list.replaceChildren();
 if(docs.empty){list.append(emptyState(employer?"No jobs posted yet":"Nothing open just yet",employer?"Create your first job post to start connecting with candidates.":"New opportunities will appear here when employers publish them."));return}
 const sorted=docs.docs.slice().sort((a,b)=>(b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0));
 sorted.forEach(docSnap=>{const job=docSnap.data();const item=document.createElement("article");item.className="job-card";const main=document.createElement("div");const meta=document.createElement("div");meta.className="job-meta";meta.textContent=[job.type,job.location,job.compensation,job.status==="closed"?"Closed":""].filter(Boolean).join(" · ");const h=document.createElement("h3");h.textContent=job.title||"Opportunity";const p=document.createElement("p");p.textContent=job.description||"";main.append(meta,h,p);item.append(main);
 if(!employer&&job.status==="open"){const btn=document.createElement("button");btn.type="button";btn.className="button button-dark";btn.textContent="Apply ↗";btn.addEventListener("click",()=>applyForJob(docSnap.id,btn));item.append(btn)}
 if(employer){const badge=document.createElement("div");badge.className="job-meta";badge.textContent=job.status==="open"?"OPEN":"CLOSED";item.append(badge)}
 list.append(item)});
 }catch(error){list.replaceChildren(emptyState("Unable to load jobs", "Please try refreshing or contact the Dispatch administrator."));toast(errorMessage(error),true)}
}
async function applyForJob(jobId,button){
 if(!state.user||state.profile?.role!=="worker")return;
 button.disabled=true;try{
 const id=jobId+"_"+state.user.uid;const ref=state.api.doc(state.db,"applications",id);
 if((await state.api.getDoc(ref)).exists()){toast("You have already applied for this opportunity.");button.textContent="Applied ✓";return}
 await state.api.setDoc(ref,{jobId,applicantId:state.user.uid,status:"submitted",createdAt:state.api.serverTimestamp()});
 button.textContent="Applied ✓";toast("Application submitted successfully.");
 }catch(error){button.disabled=false;toast(errorMessage(error),true)}
}
$("new-job-button").addEventListener("click",()=>{$("job-form").hidden=false;$("job-title").focus()});
$("cancel-job").addEventListener("click",()=>{$("job-form").reset();$("job-form").hidden=true});
$("job-form").addEventListener("submit",async event=>{
 event.preventDefault();if(state.profile?.role!=="employer"||!event.currentTarget.reportValidity())return;
 const button=$("save-job");button.disabled=true;
 try{await state.api.addDoc(state.api.collection(state.db,"jobs"),{title:$("job-title").value.trim(),location:$("job-location").value.trim(),type:$("job-type").value,compensation:$("job-compensation").value.trim(),description:$("job-description").value.trim(),status:"open",createdBy:state.user.uid,createdAt:state.api.serverTimestamp(),updatedAt:state.api.serverTimestamp()});$("job-form").reset();$("job-form").hidden=true;toast("Opportunity published.");await loadJobs()}catch(error){toast(errorMessage(error),true)}finally{button.disabled=false}
});
$("year").textContent=String(new Date().getFullYear());
showView("landing");
initializeFirebase();
