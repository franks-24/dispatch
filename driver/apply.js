import {firebaseConfig} from "../assets/config.js";
import {operationsConfig} from "../workspaces/config.js";

const $=id=>document.getElementById(id);
const form=$("apply-form"),status=$("applicant-status"),panel=$("application-panel");
let auth,sdk,user=null,epoch=0,controller=new AbortController(),submissionKey=null,submissionDigest="";
function note(message){status.textContent=message;}
function clearPrivate(){
 epoch++;controller.abort();controller=new AbortController();
 user=null;submissionKey=null;submissionDigest="";
 form.reset();form.hidden=true;panel.hidden=true;$("application-summary").hidden=true;
 $("applicant-account").textContent="";$("applicant-logout").hidden=true;
 $("applicant-login").hidden=!auth;
}
async function api(method,body){
 if(!user)throw Error("Sign in to continue.");
 const identity=user,version=epoch,token=await identity.getIdToken();
 if(version!==epoch)throw Error("The signed-in account changed.");
 const payload=body?JSON.stringify(body):undefined;
 if(payload!==submissionDigest){submissionDigest=payload||"";submissionKey=crypto.randomUUID();}
 const response=await fetch(new URL("/api/driver/application",location.origin),{
  method,headers:{Authorization:"Bearer "+token,Accept:"application/json",
   ...(payload?{"Content-Type":"application/json","Idempotency-Key":submissionKey}:{})},
  body:payload,cache:"no-store",redirect:"error",signal:controller.signal
 });
 if(version!==epoch)throw Error("The signed-in account changed.");
 const result=(response.headers.get("Content-Type")||"").startsWith("application/json")?await response.json():null;
 if(version!==epoch)throw Error("The signed-in account changed.");
 if(!response.ok||!result)throw Error(result?.error||"Application service is not available.");
 return result;
}
function render(data){
 panel.hidden=false;
 const application=data.application;
 form.hidden=!!application||data.approved===true;
 $("application-summary").hidden=!application&&data.approved!==true;
 if(application||data.approved===true){
  $("application-state").textContent=application?.status||"approved";
  $("application-details").textContent=application?application.name+" · "+application.vehicle+" · "+application.region:"Your driver account has been approved.";
  $("application-id").textContent=application?"Application reference "+application.id:"";
  note(application?.status==="approved"||data.approved?"Driver approval verified. Your operational access still depends on the live session and current credentials.":"Your application has been received. A human reviewer must complete verification.");
 }else note("Complete the fields below to request driver review. No operational access is granted.");
}
async function accountChanged(identity){
 const current=++epoch;controller.abort();controller=new AbortController();user=identity;
 form.hidden=true;panel.hidden=true;$("application-summary").hidden=true;
 $("applicant-logout").hidden=!identity;$("applicant-login").hidden=!!identity;
 $("applicant-account").textContent=identity?.email||"";
 if(!identity){form.reset();note("Sign in with your own Google account to apply.");return;}
 note("Checking your application status…");
 try{const data=await api("GET");if(current===epoch)render(data);}
 catch(error){if(current===epoch)note(error.message);}
}
$("applicant-login").addEventListener("click",async()=>{
 if(!auth)return;
 const button=$("applicant-login");button.disabled=true;
 try{
  const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});
  await sdk.signInWithPopup(auth,provider);
 }catch(error){note(error.code==="auth/popup-closed-by-user"?"Google sign-in cancelled.":error.code==="auth/unauthorized-domain"?"This domain must be authorized in Firebase before Google sign-in can work.":"Google sign-in failed. Try a current browser and permit the popup.");}
 finally{button.disabled=false;}
});
$("applicant-logout").addEventListener("click",async()=>{
 clearPrivate();try{await sdk.signOut(auth);note("Signed out. Local application details cleared.");}
 catch{note("Sign-out could not be confirmed. Close the tab and contact support.");}
});
form.addEventListener("submit",async event=>{
 event.preventDefault();if(!form.reportValidity()||!user)return;
 const button=$("apply-submit"),v=new FormData(form),version=epoch;
 const payload={name:String(v.get("name")||"").trim(),region:String(v.get("region")||"").trim(),
  vehicle:String(v.get("vehicle")||""),policyVersion:operationsConfig.policyVersion,
  termsAccepted:v.get("termsAccepted")==="on",
  privacyAcknowledged:v.get("privacyAcknowledged")==="on",
  dataUseAcknowledged:v.get("dataUseAcknowledged")==="on"};
 button.disabled=true;note("Submitting your application securely…");
 try{const data=await api("POST",payload);if(version===epoch)render(data);}
 catch(error){if(version===epoch)note(error.message);}
 finally{if(version===epoch)button.disabled=false;}
});
window.addEventListener("pagehide",()=>{controller.abort();});
async function start(){
 if(!operationsConfig.enabled||!operationsConfig.policyVersion||
    operationsConfig.policyVersion.toLowerCase().includes("draft")){
  note("Applications are not yet open. Approved policies and the secure Firebase application API are required. No application data is collected here.");
  return;
 }
 if(firebaseConfig?.projectId!=="dispatch-1491f"||!firebaseConfig.apiKey){
  note("The approved Google sign-in configuration is not available.");return;
 }
 try{
  const [apps,identity]=await Promise.all([
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")]);
  sdk=identity;
  const app=apps.getApps().find(x=>x.name==="franks24-driver-applicants")||
   apps.initializeApp(firebaseConfig,"franks24-driver-applicants");
  auth=sdk.getAuth(app);
  await sdk.setPersistence(auth,sdk.browserSessionPersistence);
  sdk.onAuthStateChanged(auth,accountChanged,()=>{clearPrivate();note("Identity verification failed.");});
  $("applicant-login").disabled=false;
 }catch{note("Google sign-in is unavailable. Try again when the service is connected.");}
}
start();
