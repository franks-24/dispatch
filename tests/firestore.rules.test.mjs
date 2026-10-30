import {after, before, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, updateDoc, serverTimestamp} from 'firebase/firestore';

let environment;
const employerUid = 'employer-001';
const workerUid = 'worker-001';
const employerEmail = 'employer@example.com';
const workerEmail = 'worker@example.com';
const policyVersion = '2026-10-30-v1';
const agreementRef = (db, uid, version=policyVersion) => doc(db,'agreements',uid,'versions',version);
const agreement = (uid, email, overrides={}) => ({
  uid,email,version:policyVersion,
  termsAccepted:true,privacyAcknowledged:true,ownershipAcknowledged:true,
  acceptedAt:serverTimestamp(),...overrides
});

const profile = (email, role) => ({
  displayName: 'Test Account', email, location: 'Johannesburg', role,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp()
});
const job = (uid) => ({
  title: 'Dispatch shift', description: 'An open shift for validation',
  location: 'Johannesburg', type: 'Once-off', compensation: '',
  status: 'open', createdBy: uid,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp()
});
const signedIn = (uid, email, provider='google.com') =>
  environment.authenticatedContext(uid, {
    email, firebase: {sign_in_provider: provider}
  }).firestore();

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  environment = await initializeTestEnvironment({
    projectId: 'dispatch-rules-test',
    firestore: {host: '127.0.0.1', port: 8080, rules}
  });
});
after(async () => {await environment?.cleanup()});

test('new employer can register, but cannot self-approve or publish', async () => {
  const db = signedIn(employerUid, employerEmail);
  await assertFails(setDoc(doc(db, 'users', employerUid), profile(employerEmail, 'employer')));
  await assertSucceeds(setDoc(agreementRef(db, employerUid), agreement(employerUid, employerEmail)));
  await assertSucceeds(setDoc(doc(db, 'users', employerUid), profile(employerEmail, 'employer')));
  await assertFails(setDoc(doc(db, 'employerApprovals', employerUid), {status: 'approved'}));
  await assertFails(setDoc(doc(db, 'jobs', 'unverified-job'), job(employerUid)));
  await assertFails(updateDoc(doc(db, 'users', employerUid), {role: 'worker'}));
});

test('non-Google and unauthenticated clients cannot read account profiles', async () => {
  await assertFails(getDoc(doc(signedIn(employerUid, employerEmail, 'password'), 'users', employerUid)));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'users', employerUid)));
});

test('admin approval enables publishing, and revocation prevents new posts', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'employerApprovals', employerUid), {
      status: 'approved', reviewedBy: 'firebase-console', reviewedAt: serverTimestamp()
    });
  });
  const db = signedIn(employerUid, employerEmail);
  await assertSucceeds(getDoc(doc(db, 'employerApprovals', employerUid)));
  await assertSucceeds(setDoc(doc(db, 'jobs', 'approved-job'), job(employerUid)));
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'employerApprovals', employerUid), {status: 'suspended'});
  });
  await assertFails(setDoc(doc(db, 'jobs', 'revoked-job'), job(employerUid)));
  await assertSucceeds(updateDoc(doc(db, 'jobs', 'approved-job'), {
    status: 'closed', updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(db, 'jobs', 'approved-job'), {
    status: 'open', updatedAt: serverTimestamp()
  }));
});

test('workers can apply to open listings but never publish jobs', async () => {
  const db = signedIn(workerUid, workerEmail);
  await assertSucceeds(setDoc(agreementRef(db, workerUid), agreement(workerUid, workerEmail)));
  await assertSucceeds(setDoc(doc(db, 'users', workerUid), profile(workerEmail, 'worker')));
  await assertFails(setDoc(doc(db, 'jobs', 'worker-job'), job(workerUid)));
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'jobs', 'open-job'), job(employerUid));
  });
  await assertSucceeds(setDoc(doc(db, 'applications', 'open-job_' + workerUid), {
    jobId: 'open-job', applicantId: workerUid, status: 'submitted',
    createdAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, 'applications', 'open-job_other'), {
    jobId: 'open-job', applicantId: 'other', status: 'submitted',
    createdAt: serverTimestamp()
  }));
});

test('separate acknowledgments are mandatory, version-pinned and immutable', async () => {
  const uid='consent-test-001',email='consent@example.com';
  const db=signedIn(uid,email);
  await assertFails(setDoc(doc(db,'users',uid),profile(email,'worker')));
  await assertFails(setDoc(agreementRef(db,uid),agreement(uid,email,{termsAccepted:false})));
  await assertFails(setDoc(agreementRef(db,uid),agreement(uid,email,{privacyAcknowledged:false})));
  await assertFails(setDoc(agreementRef(db,uid),agreement(uid,email,{ownershipAcknowledged:false})));
  await assertFails(setDoc(agreementRef(db,uid),agreement(uid,email,{acceptedAt:new Date('2020-01-01')})));
  await assertFails(setDoc(agreementRef(db,uid),agreement(uid,'forged@example.com')));
  await assertFails(setDoc(agreementRef(db,uid),agreement('another-user',email)));
  await assertFails(setDoc(agreementRef(db,'someone-else'),agreement('someone-else',email)));
  await assertFails(setDoc(agreementRef(db,uid,'2025-old-policy'),agreement(uid,email,{version:'2025-old-policy'})));
  await assertSucceeds(setDoc(agreementRef(db,uid),agreement(uid,email)));
  await assertSucceeds(getDoc(agreementRef(db,uid)));
  await assertFails(updateDoc(agreementRef(db,uid),{termsAccepted:false}));
  await assertFails(setDoc(agreementRef(db,uid),agreement(uid,email)));
  await assertSucceeds(setDoc(doc(db,'users',uid),profile(email,'worker')));
});

test('a different Google account and a password session cannot accept or inspect consent', async () => {
  const db=signedIn('other-test-001','other@example.com');
  await assertFails(getDoc(agreementRef(db,workerUid)));
  await assertFails(setDoc(agreementRef(db,workerUid),agreement(workerUid,workerEmail)));
  const nonGoogle=signedIn('password-user','password@example.com','password');
  await assertFails(setDoc(agreementRef(nonGoogle,'password-user'),agreement('password-user','password@example.com')));
});

test('existing user profiles without current consent cannot access jobs or apply', async () => {
  const uid='legacy-user-001',email='legacy@example.com';
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(),'users',uid),profile(email,'worker'));
  });
  const db=signedIn(uid,email);
  await assertSucceeds(getDoc(doc(db,'users',uid))); // own profile is readable for migration
  await assertFails(getDoc(doc(db,'jobs','open-job')));
  await assertFails(setDoc(doc(db,'applications','open-job_'+uid),{
    jobId:'open-job',applicantId:uid,status:'submitted',createdAt:serverTimestamp()
  }));
  await assertSucceeds(setDoc(agreementRef(db,uid),agreement(uid,email)));
  await assertSucceeds(getDoc(doc(db,'jobs','open-job')));
});
