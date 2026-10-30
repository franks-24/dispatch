# Franks24 delivery backend — phase 2

This code implements the customer API from `deliveries/README.md` as a Node 22 Firebase HTTP function, backed by Firestore transactions and private Cloud Storage proof objects. It is **not deployed or enabled**. No production database edition, billing plan, credentials, carrier or Firebase login has been verified from this environment. The Firebase CLI attempt could not reach the npm registry. The frontend and function remain closed until explicitly configured.

## What is implemented

- Every customer endpoint verifies the Firebase ID token with revoked-session checking, requires verified Google identity and derives the customer partition from a SHA-256 digest of the verified UID. Customer UIDs never become unescaped Firestore paths.
- Pending quote requests, operator-issued ZAR quotes, single-use quote consumption and shipment creation are persistent. A transaction stores each mutation, its idempotency response and separate append-only policy evidence together. Equal retries replay the original result; conflicting bodies return 409. Different keys cannot book the same quote twice.
- Quotes and shipment history use descending creation-time order and customer-scoped cursor pagination. Tracking excludes recipient details, prices, storage paths and carrier credentials.
- Only the privileged operator CLI can issue prices, confirm actual carrier bookings, advance permitted status transitions and attach generation-pinned proof PDFs. There are no customer admin routes and no automatic carrier calls or invented status updates.
- Proof is served as an authenticated, no-store PDF response only after recorded delivery. It is size/content-type/signature checked and the access is audited. No signed public download link or Firebase download token is issued.
- Persistent per-customer rate limiting (60 requests/minute), bounded payloads, conservative instance limits and generic internal error responses are included. Configure edge abuse controls before public launch; customer rate limiting does not prevent unauthenticated traffic from reaching token verification.

## Production selection and configuration

The adapter targets **Standard edition, native Firestore**. Do not infer the current production edition from this source. First run in an authenticated environment:

```powershell
npx -y firebase-tools@latest firestore:databases:list --project dispatch-1491f
npx -y firebase-tools@latest firestore:databases:get DATABASE_ID --project dispatch-1491f
```

Select the existing instance deliberately. Do not provision a database or upgrade billing as an incidental installation step. If the selected instance is Enterprise, adapt and test its SDK path before proceeding; the current runtime rejects it. Runtime also reads the selected database's live metadata and refuses activation unless `databaseEdition` is explicitly `STANDARD` and `type` is `FIRESTORE_NATIVE`. Metadata lookup requires `datastore.databases.get` permission. An omitted/unspecified edition is not silently assumed to be Standard.

Set the environment values listed in `.env.example` through your deployment environment, using Firebase-supported environment configuration. Do not commit actual `.env` files, credentials or service-account JSON. `DELIVERY_DATABASE_ID` is explicit, including `(default)` when intentionally chosen. `DELIVERY_ENABLED` must stay false and `DELIVERY_POLICY_VERSION` empty until the policies and service are approved. Approved version must match the frontend; versions containing `draft` are rejected by the function wrapper.

The runtime uses Application Default Credentials from its attached service account, not browser credentials. Grant only required database/Auth/object permissions; avoid project Editor/Owner. Separate operator identities from the API identity and enable Cloud Audit Logs. The operator label is an audit annotation, **not** an authentication control. IAM and ADC establish operator authority; do not give customer identities operator credentials.

## Proof storage requirements

Use a dedicated proof bucket with public-access prevention enforced and uniform bucket-level access. No `allUsers` or `allAuthenticatedUsers` grants, public ACLs, Firebase download tokens or public signed URLs. Only the backend reads proof objects; authorised operators upload. `private-proof.rules` is a candidate deny-all browser policy for that dedicated bucket; it is intentionally **not** added to the existing storage deployment, which could affect unrelated objects. Enforce the bucket policy and IAM before setting `DELIVERY_PROOF_BUCKET`.

The operator upload is immutable (`ifGenerationMatch:0`), and shipment metadata pins its exact generation. A failed metadata transaction can leave an unreferenced private object; establish an orphan-object cleanup procedure and retention policy. No file-upload malware inspection is implemented; only authorised operators may attach approved PDF proof documents. Proof corrections require an audited administrative process; customers cannot overwrite proofs.

## Staging rollout — source only, no automatic deployment

