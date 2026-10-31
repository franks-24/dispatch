import {defineConfig,devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 testDir:'.',testMatch:'*.spec.mjs',workers:1,retries:0,
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
 webServer:{cwd:fileURLToPath(new URL('../..',import.meta.url)),
  command:'node tools/build-firebase-applicants.mjs && node tests/identity/server.mjs',
  env:{ENABLE_APPLICANT_UI:'false',TEST_PUBLIC_ROOT:'.firebase-applicants-public'},
  url:'http://127.0.0.1:4173',reuseExistingServer:false},
 projects:[{name:'mobile-chromium',use:devices['Pixel 5']},{name:'mobile-webkit',use:devices['iPhone 13']}]
});
