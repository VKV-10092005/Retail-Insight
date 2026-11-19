import {Router} from 'express';
import {z} from 'zod';
import {pool} from '../db/pool.js';
import {asyncRoute,HttpError} from '../utils/http.js';
import {transaction} from '../business/common.js';
import {deleteSupportNotifications,upsertSupportNotification} from '../business/notifications.js';

const router=Router();
const storeRoles=new Set(['OWNER','MANAGER','CASHIER','INVENTORY']);
const messageInput=z.object({content:z.string().trim().min(1).max(5000)}).strict();
const typingInput=z.object({is_typing:z.boolean().default(true)}).strict();
const categoryInput=z.object({category:z.enum(['GENERAL','WEB_DESIGN'])}).strict();
const newThreadInput=z.object({recipient_user_id:z.coerce.number().int().positive()}).strict();
const typingState=new Map(),typingTtlMs=3500;

router.get('/agency-profile',asyncRoute(async(req,res)=>{
 const [[admin]]=await pool.execute(`SELECT id,full_name,email,phone,bio,avatar_url FROM users
  WHERE role='PLATFORM_ADMIN' AND status='ACTIVE' ORDER BY id LIMIT 1`);
 res.json({admin:admin?{...admin,role:'PLATFORM_ADMIN',organization_name:'Đội ngũ Hỗ trợ Retail Insight'}:null});
}));
const threadId=value=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,'Hội thoại không hợp lệ');return id;};
const preview=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,180);
const typingKey=(id,userId)=>`${id}:${userId}`;
function pruneTyping(){const now=Date.now();for(const [key,expiresAt] of typingState)if(expiresAt<=now)typingState.delete(key);}
function isTyping(id,userId){pruneTyping();return Number(typingState.get(typingKey(id,userId))||0)>Date.now();}

