import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {validateCaptureInput} from "../delivery-functions/smart-capture.js";
const source=await readFile(new URL("../dispatcher/inventory.js",import.meta.url),"utf8");
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function browser(fetch,getUserMedia){
 const elements=new Map();let resets=0;
 const element=id=>{
  if(!elements.has(id))elements.set(id,{id,listeners:{},value:id==="item-quantity"?"1":"",files:[],hidden:true,textContent:"",
   addEventListener(name,callback){this.listeners[name]=callback;},replaceChildren(){},append(){},focus(){},pause(){},async play(){},removeAttribute(){},
   reset(){resets++;element("item-photo").files=[];},getContext(){return {drawImage(){}};},toBlob(callback){callback({size:6,arrayBuffer:async()=>Uint8Array.from([255,216,255,1,2,3]).buffer});}});
  return elements.get(id);
 };
 const context={document:{getElementById:element,createElement:element},window:{addEventListener(){},BarcodeDetector:{},createImageBitmap:true},
  BarcodeDetector:class{static async getSupportedFormats(){return ["code_128"];}async detect(){return [];}},
  navigator:{mediaDevices:{getUserMedia}},location:{origin:"https://test.invalid"},URL,fetch,crypto:{randomUUID:()=>"12345678-1234-1234-1234-123456789012"},setTimeout,clearTimeout,
  createImageBitmap:async file=>{if(file.invalid)throw Error("Could not decode photo.");return {width:10,height:10,close(){}};},Uint8Array,btoa:value=>Buffer.from(value,"binary").toString("base64")};
 vm.runInNewContext(source.replace("export function setInventorySession","function setInventorySession")+"\nglobalThis.session=setInventorySession;",context);
 return {element,context,resets:()=>resets};
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
test("late camera permission cannot start a camera after staff logout",async()=>{
 let resolveCamera,started;const requested=new Promise(resolve=>{started=resolve;});let stopped=0;
 const f=browser(async()=>json({items:[]}),()=>{started();return new Promise(resolve=>{resolveCamera=resolve;});});
 f.context.session({getIdToken:async()=>"staff"});await tick();
 const pending=f.element("scan-barcode").listeners.click();await requested;
 f.context.session(null);resolveCamera({getTracks:()=>[{stop(){stopped++;}}]});await pending;
 assert.equal(stopped,1);assert.equal(f.element("barcode-video").srcObject,null);
});
test("failed photo upload retries the existing item without creating a duplicate",async()=>{
 let created=0,uploads=0,photoAvailable=false;
 const f=browser(async(url,options)=>{
  const path=new URL(url).pathname;
  if(options.method==="GET")return json({items:created?[{tracking:"F24-20261031-AAAAAAAAAAAAAA",name:"Test parcel",quantity:1,status:"registered",photoAvailable}]:[]});
  if(path.endsWith("/photo")){uploads++;if(uploads===1)return json({error:"Temporary photo failure"},503);photoAvailable=true;return json({photoAvailable:true});}
  created++;return json({item:{tracking:"F24-20261031-AAAAAAAAAAAAAA"}},201);
 });
 f.context.session({getIdToken:async()=>"staff"});await tick();
 f.element("item-name").value="Test parcel";f.element("item-photo").files=[new Blob(["photo"],{type:"image/jpeg"})];
 const submit=()=>f.element("inventory-form").listeners.submit({preventDefault(){},currentTarget:f.element("inventory-form")});
 await submit();assert.equal(created,1);assert.equal(uploads,1);
 assert.match(f.element("inventory-status").textContent,/will not create another item/);assert.equal(f.resets(),0);
 await submit();assert.equal(created,1);assert.equal(uploads,2);assert.equal(f.resets(),1);
});
test("supported 3 MiB JPEG does not overflow the base64 validator",()=>{
 const bytes=Buffer.alloc(3*1024*1024,0);bytes[0]=255;bytes[1]=216;bytes[2]=255;
 const result=validateCaptureInput({image:{mime:"image/jpeg",base64:bytes.toString("base64")}});
 assert.equal(result.image.data.length,bytes.toString("base64").length);
 assert.throws(()=>validateCaptureInput({image:{mime:"image/jpeg",base64:bytes.toString("base64")+"="}}),/JPEG/);
});

test("an undecodable photo can be replaced while retaining the saved item",async()=>{
 let created=0,uploads=0;
 const f=browser(async(url,options)=>{
  if(options.method==="GET")return json({items:[]});
  if(new URL(url).pathname.endsWith("/photo")){uploads++;return json({photoAvailable:true});}
  created++;return json({item:{tracking:"F24-20261031-BBBBBBBBBBBBBB"}},201);
 });
 f.context.session({getIdToken:async()=>"staff"});await tick();
 const invalidPhoto=new Blob(["invalid"],{type:"image/jpeg"});invalidPhoto.invalid=true;
 f.element("item-name").value="Test parcel";f.element("item-photo").files=[invalidPhoto];
 const submit=()=>f.element("inventory-form").listeners.submit({preventDefault(){},currentTarget:f.element("inventory-form")});
 await submit();assert.equal(created,1);assert.equal(uploads,0);
 f.element("item-photo").files=[new Blob(["photo"],{type:"image/jpeg"})];f.element("item-photo").listeners.change();
 await submit();assert.equal(created,1);assert.equal(uploads,1);assert.equal(f.resets(),1);
});
