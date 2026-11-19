import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {createRequire} from 'node:module';
const {stdin,stdout}=process;
let muted=false,rl,browser,password='';
try {
 if(!stdin.isTTY || !stdout.isTTY || process.argv.length!==2)throw Error('Use an interactive terminal without arguments.');
 const require=createRequire(new URL('../../../frontend/package.json',import.meta.url));
 const {chromium,expect}=require('@playwright/test');
 const output=new Writable({write(chunk,encoding,done){if(!muted)stdout.write(chunk);done();}});
 rl=createInterface({input:stdin,output,terminal:true,historySize:0});
 const ask=(prompt,secret=false)=>new Promise((resolve,reject)=>{
  stdout.write(prompt);muted=secret;
  const cancel=()=>{muted=false;reject(Error('Cancelled.'));};
  rl.once('SIGINT',cancel);
  rl.question('',value=>{rl.removeListener('SIGINT',cancel);muted=false;if(secret)stdout.write('\n');resolve(value);});
 });
 const email=await ask('Existing OWNER email: ');password=await ask('Password (hidden): ',true);rl.close();
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const origin of ['http://localhost:5173','http://127.0.0.1:5173']) {
  const context=await browser.newContext();const page=await context.newPage();
  try {
   await page.goto(origin+'/login');
   await page.locator('input[type=email]').fill(email);
   await page.locator('input[type=password]').fill(password);
   const [login]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login')&&r.request().method()==='POST'),page.locator('button[type=submit],form button').first().click()]);
   if(login.status()!==200)throw Error('Login status '+login.status());
   await expect(page).toHaveURL(origin+'/');
   const me=await context.request.get(origin+'/api/v1/auth/me');const account=await me.json();
   if(me.status()!==200 || account.user?.role!=='OWNER')throw Error('OWNER session verification failed');
   const cookie=(await context.cookies()).find(c=>c.name==='session');
   if(!cookie?.httpOnly || cookie.domain!==new URL(origin).hostname || cookie.path!=='/api' || cookie.sameSite!=='Lax')throw Error('Cookie policy failed');
   if(await page.evaluate(()=>document.cookie.includes('session=')))throw Error('Session visible to JavaScript');
   await page.reload();await expect(page).toHaveURL(origin+'/');
   await expect(page.locator('.stat-grid')).toBeVisible();
   const users=await context.request.get(origin+'/api/v1/users');
   if(users.status()!==200)throw Error('OWNER permission verification failed');
   const [logout]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/logout')),page.getByRole('button',{name:'\u0110\u0103ng xu\u1ea5t',exact:true}).click()]);
   if(logout.status()!==204)throw Error('Logout failed');
   await expect(page).toHaveURL(origin+'/login');
   if((await context.request.get(origin+'/api/v1/auth/me')).status()!==401)throw Error('Session not revoked');
   console.log(JSON.stringify({origin,login:200,me:200,role:'OWNER',redirect:'PASS',reload:'PASS',cookie:'HttpOnly; host-only; SameSite=Lax; Path=/api',users:200,logout:204,me_after_logout:401}));
  } finally {
   // Revoke any session left by a failed assertion; never expose the cookie.
   await context.request.post(origin+'/api/v1/auth/logout',{headers:{Origin:origin,'X-Requested-With':'retail-web'}}).catch(()=>{});
   await context.close();
  }
 }
} catch {
 console.error('Verification incomplete. Check the browser, credentials and running development services. No secrets printed.');process.exitCode=1;
} finally {password='';muted=false;rl?.close();await browser?.close();stdin.pause();}
