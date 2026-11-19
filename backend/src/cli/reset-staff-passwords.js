import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {pool,verifyDatabase} from '../db/pool.js';

const emails=['manager@cuahang.vn','cashier@cuahang.vn','inventory@cuahang.vn'];
const password=process.env.RESET_STAFF_PASSWORD;

if(!password||Buffer.byteLength(password)>72)throw new Error('RESET_STAFF_PASSWORD is required and must be at most 72 bytes');

const connection=await pool.getConnection();
try{
 await verifyDatabase(connection);
 await connection.beginTransaction();
 const placeholders=emails.map(()=>'?').join(',');
 const [users]=await connection.execute(`SELECT id,email,role,status FROM users WHERE email IN (${placeholders}) FOR UPDATE`,emails);
 if(users.length!==emails.length){
  const found=new Set(users.map(user=>user.email));
  throw new Error(`Missing staff accounts: ${emails.filter(email=>!found.has(email)).join(', ')}`);
 }

 const [columnRows]=await connection.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME IN ('is_active','email_verified','email_verified_at')");
 const columns=new Set(columnRows.map(row=>row.COLUMN_NAME));
 for(const user of users){
  const hash=await bcrypt.hash(password,12);
  const assignments=['password_hash=?',"status='ACTIVE'"];
  const values=[hash];
  if(columns.has('is_active'))assignments.push('is_active=1');
  if(columns.has('email_verified'))assignments.push('email_verified=1');
  if(columns.has('email_verified_at'))assignments.push('email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP())');
  values.push(user.id);
  await connection.execute(`UPDATE users SET ${assignments.join(',')} WHERE id=?`,values);
  await connection.execute('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE user_id=?',[user.id]);
 }
 await connection.commit();
 console.log(JSON.stringify({updated:users.map(({email,role})=>({email,role,status:'ACTIVE'})),verification_columns:[...columns]}));
}catch(error){
 await connection.rollback();
 throw error;
}finally{
 connection.release();
 await pool.end();
}
