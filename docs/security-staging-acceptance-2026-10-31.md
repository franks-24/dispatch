# Franks24 Dispatch — security and staging acceptance (31 October 2026)

> **P0 incident #37 remains open.** Chrome Safe Browsing warning was reported by an operator. Never disable Safe Browsing, enter Google credentials on the flagged production domain, or consider HTTP 200/green CI a security clearance. Do not activate production identities or change DNS.

## Evidence obtained on 31 October

- Public `https://dispatch.franks24.com/dispatcher/` returned HTTP 200 but its startup JavaScript replaced the P0 HTML's disabled **Access paused — security review** label with **Continue with Google**. The frontend login remained disabled. Fix is on `fix/dispatch-security-preview-ux-e2e-20261031`.
- `https://dispatch.franks24.com/api/dispatcher/session` returned GitHub Pages 404 HTML, not a deployed same-origin staff API. The public static domain cannot complete a secure dispatcher session.
- `https://dispatch.franks24.com/dispatch-release.json` matched production main `841d662688d9427330bb241223df01b0c0ee1ce8` at inspection time, *before this branch's changes*. This is publication evidence, not security clearance.
- Public `https://transparencyreport.google.com/safe-browsing/search?url=dispatch.franks24.com` returned the generic **No available data** state in passive retrieval, without a hostname-specific verdict. It **does not demonstrate clearance**.
- `https://search.google.com/search-console/security-issues` prompted for Google authentication. We did **not** access the verified site owner's report. Exact threat examples, detection time and Google's review status are unknown.

## Changes implemented by this branch

1. Preserve the closed dispatcher button label after JavaScript initialization and failed authorization.
2. Completely disable customer Google sign-in and skip Firebase imports on the public, legally unapproved preview; re-enable only in a separately approved, explicitly enabled staging build. No frontend flag bypasses backend staff-group or driver approval checks.
3. Make preview submission buttons accurately say **Review … · preview**. These forms still permit local data entry/validation and always refuse remote writes when disabled; live staging retains the full submission controls only after approved backend and policy gates.
4. Clearly label inaccessible driver, applicant and operations sign-in on static HTML, and restore **Continue with Google** only when the corresponding staging gate is enabled.
5. Add desktop and mobile Playwright regression tests for closed controls, local validation, responsive tabs, deny-by-default access and rejected staff sessions.
6. Add a read-only staging acceptance verifier with unit tests against fake HTTP backends, refusing production and arbitrary origins and detecting HTML 404 fallbacks, failed anonymity restrictions and incorrect staff roles.

## Execution / verification

### Source and browser checks

From a clean checkout:

```bash
npm install
npm run test:site
npm run test:onboarding
npm run test:dispatcher
npm run test:deliveries
npm run test:staging
npx playwright install chromium webkit
npm run test:identity
```

GitHub Actions must show every required PR check passed. Playwright uses localhost and synthetic Google fixture tokens; **it does not exercise production Google SSO or prove real Firebase operations**.

### Owner-only Google security response

1. In Google's own UI, open [Search Console Security Issues](https://search.google.com/search-console/security-issues) for the verified domain property; capture the reported category, sample URLs, last detection time, and any unexpected owners.
2. Review all published HTML/JS and deployment owners, DNS changes, repository Actions/tokens and Search Console ownership. Preserve any threat evidence. If compromise is confirmed, remove injected content, remediate access, rotate compromised credentials and redeploy a trusted release.
3. Request review only after every threat example and root cause has been remediated. Do not classify the warning as a false positive without credible evidence.
4. Only a cleared Search Console report, an independent Safe Browsing verdict and Chrome without bypass can close incident #37. Keep Google SSO publicly off until then.

### Real Firebase Hosting staging (operator-authorized only)

The existing `tools/deploy-courier-staging.mjs` already prepares a closed site without `--deploy`. Production Firebase deployment is **not** performed by this branch. In a trusted, authenticated Google Cloud Shell, after reviewed policy acceptance, delegated Workspace IAM, safe private buckets and Standard Firestore are confirmed, an authorized operator may deploy to a dedicated non-production site using the existing deployment script.

The new **read-only verification** command is:

```bash
export DISPATCH_STAGING_ORIGIN="https://YOUR-DEDICATED-SITE.web.app"
node scripts/verify-dispatch-staging.mjs
```

The verifier rejects the public domain and arbitrary HTTP hosts. It requires Franks24 staging HTML and `401/403` JSON + `no-store` on unauthenticated dispatcher, operations, driver and customer private API reads. A static GitHub Pages 404, disabled 503, unexpected 200 or other non-JSON response **fails** acceptance.

For optional human-approved identity acceptance on that non-production origin, *after the security owner has cleared that test*, **pin the exact origin hostname in `DISPATCH_STAGING_APPROVED_HOST`** and provide distinct pre-approved test-account ID tokens using private ephemeral environment variables `DISPATCH_STAGING_APPROVED_DISPATCHER_ID_TOKEN` and `DISPATCH_STAGING_UNAUTHORIZED_ID_TOKEN`, and set `DISPATCH_STAGING_REAL_IDENTITY_ACCEPTANCE=true`. Do not put these tokens into GitHub source, logs, screenshots or shell history. The verifier checks exact authorized role and unauthorized `403`; it prints **no tokens**.

### Functional staging matrix (not yet certified)

- Authorized dispatcher session and Workspace group membership; revoked/removed member denied on next request.
- Unapproved or expired driver cannot see offers, addresses, personal information or financial records.
- Approved driver can accept exactly one offer, display address only after acceptance, and securely upload POD.
- Customer can submit a reviewed quote, book only an issued eligible quote, track their own reference and retrieve private POD; cannot read another customer's records.
- Privacy requests are captured for review without claiming completed erasure. All policies are approved versions rather than drafts.
- Validate camera fallback, keyboard focus, iPhone and Android responsive navigation, slow/offline retries, and private data purge on sign-out.
- Verify Firestore security rules, Cloud Function quotas/alerts, logs, private Storage IAM, restore drills, and rollback. Retain approval records.
- No live bank transfers, GPS/location capture, carrier dispatch or real-customer bookings during test unless separate authorizations are explicitly in place.

**Release decision:** after merging this frontend hardening PR, verify the exact GitHub Pages release marker and deployed JS/HTML. This does not authorize a Firebase staging deployment or switch on customer, dispatcher, driver, applicant or operations flags. Security incident #37 remains open pending Google owner evidence and browser clearance.
