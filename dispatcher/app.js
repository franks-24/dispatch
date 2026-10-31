import {firebaseConfig} from "../assets/config.js";
import {dispatcherConfig} from "./config.js";

const $=id=>document.getElementById(id);
let auth,sdk,currentVersion=0;
const login=$("staff-login");
const note=text=>{$("staff-status").textContent=text;};
const close=()=>{
 $("staff-workspace").hidden=true;
 $("staff-logout").hidden=true;
 $("staff-account").textContent="";
 login.textContent="Continue with Google ↗";
};

async function authorize(user){
 const version=++currentVersion;
 close();
 if(!user){
  note("Choose your own approved Franks24 Google Workspace account. Each staff member signs in separately.");
  return;
 }
 note("Checking your staff permissions…");
 try{
  const token=await user.getIdToken(true);
  if(version!==currentVersion)return;
  const endpoint=new URL(dispatcherConfig.sessionApi,location.origin);
  if(endpoint.origin!==location.origin||!/^\/api\/dispatcher\/[A-Za-z0-9/_-]+$/.test(endpoint.pathname)||endpoint.search||endpoint.hash)
   throw Error("Invalid staff endpoint");
  const response=await fetch(endpoint.href,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",cache:"no-store"});
  if(version!==currentVersion)return;
  if(!response.ok)throw Error(response.status===403?"This Google account is not authorized for Dispatcher.":"Dispatcher directory verification is unavailable.");
  if(!(response.headers.get("content-type")||"").startsWith("application/json"))throw Error("Dispatcher verification is unavailable.");
  const result=await response.json();
  if(version!==currentVersion)return;
  if(result.role!=="dispatcher"||result.workspace!=="dispatcher")throw Error("Dispatcher access was not verified.");
  $("staff-workspace").hidden=false;
  $("staff-logout").hidden=false;
  $("staff-account").textContent=user.email||"Verified staff account";
  login.textContent="Switch Google account";
  note("Staff access verified. You are signed in to the Dispatcher workspace.");
 }catch(error){
  if(version!==currentVersion)return;
  close();
  note(error.message==="This Google account is not authorized for Dispatcher."?error.message:"Unable to verify Dispatcher access. The workspace remains locked.");
 }
}

async function start(){
 close();
 if(!dispatcherConfig.enabled){
  note("Dispatcher access is not live yet. The trusted staff-directory backend must be deployed and verified before Google sign-in can be enabled.");
  return;
 }
 if(!firebaseConfig?.apiKey||!firebaseConfig?.authDomain||firebaseConfig?.projectId!=="dispatch-1491f"||!firebaseConfig?.appId){
  note("Dispatcher identity is not configured.");
  return;
 }
 if(!/^\/api\/dispatcher\/[A-Za-z0-9/_-]+$/.test(dispatcherConfig.sessionApi)){
  note("Dispatcher API endpoint is not configured.");
  return;
 }
 try{
  const [appSdk,authSdk]=await Promise.all([
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")
  ]);
  sdk=authSdk;
  const app=appSdk.initializeApp(firebaseConfig,"franks24-deliveries");
  auth=sdk.getAuth(app);
  await sdk.setPersistence(auth,sdk.browserSessionPersistence);
  sdk.onAuthStateChanged(auth,authorize,()=>{
   ++currentVersion;close();
   note("Dispatcher identity verification failed. Try signing in again.");
  });
  login.disabled=false;
 }catch{
  close();
  note("Dispatcher Google sign-in is unavailable.");
 }
}

login.addEventListener("click",async()=>{
 if(!auth||!sdk||!dispatcherConfig.enabled)return;
 login.disabled=true;
 try{
  const provider=new sdk.GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  await sdk.signInWithPopup(auth,provider);
 }catch(error){
  if(error?.code==="auth/popup-closed-by-user")note("Sign-in cancelled. Choose Continue with Google to try again.");
  else if(error?.code==="auth/popup-blocked"||error?.code==="auth/operation-not-supported-in-this-environment")
   note("Your browser blocked Google sign-in. Open this page in Safari, Chrome or Edge and permit the sign-in popup.");
  else if(error?.code==="auth/unauthorized-domain")
   note("This site is not authorized for Google sign-in. Contact the Franks24 administrator.");
  else note("Google sign-in did not complete. Try again or choose another approved account.");
 }finally{login.disabled=false;}
});

$("staff-logout").addEventListener("click",async()=>{
 if(!auth||!sdk)return;
 ++currentVersion;close();
 try{await sdk.signOut(auth);}
 catch{note("Sign out failed. Close this tab and contact your administrator.");return;}
 note("Signed out. Dispatcher workspace locked.");
});

start();