`firebase.delivery.json` is a separate opt-in configuration. It does not change the recruitment Pages workflow or root `firebase.json`. Its hosting target is `deliveries-staging`; bind it to a deliberately selected Firebase Hosting site. Deploying Cloud Functions requires the Firebase Blaze billing plan. No billing upgrade or paid resource creation was performed here.

1. Verify the selected Standard database, IAM, private bucket, policies, operator contact and retention/deletion/export procedures.
2. Install dependencies in an environment with network access: `npm install` at the repository root and `npm install --prefix delivery-functions`.
3. Configure a staging Hosting site target using `npx -y firebase-tools@latest target:apply hosting deliveries-staging SITE_ID --project dispatch-1491f`.
4. Review the example region `europe-west1` in `index.js` and `firebase.delivery.json` against database location and data-governance requirements. Change both together before deploying; it has not been selected based on production discovery.
5. Deploy the backend **disabled** with `npx -y firebase-tools@latest deploy --only functions:franks24-deliveries --config firebase.delivery.json --project dispatch-1491f`.
6. Verify that all browser access to `deliveryCustomers/**` remains denied by the deployed Firestore rules. The root recruitment policy currently has no allow rule for these collections. Server SDK access bypasses those rules and is protected by API identity checks and IAM instead.
7. Configure Firebase's public web settings, Google provider and the staging authorised hostname. Resolve and store the final delivery policy version, then enable a staging build for controlled end-to-end testing.
8. Deploy staging static files with `npx -y firebase-tools@latest deploy --only hosting:deliveries-staging --config firebase.delivery.json --project dispatch-1491f`. No custom domain migration is implied. GitHub Pages cannot serve this same-origin API; the delivery client must use the Firebase Hosting origin or another reviewed same-origin proxy.
9. Validate new/returning Google login, cross-account denial, expired/revoked identity, quote approval, concurrent booking retries, actual carrier confirmation, tracking, PDF access and logout clearing private data. Check mobile, keyboard and screen readers. Only then decide on production activation and domain routing.

Do not enable the frontend merely because a workflow passes. Firebase web configuration remains null in the repository, delivery policies remain drafts, and carrier actions are manual until a real integration and operational process exist.

## Operator actions

Use IAM-authorised human ADC, set the selected project/database environment and `DELIVERY_OPERATOR_LABEL`, and run `node delivery-functions/operator.js COMMAND UID RECORD_ID payload.json`. Payload files must be outside Git; do not commit recipient information or proof files.

| Command | Payload | Effect |
|---|---|---|
| `issue-quote` | `{ "totalMinor": 15000, "expiresAt": "FUTURE_ISO_TIMESTAMP", "coverageApproved": true }` | Issues a pending quote for ZAR 150.00, inclusive of required charges. Verify route, parcel contents, carrier availability and actual rate before approval. |
| `advance` | `{ "status": "confirmed", "description": "Carrier collection confirmed", "carrierReference": "ACTUAL_CARRIER_REFERENCE" }` | Records confirmation only after actual carrier booking; later permitted transitions need a factual description. |
| `attach-proof` | `{ "file": "PATH_TO_APPROVED_PDF" }` | Uploads a PDF and attaches it only to an already delivered shipment. |

These are templates, not real prices, bookings or recipient records. No CLI call is part of deployment. There is no payment capture, cancellation refund, carrier webhook, automatic dispatch, customer upload or automated rate engine in this phase.

## Validation

Local dependency-free tests: `node --test tests/deliveries.test.mjs delivery-functions/tests/service.test.mjs`.

Real Firestore adapter tests: `npx -y firebase-tools@latest emulators:exec --only firestore --project demo-franks24-deliveries --config firebase.json "node --test delivery-functions/tests/firestore.test.mjs"`. The test refuses to run without `FIRESTORE_EMULATOR_HOST` and never selects production. It checks actual transaction contention, duplicate writes, quote single-use enforcement, customer-scoped pagination and browser access denial. GitHub Actions installs dependencies and loads the Functions export as an additional check.

The in-memory repository is a rollback-capable serialised **test double**, not durable storage or a production fallback. Configure Firestore TTL on rate-limit `expiresAt` if approved. Idempotency and policy evidence have no automatic TTL: decide their retention deliberately without expiring replay protection prematurely.

Official references checked with Firecrawl: [HTTP functions](https://firebase.google.com/docs/functions/http-events), [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), [Admin token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Functions deployment requirements](https://firebase.google.com/docs/functions/get-started).
