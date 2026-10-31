# Franks24 Dispatch — driver applicant-only staging activation (31 October 2026)

## Scope and current status
Source implementation only; **not deployed and not approved for public collection**. The public GitHub Pages preview remains deliberately closed. Driver Google sign-in, application status and submissions require a Firebase Hosting staging preview with a verified Google provider, an explicitly reviewed policy version, and the applicant-only Cloud Function.

**Routes**
- `/driver/`: approved-driver offers, trips and earnings. Remains closed until the separate operations release.
- `/driver/apply.html`: signed-in applicant form and review status. Disabled in the public Pages build.
- `GET /api/driver/application`: the caller's own application status, or no record.
- `POST /api/driver/application`: one idempotent, authenticated application. Basic legal name, vehicle type, area, current policy acceptance and privacy/data-use acknowledgement only. Email comes from verified Google identity.
- The isolated `driverApplicationsApi` returns 404 for all other routes, so no driver operations are exposed from applicant-only Hosting.

## Privacy and authorization boundaries
- No self-assigned role, no driver authorization from an email domain and no unsigned applicant record.
- The user may create or read only their own applicant record, located server-side using a hash of the verified Firebase UID.
- Applicant intake is review-only: it never grants trip access, offers, earnings, payment, payout details or a staff reviewer role.
- Staff review and approval remain on `courierOperationsApi` behind independent Google Workspace Directory authorization and manager UID membership. The reviewer must verify actual credentials and current accepted policy evidence.
- Driver authorization is checked on every request and inside write transactions. Driver status, credential validity, verified email and current approved policy version are enforced.
- Policy changes invalidate older approvals until a new human verification and acceptance cycle.
- The public Firestore Rules have no client grant for `dispatchDriverApplications`, `dispatchDriverApplicantIntake`, `dispatchDrivers` or the operational ledger.
- No ID, driving licence, insurance or beneficiary documents are accepted through this applicant page. Those remain in a restricted evidence store and a human-controlled vetting workflow.
- The application records a server-side acceptance timestamp with the explicitly versioned terms; it is not evidence that any **current draft** has legal approval.

## Closed-build verification
From the repository root:

```bash
npm run test:operations
npm run test:identity
node tools/deploy-applicants-staging.mjs
```

The last command without `--deploy` only builds the **closed** artifact. CI must pass including applicant browser flows on desktop Chromium, mobile Chromium and mobile WebKit.

## Applicant-only deployment (after explicit human approval)
1. Finalise the actual driver agreement, privacy notice, data-use notice, operator identity, retention rules and POPIA handling. Replace the linked draft pages with approved, effective documents. Record a new immutable `DISPATCH_DRIVER_POLICY_VERSION`. Do **not** use `draft` as a version.
2. Confirm Firebase project `dispatch-1491f`, Google provider and exact staging hostname in Firebase Auth authorized domains. Real Google SSO cannot be tested with source-only fixtures.
3. Create or verify a Standard/native Firestore database. Apply least-privilege runtime identity grants and restrict all applicant/reviewer data. Confirm budget, abuse protection, backup/retention and audit monitoring.
4. In **authenticated Google Cloud Shell**, set approved non-secret environment values and prepare `delivery-functions/.env.dispatch-1491f` with `DELIVERY_DATABASE_ID`, `DELIVERY_DATABASE_EDITION=STANDARD`, `DISPATCH_DRIVER_POLICY_VERSION`, `DISPATCH_POLICIES_APPROVED=true`, `DISPATCH_APPLICANTS_ENABLED=true`. Keep operational flags disabled; never commit the file or credentials. No Directory service-account key is required for the isolated applicant function.
5. Set `DISPATCH_STAGING_SITE` to an existing approved Firebase Hosting site. Run `node tools/deploy-applicants-staging.mjs --deploy`. This deploys only `driverApplicationsApi` and a seven-day Hosting preview. It does not change the production domain, deploy privileged operations, enable customer delivery booking or activate payments.
6. Test real first and returning Google accounts, cancelled popup, unauthorized-domain failures, unverified/disabled users, duplicate/replayed submissions, policy mismatch, other-applicant data denial, privacy notice navigation and mobile layout.
7. Test the separate staff review flow using Directory group authorization and real private evidence. Verify that unapproved, suspended, expired and stale-policy drivers receive 403 from operational APIs and cannot read other drivers' trips or earnings.
8. Only after explicit release acceptance enable the separate operations deployment and verify it in production. Publishing a static page or this pull request does **not** activate operations.

## Mandatory unresolved acceptance
Live Firebase connection, Google authorized domains, selected database edition and security IAM, final approved policy documents, private vetting store, human reviewers, CI/browser outcomes, and a live sign-in test must be recorded before marking this workflow operational.

## Isolated applicant-only Hosting and policy release verification

- A separate firebase.applicants.json config is mandatory for applicant staging. Only the driverApplicationsApi Function is routed: /api/driver/application is permitted by its handler, and all other /api/** requests return 404 from that same function. Privileged dispatcher/operations/customer delivery webhooks have no Hosting rewrite.
- The tools/build-firebase-applicants.mjs script builds .firebase-applicants-public with only the driver application page, required assets, and read-only draft policy pages. It does not copy any driver operations, dispatcher, customer booking, or administration workspace. Unknown URLs receive a closed-stage 404.
- Before any enabling build, a genuine human-approved docs/driver-policy-release.json must record the exact immutable version, approver and approval reference, responsible party, information officer contact, POPIA and retention references, effective dates and SHA-256 checksums for the three final published legal HTML documents. The checked-in release record is pending and cannot activate intake. This mechanism checks evidence but cannot legally approve a policy.
- A private environment variable DISPATCH_POLICY_RELEASE_SHA256 must match the SHA-256 of the reviewed release JSON in delivery-functions/.env.dispatch-1491f. The isolated applicant API fails closed with HTTP 503 without the expected hash format. Never commit private environment values or credentials.
- Select a separate non-production DISPATCH_STAGING_SITE rather than the default Firebase project site. The helper publishes a seven-day Hosting preview only; it does not touch production DNS, enable operations, or activate customer collection.
- Existing Firebase Google popup sign-in, private browser sessions and authenticated token API calls are source implementations, not evidence of live provider/authorized-domain testing. Validate actual first-time and returning Google users, revocation, other-user access, policy changes and multiple mobile engines before accepting the preview.
- New regression suite: node --test tests/applicant-staging-isolation.test.mjs. Existing tests and real sign-in acceptance remain required.
