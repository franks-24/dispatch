import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,access,mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,sep} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {verifyDriverPolicyRelease} from "../tools/verify-driver-policy-release.mjs";
const root=new URL("../",import.meta.url);
const paths=["legal/delivery-terms.html","legal/delivery-privacy.html","legal/delivery-data.html"];
const sha=s=>createHash("sha256").update(s).digest("hex");
test("applicant Hosting sends all API requests exclusively to its deny-by-default function",async()=>{
 const cfg=JSON.parse(await readFile(new URL("../firebase.applicants.json",import.meta.url),"utf8"));
 assert.equal(cfg.hosting.public,".firebase-applicants-public");
 assert.equal(cfg.hosting.target,"driver-applicant-prototype");
 assert.deepEqual(cfg.hosting.rewrites.map(x=>x.source),["/api/driver/application","/api/**"]);
 assert.ok(cfg.hosting.rewrites.every(x=>x.function.functionId==="driverApplicationsApi"));
 const helper=await readFile(new URL("../tools/deploy-applicants-staging.mjs",import.meta.url),"utf8");
 assert.match(helper,/firebase\.applicants\.json/);
 assert.doesNotMatch(helper,/firebase\.dispatcher\.json/);
});
test("unapproved release record refuses applicant collection",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"f24-pending-"));
 try{
  await mkdir(join(dir,"docs"));
  await writeFile(join(dir,"docs/driver-policy-release.json"),JSON.stringify({status:"pending_legal_approval",version:"driver-2026-10-31-v1"}));
  await assert.rejects(verifyDriverPolicyRelease({root:pathToFileURL(dir+sep),version:"driver-2026-10-31-v1"}),/approved driver policy release/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("approved record requires exact unchanged, effective policy documents",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"f24-policy-"));
 try{
  const base=pathToFileURL(dir+sep),docs={};
  await mkdir(join(dir,"docs"),{recursive:true});
  await mkdir(join(dir,"legal"),{recursive:true});
  for(const path of paths){
   const contents="<h1>Final policy "+path+"</h1>";
   await writeFile(join(dir,path),contents);docs[path]={sha256:sha(contents)};
  }
  const release={status:"approved",version:"driver-2026-10-31-v1",
   effectiveAt:"2026-10-30T00:00:00Z",approvedAt:"2026-10-29T00:00:00Z",
   approvedBy:"Authorized legal reviewer",approvalReference:"signed-release-001",
   responsibleParty:"Franks24 reviewed operator",informationOfficerContact:"privacy@franks24.com",
   retentionScheduleReference:"retention-register-001",popiaReviewReference:"popia-review-001",documents:docs};
  await writeFile(join(dir,"docs/driver-policy-release.json"),JSON.stringify(release));
  const options={root:base,version:release.version,now:Date.parse("2026-10-31T00:00:00Z")};
  assert.match((await verifyDriverPolicyRelease(options)).releaseSha256,/^[a-f0-9]{64}$/);
  for(const patch of [
   {approvedAt:null},{effectiveAt:0},{effectiveAt:"2099-01-01T00:00:00Z"},
   {approvedBy:""},{approvalReference:"pending"},{version:"wrong-version"},
   {documents:{}},{status:"pending_legal_approval"}
  ]){
   await writeFile(join(dir,"docs/driver-policy-release.json"),JSON.stringify({...release,...patch}));
   await assert.rejects(verifyDriverPolicyRelease(options));
  }
  await assert.rejects(verifyDriverPolicyRelease({...options,now:NaN}),/verification time/);
  await writeFile(join(dir,"docs/driver-policy-release.json"),JSON.stringify(release));
  await writeFile(join(dir,paths[0]),"<h1>Tampered policy</h1>");
  await assert.rejects(verifyDriverPolicyRelease(options),/checksum mismatch/);
  await writeFile(join(dir,paths[0]),"<h1>POLICY DRAFT</h1>");
  await assert.rejects(verifyDriverPolicyRelease(options),/visibly marked as draft/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("closed staging tree has no operational UI and no active Google collection",async()=>{
 const run=spawnSync(process.execPath,["tools/build-firebase-applicants.mjs"],{
  cwd:fileURLToPath(root),env:{...process.env,ENABLE_APPLICANT_UI:"false"},encoding:"utf8",timeout:30000});
 assert.equal(run.status,0,run.stderr||run.stdout);
 const dir=new URL("../.firebase-applicants-public/",import.meta.url);
 assert.match(await readFile(new URL("driver/apply-config.js",dir),"utf8"),/"enabled":false/);
 for(const path of ["dispatcher/index.html","operations/index.html","driver/index.html","deliveries/index.html","workspaces/app.js"])
  await assert.rejects(access(new URL(path,dir)),/ENOENT/);
 for(const path of paths)assert.equal(await readFile(new URL(path,dir),"utf8"),await readFile(new URL(path,root),"utf8"),"Published legal document must remain byte-identical");
 assert.doesNotMatch(await readFile(new URL("driver/apply.html",dir),"utf8"),/href="\.\.\/(dispatcher|operations|driver|deliveries)\/"/);
 await access(new URL("deliveries/styles.css",dir));
 assert.match(await readFile(new URL("404.html",dir),"utf8"),/Not available in applicant staging/);
});
