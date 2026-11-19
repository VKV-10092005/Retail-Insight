import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
process.env.NODE_ENV='development';

test('support live chat delivers messages and contact notifications both ways',{skip:process.env.RUN_DB_TESTS!=='1'},async()=>{
 const {pool,verifyDatabase}=await import('../src/db/pool.js');
 const {config}=await import('../src/config/env.js');
 const {default:app}=await import('../src/app.js');
 await verifyDatabase();
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 let organizationId;const userIds=[],sessions=[];
 async function request(path,{method='GET',cookie,body}={}){return fetch(base+path,{method,headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'retail-web',...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});}
 async function fixture(role,orgId,name){
  const [created]=await pool.execute('INSERT INTO users(organization_id,email,password_hash,full_name,role) VALUES (?,?,?,?,?)',[orgId,`support-${randomUUID()}@example.test`,'test-placeholder-hash',name,role]);userIds.push(created.insertId);
  const session=randomUUID();sessions.push(session);await pool.execute('INSERT INTO auth_sessions(id,organization_id,user_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))',[session,orgId,created.insertId]);
  const token=jwt.sign({},config.secret,{algorithm:'HS256',subject:String(created.insertId),jwtid:session,issuer:'retail-app',audience:'retail-web',expiresIn:'10m'});return {id:created.insertId,cookie:`session=${token}`};
 }
 try{
  const [org]=await pool.execute('INSERT INTO organizations(name,slug) VALUES (?,?)',['Cửa hàng Chat Test',randomUUID()]);organizationId=org.insertId;
  const owner=await fixture('OWNER',organizationId,'Nguyễn Chủ Shop'),other=await fixture('CASHIER',organizationId,'Thu ngân khác'),admin=await fixture('PLATFORM_ADMIN',null,'Admin Hỗ trợ');
  let response=await request('/support/threads',{cookie:owner.cookie});assert.equal(response.status,200,await response.clone().text());
  const created=await response.json(),threadId=created.thread.id;assert.equal(created.thread.messages.length,0);

  response=await request('/support/directory',{cookie:other.cookie});assert.equal(response.status,200);assert.ok((await response.json()).members.some(member=>Number(member.id)===Number(owner.id)));
  response=await request('/support/threads',{method:'POST',cookie:other.cookie,body:{recipient_user_id:owner.id}});assert.equal(response.status,201,await response.clone().text());
  const internalThread=(await response.json()).thread;assert.equal(internalThread.thread_type,'INTERNAL_CHAT');
  response=await request(`/support/threads/${internalThread.id}/messages`,{method:'POST',cookie:other.cookie,body:{content:'Thu ngân nhắn Chủ cửa hàng trong cùng tổ chức.'}});assert.equal(response.status,201,await response.clone().text());
  let ownerThreads=await (await request('/support/threads',{cookie:owner.cookie})).json();
  const internalForOwner=ownerThreads.threads.find(item=>Number(item.id)===Number(internalThread.id));assert.equal(internalForOwner.peer_name,'Thu ngân khác');assert.equal(internalForOwner.unread_count,1);
  const internalAdminThreads=await (await request('/support/threads',{cookie:admin.cookie})).json();assert.equal(internalAdminThreads.threads.some(item=>Number(item.id)===Number(internalThread.id)),false);
  await request(`/support/threads/${internalThread.id}/messages`,{cookie:owner.cookie});
  response=await request(`/support/threads/${internalThread.id}/messages`,{method:'POST',cookie:owner.cookie,body:{content:'Đã nhận được tin nhắn.'}});assert.equal(response.status,201,await response.clone().text());
  response=await request(`/support/threads/${internalThread.id}/messages`,{cookie:other.cookie});assert.equal(response.status,200);assert.equal((await response.json()).messages.length,2);

  response=await request(`/support/threads/${threadId}/category`,{method:'PATCH',cookie:owner.cookie,body:{category:'WEB_DESIGN'}});assert.equal(response.status,200);assert.equal((await response.json()).thread.category,'WEB_DESIGN');
  const adminCategoryThreads=await (await request('/support/threads',{cookie:admin.cookie})).json();assert.equal(adminCategoryThreads.threads.find(item=>Number(item.id)===Number(threadId)).category,'WEB_DESIGN');
  response=await request('/platform/tickets',{cookie:admin.cookie});assert.equal(response.status,200);assert.ok((await response.json()).tickets.some(item=>Number(item.thread_id)===Number(threadId)&&item.category==='ONLINE_WEB_REQUEST'));
  response=await request(`/support/threads/${threadId}/status`,{method:'PATCH',cookie:admin.cookie,body:{status:'IN_PROGRESS'}});assert.equal(response.status,200);
  const [webTicket]=await pool.execute("INSERT INTO support_tickets(organization_id,user_id,category,subject,message,contact_info) VALUES (?,?,'ONLINE_WEB_REQUEST','Đăng ký thiết kế website','Cần tư vấn website bán hàng.','shop@example.test')",[organizationId,owner.id]);
  response=await request(`/platform/tickets/${webTicket.insertId}/conversation`,{method:'POST',cookie:admin.cookie});assert.equal(response.status,200);const linkedThread=(await response.json()).thread_id;
  const linkedDetail=await (await request(`/support/threads/${linkedThread}/messages`,{cookie:admin.cookie})).json();assert.equal(linkedDetail.thread.category,'WEB_DESIGN');assert.match(linkedDetail.messages.at(-1).content,/Cần tư vấn website bán hàng/);

  response=await request(`/support/threads/${threadId}/typing`,{method:'POST',cookie:owner.cookie,body:{is_typing:true}});assert.equal(response.status,200);
  let typingThreads=await (await request('/support/threads',{cookie:admin.cookie})).json();assert.equal(typingThreads.threads.find(item=>Number(item.id)===Number(threadId)).peer_is_typing,true);
  let typingDetail=await (await request(`/support/threads/${threadId}/messages`,{cookie:admin.cookie})).json();assert.equal(typingDetail.peer_is_typing,true);
  await request(`/support/threads/${threadId}/typing`,{method:'POST',cookie:owner.cookie,body:{is_typing:false}});

  response=await request(`/support/threads/${threadId}/messages`,{method:'POST',cookie:owner.cookie,body:{content:'POS của tôi cần hỗ trợ kiểm tra tồn kho.'}});assert.equal(response.status,201,await response.clone().text());const sentMessage=(await response.json()).message;
  assert.equal((await request(`/support/messages/${sentMessage.id}/recall`,{method:'POST',cookie:other.cookie,body:{}})).status,403);
  response=await request(`/support/messages/${sentMessage.id}/recall`,{method:'POST',cookie:owner.cookie,body:{}});assert.equal(response.status,200);assert.equal((await response.json()).message.is_recalled,1);
  let adminThreads=await (await request('/support/threads',{cookie:admin.cookie})).json();const adminThread=adminThreads.threads.find(item=>Number(item.id)===Number(threadId));assert.equal(adminThread.user_full_name,'Nguyễn Chủ Shop');assert.equal(adminThread.organization_name,'Cửa hàng Chat Test');assert.equal(Number(adminThread.unread_admin_count),1);assert.equal(adminThread.last_message_preview,'Tin nhắn đã được thu hồi');
  let adminNotifications=await (await request('/notifications',{cookie:admin.cookie})).json();const incoming=adminNotifications.items.find(item=>Number(item.thread_id)===Number(threadId));assert.equal(incoming.kind,'SUPPORT_CHAT');assert.equal(incoming.read,false);assert.equal(adminNotifications.unread_contact_count,1);
  response=await request(`/support/threads/${threadId}/messages`,{method:'POST',cookie:owner.cookie,body:{content:'Tin nhắn thứ hai.'}});assert.equal(response.status,201,await response.clone().text());
  response=await request(`/support/threads/${threadId}/messages`,{method:'POST',cookie:owner.cookie,body:{content:'Tin nhắn mới nhất.'}});assert.equal(response.status,201,await response.clone().text());
  adminNotifications=await (await request('/notifications',{cookie:admin.cookie})).json();const grouped=adminNotifications.items.filter(item=>Number(item.thread_id)===Number(threadId)&&!item.read);assert.equal(grouped.length,1);assert.equal(grouped[0].title,'Bạn có tin nhắn từ Nguyễn Chủ Shop');assert.equal(grouped[0].message,'Tin nhắn mới nhất.');assert.equal(adminNotifications.unread_contact_count,1);
  response=await request('/notifications/read',{method:'PATCH',cookie:admin.cookie,body:{ids:[grouped[0].id]}});assert.equal(response.status,200,await response.clone().text());
  adminNotifications=await (await request('/notifications',{cookie:admin.cookie})).json();assert.equal(adminNotifications.items.some(item=>Number(item.thread_id)===Number(threadId)),false);assert.equal(adminNotifications.unread_contact_count,0);
  assert.equal((await request(`/support/threads/${threadId}/messages`,{cookie:other.cookie})).status,403);

  response=await request(`/support/threads/${threadId}/messages`,{cookie:admin.cookie});assert.equal(response.status,200);let detail=await response.json();assert.equal(detail.messages.length,4);const recalledDetail=detail.messages.find(message=>Number(message.id)===Number(sentMessage.id));assert.equal(recalledDetail.is_recalled,1);assert.equal(recalledDetail.content,null);assert.equal(Number(detail.thread.unread_admin_count),0);
  adminNotifications=await (await request('/notifications',{cookie:admin.cookie})).json();assert.equal(adminNotifications.items.some(item=>Number(item.thread_id)===Number(threadId)),false);assert.equal(adminNotifications.unread_contact_count,0);

  response=await request(`/support/threads/${threadId}/messages`,{method:'POST',cookie:admin.cookie,body:{content:'Đội ngũ đã tiếp nhận và đang hỗ trợ bạn.'}});assert.equal(response.status,201,await response.clone().text());
  response=await request(`/support/threads/${threadId}/typing`,{method:'POST',cookie:admin.cookie,body:{is_typing:true}});assert.equal(response.status,200);
  typingThreads=await (await request('/support/threads',{cookie:owner.cookie})).json();assert.equal(typingThreads.thread.peer_is_typing,true);
  await request(`/support/threads/${threadId}/typing`,{method:'POST',cookie:admin.cookie,body:{is_typing:false}});
  let userNotifications=await (await request('/notifications',{cookie:owner.cookie})).json();const reply=userNotifications.items.find(item=>Number(item.thread_id)===Number(threadId));assert.equal(reply.title,'Bạn có tin nhắn từ Đội ngũ Hỗ trợ Retail Insight');assert.equal(reply.read,false);assert.equal(userNotifications.unread_contact_count,1);
  detail=await (await request(`/support/threads/${threadId}/messages`,{cookie:owner.cookie})).json();assert.equal(detail.messages.length,5);assert.equal(detail.messages[4].sender_role,'ADMIN');assert.equal(Number(detail.thread.unread_user_count),0);
  userNotifications=await (await request('/notifications',{cookie:owner.cookie})).json();assert.equal(userNotifications.items.some(item=>Number(item.thread_id)===Number(threadId)),false);assert.equal(userNotifications.unread_contact_count,0);
  response=await request(`/support/threads/${internalThread.id}`,{method:'DELETE',cookie:other.cookie});assert.equal(response.status,204);
  response=await request(`/support/threads/${threadId}`,{method:'DELETE',cookie:admin.cookie});assert.equal(response.status,204);
  adminThreads=await (await request('/support/threads',{cookie:admin.cookie})).json();assert.equal(adminThreads.threads.some(item=>Number(item.id)===Number(threadId)),false);
  ownerThreads=await (await request('/support/threads',{cookie:owner.cookie})).json();const remainingAdminThreads=ownerThreads.threads.filter(item=>item.thread_type==='ADMIN_SUPPORT');assert.equal(remainingAdminThreads.length,1);assert.notEqual(Number(remainingAdminThreads[0].id),Number(threadId));
 }catch(error){console.error('SUPPORT INTEGRATION FAILURE',error);throw error;}finally{
  if(sessions.length)await pool.execute(`DELETE FROM auth_sessions WHERE id IN (${sessions.map(()=>'?').join(',')})`,sessions);
  const fixtureIds=userIds.filter(Boolean);if(fixtureIds.length){await pool.execute(`DELETE FROM support_tickets WHERE user_id IN (${fixtureIds.map(()=>'?').join(',')})`,fixtureIds);await pool.execute(`DELETE FROM users WHERE id IN (${fixtureIds.map(()=>'?').join(',')})`,fixtureIds);}
  if(organizationId)await pool.execute('DELETE FROM organizations WHERE id=?',[organizationId]);
  server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));await pool.end();
 }
});
