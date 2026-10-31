import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {quoteInput,bookingInput,bookable,money,statuses} from "../deliveries/model.js";
const source=(await readFile(new URL("../deliveries/app.js",import.meta.url),"utf8"))
 .replace(/^import .*;$/gm,"")
 .replace('import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js")','Promise.resolve(fixtureAppSdk)')
 .replace('import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")','Promise.resolve(fixtureAuthSdk)');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function browser({enabled=false,policiesApproved=false,configured=false,directory=false}={}){
 const elements=new Map(),calls=[];let authListener;
 const element=(id="")=>{
  if(id&&elements.has(id))return elements.get(id);
  const el={id,disabled:id.endsWith('-fields'),hidden:false,value:"",textContent:"",checked:false,children:[],listeners:{},resets:0,data:{},
   addEventListener(name,callback){this.listeners[name]=callback;},setAttribute(name,value){this[name]=value;},
   append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},focus(){this.focused=true;},
   reset(){this.resets++;this.data={};},remove(){this.removed=true;},reportValidity(){return true;},
   querySelector(selector){if(selector===".form-message")return this.children.find(c=>c.className?.includes("form-message")&&!c.removed)||null;
    if(selector.includes("button"))return element(id+"-submit");return null;}
  };
  if(id)elements.set(id,el);return el;
 };
 const auth={currentUser:null};
 const authSdk={getAuth:()=>auth,setPersistence:async()=>{},onAuthStateChanged(_auth,listener){authListener=listener;},
  signInWithPopup:async()=>{calls.push("login");},GoogleAuthProvider:class{},signOut:async()=>{calls.push("logout");},browserSessionPersistence:{}};
 const api=Object.fromEntries(["quotes","shipments","profile","quote","book","privacyRequest","saveProfile","track","proof"].map(method=>[method,async()=>{
  calls.push(method);if(method==="quotes"||method==="shipments")return {items:[],nextCursor:null};if(method==="profile")return {profile:{}};return {id:"test-result",status:"pending"};
 }]));
 const context={document:{getElementById:element,createElement:()=>element(),querySelectorAll:selector=>selector==='.form-message'?[]:[...elements].filter(([id])=>id.endsWith('-submit')).map(([,el])=>el)},
  firebaseConfig:configured?{apiKey:"public",authDomain:"example.test",projectId:"test",appId:"web"}:null,
  config:{enabled,policiesApproved,apiBase:"/api/deliveries",policyVersion:"test"},dispatcherConfig:{enabled:directory,sessionApi:"/api/dispatcher/session"},
  createDeliveryApi:()=>api,isVerifiedDispatcher:async()=>{throw Error("Directory unavailable");},
  location:{origin:"https://test.invalid",replace(){calls.push("redirect");}},quoteInput,bookingInput,bookable,money,statuses,
  crypto:{randomUUID:()=>"test-key"},fixtureAppSdk:{initializeApp:()=>({})},fixtureAuthSdk:authSdk,URL,setTimeout,console,
  FormData:class extends Map{constructor(form){super(Object.entries(form.data));}}
 };
 vm.runInNewContext(source,context);await tick();
 return {element,calls,async session(current){auth.currentUser=current;await authListener(current);await tick();},submit:async id=>{const form=element(id);await form.listeners.submit({preventDefault(){},currentTarget:form});}};
}
const customer={uid:"customer-a",email:"customer@example.test",getIdToken:async()=>"token"};
const quoteData={pickupArea:"Johannesburg 2001",deliveryArea:"Pretoria 0002",weightKg:"1",lengthCm:"20",widthCm:"15",heightCm:"10",service:"economy"};
test("closed preview allows typing and selections, while clicks explain why no request was sent",async()=>{
 const f=await browser();
 for(const id of ["quote-fields","booking-fields","tracking-fields","acceptance-fields","profile-fields","privacy-fields","refresh"])assert.equal(f.element(id).disabled,false,id);
 f.element("quote-form").data=quoteData;
 await f.submit("quote-form");
 assert.match(f.element("quote-form").querySelector(".form-message").textContent,/nothing has been sent/);
 await f.submit("tracking-form");await f.submit("privacy-form");
 assert.match(f.element("tracking-form").querySelector(".form-message").textContent,/not open yet/);
 assert.deepEqual(f.calls,[]);
});
test("public preview disables Google sign-in without loading identity",async()=>{
 const f=await browser();
 assert.equal(f.element("login").disabled,true);
 assert.match(f.element("login").textContent,/Sign-in paused/);
 assert.match(f.element("identity").textContent,/not submitted/);
 assert.deepEqual(f.calls,[]);
});
test("an active service still requires sign-in, with an explanation beside the form",async()=>{
 const f=await browser({enabled:true,policiesApproved:true});
 await f.submit("quote-form");assert.match(f.element("quote-form").querySelector(".form-message").textContent,/Sign in with Google/);assert.deepEqual(f.calls,[]);
});
test("initial auth resolution and first sign-in preserve a draft; sign-out clears private forms",async()=>{
 const f=await browser({configured:true,enabled:true,policiesApproved:true});
 f.element("booking-form").data={pickupAddress:"1 Test Street"};
 await f.session(null);assert.equal(f.element("booking-form").resets,0);
 await f.session(customer);assert.equal(f.element("booking-form").resets,0);assert.equal(f.element("booking-form").data.pickupAddress,"1 Test Street");
 await f.session(null);assert.equal(f.element("booking-form").resets,1);assert.equal(f.element("booking-form").data.pickupAddress,undefined);
});
test("directory verification failure leaves capture usable and prevents authenticated requests",async()=>{
 const f=await browser({configured:true,enabled:true,policiesApproved:true,directory:true});await f.session(customer);
 assert.equal(f.element("quote-fields").disabled,false);await f.submit("quote-form");
 assert.match(f.element("quote-form").querySelector(".form-message").textContent,/not been verified/);assert.deepEqual(f.calls,[]);
});
test("live submission requires policy acknowledgments and reaches the API only after acceptance",async()=>{
 const f=await browser({configured:true,enabled:true,policiesApproved:true});await f.session(customer);
 f.element("quote-form").data=quoteData;f.calls.length=0;await f.submit("quote-form");
 assert.match(f.element("message").textContent,/acknowledge/);assert.deepEqual(f.calls,[]);
 for(const id of ["terms","privacy","ownership"])f.element(id).checked=true;
 await f.submit("quote-form");assert.equal(f.calls.filter(c=>c==="quote").length,1);
});
