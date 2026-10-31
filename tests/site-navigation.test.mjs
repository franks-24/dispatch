import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir,stat} from "node:fs/promises";
import {resolve,dirname,relative,sep} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const pages=["index.html"];
for(const folder of ["deliveries","driver","dispatcher","operations","legal"])for(const name of await readdir(resolve(root,folder)))if(name.endsWith(".html"))pages.push(folder+"/"+name);
const source=new Map(await Promise.all(pages.map(async page=>[page,await readFile(resolve(root,page),"utf8")])));
function ids(html){return [...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);}
async function destination(page,href){
 const url=new URL(href,new URL(page,"https://franks24.test/"));
 if(url.origin!=="https://franks24.test")return null;
 let path=resolve(root,"."+decodeURIComponent(url.pathname));
 assert.ok(path===root||path.startsWith(root+sep),"Link escapes the website");
 if((await stat(path)).isDirectory())path=resolve(path,"index.html");
 return {path,fragment:decodeURIComponent(url.hash.slice(1))};
}
test("every published page has one header, one footer and a complete working policy set",()=>{
 for(const [page,html]of source){
  assert.equal((html.match(/<header\b/g)||[]).length,1,page);
  assert.equal((html.match(/<footer\b/g)||[]).length,1,page);
  assert.match(html,/class="f24-header"/,page);assert.match(html,/class="f24-footer"/,page);
  assert.match(html,/assets\/site-shell\.css/,page);assert.match(html,/assets\/site-shell\.js/,page);
  const footer=html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1]||"";
  for(const policy of ["delivery-terms.html","delivery-privacy.html","delivery-data.html","deliveries/policies.html"])assert.ok(footer.includes(policy),page+" missing "+policy);
  assert.equal(new Set(ids(html)).size,ids(html).length,page+" duplicate IDs");
 }
});
test("all local links, fragments, assets and accessibility control targets resolve",async()=>{
 let checked=0;
 for(const [page,html]of source){
  for(const [,href]of html.matchAll(/\b(?:href|src)="([^"]+)"/g)){
   const target=await destination(page,href.replaceAll("&amp;","&"));if(!target)continue;
   const content=await readFile(target.path,"utf8");
   if(target.fragment)assert.ok(ids(content).includes(target.fragment),page+" → "+href);
   checked++;
  }
  for(const [,target]of html.matchAll(/\baria-controls="([^"]+)"/g))assert.ok(ids(html).includes(target),page+" missing control target "+target);
 }
 assert.ok(checked>100,"The crawler must cover the complete navigation graph");
});
test("all portals are reachable from every global navigation and launch gates remain explicit",()=>{
 for(const [page,html]of source){
  const header=html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1]||"";
  for(const portal of ["deliveries/","driver/","dispatcher/","operations/"])assert.ok(header.includes(portal),page+" missing "+portal);
 }
 const customer=source.get("deliveries/index.html");
 for(const id of ["quote-panel","booking-panel","tracking-panel","history-panel","account-panel"])assert.ok(ids(customer).includes(id));
 assert.match(customer,/id="privacy-fields" disabled/);
 assert.match(customer,/id="acceptance-fields" disabled/);
 assert.doesNotMatch(source.get("dispatcher/index.html"),/Coming soon/);
});
test("archival recruitment policies are labelled and courier links use the current draft",()=>{
 for(const file of ["terms.html","privacy.html","data-ownership.html"])assert.match(source.get("legal/"+file),/Historical recruitment policy release/);
 for(const file of ["delivery-terms.html","delivery-privacy.html","delivery-data.html"])assert.match(source.get("legal/"+file),/not approved production terms/);
});
