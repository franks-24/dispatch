import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
const source=(await readFile(new URL("../workspaces/app.js",import.meta.url),"utf8")).replace(/^import .*;$/gm,"").replace(/\nstart\(\);\s*$/,"");
function browser(fetch){
 const elements=new Map(),element=id=>{
  if(!elements.has(id))elements.set(id,{hidden:false,textContent:"",cleared:0,addEventListener(){},replaceChildren(){this.cleared++;}});
  return elements.get(id);
 };
 const context={document:{body:{dataset:{workspace:"driver"}},getElementById:element},
  window:{addEventListener(){}},navigator:{geolocation:{clearWatch(){}}},
  location:{origin:"https://test.invalid"},URL,AbortController,crypto:{randomUUID:()=>"test-key"},setInterval(){},fetch,Intl};
 vm.runInNewContext(source+"\nglobalThis.client={request,lock,identity(value){user=value;}};",context);
 return {client:context.client,element};
}
test("workspace refuses unsigned-in and cross-origin requests before sending a token",async()=>{
 let calls=0;const f=browser(async()=>{calls++;throw Error("network");});
 await assert.rejects(f.client.request("/api/driver/jobs"),/Sign in/);
 f.client.identity({getIdToken:async()=>"private-token"});
 await assert.rejects(f.client.request("https://other.invalid/api/driver/jobs"),/Invalid workspace/);
 assert.equal(calls,0);
});
test("signout aborts old requests and discards a late private response",async()=>{
 let release;const f=browser(()=>new Promise(resolve=>{release=resolve;}));
 f.client.identity({getIdToken:async()=>"private-token"});
 const pending=f.client.request("/api/driver/jobs");await new Promise(resolve=>setImmediate(resolve));f.client.lock();
 release(new Response(JSON.stringify({items:[{private:"customer-address"}]}),{headers:{"content-type":"application/json"}}));
 await assert.rejects(pending,/Session changed/);assert.equal(f.element("workspace").hidden,true);assert.ok(f.element("content").cleared);
});
test("revoked access clears the workspace and shows an actionable failure",async()=>{
 const f=browser(async()=>new Response(JSON.stringify({error:"Driver access suspended."}),{status:403,headers:{"content-type":"application/json"}}));
 f.client.identity({getIdToken:async()=>"private-token"});
 await assert.rejects(f.client.request("/api/driver/session"),/suspended/);
 assert.equal(f.element("workspace").hidden,true);assert.equal(f.element("status").textContent,"Driver access suspended.");
});