async function getThread(connection,id){
 const [rows]=await connection.execute(`SELECT t.*,u.full_name user_full_name,u.email user_email,u.phone user_phone,u.bio user_bio,u.role user_role,u.avatar_url user_avatar_url,
  r.full_name recipient_full_name,r.email recipient_email,r.phone recipient_phone,r.bio recipient_bio,r.role recipient_role,r.avatar_url recipient_avatar_url,o.name organization_name,
  a.id admin_user_id,a.full_name admin_full_name,a.email admin_email,a.phone admin_phone,a.bio admin_bio,a.avatar_url admin_avatar_url,a.role admin_role,
  IF(u.role='OWNER',(SELECT GROUP_CONCAT(b.name ORDER BY b.name SEPARATOR ', ') FROM branches b WHERE b.organization_id=u.organization_id AND b.status='ACTIVE'),(SELECT GROUP_CONCAT(DISTINCT b.name ORDER BY b.name SEPARATOR ', ') FROM user_branch_roles ubr JOIN branches b ON b.id=ubr.branch_id AND b.organization_id=ubr.organization_id WHERE ubr.user_id=u.id AND ubr.organization_id=u.organization_id)) user_branch_name,
  IF(r.role='OWNER',(SELECT GROUP_CONCAT(b.name ORDER BY b.name SEPARATOR ', ') FROM branches b WHERE b.organization_id=r.organization_id AND b.status='ACTIVE'),(SELECT GROUP_CONCAT(DISTINCT b.name ORDER BY b.name SEPARATOR ', ') FROM user_branch_roles rbr JOIN branches b ON b.id=rbr.branch_id AND b.organization_id=rbr.organization_id WHERE rbr.user_id=r.id AND rbr.organization_id=r.organization_id)) recipient_branch_name
  FROM support_threads t JOIN users u ON u.id=t.user_id LEFT JOIN users r ON r.id=t.recipient_user_id
  LEFT JOIN (
   SELECT thread_id,sender_user_id FROM (
    SELECT m.thread_id,m.sender_user_id,ROW_NUMBER() OVER (PARTITION BY m.thread_id ORDER BY m.id DESC) AS rn
    FROM support_messages m JOIN users au ON au.id=m.sender_user_id
    WHERE au.role='PLATFORM_ADMIN' AND au.status='ACTIVE'
   ) ranked_admin_messages WHERE rn=1
  ) latest_admin ON latest_admin.thread_id=t.id
  LEFT JOIN (SELECT id FROM users WHERE role='PLATFORM_ADMIN' AND status='ACTIVE' ORDER BY id LIMIT 1) default_admin ON 1=1
  LEFT JOIN users a ON a.id=COALESCE(latest_admin.sender_user_id,default_admin.id)
  JOIN organizations o ON o.id=t.organization_id WHERE t.id=?`,[id]);
 return rows[0]||null;
}
function assertThreadAccess(req,thread,{allowAdminInternal=false}={}){
 if(!thread)throw new HttpError(404,'Không tìm thấy hội thoại');
 if(req.user.role==='PLATFORM_ADMIN'){
  if(thread.thread_type!=='ADMIN_SUPPORT'&&!allowAdminInternal)throw new HttpError(404,'Không tìm thấy hội thoại');
  return;
 }
 if(!storeRoles.has(req.user.role)||Number(thread.organization_id)!==Number(req.user.organization_id))throw new HttpError(403,'Không có quyền truy cập hội thoại này');
 if(thread.thread_type==='ADMIN_SUPPORT'&&Number(thread.user_id)===Number(req.user.id))return;
 if(thread.thread_type==='INTERNAL_CHAT'&&[thread.user_id,thread.recipient_user_id].some(id=>Number(id)===Number(req.user.id)))return;
 throw new HttpError(403,'Không có quyền truy cập hội thoại này');
}
function peerId(thread,userId){
 if(thread.thread_type==='INTERNAL_CHAT')return Number(thread.user_id)===Number(userId)?Number(thread.recipient_user_id):Number(thread.user_id);
 return Number(userId)===Number(thread.user_id)?null:Number(thread.user_id);
}
async function getMessages(connection,id){
 const [rows]=await connection.execute(`SELECT m.id,m.thread_id,m.sender_user_id,m.sender_role,m.message_type,CASE WHEN m.is_recalled=1 THEN NULL ELSE m.content END content,m.is_recalled,m.created_at,u.full_name sender_name,u.avatar_url sender_avatar_url,u.email sender_email,u.phone sender_phone,u.bio sender_bio,u.role sender_user_role
  FROM support_messages m JOIN users u ON u.id=m.sender_user_id WHERE m.thread_id=? ORDER BY m.id ASC`,[id]);
 return rows;
}
async function peerTyping(thread,userId){
 const counterpart=peerId(thread,userId);
 if(counterpart)return isTyping(thread.id,counterpart);
 // The platform support team is represented by the active admin typing state.
 return isTyping(thread.id,'ADMIN');
}
const threadSelect=`SELECT t.id,t.organization_id,t.user_id,t.recipient_user_id,t.thread_type,t.category,t.web_request_status,t.subject,t.status,
 t.web_form_submitted,t.web_form_reminder_sent,t.unread_admin_count,t.unread_user_count,t.last_message_at,t.created_at,u.full_name user_full_name,u.email user_email,u.phone user_phone,u.bio user_bio,u.role user_role,u.avatar_url user_avatar_url,
 r.full_name recipient_full_name,r.email recipient_email,r.phone recipient_phone,r.bio recipient_bio,r.role recipient_role,r.avatar_url recipient_avatar_url,o.name organization_name,
 a.id admin_user_id,a.full_name admin_full_name,a.email admin_email,a.phone admin_phone,a.bio admin_bio,a.avatar_url admin_avatar_url,a.role admin_role,
 IF(u.role='OWNER',(SELECT GROUP_CONCAT(b.name ORDER BY b.name SEPARATOR ', ') FROM branches b WHERE b.organization_id=u.organization_id AND b.status='ACTIVE'),(SELECT GROUP_CONCAT(DISTINCT b.name ORDER BY b.name SEPARATOR ', ') FROM user_branch_roles ubr JOIN branches b ON b.id=ubr.branch_id AND b.organization_id=ubr.organization_id WHERE ubr.user_id=u.id AND ubr.organization_id=u.organization_id)) user_branch_name,
 IF(r.role='OWNER',(SELECT GROUP_CONCAT(b.name ORDER BY b.name SEPARATOR ', ') FROM branches b WHERE b.organization_id=r.organization_id AND b.status='ACTIVE'),(SELECT GROUP_CONCAT(DISTINCT b.name ORDER BY b.name SEPARATOR ', ') FROM user_branch_roles rbr JOIN branches b ON b.id=rbr.branch_id AND b.organization_id=rbr.organization_id WHERE rbr.user_id=r.id AND rbr.organization_id=r.organization_id)) recipient_branch_name,
 (SELECT CASE WHEN m.is_recalled=1 THEN 'Tin nhắn đã được thu hồi' ELSE m.content END FROM support_messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) last_message_preview
 FROM support_threads t JOIN users u ON u.id=t.user_id LEFT JOIN users r ON r.id=t.recipient_user_id JOIN organizations o ON o.id=t.organization_id
  LEFT JOIN (
   SELECT thread_id,sender_user_id FROM (
    SELECT m.thread_id,m.sender_user_id,ROW_NUMBER() OVER (PARTITION BY m.thread_id ORDER BY m.id DESC) AS rn
    FROM support_messages m JOIN users au ON au.id=m.sender_user_id
    WHERE au.role='PLATFORM_ADMIN' AND au.status='ACTIVE'
   ) ranked_admin_messages WHERE rn=1
  ) latest_admin ON latest_admin.thread_id=t.id
  LEFT JOIN (SELECT id FROM users WHERE role='PLATFORM_ADMIN' AND status='ACTIVE' ORDER BY id LIMIT 1) default_admin ON 1=1
  LEFT JOIN users a ON a.id=COALESCE(latest_admin.sender_user_id,default_admin.id)`;
