# Franks24 shared website and application interface

The public landing and all customer, driver, dispatcher, operations and policy pages use `assets/site-shell.css` and `assets/site-shell.js`. Franks24 is the platform; Dispatch is its courier service. Global navigation reaches all four portals and the shared footer links delivery terms, privacy, data use and the combined draft policy page.

The homepage is shorter. Customer tools are separate quote, booking, tracking, history and account/privacy panels with direct links and keyboard navigation. The local delivery-brief tool remains available in an expandable section and never submits a booking. Driver requirements, optional trip location, historical policy topics and recent inventory use expandable sections. Dispatcher shortcuts open real portal routes. WhatsApp product capture switches to its destination panel before focusing the populated field.

Operations bookmarks such as `/operations/#jobs` select their view after server-authorized sign-in. Late responses from a previously selected view cannot overwrite the current view. Authentication, staff-directory verification, driver approval, signed-out clearing, same-origin token handling and launch gates remain enforced.

## Policies

`legal/delivery-terms.html`, `legal/delivery-privacy.html` and `legal/delivery-data.html` present the existing courier policy notes from release `delivery-draft-2026-10-30`. They remain unapproved drafts. The earlier recruitment documents retain their original release content and are explicitly labelled historical. No existing acceptance record is changed or deemed acceptance of a new document.

## Validation

- `npm run test:site` crawls local links, fragments, assets, unique IDs and accessibility control destinations across all 12 pages, and checks portal/policy availability.
- `npm run test:identity` includes desktop Chromium, mobile Chromium and mobile WebKit coverage for shared navigation, task panels, local brief download, customer requests/tracking/proof, dispatcher inventory/message intake and workspace response races. These scenarios use explicit test-only identity/API fixtures; they do not prove real Google sign-in or production courier operations.
- Existing client, authorization, driver operations, privacy, photo upload and idempotency regression suites remain applicable.

## Publishing and activation

`node tools/sync-site-shell.mjs` regenerates the shared static shell. `node tools/sync-sites-landing.mjs` copies the compact presentation and shared assets into the existing registered Sites project. Its app links use the canonical application domain, so an independent Sites origin does not silently inherit Firebase/OAuth or courier API privileges.

GitHub Pages publishes the static application. The Firebase staging builder copies the same interface. Live operational activation still requires the deployed protected APIs, verified Google identity and staff-directory configuration, and approved policy versions. A passing UI test or successful static deployment does not activate these services.
