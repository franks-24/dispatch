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
 for(const id of ["quote-fields","booking-fields","tracking-fields","acceptance-fields"])await expect(page.locator("#"+id)).toBeDisabled();
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