function presentThread(row,user){
 const internal=row.thread_type==='INTERNAL_CHAT',peerIsUser=internal&&Number(row.user_id)!==Number(user.id);
 const adminSupport=row.thread_type==='ADMIN_SUPPORT'&&user.role!=='PLATFORM_ADMIN';
 const peerIdValue=adminSupport?row.admin_user_id:internal?(peerIsUser?row.user_id:row.recipient_user_id):row.user_id;
 const peerName=adminSupport?row.admin_full_name:internal?(peerIsUser?row.user_full_name:row.recipient_full_name):row.user_full_name;
 const peerRole=adminSupport?row.admin_role:internal?(peerIsUser?row.user_role:row.recipient_role):row.user_role;
 const peerAvatar=adminSupport?row.admin_avatar_url:internal?(peerIsUser?row.user_avatar_url:row.recipient_avatar_url):row.user_avatar_url;
 const peerEmail=adminSupport?row.admin_email:internal?(peerIsUser?row.user_email:row.recipient_email):row.user_email;
 const peerPhone=adminSupport?row.admin_phone:internal?(peerIsUser?row.user_phone:row.recipient_phone):row.user_phone;
 const peerBio=adminSupport?row.admin_bio:internal?(peerIsUser?row.user_bio:row.recipient_bio):row.user_bio;
 const peerBranch=adminSupport?null:internal?(peerIsUser?row.user_branch_name:row.recipient_branch_name):row.user_branch_name;
 const unreadCount=user.role==='PLATFORM_ADMIN'?row.unread_admin_count:
  internal?(Number(row.user_id)===Number(user.id)?row.unread_user_count:row.unread_admin_count):row.unread_user_count;
  return {...row,peer_user_id:peerIdValue,peer_name:peerName,peer_role:peerRole,peer_avatar_url:peerAvatar||null,peer_email:peerEmail||null,peer_phone:peerPhone||null,peer_bio:peerBio||null,peer_branch_name:peerBranch||null,peer_organization_name:internal?row.organization_name:adminSupport?'Đội ngũ Hỗ trợ Retail Insight':null,support_admin:row.thread_type==='ADMIN_SUPPORT'&&row.admin_user_id?{id:row.admin_user_id,full_name:row.admin_full_name,email:row.admin_email,phone:row.admin_phone||null,bio:row.admin_bio||null,avatar_url:row.admin_avatar_url||null,role:'PLATFORM_ADMIN',organization_name:'Đội ngũ Hỗ trợ Retail Insight'}:null,unread_count:Number(unreadCount||0),peer_is_typing:false};
}

