import {cp,mkdir,readFile,writeFile,rm} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
const root=new URL("../",import.meta.url);
const target=new URL("../.firebase-dispatcher-public/",import.meta.url);
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const name of ["index.html","assets","dispatcher","deliveries","legal","driver","operations","workspaces"]){
 await cp(new URL(name,root),new URL(name,target),{recursive:true});
}
const config=new URL("assets/config.js",target);
const r=spawnSync(process.execPath,[fileURLToPath(new URL("tools/write-firebase-config.mjs",root))],{
 cwd:fileURLToPath(root),env:{...process.env,FIREBASE_CONFIG_OUTPUT:fileURLToPath(config)},stdio:"inherit"
});
if(r.status!==0)process.exit(r.status||1);
const enabled=process.env.ENABLE_DISPATCHER_UI==="true";
// The current public Pages remains locked. Only the intentionally built
// Firebase prototype can activate its UI once the real secured API is deployed.
await writeFile(new URL("dispatcher/config.js",target),
 '// Generated for Firebase Hosting. Backend authorization is still mandatory.\n'+
 'export const dispatcherConfig=Object.freeze({enabled:'+JSON.stringify(enabled)+
 ',sessionApi:"/api/dispatcher/session"});\n');
const html=await readFile(new URL("dispatcher/index.html",target),"utf8");
if(!html.includes('id="staff-login"')||!html.includes('id="inventory-panel"'))
 throw Error("Dispatcher prototype source is incomplete.");
console.log("Firebase prototype staged. Dispatcher Google UI enabled: "+enabled+
 ". API and data remain independently protected.");

const operationsEnabled=process.env.ENABLE_OPERATIONS_UI==="true";
const policyVersion=process.env.DISPATCH_DRIVER_POLICY_VERSION||"";
if(operationsEnabled&&(!policyVersion||policyVersion.toLowerCase().includes("draft")))
 throw Error("An approved driver policy version is required for an operations build.");
await writeFile(new URL("workspaces/config.js",target),
 "export const operationsConfig=Object.freeze("+JSON.stringify({enabled:operationsEnabled,policyVersion:operationsEnabled?policyVersion:""})+");\n");
if(process.env.ENABLE_CUSTOMER_UI==="true"){
 const customerPolicy=process.env.DELIVERY_POLICY_VERSION||"";
 if(process.env.DISPATCH_POLICIES_APPROVED!=="true"||!customerPolicy||customerPolicy.toLowerCase().includes("draft"))
  throw Error("Customer activation requires approved policies.");
 await writeFile(new URL("deliveries/config.js",target),
  "export const deliveryConfig=Object.freeze("+JSON.stringify({enabled:true,policiesApproved:true,apiBase:"/api/deliveries",policyVersion:customerPolicy})+");\n");
}

const applicantEnabled=process.env.ENABLE_APPLICANT_UI==="true";
if(applicantEnabled&&(
 process.env.DISPATCH_POLICIES_APPROVED!=="true"||
 !policyVersion||policyVersion.toLowerCase().includes("draft")))
 throw Error("Applicant signup requires a reviewed, versioned driver policy.");
await writeFile(new URL("driver/apply-config.js",target),
 "// Generated applicant-only staging gate. A server-side Google identity check remains mandatory.\n"+
 "export const applicantConfig=Object.freeze("+JSON.stringify({
  enabled:applicantEnabled,policyVersion:applicantEnabled?policyVersion:""
 })+");\n");
console.log("Applicant intake UI enabled: "+applicantEnabled+". Courier operations remain independently gated.");
