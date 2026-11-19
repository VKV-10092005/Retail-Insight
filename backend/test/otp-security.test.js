import test from 'node:test';
import assert from 'node:assert/strict';
import {canExposeDevOtp} from '../src/utils/otp-security.js';

test('dev OTP is denied in production even when explicitly requested',()=>{
 assert.equal(canExposeDevOtp({configured:false},{NODE_ENV:'production',ALLOW_DEV_OTP:'1'}),false);
});

test('dev OTP requires local development opt-in and missing SMTP',()=>{
 assert.equal(canExposeDevOtp({configured:false},{NODE_ENV:'development',ALLOW_DEV_OTP:'1'}),true);
 assert.equal(canExposeDevOtp({configured:false},{NODE_ENV:'development',ALLOW_DEV_OTP:'0'}),false);
 assert.equal(canExposeDevOtp({configured:true},{NODE_ENV:'development',ALLOW_DEV_OTP:'1'}),false);
});
