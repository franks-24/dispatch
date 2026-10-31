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
const html=await response.text();
report.liveLandingIsCourier=html.includes('<title>Franks24 | Dispatch and Delivery Tracking</title>');
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
// The Pages workflow embeds the exact commit into its uploaded artifact.
// Wait for the revision on the custom domain instead of comparing raw HTML
// bytes, which can differ under CDN processing and independent workflow timing.
if(process.env.VERIFY_PUBLISHED_SOURCE==="true"){
 const expectedRevision=process.env.GITHUB_SHA;
 assert.match(expectedRevision||"",/^[a-f0-9]{40}$/,"GitHub revision is required for production source checks.");
 let matched=false,latest=null;
 for(let attempt=0;attempt<36;attempt++){
  const query="?verify="+Date.now()+"-"+attempt;
  try{
   const [releaseResponse,pageResponse]=await Promise.all([
    fetch(origin+"/dispatch-release.json"+query,{cache:"no-store",signal:AbortSignal.timeout(15000)}),
    fetch(origin+"/"+query,{cache:"no-store",signal:AbortSignal.timeout(15000)})
   ]);
   const release=releaseResponse.ok ? await releaseResponse.json() : null;
   const liveHtml=pageResponse.ok ? await pageResponse.text() : "";
   liveConfig=await readLiveConfig();
   latest=release?.revision||null;
   if(release?.schemaVersion===1 && release?.product==="franks24-dispatch" &&
       release.revision===expectedRevision && pageResponse.ok &&
       liveHtml.includes('<title>Franks24 | Dispatch and Delivery Tracking</title>') &&
       liveConfig?.appId===expectedConfig.appId &&
       liveConfig?.apiKey===expectedConfig.apiKey){
    matched=true;break;
   }
  }catch{ /* Publishing or CDN propagation may still be in progress. */ }
  if(attempt<35)await new Promise(resolve=>setTimeout(resolve,7000));
 }
 report.publishedRevision=latest;
 report.expectedRevision=expectedRevision;
 report.publishedSourceMatches=matched;
 report.firebaseConfigured=!!liveConfig?.apiKey;
 await writeFile("dispatch-live-verification.json",JSON.stringify(report,null,2)+"\n");
 assert.ok(matched,"Expected release revision and Firebase web config have not reached the custom domain.");
 report.liveLandingIsCourier=true;
 // A release marker by itself does not prove the client script preserved the
 // disabled incident CTA; verify both HTML and the published JavaScript.
 const stamp="?verify="+Date.now();
 const [staffHtmlReply,staffJsReply]=await Promise.all([
  fetch(origin+"/dispatcher/"+stamp,{cache:"no-store",signal:AbortSignal.timeout(15000)}),
  fetch(origin+"/dispatcher/app.js"+stamp,{cache:"no-store",signal:AbortSignal.timeout(15000)})
 ]);
 const staffHtml=staffHtmlReply.ok?await staffHtmlReply.text():"";
 const staffJs=staffJsReply.ok?await staffJsReply.text():"";
 report.publishedDispatcherSecurityGate=staffHtml.includes("Access paused — security review") &&
   staffJs.includes('login.textContent=dispatcherConfig.enabled ? "Continue with Google ↗" : "Access paused — security review"');
 await writeFile("dispatch-live-verification.json",JSON.stringify(report,null,2)+"\n");
 assert.ok(report.publishedDispatcherSecurityGate,"Published dispatcher UI or JavaScript lost the closed security-review message.");
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
