import {test} from "node:test";
import assert from "node:assert/strict";
import {createDispatcherAuthorizer,createDispatcherSessionService} from "../dispatcher-auth.js";
const token={uid:"uid-staff",email:"person@internal.example",email_verified:true,firebase:{sign_in_provider:"google.com"}};
const person={id:"directory-user-id",primaryEmail:"person@internal.example",customerId:"C_INTERNAL",suspended:false,archived:false};
function fixture({identity=token,user=person,member=true,configured=true,readError=false,groupError=false}={}){
 let reads=0,groups=0;
 const authorizer=createDispatcherAuthorizer({
  verifyToken:async()=>identity,
  lookupDirectoryUser:async()=>{reads++;if(readError)throw Error("outage");return user;},
  checkGroupMembership:async(groupKey,memberKey)=>{groups++;assert.equal(groupKey,"dispatchers@internal.example");assert.equal(memberKey,"directory-user-id");if(groupError)throw Error("down");return member;},
  workspaceCustomerId:configured?"C_INTERNAL":"",dispatcherGroup:"dispatchers@internal.example"
 });
 return {authorizer,counts:()=>({reads,groups})};
}
test("verified active directory member in dispatcher group is assigned dispatcher",async()=>{
 const f=fixture();
 assert.deepEqual(await f.authorizer.authorize("verified-id-token"),{uid:"uid-staff",email:"person@internal.example",role:"dispatcher",workspace:"dispatcher"});
 assert.deepEqual(f.counts(),{reads:1,groups:1});
});
test("non-google, unverified and invalid sessions cannot query Directory",async()=>{
 for(const identity of [{...token,email_verified:false},{...token,firebase:{sign_in_provider:"password"}},{...token,email:""},{...token,uid:null}]){
  const f=fixture({identity});await assert.rejects(f.authorizer.authorize("test"),e=>e.status===403);assert.equal(f.counts().reads,0);
 }
 const f=fixture();await assert.rejects(f.authorizer.authorize(""),e=>e.status===401);
});
test("missing Workspace config fails closed",async()=>{
 const f=fixture({configured:false});await assert.rejects(f.authorizer.authorize("test"),e=>e.status===503);
 assert.deepEqual(f.counts(),{reads:0,groups:0});
});
test("external, suspended, archived and other-tenant users are denied",async()=>{
 for(const user of [null,{...person,customerId:"C_OTHER"},{...person,suspended:true},{...person,archived:true},{...person,primaryEmail:"impostor@internal.example",aliases:[]}]){
  const f=fixture({user});await assert.rejects(f.authorizer.authorize("token"),e=>e.status===403);
  assert.equal(f.counts().groups,0);
 }
});
test("same-domain ungrouped staff and group removal revoke access",async()=>{
 let member=true;
 const f=createDispatcherAuthorizer({verifyToken:async()=>token,lookupDirectoryUser:async()=>person,
  checkGroupMembership:async()=>member,workspaceCustomerId:"C_INTERNAL",dispatcherGroup:"dispatchers@internal.example"});
 await f.authorize("token");member=false;await assert.rejects(f.authorize("token"),e=>e.status===403);
});
test("directory outages fail closed, never fall back to email suffix",async()=>{
 for(const f of [fixture({readError:true}),fixture({groupError:true})])
  await assert.rejects(f.authorizer.authorize("token"),e=>e.status===503);
});
test("session API remains disabled by default and strips directory details",async()=>{
 const f=fixture();
 const disabled=createDispatcherSessionService({authorizer:f.authorizer});
 assert.equal((await disabled.handle({method:"GET",headers:{authorization:"Bearer token"}})).status,503);
 const service=createDispatcherSessionService({authorizer:f.authorizer,enabled:true});
 const noToken=await service.handle({method:"GET"});assert.equal(noToken.status,401);
 assert.equal((await service.handle({method:"POST",headers:{authorization:"Bearer token"}})).status,405);
 const ok=await service.handle({method:"GET",headers:{authorization:"Bearer token"}});
 assert.equal(ok.status,200);assert.deepEqual(ok.body,{role:"dispatcher",workspace:"dispatcher"});
 assert.match(ok.headers["Cache-Control"],/no-store/);
 assert.equal(JSON.stringify(ok.body).includes("person@internal.example"),false);
});
