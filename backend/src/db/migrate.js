import {readFile,readdir} from 'node:fs/promises';
import {pool,verifyDatabase} from './pool.js';
const connection=await pool.getConnection();let locked=false;
try {
 await verifyDatabase(connection);
 const [[lock]]=await connection.query("SELECT GET_LOCK('retail_app_migrations',10) AS acquired");
 if(lock.acquired!==1)throw Error('Migration lock unavailable');locked=true;
 await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations(version VARCHAR(100) PRIMARY KEY,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
 for(const filename of (await readdir(new URL('./migrations/',import.meta.url))).filter(n=>/^\d+_.+\.sql$/.test(n)).sort()){
  const version=filename.replace(/\.sql$/,'');
  const [rows]=await connection.execute('SELECT version FROM schema_migrations WHERE version=?',[version]);if(rows.length)continue;
  const sql=await readFile(new URL('./migrations/'+filename,import.meta.url),'utf8');
  for(const statement of sql.replace(/^\uFEFF/,'').split(';').map(s=>s.trim()).filter(Boolean))await connection.query(statement);
  await connection.execute('INSERT INTO schema_migrations(version) VALUES (?)',[version]);console.log('Applied '+version+' to retail_app');
 }
 console.log('retail_app migration verified');
} finally {if(locked)await connection.query("SELECT RELEASE_LOCK('retail_app_migrations')");connection.release();await pool.end();}
