# Franks24 Dispatch Sites landing

The compact landing uses the same header, footer, fonts, colours and responsive navigation as the canonical Franks24 application. Customer, driver, dispatcher, operations and legal links open https://dispatch.franks24.com/. The local delivery-brief tool generates a download without submitting a quote or booking.

Run `node tools/sync-sites-landing.mjs` from the repository root after shared website changes. The static Site is in `dist/`; no installation or build is needed. The registered Site ID is preserved in `.openai/hosting.json`.

Publication must push this exact source to the registered Sites source repository before saving a version. The previous execution environment could not resolve `git.chatgpt-team.site`; a registered project or expected URL does not prove publication. Live courier operations and Google sign-in acceptance are verified separately.
