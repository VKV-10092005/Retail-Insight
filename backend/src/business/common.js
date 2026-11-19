import {z} from 'zod';
import {pool} from '../db/pool.js';
import {HttpError} from '../utils/http.js';
import {resolveBusinessRange} from './business-calendar.js';
export const positiveId=z.coerce.number().int().positive().max(4294967295);
export const price=z.number().finite().min(0).max(100000000).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'Tối đa 2 chữ số thập phân');
function isGregorianDate(value){
 if(value.length!==10||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split('-').map(Number);
 const leap=year%400===0||(year%4===0&&year%100!==0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1];
}
const calendarDate=label=>z.string().refine(isGregorianDate,{message:label+' phải có định dạng YYYY-MM-DD và tồn tại trong lịch Gregorian (năm 0001–9999)'});
const optionalQuery=(schema)=>z.preprocess(value=>value===''||value===null?undefined:value,schema.optional());
const safePage=z.preprocess(value=>value===''||value==null?1:value,z.coerce.number().int().min(1).max(100000).default(1));
const safeLimit=z.preprocess(value=>Math.min(Number(value)||50,500),z.number().int().min(1).default(50));
export const period=z.object({start:optionalQuery(calendarDate('Ngày bắt đầu')),end:optionalQuery(calendarDate('Ngày kết thúc')),branch_id:optionalQuery(positiveId),branchId:optionalQuery(positiveId),category_id:optionalQuery(positiveId),product_id:optionalQuery(positiveId),status:optionalQuery(z.string().trim().max(30)),all:z.preprocess(value=>value===''||value===null?undefined:value,z.union([z.boolean(),z.coerce.number()]).optional()),q:optionalQuery(z.string().trim().max(100)),search:optionalQuery(z.string().trim().max(100)),page:safePage,limit:safeLimit}).refine(q=>!q.start||!q.end||q.start<=q.end,{path:['end'],message:'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc (start <= end)'});
export async function assertBranch(user,id,allowed=[],connection=pool){
 const [branches]=await connection.execute("SELECT id,name FROM branches WHERE organization_id=? AND id=? AND status='ACTIVE'",[user.organization_id,id]);
 if(!branches.length)throw new HttpError(404,'Không tìm thấy chi nhánh');
 if(user.role!=='OWNER'){
  const [r]=await connection.execute('SELECT role FROM user_branch_roles WHERE organization_id=? AND user_id=? AND branch_id=?',[user.organization_id,user.id,id]);
  if(!r.length||(allowed.length&&!allowed.includes(r[0].role)))throw new HttpError(403,'Không có quyền tại chi nhánh');
 }
 return branches[0];
}
export function branchClause(user,alias,values){
 if(user.role==='OWNER')return '';
 values.push(user.id);return ` AND EXISTS(SELECT 1 FROM user_branch_roles scope WHERE scope.organization_id=${alias}.organization_id AND scope.branch_id=${alias}.branch_id AND scope.user_id=?)`;
}
export function filters(user,query,alias='d'){
 const q=period.parse(query),values=[user.organization_id];let sql=`${alias}.organization_id=?`;
 sql+=branchClause(user,alias,values);
 const branchIdVal=q.branch_id||q.branchId;
 if(branchIdVal){sql+=` AND ${alias}.branch_id=?`;values.push(branchIdVal);}
 const range=resolveBusinessRange(q);
 if(range.empty)sql+=' AND 1=0';
 if(range.startSql){sql+=` AND ${alias}.created_at>=?`;values.push(range.startSql);}
 if(range.endSql){sql+=` AND ${alias}.created_at<?`;values.push(range.endSql);}
 return {sql,values,q,range,calendar:range.calendar};
}
export async function transaction(fn){const c=await pool.getConnection();try{await c.beginTransaction();const result=await fn(c);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}}

export async function readSnapshot(fn){
 const c=await pool.getConnection();let active=false;
 try{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await c.query('START TRANSACTION');active=true;
  const result=await fn(c);await c.commit();active=false;return result;
 }catch(error){if(active)await c.rollback();throw error;}finally{c.release();}
}
