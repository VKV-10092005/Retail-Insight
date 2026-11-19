import {Router} from 'express';
import {z} from 'zod';
import {pool} from '../db/pool.js';
import {requireRoles} from '../middlewares/auth.js';
import {asyncRoute} from '../utils/http.js';

const router=Router();
const query=z.object({q:z.string().max(100).default(''),category_id:z.coerce.number().int().positive().optional(),sort:z.enum(['margin_asc','margin_desc','name']).default('name'),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(100).default(100)});

router.get('/market/price-comparison',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>{
 const q=query.parse(req.query),args=[req.organizationId],where=["p.organization_id=?","p.status='ACTIVE'"];
 if(q.q){where.push('(p.name LIKE ? OR p.sku LIKE ?)');args.push(`%${q.q}%`,`%${q.q}%`);}
 if(q.category_id){where.push('p.category_id=?');args.push(q.category_id);}
 const order=q.sort==='margin_asc'?'margin_percent ASC,p.name':q.sort==='margin_desc'?'margin_percent DESC,p.name':'p.name';
 const [[count]]=await pool.execute(`SELECT COUNT(*) total FROM products p WHERE ${where.join(' AND ')}`,args);
 const [items]=await pool.execute(`SELECT p.id,p.sku,p.name,p.category_id,c.name category_name,p.cost_price,p.sale_price,CASE WHEN p.cost_price IS NULL OR p.sale_price<=0 THEN NULL ELSE ROUND((p.sale_price-p.cost_price)/p.sale_price*100,2) END margin_percent FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.organization_id=p.organization_id WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`,args);
 res.json({items,total:Number(count.total),page:q.page,limit:q.limit,source:'RETAIL_APP'});
}));

router.get('/market/receipt-sources',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>{
 const [items]=await pool.execute(`SELECT d.id,d.branch_id,b.name branch_name,d.created_at,d.total,d.note,u.full_name performed_by,COUNT(i.id) item_count FROM stock_documents d JOIN branches b ON b.id=d.branch_id AND b.organization_id=d.organization_id JOIN users u ON u.id=d.performed_by AND u.organization_id=d.organization_id LEFT JOIN stock_document_items i ON i.document_id=d.id AND i.organization_id=d.organization_id WHERE d.organization_id=? AND d.type='RECEIPT' GROUP BY d.id,d.branch_id,b.name,d.created_at,d.total,d.note,u.full_name ORDER BY d.id DESC LIMIT 100`,[req.organizationId]);
 res.json({items,source:'RETAIL_APP_RECEIPTS',supplier_names_available:false,notice:'Lịch sử phiếu nhập hiện không lưu trường nhà cung cấp; danh sách này tham chiếu phiếu nhập thực tế, không tự suy đoán tên nhà cung cấp.'});
}));
export default router;
