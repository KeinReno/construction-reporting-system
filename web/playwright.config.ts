import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', fullyParallel:false, workers:1,
  use:{baseURL:'http://127.0.0.1:4173',headless:true},
  webServer:[
    {command:'python ../backend/tests/e2e_server.py',url:'http://127.0.0.1:8000/health',reuseExistingServer:false},
    {command:'npm run dev -- --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false}
  ]
});
