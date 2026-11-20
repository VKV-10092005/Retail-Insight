import React,{useEffect,useMemo,useState} from 'react';
import {useSearchParams,useNavigate} from 'react-router-dom';
import {ArrowUpRight,Boxes,ChartNoAxesCombined,Clock3,PackagePlus,RefreshCw,Search,ShieldCheck,TrendingDown,TrendingUp} from 'lucide-react';
import {useBranch} from '../branches/BranchContext';
import {PageHeader,Card,Badge} from '../components/ui/Elements';
import {request,useResource,money} from '../operations/shared';
import './MarketIntelligence.css';

const fmtDate=value=>value?new Intl.DateTimeFormat('vi-VN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Chưa có dữ liệu';

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
 const products=useResource(`/market-intelligence/products?${activeBranchId?`branch_id=${encodeURIComponent(activeBranchId)}&`:''}mode=${productId?'all':mode}&q=${encodeURIComponent(query)}&limit=150`);
 const selected=useMemo(()=>products.data?.items?.find(item=>String(item.id)===String(productId))||null,[products.data,productId]);
 useEffect(()=>{setResult(null);setError('');},[productId]);
 useEffect(()=>{if(productId&&selected)setQuantity(String(Math.max(1,Number(selected.min_stock||1)-Number(selected.stock_quantity||0))));},[productId,selected]);
 useEffect(()=>{if(productId&&selected&&!result&&!busy)runCheck(false);},[productId,selected]);
 async function runCheck(refresh=true){
  if(!productId)return;
  setBusy(true);setError('');
  try{setResult(await request('/market-intelligence/check',{method:'POST',body:{product_id:Number(productId),quantity:Math.max(0,Number(quantity)||0),refresh}}));}
  catch(err){setError(err.message||'Không thể tra cứu giá lúc này.');}
  finally{setBusy(false);}
 }
 const choose=id=>{setResult(null);setSearchParams({product_id:String(id)});};
 const moveToReceipt=supplier=>{
  const incoming=Math.max(1,Number(quantity)||1),price=Number(supplier?.indicative_unit_price||selected?.cost_price||0);
  navigate(`/receipts?product_id=${encodeURIComponent(productId)}&quantity=${incoming}&unit_cost=${encodeURIComponent(price)}`);
 };
 const observations=result?.market_observations||[];
 const values=[result?.min_market_price,result?.avg_market_price,result?.max_market_price].filter(value=>Number(value)>0).map(Number);
 const low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):0,span=Math.max(1,high-low);
 const marker=value=>value==null||!low?50:Math.max(0,Math.min(100,(Number(value)-low)/span*100));
 const competitiveness={COMPETITIVE:['Cạnh tranh','positive'],ABOVE_MARKET:['Cao hơn thị trường','warning'],LOW_MARGIN:['Biên lợi nhuận thấp','danger']}[result?.price_competitiveness]||['Chưa đủ dữ liệu','neutral'];
 return <main className="market-intel-page">
  <PageHeader eyebrow="QUẢN LÝ KHO / SẢN PHẨM" title="Giá thị trường & Nguồn cung" description="Đối chiếu giá bán với mặt bằng bán lẻ tại Việt Nam và tham khảo kênh nhập hàng phù hợp." actions={<span className="market-intel-live"><ShieldCheck size={15}/> Dữ liệu có nguồn dẫn</span>}/>
  <section className="market-intel-layout">
   <Card className="market-intel-picker">
    <div className="market-intel-section-head"><div><span className="market-intel-kicker">01 / SẢN PHẨM</span><h2>Chọn mặt hàng trong kho</h2></div><Boxes size={19}/></div>
    <label className="market-intel-search"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm theo tên hoặc mã SKU" aria-label="Tìm sản phẩm"/></label>
    <div className="market-intel-mode"><button className={mode==='priority'?'active':''} onClick={()=>setMode('priority')}>Cần quan tâm</button><button className={mode==='all'?'active':''} onClick={()=>setMode('all')}>Tất cả</button></div>
    {products.error&&<p className="market-intel-message error">{products.error}</p>}
    {products.loading&&!products.data?<p className="market-intel-empty">Đang tải danh mục…</p>:<div className="market-intel-product-list">{(products.data?.items||[]).map(item=><button key={item.id} className={`market-intel-product ${String(item.id)===productId?'selected':''}`} onClick={()=>choose(item.id)}><span><strong>{item.name}</strong><small>{item.sku} · Tồn {Number(item.stock_quantity||0).toLocaleString('vi-VN')}</small></span><span className="market-intel-product-price">{money(item.selling_price)}</span></button>)}</div>}
   </Card>
   <section className="market-intel-content">
    {!selected?<Card className="market-intel-placeholder"><ChartNoAxesCombined size={30}/><h2>Chọn sản phẩm để bắt đầu</h2><p>Giá bán, giá vốn và tồn kho sẽ được đối chiếu với các listing có nguồn tham khảo.</p></Card>:<>
     <Card className="market-intel-product-summary"><div><span className="market-intel-kicker">{selected.sku} · {selected.category_name||'Chưa phân loại'}</span><h2>{selected.name}</h2></div><div className="market-intel-summary-prices"><span>Giá vốn <strong>{selected.cost_price==null?'—':money(selected.cost_price)}</strong></span><span>Giá bán hiện tại <strong>{money(selected.selling_price)}</strong></span><span>Tồn kho <strong>{Number(selected.stock_quantity||0).toLocaleString('vi-VN')}</strong></span></div></Card>
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
