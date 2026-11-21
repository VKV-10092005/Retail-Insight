import React,{useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ShieldAlert,RefreshCw} from 'lucide-react';
import DigestDetails from '../../components/layout/DigestDetails';
import {apiUrl} from '../../services/apiUrl';

function request(url,opts={}){
  return fetch(apiUrl(url),{credentials:'include',headers:{'X-Requested-With':'retail-web','Content-Type':'application/json'},...opts})
    .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.message||r.statusText);return d;});
}
const money=value=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(value||0);

export default function AdminDashboard(){
  const [orgs,setOrgs]=useState([]),[stats,setStats]=useState(null),[digests,setDigests]=useState([]),[digestBusy,setDigestBusy]=useState(false);
  const [loading,setLoading]=useState(true),[err,setErr]=useState(null),[updating,setUpdating]=useState(null);
  const load=useCallback(async()=>{
    try{setLoading(true);setErr(null);const results=await Promise.allSettled([request('/platform/dashboard'),request('/platform/organizations'),request('/platform/notification-digests')]);const [summary,tenants,digestData]=results;setStats(summary.status==='fulfilled'?summary.value:null);setOrgs(tenants.status==='fulfilled'?(tenants.value.organizations||[]):[]);setDigests(digestData.status==='fulfilled'?(digestData.value.items||[]):[]);const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;}
    catch(e){setErr(e.message);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  async function toggleStatus(org){
    setUpdating(org.id);const status=org.status==='ACTIVE'?'DISABLED':'ACTIVE';
    try{await request(`/platform/organizations/${org.id}/status`,{method:'PATCH',body:JSON.stringify({status})});setOrgs(prev=>prev.map(o=>o.id===org.id?{...o,status}:o));await load();}
    catch(e){setErr(e.message);}finally{setUpdating(null);}
  }
  async function unlockOwner(org){
    if(!org.owner_id)return;
    setUpdating(`owner-${org.id}`);
    try{
      await request(`/platform/security/users/${org.owner_id}/unlock`,{method:'POST',body:JSON.stringify({reason:'Mở khóa từ trang Tổng quan nền tảng'})});
      await load();
    }catch(e){setErr(e.message);}finally{setUpdating(null);}
  }
  async function runDigest(type){setDigestBusy(true);try{await request('/platform/notification-digests/run',{method:'POST',body:JSON.stringify({type})});const data=await request('/platform/notification-digests');setDigests(data.items||[]);}catch(e){setErr(e.message);}finally{setDigestBusy(false);}}
  const cards=stats?[['Tổ chức / cửa hàng',stats.organizations.total,`${stats.organizations.active} hoạt động · ${stats.organizations.disabled} ngừng hoạt động`],['Tài khoản nhân sự',stats.users.total,`Owner ${stats.users.byRole.OWNER} · Manager ${stats.users.byRole.MANAGER} · Cashier ${stats.users.byRole.CASHIER} · ${stats.users.locked||0} bị khóa`],['Sản phẩm đang kinh doanh',stats.products.active,'Toàn nền tảng'],['Hóa đơn / doanh thu',stats.invoices.total,money(stats.invoices.revenue)]]:[];
  return <div className="page-wrapper">
    <div className="page-header"><div><h1 className="page-title">Tổng quan nền tảng</h1><p className="page-subtitle">Thống kê và quản lý các tổ chức trên Retail Insight</p></div><div style={{display:'flex',gap:10}}><Link to="/admin/security" className="ri-btn ri-btn-secondary"><ShieldAlert size={16}/> Quản lý an ninh</Link><button className="ri-btn ri-btn-primary" onClick={load} disabled={loading}><RefreshCw size={16}/> {loading?'Đang tải...':'Làm mới'}</button></div></div>
    {err&&<div className="op-state" style={{color:'var(--ri-danger)'}} role="alert">{err}</div>}
    {stats&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:16,marginBottom:24}}>{cards.map(([title,value,detail])=><div className="card" key={title}><p style={{margin:'0 0 8px',color:'var(--ri-text-muted)'}}>{title}</p><strong style={{fontSize:'1.65rem',color:'var(--ri-text)'}}>{typeof value==='number'?value.toLocaleString('vi-VN'):value}</strong><small style={{display:'block',marginTop:8,color:'var(--ri-text-muted)'}}>{detail}</small></div>)}</div>}
    <section className="card" style={{marginBottom:20}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 4px'}}>{'Tổng hợp nền tảng'}</h2><p style={{margin:0,color:'var(--ri-muted)'}}>{'Báo cáo tổng hợp dành cho Quản trị nền tảng'}</p></div><div style={{display:'flex',gap:8}}><button type="button" className="ri-btn ri-btn-secondary" disabled={digestBusy} onClick={()=>runDigest('DAILY')}>{'Tạo tổng kết ngày'}</button><button type="button" className="ri-btn ri-btn-secondary" disabled={digestBusy} onClick={()=>runDigest('MONTHLY')}>{'Tạo tổng kết tháng'}</button></div></div>{digests.length?<div style={{display:'grid',gap:8,marginTop:12}}>{digests.map(item=><details key={item.id} style={{padding:10,border:'1px solid var(--ri-border)',borderRadius:8}}><summary style={{cursor:'pointer',fontWeight:700}}>{item.title} {" | "} {item.period_key}</summary><DigestDetails body={item.body} role="PLATFORM_ADMIN"/></details>)}</div>:<p className="muted" style={{marginBottom:0}}>{'Chưa có báo cáo tổng hợp nền tảng.'}</p>}</section>
    {loading&&!stats?<div className="op-state" role="status">Đang tải số liệu...</div>:<div className="card" style={{padding:0,overflowX:'auto'}}><table className="ri-table"><thead><tr><th>ID</th><th>Tên tổ chức</th><th>Email chủ cửa hàng</th><th>Chi nhánh</th><th>Nhân sự</th><th>Sản phẩm</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
      {!orgs.length&&<tr><td colSpan={8} style={{textAlign:'center',padding:32}}>Chưa có tổ chức nào</td></tr>}
      {orgs.map(o=>{const ownerLocked=Number(o.owner_temporarily_locked)===1;const actionKey=ownerLocked?`owner-${o.id}`:o.id;const unavailable=o.status!=='ACTIVE'||ownerLocked;return <tr key={o.id}><td>#{o.id}</td><td><strong>{o.name}</strong></td><td>{o.owner_email||'—'}</td><td>{Number(o.branch_count||0)}</td><td>{Number(o.user_count||0)}</td><td>{Number(o.product_count||0)}</td><td><span className={`ri-badge ${unavailable?'ri-badge-danger':'ri-badge-success'}`}>{o.status!=='ACTIVE'?'Đã khóa':ownerLocked?'Tạm khóa':'Hoạt động'}</span></td><td><button className={`ri-btn ${o.status==='ACTIVE'&&!ownerLocked?'ri-btn-danger':'ri-btn-primary'} ri-btn-sm`} disabled={updating===actionKey} onClick={()=>ownerLocked?unlockOwner(o):toggleStatus(o)}>{updating===actionKey?'...':o.status==='ACTIVE'&&!ownerLocked?'Khóa':'Mở khóa'}</button></td></tr>;})}
    </tbody></table></div>}
  </div>;
}
