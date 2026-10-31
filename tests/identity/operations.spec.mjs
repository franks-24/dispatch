import {test,expect} from "@playwright/test";
async function fixture(page,{denied=false}={}){
 await page.route("**/workspaces/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const operationsConfig={enabled:true,policyVersion:"policy-1"};'}));
 await page.route("**/assets/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const firebaseConfig={apiKey:"test",projectId:"dispatch-1491f",appId:"test",authDomain:"test.invalid"};'}));
 await page.route("https://www.gstatic.com/firebasejs/*/firebase-app.js",route=>route.fulfill({contentType:"text/javascript",body:'export const getApps=()=>[];export const initializeApp=()=>({});'}));
 await page.route("https://www.gstatic.com/firebasejs/*/firebase-auth.js",route=>route.fulfill({contentType:"text/javascript",body:"let callback;\nconst user={uid:\"driver\",email:\"driver@test.invalid\",getIdToken:async()=>\"test-token\"};\nexport class GoogleAuthProvider{setCustomParameters(){}}\nexport const getAuth=()=>({}),browserSessionPersistence={},setPersistence=async()=>{};\nexport function onAuthStateChanged(auth,cb){callback=cb;queueMicrotask(()=>cb(null));}\nexport async function signInWithPopup(){await callback(user);}\nexport async function signOut(){await callback(null);}"}));
 let accepted=false,messages=[];
 await page.route("**/api/driver/**",async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  let body={};
  if(path.endsWith("/session")){
   if(denied)return route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:"Driver approval is required."})});
   body={role:"driver"};
  }else if(path.endsWith("/accept")){accepted=true;body={job:{id:"job1",status:"accepted"}};}
  else if(path.endsWith("/messages")){
   if(request.method()==="POST"){messages.push({id:"m1",text:request.postDataJSON().text,role:"driver",createdAt:"2026-10-31T10:00:00Z"});body={message:messages.at(-1)};}
   else body={items:messages};
  }else{
   const job={id:"job1",reference:"TEST-ONLY",pickupArea:"Johannesburg",deliveryArea:"Pretoria",feeMinor:15000,status:accepted?"accepted":"offered"};
   body=path.endsWith("/jobs")?{items:[job],nextCursor:null}:{job,...(accepted?{delivery:{pickupAddress:"Private test collection",deliveryAddress:"Private test recipient",recipientName:"Fixture recipient",recipientPhone:"+27110000000"}}:{})};
  }
  return route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
 });
}
test("driver offers, acceptance, parked messages and logout work on mobile",async({page},info)=>{
 await fixture(page);await page.goto("/driver/");
 await page.getByRole("button",{name:"Continue with Google"}).click();
 await expect(page.getByRole("button",{name:/Accept offer/})).toBeVisible();
 await expect(page.locator("#content")).not.toContainText("Private test recipient");
 await page.getByRole("button",{name:/Accept offer/}).click();
 await page.getByRole("button",{name:"Open trip"}).click();
 await expect(page.locator("#content")).toContainText("Private test recipient");
 await page.getByLabel("Message",{exact:true}).fill("<img src=x onerror=alert(1)> Parked safely");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await expect(page.locator(".message")).toContainText("<img src=x onerror=alert(1)> Parked safely");
 await expect(page.locator(".message img")).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath("driver-active-trip.png"),fullPage:true});
 await page.getByRole("button",{name:"Sign out",exact:true}).click();
 await expect(page.locator("#workspace")).toBeHidden();
 await expect(page.locator("#content")).not.toContainText("Private test recipient");
});
test("unapproved driver is denied operational data with a visible explanation",async({page})=>{
 await fixture(page,{denied:true});await page.goto("/driver/");await page.getByRole("button",{name:"Continue with Google"}).click();
 await expect(page.locator("#workspace")).toBeHidden();await expect(page.locator("#status")).toContainText("Driver approval is required");
});
test("operations preview is responsive and closed before staging configuration",async({page},info)=>{
 await page.goto("/operations/");await expect(page.locator("#login")).toBeDisabled();await expect(page.locator("#workspace")).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath("operations-locked.png"),fullPage:true});
});
