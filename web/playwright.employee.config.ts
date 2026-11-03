import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./employee-tests',workers:1,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:58496',headless:true,viewport:{width:390,height:844}},
  webServer:{command:'python ../backend/tests/employee_web_server.py',url:'http://127.0.0.1:58496/ready',reuseExistingServer:false},
});
