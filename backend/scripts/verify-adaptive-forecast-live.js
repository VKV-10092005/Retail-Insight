import 'dotenv/config';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import {pool,verifyDatabase} from '../src/db/pool.js';
import {config} from '../src/config/env.js';

const tenants=[
  {email:'vuong4651050332@st.qnu.edu.vn',organizationId:46,branchId:49},
  {email:'vovuong535@gmail.com',organizationId:45,branchId:48},
];
const sessions=[];
try {
  await verifyDatabase();
  const report=[];
  for(const tenant of tenants){
    const [[owner]]=await pool.execute("SELECT id,organization_id,role FROM users WHERE email=?",[tenant.email]);
    if(!owner||Number(owner.organization_id)!==tenant.organizationId||owner.role!=='OWNER')throw new Error(`Owner/tenant identity verification failed for ${tenant.email}`);
    const [[branch]]=await pool.execute('SELECT id FROM branches WHERE id=? AND organization_id=? AND status=\'ACTIVE\'',[tenant.branchId,tenant.organizationId]);
    if(!branch)throw new Error(`Branch verification failed for organization ${tenant.organizationId}`);
    const [[counts]]=await pool.execute("SELECT (SELECT COUNT(*) FROM products WHERE organization_id=? AND status='ACTIVE') active_products,(SELECT COUNT(*) FROM categories WHERE organization_id=?) categories",[tenant.organizationId,tenant.organizationId]);
    const [products]=await pool.execute("SELECT id FROM products WHERE organization_id=? AND status='ACTIVE' ORDER BY id LIMIT 3",[tenant.organizationId]);
    if(!products.length)throw new Error(`No active products for organization ${tenant.organizationId}`);
    const sessionId=randomUUID();sessions.push(sessionId);
    await pool.execute('INSERT INTO auth_sessions(id,organization_id,user_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))',[sessionId,tenant.organizationId,owner.id]);
    const token=jwt.sign({},config.secret,{algorithm:'HS256',subject:String(owner.id),jwtid:sessionId,issuer:'retail-app',audience:'retail-web',expiresIn:'15m'});
    const base='http://127.0.0.1:3000/api/v1';
    async function get(task,extra=''){
      const url=`${base}/ai/forecast?task=${task}&branch_id=${tenant.branchId}&origin=2026-10${extra}`;
      const response=await fetch(url,{headers:{Cookie:`session=${token}`,'X-Requested-With':'retail-web'},signal:AbortSignal.timeout(60000)});
      let data={};try{data=await response.json()}catch{}
      return {http:response.status,data};
    }
    const sku=await get('sku',`&product_id=${products[0].id}`);
    const total=await get('total');
    const multi=await get('multi_sku',`&product_ids=${products.map(p=>p.id).join(',')}`);
    const replenishment=await get('replenishment');
    const stockout=await get('stockout');
    const summarize=({http,data})=>({http,status:data.status||null,item_count:Array.isArray(data.items)?data.items.length:null,numeric_results:(data.items||[]).filter(x=>Number.isFinite(Number(x.quantity??x.corrected))).length,horizons:[...new Set((data.items||[]).flatMap(x=>x.forecasts||[]).map(x=>x.horizon).concat((data.items||[]).map(x=>x.horizon).filter(Boolean)))].sort(),sample_quantity:data.items?.[0]?.quantity??data.items?.[0]?.corrected??null,reason:data.reason||null});
    report.push({organization_id:tenant.organizationId,branch_id:tenant.branchId,active_products:Number(counts.active_products),categories:Number(counts.categories),tasks:{sku:summarize(sku),total:summarize(total),multi_sku:summarize(multi),replenishment:summarize(replenishment),stockout:summarize(stockout)}});
  }
  console.log(JSON.stringify({database:'retail_app',tenants:report},null,2));
} finally {
  for(const id of sessions)await pool.execute('DELETE FROM auth_sessions WHERE id=?',[id]);
  await pool.end();
}
