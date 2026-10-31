# Franks24 Dispatch — Driver identity, vetting, job lifecycle, payments, tracking and performance

**Implementation proposal — 31 October 2026. Not deployed.** This extends the courier and inventory modules in PR #17; it does not revive the former recruitment `worker` / `employer` application.

## 1. Personas and separation of duties

| Actor | Can do | Cannot do |
| --- | --- | --- |
| Applicant driver | Authenticate, submit profile and KYC evidence, check status, correct requested data, withdraw application | View or accept delivery jobs, other drivers, payout batches, private dispatch records |
| Approved driver | Set availability, view eligible offers, accept assigned job atomically, navigate, share in-trip GPS with informed consent, capture POD, view own ledger and feedback | Edit tariffs, approve their own KYC, approve own payouts, self-award ratings, see unrelated customers |
| Dispatcher Frank (`admin@franks24.com`) | Review/approve/suspend drivers subject to policy; assign/reassign jobs; monitor active fleet, communicate; resolve exceptions; audit outcomes | Circumvent consent, alter immutable evidence or falsify delivery completion |
| Support operator (separate identity) | Handle tickets and request re-verification as specifically delegated | Automatically approve KYC, payouts or unrestricted personal-data access |
| Finance reviewer | Verify settlements, payment details, release batches subject to separate approval | Edit completed deliveries or self-approve a changed bank account |

Backend derives roles from verified credentials and the authoritative directory/approval records. Never trust `role`, `approved`, `earnings` or `driverId` supplied by the client.

## 2. Driver access journey (mobile-first)

`/drivers/` is a separate Franks24 Dispatch portal (not `/dispatcher/`).

1. **Join as a driver** — explain requirements, earnings model, privacy and expected response timeline; no claim of guaranteed work or income. Google Sign-in is the first Firebase path; evaluate phone OTP as a separately enabled alternative for drivers without Google accounts. Require verified contact details.
2. **Onboarding form** — legal name, phone, service area, transport type (bicycle, motorbike, car, bakkie, van), capacity, vehicle details, emergency/support channel, consent/notice acknowledgments. Collect minimum identity documents securely; avoid displaying personal IDs in normal dispatcher list views.
3. **KYC/KYB & safety** — identity and work eligibility appropriate to legal position; appropriate driving licence; vehicle ownership/permission, registration, fitness/insurance per actual vehicle and service, and **PrDP where legally required by vehicle category**, not universally. South African Government: https://www.gov.za/services/driving-licence/professional-driving-permit . Obtain permission for any external background verification and a lawful basis for storing evidence. Collect verified payout beneficiary details through a confidential workflow, not public messages.
4. **Pending review** — driver sees `Submitted → In review → More information requested / Approved / Declined` and can submit corrections only after request. Backend rejects job access in pending and rejected states.
5. **Frank's review console** — see queue sorted by submitted date, evidence checklist, document expiration, notes, tamper-evident audit history; choose `Request changes`, `Approve`, `Decline` or `Suspend`, enter a reason. Sensitive document download is authorised, audited and temporary; never in a public bucket. A payout-detail change triggers verification and a payment hold. Approval requires verified checks and acceptance of current driver contract.
6. **Approved first login** — show driver's home: online/offline status, today's offers, active assignment, navigation, contact dispatcher, completed jobs, earnings and account standing. Use server-side checks on every operation. A role claim can help render UI, but **current approval/suspension is checked at the backend** even if a Firebase token is unexpired.
7. **Recurring re-verification** — expiry alerts for licences/insurance, suspension or a verification hold when required evidence expires, and auditable reinstatement by an authorised reviewer. Revocation must immediately block new assignments and private reads.

## 3. Driver screens

- **Sign in / Apply**: minimal role explanation, Google account choice, clear separation from internal dispatcher sign-in.
- **KYC checklist**: progressive stepper (Profile → ID & licence → Vehicle → Banking → Legal acknowledgments → Submit). Save draft; upload directly to a private protected endpoint, file-type/size checked, optional virus scan, retention rules.
- **Application status**: read-only progress, date, actionable missing evidence, contact support. No fake `approved` badge.
- **Home**: shift state, active delivery, available offers count, weekly *accrued* earnings, latest payout status, support button. Never require typing while driving.
- **Job offer**: approximate pickup/drop zones, parcel size/weight, expected km/time, service level, promised time, **driver compensation and deductions shown before acceptance**, expiry timer. Do not reveal full recipient personally identifying information until assignment is accepted and valid.
- **Active job**: large action cards `Navigate`, `At pickup`, `Collected`, `Delayed`, `Need assistance`, `Delivered`; barcode scan, photos/POD, dispute/retry; emergency voice contact. Driver can operate while parked; do not prompt driving-time text entry.
- **Earnings**: immutable ledger rows per completed job, amounts in ZAR, adjustments, disputes, settlement period, payout reference/state; clearly distinguish earnings accrued, payable, processing and paid.
- **Performance**: measurable service outcomes, applicable policy and data definitions, customer feedback with context, right to contest unfair/factually incorrect ratings, coaching actions; never hide underlying denominator.
- **Settings**: contact/vehicle document renewals, bank-verification status, consent and location controls, data-access request and account deletion/retention information.

