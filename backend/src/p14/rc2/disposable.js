import net from 'node:net';
import {createHash,X509Certificate} from 'node:crypto';
import {immutable,canonical,reject,assertTarget,isHash} from './contracts.js';
import {assertEffectiveGrants} from './grants.js';
const pools=new WeakMap();
export const isVerifiedDisposablePool=p=>pools.has(p)&&!pools.get(p).closed;
const mode=s=>String(s).split(',').map(s=>s.trim()).sort().join(',');
const ip=s=>String(s??'').replace(/^::ffff:/,'');
function inputs(config,permit){
 if(!config||!permit)reject('CONFIG_REQUIRED');
 const c=immutable(config),p=immutable(permit);
 assertTarget(p,{database:c.database,server_uuid:p.serverUuid},'DB_CONNECT');
 if(c.credentialSource!=='a2-disposable-secret'||typeof c.password!=='string'||!c.password||
  !/^p14_test_[a-zA-Z0-9_]{1,23}$/.test(c.user)||!net.isIP(c.host)||
  !Number.isInteger(c.port)||c.port<1||c.port>65535||p.host!==c.host||p.port!==c.port||
  !p.endpoints?.some(e=>e.host===c.host&&e.port===c.port)||!p.principal||
  !/^p14_test_[a-zA-Z0-9_]+@[^@%_\s]+$/.test(p.principal.account)||p.principal.account.split('@')[0]!==c.user||/[%_]/.test(p.principal.account.split('@')[1]??'')||
  !p.connectionOrigins?.length||!p.version||!p.versionComment||!p.sqlMode||
  !/STRICT_TRANS_TABLES|STRICT_ALL_TABLES/.test(p.sqlMode)||
  !p.charset||!p.collations||!Array.isArray(p.columns)||!Array.isArray(p.schemaTables)||
  !['READY','EMPTY_BOOTSTRAP'].includes(p.schemaState)||
  !Number.isInteger(p.lowerCaseTableNames)||!isHash(p.imageDigest)||
  !Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=Date.now())reject('CONFIG_INCOMPLETE');
 const v=/^(\d+)\.(\d+)\.(\d+)/.exec(p.version);
 if(!v||/mariadb/i.test(p.version)||+v[1]<8||(+v[1]===8&&+v[2]===0&&+v[3]<16))reject('MYSQL_VERSION');
 for(const k of ['server','database','connection']){
  if(!/^[a-z0-9_]+$/.test(p.charset[k]??'')||!/^[a-z0-9_]+$/.test(p.collations[k]??''))reject('CHARSET_COLLATION_BINDING');
 }
 if(p.schemaState==='READY'&&(!p.schemaTables.length||!p.columns.length))reject('TABLE_COVERAGE_EMPTY');
 if(p.transport?.kind==='TLS'){
  if(typeof c.ca!=='string'||!c.ca||!isHash(p.transport.fingerprint))reject('TLS_BINDING');
 }else if(p.transport?.kind!=='ISOLATED_LOOPBACK'||!['127.0.0.1','::1'].includes(c.host)||!p.transport.exceptionApprovalRef)
  reject('TRANSPORT_POLICY');
 return {c,p,options:{host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,
  charset:p.collations.connection,timezone:'Z',dateStrings:true,supportBigNumbers:true,bigNumberStrings:true,
  multipleStatements:false,connectTimeout:2000,
  ...(p.transport.kind==='TLS'?{ssl:{ca:c.ca,rejectUnauthorized:true}}:{})}};
}
export function assertObserved(c,p,o,{utcReady=false,rcReady=false}={}){
 assertTarget(p,o,'DB_CONNECT'); // Denylist is re-evaluated on every observation.
 const same=(a,b)=>canonical(a)===canonical(b);
 if(o.host!==c.host||o.port!==c.port||o.server_port!==p.serverPort||
  o.version!==p.version||o.version_comment!==p.versionComment||
  o.current_user!==p.principal.account||!p.connectionOrigins.includes(o.connection_user)||
  o.current_role!=='NONE'||Number(o.read_only)!==0||mode(o.sql_mode)!==mode(p.sqlMode)||
  Number(o.lower_case_table_names)!==p.lowerCaseTableNames)reject('OBSERVED_IDENTITY');
 for(const k of ['server','database','connection']){
  if(o['character_set_'+k]!==p.charset[k]||o['collation_'+k]!==p.collations[k])reject('OBSERVED_COLLATION');
 }
 if(utcReady&&o.session_timezone!=='+00:00')reject('SESSION_UTC');
 if(rcReady&&o.session_isolation!=='READ-COMMITTED')reject('SESSION_ISOLATION');
 if(!same(o.image_digest??p.imageDigest,p.imageDigest))reject('IMAGE_PROVENANCE');
}
export async function openDisposable({config,permit,connect,timeoutMs=2000}){
 const {c,p,options}=inputs(config,permit);
 if(typeof connect!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)reject('CONNECTOR_OR_DEADLINE');
 let raw,closed=false,generation=0,pending=0,busy=false,active=false,utcReady=false,rcReady=false;
 let timer,abort;
 const terminal=new Promise((_,rejectPromise)=>{abort=rejectPromise;});terminal.catch(()=>{});
 const deadError=()=>Object.assign(Error('P14 RC2 connection closed/cancelled'),{code:'P14_DEADLINE'});
 function destroy(){
  if(closed)return;closed=true;generation++;clearTimeout(timer);raw?.destroy();
  abort(deadError());
 }
 function live(g=generation){if(closed||g!==generation)throw deadError();}
 function setDeadline(deadline){
  live();clearTimeout(timer);
  if(!Number.isFinite(deadline)||deadline<=Date.now()){destroy();throw deadError();}
  timer=setTimeout(destroy,deadline-Date.now());
 }
 const connecting=Promise.resolve().then(()=>connect(options)).then(r=>{
  if(closed){r.destroy();throw deadError();}raw=r;return r;
 });
 setDeadline(Date.now()+timeoutMs);
 try{await Promise.race([connecting,terminal]);live();}catch(e){destroy();throw e;}
 async function invoke(method,...args){
  const g=generation;live(g);pending++;
  try{const result=await Promise.race([Promise.resolve().then(()=>{live(g);return raw[method](...args);}),terminal]);live(g);return result;}
  finally{pending--;}
 }
 async function exclusive(fn){
  live();if(busy){destroy();reject('CONCURRENT_CONNECTION_USE');}busy=true;
  try{return await fn();}catch(e){destroy();throw e;}finally{busy=false;}
 }
 function transport(){
  live();const stream=raw.connection?.stream??raw.stream;
  if(!stream||ip(stream.remoteAddress)!==ip(c.host)||Number(stream.remotePort)!==c.port)reject('SOCKET_PEER');
  if(p.transport.kind==='TLS'){
   const cert=stream.getPeerCertificate?.(true),bytes=cert?.raw;
   if(stream.authorized!==true||!bytes||!['TLSv1.2','TLSv1.3'].includes(stream.getProtocol?.())||
    createHash('sha256').update(bytes).digest('hex')!==p.transport.fingerprint)reject('TLS_PEER');
   try{if(!new X509Certificate(bytes).checkIP(c.host))reject('TLS_SAN');}catch{reject('TLS_SAN');}
  }
 }
 async function verify(){
  live();transport();
  if(Date.parse(p.expiresAt)<=Date.now())reject('PERMIT_EXPIRED');
  const [[o]]=await invoke('query',`SELECT DATABASE() AS \`database\`,@@server_uuid AS server_uuid,
   @@port AS server_port,VERSION() AS version,@@version_comment AS version_comment,
   CURRENT_USER() AS current_user,USER() AS connection_user,CURRENT_ROLE() AS current_role,
   @@read_only AS read_only,@@sql_mode AS sql_mode,@@lower_case_table_names AS lower_case_table_names,
   @@character_set_server AS character_set_server,@@collation_server AS collation_server,
   @@character_set_database AS character_set_database,@@collation_database AS collation_database,
   @@character_set_connection AS character_set_connection,@@collation_connection AS collation_connection,
   @@session.time_zone AS session_timezone,@@session.transaction_isolation AS session_isolation`);
  live();o.host=c.host;o.port=c.port;
  assertObserved(c,p,o,{utcReady,rcReady});
  const [grantRows]=await invoke('query','SHOW GRANTS');
  live();assertEffectiveGrants(grantRows.map(r=>Object.values(r)[0]),p.principal,c.database);
  const [tables]=await invoke('execute','SELECT TABLE_NAME,ENGINE FROM information_schema.tables WHERE table_schema=? AND table_type=? ORDER BY TABLE_NAME',[c.database,'BASE TABLE']);
  live();
  const states=p.schemaStates??[{state:p.schemaState,tables:p.schemaTables,columns:p.columns}];
  const coverage=states.find(s=>Array.isArray(s.tables)&&
   canonical(tables.map(t=>t.TABLE_NAME).sort())===canonical([...s.tables].sort()));
  if(tables.some(t=>t.ENGINE!=='InnoDB')||!coverage||
   (coverage.state==='EMPTY_BOOTSTRAP'&&(p.principal.role!=='migrator'||tables.length))||
   !['READY','EMPTY_BOOTSTRAP'].includes(coverage.state))reject('TABLE_ENGINE_COVERAGE');
  const [columns]=await invoke('execute',`SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME
   FROM information_schema.columns WHERE table_schema=? AND CHARACTER_SET_NAME IS NOT NULL
   ORDER BY TABLE_NAME,ORDINAL_POSITION`,[c.database]);
  live();
  const expectedColumns=coverage.columns.map(c=>({...c}));
  const actualColumns=columns.map(c=>({table:c.TABLE_NAME,column:c.COLUMN_NAME,type:c.COLUMN_TYPE,
   charset:c.CHARACTER_SET_NAME,collation:c.COLLATION_NAME}));
  const sorted=cols=>cols.sort((a,b)=>(a.table+'.'+a.column).localeCompare(b.table+'.'+b.column));
  if(canonical(sorted(expectedColumns))!==canonical(sorted(actualColumns)))reject('COLUMN_COLLATION_ENUM');
  return immutable(o);
 }
 try{
  await verify();
  await invoke('query',"SET time_zone='+00:00'");utcReady=true;
  await invoke('query','SET collation_connection='+p.collations.connection);
  await verify();
 }catch(e){destroy();throw e;}
 // Admission timer remains until owner assigns its transaction deadline or releases.
 const connection={
  setDeadline,
  verify:()=>exclusive(verify),
  beginReadCommitted:()=>exclusive(async()=>{
   if(active)reject('TRANSACTION_ALREADY_ACTIVE');
   await verify();
   await invoke('query','SET SESSION innodb_lock_wait_timeout=2');
   await invoke('query','SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
   rcReady=true;
   // No verification or other query between the isolation SET and BEGIN.
   await invoke('beginTransaction');active=true;
  }),
  beginTransaction:()=>exclusive(async()=>{await verify();await invoke('beginTransaction');active=true;}),
  query:(...args)=>exclusive(async()=>{await verify();assertTarget(p,{database:c.database,server_uuid:p.serverUuid},'SQL');return invoke('query',...args);}),
  execute:(...args)=>exclusive(async()=>{await verify();assertTarget(p,{database:c.database,server_uuid:p.serverUuid},'SQL');return invoke('execute',...args);}),
  commit:()=>exclusive(async()=>{if(!active)reject('NO_TRANSACTION');await verify();await invoke('commit');active=false;}),
  rollback:()=>exclusive(async()=>{if(!active)reject('NO_TRANSACTION');await verify();await invoke('rollback');active=false;}),
  destroy,
  release(){
   if(closed)return;
   if(active||pending||busy){destroy();return;}
   closed=true;generation++;clearTimeout(timer);abort(deadError());
   if(typeof raw.release==='function')raw.release();else raw.destroy();
  }
 };
 return Object.freeze(connection);
}
export function createDisposableWriterPool({config,permit,createPool}){
 const captured=inputs(config,permit); // Snapshot before construction, never use caller references again.
 if(typeof createPool!=='function'||captured.p.principal.role!=='backend')reject('BACKEND_POOL_PRINCIPAL');
 const native=createPool({...captured.options,connectionLimit:10,waitForConnections:false});
 const state={closed:false};const pool=Object.freeze({
  async getConnection(){if(state.closed)reject('POOL_CLOSED');return openDisposable({config:captured.c,permit:captured.p,connect:()=>native.getConnection()});},
  async end(){state.closed=true;await native.end();}
 });
 pools.set(pool,state);return pool;
}

