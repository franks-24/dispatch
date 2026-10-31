import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const root=new URL("../",import.meta.url);
export const publicPages=Object.freeze([
 "index.html","deliveries/index.html","dispatcher/index.html",
 "driver/index.html","driver/apply.html","operations/index.html"
]);
export function auditPage(path,source){
 const faults=[];
 const scripts=[...source.matchAll(/<script\b([^>]*)>/gi)];
 for(const [,attrs] of scripts){
  const match=attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if(!match){faults.push("Inline executable script is not allowed");continue;}
  const ref=match[1];
  if(!/^(?:\.\.?\/|\/(?!\/))[\w./-]+(?:\?[\w=&-]+)?$/.test(ref)||ref.includes("..\\"))
   faults.push("Unapproved script origin or source "+ref.slice(0,80));
 }
 if(/<input\b[^>]*\btype\s*=\s*["']?password\b/i.test(source))
  faults.push("Custom password input prohibited on preview");
 if(/<(?:iframe|object|embed)\b/i.test(source))
  faults.push("Embedded third-party content prohibited on preview");
 if(/<meta\b[^>]*\bhttp-equiv\s*=\s*["']?refresh\b/i.test(source))
  faults.push("Meta refresh/redirect prohibited");
 if(/<base\b[^>]*\bhref\s*=/i.test(source))
  faults.push("Base URL override prohibited");
 for(const [,action] of source.matchAll(/<(?:form|button|input)\b[^>]*\b(?:form)?action\s*=\s*["']([^"']+)["']/gi)){
  if(/^\s*(?:https?:|\/\/|javascript:|data:)/i.test(action))faults.push("Form or button posts to untrusted URL");
 }
 return {path,scriptCount:scripts.length,faults};
}
export async function auditStaticPreview(){
 const scans=[];
 for(const path of publicPages){const source=await readFile(new URL(path,root),"utf8");scans.push(auditPage(path,source));}
 const flags=["dispatcher/config.js","workspaces/config.js","driver/apply-config.js","deliveries/config.js"];
 for(const path of flags){
  const src=await readFile(new URL(path,root),"utf8");
  if(!/\benabled\s*:\s*false\b/.test(src))scans.push({path,faults:["Public source must default closed"]});
 }
 const imports=["dispatcher/app.js","workspaces/app.js","driver/apply.js","deliveries/app.js"];
 for(const path of imports){
  const src=await readFile(new URL(path,root),"utf8");
  const faults=[];
  for(const [,url] of src.matchAll(/\bimport\s*\(\s*["'](https?:\/\/[^"']+)["']\s*\)/g)){
   if(!/^https:\/\/www\.gstatic\.com\/firebasejs\/11\.10\.0\/firebase-(?:app|auth|firestore)\.js$/.test(url))
    faults.push("Unapproved runtime import "+url.slice(0,90));
  }
  if(/\b(?:eval|Function)\s*\(|\bdocument\.write\s*\(/.test(src))
   faults.push("Dynamic code evaluation or document.write detected");
  scans.push({path,faults});
 }
 return scans;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const scans=await auditStaticPreview();
 const faults=scans.flatMap(x=>(x.faults||[]).map(message=>x.path+": "+message));
 console.log("Audited "+publicPages.length+" public HTML routes and protected auth defaults.");
 if(faults.length){for(const fault of faults)console.error("SECURITY AUDIT: "+fault);process.exitCode=1;}
 else console.log("Static preview content checks passed; external Safe Browsing clearance remains separately required.");
}
