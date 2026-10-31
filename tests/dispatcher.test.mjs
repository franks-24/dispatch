import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("staff portal is distinct from customer and driver onboarding",async()=>{
 const [root,page,config]=await Promise.all([read("index.html"),read("dispatcher/index.html"),read("dispatcher/config.js")]);
 assert.match(root,/href="\.\/dispatcher\//);
 assert.match(page,/INTERNAL GOOGLE WORKSPACE DIRECTORY/);
 assert.match(page,/id="staff-login"[^>]*disabled/);
 assert.match(config,/enabled:\s*false/);
 assert.match(config,/sessionApi:"\/api\/dispatcher\/session"/);
 assert.doesNotMatch(page,/data-role="dispatcher"|email.*endsWith/i);
});
test("browser staff authorization uses same-origin server verification with no local role shortcut",async()=>{
 const app=await read("dispatcher/app.js");
 assert.match(app,/getIdToken\(true\)/);
 assert.match(app,/endpoint\.origin!==location\.origin/);
 assert.match(app,/redirect:"error"/);
 assert.match(app,/result\.role!=="dispatcher"/);
 assert.match(app,/response\.headers\.get\("content-type"\)/);
 assert.doesNotMatch(app,/localStorage|sessionStorage|email\.endsWith/i);
});
