import {Router} from 'express';
import {z} from 'zod';
import {createHash,timingSafeEqual} from 'node:crypto';
import {pool} from '../db/pool.js';
import {requireRoles} from '../middlewares/auth.js';
import {asyncRoute,HttpError} from '../utils/http.js';
import {positiveId,price,period,filters,branchClause,assertBranch,transaction,readSnapshot} from './common.js';
import {calendarMetadata} from './business-calendar.js';
import {assertProductVisibleInBranch} from './product-catalog.js';
import {getSettings} from '../services/appSettings.js';

const router=Router();

function normalizeVietQrText(value){
 return String(value??'').replace(/[\u0110\u0111]/g,'D').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function vietQrPaymentReference(organizationName,id){
 const words=normalizeVietQrText(organizationName).split(' ').filter(Boolean);
 const initials=words.map(word=>word[0]).join('').slice(0,4);
 const candidate=initials.length>=2?initials:(words[0]||'').slice(0,4);
 const prefix=candidate.length>=2?candidate:'RI';
 return `${prefix}-${id}`;
}

const discountSchema=z.object({type:z.enum(['PERCENT','FIXED']),value:price}).strict();
const paymentSchema=z.object({method:z.enum(['CASH','BANK_TRANSFER']),cash_received:price.optional()}).strict();

const documentSchema=z.object({
  branch_id:positiveId,
  request_key:z.string().min(12).max(80),
  order_status:z.enum(['OPEN','COMPLETED']).optional(),
  client_created_at:z.string().datetime({offset:true}).optional(),
  note:z.string().max(500).optional(),
  customer_id:positiveId.optional(),
  order_discount:discountSchema.optional(),
  payment:paymentSchema.optional(),
  items:z.array(z.object({
    product_id:positiveId.optional(),
    sku:z.string().trim().min(1).max(100).optional(),
    name:z.string().trim().min(1).max(180).optional(),
    category_name:z.string().trim().min(1).max(120).optional(),
    image_url:z.string().max(1500000).nullable().optional(),
    sale_price:price.optional(),
    quantity:z.number().int().positive().max(100000),
    unit_price:price.optional(),
    discount:discountSchema.optional()
  }).strict()).min(1).max(100)
}).strict().refine(v=>new Set(v.items.map(i=>i.product_id)).size===v.items.length,'Không lặp sản phẩm trong cùng chứng từ');

const returnSchema=z.object({
 reason:z.string().trim().min(1).max(255),
 items:z.array(z.object({product_id:positiveId,quantity:z.number().int().positive().max(100000)}).strict()).min(1).max(100)
}).strict().refine(v=>new Set(v.items.map(i=>i.product_id)).size===v.items.length,'Kh?ng l?p s?n ph?m trong c?ng y?u c?u tr? h?ng');

const adjustmentSchema = z.object({
  branch_id: positiveId,
  request_key: z.string().min(12).max(80),
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    product_id: positiveId,
    actual_quantity: z.number().int().min(0).max(100000),
    reason: z.string().max(255).optional()
  }).strict()).min(1).max(100)
}).strict().refine(v => new Set(v.items.map(i => i.product_id)).size === v.items.length, 'Không lặp sản phẩm trong cùng phiếu kiểm kê');

const transferSchema = z.object({
  source_branch_id: positiveId,
  destination_branch_id: positiveId,
  request_key: z.string().min(12).max(80),
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    product_id: positiveId,
    quantity: z.number().int().positive().max(100000)
  }).strict()).min(1).max(100)
}).strict()
  .refine(v => v.source_branch_id !== v.destination_branch_id, 'Chi nhánh xuất và chi nhánh nhận phải khác nhau')
  .refine(v => new Set(v.items.map(i => i.product_id)).size === v.items.length, 'Không lặp sản phẩm trong cùng phiếu điều chuyển');

async function existing(org,type,key,hash){
  const [rows]=await pool.execute('SELECT id,total,payload_hash FROM stock_documents WHERE organization_id=? AND type=? AND request_key=?',[org,type,key]);
  if(rows.length){
    if(rows[0].payload_hash!==hash)throw new HttpError(409,'Mã yêu cầu đã được dùng cho nội dung khác');
    return {id:rows[0].id,total:rows[0].total,replayed:true};
  }
  return null;
}

function calculateDiscount(baseCents,discount,maxRate){
 if(!discount||baseCents<=0)return 0;
 const amount=discount.type==='PERCENT'?Math.round(baseCents*Math.min(discount.value,100)/100):Math.round(discount.value*100);
 if(amount>Math.floor(baseCents*maxRate/100))throw new HttpError(403,`Mức giảm giá vượt giới hạn ${maxRate}%`);
 return Math.min(baseCents,amount);
}

async function recentOpenDuplicate(connection,organizationId,userId,branchId,data,maxDiscountRate){
 const [candidates]=await connection.execute("SELECT id,total,payment_status FROM stock_documents WHERE organization_id=? AND branch_id=? AND performed_by=? AND type='SALE' AND order_status='OPEN' AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 SECOND) ORDER BY id DESC LIMIT 20 FOR UPDATE",[organizationId,branchId,userId]);
 if(!candidates.length)return null;
 const [storedItems]=await connection.execute(`SELECT document_id,product_id,quantity FROM stock_document_items WHERE organization_id=? AND document_id IN (${candidates.map(()=>'?').join(',')}) ORDER BY document_id,product_id`,[organizationId,...candidates.map(row=>row.id)]);
 const signature=items=>items.map(item=>`${Number(item.product_id)}:${Number(item.quantity)}`).join('|');
 const requested=signature(data.items);
 const ids=[...new Set(data.items.map(item=>item.product_id))];
 const [products]=await connection.execute(`SELECT id,sale_price FROM products WHERE organization_id=? AND status='ACTIVE' AND id IN (${ids.map(()=>'?').join(',')})`,[organizationId,...ids]);
 if(products.length!==ids.length)return null;
 const byId=new Map(products.map(product=>[Number(product.id),Math.round(Number(product.sale_price)*100)]));
 let subtotalCents=0,itemDiscountCents=0;
 for(const item of data.items){const grossCents=byId.get(item.product_id)*item.quantity;subtotalCents+=grossCents;itemDiscountCents+=calculateDiscount(grossCents,item.discount,maxDiscountRate);}
 const expectedTotalCents=subtotalCents-itemDiscountCents-calculateDiscount(subtotalCents-itemDiscountCents,data.order_discount,maxDiscountRate);
 for(const candidate of candidates){
  const items=storedItems.filter(item=>Number(item.document_id)===Number(candidate.id));
  if(items.length===data.items.length&&signature(items)===requested&&Math.round(Number(candidate.total)*100)===expectedTotalCents)return {id:candidate.id,total:candidate.total,payment_status:candidate.payment_status,order_status:'OPEN',replayed:true};
 }
 return null;
}

