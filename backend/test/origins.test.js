import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins } from '../src/config/origins.js';
const primary='http://localhost:5173';
test('development permits exactly the configured origin and two loopback origins',()=>{
 assert.deepEqual(allowedOrigins(primary,'development'),[primary,'http://127.0.0.1:5173']);
 const origins=allowedOrigins('https://dev.example.invalid','development');
 for(const invalid of ['http://evil.invalid','http://localhost:5174','http://localhost:5173.evil.invalid','null'])assert.ok(!origins.includes(invalid));
});
for(const mode of ['production','test',undefined])test('no automatic aliases outside explicit development: '+mode,()=>{
 assert.deepEqual(allowedOrigins('https://retail.example.invalid',mode),['https://retail.example.invalid']);
});
for(const origin of ['*','null','https://example.invalid/path','https://user@example.invalid','https://example.invalid/'])test('reject invalid origin '+origin,()=>assert.throws(()=>allowedOrigins(origin,'development')));