async function sendWebFormReminder(connection,threadId,userId){
 const [[thread]]=await connection.execute(`SELECT t.id,t.organization_id,t.web_form_submitted,t.web_form_reminder_sent,
   (SELECT m.created_at FROM support_messages m WHERE m.thread_id=t.id AND m.message_type='WEB_INTAKE_PROMPT' ORDER BY m.id ASC LIMIT 1) prompt_at,
   (SELECT MAX(m.id) FROM support_messages m WHERE m.thread_id=t.id AND m.message_type='WEB_INTAKE_SUBMISSION') submission_id
   FROM support_threads t WHERE t.id=? AND t.user_id=? AND t.thread_type='ADMIN_SUPPORT' AND t.category='WEB_DESIGN' FOR UPDATE`,[threadId,userId]);
 if(!thread)return null;
 if(!Number(thread.web_form_submitted)&&thread.submission_id){await connection.execute('UPDATE support_threads SET web_form_submitted=1 WHERE id=?',[threadId]);return null;}
 if(Number(thread.web_form_submitted)||Number(thread.web_form_reminder_sent)||!thread.prompt_at||Date.now()-new Date(thread.prompt_at).getTime()<15*60*1000)return null;
 const [[admin]]=await connection.execute("SELECT id FROM users WHERE role='PLATFORM_ADMIN' AND status='ACTIVE' ORDER BY id LIMIT 1");
 if(!admin)return null;
 const reminder='Bạn quên nhập form Mô tả nhu cầu phải không nè? Điền nhanh giúp mình bên dưới để đội ngũ kỹ thuật tư vấn giải pháp và báo giá sát nhất cho cửa hàng nhé!';
 const [inserted]=await connection.execute("INSERT INTO support_messages(thread_id,sender_user_id,sender_role,message_type,content) VALUES (?,?,'ADMIN','WEB_INTAKE_PROMPT',?)",[threadId,admin.id,reminder]);
 const [updated]=await connection.execute('UPDATE support_threads SET web_form_reminder_sent=1,last_message_at=UTC_TIMESTAMP(3),unread_user_count=unread_user_count+1 WHERE id=? AND web_form_submitted=0 AND web_form_reminder_sent=0',[threadId]);
 if(!updated.affectedRows){await connection.execute('DELETE FROM support_messages WHERE id=?',[inserted.insertId]);return null;}
 await upsertSupportNotification(connection,{recipientUserId:userId,organizationId:thread.organization_id,organizationName:null,threadId,senderName:'Đội ngũ Hỗ trợ Retail Insight',content:reminder});
 return inserted.insertId;
}

