# Dispatch Firebase launch checklist

**Firebase project:** `dispatch-1491f` (**1068135038943**)  
**Plan:** Spark  
**Repository:** `franks-24/dispatch`  
**Web hosting:** GitHub Pages, intended domain `dispatch.franks24.com`. No Vercel or billing upgrade required for the defined MVP.

## 1. Register and configure the Firebase Web app

1. Open [Project settings](https://console.firebase.google.com/project/dispatch-1491f/settings/general). Create/select a Web app called **Dispatch Web** under **Your apps**.
2. Copy the **public** Firebase Web SDK configuration into the GitHub repository Actions **variable** `FIREBASE_WEB_CONFIG_JSON`: [Repository variables](https://github.com/franks-24/dispatch/settings/variables/actions). Provide the JSON object, not `<script>` tags or JavaScript statements. The `tools/write-firebase-config.mjs` script validates that `projectId === "dispatch-1491f"`, `authDomain === "dispatch-1491f.firebaseapp.com"` and the application ID belongs to the expected sender before generating `assets/config.js` for GitHub Pages.
3. **Never** commit service-account JSON files, Admin SDK private keys, OAuth client secrets or server credentials. The Firebase Web SDK configuration is public even when transported via a repository variable; authorization is enforced by Firebase Authentication and Firestore rules. Do not interpret API-key exposure as a credential leak.
4. Enable **Authentication > Sign-in method > Google** and configure the support email. Disable other sign-in methods if Google-only is required.
5. Under **Authentication > Settings > Authorized domains**, add the actual web origin `dispatch.franks24.com`. If testing the GitHub Pages fallback, authorize `franks-24.github.io` too. Only authorize domains you control. Add localhost only for local development when required.

## 2. Create and protect Cloud Firestore

1. In Firebase Console, create a **Cloud Firestore** database in an appropriate region; evaluate residency, latency and irreversible location choice before proceeding.
2. Start with restrictive security rules. Publish the reviewed `firestore.rules` either through **Firestore > Rules** in the console or using the Firebase CLI with access to this project:
   `firebase deploy --only firestore:rules --project dispatch-1491f`
3. Publishing GitHub Pages does **not** publish Firestore rules. Treat these as separate deployment steps.
4. Run the emulator tests locally using `npm install` and `npm run test:rules`, which uses a disposable emulator project, not production Firestore.

## 3. Employer verification / moderation policy

**Any Google user can register.** Employer accounts remain unverified until reviewed. An administrator — not the employer — grants approval.

- The user profile lives at `users/{firebaseAuthUid}`, where `role` is either `worker` or `employer`. Role cannot be self-changed after account creation.
- Privileged approval records live at `employerApprovals/{firebaseAuthUid}`. The ID **must equal the employer's Firebase Auth UID**.
- For an approved account, an administrator writes the following fields using the Firebase Console Firestore data interface (or a privileged Admin SDK):
  - `status`: string `approved`
  - `reviewedBy`: string identifying the reviewer
  - `reviewedAt`: Firestore timestamp
- For rejected/suspended accounts, set `status` to `rejected` or `suspended` (or delete the approval document). Publishing is denied unless the status is exactly `approved`.
- No unprivileged web user can create, update, delete or list approval documents. Signed-in users can read only their own approval document. Firestore rules check approval *on every job create*, and again when reopening a closed job. This remains enforced even if someone bypasses the UI.
- Existing jobs can be closed after revocation, but cannot be reopened.
- Restrict Firebase Console / IAM administration to designated reviewers and retain an approval audit trail. Do not create a browser-accessible privileged approval endpoint on Spark.

**Manual approval process:** Review employer identity and organization evidence outside the app; obtain its Firebase Auth UID from the Auth console or the `users` collection; create `employerApprovals/{uid}` with `status=approved` and reviewer metadata in Firestore. Ask the employer to select **Check status** in their workspace. Never ask an employer to provide service-account credentials.

## 4. Verify the live Google SSO and job workflow

- First-time Google user selects job seeker or employer and completes onboarding.
- Returning Google user sees their existing role-specific dashboard.
- Unverified employer sees approval-pending notice and cannot publish a job via UI or direct Firestore SDK call.
- Verified employer can publish; revoked employer cannot publish or reopen.
- Job seeker sees only published open jobs and can apply once per job; unauthenticated reads and cross-account writes are denied.
- Sign-out restores the public landing page. Verify on desktop and mobile.
- Confirm domain DNS, GitHub Pages certificate and Firebase authorized-domain configuration independently.
- Do not add fake jobs, sample customer profiles or demonstration accounts to production.

## 5. Spark constraints and later phases

Use Google Authentication + Firestore + static GitHub Pages hosting. Monitor Firestore reads/writes, usage quotas and abuse. Cloud Functions require **Blaze** for deployment, so automated review emails, server-side moderation, background processing and privileged admin APIs are deferred until billing and architecture are explicitly approved. Firebase App Check and analytics can be evaluated after the authentication flow is working, with enforcement introduced carefully.

## Remaining manual dependencies

- The Firebase Web App config has been supplied, but the GitHub Actions **variable** `FIREBASE_WEB_CONFIG_JSON` still needs an administrator to set it. `assets/config.js` deliberately remains unconfigured in source control and is generated by the deployment workflow.
- Authentication provider and authorized domains must be set in Firebase Console.
- Firestore database and security rules must be published to the actual Firebase project.
- First real Google login, employer approval and job application must pass end-to-end production/staging validation.

## 6. Consent-first onboarding and release-control checklist

- Review and approve the linked [Terms](../legal/terms.html), [Privacy Notice](../legal/privacy.html), and [Data Ownership & Usage Policy](../legal/data-ownership.html). They are explicitly **pre-launch drafts**.
- Identify the exact responsible legal entity, physical address, Information Officer, official support/privacy contact, accessible complaints process, data retention schedule and erasure/export operations. Ensure POPIA and third-party transfer obligations are addressed before launch.
- Confirm the active release identifier `2026-10-30-v1` in the three policy page footers, `assets/consent-policy.js` and `firestore.rules`. Change all together for a materially new release; never silently reuse a previous release identifier.
- Verify all three checkboxes are clear on first load, separately actionable, linked to complete legal documents and required for submission. An acknowledgment of the Privacy Notice is not optional marketing consent.
- Acceptance records are stored in `agreements/{uid}/versions/{release}` with `uid`, `email`, `version`, `termsAccepted`, `privacyAcknowledged`, `ownershipAcknowledged`, and Firestore server `acceptedAt`. The client may create but never update/delete. A privileged controller must process valid erasure requests according to legal duties.
- Activate updated Firestore Security Rules **before** deploying the new UI. Rules enforce current consent before profile creation and job/application access; existing profiles without consent are returned to the agreement screen.
- Execute `npm run test:onboarding`, `npm run test:rules`, then verify a fresh Google session, return session, non-Google denial, older profile migration, employer approval, applications, mobile screens and keyboard navigation. Do not assume successful static hosting means production consent capture works.
- The landing page is reachable on GitHub Pages. Google SSO cannot be claimed functional until the public config variable, Google provider, authorised domain, Firestore database and rules are activated and a real sign-in succeeds. Firebase Spark is sufficient for this authentication/onboarding MVP; no Vercel is used.

## 7. Config deployment and validation

The GitHub Pages workflow runs `node tools/write-firebase-config.mjs` with the repository Actions variable `FIREBASE_WEB_CONFIG_JSON`. A missing, malformed or foreign-project configuration stops deployment before Pages upload. Run `npm run test:config` to check correct output and negative tests. Because the project currently uses native browser ES modules, npm dependencies are used for testing and Firebase emulators, not production bundling. Analytics is not automatically enabled merely because `measurementId` is present; review privacy and consent before adding measurement collection.
