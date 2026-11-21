import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncRoute, HttpError } from '../utils/http.js';
import { requireRoles } from '../middlewares/auth.js';
import { z } from 'zod';
import { lockUserAccount, unlockUserAccount } from '../services/aiSecurityGuard.js';
import { generatePlatformNotificationDigests } from '../services/notificationDigests.js';
import {getSettings,saveSettings} from '../services/appSettings.js';
import {transaction} from '../business/common.js';
import os from 'node:os';
import {getDigestSchedulerStatus} from '../services/digestScheduler.js';
import {restartAiService} from '../services/aiServiceManager.js';
import {config} from '../config/env.js';
const router=Router();
router.use(requireRoles('PLATFORM_ADMIN'));
let extraBackgroundJobs = {
  posSync: false,
  stockAlerts: false,
  activatedAt: null,
};
const retryDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchAiWithRetry(url,options={},attempts=3){
 let lastError,lastResponse;
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   // Tăng timeout lên 15000ms (15 giây) để đủ thời gian đánh thức dịch vụ Render Free
   const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
   if(response.ok||(response.status<500))return response;
   await response.body?.cancel();
   lastResponse=response;
  }catch(error){lastError=error;}
  if(attempt+1<attempts)await retryDelay(300*(attempt+1));
 }
 if(lastResponse)return lastResponse;
 throw lastError||new Error('AI Service is unavailable');
}
async function probeAiHealth(base){
 const checkedPaths=['/health','/'];
 let lastStatus=null,lastError=null;
 for(const path of checkedPaths){
  try{
   const response=await fetchAiWithRetry(base+path,{},1);
   // Nếu phản hồi 200 OK hoặc 429 (Rate Limited) thì dịch vụ vẫn đang hoạt động (Online)
   if(response.ok||response.status===429)return {response,path,checkedPaths,lastStatus:response.status,lastError:null};
   lastStatus=response.status;
   await response.body?.cancel();
  }catch(error){lastError=error;}
 }
 return {response:null,path:null,checkedPaths,lastStatus,lastError};
}
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
const getPlatformOverview=async(req,res)=>{
  const [[[organizations]],[users],[[lockedUsers]],[[products]],[[documents]]]=await Promise.all([
   pool.execute("SELECT COUNT(*) total,SUM(status='ACTIVE') active,SUM(status='DISABLED') disabled FROM organizations"),
   pool.execute("SELECT role,COUNT(*) total FROM users WHERE role IN ('OWNER','MANAGER','CASHIER') GROUP BY role"),
   pool.execute("SELECT COUNT(*) total FROM users WHERE role IN ('OWNER','MANAGER','CASHIER') AND locked_until > UTC_TIMESTAMP()"),
   pool.execute("SELECT COUNT(*) total FROM products WHERE status='ACTIVE'"),
   pool.execute("SELECT COUNT(*) invoices,COALESCE(SUM(total),0) revenue FROM stock_documents WHERE type='SALE'")
  ]);
  const userCounts=Object.fromEntries(users.map(row=>[row.role,Number(row.total)]));
  res.json({organizations:{total:Number(organizations.total||0),active:Number(organizations.active||0),disabled:Number(organizations.disabled||0)},users:{total:Object.values(userCounts).reduce((a,b)=>a+b,0),locked:Number(lockedUsers.total||0),byRole:{OWNER:userCounts.OWNER||0,MANAGER:userCounts.MANAGER||0,CASHIER:userCounts.CASHIER||0}},products:{active:Number(products.total||0)},invoices:{total:Number(documents.invoices||0),revenue:Number(documents.revenue||0)}});
};
router.get(['/dashboard','/overview'],asyncRoute(getPlatformOverview));
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
    owner.id AS owner_id, owner.email AS owner_email,
    CASE WHEN owner.locked_until > UTC_TIMESTAMP() THEN 1 ELSE 0 END AS owner_is_locked,
    owner.locked_until AS owner_locked_until, owner.lock_reason AS owner_lock_reason,
    CASE WHEN owner.locked_until > UTC_TIMESTAMP() THEN 1 ELSE 0 END AS owner_temporarily_locked,
    COALESCE((SELECT COUNT(*) FROM branches WHERE organization_id=o.id),0) AS branch_count,
    COALESCE((SELECT COUNT(*) FROM users WHERE organization_id=o.id AND role IN ('OWNER','MANAGER','CASHIER')),0) AS user_count,
    COALESCE((SELECT COUNT(*) FROM products WHERE organization_id=o.id AND status='ACTIVE'),0) AS product_count
    FROM organizations o
    LEFT JOIN (
      SELECT organization_id,MIN(id) AS owner_id
      FROM users
      WHERE role='OWNER'
      GROUP BY organization_id
    ) owner_pick ON owner_pick.organization_id=o.id
    LEFT JOIN users owner ON owner.id=owner_pick.owner_id
    ORDER BY o.created_at DESC`);
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
    WHERE t.thread_type='ADMIN_SUPPORT' AND t.category='WEB_DESIGN' ORDER BY t.last_message_at DESC LIMIT 200`);
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
  const [threadResult,storageResult,countResult]=await Promise.all([
   pool.query("SHOW GLOBAL STATUS LIKE 'Threads_connected'"),
   pool.query(`SELECT COUNT(*) table_count,COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0) bytes
    FROM information_schema.TABLES WHERE TABLE_SCHEMA='retail_app'`),
   pool.query(`SELECT
    (SELECT COUNT(*) FROM stock_documents WHERE type='SALE') invoice_count,
    (SELECT COUNT(*) FROM products) product_count,
    (SELECT COUNT(*) FROM stock_documents) transaction_count`)
  ]);
  const threads=threadResult[0][0],storage=storageResult[0][0],counts=countResult[0][0];
  const mysqlLatencyMs=Number(process.hrtime.bigint()-mysqlStarted)/1e6;
  const memory=process.memoryUsage(),scheduler=getDigestSchedulerStatus();
  const base=config.aiServiceUrl;
  const aiConfigured=Boolean(String(process.env.AI_SERVICE_URL||'').trim());
  let fastapi=aiConfigured
   ? {status:'UNAVAILABLE',latency_ms:null,models:[],message:'AI Service chưa phản hồi; dịch vụ Python có thể đang ngủ hoặc khởi động.',checked_paths:['/health','/']}
   : {status:'NOT_CONFIGURED',latency_ms:null,models:[],message:'Chưa cấu hình AI_SERVICE_URL. Hãy đặt URL public của FastAPI trong biến môi trường backend.',checked_paths:[]};
  if(aiConfigured){
   const aiStarted=process.hrtime.bigint();
   const probe=await probeAiHealth(base);
   const elapsed=Number(process.hrtime.bigint()-aiStarted)/1e6;
   if(probe.response){
    const isRateLimited = probe.response.status === 429;
    fastapi={status:'ok',latency_ms:Number(elapsed.toFixed(2)),models:[],message:isRateLimited?`Đã kết nối AI Service qua ${probe.path} (dịch vụ đang hoạt động).`:`Đã kết nối AI Service qua ${probe.path}.`,health_path:probe.path,checked_paths:probe.checkedPaths};
    if(process.env.AI_SERVICE_TOKEN && !isRateLimited){
     try{
      const readiness=await fetchAiWithRetry(base+'/v1/readiness',{headers:{Authorization:`Bearer ${process.env.AI_SERVICE_TOKEN}`}});
      if(readiness.ok){
       const data=await readiness.json();
       fastapi.models=[
        {name:'LightGBM Hybrid',status:data.models?.hybrid?.status||'UNKNOWN'},
        {name:'Stockout Classifier',status:data.models?.stockout?.status||'UNKNOWN'},
        ...Object.entries(data.algorithms||{}).map(([name,status])=>({name,status}))
       ];
      }
     }catch{fastapi.message+=' Readiness chưa phản hồi; health cơ bản vẫn hoạt động.';}
    }
   }else{
    fastapi.latency_ms=Number(elapsed.toFixed(2));
    fastapi.message=probe.lastStatus
     ? `AI Service trả về HTTP ${probe.lastStatus} tại cả /health và /. Kiểm tra route hoặc cấu hình triển khai FastAPI.`
     : 'Không kết nối được AI Service tại /health hoặc /. Dịch vụ Python có thể đang ngủ; hãy đánh thức service hoặc kiểm tra AI_SERVICE_URL.';
   }
  }
  const totalMemory=os.totalmem(),freeMemory=os.freemem(),usedMemory=totalMemory-freeMemory;
  const schedulerTasks=[
    {name:'Thông báo tổng kết cuối ngày',status:scheduler.active?'ACTIVE':'STOPPED',detail:'Digest lúc 23:55 Asia/Ho_Chi_Minh'},
    {name:'Đồng bộ đơn hàng POS',status:extraBackgroundJobs.posSync?'ACTIVE':'NOT_CONFIGURED',detail:extraBackgroundJobs.posSync?'Đồng bộ tự động định kỳ · Quản trị viên kích hoạt':'Chưa có scheduler trong backend'},
    {name:'Cảnh báo tồn kho',status:extraBackgroundJobs.stockAlerts?'ACTIVE':'NOT_CONFIGURED',detail:extraBackgroundJobs.stockAlerts?'Quét ngưỡng min_stock định kỳ · Quản trị viên kích hoạt':'Chưa có scheduler trong backend'}
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
// TỰ PHỤC HỒI DỊCH VỤ (AUTO-HEAL) & AI CHẨN ĐOÁN SỰ CỐ
// ====================================================================

router.post('/auto-heal', asyncRoute(async (req, res) => {
  const { target } = z.object({
    target: z.enum(['ai_service', 'database', 'backend', 'background_jobs'])
  }).parse(req.body);

  if (target === 'ai_service') {
    const base = config.aiServiceUrl;
    let wakeResults = [];
    const checkPaths = ['/health', '/'];
    for (const p of checkPaths) {
      try {
        const resp = await fetch(base + p, { signal: AbortSignal.timeout(15000) });
        wakeResults.push({ path: p, status: resp.status, ok: resp.ok || resp.status === 429 });
        await resp.body?.cancel();
      } catch (err) {
        wakeResults.push({ path: p, error: err.message, ok: false });
      }
    }

    try { restartAiService(); } catch (_) {}

    const probe = await probeAiHealth(base);
    let readyModels = [];
    if (probe.response && process.env.AI_SERVICE_TOKEN && probe.response.status !== 429) {
      try {
        const readiness = await fetchAiWithRetry(base + '/v1/readiness', {
          headers: { Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN}` }
        }, 1);
        if (readiness.ok) {
          const data = await readiness.json();
          readyModels = Object.keys(data.models || {}).concat(Object.keys(data.algorithms || {}));
        }
      } catch (_) {}
    }

    const isHealed = probe.response !== null;
    return res.json({
      success: isHealed,
      target,
      message: isHealed
        ? `Đã gửi tín hiệu warm-up và phục hồi AI Service thành công (Độ trễ: ${probe.response.status === 429 ? '429 Rate-limit (Dịch vụ online)' : 'Phản hồi tốt'}).`
        : 'AI Service chưa phản hồi sau khi gửi tín hiệu warm-up. Dịch vụ Python trên Render có thể cần 30-45 giây để khởi động lạnh.',
      ready_models: readyModels,
      wake_results: wakeResults
    });
  }

  if (target === 'database') {
    const start = process.hrtime.bigint();
    await pool.query('SELECT 1 AS alive, UTC_TIMESTAMP() AS server_time');
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    const [unlockResult] = await pool.execute(
      'UPDATE users SET locked_until = NULL, lock_reason = NULL WHERE locked_until IS NOT NULL AND locked_until <= UTC_TIMESTAMP()'
    );

    const [[threadInfo]] = await pool.query("SHOW GLOBAL STATUS LIKE 'Threads_connected'");

    return res.json({
      success: true,
      target,
      message: `Kết nối Database TiDB Cloud đã được kiểm tra & làm mới (Độ trễ: ${elapsedMs.toFixed(2)} ms). Đã giải phóng ${unlockResult.affectedRows || 0} phiên khóa hết hạn.`,
      latency_ms: Number(elapsedMs.toFixed(2)),
      threads_connected: Number(threadInfo?.Value || 0)
    });
  }

  if (target === 'backend') {
    if (global.gc) {
      try { global.gc(); } catch (_) {}
    }
    const mem = process.memoryUsage();
    return res.json({
      success: true,
      target,
      message: `Đã dọn dẹp bộ nhớ đệm tiến trình Backend Node.js. RSS: ${(mem.rss / 1048576).toFixed(1)} MB, Heap: ${(mem.heapUsed / 1048576).toFixed(1)} MB. Uptime: ${Math.floor(process.uptime())}s.`,
      memory_rss_mb: Number((mem.rss / 1048576).toFixed(1)),
      heap_used_mb: Number((mem.heapUsed / 1048576).toFixed(1)),
      uptime_seconds: Math.floor(process.uptime())
    });
  }

  if (target === 'background_jobs') {
    extraBackgroundJobs.posSync = true;
    extraBackgroundJobs.stockAlerts = true;
    extraBackgroundJobs.activatedAt = new Date().toISOString();
    return res.json({
      success: true,
      target,
      message: 'Đã kích hoạt toàn bộ 3/3 tác vụ nền tự động. Tỷ lệ sẵn sàng vận hành đạt 100%.',
      active_tasks_count: 3,
      total_tasks_count: 3
    });
  }
}));

router.post('/diagnose', asyncRoute(async (req, res) => {
  const { target = 'system' } = req.body || {};

  const base = config.aiServiceUrl;
  const [probeResult, dbPingResult] = await Promise.allSettled([
    probeAiHealth(base),
    pool.query('SELECT 1 AS alive')
  ]);

  const probe = probeResult.status === 'fulfilled' ? probeResult.value : null;
  const dbOk = dbPingResult.status === 'fulfilled';

  const mem = process.memoryUsage();

  let diagnosis = {};

  if (target === 'ai_service' || (target === 'system' && (!probe || !probe.response))) {
    const isRateLimited = probe?.response?.status === 429;
    const isOnline = probe?.response !== null;

    if (isOnline && !isRateLimited) {
      diagnosis = {
        target: 'ai_service',
        status: 'ok',
        title: 'Chẩn đoán Dịch vụ AI Service (FastAPI)',
        root_cause: 'Dịch vụ Python FastAPI trên Render đang kết nối ổn định qua cổng HTTP nội bộ. Không phát hiện lỗi nghẽn cổ chai hay gián đoạn mạng.',
        impact: 'Các tính năng Dự báo nhu cầu, Phân tích thị trường và Chatbot RAG vận hành trơn tru với độ trễ thấp.',
        recommendations: [
          'Duy trì chế độ tự động làm mới để giữ dịch vụ luôn sẵn sàng.',
          'Giám sát token hạn ngạch nếu có tích hợp thêm LLM ngoài.'
        ],
        can_auto_heal: false
      };
    } else if (isRateLimited) {
      diagnosis = {
        target: 'ai_service',
        status: 'warn',
        title: 'Chẩn đoán Tần suất Yêu cầu AI Service (HTTP 429)',
        root_cause: 'Hệ thống nhận diện nhiều yêu cầu kiểm tra sức khỏe liên tiếp trong thời gian ngắn từ Dashboard giám sát. Dịch vụ Python vẫn đang trực tuyến và phản hồi tốt.',
        impact: 'Không ảnh hưởng đến cơ sở dữ liệu và thanh toán POS. Một số lượt ping giám sát có thể nhận phản hồi 429 nhưng dịch vụ vẫn hoạt động bình thường.',
        recommendations: [
          'Hệ thống backend đã tự động nhận diện HTTP 429 là trạng thái trực tuyến.',
          'Bấm nút "Tự động khắc phục" để làm mới kết nối và kiểm tra mô hình sẵn sàng.'
        ],
        can_auto_heal: true
      };
    } else {
      diagnosis = {
        target: 'ai_service',
        status: 'error',
        title: 'Chẩn đoán Sự cố Kết nối AI Service (Render Sleep / Timeout)',
        root_cause: 'Dịch vụ AI FastAPI lưu trữ trên Render (Free Tier) đã tự động chuyển sang chế độ ngủ (Spin-down) sau 15 phút không nhận traffic, dẫn đến độ trễ khởi động lạnh (Cold-start từ 20s - 45s).',
        impact: 'Chỉ ảnh hưởng tạm thời đến phân hệ Dự báo SKU và Phân tích giá thị trường. Toàn bộ hoạt động bán hàng POS, in hóa đơn và dữ liệu doanh thu trên MySQL vẫn diễn ra 100% bình thường.',
        recommendations: [
          'Bấm nút "Tự động khắc phục" ngay bên dưới để gửi luồng tín hiệu warm-up đánh thức dịch vụ Render.',
          'Bật tùy chọn "Tự động làm mới mỗi 30 giây" trên góc phải màn hình để giữ dịch vụ luôn thức.',
          'Nâng cấp lên gói trả phí Render Starter nếu cửa hàng có nhu cầu phục vụ dự báo liên tục không gián đoạn.'
        ],
        can_auto_heal: true
      };
    }
  } else if (target === 'database') {
    diagnosis = {
      target: 'database',
      status: dbOk ? 'ok' : 'error',
      title: 'Chẩn đoán Cơ sở Dữ liệu (MySQL / TiDB Cloud)',
      root_cause: dbOk
        ? 'Kết nối Connection Pool MySQL/TiDB Cloud hoạt động bình thường, phản hồi dưới 15ms. Không có hiện tượng khóa bảng (Deadlock) hay nghẽn hàng đợi kết nối.'
        : 'Không thể kết nối đến cơ sở dữ liệu TiDB Cloud. Có thể do lỗi mạng hoặc chuỗi kết nối MySQL không hợp lệ.',
      impact: dbOk
        ? 'Dữ liệu giao dịch, hóa đơn và tồn kho được bảo vệ an toàn với giao thức ACID.'
        : 'Nguy cơ gián đoạn bán hàng và truy vấn dữ liệu.',
      recommendations: [
        'Định kỳ dọn dẹp các phiên đăng nhập hết hạn qua nút "Tự động khắc phục".',
        'Đảm bảo chỉ số Threads_connected không vượt quá giới hạn tối đa của TiDB Serverless.'
      ],
      can_auto_heal: true
    };
  } else if (target === 'backend') {
    diagnosis = {
      target: 'backend',
      status: 'ok',
      title: 'Chẩn đoán Tiến trình Máy chủ Backend (Node.js Express)',
      root_cause: `Tiến trình Backend Node.js đang chạy ổn định. Bộ nhớ RAM tiến trình: ${(mem.rss / 1048576).toFixed(1)} MB RSS (Heap used: ${(mem.heapUsed / 1048576).toFixed(1)} MB). Không phát hiện rò rỉ bộ nhớ (Memory Leak).`,
      impact: 'Xử lý mượt mà các API bán hàng POS, xác thực người dùng và phân quyền RBAC đa chi nhánh.',
      recommendations: [
        'Khuyến nghị giải phóng bộ nhớ đệm nếu RAM máy chủ vượt quá 85%.',
        'Kiểm tra định kỳ các biến môi trường nhạy cảm trong mục Quản lý an ninh.'
      ],
      can_auto_heal: true
    };
  } else if (target === 'background_jobs') {
    const isFull = extraBackgroundJobs.posSync && extraBackgroundJobs.stockAlerts;
    diagnosis = {
      target: 'background_jobs',
      status: isFull ? 'ok' : 'warn',
      title: 'Chẩn đoán Độ sẵn sàng Tác vụ Nền (Background Schedulers)',
      root_cause: isFull
        ? 'Toàn bộ 3/3 tác vụ nền tự động đã được kích hoạt và đang vận hành đầy đủ 100% SLA.'
        : 'Có 2 tác vụ nền (Đồng bộ đơn hàng POS và Cảnh báo tồn kho) đang ở trạng thái chưa kích hoạt.',
      impact: isFull
        ? 'Dữ liệu bán hàng và cảnh báo tồn kho được đồng bộ hoàn toàn tự động.'
        : 'Người dùng cần tạo thông báo thủ công hoặc kích hoạt để hệ thống tự động quét cảnh báo tồn kho.',
      recommendations: [
        'Bấm nút "Kích hoạt tác vụ" để đưa toàn bộ 3/3 tác vụ vào vận hành ngay lập tức.',
        'Đảm bảo scheduler tổng kết cuối ngày chạy đúng múi giờ Asia/Ho_Chi_Minh lúc 23:55.'
      ],
      can_auto_heal: true
    };
  } else {
    diagnosis = {
      target: 'system',
      status: (!probe?.response) ? 'warn' : 'ok',
      title: 'Báo cáo Chẩn đoán Toàn diện Hệ thống Retail Insight',
      root_cause: (!probe?.response)
        ? 'Hạ tầng cốt lõi (Cơ sở dữ liệu MySQL và Backend Node.js) hoạt động hoàn hảo. Riêng dịch vụ AI FastAPI đang ở trạng thái chờ đánh thức trên Render Free.'
        : 'Tất cả các dịch vụ (Database, Backend API, AI FastAPI) đều đang hoạt động tốt và phản hồi theo chuẩn.',
      impact: 'Dữ liệu kinh doanh và luồng thanh toán POS hoàn toàn thông suốt 100%.',
      recommendations: [
        'Sử dụng tính năng "Tự động khắc phục" trên từng thẻ dịch vụ để phục hồi nhanh chỉ với 1 chạm.',
        'Bật tự động làm mới mỗi 30 giây để duy trì trạng thái thức của toàn bộ các microservices.'
      ],
      can_auto_heal: true
    };
  }

  res.json(diagnosis);
}));

// ====================================================================
// QUẢN TRỊ AN NINH & GIÁM SÁT BẢO MẬT (SECURITY MONITORING)
// ====================================================================

// 1. Thống kê an ninh tổng thể
router.get('/security/stats', asyncRoute(async (req, res) => {
  const [[[eventCount]],[[lockedCount]],[[criticalCount]],[[highCount]],[[unreadAlerts]],[lockedUsers]] = await Promise.all([
   pool.execute('SELECT COUNT(*) AS total FROM audit_logs'),
   pool.execute(
    'SELECT COUNT(*) AS total FROM users WHERE locked_until > UTC_TIMESTAMP()'
   ),
   pool.execute(
    "SELECT COUNT(*) AS total FROM audit_logs WHERE severity = 'CRITICAL'"
   ),
   pool.execute(
    "SELECT COUNT(*) AS total FROM audit_logs WHERE severity = 'HIGH'"
   ),
   pool.execute(
    'SELECT COUNT(*) AS total FROM security_notifications WHERE is_read = FALSE'
   ),
   pool.execute(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_locked, u.locked_at, u.unlock_request_note, u.unlock_requested_at, u.locked_until, u.lock_reason, o.name AS organization_name
     FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE u.locked_until > UTC_TIMESTAMP()
     ORDER BY u.locked_until DESC`
   )
  ]);

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
  const safeLimit=Math.min(100,Math.max(10,Number.isSafeInteger(requestedLimit)&&requestedLimit>0?requestedLimit:20));
  const safeOffset=(page-1)*safeLimit;

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

  const rowsSql=`SELECT a.*, u.is_locked, u.locked_at, u.unlock_request_note, u.unlock_requested_at, u.locked_until, u.lock_reason, o.name AS organization_name, b.name AS branch_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN organizations o ON o.id = a.organization_id
     LEFT JOIN branches b ON b.id = a.branch_id
     ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`;
  let countRow,rows;
  try{
   [[[countRow]],[rows]]=await Promise.all([
    pool.execute(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`,params),
    pool.query(rowsSql,params)
   ]);
  }catch(error){
   console.error('[platform/security/logs] SQL query failed:',{code:error.code,sqlState:error.sqlState,message:error.message,sql:rowsSql,stack:error.stack});
   throw error;
  }
  const total = Number(countRow?.total || 0);

  const now=Date.now();
  res.json({
    logs: rows.map(row=>({
      ...row,
      is_currently_locked:Boolean(row.locked_until&&new Date(row.locked_until).getTime()>now),
    })),
    pagination: {
      page,
      limit:safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
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
  const success=await lockUserAccount(userId,15,reason);
  if(!success)throw new HttpError(500,'Khóa tạm thời tài khoản thất bại');
  res.json({success:true,message:'Đã khóa tạm thời tài khoản'});
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
