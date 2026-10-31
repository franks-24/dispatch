import {test,expect} from "@playwright/test";

test("public Pages applicant preview never collects information before approval",async({page})=>{
 await page.goto("/driver/apply.html");
 await expect(page.getByRole("button",{name:"Continue with Google"})).toBeDisabled();
 await expect(page.locator("#application-panel")).toBeHidden();
 await expect(page.locator("#applicant-status")).toContainText("Applications are not yet open");
 await expect(page.getByRole("link",{name:"Review launch status and policy drafts"})).toHaveAttribute("href","../deliveries/policies.html");
 await page.getByLabel("Vehicle you intend to use").selectOption("bakkie");
 await page.getByRole("button",{name:"Check readiness"}).click();
 await expect(page.locator("#readiness-status")).toContainText("Still to prepare");
 await page.getByRole("checkbox",{name:/proof of identity/}).check();
 await page.getByRole("checkbox",{name:/valid licence and permit/}).check();
 await page.getByRole("checkbox",{name:/vehicle permission/}).check();
 await page.getByRole("checkbox",{name:/reviewed driver and privacy terms/}).check();
 await page.getByRole("button",{name:"Check readiness"}).click();
 await expect(page.locator("#readiness-status")).toContainText("not verification or approval");

 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test("staged applicant can apply once, acknowledge approved policies, track status and sign out",async({page})=>{
 await page.route("**/driver/apply-config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const applicantConfig={enabled:true,policyVersion:"driver-policy-1"};'}));
 await page.route("**/assets/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const firebaseConfig={apiKey:"test",projectId:"dispatch-1491f",appId:"test",authDomain:"test.invalid"};'}));
 await page.route("https://www.gstatic.com/firebasejs/*/firebase-app.js",route=>route.fulfill({contentType:"text/javascript",body:'export const getApps=()=>[];export const initializeApp=()=>({});'}));
 await page.route("https://www.gstatic.com/firebasejs/*/firebase-auth.js",route=>route.fulfill({contentType:"text/javascript",body:`
 let callback;const user={uid:"driver",email:"driver@test.invalid",getIdToken:async()=>"verified-token"};
 export class GoogleAuthProvider{setCustomParameters(){}}
 export const getAuth=()=>({}),browserSessionPersistence={},setPersistence=async()=>{};
 export function onAuthStateChanged(auth,cb){callback=cb;queueMicrotask(()=>cb(null));}
 export async function signInWithPopup(){await callback(user);}
 export async function signOut(){await callback(null);}
 `}));
 let application=null,submitted=null,posts=0;
 await page.route("**/api/driver/application",route=>{
  const req=route.request();
  if(req.method()==="POST"){
   posts++;submitted=req.postDataJSON();
   if(!req.headers().authorization?.startsWith("Bearer verified-token"))
    return route.fulfill({status:401,contentType:"application/json",body:JSON.stringify({error:"Unauthenticated"})});
   application={id:"app-001",name:submitted.name,vehicle:submitted.vehicle,region:submitted.region,status:"in_review",createdAt:"2026-10-31T10:00:00Z",policyVersion:"driver-policy-1"};
  }
  return route.fulfill({contentType:"application/json",body:JSON.stringify({application,policyVersion:"driver-policy-1"})});
 });
 await page.goto("/driver/apply.html");
 await page.getByRole("button",{name:"Continue with Google"}).click();
 await expect(page.locator("#apply-form")).toBeVisible();
 await page.getByLabel("Legal name").fill("Driver Example");
 await page.getByLabel("Service area").fill("Johannesburg");
 await page.getByLabel("Vehicle type").selectOption("bakkie");
 await page.getByRole("button",{name:"Submit for human review"}).click();
 await expect(page.locator("#apply-form")).toBeVisible();
 expect(posts).toBe(0);
 await page.getByRole("checkbox",{name:/I have read and accept/}).check();
 await page.getByRole("checkbox",{name:/I acknowledge the privacy notice/}).check();
 await page.getByRole("checkbox",{name:/I acknowledge the data ownership/}).check();
 await page.getByRole("button",{name:"Submit for human review"}).click();
 await expect(page.locator("#application-summary")).toBeVisible();
 await expect(page.locator("#application-state")).toHaveText("in_review");
 expect(posts).toBe(1);
 expect(submitted).toMatchObject({name:"Driver Example",vehicle:"bakkie",policyVersion:"driver-policy-1",termsAccepted:true,privacyAcknowledged:true,dataUseAcknowledged:true});
 await page.getByRole("button",{name:"Sign out"}).click();
 await expect(page.locator("#application-panel")).toBeHidden();
 await expect(page.locator("#applicant-account")).toHaveText("");
});