router.get('/directory',asyncRoute(async(req,res)=>{
 if(!storeRoles.has(req.user.role))throw new HttpError(403,'Không đủ quyền');
 const [members]=await pool.execute(`SELECT u.id,u.full_name,u.email,u.phone,u.bio,u.role,u.avatar_url,o.name organization_name,
  IF(u.role='OWNER',(SELECT GROUP_CONCAT(b2.name ORDER BY b2.name SEPARATOR ', ') FROM branches b2 WHERE b2.organization_id=u.organization_id AND b2.status='ACTIVE'),GROUP_CONCAT(DISTINCT b.name ORDER BY b.name SEPARATOR ', ')) branch_names
  FROM users u JOIN organizations o ON o.id=u.organization_id LEFT JOIN user_branch_roles ubr ON ubr.user_id=u.id AND ubr.organization_id=u.organization_id
  LEFT JOIN branches b ON b.id=ubr.branch_id AND b.organization_id=u.organization_id
  WHERE u.organization_id=? AND u.status='ACTIVE' AND u.id<>? AND u.role IN ('OWNER','MANAGER','CASHIER','INVENTORY')
  GROUP BY u.id,u.full_name,u.email,u.phone,u.bio,u.role,u.avatar_url,o.name ORDER BY u.full_name`,[req.user.organization_id,req.user.id]);
 res.json({members});
}));

router.get('/threads',asyncRoute(async(req,res)=>{
 if(req.user.role==='PLATFORM_ADMIN'){
  const [rows]=await pool.execute(`${threadSelect} WHERE t.thread_type='ADMIN_SUPPORT' ORDER BY t.last_message_at DESC,t.id DESC`);
  return res.json({threads:rows.map(row=>({...presentThread(row,req.user),peer_is_typing:isTyping(row.id,row.user_id)}))});
 }
 if(!storeRoles.has(req.user.role))throw new HttpError(403,'Không đủ quyền');
 const result=await transaction(async connection=>{
  const [existing]=await connection.execute("SELECT id FROM support_threads WHERE thread_type='ADMIN_SUPPORT' AND user_id=? LIMIT 1",[req.user.id]);
  let id=existing[0]?.id;
  if(!id){const [inserted]=await connection.execute("INSERT INTO support_threads(organization_id,thread_type,user_id,subject,category,status) VALUES (?,'ADMIN_SUPPORT',?,'Hỗ trợ vận hành','GENERAL','OPEN') ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",[req.user.organization_id,req.user.id]);id=inserted.insertId;}
  const [rows]=await connection.execute(`${threadSelect} WHERE (t.thread_type='ADMIN_SUPPORT' AND t.user_id=?) OR (t.thread_type='INTERNAL_CHAT' AND (t.user_id=? OR t.recipient_user_id=?)) ORDER BY t.last_message_at DESC,t.id DESC`,[req.user.id,req.user.id,req.user.id]);
  const items=rows.map(row=>({...presentThread(row,req.user),peer_is_typing:false}));
  const admin=items.find(row=>row.thread_type==='ADMIN_SUPPORT');
  if(admin){await sendWebFormReminder(connection,admin.id,req.user.id);admin.messages=await getMessages(connection,admin.id);}
  return {threads:items,thread:admin};
 });
 for(const item of result.threads)item.peer_is_typing=await peerTyping(item,req.user.id);
 res.json(result);
}));

router.post('/threads',asyncRoute(async(req,res)=>{
 if(!storeRoles.has(req.user.role))throw new HttpError(403,'Không đủ quyền');
 const {recipient_user_id:recipientId}=newThreadInput.parse(req.body);
 if(recipientId===Number(req.user.id))throw new HttpError(400,'Không thể tự tạo hội thoại với chính mình');
 const [recipients]=await pool.execute("SELECT id FROM users WHERE id=? AND organization_id=? AND status='ACTIVE' AND role IN ('OWNER','MANAGER','CASHIER','INVENTORY')",[recipientId,req.user.organization_id]);
 if(!recipients.length)throw new HttpError(404,'Không tìm thấy thành viên trong cửa hàng');
 const ids=[Math.min(Number(req.user.id),recipientId),Math.max(Number(req.user.id),recipientId)];
 let [rows]=await pool.execute("SELECT id FROM support_threads WHERE organization_id=? AND thread_type='INTERNAL_CHAT' AND user_id=? AND recipient_user_id=? LIMIT 1",[req.user.organization_id,ids[0],ids[1]]);
 let id=rows[0]?.id;
 if(!id){try{const [inserted]=await pool.execute("INSERT INTO support_threads(organization_id,thread_type,user_id,recipient_user_id,recipient_user_key,subject,category,status) VALUES (?,'INTERNAL_CHAT',?,?,?, 'Tin nhắn nội bộ','GENERAL','OPEN')",[req.user.organization_id,ids[0],ids[1],ids[1]]);id=inserted.insertId;}catch(error){if(error.code!=='ER_DUP_ENTRY')throw error;[rows]=await pool.execute("SELECT id FROM support_threads WHERE organization_id=? AND thread_type='INTERNAL_CHAT' AND user_id=? AND recipient_user_id=? LIMIT 1",[req.user.organization_id,ids[0],ids[1]]);id=rows[0]?.id;}}
 const thread=await getThread(pool,id);assertThreadAccess(req,thread);
 res.status(201).json({thread:{...presentThread(thread,req.user),messages:await getMessages(pool,id)}});
}));

