import {canonical,reject} from './contracts.js';
const reference=['organizations','users','auth_sessions','branches','user_branch_roles',
 'business_schema_control','branch_posting_guards','business_posting_policies','business_periods',
 'products','categories','inventory_balances','stock_documents','stock_document_items',
 'inventory_movements','document_request_receipts','document_finalizations'];
const economic=['stock_documents','stock_document_items','inventory_movements',
 'document_request_receipts','document_finalizations','business_audit_events'];
export function principalPolicy(role,schema){
 const rules=[],put=(privilege,table,columns=null,s= schema)=>rules.push({schema:s,table,privilege,columns});
 if(role==='migrator'){
  for(const p of ['SELECT','INSERT','UPDATE','CREATE','ALTER','INDEX','REFERENCES','TRIGGER'])put(p,'*');
 }else if(role==='backend'){
  for(const t of reference)put('SELECT',t);
  for(const t of [...economic,'inventory_balances'])put('INSERT',t);
  put('UPDATE','inventory_balances',['quantity']);put('UPDATE','branch_posting_guards',['live_revision']);
 }else if(role==='control'){
  for(const t of reference)put('SELECT',t);
  put('UPDATE','business_periods',['live_state','version','changed_by','changed_at_utc']);
  put('UPDATE','branch_posting_guards',['active_policy_id']);
  put('UPDATE','users',['role','status']);put('UPDATE','auth_sessions',['revoked_at']);
  put('INSERT','user_branch_roles');put('DELETE','user_branch_roles');put('INSERT','business_audit_events');
 }else if(role==='seed'){
  for(const t of reference){put('SELECT',t);put('INSERT',t);}
  put('INSERT','business_audit_events');
 }else if(role==='observer'){
  for(const t of [...reference,'business_audit_events','migration_tx_receipts'])put('SELECT',t);
  for(const t of ['threads','events_transactions_current','data_locks','data_lock_waits',
   'events_statements_summary_by_digest'])put('SELECT',t,null,'performance_schema');
 }else reject('PRINCIPAL_ROLE');
 return normalize(rules);
}
const ident=s=>{
 const m=/^(?:`([a-zA-Z0-9_]+)`|([a-zA-Z0-9_]+))$/.exec(s.trim());
 if(!m)reject('GRANT_IDENTIFIER');return m[1]??m[2];
};
function splitTop(s){
 let depth=0,quote=false,start=0;const chunks=[];
 for(let i=0;i<s.length;i++){
  if(s[i]==='`')quote=!quote;
  if(!quote){if(s[i]==='(')depth++;if(s[i]===')')depth--;if(depth<0)reject('GRANT_SYNTAX');}
  if(s[i]===','&&!depth&&!quote){chunks.push(s.slice(start,i));start=i+1;}
 }
 if(depth||quote)reject('GRANT_SYNTAX');chunks.push(s.slice(start));return chunks;
}
function normalize(rules){
 const map=new Map();
 for(const rule of rules){
  const key=rule.schema+'.'+rule.table+':'+rule.privilege;
  const old=map.get(key);
  if(!old)map.set(key,{...rule,columns:rule.columns===null?null:[...new Set(rule.columns)].sort()});
  else if(old.columns===null||rule.columns===null)old.columns=null;
  else old.columns=[...new Set([...old.columns,...rule.columns])].sort();
 }
 return [...map.values()].sort((a,b)=>canonical(a).localeCompare(canonical(b)));
}
export function parseGrants(lines,account){
 if(!Array.isArray(lines)||!lines.length)reject('GRANTS_EMPTY');
 const rules=[];
 for(const line of lines){
  if(typeof line!=='string'||/WITH |IDENTIFIED|PROXY|;|\/\*|--/i.test(line))reject('GRANTS_UNSUPPORTED');
  const m=/^GRANT (.+) ON (.+) TO (?:'([^']+)'|`([^`]+)`|([a-zA-Z0-9_]+))@(?:'([^']+)'|`([^`]+)`|([a-zA-Z0-9_.:/-]+))$/.exec(line);
  if(!m)reject('GRANTS_ROLE_OR_SYNTAX');
  const who=(m[3]??m[4]??m[5])+'@'+(m[6]??m[7]??m[8]);
  if(who!==account)reject('GRANTS_ACCOUNT');
  if(m[1]==='USAGE'&&m[2]==='*.*')continue;
  const scope=/^([^.]*)\.([^.]*)$/.exec(m[2]);if(!scope)reject('GRANTS_SCOPE');
  const schema=ident(scope[1]),table=scope[2]==='*'?'*':ident(scope[2]);
  for(const raw of splitTop(m[1])){
   const p=/^\s*([A-Z]+)(?:\s*\(([^)]+)\))?\s*$/.exec(raw);
   if(!p||!['SELECT','INSERT','UPDATE','DELETE','CREATE','ALTER','INDEX','REFERENCES','TRIGGER'].includes(p[1]))reject('GRANTS_PRIVILEGE');
   const columns=p[2]?splitTop(p[2]).map(ident):null;
   if(columns&&(!['SELECT','INSERT','UPDATE','REFERENCES'].includes(p[1])||table==='*'))reject('GRANTS_COLUMNS');
   rules.push({schema,table,privilege:p[1],columns});
  }
 }
 return normalize(rules);
}
export function assertEffectiveGrants(lines,principal,schema){
 const actual=parseGrants(lines,principal.account),expected=principalPolicy(principal.role,schema);
 if(canonical(actual)!==canonical(expected))reject('GRANTS_MISSING_OR_EXCESS');
 return actual;
}