function postDocument(type){return asyncRoute(async(req,res)=>{
 const data=documentSchema.parse(req.body);
 if(type==='RECEIPT'&&data.items.some(item=>item.unit_price>0&&item.unit_price<100))throw new HttpError(400,'Đơn giá nhập thấp hơn 100 VNĐ. Hãy kiểm tra lại đơn vị nghìn đồng.');
 if(type==='SALE'&&data.items.some(item=>!item.product_id))throw new HttpError(400,'Sales require an existing product');
 if(type==='RECEIPT'&&data.items.some(item=>!item.product_id&&(!item.sku||!item.name)))throw new HttpError(400,'New receipt products require SKU and name');
 data.items.sort((a,b)=>Number(a.product_id||0)-Number(b.product_id||0)||String(a.sku||'').localeCompare(String(b.sku||'')));
 if(type==='SALE'&&data.order_status==='COMPLETED'&&data.payment?.method==='BANK_TRANSFER')throw new HttpError(400,'Bank transfer must be confirmed before completion');
 const allowed=type==='SALE'?['MANAGER','CASHIER']:['MANAGER','INVENTORY'];
 await assertBranch(req.user,data.branch_id,allowed);
 if(type==='RECEIPT'&&data.items.some(i=>i.unit_price===undefined))throw new HttpError(400,'Phiếu nhập cần đơn giá từng sản phẩm');
 if(type==='SALE'&&data.items.some(i=>i.unit_price!==undefined))throw new HttpError(400,'Giá bán được lấy từ danh mục trên máy chủ');
 if(type==='RECEIPT'&&(data.customer_id||data.order_discount||data.payment||data.items.some(i=>i.discount)))throw new HttpError(400,'Phiếu nhập không hỗ trợ dữ liệu bán hàng');
 const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');const org=req.organizationId;
 const requestedOrderStatus=type==='SALE'?(data.order_status||(data.payment?.method==='BANK_TRANSFER'?'OPEN':'COMPLETED')):'COMPLETED';
 const replay=await existing(org,type,data.request_key,hash);if(replay)return res.json(replay);
 let result;
 try{result=await transaction(async c=>{
  // Recheck assignments inside the transaction before writing.
  await assertBranch(req.user,data.branch_id,allowed,c);
  if(type==='SALE'&&requestedOrderStatus==='OPEN'){
   await c.execute('SELECT id FROM branches WHERE id=? AND organization_id=? FOR UPDATE',[data.branch_id,org]);
   const duplicate=await recentOpenDuplicate(c,org,req.user.id,data.branch_id,data,req.user.role==='OWNER'?50:req.user.role==='MANAGER'?30:10);
   if(duplicate)return duplicate;
  }
  if(data.customer_id){const [customers]=await c.execute('SELECT id FROM customers WHERE id=? AND organization_id=?',[data.customer_id,org]);if(!customers.length)throw new HttpError(404,'Không tìm thấy khách hàng');}
  const orderStatus=requestedOrderStatus;
  const payment=data.payment||{method:'CASH'};
  const paymentStatus=type==='SALE'&&orderStatus==='COMPLETED'?(payment.method==='CASH'?'PAID':'WAITING_PAYMENT'):type==='SALE'&&payment.method==='BANK_TRANSFER'?'WAITING_PAYMENT':null;
  const [doc]=await c.execute('INSERT INTO stock_documents(organization_id,branch_id,type,request_key,payload_hash,performed_by,total,note,customer_id,payment_method,payment_status,order_status,client_created_at,completed_at) VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?)',[org,data.branch_id,type,data.request_key,hash,req.user.id,data.note??null,data.customer_id??null,type==='SALE'?payment.method:null,paymentStatus,orderStatus,data.client_created_at?new Date(data.client_created_at):null,type==='SALE'&&orderStatus==='COMPLETED'?new Date():null]);
  let subtotalCents=0,itemDiscountCents=0;
  const [[receiptBranch]]=type==='RECEIPT'?await c.execute('SELECT catalog_mode FROM branches WHERE id=? AND organization_id=?',[data.branch_id,org]):[[null]];
  const maxDiscountRate=req.user.role==='OWNER'?50:req.user.role==='MANAGER'?30:10;
  for(const item of data.items){
   if(type==='RECEIPT'&&!item.product_id){
    let categoryId=null;
    if(item.category_name){const branchId=receiptBranch.catalog_mode==='INDEPENDENT'?data.branch_id:null;let [categories]=await c.execute('SELECT id FROM categories WHERE organization_id=? AND branch_id <=> ? AND LOWER(name)=LOWER(?) LIMIT 1 FOR UPDATE',[org,branchId,item.category_name]);if(!categories.length){const [created]=await c.execute('INSERT INTO categories(organization_id,branch_id,name) VALUES (?,?,?)',[org,branchId,item.category_name]);categoryId=created.insertId;}else categoryId=categories[0].id;}
    const [matches]=await c.execute('SELECT id,status FROM products WHERE organization_id=? AND sku=? FOR UPDATE',[org,item.sku]);
    if(matches.length){if(matches[0].status!=='ACTIVE')throw new HttpError(409,'Product is disabled: '+item.sku);item.product_id=Number(matches[0].id);}
    else{const [created]=await c.execute("INSERT INTO products(organization_id,branch_id,category_id,sku,name,sale_price,cost_price,attributes,status,image_url) VALUES (?,?,?,?,?,?,?,'{}','ACTIVE',?)",[org,receiptBranch.catalog_mode==='INDEPENDENT'?data.branch_id:null,categoryId,item.sku,item.name,Number(item.sale_price||0),Number(item.unit_price),item.image_url??null]);item.product_id=created.insertId;}
   }
   const [products]=await c.execute("SELECT id,sku,name,sale_price FROM products WHERE id=? AND organization_id=? AND status='ACTIVE' FOR UPDATE",[item.product_id,org]);
   if(!products.length)throw new HttpError(404,'Sản phẩm không tồn tại hoặc đã ngừng bán');const p=products[0];
   if(type==='RECEIPT')await c.execute('UPDATE products SET cost_price=?,sale_price=COALESCE(?,sale_price),image_url=COALESCE(?,image_url) WHERE id=? AND organization_id=?',[Number(item.unit_price),item.sale_price??null,item.image_url??null,p.id,org]);
   await assertProductVisibleInBranch(c,org,data.branch_id,p.id);
   await c.execute('INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity',[org,data.branch_id,p.id]);
   const [[balance]]=await c.execute('SELECT quantity,average_cost FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',[org,data.branch_id,p.id]);
   const delta=type==='SALE'?-item.quantity:item.quantity,next=balance.quantity+delta;
   if(next<0)throw new HttpError(409,'Không đủ tồn kho: '+p.sku);
   if(next>2147483647)throw new HttpError(400,'Số lượng tồn vượt giới hạn');
   const unit=type==='SALE'?Number(p.sale_price):item.unit_price;const unitCents=Math.round(unit*100);const grossCents=unitCents*item.quantity;
   const discountCents=type==='SALE'?calculateDiscount(grossCents,item.discount,maxDiscountRate):0;
   subtotalCents+=grossCents;itemDiscountCents+=discountCents;
   if(!Number.isSafeInteger(subtotalCents)||subtotalCents>100000000000000)throw new HttpError(400,'Tổng chứng từ vượt giới hạn');
   const newAverageCost=type==='RECEIPT'?(Number(balance.quantity)*Number(balance.average_cost||0)+item.quantity*unit)/(Number(balance.quantity)+item.quantity):Number(balance.average_cost||0);
   await c.execute('UPDATE inventory_balances SET quantity=?,average_cost=? WHERE organization_id=? AND branch_id=? AND product_id=?',[next,newAverageCost,org,data.branch_id,p.id]);
   await c.execute('INSERT INTO stock_document_items(organization_id,document_id,product_id,sku,product_name,quantity,unit_price,unit_cost,discount_type,discount_value,discount_amount,line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[org,doc.insertId,p.id,p.sku,p.name,item.quantity,unit,type==='RECEIPT'?unit:(orderStatus==='COMPLETED'?Number(balance.average_cost||0):null),item.discount?.type??null,item.discount?.value??0,discountCents/100,(grossCents-discountCents)/100]);
   await c.execute('INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after) VALUES (?,?,?,?,?,?)',[org,data.branch_id,p.id,doc.insertId,delta,next]);
  }
  const afterItemsCents=subtotalCents-itemDiscountCents;
  const orderDiscountCents=type==='SALE'?calculateDiscount(afterItemsCents,data.order_discount,maxDiscountRate):0;
  const totalCents=afterItemsCents-orderDiscountCents;
  let receivedCents=null,changeCents=null;
  if(type==='SALE'&&orderStatus==='COMPLETED'&&payment.method==='CASH'){
   receivedCents=payment.cash_received===undefined?totalCents:Math.round(payment.cash_received*100);
   if(receivedCents<totalCents)throw new HttpError(400,'Tiền khách đưa chưa đủ');
   changeCents=receivedCents-totalCents;
  }
  await c.execute('UPDATE stock_documents SET subtotal=?,item_discount_total=?,order_discount=?,total=?,cash_received=?,change_due=? WHERE id=? AND organization_id=?',[subtotalCents/100,itemDiscountCents/100,orderDiscountCents/100,totalCents/100,receivedCents===null?null:receivedCents/100,changeCents===null?null:changeCents/100,doc.insertId,org]);
  if(type==='SALE'&&(orderStatus==='COMPLETED'||payment.method==='BANK_TRANSFER'))await c.execute('INSERT INTO sale_payments(organization_id,document_id,method,status,amount,received_amount,change_amount) VALUES (?,?,?,?,?,?,?)',[org,doc.insertId,payment.method,paymentStatus,totalCents/100,receivedCents===null?null:receivedCents/100,changeCents===null?null:changeCents/100]);
  return {id:doc.insertId,total:totalCents/100,payment_status:paymentStatus,order_status:orderStatus,replayed:false};
 });}catch(e){if(e.code==='ER_DUP_ENTRY'){result=await existing(org,type,data.request_key,hash);if(!result)throw e;}else throw e;}
 res.status(result.replayed?200:201).json(result);
});}

router.post('/receipts',requireRoles('OWNER','MANAGER','INVENTORY'),postDocument('RECEIPT'));
router.post('/documents/receipts',requireRoles('OWNER','MANAGER','INVENTORY'),(req,res,next)=>{
 req.body={...req.body,items:Array.isArray(req.body?.items)?req.body.items.map(({unit_cost,...item})=>({...item,unit_price:unit_cost??item.unit_price})):req.body?.items};
 next();
},postDocument('RECEIPT'));
router.post('/sales',requireRoles('OWNER','MANAGER','CASHIER'),postDocument('SALE'));

const receiptUpdateSchema=z.object({items:z.array(z.object({product_id:positiveId,quantity:z.number().int().positive().max(100000),unit_cost:price}).strict()).min(1).max(100),note:z.string().max(500).nullable().optional()}).strict().refine(v=>new Set(v.items.map(i=>i.product_id)).size===v.items.length,'Không lặp sản phẩm trong phiếu nhập');
router.put('/documents/receipts/:id',requireRoles('OWNER','MANAGER','INVENTORY'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id),data=receiptUpdateSchema.parse(req.body),org=req.organizationId;
  const invalidCost=data.items.find(item=>item.unit_cost>0&&item.unit_cost<100);
  if(invalidCost)throw new HttpError(400,'Đơn giá nhập thấp hơn 100 VNĐ. Hãy kiểm tra lại đơn vị nghìn đồng.');
 const result=await transaction(async c=>{
  const [[doc]]=await c.execute("SELECT id,branch_id FROM stock_documents WHERE id=? AND organization_id=? AND type='RECEIPT' FOR UPDATE",[id,org]);
  if(!doc)throw new HttpError(404,'Không tìm thấy phiếu nhập');await assertBranch(req.user,doc.branch_id,['MANAGER','INVENTORY'],c);
  const [oldItems]=await c.execute('SELECT product_id,quantity,unit_cost FROM stock_document_items WHERE organization_id=? AND document_id=? ORDER BY product_id FOR UPDATE',[org,id]);
  const old=new Map(oldItems.map(row=>[Number(row.product_id),row]));const next=new Map(data.items.map(row=>[Number(row.product_id),row]));
  let totalCents=0;
  for(const productId of [...new Set([...old.keys(),...next.keys()])].sort((a,b)=>a-b)){
   const item=next.get(productId),previous=old.get(productId),[products]=await c.execute("SELECT id,sku,name FROM products WHERE id=? AND organization_id=? AND status IN ('ACTIVE','DISABLED') FOR UPDATE",[productId,org]);
   if(item&&!products.length)throw new HttpError(404,'Không tìm thấy sản phẩm trong phiếu nhập');
   await c.execute('INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity,average_cost) VALUES (?,?,?,0,0) ON DUPLICATE KEY UPDATE quantity=quantity',[org,doc.branch_id,productId]);
   const [[balance]]=await c.execute('SELECT quantity,average_cost FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',[org,doc.branch_id,productId]);
   const oldQty=Number(previous?.quantity||0),newQty=Number(item?.quantity||0),delta=newQty-oldQty,currentQty=Number(balance.quantity),quantity=currentQty+delta;
   if(quantity<0)throw new HttpError(409,'Không thể giảm số lượng phiếu vì tồn kho hiện tại không đủ để hoàn tác.');
   const restQty=currentQty-oldQty,restValue=currentQty*Number(balance.average_cost||0)-oldQty*Number(previous?.unit_cost||0),cost=Number(item?.unit_cost||0);
   const average=quantity===0?0:Math.max(0,(Math.max(0,restQty)*Math.max(0,restValue)+newQty*cost)/quantity);
   await c.execute('UPDATE inventory_balances SET quantity=?,average_cost=? WHERE organization_id=? AND branch_id=? AND product_id=?',[quantity,average,org,doc.branch_id,productId]);
   if(delta)await c.execute("INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after,movement_type) VALUES (?,?,?,?,?,?,'ADJUSTMENT')",[org,doc.branch_id,productId,id,delta,quantity]);
   if(item){const p=products[0],cents=Math.round(cost*100)*newQty;totalCents+=cents;await c.execute('UPDATE products SET cost_price=? WHERE id=? AND organization_id=?',[cost,productId,org]);await c.execute('DELETE FROM stock_document_items WHERE organization_id=? AND document_id=? AND product_id=?',[org,id,productId]);await c.execute('INSERT INTO stock_document_items(organization_id,document_id,product_id,sku,product_name,quantity,unit_price,unit_cost,line_total) VALUES (?,?,?,?,?,?,?,?,?)',[org,id,productId,p.sku,p.name,newQty,cost,cost,cents/100]);}
   else await c.execute('DELETE FROM stock_document_items WHERE organization_id=? AND document_id=? AND product_id=?',[org,id,productId]);
  }
  if(!Number.isSafeInteger(totalCents))throw new HttpError(400,'Tổng phiếu nhập vượt giới hạn');
  await c.execute('UPDATE stock_documents SET total=?,subtotal=?,note=? WHERE id=? AND organization_id=?',[totalCents/100,totalCents/100,data.note??null,id,org]);
  return {id,total:totalCents/100};
 });res.json(result);
}));

