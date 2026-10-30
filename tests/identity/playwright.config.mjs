import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
 testDir:".",testMatch:"flow.spec.mjs",fullyParallel:false,workers:1,retries:0,
 timeout:45000,expect:{timeout:15000},
 use:{baseURL:"http://127.0.0.1:4173",trace:"retain-on-failure"},
 webServer:{command:"node tests/identity/server.mjs",url:"http://127.0.0.1:4173",reuseExistingServer:false},
 projects:[
  {name:"desktop-chromium",use:{...devices["Desktop Chrome"]}},
  {name:"mobile-chromium",use:{...devices["Pixel 5"]}},
  {name:"mobile-webkit",use:{...devices["iPhone 13"]}}
 ]
});
