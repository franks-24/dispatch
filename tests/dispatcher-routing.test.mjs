import {test} from "node:test";
import assert from "node:assert/strict";
import {isVerifiedDispatcher} from "../dispatcher/route.js";
const user={getIdToken:async()=> "verified-firebase-token"};
const args={user,enabled:true,endpoint:"/api/dispatcher/session",origin:"https://dispatch.franks24.com"};
const response=(status,body,contentType="application/json")=>new Response(JSON.stringify(body),{status,headers:{"content-type":contentType}});
test("internal group member is routed only after authoritative server role response",async()=>{
 let seen;
 const result=await isVerifiedDispatcher({...args,fetcher:async(url,options)=>{seen={url,options};return response(200,{role:"dispatcher",workspace:"dispatcher"});}});
 assert.equal(result,true);
 assert.equal(seen.url,"https://dispatch.franks24.com/api/dispatcher/session");
 assert.equal(seen.options.redirect,"error");
 assert.equal(seen.options.headers.Authorization,"Bearer verified-firebase-token");
});
test("external / ungrouped accounts are not sent to Dispatcher",async()=>{
 assert.equal(await isVerifiedDispatcher({...args,fetcher:async()=>response(403,{error:"denied"})}),false);
 assert.equal(await isVerifiedDispatcher({...args,enabled:false,fetcher:async()=>{throw Error("should not be called");}}),false);
});
test("unavailable or malformed directory role responses do not become authorized",async()=>{
 for(const r of [response(503,{error:"unavailable"}),response(200,{role:"customer",workspace:"customer"}),response(200,{role:"dispatcher",workspace:"dispatcher"},"text/html")])
  await assert.rejects(isVerifiedDispatcher({...args,fetcher:async()=>r}));
});
test("never send tokens to a cross-origin or ambiguous API URL",async()=>{
 for(const endpoint of ["https://evil.example/api/dispatcher/session","//evil.example/api/dispatcher/session","/api/dispatcher/session?redirect=evil","/api/dispatcher/session#fragment","/api/../admin"])
  await assert.rejects(isVerifiedDispatcher({...args,endpoint,fetcher:async()=>{throw Error("unexpected network");}}));
});