router.get('/sales/open',requireRoles('OWNER','MANAGER','CASHIER'),asyncRoute(async(req,res)=>{
 const {sql,values}=filters(req.user,req.query);
 const [items]=await pool.execute(`SELECT d.id,d.branch_id,d.total,d.created_at,d.client_created_at,d.note,d.payment_method,d.order_status,b.name branch_name FROM stock_documents d JOIN branches b ON b.organization_id=d.organization_id AND b.id=d.branch_id WHERE ${sql} AND d.type='SALE' AND d.order_status='OPEN' ORDER BY d.created_at,d.id`,values);
 res.json({items});
}));

const openSaleUpdate=z.object({note:z.string().max(500).nullable().optional(),customer_id:positiveId.nullable().optional(),order_discount:discountSchema.optional(),payment_method:z.enum(['CASH','BANK_TRANSFER']).optional(),items:z.array(z.object({product_id:positiveId,quantity:z.number().int().positive().max(100000),discount:discountSchema.optional()}).strict()).min(1).max(100)}).strict().refine(v=>new Set(v.items.map(i=>i.product_id)).size===v.items.length,'Duplicate product');
router.put('/documents/sales/:id',requireRoles('OWNER','MANAGER','CASHIER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id),data=openSaleUpdate.parse(req.body);data.items.sort((a,b)=>Number(a.product_id||0)-Number(b.product_id||0)||String(a.sku||'').localeCompare(String(b.sku||'')));
 const result=await transaction(async c=>{
  const [docs]=await c.execute("SELECT id,branch_id,order_status,payment_method FROM stock_documents WHERE id=? AND organization_id=? AND type='SALE' FOR UPDATE",[id,req.organizationId]);
  if(!docs.length)throw new HttpError(404,'Sale not found');const doc=docs[0];
  await assertBranch(req.user,doc.branch_id,['MANAGER','CASHIER'],c);
  if(doc.order_status!=='OPEN')throw new HttpError(409,'Only open orders can be changed');
  if(data.customer_id){const [customers]=await c.execute('SELECT id FROM customers WHERE id=? AND organization_id=?',[data.customer_id,req.organizationId]);if(!customers.length)throw new HttpError(404,'Customer not found');}
  const [oldItems]=await c.execute('SELECT product_id,quantity FROM stock_document_items WHERE organization_id=? AND document_id=? ORDER BY product_id',[req.organizationId,id]);
  const old=new Map(oldItems.map(item=>[Number(item.product_id),Number(item.quantity)]));
  let subtotal=0,itemDiscount=0;const maxRate=req.user.role==='OWNER'?50:req.user.role==='MANAGER'?30:10;
  for(const item of data.items){
   const [ps]=await c.execute("SELECT id,sku,name,sale_price FROM products WHERE id=? AND organization_id=? AND status='ACTIVE' FOR UPDATE",[item.product_id,req.organizationId]);if(!ps.length)throw new HttpError(404,'Product not found');await assertProductVisibleInBranch(c,req.organizationId,doc.branch_id,ps[0].id);
   const p=ps[0],prev=old.get(Number(item.product_id))||0,delta=prev-item.quantity;
   await c.execute('INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity',[req.organizationId,doc.branch_id,p.id]);
   const [[balance]]=await c.execute('SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',[req.organizationId,doc.branch_id,p.id]);
   const next=Number(balance.quantity)+delta;if(next<0)throw new HttpError(409,'Insufficient stock: '+p.sku);
   await c.execute('UPDATE inventory_balances SET quantity=? WHERE organization_id=? AND branch_id=? AND product_id=?',[next,req.organizationId,doc.branch_id,p.id]);
   if(delta)await c.execute('INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after) VALUES (?,?,?,?,?,?)',[req.organizationId,doc.branch_id,p.id,id,delta,next]);
   const unit=Number(p.sale_price),gross=Math.round(unit*100)*item.quantity,discount=calculateDiscount(gross,item.discount,maxRate);
   subtotal+=gross;itemDiscount+=discount;
   await c.execute('DELETE FROM stock_document_items WHERE organization_id=? AND document_id=? AND product_id=?',[req.organizationId,id,p.id]);
   await c.execute('INSERT INTO stock_document_items(organization_id,document_id,product_id,sku,product_name,quantity,unit_price,discount_type,discount_value,discount_amount,line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[req.organizationId,id,p.id,p.sku,p.name,item.quantity,unit,item.discount?.type??null,item.discount?.value??0,discount/100,(gross-discount)/100]);
   old.delete(Number(item.product_id));
  }
  for(const [productId,quantity] of old){
   const [[balance]]=await c.execute('SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',[req.organizationId,doc.branch_id,productId]);const next=Number(balance.quantity)+quantity;
   await c.execute('UPDATE inventory_balances SET quantity=? WHERE organization_id=? AND branch_id=? AND product_id=?',[next,req.organizationId,doc.branch_id,productId]);
   await c.execute('INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after) VALUES (?,?,?,?,?,?)',[req.organizationId,doc.branch_id,productId,id,quantity,next]);
   await c.execute('DELETE FROM stock_document_items WHERE organization_id=? AND document_id=? AND product_id=?',[req.organizationId,id,productId]);
  }
  const orderDiscount=calculateDiscount(subtotal-itemDiscount,data.order_discount,maxRate),total=subtotal-itemDiscount-orderDiscount;
  const paymentMethod=data.payment_method||doc.payment_method||'CASH',paymentStatus=paymentMethod==='BANK_TRANSFER'?'WAITING_PAYMENT':null;
  await c.execute('UPDATE stock_documents SET total=?,subtotal=?,item_discount_total=?,order_discount=?,note=?,customer_id=?,payment_method=?,payment_status=? WHERE id=? AND organization_id=?',[total/100,subtotal/100,itemDiscount/100,orderDiscount/100,data.note??null,data.customer_id??null,paymentMethod,paymentStatus,id,req.organizationId]);
  if(paymentMethod==='BANK_TRANSFER')await c.execute("INSERT INTO sale_payments(organization_id,document_id,method,status,amount) VALUES (?,?,'BANK_TRANSFER','WAITING_PAYMENT',?) ON DUPLICATE KEY UPDATE method='BANK_TRANSFER',status='WAITING_PAYMENT',amount=VALUES(amount),received_amount=NULL,change_amount=NULL,confirmed_by=NULL,confirmed_at=NULL",[req.organizationId,id,total/100]);
  else await c.execute("UPDATE sale_payments SET method='CASH',status='FAILED',amount=?,received_amount=NULL,change_amount=NULL,confirmed_by=NULL,confirmed_at=NULL WHERE organization_id=? AND document_id=?",[total/100,req.organizationId,id]);
  return {id,total:total/100,order_status:'OPEN',payment_method:paymentMethod,payment_status:paymentStatus};
 });res.json(result);
}));

