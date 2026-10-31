import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../delivery-functions/applicants-function.js',import.meta.url),'utf8');
function fixture(env={}){
 let calls=0;
 const context={URL,process:{env},onRequest:(_,handler)=>handler,
  createRuntime:async()=>{calls++;return {};},
  createOperationsService:()=>({handle:async()=>({status:200,headers:{},body:{application:null}})})};
 vm.runInNewContext(source.replace(/^import .*;\n/gm,'').replace('export const driverApplicationsApi=','globalThis.handler='),context);
 return {calls:()=>calls,async request(path,method='GET',size=0){
  const res={code:200,set(){return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await context.handler({originalUrl:path,method,rawBody:{length:size},headers:{},body:{}},res);
  return res;
 }};
}
const enabled={DISPATCH_APPLICANTS_ENABLED:'true',DISPATCH_POLICIES_APPROVED:'true',DISPATCH_DRIVER_POLICY_VERSION:'driver-v1',DISPATCH_POLICY_RELEASE_SHA256:'a'.repeat(64)};
test('isolated handler denies operational and malformed routes before initializing any service',async()=>{
 const f=fixture(enabled);
 for(const path of ['/api/operations/jobs','/api/dispatcher','/api/driver/application/','/api/driver/%61pplication','/api/deliveries'])
  assert.equal((await f.request(path)).code,404);
 assert.equal(f.calls(),0);
});
test('every missing applicant release gate fails closed without touching identity or storage',async()=>{
 for(const key of Object.keys(enabled)){
  const env={...enabled};delete env[key];const f=fixture(env);
  assert.equal((await f.request('/api/driver/application')).code,503,key);
  assert.equal(f.calls(),0);
 }
 const f=fixture({...enabled,DISPATCH_DRIVER_POLICY_VERSION:'draft-v1'});
 assert.equal((await f.request('/api/driver/application')).code,503);
});
test('oversized requests are rejected before runtime initialization',async()=>{
 const f=fixture(enabled);
 assert.equal((await f.request('/api/driver/application','POST',4097)).code,413);
 assert.equal(f.calls(),0);
});
