import {test} from "node:test";
import assert from "node:assert/strict";
import {validateStagingOrigin,checkStaging} from "../scripts/verify-dispatch-staging.mjs";

const origin="https://franks24-acceptance.web.app";
const response=(body,status=200,type="application/json",cache="private, no-store")=>
 new Response(typeof body==="string"?body:JSON.stringify(body),{
  status,headers:{"content-type":type,"cache-control":cache}
 });
const fakeFetch=(overrides={})=>async (url,options)=>{
 assert.equal(options.redirect,"manual");
 if(url===origin+"/")return response("<html><h1>Franks24</h1></html>",200,"text/html");
 const path=new URL(url).pathname;
 if(path==="/api/dispatcher/session"&&options.headers.Authorization){
  return options.headers.Authorization==="Bearer approved"
    ? response({role:"dispatcher",workspace:"dispatcher"},200)
    : response({error:"Forbidden"},403);
 }
 return overrides[path]||response({error:"Unauthenticated"},401);
};
test("staging URL cannot target public Dispatch, arbitrary sites or non-TLS pages",()=>{
 for(const value of [
  "https://dispatch.franks24.com",
  "https://franks-24.github.io/dispatch/",
  "http://franks24-acceptance.web.app",
  "https://example.com",
  "https://user:password@franks24-acceptance.web.app"
 ])assert.throws(()=>validateStagingOrigin(value));
 assert.equal(validateStagingOrigin(origin),origin);
});
test("a dedicated Firebase staging site denies anonymous API access without HTML fallback",async()=>{
 const report=await checkStaging({origin,fetcher:fakeFetch()});
 assert.equal(report.anonymousAccess,"denied");
 assert.equal(report.identity,"not-run");
 assert.equal(report.checks.length,4);
});
test("GitHub Pages 404 HTML fallback must fail staging acceptance",async()=>{
 await assert.rejects(checkStaging({origin,fetcher:fakeFetch({
  "/api/dispatcher/session":response("<h1>404</h1>",404,"text/html")
 })}),/must return JSON/);
});
test("a deployed backend that returns 503 rather than enforcing a session is not accepted",async()=>{
 await assert.rejects(checkStaging({origin,fetcher:fakeFetch({
  "/api/operations/session":response({error:"Not activated"},503)
 })}),/must deny unauthenticated access/);
});
test("approved and unauthorized identities must pass independent role checks",async()=>{
 const report=await checkStaging({origin,fetcher:fakeFetch(),
  approvedDispatcherToken:"approved",deniedDispatcherToken:"unauthorized",approvedHost:"franks24-acceptance.web.app"});
 assert.equal(report.identity,"approved-and-denied-verified");
});
test("a staged backend that authorizes an unauthorized account fails acceptance",async()=>{
 const permissive=async (url,options)=>{
  if(url.includes("/api/dispatcher/session")&&options.headers.Authorization)
   return response({role:"dispatcher",workspace:"dispatcher"},200);
  return fakeFetch()(url,options);
 };
 await assert.rejects(checkStaging({origin,fetcher:permissive,
  approvedDispatcherToken:"approved",deniedDispatcherToken:"unauthorized",approvedHost:"franks24-acceptance.web.app"}),/Unauthorized identity must be rejected/);
});
