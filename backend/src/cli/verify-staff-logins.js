import 'dotenv/config';

const password=process.env.RESET_STAFF_PASSWORD;
const base=process.env.AUTH_TEST_BASE_URL||'http://127.0.0.1:3000/api/v1/auth';
const emails=['manager@cuahang.vn','cashier@cuahang.vn','inventory@cuahang.vn'];

if(!password)throw new Error('RESET_STAFF_PASSWORD is required');

const results=[];
for(const email of emails){
 const response=await fetch(`${base}/login`,{
  method:'POST',
  headers:{'Content-Type':'application/json','X-Requested-With':'retail-web'},
  body:JSON.stringify({email,password})
 });
 const body=await response.json();
 results.push({email,http_status:response.status,role:body.user?.role||null,success:response.status===200});
 const cookie=response.headers.get('set-cookie')?.split(';')[0];
 if(cookie)await fetch(`${base}/logout`,{method:'POST',headers:{Cookie:cookie,'X-Requested-With':'retail-web'}});
}

console.log(JSON.stringify(results));
if(results.some(result=>!result.success))process.exitCode=1;
