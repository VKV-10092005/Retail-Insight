import net from 'node:net';
import {createHash} from 'node:crypto';
const verifiedWriterPools=new WeakSet();
export const isVerifiedDisposablePool=pool=>verifiedWriterPools.has(pool);
const deny=new Set(['retail_app','retail_management','retail_datawarehouse']);
const stop=()=>{throw Error('P14 disposable identity/credential gate rejected');};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function assertDisposableConfig(c,permit){
 if(!permit||permit.stage!=='A2_DISPOSABLE'||permit.allowNativeWrites!==true||
  !permit.approvalRef||!permit.runId)stop();
 if(!c||c.credentialSource!=='a2-disposable-secret'||typeof c.password!=='string'||!c.password||c.user==='root'||
  !/^p14_test_[a-zA-Z0-9_]+$/.test(c.user)||!/^retail_p14_test_[a-zA-Z0-9_]+$/.test(c.database)||deny.has(c.database))stop();
 if(!permit.schemas?.includes(c.database)||!permit.users?.includes(c.user)||
  !permit.endpoints?.some(e=>e.host===c.host&&e.port===c.port)||!net.isIP(c.host))stop();
 const version=/^(\d+)\.(\d+)\.(\d+)/.exec(permit.version??'');
 if(!version||/mariadb/i.test(permit.version)||Number(version[1])<8||
  (Number(version[1])===8&&Number(version[2])===0&&Number(version[3])<16))stop();
 if(!/STRICT_TRANS_TABLES|STRICT_ALL_TABLES/.test(permit.sqlMode??''))stop();
 if(!permit.forbiddenServerUuids?.length||permit.forbiddenServerUuids.includes(permit.serverUuid))stop();
 if(!Number.isInteger(c.port)||c.port<1||c.port>65535)stop();
 if(!permit.serverUuid||!permit.serverPort||!permit.version||!permit.sqlMode||
  !permit.tlsFingerprint&&!permit.isolatedLoopback)stop();
 if(permit.isolatedLoopback&&!['127.0.0.1','::1'].includes(c.host))stop();
 if(!permit.engines?.every(e=>e==='InnoDB')||!permit.engines?.length)stop();
 return {host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,
  timezone:'Z',dateStrings:true,supportBigNumbers:true,bigNumberStrings:true,
  multipleStatements:false,connectTimeout:2000,
  ...(permit.isolatedLoopback?{}:{ssl:{rejectUnauthorized:true,ca:c.ca}})};
}
export function assertNarrowGrants(grants,schema,user){
 if(!Array.isArray(grants)||!grants.length)stop();
 const allowed=new Set(['SELECT','INSERT','UPDATE','DELETE','CREATE','ALTER','INDEX','TRIGGER','REFERENCES']);
 let useful=false;
 for(const text of grants){
  if(typeof text!=='string'||/WITH GRANT OPTION|IDENTIFIED|PROXY/i.test(text))stop();
  const m=/^GRANT (.+) ON (.+) TO ['`]?([^'\x60@ ]+)['`]?@.+$/i.exec(text);
  if(!m||m[3]!==user)stop(); // Role grants/global privileges unsupported: fail closed.
  if(m[1]==='USAGE'&&m[2]==='*.*')continue;
  if(m[2]!=='`'+schema+'`.*'&&m[2]!==schema+'.*')stop();
  if(!m[1].split(',').map(s=>s.trim()).every(p=>allowed.has(p)))stop();
  useful=true;
 }
 if(!useful)stop();
}
export function assertObservedIdentity(c,p,o){
 if(o.database!==c.database||o.server_uuid!==p.serverUuid||Number(o.server_port)!==p.serverPort||
  o.version!==p.version||o.account_user!==c.user||Number(o.read_only)!==0||
  o.sql_mode!==p.sqlMode||o.current_role!=='NONE')stop();
 if(!p.isolatedLoopback&&o.tls_fingerprint!==p.tlsFingerprint)stop();
}
export async function openDisposable({config,permit,connect}){
 const options=assertDisposableConfig(config,permit); // Before even invoking connector.
 if(typeof connect!=='function')stop();
 const raw=await connect(options);let closed=false,utcReady=false;
 async function checked(){try{return await verify();}catch(e){closed=true;raw.destroy();throw e;}}
 async function verify(){
  if(closed)stop();
  const [[o]]=await raw.query(`SELECT DATABASE() AS \`database\`,@@server_uuid AS server_uuid,
   @@port AS server_port,VERSION() AS version,SUBSTRING_INDEX(CURRENT_USER(),'@',1) AS account_user,
   @@read_only AS read_only,@@sql_mode AS sql_mode,@@session.time_zone AS session_timezone,CURRENT_ROLE() AS current_role`);
  if(!permit.isolatedLoopback){
   const certificate=raw.connection?.stream?.getPeerCertificate?.();
   o.tls_fingerprint=certificate?.raw&&createHash('sha256').update(certificate.raw).digest('hex');
  }
  assertObservedIdentity(config,permit,o);
  if(utcReady&&o.session_timezone!=='+00:00')stop();
  const [rows]=await raw.query('SHOW GRANTS');
  assertNarrowGrants(rows.map(r=>Object.values(r)[0]),config.database,config.user);
  const [tables]=await raw.execute('SELECT ENGINE FROM information_schema.tables WHERE table_schema=? AND table_type=?',[config.database,'BASE TABLE']);
  if(tables.some(t=>t.ENGINE!=='InnoDB'))stop();
  return o;
 }
 try{await verify();await raw.query("SET time_zone='+00:00'");utcReady=true;await verify();}
 catch(e){closed=true;raw.destroy();throw e;}
 return {
  p14Kind:'a2-disposable',
  async beginTransaction(){await checked();return raw.beginTransaction();},
  async commit(){await checked();return raw.commit();},
  async rollback(){await checked();return raw.rollback();},
  release(){if(!closed){closed=true;if(typeof raw.release!=='function'){raw.destroy();return;}raw.release();}},
  destroy(){if(!closed){closed=true;raw.destroy();}},
  verify:checked,
  // Every SQL operation rechecks identity+grants; no config/env fallback.
  async execute(sql,params=[]){await checked();return raw.execute(sql,params);},
  async query(sql,params=[]){await checked();return raw.query(sql,params);},
  async close(){if(!closed){closed=true;await raw.end();}}
 };
}
export function assertPermitTarget(permit,identity){
 if(permit.stage!=='A2_DISPOSABLE'||permit.allowNativeWrites!==true||
  deny.has(identity.database)||!/^retail_p14_test_[a-zA-Z0-9_]+$/.test(identity.database??'')||
  !permit.schemas?.includes(identity.database)||permit.serverUuid!==identity.server_uuid)stop();
}
export const identicalConfig=eq;

export function createDisposableWriterPool({config,permit,createPool}){
 const options=assertDisposableConfig(config,permit);
 if(typeof createPool!=='function')stop();
 const native=createPool({...options,connectionLimit:10,waitForConnections:false,multipleStatements:false});
 const pool={
  async getConnection(){return openDisposable({config,permit,connect:()=>native.getConnection()});},
  async end(){await native.end();}
 };
 verifiedWriterPools.add(pool);
 return pool;
}

