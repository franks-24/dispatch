# Franks24 — Dispatch courier and logistics

[![Deploy GitHub Pages](https://github.com/franks-24/dispatch/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/franks-24/dispatch/actions/workflows/deploy-pages.yml)
[![Delivery client tests](https://github.com/franks-24/dispatch/actions/workflows/delivery-tests.yml/badge.svg)](https://github.com/franks-24/dispatch/actions/workflows/delivery-tests.yml)
[![Identity and landing tests](https://github.com/franks-24/dispatch/actions/workflows/identity-tests.yml/badge.svg)](https://github.com/franks-24/dispatch/actions/workflows/identity-tests.yml)

**Platform brand:** Franks24. **Service:** Dispatch — courier bookings, delivery operations and shipment tracking.

**Public domain:** https://dispatch.franks24.com/ · **Customer preview:** https://dispatch.franks24.com/deliveries/ · **Firebase project:** `dispatch-1491f` · **No Vercel**.

## Current capabilities and production status

| Area | Status |
| --- | --- |
| Branded responsive landing | Implemented on `/`, linking to quote / booking / tracking previews |
| Google identity | Firebase browser config injected during GitHub Pages publication; live human Google SSO **not yet verified** |
| Customer delivery desk | `/deliveries/` has request forms, shipment history, tracking timeline, proof retrieval client; **disabled** |
| Backend API | `delivery-functions/` provides Firebase HTTP function, Firestore transaction adapter, operator CLI, idempotency and proof protection in source; **not deployed** |
| Driver and dispatcher workspaces | Planned; not yet implemented or authorized for public use |
| Live pricing, bookings and payments | **Unavailable**. No fabricated quote, carrier confirmation, location or delivery event |
| Delivery policies | Draft only; operator/legal/POPIA/privacy review required |
| Hosting | GitHub Pages publishes static files; backend hosting and billing require separate approval |

The root pages and customer preview carry `noindex` until launch. The code intentionally keeps `deliveries/config.js` with `enabled:false` and `policiesApproved:false`. Do not flip either switch or promise live deliveries until the full backend, security and legal acceptance checks pass.

## Important: previous recruitment prototype is retired from the public landing

Earlier commits created a recruitment UI with `worker`/`employer` roles, job listings and employer approval. **Those are not courier customer, driver or dispatcher roles.** The public root no longer loads that recruitment UI; the historic `assets/app.js`, `firestore.rules` and collections remain intact pending controlled migration. Do not relabel existing identities, overwrite historic policy acknowledgments or delete personal information without an approved migration and retention policy.

See [product correction and phase roadmap](docs/product-correction-2026-10-31.md).

## Architecture and tests

- `index.html` + `assets/dispatch-landing.css`: public courier landing, preview navigation, accessibility, launch disclosures.
- `deliveries/`: customer preview, current delivery client API wrapper and draft policies.
- `delivery-functions/`: server-side authenticated quote, booking, shipment, proof and privileged operations.
- `assets/firebase-config.public.json`: public Firebase browser identifiers, validated for project `dispatch-1491f` and injected into `assets/config.js` by GitHub Actions. Never place service-account keys or OAuth client secrets in these files.
- `.github/workflows/deploy-pages.yml`: uploads an allowlisted static staging directory, excluding backend/test/source administration files.
- `scripts/verify-dispatch-live.mjs`: checks DNS, HTTPS, landing assets and public Firebase configuration. **This is not proof of an actual Google login.**

```bash
npm install
npm run test:onboarding
npm run test:config
npm run test:identity:unit
npm run test:deliveries
npx playwright install --with-deps chromium webkit
npm run test:identity
```

To preview locally, run `python3 -m http.server 8080` and visit http://localhost:8080. The delivery backend has separate tests and rollout directions: [delivery service](deliveries/README.md), [backend](delivery-functions/README.md).

## Production release gates

1. Verify real Google accounts completing sign-in, authorized domain, onboarding, session restoration and logout, including mobile browsers.
2. Confirm the actual Firebase database edition, publish reviewed security rules and set least-privilege identity/service accounts. Driver and dispatcher roles must be assigned by privileged administration, never user profile input.
3. Review and publish legally effective delivery terms, registered operator identity, privacy contact and POPIA notices covering recipient addresses, optional GPS collection, proof-of-delivery, cross-border processing, retention, deletion/export and disputes.
4. Deploy the backend to an approved runtime and private proof store, test backend cross-account isolation, idempotency, retries, quote expiry, signed-in cancellation and real carrier-operation confirmations. Firebase Cloud Functions may require Blaze billing; no automatic plan change is authorized.
5. Implement and test customer onboarding, driver verification, dispatcher authorisation and operational state transitions.
6. Review the migration/retirement of old recruitment Firestore collections separately. Verify final CI, CodeRabbit/Codex reviewer findings, mobile layout and production smoke tests before releasing.

**No production acceptance, booking, payment or SSO success is claimed by this repository.**

## Internal Workspace Directory → Dispatcher

Internal staff use [Dispatcher staff preview](https://dispatch.franks24.com/dispatcher/) rather than the public customer delivery desk. The staff sign-in is **closed by default**. Only a verified, active Google Workspace Directory user in the designated Dispatcher group may receive a server-approved `dispatcher` session. No employee is granted Dispatcher privileges solely by a matching email suffix, a self-selected role or a legacy recruitment account.

The server-side authorizer is implemented in `delivery-functions/dispatcher-auth.js`, with negative-access tests. Google Workspace customer ID, authorized Dispatcher group, Directory API delegated identity and same-origin session endpoint require administrator configuration. The staff preview remains locked until these checks work and production Google SSO is verified. See [Dispatcher identity specification](docs/dispatcher-workspace-identity.md).
