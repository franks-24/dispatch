// Applicant-only output: never copy privileged operational or customer pages.
import {cp,mkdir,rm,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {dirname} from "node:path";
import {verifyDriverPolicyRelease} from "./verify-driver-policy-release.mjs";
const root=new URL("../",import.meta.url);
const target=new URL("../.firebase-applicants-public/",import.meta.url);
const enabled=process.env.ENABLE_APPLICANT_UI==="true";
const version=process.env.DISPATCH_DRIVER_POLICY_VERSION||"";
if(enabled){
 if(process.env.DISPATCH_POLICIES_APPROVED!=="true")throw Error("Human-approved policies are required.");
 await verifyDriverPolicyRelease({version});
}
await rm(target,{recursive:true,force:true});
const paths=[
 "driver/apply.html","driver/apply.js","assets/favicon.svg","assets/site-shell.css",
 "assets/site-shell.js","workspaces/styles.css","legal/delivery-terms.html",
 "legal/delivery-privacy.html","legal/delivery-data.html","deliveries/policies.html"
];
for(const path of paths){
 const destination=new URL(path,target);
 await mkdir(dirname(fileURLToPath(destination)),{recursive:true});
 await cp(new URL(path,root),destination);
}
const config=new URL("assets/config.js",target);
if(enabled){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL("tools/write-firebase-config.mjs",root))],{
  cwd:fileURLToPath(root),env:{...process.env,FIREBASE_CONFIG_OUTPUT:fileURLToPath(config)},
  encoding:"utf8",stdio:"inherit",timeout:30000
 });
 if(result.status!==0)throw Error("Validated Firebase web identity configuration is required.");
}else await cp(new URL("assets/config.js",root),config);
await writeFile(new URL("driver/apply-config.js",target),
 "// Generated only for applicant staging; client flags are not authorization.\n"+
 "export const applicantConfig=Object.freeze("+JSON.stringify({enabled,policyVersion:enabled?version:""})+");\n");
await writeFile(new URL("index.html",target),
 '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Franks24 driver application staging</title>'+
 '<main style="font:16px system-ui;max-width:38rem;margin:12vh auto;padding:1rem"><h1>Franks24 Dispatch</h1>'+
 '<p>Isolated driver applicant staging. Driver operations, staff reviews and payments are not available here.</p>'+
 '<p><a href="/driver/apply.html">Applicant sign-in and review status</a></p>'+
 '<p><a href="/deliveries/policies.html">Policy review status</a></p></main></html>\n');
await writeFile(new URL("404.html",target),
 '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Not available | Franks24</title>'+
 '<main style="font:16px system-ui;max-width:38rem;margin:12vh auto;padding:1rem"><h1>Not available in applicant staging</h1>'+
 '<p>No driver operations, staff administration, customer booking or payment access is published on this site.</p>'+
 '<a href="/driver/apply.html">Applicant status</a></main></html>\n');
console.log("Applicant-only Hosting output ready; collection enabled: "+enabled+". No operator pages copied.");
