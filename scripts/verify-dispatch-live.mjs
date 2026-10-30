import assert from "node:assert/strict";
import {lookup,resolveCname} from "node:dns/promises";
import tls from "node:tls";
import {writeFile,readFile} from "node:fs/promises";
const host="dispatch.franks24.com",origin="https://"+host;
const report={checkedAt:new Date().toISOString(),origin};
report.addresses=await lookup(host,{all:true});
report.cname=await resolveCname(host).catch(()=>[]);
report.tls=await new Promise((resolve,reject)=>{const socket=tls.connect({host,port:443,servername:host,rejectUnauthorized:true},()=>{const certificate=socket.getPeerCertificate();resolve({authorized:socket.authorized,subject:certificate.subject.CN,issuer:certificate.issuer.CN,validTo:certificate.valid_to});socket.end()});socket.setTimeout(15000,()=>socket.destroy(new Error("TLS timeout")));socket.on("error",reject)});
const response=await fetch(origin+"/",{signal:AbortSignal.timeout(20000)});
assert.equal(response.status,200,"Custom domain must return HTTP 200");
assert.equal(new URL(response.url).protocol,"https:","Final site must use HTTPS");
const html=await response.text();assert.match(html,/data-login/);
report.httpStatus=response.status;
report.assets=[];
for(const path of [...new Set([...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map(match=>match[1]))]){
 const result=await fetch(origin+"/"+path,{signal:AbortSignal.timeout(15000)});assert.equal(result.status,200,path+" unavailable");report.assets.push({path,status:result.status});
}
function parseConfig(source){
 const value=source.match(/export const firebaseConfig\s*=\s*(\{[\s\S]*?\});?\s*$/);
 if(!value)return null;try{return JSON.parse(value[1])}catch{return null}
}
async function readLiveConfig(){return parseConfig(await (await fetch(origin+"/assets/config.js?verify="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(15000)})).text())}
let liveConfig=await readLiveConfig();
const expectedConfig=JSON.parse(await readFile("assets/firebase-config.public.json","utf8"));
report.firebaseConfigured=!!liveConfig?.apiKey;
if(process.env.VERIFY_PUBLISHED_SOURCE==="true"){
 const expected=await readFile("assets/app.js","utf8");let matched=false;
 for(let attempt=0;attempt<12;attempt++){
  const remote=await (await fetch(origin+"/assets/app.js?verify="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(15000)})).text();
  liveConfig=await readLiveConfig();
  if(remote===expected&&liveConfig?.appId===expectedConfig.appId&&liveConfig?.apiKey===expectedConfig.apiKey){matched=true;break}
  await new Promise(resolve=>setTimeout(resolve,10000))
 }
 assert.ok(matched,"Published identity source and public Firebase settings have not reached the custom domain");
 report.publishedSourceMatches=true;report.firebaseConfigured=true;
}
// This is the same read-only project lookup used by the Firebase Web SDK to validate origins.
const authResponse=await fetch("https://identitytoolkit.googleapis.com/v1/projects?key="+encodeURIComponent(expectedConfig.apiKey),{signal:AbortSignal.timeout(15000)});
report.firebaseAuthHttpStatus=authResponse.status;
if(authResponse.ok){
 const project=await authResponse.json();
 report.firebaseProjectNumber=project.projectId;
 report.authorizedDomains=project.authorizedDomains||[];
 report.customDomainAuthorized=report.authorizedDomains.includes(host);
}else report.customDomainAuthorized=false;
await writeFile("dispatch-live-verification.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(process.argv.includes("--require-config"))assert.ok(report.firebaseConfigured,"Firebase web settings are still missing; live Google SSO is not activated");
if(process.argv.includes("--require-auth"))assert.ok(report.firebaseConfigured&&report.customDomainAuthorized,"The live Firebase configuration and custom auth domain must both be enabled before Google SSO acceptance");
