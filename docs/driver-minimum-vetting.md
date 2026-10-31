# Franks24 Dispatch — Minimum driver vetting and approval gate (South Africa)

**Status:** Proposed business policy, 31 October 2026. Human approval and production integration are not implemented by this document. Apply to all applicants before an operational driver account is enabled. This does not reuse any historic recruitment role or document collection.

## Precise access rule

**An applicant does not receive an operational driver account, job feed, customer details, location data, messaging, or payment functionality until all mandatory checks pass and an authorised reviewer records approval.**

The public Driver entry point may show eligibility rules and open a **limited, non-operational application form**. A short-lived, single-use verification link or OTP allows the applicant to upload their own records and later retrieve *only their own application status*. This temporary application identity is not a driver role and cannot authenticate to dispatch APIs. After approval, create/link a separately verified Firebase Auth UID and activate the driver profile with a server-assigned role and an explicit timestamp; deny all operational endpoints by default.

## Pre-screen: minimum eligibility questions shown before document collection

| Rule | Minimum threshold | Decision |
| --- | --- | --- |
| Age | At least 18 as **Franks24 pilot policy**; permit-specific ages remain independently applicable | Under 18 → do not progress to driver onboarding |
| Legal eligibility | Valid identification and legal right to perform the proposed work in South Africa | Missing / cannot verify → hold, then decline if unresolved |
| Contact | Controlled, verifiable mobile number and email or equivalent recovery method | Failed verification → hold |
| Vehicle | Select bicycle, motorbike, car, bakkie or van; specify service area and capacity | Unsupported vehicle/service area → waitlist, not an unverified approval |
| Licence | A current category-appropriate licence for any motorised vehicle; any lawful restrictions satisfied | Expired/wrong/suspended → deny approval |
| PrDP | If the vehicle/service is legally in a PrDP category, check **current permit in correct category** | Missing when required → deny approval |
| Vehicle permission | Registered/licensed vehicle and permission to use it for courier work, with relevant safety inspection | Invalid ownership/permission/registration → hold/deny |
| Insurance | Policy/contractual courier-use cover requirements matched to service and cargo risk | Missing agreed coverage → no assignment in affected category |
| Conduct | Accept safety policy, accurate item scan/POD, incident reporting, no unlawful phone use while driving | Refused → deny approval |
| Data | Acknowledge a plain-language POPIA notice and required driver contract terms; separate opt-in for non-essential location/marketing | Missing essential acceptance → deny activation; no blanket forced consent to optional processing |

