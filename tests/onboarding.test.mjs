import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Franks24 is primary brand; Dispatch is courier service, not recruiting",async()=>{
 const html=await source("index.html");
 assert.match(html,/<title>Franks24 \| Dispatch and Delivery Tracking<\/title>/);
 assert.match(html,/DISPATCH · COURIER &amp; LOGISTICS/);
 assert.match(html,/meta name="robots" content="noindex"/);
 assert.doesNotMatch(html,/I'm hiring|Post a job|job seeker|find work|apply for opportunities|opportunity for people/i);
 assert.doesNotMatch(html,/assets\/app\.js|data-login/,"legacy recruitment auth must not run on public root");
});
test("quote, booking and tracking all link to the disabled customer preview",async()=>{
 const html=await source("index.html");
 for(const fragment of ["quote","booking","tracking"])assert.ok(html.includes('href="./deliveries/#'+fragment+'"'));
 assert.match(html,/Live quote requests, bookings and payments are not yet active/);
 assert.match(html,/href="\.\/deliveries\/#workspace"/);
 assert.match(html,/href="\.\/deliveries\/policies\.html"/);
});
test("delivery capture remains editable while live requests stay closed before approval",async()=>{
 const [html,config]=await Promise.all([source("deliveries/index.html"),source("deliveries/config.js")]);
 assert.match(config,/enabled:\s*false/);
 assert.match(config,/policiesApproved:\s*false/);
 assert.match(config,/delivery-draft-2026-10-30/);
 for(const id of ["quote-fields","booking-fields","tracking-fields","acceptance-fields","profile-fields","privacy-fields"])assert.doesNotMatch(html,new RegExp('id="'+id+'" disabled'));
 assert.match(html,/entries are not saved after leaving this page/);
 assert.match(html,/issued quote is required/);
 assert.match(html,/No bookings or payments are accepted/);
 assert.doesNotMatch(html,/work and hiring|separate Franks24 service/i);
});
test("delivery policy remains unapproved and explains GPS/proof risks",async()=>{
 const html=await source("deliveries/policies.html");
 assert.match(html,/Draft for review/);
 assert.match(html,/Driver GPS or live location tracking/);
 assert.match(html,/not approved for production acceptance/);
 assert.match(html,/Proof of delivery/);
 assert.match(html,/retention periods/);
});

