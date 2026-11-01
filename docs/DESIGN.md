# Franks24 Dispatch — unified design system (v1)

Source: live https://dispatch.franks24.com/dispatcher/ captured 2026-11-01 with Firecrawl branding extraction; source of truth for web components: assets/site-shell.css. The Flutter pilot previously used #C8102E; this specification standardizes it to the live web red #C8202F.

## Brand hierarchy
- **Franks24** is the brand; **Dispatch** is the service label, never the parent brand.
- Shared icon: assets/favicon.svg (F monogram); do not imply the web icon is already packaged in native assets.
- Preview, security-review and local-demo labels remain visible and accurate. Do not enable disabled operational actions for visual consistency.

## Semantic tokens
| Token | Value | Role |
|---|---|---|
| primary | #C8202F | brand red, primary actions, focus accents |
| primary-soft | #FFE5E8 | selected navigation / accent surfaces |
| primary-pale | #FFF0F2 | notices and subtle surfaces |
| ink | #231F20 | body text / dark header |
| muted | #666168 | secondary copy |
| line | #E6DFE1 | separators |
| surface | #FFFFFF | cards and page background |
| on-primary | #FFFFFF | primary button text |

Typography: Space Grotesk for headings and wordmark; DM Sans for body, with Arial/sans-serif fallback on web. Flutter uses system fallback unless fonts are legally bundled and declared in pubspec. Base web body text 16px; never reduce functional form labels below accessible legibility. Web input/button minimum height 44px; mobile primary action minimum 52dp. Card radius 10px, controls 6px; 4px spacing scale. Maintain WCAG 2.2 AA contrast and visible keyboard focus.

## Platform-specific navigation
- Web: shared status bar, responsive header, role-aware links, and consistent legal footer; no forced bottom tab bar.
- Android/iOS: native Material/Cupertino-appropriate navigation with bottom destinations for pilot roles; safe areas, keyboard insets, back navigation and 44–48dp touch targets.
- Same labels and intent, **not** identical screens. Dispatcher and operations require server-verified authorization; local pilot tabs are simulations only.

## Implementation and release gates
1. Flutter: import mobile/lib/franks24_theme.dart and use Franks24Theme.light; preserve pilot routes and behavior.
2. Web: keep assets/site-shell.css as canonical existing implementation; align any remaining legacy assets/styles.css usage before removing old green/navy landing styles. Do not blindly override styles in legal, onboarding or role portals.
3. Visual regression: capture desktop 1440px, tablet 768px and mobile 390px web screens plus Android emulator screenshots; compare brand, typography, buttons, cards, form states, errors, navigation and legal links.
4. Functional regression: keyboard/tab/focus, contrast, menu interactions, login fail-closed, role isolation, booking preview disclosures, and Flutter pilot job simulation.
5. Release: Flutter analyze/test/build, web Playwright checks and actual device smoke tests must pass before claiming parity. No production deployment or store release is implied by this design-system PR.

## Evidence limits
Firecrawl's branding extraction is a measured page-level report, not a full cross-device screenshot inspection. Typography and spacing beyond the inspected stylesheet are implementation targets; mobile screens and browser states still need screenshot verification.
