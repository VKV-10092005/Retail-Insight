import React,{useEffect,useState} from 'react';
import {Navigate,useNavigate} from 'react-router-dom';
import {PageHeader,Card} from '../components/ui/Elements';
import {useResource,State,Table,params,Pager,number} from './shared';
import {Bars} from './Dashboard';
import {useAuth} from '../auth/AuthContext';

export default function Research(){
 const navigate=useNavigate(),{user}=useAuth(),allowed=user?.role==='PLATFORM_ADMIN';
 const access=useResource(allowed?'/research/datasets':null);
 const [dataset,setDataset]=useState(''),[run,setRun]=useState('MA2_80_10_10_V1'),[q,setQ]=useState(''),[page,setPage]=useState(1),[inventoryPage,setInventoryPage]=useState(1);
 const status=useResource(allowed&&dataset?`/research/${dataset}/status`:null);
 const runs=useResource(allowed&&dataset?`/research/${dataset}/runs`:null);
 const results=useResource(allowed&&dataset?`/research/${dataset}/forecasts?${params({run,q,page})}`:null);
 const mysqlRuns=useResource(allowed&&dataset?`/research/${dataset}/mysql-runs`:null);
 const inventory=useResource(allowed&&dataset?`/research/${dataset}/inventory?${params({page:inventoryPage,limit:100})}`:null);
 useEffect(()=>{if(allowed&&!access.loading&&(access.error||!access.data?.items?.length))navigate(access.error?'/forbidden':'/admin',{replace:true});},[allowed,access.loading,access.error,access.data,navigate]);
 if(!allowed)return <Navigate to="/forbidden" replace/>;
 if(access.loading)return <div className="op-state" role="status">Đang kiểm tra quyền truy cập dataset nghiên cứu…</div>;
 if(access.error||!access.data?.items?.length)return null;
 return <><PageHeader title="Dataset nghiên cứu" description="Kết quả nghiên cứu được tách khỏi dữ liệu bán hàng vận hành; nguồn lịch sử được kiểm tra độc lập."/>
 <Card><State resource={access}>{data=>data?.items?.length?<label>Dataset được cấp quyền<select value={dataset} onChange={e=>setDataset(e.target.value)}><option value="">Chọn dataset</option>{data.items.map(d=><option key={d.dataset_id} value={d.dataset_id}>{d.dataset_id}</option>)}</select></label>:<p>Organization chưa được cấp quyền dataset nghiên cứu. Các chức năng vận hành vẫn dùng bình thường.</p>}</State></Card>
 {dataset&&<><Card><h2>Trạng thái nguồn dữ liệu</h2><State resource={status}>{data=><div role="status"><p>Dataset artifacts: {data.artifacts?.status==='READY'?`sẵn sàng (${data.artifacts.runs} run)`:data.artifacts?.message||'chưa sẵn sàng'}</p><p>MySQL retail_management: {data.database?.status==='READY'?`sẵn sàng · ${number(data.database.runs)} run, ${number(data.database.inventory_snapshots)} snapshot${data.database.latest_snapshot?` · mới nhất ${data.database.latest_snapshot}`:''}`:data.database?.message||'Nguồn dữ liệu chưa sẵn sàng.'}</p></div>}</State></Card>
 <Card><h2>Mục 10 — Dataset và lần chạy</h2><State resource={runs}>{data=><><label>Forecast run<select value={run} onChange={e=>{setRun(e.target.value);setPage(1);}}>{data?.runs?.map(r=><option key={r.id} value={r.id}>{r.id} · {r.forecast_month}</option>)}</select></label><Table rows={data?.runs??[]} columns={[["id","Run"],["count","SKU"],["total","Tổng dự báo",r=>number(r.total)],["source_file","Nguồn artifact"]]}/><p className="muted">Các run này là kết quả nghiên cứu đã bàn giao, không phải weights dự báo vận hành.</p><h3>Đánh giá nghiên cứu</h3><Table rows={data?.comparisons??[]} columns={[["Split","Tập"],["Model","Model"],["WAPE_%","WAPE (%)"],["MAE","MAE"],["RMSE","RMSE"]]}/></>}</State></Card>
 <Card><h2>Mục 11 — Dự báo lịch sử</h2><label>Tìm SKU<input value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></label><State resource={results}>{data=><><Bars rows={(data?.items??[]).slice(0,15).map(r=>({...r,forecast_quantity:Number(r.forecast_quantity)}))} x="product_id" value="forecast_quantity"/><Table rows={data?.items??[]} columns={[["product_id","SKU"],["forecast_month","Kỳ dự báo"],["forecast_quantity","Dự báo"],["selected_model","Model chọn"]]}/><Pager data={{...data,page}} onChange={setPage}/></>}</State></Card>
 <Card><h2>Mục 12 — Tồn kho lịch sử theo snapshot</h2><State resource={inventory}>{data=><><p>{data.snapshot?`Snapshot ${data.snapshot} · ${number(data.total)} dòng · dữ liệu ${data.source}`:'Chưa có snapshot tồn kho.'}</p><Table rows={data.items||[]} columns={[["branch_id","Chi nhánh"],["product_id","SKU"],["quantity_on_hand","Tồn kho"],["quantity_reserved","Đã giữ"],["quantity_incoming","Đang nhập"],["data_source","Nguồn"],["snapshot_date","Ngày snapshot"]]}/><Pager data={data} onChange={setInventoryPage} limit={100}/></>}</State></Card></>}
 </>;
}
