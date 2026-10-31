# Dispatcher identity — internal Google Workspace directory

## Policy
Franks24 is the platform. Dispatch is the courier/logistics service. **Dispatcher** is the internal staff workspace; customer and driver accounts are separate.

A Google user may enter Dispatcher only after the backend verifies **all** of:
1. Valid, unrevoked Firebase ID token issued through Google sign-in, with a verified email.
2. A currently active, non-suspended, non-archived user in the **configured internal Google Workspace Directory tenant** (match `customerId`, not just a string domain).
3. Membership in the **configured Dispatcher security group** (Google Workspace Admin SDK Directory API `members.hasMember`, direct or same-domain nested).
4. A working, trusted Directory API connector. Fail closed if unavailable, ambiguous or unconfigured.

The group should contain the internal Directory users authorized to dispatch. A company email address, verified domain or Google sign-in *alone* is **not** a staff privilege. If the requirement is to admit every active internal user, manage that policy explicitly through the group membership list rather than making all same-domain Google accounts administrators.

The client never submits `role=dispatcher`, selects a role, or modifies Firestore authorization claims. The backend resolves the role on every privileged session request; operations require their own server-side checks and audit trails. No user role is taken from recruitment `users`, `employerApprovals` or `jobs` collections.

## Configuration still required
- Workspace tenant customer ID (e.g. `C...`), internal domain and Dispatcher group key. **Not guessed or hardcoded.**
- Admin SDK Directory API enabled and a read-only delegated identity with `admin.directory.user.readonly` and `admin.directory.group.member.readonly` scopes, or a separate approved Cloud Identity membership integration.
- A trusted backend `GET /api/dispatcher/session` on the same origin as the staff portal; token verification and Directory checks run in that backend, not in browser JavaScript.
- Google Firebase sign-in enabled and `dispatch.franks24.com` in authorized domains. The custom domain was missing in the live Auth public settings on 31 Oct 2026; see GitHub issue #13.
- Least-privilege roles for **dispatcher.viewer**, **dispatcher.operator**, and **dispatcher.admin** *after* staff authentication. Group membership opens the Dispatcher workspace; it does not imply unrestricted carrier, financial, geolocation or administration permissions.
- Backend deployment, IAM, tenancy and actual directory membership checks must be tested before enabling `dispatcher/config.js`. Pages hosts only static HTML/JS.

## Security requirements
- Server verifies Firebase token with revoked-session check.
- Directory `users.get`: `customerId`, suspension/archive status, primary email/aliases; group `members.hasMember`: true required.
- Block suspended, deleted, external, unverified and ungrouped accounts; group revocation must be effective without relying exclusively on hour-long frontend Firebase tokens.
- Directory errors, missing credentials, 404 from a static host, malformed JSON and offline state deny access. Never fallback to email-suffix matching, user-selected role, localStorage, static group lists or default access.
- Expose only minimal role information to the browser; no directory dumps, group membership lists or admin tokens.
- Audit staff session establishment, shipment mutations, proof reads, manual overrides and failed privilege attempts without logging identity tokens or unnecessary personal information.
- Require MFA in Workspace policy for staff, and provide administrative deprovisioning and emergency revocation.

## Activation acceptance tests
1. Active directory user in Dispatcher group: verified server response `{role:"dispatcher",workspace:"dispatcher"}` after real Google SSO.
2. Same-domain Google identity not in group: 403.
3. Former/suspended internal employee: 403.
4. External Gmail and consumer account with similar display name: 403.
5. Group removal after previous login: next request denied (requery group membership).
6. Directory API credentials missing or service unavailable: 503, no workspace.
7. Missing/invalid/expired Firebase token: 401; non-Google or unverified identity: 403.
8. Mobile, refresh, logout and account switching never reuse a previously authorized staff view.
9. Privileged Dispatcher API routes reauthorize each action. UI success is not server authorization.

Official references:
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://developers.google.com/workspace/admin/directory/reference/rest/v1/users/get
- https://developers.google.com/workspace/admin/directory/reference/rest/v1/members/hasMember

## Current state
The staff preview is **disabled by default**. `dispatcher-auth.js` provides a unit-tested authorizer; connection to a trusted backend, actual Directory permissions and Google production SSO are pending. No staff claims or Google Workspace settings were changed.

## Automatic routing from the customer sign-in
When the Directory authorizer and same-origin API are activated, `/deliveries/` checks the signed-in Firebase user's role with `GET /api/dispatcher/session`. An affirmative server response redirects to `/dispatcher/`. A server-confirmed 403 means that user is not in the Dispatcher group and may continue as a customer. Unavailable or malformed verification locks delivery actions rather than assuming a role. This routing is a browser convenience, **not** the enforcement boundary. The Dispatcher backend must reauthorize every privileged request.
