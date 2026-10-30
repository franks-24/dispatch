import {after, before, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, updateDoc, serverTimestamp} from 'firebase/firestore';

let environment;
const employerUid = 'employer-001';
const workerUid = 'worker-001';
const employerEmail = 'employer@example.com';
const workerEmail = 'worker@example.com';

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
