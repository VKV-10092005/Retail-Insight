// Test-only serialized transactional oracle, NOT an InnoDB emulator or production lock.
// No sockets, files, SQL engine, env or runtime pool.
export function modelDatabase(){
 const db={
  state:{headers:[],items:[],movements:[],receipts:[],audits:[],finalizations:[],
   balances:{'1:11:31':1,'1:11:32':1,'1:12:31':1},revision:{'1:11':'0','1:12':'0'}},
  events:[],fault:null,commitFault:null,clock:['2026-11-06 01:00:00.000001'],
  role:'CASHIER',assignment:'CASHIER',sessionRevoked:null,periodClosed:false,policyId:1,
  expiry:'2027-01-01 00:00:00.000000',epoch:1,rollbacks:0,destroyed:0,connections:0
 };
 let tail=Promise.resolve();
 db.pool={p14Kind:'isolated-mock',getConnection:async()=>{
  db.connections++;let state,releaseLock,working=false,destroyed=false;
  const release=()=>{if(releaseLock){releaseLock();releaseLock=null;}};
  return {
   async query(sql){db.events.push({tag:sql,args:[]});return [[]];},
   async beginTransaction(){
    const old=tail;tail=new Promise(r=>{releaseLock=r;});await old;
    working=true;state=structuredClone(db.state);db.events.push({tag:'BEGIN',args:[]});
   },
   async execute(sql,args=[]){
    const tag=/\/\*p14:([a-z_]+)\*\//.exec(sql)?.[1];
    if(!tag)throw Error('Unexpected mock SQL: '+sql);
    db.events.push({tag,args:structuredClone(args),sql});
    if(destroyed)throw Object.assign(Error('disconnected'),{code:'ECONNRESET'});
    if(db.fault?.tag===tag){const f=db.fault;if(f.once)db.fault=null;throw Object.assign(Error('injected'),{code:f.code??'INJECTED',constraint:f.constraint});}
    const [org,a,b]=args;
    const row=value=>[value?[value]:[]];
    switch(tag){
     case 'control':return row({mode:'ENFORCED',schema_version:2,required_writer_epoch:db.epoch,reader_basis:'RECORDED_TIME'});
     case 'org':return row([1,2].includes(org)?{id:org,status:'ACTIVE'}:null);
     case 'user':return row(org===1&&a===1?{id:1,organization_id:1,status:'ACTIVE',role:db.role}:null);
     case 'session':return row(org===1&&a===1&&b==='s1'?{id:b,revoked_at:db.sessionRevoked,expires_at:db.expiry}:null);
     case 'guard':return row(state.revision[org+':'+a]!==undefined?{active_policy_id:a===11?db.policyId:2,live_revision:state.revision[org+':'+a]}:null);
     case 'branch':return row(org===1&&[11,12].includes(a)?{id:a,status:'ACTIVE'}:null);
     case 'assignment':return row(db.assignment?{role:db.assignment}:null);
     case 'lookup':{
      const h=state.headers.find(h=>h.organization_id===org&&h.type===a&&h.request_key.toLowerCase()===b.toLowerCase());
      if(!h)return row(null);
      const r=state.receipts.find(r=>r.document_id===h.id);
      return row({...h,receipt_id:r?.id,request_schema_version:r?.request_schema_version,
       envelope_hash:r?.envelope_hash?Buffer.from(r.envelope_hash):undefined,response_json:r?.response_json});
     }
     case 'clock':return row({utc:db.clock.length>1?db.clock.shift():db.clock[0]});
     case 'policy':return row({id:b,organization_id:org,branch_id:a,policy_version:'1',business_timezone:'Asia/Ho_Chi_Minh',
      date_algorithm_version:'business-date-v2',live_date_mode:'TODAY_ONLY',effective_from_utc:'2026-01-01 00:00:00.000000'});
     case 'period':return row({id:1,date_start:b,date_end_exclusive:b==='2026-11-01'?'2026-12-01':'2027-01-01',
      live_state:db.periodClosed?'CLOSED':'OPEN',version:1});
     case 'product':return row({id:a,sku:'SKU-'+a,name:'Synthetic',status:'ACTIVE',sale_price:'10.29'});
     case 'balance_upsert':state.balances[org+':'+a+':'+b]??=0;return [{affectedRows:0}];
     case 'balance':return row({product_id:b,quantity:state.balances[org+':'+a+':'+b]});
     case 'balance_update':state.balances[args[1]+':'+args[2]+':'+args[3]]=args[0];return [{affectedRows:1}];
     case 'revision':state.revision[args[1]+':'+args[2]]=args[0];return [{affectedRows:1}];
    }
    const collection={header:'headers',item:'items',movement:'movements',receipt:'receipts',audit:'audits',finalization:'finalizations'}[tag];
    if(collection){
     const names=/\(([^)]+)\) VALUES/.exec(sql)[1].split(',');
     const record=Object.fromEntries(names.map((n,i)=>[n.trim(),args[i]]));
     record.id=String(state[collection].length+1);
     if(tag==='header'&&state.headers.some(h=>h.organization_id===record.organization_id&&h.type===record.type&&h.request_key.toLowerCase()===record.request_key.toLowerCase()))
      throw Object.assign(Error('identity conflict'),{code:'ER_DUP_ENTRY',constraint:'document_request'});
     state[collection].push(record);return [{affectedRows:1,insertId:record.id}];
    }
    throw Error('Unhandled '+tag);
   },
   async commit(){
    if(db.commitFault==='before'){db.commitFault=null;throw Object.assign(Error('commit disconnected'),{code:'ECONNRESET'});}
    db.state=state;working=false;release();db.events.push({tag:'COMMIT'});
    if(db.commitFault==='after'){db.commitFault=null;throw Object.assign(Error('ACK lost'),{code:'ECONNRESET'});}
   },
   async rollback(){db.rollbacks++;working=false;release();db.events.push({tag:'ROLLBACK'});},
   release(){release();db.events.push({tag:'RELEASE'});},
   destroy(){destroyed=true;db.destroyed++;working=false;release();db.events.push({tag:'DESTROY'});}
  };
 }};
 return db;
}

