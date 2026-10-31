import {test,expect} from "@playwright/test";
import {googleFixture,json} from "./portal-fixture.mjs";
test("dispatcher inbox copies into the visible capture panel, saves and clears private data on logout",async({page})=>{
 await googleFixture(page);await page.route("**/dispatcher/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const dispatcherConfig={enabled:true,sessionApi:"/api/dispatcher/session"};'}));
 const items=[];const tracking="F24-20261031-AAAAAAAAAAAAAA";
 await page.route("**/api/dispatcher/**",async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  expect(request.headers().authorization).toBe("Bearer fixture-token");
  if(path.endsWith("/session"))return json(route,{role:"dispatcher",workspace:"dispatcher"});
  if(path.includes("/whatsapp/"))return json(route,{drafts:[{id:"message1",status:"needs_review",receivedAt:"2026-10-31T10:00:00Z",text:"Test product order",suggestion:{itemDescription:"Fixture parcel",sku:"TEST-1",quantity:2}}]});
  if(request.method()==="POST"){const body=request.postDataJSON();expect(body.name).toBe("Fixture parcel");items.push({...body,tracking,status:"registered",createdAt:"2026-10-31T10:00:00Z"});return json(route,{item:items[0]},201);}
  return json(route,{items});
 });
 await page.goto("/dispatcher/");await page.locator("#staff-login").click();await expect(page.locator("#staff-workspace")).toBeVisible();
 await page.getByRole("tab",{name:"WhatsApp inbox",exact:true}).click();await expect(page.locator("#whatsapp-panel")).toBeVisible();
 await page.getByRole("button",{name:"Use product details in capture form"}).click();await expect(page.locator("#inventory-panel")).toBeVisible();await expect(page.locator("#whatsapp-panel")).toBeHidden();await expect(page.locator("#item-name")).toHaveValue("Fixture parcel");
 await page.locator("#inventory-save").click();await expect(page.locator("#inventory-status")).toContainText("Saved inventory item "+tracking);await page.getByText("Recent inventory and search",{exact:true}).click();await expect(page.locator("#inventory-list")).toContainText(tracking);
 await expect(page.getByRole("link",{name:/Open dispatch queue/})).toHaveAttribute("href","../operations/#jobs");
 await page.locator("#staff-logout").click();await expect(page.locator("#staff-workspace")).toBeHidden();await expect(page.locator("#inventory-list")).toBeEmpty();await expect(page.locator("#whatsapp-drafts")).toBeEmpty();
});
test("operations queue deep link survives sign-in and a late old-tab response cannot replace the current view",async({page})=>{
 await googleFixture(page);await page.route("**/workspaces/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const operationsConfig={enabled:true,policyVersion:"fixture-approved"};'}));
 let releaseQuote;
 await page.route("**/api/operations/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith("/session"))return json(route,{role:"dispatcher",canReview:false,canReconcile:false});
  if(path.endsWith("/quotes")){await new Promise(resolve=>{releaseQuote=resolve;});return json(route,{items:[{pickupArea:"Late old quote",deliveryArea:"Test",status:"pending",weightKg:1,service:"economy"}]});}
  if(path.endsWith("/drivers"))return json(route,{items:[{id:"driver1",name:"Current fixture driver",status:"approved",region:"Test",vehicle:"car",validUntil:"2099-01-01"}]});
  return json(route,{items:[]});
 });
 await page.goto("/operations/#jobs");await page.locator("#login").click();await expect(page.getByRole("button",{name:"Dispatch queue",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:"Quote requests",exact:true}).click();await expect.poll(()=>Boolean(releaseQuote)).toBe(true);
 await page.locator("#tabs").getByRole("button",{name:"Drivers",exact:true}).click();await expect(page.locator("#content")).toContainText("Current fixture driver");
 const response=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/quotes"));releaseQuote();await (await response).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(page.locator("#content")).toContainText("Current fixture driver");await expect(page.locator("#content")).not.toContainText("Late old quote");
});

async function staffPreview(page){
 await googleFixture(page);
 await page.route("**/dispatcher/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const dispatcherConfig={enabled:true,sessionApi:"/api/dispatcher/session"};'}));
 await page.route("**/workspaces/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const operationsConfig={enabled:true,policyVersion:"fixture-approved"};'}));
 await page.route("**/api/dispatcher/**",route=>{
  const path=new URL(route.request().url()).pathname;
  return json(route,path.endsWith("/session")?{role:"dispatcher",workspace:"dispatcher"}:path.includes("/whatsapp/")?{drafts:[]}:{items:[]});
 });
 await page.route("**/api/operations/**",route=>json(route,new URL(route.request().url()).pathname.endsWith("/session")?{role:"dispatcher",canReview:false,canReconcile:false}:{items:[]}));
}
test("staff delivery-records shortcut reaches the staff-authorized bookings view",async({page})=>{
 await staffPreview(page);await page.goto("/dispatcher/");await page.locator("#staff-login").click();await expect(page.locator("#staff-workspace")).toBeVisible();
 await page.getByRole("link",{name:/Delivery records/}).click();await expect(page).toHaveURL(/\/operations\/#shipments$/);
 await page.locator("#login").click();await expect(page.locator("#tabs").getByRole("button",{name:"Bookings",exact:true})).toHaveAttribute("aria-pressed","true");await expect(page.locator("#workspace")).toBeVisible();
});
test("switching away from inventory cancels a pending camera request before attaching its stream",async({page})=>{
 await staffPreview(page);
 await page.addInitScript(()=>{
  window.__scanStopped=0;
  window.BarcodeDetector=class{static async getSupportedFormats(){return ['code_128'];}async detect(){return [];}};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>{window.__resolveCamera=()=>resolve({getTracks:()=>[{stop(){window.__scanStopped++;}}]});})}});
 });
 await page.goto("/dispatcher/");await page.locator("#staff-login").click();await expect(page.locator("#inventory-panel")).toBeVisible();await page.locator("#scan-barcode").click();
 await expect.poll(()=>page.evaluate(()=>typeof window.__resolveCamera)).toBe("function");
 await page.getByRole("tab",{name:"WhatsApp inbox",exact:true}).click();await page.evaluate(()=>window.__resolveCamera());
 await expect.poll(()=>page.evaluate(()=>window.__scanStopped)).toBe(1);await expect(page.locator("#barcode-video")).toHaveJSProperty("hidden",true);await expect(page.locator("#barcode-video")).toHaveJSProperty("srcObject",null);
});

