import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncRoute, HttpError } from '../utils/http.js';
import { requireRoles } from '../middlewares/auth.js';
import { z } from 'zod';
import { unlockUserAccount } from '../services/aiSecurityGuard.js';
import { generatePlatformNotificationDigests } from '../services/notificationDigests.js';
import {getSettings,saveSettings} from '../services/appSettings.js';
import {transaction} from '../business/common.js';
import os from 'node:os';
import {getDigestSchedulerStatus} from '../services/digestScheduler.js';
import {verifyDatabase} from '../db/pool.js';
const router=Router();
router.use(requireRoles('PLATFORM_ADMIN'));
const positivePathId=(value,message='ID không hợp lệ')=>{
 const id=Number(value);
 if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,message);
 return id;
};
const platformPrefs=z.object({maintenance:z.boolean().optional(),aiChatLimit:z.number().int().min(1).max(120).optional(),auditEnabled:z.boolean().optional(),general:z.object({theme:z.enum(['light','dark','system']).optional(),sound:z.boolean().optional(),numberFormat:z.enum(['vi-VN','en-US']).optional(),timezone:z.string().max(80).optional()}).optional()}).strict();
router.get('/settings',asyncRoute(async(req,res)=>res.json(await getSettings('PLATFORM','global'))));
router.put('/settings',asyncRoute(async(req,res)=>{
 const input=platformPrefs.parse(req.body),current=await getSettings('PLATFORM','global');
 res.json(await saveSettings('PLATFORM','global',{...current,...input}));
}));
router.get('/dashboard',asyncRoute(async(req,res)=>{
  const [[organizations]]=await pool.execute("SELECT COUNT(*) total,SUM(status='ACTIVE') active,SUM(status='DISABLED') disabled FROM organizations");
  const [users]=await pool.execute("SELECT role,COUNT(*) total FROM users WHERE role IN ('OWNER','MANAGER','CASHIER') GROUP BY role");
  const [[products]]=await pool.execute("SELECT COUNT(*) total FROM products WHERE status='ACTIVE'");
  const [[documents]]=await pool.execute("SELECT COUNT(*) invoices,COALESCE(SUM(total),0) revenue FROM stock_documents WHERE type='SALE'");
  const userCounts=Object.fromEntries(users.map(row=>[row.role,Number(row.total)]));
  res.json({organizations:{total:Number(organizations.total||0),active:Number(organizations.active||0),disabled:Number(organizations.disabled||0)},users:{total:Object.values(userCounts).reduce((a,b)=>a+b,0),byRole:{OWNER:userCounts.OWNER||0,MANAGER:userCounts.MANAGER||0,CASHIER:userCounts.CASHIER||0}},products:{active:Number(products.total||0)},invoices:{total:Number(documents.invoices||0),revenue:Number(documents.revenue||0)}});
}));
router.get('/notification-digests',asyncRoute(async(req,res)=>{
 const [items]=await pool.execute('SELECT id,digest_type,period_key,title,body,read_at,created_at FROM platform_notification_digests WHERE user_id=? ORDER BY created_at DESC LIMIT 20',[req.user.id]);
 res.json({items:items.map(item=>({...item,body:typeof item.body==='string'?JSON.parse(item.body):item.body}))});
}));
router.post('/notification-digests/run',asyncRoute(async(req,res)=>{
 const input=z.object({type:z.enum(['DAILY','MONTHLY']),period:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).strict().parse(req.body);
 const date=input.period?new Date(`${input.period}T00:00:00Z`):new Date();if(Number.isNaN(date.getTime()))throw new HttpError(400,'Invalid period');
 const result=await generatePlatformNotificationDigests({userId:req.user.id,type:input.type,period:input.period||date.toISOString().slice(0,10)});
 res.status(201).json(result);
}));
router.get('/organizations',asyncRoute(async(req,res)=>{
  const [rows]=await pool.execute(`SELECT o.id,o.name,o.status,o.created_at,
    (SELECT email FROM users WHERE organization_id=o.id AND role='OWNER' LIMIT 1) AS owner_email,
    (SELECT COUNT(*) FROM branches WHERE organization_id=o.id) AS branch_count,
    (SELECT COUNT(*) FROM users WHERE organization_id=o.id AND role IN ('OWNER','MANAGER','CASHIER')) AS user_count,
    (SELECT COUNT(*) FROM products WHERE organization_id=o.id AND status='ACTIVE') AS product_count
    FROM organizations o ORDER BY o.created_at DESC`);
  res.json({organizations:rows});
}));
router.patch('/organizations/:id/status',asyncRoute(async(req,res)=>{
  const id=positivePathId(req.params.id,'ID tổ chức không hợp lệ');
  const {status}=z.object({status:z.enum(['ACTIVE','DISABLED'])}).parse(req.body);
  const [result]=await pool.execute('UPDATE organizations SET status=? WHERE id=?',[status,id]);
  if(!result.affectedRows) throw new HttpError(404,'Không tìm thấy tổ chức');
  res.json({message:'Đã cập nhật trạng thái'});
}));
router.get('/tickets',asyncRoute(async(req,res)=>{
  const [threads]=await pool.execute(`SELECT t.id,t.id thread_id,t.organization_id,t.user_id,t.category,t.web_request_status status,
    t.web_form_submitted,'Website / App design request' subject,
    COALESCE((SELECT m.content FROM support_messages m WHERE m.thread_id=t.id AND m.message_type='WEB_INTAKE_SUBMISSION' ORDER BY m.id DESC LIMIT 1), '') message,
    t.created_at,u.full_name user_name,u.email user_email,o.name org_name
    FROM support_threads t JOIN users u ON u.id=t.user_id JOIN organizations o ON o.id=t.organization_id
    WHERE t.thread_type='ADMIN_SUPPORT' AND t.category='WEB_DESIGN' AND t.web_form_submitted=1 ORDER BY t.last_message_at DESC LIMIT 200`);
  const tickets=threads.map(row=>({...row,id:`thread:${row.id}`,legacy:false,category:'ONLINE_WEB_REQUEST',request_status:row.status||'NEW'}));
  res.json({tickets});
}));
router.post('/tickets/:id/conversation',asyncRoute(async(req,res)=>{
 const id=positivePathId(req.params.id,'ID phiếu không hợp lệ');
 const [rows]=await pool.execute(`SELECT t.*,u.full_name user_name,o.name org_name FROM support_tickets t
  JOIN users u ON u.id=t.user_id LEFT JOIN organizations o ON o.id=t.organization_id WHERE t.id=?`,[id]);
 const ticket=rows[0];if(!ticket)throw new HttpError(404,'Không tìm thấy phiếu hỗ trợ');
 let threadId=ticket.support_thread_id;
 if(!threadId){
  const ticketStatus=ticket.status==='IN_PROGRESS'?'IN_PROGRESS':ticket.status==='OPEN'?'OPEN':'RESOLVED';
  const requestStatus=ticket.status==='IN_PROGRESS'?'IN_PROGRESS':ticket.status==='OPEN'?'NEW':'COMPLETED';
  await transaction(async connection=>{
   const [existing]=await connection.execute("SELECT id FROM support_threads WHERE thread_type='ADMIN_SUPPORT' AND user_id=? LIMIT 1 FOR UPDATE",[ticket.user_id]);
   if(existing.length)threadId=existing[0].id;
   else {const [created]=await connection.execute("INSERT INTO support_threads(organization_id,thread_type,user_id,subject,category,status,web_request_status) VALUES (?,'ADMIN_SUPPORT',?,?,?,'OPEN',?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",[ticket.organization_id,ticket.user_id,ticket.subject,ticket.category==='ONLINE_WEB_REQUEST'?'WEB_DESIGN':'GENERAL',ticket.category==='ONLINE_WEB_REQUEST'?requestStatus:null]);threadId=created.insertId;}
   await connection.execute("UPDATE support_threads SET category=IF(?='WEB_DESIGN','WEB_DESIGN',category),web_request_status=IF(?='WEB_DESIGN',? ,web_request_status),status=? WHERE id=?",[ticket.category==='ONLINE_WEB_REQUEST'?'WEB_DESIGN':'GENERAL',ticket.category==='ONLINE_WEB_REQUEST'?'WEB_DESIGN':'GENERAL',requestStatus,ticketStatus,threadId]);
   await connection.execute('INSERT INTO support_messages(thread_id,sender_user_id,sender_role,content) VALUES (?,? ,\'USER\',?)',[threadId,ticket.user_id,`${ticket.subject}\n\n${ticket.message}`]);
   await connection.execute("UPDATE support_threads SET last_message_at=UTC_TIMESTAMP(3),unread_admin_count=unread_admin_count+1 WHERE id=?",[threadId]);
   await connection.execute('UPDATE support_tickets SET support_thread_id=? WHERE id=?',[threadId,id]);
  });
 }
 res.json({thread_id:threadId});
}));
router.patch('/tickets/:id',asyncRoute(async(req,res)=>{
  const id=positivePathId(req.params.id,'ID phiếu không hợp lệ');
  const {status,admin_note}=z.object({
    status:z.enum(['OPEN','IN_PROGRESS','RESOLVED','CLOSED']).optional(),
    admin_note:z.string().max(2000).optional()
  }).parse(req.body);
  const sets=[],vals=[];
  if(status){sets.push('status=?');vals.push(status);}
  if(admin_note!==undefined){sets.push('admin_note=?');vals.push(admin_note);}
  if(!sets.length) throw new HttpError(400,'Không có dữ liệu cập nhật');
  vals.push(id);
  await pool.execute('UPDATE support_tickets SET '+sets.join(', ')+' WHERE id=?',vals);
  res.json({message:'Đã cập nhật phiếu hỗ trợ'});
}));
router.get('/system-health',asyncRoute(async(req,res)=>{
  const backendStarted=process.hrtime.bigint();
  const mysqlStarted=process.hrtime.bigint();
  const [[dbName]]=await pool.query('SELECT DATABASE() database_name');
  if(dbName.database_name!=='retail_app')throw new Error('System metrics are restricted to retail_app');
  await verifyDatabase();
  const mysqlLatencyMs=Number(process.hrtime.bigint()-mysqlStarted)/1e6;
  const [[threads]]=await pool.query("SHOW GLOBAL STATUS LIKE 'Threads_connected'");
  const [[storage]]=await pool.query(`SELECT COUNT(*) table_count,COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0) bytes
    FROM information_schema.TABLES WHERE TABLE_SCHEMA='retail_app'`);
  const [[counts]]=await pool.query(`SELECT
    (SELECT COUNT(*) FROM stock_documents WHERE type='SALE') invoice_count,
    (SELECT COUNT(*) FROM products) product_count,
    (SELECT COUNT(*) FROM stock_documents) transaction_count`);
  const memory=process.memoryUsage(),scheduler=getDigestSchedulerStatus();
  const base=(process.env.AI_SERVICE_URL||'http://127.0.0.1:8000').replace(/\/$/,'');
  let fastapi={status:'offline',latency_ms:null,models:[]};
  const aiStarted=process.hrtime.bigint();
  try{
    const response=await fetch(base+'/health',{signal:AbortSignal.timeout(2000)});
    const elapsed=Number(process.hrtime.bigint()-aiStarted)/1e6;
    if(response.ok){
      fastapi={status:'ok',latency_ms:Number(elapsed.toFixed(2)),models:[]};
      if(process.env.AI_SERVICE_TOKEN){
        const readiness=await fetch(base+'/v1/readiness',{headers:{Authorization:`Bearer ${process.env.AI_SERVICE_TOKEN}`},signal:AbortSignal.timeout(2000)});
        if(readiness.ok){
          const data=await readiness.json();
          fastapi.models=[
            {name:'LightGBM Hybrid',status:data.models?.hybrid?.status||'UNKNOWN'},
            {name:'Stockout Classifier',status:data.models?.stockout?.status||'UNKNOWN'},
            ...Object.entries(data.algorithms||{}).map(([name,status])=>({name,status}))
          ];
        }
      }
    }
  }catch{}
  const totalMemory=os.totalmem(),freeMemory=os.freemem(),usedMemory=totalMemory-freeMemory;
  const schedulerTasks=[
    {name:'Thông báo tổng kết cuối ngày',status:scheduler.active?'ACTIVE':'STOPPED',detail:'Digest lúc 23:55 Asia/Ho_Chi_Minh'},
    {name:'Đồng bộ đơn hàng POS',status:'NOT_CONFIGURED',detail:'Chưa có scheduler trong backend'},
    {name:'Cảnh báo tồn kho',status:'NOT_CONFIGURED',detail:'Chưa có scheduler trong backend'}
  ];
  res.json({
    mysql:{status:'ok',latency_ms:Number(mysqlLatencyMs.toFixed(2)),threads_connected:Number(threads?.Value||0),storage_mb:Number((Number(storage.bytes)/1048576).toFixed(2)),table_count:Number(storage.table_count),invoice_count:Number(counts.invoice_count),product_count:Number(counts.product_count),transaction_count:Number(counts.transaction_count)},
    backend:{status:'ok',latency_ms:Number((Number(process.hrtime.bigint()-backendStarted)/1e6).toFixed(2)),uptime_seconds:Math.floor(process.uptime()),memory_rss_mb:Number((memory.rss/1048576).toFixed(1)),heap_used_mb:Number((memory.heapUsed/1048576).toFixed(1)),node_version:process.version,scheduler},
    fastapi,
    host:{total_memory_mb:Number((totalMemory/1048576).toFixed(1)),used_memory_mb:Number((usedMemory/1048576).toFixed(1)),used_memory_percent:Number((usedMemory/totalMemory*100).toFixed(1)),cpu_cores:os.cpus().length,loadavg:os.loadavg()},
    scheduler_tasks:schedulerTasks
  });
}));

// ====================================================================
// QUẢN TRỊ AN NINH & GIÁM SÁT BẢO MẬT (SECURITY MONITORING)
// ====================================================================

// 1. Thống kê an ninh tổng thể
router.get('/security/stats', asyncRoute(async (req, res) => {
  const [[eventCount]] = await pool.execute('SELECT COUNT(*) AS total FROM audit_logs');
  const [[lockedCount]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM users WHERE (is_locked=1 AND (locked_until IS NULL OR locked_until > UTC_TIMESTAMP())) OR locked_until > UTC_TIMESTAMP()'
  );
  const [[criticalCount]] = await pool.execute(
    "SELECT COUNT(*) AS total FROM audit_logs WHERE severity = 'CRITICAL'"
  );
  const [[highCount]] = await pool.execute(
    "SELECT COUNT(*) AS total FROM audit_logs WHERE severity = 'HIGH'"
  );
  const [[unreadAlerts]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM security_notifications WHERE is_read = FALSE'
  );

  const [lockedUsers] = await pool.execute(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_locked, u.locked_at, u.unlock_request_note, u.unlock_requested_at, u.locked_until, u.lock_reason, o.name AS organization_name
     FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE (u.is_locked=1 AND (u.locked_until IS NULL OR u.locked_until > UTC_TIMESTAMP())) OR u.locked_until > UTC_TIMESTAMP()
     ORDER BY COALESCE(u.locked_at,u.locked_until) DESC`
  );

  res.json({
    totalEvents: Number(eventCount?.total || 0),
    lockedUsersCount: Number(lockedCount?.total || 0),
    criticalCount: Number(criticalCount?.total || 0),
    highCount: Number(highCount?.total || 0),
    unreadAlertsCount: Number(unreadAlerts?.total || 0),
    lockedUsers,
  });
}));

// 2. Danh sách Security Logs có bộ lọc & tìm kiếm
router.get('/security/logs', asyncRoute(async (req, res) => {
  const requestedPage=Number(req.query.page),requestedLimit=Number(req.query.limit);
  const page=Math.min(1_000_000,Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1);
  const limit=Math.min(100,Math.max(10,Number.isSafeInteger(requestedLimit)&&requestedLimit>0?requestedLimit:20));
  const offset = (page - 1) * limit;

  const { search, severity, status } = req.query;

  const whereClauses = [];
  const params = [];

  if (search) {
    whereClauses.push('(a.username LIKE ? OR a.event_type LIKE ? OR CAST(a.user_id AS CHAR) = ? OR a.request_snippet LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, search, term);
  }

  if (severity && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) {
    whereClauses.push('a.severity = ?');
    params.push(severity);
  }

  if (status && ['DETECTED', 'BLOCKED', 'TEMPORARILY_LOCKED', 'RESOLVED'].includes(status)) {
    whereClauses.push('a.status = ?');
    params.push(status);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const [[countRow]] = await pool.execute(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);
  const total = Number(countRow?.total || 0);

  const [rows] = await pool.execute(
    `SELECT a.*, u.is_locked, u.locked_at, u.unlock_request_note, u.unlock_requested_at, u.locked_until, u.lock_reason, o.name AS organization_name, b.name AS branch_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN organizations o ON o.id = a.organization_id
     LEFT JOIN branches b ON b.id = a.branch_id
     ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  res.json({
    logs: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
}));

// 3. Xem lịch sử vi phạm chi tiết của một tài khoản
router.get('/security/users/:id/history', asyncRoute(async (req, res) => {
  const userId=positivePathId(req.params.id,'ID người dùng không hợp lệ');
  const [[userRow]] = await pool.execute(
    `SELECT u.id, u.email, u.full_name, u.role, u.status, u.is_locked, u.locked_at, u.unlock_request_note, u.unlock_requested_at, u.locked_until, u.lock_reason, o.name AS organization_name
     FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = ?`,
    [userId]
  );

  if (!userRow) {
    throw new HttpError(404, 'Không tìm thấy người dùng');
  }

  const [historyRows] = await pool.execute(
    `SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );

  res.json({
    user: userRow,
    isLocked: (Number(userRow.is_locked)===1 && (!userRow.locked_until || new Date(userRow.locked_until) > new Date())) || (userRow.locked_until && new Date(userRow.locked_until) > new Date()),
    history: historyRows,
  });
}));

// 4. ADMIN mở khóa thủ công cho tài khoản
router.post('/security/users/:id/unlock', asyncRoute(async (req, res) => {
  const userId=positivePathId(req.params.id,'ID người dùng không hợp lệ');
  const { reason } = z.object({
    reason: z.string().trim().min(2, 'Vui lòng cung cấp lý do mở khóa').max(255),
  }).parse(req.body);

  const [[userRow]] = await pool.execute('SELECT id, full_name, email FROM users WHERE id = ?', [userId]);
  if (!userRow) {
    throw new HttpError(404, 'Không tìm thấy tài khoản người dùng');
  }

  const success = await unlockUserAccount(userId, req.user.id, reason);
  if (!success) {
    throw new HttpError(500, 'Mở khóa tài khoản thất bại');
  }

  res.json({
    message: `Đã mở khóa thành công cho tài khoản ${userRow.full_name || userRow.email}`,
    unlockedAt: new Date().toISOString(),
  });
}));

router.post('/security/users/:id/lock', asyncRoute(async(req,res)=>{
  const userId=positivePathId(req.params.id,'ID người dùng không hợp lệ');
  const {reason}=z.object({reason:z.string().trim().min(2).max(500)}).parse(req.body);
  const [[target]]=await pool.execute('SELECT id,role FROM users WHERE id=?',[userId]);
  if(!target)throw new HttpError(404,'Không tìm thấy tài khoản');
  if(!['OWNER','MANAGER','CASHIER','INVENTORY'].includes(target.role))throw new HttpError(400,'Chỉ được khóa tài khoản người dùng cửa hàng');
  const [updated]=await pool.execute('UPDATE users SET is_locked=1,locked_at=UTC_TIMESTAMP(),locked_until=NULL,lock_reason=? WHERE id=?',[reason,userId]);
  res.json({success:Boolean(updated.affectedRows),message:'Đã khóa tạm thời tài khoản'});
}));

// 5. Danh sách thông báo an ninh cho Admin
router.get('/security/notifications', asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT * FROM security_notifications ORDER BY created_at DESC LIMIT 50`
  );
  res.json({ notifications: rows });
}));

// 6. Đánh dấu đã đọc tất cả thông báo an ninh
router.patch('/security/notifications/read-all', asyncRoute(async (req, res) => {
  await pool.execute('UPDATE security_notifications SET is_read = TRUE WHERE is_read = FALSE');
  res.json({ message: 'Đã đánh dấu đã đọc tất cả thông báo an ninh' });
}));

export default router;
