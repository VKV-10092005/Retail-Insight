import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests-ui1',testMatch:'**/*.spec.js',workers:1,timeout:30000,reporter:'list',outputDir:'ui1-test-results',
 use:{baseURL:'http://127.0.0.1:13320',headless:true,channel:'msedge',trace:'off',serviceWorkers:'block',
  launchOptions:{args:['--disable-background-networking','--disable-extensions']}},
 webServer:{command:'node --max-old-space-size=128 ui1-server.mjs --serve-ui1',url:'http://127.0.0.1:13320/ui1-preview.html',reuseExistingServer:false,timeout:15000}
});