router.patch('/threads/:id/category',asyncRoute(async(req,res)=>{
 const id=threadId(req.params.id),{category}=categoryInput.parse(req.body),thread=await getThread(pool,id);assertThreadAccess(req,thread);
 if(thread.thread_type!=='ADMIN_SUPPORT')throw new HttpError(400,'Chỉ hội thoại hỗ trợ admin có thể phân loại yêu cầu');
 await pool.execute("UPDATE support_threads SET category=?,web_request_status=IF(?='WEB_DESIGN','NEW',NULL),status=IF(?='WEB_DESIGN','OPEN',status) WHERE id=?",[category,category,category,id]);
 const updated=await getThread(pool,id);
 res.json({thread:updated});
}));

router.patch('/threads/:id/status',asyncRoute(async(req,res)=>{
 if(req.user.role!=='PLATFORM_ADMIN')throw new HttpError(403,'Không đủ quyền');
 const id=threadId(req.params.id),{status}=z.object({status:z.enum(['NEW','IN_PROGRESS','COMPLETED'])}).strict().parse(req.body);
 const genericStatus=status==='NEW'?'OPEN':status==='COMPLETED'?'RESOLVED':'IN_PROGRESS';
 const [result]=await pool.execute("UPDATE support_threads SET web_request_status=?,status=? WHERE id=? AND thread_type='ADMIN_SUPPORT' AND category='WEB_DESIGN'",[status,genericStatus,id]);
 if(!result.affectedRows)throw new HttpError(404,'Không tìm thấy yêu cầu hỗ trợ');
 res.json({status});
}));

router.delete('/threads/:id',asyncRoute(async(req,res)=>{
 const id=threadId(req.params.id);
 await transaction(async connection=>{
  const thread=await getThread(connection,id);assertThreadAccess(req,thread,{allowAdminInternal:true});
  await connection.execute("DELETE FROM notifications WHERE type='SUPPORT_CHAT' AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.thread_id'))=?",[String(id)]);
  await connection.execute('DELETE FROM support_threads WHERE id=?',[id]);
 });
 res.status(204).end();
}));

router.get('/threads/:id/messages',asyncRoute(async(req,res)=>{
 const id=threadId(req.params.id);
 const result=await transaction(async connection=>{
  const thread=await getThread(connection,id);assertThreadAccess(req,thread);
  if(req.user.role!=='PLATFORM_ADMIN')await sendWebFormReminder(connection,id,req.user.id);
  const admin=req.user.role==='PLATFORM_ADMIN',internal=thread.thread_type==='INTERNAL_CHAT';
  const unreadColumn=admin?'unread_admin_count':internal&&Number(thread.recipient_user_id)===Number(req.user.id)?'unread_admin_count':'unread_user_count';
  await connection.execute(`UPDATE support_threads SET ${unreadColumn}=0 WHERE id=?`,[id]);
  await deleteSupportNotifications(connection,{recipientUserId:req.user.id,threadId:id});
  const formatted={...thread,[unreadColumn]:0};
  return {thread:{...presentThread(formatted,req.user),unread_count:0},messages:await getMessages(connection,id),peer_is_typing:await peerTyping(thread,admin?'ADMIN':req.user.id)};
 });
 res.json(result);
}));

