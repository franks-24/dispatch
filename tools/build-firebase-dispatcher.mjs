import {cp,mkdir,readFile,writeFile,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
const root=new URL("../",import.meta.url);
const target=new URL("../.firebase-dispatcher-public/",import.meta.url);
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const name of ["index.html","assets","dispatcher","deliveries","legal"]){
 await cp(new URL(name,root),new URL(name,target),{recursive:true});
}
const config=new URL("assets/config.js",target);
const r=spawnSync(process.execPath,[new URL("tools/write-firebase-config.mjs",root).pathname],{
 cwd:root.pathname,env:{...process.env,FIREBASE_CONFIG_OUTPUT:config.pathname},stdio:"inherit"
});
if(r.status!==0)process.exit(r.status||1);
const enabled=process.env.ENABLE_DISPATCHER_UI==="true";
// The current public Pages remains locked. Only the intentionally built
// Firebase prototype can activate its UI once the real secured API is deployed.
await writeFile(new URL("dispatcher/config.js",target),
 '// Generated for Firebase Hosting. Backend authorization is still mandatory.\n'+
 'export const dispatcherConfig=Object.freeze({enabled:'+JSON.stringify(enabled)+
 ',sessionApi:"/api/dispatcher/session"});\n');
const html=await readFile(new URL("dispatcher/index.html",target),"utf8");
if(!html.includes('id="staff-login"')||!html.includes('id="inventory-panel"'))
 throw Error("Dispatcher prototype source is incomplete.");
console.log("Firebase prototype staged. Dispatcher Google UI enabled: "+enabled+
 ". API and data remain independently protected.");
