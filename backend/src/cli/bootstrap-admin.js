import { createInterface, emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

function visible(prompt) {
 const rl=createInterface({input:stdin,output:stdout});
 return new Promise((resolve,reject)=>{
  rl.once('SIGINT',()=>{rl.close();reject(Error('CANCELLED'));});
  rl.question(prompt,answer=>{rl.close();resolve(answer);});
 });
}
function hidden(prompt) {
 stdout.write(prompt);emitKeypressEvents(stdin);stdin.setRawMode(true);stdin.resume();
 return new Promise((resolve,reject)=>{
  let value='';
  const finish=(error)=>{
   stdin.removeListener('keypress',onKey);stdin.setRawMode(false);stdin.pause();stdout.write('\n');
   if(error)reject(error);else resolve(value);
   value='';
  };
  const onKey=(text,key={})=>{
   if(key.ctrl && key.name==='c')return finish(Error('CANCELLED'));
   if(key.name==='return')return finish();
   if(key.name==='backspace'){value=Array.from(value).slice(0,-1).join('');return;}
   if(!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text))value+=text;
  };
  stdin.on('keypress',onKey);
 });
}

const adminInput = z.object({
 email:z.string().trim().toLowerCase().email().max(254),
 password:z.string().min(12).refine(v=>Buffer.byteLength(v)<=72),
 name:z.string().trim().min(2).max(120),
});

let pool,connection,password='',created=false;
try {
 if(!stdin.isTTY || !stdout.isTTY || process.argv.length!==2)throw Error('TTY_REQUIRED');
 ({pool}=await import('../db/pool.js'));
 connection=await pool.getConnection();

 // Verify correct database
 const [[db]]=await connection.query('SELECT DATABASE() AS name');
 if(db.name!=='retail_app')throw Error('WRONG_DATABASE');

 // Advisory lock to prevent concurrent bootstrap
 const [[lock]]=await connection.execute('SELECT GET_LOCK(?,0) AS acquired',['retail_app_bootstrap_admin']);
 if(lock.acquired!==1)throw Error('BOOTSTRAP_BUSY');

 // Check if PLATFORM_ADMIN already exists
 const [existing]=await connection.execute("SELECT id FROM users WHERE role='PLATFORM_ADMIN' LIMIT 1");
 if(existing.length)throw Error('ADMIN_EXISTS');

 // Collect credentials
 const email=await visible('Admin email: ');
 const name=await visible('Admin name: ');
 password=await hidden('Password (12+ characters, maximum 72 UTF-8 bytes): ');
 let confirmation=await hidden('Confirm password: ');
 const matches=password===confirmation;confirmation='';
 if(!matches)throw Error('PASSWORD_MISMATCH');

 const data=adminInput.parse({email,name,password});
 const hash=await bcrypt.hash(data.password,12);

 await connection.beginTransaction();
 // Double-check inside transaction
 const [recheck]=await connection.execute("SELECT id FROM users WHERE role='PLATFORM_ADMIN' LIMIT 1");
 if(recheck.length)throw Error('ADMIN_EXISTS');

 const [user]=await connection.execute(
  "INSERT INTO users(organization_id,email,password_hash,full_name,role,status) VALUES (NULL,?,?,?,'PLATFORM_ADMIN','ACTIVE')",
  [data.email,hash,data.name]
 );
 await connection.commit();
 created=true;

 console.log('PLATFORM_ADMIN created: id='+user.insertId+', email='+data.email);
 console.log('Bootstrap complete. You may now log in through the application.');

 await connection.execute('SELECT RELEASE_LOCK(?)',['retail_app_bootstrap_admin']);
} catch(error) {
 try{if(connection)await connection.rollback();}catch{}
 try{if(connection)await connection.execute('SELECT RELEASE_LOCK(?)',['retail_app_bootstrap_admin']);}catch{}
 const messages={
  ADMIN_EXISTS:'PLATFORM_ADMIN already exists. No account created.',
  BOOTSTRAP_BUSY:'Another bootstrap is running. No account created.',
  WRONG_DATABASE:'Refusing database other than retail_app.',
  CANCELLED:'Cancelled.',
  PASSWORD_MISMATCH:'Passwords do not match.',
  TTY_REQUIRED:'Run in an interactive terminal without arguments or redirected input.',
  ER_DUP_ENTRY:'Email already exists.',
  ZodError:'Invalid email, name or password length.',
 };
 console.error(messages[error.code]||messages[error.name]||messages[error.message]||'Bootstrap failed. Secret details suppressed.');
 if(created)console.error('Account was committed. Do not recreate it. Log in through the application.');
 process.exitCode=1;
} finally {
 password='';connection?.release();if(pool)await pool.end();stdin.pause();
}