router.post('/sales/:id/cancel',requireRoles('OWNER','MANAGER','CASHIER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);
 const result=await transaction(async c=>{
  const [docs]=await c.execute("SELECT id,branch_id,order_status FROM stock_documents WHERE id=? AND organization_id=? AND type='SALE' FOR UPDATE",[id,req.organizationId]);
  if(!docs.length)throw new HttpError(404,'Sale not found');
  const doc=docs[0];await assertBranch(req.user,doc.branch_id,['MANAGER','CASHIER'],c);
  if(doc.order_status==='CANCELLED')return {id,order_status:'CANCELLED',replayed:true};
  if(doc.order_status!=='OPEN')throw new HttpError(409,'Only open orders can be cancelled');
  const [items]=await c.execute('SELECT product_id,quantity FROM stock_document_items WHERE organization_id=? AND document_id=? ORDER BY product_id',[req.organizationId,id]);
  for(const item of items){
   const [[balance]]=await c.execute('SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',[req.organizationId,doc.branch_id,item.product_id]);
   const next=Number(balance.quantity)+Number(item.quantity);
   await c.execute('UPDATE inventory_balances SET quantity=? WHERE organization_id=? AND branch_id=? AND product_id=?',[next,req.organizationId,doc.branch_id,item.product_id]);
   await c.execute('INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after) VALUES (?,?,?,?,?,?)',[req.organizationId,doc.branch_id,item.product_id,id,item.quantity,next]);
  }
  await c.execute("UPDATE stock_documents SET order_status='CANCELLED' WHERE id=? AND organization_id=?",[id,req.organizationId]);
  await c.execute("UPDATE stock_documents SET payment_status='FAILED' WHERE id=? AND organization_id=? AND payment_status='WAITING_PAYMENT'",[id,req.organizationId]);
  await c.execute("UPDATE sale_payments SET status='FAILED' WHERE document_id=? AND organization_id=? AND status='WAITING_PAYMENT'",[id,req.organizationId]);
  return {id,order_status:'CANCELLED',replayed:false};
 });res.json(result);
}));


