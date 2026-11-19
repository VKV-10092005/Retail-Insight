import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {canonical,digest,reject} from './contracts.js';
export async function verifySources(root,sources){
 const base=await realpath(root);
 if(!Array.isArray(sources)||!sources.length)reject('SOURCE_MANIFEST_EMPTY');
 for(const s of sources){
  if(typeof s.path!=='string'||path.isAbsolute(s.path)||s.path.split(/[\\/]/).includes('..'))reject('SOURCE_PATH');
  const file=await realpath(path.resolve(base,s.path));
  const relative=path.relative(base,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))reject('SOURCE_ESCAPE');
  if(digest(await readFile(file,'utf8'))!==s.sha256)reject('SOURCE_DIGEST_MISMATCH');
 }
}
export async function schemaSnapshot(connection,tables){
 if(!Array.isArray(tables)||new Set(tables).size!==tables.length)reject('SCHEMA_TABLES');
 const result=[];
 for(const table of [...tables].sort()){
  if(!/^[a-z_][a-z0-9_]*$/.test(table))reject('SCHEMA_TABLE_NAME');
  const query=async(tag,sql)=>{
   const [rows]=await connection.execute('/*rc2:'+tag+'*/ '+sql,[table]);
   return rows;
  };
  const properties=await query('table',`SELECT ENGINE,TABLE_COLLATION,ROW_FORMAT
   FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?`);
  const columns=await query('columns',`SELECT COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,
   COLUMN_DEFAULT,EXTRA,GENERATION_EXPRESSION,CHARACTER_SET_NAME,COLLATION_NAME,DATETIME_PRECISION
   FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? ORDER BY ORDINAL_POSITION`);
  const indexes=await query('indexes',`SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,
   SUB_PART,COLLATION,INDEX_TYPE,IS_VISIBLE,EXPRESSION FROM information_schema.statistics
   WHERE table_schema=DATABASE() AND table_name=? ORDER BY INDEX_NAME,SEQ_IN_INDEX`);
  const keys=await query('keys',`SELECT CONSTRAINT_NAME,COLUMN_NAME,ORDINAL_POSITION,
   POSITION_IN_UNIQUE_CONSTRAINT,REFERENCED_TABLE_SCHEMA,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
   FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name=?
   ORDER BY CONSTRAINT_NAME,ORDINAL_POSITION`);
  const actions=await query('fk_actions',`SELECT CONSTRAINT_NAME,UNIQUE_CONSTRAINT_SCHEMA,
   UNIQUE_CONSTRAINT_NAME,MATCH_OPTION,UPDATE_RULE,DELETE_RULE,REFERENCED_TABLE_NAME
   FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND table_name=?
   ORDER BY CONSTRAINT_NAME`);
  const checks=await query('checks',`SELECT t.CONSTRAINT_NAME,t.ENFORCED,c.CHECK_CLAUSE
   FROM information_schema.table_constraints t JOIN information_schema.check_constraints c
    ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME
   WHERE t.CONSTRAINT_SCHEMA=DATABASE() AND t.TABLE_NAME=? AND t.CONSTRAINT_TYPE='CHECK'
   ORDER BY t.CONSTRAINT_NAME`);
  const triggers=await query('triggers',`SELECT TRIGGER_NAME,ACTION_ORDER,ACTION_TIMING,
   EVENT_MANIPULATION,ACTION_ORIENTATION,ACTION_STATEMENT,DEFINER,SQL_MODE,CHARACTER_SET_CLIENT,
   COLLATION_CONNECTION,DATABASE_COLLATION FROM information_schema.triggers
   WHERE trigger_schema=DATABASE() AND event_object_table=? ORDER BY TRIGGER_NAME`);
  // No AUTO_INCREMENT counters, row estimates, cardinality, timestamps or other data-dependent fields.
  result.push({table,properties,columns,indexes,keys,actions,checks,triggers});
 }
 return {format:'p14-schema-v2',tables:result};
}
export async function schemaFingerprint(connection,tables){return digest(await schemaSnapshot(connection,tables));}
export async function baselineFingerprint(connection,tables,sourceDigests){
 const [[exists]]=await connection.execute("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?",['schema_migrations']);
 const [versions]=Number(exists.n)?await connection.query('SELECT version FROM schema_migrations ORDER BY version'):[[]];
 return digest({format:'p14-baseline-v2',versions,schema:await schemaSnapshot(connection,tables),sourceDigests});
}
export {canonical};

