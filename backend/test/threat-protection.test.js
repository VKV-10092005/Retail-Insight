import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createNotFoundScannerGuard} from '../src/middlewares/threatProtection.js';

function response(statusCode=404) {
  const res=new EventEmitter();
  res.statusCode=statusCode;
  res.headers={};
  res.set=(name,value)=>{res.headers[name]=value;return res;};
  res.status=value=>{res.statusCode=value;return res;};
  res.json=value=>{res.body=value;return res;};
  return res;
}

function request(guard,{ip='127.0.0.1',statusCode=404}={}) {
  const req={ip,originalUrl:'/api/v1/probe'};
  const res=response(statusCode);
  let continued=false;
  guard(req,res,()=>{continued=true;});
  if(continued)res.emit('finish');
  return {continued,res};
}

test('404 scanner temporarily blocks an IP after the configured threshold',()=>{
  let timestamp=1_000;
  const guard=createNotFoundScannerGuard({maxNotFound:3,windowMs:60_000,blockMs:120_000,now:()=>timestamp});
  assert.equal(request(guard).continued,true);
  timestamp+=1;
  assert.equal(request(guard).continued,true);
  timestamp+=1;
  assert.equal(request(guard).continued,true);
  timestamp+=1;
  const blocked=request(guard);
  assert.equal(blocked.continued,false);
  assert.equal(blocked.res.statusCode,429);
  assert.match(blocked.res.body.message,/đường dẫn không hợp lệ/);
  assert.ok(Number(blocked.res.headers['Retry-After'])>0);
});

test('a successful request clears the consecutive 404 sequence',()=>{
  const guard=createNotFoundScannerGuard({maxNotFound:2});
  request(guard,{statusCode:404});
  request(guard,{statusCode:200});
  assert.equal(request(guard,{statusCode:404}).continued,true);
  assert.equal(request(guard,{statusCode:404}).continued,true);
});