router.post('/documents/sales/:id/return',requireRoles('OWNER','MANAGER','CASHIER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id),data=returnSchema.parse(req.body);
 const result=await transaction(async c=>{
  const [docs]=await c.execute("SELECT id,branch_id,total,subtotal,item_discount_total,order_discount,payment_method,payment_status,order_status,return_status,returned_amount,returned_cost FROM stock_documents WHERE id=? AND organization_id=? AND type='SALE' FOR UPDATE",[id,req.organizationId]);
  if(!docs.length)throw new HttpError(404,'Kh?ng t?m th?y h?a ??n');
  const doc=docs[0];await assertBranch(req.user,doc.branch_id,['MANAGER','CASHIER'],c);
  if(doc.order_status!=='COMPLETED'||doc.payment_status!=='PAID')throw new HttpError(409,'Ch? h?a ??n ?? thanh to?n m?i ???c tr? h?ng');
  if(doc.return_status==='FULL_RETURNED')throw new HttpError(409,'Sale has already been fully returned');
  const [rows]=await c.execute('SELECT id,product_id,quantity,returned_quantity,unit_cost,line_total FROM stock_document_items WHERE organization_id=? AND document_id=? ORDER BY product_id FOR UPDATE',[req.organizationId,id]);
  const wanted=new Map(data.items.map(item=>[item.product_id,item.quantity]));let refundCents=0,costCents=0;
  for(const item of rows){
   const qty=Number(wanted.get(Number(item.product_id))||0);if(!qty)continue;
   const remaining=Number(item.quantity)-Number(item.returned_quantity||0);
   if(qty>remaining+1e-9)throw new HttpError(409,`S? l??ng tr? v??t s? l??ng c?n ???c tr? cho s?n ph?m ${item.product_id}`);
   const grossCents=Math.round(Number(item.line_total)*100);
   const orderDiscountCents=Number(doc.subtotal)>Number(doc.item_discount_total)?Math.round(grossCents/(Math.round((Number(doc.subtotal)-Number(doc.item_discount_total))*100))*Math.round(Number(doc.order_discount)*100)):0;
   const itemNetCents=grossCents-orderDiscountCents;
   const prior=Number(item.returned_quantity||0),next=prior+qty;
   const previouslyRefunded=Math.round(itemNetCents*prior/Number(item.quantity));
   const nowRefunded=Math.round(itemNetCents*next/Number(item.quantity));
   const itemRefund=nowRefunded-previouslyRefunded;
   const unitCostCents=Math.round(Number(item.unit_cost||0)*100);
   refundCents+=itemRefund;costCents+=unitCostCents*qty;
   await c.execute('UPDATE stock_document_items SET returned_quantity=? WHERE id=? AND organization_id=?',[next,item.id,req.organizationId]);
   const [[balance]]=await c.execute('SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',[req.organizationId,doc.branch_id,item.product_id]);
   if(!balance)throw new HttpError(409,'Kh?ng t?m th?y t?n kho chi nh?nh cho s?n ph?m tr?');
   const nextBalance=Number(balance.quantity)+qty;
   await c.execute('UPDATE inventory_balances SET quantity=? WHERE organization_id=? AND branch_id=? AND product_id=?',[nextBalance,req.organizationId,doc.branch_id,item.product_id]);
   await c.execute("INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after,movement_type) VALUES (?,?,?,?,?,?,'RETURN')",[req.organizationId,doc.branch_id,item.product_id,id,qty,nextBalance]);
  }
  for(const productId of wanted.keys())if(!rows.some(row=>Number(row.product_id)===productId))throw new HttpError(400,'S?n ph?m kh?ng thu?c h?a ??n n?y');
  if(refundCents<=0)throw new HttpError(400,'S? ti?n ho?n tr? ph?i l?n h?n 0');
  const [[totals]]=await c.execute('SELECT COALESCE(SUM(quantity),0) quantity,COALESCE(SUM(returned_quantity),0) returned FROM stock_document_items WHERE organization_id=? AND document_id=?',[req.organizationId,id]);
  const status=Number(totals.returned)>=Number(totals.quantity)-1e-9?'FULL_RETURNED':'PARTIAL_RETURNED';
  const amount=refundCents/100,cost=costCents/100;
  await c.execute('UPDATE stock_documents SET returned_amount=returned_amount+?,returned_cost=returned_cost+?,return_status=?,return_reason=?,returned_at=UTC_TIMESTAMP() WHERE id=? AND organization_id=?',[amount,cost,status,data.reason,id,req.organizationId]);
  await c.execute("INSERT INTO sale_payments(organization_id,document_id,method,payment_type,status,amount) VALUES (?,?,?,'REFUND','REFUNDED',?)",[req.organizationId,id,doc.payment_method||'CASH',-amount]);
  await c.execute("INSERT INTO audit_logs(user_id,organization_id,event_type,status,details) VALUES (?,?,'SALE_RETURN','SUCCESS',?)",[req.user.id,req.organizationId,JSON.stringify({document_id:id,branch_id:doc.branch_id,reason:data.reason,refund_amount:amount,refund_cost:cost,items:data.items})]);
  return {id,refund_amount:amount,refund_cost:cost,return_status:status};
 });res.json(result);
}));

router.post('/payments/webhook/bank-transfer',asyncRoute(async(req,res)=>{
 const secret=process.env.BANK_WEBHOOK_SECRET||'';
 const supplied=String(req.get('x-api-key')||'');
 if(secret.length<32||supplied.length!==secret.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(secret)))throw new HttpError(401,'Invalid webhook credentials');
 const data=z.object({document_id:positiveId,amount:price,reference:z.string().trim().min(1).max(120),transaction_id:z.string().trim().min(1).max(120)}).strict().parse(req.body);
 const result=await transaction(async c=>{
  const [rows]=await c.execute("SELECT id,branch_id,total,payment_status,order_status FROM stock_documents WHERE id=? AND type='SALE' AND payment_method='BANK_TRANSFER' FOR UPDATE",[data.document_id]);
  if(!rows.length)throw new HttpError(404,'Payment order not found');const doc=rows[0];
  if(doc.order_status==='CANCELLED')throw new HttpError(409,'Payment order was cancelled');
  const normalizedReference=String(data.reference).replace(/[\u0110\u0111]/g,'D').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const orderCode=normalizedReference.match(/(?:^|[^A-Z0-9])[A-Z]{2,4}-(\d+)(?:$|[^0-9])/);
  if(orderCode?.[1]!==String(doc.id)||Math.round(Number(doc.total)*100)!==Math.round(data.amount*100))throw new HttpError(409,'Payment reference or amount does not match');
  if(doc.payment_status==='PAID')return {id:doc.id,replayed:true,payment_status:'PAID',order_status:'COMPLETED'};
  await c.execute("UPDATE stock_documents SET payment_status='PAID',order_status='COMPLETED',completed_at=UTC_TIMESTAMP() WHERE id=?",[doc.id]);
  await c.execute('UPDATE stock_document_items i JOIN inventory_balances b ON b.organization_id=i.organization_id AND b.branch_id=? AND b.product_id=i.product_id SET i.unit_cost=b.average_cost WHERE i.organization_id=(SELECT organization_id FROM stock_documents WHERE id=?) AND i.document_id=?',[doc.branch_id,doc.id,doc.id]);
  await c.execute("UPDATE sale_payments SET status='PAID',confirmed_at=UTC_TIMESTAMP() WHERE document_id=? AND organization_id=(SELECT organization_id FROM stock_documents WHERE id=?)",[doc.id,doc.id]);
  await c.execute("INSERT INTO audit_logs(organization_id,branch_id,event_type,severity,status,details) VALUES ((SELECT organization_id FROM stock_documents WHERE id=?),?,'BANK_PAYMENT_WEBHOOK','LOW','SUCCESS',?)",[doc.id,doc.branch_id,JSON.stringify({document_id:doc.id,transaction_id:data.transaction_id})]);
  return {id:doc.id,replayed:false,payment_status:'PAID',order_status:'COMPLETED'};
 });res.json(result);
}));

