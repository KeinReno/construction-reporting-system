import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./integration-tests',workers:1,
  outputDir:'./test-results/android-integration',
  reporter:[['line'],['junit',{outputFile:'test-results/android-integration/results.xml'}]],
  // Only a disposable local CI server; this option is never part of application assets.
  use:{baseURL:'https://127.0.0.1:8443',ignoreHTTPSErrors:true,headless:true}
});
