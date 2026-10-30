import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
const config='export const firebaseConfig={apiKey:"fake-api-key",authDomain:"demo-dispatch-identity.firebaseapp.com",projectId:"demo-dispatch-identity",appId:"1:123:web:identity-tests"};';
async function open(page,account,configured=true){
 await page.addInitScript(value=>window.dispatchTestAccount=value,account);
 await page.route("https://fonts.googleapis.com/**",route=>route.fulfill({contentType:"text/css",body:""}));
 await page.route("**/assets/config.js",route=>route.fulfill({contentType:"text/javascript",body:configured?config:"export const firebaseConfig=null;"}));
 await page.route("**/assets/firebase-client.js",async route=>route.fulfill({contentType:"text/javascript",body:await readFile(".identity-tests/firebase-client.js","utf8")}));
 await page.goto("/");
}
async function login(page){await expect(page.locator("[data-login]").first()).toBeEnabled();await page.locator("[data-login]").first().click()}
async function acknowledge(page){for(const id of ["consent-terms","consent-privacy","consent-ownership"])await page.locator("#"+id).check()}
test("new worker accepts separate agreements, returns without onboarding, and signs out",async({page},info)=>{
 await open(page,"worker-"+info.project.name);await login(page);
 await expect(page.locator("#view-onboarding")).toBeVisible();
 for(const id of ["consent-terms","consent-privacy","consent-ownership"])await expect(page.locator("#"+id)).not.toBeChecked();
 await page.locator("#profile-name").fill("Worker Identity Test");
 await page.locator("#profile-location").fill("Johannesburg");
 await page.locator("#onboard-submit").click();await expect(page.locator("#consent-error")).toBeVisible();
 await acknowledge(page);await page.locator("#onboard-submit").click();
 await expect(page.locator("#view-dashboard")).toBeVisible();await expect(page.locator("#user-role")).toHaveText("Job seeker");
 await expect(page.locator("#new-job-button")).toBeHidden();
 await page.reload();await expect(page.locator("#view-dashboard")).toBeVisible();await expect(page.locator("#view-onboarding")).toBeHidden();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false);
 await page.screenshot({path:info.outputPath("worker-workspace.png"),fullPage:true});
 await page.locator("#nav-signout").click();await expect(page.locator("#view-landing")).toBeVisible();
 await expect(page.locator("#user-name")).toHaveText("");await expect(page.locator("#profile-details")).toBeEmpty();
});
test("employer is recognised and cannot publish without administrator approval",async({page},info)=>{
 await open(page,"employer-"+info.project.name);await login(page);
 await expect(page.locator("#view-onboarding")).toBeVisible();
 await page.locator('[data-role="employer"]').click();await page.locator("#profile-name").fill("Employer Identity Test");await page.locator("#profile-location").fill("Pretoria");
 await acknowledge(page);await page.locator("#onboard-submit").click();
 await expect(page.locator("#view-dashboard")).toBeVisible();await expect(page.locator("#user-role")).toHaveText("Hiring team");
 await expect(page.locator("#employer-approval-banner")).toBeVisible();await expect(page.locator("#new-job-button")).toBeHidden();
 await expect(page.locator("#employer-approval-heading")).toHaveText("Verification pending");
 await page.reload();await expect(page.locator("#view-dashboard")).toBeVisible();await expect(page.locator("#jobs-nav-label")).toHaveText("My jobs");
 await page.screenshot({path:info.outputPath("employer-workspace.png"),fullPage:true});
});
test("cancelled Google popup stays signed out and offers retry",async({page},info)=>{
 await open(page,"cancel-"+info.project.name);await page.evaluate(()=>window.dispatchTestCancel=true);await login(page);
 await expect(page.locator("#view-landing")).toBeVisible();await expect(page.locator("[data-login]").first()).toBeEnabled();await expect(page.locator("#view-dashboard")).toBeHidden();
});
test("profile-read failure has a recoverable private error state",async({page},info)=>{
 await open(page,"error-"+info.project.name);await page.evaluate(()=>window.dispatchTestFailProfile=true);await login(page);
 await expect(page.locator("#view-auth-error")).toBeVisible();await expect(page.locator("#view-dashboard")).toBeHidden();
 await page.evaluate(()=>window.dispatchTestFailProfile=false);await page.locator("#retry-identity").click();
 await expect(page.locator("#view-onboarding")).toBeVisible();
});
test("missing production config fails closed and remains readable on mobile",async({page},info)=>{
 await open(page,"unconfigured-"+info.project.name,false);await expect(page.locator("#identity-notice")).toContainText("not active yet");
 await expect(page.locator("[data-login]").first()).toBeDisabled();await expect(page.locator("#view-onboarding")).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 await page.screenshot({path:info.outputPath("public-landing.png"),fullPage:true});
});

test("live custom domain renders without horizontal overflow",async({page},info)=>{
 const response=await page.goto("https://dispatch.franks24.com/",{waitUntil:"domcontentloaded"});
 expect(response.status()).toBe(200);await expect(page.locator("#hero-heading")).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 await page.screenshot({path:info.outputPath("live-custom-domain.png"),fullPage:true});
});
