import {test,expect} from "@playwright/test";
async function fixture(page,{denied=false}={}){
 await page.route("**/workspaces/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const operationsConfig={enabled:true,policyVersion:"policy-1"};'}));
 await page.route("**/assets/config.js",route=>route.fulfill({contentType:"text/javascript",body:'export const firebaseConfig={apiKey:"test",projectId:"dispatch-1491f",appId:"test",authDomain:"test.invalid"};'}));
 await page.route("https://www.gstatic.com/firebasejs/*/firebase-app.js",route=>route.fulfill({contentType:"text/javascript",body:'export const getApps=()=>[];export const initializeApp=()=>({});'}));
 await page.route("https://www.gstatic.com/firebasejs/*/firebase-auth.js",route=>route.fulfill({contentType:"text/javascript",body:
