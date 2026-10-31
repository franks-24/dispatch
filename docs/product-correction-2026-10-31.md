# Franks24 Dispatch — audit, product correction and release plan
Date: 31 October 2026

## Verified mismatch
The former root at `dispatch.franks24.com` advertised finding work, hiring and job applications. Franks24 is the platform brand; Dispatch is its courier and logistics service. The repository already contained a separate delivery customer preview and a Firebase HTTP backend in source. These are the foundations for the courier system.

## Changes in this PR
- Restore Franks24 as the primary brand and identify Dispatch as the service.
- Rebuild the public root around quoting, delivery booking and parcel tracking; link to existing preview only.
- Remove legacy recruitment sign-in from the public root without deleting historic user or Firestore records.
- Clarify that driver and dispatcher workspaces are future phases, not currently active.
- Strengthen draft delivery policy disclosure for driver GPS, proof access and consent boundaries.
- Keep `deliveries/config.js` disabled and noindex; no real booking or payment occurs.
- Change Pages deployment to publish only static frontend files; update landing/mobile/unit checks.

## Security and migration boundaries
The root's former Firebase user profiles had `worker`/`employer` roles. The `users`, `jobs`, `applications`, `employerApprovals` and `agreements` collections belong to the prior prototype. Do not interpret them as driver/customer/dispatcher roles or reuse approval records. Inventory and review old data/rules, retention and legal bases before any migration. Existing root `legal/*.html` pages are historic recruitment drafts, not the new courier terms.

Do not make Google browser config or successful GitHub Pages deployment synonymous with validated SSO. Verify a real Google account login, authorized custom domain, Firestore rules and first-/returning-user flow. Do not expose Firebase Admin credentials on a public site.

## Next engineering phases
1. **Customer identity and onboarding:** independently reviewed courier policies, customer profile, renewal and deletion/export; Google-only authentication.
2. **Verified drivers:** background/vehicle/licence checks appropriate to the business, authenticated driver role assigned by staff, shift availability, explicit GPS consent and safety controls.
3. **Dispatcher operations:** privileged role verification, assignment/reassignment state machine, delivery exceptions, notifications and audit trails.
4. **Server integration:** deploy secured delivery API only after selection of Firestore edition, IAM, billing approval, private proof bucket and carrier/quote workflow.
5. **Production acceptance:** real Google SSO, backend E2E and mobile tests, cross-account ownership/role isolation, rate limits, pricing integrity, and security reviews.

## Release decision
Feature branch / PR only. Merge after checks and reviews. GitHub Pages may deploy the new public landing on merge, but the delivery backend and payment/booking capabilities remain disabled. Rollback is a PR revert; do not delete data or disable authentication controls as a rollback shortcut.

## Internal staff directory for Dispatcher

Per the operational identity model, verified active users in the internal Google Workspace Directory who are in the approved Dispatcher group sign in through `/dispatcher/`. Public customers use the customer delivery desk; drivers require their own verification process. A server-side `dispatcher-auth.js` authorizer verifies Firebase Google identity, Directory customer ID, active status and group membership. The staff UI fails closed while Directory credentials, the trusted same-origin session backend and Google SSO remain unconfigured. See [Dispatcher identity design](dispatcher-workspace-identity.md).