test("operations list searches and filters real loaded records with page-scoped counts on mobile",async({page})=>{
 await googleFixture(page);
 await page.route("**/workspaces/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const operationsConfig={enabled:true,policyVersion:"fixture-approved"};'}));
 await page.route("**/api/operations/**",route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith("/session"))return json(route,{role:"dispatcher",canReview:false,canReconcile:false});
  if(path.endsWith("/quotes"))return json(route,{items:[
   {id:"q1",pickupArea:"Johannesburg",deliveryArea:"Pretoria",status:"pending",weightKg:1,service:"economy",lengthCm:10,widthCm:10,heightCm:10},
   {id:"q2",pickupArea:"Durban",deliveryArea:"Cape Town",status:"quoted",weightKg:2,service:"express",lengthCm:20,widthCm:20,heightCm:20}
  ],nextCursor:null});
  return json(route,{items:[],nextCursor:null});
 });
 await page.goto("/operations/");
 await page.locator("#login").click();
 const cards=page.locator(".records-page .card");
 await expect(cards).toHaveCount(2);
 await expect(page.locator(".records-page [role=status]")).toContainText("Showing 2 of 2 loaded records on this page");
 await expect(page.locator(".records-page")).toContainText("Not a fleet-wide total");
 await page.getByRole("searchbox",{name:"Search records on this page"}).fill("Pretoria");
 await expect(cards.nth(0)).toBeVisible();
 await expect(cards.nth(1)).toBeHidden();
 await page.getByRole("searchbox",{name:"Search records on this page"}).clear();
 await page.getByLabel("Filter records by status").selectOption("quoted");
 await expect(cards.nth(0)).toBeHidden();
 await expect(cards.nth(1)).toBeVisible();
 await expect(page.locator(".records-page [role=status]")).toContainText("Showing 1 of 2 loaded records on this page");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test("public dispatcher remains security-paused after client script initializes",async({page})=>{
 await page.goto("/dispatcher/");
 const login=page.locator("#staff-login");
 await expect(login).toBeDisabled();
 await expect(login).toHaveText("Access paused — security review");
 await expect(page.locator("#staff-status")).toContainText("No sign-in or credential entry is permitted");
 await expect(page.locator("#staff-workspace")).toBeHidden();
 await expect(page.locator("#staff-logout")).toBeHidden();
 await expect(page.locator("#staff-status")).not.toContainText("Choose your own approved Franks24 Google Workspace account");
});
