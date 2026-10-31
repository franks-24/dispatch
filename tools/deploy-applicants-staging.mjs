// Run in an authenticated Google Cloud Shell checkout. No DNS changes and no
// operational, delivery, dispatcher or payment function is deployed here.
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url)),env=process.env;
function run(command,args,customEnv=env,{capture=false}={}){
 const result=spawnSync(command,args,{cwd:root,env:customEnv,encoding:"utf8",
  stdio:capture?["ignore","pipe","pipe"]:"inherit",timeout:240000});
 if(result.status!==0)throw Error("Command failed: "+command+" "+args.slice(0,3).join(" ")+". Check authenticated Cloud Shell.");
 return capture?result.stdout:"";
}
run(process.execPath,["--test","delivery-functions/tests/operations.test.mjs"]);
if(!process.argv.includes("--deploy")){
 run(process.execPath,["tools/build-firebase-dispatcher.mjs"],{
  ...env,ENABLE_APPLICANT_UI:"false",ENABLE_DISPATCHER_UI:"false",ENABLE_OPERATIONS_UI:"false",ENABLE_CUSTOMER_UI:"false"
 });
 console.log("Closed applicant build checked. No cloud or operational access changed.");
 process.exit(0);
}
if(process.platform==="win32")throw Error("Deploy from authenticated Linux Google Cloud Shell.");
for(const name of ["DELIVERY_DATABASE_ID","DISPATCH_DRIVER_POLICY_VERSION","DISPATCH_STAGING_SITE"]){
 if(!env[name]||/[\r\n]/.test(env[name]))throw Error("Set "+name+" in trusted Cloud Shell.");
}
if(env.DELIVERY_DATABASE_EDITION!=="STANDARD"||env.DISPATCH_POLICIES_APPROVED!=="true"||
 env.DISPATCH_DRIVER_POLICY_VERSION.toLowerCase().includes("draft"))
 throw Error("Standard native Firestore and legal approval of the actual driver policy are required.");
if(!/^[a-z0-9-]{6,63}$/.test(env.DISPATCH_STAGING_SITE))throw Error("Invalid staging site.");
// This script deliberately cannot change shared function environment or create credentials.
// The operator must review and provide existing .env.dispatch-1491f separately.
const envText=await readFile(new URL("../delivery-functions/.env.dispatch-1491f",import.meta.url),"utf8");
for(const [key,expected] of [
 ["DELIVERY_DATABASE_ID",env.DELIVERY_DATABASE_ID],
 ["DELIVERY_DATABASE_EDITION","STANDARD"],
 ["DISPATCH_DRIVER_POLICY_VERSION",env.DISPATCH_DRIVER_POLICY_VERSION],
 ["DISPATCH_APPLICANTS_ENABLED","true"],
 ["DISPATCH_POLICIES_APPROVED","true"]
]){
 const match=envText.match(new RegExp("^"+key+"=(.+)$","m"));
 let value;
 try{value=JSON.parse(match?.[1]||"null");}catch{value=match?.[1]?.trim();}
 if(String(value)!==expected)throw Error("Review the private function environment for "+key+".");
}
const firebase=(args,opts)=>run("npx",["-y","firebase-tools@latest",...args,"--project","dispatch-1491f"],env,opts);
firebase(["projects:list","--json"],{capture:true});
const metadata=JSON.parse(firebase(["firestore:databases:get",env.DELIVERY_DATABASE_ID,"--json"],{capture:true}));
const database=metadata.result||metadata;
if(database.databaseEdition!=="STANDARD"||database.type!=="FIRESTORE_NATIVE")
 throw Error("Selected Firestore database is not verified Standard/native.");
const isolatedEnv={...env,ENABLE_APPLICANT_UI:"true",ENABLE_DISPATCHER_UI:"false",ENABLE_OPERATIONS_UI:"false",ENABLE_CUSTOMER_UI:"false"};
run(process.execPath,["tools/build-firebase-dispatcher.mjs"],isolatedEnv);
firebase(["target:apply","hosting","dispatcher-prototype",env.DISPATCH_STAGING_SITE]);
firebase(["deploy","--config","firebase.dispatcher.json","--only","functions:franks24-deliveries:driverApplicationsApi"]);
firebase(["hosting:channel:deploy","driver-applicant-acceptance","--expires","7d",
 "--only","dispatcher-prototype","--config","firebase.dispatcher.json"]);
console.log("Applicant-only preview published. Authorize the preview hostname in Firebase Auth and verify real Google sign-in. Driver operations remain disabled.");
