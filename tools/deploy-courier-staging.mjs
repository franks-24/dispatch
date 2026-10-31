// Run from a trusted Google Cloud Shell checkout. Default: prepare only.
import {spawnSync} from "node:child_process";
import {writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url)),env=process.env;
const run=(command,args,{capture=false}={})=>{
 const result=spawnSync(command,args,{cwd:root,env,encoding:"utf8",stdio:capture?["ignore","pipe","pipe"]:"inherit",timeout:240000});
 if(result.status!==0)throw Error("Command failed: "+command+" "+args.slice(0,3).join(" ")+(capture?". Authenticate and inspect the command in your trusted shell.":""));
 return capture?result.stdout:"";
};
run(process.execPath,["--test","delivery-functions/tests/service.test.mjs","delivery-functions/tests/operations.test.mjs","delivery-functions/tests/dispatcher-directory.test.mjs","tests/capture-regressions.test.mjs","tests/operations-ui.test.mjs"]);
if(!process.argv.includes("--deploy")){
 run(process.execPath,["tools/build-firebase-dispatcher.mjs"]);
 console.log("Closed staging artifact prepared. No cloud resources, billing, credentials or domains changed.");
 process.exit(0);
}
if(process.platform==="win32")throw Error("Use an authenticated Linux Google Cloud Shell for --deploy.");
const names=["DELIVERY_DATABASE_ID","DELIVERY_DATABASE_EDITION","DELIVERY_POLICY_VERSION","DELIVERY_PROOF_BUCKET","DISPATCH_DATABASE_ID","DISPATCH_INVENTORY_BUCKET","DISPATCH_WORKSPACE_CUSTOMER_ID","DISPATCH_GROUP_EMAIL","DISPATCH_DELEGATED_ADMIN_EMAIL","DISPATCH_DRIVER_POLICY_VERSION","DISPATCH_REVIEWER_UIDS","DISPATCH_FINANCE_UIDS","DISPATCH_STAGING_SITE"];
for(const name of names)if(!env[name]||/[\r\n]/.test(env[name]))throw Error("Set "+name+" in your trusted shell.");
if(env.DISPATCH_POLICIES_APPROVED!=="true"||env.DELIVERY_DATABASE_EDITION!=="STANDARD"||
 [env.DELIVERY_POLICY_VERSION,env.DISPATCH_DRIVER_POLICY_VERSION].some(v=>v.toLowerCase().includes("draft")))
 throw Error("Reviewed courier/driver policies and a verified Standard database are required.");
if(new Set(env.DISPATCH_FINANCE_UIDS.split(",").map(v=>v.trim()).filter(Boolean)).size<2)
 throw Error("Configure at least two independent finance reviewers.");
if(!/^[a-z0-9-]{6,63}$/.test(env.DISPATCH_STAGING_SITE))throw Error("Invalid staging site ID.");
const firebase=(args,options)=>run("npx",["-y","firebase-tools@latest",...args,"--project","dispatch-1491f"],options);
firebase(["--version"]);
firebase(["projects:list","--json"],{capture:true});
const metadata=JSON.parse(firebase(["firestore:databases:get",env.DELIVERY_DATABASE_ID,"--json"],{capture:true}));
const database=metadata.result||metadata;
if(database.databaseEdition!=="STANDARD"||database.type!=="FIRESTORE_NATIVE")throw Error("Selected database is not verified Standard/native.");
// Keyless Directory authentication: verify the delegated signer is present.
// Its runtime caller must be explicitly granted IAM signJwt on this service
// account; deployment does not grant broad permissions or override org policy.
const directorySa="franks24-directory@dispatch-1491f.iam.gserviceaccount.com";
const found=run("gcloud",["iam","service-accounts","describe",directorySa,
 "--project=dispatch-1491f","--format=value(email)"],{capture:true}).trim();
if(found!==directorySa)throw Error("The delegated Directory signer is missing.");
const enabled=run("gcloud",["services","list","--enabled",
 "--project=dispatch-1491f","--format=value(config.name)"],{capture:true});
if(!enabled.split(/\r?\n/).includes("iamcredentials.googleapis.com"))
 throw Error("Enable iamcredentials.googleapis.com before deploying.");
const settings={...Object.fromEntries(names.filter(n=>n!=="DISPATCH_STAGING_SITE").map(n=>[n,env[n]])),
 DELIVERY_ENABLED:"true",DISPATCH_SESSION_ENABLED:"true",DISPATCH_INVENTORY_ENABLED:"true",DISPATCH_OPERATIONS_ENABLED:"true",
 DISPATCH_APPLICANTS_ENABLED:"true",DISPATCH_POLICIES_APPROVED:"true",
 DISPATCH_AI_ENABLED:"false",DISPATCH_WHATSAPP_ENABLED:"false"};
await writeFile(new URL("../delivery-functions/.env.dispatch-1491f",import.meta.url),Object.entries(settings).map(([k,v])=>k+"="+JSON.stringify(v)).join("\n")+"\n",{mode:0o600});
env.ENABLE_DISPATCHER_UI="true";env.ENABLE_OPERATIONS_UI="true";
env.ENABLE_CUSTOMER_UI="true";env.ENABLE_APPLICANT_UI="true";env.DISPATCH_POLICIES_APPROVED="true";
run(process.execPath,["tools/build-firebase-dispatcher.mjs"]);
firebase(["target:apply","hosting","dispatcher-prototype",env.DISPATCH_STAGING_SITE]);
firebase(["deploy","--config","firebase.dispatcher.json","--only","functions:franks24-deliveries:deliveriesApi,functions:franks24-deliveries:dispatcherApi,functions:franks24-deliveries:courierOperationsApi,functions:franks24-deliveries:driverApplicationsApi"]);
firebase(["hosting:channel:deploy","courier-acceptance","--expires","7d","--only","dispatcher-prototype","--config","firebase.dispatcher.json"]);
console.log("Preview deployed. Authorize its exact host for Google sign-in, then perform the real-account and private-storage acceptance runbook. No DNS or live Hosting channel was switched.");
