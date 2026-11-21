import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {pool} from '../db/pool.js';
import {config} from '../config/env.js';
import {requireRoles} from '../middlewares/auth.js';
import {asyncRoute,HttpError} from '../utils/http.js';
import {positiveId,price,period,transaction,assertBranch} from './common.js';
import {getBranchCatalogMode,resolveProductWriteTarget} from './product-catalog.js';
const router=Router();
const sessionCookieOptions={httpOnly:true,secure:config.production,sameSite:config.production?'none':'lax',path:'/api'};
async function sessionUser(user){
 const [branches]=await pool.execute("SELECT b.id,b.name,r.role FROM branches b JOIN user_branch_roles r ON r.branch_id=b.id AND r.organization_id=b.organization_id WHERE r.organization_id=? AND r.user_id=? AND b.status='ACTIVE'",[user.organization_id,user.id]);
 const [[organization]]=await pool.execute('SELECT name,address FROM organizations WHERE id=?',[user.organization_id]);
 return {id:user.id,organization_id:user.organization_id,email:user.email,full_name:user.full_name,name:user.full_name,phone:user.phone||null,role:user.role,branch_id:branches.length===1?Number(branches[0].id):null,tenantId:user.organization_id,storeName:organization?.name||'',organizationAddress:organization?.address||'',stores:branches.map(b=>String(b.id)),branches};
}
const product=z.object({sku:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(180),category_id:positiveId.nullable().optional(),branch_id:positiveId.optional(),sale_price:price,cost_price:price.nullable().optional(),status:z.enum(['ACTIVE','DISABLED']).default('ACTIVE'),image_url:z.string().max(1500000).nullable().optional(),attributes:z.record(z.string(),z.union([z.string().max(100),z.number().finite(),z.null()])).optional()}).strict();
router.get('/categories',asyncRoute(async(req,res)=>{
 const query=z.object({branch_id:z.preprocess(value=>value===''||value==null?undefined:value,positiveId.optional())}).parse(req.query);let branchId=query.branch_id,branchMode=null;
 if(!branchId&&req.user.role!=='OWNER'){const [assignments]=await pool.execute('SELECT branch_id FROM user_branch_roles WHERE organization_id=? AND user_id=? ORDER BY branch_id',[req.organizationId,req.user.id]);if(assignments.length===1)branchId=Number(assignments[0].branch_id);else if(assignments.length>1)throw new HttpError(400,'Chọn chi nhánh để xem danh mục');}
 let sql='SELECT id,name,organization_id FROM categories WHERE organization_id=?',values=[req.organizationId];
 if(branchId){const branch=await getBranchCatalogMode(req.user,branchId);branchMode=branch.catalog_mode;if(branchMode==='INDEPENDENT'){sql+=' AND branch_id=?';values.push(branch.id);}else{sql+=' AND (branch_id IS NULL OR branch_id=?)';values.push(branch.id);}}
 let productScope='';if(branchId){if(branchMode==='INDEPENDENT')productScope=' AND (p.branch_id=? OR EXISTS(SELECT 1 FROM inventory_balances i WHERE i.organization_id=p.organization_id AND i.product_id=p.id AND i.branch_id=?))';else productScope=' AND (p.branch_id IS NULL OR p.branch_id=?)';values.push(...(branchMode==='INDEPENDENT'?[branchId,branchId]:[branchId]));}
 const [rows]=await pool.execute(`SELECT c.id,c.name,COUNT(p.id) product_count FROM (${sql}) c LEFT JOIN products p ON p.organization_id=c.organization_id AND p.category_id=c.id${productScope} GROUP BY c.id,c.name ORDER BY c.name`,values);res.json({items:rows});
}));
router.post('/categories',asyncRoute(async(req,res)=>{
 const rawName=req.body?.name; if(rawName==null||typeof rawName!=='string'||!rawName.trim())throw new HttpError(400,'Vui lòng nhập tên danh mục.'); const name=rawName.trim(); if(name.length>120)throw new HttpError(400,'Tên danh mục không được vượt quá 120 ký tự.'); if(!['OWNER','MANAGER','INVENTORY'].includes(req.user?.role))throw new HttpError(403,'Không có quyền tạo danh mục'); const [existing]=await pool.execute('SELECT id,name FROM categories WHERE organization_id=? AND LOWER(TRIM(name))=LOWER(?) LIMIT 1',[req.organizationId,name]); if(existing.length>0)throw new HttpError(409,'Danh mục này đã tồn tại trong cửa hàng.');
 let branchId=null; try{branchId=await resolveProductWriteTarget(req,req.body?.branch_id);}catch{branchId=req.body?.branch_id?Number(req.body.branch_id):null;}
 const [r]=await pool.execute('INSERT INTO categories(organization_id,branch_id,name) VALUES (?,?,?)',[req.organizationId,branchId,name]);res.status(201).json({id:r.insertId,name,branch_id:branchId});
}));
router.put('/categories/:id',asyncRoute(async(req,res)=>{
 if(!['OWNER','MANAGER'].includes(req.user.role))throw new HttpError(403,'Không có quyền sửa danh mục');
 const id=positiveId.parse(req.params.id),{name}=z.object({name:z.string().trim().min(1).max(120)}).strict().parse(req.body);
 const [[category]]=await pool.execute('SELECT id,name,branch_id FROM categories WHERE id=? AND organization_id=?',[id,req.organizationId]);
 if(!category)throw new HttpError(404,'Không tìm thấy danh mục');if(category.branch_id)await assertBranch(req.user,category.branch_id,['MANAGER']);
 await pool.execute('UPDATE categories SET name=? WHERE id=? AND organization_id=?',[name,id,req.organizationId]);res.json({id,name,branch_id:category.branch_id});
}));
router.delete('/categories/:id',asyncRoute(async(req,res)=>{
 if(!['OWNER','MANAGER'].includes(req.user.role))throw new HttpError(403,'Không có quyền xóa danh mục');
 const id=positiveId.parse(req.params.id),[[category]]=await pool.execute('SELECT id,branch_id FROM categories WHERE id=? AND organization_id=?',[id,req.organizationId]);
 if(!category)throw new HttpError(404,'Không tìm thấy danh mục');if(category.branch_id)await assertBranch(req.user,category.branch_id,['MANAGER']);
 const [[usage]]=await pool.execute('SELECT COUNT(*) product_count FROM products WHERE organization_id=? AND category_id=?',[req.organizationId,id]);if(Number(usage.product_count)>0)throw new HttpError(409,'Chỉ xóa được danh mục chưa có sản phẩm');
 await pool.execute('DELETE FROM categories WHERE id=? AND organization_id=?',[id,req.organizationId]);res.json({deleted:true,id});
}));
router.get('/products',asyncRoute(async(req,res)=>{
 const q=period.parse(req.query);const args=[req.organizationId];let where='p.organization_id=?';let branchId=q.branch_id||q.branchId,branchMode=null;
 if(!branchId&&req.user.role!=='OWNER'){const [assignments]=await pool.execute('SELECT branch_id FROM user_branch_roles WHERE organization_id=? AND user_id=? ORDER BY branch_id',[req.organizationId,req.user.id]);if(assignments.length===1)branchId=Number(assignments[0].branch_id);else if(assignments.length>1)throw new HttpError(400,'Chọn chi nhánh để xem sản phẩm');}
 if(branchId){const branch=await getBranchCatalogMode(req.user,branchId);branchMode=branch.catalog_mode;if(branchMode==='INDEPENDENT'){where+=' AND (p.branch_id=? OR EXISTS(SELECT 1 FROM inventory_balances scope_i WHERE scope_i.organization_id=p.organization_id AND scope_i.product_id=p.id AND scope_i.branch_id=?))';args.push(branch.id,branch.id);}else{where+=' AND (p.branch_id IS NULL OR p.branch_id=?)';args.push(branch.id);}}
 const search=q.q||q.search;if(search){where+=" AND (p.sku LIKE ? OR p.name LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.barcode')) LIKE ?)";args.push('%'+search+'%','%'+search+'%','%'+search+'%');}
 if(q.category_id){where+=' AND p.category_id=?';args.push(q.category_id);}
 if(q.status){where+=' AND p.status=?';args.push(q.status);}
 const branchDocFilter=branchId?'AND d.branch_id=?':'';
 const branchInvFilter=branchId?'AND branch_id=?':'';
 const invSubquery=`LEFT JOIN (SELECT product_id,SUM(quantity) AS quantity FROM inventory_balances WHERE organization_id=? ${branchInvFilter} GROUP BY product_id) i ON i.product_id=p.id`;
 const recSubquery=`LEFT JOIN (SELECT x.product_id,SUM(x.quantity) AS imported_qty FROM stock_documents d JOIN stock_document_items x ON x.document_id=d.id AND x.organization_id=d.organization_id WHERE d.organization_id=? ${branchDocFilter} AND d.type='RECEIPT' AND d.order_status='COMPLETED' GROUP BY x.product_id) rec ON rec.product_id=p.id`;
 const salSubquery=`LEFT JOIN (SELECT x.product_id,SUM(x.quantity-COALESCE(x.returned_quantity,0)) AS sold_qty FROM stock_documents d JOIN stock_document_items x ON x.document_id=d.id AND x.organization_id=d.organization_id WHERE d.organization_id=? ${branchDocFilter} AND d.type='SALE' AND d.order_status='COMPLETED' GROUP BY x.product_id) sal ON sal.product_id=p.id`;
 const subqueryArgs=[req.organizationId];if(branchId)subqueryArgs.push(branchId);subqueryArgs.push(req.organizationId);if(branchId)subqueryArgs.push(branchId);subqueryArgs.push(req.organizationId);if(branchId)subqueryArgs.push(branchId);
 const selectArgs=[...subqueryArgs,...args];
 const orderClause=branchId?'ORDER BY (COALESCE(i.quantity,0) > 0) DESC, COALESCE(i.quantity,0) DESC, p.id DESC':'ORDER BY p.id DESC';
 const limitClause=`LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`;
 const [countResult,itemsResult]=await Promise.all([
  pool.execute(`SELECT COUNT(*) AS total FROM products p WHERE ${where}`,args),
  pool.execute(`SELECT p.*,c.name AS category_name,JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.barcode')) AS barcode,COALESCE(p.image_url,JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.image_url'))) AS image_url,JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.min_stock')) AS min_stock,COALESCE(i.quantity,0) AS stock_remaining,COALESCE(i.quantity,0) AS stock,COALESCE(i.quantity,0) AS quantity,COALESCE(i.quantity,0) AS on_hand,COALESCE(i.quantity,0) AS stock_quantity,COALESCE(rec.imported_qty,0) AS total_imported,COALESCE(sal.sold_qty,0) AS total_sold FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.organization_id=p.organization_id ${invSubquery} ${recSubquery} ${salSubquery} WHERE ${where} ${orderClause} ${limitClause}`,selectArgs)
 ]);
 const count=countResult[0][0],rows=itemsResult[0];
 const mappedRows=rows.map(r=>({...r,stock_remaining:Number(r.stock_remaining||0),total_imported:Number(r.total_imported||0),total_sold:Number(r.total_sold||0),stock:Number(r.stock_remaining||0),quantity:Number(r.stock_remaining||0),on_hand:Number(r.stock_remaining||0),stock_quantity:Number(r.stock_remaining||0)}));
 const items=req.user.role==='CASHIER'?mappedRows.map(({cost_price,...item})=>item):mappedRows;
 res.json({items,total:count.total,page:q.page,limit:q.limit,source:'OPERATIONAL',catalog_mode:branchMode});
}));

