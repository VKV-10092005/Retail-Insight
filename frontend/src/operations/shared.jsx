import React,{useEffect,useState} from 'react';
import {useAuth} from '../auth/AuthContext';
import {useBranch} from '../branches/BranchContext';
import {currentSettings,formatAppNumber} from '../services/appSettings';
import {fetchWithRetry} from '../services/fetchWithRetry';
import {apiUrl} from '../services/apiUrl';

export async function request(path,{method='GET',body,signal}={}){
  const response=await fetchWithRetry(apiUrl(path),{
    method,
    signal,
    credentials:'include',
    headers:{
      Accept:'application/json',
      'Content-Type':'application/json',
      'X-Requested-With':'retail-web'
    },
    ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
  const data=response.status===204?null:await response.json();
  if(!response.ok){
    if(response.status===401)window.dispatchEvent(new Event('auth-expired'));
    const error=new Error(data?.message||'Dịch vụ không khả dụng');
    error.details=data;
    error.status=response.status;
    throw error;
  }
  return data;
}

const RESOURCE_CACHE_PREFIX='retail_api_swr_';
function cachedResource(userId,path){try{const entry=JSON.parse(sessionStorage.getItem(`${RESOURCE_CACHE_PREFIX}${userId}_${path}`)||'null');return entry?.savedAt&&Date.now()-entry.savedAt<5*60_000?entry.data:null;}catch{return null;}}
function saveResource(userId,path,data){try{sessionStorage.setItem(`${RESOURCE_CACHE_PREFIX}${userId}_${path}`,JSON.stringify({savedAt:Date.now(),data}));}catch{}}
function clearResourceCache(){try{for(let index=sessionStorage.length-1;index>=0;index--){const key=sessionStorage.key(index);if(key?.startsWith(RESOURCE_CACHE_PREFIX))sessionStorage.removeItem(key);}}catch{}}
if(typeof window!=='undefined'){window.addEventListener('api-cache-invalidate',clearResourceCache);window.addEventListener('auth-expired',clearResourceCache);}

export function useResource(path){
  const [data,setData]=useState(null),
        [error,setError]=useState(''),
        [loading,setLoading]=useState(Boolean(path)),
        [tick,setTick]=useState(0);
  const {user}=useAuth();

  useEffect(()=>{
    if(!path){
      setLoading(false);
      setData(null);
      setError('');
      return;
    }
    const c=new AbortController();
    const cached=user?.id?cachedResource(user.id,path):null;
    if(cached!==null){
      setData(cached);setError('');setLoading(false);
      request(path,{signal:c.signal}).then(data=>{if(!c.signal.aborted){if(user?.id)saveResource(user.id,path,data);setData(data);}}).catch(()=>{});
      return()=>c.abort();
    }
    setLoading(true);
    setError('');
    request(path,{signal:c.signal})
      .then(d=>{
        if(user?.id)saveResource(user.id,path,d);
        setData(d);
        setError('');
      })
      .catch(e=>{
        if(e.name!=='AbortError'){
          setError(e.message||'Lỗi tải dữ liệu');
          setData(null);
        }
      })
      .finally(()=>{
        if(!c.signal.aborted)setLoading(false);
      });
    return()=>c.abort();
  },[path,tick,user?.id]);

  return {
    data,
    error,
    loading,
    reload:()=>setTick(n=>n+1),
    mutate:updater=>setData(current=>typeof updater==='function'?updater(current):updater)
  };
}

export const money=value=>new Intl.NumberFormat(currentSettings().general.numberFormat||'vi-VN',{style:'currency',currency:'VND'}).format(Number(value)||0);
export const vndNumber=value=>{
  if(typeof value==='number')return value;
  const text=String(value??'').trim().replace(/[₫đ\s]/gi,'');
  if(!text)return NaN;
  if(text.includes('.')&&text.includes(','))return Number(text.lastIndexOf('.')>text.lastIndexOf(',')?text.replace(/,/g,''):text.replace(/\./g,'').replace(',','.'));
  if(/[.,]\d{3}(?:[.,]|$)/.test(text))return Number(text.replace(/[.,]/g,''));
  return Number(text.replace(',','.'));
};
export const number=value=>formatAppNumber(value,2);

export function State({resource,children,fallback}){
  if(!resource||resource.loading)return <div className="op-state" role="status">Đang tải dữ liệu cửa hàng…</div>;
  if(resource.error)return (
    <div className="op-state op-error" role="alert">
      <span>{resource.error}</span>
      <button type="button" className="btn btn-secondary" onClick={resource.reload}>Thử lại</button>
    </div>
  );
  if(resource.data===null||resource.data===undefined)return fallback||<div className="op-state" role="status">Đang tải dữ liệu cửa hàng…</div>;
  return children(resource.data);
}

export function Table({columns=[],rows=[],empty='Chưa có dữ liệu'}){
  const safeRows=Array.isArray(rows)?rows:[];
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>{columns.map(([key,label])=><th key={key}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {safeRows.map((row,index)=>(
            <tr key={row?.id??index}>
              {columns.map(([key,,render])=><td key={key}>{render?render(row):(row?.[key]??'—')}</td>)}
            </tr>
          ))}
          {!safeRows.length&&(
            <tr><td className="empty" colSpan={columns.length}>{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Message({error,success}){
  return (
    <>
      {error&&<p className="auth-error" role="alert">{error}</p>}
      {success&&<p className="op-success" role="status">{success}</p>}
    </>
  );
}

export function Filters({value,onChange,dates=true,products=false,calendar,showCalendar=true,syncGlobalBranch=false}){
  const {activeBranchId,activeBranch,branches:branchItems,setActiveBranchId,isOwner}=useBranch();
  const categories=useResource('/categories'+(activeBranchId?`?branch_id=${encodeURIComponent(activeBranchId)}`:''));
  const change=(key,val)=>onChange({...value,[key]:val});
  const selectedBranchId=syncGlobalBranch?activeBranchId:(value.branch_id||activeBranchId);
  const changeBranch=val=>{if(syncGlobalBranch)setActiveBranchId(val);change('branch_id',val);};
  return (
    <div className="op-filters">
      {dates&&(
        <>
          <label>Từ ngày<input type="date" value={value.start||''} onChange={e=>change('start',e.target.value)}/></label>
          <label>Đến ngày<input type="date" value={value.end||''} onChange={e=>change('end',e.target.value)}/></label>
        </>
      )}
      <label>
        Chi nhánh
        {isOwner?<select value={selectedBranchId} onChange={e=>changeBranch(e.target.value)}>{branchItems.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select>:<span className="branch-static-badge">{activeBranch?.name||`Chi nhánh #${activeBranchId}`}</span>}
      </label>
      <label>
        Danh mục
        <select value={value.category_id||''} onChange={e=>change('category_id',e.target.value)}>
          <option value="">Tất cả danh mục</option>
          {categories.data?.items?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {products&&(
        <label>
          Mã sản phẩm
          <input value={value.q||''} onChange={e=>change('q',e.target.value)} placeholder="Tìm mã hoặc tên"/>
        </label>
      )}
      {categories.error&&<p role="alert">{categories.error}</p>}
    </div>
  );
}

export function params(value){
  return new URLSearchParams(Object.entries(value).filter(([,v])=>v!==''&&v!==null&&v!==undefined)).toString();
}

export function Pager({data,onChange,limit=20}){
  const total=data?.total||0;
  const page=data?.page||1;
  const pageCount=Math.max(1,Math.ceil(total/limit));
  const first=total?((page-1)*limit)+1:0;
  const last=Math.min(page*limit,total);
  const start=Math.max(1,Math.min(page-2,pageCount-4));
  const pages=Array.from({length:Math.min(5,pageCount)},(_,index)=>start+index);
  const buttonStyle={padding:'6px 12px',minWidth:72,whiteSpace:'nowrap',borderRadius:8,width:'auto',height:36,boxSizing:'border-box',flexShrink:0};
  return (
    <div className="pagination">
      <span>Hiển thị {first}–{last} trên tổng số {total} bản ghi</span>
      <div className="pagination-buttons" style={{display:'flex',alignItems:'center',gap:6,flexWrap:'nowrap',overflowX:'auto',WebkitOverflowScrolling:'touch',maxWidth:'100%',paddingBottom:2}}>
        <button type="button" className="btn btn-secondary btn-sm" style={buttonStyle} disabled={page<=1} onClick={()=>onChange(page-1)}>‹ Trước</button>
        {pages.map(number=><button key={number} type="button" className="btn btn-secondary btn-sm" aria-current={number===page?'page':undefined} aria-label={`Trang ${number}`} style={{...buttonStyle,minWidth:40,width:40,padding:'6px 10px',background:number===page?'var(--ri-primary)':'var(--ri-surface)',color:number===page?'#fff':'var(--ri-text)',borderColor:number===page?'var(--ri-primary)':'var(--ri-border)'}} disabled={number===page} onClick={()=>onChange(number)}>{number}</button>)}
        <button type="button" className="btn btn-secondary btn-sm" style={buttonStyle} disabled={page>=pageCount} onClick={()=>onChange(page+1)}>Sau ›</button>
      </div>
    </div>
  );
}

export function ProductPicker({index,value,onChange}){
  const {activeBranchId}=useBranch();
  const [search,setSearch]=useState('');
  const found=useResource(activeBranchId?'/products?limit=20&branchId='+encodeURIComponent(activeBranchId)+'&branch_id='+encodeURIComponent(activeBranchId)+'&q='+encodeURIComponent(search):null);
  return (
    <div>
      <label>Tìm sản phẩm {index+1}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Mã hoặc tên sản phẩm"/>
      </label>
      <label>Sản phẩm {index+1}
        <select required value={value} onChange={e=>onChange(e.target.value)}>
          <option value="">Chọn sản phẩm</option>
          {value&&!found.data?.items?.some(p=>String(p.id)===String(value))&&(
            <option value={value}>Sản phẩm đã chọn #{value}</option>
          )}
          {found.data?.items?.filter(p=>p.status==='ACTIVE').map(p=>(
            <option value={p.id} key={p.id}>{p.sku} · {p.name} · {money(p.sale_price)}</option>
          ))}
        </select>
      </label>
      {found.error&&<p role="alert">{found.error}</p>}
    </div>
  );
}

export function AiResultNotice({result,partialText}){
  if(!result||result.status==='READY')return null;
  const reason=aiReason(result.reason);
  const title=result.status==='PARTIAL'?'Kết quả một phần':aiStatus(result.status);
  return <div className="demo-note" role="status" style={{marginBottom:16}}><strong>{title}</strong><span>{partialText||result.explanation||reason||'Chưa đủ dữ liệu để tính tại thời điểm này.'}{result.missing_inputs?.length?` (${result.missing_inputs.length} mặt hàng thiếu dữ liệu đầu vào.)`:''}</span></div>;
}

export function aiStatus(status){
  return {
    READY:'Đủ điều kiện',
    ADAPTIVE_FORECAST:'Dự báo thích ứng cho cửa hàng mới (tham khảo)',
    UNAVAILABLE:'Chưa sẵn sàng',
    INSUFFICIENT_HISTORY:'Chưa đủ lịch sử quan sát',
    INSUFFICIENT_DATA:'Chưa đủ dữ liệu đầu vào',
    SELECT_PRODUCT:'Cần chọn sản phẩm'
  }[status]||'Chưa xác nhận';
}

export function aiReason(reason){
  return {
    MISSING_MODEL_ARTIFACT:'Chưa có mô hình đúng phiên bản. Cần bàn giao artifact đã nghiên cứu.',
    MISSING_PREVIOUS_FORECAST_SNAPSHOT:'Chưa có bản dự báo tháng trước được lưu đúng thời điểm để hiệu chỉnh tổng nhu cầu.',
    INSUFFICIENT_SIX_MONTH_HISTORY:'Chưa đủ 6 tháng quan sát đầy đủ cho sản phẩm.',
    MISSING_PRODUCT_ATTRIBUTES:'Thiếu thuộc tính sản phẩm cần cho mô hình.',
    MISSING_PRODUCT_HISTORY_OR_ATTRIBUTES:'Lịch sử hoặc thuộc tính của một số sản phẩm chưa đầy đủ.',
    HISTORICAL_PRODUCT_ATTRIBUTE_SNAPSHOTS_NOT_AVAILABLE:'Chưa có bản chụp thuộc tính theo thời gian để dự báo hồi tố kỳ đã chọn.',
    MODEL_VERSION_NOT_LOADED:'Phiên bản mô hình đã chọn chưa được nạp.',
    MISSING_STOCK:'Chưa có bản ghi tồn đầu kỳ được xác minh.'
  }[reason]||(reason?.startsWith('INVALID_ARTIFACT_')?'Artifact mô hình chưa vượt qua kiểm tra tương thích và checksum.':reason);
}
