import {test,expect} from "@playwright/test";
test("public Franks24 Dispatch landing has delivery navigation and no recruitment UI",async({page},info)=>{
 await page.goto("/",{waitUntil:"domcontentloaded"});
 await expect(page.locator("#hero-heading")).toBeVisible();
 await expect(page.getByRole("heading",{name:/Every delivery/i})).toBeVisible();
 await expect(page.locator(".dispatch-availability")).toContainText("Preview only");
 for(const fragment of ["quote","booking","tracking"])await expect(page.locator('a[href="./deliveries/#'+fragment+'"]')).toBeVisible();
 await expect(page.locator("[data-login]")).toHaveCount(0);
 expect(await page.locator("main").innerText()).not.toMatch(/post a job|I'm hiring|job seeker/i);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath("courier-landing.png"),fullPage:true});
});
test("delivery preview cannot accept live quote or booking submissions",async({page},info)=>{
 await page.goto("/deliveries/",{waitUntil:"domcontentloaded"});
 await expect(page.locator("#availability")).toContainText("not open yet");
 // FIELDSET has a disabled content attribute, but Playwright's isEnabled()
 // matcher applies to actionable form controls. Check both the gate attribute
 // and its actual descendant controls instead of asserting on the container.
 for(const id of ["quote-fields","booking-fields","tracking-fields","acceptance-fields"]){
  const fieldset=page.locator("#"+id);
  await expect(fieldset).toHaveAttribute("disabled","");
  await expect(fieldset.locator("input, select, textarea, button").first()).toBeDisabled();
 }
 // None of the customer preview's forms may submit before activation.
 for(const id of ["quote-form","booking-form","tracking-form"]){
  await expect(page.locator("#"+id+" button[type=submit]")).toBeDisabled();
 }
 await expect(page.locator("header .brand")).toContainText("Franks24");
 await expect(page.locator("footer")).not.toContainText("work & hiring");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath("delivery-preview.png"),fullPage:true});
});
test("privacy and policy links lead to explicitly unapproved draft",async({page})=>{
 await page.goto("/deliveries/policies.html",{waitUntil:"domcontentloaded"});
 await expect(page.getByRole("heading",{name:/Dispatch delivery policy drafts/})).toBeVisible();
 await expect(page.locator(".notice")).toContainText("Draft for review");
 await expect(page.locator("main")).toContainText("Driver GPS");
});
test("live custom domain responds, checking new copy only once published",async({page},info)=>{
 const response=await page.goto("https://dispatch.franks24.com/",{waitUntil:"domcontentloaded"});
 expect(response?.status()).toBe(200);
 await expect(page.locator("#hero-heading")).toBeVisible();
 if(process.env.VERIFY_PUBLISHED_SOURCE==="true"){
  await expect(page).toHaveTitle("Franks24 | Dispatch and Delivery Tracking");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.screenshot({path:info.outputPath("live-custom-domain.png"),fullPage:true});
});

test("Dispatcher staff login preview is distinct and locked until directory verification",async({page},info)=>{
 await page.goto("/dispatcher/",{waitUntil:"domcontentloaded"});
 await expect(page.getByRole("heading",{name:/Dispatcher/})).toBeVisible();
 await expect(page.locator("#staff-login")).toBeDisabled();
 await expect(page.locator("#staff-workspace")).toBeHidden();
 await expect(page.locator("#staff-status")).toContainText(/not live yet|disabled pending/i);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath("dispatcher-staff-locked.png"),fullPage:true});
});
