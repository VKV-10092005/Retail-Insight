import React,{useEffect,useRef,useState} from 'react';
import {useLocation,Link,useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {useBranch} from '../branches/BranchContext';
import {formatBusinessTime} from './business-time';
import {Card,PageHeader} from '../components/ui/Elements';
import {useResource,request,State,Table,Message,money,params,Filters,Pager,ProductPicker,vndNumber} from './shared';
import {Button,Badge} from '../design-system';
import './Receipts.css';
import {ShoppingCart,FileText,Warehouse,PackagePlus,Printer,X,AlertCircle,RotateCcw,Plus,Trash2,ArrowRight,Pencil,Check,Sparkles} from 'lucide-react';
import ReceiptImport from './ReceiptImport';
import ImageUploadField from '../components/common/ImageUploadField';
import PaymentSettingsModal from '../components/PaymentSettingsModal';
import {ReceiptPreview} from '../components/sales/SalesPos';
import '../components/sales/sales-pos.css';
import '../components/sales/sales-pos-enhancements.css';
import {cachePaymentSettings} from '../vietqr';

export default function Ledger({
  mode,
  sale = false,
  hideCostAndProfit = false,
  hideRevenue = false
}){
  const {user}=useAuth();
  const {activeBranchId:branch,activeBranch,setActiveBranchId:setBranch,isOwner}=useBranch();
  const location=useLocation();
  const navigate=useNavigate();

  // Xác định mode hiển thị chính xác
  let activeMode = mode;
  if(!activeMode){
    if(location.pathname === '/sales/history') activeMode = 'sales-history';
    else if(location.pathname === '/sales') activeMode = 'pos';
    else if(location.pathname === '/receipts') activeMode = 'receipts';
    else if(location.pathname === '/inventory') activeMode = 'inventory';
    else activeMode = sale ? 'pos' : 'inventory';
  }

  const isSale = (activeMode === 'pos' || activeMode === 'sales-history' || sale);
  const canWrite = (isSale ? ['OWNER','MANAGER','CASHIER'] : ['OWNER','MANAGER','INVENTORY']).includes(user?.role);

  const [filters,setFilters]=useState({});
  const [receiptTab,setReceiptTab]=useState(new URLSearchParams(location.search).get('tab')==='bulk'?'bulk':'single');
  const [page,setPage]=useState(1);
  const [note,setNote]=useState('');
  const [lines,setLines]=useState([{product_id:'',product_search:'',quantity:1,unit_price:'',sale_price:'',new_product:false,sku:'',name:'',category_name:'',image_url:''}]);
  const marketPrefillApplied=useRef('');
  const [categoryCreateIndex,setCategoryCreateIndex]=useState(null);
  const [newCategoryName,setNewCategoryName]=useState('');
  const [categoryBusy,setCategoryBusy]=useState(false);
  const [categoryList,setCategoryList]=useState([]);
  const [categoryInlineError,setCategoryInlineError]=useState('');
  const [categoryInlineSuccess,setCategoryInlineSuccess]=useState('');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [busy,setBusy]=useState(false);
  const [invoice,setInvoice]=useState(null);
  const [invoiceLoading,setInvoiceLoading]=useState(false);
  const [returnMode,setReturnMode]=useState(false);
  const [returnQuantities,setReturnQuantities]=useState({});
  const [returnReason,setReturnReason]=useState('');
  const [returnBusy,setReturnBusy]=useState(false);
  const [receiptDraft,setReceiptDraft]=useState([]);
  const [receiptEditMode,setReceiptEditMode]=useState(false);
  const [receiptEditBaseline,setReceiptEditBaseline]=useState('');
  const [receiptEditNote,setReceiptEditNote]=useState('');
  const [receiptEditNoteBaseline,setReceiptEditNoteBaseline]=useState('');
  const [receiptEditBusy,setReceiptEditBusy]=useState(false);
  const [receiptSaveBusy,setReceiptSaveBusy]=useState(false);
  const [sellingMode,setSellingMode]=useState(false);
  const [selectedToSell,setSelectedToSell]=useState([]);
  const [receiptFlow,setReceiptFlow]=useState(null);
  const [paymentSettingsOpen,setPaymentSettingsOpen]=useState(false);
  const canViewCost=['OWNER','MANAGER','INVENTORY'].includes(user?.role);
  const receiptDraftSignature=rows=>JSON.stringify(rows.map(row=>({product_id:Number(row.product_id),quantity:Number(row.quantity),unit_cost:Number(row.unit_cost)})));
  const receiptEditDirty=receiptEditMode&&(receiptDraftSignature(receiptDraft)!==receiptEditBaseline||receiptEditNote!==receiptEditNoteBaseline);
  const receiptEditTotal=receiptDraft.reduce((sum,row)=>sum+Number(row.quantity||0)*Number(row.unit_cost||0),0);
  const startReceiptEdit=()=>{
    const rows=(invoice?.items||[]).map(item=>({product_id:Number(item.product_id),quantity:Number(item.quantity),unit_cost:Number(item.unit_cost??item.unit_price??0),sale_price:Number(products.data?.items?.find(p=>Number(p.id)===Number(item.product_id))?.sale_price||0)}));
    const currentNote=invoice?.document?.note||'';setReceiptDraft(rows);setReceiptEditBaseline(receiptDraftSignature(rows));setReceiptEditNote(currentNote);setReceiptEditNoteBaseline(currentNote);setReceiptEditMode(true);setError('');
  };
  const saveReceiptEdit=async()=>{
    if(!invoice||!receiptEditDirty||receiptEditBusy)return;
    const invalid=receiptDraft.find(row=>!Number.isInteger(Number(row.quantity))||Number(row.quantity)<1||Number(row.quantity)>100000||!Number.isFinite(Number(row.unit_cost))||Number(row.unit_cost)<0||!Number.isFinite(Number(row.sale_price))||Number(row.sale_price)<0);
    if(invalid){setError('Kiểm tra lại số lượng, đơn giá nhập và giá bán của từng sản phẩm.');return;}
    const lowCost=receiptDraft.find(row=>Number(row.unit_cost)>0&&Number(row.unit_cost)<100);
    if(lowCost){setError(`Đơn giá nhập của ${invoice.items.find(item=>Number(item.product_id)===Number(lowCost.product_id))?.sku||'sản phẩm'} thấp hơn 100 VNĐ. Hãy kiểm tra lại đơn vị nghìn đồng.`);return;}
    setReceiptEditBusy(true);setError('');
    try{
      await request(`/documents/receipts/${invoice.document.id}`,{method:'PUT',body:{note:receiptEditNote.trim()||null,items:receiptDraft.map(row=>({product_id:Number(row.product_id),quantity:Number(row.quantity),unit_cost:Number(row.unit_cost)}))}});
      setInvoice(await request(`/receipts/${invoice.document.id}`));setReceiptEditMode(false);setReceiptEditBaseline('');setReceiptEditNoteBaseline('');documents.reload();products.reload?.();setSuccess('Đã cập nhật phiếu nhập và số dư tồn kho.');
    }catch(err){setError(err.message||'Không thể cập nhật phiếu nhập.');}
    finally{setReceiptEditBusy(false);}
  };

  // Resolve API resources before effects that read them (notably receipt detail hydration).
  const products = useResource(branch?`/products?limit=500&branchId=${encodeURIComponent(branch)}&branch_id=${encodeURIComponent(branch)}`:null);
  const categories = useResource(branch?`/categories?branch_id=${encodeURIComponent(branch)}`:null);
  const branches = useResource('/branches');
  const scopedFilters={...filters,...(branch?{branch_id:branch}:{})};
  const documents = useResource(branch?(isSale ? '/sales?' : '/receipts?') + params({...scopedFilters,page}):null);
  const stock = useResource(activeMode === 'inventory'&&branch ? ('/inventory?' + params({...scopedFilters,page})) : null);
  const movements = useResource(activeMode === 'inventory'&&branch ? ('/inventory/movements?' + params(scopedFilters)) : null);

  useEffect(()=>{
    if(activeMode!=='receipts'||products.loading||!branch||new URLSearchParams(location.search).get('source')!=='market-batch')return;
    let draft=[];try{draft=JSON.parse(sessionStorage.getItem('market_receipt_batch_draft')||'[]');}catch{}
    const hydrated=(Array.isArray(draft)?draft:[]).flatMap(row=>{
      const product=products.data?.items?.find(item=>Number(item.id)===Number(row.product_id));
      if(!product)return [];
      return [{product_id:String(product.id),product_search:`${product.sku} · ${product.name}`,quantity:Math.max(1,Number(row.quantity)||1),unit_price:String(Number(row.unit_cost)||Number(product.cost_price)||''),sale_price:String(Number(row.sale_price)||Number(product.sale_price)||''),new_product:false,sku:product.sku,name:product.name,category_name:'',image_url:product.image_url||''}];
    });
    if(hydrated.length){setReceiptTab('single');setLines(hydrated);marketPrefillApplied.current='market-batch';}
    sessionStorage.removeItem('market_receipt_batch_draft');
    navigate('/receipts',{replace:true});
  },[activeMode,branch,products.loading,products.data,location.search,navigate]);

  useEffect(()=>{
    if(activeMode!=='receipts'||products.loading||!branch)return;
    const search=new URLSearchParams(location.search),productId=search.get('product_id');
    if(!productId||marketPrefillApplied.current===productId)return;
    const product=products.data?.items?.find(item=>String(item.id)===String(productId));
    if(!product)return;
    const quantity=Math.max(1,Number(search.get('quantity'))||1),unitPrice=search.get('unit_cost');
    marketPrefillApplied.current=productId;
    setReceiptTab('single');
    setLines([{product_id:String(product.id),product_search:`${product.sku} · ${product.name}`,quantity,unit_price:unitPrice??String(product.cost_price||''),sale_price:String(product.sale_price||''),new_product:false,sku:product.sku,name:product.name,category_name:'',image_url:product.image_url||''}]);
    navigate('/receipts',{replace:true});
  },[activeMode,branch,products.loading,products.data,location.search,navigate]);

  useEffect(()=>{
    if(activeMode!=='receipts'||!location.state?.items?.length)return;
    const incomingItems=location.state.items;
    const mappedLines=incomingItems.map(item=>({
      product_id:String(item.product_id||item.id||''),
      product_search:item.sku&&item.name?`${item.sku} · ${item.name}`:(item.name||item.sku||''),
      quantity:Math.max(1,Number(item.quantity)||Number(item.recommended_quantity)||1),
      unit_price:item.cost_price!=null?String(item.cost_price):(item.unit_cost!=null?String(item.unit_cost):''),
      sale_price:item.sale_price!=null?String(item.sale_price):'',
      new_product:false,
      sku:item.sku||'',
      name:item.name||'',
      category_name:item.category_name||'',
      image_url:item.image_url||''
    }));
    setReceiptTab('single');
    setLines(mappedLines);
    if(location.state.note)setNote(location.state.note);
    if(location.state.notice)setSuccess(location.state.notice);
    navigate(location.pathname,{replace:true,state:{}});
  },[activeMode,location.state,navigate]);

  useEffect(()=>{
    if(!invoice)return undefined;
    const onKeyDown=event=>{if(event.key==='Escape')setInvoice(null);};
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[invoice]);
  useEffect(()=>{
    if(!invoice){setReceiptFlow(null);setReceiptEditMode(false);setError("");}
  },[invoice]);
  useEffect(()=>{
    const branchId=invoice?.document?.branch_id;
    if(!branchId||invoice?.document?.type!=='SALE'||!navigator.onLine)return;
    request(`/branches/${branchId}/payment-settings`).then(settings=>cachePaymentSettings(branchId,settings)).catch(()=>{});
  },[invoice?.document?.branch_id,invoice?.document?.type]);
  useEffect(()=>{
    if(invoice&&activeMode==='receipts'){
      setReceiptDraft((invoice.items||[]).map(item=>({product_id:Number(item.product_id),quantity:Number(item.quantity),unit_cost:Number(item.unit_cost??item.unit_price??0),sale_price:Number(products.data?.items?.find(p=>Number(p.id)===Number(item.product_id))?.sale_price||0)})));
    }
  },[invoice,activeMode,products.data]);

  useEffect(()=>{
    if(activeMode!=='receipts'||products.loading||!Array.isArray(products.data?.items))return;
    const emptyCatalog=products.data.items.length===0;
    setLines(rows=>rows.map(line=>{
      const untouched=!line.product_id&&!line.product_search&&!line.name&&!line.sku;
      return untouched?{...line,new_product:emptyCatalog}:line;
    }));
  },[activeMode,products.loading,products.data]);

  const calendar = documents.data?.calendar || stock.data?.calendar || movements.data?.calendar;
  const idempotency = useRef(null);

  const updateLine = (index,key,value) => {
    setLines(a=>a.map((l,i)=>{
      if(i!==index) return l;
      const updated = {...l, [key]: value};
      // Nếu chọn sản phẩm ở chế độ nhập hàng và chưa có giá nhập, tự điền cost_price nếu có
      if(key === 'product_id' && !isSale && !l.unit_price && products.data?.items){
        const p = products.data.items.find(item => String(item.id) === String(value));
        if(p?.cost_price) updated.unit_price = String(vndNumber(p.cost_price));
        if(p?.sale_price) updated.sale_price = p.sale_price;
        updated.image_url=p?.image_url||'';
      }
      return updated;
    }));
  };

  useEffect(()=>{
    if(categories.data?.items){
      setCategoryList(categories.data.items);
    }
  },[categories.data?.items]);

  const createReceiptCategory=async(event,index)=>{
    if(event)event.preventDefault();
    const trimmed=newCategoryName.trim();
    if(!trimmed){
      setCategoryInlineError('Vui lòng nhập tên danh mục.');
      return;
    }
    const isDuplicate=categoryList.some(
      c=>(c.name||'').trim().toLowerCase()===trimmed.toLowerCase()
    );
    if(isDuplicate){
      setCategoryInlineError('Danh mục này đã tồn tại trong cửa hàng.');
      return;
    }

    setCategoryBusy(true);
    setCategoryInlineError('');
    setCategoryInlineSuccess('');
    try{
      const created=await request('/categories',{
        method:'POST',
        body:{name:trimmed,...(branch?{branch_id:Number(branch)}:{})}
      });
      const newCat={id:created.id,name:created?.name||trimmed};
      setCategoryList(prev=>{
        const exists=prev.some(c=>String(c.id)===String(newCat.id));
        return exists?prev:[...prev,newCat];
      });
      updateLine(index,'category_name',newCat.name);
      setNewCategoryName('');
      setCategoryCreateIndex(null);
      setCategoryInlineSuccess('Đã thêm danh mục mới');
      setTimeout(()=>setCategoryInlineSuccess(''),3000);
      categories.reload?.();
    }catch(err){
      setCategoryInlineError(err.message||'Không thể tạo danh mục mới.');
    }finally{
      setCategoryBusy(false);
    }
  };

  const makeEmptyLine=()=>({product_id:'',product_search:'',quantity:1,unit_price:'',sale_price:'',new_product:activeMode==='receipts'&&(products.data?.items||[]).length===0,sku:'',name:'',category_name:'',image_url:''});
  const appendReceiptLine=()=>setLines(rows=>[...rows,makeEmptyLine()]);
  const insertReceiptLineAfter=index=>setLines(rows=>{const next=[...rows];next.splice(index+1,0,makeEmptyLine());return next;});
  const hasValidItemInput=lines.some(line=>Boolean(line.product_id||line.name?.trim()||line.unit_price!==''||line.sale_price!==''));

  async function openReceiptSuccess(receiptId,detail){
    let settings=null;
    try{settings=await request(`/branches/${branch}/payment-settings`);}catch{}
    const paymentConfigured=Boolean((settings?.bank_bin&&settings?.bank_account_number)||settings?.static_qr_url);
    setReceiptFlow({paymentConfigured,paymentSaved:false});
    setInvoice(detail||await request(`/receipts/${receiptId}`));
  }

  async function submit(e){
    e.preventDefault();
    setError('');
    setSuccess('');
    if(!isSale&&lines.some(line=>!(line.new_product||products.data?.items?.length===0)&&!line.product_id)){
      setError('Hãy chọn một sản phẩm có sẵn trong danh sách, hoặc chuyển dòng sang chế độ nhập sản phẩm mới.');
      return;
    }
    const lowReceiptCost=!isSale&&lines.find(line=>vndNumber(line.unit_price)>0&&vndNumber(line.unit_price)<100);
    if(lowReceiptCost){setError('Đơn giá nhập thấp hơn 100 VNĐ. Hãy kiểm tra lại, có thể bạn đang nhập theo đơn vị nghìn đồng.');return;}
    setBusy(true);
    try{
      const body = {
        branch_id: Number(branch),
        ...(note?.trim() ? {note: note.trim()} : {}),
          items: lines.map((l,index)=>({
          ...((isSale||!(l.new_product||products.data?.items?.length===0))?{product_id:Number(l.product_id)}:{sku:l.sku.trim()||`SP-${Date.now().toString(36).toUpperCase()}-${index+1}`,name:l.name.trim(),...(l.category_name.trim()?{category_name:l.category_name.trim()}:{}),sale_price:Number(l.sale_price||0)}),
          ...(l.image_url?{image_url:l.image_url}:{}),
          quantity: Number(l.quantity),
          ...(!isSale ? {unit_price: vndNumber(l.unit_price),...(l.sale_price!==''?{sale_price:Number(l.sale_price)}:{})} : {})
        }))
      };

      const fingerprint = JSON.stringify(body);
      if(idempotency.current?.fingerprint !== fingerprint){
        idempotency.current = {fingerprint, key: crypto.randomUUID()};
      }
      body.request_key = idempotency.current.key;

      const result = await request(isSale ? '/sales' : '/receipts', {method:'POST', body});
      const detail = await request((isSale ? '/sales/' : '/receipts/') + result.id);
      if(isSale)setInvoice(detail);
      else{await openReceiptSuccess(result.id,detail);products.reload?.();document.dispatchEvent(new CustomEvent('retail-tour',{detail:'receipt-created'}));}
      setSuccess(`${isSale ? 'Đã hoàn tất thanh toán hóa đơn' : 'Đã ghi nhận nhập kho thành công'} · Chứng từ #${result.id}`);
      setLines([{product_id:'',quantity:1,unit_price:'',sale_price:'',new_product:false,sku:'',name:'',category_name:'',image_url:''}]);
      setNote('');
      idempotency.current = null;
      documents.reload();
      if(stock) stock.reload();
      if(movements) movements.reload();
    }catch(err){
      setError(err.message || 'Lỗi xử lý chứng từ');
    }finally{
      setBusy(false);
    }
  }

  async function activateReceiptProducts(){
    const selected=receiptDraft.filter(row=>selectedToSell.includes(Number(row.product_id)));
    if(!selected.length)return;
    if(!window.confirm(`Xác nhận mở bán ${selected.length} sản phẩm đã chọn từ phiếu nhập #${invoice.document.id} trên quầy POS?`))return;
    setReceiptSaveBusy(true);setError('');
    try{
      for(const row of selected){
        const p=products.data?.items?.find(item=>Number(item.id)===Number(row.product_id));
        if(!p)throw new Error('Không tìm thấy thông tin sản phẩm để mở bán.');
        await request(`/products/${p.id}`,{method:'PUT',body:{sku:p.sku,name:p.name,category_id:p.category_id??null,attributes:p.attributes||{},sale_price:Number(row.sale_price||p.sale_price||0),cost_price:p.cost_price==null?null:Number(p.cost_price),status:'ACTIVE'}});
      }
      setSellingMode(false);setInvoice(await request(`/receipts/${invoice.document.id}`));setSuccess(`Đã mở bán ${selected.length} sản phẩm.`);products.reload?.();
    }catch(err){setError(err.message||'Không thể mở bán sản phẩm.');}
    finally{setReceiptSaveBusy(false);}
  }

  // Titles and descriptions based on mode
  let pageTitle = 'Bán hàng & Kho';
  let pageDesc = 'Giao dịch và luân chuyển hàng hóa';
  let eyebrow = 'VẬN HÀNH';

  if(activeMode === 'pos'){
    eyebrow = 'QUẦY THU NGÂN (QUIET POS)';
    pageTitle = 'Bán hàng tại quầy';
    pageDesc = 'Tạo đơn bán hàng trực tiếp, kiểm tra tồn khả dụng tức thì và in hóa đơn giao dịch.';
  } else if(activeMode === 'sales-history'){
    eyebrow = 'LỊCH SỬ BÁN HÀNG';
    pageTitle = 'Danh sách hóa đơn bán hàng';
    pageDesc = 'Tra cứu hóa đơn đã phát hành theo thời gian, chi nhánh, danh mục và sản phẩm.';
  } else if(activeMode === 'receipts'){
    eyebrow = 'NHẬP KHO & CHỨNG TỪ';
    pageTitle = 'Phiếu nhập hàng';
    pageDesc = 'Ghi nhận hàng hóa nhập kho từ nhà cung cấp hoặc điều chuyển giữa các kho.';
  } else if(activeMode === 'inventory'){
    eyebrow = 'KHO VẬN HÀNH';
    pageTitle = 'Tồn kho chi nhánh';
    pageDesc = 'Theo dõi tồn kho thực tế của từng sản phẩm và lịch sử biến động nhập - xuất.';
  }

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={pageTitle}
        description={pageDesc}
        actions={!isSale && (
          <div className="inventory-page-tabs">
            <Link to="/inventory"><Button variant={activeMode==='inventory'?'primary':'secondary'} size="sm"><Warehouse size={15}/> Tồn kho chi nhánh</Button></Link>
            <Link to="/receipts"><Button variant={activeMode==='receipts'?'primary':'secondary'} size="sm"><PackagePlus size={15}/> Nhập hàng & Phiếu nhập</Button></Link>
          </div>
        )}
      />

      {error && <p className="auth-error" role="alert">{error}</p>}
      {success && (
        <p className="op-success" role="status" style={{display:'inline-flex',alignItems:'center',gap:7}}>
          {success.includes('Retail Insight') && <Sparkles size={16} style={{flexShrink:0,color:'var(--ri-primary,#0284c7)'}}/>}
          <span>{success}</span>
        </p>
      )}
      {activeMode==='receipts'&&success.startsWith('Đã mở bán')&&<Link className="btn btn-primary" to="/sales" style={{margin:'0 0 16px',display:'inline-flex',alignItems:'center',gap:6}}>Sang quầy Bán hàng POS <ArrowRight size={15}/></Link>}

      {/* Hiển thị lỗi bộ lọc ngày nếu Backend trả lỗi 400 */}
      {documents.error && documents.error.includes('start') && (
        <div className="auth-error" role="alert" style={{margin:'8px 0',display:'flex',alignItems:'center',gap:'8px'}}>
          <AlertCircle size={16}/>
          <span>Khoảng ngày lọc không hợp lệ: Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</span>
        </div>
      )}

      {/* Tab navigation giữa Bán hàng POS và Lịch sử nếu là luồng bán hàng */}
      {isSale && (
        <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
          <Link to="/sales">
            <Button variant={activeMode==='pos'?'primary':'secondary'} size="sm">
              <ShoppingCart size={15}/> Bán hàng POS
            </Button>
          </Link>
          <Link to="/sales/history">
            <Button variant={activeMode==='sales-history'?'primary':'secondary'} size="sm">
              <FileText size={15}/> Lịch sử hóa đơn
            </Button>
          </Link>
        </div>
      )}

      {activeMode === 'receipts' && (
        <div className="receipts-tabs" role="tablist" aria-label="Chức năng nhập hàng">
          <button type="button" role="tab" aria-selected={receiptTab==='single'} onClick={()=>setReceiptTab('single')}>Lập phiếu nhập từng món</button>
          <button type="button" role="tab" aria-selected={receiptTab==='bulk'} onClick={()=>setReceiptTab('bulk')}>Nhập hàng loạt từ CSV / Excel</button>
          <button type="button" role="tab" aria-selected={receiptTab==='history'} onClick={()=>setReceiptTab('history')}>Lịch sử phiếu nhập kho</button>
        </div>
      )}

      {/* 1. MÀN HÌNH FORM TẠO GIAO DỊCH (POS hoặc NHẬP HÀNG) */}
      {(activeMode === 'pos' || (activeMode === 'receipts' && receiptTab === 'single')) && canWrite && (
        <Card style={{marginBottom:'24px'}}>
          <div className="receipt-form-titlebar">
            <h2 style={{fontSize:'1.125rem',marginBottom:0}}>{isSale ? "\u0054\u1ea1o h\u00f3a \u0111\u01a1n b\u00e1n l\u1ebb m\u1edbi" : "\u004c\u1eadp phi\u1ebfu nh\u1eadp h\u00e0ng v\u00e0o kho"}</h2>
            {activeMode==='receipts'&&<Button type="button" variant="secondary" size="sm" className="receipt-add-line-top" onClick={appendReceiptLine}><Plus size={16}/>{"Th\u00eam d\u00f2ng s\u1ea3n ph\u1ea9m"}</Button>}
          </div>

          <form className={activeMode === 'receipts' ? 'op-form receipt-entry-form' : 'op-form'} data-tour={activeMode==='receipts'?'receipt-form':undefined} onSubmit={submit}>
            <div className={activeMode==='receipts'?'receipt-header-grid':'receipt-header-single'}>
            <label>
              Chi nhánh thực hiện giao dịch *
              {isOwner?<select
                required
                className="ri-control"
                value={branch}
                onChange={e=>setBranch(e.target.value)}
              >
                <option value="">Chọn chi nhánh</option>
                {branches.data?.branches?.map(b=>(
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>:<div className="branch-static-badge" style={{padding:'9px 12px',border:'1px solid var(--ri-border)',borderRadius:8,fontWeight:600}}>{activeBranch?.name||`Chi nhánh #${branch}`}</div>}
            </label>

            <label style={{marginTop:'12px',display:'block'}}>
              {isSale ? 'Ghi chú hóa đơn (tùy chọn)' : 'Nhà cung cấp / Ghi chú nhập hàng (tùy chọn)'}
              <input
                type="text"
                maxLength="500"
                className="ri-control"
                placeholder={isSale ? 'Ghi chú cho đơn hàng...' : 'Ví dụ: NPP Suntory Pepsico, Masan Consumer...'}
                value={note}
                onChange={e=>setNote(e.target.value)}
              />
            </label>
            </div>

            <div style={{marginTop:'12px',display:'grid',gap:'12px'}}>
              {lines.map((line,index)=>{
                const isNewProductLine=!isSale&&(line.new_product||products.data?.items?.length===0);
                const quantityField=<div className="receipt-line-quantity"><label>Số lượng *<input type="number" min="1" max="100000" required className="ri-control" value={line.quantity} onChange={e=>updateLine(index,'quantity',e.target.value)}/></label></div>;
                const costField=!isSale&&<div className="receipt-line-cost"><label>Đơn giá nhập *<input required type="number" min="0" step=".01" className="ri-control" placeholder="VNĐ" value={line.unit_price} onChange={e=>updateLine(index,'unit_price',e.target.value)}/></label></div>;
                const saleField=!isSale&&<div className="receipt-line-sale"><label>Giá bán (VNĐ) *<input required type="number" min="0" step=".01" className="ri-control" value={line.sale_price} onChange={e=>updateLine(index,'sale_price',e.target.value)}/></label></div>;
                const toggleButton=!isSale&&products.data?.items?.length>0&&<button type="button" className="btn btn-secondary receipt-new-product-toggle" onClick={()=>setLines(rows=>rows.map((item,i)=>i===index?{...item,new_product:!item.new_product,product_id:'',product_search:'',image_url:''}:item))}>{line.new_product?'Chọn sản phẩm có sẵn':'+ Nhập sản phẩm mới'}</button>;
                const rowActions=<div className="receipt-row-actions">{activeMode==='receipts'&&<button type="button" className="receipt-add-row-quick" title="Thêm dòng bên dưới" aria-label="Thêm dòng bên dưới" onClick={()=>insertReceiptLineAfter(index)}><Plus size={17}/><span className="receipt-add-row-text">+ Thêm dòng</span></button>}{lines.length>1&&<button type="button" className="btn btn-secondary receipt-remove-row" aria-label="Xóa dòng sản phẩm" title="Xóa dòng" onClick={()=>setLines(rows=>rows.filter((_,i)=>i!==index))}><Trash2 size={16}/></button>}</div>;
                const productSelect=!isSale&&products.loading?<label className="receipt-product-select">Danh sách sản phẩm đang tải<input className="ri-control" disabled placeholder="Vui lòng đợi..."/></label>:isSale?<div className="receipt-product-select"><ProductPicker index={index} value={line.product_id} onChange={val=>updateLine(index,'product_id',val)}/></div>:<label className="receipt-product-select">Sản phẩm có sẵn *<input className="ri-control" list={`receipt-products-${index}`} required value={line.product_search||''} placeholder="Tìm theo mã hoặc tên sản phẩm" onChange={e=>{const text=e.target.value;const match=(products.data?.items||[]).find(p=>text===`${p.sku} · ${p.name}`||text===p.sku||text===p.name);setLines(rows=>rows.map((item,i)=>{if(i!==index)return item;const next={...item,product_search:text,product_id:match?String(match.id):''};if(match&&!item.unit_price)next.unit_price=match.cost_price||'';if(match&&!item.sale_price)next.sale_price=match.sale_price||'';next.image_url=match?.image_url||'';return next;}));}}/><datalist id={`receipt-products-${index}`}>{(products.data?.items||[]).filter(p=>p.status==='ACTIVE').map(p=><option key={p.id} value={`${p.sku} · ${p.name}`}/>)}</datalist></label>;
                return <div className={`op-line receipt-product-line ${isNewProductLine?'is-new-product':''}`} key={index}>
                  {isNewProductLine ? (
                    <div className="receipt-new-product-layout">
                      <div className="receipt-new-product-header">
                        <div className="receipt-new-product-name">
                          <label>Tên sản phẩm *<input className="ri-control" required placeholder="Dây sạc Type-C 1m" value={line.name} onChange={e=>updateLine(index,'name',e.target.value)}/></label>
                        </div>
                        {toggleButton}
                      </div>

                      <div className="receipt-new-product-details">
                        <div className="receipt-new-product-category">
                          <label>Danh mục<div className="receipt-category-select-row"><select className="ri-control" aria-label="Danh mục sản phẩm mới" value={line.category_name} onChange={e=>updateLine(index,'category_name',e.target.value)}><option value="">Chọn danh mục</option>{categoryList.map(category=><option key={category.id} value={category.name}>{category.name}</option>)}</select><button type="button" className="receipt-category-add" title="Tạo danh mục mới" aria-label="Tạo danh mục mới" onClick={()=>{setCategoryCreateIndex(categoryCreateIndex===index?null:index);setNewCategoryName('');setCategoryInlineError('');}}><Plus size={18}/></button></div></label>
                          {categoryCreateIndex===index&&<div style={{marginTop:'7px'}}><div className="receipt-category-create"><input className="ri-control" autoFocus maxLength={120} aria-label="Tên danh mục mới" placeholder="Tên danh mục mới" value={newCategoryName} onChange={e=>{setNewCategoryName(e.target.value);setCategoryInlineError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();createReceiptCategory(null,index);}}}/><button type="button" className="btn btn-primary btn-sm" disabled={categoryBusy||!newCategoryName.trim()} onClick={()=>createReceiptCategory(null,index)}>{categoryBusy?'Đang thêm…':'Thêm'}</button><button type="button" className="icon-button" aria-label="Hủy tạo danh mục" onClick={()=>{setCategoryCreateIndex(null);setNewCategoryName('');setCategoryInlineError('');}} disabled={categoryBusy}><X size={16}/></button></div>{categoryInlineError&&<p role="alert" style={{margin:'4px 0 0',color:'var(--ri-danger,#ef4444)',fontSize:'0.8rem',fontWeight:500}}>{categoryInlineError}</p>}</div>}
                          {categoryInlineSuccess&&categoryCreateIndex!==index&&<p style={{margin:'4px 0 0',color:'var(--ri-success,#10b981)',fontSize:'0.8rem',fontWeight:500}}><Check size={14}/> {categoryInlineSuccess}</p>}
                        </div>
                        <div className="receipt-new-product-sku">
                          <label>Mã sản phẩm<input className="ri-control" placeholder="Tự tạo nếu để trống" value={line.sku} onChange={e=>updateLine(index,'sku',e.target.value)}/></label>
                        </div>
                        <div className="receipt-new-product-image">
                          <label style={{display:'block',marginBottom:4}}>Ảnh sản phẩm</label>
                          <ImageUploadField compact imageUrl={line.image_url} onChange={value=>updateLine(index,'image_url',value)} onError={setError}/>
                        </div>
                      </div>

                      <div className="receipt-new-product-pricing">
                        {quantityField}
                        {costField}
                        {saleField}
                        {rowActions}
                      </div>
                    </div>
                  ) : (
                    <div className="receipt-existing-product-layout">
                      <div className="receipt-existing-product-header">
                        {productSelect}
                        {toggleButton}
                      </div>
                      <div className="receipt-existing-product-pricing">
                        {quantityField}
                        {costField}
                        {saleField}
                        {rowActions}
                      </div>
                    </div>
                  )}
                </div>;
              })}
            </div>

            <div className="op-actions receipt-form-actions" style={{marginTop:'16px'}}>
              {(isSale||activeMode!=='receipts'||hasValidItemInput)&&<Button
                type="submit"
                data-tour={activeMode==='receipts'?'receipt-submit':undefined}
                variant="primary"
                loading={busy}
                disabled={busy || !branch || (activeMode==='receipts'&&products.loading)}
              >
                {busy
                  ? "\u0110ang ghi nh\u1eadn..."
                  : isSale
                    ? "Thanh to\u00e1n & Xu\u1ea5t h\u00f3a \u0111\u01a1n"
                    : "X\u00e1c nh\u1eadn nh\u1eadp kho"}
              </Button>}
            </div>

            {(products.error || branches.error) && (
              <p role="alert" style={{color:'var(--ri-danger)'}}>
                {products.error || branches.error}
              </p>
            )}
          </form>
        </Card>
      )}

      {activeMode === 'receipts' && receiptTab === 'bulk' && canWrite && (
        <ReceiptImport
          branchId={branch}
          note={note}
          onCommitted={async result=>{
            documents.reload();
            await openReceiptSuccess(result.id);
          }}
        />
      )}

      {/* 2. BỘ LỌC TẬN DỤNG BACKEND P1.1 & P1.2 (Áp dụng cho Sales History, Receipts, Inventory) */}
      {(activeMode === 'sales-history' || activeMode === 'inventory' || (activeMode === 'receipts' && receiptTab === 'history')) && (
        <div className={activeMode === 'inventory' ? 'inventory-filter-frame' : undefined}>
        <Filters
          value={filters}
          onChange={v=>{setFilters(v);setPage(1);}}
          dates={true}
          products={true}
          calendar={calendar}
          showCalendar={activeMode !== 'receipts'}
          syncGlobalBranch={true}
        />
        </div>
      )}

      {/* 3. BẢNG TỒN KHO & BIẾN ĐỘNG (Chỉ hiển thị ở mode inventory) */}
      {activeMode === 'inventory' && stock && (
        <>
          <Card style={{marginBottom:'24px'}}>
            <h2>Tồn kho hiện tại</h2>
            <p className="muted">Số tồn kho thực tế theo thời gian thực của từng sản phẩm tại chi nhánh.</p>
            <State resource={stock}>
              {data=>(
                <>
                  <Table
                    rows={data.items}
                    empty="Chưa có dữ liệu tồn kho. Thực hiện ghi nhận phiếu nhập đầu tiên."
                    columns={[
                      ["sku","Mã sản phẩm"],
                      ["name","Tên sản phẩm"],
                      ["branch_name","Chi nhánh"],
                      ["quantity","Số lượng tồn",r=><span style={Number(r.quantity)<Number(r.alert_threshold)?{display:'inline-block',padding:'3px 8px',borderRadius:6,background:'var(--ri-warning-bg,#FEF3C7)',color:'var(--ri-warning,#B45309)',fontWeight:700}:{}}>{r.quantity}{Number(r.quantity)<Number(r.alert_threshold)?` · Thấp hơn ngưỡng ${r.alert_threshold}`:''}</span>],
                      ["updated_at","Cập nhật gần nhất",r=>formatBusinessTime(r.updated_at,calendar)]
                    ]}
                  />
                  <Pager data={data} onChange={setPage}/>
                  {!hideRevenue && data.valuation && (
                    <p className="muted" style={{marginTop:'8px'}}>{data.valuation.reason}</p>
                  )}
                </>
              )}
            </State>
          </Card>

          {movements && (
            <Card style={{marginBottom:'24px'}}>
              <h2>Nhật ký nhập – xuất hàng hóa</h2>
              <State resource={movements}>
                {data=>(
                  <Table
                    rows={data?.items ?? []}
                    empty="Chưa có biến động kho."
                    columns={[
                      ["sku","Mã sản phẩm"],
                      ["branch_name","Chi nhánh"],
                      ["document_created_at","Thời gian chứng từ",r=>formatBusinessTime(r.document_created_at,calendar)],
                      ["type","Operation",r=>r.movement_type==='RETURN'?'Return (restock)':r.type==='SALE'?'Sale (outbound)':'Receipt'],
                      ["quantity_delta","Biến động",r=><span style={{color:r.quantity_delta>0?'var(--ri-success)':'var(--ri-danger)',fontWeight:600}}>{r.quantity_delta>0?`+${r.quantity_delta}`:r.quantity_delta}</span>],
                      ["balance_after","Tồn sau giao dịch"]
                    ]}
                  />
                )}
              </State>
            </Card>
          )}
        </>
      )}

      {/* 4. BẢNG DANH SÁCH CHỨNG TỪ (Hóa đơn hoặc Phiếu nhập) */}
      {(activeMode === 'sales-history' || (activeMode === 'receipts' && receiptTab === 'history') || (activeMode === 'pos' && !invoice)) && (
        <Card style={{marginBottom:'24px'}}>
          <h2>{isSale ? 'Lịch sử hóa đơn bán lẻ' : 'Lịch sử phiếu nhập kho'}</h2>
          <State resource={documents}>
            {data=>(
              <>
                <Table
                  rows={data?.items ?? []}
                  empty={isSale ? 'Chưa có hóa đơn bán lẻ nào.' : 'Chưa có phiếu nhập kho nào.'}
                  columns={[
                    ["id","Số chứng từ",r=>'#'+r.id],
                    ["branch_name","Chi nhánh"],
                    ["note",isSale ? "Ghi chú" : "Nhà cung cấp / Ghi chú",r=>r.note||'—'],
                    ...(hideRevenue
                      ? [["item_count","Số lượng mặt hàng",r=>r.total_items||r.items_count||'—']]
                      : [["total","Tổng giá trị",r=>money(r.total)]]),
                    ...(isSale?[["return_status","Trạng thái",r=>{const status=r.return_status||'NONE';return <Badge variant={status==='FULL_RETURNED'?'danger':status==='PARTIAL_RETURNED'?'warning':'success'}>{status==='FULL_RETURNED'?'Đã trả toàn bộ':status==='PARTIAL_RETURNED'?'Trả một phần':r.order_status==='CANCELLED'?'Đã hủy':r.payment_status==='WAITING_PAYMENT'?'Chờ thanh toán':r.payment_status==='FAILED'?'Thanh toán thất bại':'Hoàn tất'}</Badge>}]]:[]),
                    ["created_at","Thời gian ghi nhận",r=>formatBusinessTime(r.created_at,calendar)],
                    ["detail","Thao tác",r=>(
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={async()=>{
                          setInvoiceLoading(true);
                          try{
                            setInvoice(await request((isSale ? '/sales/' : '/receipts/') + r.id));
                          }catch(err){
                            setError(err.message);
                          }finally{
                            setInvoiceLoading(false);
                          }
                        }}
                        disabled={invoiceLoading}
                      >
                        Chi tiết
                      </button>
                    )]
                  ]}
                />
                <Pager data={data} onChange={setPage}/>
              </>
            )}
          </State>
        </Card>
      )}

      {/* 5. CHI TIẾT HÓA ĐƠN / PHIẾU NHẬP (In được) */}
      {invoice && activeMode === 'sales-history' && (
        <div role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setInvoice(null);}} style={{position:'fixed',inset:0,zIndex:1100,display:'grid',placeItems:'center',padding:16,background:'rgba(15,23,42,.58)'}}>
          <section role="dialog" aria-modal="true" aria-labelledby="sales-invoice-title" style={{width:'min(920px,calc(100vw - 24px))',maxWidth:'calc(100vw - 24px)',maxHeight:'85dvh',display:'flex',flexDirection:'column',overflowY:'auto',background:'var(--ri-surface,#fff)',color:'var(--ri-text,#172033)',borderRadius:16,boxShadow:'0 24px 80px rgba(0,0,0,.28)',padding:'clamp(16px, 3vw, 24px)'}}>
            <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:14}}><div><span className="eyebrow">CHI TIẾT HÓA ĐƠN</span><h2 id="sales-invoice-title" style={{margin:0}}>#{invoice.document.id}</h2></div><button type="button" className="icon-button" aria-label="Đóng" onClick={()=>setInvoice(null)}><X size={20}/></button></header>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:12}}>{[
              ['Chi nhánh phát hành',invoice.document.branch_name],
              ['Thời gian ghi nhận',formatBusinessTime(invoice.document.created_at,invoice.calendar||calendar)],
              ['Thu ngân thực hiện',invoice.document.performed_by_name],
              ['Trạng thái đơn',invoice.document.return_status==='FULL_RETURNED'?'Đã trả toàn bộ':invoice.document.return_status==='PARTIAL_RETURNED'?'Trả một phần':invoice.document.order_status==='COMPLETED'?'Hoàn tất':'Chờ thanh toán'],
              ['Phương thức thanh toán',invoice.document.payment_method==='BANK_TRANSFER'?'Chuyển khoản':'Tiền mặt'],
              ...(invoice.document.note?[["Nội dung",invoice.document.note]]:[])
            ].map(([label,value],index)=><div key={label} style={{gridColumn:index===4?'2':undefined,padding:11,border:'1px solid var(--ri-border,#e5e7eb)',borderRadius:10}}><small style={{display:'block',color:'var(--ri-muted,#667085)',marginBottom:4}}>{label}</small><strong>{value||'—'}</strong></div>)}</div>
            <h3 style={{fontSize:15,margin:'0 0 8px'}}>Sản phẩm đã bán</h3>
            <div style={{maxHeight:220,overflowY:'auto',border:'1px solid var(--ri-border,#e5e7eb)',borderRadius:10,flex:'0 0 auto'}}><Table rows={invoice.items} columns={[
              ['index','STT',row=>invoice.items.indexOf(row)+1],['product_name','Sản phẩm'],['sku','Mã SP'],['unit_price','Đơn giá',row=>money(row.unit_price)],['quantity','SL',row=><span>{row.quantity}{Number(row.returned_quantity)>0&&<small style={{display:'block',color:'var(--ri-warning)'}}>Đã trả: {row.returned_quantity}</small>}</span>],['line_total','Thành tiền',row=>money(row.line_total)]
            ]}/></div>
            <div style={{maxWidth:420,margin:'auto 0 0 auto',paddingTop:10}}><div style={{display:'flex',justifyContent:'space-between',padding:'4px 0'}}><span>Số tiền đã thanh toán</span><strong>{money(invoice.document.total)}</strong></div>{Number(invoice.document.returned_amount)>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',color:'var(--ri-danger)'}}><span>Đã hoàn tiền</span><strong>-{money(invoice.document.returned_amount)}</strong></div>}<div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid var(--ri-border)',fontSize:17,color:'var(--ri-primary)'}}><span>Thực thu</span><strong>{money(Number(invoice.document.total)-Number(invoice.document.returned_amount||0))}</strong></div>{canViewCost&&<div style={{paddingTop:7,borderTop:'1px dashed var(--ri-border)',fontSize:12,color:'var(--ri-muted)'}}>Giá vốn: {money(invoice.document.total_cogs)} · Lãi gộp: {money(invoice.document.gross_profit)}</div>}</div>
            {returnMode&&<div style={{marginTop:12,padding:12,border:'1px solid var(--ri-border)',borderRadius:12,overflowY:'auto',maxHeight:250}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong>Trả hàng / Hoàn tiền</strong><Button size="sm" variant="secondary" onClick={()=>setReturnQuantities(Object.fromEntries(invoice.items.map(i=>[i.product_id,Number(i.quantity)-Number(i.returned_quantity||0)])))}>Trả toàn bộ đơn</Button></div>{invoice.items.map(item=>{const remaining=Number(item.quantity)-Number(item.returned_quantity||0);return <label key={item.product_id} style={{display:'grid',gridTemplateColumns:'1fr 110px',gap:8,alignItems:'center',padding:'6px 0'}}><span>{item.product_name} <small>({remaining} còn được trả)</small></span><input className="ri-control" type="number" min="0" max={remaining} step="1" value={returnQuantities[item.product_id]||0} onChange={e=>setReturnQuantities({...returnQuantities,[item.product_id]:Math.min(remaining,Math.max(0,Number(e.target.value)))})}/></label>})}<label style={{display:'block',marginTop:6}}>Lý do trả hàng<input className="ri-control" maxLength={255} value={returnReason} onChange={e=>setReturnReason(e.target.value)} placeholder="Nập lý do"/></label><strong style={{display:'block',marginTop:7}}>Tạm tính hoàn: {money(invoice.items.reduce((sum,item)=>{const q=Number(returnQuantities[item.product_id]||0);if(!q)return sum;const gross=Number(item.line_total||0),base=Number(invoice.document.subtotal)-Number(invoice.document.item_discount_total),alloc=base>0?gross/base*Number(invoice.document.order_discount||0):0;return sum+(gross-alloc)*q/Number(item.quantity)},0))}</strong><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:9}}><Button variant="secondary" onClick={()=>setReturnMode(false)}>Hủy</Button><Button disabled={returnBusy||!returnReason.trim()||!Object.values(returnQuantities).some(Number)} onClick={async()=>{setReturnBusy(true);setError('');try{await request(`/documents/sales/${invoice.document.id}/return`,{method:'POST',body:{reason:returnReason.trim(),items:invoice.items.filter(i=>Number(returnQuantities[i.product_id])>0).map(i=>({product_id:Number(i.product_id),quantity:Number(returnQuantities[i.product_id])}))}});setInvoice(await request(`/sales/${invoice.document.id}`));setReturnMode(false);setReturnQuantities({});setReturnReason('');documents.reload();setSuccess('Đã ghi nhận trả hàng và hoàn tiền.');}catch(err){setError(err.message||'Không thể xử lý trả hàng.');}finally{setReturnBusy(false);}}}><RotateCcw size={15}/> {returnBusy?'Đang xử lý...':'Xác nhận trả hàng'}</Button></div></div>}
            {error&&<p role="alert" style={{color:'var(--ri-danger)',margin:'8px 0 0'}}>{error}</p>}
            <div className="no-print" style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:12,paddingTop:10,borderTop:'1px solid var(--ri-border)'}}><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{invoice.document.return_status!=='FULL_RETURNED'&&invoice.document.order_status==='COMPLETED'&&<Button variant="secondary" onClick={()=>{setReturnMode(v=>!v);setReturnQuantities({});}}><RotateCcw size={15}/> Trả hàng / Hoàn tiền</Button>}{invoice.document.return_status!=='NONE'&&<Link className="btn btn-secondary" to="/sales" onClick={()=>setInvoice(null)}>Tạo đơn đổi</Link>}</div><div style={{display:'flex',gap:8}}><Button variant="secondary" onClick={()=>window.print()}><Printer size={16}/> In</Button><Button variant="primary" onClick={()=>setInvoice(null)}>Đóng</Button></div></div>
            <div style={{position:'absolute',left:'-100000px',top:0}} aria-hidden="true"><ReceiptPreview receipt={invoice}/></div>
          </section>
        </div>
      )}

      {invoice && activeMode === 'receipts' && (
        <div className="receipt-detail-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setInvoice(null);}}>
          <section className="receipt-detail-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-detail-title">
            <header><div><span className="eyebrow">CHI TIẾT PHIẾU NHẬP</span><h2 id="receipt-detail-title">#{invoice.document.id}</h2></div><div style={{display:'flex',gap:6}}>{canWrite&&!receiptEditMode&&<button type="button" className="icon-button" title="Sửa phiếu nhập" aria-label="Sửa phiếu nhập" onClick={startReceiptEdit}><Pencil size={18}/></button>}<button type="button" className="icon-button" aria-label="Đóng chi tiết" onClick={()=>setInvoice(null)}><X size={20}/></button></div></header>
            <div className="receipt-detail-meta"><span><strong>Chi nhánh:</strong> {invoice.document.branch_name}</span><span><strong>Thời gian:</strong> {formatBusinessTime(invoice.document.created_at,invoice.calendar||calendar)}</span>{receiptEditMode?<label className="receipt-edit-note"><strong>Nhà cung cấp / Ghi chú</strong><input className="ri-control" value={receiptEditNote} maxLength={500} onChange={event=>setReceiptEditNote(event.target.value)} placeholder="Nhà cung cấp / Ghi chú"/></label>:invoice.document.note&&<span><strong>Nhà cung cấp / Ghi chú:</strong> {invoice.document.note}</span>}</div>
            {receiptFlow&&<div className="receipt-next-step" role="status">
              {!receiptFlow.paymentConfigured&&!receiptFlow.paymentSaved?<>
                <div><strong>Bạn đã hoàn thành Bước 1 (Nhập hàng vào kho)!</strong><p>Tiếp theo, cài đặt thanh toán (tài khoản ngân hàng hoặc mã QR) để sẵn sàng nhận tiền chuyển khoản từ khách.</p></div>
                <div className="receipt-next-step-actions"><button type="button" className="btn btn-primary" onClick={()=>setPaymentSettingsOpen(true)}>Cài đặt thanh toán →</button><button type="button" className="btn btn-secondary" onClick={()=>{setReceiptFlow(null);navigate('/sales');}}>Dùng tiền mặt, sang POS luôn</button></div>
              </>:<>
                <div><strong>{receiptFlow.paymentSaved?'Cài đặt thanh toán thành công! Cửa hàng đã sẵn sàng hoạt động.':'Nhập hàng thành công!'}</strong></div>
                <button type="button" className="btn btn-primary" onClick={()=>navigate('/sales')}>Bán hàng ngay →</button>
              </>}
            </div>}
            <div className="receipt-detail-items">
              <table className="ri-table receipt-detail-table">
                <thead><tr><th>STT</th><th>Mã sản phẩm</th><th>Tên sản phẩm</th><th>Số lượng</th><th>Đơn giá nhập</th><th>Thành tiền</th></tr></thead>
                <tbody>{receiptEditMode?receiptDraft.map((row,index)=>{const item=invoice.items.find(entry=>Number(entry.product_id)===Number(row.product_id));const update=(key,value)=>setReceiptDraft(rows=>rows.map((current,i)=>i===index?{...current,[key]:value}:current));return <tr key={row.product_id}><td>{index+1}</td><td>{item?.sku||row.product_id}</td><td>{item?.product_name}</td><td><input aria-label={`Số lượng nhập ${item?.sku||row.product_id}`} className="ri-control receipt-edit-number" type="number" min="1" max="100000" step="1" value={row.quantity} onChange={event=>update('quantity',event.target.value)}/></td><td><input aria-label={`Đơn giá nhập ${item?.sku||row.product_id}`} className="ri-control receipt-edit-number" type="number" min="0" step=".01" value={row.unit_cost} onChange={event=>update('unit_cost',event.target.value)}/></td><td>{money(Number(row.quantity||0)*Number(row.unit_cost||0))}</td></tr>}):(invoice.items||[]).map((item,index)=><tr key={item.product_id}><td>{index+1}</td><td>{item.sku||item.product_id}</td><td>{item.product_name}</td><td>{item.quantity}</td><td>{canViewCost?money(item.unit_cost??item.unit_price):'?'}</td><td>{money(item.line_total)}</td></tr>)}</tbody>
              </table>
            </div>
            {sellingMode&&!receiptEditMode&&<section style={{marginTop:12,padding:12,border:'1px solid var(--ri-border)',borderRadius:10}}><label style={{display:'flex',gap:8,alignItems:'center',fontWeight:700,marginBottom:8}}><input type="checkbox" checked={receiptDraft.length>0&&selectedToSell.length===receiptDraft.length} onChange={e=>setSelectedToSell(e.target.checked?receiptDraft.map(row=>Number(row.product_id)):[])}/>Chọn tất cả sản phẩm</label>{receiptDraft.map(row=>{const p=products.data?.items?.find(item=>Number(item.id)===Number(row.product_id));return <label key={row.product_id} style={{display:'flex',gap:8,alignItems:'center',padding:'6px 0'}}><input type="checkbox" checked={selectedToSell.includes(Number(row.product_id))} onChange={e=>setSelectedToSell(ids=>e.target.checked?[...new Set([...ids,Number(row.product_id)])]:ids.filter(id=>id!==Number(row.product_id)))}/>{p?.sku||row.product_id} · {p?.name||'Sản phẩm'}</label>})}<div style={{display:'flex',justifyContent:'flex-end',marginTop:8}}><button type="button" className="btn btn-primary" disabled={receiptSaveBusy||!selectedToSell.length} onClick={activateReceiptProducts}>{receiptSaveBusy?'Đang lưu...':`Xác nhận mở bán (${selectedToSell.length} sản phẩm)`}</button></div></section>}<footer><span>Tổng giá trị phiếu</span><strong>{money(receiptEditMode?receiptEditTotal:invoice.document.total)}</strong></footer>{error&&receiptEditMode&&<p role="alert" className="auth-error">{error}</p>}{receiptEditDirty&&<div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}><button type="button" className="btn btn-secondary" disabled={receiptEditBusy} onClick={()=>{setReceiptEditMode(false);setError("");}}>Hủy sửa</button><button type="button" className="btn btn-primary" disabled={receiptEditBusy} onClick={saveReceiptEdit}>{receiptEditBusy?"Đang lưu…":"Lưu thay đổi"}</button></div>}<div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}>{canViewCost&&invoice.items?.some(item=>item.product_status!=='ACTIVE')&&<button type="button" className="btn btn-primary" onClick={()=>{setSellingMode(v=>!v);setSelectedToSell(receiptDraft.map(row=>Number(row.product_id)));}}>{sellingMode?"Đóng mục mở bán":"Mở bán ngay"}</button>}</div>
          </section>
        </div>
      )}

      {invoice && activeMode !== 'sales-history' && activeMode !== 'receipts' && (
        <Card className="op-invoice" style={{marginTop:'16px'}}>
          <div className="op-actions" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <h2 style={{margin:0}}>
              {invoice.document.type === 'SALE' ? 'Hóa đơn bán hàng nội bộ' : 'Phiếu nhập kho'} #{invoice.document.id}
            </h2>
            <div style={{display:'flex',gap:'8px'}}>
              <Button variant="secondary" size="sm" onClick={()=>window.print()}>
                <Printer size={15}/> In chứng từ
              </Button>
              <Button variant="ghost" size="sm" onClick={()=>setInvoice(null)}>
                <X size={15}/> Đóng
              </Button>
            </div>
          </div>

          <div style={{margin:'12px 0',color:'var(--ri-muted)'}}>
            <p style={{margin:'2px 0'}}>
              <strong>Đơn vị:</strong> {invoice.document.organization_name} · <strong>Chi nhánh:</strong> {invoice.document.branch_name}
            </p>
            <p style={{margin:'2px 0'}}>
              <strong>Thời gian:</strong> {formatBusinessTime(invoice.document.created_at, invoice.calendar || calendar)}
            </p>
            {invoice.document.note && (
              <p style={{margin:'2px 0'}}>
                <strong>{invoice.document.type === 'SALE' ? 'Ghi chú:' : 'Nhà cung cấp / Ghi chú:'}</strong> {invoice.document.note}
              </p>
            )}
          </div>

          <Table
            rows={invoice.items}
            columns={[
              ["sku","Mã sản phẩm"],
              ["product_name","Tên sản phẩm"],
              ["quantity","Số lượng"],
              ...(!hideCostAndProfit
                ? [
                    ["unit_price","Đơn giá",r=>money(r.unit_price)],
                    ["line_total","Thành tiền",r=>money(r.line_total)]
                  ]
                : [])
            ]}
          />

          {!hideCostAndProfit && (
            <h3 style={{textAlign:'right',marginTop:'16px',color:'var(--ri-primary)'}}>
              Tổng cộng: {money(invoice.document.total)}
            </h3>
          )}

          <p className="muted" style={{fontSize:'0.8125rem',marginTop:'12px'}}>
            Chứng từ kiểm soát nội bộ của hệ thống Retail Insight.
          </p>
        </Card>
      )}

      <PaymentSettingsModal
        open={paymentSettingsOpen}
        onClose={()=>setPaymentSettingsOpen(false)}
        branchId={branch}
        onSaved={()=>{
          setPaymentSettingsOpen(false);
          setReceiptFlow({paymentConfigured:true,paymentSaved:true});
        }}
      />
    </>
  );
}
