import {Router} from 'express';
import {z} from 'zod';
import {parse} from 'csv-parse/sync';
import {createHash} from 'node:crypto';
import {pool} from '../db/pool.js';
import {asyncRoute,HttpError} from '../utils/http.js';
import {transaction} from './common.js';
import {resolveProductWriteTarget} from './product-catalog.js';
const router=Router();
const bodySchema=z.object({mode:z.enum(['preview','commit']),csv:z.string().min(1).max(60000),branch_id:z.number().int().positive().max(4294967295).optional(),preview_hash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
const rowSchema=z.object({sku:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(180),sale_price:z.number().finite().min(0).max(100000000),cost_price:z.number().finite().min(0).max(100000000).nullable(),category_id:z.number().int().positive().max(4294967295).nullable(),category_name:z.string().trim().min(1).max(120).nullable(),status:z.enum(['ACTIVE','DISABLED'])});
const headerAliases={sku:'sku',ma_sku:'sku',name:'name',ten_san_pham:'name',sale_price:'sale_price',gia_ban:'sale_price',cost_price:'cost_price',gia_von:'cost_price',category_id:'category_id',category_name:'category_name',ten_danh_muc:'category_name',danh_muc:'category_name',status:'status',trang_thai:'status'};
function decimal(value,optional=false){if(optional&&(value===undefined||value===''))return null;if(!/^\d+(\.\d{1,2})?$/.test(value||''))return NaN;return Number(value);}
function normalizeHeader(value){return value.trim().toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function normalizeStatus(value){const status=normalizeHeader(value||'ACTIVE');if(['active','dang_ban'].includes(status))return 'ACTIVE';if(['disabled','tam_ngung'].includes(status))return 'DISABLED';return value;}
export function readProductCSV(text){
 let records;
 try{records=parse(text,{bom:true,skip_empty_lines:true,trim:true,max_record_size:8192,columns:headers=>{
  const names=headers.map(header=>headerAliases[normalizeHeader(header)]);
  if(new Set(names).size!==names.length||names.some(name=>!name)||!['sku','name','sale_price'].every(name=>names.includes(name)))throw Error('HEADER');return names;
 }});}catch{throw new HttpError(400,'CSV kh\u00f4ng h\u1ee3p l\u1ec7. C\u1ea7n c\u00f3 c\u00e1c c\u1ed9t Ma_SKU, Ten_san_pham, Gia_ban (ho\u1eb7c sku, name, sale_price); c\u00f3 th\u1ec3 th\u00eam Gia_von, Ten_danh_muc, Trang_thai.');}

 if(!records.length||records.length>200)throw new HttpError(400,'Mỗi tệp cần từ 1 đến 200 sản phẩm');
 const rows=[],issues=[],seen=new Set();
 records.forEach((record,index)=>{
  const sourceRow=index+2;const result=rowSchema.safeParse({sku:record.sku,name:record.name,sale_price:decimal(record.sale_price),cost_price:decimal(record.cost_price,true),category_id:record.category_id?Number(record.category_id):null,category_name:record.category_name?.trim()||null,status:normalizeStatus(record.status)});
  if(!result.success){issues.push({row:sourceRow,sku:record.sku||'',message:'M\u00e3, t\u00ean, gi\u00e1, danh m\u1ee5c ho\u1eb7c tr\u1ea1ng th\u00e1i kh\u00f4ng h\u1ee3p l\u1ec7; gi\u00e1 kh\u00f4ng c\u00f3 d\u1ea5u ph\u00e2n c\u00e1ch h\u00e0ng ngh\u00ecn v\u00e0 t\u1ed1i \u0111a 2 s\u1ed1 th\u1eadp ph\u00e2n'});return;}
  const key=result.data.sku.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('vi');
  if(seen.has(key))issues.push({row:sourceRow,sku:result.data.sku,message:'SKU lặp trong tệp'});seen.add(key);
  rows.push({...result.data,row:sourceRow});
 });
 return {rows,issues,row_count:records.length};
}
function hashImport(text,branchId){return createHash('sha256').update(text+'\0branch:'+(branchId??'shared'),'utf8').digest('hex');}
async function validate(org,text,connection,branchId){
 const data=readProductCSV(text);
 if(data.rows.length){
  // Let MySQL compare using the actual SKU collation, not an assumed JS collation.
  for(const row of data.rows){
   const [existing]=await connection.execute('SELECT id FROM products WHERE organization_id=? AND branch_id <=> ? AND sku=? LIMIT 1',[org,branchId,row.sku]);
   if(existing.length)data.issues.push({row:row.row,sku:row.sku,message:'SKU đã tồn tại trong cửa hàng; nhập CSV không ghi đè sản phẩm'});
  }
  const [categories]=await connection.execute('SELECT id FROM categories WHERE organization_id=? AND branch_id <=> ?',[org,branchId]);const own=new Set(categories.map(c=>Number(c.id)));
  for(const row of data.rows)if(row.category_id!==null&&!row.category_name&&!own.has(row.category_id))data.issues.push({row:row.row,sku:row.sku,message:'Danh mục không thuộc cửa hàng'});
 }
 return {...data,can_commit:data.issues.length===0,preview_hash:hashImport(text,branchId)};
}
router.post('/products/import',asyncRoute(async(req,res)=>{
 const data=bodySchema.parse(req.body);if(Buffer.byteLength(data.csv,'utf8')>60000)throw new HttpError(400,'CSV tối đa 60.000 byte');
 const branchId=await resolveProductWriteTarget(req,data.branch_id);
 if(data.mode==='preview')return res.json({...await validate(req.organizationId,data.csv,pool,branchId),source:'CSV_USER_INPUT',persisted:false,branch_id:branchId});
 const expected=hashImport(data.csv,branchId);
 if(data.preview_hash!==expected)throw new HttpError(409,'Tệp đã thay đổi hoặc chưa được kiểm tra. Hãy xem trước lại.');
 const result=await transaction(async connection=>{
  const checked=await validate(req.organizationId,data.csv,connection,branchId);
  if(!checked.can_commit)return {...checked,persisted:false};
  const created=[];
  for(const row of checked.rows){
   let categoryId=row.category_id;
   if(row.category_name){
    const [matches]=await connection.execute('SELECT id FROM categories WHERE organization_id=? AND branch_id <=> ? AND LOWER(name)=LOWER(?) LIMIT 1',[req.organizationId,branchId,row.category_name]);
    if(matches.length)categoryId=Number(matches[0].id);
    else{const [category]=await connection.execute('INSERT INTO categories(organization_id,branch_id,name) VALUES (?,?,?)',[req.organizationId,branchId,row.category_name]);categoryId=Number(category.insertId);}
   }
   const [r]=await connection.execute('INSERT INTO products(organization_id,branch_id,sku,name,sale_price,cost_price,category_id,status,attributes) VALUES (?,?,?,?,?,?,?,?,?)',[req.organizationId,branchId,row.sku,row.name,row.sale_price,req.user.role==='CASHIER'?null:row.cost_price,categoryId,row.status,'{}']);created.push({id:r.insertId,sku:row.sku,category_id:categoryId});
  }
  return {created,count:created.length,persisted:true,preview_hash:expected,source:'OPERATIONAL',branch_id:branchId};
 });
 res.status(result.persisted?201:422).json(result.persisted?result:{...result,message:'CSV chưa được ghi vì còn lỗi. Không có sản phẩm nào được thêm.'});
}));
export default router;