router.get('/customers',requireRoles('OWNER','MANAGER','CASHIER'),asyncRoute(async(req,res)=>{
 const query=z.object({q:z.string().trim().max(100).optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).parse(req.query);
 const args=[req.organizationId];let where='organization_id=?';
 if(query.q){where+=' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';args.push('%'+query.q+'%','%'+query.q+'%','%'+query.q+'%');}
 const [items]=await pool.execute(`SELECT id,name,phone,email FROM customers WHERE ${where} ORDER BY id DESC LIMIT ${query.limit}`,args);
 res.json({items});
}));

router.post('/customers',requireRoles('OWNER','MANAGER','CASHIER'),asyncRoute(async(req,res)=>{
 const customer=z.object({name:z.string().trim().min(2).max(160),phone:z.string().trim().max(30).optional(),email:z.string().trim().toLowerCase().email().max(254).optional()}).strict().parse(req.body);
 const [result]=await pool.execute('INSERT INTO customers(organization_id,name,phone,email) VALUES (?,?,?,?)',[req.organizationId,customer.name,customer.phone||null,customer.email||null]);
 res.status(201).json({id:result.insertId,...customer});
}));

router.get('/branches/:id/pos-settings',requireRoles('OWNER','MANAGER','CASHIER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);const branch=await assertBranch(req.user,id);
 const [[settings]]=await pool.execute('SELECT pos_layout_mode,manager_can_change_pos_mode FROM branches WHERE id=? AND organization_id=?',[id,req.organizationId]);
 res.json({branch_id:id,branch_name:branch.name,pos_layout_mode:settings.pos_layout_mode,can_change:['OWNER','MANAGER'].includes(req.user.role)});
}));

