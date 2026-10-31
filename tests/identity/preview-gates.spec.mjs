import {test,expect} from "@playwright/test";
import {googleFixture,json} from "./portal-fixture.mjs";

test("closed customer preview permits local validation but never initiates Google SSO or a backend write",async({page})=>{
 const api=[],firebase=[];
 page.on("request",request=>{
  const url=request.url();
  if(new URL(url).pathname.startsWith("/api/"))api.push(url);
  if(url.includes("gstatic.com/firebasejs/"))firebase.push(url);
 });
 await page.goto("/deliveries/#quote");
 await expect(page.locator("#login")).toBeDisabled();
 await expect(page.locator("#login")).toHaveText("Sign-in paused — preview only");
 const quote=page.locator("#quote-form");
 for(const [field,value] of Object.entries({
  pickupArea:"Sandton 2196",deliveryArea:"Pretoria 0002",weightKg:"2",
  lengthCm:"20",widthCm:"15",heightCm:"10"
 })) await quote.locator('[name="'+field+'"]').fill(value);
 await quote.getByRole("button",{name:/Review quote details/}).click();
 await expect(quote.locator(".form-message")).toContainText("nothing has been sent");
 await page.getByRole("tab",{name:"Book a delivery",exact:true}).click();
 await expect(page.locator("#booking-panel")).toBeVisible();
 await page.keyboard.press("End");
 await expect(page.locator("#account-panel")).toBeVisible();
 await expect(page.locator("#privacy-form button[type=submit]")).toHaveText(/preview/);
 expect(api).toEqual([]);
 expect(firebase).toEqual([]);
});

test("public driver, operations and application remain visibly closed while applicant readiness stays usable",async({page})=>{
 for(const path of ["/driver/","/operations/"]){
  await page.goto(path);
  await expect(page.locator("#login")).toBeDisabled();
  await expect(page.locator("#login")).toHaveText("Sign-in paused — staging only");
  await expect(page.locator("#workspace")).toBeHidden();
 }
 await page.goto("/driver/apply.html");
 await expect(page.locator("#applicant-login")).toBeDisabled();
 await expect(page.locator("#applicant-login")).toHaveText("Access paused — staging only");
 await page.getByLabel("Vehicle you intend to use").selectOption("bakkie");
 await page.getByRole("button",{name:"Check readiness"}).click();
 await expect(page.locator("#readiness-status")).toContainText("Still to prepare");
 await expect(page.locator("#application-panel")).toBeHidden();
});

test("a real dispatcher permission decision of 403 keeps a staged fixture session locked",async({page})=>{
 await googleFixture(page);
 await page.route("**/dispatcher/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const dispatcherConfig={enabled:true,sessionApi:"/api/dispatcher/session"};'}));
 let checked=0;
 await page.route("**/api/dispatcher/**",route=>{
  checked++;
  expect(route.request().headers().authorization).toBe("Bearer fixture-token");
  return json(route,{error:"Forbidden"},403);
 });
 await page.goto("/dispatcher/");
 await page.locator("#staff-login").click();
 await expect(page.locator("#staff-workspace")).toBeHidden();
 await expect(page.locator("#staff-status")).toHaveText("This Google account is not authorized for Dispatcher.");
 expect(checked).toBe(1);
});
