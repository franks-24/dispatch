import {test} from "node:test";
import assert from "node:assert/strict";
import {createInventoryService} from "../inventory-service.js";
import {DispatcherAccessError} from "../dispatcher-auth.js";

function fixture({allowed=true}={}){
 const rows=new Map(),events=[];
 const store={
  create:async(item,actor)=>{if(rows.has(item.tracking))throw Error("duplicate");rows.set(item.tracking,item);events.push({action:"create",actor});},
  list:async()=>[...rows.values()].map(({createdBy,photo,...row})=>row),
  get:async id=>rows.get(id)||null,
  advance:async(id,status,steps,actor,at)=>{
   const item=rows.get(id);
   if(!item)throw new DispatcherAccessError(404,"Item not found.");
   if(steps[item.status]!==status)throw new DispatcherAccessError(409,"Invalid status change.");
   const next={...item,status,updatedAt:at};rows.set(id,next);
   events.push({action:"advance",status,actor});return next;
  },
  attachPhoto:async(id,photo,actor)=>{
   const item=rows.get(id);rows.set(id,{...item,photo,photoAvailable:true});events.push({action:"photo",actor});
  }
 };
 let checks=0;
 const authorizer={authorize:async()=>{checks++;if(!allowed)throw new DispatcherAccessError(403,"Not staff");return {uid:"staff-1"};}};
 const tracking="F24-20261031-123456ABCDEF00";
 const service=createInventoryService({authorizer,store,enabled:true,
  newTracking:()=>tracking,clock:()=>new Date("2026-10-31T03:00:00Z"),
  savePhoto:async()=>({path:"inventory/"+tracking+"/test",generation:"1",mime:"image/jpeg"}),
  readPhoto:async()=>({bytes:Buffer.from([0xff,0xd8,0xff,0xd9]),mime:"image/jpeg"})
 });
 const request=(method,path,body,auth=true)=>service.handle({method,path,body,headers:auth?{authorization:"Bearer test"}:{}});
 return {service,request,tracking,checks:()=>checks,rows,events};
}
test("inventory remains disabled by default even with a valid mock authorizer",async()=>{
 const r=await createInventoryService({authorizer:{authorize:async()=>({uid:"staff"})},store:{}}).handle({
  method:"GET",path:"/api/dispatcher/items",headers:{authorization:"Bearer token"}});
 assert.equal(r.status,503);
});
test("staff registration generates unique tracking reference separate from SKU",async()=>{
 const f=fixture();
 const r=await f.request("POST","/api/dispatcher/items",{name:"Valve",sku:"VA-11",barcode:"0123456789",quantity:2,notes:"packed"});
 assert.equal(r.status,201);
 assert.equal(r.body.item.tracking,f.tracking);
 assert.equal(r.body.item.sku,"VA-11");
 assert.equal(r.body.item.status,"registered");
 assert.equal((await f.request("GET","/api/dispatcher/items")).body.items.length,1);
 assert.equal(f.checks(),2);
});
test("the client cannot override staff or tracking IDs",async()=>{
 const f=fixture();
 for(const body of [{name:"Item",quantity:1,createdBy:"other"},{name:"Item",quantity:0},{name:"Item",quantity:1,tracking:"F24-fake"}])
  assert.equal((await f.request("POST","/api/dispatcher/items",body)).status,400);
 assert.equal(f.rows.size,0);
});
test("denied and missing Google sessions cannot read inventory",async()=>{
 const f=fixture({allowed:false});
 assert.equal((await f.request("GET","/api/dispatcher/items")).status,403);
 assert.equal((await f.request("GET","/api/dispatcher/items",null,false)).status,401);
});
test("item transitions are sequential and dispatched status requires an explicit action",async()=>{
 const f=fixture();
 await f.request("POST","/api/dispatcher/items",{name:"Motor",quantity:1});
 const p="/api/dispatcher/items/"+f.tracking+"/status";
 assert.equal((await f.request("POST",p,{status:"dispatched"})).status,409);
 assert.equal((await f.request("POST",p,{status:"packed"})).status,200);
 assert.equal((await f.request("POST",p,{status:"dispatched"})).status,200);
 assert.equal((await f.request("POST",p,{status:"delivered"})).status,200);
 assert.equal((await f.request("POST",p,{status:"packed"})).status,409);
 assert.equal(f.events.filter(e=>e.action==="advance").length,3);
});
test("only matching-size supported image signatures are accepted",async()=>{
 const f=fixture();
 await f.request("POST","/api/dispatcher/items",{name:"Motor",quantity:1});
 const path="/api/dispatcher/items/"+f.tracking+"/photo";
 const wrong=Buffer.from("not an image").toString("base64");
 assert.equal((await f.request("POST",path,{mime:"image/jpeg",base64:wrong})).status,400);
 const valid=Buffer.from([0xff,0xd8,0xff,0xd9]).toString("base64");
 assert.equal((await f.request("POST",path,{mime:"image/jpeg",base64:valid})).status,200);
 assert.equal((await f.request("POST",path,{mime:"image/jpeg",base64:valid})).status,409);
 const picture=await f.request("GET",path);
 assert.equal(picture.status,200);assert.ok(Buffer.isBuffer(picture.body));
});
