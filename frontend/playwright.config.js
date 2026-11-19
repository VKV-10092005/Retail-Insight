import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',workers:1,timeout:45000,reporter:'list',use:{baseURL:'http://localhost:5173',headless:true,channel:'msedge',trace:'off'}});
