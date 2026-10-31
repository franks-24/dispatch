import {test,expect} from "@playwright/test";
import {googleFixture,json} from "./portal-fixture.mjs";
test("customer quote, booking, tracking, proof and signout use the authenticated API",async({page})=>{
 await googleFixture(page);
 await page.route("**/deliveries/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const deliveryConfig={enabled:true,policiesApproved:true,apiBase:"/api/deliveries",policyVersion:"fixture-approved"};'}));
 await page.route("**/dispatcher/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const dispatcherConfig={enabled:false,sessionApi:"/api/dispatcher/session"};'}));
 let quoted=false,booked=false,quoteWrite,bookingWrite;
 const quote={id:"quote1",status:"quoted",totalMinor:12000,currency:"ZAR",expiresAt:"2099-01-01T00:00:00Z"};
 const shipment={id:"shipment1",reference:"TEST-REF",status:"delivered",pickupArea:"Sandton",deliveryArea:"Pretoria",proofAvailable:true,events:[{status:"delivered",at:"2026-10-31T10:00:00Z",description:"Fixture handover"}]};
 await page.route("**/api/deliveries/**",async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  expect(request.headers().authorization).toBe("Bearer fixture-token");
  if(path.endsWith("/proof"))return route.fulfill({contentType:"application/pdf",body:Buffer.from("%PDF-1.4\n%%EOF")});
  if(path.endsWith("/profile"))return json(route,{profile:{}});
  if(path.endsWith("/quotes")){
   if(request.method()==="POST"){quoted=true;quoteWrite=request.postDataJSON();expect(request.headers()["idempotency-key"]).toBeTruthy();return json(route,{id:"quote1",status:"pending"});}
   return json(route,{items:quoted?[quote]:[],nextCursor:null});
  }
  if(path.endsWith("/bookings")){booked=true;bookingWrite=request.postDataJSON();return json(route,{id:"shipment1",reference:"TEST-REF",status:"requested"});}
  if(path.endsWith("/shipments"))return json(route,{items:booked?[{...shipment,status:"requested",proofAvailable:false}]:[],nextCursor:null});
  return json(route,shipment);
 });
 await page.goto("/deliveries/#quote");await page.locator("#login").click();
 for(const id of ["terms","privacy","ownership"])await page.locator("#"+id).check();
 const quoteForm=page.locator("#quote-form");
 await quoteForm.getByLabel("Collection city / postcode").fill("Sandton 2196");await quoteForm.getByLabel("Delivery city / postcode").fill("Pretoria 0002");
 for(const [label,value]of [["Weight (kg)","2"],["Length (cm)","20"],["Width (cm)","15"],["Height (cm)","10"]])await quoteForm.getByLabel(label,{exact:true}).fill(value);
 await quoteForm.getByRole("button",{name:/Request a quote/}).click();await expect(page.locator("#message")).toContainText("Quote request received");
 expect(quoteWrite.acceptance).toEqual({version:"fixture-approved",terms:true,privacy:true,ownership:true});expect(quoteWrite.totalMinor).toBeUndefined();
 await page.getByRole("tab",{name:"Book a delivery",exact:true}).click();const booking=page.locator("#booking-form");
 await booking.getByLabel("Available quote").selectOption("quote1");await booking.getByLabel("Full collection address").fill("1 Fixture Street, Sandton");await booking.getByLabel("Full delivery address").fill("2 Fixture Street, Pretoria");await booking.getByLabel("Recipient name").fill("Fixture Person");await booking.getByLabel("Recipient phone").fill("+27110000000");
 await booking.getByRole("button",{name:/Request collection/}).click();await expect(page.locator("#message")).toContainText("Await confirmation");expect(bookingWrite.quoteId).toBe("quote1");
 await page.getByRole("tab",{name:"Track a delivery",exact:true}).click();await page.locator("#tracking-form").getByLabel("Delivery reference").fill("TEST-REF");await page.locator("#tracking-form button").click();await expect(page.locator("#tracking-result")).toContainText("Fixture handover");
 const download=page.waitForEvent("download");await page.locator("#tracking-result").getByRole("button",{name:/Download proof/}).click();expect((await download).suggestedFilename()).toBe("Franks24-proof-of-delivery.pdf");
 await page.locator("#logout").click();await expect(page.locator("#tracking-result")).toBeEmpty();await expect(page.locator("#quote-fields")).toHaveAttribute("disabled","");
});
