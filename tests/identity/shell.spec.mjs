import {test,expect} from "@playwright/test";
const portals=["/","/deliveries/","/driver/","/dispatcher/","/operations/","/legal/delivery-terms.html","/legal/delivery-privacy.html","/legal/delivery-data.html","/deliveries/policies.html"];
test("shared theme, responsive navigation and footer work across every portal",async({page})=>{
 let theme;
 for(const path of portals){
  await page.goto(path,{waitUntil:"domcontentloaded"});
  await expect(page.locator(".f24-header")).toBeVisible();
  expect(await page.locator(".f24-header").evaluate(el=>getComputedStyle(el).flexDirection)).toBe("row");
  await expect(page.locator(".f24-footer")).toHaveCount(1);
  const current=await page.locator("body").evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,font:getComputedStyle(el).fontFamily}));
  if(!theme)theme=current;else expect(current).toEqual(theme);
  for(const filename of ["delivery-terms.html","delivery-privacy.html","delivery-data.html"])await expect(page.locator('.f24-footer a[href$="'+filename+'"]').first()).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const menu=page.getByRole("button",{name:"Toggle navigation"});
  if(await menu.isVisible()){
   await expect(page.locator(".f24-nav")).toBeHidden();await menu.click();await expect(page.locator(".f24-nav")).toBeVisible();
   await page.keyboard.press("Escape");await expect(menu).toBeFocused();await expect(page.locator(".f24-nav")).toBeHidden();
  }
 }
});
test("customer deep links and keyboard tabs reveal the correct short task panel",async({page})=>{
 await page.goto("/deliveries/#booking");await expect(page.locator("#booking-panel")).toBeVisible();await expect(page.locator("#quote-panel")).toBeHidden();
 await page.getByRole("tab",{name:"Get a quote",exact:true}).click();await expect(page.locator("#quote-panel")).toBeVisible();
 await page.keyboard.press("ArrowRight");await expect(page.locator("#booking-panel")).toBeVisible();
 await page.keyboard.press("End");await expect(page.locator("#account-panel")).toBeVisible();await expect(page.locator("#booking-panel")).toBeHidden();
 await expect(page.locator("#privacy-fields")).not.toHaveAttribute("disabled","");
 await page.locator('.f24-footer a[href$="delivery-privacy.html"]').click();await expect(page.getByRole("heading",{name:"Delivery privacy notice",exact:true})).toBeVisible();
});
test("local delivery brief validates, downloads and never submits a booking",async({page})=>{
 let writes=0;await page.route("**/api/**",route=>{writes++;return route.abort();});
 await page.goto("/");await page.locator("#local-plan summary").click();
 const form=page.locator("#delivery-plan-form");await form.getByLabel("Collect from").fill("Sandton");await form.getByLabel("Deliver to").fill("Sandton");
 await form.getByRole("button",{name:/Create my delivery brief/}).click();
 await expect(page.locator("#delivery-plan-result")).toContainText("This is not a quote, booking or service-coverage confirmation.");
 const download=page.waitForEvent("download");await page.getByRole("button",{name:/Download my plan/}).click();expect((await download).suggestedFilename()).toBe("Franks24-delivery-plan.txt");
 await form.getByLabel("Deliver to").fill("Pretoria");await expect(page.locator("#delivery-plan-download")).toBeHidden();expect(writes).toBe(0);
});
