import {test} from "node:test";
import assert from "node:assert/strict";
import {createWorkspaceDirectory} from "../dispatcher-directory.js";

const user={id:"staff-id",primaryEmail:"staff@franks24.com",customerId:"C014bnufl",suspended:false};
function result(body,status=200){
 return {ok:status>=200&&status<300,status,headers:{get:()=> "application/json"},json:async()=>body};
}
function fixture({tokenStatus=200,member=true}={}){
 let now=Date.parse("2026-10-31T10:00:00Z");
 const jwtClaims=[],calls=[],signatures=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url==="https://oauth2.googleapis.com/token"){
   assert.equal(options.method,"POST");
   assert.equal(options.headers["Content-Type"],"application/x-www-form-urlencoded");
   assert.equal(options.body.get("grant_type"),"urn:ietf:params:oauth:grant-type:jwt-bearer");
   assert.equal(options.body.get("assertion"),"signed-jwt");
   return result({access_token:"directory-token",expires_in:3600},tokenStatus);
  }
  assert.equal(options.method,"GET");
  assert.equal(options.headers.Authorization,"Bearer directory-token");
  if(url.includes("/hasMember/"))return result({isMember:member});
  return result(user);
 };
 const signJwt=async payload=>{
  signatures.push(payload);
  jwtClaims.push(JSON.parse(payload));
  return "signed-jwt";
 };
 const directory=createWorkspaceDirectory({
  delegatedAdminEmail:"support@franks24.com",signJwt,fetcher,clock:()=>now
 });
 return {directory,calls,jwtClaims,signatures,setTime:v=>{now=v;}};
}

test("keyless Directory authentication signs only a scoped, one-hour delegated assertion",async()=>{
 const f=fixture();
 assert.deepEqual(await f.directory.lookupDirectoryUser("staff@franks24.com"),user);
 assert.equal(await f.directory.checkGroupMembership("dispatchers@franks24.com","staff-id"),true);
 assert.equal(f.jwtClaims.length,1);
 const claims=f.jwtClaims[0];
 assert.equal(claims.iss,"franks24-directory@dispatch-1491f.iam.gserviceaccount.com");
 assert.equal(claims.sub,"support@franks24.com");
 assert.equal(claims.aud,"https://oauth2.googleapis.com/token");
 assert.equal(claims.exp-claims.iat,3600);
 assert.equal(claims.scope,[
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.member.readonly"
 ].join(" "));
 assert.equal(f.calls.filter(c=>c.url.endsWith("/token")).length,1);
});

test("concurrent Directory reads reuse one assertion and refresh before expiry",async()=>{
 const f=fixture();
 await Promise.all([
  f.directory.lookupDirectoryUser("staff@franks24.com"),
  f.directory.checkGroupMembership("dispatchers@franks24.com","staff-id")
 ]);
 assert.equal(f.jwtClaims.length,1);
 f.setTime(Date.parse("2026-10-31T10:59:10Z"));
 await f.directory.lookupDirectoryUser("staff@franks24.com");
 assert.equal(f.jwtClaims.length,2);
});

test("token exchange denial fails closed; Directory is never queried",async()=>{
 const f=fixture({tokenStatus:403});
 await assert.rejects(
  f.directory.lookupDirectoryUser("staff@franks24.com"),
  /Directory access token unavailable/
 );
 assert.equal(f.calls.some(c=>c.url.includes("/admin/directory/")),false);
});

test("missing delegated administrator and missing signer are refused",()=>{
 assert.throws(()=>createWorkspaceDirectory({delegatedAdminEmail:""}),/administrator/);
 assert.throws(()=>createWorkspaceDirectory({
  delegatedAdminEmail:"support@franks24.com",signJwt:null
 }),/signer/);
});

test("nonmember hasMember response never grants access",async()=>{
 const f=fixture({member:false});
 assert.equal(await f.directory.checkGroupMembership("dispatchers@franks24.com","staff-id"),false);
});
