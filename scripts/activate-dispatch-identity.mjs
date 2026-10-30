// Run from an authenticated Google Cloud Shell. Credentials stay in memory.
import {execFileSync} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
export async function activateIdentity({token,rules,fetcher=fetch}){
 const project="dispatch-1491f",domain="dispatch.franks24.com";
 if(!token)throw new Error("Authenticate to the Dispatch project in Google Cloud Shell first.");
 async function call(url,method="GET",body,allow404=false){
  const response=await fetcher(url,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","X-Goog-User-Project":project},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  if(allow404&&response.status===404)return null;
  if(!response.ok)throw new Error("Firebase setup request failed (HTTP "+response.status+"). Check the signed-in account's permission for the Dispatch project.");
  return response.json();
 }
 const identity="https://identitytoolkit.googleapis.com/admin/v2/projects/"+project;
 const management="https://firebase.googleapis.com/v1beta1/projects/"+project;
 // Resolve required existing resources before changing provider, domains or rules.
 const [authConfig,provider,database,apps]=await Promise.all([
  call(identity+"/config"),call(identity+"/defaultSupportedIdpConfigs/google.com","GET",undefined,true),
  call("https://firestore.googleapis.com/v1/projects/"+project+"/databases/(default)"),
  call(management+"/webApps")
 ]);
 if(!provider?.clientId)throw new Error("Enable Google once in Firebase Authentication → Sign-in method and select the project's support email, then rerun. No OAuth client is created by this script.");
 const edition=database.databaseEdition;
 if(edition!=="STANDARD"||database.type!=="FIRESTORE_NATIVE")throw new Error("The existing default database must be explicitly verified as Standard/native before these rules are published.");
 const appId=process.env.FIREBASE_WEB_APP_ID;
 const candidates=appId?(apps.apps||[]).filter(app=>app.appId===appId):(apps.apps||[]).filter(app=>/dispatch/i.test(app.displayName||""));
 const selected=candidates.length===1?candidates[0]:(!appId&&apps.apps?.length===1?apps.apps[0]:null);
 if(!selected)throw new Error("Register/select the Dispatch Web app in Firebase Project settings. If several apps exist, set FIREBASE_WEB_APP_ID to its public app ID, then rerun.");
 const config=await call(management+"/webApps/"+encodeURIComponent(selected.appId)+"/config");
 if(config.projectId!==project||!config.apiKey||!config.appId||config.authDomain!==project+".firebaseapp.com")throw new Error("Unexpected public web settings. Verify the selected app and Firebase auth domain.");
 if(!rules.includes("function hasCurrentAgreement()")||!rules.includes("versions/2026-10-30-v1"))throw new Error("Reviewed Dispatch policy rules were not found. Use the tested repository checkout.");
 if(!provider.enabled)await call(identity+"/defaultSupportedIdpConfigs/google.com?updateMask=enabled","PATCH",{enabled:true});
 const domains=[...new Set([...(authConfig.authorizedDomains||[]),domain])].sort();
 if(!authConfig.authorizedDomains?.includes(domain))await call(identity+"/config?updateMask=authorizedDomains","PATCH",{authorizedDomains:domains});
 const rulesRoot="https://firebaserules.googleapis.com/v1/projects/"+project;
 const ruleset=await call(rulesRoot+"/rulesets","POST",{source:{files:[{name:"firestore.rules",content:rules}]}});
 if(!ruleset.name?.startsWith("projects/"+project+"/rulesets/"))throw new Error("Rules compilation did not return a ruleset. No release was published.");
 const releaseName="projects/"+project+"/releases/cloud.firestore";
 const release=await call(rulesRoot+"/releases/cloud.firestore","GET",undefined,true);
 if(release)await call(rulesRoot+"/releases/cloud.firestore","PATCH",{release:{name:releaseName,rulesetName:ruleset.name},updateMask:"rulesetName"});
 else await call(rulesRoot+"/releases","POST",{name:releaseName,rulesetName:ruleset.name});
 const [confirmedProvider,confirmedConfig,confirmedRelease]=await Promise.all([
  call(identity+"/defaultSupportedIdpConfigs/google.com"),call(identity+"/config"),call(rulesRoot+"/releases/cloud.firestore")
 ]);
 if(!confirmedProvider.enabled||!confirmedConfig.authorizedDomains?.includes(domain)||confirmedRelease.rulesetName!==ruleset.name)throw new Error("A post-setup check failed. Review the project before publishing the frontend.");
 const publicConfig=Object.fromEntries(["apiKey","authDomain","projectId","appId","messagingSenderId","storageBucket","measurementId"].filter(key=>config[key]!==undefined).map(key=>[key,config[key]]));
 return {publicConfig,report:{projectId:project,domain,googleEnabled:true,domainAuthorized:true,databaseEdition:edition,rulesPublished:true}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const token=process.env.GOOGLE_OAUTH_ACCESS_TOKEN||execFileSync("gcloud",["auth","print-access-token"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
  const result=await activateIdentity({token,rules:await readFile("firestore.rules","utf8")});
  await writeFile("assets/firebase-config.public.json",JSON.stringify(result.publicConfig,null,2)+"\n");
  console.log(JSON.stringify(result.report,null,2));
  console.log("Publish assets/firebase-config.public.json, or copy its public JSON into the GitHub Actions variable FIREBASE_WEB_CONFIG_JSON, then run Deploy Dispatch. Verify a real Google login and first/returning-user flow. Never share the access token.");
 }catch(error){console.error(error.message||"Firebase activation failed.");process.exitCode=1}
}
