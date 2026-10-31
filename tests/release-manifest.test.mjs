import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
const script=fileURLToPath(new URL("../tools/write-release-manifest.mjs",import.meta.url));
const sha="0123456789abcdef".repeat(2)+"01234567";
function run(revision) {
 const directory=mkdtempSync(join(tmpdir(),"dispatch-release-"));
 const path=join(directory,"release.json");
 try {
  execFileSync(process.execPath,[script],{env:{...process.env,GITHUB_SHA:revision,DISPATCH_RELEASE_PATH:path},stdio:"pipe"});
  return JSON.parse(readFileSync(path,"utf8"));
 } finally {rmSync(directory,{recursive:true,force:true});}
}
test("release manifest identifies only immutable product and exact 40-character revision",()=>{
 const manifest=run(sha);
 assert.deepEqual(manifest,{schemaVersion:1,product:"franks24-dispatch",revision:sha});
 assert.equal(JSON.stringify(manifest).includes("apiKey"),false);
});
test("fails closed if release revision is missing or malformed",()=>{
 for(const revision of ["","main","z".repeat(40),"a".repeat(41)])assert.throws(()=>run(revision));
});
