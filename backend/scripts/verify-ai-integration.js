import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {pool,verifyDatabase} from '../src/db/pool.js';
import {config} from '../src/config/env.js';

const sessionId=randomUUID();
try{
 await verifyDatabase();
 const [[owner]]=await pool.execute("SELECT id,organization_id FROM users WHERE email=? AND role='OWNER' AND status='ACTIVE' LIMIT 1",['vovuong535@gmail.com']);
 if(!owner)throw new Error('Không tìm thấy OWNER active để kiểm tra endpoint nội bộ');
 await pool.execute('INSERT INTO auth_sessions(id,organization_id,user_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))',[sessionId,owner.organization_id,owner.id]);
 const token=jwt.sign({},config.secret,{algorithm:'HS256',subject:String(owner.id),jwtid:sessionId,issuer:'retail-app',audience:'retail-web',expiresIn:'5m'});
 const call=async path=>{
  const response=await fetch(`http://127.0.0.1:${process.env.PORT||3000}/api/v1${path}`,{headers:{Accept:'application/json',Cookie:`session=${token}`}});
  const body=await response.json();
  if(!response.ok)throw new Error(`${path} failed with HTTP ${response.status}: ${body.message||'unknown'}`);
  return body;
 };
 const health=await call('/ai/health');
 const readiness=await call('/ai/readiness');
 console.log(JSON.stringify({health,models:Object.fromEntries(Object.entries(readiness.models).map(([key,value])=>[key,value.status])),algorithms:readiness.algorithms}));
}finally{
 await pool.execute('DELETE FROM auth_sessions WHERE id=?',[sessionId]).catch(()=>{});
 await pool.end();
}
