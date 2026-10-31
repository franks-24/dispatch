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
test("delivery preview accepts clicks and typing without sending live requests",async({page},info)=>{
 const requests=[];page.on("request",request=>{if(new URL(request.url()).pathname.startsWith("/api/"))requests.push(request.url());});
 await page.goto("/deliveries/#booking",{waitUntil:"domcontentloaded"});
 await expect(page.locator("#availability")).toContainText("not open yet");
 for(const id of ["quote-fields","booking-fields","tracking-fields","acceptance-fields","profile-fields","privacy-fields"]){
  const fieldset=page.locator("#"+id);
  await expect(fieldset).not.toHaveAttribute("disabled","");
  await expect(fieldset.locator("input, select, textarea").first()).toBeEnabled();
 }
 const pickup=page.locator('[name="pickupAddress"]');
 await pickup.click();await pickup.fill("1 Test Street, Johannesburg");
 await page.locator('[name="deliveryAddress"]').fill("2 Test Road, Pretoria");
 await expect(pickup).toHaveValue("1 Test Street, Johannesburg");
 await expect(page.locator("#quote-availability")).toContainText("issued quote is required");
 await page.locator("#terms").check();await expect(page.locator("#terms")).toBeChecked();
 await page.getByRole("tab",{name:"Get a quote",exact:true}).click();
 const form=page.locator("#quote-form");
 for(const [name,value] of Object.entries({pickupArea:"Johannesburg 2001",deliveryArea:"Pretoria 0002",weightKg:"1",lengthCm:"20",widthCm:"15",heightCm:"10"}))await form.locator('[name="'+name+'"]').fill(value);
 await form.locator('[name="service"]').selectOption("express");
 await form.getByRole("button",{name:/Request a quote/}).click();
 await expect(form.locator(".form-message")).toContainText("nothing has been sent");
 await page.getByRole("tab",{name:"Track a delivery",exact:true}).click();
 await page.locator('#tracking-form [name="reference"]').fill("F24-TEST");
 await page.locator('#tracking-form button').click();
 await expect(page.locator('#tracking-form .form-message')).toContainText("not open yet");
 await page.locator("#login").click();
 await expect(page.locator("#message")).toContainText(/Google sign-in/);
 expect(requests).toEqual([]);
 await expect(page.locator("header .brand")).toContainText("Franks24");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath("delivery-editable-preview.png"),fullPage:true});
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
 // This checks reachability only. The post-deployment verifier waits for the
 // exact GitHub commit manifest before requiring production content to match.
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
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

