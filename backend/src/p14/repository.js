import {fail,assertControl,assertPolicy} from './domain.js';
const one=async(c,tag,sql,args=[])=>{
 const [rows]=await c.execute('/*p14:'+tag+'*/ '+sql,args);
 return rows[0]??null;
};
async function change(c,tag,sql,args){
 const [r]=await c.execute('/*p14:'+tag+'*/ '+sql,args);
 if(r.affectedRows!==1)fail(503,'WRITE_COUNT_'+tag.toUpperCase());
 return r;
}
const tables=new Set(['stock_documents','stock_document_items','inventory_movements',
 'document_request_receipts','document_finalizations','business_audit_events']);
async function insert(c,tag,table,row){
 if(!tables.has(table)||Object.keys(row).some(k=>!/^[_a-z][_a-z0-9]*$/.test(k)))throw Error('Internal insert shape');
 const keys=Object.keys(row);
 return change(c,tag,'INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',Object.values(row));
}
// One repository per transaction; no connection, env, singleton pool or RAM business lock.
export function createPostingRepository(c){
 let rank=-1;
 function enter(n){if(n<rank)throw Error('P14 lock rank inversion');rank=n;}
 return {
  async lockIdentity(ctx){
   enter(0);
   const control=await one(c,'control','SELECT * FROM business_schema_control WHERE singleton_id=1 FOR SHARE');
   assertControl(control);
   enter(1);
   const org=await one(c,'org','SELECT id,status FROM organizations WHERE id=? FOR SHARE',[ctx.org]);
   if(org?.status!=='ACTIVE')fail(401,'ORGANIZATION_INACTIVE');
   enter(2);
   const user=await one(c,'user','SELECT id,organization_id,role,status FROM users WHERE organization_id=? AND id=? FOR SHARE',[ctx.org,ctx.userId]);
   if(user?.status!=='ACTIVE')fail(401,'USER_INACTIVE');
   enter(3);
   const session=await one(c,'session','SELECT id,expires_at,revoked_at FROM auth_sessions WHERE organization_id=? AND user_id=? AND id=? FOR SHARE',[ctx.org,ctx.userId,ctx.sessionId]);
   if(!session||session.revoked_at!==null)fail(401,'SESSION_REVOKED');
   return {user,session,control};
  },
  async lockBranch(ctx,branch,user,type){
   enter(4);
   const guard=await one(c,'guard','SELECT * FROM branch_posting_guards WHERE organization_id=? AND branch_id=? FOR UPDATE',[ctx.org,branch]);
   if(!guard?.active_policy_id)fail(503,'GUARD_OR_POLICY_MISSING');
   enter(5);
   const b=await one(c,'branch','SELECT id,status FROM branches WHERE organization_id=? AND id=? FOR SHARE',[ctx.org,branch]);
   if(b?.status!=='ACTIVE')fail(404,'BRANCH_INACTIVE');
   const allowed=type==='SALE'?['MANAGER','CASHIER']:['MANAGER','INVENTORY'];
   if(user.role!=='OWNER'){
    if(!allowed.includes(user.role))fail(403,'ROLE_FORBIDDEN');
    const assignment=await one(c,'assignment','SELECT role FROM user_branch_roles WHERE organization_id=? AND branch_id=? AND user_id=? FOR SHARE',[ctx.org,branch,ctx.userId]);
    if(!assignment||!allowed.includes(assignment.role))fail(403,'BRANCH_FORBIDDEN');
   }
   return guard;
  },
  async lookup(org,type,key){
   return one(c,'lookup',`SELECT d.id,d.branch_id,d.total,d.payload_hash,d.business_date_origin,
    r.id AS receipt_id,r.request_schema_version,r.envelope_hash,r.response_json
    FROM stock_documents d LEFT JOIN document_request_receipts r
     ON r.organization_id=d.organization_id AND r.branch_id=d.branch_id AND r.document_id=d.id
    WHERE d.organization_id=? AND d.type=? AND d.request_key=?`,[org,type,key]);
  },
  async lockPolicy(ctx,branch,id){
   enter(6);
   const p=await one(c,'policy','SELECT * FROM business_posting_policies WHERE organization_id=? AND branch_id=? AND id=? FOR SHARE',[ctx.org,branch,id]);
   assertPolicy(p,branch,ctx.org);return p;
  },
  async lockPeriod(ctx,branch,dateStart){
   enter(6);
   return one(c,'period','SELECT * FROM business_periods WHERE organization_id=? AND branch_id=? AND date_start=? FOR UPDATE',[ctx.org,branch,dateStart]);
  },
  now(){return one(c,'clock',"SELECT DATE_FORMAT(UTC_TIMESTAMP(6),'%Y-%m-%d %H:%i:%s.%f') AS utc").then(r=>r.utc);},
  async lockProducts(ctx,items){
   enter(8);const rows=[];
   for(const item of items){
    const p=await one(c,'product','SELECT id,sku,name,sale_price,status FROM products WHERE organization_id=? AND id=? FOR UPDATE',[ctx.org,item.product_id]);
    if(!p)fail(404,'PRODUCT_NOT_FOUND');rows.push(p);
   }
   return rows;
  },
  async lockBalances(ctx,branch,items){
   enter(9);const rows=[];
   for(const item of items){
    await c.execute('/*p14:balance_upsert*/ INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity',[ctx.org,branch,item.product_id]);
    rows.push(await one(c,'balance','SELECT product_id,quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',[ctx.org,branch,item.product_id]));
   }
   return rows;
  },
  async persist(ctx,d,type,meta,plan,guard,policy,period,eh,rh,correlationId){
   enter(10);
   const header=await insert(c,'header','stock_documents',{
    organization_id:ctx.org,branch_id:d.branch_id,type,request_key:d.request_key,
    payload_hash:eh,performed_by:ctx.userId,total:plan.total,note:d.note??null,
    created_at:meta.created_at,business_date:meta.business_date,business_timezone:'Asia/Ho_Chi_Minh',
    date_policy_version:'business-date-v2',business_date_origin:'SERVER_TODAY',writer_epoch:1,
    posting_revision:meta.revision,policy_id:policy.id,period_id:period.id,accepted_at_utc:meta.accepted_at_utc
   });
   // Dedicated driver must use supportBigNumbers+bigNumberStrings to avoid rounded insertId.
   const documentId=header.insertId;
   if(typeof documentId==='number'&&!Number.isSafeInteger(documentId))fail(503,'UNSAFE_DOCUMENT_ID');
   for(const line of plan.lines){
    await insert(c,'item','stock_document_items',{
     organization_id:ctx.org,document_id:documentId,product_id:line.product_id,
     sku:line.sku,product_name:line.product_name,quantity:line.quantity,unit_price:line.unit_price
    });
    await change(c,'balance_update','UPDATE inventory_balances SET quantity=? WHERE organization_id=? AND branch_id=? AND product_id=?',
     [line.balance_after,ctx.org,d.branch_id,line.product_id]);
    await insert(c,'movement','inventory_movements',{
     organization_id:ctx.org,branch_id:d.branch_id,product_id:line.product_id,
     document_id:documentId,quantity_delta:line.quantity_delta,balance_after:line.balance_after
    });
   }
   await change(c,'revision','UPDATE branch_posting_guards SET live_revision=? WHERE organization_id=? AND branch_id=? AND live_revision=?',
    [meta.revision,ctx.org,d.branch_id,guard.live_revision]);
   const result={id:documentId,total:Number(plan.total),replayed:false};
   const receipt=await insert(c,'receipt','document_request_receipts',{
    organization_id:ctx.org,branch_id:d.branch_id,document_type:type,request_key:d.request_key,
    request_schema_version:'document-envelope-v2',envelope_hash:Buffer.from(eh,'hex'),
    resolved_hash:Buffer.from(rh,'hex'),business_date:meta.business_date,policy_id:policy.id,
    period_id:period.id,accepted_at_utc:meta.accepted_at_utc,document_id:documentId,
    response_version:'document-response-v2',response_json:JSON.stringify(result)
   });
   await insert(c,'audit','business_audit_events',{
    organization_id:ctx.org,branch_id:d.branch_id,actor_kind:'USER',actor_user_id:ctx.userId,
    actor_service_ref:null,action:'DOCUMENT_POSTED',target_kind:'STOCK_DOCUMENT',
    target_ref:String(documentId),correlation_id:correlationId,occurred_at_utc:meta.accepted_at_utc,
    policy_id:policy.id,data_revision:meta.revision,reason:null,
    metadata:JSON.stringify({type,request_schema_version:'document-envelope-v2'})
   });
   await insert(c,'finalization','document_finalizations',{
    organization_id:ctx.org,branch_id:d.branch_id,document_id:documentId,kind:'NATIVE',
    receipt_id:receipt.insertId,migration_manifest_sha256:null,finalized_at_utc:meta.accepted_at_utc
   });
   return result;
  }
 };
}

