import { createInterface, emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { bootstrapOwner } from '../bootstrap-owner.js';

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

async function verify(app, account, password) {
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 let cookie;
 const request=(path,body)=>fetch('http://127.0.0.1:'+server.address().port+'/api/v1'+path,{
  method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Requested-With':'retail-web',...(cookie?{Cookie:cookie}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)
 });
 try {
  const login=await request('/auth/login',{email:account.email,password});
  if(login.status!==200)throw Error('VERIFY_FAILED');
  cookie=login.headers.get('set-cookie')?.split(';')[0];
  if(!cookie)throw Error('VERIFY_FAILED');
  const me=await request('/auth/me');const data=await me.json();
  if(me.status!==200 || data.user?.id!==account.id || data.user?.role!=='OWNER' || data.user?.organization_id!==account.organizationId || !data.user.branches?.some(b=>b.id===account.branchId))throw Error('VERIFY_FAILED');
  for(const path of ['/users','/branches/'+account.branchId+'/management']) {
   if((await request(path)).status!==200)throw Error('VERIFY_FAILED');
  }
  console.log('PASS: login 200; /auth/me OWNER; /users 200; branch management 200.');
 } finally {
  try {if(cookie && (await request('/auth/logout',{})).status!==204)throw Error('VERIFY_FAILED');}
  finally {await new Promise(resolve=>server.close(resolve));}
 }
}

let pool,connection,password='',created=false;
try {
 if(!stdin.isTTY || !stdout.isTTY || process.argv.length!==2)throw Error('TTY_REQUIRED');
 ({pool}=await import('../db/pool.js'));
 // Use the actual Express backend and configured MySQL, bound only to loopback.
 const {default:app}=await import('../app.js');
 connection=await pool.getConnection();
 const account=await bootstrapOwner(connection,async()=>{
  const email=await visible('Email: ');
  const name=await visible('Your name: ');
  const storeName=await visible('Organization / default branch name: ');
  password=await hidden('Password (12+ characters, maximum 72 UTF-8 bytes): ');
  let confirmation=await hidden('Confirm password: ');
  const matches=password===confirmation;confirmation='';
  if(!matches)throw Error('PASSWORD_MISMATCH');
  return {email,name,storeName,password};
 });
 created=true;
 console.log('OWNER created in retail_app. Verifying backend login and permissions...');
 await verify(app,account,password);
 console.log('Bootstrap complete. Verification session logged out.');
} catch(error) {
 const messages={OWNER_EXISTS:'OWNER already exists. No account created.',BOOTSTRAP_BUSY:'Another bootstrap is running. No account created.',WRONG_DATABASE:'Refusing database other than retail_app.',CANCELLED:'Cancelled.',PASSWORD_MISMATCH:'Passwords do not match.',TTY_REQUIRED:'Run in an interactive terminal without arguments or redirected input.',ER_DUP_ENTRY:'Email or unique value already exists. Transaction rolled back.',ZodError:'Invalid email, name, store name or password length.'};
 console.error(messages[error.code]||messages[error.name]||messages[error.message]||'Bootstrap or verification failed. Secret details suppressed.');
 if(created)console.error('Account was committed. Do not recreate or reset it. Check backend connectivity and log in through the application.');
 process.exitCode=1;
} finally {
 password='';connection?.release();if(pool)await pool.end();stdin.pause();
}
