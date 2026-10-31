import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyPagesPublisher} from "../tools/verify-pages-publisher.mjs";
const options={token:"test-only-token",repository:"franks-24/dispatch"};
test("Pages publisher verification rejects legacy or unreadable settings before deploy",async()=>{
 for(const build_type of ["legacy",undefined])await assert.rejects(verifyPagesPublisher({...options,fetcher:async()=>new Response(JSON.stringify({build_type}),{status:200})}),/Source to GitHub Actions/);
 await assert.rejects(verifyPagesPublisher({...options,fetcher:async()=>new Response("denied",{status:403})}),/Cannot verify/);
});
test("Pages publisher verification accepts workflow and never follows a redirect",async()=>{
 let request;const result=await verifyPagesPublisher({...options,fetcher:async(url,init)=>{request={url,init};return new Response(JSON.stringify({build_type:"workflow"}),{status:200});}});
 assert.equal(result.buildType,"workflow");assert.equal(request.init.redirect,"error");
 assert.equal(request.url,"https://api.github.com/repos/franks-24/dispatch/pages");
});

