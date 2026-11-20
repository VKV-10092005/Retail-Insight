import {Router} from 'express';
import {z} from 'zod';
import {pool} from '../db/pool.js';
import {requireRoles} from '../middlewares/auth.js';
import {asyncRoute,HttpError} from '../utils/http.js';
import {branchClause,transaction} from './common.js';
import {generateNotificationDigests} from '../services/notificationDigests.js';
import {getSettings} from '../services/appSettings.js';

const router=Router(),roles=['OWNER','MANAGER','INVENTORY','CASHIER','PLATFORM_ADMIN'];
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const metadata=value=>{if(!value)return{};if(typeof value==='object')return value;try{return JSON.parse(value);}catch{return{};}};

export async function upsertSupportNotification(connection,{recipientUserId,organizationId,organizationName,threadId,senderName,content}){
 const title=`Bạn có tin nhắn từ ${senderName}`,detail=JSON.stringify({thread_id:threadId,sender_name:senderName,organization_name:organizationName||''});
 const [existing]=await connection.execute("SELECT id FROM notifications WHERE recipient_user_id=? AND type='SUPPORT_CHAT' AND read_at IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.thread_id'))=? ORDER BY created_at DESC,id DESC FOR UPDATE",[recipientUserId,String(threadId)]);
 if(existing.length){
  const notificationId=existing[0].id;
  await connection.execute("UPDATE notifications SET organization_id=?,title=?,content=?,metadata=?,created_at=UTC_TIMESTAMP(3) WHERE id=?",[organizationId||null,title,content,detail,notificationId]);
  if(existing.length>1)await connection.execute(`DELETE FROM notifications WHERE id IN (${existing.slice(1).map(()=>'?').join(',')})`,existing.slice(1).map(row=>row.id));
  return {id:notificationId,created:false};
 }
 const [inserted]=await connection.execute("INSERT INTO notifications(recipient_user_id,organization_id,type,title,content,metadata) VALUES (?,?,'SUPPORT_CHAT',?,?,?)",[recipientUserId,organizationId||null,title,content,detail]);
 return {id:inserted.insertId,created:true};
}

export async function deleteSupportNotifications(connection,{recipientUserId,threadId}){
 const [result]=await connection.execute("DELETE FROM notifications WHERE recipient_user_id=? AND type='SUPPORT_CHAT' AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.thread_id'))=?",[recipientUserId,String(threadId)]);
 return result.affectedRows;
}

async function supportItems(userId){
 const [rows]=await pool.execute("SELECT id,type,title,content,metadata,read_at,created_at FROM notifications WHERE recipient_user_id=? AND type='SUPPORT_CHAT' ORDER BY created_at DESC,id DESC LIMIT 80",[userId]);
 return rows.map(row=>{const detail=metadata(row.metadata),threadId=detail.thread_id;return {id:`support:${row.id}`,kind:'SUPPORT_CHAT',title:row.title,message:row.content,href:`/support?threadId=${encodeURIComponent(threadId||'')}`,created_at:row.created_at,read:Boolean(row.read_at),thread_id:threadId,sender_name:detail.sender_name||'',organization_name:detail.organization_name||''};});
}

router.get('/notifications',requireRoles(...roles),asyncRoute(async(req,res)=>{
 const [contact,prefs]=await Promise.all([supportItems(req.user.id),req.user.role==='PLATFORM_ADMIN'?Promise.resolve(null):getSettings('USER',req.user.id)]);
 if(req.user.role==='PLATFORM_ADMIN')return res.json({items:contact,unread_count:contact.filter(item=>!item.read).length,unread_store_count:0,unread_contact_count:contact.filter(item=>!item.read).length});

 const threshold=Number(prefs.operations?.lowStockThreshold??10);
 const stockArgs=[threshold,req.organizationId],scope=branchClause(req.user,'i',stockArgs),minStock="COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.min_stock')) AS DECIMAL(14,2)),?)";
 const [stockResult,digestResult]=await Promise.all([
  pool.execute(`SELECT i.branch_id,i.product_id,i.quantity,${minStock} min_stock,i.updated_at,p.sku,p.name,b.name branch_name FROM inventory_balances i JOIN products p ON p.organization_id=i.organization_id AND p.id=i.product_id AND p.status='ACTIVE' JOIN branches b ON b.organization_id=i.organization_id AND b.id=i.branch_id AND b.status='ACTIVE' WHERE i.organization_id=? AND i.quantity<=${minStock}${scope} ORDER BY i.quantity ASC,i.updated_at DESC LIMIT 10`,[threshold,req.organizationId,threshold,...stockArgs.slice(2)]),
  pool.execute('SELECT id,digest_type,period_key,title,body,created_at,branch_id FROM notification_digests WHERE organization_id=? AND user_id=? ORDER BY created_at DESC LIMIT 40',[req.organizationId,req.user.id])
 ]);
 const stockRows=stockResult[0],digests=digestResult[0];
 const store=[...stockRows.map(row=>({id:`stock:${row.branch_id}:${row.product_id}`,kind:'LOW_STOCK',title:`Sắp hết hàng: ${row.name}`,message:`${row.branch_name} · ${row.sku} còn ${row.quantity}, ngưỡng tối thiểu ${row.min_stock}.`,href:req.user.role==='INVENTORY'?'/receipts':req.user.role==='CASHIER'?'/sales':'/alerts',created_at:row.updated_at,detail:row})),...digests.map(row=>({id:`digest:${row.id}`,kind:`${row.digest_type}_DIGEST`,title:row.title,message:row.period_key,href:'/dashboard',created_at:row.created_at,detail:typeof row.body==='string'?JSON.parse(row.body):row.body}))];
 if(store.length){const args=[req.organizationId,req.user.id,...store.map(item=>item.id)];const [reads]=await pool.execute(`SELECT notification_id FROM notification_reads WHERE organization_id=? AND user_id=? AND notification_id IN (${store.map(()=>'?').join(',')})`,args);const ids=new Set(reads.map(row=>row.notification_id));for(const item of store)item.read=ids.has(item.id);}else for(const item of store)item.read=false;
 const items=[...contact,...store].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,100),unreadStore=store.filter(item=>!item.read).length,unreadContact=contact.filter(item=>!item.read).length;
 res.json({items:items.map(({detail,...item})=>item),unread_count:unreadStore+unreadContact,unread_store_count:unreadStore,unread_contact_count:unreadContact});
}));

