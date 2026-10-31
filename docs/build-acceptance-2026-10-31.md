# Franks24 Dispatch build and acceptance — 31 October 2026

Code completion, CI success, public preview publication and live operational acceptance are separate milestones.

| Phase | Source implementation | Remaining acceptance |
| --- | --- | --- |
| Customer onboarding | Google-only identity, saved contact profile, versioned acknowledgments, quote/booking/history/proof, privacy request capture | Real Google login; reviewed courier/POPIA notices; human privacy processing and retention |
| Driver verification | Staff intake before operational access; mandatory evidence and expiry checks; explicit human approval; suspension/expiry denial | Restricted evidence repository; real authenticity checks; approved reviewer UIDs; signed agreements |
| Dispatch | Directory authorization; quote and booking queues; verified-rate and booking attestations; transactional offers and reassignment; shipment messages; private PDF proof | Real carrier evidence; exception procedures; mobile acceptance |
| Tracking and finance | Optional active-trip GPS, stale indicators and withdrawal; immutable earnings; two-person external settlement reconciliation; 7/30/90-day performance totals with denominators | Consent/retention review; verified beneficiary; actual external bank settlement |
| Server and hosting | Firebase Functions, Standard Firestore adapter, same-origin rewrites, closed static builds, staging deployment command | Authenticated Firebase access; selected database; private buckets/IAM; Directory delegation |
| Production release | Local regression tests, CI browser/emulator tests, allowlisted publication and release revision marker | Final CI; real-account acceptance; monitoring/backups/restore; security/privacy review; controlled DNS cutover |

## Entry points and workflow

Customer desk: /deliveries/; stock capture: /dispatcher/; driver workspace: /driver/; staff vetting, dispatch and finance: /operations/.

All operational configurations stay closed on GitHub Pages. An explicitly activated Firebase staging build can enable the screens. UI flags never grant permissions.

1. Customer signs in, saves contact details, acknowledges the reviewed courier notices and requests a quote.
2. Staff record the actual inclusive carrier rate, expiry, coverage confirmation and private rate evidence reference.
3. Customer consumes the issued quote once. Staff record the actual carrier booking and offer the shipment to an approved driver with an agreed fee and due time.
4. The driver sees areas and fees before accepting. Exact addresses and recipient details appear only for an active accepted assignment. Reassignment revokes the previous driver's reads and retries.
5. Sequential progress, private proof and completion update the customer timeline, earning and performance totals transactionally.
6. Optional location collection stops when leaving the trip, signing out or closing the page. Staff see no coordinates after two minutes. Explicit Stop clears the last position; otherwise a stale observation remains until the approved retention process removes it.
7. Finance records external bank-payment evidence. A different authorized finance reviewer records verified statement reconciliation. The app does not initiate transfers.

Vetting references must point into a restricted document system. No ID, banking or medical documents are accepted into ordinary dispatcher forms. Human reviewers verify authenticity and suitability. Intake requires no operational driver account; approval links an existing verified Google/Firebase identity. Initial Google sign-in grants no driver privileges. Public self-service document upload is not included.

Driver approval and expiry are checked on each request and inside driver write transactions. Staff group membership is checked for every staff request. The Admin SDK checks revoked sessions. Legacy recruitment roles and email suffixes grant no courier access.

## Deliberate limits and follow-up work

- Carrier rates and booking remain manual, evidence-backed operations; no aggregator or carrier webhook.
- Bank settlement remains external; no payment gateway, transfer API, refunds or self-approved payout.
- Shipment messages have no fabricated read/online receipts. PSTN/Asterisk bridging and FCM notifications still need implementation and provider configuration.
- WhatsApp remains deferred and disabled. AI capture remains optional and disabled. No 3D map, invented ETA or fabricated rating.
- Performance counts actual events by UTC calendar day. It does not rank drivers automatically. Formal appeals, shift availability and renewal alerts remain follow-up work.
- PDFs are bounded, signature-checked, private and served as attachments. Malware scanning is not implemented; add quarantine/scanning before large-scale untrusted intake.
- Privacy requests enter human review. Request capture does not claim export, correction or erasure is complete.
- Queue indexes cover newly created requests. Existing records need a separately reviewed backfill; deployment does not rewrite historic data.
- Automated monitoring, restore exercises and security/abuse review are release work, not claimed complete by this change.

## Prepare and deploy

Run node tools/deploy-courier-staging.mjs to execute local regression tests and prepare a closed static artifact. This makes no cloud changes.

Actual deployment requires an authenticated Linux Google Cloud Shell checkout and installed dependencies at the root and in delivery-functions. Set the server values listed in delivery-functions/.env.example, plus DISPATCH_STAGING_SITE to an approved existing Hosting site and DISPATCH_POLICIES_APPROVED=true only after review. Configure at least two distinct finance UIDs. Use the actual Workspace customer ID and group.

