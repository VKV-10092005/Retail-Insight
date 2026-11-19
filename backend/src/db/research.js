import mysql from 'mysql2/promise';
import {HttpError} from '../utils/http.js';
let reader,verified;
export async function verifyResearchConnection(){
 if(!process.env.RESEARCH_MYSQL_USER||!process.env.RESEARCH_MYSQL_PASSWORD)throw new HttpError(503,'Chưa cấu hình tài khoản nghiên cứu SELECT-only');
 if(process.env.RESEARCH_MYSQL_USER.toLowerCase()==='root')throw new HttpError(503,'Không được dùng root cho kết nối nghiên cứu');
 reader??=mysql.createPool({host:process.env.RESEARCH_MYSQL_HOST||'127.0.0.1',port:Number(process.env.RESEARCH_MYSQL_PORT||3306),user:process.env.RESEARCH_MYSQL_USER,password:process.env.RESEARCH_MYSQL_PASSWORD,database:'retail_management',connectionLimit:3,multipleStatements:false,dateStrings:true,timezone:'Z'});
 const [grants]=await reader.query('SHOW GRANTS FOR CURRENT_USER()');
 const statements=grants.map(r=>String(Object.values(r)[0]));
 // Fail closed for broad privileges, role grants or grants with delegation.
 if(statements.some(raw=>{const s=raw.replace(/[`\\]/g,'');return !(/^GRANT USAGE ON \*\.\* TO /i.test(s)||/^GRANT SELECT ON (retail_management|retail_datawarehouse)\.\* TO /i.test(s))||/WITH GRANT OPTION/i.test(s);}))throw new HttpError(503,'Tài khoản nghiên cứu phải chỉ có SELECT, không có quyền ghi/role/delegation');
 for(const database of ['retail_management','retail_datawarehouse'])await reader.query(`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?`,[database]);
 await reader.query('SELECT product_id FROM retail_management.products LIMIT 1');
 await reader.query('SELECT product_key FROM retail_datawarehouse.dim_product LIMIT 1');
 verified=true;return {status:'ok',privileges:'SELECT_ONLY',databases:['retail_management','retail_datawarehouse']};
}
export async function researchSelect(sql,args=[]){
 if(!/^SELECT\s/i.test(sql)||/[;]|\b(INTO|OUTFILE|DUMPFILE|SLEEP|BENCHMARK|FOR\s+UPDATE)\b/i.test(sql))throw new HttpError(400,'Chỉ cho phép truy vấn đọc đã định nghĩa');
 if(!verified)await verifyResearchConnection();return reader.execute(sql,args);
}
export async function closeResearch(){await reader?.end();reader=undefined;verified=false;}
