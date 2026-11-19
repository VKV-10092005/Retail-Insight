import React,{useEffect,useMemo,useState} from 'react';
import {PageHeader,Card} from '../../components/ui/Elements';
import {useResource,State,Table,number,params,AiResultNotice} from '../shared';
import AiOfflineCard,{isAiOfflineError} from './AiOfflineCard';
import AiFeatureGuideBanner from './AiFeatureGuideBanner';
import { ForecastMultiChart } from './ForecastBI';
import {BranchSelect,useBranch} from '../../branches/BranchContext';

export default function ForecastMulti(){
  const lastMonth=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()-1,1)).toISOString().slice(0,7);
  const {activeBranchId:branchId}=useBranch();
  const [origin,setOrigin]=useState(lastMonth),[search,setSearch]=useState(''),[selected,setSelected]=useState([]);
  const branchQuery=branchId?`&branch_id=${branchId}`:'';
  const products1=useResource('/products?limit=100&page=1'+branchQuery),products2=useResource('/products?limit=100&page=2'+branchQuery);
  const ready=useResource('/ai/readiness');
  const products=useMemo(()=>[...(products1.data?.items||[]),...(products2.data?.items||[])].filter(p=>p.status==='ACTIVE'), [products1.data,products2.data]);
  useEffect(()=>{
    if(selected.length||products1.loading||products2.loading||!products.length)return;
    setSelected(products.slice(0,5).map(p=>String(p.id)));
  },[products,products1.loading,products2.loading,selected.length]);
  const visible=products.filter(p=>`${p.sku} ${p.name}`.toLowerCase().includes(search.toLowerCase()));
  const query=params({task:'multi_sku',branch_id:branchId,origin,product_ids:selected.join(',')});
  const forecast=useResource(selected.length?`/ai/forecast?${query}`:null);
  const offline=isAiOfflineError(forecast?.error)||(!forecast?.loading&&!forecast?.data&&isAiOfflineError(ready?.error));
  const toggle=id=>setSelected(current=>current.includes(String(id))?current.filter(value=>value!==String(id)):[...current,String(id)]);
  return <div className="ai-page-container">
    <PageHeader eyebrow="DỰ BÁO HÀNG LOẠT" title="Dự báo nhiều sản phẩm" description="Chọn các sản phẩm cần dự báo. Kết quả gồm nhu cầu kỳ tới, tồn kho hiện tại và ngưỡng tồn tối thiểu."/>
    <AiFeatureGuideBanner pageKey="forecast-multi">Phân tích xu hướng tăng trưởng và tính mùa vụ dài hạn (3–12 tháng tới) theo từng nhóm danh mục, giúp chủ cửa hàng quyết định mở rộng ngành hàng, thương lượng chiết khấu nhà cung cấp hoặc mở thêm chi nhánh.</AiFeatureGuideBanner>
    <Card style={{marginBottom:20}}>
      <div className="ai-filter-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))'}}>
        <label className="ai-filter-item"><span className="ai-filter-label">Chi nhánh</span><BranchSelect/></label>
        <label className="ai-filter-item"><span className="ai-filter-label">Tháng gốc</span><input type="month" className="ri-control" value={origin} onChange={e=>setOrigin(e.target.value)}/></label>
        <label className="ai-filter-item"><span className="ai-filter-label">Tìm mã sản phẩm / tên sản phẩm</span><input className="ri-control" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nhập từ khóa"/></label>
      </div>
      <div style={{display:'flex',gap:8,margin:'12px 0'}}><button className="btn btn-secondary" type="button" onClick={()=>setSelected(products.map(p=>String(p.id)))} disabled={!products.length}>Chọn tất cả ({products.length})</button><button className="btn btn-secondary" type="button" onClick={()=>setSelected([])}>Bỏ chọn</button><span className="muted" style={{alignSelf:'center'}}>{selected.length} sản phẩm đã chọn</span></div>
      {(products1.error||products2.error)&&<p role="alert">Không tải được danh sách sản phẩm: {products1.error||products2.error}</p>}
      <div style={{maxHeight:260,overflowY:'auto',border:'1px solid var(--ri-border)',borderRadius:8,padding:8,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:6}} aria-label="Danh sách sản phẩm">
        {visible.map(p=><label key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:6,minWidth:0}}><input type="checkbox" checked={selected.includes(String(p.id))} onChange={()=>toggle(p.id)}/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.sku} · {p.name}</span></label>)}
        {!visible.length&&<span className="muted">Không tìm thấy sản phẩm phù hợp.</span>}
      </div>
    </Card>
    {offline&&<AiOfflineCard onRetry={()=>{forecast?.reload();ready?.reload();}} loading={forecast?.loading||ready?.loading}/>}
    {!offline&&selected.length===0&&<Card><p>Chọn ít nhất một sản phẩm để chạy dự báo hàng loạt.</p></Card>}
    {!offline&&selected.length>0&&<State resource={forecast}>{result=>{
      const rows=result?.items||[];const total=rows.reduce((sum,row)=>sum+Number(row.quantity||0),0);const below=rows.filter(row=>row.stock!=null&&row.min_stock!=null&&row.stock<=row.min_stock).length;
      return <><AiResultNotice result={result}/><div className="stat-grid three"><Card className="stat"><div className="stat-top">Sản phẩm có dự báo</div><strong>{rows.length} / {selected.length}</strong></Card><Card className="stat"><div className="stat-top">Tổng nhu cầu kỳ tới</div><strong>{number(total)}</strong></Card><Card className="stat"><div className="stat-top">Sản phẩm tại / dưới tồn tối thiểu</div><strong>{below}</strong></Card></div><ForecastMultiChart items={rows}/><Card><h2>Kết quả theo sản phẩm</h2><Table rows={rows} empty="Chưa có kết quả dự báo." columns={[["sku","Mã sản phẩm",r=><strong>{r.sku||r.product_id}</strong>],["name","Sản phẩm"],["quantity","Nhu cầu T+1",r=>number(r.quantity)],["forecast_t2","Nhu cầu T+2",r=>number(r.forecasts?.find(f=>f.horizon===2)?.quantity??0)],["forecast_t3","Nhu cầu T+3",r=>number(r.forecasts?.find(f=>f.horizon===3)?.quantity??0)],["stock","Tồn hiện tại",r=>r.stock==null?'Chưa có dữ liệu':number(r.stock)],["min_stock","Tồn tối thiểu",r=>r.min_stock==null?'Chưa đặt':number(r.min_stock)],["status","Trạng thái",r=>r.stock!=null&&r.min_stock!=null&&r.stock<=r.min_stock?'Đạt ngưỡng cảnh báo':'Đang theo dõi']]}/></Card></>;
    }}</State>}
  </div>;
}
