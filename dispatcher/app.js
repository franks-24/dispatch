import {firebaseConfig} from "../assets/config.js";
import {dispatcherConfig} from "./config.js";
const $=id=>document.getElementById(id);
let auth,sdk,currentVersion=0;
const note=text=>$("staff-status").textContent=text;
const close=()=>{$("staff-workspace").hidden=true;$("staff-logout").hidden=true;};
async function authorize(user){
 const v=++currentVersion;close();
 if(!user){note("Sign in with your approved internal Google Workspace account.");return;}
 note("Verifying internal Workspace membership…");
 try{
  const token=await user.getIdToken(true);
  if(v!==currentVersion)return;
  const endpoint=new URL(dispatcherConfig.sessionApi,location.origin);
  if(endpoint.origin!==location.origin||!endpoint.pathname.startsWith("/api/dispatcher/"))throw Error("Invalid staff endpoint");
  const response=await fetch(endpoint.href,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",cache:"no-store"});
  if(v!==currentVersion)return;
  if(!response.ok)throw Error(response.status===403?"This Google account is not authorized for Dispatcher.":"Dispatcher directory verification is unavailable.");
  if(!(response.headers.get("content-type")||"").startsWith("application/json"))throw Error("Dispatcher verification is unavailable.");
  const result=await response.json();
  if(v!==currentVersion)return;
  if(result.role!=="dispatcher"||result.workspace!=="dispatcher")throw Error("Dispatcher access was not verified.");
  $("staff-workspace").hidden=false;$("staff-logout").hidden=false;
  note("Internal Workspace directory membership verified.");
 }catch(error){if(v===currentVersion){close();note(error.message==="This Google account is not authorized for Dispatcher."?error.message:"Unable to verify Dispatcher access. The workspace remains locked.");}}
}
async function start(){
 close();
 if(!dispatcherConfig.enabled){note("Staff sign-in preview is disabled pending authorized-directory, backend and security verification.");return;}
 if(!firebaseConfig?.apiKey||!firebaseConfig?.authDomain||firebaseConfig?.projectId!=="dispatch-1491f"||!firebaseConfig?.appId){note("Dispatcher identity is not configured.");return;}
 if(!/^\/api\/dispatcher\/[A-Za-z0-9/_-]+$/.test(dispatcherConfig.sessionApi)){note("Dispatcher API endpoint is not configured.");return;}
 try{
  const [appSdk,authSdk]=await Promise.all([import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")]);
  sdk=authSdk;
  const app=appSdk.initializeApp(firebaseConfig,"franks24-deliveries");
  auth=sdk.getAuth(app);
  await sdk.setPersistence(auth,sdk.browserSessionPersistence);
  sdk.onAuthStateChanged(auth,authorize,()=>{++currentVersion;close();note("Dispatcher identity verification failed.");});
  $("staff-login").disabled=false;
 }catch{close();note("Dispatcher Google sign-in is unavailable.");}
}
$("staff-login").addEventListener("click",async()=>{
 if(!auth||!sdk||!dispatcherConfig.enabled)return;
 $("staff-login").disabled=true;
 try{await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());}
 catch{note("Google sign-in did not complete. Try again in your browser.");}
 finally{$("staff-login").disabled=false;}
});
$("staff-logout").addEventListener("click",async()=>{
 if(!auth||!sdk)return;
 ++currentVersion;close();
 try{await sdk.signOut(auth);}
 catch{note("Sign out failed. Close this tab and contact your administrator.");return;}
 note("Signed out. Dispatcher workspace locked.");
});
start();
