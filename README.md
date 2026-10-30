# Dispatch — by Franks24

[![Website](https://img.shields.io/badge/website-dispatch.franks24.com-b8f477?style=for-the-badge&logo=googlechrome&logoColor=071522)](https://dispatch.franks24.com)
[![Deploy GitHub Pages](https://github.com/franks-24/dispatch/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/franks-24/dispatch/actions/workflows/deploy-pages.yml)
[![Firebase](https://img.shields.io/badge/auth-Google_SSO-4285F4?style=for-the-badge&logo=google)](https://firebase.google.com/docs/auth/web/google-signin)
[![License](https://img.shields.io/github/license/franks-24/dispatch?style=for-the-badge)](LICENSE)

**One secure entrance for workers and hiring teams.** Responsive landing page, Google-only registration/sign-in, role-based onboarding, jobs dashboard, publishing and applications.

🌐 **Target domain:** https://dispatch.franks24.com

## Experience

```text
Public landing page
   │
   └── Continue with Google (Firebase Authentication)
         ├── First visit → Worker or hiring team onboarding → Firestore profile
         └── Returning user → Role-specific workspace
                                  ├── Worker → Open opportunities → Apply
                                  └── Employer → My jobs → Publish
```

## First-time cloud setup — REQUIRED before live sign-in

The site is designed to publish independently of Firebase. **The Google button will correctly report that sign-in is not yet configured until the steps below are completed.** There are no sample users, passwords or fictitious job records.

1. Create or select a [Firebase project](https://console.firebase.google.com/) under the owning Google Cloud account.
2. Register a **Web app** in Firebase Project settings. Copy the public `firebaseConfig` object into [`assets/config.js`](assets/config.js). Firebase API keys for web apps are public identifiers, **not service account secrets**.
3. Enable **Authentication → Sign-in method → Google** and configure the support email. Under **Authorized domains**, add `dispatch.franks24.com` and `franks-24.github.io` (if using the GitHub Pages fallback).
4. Create a **Firestore database** in production mode, choose the correct region and **deploy [`firestore.rules`](firestore.rules)** before admitting users. Example using the Firebase CLI: `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID` after configuring `firebase.json` for your environment, or paste the rules into the Firebase console and publish.
5. Configure App Check (reCAPTCHA Enterprise where suitable), budget alerts, IAM least privilege and service quotas. Set up privacy / data retention policies before public launch.
6. Sign in with a new Google account and confirm onboarding creates a document in `users/{uid}`. Confirm returning users land directly in their role workspace, and unregistered users cannot read or post jobs.

### Deploying the website

The repository contains a GitHub Actions Pages deployment workflow [`deploy-pages.yml`](.github/workflows/deploy-pages.yml). It runs on pushes to `main` and can be run manually in **Actions**. In GitHub **Settings → Pages**, select **GitHub Actions** as the publishing source if it is not already enabled. Configure the custom domain `dispatch.franks24.com` and the required DNS CNAME record (pointing to `franks-24.github.io`) at the DNS provider; enable **Enforce HTTPS** after the certificate is issued. A CNAME file alone does not complete domain DNS or Pages activation.

The public website is a static shell; Google authentication and all user/job data are handled by Firebase. This repo does not contain production credentials, service accounts, or live Firestore data.

## Security architecture

- Google-only sign-in using Firebase Authentication. No local passwords or unauthenticated dashboard.
- Authorization happens in Firestore Security Rules, not the browser. Workers and employers have different document permissions. Users cannot self-assign admin access.
- Security rules are source-controlled and must be deployed explicitly; hosting deployment **does not** deploy Firestore rules.
- User and job text is inserted as plain text, not interpreted as HTML. No hard-coded job examples.
- Before a commercial launch, implement server-side moderation, abuse controls, application status workflow, personal-data export/deletion and audit logging.

## Stack

Vanilla HTML/CSS/JS (no build step), Firebase Authentication, Cloud Firestore, GitHub Pages + custom domain. **No Vercel.**

## Branding

- High-contrast dark navy and lime design with responsive layout.
- SVG favicon and custom workspace illustration; respects reduced-motion preference.
