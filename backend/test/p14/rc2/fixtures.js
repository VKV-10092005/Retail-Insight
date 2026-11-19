import '../no-network.js';
import {principalPolicy} from '../../../src/p14/rc2/grants.js';
export const UUID='11111111-1111-4111-8111-111111111111';
export const OTHER='99999999-9999-4999-8999-999999999999';
export function fixture(role='backend'){
 const schema='retail_p14_test_rc2_mock',user='p14_test_'+role,account=user+'@127.0.0.1';
 const tables=[...new Set(principalPolicy(role,schema).filter(r=>r.schema===schema&&r.table!=='*').map(r=>r.table))].sort();
 const columns=[
  {table:'stock_documents',column:'request_key',type:'varchar(80)',charset:'utf8mb4',collation:'utf8mb4_0900_ai_ci'},
  {table:'stock_documents',column:'type',type:"enum('RECEIPT','SALE')",charset:'utf8mb4',collation:'utf8mb4_0900_ai_ci'}
 ];
 const config={host:'127.0.0.1',port:13316,database:schema,user,password:'synthetic-test-only',
  credentialSource:'a2-disposable-secret'};
 const permit={stage:'A2_1_DISPOSABLE',approvalRef:'MOCK-NOT-NATIVE',runId:'synthetic-rc2',
  actions:['DB_CONNECT','SQL','MIGRATE','LAUNCH_BACKEND'],allowNativeWrites:true,
  schemas:[schema],serverUuid:UUID,forbiddenServerUuids:[OTHER],host:config.host,port:config.port,
  endpoints:[{host:config.host,port:config.port}],serverPort:3306,version:'8.4.0',versionComment:'MySQL Community Server - GPL',
  sqlMode:'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION',
  charset:{server:'utf8mb4',database:'utf8mb4',connection:'utf8mb4'},
  collations:{server:'utf8mb4_0900_ai_ci',database:'utf8mb4_0900_ai_ci',connection:'utf8mb4_0900_ai_ci'},
  principal:{role,account},connectionOrigins:[user+'@127.0.0.1'],schemaState:'READY',
  schemaTables:tables.length?tables:['stock_documents'],columns,lowerCaseTableNames:0,
  imageDigest:'a'.repeat(64),expiresAt:new Date(Date.now()+600000).toISOString(),
  transport:{kind:'ISOLATED_LOOPBACK',exceptionApprovalRef:'MOCK-LOOPBACK'}};
 const raw={
  events:[],dead:false,isolation:'REPEATABLE-READ',timezone:'SYSTEM',hold:null,delegate:null,
  connection:{stream:{remoteAddress:'127.0.0.1',remotePort:13316}},
  observed:{database:schema,server_uuid:UUID,server_port:3306,version:permit.version,
   version_comment:permit.versionComment,current_user:account,connection_user:user+'@127.0.0.1',
   current_role:'NONE',read_only:0,sql_mode:permit.sqlMode,lower_case_table_names:0,
   character_set_server:'utf8mb4',character_set_database:'utf8mb4',character_set_connection:'utf8mb4',
   collation_server:'utf8mb4_0900_ai_ci',collation_database:'utf8mb4_0900_ai_ci',collation_connection:'utf8mb4_0900_ai_ci'},
  tables:permit.schemaTables.map(TABLE_NAME=>({TABLE_NAME,ENGINE:'InnoDB'})),
  columns:columns.map(c=>({TABLE_NAME:c.table,COLUMN_NAME:c.column,COLUMN_TYPE:c.type,CHARACTER_SET_NAME:c.charset,COLLATION_NAME:c.collation})),
  grants:grantLines(principalPolicy(role,schema),account),
  async query(sql,args){
   raw.events.push(sql);
   if(raw.hold)await raw.hold(sql);
   if(sql.startsWith('SELECT DATABASE()'))return [[{...raw.observed,session_timezone:raw.timezone,session_isolation:raw.isolation}]];
   if(sql==='SHOW GRANTS')return [raw.grants.map(grant=>({grant}))];
   if(sql==="SET time_zone='+00:00'")raw.timezone='+00:00';
   if(sql==='SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED')raw.isolation='READ-COMMITTED';
   return raw.delegate?raw.delegate.query(sql,args):[[]];
  },
  async execute(sql,args){
   raw.events.push(sql);
   if(raw.hold)await raw.hold(sql);
   if(sql.includes('information_schema.tables'))return [raw.tables];
   if(sql.includes('information_schema.columns'))return [raw.columns];
   return raw.delegate?raw.delegate.execute(sql,args):[{affectedRows:1}];
  },
  async beginTransaction(){raw.events.push('BEGIN');return raw.delegate?.beginTransaction();},
  async commit(){raw.events.push('COMMIT');return raw.delegate?.commit();},
  async rollback(){raw.events.push('ROLLBACK');return raw.delegate?.rollback();},
  release(){raw.events.push('RELEASE');raw.delegate?.release();},
  destroy(){raw.events.push('DESTROY');raw.dead=true;raw.delegate?.destroy();}
 };
 return {config,permit,raw};
}
export function grantLines(rules,account){
 const [user,host]=account.split('@');
 return rules.map(r=>'GRANT '+r.privilege+(r.columns?' ('+r.columns.map(c=>'`'+c+'`').join(', ')+')':'')+
  ' ON `'+r.schema+'`.'+(r.table==='*'?'*':'`'+r.table+'`')+' TO `'+user+'`@`'+host+'`');
}
export const delay=ms=>new Promise(r=>setTimeout(r,ms));

