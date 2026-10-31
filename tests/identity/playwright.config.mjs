import {defineConfig,devices} from "@playwright/test";
import {fileURLToPath} from "node:url";
export default defineConfig({
 outputDir:fileURLToPath(new URL("../../test-results",import.meta.url)),
 testDir:".",testMatch:"*.spec.mjs",fullyParallel:false,workers:1,retries:0,
 timeout:45000,expect:{timeout:15000},
 use:{baseURL:"http://127.0.0.1:4173",trace:"retain-on-failure"},
 webServer:{cwd:fileURLToPath(new URL("../..",import.meta.url)),command:"node tests/identity/server.mjs",url:"http://127.0.0.1:4173",reuseExistingServer:false},
 projects:[
  {name:"desktop-chromium",use:{...devices["Desktop Chrome"]}},
  {name:"mobile-chromium",use:{...devices["Pixel 5"]}},
  {name:"mobile-webkit",use:{...devices["iPhone 13"]}}
 ]
});