// 1. NGHIỆP VỤ KIỂM KÊ & ĐIỀU CHỈNH KHO (STOCKTAKE / ADJUSTMENT)
router.post('/adjustments', requireRoles('OWNER','MANAGER','INVENTORY'), asyncRoute(async(req,res)=>{
  const data = adjustmentSchema.parse(req.body);
  data.items.sort((a,b)=>a.product_id - b.product_id);
  await assertBranch(req.user, data.branch_id, ['MANAGER','INVENTORY']);
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const org = req.organizationId;
  const replay = await existing(org, 'ADJUSTMENT', data.request_key, hash);
  if(replay) return res.json(replay);

  let result;
  try {
    result = await transaction(async c => {
      await assertBranch(req.user, data.branch_id, ['MANAGER','INVENTORY'], c);
      const [doc] = await c.execute(
        'INSERT INTO stock_documents(organization_id,branch_id,type,request_key,payload_hash,performed_by,total,note) VALUES (?,?,?,?,?,?,0,?)',
        [org, data.branch_id, 'ADJUSTMENT', data.request_key, hash, req.user.id, data.note ?? null]
      );
      let totalValueCents = 0;
      for(const item of data.items){
        const [products] = await c.execute(
          "SELECT id,sku,name,cost_price,sale_price FROM products WHERE id=? AND organization_id=? AND status='ACTIVE' FOR UPDATE",
          [item.product_id, org]
        );
        if(!products.length) throw new HttpError(404, 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh');
        const p = products[0];

        await c.execute(
          'INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity',
          [org, data.branch_id, p.id]
        );
        const [[balance]] = await c.execute(
          'SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',
          [org, data.branch_id, p.id]
        );
        const systemQty = balance.quantity;
        const actualQty = item.actual_quantity;
        const variance = actualQty - systemQty;
        const unit = Number(p.cost_price || p.sale_price || 0);
        const unitCents = Math.round(unit * 100);
        const varianceCents = Math.abs(variance) * unitCents;
        totalValueCents += varianceCents;

        await c.execute(
          'UPDATE inventory_balances SET quantity=? WHERE organization_id=? AND branch_id=? AND product_id=?',
          [actualQty, org, data.branch_id, p.id]
        );
        await c.execute(
          'INSERT INTO stock_document_items(organization_id,document_id,product_id,sku,product_name,quantity,system_quantity,actual_quantity,variance,unit_price,line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [org, doc.insertId, p.id, p.sku, p.name, actualQty, systemQty, actualQty, variance, unit, varianceCents / 100]
        );
        await c.execute(
          'INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after) VALUES (?,?,?,?,?,?)',
          [org, data.branch_id, p.id, doc.insertId, variance, actualQty]
        );
      }
      const totalAmount = totalValueCents / 100;
      await c.execute(
        'UPDATE stock_documents SET total=? WHERE id=? AND organization_id=?',
        [totalAmount, doc.insertId, org]
      );
      return { id: doc.insertId, total: totalAmount, type: 'ADJUSTMENT', replayed: false };
    });
  } catch(e) {
    if(e.code === 'ER_DUP_ENTRY'){
      result = await existing(org, 'ADJUSTMENT', data.request_key, hash);
      if(!result) throw e;
    } else throw e;
  }
  res.status(result.replayed ? 200 : 201).json(result);
}));

// 2. NGHIỆP VỤ ĐIỀU CHUYỂN KHO (STOCK TRANSFER)
router.post('/transfers', requireRoles('OWNER','MANAGER','INVENTORY'), asyncRoute(async(req,res)=>{
  const data = transferSchema.parse(req.body);
  data.items.sort((a,b)=>a.product_id - b.product_id);
  await assertBranch(req.user, data.source_branch_id, ['MANAGER','INVENTORY']);
  await assertBranch(req.user, data.destination_branch_id, ['MANAGER','INVENTORY']);
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const org = req.organizationId;
  const replay = await existing(org, 'TRANSFER', data.request_key, hash);
  if(replay) return res.json(replay);

  let result;
  try {
    result = await transaction(async c => {
      await assertBranch(req.user, data.source_branch_id, ['MANAGER','INVENTORY'], c);
      await assertBranch(req.user, data.destination_branch_id, ['MANAGER','INVENTORY'], c);
      const [doc] = await c.execute(
        'INSERT INTO stock_documents(organization_id,branch_id,destination_branch_id,type,request_key,payload_hash,performed_by,total,note) VALUES (?,?,?,?,?,?,?,0,?)',
        [org, data.source_branch_id, data.destination_branch_id, 'TRANSFER', data.request_key, hash, req.user.id, data.note ?? null]
      );
      let totalValueCents = 0;
      for(const item of data.items){
        const [products] = await c.execute(
          "SELECT id,sku,name,cost_price,sale_price FROM products WHERE id=? AND organization_id=? AND status='ACTIVE' FOR UPDATE",
          [item.product_id, org]
        );
        if(!products.length) throw new HttpError(404, 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh');
        const p = products[0];

        // 1. Kiểm tra tồn chi nhánh nguồn
        await c.execute(
          'INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity',
          [org, data.source_branch_id, p.id]
        );
        const [[sourceBal]] = await c.execute(
          'SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',
          [org, data.source_branch_id, p.id]
        );
        if(sourceBal.quantity < item.quantity){
          throw new HttpError(409, `Không đủ tồn kho tại chi nhánh xuất: ${p.sku} (Tồn khả dụng: ${sourceBal.quantity}, Yêu cầu xuất: ${item.quantity})`);
        }

        // 2. Tồn chi nhánh đích
        await c.execute(
          'INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE quantity=quantity',
          [org, data.destination_branch_id, p.id]
        );
        const [[destBal]] = await c.execute(
          'SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',
          [org, data.destination_branch_id, p.id]
        );

        const sourceNext = sourceBal.quantity - item.quantity;
        const destNext = destBal.quantity + item.quantity;
        const unit = Number(p.cost_price || p.sale_price || 0);
        const unitCents = Math.round(unit * 100);
        const lineTotalCents = item.quantity * unitCents;
        totalValueCents += lineTotalCents;

        // Cập nhật số dư 2 kho
        await c.execute(
          'UPDATE inventory_balances SET quantity=? WHERE organization_id=? AND branch_id=? AND product_id=?',
          [sourceNext, org, data.source_branch_id, p.id]
        );
        await c.execute(
          'UPDATE inventory_balances SET quantity=? WHERE organization_id=? AND branch_id=? AND product_id=?',
          [destNext, org, data.destination_branch_id, p.id]
        );

        // Ghi stock_document_items
        await c.execute(
          'INSERT INTO stock_document_items(organization_id,document_id,product_id,sku,product_name,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?,?,?)',
          [org, doc.insertId, p.id, p.sku, p.name, item.quantity, unit, lineTotalCents / 100]
        );

        // Ghi 2 biến động đối ứng vào inventory_movements
        await c.execute(
          'INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after) VALUES (?,?,?,?,?,?)',
          [org, data.source_branch_id, p.id, doc.insertId, -item.quantity, sourceNext]
        );
        await c.execute(
          'INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after) VALUES (?,?,?,?,?,?)',
          [org, data.destination_branch_id, p.id, doc.insertId, item.quantity, destNext]
        );
      }
      const totalAmount = totalValueCents / 100;
      await c.execute(
        'UPDATE stock_documents SET total=? WHERE id=? AND organization_id=?',
        [totalAmount, doc.insertId, org]
      );
      return { id: doc.insertId, total: totalAmount, type: 'TRANSFER', replayed: false };
    });
  } catch(e) {
    if(e.code === 'ER_DUP_ENTRY'){
      result = await existing(org, 'TRANSFER', data.request_key, hash);
      if(!result) throw e;
    } else throw e;
  }
  res.status(result.replayed ? 200 : 201).json(result);
}));

router.post('/sales/:id/confirm-payment',requireRoles('OWNER','MANAGER','CASHIER'),asyncRoute(async(req,res)=>{
 const id=positiveId.parse(req.params.id);
 const result=await transaction(async c=>{
  const [rows]=await c.execute("SELECT id,branch_id,total,payment_method,payment_status,order_status FROM stock_documents WHERE id=? AND organization_id=? AND type='SALE' FOR UPDATE",[id,req.organizationId]);
  if(!rows.length)throw new HttpError(404,'Không tìm thấy hóa đơn');
  await assertBranch(req.user,rows[0].branch_id,['MANAGER','CASHIER'],c);
  if(rows[0].order_status==='CANCELLED')throw new HttpError(409,'Order is cancelled');
  if(rows[0].order_status==='OPEN'&&rows[0].payment_method==='CASH'){
   await c.execute("UPDATE stock_documents SET order_status='COMPLETED',payment_status='PAID',completed_at=UTC_TIMESTAMP() WHERE id=? AND organization_id=?",[id,req.organizationId]);
   await c.execute('UPDATE stock_document_items i JOIN inventory_balances b ON b.organization_id=i.organization_id AND b.branch_id=? AND b.product_id=i.product_id SET i.unit_cost=b.average_cost WHERE i.organization_id=? AND i.document_id=?',[rows[0].branch_id,req.organizationId,id]);
   await c.execute("INSERT INTO sale_payments(organization_id,document_id,method,status,amount) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE status='PAID'",[req.organizationId,id,'CASH','PAID',rows[0].total]);
   return {id,payment_status:'PAID',order_status:'COMPLETED',replayed:false};
  }
  if(rows[0].payment_method!=='BANK_TRANSFER')throw new HttpError(400,'Hóa đơn không sử dụng chuyển khoản');
  if(rows[0].payment_status==='PAID')return {id,payment_status:'PAID',order_status:'COMPLETED',replayed:true};
  await c.execute("UPDATE stock_documents SET payment_status='PAID',order_status='COMPLETED',completed_at=UTC_TIMESTAMP() WHERE id=? AND organization_id=?",[id,req.organizationId]);
  await c.execute('UPDATE stock_document_items i JOIN inventory_balances b ON b.organization_id=i.organization_id AND b.branch_id=? AND b.product_id=i.product_id SET i.unit_cost=b.average_cost WHERE i.organization_id=? AND i.document_id=?',[rows[0].branch_id,req.organizationId,id]);
  await c.execute("UPDATE sale_payments SET status='PAID',confirmed_by=?,confirmed_at=UTC_TIMESTAMP() WHERE document_id=? AND organization_id=?",[req.user.id,id,req.organizationId]);
  await c.execute("INSERT INTO audit_logs(user_id,organization_id,branch_id,event_type,severity,status,details) VALUES (?,?,?,'SALE_PAYMENT_CONFIRMED','LOW','SUCCESS',?)",[req.user.id,req.organizationId,rows[0].branch_id,JSON.stringify({document_id:id,method:'BANK_TRANSFER'})]);
  return {id,payment_status:'PAID',order_status:'COMPLETED',replayed:false};
 });
 res.json(result);
}));

function documentFilters(user,query,type){
 const {sql:base,values,q,calendar}=filters(user,query);
 let sql=base;
 if(type){
   sql += ' AND d.type=?';
   values.push(type);
 }
 if(q.category_id||q.product_id){
  sql+=' AND EXISTS(SELECT 1 FROM stock_document_items item JOIN products product ON product.id=item.product_id AND product.organization_id=item.organization_id WHERE item.document_id=d.id AND item.organization_id=d.organization_id';
  if(q.category_id){sql+=' AND product.category_id=?';values.push(q.category_id);}
  if(q.product_id){sql+=' AND item.product_id=?';values.push(q.product_id);}
  sql+=')';
 }
 return {sql,values,q,calendar};
}

// 3. DANH SÁCH TỔNG HỢP & CHI TIẾT NGHIỆP VỤ KHO (/stock-operations)
router.get('/stock-operations', requireRoles('OWNER','MANAGER','INVENTORY'), asyncRoute(async(req,res)=>{
  const {sql:base, values, q, calendar} = filters(req.user, req.query);
  let sql = base;
  if(req.query.type && ['ADJUSTMENT','TRANSFER'].includes(req.query.type)){
    sql += ' AND d.type=?';
    values.push(req.query.type);
  } else {
    sql += " AND d.type IN ('ADJUSTMENT','TRANSFER')";
  }
  if(q.category_id || q.product_id){
    sql += ' AND EXISTS(SELECT 1 FROM stock_document_items item JOIN products product ON product.id=item.product_id AND product.organization_id=item.organization_id WHERE item.document_id=d.id AND item.organization_id=d.organization_id';
    if(q.category_id){ sql += ' AND product.category_id=?'; values.push(q.category_id); }
    if(q.product_id){ sql += ' AND item.product_id=?'; values.push(q.product_id); }
    sql += ')';
  }

  const result = await readSnapshot(async c => {
    const [[count]] = await c.execute(`SELECT COUNT(*) total FROM stock_documents d WHERE ${sql}`, values);
    const [items] = await c.execute(`SELECT d.id, d.branch_id, d.destination_branch_id, b.name branch_name, b2.name destination_branch_name, d.total, d.created_at, d.note, d.type, u.full_name performed_by_name FROM stock_documents d JOIN branches b ON b.organization_id=d.organization_id AND b.id=d.branch_id LEFT JOIN branches b2 ON b2.organization_id=d.organization_id AND b2.id=d.destination_branch_id JOIN users u ON u.id=d.performed_by AND u.organization_id=d.organization_id WHERE ${sql} ORDER BY d.id DESC LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`, values);
    return { items, total: count.total, page: q.page, calendar };
  });
  res.json(result);
}));

router.get('/stock-operations/:id', requireRoles('OWNER','MANAGER','INVENTORY'), asyncRoute(async(req,res)=>{
  const id = positiveId.parse(req.params.id);
  const [rows] = await pool.execute(`SELECT d.*, b.name branch_name, b.address branch_address, b.phone branch_phone, b2.name destination_branch_name, b2.address destination_branch_address, o.name organization_name, u.full_name performed_by_name FROM stock_documents d JOIN branches b ON b.id=d.branch_id AND b.organization_id=d.organization_id LEFT JOIN branches b2 ON b2.id=d.destination_branch_id AND b2.organization_id=d.organization_id JOIN organizations o ON o.id=d.organization_id JOIN users u ON u.id=d.performed_by AND u.organization_id=d.organization_id WHERE d.id=? AND d.organization_id=?`, [id, req.organizationId]);
  if(!rows.length) throw new HttpError(404, 'Không tìm thấy chứng từ');
  await assertBranch(req.user, rows[0].branch_id);
  const [items] = await pool.execute(`SELECT product_id, sku, product_name, quantity, unit_price, discount_type, discount_value, discount_amount, line_total, returned_quantity, system_quantity, actual_quantity, variance FROM stock_document_items WHERE document_id=? AND organization_id=?`, [id, req.organizationId]);
  const { request_key, payload_hash, ...document } = rows[0];
  res.json({ document, items, calendar: calendarMetadata() });
}));

// Route theo từng type riêng biệt
for(const [path,type] of [['receipts','RECEIPT'],['sales','SALE'],['adjustments','ADJUSTMENT'],['transfers','TRANSFER']]){
 router.get('/'+path,requireRoles(...(type==='SALE'?['OWNER','MANAGER','CASHIER']:['OWNER','MANAGER','INVENTORY'])),asyncRoute(async(req,res)=>{
  const {sql,values,q,calendar}=documentFilters(req.user,req.query,type);
  const result=await readSnapshot(async c=>{
  const [[count]]=await c.execute(`SELECT COUNT(*) total FROM stock_documents d WHERE ${sql}`,values);
  const [items]=await c.execute(`SELECT d.id,d.branch_id,d.destination_branch_id,b.name branch_name,b2.name destination_branch_name,d.total,d.created_at,d.note,d.type,d.return_status,d.payment_status,d.order_status FROM stock_documents d JOIN branches b ON b.organization_id=d.organization_id AND b.id=d.branch_id LEFT JOIN branches b2 ON b2.organization_id=d.organization_id AND b2.id=d.destination_branch_id WHERE ${sql} ORDER BY d.id DESC LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`,values);
  return {items,total:count.total,page:q.page,calendar};
  });res.json(result);
 }));
 router.get('/'+path+'/:id',requireRoles(...(type==='SALE'?['OWNER','MANAGER','CASHIER']:['OWNER','MANAGER','INVENTORY'])),asyncRoute(async(req,res)=>{
  const id=positiveId.parse(req.params.id);
  const [rows]=await pool.execute('SELECT d.*,b.name branch_name,b.address branch_address,b.phone branch_phone,b.bank_bin,b.bank_code,b.bank_account_number,b.bank_account_name,b.static_qr_url,b2.name destination_branch_name,b2.address destination_branch_address,o.name organization_name,u.full_name performed_by_name,c.name customer_name,c.phone customer_phone FROM stock_documents d JOIN branches b ON b.id=d.branch_id AND b.organization_id=d.organization_id LEFT JOIN branches b2 ON b2.id=d.destination_branch_id AND b2.organization_id=d.organization_id JOIN organizations o ON o.id=d.organization_id JOIN users u ON u.id=d.performed_by AND u.organization_id=d.organization_id LEFT JOIN customers c ON c.id=d.customer_id AND c.organization_id=d.organization_id WHERE d.id=? AND d.organization_id=? AND d.type=?',[id,req.organizationId,type]);
  if(!rows.length)throw new HttpError(404,'Không tìm thấy chứng từ');
  await assertBranch(req.user,rows[0].branch_id);
  const canViewCost=['OWNER','MANAGER'].includes(req.user.role);
  const [items]=await pool.execute(`SELECT i.product_id,i.sku,i.product_name,i.quantity,i.unit_price,i.discount_type,i.discount_value,i.discount_amount,i.line_total,i.returned_quantity${canViewCost?',i.unit_cost':''},i.system_quantity,i.actual_quantity,i.variance,p.status product_status FROM stock_document_items i LEFT JOIN products p ON p.id=i.product_id AND p.organization_id=i.organization_id WHERE i.document_id=? AND i.organization_id=?`,[id,req.organizationId]);
  const {request_key,payload_hash,...document}=rows[0];
  if(canViewCost){document.total_cogs=items.reduce((sum,item)=>sum+Number(item.unit_cost||0)*(Number(item.quantity||0)-Number(item.returned_quantity||0)),0);document.gross_profit=Number(document.total)-Number(document.returned_amount||0)-document.total_cogs;}
  let payment_qr_url=null;
  const payment_reference=vietQrPaymentReference(document.organization_name,id);
  if(type==='SALE'&&document.payment_method==='BANK_TRANSFER'&&document.bank_bin&&document.bank_account_number){
   const bank=document.bank_bin,account=document.bank_account_number,addInfo=payment_reference;
   payment_qr_url=`https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(account)}-compact2.png?amount=${encodeURIComponent(Number(document.total))}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(document.bank_account_name||'')}`;
  }else if(type==='SALE'&&document.payment_method==='BANK_TRANSFER'&&document.static_qr_url)payment_qr_url=document.static_qr_url;
  const {bank_bin,bank_code,bank_account_number,bank_account_name,static_qr_url,...safeDocument}=document;
  res.json({document:safeDocument,items,payment_qr_url,payment_configured:Boolean(bank_bin&&bank_account_number),payment_reference,calendar:calendarMetadata()});
 }));
}

router.get('/inventory',requireRoles('OWNER','MANAGER','INVENTORY'),asyncRoute(async(req,res)=>{
 const q=period.parse(req.query),args=[req.organizationId];let where='i.organization_id=?'+branchClause(req.user,'i',args);
 if(q.branch_id){where+=' AND i.branch_id=?';args.push(q.branch_id);}if(q.category_id){where+=' AND p.category_id=?';args.push(q.category_id);}if(q.product_id){where+=' AND p.id=?';args.push(q.product_id);}if(q.q){where+=' AND (p.sku LIKE ? OR p.name LIKE ?)';args.push('%'+q.q+'%','%'+q.q+'%');}
 const from='FROM inventory_balances i JOIN products p ON p.organization_id=i.organization_id AND p.id=i.product_id JOIN branches b ON b.organization_id=i.organization_id AND b.id=i.branch_id';
 const [[[count]],settings]=await Promise.all([
  pool.execute(`SELECT COUNT(*) total ${from} WHERE ${where}`,args),
  getSettings('USER',req.user.id)
 ]);
 const threshold=Number(settings.operations?.lowStockThreshold??10);
 const limitClause=q.all?'':`LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`;
 const [items]=await pool.execute(`SELECT i.*,p.sku,p.name,b.name branch_name,p.category_id,JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.min_stock')) AS min_stock,COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.min_stock')) AS DECIMAL(14,2)),?) AS alert_threshold ${from} WHERE ${where} ORDER BY i.quantity ASC,p.id ${limitClause}`,[threshold,...args]);
 res.json({items,total:count.total,page:q.page,source:'OPERATIONAL',as_of:new Date().toISOString(),calendar:calendarMetadata({},'inventory_balances.updated_at'),valuation:{value:null,reason:'Chưa có phương pháp định giá tồn kho đã xác nhận'}});
}));

router.get('/inventory/movements',requireRoles('OWNER','MANAGER','INVENTORY'),asyncRoute(async(req,res)=>{
 const {sql,values,q,calendar}=filters(req.user,req.query,'d');let where=sql;
 if(q.product_id){where+=' AND m.product_id=?';values.push(q.product_id);}if(q.category_id){where+=' AND p.category_id=?';values.push(q.category_id);}
 const [items]=await pool.execute(`SELECT m.*,d.created_at AS document_created_at,p.sku,p.name,b.name branch_name,d.type FROM inventory_movements m JOIN products p ON p.id=m.product_id AND p.organization_id=m.organization_id JOIN branches b ON b.id=m.branch_id AND b.organization_id=m.organization_id JOIN stock_documents d ON d.id=m.document_id AND d.organization_id=m.organization_id WHERE ${where} ORDER BY m.id DESC LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`,values);
 res.json({items,source:'OPERATIONAL',calendar});
}));

router.get('/inventory/balances',requireRoles('OWNER','MANAGER','CASHIER','INVENTORY'),asyncRoute(async(req,res)=>{
 const q=period.parse(req.query),args=[req.organizationId];let where='i.organization_id=?'+branchClause(req.user,'i',args);
 const branchId=q.branch_id||q.branchId;
 if(branchId){where+=' AND i.branch_id=?';args.push(branchId);}
 if(q.product_id){where+=' AND i.product_id=?';args.push(q.product_id);}
 const [items]=await pool.execute(`SELECT i.product_id,i.branch_id,i.quantity,i.quantity AS stock,i.quantity AS on_hand,i.quantity AS stock_quantity,p.sku,p.name FROM inventory_balances i JOIN products p ON p.organization_id=i.organization_id AND p.id=i.product_id WHERE ${where}`,args);
 res.json({items,total:items.length});
}));

export default router;
