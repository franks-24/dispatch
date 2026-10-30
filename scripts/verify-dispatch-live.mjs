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
const config=await (await fetch(origin+"/assets/config.js",{cache:"no-store"})).text();
report.firebaseConfigured=!/firebaseConfig\s*=\s*null/.test(config);
if(process.env.VERIFY_PUBLISHED_SOURCE==="true"){
 const expected=await readFile("assets/app.js","utf8");let matched=false;
 for(let attempt=0;attempt<12;attempt++){const remote=await (await fetch(origin+"/assets/app.js?verify="+Date.now(),{cache:"no-store"})).text();if(remote===expected){matched=true;break}await new Promise(resolve=>setTimeout(resolve,10000))}
 assert.ok(matched,"Published identity source has not reached the custom domain");report.publishedSourceMatches=true;
}
await writeFile("dispatch-live-verification.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(process.argv.includes("--require-config"))assert.ok(report.firebaseConfigured,"Firebase web settings are still missing; live Google SSO is not activated");
