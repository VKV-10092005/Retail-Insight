import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../../auth/AuthContext';
import {Bell,Check,ExternalLink,RefreshCw,Trash2} from 'lucide-react';
import {getNotifications,getNotification,markNotificationsRead,deleteNotifications,runNotificationDigest,NOTIFICATIONS_CHANGED_EVENT} from '../../services/notifications';
import DigestDetails from './DigestDetails';
import useAppSettings from '../../hooks/useAppSettings';
import {playNotificationSound} from '../../utils/notificationSound';
import {request} from '../../operations/shared';
import {useBranch} from '../../branches/BranchContext';

const dateLabel=value=>{
 const date=new Date(value);if(Number.isNaN(date.getTime()))return 'Vừa cập nhật';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'2-digit',hourCycle:'h23'}).formatToParts(date).map(part=>[part.type,part.value]));
 return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
};

export default function NotificationBell(){
 const [open,setOpen]=useState(false),[items,setItems]=useState([]),[unread,setUnread]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(false),[marking,setMarking]=useState(''),[selected,setSelected]=useState([]),[detail,setDetail]=useState(null),[filter,setFilter]=useState('ALL'),[tab,setTab]=useState('STORE');
 const root=useRef(null),navigate=useNavigate();
 const {user}=useAuth();
 const appSettings=useAppSettings(user?.id,user?.role),{activeBranchId}=useBranch();const previousNotifications=useRef(null);
 const [lowStockAlerts,setLowStockAlerts]=useState([]);
 const lowStockReadKey=`ri_low_stock_alerts_read_${user?.id||'user'}`;
 const load=useCallback(async()=>{
  setLoading(true);
  try{const data=await getNotifications(),next=data.items||[],nextUnread=Number(data.unread_count||0),snapshot=new Map(next.map(item=>[item.id,`${item.read?'1':'0'}|${item.created_at||''}|${item.message||''}`]));if(previousNotifications.current){const previous=previousNotifications.current,hasNewUnread=nextUnread>previous.unread||next.some(item=>!item.read&&previous.items.get(item.id)!==snapshot.get(item.id));if(hasNewUnread)void playNotificationSound();}previousNotifications.current={unread:nextUnread,items:snapshot};setItems(next);setSelected(current=>current.filter(id=>next.some(item=>item.id===id)));setUnread(nextUnread);setError('');}
  catch(reason){setError(reason.message||'Không tải được thông báo.');}
  finally{setLoading(false);}
 },[user?.id]);

 useEffect(()=>{load();const timer=setInterval(load,4000);return()=>clearInterval(timer);},[load]);
 useEffect(()=>{const refresh=()=>void load();window.addEventListener(NOTIFICATIONS_CHANGED_EVENT,refresh);return()=>window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT,refresh);},[load]);
 useEffect(()=>{
  if(!appSettings.ai?.autoLowStockNotifications||!['OWNER','MANAGER','INVENTORY'].includes(user?.role)){setLowStockAlerts([]);return;}
  let live=true;
  const refresh=async()=>{try{const data=await request(`/inventory?all=1${activeBranchId?`&branch_id=${encodeURIComponent(activeBranchId)}`:''}`);let readIds=[];try{readIds=JSON.parse(localStorage.getItem(lowStockReadKey)||'[]');}catch{}const next=(data.items||[]).filter(item=>Number(item.quantity)<=Number(item.alert_threshold??item.min_stock??0)).map(item=>{const id=`low-stock:${item.branch_id}:${item.product_id}`;return {id,kind:'LOW_STOCK',title:`Sắp hết hàng: ${item.name}`,message:`${item.sku} · Tồn ${item.quantity}, ngưỡng ${item.alert_threshold??item.min_stock??0}`,href:'/inventory',read:readIds.includes(id),created_at:data.as_of||new Date().toISOString()};});if(live)setLowStockAlerts(next);}catch{if(live)setLowStockAlerts([]);}};
  void refresh();const timer=setInterval(refresh,60000);return()=>{live=false;clearInterval(timer);};
 },[appSettings.ai?.autoLowStockNotifications,user?.role,activeBranchId,lowStockReadKey]);
 useEffect(()=>{
  if(!open)return;
  const close=event=>{if(root.current&&!root.current.contains(event.target))setOpen(false);};
  document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);
 },[open]);

 async function markRead(id){
  setMarking(id);
  try{const contact=items.some(item=>item.id===id&&item.kind==='SUPPORT_CHAT');await markNotificationsRead([id]);setItems(current=>contact?current.filter(item=>item.id!==id):current.map(item=>item.id===id?{...item,read:true}:item));setUnread(count=>Math.max(0,count-1));if(contact)await load();}
  catch(reason){setError(reason.message||'Không thể đánh dấu đã đọc.');}
  finally{setMarking('');}
 }
 async function openItem(item){
  if(item.kind==='LOW_STOCK'){markLowStockRead(item);setOpen(false);navigate('/inventory');return;}
  if(!item.read)await markRead(item.id);
  if(String(item.id).startsWith('digest:')){try{setDetail(await getNotification(item.id));}catch(reason){setError(reason.message);}return;}
  setOpen(false);navigate(item.href||'/');
 }
 function markLowStockRead(item){const next=new Set();try{for(const id of JSON.parse(localStorage.getItem(lowStockReadKey)||'[]'))next.add(id);}catch{}next.add(item.id);try{localStorage.setItem(lowStockReadKey,JSON.stringify([...next]));}catch{}setLowStockAlerts(current=>current.map(alert=>alert.id===item.id?{...alert,read:true}:alert));}
 async function removeSelected(ids){
  const deletable=ids.filter(id=>String(id).startsWith('digest:'));if(!deletable.length)return;
  try{await deleteNotifications(deletable);setItems(current=>current.filter(item=>!deletable.includes(item.id)));setSelected(current=>current.filter(id=>!deletable.includes(id)));setDetail(null);}
  catch(reason){setError(reason.message||'Không xóa được thông báo.');}
 }
 async function runDigest(type){try{await runNotificationDigest(type);await load();}catch(reason){setError(reason.message||'Không tạo được báo cáo tổng hợp.');}}
 const storeItems=[...items.filter(item=>item.kind!=='SUPPORT_CHAT'),...lowStockAlerts],contactItems=items.filter(item=>item.kind==='SUPPORT_CHAT');
 const storeUnread=storeItems.filter(item=>!item.read).length,contactUnread=contactItems.filter(item=>!item.read).length,displayUnread=unread+lowStockAlerts.filter(item=>!item.read).length;
 const visibleItems=(tab==='CONTACT'?contactItems:storeItems).filter(item=>filter==='ALL'||(filter==='UNREAD'?!item.read:item.read));

 return <div ref={root} style={{position:'relative'}}>
  <button type="button" className="icon-button" aria-label={displayUnread?`Thông báo, ${displayUnread} chưa đọc`:'Thông báo'} title="Thông báo" aria-expanded={open} onClick={()=>setOpen(value=>!value)} style={{position:'relative'}}>
   <Bell size={19}/>{displayUnread>0&&<span aria-hidden="true" style={{position:'absolute',right:2,top:1,minWidth:16,height:16,padding:'0 4px',borderRadius:999,background:'var(--ri-danger,#d92d20)',color:'#fff',fontSize:10,lineHeight:'16px',fontWeight:700}}>{displayUnread>99?'99+':displayUnread}</span>}
  </button>
  {open&&<div role="dialog" aria-label="Thông báo" style={{position:'absolute',zIndex:300,top:'calc(100% + 8px)',right:-56,width:'min(352px,calc(100vw - 20px))',maxHeight:'min(74vh,580px)',overflowY:'auto',background:'var(--ri-surface)',border:'1px solid var(--ri-border)',borderRadius:11,boxShadow:'var(--ri-shadow-lg)',padding:9}}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,marginBottom:8}}><strong>Thông báo</strong><button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}><RefreshCw size={14}/> Làm mới</button></div>
   <div role="tablist" aria-label="Nhóm thông báo" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,padding:3,marginBottom:8,borderRadius:9,background:'var(--ri-elevated)'}}>{[['STORE','Cửa hàng',storeUnread],['CONTACT','Liên hệ',contactUnread]].map(([value,label,count])=><button type="button" role="tab" aria-selected={tab===value} key={value} onClick={()=>{setTab(value);setSelected([]);}} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,minHeight:32,padding:'6px 10px',border:tab===value?'1px solid var(--ri-border)':'1px solid transparent',borderRadius:7,background:tab===value?'var(--ri-surface)':'transparent',color:tab===value?'var(--ri-primary)':'var(--ri-muted)',fontSize:13,fontWeight:800,cursor:'pointer',boxShadow:tab===value?'0 2px 7px rgba(15,23,42,.06)':'none'}}>{label}{count>0&&<span style={{display:'grid',placeItems:'center',minWidth:18,height:18,padding:'0 4px',borderRadius:999,background:'var(--ri-danger)',color:'#fff',fontSize:9}}>{count>99?'99+':count}</span>}</button>)}</div>
   <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:7}}><select aria-label="Lọc thông báo" value={filter} onChange={e=>setFilter(e.target.value)} style={{height:34,padding:'0 10px',border:'1px solid var(--ri-border, var(--border, #CBD5E1))',borderRadius:8,background:'var(--ri-elevated, var(--bg-subtle, #F8FAFC))',color:'var(--ri-text)',fontSize:12}}><option value="ALL">Tất cả</option><option value="UNREAD">Chưa đọc</option><option value="READ">Đã đọc</option></select>
    {selected.length>0&&<div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'var(--ri-muted)',marginLeft:'auto'}}><span>Đã chọn {selected.length} thông báo</span><button type="button" className="btn btn-secondary btn-sm" onClick={()=>removeSelected(selected)}><Trash2 size={13}/> Xóa đã chọn</button></div>}
   </div>
   {tab==='STORE'&&['OWNER','MANAGER'].includes(user?.role)&&<div style={{display:'flex',gap:6,marginBottom:8}}><button className="btn btn-secondary btn-sm" onClick={()=>runDigest('DAILY')}>Tạo tổng kết ngày</button><button className="btn btn-secondary btn-sm" onClick={()=>runDigest('MONTHLY')}>Tạo tổng kết tháng</button></div>}
   {error&&<p role="alert" style={{color:'var(--ri-danger)',fontSize:13}}>{error}</p>}
   {loading&&!items.length?<p className="muted">Đang tải thông báo…</p>:!visibleItems.length?<p className="muted">Chưa có thông báo phù hợp.</p>:<div style={{display:'grid',gap:6}}>{visibleItems.map(item=>{
    const digest=String(item.id).startsWith('digest:'),contact=item.kind==='SUPPORT_CHAT';
    return <article key={item.id} style={{display:'flex',alignItems:'flex-start',gap:8,padding:8,border:'1px solid var(--ri-border)',borderRadius:8,background:item.read?'transparent':'var(--ri-elevated)'}}>
     <div style={{width:18,flex:'0 0 18px',paddingTop:2}}>{digest&&<input type="checkbox" aria-label={`Chọn thông báo ${item.title} để xóa`} checked={selected.includes(item.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/>}</div>
     <button type="button" onClick={()=>openItem(item)} style={{display:'grid',flex:'1 1 auto',minWidth:0,gap:4,textAlign:'left',border:0,background:'transparent',padding:0,color:'var(--ri-text)',cursor:'pointer'}}><strong style={{fontSize:13}}>{item.title}</strong>{contact&&item.sender_name&&<small style={{color:'var(--ri-primary)',fontWeight:700}}>{item.sender_name}{item.organization_name?` · ${item.organization_name}`:''}</small>}<span style={{fontSize:12,color:'var(--ri-muted)',lineHeight:1.45}}>{item.message}</span><small className="muted">{dateLabel(item.created_at)}</small></button>
     <div style={{display:'flex',flex:'0 0 auto',alignItems:'center',gap:4}}><button type="button" className="icon-button" aria-label={`Mở thông báo ${item.title}`} title="Xem chi tiết" onClick={()=>openItem(item)}><ExternalLink size={15}/></button>{!item.read&&<button type="button" className="icon-button" aria-label="Đánh dấu đã đọc" title="Đánh dấu đã đọc" disabled={marking===item.id} onClick={()=>item.kind==='LOW_STOCK'?markLowStockRead(item):markRead(item.id)}><Check size={15}/></button>}{digest&&<button type="button" className="icon-button" aria-label={`Xóa thông báo ${item.title}`} title="Xóa" onClick={()=>removeSelected([item.id])}><Trash2 size={15}/></button>}</div>
    </article>;
   })}</div>}
  </div>}
  {detail&&<div className="modal-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setDetail(null);}} style={{zIndex:1200}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="digest-title" style={{width:"min(900px,96vw)",maxHeight:"88vh",overflowY:"auto"}}><header style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:12}}><div><h2 id="digest-title" style={{margin:"0 0 5px"}}>{detail.title}</h2><p className="muted">{detail.period_key} · {detail.digest_type}</p></div><button className="btn btn-secondary btn-sm" onClick={()=>setDetail(null)}>Đóng</button></header><DigestDetails body={detail.body} role={user?.role}/></section></div>}
 </div>;
}