The backend now uses keyless Workspace domain-wide delegation through the IAM Credentials `signJwt` API. The Google Workspace super administrator must authorize OAuth client `113546867327082803616` with the two read-only user and group-member scopes; authorization has been configured in the Admin console but real Directory API access must still be verified. Enable `iamcredentials.googleapis.com`. Grant `roles/iam.serviceAccountTokenCreator` **on `franks24-directory@dispatch-1491f.iam.gserviceaccount.com` only** to the actual Firebase Functions runtime service account, after identifying it from the deployed function configuration (or explicitly setting the correct runtime identity). Do not grant the role project-wide. The deploy script checks that the signer account and API exist; it does not create keys, require `DISPATCH_DIRECTORY_SA_JSON`, or modify IAM permissions. Do not disable the organization's service-account-key-creation restriction.

Run node tools/deploy-courier-staging.mjs --deploy. It verifies Standard/native database metadata, writes ignored server environment settings, builds the activated staging UI, deploys the three courier functions and publishes a seven-day Hosting preview. It does not select the optional WhatsApp function or change DNS/live Hosting. The functions share the existing Firebase project; review their runtime identities and settings first.

The runtime independently checks live database and private proof-bucket metadata/IAM. Credential, project, edition, directory or storage failures deny access. The pending-WhatsApp index in firestore.operations.indexes.json is needed only if that deferred feature is activated; preserve existing indexes.

## Keyless Directory activation (organization policy compatible)

1. Verify the group `dispatchers@franks24.com` exists and includes authorized staff, and that delegated administrator `support@franks24.com` has the appropriate Admin SDK permissions.
2. Enable `iamcredentials.googleapis.com` with `gcloud services enable iamcredentials.googleapis.com --project=dispatch-1491f`.
3. Identify the exact **runtime** service-account identity of `dispatcherApi` and `courierOperationsApi`. Depending on the Firebase Functions generation and configuration, this may be the default Compute Engine service account or an explicitly configured service account; do not assume which one is executing. Use the intended identity, not the Cloud Shell operator.
4. Bind `roles/iam.serviceAccountTokenCreator` on only the dedicated Directory signer, with the runtime service account as the member. Do not give token-creator privileges on the project or grant the signing role to arbitrary users.
5. Verify a real signed assertion produces a Workspace token for `support@franks24.com`, and that Directory user and `hasMember` lookups return expected status. Test ungrouped, external and suspended accounts; live rechecks must fail closed.
6. Confirm the approved policy versions, privacy terms, private bucket metadata/IAM, reviewer and two distinct finance Firebase UIDs, and **existing** Firebase Hosting staging site before running `--deploy`. This does not activate public Pages or DNS.
7. Run `node tools/deploy-courier-staging.mjs` to execute the local checks; then, after reviewer approval, run `node tools/deploy-courier-staging.mjs --deploy` from authenticated Cloud Shell. The deployed preview is a seven-day Hosting channel, not a production release.

## Cloud acceptance

1. Verify Blaze, budget alerts, explicit Standard/native database and region, private inventory/proof buckets, uniform bucket IAM, public-access prevention and attached service permissions.
2. Enable the Google provider and exact staging/custom authorized domains. Test first/returning login, canceled popup, account switching, logout and revoked sessions with real accounts.
3. Test active authorized staff, external users, ungrouped/suspended staff and group removal.
4. Review a real applicant through the restricted evidence process; test wrong identity, missing/expired evidence, approval, suspension and assignment isolation.
5. Complete one genuine quote, actual carrier booking, offer, acceptance, inventory/photo retry, delivery/POD, customer proof download and independently reconciled external settlement.
6. Test iOS/Android, keyboard access, poor connectivity, camera acquisition followed by sign-out, GPS denial and stale location.
7. Verify direct Firestore/Storage browser denial, no public proof tokens, no private caching, log retention, backups and restore/rollback.
8. Record operator acceptance and final CI before live-domain migration. Revert code through a reviewed PR while preserving operational records.

## Session blockers

Two successful Pages deployment paths were observed, while the current public dispatch-release.json returned 404 and the previous push's published-revision verification failed. The deployment workflow now refuses to publish unless Pages reports build_type=workflow. A repository administrator must select GitHub Actions under Settings > Pages > Build and deployment > Source: https://github.com/franks-24/dispatch/settings/pages. The connector does not expose that administrative mutation and the browser could not be controlled. The setting has not been changed in this session.

GitHub connector access works. Direct Git/npm network access is unavailable, no authenticated Firebase CLI/MCP is exposed, and browser attachment to the existing Google Cloud session failed. Firebase settings, database/bucket IAM, Directory delegation and real-account acceptance were not changed or verified. The earlier user confirmation of Blaze is retained; billing was not changed again.

The public preview is not a production courier launch.

