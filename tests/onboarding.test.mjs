import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CURRENT_POLICY_VERSION, acceptancePath} from '../assets/consent-policy.js';

const root = (path) => readFile(new URL('../'+path, import.meta.url),'utf8');

test('the authenticated onboarding form requires three independently checked acknowledgments', async () => {
 const html=await root('index.html');
 const form=html.split('<form id="onboarding-form"')[1]?.split('</form>')[0];
 assert.ok(form, 'onboarding form must exist');
 for(const id of ['consent-terms','consent-privacy','consent-ownership']){
  assert.match(form,new RegExp('<input type="checkbox" id="'+id+'" required>'));
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 for(const page of ['terms.html','privacy.html','data-ownership.html']){
  assert.ok(form.includes('href="./legal/'+page+'"'));
 }
 assert.match(html,/id="profile-name"[^>]*required/);
 assert.match(html,/id="profile-location"[^>]*required/);
 assert.match(form,/id="onboard-submit"/);
});

test('policies are real, readable pages marked for legal review',async ()=>{
 for(const doc of ['legal/terms.html','legal/privacy.html','legal/data-ownership.html']){
  const content=await root(doc);
  assert.ok(content.includes('Release '+CURRENT_POLICY_VERSION),doc+' must show current release');
  assert.match(content,/<main>/);
  assert.match(content,/<h1>/);
  assert.match(content,/Pre-launch legal review required/);
  assert.match(content,/<h2>/);
 }
});

test('frontend and security rules pin the same consent version and gate access',async ()=>{
 const [app,rules]=await Promise.all([root('assets/app.js'),root('firestore.rules')]);
 assert.equal(acceptancePath('example-uid').join('/'),'agreements/example-uid/versions/'+CURRENT_POLICY_VERSION);
 assert.ok(rules.includes('versions/'+CURRENT_POLICY_VERSION));
 assert.ok(app.includes('allAcknowledged()'));
 assert.ok(app.includes('state.hasAgreement'));
 assert.match(rules,/allow update, delete: if false/);
 assert.match(rules,/function hasCurrentAgreement\(\)/);
 assert.match(rules,/request\.resource\.data\.acceptedAt == request\.time/);
});

test('animated onboarding has a reduced-motion alternative and mobile breakpoint',async ()=>{
 const css=await root('assets/onboarding.css');
 assert.match(css,/@keyframes card-arrive/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css, /:focus-visible/);
});
