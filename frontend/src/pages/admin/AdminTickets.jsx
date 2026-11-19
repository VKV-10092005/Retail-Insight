import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {MessageCircle,X} from 'lucide-react';
import './AdminTickets.css';
import {apiUrl} from '../../services/apiUrl';

function request(url,opts={}){
 return fetch(apiUrl(url),{credentials:'include',headers:{'X-Requested-With':'retail-web','Content-Type':'application/json'},...opts})
  .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.message||r.statusText);return d;});
}
const STATUS_LABEL={NEW:'Mới',IN_PROGRESS:'Đang tư vấn',COMPLETED:'Hoàn thành'};
const STATUS_KEYS=['Nền tảng','Tính năng ưu tiên','Quy mô','Ngân sách dự kiến','Tiến độ mong muốn','Mô tả nhu cầu'];
function parseIntake(content=''){
 const fields={};
 for(const line of String(content).split('\n')){
  const split=line.indexOf(':');if(split<0)continue;
  const key=line.slice(0,split).trim();if(STATUS_KEYS.includes(key))fields[key]=line.slice(split+1).trim();
 }
 return fields;
}
export default function AdminTickets(){
 const navigate=useNavigate();
 const [tickets,setTickets]=useState([]),[loading,setLoading]=useState(true),[err,setErr]=useState(''),[selected,setSelected]=useState(null);
 async function load(){try{setLoading(true);setErr('');const data=await request('/platform/tickets');setTickets(data.tickets||[]);}catch(e){setErr(e.message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function changeStatus(ticket,status){try{await request(`/support/threads/${ticket.thread_id}/status`,{method:'PATCH',body:JSON.stringify({status})});setTickets(rows=>rows.map(row=>row.id===ticket.id?{...row,status}:row));if(selected?.id===ticket.id)setSelected(row=>({...row,status}));}catch(e){alert(e.message);}}
 function openChat(ticket){navigate(`/support?threadId=${encodeURIComponent(ticket.thread_id)}`);}
 const details=selected?parseIntake(selected.message):{};
 return <div className="page-wrapper admin-tickets-page">
  <div className="page-header"><div><h1 className="page-title">Yêu cầu Thiết kế Website</h1><p className="page-subtitle">Chỉ hiển thị hồ sơ sau khi cửa hàng gửi mô tả nhu cầu.</p></div><button className="ri-btn ri-btn-primary" onClick={()=>void load()} disabled={loading}>{loading?'Đang tải...':'Làm mới'}</button></div>
  {err&&<div className="op-state admin-tickets-error" role="alert">{err}</div>}
  {loading?<div className="op-state" role="status">Đang tải hồ sơ...</div>:<div className="card admin-tickets-table-wrap"><table className="ri-table"><thead><tr><th>Mã yêu cầu</th><th>Cửa hàng</th><th>Người gửi</th><th>Loại</th><th>Trạng thái</th><th>Ngày tạo</th><th>Xử lý</th></tr></thead><tbody>
   {!tickets.length&&<tr><td colSpan={7} className="admin-tickets-empty">Chưa có hồ sơ nhu cầu thiết kế Website / App.</td></tr>}
   {tickets.map(ticket=><tr key={ticket.id}><td>#{ticket.thread_id}</td><td>{ticket.org_name||'—'}</td><td>{ticket.user_name||ticket.user_email}</td><td><span className="admin-ticket-type">Thiết kế Website</span></td><td><select aria-label={`Trạng thái yêu cầu ${ticket.thread_id}`} value={ticket.status||'NEW'} onChange={event=>void changeStatus(ticket,event.target.value)}>{Object.entries(STATUS_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td><td>{ticket.created_at?new Date(ticket.created_at).toLocaleDateString('vi-VN'):''}</td><td><div className="admin-ticket-actions"><button className="ri-btn ri-btn-primary ri-btn-sm" onClick={()=>openChat(ticket)}>Nhắn tin tư vấn</button><button className="ri-btn ri-btn-secondary ri-btn-sm" onClick={()=>setSelected(ticket)}>Chi tiết</button></div></td></tr>)}
  </tbody></table></div>}
  {selected&&<div className="admin-ticket-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setSelected(null);}}><section className="admin-ticket-modal" role="dialog" aria-modal="true" aria-labelledby="admin-ticket-title"><header className="admin-ticket-modal-header"><div><span className="admin-ticket-eyebrow">HỒ SƠ TƯ VẤN</span><h2 id="admin-ticket-title">Hồ sơ Nhu cầu Thiết kế Website / App</h2><p>{selected.org_name||'Cửa hàng'} <span>·</span> {selected.user_name||selected.user_email}</p></div><button type="button" className="admin-ticket-close" aria-label="Đóng" onClick={()=>setSelected(null)}><X size={20}/></button></header>
   <div className="admin-ticket-detail-grid">{STATUS_KEYS.map(key=><div key={key} className={`admin-ticket-detail ${key==='Mô tả nhu cầu'?'description':''}`}><strong>{key}</strong><div>{key==='Tính năng ưu tiên'?(details[key]&&details[key]!=='Chưa chọn'?details[key].split(', ').map(feature=><span className="admin-ticket-feature" key={feature}>{feature}</span>):<span className="admin-ticket-muted">Chưa chọn</span>):details[key]||<span className="admin-ticket-muted">Chưa bổ sung</span>}</div></div>)}</div>
   <footer className="admin-ticket-modal-footer"><button className="ri-btn ri-btn-primary admin-ticket-chat-button" onClick={()=>openChat(selected)}><MessageCircle size={16}/> Nhắn tin tư vấn →</button></footer>
  </section></div>}
 </div>;
}