const textField=max=>z.preprocess(value=>value==null?'':value,z.string().trim().max(max));

router.get('/branches/:id/payment-settings',requireRoles('OWNER','MANAGER','CASHIER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);await assertBranch(req.user,id);
 const [[settings]]=await pool.execute('SELECT bank_bin,bank_code,bank_account_number,bank_account_name,static_qr_url,store_phone,store_address,wifi_password FROM branches WHERE id=? AND organization_id=?',[id,req.organizationId]);
 res.json({branch_id:id,configured:Boolean(settings.bank_bin&&settings.bank_account_number),...settings});
}));
router.put('/branches/:id/payment-settings',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);await assertBranch(req.user,id,['MANAGER']);
 const parsed=z.object({bank_bin:textField(12),bank_code:textField(20),bank_account_number:textField(40),bank_account_name:textField(120),static_qr_url:textField(3000000),store_phone:textField(50),store_address:textField(500),wifi_password:textField(120)}).strict().safeParse(req.body);
 if(!parsed.success){const fieldErrors={};for(const issue of parsed.error.issues){const field=String(issue.path[0]||'request');fieldErrors[field]=issue.message;}return res.status(400).json({message:'Invalid payment configuration',fieldErrors});}
 const data=parsed.data,hasBank=Boolean(data.bank_bin||data.bank_account_number),fieldErrors={};
 if(hasBank){if(!/^[0-9]{6}$/.test(data.bank_bin))fieldErrors.bank_bin='BIN must contain exactly 6 digits';if(!data.bank_account_number)fieldErrors.bank_account_number='Enter the bank account number';}
 if(data.static_qr_url&&!/^https:\/\//i.test(data.static_qr_url)&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.static_qr_url))fieldErrors.static_qr_url='QR image must be PNG/JPG/WEBP or an HTTPS URL';
 if(Object.keys(fieldErrors).length)return res.status(400).json({message:'Please check the payment configuration fields',fieldErrors});
 await pool.execute('UPDATE branches SET bank_bin=?,bank_code=?,bank_account_number=?,bank_account_name=?,static_qr_url=?,store_phone=?,store_address=?,wifi_password=? WHERE id=? AND organization_id=?',[data.bank_bin||null,data.bank_code||null,data.bank_account_number||null,data.bank_account_name||null,data.static_qr_url||null,data.store_phone||null,data.store_address||null,data.wifi_password||null,id,req.organizationId]);
 res.json({branch_id:id,configured:Boolean(data.bank_bin&&data.bank_account_number),...data});
}));
router.get('/branches/:id/receipt-settings',requireRoles('OWNER','MANAGER','INVENTORY','CASHIER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);await assertBranch(req.user,id);
 const [[settings]]=await pool.execute('SELECT store_phone,store_address,wifi_password FROM branches WHERE id=? AND organization_id=?',[id,req.organizationId]);
 res.json({branch_id:id,...settings});
}));
router.put('/branches/:id/receipt-settings',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);await assertBranch(req.user,id);
 const data=z.object({store_phone:textField(50),store_address:textField(500),wifi_password:textField(120)}).strict().parse(req.body);
 await pool.execute('UPDATE branches SET store_phone=?,store_address=?,wifi_password=? WHERE id=? AND organization_id=?',[data.store_phone||null,data.store_address||null,data.wifi_password||null,id,req.organizationId]);
 res.json({branch_id:id,...data});
}));

