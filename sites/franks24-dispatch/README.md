# Franks24 · Dispatch website

A new, buildless Franks24 courier service website for Sites. `dist/` contains the complete static site; no dependency installation or build is needed.

## Local preview

Run a static HTTP server against `dist/`, for example `python -m http.server 8080 --directory dist`.

## Scope

- Responsive service landing, accessible mobile navigation, delivery planner, tracking preview, service preference selection and FAQs.
- The delivery planner validates local inputs and creates a downloadable delivery brief. Plans are held in memory only; they are never submitted to an operator or placed in local storage.
- Tracking explicitly reports that no live lookup has occurred. No rates, deliveries, customer testimonials or carrier events are fabricated.
- Customer, driver, dispatcher and policy links point to the existing `https://dispatch.franks24.com/` platform.
- Original route artwork is an illustration. Service coverage and pricing are not represented by it.
- Production courier API, OAuth configuration and staff approval controls remain in the existing platform. This new presentation site does not change those controls or the custom domain.

## Design

Franks24 is the platform brand; Dispatch is the service. Warm off-white, deep green and lime retain the source site's brand direction. Layout, spacing, typography, touch targets, keyboard navigation, focus states and reduced motion have been considered.

## Provenance

Content and release status checked against `franks-24/dispatch` main, including `README.md` and the current root landing, on 31 October 2026. Current live operations are described as preview in those sources.