## 4. Job assignment and state machine

`created → quoted → booked → offered → accepted → at_pickup → collected → in_transit → delivered / exception → reconciled`

No self-issued driver booking. Frank may explicitly assign a driver or a backend matcher may issue offers only to **approved, eligible, available** drivers (vehicle class, area, verified capacity, expiry, workload). An offer expires; a transaction atomically accepts it and assigns the shipment to exactly one driver, with `version` and idempotency key preventing race conditions. Other offers are invalidated and notified of closure. Record every state event and human actor. Reassignment revokes prior driver's customer-data access and driver messages, and logs the reason.

Driver receives time-limited job and route details only after accept; status events must reflect actual observed work. POD should include verified event timestamp, recipient confirmation where applicable, restricted photo/signature and optional geolocation if consented; no success inferred from device GPS proximity alone. Exception handling is manual with dispute trail.

## 5. GPS and visual tracking

- Consent/notice explains active-trip GPS purpose, recipients, retention, precision and revocation. Track **only when on an accepted active assignment**, not on off-duty shifts. Disable location tracking at delivery end.
- Driver mobile app/PWA requests permission and emits sampled `lat,long,accuracy,timestamp,shipmentId` over authenticated HTTPS. Permission denied/offline/inaccurate points produce a visible `location unavailable/stale` state, never interpolated live movement.
- Dispatch map plots last verified position, time last seen, route progress, stops and an **estimated** ETA when mapping APIs and real traffic/route data are configured. Customer-facing tracking is privacy-filtered and time-bounded. Basic 2D Google Maps or another provider precedes any 3D overlay.
- Minimise retention of raw high-precision history, exclude unrelated locations, rate-limit location submissions, protect addresses and map API keys, support deletion/export procedures.

## 6. Driver compensation and settlement

**Business policy needed before activation**: employment vs independent contractor classification, ZAR fee schedule, whether base pay is per trip/km/time or zones, surcharges, waiting time, cancellation, fuel, taxes, deductions, refunds, liability, invoice requirements and settlement frequency. Do not promise an earnings formula not yet approved.

Recommended pilot: server-calculated fixed driver fee per confirmed job, optional approved per-km/exception supplements; no browser-set fares. On verified completion, add an immutable ledger credit, with approved adjustments as separate reversing entries. Finance review validates beneficiary and bank change before batching. Payout run idempotency ensures no duplicate payment; payment gateway/bank reference and reconciliation determine `paid`. **No auto-payout from GPS, POD upload alone or customer rating.** Show a weekly *proposed* settlement cycle with an explicit policy note until terms are approved. Customer payments and driver payouts are separate reconciled ledgers.

## 7. Quality scoring, fair ratings and operational KPIs

Only confirmed jobs count toward completion metrics. Start with transparent operational metrics instead of a single opaque AI score:

| Metric | Definition | Responsible caveat |
| --- | --- | --- |
| Completion rate | Confirmed completed assignments ÷ accepted assignments eligible for completion in window | Exclude still-active jobs; show exceptions / cancellation reasons |
| On-time delivery | Completed jobs at/before agreed customer delivery window ÷ completed jobs with valid promised window | Distinguish weather, customer unavailability and dispatch-side delays |
| Acceptance rate | Accepted eligible offers ÷ eligible offers delivered to driver | Exclude expired/unseen offers when push delivery not confirmed |
| Pickup punctuality | Pickups within agreed window ÷ pickups with logged appointment and arrival evidence | Show missing timestamps rather than guessing |
| POD compliance | Completed deliveries with valid POD ÷ completed deliveries requiring POD | Type, metadata integrity and consent |
| Service responsiveness | Acknowledged messages / contact attempts, with median response time | Do not punish active driving or offline periods |
| Customer feedback | Median or average verified post-delivery stars, plus count and disputes | Minimum sample threshold before public score; no self-rating |
| Earnings | Completed-trip earnings, approved adjustments, paid amount, and outstanding payable | Amounts are not profitability or guaranteed minimum |