router.post('/threads/:id/typing',asyncRoute(async(req,res)=>{
 const id=threadId(req.params.id),data=typingInput.parse(req.body),thread=await getThread(pool,id);assertThreadAccess(req,thread);
 const keyUser=req.user.role==='PLATFORM_ADMIN'?'ADMIN':req.user.id,key=typingKey(id,keyUser);
 if(data.is_typing)typingState.set(key,Date.now()+typingTtlMs);else typingState.delete(key);
 res.json({is_typing:data.is_typing,expires_in_ms:data.is_typing?typingTtlMs:0});
}));

router.post('/messages/:messageId/recall',asyncRoute(async(req,res)=>{
 const messageId=threadId(req.params.messageId);
 const result=await transaction(async connection=>{
  const [rows]=await connection.execute(`SELECT m.id,m.thread_id,m.sender_user_id,m.sender_role,m.is_recalled,m.created_at,u.full_name sender_name,u.avatar_url sender_avatar_url
   FROM support_messages m JOIN users u ON u.id=m.sender_user_id WHERE m.id=? FOR UPDATE`,[messageId]);
  const message=rows[0];if(!message)throw new HttpError(404,'Không tìm thấy tin nhắn');
  const thread=await getThread(connection,message.thread_id);assertThreadAccess(req,thread);
  if(Number(message.sender_user_id)!==Number(req.user.id))throw new HttpError(403,'Chỉ người gửi mới được thu hồi tin nhắn');
  if(!message.is_recalled)await connection.execute('UPDATE support_messages SET is_recalled=1 WHERE id=?',[messageId]);
  return {...message,content:null,is_recalled:1};
 });
 res.json({message:result});
}));

