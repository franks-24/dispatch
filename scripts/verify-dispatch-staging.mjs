// Read-only Firebase Hosting acceptance probe. Never point this at GitHub Pages
// or at the production custom domain while a Safe Browsing incident is open.
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

export function validateStagingOrigin(value) {
 assert.ok(typeof value==="string"&&value.trim(),"DISPATCH_STAGING_ORIGIN is required.");
 const url=new URL(value);
 assert.equal(url.protocol,"https:","Staging must use HTTPS.");
 assert.equal(url.username,"");assert.equal(url.password,"");
 assert.equal(url.pathname,"/","Use the exact staging origin with no path.");
 assert.equal(url.search,"");assert.equal(url.hash,"");
 assert.equal(url.port,"","Non-standard ports are not supported.");
 assert.notEqual(url.hostname,"dispatch.franks24.com","Never run staging acceptance against the public custom domain.");
 assert.ok(url.hostname.endsWith(".web.app")||url.hostname.endsWith(".firebaseapp.com"),
  "Use the dedicated Firebase Hosting staging URL, never an arbitrary host.");
 return url.origin;
}

const endpoints=[
 "/api/dispatcher/session",
 "/api/operations/session",
 "/api/driver/session",
 "/api/deliveries/shipments?limit=1"
];
async function probe(fetcher,url,token){
 const response=await fetcher(url,{
  method:"GET",cache:"no-store",redirect:"manual",
  headers:{Accept:"application/json",...(token?{Authorization:"Bearer "+token}:{})},
  signal:AbortSignal.timeout(15000)
 });
 const type=response.headers.get("content-type")||"";
 assert.ok(type.toLowerCase().startsWith("application/json"),
  url+" must return JSON, not a static Hosting fallback.");
 assert.match(response.headers.get("cache-control")||"",/no-store/i,
  url+" must not cache private API responses.");
 return {status:response.status,body:await response.json()};
}
export async function checkStaging({origin,fetcher=fetch,approvedDispatcherToken,deniedDispatcherToken,approvedHost}){
 const base=validateStagingOrigin(origin);
 const response=await fetcher(base+"/",{
  method:"GET",cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(15000)
 });
 assert.equal(response.status,200,"Staging homepage must serve successfully.");
 assert.match(response.headers.get("content-type")||"",/text\/html/i);
 assert.match(await response.text(),/Franks24/i,"Expected Franks24 staging artifact.");
 const denies=[];
 for(const endpoint of endpoints){
  const result=await probe(fetcher,base+endpoint);
  assert.ok([401,403].includes(result.status),
   endpoint+" must deny unauthenticated access, got "+result.status);
  denies.push({endpoint,status:result.status});
 }
 let identity="not-run";
 if(approvedDispatcherToken||deniedDispatcherToken){
  // Never send a real ID token to an arbitrary Firebase Hosting tenant.
  assert.ok(approvedHost&&new URL(base).hostname===approvedHost,
   "Exact approved staging hostname is required before any bearer token is sent.");
  assert.ok(approvedDispatcherToken&&deniedDispatcherToken,
   "Both approved and unauthorized test identities are required.");
  const approved=await probe(fetcher,base+"/api/dispatcher/session",approvedDispatcherToken);
  assert.equal(approved.status,200,"Approved test staff must authenticate.");
  assert.equal(approved.body.role,"dispatcher");
  assert.equal(approved.body.workspace,"dispatcher");
  const denied=await probe(fetcher,base+"/api/dispatcher/session",deniedDispatcherToken);
  assert.equal(denied.status,403,"Unauthorized identity must be rejected.");
  identity="approved-and-denied-verified";
 }
 return {stagingOrigin:base,anonymousAccess:"denied",identity,checks:denies};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const origin=process.env.DISPATCH_STAGING_ORIGIN;
 const approved=process.env.DISPATCH_STAGING_APPROVED_DISPATCHER_ID_TOKEN;
 const denied=process.env.DISPATCH_STAGING_UNAUTHORIZED_ID_TOKEN;
 if((approved||denied)&&process.env.DISPATCH_STAGING_REAL_IDENTITY_ACCEPTANCE!=="true")
  throw Error("Identity probes require explicit DISPATCH_STAGING_REAL_IDENTITY_ACCEPTANCE=true after security-owner approval.");
 checkStaging({origin,approvedDispatcherToken:approved,deniedDispatcherToken:denied,
  approvedHost:process.env.DISPATCH_STAGING_APPROVED_HOST}).then(
  report=>console.log(JSON.stringify({result:"pass",...report},null,2)),
  error=>{console.error("Staging acceptance FAILED: "+error.message);process.exitCode=1;}
 );
}
