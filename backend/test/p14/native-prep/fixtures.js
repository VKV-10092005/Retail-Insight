import {digest,immutable} from '../../../src/p14/rc2/contracts.js';
import {acceptance,monthRange,legacyHash} from '../../../src/p14/domain.js';
import {Temporal} from '@js-temporal/polyfill';
export function fixturePlan({seed='p14-synthetic',utc,branches=2,products=4,legacy=true}={}){
 if(typeof seed!=='string'||!/^[a-zA-Z0-9_-]{1,20}$/.test(seed)||typeof utc!=='string'||!Number.isInteger(branches)||branches<2||branches>4||!Number.isInteger(products)||products<2||products>1000)throw Error('FIXTURE_BOUNDS');
 const instant=Temporal.Instant.from(utc),stamp=instant.toString().replace('T',' ').replace('Z','');
 const expiry=instant.add({hours:1}).toString().replace('T',' ').replace('Z','');
 const rows={},add=(table,row)=>(rows[table]??=[]).push(row);
 const actors=[],scope=[];
 for(const org of [11,12]){
  add('organizations',{id:org,name:'SYNTHETIC '+org,slug:digest(seed+org).slice(0,36),plan:'test',status:'ACTIVE'});
  for(const [i,role] of ['OWNER','MANAGER','CASHIER','INVENTORY'].entries()){
   const id=org*100+i+1,sid=digest(seed+':session:'+id).slice(0,36);
   add('users',{id,organization_id:org,email:'synthetic-'+seed.slice(0,12)+'-'+id+'@example.test',
    password_hash:'!DISABLED_FIXTURE_LOGIN!',full_name:'Synthetic '+role,role,status:'ACTIVE'});
   add('auth_sessions',{id:sid,organization_id:org,user_id:id,expires_at:expiry,revoked_at:null});
   actors.push({org,userId:id,sessionId:sid,role});
  }
  add('categories',{id:org,organization_id:org,name:'Synthetic'});
  for(let p=1;p<=products;p++)add('products',{id:org*10000+p,organization_id:org,category_id:org,
   sku:'SYNTHETIC-'+p,name:'Synthetic SKU '+p,sale_price:'10.29',cost_price:'5.00',status:'ACTIVE'});
  for(let b=1;b<=branches;b++){
   const branch=org*100+b;scope.push({org,branch});
   add('branches',{id:branch,organization_id:org,name:'Synthetic branch '+b,status:'ACTIVE'});
   for(const a of actors.filter(a=>a.org===org))add('user_branch_roles',{organization_id:org,user_id:a.userId,branch_id:branch,role:a.role});
   for(let p=1;p<=products;p++)add('inventory_balances',{organization_id:org,branch_id:branch,product_id:org*10000+p,quantity:p===1?1:10});
  }
 }
 for(const t of ['organizations','users','auth_sessions','products'])for(const r of rows[t])r.created_at=stamp;
 const legacyRequests=[];
 if(legacy){
  const dates=['1970-01-02 00:00:00','1975-06-12 00:00:00','2024-02-29 17:00:00'];
  for(const [i,date] of dates.entries()){
   const id=9000+i,body={branch_id:1101,request_key:'legacy-'+seed+'-'+i,items:[{product_id:110002,quantity:1,unit_price:5}]};
   add('stock_documents',{id,organization_id:11,branch_id:1101,type:'RECEIPT',request_key:body.request_key,payload_hash:legacyHash(body,'RECEIPT'),
    performed_by:1101,total:'5.00',note:null,created_at:date});
   add('stock_document_items',{organization_id:11,document_id:id,product_id:110002,sku:'SYNTHETIC-2',product_name:'Synthetic SKU 2',quantity:1,unit_price:'5.00'});
   add('inventory_movements',{organization_id:11,branch_id:1101,product_id:110002,document_id:id,quantity_delta:1,balance_after:11+i,created_at:date});
   legacyRequests.push({type:'RECEIPT',body,expectedId:String(id),businessDate:acceptance(date).business_date});
  }
  rows.inventory_balances.find(b=>b.organization_id===11&&b.branch_id===1101&&b.product_id===110002).quantity=13;
 }
 const month=monthRange(acceptance(stamp).business_date);
 const controlPlans=scope.map(({org,branch},i)=>({org,branch,policyId:300+i,periodId:400+i,actor:org*100+1,
  policyVersion:1,month,utc:stamp}));
 const order=['organizations','users','branches','user_branch_roles','auth_sessions','categories','products','inventory_balances',
  'stock_documents','stock_document_items','inventory_movements'];
 const statements=order.flatMap(table=>(rows[table]??[]).map(row=>({
  table,sql:'INSERT INTO '+table+' ('+Object.keys(row).join(',')+') VALUES ('+Object.keys(row).map(()=>'?').join(',')+')',
  params:Object.values(row),expectedAffectedRows:1
 })));
 return immutable({kind:'SYNTHETIC_PLAN_NOT_EXECUTED',seed,utc,rows,statements,actors,scope,controlPlans,legacyRequests,
  openingBalances:rows.inventory_balances.map(b=>({...b,quantity:b.organization_id===11&&b.branch_id===1101&&b.product_id===110002&&legacy?10:b.quantity})),
  digest:digest({seed,utc,rows})});
}
// Plans only. No SQL execution, random time, env, user/research data or generated credentials.