**Note:** A goods PrDP is generally needed for goods vehicles exceeding 3 500 kg GVM and for other specific classes, not for every scooter, light car or bakkie merely because it carries parcels. Goods-category PrDP minimum age is 18, passenger 21 and dangerous goods 25. Verify the actual vehicle code, mass and use against the licensing authority. Standard Code A/A1, B, C1 etc. categories are vehicle specific. [South African Government: PrDP](https://www.gov.za/services/driving-licence/professional-driving-permit), [driving licences](https://www.gov.za/services/driving-licence/apply-driving-licence).

## Mandatory approval evidence (only after pre-screen)

- [ ] **Identity**: Government-issued ID/passport and any required right-to-work evidence, checked for authenticity, date of birth and matched names. Never require unnecessary ID data in ordinary dispatcher views.
- [ ] **Contact**: phone and recovery email independently verified; applicant not a duplicate currently suspended identity (flag duplicates for manual resolution rather than automatic rejection).
- [ ] **Driver authority**: motorised vehicle licence class, status, expiration and restrictions; valid PrDP when legally applicable; PrDP medical and criminal-check requirements handled by the licensing authority, not indiscriminately copied into the app.
- [ ] **Vehicle**: current licence disc/registration; owner permission if borrowed, employer-supplied or leased; vehicle type/plate and payload fit; documented safety inspection and statutory roadworthy evidence where required. Light private vehicles do not universally require annual roadworthy certificates; Franks24 may impose a risk-based inspection for service quality. [Gov: roadworthy](https://www.gov.za/services/services-residents/driving/roadworthiness/roadworthy-certificate).
- [ ] **Insurance**: verify insurer or fleet commercial-use and applicable goods-in-transit/liability policy **as a Franks24 contract condition**, not a universal legal requirement; record policy expiry and load limits. If Franks24 covers vehicle/cargo centrally, capture that assignment rather than insisting each driver buys duplicate insurance.
- [ ] **Risk review**: incident/claims and relevant background-screening only where lawfully justified and proportionate, with transparency, lawful basis and opportunity to explain/dispute incorrect results; no blanket unrelated criminal-history disqualification.
- [ ] **Payout**: verify beneficiary and banking channel privately before first payable assignment. Only finance can release a payout, and every bank change causes re-verification and payout hold.
- [ ] **Terms and safety**: signed driver agreement reflecting employment/contractor classification, fees and deductions, privacy notice, optional active-trip GPS disclosure, handling/POD rules, incident escalation and safe communications guidance.
- [ ] **Reviewer decision**: Frank or authorised independent KYC reviewer marks each mandatory criterion *verified* with check timestamp, evidence reference and expiry where relevant, and records `approved` / `needs_information` / `declined` with a reason. AI/OCR suggestions are never the final approval.

### Approval decision

```text
eligibility_passed AND identity_verified AND right_to_work_verified
AND phone_verified AND (bicycle OR appropriate_licence_verified)
AND (PrDP_not_applicable OR PrDP_verified)
AND vehicle_eligible AND vehicle_right_to_use_verified
AND necessary_insurance_verified AND required_terms_accepted
AND payout_beneficiary_verified AND manual_reviewer_approval
AND no_active_hold_or_suspension
=> activate approved driver role / issue normal driver login
ELSE => limited application access ONLY
```

The example expresses a **Franks24 policy**, not a definitive legal checklist. Require competent review of labour classification, PrDP applicability, courier coverage and POPIA before launch. Do not automatically reject based on sensitive/protected personal characteristics.

## Operational lifecycle and auditable data model

**Status transitions:** `pre_screened → application_started → submitted → in_review → needs_information → approved | declined`, with `approved → suspended → re_review → approved | closed`. Record who reviewed, when, decision code, evidence references, expiry times and reason; each decision is immutable audit history. Applicant corrections retain history but must not expose other users' evidence.

**Review queue (Frank):** pending applications, *verified / missing / expires soon* per check, ability to request corrections, details available only through a restricted document viewer, documented approve/decline, no override of expiry, repeat identity evidence or unresolved risk issues.

**On approval:** platform creates/verifies auth identity and role; access to jobs remains scoped to approved driver, vehicle classes, region and availability. Each offer/assignment, payout and GPS endpoint re-verifies current approval + assignment. Suspended/revoked drivers immediately lose jobs, contact/location/recipient data; prior delivered-job records remain accessible only according to retention obligations.

**Renewal:** check licence, PrDP, insurance and vehicle documentation expiry daily with time-limited alerts. Any expired mandatory credential blocks new matching assignments and queues a human re-review. GPS permission may be refused or revoked without loss of unrelated account access; an assignment requiring live location must clearly disclose its own conditions.

## Operational safeguards and regulatory basis

Use HTTPS, private object storage, MFA for reviewers, scoped service accounts, least-privilege rules, encrypted evidence, short-lived access links, audit trails, data minimisation, retention schedules, applicant correction/appeal mechanism and deletion/export process. Distinguish acceptance of the **privacy notice** from specific **consent** where consent is the appropriate legal basis; do not treat broad acceptance as permission to track a person off duty. Background records and biometric checks need separate legal assessment. [POPIA](https://www.justice.gov.za/legislation/acts/2013-004.pdf).

**Definition of done:** the backend denies operational token access in all preapproved states; expired docs/suspension revoke privileges without waiting for client session refresh; no applicant can self-grant approved status, browse other applications, or access private driver/customer records. Complete user, reviewer, cross-account, stolen-session, stale-claim, mobile and audit tests before production.
