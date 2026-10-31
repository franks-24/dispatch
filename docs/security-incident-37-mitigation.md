# P0 Safe Browsing — mitigation and owner acceptance (31 October 2026)

## Incident
Chrome reported a **Dangerous site / phishing** interstitial for
`https://dispatch.franks24.com/dispatcher/`. This must remain an open
security incident until Google and the owner confirm remediation. A successful
GitHub Pages workflow, HTTPS certificate or source scan **does not** establish
Safe Browsing clearance.

## Technical mitigations in source
- The public Dispatcher remains disabled by default. The Google sign-in button
  must consistently display **Access paused — security review**, including
  after JavaScript initializes. It must not open an OAuth popup or accept
  credentials while disabled.
- `tools/audit-public-safety.mjs` rejects unapproved external/inline public
  executable scripts, embedded third-party frames, custom password fields,
  external HTML form actions, meta redirects and base URL overrides.
- `tests/public-safety.test.mjs` exercises expected and malicious patterns.
  Preview publication requires this test and source audit to pass.
- Server-side Directory group verification and Firebase Auth are independent
  of the disabled button; neither is safe to enable until authorization and
  actual account tests have passed.

## Human-led verification (not completed by source changes)
1. Check [Search Console Security Issues](https://search.google.com/search-console/security-issues)
   under the verified host/domain property. Save issue category, sample paths,
   timestamps and screenshots in restricted incident evidence.
2. Inspect all referenced URLs, currently deployed assets, source maps if any,
   historical releases, DNS, GitHub administrators and deployment permissions.
   Establish whether the site was compromised or is misclassified. Preserve
   evidence before replacing malicious content or rotating exposed credentials.
3. If compromised, remove injected assets and malicious routes, fix the root
   cause, audit all affected paths, rotate exposed credentials and redeploy
   a reviewed revision. Inspect the published revision marker and server logs.
4. If a false positive is supported by concrete evidence, submit Google's
   official incorrect-phishing report or Security Issues request as appropriate.
   Do **not** claim that a report automatically removes a warning.
5. Confirm warning cleared independently in Chrome on relevant devices and
   that Search Console no longer reports the security issue. Capture date,
   assessor and test results.
6. Only then separately test real Google sign-in, workspace group authorization,
   revoked accounts, private Firestore/Storage and document acceptance before
   opening any operational functions.

**Release owners:** website/security administrator, Google Search Console
verified owner, Google Workspace Directory administrator, legal/privacy reviewer
and operational sign-off owner.

**State:** remediation code implemented, Google determination pending.
This runbook does not request a Google review automatically.

- [Google Search Console Security Issues help](https://support.google.com/webmasters/answer/9044101)
- [Why Chrome reports dangerous sites](https://support.google.com/webmasters/answer/6347750)
