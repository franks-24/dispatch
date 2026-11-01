import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../driver/apply.html',import.meta.url),'utf8');
const wizard=await readFile(new URL('../driver/courier-wizard.js',import.meta.url),'utf8');
const readiness=await readFile(new URL('../driver/readiness.js',import.meta.url),'utf8');
function boot(saved){
 const dom=new JSDOM(html,{url:'https://dispatch.franks24.test/driver/apply.html',runScripts:'outside-only'});
 if(saved)dom.window.localStorage.setItem('franks24:courier-readiness:v1',saved);
 dom.window.eval(wizard);dom.window.eval(readiness);
 const {document,Event}=dom.window;
 return {dom,document,change(node){node.dispatchEvent(new Event('change',{bubbles:true}));}};
}
test('readiness is opt-in, restores only allowlisted metadata, and clear removes it',()=>{
 const {dom,document:d,change}=boot();
 const radio=d.querySelector('[value="bicycle"]');radio.checked=true;change(radio);
 assert.equal(dom.window.localStorage.length,0);
 const remember=d.getElementById('save-readiness');remember.checked=true;change(remember);
 const raw=dom.window.localStorage.getItem('franks24:courier-readiness:v1');
 assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),['checks','vehicle']);
 const restored=boot(raw);
 assert.equal(restored.document.querySelector('[value="bicycle"]').checked,true);
 d.getElementById('clear-readiness').click();
 assert.equal(dom.window.localStorage.length,0);assert.equal(radio.checked,false);
 restored.dom.window.close();dom.window.close();
});
test('vehicle changes reset licence/vehicle readiness; wizard blocks missing selection',()=>{
 const {dom,document:d,change}=boot();const f=d.getElementById('readiness-form');
 const next=[...f.querySelectorAll('button')].find(b=>b.textContent==='Continue');
 next.click();assert.equal(f.querySelector('[data-step]').hidden,false);
 const bicycle=f.querySelector('[value="bicycle"]');bicycle.checked=true;change(bicycle);next.click();
 assert.equal(f.querySelectorAll('[data-step]')[1].hidden,false);
 assert.match(d.getElementById('vehicle-guidance').textContent,/not required/);
 f.elements.licence.checked=true;f.elements.vehicle.checked=true;
 const van=f.querySelector('[value="van"]');van.checked=true;change(van);
 assert.equal(f.elements.licence.checked,false);assert.equal(f.elements.vehicle.checked,false);
 assert.match(d.getElementById('licence-guidance').textContent,/gross vehicle mass/);
 assert.equal(d.getElementById('application-panel').hidden,true);
 dom.window.close();
});
test('corrupt or inaccessible local storage does not break readiness',()=>{
 const first=boot('{invalid');assert.match(first.document.getElementById('save-readiness-status').textContent,/unavailable/);first.dom.window.close();
 const {dom,document:d,change}=boot();Object.defineProperty(dom.window,'localStorage',{get(){throw Error('blocked');}});
 const remember=d.getElementById('save-readiness');remember.checked=true;change(remember);
 assert.match(d.getElementById('save-readiness-status').textContent,/cannot save/);
 d.getElementById('clear-readiness').click();assert.match(d.getElementById('save-readiness-status').textContent,/Clear this site/);
 dom.window.close();
});
