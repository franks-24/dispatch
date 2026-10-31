import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("courier staging never activates or deploys applicant intake",async()=>{
 const deploy=await read("tools/deploy-courier-staging.mjs");
 assert.match(deploy,/DISPATCH_APPLICANTS_ENABLED:"false"/);
 assert.match(deploy,/env\.ENABLE_APPLICANT_UI="false"/);
 assert.doesNotMatch(deploy,/functions:franks24-deliveries:driverApplicationsApi/);
 assert.match(deploy,/env\.DISPATCH_STAGING_SITE==="dispatch-1491f"/);
});

test("courier Hosting has no applicant or deferred WhatsApp backend rewrite",async()=>{
 const config=JSON.parse(await read("firebase.dispatcher.json"));
 const paths=config.hosting.rewrites.map(route=>route.source);
 assert.ok(!paths.includes("/api/driver/application"));
 assert.ok(!paths.includes("/webhooks/whatsapp"));
 assert.ok(paths.includes("/api/driver/**"));
 assert.ok(paths.includes("/api/dispatcher/**"));
 assert.ok(paths.includes("/api/operations/**"));
 assert.ok(paths.includes("/api/deliveries/**"));
 assert.ok(!config.hosting.rewrites.some(route=>
  ["driverApplicationsApi","whatsappInbound"].includes(route.function?.functionId)));
});
