import {Router} from 'express';
import {createHash} from 'node:crypto';
import {parse} from 'csv-parse/sync';
import {z} from 'zod';
import {pool} from '../db/pool.js';
import {requireRoles} from '../middlewares/auth.js';
import {asyncRoute,HttpError} from '../utils/http.js';
import {assertBranch,positiveId,transaction} from './common.js';

const router=Router();
const MAX_CSV_BYTES=100000;
const headerAliases={sku:'sku',ma_san_pham:'sku',ma_sku:'sku',product_code:'sku',quantity:'quantity',so_luong_nhap:'quantity',unit_cost:'unit_cost',gia_nhap:'unit_cost',name:'name',ten_san_pham:'name',product_name:'name',category_name:'category_name',danh_muc:'category_name',ten_danh_muc:'category_name',sale_price:'sale_price',gia_ban:'sale_price',image_url:'image_url',image:'image_url',anh_san_pham:'image_url',duong_dan_anh:'image_url',note:'note'};
const bodySchema=z.object({
 mode:z.enum(['preview','commit']),
 branch_id:positiveId,
 note:z.string().trim().max(500).optional(),
 csv:z.string().min(1).max(MAX_CSV_BYTES),
 preview_hash:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 request_key:z.string().min(12).max(80).optional()
}).strict();

function decimal(value){
 if(!/^\d+(\.\d{1,2})?$/.test(value||''))return NaN;
 return Number(value);
}

