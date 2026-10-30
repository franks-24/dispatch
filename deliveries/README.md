# Franks24 Deliveries — separate service preview

`/deliveries/` is a separately styled delivery experience. Dispatch at `/` remains the recruitment platform. No recruiting code, profile roles or Firestore rules are changed. This directory may later be extracted to its own repository/domain; do not assume a new domain has been configured.

Implemented: responsive three-action landing page, Google session integration, quote request form, issued-quote selection, collection request form, authenticated tracking timeline, latest shipment history and authenticated PDF proof download. No sample shipment or price is presented as real. No address, recipient, ID token or proof document is stored in localStorage. A named Firebase app with session persistence isolates delivery login from the recruitment app.

## Current state and launch blockers

The service is disabled in `config.js`. The shared `assets/config.js` currently exports null. The delivery API described below is a **contract only; no server, carrier connection, pricing engine or persistence is implemented in this PR**. This is a reviewable frontend foundation, not a completed delivery platform. GitHub Pages alone cannot implement the API. Preview rendering does not demonstrate live identity or delivery functionality.

Before enabling: implement and deploy the authenticated backend with durable storage and operator controls; connect Firebase web settings and Google authorised domains; approve legal policies with the actual operator identity and contact channels; test account isolation, pricing, retries, expiry, tracking and proof with real staging accounts. Only then set `enabled` and `policiesApproved` true, replace the policy version and remove `noindex`. No Firecrawl API key is required by this service. No Vercel deployment is used.

## Backend contract — required, not implemented

Serve the API at the same-origin `config.apiBase` (default `/api/deliveries`) through backend hosting or a reverse proxy. Do not point this frontend directly at an arbitrary cross-origin API. Every endpoint verifies Firebase ID tokens server-side, requires Google identity and derives ownership from the verified UID. Never trust a submitted owner or permit access based on a guessed reference alone. Apply rate limits and redact addresses/tokens from logs. Return `Cache-Control: private, no-store`.

| Method / endpoint | Request | Response |
|---|---|---|
| POST `/quotes` | pickupArea, deliveryArea, weightKg, lengthCm, widthCm, heightCm, service, acceptance | `{id,status:"pending"}` after durable creation |
| GET `/quotes` | Authenticated customer only | `{items:[{id,status,totalMinor,currency,expiresAt}]}`; bound results to active/recent quotes |
| POST `/bookings` | quoteId, pickupAddress, deliveryAddress, recipientName, recipientPhone, acceptance | `{id,reference,status:"requested"}`; `confirmed` only after actual confirmation |
| GET `/shipments?limit=100` | Authenticated customer only | `{items:[shipment],nextCursor:null}`; optional nextCursor signals older records; UI currently shows first page only |
| GET `/shipments/{reference}` | Exact internal ID or assigned customer reference | shipment plus `events:[{status,at,description}]` |
| GET `/shipments/{id}/proof` | Owner and delivered shipment with available proof | Authenticated PDF stream; Content-Type application/pdf; max 10 MB; never expose public proof URLs |

Shipment shape: `{id,reference,status,pickupArea,deliveryArea,updatedAt,proofAvailable}`. Use ISO-8601 UTC timestamps. Status vocabulary is exported from `model.js`. A request must not be rendered as confirmed until the backend records confirmation.

All POSTs carry `Idempotency-Key`. Scope keys to verified UID and operation, store request hash and response transactionally, replay identical retries and reject changed payloads with 409. Quoting and booking must validate bounds, route availability and prohibited goods on the server. Booking must transactionally enforce ownership, current quote expiry, unused quote state and authoritative price; a quote may create at most one booking. Prices are positive integer minor ZAR units, inclusive of required taxes/fees; no client-calculated amounts. Record separately the pricing inputs and eventual carrier service reference.

Acceptance is `{version,terms:true,privacy:true,ownership:true}`. The server must enforce the approved current version, record verified UID and server timestamp with append-only evidence, and reject missing acknowledgments. The frontend gates requests but is not an access-control boundary. Policy acknowledgment is not marketing or AI training consent. Retention, deletion/export procedures and proof access audit must be established before production.

401 = expired/invalid identity, 403 = forbidden, 404 = no owned matching record (avoid disclosing whether another account owns the reference), 409 = expired/used quote or idempotency conflict, 429 = throttled, 503 = service unavailable. Successful JSON responses use application/json. POST success means the request has been durably stored.

## Validation

Run `node --test tests/deliveries.test.mjs` from the repository root. Tests cover validation, quote expiry, unsupported currency, same-origin token confinement, missing identity, session changes, API errors, idempotency headers and proof content-type rejection. They do not verify backend access controls or carrier execution: these remain mandatory staging tests when a backend exists. Manual mobile, keyboard and screen-reader review remains required.
