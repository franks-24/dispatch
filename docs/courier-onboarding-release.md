# Courier onboarding and shared web release

This release extends the existing application wizard and the shared red-and-white shell. It does not activate live applicant collection or change any legal approval flag.

## Implemented

- Shared navigation, footer, theme colour, action controls and policy links across customer, driver, dispatcher, operations and legal pages.
- Five preparation steps: vehicle; identity/right to work; licence, vehicle and insurance; safety screening; agreements and payout readiness.
- Vehicle cards and bicycle-specific guidance. Changing vehicle clears licence/vehicle acknowledgements.
- Explicit opt-in device saving of vehicle and checklist booleans only, plus a clear-progress action. No identity, financial details, criminal records or documents are persisted in browser storage.
- Staff task shortcuts and collapsible mandatory review checks. The server still requires an authorized reviewer and verified, unexpired evidence; checklist completion cannot approve a driver.
- www uses the same courier shell and links to the canonical application. Recruitment positioning is removed.

## South African source checks (1 November 2026)

- [Government PrDP guidance](https://www.gov.za/services/driving-licence/professional-driving-permit): goods vehicles with GVM exceeding 3,500 kg are a listed PrDP category. Other vehicle/service categories may also apply. Reviewers determine applicability; this release does not apply passenger requirements universally to couriers.
- [POPIA](https://www.justice.gov.za/legislation/acts/2013-004.pdf), sections 26–33: special personal information, including relevant criminal-behaviour information, requires a lawful processing basis. Screening providers, disclosures, access, retention and review policy must be approved before collection. A pending case is not treated as a conviction by the preview.

## Remaining activation work

Private evidence upload, provider verification, signed contract capture and the Google Drive archive are not connected by this release. Configure and verify the intended Franks24 dispatcher archive owner/folder; do not infer ownership from whichever staff account is logged in. Record file ID, document hash, policy version, signing identity and timestamp, archive success, retry state and access audit. An unsuccessful Drive operation must never be shown as archived. Payout verification and external reconciliation remain distinct from a money transfer.

No Uber agreement text, provider endorsements, commission percentage, package value/weight limits or passenger operating requirements are adopted. Franks24's own agreement, rates, deductions, VAT treatment, payout timetable and retention policy still require operator/legal approval.

## Verification

Run the repository unit suites and the Playwright applicant, readiness and shared-shell suites on desktop Chromium, mobile Chromium and mobile WebKit. These use test identities/mocked APIs and cannot certify production Google sign-in, Drive access, actual payments or physical-device operation. Validate those separately in the isolated staging environment before activation.