export function readReceiptCSV(text){
 let records;
 try{
  records=parse(text,{bom:true,skip_empty_lines:true,trim:true,max_record_size:8192,columns:headers=>{
   const names=headers.map(header=>[...header.trim().replace(/^\uFEFF/,'').normalize('NFD')].filter(char=>char.codePointAt(0)<768||char.codePointAt(0)>879).join('').toLowerCase().replace(/\u0111/g,'d').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
   const mapped=names.map(name=>headerAliases[name]);
   if(new Set(mapped).size!==mapped.length||mapped.some(name=>!name)||!['sku','quantity','unit_cost'].every(name=>mapped.includes(name)))throw Error('HEADER');
   return mapped;
  }});
 }catch{
  throw new HttpError(400,'CSV không hợp lệ. Cần đúng các cột sku,quantity,unit_cost; có thể thêm note.');
 }
 if(!records.length||records.length>200)throw new HttpError(400,'Mỗi tệp cần từ 1 đến 200 dòng nhập hàng');
 const rows=[],issues=[],seen=new Set();
 records.forEach((record,index)=>{
  const row=index+2;
  const sku=String(record.sku||'').trim();
  const quantity=Number(record.quantity);
  const unitCost=decimal(record.unit_cost);
  const note=String(record.note||'').trim(),name=String(record.name||'').trim(),category_name=String(record.category_name||'').trim(),sale_price=record.sale_price==null||record.sale_price===''?null:decimal(record.sale_price),image_url=String(record.image_url||'').trim();
  if(!sku||sku.length>100)issues.push({row,sku,message:'SKU bắt buộc và tối đa 100 ký tự'});
  if(!/^\d+$/.test(record.quantity||'')||!Number.isSafeInteger(quantity)||quantity<=0||quantity>100000)issues.push({row,sku,message:'Số lượng phải là số nguyên từ 1 đến 100.000'});
  if(!Number.isFinite(unitCost)||unitCost<0||unitCost>100000000)issues.push({row,sku,message:'Đơn giá vốn phải là số từ 0 đến 100.000.000, tối đa 2 chữ số thập phân'});
  if(note.length>500)issues.push({row,sku,message:'Ghi chú tối đa 500 ký tự'});
  if(name.length>180)issues.push({row,sku,message:'Product name is too long'});
  if(category_name.length>120)issues.push({row,sku,message:'Category name is too long'});
  if(sale_price!==null&&(!Number.isFinite(sale_price)||sale_price<0||sale_price>100000000))issues.push({row,sku,message:'Sale price is invalid'});
  if(image_url){try{const parsed=new URL(image_url);if(!['https:','http:'].includes(parsed.protocol)||image_url.length>2048)throw Error();}catch{issues.push({row,sku,message:'image_url phải là đường dẫn HTTP/HTTPS hợp lệ, tối đa 2048 ký tự'});}}
  const key=sku.toLocaleLowerCase('vi');
  if(sku&&seen.has(key))issues.push({row,sku,message:'SKU bị lặp trong tệp'});
  seen.add(key);
  rows.push({row,sku,name,category_name,quantity,unit_cost:unitCost,sale_price,image_url:image_url||null,note});
 });
 return {rows,issues,row_count:records.length};
}

function previewHash(text,branchId){return createHash('sha256').update(text+'\0branch:'+branchId,'utf8').digest('hex');}
async function validate(org,text,connection,branchId){
 const data=readReceiptCSV(text);
 const [[branch]]=await connection.execute('SELECT catalog_mode FROM branches WHERE organization_id=? AND id=?',[org,branchId]);if(!branch)throw new HttpError(404,'Không tìm thấy chi nhánh');
 for(const row of data.rows){
  if(!row.sku)continue;
  const scope=branch.catalog_mode==='INDEPENDENT'
   ? ' AND (p.branch_id=? OR EXISTS(SELECT 1 FROM inventory_balances i WHERE i.organization_id=p.organization_id AND i.product_id=p.id AND i.branch_id=?))'
   : ' AND (p.branch_id IS NULL OR p.branch_id=?)';
  const values=branch.catalog_mode==='INDEPENDENT'?[org,row.sku,branchId,branchId]:[org,row.sku,branchId];
  const [products]=await connection.execute(`SELECT p.id,p.sku,p.name,p.status FROM products p WHERE p.organization_id=? AND p.sku=?${scope} ORDER BY (p.branch_id=?) DESC,p.id LIMIT 1`,[...values,branchId]);
  if(!products.length){if(row.name){row.is_new=true;row.product_name=row.name;continue;}data.issues.push({row:row.row,sku:row.sku,message:'SKU chưa tồn tại; hãy cung cấp Ten_san_pham để tạo sản phẩm mới'});continue;}
  if(products[0].status!=='ACTIVE'){data.issues.push({row:row.row,sku:row.sku,message:'SKU đã ngừng kinh doanh'});continue;}
  row.product_id=products[0].id;row.product_name=products[0].name;row.sku=products[0].sku;
 }
 return {...data,can_commit:data.issues.length===0,preview_hash:previewHash(text,branchId)};
}

async function existing(org,key,hash){
 const [rows]=await pool.execute("SELECT d.id,d.total,d.payload_hash,COUNT(i.id) count FROM stock_documents d LEFT JOIN stock_document_items i ON i.organization_id=d.organization_id AND i.document_id=d.id WHERE d.organization_id=? AND d.type='RECEIPT' AND d.request_key=? GROUP BY d.id,d.total,d.payload_hash",[org,key]);
 if(!rows.length)return null;
 if(rows[0].payload_hash!==hash)throw new HttpError(409,'Mã yêu cầu đã được dùng cho nội dung khác');
 return {id:rows[0].id,total:Number(rows[0].total),count:Number(rows[0].count),replayed:true};
}

router.post('/receipts/import',requireRoles('OWNER','MANAGER','INVENTORY'),asyncRoute(async(req,res)=>{
 const data=bodySchema.parse(req.body);
 if(Buffer.byteLength(data.csv,'utf8')>MAX_CSV_BYTES)throw new HttpError(400,'CSV tối đa 100.000 byte');
 await assertBranch(req.user,data.branch_id,['MANAGER','INVENTORY']);
 if(data.mode==='preview')return res.json({...await validate(req.organizationId,data.csv,pool,data.branch_id),source:'CSV_USER_INPUT',persisted:false});
 const expected=previewHash(data.csv,data.branch_id);
 if(data.preview_hash!==expected)throw new HttpError(409,'Tệp đã thay đổi hoặc chưa được kiểm tra. Hãy xem trước lại.');
 if(!data.request_key)throw new HttpError(400,'Thiếu mã yêu cầu xác nhận nhập kho');
 const payloadHash=createHash('sha256').update(JSON.stringify({branch_id:data.branch_id,note:data.note||'',csv:data.csv})).digest('hex');
 const replay=await existing(req.organizationId,data.request_key,payloadHash);
 if(replay)return res.json(replay);
 let result;
 try{result=await transaction(async connection=>{
  await assertBranch(req.user,data.branch_id,['MANAGER','INVENTORY'],connection);
  const checked=await validate(req.organizationId,data.csv,connection,data.branch_id);
  if(!checked.can_commit)return {...checked,persisted:false};
  const csvNotes=[...new Set(checked.rows.map(row=>row.note).filter(Boolean))];
  const importedAt=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
  const documentNote=(data.note||csvNotes.join('; ')||`Hàng nhập từ Excel ngày ${importedAt}`);
  if(documentNote&&documentNote.length>500)throw new HttpError(400,'Ghi chú tổng hợp vượt quá 500 ký tự');
  const [document]=await connection.execute("INSERT INTO stock_documents(organization_id,branch_id,type,request_key,payload_hash,performed_by,total,note) VALUES (?,?, 'RECEIPT',?,?,?,0,?)",[req.organizationId,data.branch_id,data.request_key,payloadHash,req.user.id,documentNote]);
  let totalCents=0;
  const [[branch]]=await connection.execute('SELECT catalog_mode FROM branches WHERE organization_id=? AND id=?',[req.organizationId,data.branch_id]);
  for(const row of checked.rows){
   if(row.category_name){const scope=branch.catalog_mode==='INDEPENDENT'?' AND branch_id=?':' AND branch_id IS NULL',values=branch.catalog_mode==='INDEPENDENT'?[req.organizationId,row.category_name,data.branch_id]:[req.organizationId,row.category_name];let [cats]=await connection.execute(`SELECT id FROM categories WHERE organization_id=? AND LOWER(name)=LOWER(?)${scope} LIMIT 1`,values);if(!cats.length){const [created]=await connection.execute('INSERT INTO categories(organization_id,branch_id,name) VALUES (?,?,?)',[req.organizationId,branch.catalog_mode==='INDEPENDENT'?data.branch_id:null,row.category_name]);cats=[{id:created.insertId}];}row.category_id=cats[0].id;}
   if(row.is_new){const [created]=await connection.execute("INSERT INTO products(organization_id,branch_id,category_id,sku,name,sale_price,cost_price,attributes,status,image_url) VALUES (?,?,?,?,?,?,?,'{}','ACTIVE',?)",[req.organizationId,branch.catalog_mode==='INDEPENDENT'?data.branch_id:null,row.category_id??null,row.sku,row.name,Number(row.sale_price??0),row.unit_cost,row.image_url]);row.product_id=created.insertId;}
   else if(row.name||row.sale_price!==null||row.category_name||row.image_url)await connection.execute('UPDATE products SET name=COALESCE(NULLIF(?,\'\'),name),sale_price=COALESCE(?,sale_price),cost_price=?,category_id=COALESCE(?,category_id),image_url=COALESCE(?,image_url) WHERE id=? AND organization_id=?',[row.name||'',row.sale_price,row.unit_cost,row.category_id??null,row.image_url,row.product_id,req.organizationId]);
  }
  for(const row of checked.rows.sort((a,b)=>a.product_id-b.product_id)){
   const [products]=await connection.execute("SELECT id,sku,name FROM products WHERE id=? AND organization_id=? AND status='ACTIVE' FOR UPDATE",[row.product_id,req.organizationId]);
   if(!products.length)throw new HttpError(409,`SKU không còn khả dụng: ${row.sku}`);
   await connection.execute('INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity',[req.organizationId,data.branch_id,row.product_id]);
   const [[balance]]=await connection.execute('SELECT quantity,average_cost FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',[req.organizationId,data.branch_id,row.product_id]);
   const next=Number(balance.quantity)+row.quantity;
   if(next>2147483647)throw new HttpError(400,`Tồn kho vượt giới hạn tại SKU ${row.sku}`);
   const lineCents=Math.round(row.unit_cost*100)*row.quantity;
   totalCents+=lineCents;
   if(!Number.isSafeInteger(totalCents)||totalCents>100000000000000)throw new HttpError(400,'Tổng chứng từ vượt giới hạn');
   const averageCost=(Number(balance.quantity)*Number(balance.average_cost||0)+row.quantity*row.unit_cost)/next;
   await connection.execute('UPDATE inventory_balances SET quantity=?,average_cost=? WHERE organization_id=? AND branch_id=? AND product_id=?',[next,averageCost,req.organizationId,data.branch_id,row.product_id]);
   await connection.execute('INSERT INTO stock_document_items(organization_id,document_id,product_id,sku,product_name,quantity,unit_price,unit_cost,line_total) VALUES (?,?,?,?,?,?,?,?,?)',[req.organizationId,document.insertId,row.product_id,products[0].sku,products[0].name,row.quantity,row.unit_cost,row.unit_cost,lineCents/100]);
   await connection.execute('INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after) VALUES (?,?,?,?,?,?)',[req.organizationId,data.branch_id,row.product_id,document.insertId,row.quantity,next]);
  }
  await connection.execute('UPDATE stock_documents SET total=? WHERE id=? AND organization_id=?',[totalCents/100,document.insertId,req.organizationId]);
  return {id:document.insertId,total:totalCents/100,count:checked.rows.length,persisted:true,replayed:false};
 });}catch(error){
  if(error.code==='ER_DUP_ENTRY'){
   const duplicate=await existing(req.organizationId,data.request_key,payloadHash);
   if(duplicate)return res.json(duplicate);
  }
  throw error;
 }
 if(!result.persisted)return res.status(422).json({...result,message:'CSV chưa được ghi vì còn lỗi. Không có tồn kho nào thay đổi.'});
 res.status(201).json(result);
}));

export default router;