const updatePosSettings=asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);await assertBranch(req.user,id);
 const data=z.object({pos_layout_mode:z.enum(['OWNER_MODE','CASHIER_MODE']).optional(),manager_can_change_pos_mode:z.boolean().optional()}).strict().refine(value=>value.pos_layout_mode!==undefined||value.manager_can_change_pos_mode!==undefined,'Cần ít nhất một cấu hình').parse(req.body);
 if(req.user.role!=='OWNER'&&data.manager_can_change_pos_mode!==undefined)throw new HttpError(403,'Chỉ chủ cửa hàng được cấp quyền đổi bố cục');
 const fields=[],values=[];
 if(data.pos_layout_mode!==undefined){fields.push('pos_layout_mode=?');values.push(data.pos_layout_mode);}
 if(data.manager_can_change_pos_mode!==undefined){fields.push('manager_can_change_pos_mode=?');values.push(data.manager_can_change_pos_mode?1:0);}
 values.push(id,req.organizationId);await pool.execute(`UPDATE branches SET ${fields.join(',')} WHERE id=? AND organization_id=?`,values);
 const [[settings]]=await pool.execute('SELECT pos_layout_mode,manager_can_change_pos_mode FROM branches WHERE id=? AND organization_id=?',[id,req.organizationId]);
 res.status(200).json({branch_id:id,pos_layout_mode:settings.pos_layout_mode,manager_can_change_pos_mode:Boolean(settings.manager_can_change_pos_mode),can_change:true});
});
router.patch('/branches/:id/pos-settings',requireRoles('OWNER','MANAGER'),updatePosSettings);
router.put('/branches/:id/pos-settings',requireRoles('OWNER','MANAGER'),updatePosSettings);
async function validateCategory(org,id,branchId=null){if(id){const [r]=await pool.execute('SELECT id FROM categories WHERE organization_id=? AND id=? AND branch_id <=> ?',[org,id,branchId]);if(!r.length)throw new HttpError(404,'Danh mục không thuộc phạm vi chi nhánh');}}
router.post('/products',asyncRoute(async(req,res)=>{
 const parsed=product.parse(req.body),branchId=await resolveProductWriteTarget(req,parsed.branch_id),p=req.user.role==='CASHIER'?{...parsed,cost_price:null}:parsed;await validateCategory(req.organizationId,p.category_id,branchId);
 const [r]=await pool.execute('INSERT INTO products(organization_id,branch_id,category_id,sku,name,sale_price,cost_price,attributes,status,image_url) VALUES (?,?,?,?,?,?,?,?,?,?)',[req.organizationId,branchId,p.category_id??null,p.sku,p.name,p.sale_price,p.cost_price??null,JSON.stringify(p.attributes||{}),p.status,p.image_url??null]);
 res.status(201).json({id:r.insertId,...p,branch_id:branchId});
}));
router.put('/products/:id',requireRoles('OWNER','MANAGER','INVENTORY'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id),p=product.parse(req.body);const [[current]]=await pool.execute('SELECT branch_id FROM products WHERE id=? AND organization_id=?',[id,req.organizationId]);if(!current)throw new HttpError(404,'Product not found');if(current.branch_id)await assertBranch(req.user,current.branch_id);if(req.user.role==='INVENTORY'){const scopeBranch=p.branch_id??current.branch_id;if(!scopeBranch)throw new HttpError(403,'Select an assigned branch before editing a shared product');await assertBranch(req.user,scopeBranch,['INVENTORY']);}if(p.branch_id&&current.branch_id&&Number(p.branch_id)!==Number(current.branch_id))throw new HttpError(400,'Product cannot be moved between catalog scopes');await validateCategory(req.organizationId,p.category_id,current.branch_id??null);
 const hasAttributes=Object.hasOwn(req.body,'attributes');
 const [r]=await pool.execute('UPDATE products SET category_id=?,sku=?,name=?,sale_price=?,cost_price=?,attributes=CASE WHEN ? THEN ? ELSE attributes END,status=?,image_url=CASE WHEN ? THEN ? ELSE image_url END WHERE id=? AND organization_id=?',[p.category_id??null,p.sku,p.name,p.sale_price,p.cost_price??null,hasAttributes,JSON.stringify(p.attributes||{}),p.status,Object.hasOwn(req.body,'image_url'),p.image_url??null,id,req.organizationId]);
 if(!r.affectedRows)throw new HttpError(404,'Không tìm thấy sản phẩm');res.json({id,...p});
}));
router.delete('/products/:id',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);
 await transaction(async c=>{
  const [[current]]=await c.execute('SELECT id,branch_id FROM products WHERE id=? AND organization_id=? FOR UPDATE',[id,req.organizationId]);
  if(!current)throw new HttpError(404,'Không tìm thấy sản phẩm');
  if(current.branch_id)await assertBranch(req.user,current.branch_id,['MANAGER'],c);
  const [[stock]]=await c.execute('SELECT COALESCE(SUM(quantity),0) quantity FROM inventory_balances WHERE organization_id=? AND product_id=?',[req.organizationId,id]);
  const [[usage]]=await c.execute('SELECT (SELECT COUNT(*) FROM stock_document_items WHERE organization_id=? AND product_id=?) transactions,(SELECT COUNT(*) FROM inventory_movements WHERE organization_id=? AND product_id=?) movements',[req.organizationId,id,req.organizationId,id]);
  if(Number(stock.quantity)>0||Number(usage.transactions)>0||Number(usage.movements)>0)throw new HttpError(409,'Sản phẩm đã có tồn kho hoặc lịch sử giao dịch. Hãy dùng Tạm ngừng thay vì xóa.');
  await c.execute('DELETE FROM inventory_balances WHERE organization_id=? AND product_id=?',[req.organizationId,id]);
  await c.execute('DELETE FROM products WHERE id=? AND organization_id=?',[id,req.organizationId]);
 });
 res.json({deleted:true,id});
}));
router.post('/branches',requireRoles('OWNER'),asyncRoute(async(req,res)=>{
 const b=z.object({name:z.string().trim().min(1).max(160),address:z.string().max(500).optional(),phone:z.string().max(30).optional(),catalog_mode:z.enum(['SHARED','INDEPENDENT']).default('SHARED')}).strict().parse(req.body);
 const [r]=await pool.execute('INSERT INTO branches(organization_id,name,address,phone,catalog_mode) VALUES (?,?,?,?,?)',[req.organizationId,b.name,b.address??null,b.phone??null,b.catalog_mode]);res.status(201).json({id:r.insertId,...b});
}));
router.put('/branches/:id',requireRoles('OWNER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);await assertBranch(req.user,id);
 const b=z.object({name:z.string().trim().min(1).max(160),address:z.string().max(500).optional(),phone:z.string().max(30).optional(),catalog_mode:z.enum(['SHARED','INDEPENDENT']).optional()}).strict().parse(req.body);
 await pool.execute('UPDATE branches SET name=?,address=?,phone=?,catalog_mode=COALESCE(?,catalog_mode) WHERE id=? AND organization_id=?',[b.name,b.address??null,b.phone??null,b.catalog_mode??null,id,req.organizationId]);res.json({id,...b});
}));
const staff=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().toLowerCase().email().max(254),password:z.string().min(12).refine(v=>Buffer.byteLength(v)<=72),role:z.enum(['MANAGER','INVENTORY','CASHIER']),branch_ids:z.array(positiveId).min(1).max(100).refine(v=>new Set(v).size===v.length)}).strict().refine(v=>v.role!=='MANAGER'||v.branch_ids.length===1,{path:['branch_ids'],message:'Manager phải được phân công đúng một chi nhánh'});
router.post('/staff',requireRoles('OWNER'),asyncRoute(async(req,res)=>{
 const data=staff.parse(req.body),hash=await bcrypt.hash(data.password,12);
 const result=await transaction(async c=>{
  for(const id of data.branch_ids)await assertBranch(req.user,id,[],c);
  const [r]=await c.execute("INSERT INTO users(organization_id,email,password_hash,full_name,role,status) VALUES (?,?,?,?,?,'ACTIVE')",[req.organizationId,data.email,hash,data.name,data.role]);
  for(const id of data.branch_ids)await c.execute('INSERT INTO user_branch_roles(organization_id,user_id,branch_id,role) VALUES (?,?,?,?)',[req.organizationId,r.insertId,id,data.role]);
  return {id:r.insertId,name:data.name,email:data.email,role:data.role,branch_ids:data.branch_ids};
 });res.status(201).json(result);
}));
router.get('/staff',requireRoles('OWNER'),asyncRoute(async(req,res)=>{
 const [items]=await pool.execute("SELECT u.id,u.full_name AS name,u.email,u.role,u.status,GROUP_CONCAT(r.branch_id ORDER BY r.branch_id) AS branch_ids FROM users u LEFT JOIN user_branch_roles r ON r.organization_id=u.organization_id AND r.user_id=u.id WHERE u.organization_id=? GROUP BY u.id ORDER BY u.id",[req.organizationId]);res.json({items:items.map(u=>({...u,branch_ids:u.branch_ids?u.branch_ids.split(',').map(Number):[]}))});
}));
router.patch('/staff/:id',requireRoles('OWNER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id),data=z.object({status:z.enum(['ACTIVE','DISABLED']),role:z.enum(['MANAGER','INVENTORY','CASHIER']),branch_ids:z.array(positiveId).min(1).max(100).refine(v=>new Set(v).size===v.length),password:z.string().min(12).refine(v=>Buffer.byteLength(v)<=72).optional()}).strict().refine(v=>v.role!=='MANAGER'||v.branch_ids.length===1,{path:['branch_ids'],message:'Manager phải được phân công đúng một chi nhánh'}).parse(req.body);
 const passwordHash=data.password?await bcrypt.hash(data.password,12):null;
 await transaction(async c=>{
  const [users]=await c.execute('SELECT role FROM users WHERE id=? AND organization_id=? FOR UPDATE',[id,req.organizationId]);
  if(!users.length)throw new HttpError(404,'Không tìm thấy nhân viên');if(users[0].role==='OWNER')throw new HttpError(403,'Không thay đổi chủ cửa hàng');
  for(const b of data.branch_ids)await assertBranch(req.user,b,[],c);
  await c.execute('UPDATE users SET role=?,status=? WHERE id=? AND organization_id=?',[data.role,data.status,id,req.organizationId]);
  if(passwordHash){await c.execute('UPDATE users SET password_hash=? WHERE id=? AND organization_id=?',[passwordHash,id,req.organizationId]);await c.execute('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE user_id=? AND organization_id=?',[id,req.organizationId]);}
  await c.execute('DELETE FROM user_branch_roles WHERE user_id=? AND organization_id=?',[id,req.organizationId]);
  for(const b of data.branch_ids)await c.execute('INSERT INTO user_branch_roles(organization_id,user_id,branch_id,role) VALUES (?,?,?,?)',[req.organizationId,id,b,data.role]);
 });res.json({id,...data});
}));
router.post('/staff/:id/impersonate',requireRoles('OWNER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);
 const [[target]]=await pool.execute('SELECT id,organization_id,email,full_name,phone,role,status,locked_until FROM users WHERE id=? AND organization_id=?',[id,req.organizationId]);
 if(!target||!['MANAGER','CASHIER','INVENTORY'].includes(target.role))throw new HttpError(404,'Không tìm thấy nhân viên trong cửa hàng này');
 if(target.status!=='ACTIVE'||(target.locked_until&&new Date(target.locked_until)>new Date()))throw new HttpError(400,'Tài khoản nhân viên đang bị khóa hoặc chưa hoạt động');
 const user=await sessionUser(target),sessionId=randomUUID();
 const token=jwt.sign({},config.secret,{algorithm:'HS256',subject:String(target.id),jwtid:sessionId,issuer:'retail-app',audience:'retail-web',expiresIn:'8h'});
 const connection=await pool.getConnection();
 try{
  await connection.beginTransaction();
  await connection.execute('INSERT INTO auth_sessions(id,organization_id,user_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))',[sessionId,target.organization_id,target.id]);
  await connection.execute('INSERT INTO audit_logs(user_id,organization_id,event_type,status,details) VALUES (?,?,?,?,?)',[req.user.id,req.organizationId,'IMPERSONATE_STAFF','SUCCESS',JSON.stringify({action:'START',actor_user_id:req.user.id,target_user_id:target.id,target_role:target.role,session_id:sessionId})]);
  await connection.commit();
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 const currentToken = (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) ? req.headers.authorization.slice(7).trim() : req.cookies?.session;
 if(currentToken) res.cookie('owner_session',currentToken,{...sessionCookieOptions,maxAge:8*60*60*1000});
 res.cookie('session',token,{...sessionCookieOptions,maxAge:8*60*60*1000});
 res.json({user:{...user,impersonating:true},token,accessToken:token});
}));
router.post('/staff/impersonate/return',requireRoles('MANAGER','CASHIER','INVENTORY'),asyncRoute(async(req,res)=>{
 const ownerToken=req.cookies?.owner_session || req.headers['x-owner-token'];
 if(!ownerToken)throw new HttpError(403,'Không có phiên chủ cửa hàng để quay lại');
 let claims;try{claims=jwt.verify(ownerToken,config.secret,{algorithms:['HS256'],issuer:'retail-app',audience:'retail-web'});}catch{throw new HttpError(403,'Phiên chủ cửa hàng đã hết hạn');}
 const [[owner]]=await pool.execute(`SELECT u.id,u.organization_id,u.email,u.full_name,u.phone,u.role,u.status,s.id session_id
  FROM auth_sessions s JOIN users u ON u.id=s.user_id AND s.organization_id=u.organization_id
  WHERE s.id=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>UTC_TIMESTAMP() AND u.role='OWNER' AND u.status='ACTIVE' AND u.organization_id=?`,[claims.jti,claims.sub,req.organizationId]);
 if(!owner)throw new HttpError(403,'Phiên chủ cửa hàng không còn hợp lệ');
 const user=await sessionUser(owner);
 await pool.execute('INSERT INTO audit_logs(user_id,organization_id,event_type,status,details) VALUES (?,?,?,?,?)',[owner.id,owner.organization_id,'IMPERSONATE_STAFF','SUCCESS',JSON.stringify({action:'RETURN',actor_user_id:owner.id,target_user_id:req.user.id,target_role:req.user.role})]);
 await pool.execute('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE id=? AND user_id=?',[req.sessionId,req.user.id]);
 res.cookie('session',ownerToken,{...sessionCookieOptions,maxAge:8*60*60*1000});
 res.clearCookie('owner_session',sessionCookieOptions);
 res.json({user:{...user,impersonating:false},token:ownerToken,accessToken:ownerToken});
}));
export default router;