router.get('/notifications/:id',requireRoles(...roles),asyncRoute(async(req,res)=>{
 const match=/^digest:(\d+)$/.exec(req.params.id);if(!match||req.user.role==='PLATFORM_ADMIN')throw new HttpError(404,'Notification not found');
 const [rows]=await pool.execute('SELECT id,digest_type,period_key,title,body,created_at,branch_id FROM notification_digests WHERE id=? AND organization_id=? AND user_id=?',[match[1],req.organizationId,req.user.id]);
 if(!rows.length)throw new HttpError(404,'Notification not found');const row=rows[0];res.json({...row,body:typeof row.body==='string'?JSON.parse(row.body):row.body});
}));

router.patch('/notifications/read',requireRoles(...roles),asyncRoute(async(req,res)=>{
 const {ids}=z.object({ids:z.array(z.string().min(1).max(160)).min(1).max(100)}).strict().parse(req.body),unique=[...new Set(ids)];
 const supportIds=unique.map(id=>/^support:(\d+)$/.exec(id)?.[1]).filter(Boolean);
 if(supportIds.length)await transaction(async connection=>{
  const [rows]=await connection.execute(`SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.thread_id')) thread_id FROM notifications WHERE recipient_user_id=? AND type='SUPPORT_CHAT' AND id IN (${supportIds.map(()=>'?').join(',')})`,[req.user.id,...supportIds]);
  for(const row of rows)if(row.thread_id)await deleteSupportNotifications(connection,{recipientUserId:req.user.id,threadId:row.thread_id});
 });
 const operational=unique.filter(id=>!String(id).startsWith('support:'));
 if(operational.length){if(req.user.role==='PLATFORM_ADMIN')throw new HttpError(403,'Không có quyền');const values=operational.flatMap(id=>[req.organizationId,req.user.id,id]);await pool.execute(`INSERT INTO notification_reads(organization_id,user_id,notification_id) VALUES ${operational.map(()=>'(?,?,?)').join(',')} ON DUPLICATE KEY UPDATE read_at=COALESCE(read_at,UTC_TIMESTAMP())`,values);}
 res.json({marked_read:unique.length});
}));

router.delete('/notifications',requireRoles(...roles),asyncRoute(async(req,res)=>{
 if(req.user.role==='PLATFORM_ADMIN')throw new HttpError(403,'Không có quyền');
 const {ids}=z.object({ids:z.array(z.string().regex(/^digest:\d+$/).max(40)).min(1).max(100)}).strict().parse(req.body),nums=[...new Set(ids.map(id=>id.slice(7)))];
 await transaction(async connection=>{for(const id of nums){await connection.execute('DELETE FROM notification_digests WHERE id=? AND organization_id=? AND user_id=?',[id,req.organizationId,req.user.id]);await connection.execute('DELETE FROM notification_reads WHERE organization_id=? AND user_id=? AND notification_id=?',[req.organizationId,req.user.id,`digest:${id}`]);}});res.json({deleted:nums.length});
}));

router.post('/notifications/digests/run',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>{
 const input=z.object({type:z.enum(['DAILY','MONTHLY']),period:z.string().regex(datePattern).optional()}).strict().parse(req.body),base=input.period?new Date(`${input.period}T00:00:00Z`):new Date();
 if(Number.isNaN(base.getTime()))throw new HttpError(400,'Invalid period');
 const result=await generateNotificationDigests({organizationId:req.organizationId,userId:req.user.id,role:req.user.role,type:input.type,period:input.period||base.toISOString().slice(0,10)});
 res.status(201).json(result);
}));

export default router;
