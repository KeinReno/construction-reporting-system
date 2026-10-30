import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./owner-tests',workers:1,
  use:{baseURL:process.env.OWNER_DEMO_URL || 'http://127.0.0.1:8002',headless:true},
  reporter:'line'
});