Show trailing 7/30/90-day filters, transparent numerator/denominator, comparison to own prior period and fleet average only if adequate sample size. Keep `not enough data` instead of zero stars. Driver rating is an explanatory composite only if weights are documented and manually appealable. For pilot, propose 40% punctuality, 30% completion/POD, 20% verified service feedback, 10% response/incident resolution as **a draft—not enforced or used for automatic suspension**. Do not reward speeding or unsafe driving.

Dispatcher KPI dashboard: onboarded vs pending drivers, document-expiry backlog, offers accepted, median dispatch-to-accept, first-attempt delivery, delivery SLA, cost per delivery, claim/exception rate, payout outstanding, data freshness/GPS consent coverage, driver retention, review-to-approval median days, support response.

## 8. API and data architecture (proposed, not deployed)

- Firebase Auth for login; driver session service verifies Firebase token, KYC state, suspension and current required agreements. Only privileged Admin SDK server can change `approvalStatus`. Custom claims may cache a coarse role, never the sole grant for changed approval.
- `driverApplications/{uid}` : status, verification checklist, permitted edits, reviewer/reason/timestamps; private documents in restricted Cloud Storage.
- `driverProfiles/{uid}`, `driverVehicles/{uid}/vehicles/{id}`, `driverDocumentMetadata/{uid}/... ` : scoped minimum data.
- `driverOffers/{offerId}`, `deliveryAssignments/{shipmentId}`, `deliveryEvents/{shipmentId}/{eventId}` : transaction-bound state.
- `driverTripLocations/{shipmentId}/points/{id}` : strictly time/assignment-scoped, TTL/retention with privacy review.
- `driverLedger/{uid}/entries/{entryId}`, `driverPayoutBatches/{batchId}`, `driverDisputes/{id}`, `driverRatings/{uid}/reviews/{reviewId}`: append-only evidence and audited revisions.
- `driverApprovalAudit/{eventId}`, `driverSecurityEvents/{eventId}`: who approved/denied/revoked, when and why; least-privilege and no raw identity tokens in logs.
- Candidate routes: `POST /api/drivers/applications`, `GET /api/drivers/me`, `GET /api/drivers/offers`, `POST /api/drivers/offers/{id}/accept`, `GET /api/drivers/active`, `POST /api/drivers/assignments/{id}/events`, `POST /api/drivers/assignments/{id}/location`, `GET /api/drivers/earnings`; dispatcher `/api/dispatcher/drivers/applications`, `.../{uid}/review`, `.../{uid}/suspend`, `.../{uid}/assign`, `.../metrics`.
- Do not migrate/relabel recruitment `users`/`jobs`/`applications` collections as courier resources.
- Cross-account API and Firestore tests for unapproved users, changed/suspended/expired driver, race-to-accept, reassignment, stale JWT, bank change, forged price/payout, location drift and revoked notification tokens.

## 9. Phased acceptance criteria

**MVP1 — Application & Frank approval**: functional /drivers/ onboarding, resumable KYC, private uploads, proper status lifecycle, protected Frank approval UI, verified email/mobile, manual review, status notifications, role guards. All unapproved drivers consistently see "Under review" and receive 403 for jobs.

**MVP2 — Operations**: real dispatcher offers and driver claim/accept, transactional assignment, secure job statuses + POD, exceptions and communications.

**MVP3 — Finance**: signed commercial agreements, transparent fee calculation, immutable earnings ledger, approved bank payout integration and reconciliation.

**MVP4 — Telemetry and scorecards**: opt-in active-job GPS, map, verified SLA/quality KPIs, appealable reviews, privacy/retention controls and dashboard exports.

**Launch blockers**: Firebase project billing/Hosting and Functions deployment, Google authorised domains, real dispatcher Workspace group verification, staffed KYC procedure, reviewed delivery/driver agreements, PO[P]IA privacy basis and retention, IAM and private Storage, provider integrations, and production tests. Code being merged does **not** mean these are complete.

## Documentation

- [South African government — Professional driving permit](https://www.gov.za/services/driving-licence/professional-driving-permit). Applicability depends on vehicle category; verify motorbike/light vehicle legal requirements with advisers.
- [Firebase — Role claims and Security Rules](https://firebase.google.com/docs/auth/admin/custom-claims): role claims must be server-issued; operations verify tokens and current authorization.
- [POPIA section 19 security safeguards](https://api.acts.co.za/protection-of-personal-information-act-2013/19__security_measures_on_integ.php): reasonable technical and organisational protection for personal information.
- [Driver communications](driver-communications-safety.md): voice-first, safe use of chat, no unsafe driving-time interaction.
