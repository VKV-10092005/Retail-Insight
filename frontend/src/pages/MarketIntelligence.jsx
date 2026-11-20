import React,{useEffect,useMemo,useState} from 'react';
import {useSearchParams,useNavigate} from 'react-router-dom';
import {ArrowUpRight,Boxes,ChartNoAxesCombined,Clock3,PackagePlus,RefreshCw,Search,ShieldCheck,TrendingDown,TrendingUp,X} from 'lucide-react';
import {useBranch} from '../branches/BranchContext';
import {PageHeader,Card,Badge} from '../components/ui/Elements';
import {request,useResource,money} from '../operations/shared';
import './MarketIntelligence.css';

const fmtDate=value=>value?new Intl.DateTimeFormat('vi-VN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Chưa có dữ liệu';
const MAX_BATCH_PRODUCTS=10;

export default function MarketIntelligence(){
 const {activeBranchId}=useBranch();
 const [searchParams,setSearchParams]=useSearchParams();
 const navigate=useNavigate();
 const productId=searchParams.get('product_id')||'';
 const [query,setQuery]=useState('');
 const [mode,setMode]=useState('priority');
 const [quantity,setQuantity]=useState('');
 const [result,setResult]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [batchProductIds,setBatchProductIds]=useState([]);
 const [batchResult,setBatchResult]=useState(null);
 const [batchBusy,setBatchBusy]=useState(false);
 const [batchError,setBatchError]=useState('');
 const [quickSelectPending,setQuickSelectPending]=useState(false);
 const products=useResource(`/market-intelligence/products?${activeBranchId?`branch_id=${encodeURIComponent(activeBranchId)}&`:''}mode=${mode}&q=${encodeURIComponent(query)}&limit=150`);
 const selected=useMemo(()=>products.data?.items?.find(item=>String(item.id)===String(productId))||null,[products.data,productId]);
 useEffect(()=>{setResult(null);setError('');},[productId]);
 useEffect(()=>{if(productId&&selected)setQuantity(String(Math.max(1,Number(selected.min_stock||1)-Number(selected.stock_quantity||0))));},[productId,selected]);
 useEffect(()=>{if(productId&&selected&&!result&&!busy)runCheck(false);},[productId,selected]);
 useEffect(()=>{setBatchResult(null);setBatchError('');},[batchProductIds.join(',')]);
 useEffect(()=>{if(!quickSelectPending||products.data?.mode!=='priority')return;setBatchProductIds((products.data.items||[]).slice(0,5).map(item=>Number(item.id)));setQuickSelectPending(false);},[quickSelectPending,products.data]);
 async function runCheck(refresh=true){
  if(!productId)return;
  setBusy(true);setError('');
  try{setResult(await request('/market-intelligence/check',{method:'POST',body:{product_id:Number(productId),quantity:Math.max(0,Number(quantity)||0),refresh}}));}
  catch(err){setError(err.message||'Không thể tra cứu giá lúc này.');}
  finally{setBusy(false);}
 }
 const clearSelection=()=>{setResult(null);setBatchResult(null);setError('');setQuantity('');setSearchParams(current=>{const next=new URLSearchParams(current);next.delete('product_id');return next;});};
 const choose=id=>{if(String(id)===productId){clearSelection();return;}setResult(null);setBatchResult(null);setSearchParams(current=>{const next=new URLSearchParams(current);next.set('product_id',String(id));return next;});};
 const changeMode=nextMode=>{if(nextMode===mode)return;setMode(nextMode);clearSelection();};
 const toggleBatchProduct=id=>{const numericId=Number(id);if(batchProductIds.includes(numericId)){setBatchProductIds(ids=>ids.filter(value=>value!==numericId));return;}if(batchProductIds.length>=MAX_BATCH_PRODUCTS){setBatchError(`Chọn tối đa ${MAX_BATCH_PRODUCTS} sản phẩm cho mỗi lần phân tích.`);return;}setBatchError('');setBatchProductIds(ids=>[...ids,numericId]);};
 const selectPriorityFive=()=>{setMode('priority');setQuickSelectPending(true);};
 const runBatchCheck=async()=>{if(batchProductIds.length<2)return;setBatchBusy(true);setBatchError('');try{setBatchResult(await request('/market-intelligence/check',{method:'POST',body:{product_ids:batchProductIds,quantity:0,refresh:false}}));}catch(err){setBatchError(err.message||'Không thể phân tích hàng loạt lúc này.');}finally{setBatchBusy(false);}};
 const createBatchReceiptDraft=()=>{const items=(batchResult?.items||[]).map(row=>{const listed=(products.data?.items||[]).find(item=>Number(item.id)===Number(row.product.id));const supplier=row.sourcing_suggestions?.[0];return {product_id:Number(row.product.id),quantity:Math.max(1,Number(listed?.min_stock||1)-Number(listed?.stock_quantity||0)),unit_cost:Number(supplier?.indicative_unit_price||row.product.cost_price||0),sale_price:Number(row.optimal_selling_price||row.product.selling_price||0)};});sessionStorage.setItem('market_receipt_batch_draft',JSON.stringify(items));navigate('/receipts?source=market-batch');};
 const moveToReceipt=supplier=>{
  const incoming=Math.max(1,Number(quantity)||1),price=Number(supplier?.indicative_unit_price||selected?.cost_price||0);
  navigate(`/receipts?product_id=${encodeURIComponent(productId)}&quantity=${incoming}&unit_cost=${encodeURIComponent(price)}`);
 };
 const observations=result?.market_observations||[];
 const values=[result?.min_market_price,result?.avg_market_price,result?.max_market_price].filter(value=>Number(value)>0).map(Number);
 const low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):0,span=Math.max(1,high-low);
 const marker=value=>value==null||!low?50:Math.max(0,Math.min(100,(Number(value)-low)/span*100));
 const competition=value=>({COMPETITIVE:['Cạnh tranh','positive'],ABOVE_MARKET:['Cao hơn thị trường','warning'],LOW_MARGIN:['Biên lợi nhuận thấp','danger']}[value]||['Chưa đủ dữ liệu','neutral']);
 const competitiveness=competition(result?.price_competitiveness);
 const batchItems=batchResult?.items||[];
 return <main className="market-intel-page">
  <PageHeader eyebrow="QUẢN LÝ KHO / SẢN PHẨM" title="Giá thị trường & Nguồn cung" description="Đối chiếu giá bán với mặt bằng bán lẻ tại Việt Nam và tham khảo kênh nhập hàng phù hợp." actions={<span className="market-intel-live"><ShieldCheck size={15}/> Dữ liệu có nguồn dẫn</span>}/>
  <section className="market-intel-layout">
   <Card className="market-intel-picker">
    <div className="market-intel-section-head"><div><span className="market-intel-kicker">01 / SẢN PHẨM</span><h2>Chọn mặt hàng trong kho</h2></div><Boxes size={19}/></div>
    <label className="market-intel-search"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm theo tên hoặc mã SKU" aria-label="Tìm sản phẩm"/></label>
    <div className="market-intel-mode"><button type="button" className={mode==='priority'?'active':''} onClick={()=>changeMode('priority')}>Cần quan tâm</button><button type="button" className={mode==='all'?'active':''} onClick={()=>changeMode('all')}>Tất cả</button></div>
    <div className="market-intel-quick-select"><button type="button" onClick={selectPriorityFive} disabled={quickSelectPending}>{quickSelectPending?'Đang chọn…':'Chọn nhanh 5 món cần quan tâm'}</button><span>{batchProductIds.length}/{MAX_BATCH_PRODUCTS} đã chọn</span></div>
    {products.error&&<p className="market-intel-message error">{products.error}</p>}
    {products.loading&&!products.data?<p className="market-intel-empty">Đang tải danh mục…</p>:<div className="market-intel-product-list">{(products.data?.items||[]).map(item=><div key={item.id} className={`market-intel-product-row ${String(item.id)===productId?'selected':''}`}><label className="market-intel-product-check" title="Chọn để phân tích hàng loạt"><input type="checkbox" checked={batchProductIds.includes(Number(item.id))} onChange={()=>toggleBatchProduct(item.id)} aria-label={`Chọn ${item.name} để phân tích hàng loạt`}/></label><button type="button" className="market-intel-product" onClick={()=>choose(item.id)}><span><strong>{item.name}</strong><small>{item.sku} · Tồn {Number(item.stock_quantity||0).toLocaleString('vi-VN')}</small></span><span className="market-intel-product-price">{money(item.selling_price)}</span></button></div>)}</div>}
   </Card>
   <section className="market-intel-content">
    {batchProductIds.length>=2&&<div className="market-intel-batch-toolbar"><div><strong>{batchProductIds.length} sản phẩm đã chọn</strong><span>Sẵn sàng đối chiếu giá và nguồn cung song song</span></div><div><button type="button" className="secondary" onClick={()=>setBatchProductIds([])}>Bỏ chọn tất cả</button><button type="button" onClick={runBatchCheck} disabled={batchBusy}>{batchBusy?'Đang phân tích…':`Phân tích hàng loạt (${batchProductIds.length} sản phẩm)`}</button></div></div>}
    {batchError&&<div className="market-intel-message error" role="alert">{batchError}</div>}
    {batchItems.length?<Card className="market-intel-batch-card"><div className="market-intel-section-head"><div><span className="market-intel-kicker">BATCH CHECK / {batchItems.length} SẢN PHẨM</span><h2>Bảng tổng hợp giá & nguồn cung</h2></div><button type="button" className="market-intel-batch-receipt" onClick={createBatchReceiptDraft}><PackagePlus size={15}/> Tạo phiếu đề xuất nhập hàng</button></div><div className="market-intel-batch-table-wrap"><table><thead><tr><th>Tên sản phẩm</th><th>Giá nhập hiện tại</th><th>Giá bán shop</th><th>Giá TB thị trường</th><th>Đánh giá</th><th>Giá bán gợi ý</th><th>Kênh nguồn cung</th></tr></thead><tbody>{batchItems.map(row=>{const rating=competition(row.price_competitiveness),supplier=row.sourcing_suggestions?.[0];return <tr key={row.product.id}><td><strong>{row.product.name}</strong><small>{row.product.sku}</small></td><td className="numeric">{row.product.cost_price==null?'—':money(row.product.cost_price)}</td><td className="numeric">{money(row.product.selling_price)}</td><td className="numeric">{row.avg_market_price?money(row.avg_market_price):'Chưa có'}</td><td><Badge variant={rating[1]}>{rating[0]}</Badge></td><td className="numeric suggested">{row.optimal_selling_price?money(row.optimal_selling_price):'—'}</td><td>{supplier?<a href={supplier.url} target="_blank" rel="noreferrer"><strong>{supplier.channel||supplier.supplier_name}</strong><small>{supplier.supplier_name}</small><ArrowUpRight size={13}/></a>:<span className="muted">Chưa có nguồn</span>}</td></tr>;})}</tbody></table></div><p className="market-intel-batch-note">Kết quả cache được tái sử dụng khi còn hiệu lực; giá ước tính dự phòng được đánh dấu độ tin cậy thấp và cần xác minh trước khi áp dụng.</p></Card>:!selected?<Card className="market-intel-placeholder"><ChartNoAxesCombined size={30}/><h2>Chọn sản phẩm để bắt đầu</h2><p>Giá bán, giá vốn và tồn kho sẽ được đối chiếu với các listing có nguồn tham khảo.</p></Card>:<>
     <Card className="market-intel-product-summary"><button type="button" className="market-intel-clear-product" onClick={clearSelection} aria-label="Bỏ chọn sản phẩm" title="Bỏ chọn sản phẩm"><X size={15}/></button><div><span className="market-intel-kicker">{selected.sku} · {selected.category_name||'Chưa phân loại'}</span><h2>{selected.name}</h2></div><div className="market-intel-summary-prices"><span>Giá vốn <strong>{selected.cost_price==null?'—':money(selected.cost_price)}</strong></span><span>Giá bán hiện tại <strong>{money(selected.selling_price)}</strong></span><span>Tồn kho <strong>{Number(selected.stock_quantity||0).toLocaleString('vi-VN')}</strong></span></div></Card>
     <Card className="market-intel-analysis"><div className="market-intel-section-head"><div><span className="market-intel-kicker">02 / GIÁ THỊ TRƯỜNG</span><h2>Vị thế giá bán</h2></div><button className="market-intel-refresh" disabled={busy} onClick={()=>runCheck(true)}><RefreshCw size={15} className={busy?'spin':''}/> {busy?'Đang tra cứu':'Cập nhật giá'}</button></div>
      {error&&<div className="market-intel-message error" role="alert">{error}</div>}
      {busy&&!result&&<p className="market-intel-empty">Đang tra cứu listing và nguồn cung trên Google Search…</p>}
      {result&&<><div className="market-intel-market-values"><div><small>Thấp nhất</small><strong>{result.min_market_price?money(result.min_market_price):'Chưa có'}</strong></div><div className="average"><small>Trung bình</small><strong>{result.avg_market_price?money(result.avg_market_price):'Chưa có dữ liệu'}</strong></div><div><small>Cao nhất</small><strong>{result.max_market_price?money(result.max_market_price):'Chưa có'}</strong></div></div>
       {low>0&&<div className="market-intel-scale"><div className="market-intel-track"><span className="market-intel-marker cost" style={{left:`${marker(selected.cost_price)}%`}}/><span className="market-intel-marker shop" style={{left:`${marker(selected.selling_price)}%`}}/><span className="market-intel-marker avg" style={{left:`${marker(result.avg_market_price)}%`}}/></div><div className="market-intel-legend"><span><i className="cost"/>Giá nhập</span><span><i className="shop"/>Giá bán shop</span><span><i className="avg"/>Trung bình thị trường</span></div></div>}
       <div className="market-intel-insight"><Badge variant={competitiveness[1]}>{competitiveness[0]}</Badge><p>{result.market_summary||'Chưa đủ listing được xác minh để đưa ra nhận định chắc chắn.'}</p>{result.optimal_selling_price>0&&<strong>Giá bán gợi ý: {money(result.optimal_selling_price)}</strong>}</div>
       <div className="market-intel-observations"><h3>Giá tham khảo theo nguồn <span>{observations.length} listing</span></h3>{observations.length?<div className="market-intel-table-wrap"><table><thead><tr><th>Nhà bán</th><th>Sản phẩm</th><th>Giá</th><th>Nguồn</th></tr></thead><tbody>{observations.map((row,index)=><tr key={`${row.url}-${index}`}><td>{row.retailer}</td><td><strong>{row.listing_title}</strong><small>{row.price_note}</small></td><td className="numeric">{money(row.price)}</td><td><a href={row.url} target="_blank" rel="noreferrer">Mở nguồn <ArrowUpRight size={14}/></a></td></tr>)}</tbody></table></div>:<p className="market-intel-empty">Chưa tìm thấy listing có giá và quy cách xác thực. Không dùng giá ước đoán.</p>}</div>
       <div className="market-intel-footnote"><Clock3 size={14}/> Cập nhật {fmtDate(result.checked_at)} · {result.cached?'Đã dùng cache 24 giờ':'Tra cứu mới'} · Độ tin cậy {result.confidence==='HIGH'?'cao':result.confidence==='MEDIUM'?'vừa':'thấp'}</div>
      </>}
     </Card>
     {result&&<Card className="market-intel-sourcing"><div className="market-intel-section-head"><div><span className="market-intel-kicker">03 / NGUỒN CUNG ỨNG</span><h2>Kênh nhập hàng tham khảo</h2></div><TrendingDown size={19}/></div><p className="market-intel-source-note">{result.sourcing_note}</p><label className="market-intel-quantity">Số lượng dự kiến nhập<input type="number" min="1" step="1" value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>{result.sourcing_suggestions?.length?<div className="market-intel-suppliers">{result.sourcing_suggestions.map((supplier,index)=><article className="market-intel-supplier" key={`${supplier.url}-${index}`}><div className="market-intel-supplier-top"><div><span>{supplier.channel}</span><h3>{supplier.supplier_name}</h3></div><TrendingUp size={17}/></div><p>{supplier.quality_notes}</p><dl><div><dt>Giá tham khảo</dt><dd>{supplier.indicative_unit_price?money(supplier.indicative_unit_price):'Chưa công bố'}</dd></div><div><dt>Đơn tối thiểu</dt><dd>{supplier.minimum_order}</dd></div><div><dt>Chiết khấu</dt><dd>{supplier.discount_terms}</dd></div></dl><div className="market-intel-supplier-actions"><a href={supplier.url} target="_blank" rel="noreferrer">Kiểm tra nguồn <ArrowUpRight size={14}/></a><button onClick={()=>moveToReceipt(supplier)}><PackagePlus size={15}/> Lập phiếu nhập</button></div></article>)}</div>:<p className="market-intel-empty">Chưa tìm thấy kênh cung ứng có nguồn kiểm chứng phù hợp.</p>}</Card>}
    </>}
   </section>
  </section>
 </main>;
}
