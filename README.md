<div align="center">

<img src="assets/readme-banner.svg" width="100%" alt="Animated Franks24 Dispatch banner connecting Google SSO to worker and hiring-team workspaces." />

# Dispatch — by Franks24

**Work moves here. One Google sign-in for everyone.**

[![GitHub Pages](https://github.com/franks-24/dispatch/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/franks-24/dispatch/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/github/license/franks-24/dispatch?style=for-the-badge)](LICENSE)
[![Latest commit](https://img.shields.io/github/last-commit/franks-24/dispatch?style=for-the-badge)](https://github.com/franks-24/dispatch/commits/main)
[![Issues](https://img.shields.io/github/issues/franks-24/dispatch?style=for-the-badge)](https://github.com/franks-24/dispatch/issues)
[![Google SSO](https://img.shields.io/badge/sign--in-Google%20only-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://firebase.google.com/docs/auth/web/google-signin)
[![Hosting](https://img.shields.io/badge/hosting-GitHub%20Pages-121b25?style=for-the-badge&logo=githubpages)](https://github.com/franks-24/dispatch/settings/pages)
[![Auth status](https://img.shields.io/badge/live%20Google%20SSO-setup%20required-eebf76?style=for-the-badge)](#activate-google-sso)

[Production domain](https://dispatch.franks24.com) · [Deployment actions](https://github.com/franks-24/dispatch/actions/workflows/deploy-pages.yml) · [Google authentication docs](https://firebase.google.com/docs/auth/web/google-signin)

</div>

## Overview

**Dispatch** is a responsive platform for connecting people seeking work and organisations hiring them. Visitors use one **Continue with Google** action for both sign-up and sign-in. A first-time visitor completes onboarding as a **job seeker** or **hiring team**; a returning visitor is directed to their role-specific workspace.

The application is a static HTML/CSS/JavaScript frontend hosted using GitHub Pages, with Firebase Authentication for Google identity and Cloud Firestore for user profiles, jobs and applications. **No Vercel deployment is required.**

> **Deployment status:** The GitHub Pages workflow is present and has completed successfully. This does **not** establish that the custom domain resolves everywhere, or that live Google sign-in works. The public Firebase configuration in `assets/config.js` is currently `null`, so real Google SSO **still needs activation**. Never represent the login as active until an end-to-end test succeeds.

<div align="center">
<img src="assets/readme-workspace.svg" width="100%" alt="Concept illustration of the Dispatch landing page, Google sign-in button and job-seeker and hiring-team experiences." />
<sub>Concept illustration; no actual users, jobs, or customers are depicted.</sub>
</div>

## Features

| Area | Current implementation |
|---|---|
| Landing page | Responsive dark-navy/lime design, animated accents and one Google entry point |
| Single login / signup | Google-only sign-in through Firebase Authentication; no usernames or local passwords |
| First-time onboarding | Collect name, location, optional details and job-seeker / employer role |
| Returning users | Firebase session observation and profile lookup |
| Job seekers | View open listings and apply once per job |
| Hiring teams | Publish job listings and view own postings |
| Security rules | Source-controlled Firestore rules for profiles, jobs and applications |
| Documentation | Firebase setup, GitHub Pages configuration, deployment requirements and diagrams |
| Visual assets | Original animated SVG README hero, UI illustration and authentication flow diagram |

### Experience and identity flow

<img src="assets/readme-auth-flow.svg" width="100%" alt="Authentication flow showing public landing page, Google SSO, onboarding for new users, session restoration for returning users, and authenticated workspace." />

```mermaid
flowchart LR
  A[Public landing page] --> B[Continue with Google]
  B --> C[Firebase Google Authentication]
  C --> D{Existing profile?}
  D -->|No| E[First visit: select worker or employer]
  E --> F[Create protected user profile]
  D -->|Yes| G[Restore existing profile]
  F --> H[Role-specific workspace]
  G --> H
  H --> I[Sign out]
  I --> A
```

**One action serves both cases:** the Firebase Google provider creates the account identity on first successful access and signs in the same identity on future visits. A new user completes profile setup after that initial authentication.

## Architecture

```mermaid
flowchart TD
  Browser[Mobile / desktop browser] --> Pages[GitHub Pages\nindex.html + assets]
  Pages --> SDK[Firebase Web SDK]
  SDK --> GA[Google OAuth provider]
  SDK --> Auth[Firebase Authentication]
  Auth --> Profile[Firestore user profile]
  Profile --> RBAC{Profile role + Firestore rules}
  RBAC --> Worker[Job seeker: view jobs / apply]
  RBAC --> Employer[Hiring team: publish jobs]
  Worker --> Store[(Cloud Firestore)]
  Employer --> Store
```

**Security boundaries:** Client-side route visibility is not an access-control boundary. Cloud Firestore rules must be published and tested before accepting any production users. Do not put service-account keys, tokens, or other secrets in `assets/config.js` or GitHub Pages. Production readiness additionally requires abuse prevention, moderation, comprehensive privacy controls and documented data deletion/export processes.

## Activate Google SSO

1. Open the [Firebase Console](https://console.firebase.google.com/) and create/select the Dispatch project.
2. Register a **Web app** under project settings; copy its **public Firebase web config** into [`assets/config.js`](assets/config.js). Keep service-account credentials private.
3. Under **Authentication → Sign-in method**, enable **Google** and select a support email.
4. Under **Authentication → Settings → Authorized domains**, authorise **`dispatch.franks24.com`**. Add the GitHub Pages fallback domain only if you intend to use it.
5. Create the production Firestore database and publish the reviewed [`firestore.rules`](firestore.rules). The website deployment does not deploy Firestore rules.
6. Test first-time Google onboarding, returning Google login, sign-out, job-seeker access and employer access. Confirm unauthenticated requests are denied.

Official references: [Google sign-in with Firebase](https://firebase.google.com/docs/auth/web/google-signin) · [Firebase authorised domains](https://firebase.google.com/docs/auth/web/redirect-best-practices) · [Cloud Firestore security rules](https://firebase.google.com/docs/firestore/security/get-started).

### GitHub Pages publishing

The [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) action deploys the static repository on pushes to `main`. In [Settings → Pages](https://github.com/franks-24/dispatch/settings/pages), ensure the publishing source is **GitHub Actions**. The repository `CNAME` specifies `dispatch.franks24.com`; DNS must also point to the configured GitHub Pages host, and HTTPS must be enabled after certificate provisioning.

- [Deployment workflow and live logs](https://github.com/franks-24/dispatch/actions/workflows/deploy-pages.yml)
- [Pages domain configuration](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- [Firebase web app configuration](https://firebase.google.com/docs/web/setup)

## Repository layout

```text
.
├── index.html                     # Public landing, onboarding and workspace markup
├── assets/
│   ├── app.js                      # Google auth, profile, jobs and applications
│   ├── config.js                   # Public Firebase web config — needs setup
│   ├── styles.css                  # Responsive styles and motion
│   ├── favicon.svg
│   ├── readme-banner.svg           # Animated brand illustration
│   ├── readme-auth-flow.svg        # Identity flow illustration
│   └── readme-workspace.svg        # Landing page concept illustration
├── firestore.rules                 # Firebase data-access policy
├── .github/workflows/deploy-pages.yml
├── CNAME                           # Custom domain
├── LICENSE
└── README.md
```

## Local preview

Use any static local web server instead of opening `index.html` directly from `file://` (the app uses ES modules):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. For real sign-in, register the local host in Firebase Authentication's authorised domains when appropriate and use the project's public web app configuration.

## Accessibility and responsible launch

SVG illustrations include accessible titles/descriptions and support reduced-motion preferences. The application is designed for mobile and desktop screens. Before scaling up, validate keyboard navigation, screen-reader announcements, cross-device login, automated Firestore rule tests, rate limiting, organisation verification for employers and secure audit logging.

---

<div align="center"><strong>Dispatch by Franks24</strong> · Secure Google identity · A single entry point for opportunity and hiring.</div>
