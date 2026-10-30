import {test} from "node:test";
import assert from "node:assert/strict";
import {activateIdentity} from "../../scripts/activate-dispatch-identity.mjs";
const rules="function hasCurrentAgreement() {} versions/2026-10-30-v1";
function fixture({edition="STANDARD",providerEnabled=false,clientId="existing-client"}={}){
 const calls=[];let domains=["dispatch-1491f.firebaseapp.com"],enabled=providerEnabled,released=null;
 const fetcher=async(url,options)=>{
  calls.push({url,...options});
  let result;
  if(url.includes("/databases/"))result={databaseEdition:edition,type:"FIRESTORE_NATIVE"};
  else if(url.endsWith("/webApps"))result={apps:[{appId:"public-web-app",displayName:"Dispatch"}]};
  else if(url.endsWith("/config")&&url.includes("/webApps/"))result={apiKey:"public-key",authDomain:"dispatch-1491f.firebaseapp.com",projectId:"dispatch-1491f",appId:"public-web-app"};
  else if(url.includes("defaultSupportedIdpConfigs")){if(options.method==="PATCH")enabled=true;result={clientId,enabled}};
  if(result===undefined&&url.includes("identitytoolkit")&&url.includes("/config")){if(options.method==="PATCH")domains=JSON.parse(options.body).authorizedDomains;result={authorizedDomains:domains}};
  if(result===undefined&&url.endsWith("/rulesets"))result={name:"projects/dispatch-1491f/rulesets/test-rules"};
  if(result===undefined&&url.includes("/releases")){
   if(options.method==="GET"&&!released)return new Response("{}",{status:404});
   if(options.method!=="GET"){const body=JSON.parse(options.body);released=body.release||body}
   result=released;
  }
  assert.notEqual(result,undefined,url);return new Response(JSON.stringify(result),{headers:{"Content-Type":"application/json"}});
 };
 return {calls,fetcher};
}
test("activation refuses unknown database edition before performing mutations",async()=>{const f=fixture({edition:"ENTERPRISE"});await assert.rejects(activateIdentity({token:"test-token",rules,fetcher:f.fetcher}),/Standard/);assert.ok(f.calls.every(call=>call.method==="GET"))});
test("activation does not create OAuth credentials when Google provider is missing",async()=>{const f=fixture({clientId:null});await assert.rejects(activateIdentity({token:"test-token",rules,fetcher:f.fetcher}),/Enable Google/);assert.ok(f.calls.every(call=>call.method==="GET"))});
test("activation preserves existing domains, publishes compiled rules, verifies state and returns only public settings",async()=>{const f=fixture();const result=await activateIdentity({token:"test-token",rules,fetcher:f.fetcher});assert.equal(result.report.googleEnabled,true);const domainWrite=f.calls.find(call=>call.method==="PATCH"&&call.url.includes("authorizedDomains"));assert.ok(JSON.parse(domainWrite.body).authorizedDomains.includes("dispatch-1491f.firebaseapp.com"));assert.equal(result.report.rulesPublished,true);assert.equal(result.publicConfig.projectId,"dispatch-1491f");assert.equal(result.publicConfig.access_token,undefined);assert.ok(f.calls.some(call=>call.method==="POST"&&call.url.endsWith("/rulesets")));assert.equal(f.calls.filter(call=>call.method==="PATCH"&&call.url.includes("defaultSupportedIdpConfigs")).length,1)});