router.post('/threads/:id/messages',asyncRoute(async(req,res)=>{
 const id=threadId(req.params.id),data=messageInput.parse(req.body);
 const result=await transaction(async connection=>{
  const thread=await getThread(connection,id);assertThreadAccess(req,thread);
  const admin=req.user.role==='PLATFORM_ADMIN',senderRole=admin?'ADMIN':'USER',text=preview(data.content),internal=thread.thread_type==='INTERNAL_CHAT';
  const webRequest=!admin&&!internal&&/(website|web\s*site|trang\s+web|web\s*design|app|thiết\s*kế|làm\s+(web|app)|tư\s*vấn.*(web|app))/iu.test(data.content);
  const webIntakeSubmitted=!admin&&!internal&&data.content.startsWith('YÊU CẦU TƯ VẤN THIẾT KẾ WEBSITE / APP');
  typingState.delete(typingKey(id,admin?'ADMIN':req.user.id));
  if(webRequest)await connection.execute("UPDATE support_threads SET category='WEB_DESIGN',web_request_status='NEW',status='OPEN' WHERE id=?",[id]);
  const messageType=webIntakeSubmitted?'WEB_INTAKE_SUBMISSION':'TEXT';
  const [inserted]=await connection.execute('INSERT INTO support_messages(thread_id,sender_user_id,sender_role,message_type,content) VALUES (?,?,?,?,?)',[id,req.user.id,senderRole,messageType,data.content]);
  if(webIntakeSubmitted)await connection.execute("UPDATE support_threads SET web_form_submitted=1,category='WEB_DESIGN',web_request_status=COALESCE(web_request_status,'NEW'),status='OPEN' WHERE id=?",[id]);
  let autoPromptId=null;
  if(webRequest&&!webIntakeSubmitted){
   const [[cycle]]=await connection.execute("SELECT MAX(CASE WHEN message_type='WEB_INTAKE_PROMPT' THEN id END) prompt_id,MAX(CASE WHEN message_type='WEB_INTAKE_SUBMISSION' THEN id END) submission_id FROM support_messages WHERE thread_id=?",[id]);
   if(!cycle.prompt_id||Number(cycle.submission_id||0)>Number(cycle.prompt_id)){
    const [admins]=await connection.execute("SELECT id,full_name FROM users WHERE role='PLATFORM_ADMIN' AND status='ACTIVE' ORDER BY id LIMIT 1");
    if(admins.length){
     const prompt='Cảm ơn bạn đã quan tâm đến giải pháp thiết kế Website / App bán hàng! Trong thời gian chờ chuyên viên kỹ thuật kết nối, bạn điền giúp mình form Mô tả nhu cầu nhé để đội ngũ tư vấn phương án và báo giá phù hợp nhất ạ.';
     const [auto]=await connection.execute("INSERT INTO support_messages(thread_id,sender_user_id,sender_role,message_type,content) VALUES (?,?,'ADMIN','WEB_INTAKE_PROMPT',?)",[id,admins[0].id,prompt]);
     autoPromptId=auto.insertId;
     await connection.execute('UPDATE support_threads SET last_message_at=UTC_TIMESTAMP(3),unread_user_count=unread_user_count+1 WHERE id=?',[id]);
     await upsertSupportNotification(connection,{recipientUserId:thread.user_id,organizationId:thread.organization_id,organizationName:thread.organization_name,threadId:id,senderName:'Đội ngũ Hỗ trợ Retail Insight',content:prompt});
    }
   }
  }
  const unreadColumn=admin?'unread_user_count':internal?(Number(thread.user_id)===Number(req.user.id)?'unread_admin_count':'unread_user_count'):'unread_admin_count';
  await connection.execute(`UPDATE support_threads SET last_message_at=UTC_TIMESTAMP(3),${unreadColumn}=${unreadColumn}+1 WHERE id=?`,[id]);
  const counterpart=admin?Number(thread.user_id):internal?peerId(thread,req.user.id):null;
  if(admin||!internal){
   if(admin)await upsertSupportNotification(connection,{recipientUserId:thread.user_id,organizationId:thread.organization_id,organizationName:thread.organization_name,threadId:id,senderName:'Đội ngũ Hỗ trợ Retail Insight',content:text});
   else{
    const [admins]=await connection.execute("SELECT id FROM users WHERE role='PLATFORM_ADMIN' AND status='ACTIVE'");
    for(const row of admins)await upsertSupportNotification(connection,{recipientUserId:row.id,organizationId:thread.organization_id,organizationName:thread.organization_name,threadId:id,senderName:thread.user_full_name,content:text});
   }
  }else{
   const [target]=await connection.execute('SELECT full_name FROM users WHERE id=?',[counterpart]);
   const senderName=req.user.full_name||req.user.email;
   await upsertSupportNotification(connection,{recipientUserId:counterpart,organizationId:thread.organization_id,organizationName:thread.organization_name,threadId:id,senderName,content:text});
   if(!target.length)throw new HttpError(404,'Không tìm thấy người nhận');
  }
  const [[message]]=await connection.execute(`SELECT m.id,m.thread_id,m.sender_user_id,m.sender_role,m.message_type,m.content,m.is_recalled,m.created_at,u.full_name sender_name,u.avatar_url sender_avatar_url
   FROM support_messages m JOIN users u ON u.id=m.sender_user_id WHERE m.id=?`,[inserted.insertId]);
  let prompt=null;if(autoPromptId){[[prompt]]=await connection.execute('SELECT m.id,m.thread_id,m.sender_user_id,m.sender_role,m.message_type,m.content,m.is_recalled,m.created_at,u.full_name sender_name,u.avatar_url sender_avatar_url FROM support_messages m JOIN users u ON u.id=m.sender_user_id WHERE m.id=?',[autoPromptId]);}return {message,prompt};
 });
 res.status(201).json(result);
}));

export default router;
