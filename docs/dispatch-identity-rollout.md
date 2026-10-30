# Dispatch identity activation and verification

The identity code and automated emulator tests do not themselves enable the production Google provider. The source originally exported a null public Firebase configuration. Never claim live SSO until a real account has completed the Google provider handshake and the new/returning-user tests below.

## Hosting and mobile behaviour

Keep the existing custom domain and the existing built-in GitHub Pages publisher. The duplicate custom deploy-pages workflow is removed so the branch is published once. Static sources use Firebase signInWithPopup; no cross-domain redirect fallback is attempted. For blocked popups, retry in the normal Safari, Chrome or Edge browser with popups permitted. Do not disable browser storage protections.

Reference: https://firebase.google.com/docs/auth/web/redirect-best-practices

## Activate from the authenticated Dispatch project

Use the existing project dispatch-1491f. Do not create a project, change billing or create a database as a side effect.

1. In Firebase Authentication → Sign-in method, enable Google if not already enabled and choose the project's actual support email. Register the Dispatch Web app under Project settings if it does not already exist. Do not share any private credentials.
2. Open an authenticated Google Cloud Shell with permission to inspect Firebase Auth/web apps/database metadata and publish Firebase Rules. Check out the tested main branch of https://github.com/franks-24/dispatch.
3. Run: node scripts/activate-dispatch-identity.mjs
4. If several web apps exist, set FIREBASE_WEB_APP_ID to the selected app's public ID. The script refuses ambiguous app selection, a missing Google OAuth configuration, an unverified/non-Standard default database or unexpected auth domain.
5. The script enables an existing configured Google provider, adds only dispatch.franks24.com to authorised domains, compiles and publishes the reviewed Firestore rules, verifies the resulting state, and writes the public assets/config.js. It does not create OAuth client credentials or print access tokens.
6. Publish the generated assets/config.js through the repository. These Firebase Web SDK settings are public configuration; they are not service-account credentials. Never include gcloud access tokens, OAuth client secrets or service-account JSON in the repository, chat or screenshots.
7. Run node scripts/verify-dispatch-live.mjs --require-config after publication. This checks DNS, valid TLS, HTTP 200, referenced assets and non-null frontend settings. It does not establish real Google account login.

Firebase Console: https://console.firebase.google.com/project/dispatch-1491f/authentication/providers
Project settings: https://console.firebase.google.com/project/dispatch-1491f/settings/general
Cloud Shell: https://shell.cloud.google.com/?project=dispatch-1491f

## Acceptance matrix

| Scenario | Required evidence |
|---|---|
| New worker | Real Google sign-in; profile capture; three independent acknowledgments; worker workspace |
| New employer | Real Google sign-in; employer profile; acknowledgments; publishing disabled until independent approval |
| Returning user | Sign-in/reload recognises the existing profile and role without repeating onboarding |
| Updated policies | Missing current agreement routes the existing profile through acknowledgment renewal |
| Cancelled/blocked popup | No private workspace; clear retry guidance; no automatic broken redirect |
| Profile/database failure | Private UI hidden; retryable error; no fabricated successful account creation |
| Sign-out/account switch | Private name, jobs and profile cleared; old asynchronous reads discarded |
| Employer publishing | Unverified employer denied by deployed Firestore rules; approved employer verified separately |

Automated browser tests use the real Firebase Web SDK against local Auth and Firestore emulators, with Google credentials for synthetic example.test accounts. They cover desktop Chromium, mobile Chromium and mobile WebKit. Browser request interception is confined to tests; there is no production emulator flag or test login backdoor. They do not test Google's real external OAuth UI, a physical phone or the production project's IAM/rules.

The workflow records screenshots and DNS/TLS/asset results. On main it also compares the live app source with the tested source. The three legal documents retain their pre-launch review status; do not invent operator identity, legal approval or a human user's acceptance.
