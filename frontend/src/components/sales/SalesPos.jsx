import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthContext';
import {useBranch} from '../../branches/BranchContext';
import {request,useResource,money} from '../../operations/shared';
import {Badge,Button,EmptyState,ErrorState,Modal,Skeleton,Toast} from '../../design-system';
import {AlertTriangle,Banknote,Barcode,Boxes,CheckCircle2,CreditCard,Grid2X2,History,Minus,Plus,Printer,ReceiptText,Search,ShoppingCart,Trash2,UserRound,WalletCards,X} from 'lucide-react';
import PaymentSettingsModal from '../PaymentSettingsModal';
import AddProductModal from '../../operations/AddProductModal';
import useAppSettings from '../../hooks/useAppSettings';
import {playAppBeep} from '../../services/appSettings';
import {cachePaymentSettings,createVietQrDataUrl,readCachedPaymentSettings} from '../../vietqr';
import './sales-pos.css';
import './sales-pos-enhancements.css';

const MODES={OWNER:'OWNER_MODE',CASHIER:'CASHIER_MODE'};
const makeRequestKey=()=>globalThis.crypto?.randomUUID?.()||`pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function normalizeQueuedSale(entry,branchId){
 const source=entry?.body||entry||{},method=source.payment?.method||source.payment_method||'CASH';
 const items=(Array.isArray(source.items)?source.items:[]).map(item=>{
  const discount=item.discount||((item.discount_type&&Number(item.discount_value)>0)?{type:item.discount_type,value:Number(item.discount_value)}:null)||((Number(item.discount_amount)>0)?{type:'FIXED',value:Number(item.discount_amount)}:undefined);
  return {product_id:Number(item.product_id??item.id),quantity:Number(item.quantity),...(discount?{discount}:{})};
 });
 let orderDiscount=source.order_discount;
 if(typeof orderDiscount==='number'&&orderDiscount>0)orderDiscount={type:'FIXED',value:orderDiscount};
 if(!orderDiscount&&Number(source.discount_amount)>0)orderDiscount={type:'FIXED',value:Number(source.discount_amount)};
 const clientDate=new Date(source.client_created_at||Date.now()),paymentMethod=method==='BANK_TRANSFER'?'BANK_TRANSFER':'CASH',cashReceived=source.payment?.cash_received??source.cash_received;
 const payment={method:paymentMethod};if(paymentMethod==='CASH'&&cashReceived!==undefined)payment.cash_received=Number(cashReceived);
 const body={branch_id:Number(source.branch_id||branchId),request_key:typeof source.request_key==='string'&&source.request_key.length>=12?source.request_key:makeRequestKey(),client_created_at:Number.isNaN(clientDate.getTime())?new Date().toISOString():clientDate.toISOString(),payment,items};
 if(source.order_status==='OPEN'||source.order_status==='COMPLETED')body.order_status=source.order_status;
 if(typeof source.note==='string')body.note=source.note;
 if(source.customer_id)body.customer_id=Number(source.customer_id);
 if(orderDiscount&&Number(orderDiscount.value)>0)body.order_discount={type:orderDiscount.type==='PERCENT'?'PERCENT':'FIXED',value:Number(orderDiscount.value)};
 return body;
}
function readOfflineQueue(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function writeOfflineQueue(key,queue){localStorage.setItem(key,JSON.stringify(queue));}
const waitForRetry=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function isTemporaryConnectionError(error){
 const status=Number(error?.status||0),detail=`${error?.code||''} ${error?.message||''}`;
 return [502,503,504].includes(status)||(!status&&/(failed to fetch|networkerror|network request failed|econnrefused|fetch failed|connection refused)/i.test(detail));
}
async function postSaleWithRetry(body){
 for(let retry=0;;retry++){
  try{return await request('/sales',{method:'POST',body});}
  catch(error){
   if(navigator.onLine&&retry<2&&isTemporaryConnectionError(error)){await waitForRetry(800);continue;}
   throw error;
  }
 }
}
const getDiscount=(base,discount)=>{
 if(!discount||!Number(discount.value))return 0;
 return Math.min(base,discount.type==='PERCENT'?Math.round(base*Number(discount.value)/100):Number(discount.value));
};
const roundUp=(value,step)=>Math.ceil(value/step)*step;
const draftSignature=({cart,customer,note,orderDiscount})=>JSON.stringify({
 items:cart.map(item=>({id:String(item.id),quantity:Number(item.quantity),discountType:item.discount?.type||'PERCENT',discountValue:Number(item.discount?.value||0)})).sort((a,b)=>a.id.localeCompare(b.id)),
 customerId:customer?.id?String(customer.id):null,
 note:note||'',
 orderDiscountType:orderDiscount?.type||'PERCENT',
 orderDiscountValue:Number(orderDiscount?.value||0)
});

function CategoryFilter({items,value,onChange,vertical=false}){
 return <nav className={`pos-categories ${vertical?'vertical':''}`} aria-label="Danh mục sản phẩm">
  <button className={!value?'active':''} onClick={()=>onChange('')}>Tất cả</button>
  {items.map(category=><button key={category.id} className={String(value)===String(category.id)?'active':''} onClick={()=>onChange(String(category.id))}>{category.name}</button>)}
 </nav>;
}

function getProductVisual(product){
 const text=`${product.category_name||''} ${product.name||''}`.toLocaleLowerCase('vi');
 if(/bút|sổ|văn phòng|giấy|thước/.test(text))return {icon:'✏️',kind:'stationery'};
 if(/balo|túi|ví|vali/.test(text))return {icon:'🎒',kind:'bags'};
 if(/áo|dép|giày|thời trang|quần/.test(text))return {icon:'👕',kind:'fashion'};
 if(/nước|uống|bánh|kẹo|trà|cà phê/.test(text))return {icon:'🥤',kind:'food'};
 if(/gia dụng|nồi|chảo|ly|cốc|đèn/.test(text))return {icon:'🏠',kind:'home'};
 return {icon:'📦',kind:'default'};
}
function ProductImage({product}){
 const [failed,setFailed]=useState(false);
 const visual=getProductVisual(product);
 return <span className={`pos-product-image pos-product-image-${visual.kind}`}>{product.image_url&&!failed?<img src={product.image_url} alt="" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{visual.icon}</span>}</span>;
}

function ProductGrid({products,loading,error,onAdd,cart}){
 if(loading)return <div className="pos-product-grid-wrap"><div className="pos-product-grid"><Skeleton lines={5}/><Skeleton lines={5}/><Skeleton lines={5}/></div></div>;
 if(error)return <div className="pos-product-grid-wrap"><ErrorState title="Không tải được sản phẩm" message={error}/></div>;
 if(!products.length)return <div className="pos-product-grid-wrap"><EmptyState title="Không có sản phẩm phù hợp" description="Thử từ khóa hoặc danh mục khác."/></div>;
 return <div className="pos-product-grid-wrap"><div className="pos-product-grid">{products.map(product=>{
  const stock=Number(product.stock||0),disabled=product.status!=='ACTIVE'||stock<=0,cartQty=Number(cart.find(item=>Number(item.id)===Number(product.id))?.quantity||0);
  return <button key={product.id} data-tour={products[0]?.id===product.id?'first-product':undefined} className={`pos-product-card ${disabled?'disabled':''} ${cartQty?'in-cart':''}`} disabled={disabled} onClick={()=>onAdd(product)} aria-label={`${product.name}, ${money(product.sale_price)}, tồn kho ${stock}${cartQty?`, trong giỏ ${cartQty}`:''}`}>
   <ProductImage product={product}/>{cartQty>0&&<span className="pos-product-cart-qty" aria-label={`${cartQty} trong giỏ`}>{cartQty}</span>}
   <span className="pos-product-name">{product.name}</span>
   <span className="pos-product-card-footer"><span className="pos-product-sku">{product.sku}{product.barcode&&String(product.barcode)!==String(product.sku)?` \u00b7 ${product.barcode}`:''}</span><span className="pos-product-price-stock"><strong>{money(product.sale_price)}</strong><span className={`pos-stock ${stock<=0?'out':stock<=5?'low':'ok'}`}>{stock<=0?'Hết hàng':stock<=5?`Sắp hết · ${stock}`:`Còn ${stock}`}</span></span></span>
  </button>;
 })}</div></div>;
}

function DiscountControl({value,onChange,label}){
 return <div className="pos-discount-control">
  <select aria-label={`${label} - loại giảm giá`} value={value.type} onChange={event=>onChange({...value,type:event.target.value})}>
   <option value="PERCENT">%</option><option value="FIXED">VNĐ</option>
  </select>
  <input aria-label={label} type="number" min="0" step={value.type==='PERCENT'?1:1000} value={value.value} onChange={event=>onChange({...value,value:event.target.value})}/>
 </div>;
}

function CartItem({item,onQuantity,onRemove,onDiscount,onStockLimit}){
 const [quantityInput,setQuantityInput]=useState(String(item.quantity));
 useEffect(()=>setQuantityInput(String(item.quantity)),[item.quantity]);
 const commitQuantity=()=>{
  const parsed=Number(quantityInput),maxStock=Math.max(1,Number(item.stock)||1);
  if(!quantityInput.trim()||!Number.isFinite(parsed)||parsed<=0){onQuantity(1);setQuantityInput('1');return;}
  const quantity=Math.floor(parsed);
  if(quantity>maxStock){onQuantity(maxStock);setQuantityInput(String(maxStock));onStockLimit?.(maxStock);return;}
  onQuantity(quantity);setQuantityInput(String(quantity));
 };
 const gross=Number(item.sale_price)*item.quantity,discount=getDiscount(gross,item.discount),line=gross-discount;
 return <article className="pos-cart-item">
  <ProductImage product={item}/>
  <div className="pos-cart-item-main">
   <div className="pos-cart-item-head"><div className="pos-cart-item-title"><strong>{item.name}</strong><small>{item.sku}{' \u00b7 '}{money(item.sale_price)}</small></div><button type="button" className="pos-icon-button" aria-label={`X\u00f3a ${item.name}`} onClick={onRemove}><Trash2 size={16}/></button></div>
   <div className="pos-cart-item-controls">
    <div className="pos-quantity"><button type="button" aria-label={'Gi\u1ea3m s\u1ed1 l\u01b0\u1ee3ng'} onClick={()=>onQuantity(item.quantity-1)}><Minus size={14}/></button><input className="pos-quantity-input" type="number" min="1" max={item.stock} step="1" aria-label={`S\u1ed1 l\u01b0\u1ee3ng ${item.name}`} value={quantityInput} onChange={event=>setQuantityInput(event.target.value)} onBlur={commitQuantity} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/><button type="button" aria-label={'T\u0103ng s\u1ed1 l\u01b0\u1ee3ng'} disabled={item.quantity>=Number(item.stock)} onClick={()=>onQuantity(item.quantity+1)}><Plus size={14}/></button></div>
    <DiscountControl label={`Gi\u1ea3m gi\u00e1 ${item.name}`} value={item.discount} onChange={onDiscount}/>
    <strong className="pos-line-total">{money(line)}</strong>
   </div>
   {discount>0&&<small className="pos-discount-note">{'\u0110\u00e3 gi\u1ea3m '}{money(discount)}</small>}
  </div>
 </article>;
}
function PaymentSection({method,onMethod,total,cash,onCash,paymentConfigured,onOpenPaymentSettings}){
 const change=Math.max(0,Number(cash||0)-total);
 return <section className="pos-payment">
  <div className="pos-payment-tabs">
   <button className={method==='CASH'?'active':''} onClick={()=>onMethod('CASH')}><Banknote size={16}/> Tiền mặt</button>
   <button className={method==='BANK_TRANSFER'?'active':''} onClick={()=>onMethod('BANK_TRANSFER')}><WalletCards size={16}/> Chuyển khoản</button>
  </div>
  {method==='CASH'?<>
   <label>Tiền khách đưa<input type="number" min="0" step="1000" value={cash} onChange={event=>onCash(event.target.value)}/></label>
   <div className="pos-cash-suggestions"><button onClick={()=>onCash(total)}>Đủ tiền</button>{[10000,20000,50000,100000].map(step=><button key={step} onClick={()=>onCash(roundUp(total,step))}>↑ {money(step)}</button>)}</div>
   <div className={`pos-change ${Number(cash||0)<total?'short':''}`}><span>{Number(cash||0)<total?'Còn thiếu':'Tiền thừa'}</span><strong>{money(Math.abs(Number(cash||0)-total))}</strong></div>
  </>:<>{!paymentConfigured&&<div role="alert" className="pos-bank-transfer"><AlertTriangle size={24}/><div><strong>Chi nhánh chưa cấu hình tài khoản/QR nhận tiền</strong><p>Hãy cài đặt thông tin nhận tiền trước khi thanh toán chuyển khoản.</p><Button type="button" variant="secondary" onClick={onOpenPaymentSettings}>Cài đặt thanh toán</Button></div></div>}<div className="pos-bank-transfer"><WalletCards size={28}/><div><strong>Đơn chuyển khoản sẽ ở trạng thái chờ xác nhận</strong><p>Hệ thống không tự đánh dấu đã thanh toán khi chưa có webhook hoặc xác nhận từ backend.</p><b>Số tiền: {money(total)}</b></div></div></>}
 </section>;
}

function VietQrImage({receipt}){
 const doc=receipt.document||{},branchId=doc.branch_id;
 const [settings,setSettings]=useState(()=>readCachedPaymentSettings(branchId));
 const [dataUrl,setDataUrl]=useState('');
 const [localQrState,setLocalQrState]=useState('idle');
 const [validatedFallback,setValidatedFallback]=useState('');
 const [online,setOnline]=useState(()=>navigator.onLine);
 useEffect(()=>{
  const onOnline=()=>setOnline(true),onOffline=()=>setOnline(false);
  window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);
  return()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);};
 },[]);
 useEffect(()=>{
  let active=true;
  const cached=readCachedPaymentSettings(branchId);
  setSettings(cached);
  if(!branchId||!navigator.onLine)return()=>{active=false;};
  request(`/branches/${branchId}/payment-settings`).then(value=>{
   if(!active)return;
   cachePaymentSettings(branchId,value);setSettings(value);
  }).catch(()=>{});
  return()=>{active=false;};
 },[branchId]);
 useEffect(()=>{
  let active=true;setDataUrl('');setLocalQrState('idle');
  if(settings?.bank_bin&&settings?.bank_account_number){
   setLocalQrState('generating');
   createVietQrDataUrl({bankBin:settings.bank_bin,accountNumber:settings.bank_account_number,amount:doc.total,addInfo:receipt.payment_reference})
    .then(url=>{if(!active)return;setDataUrl(url);setLocalQrState(url?'ready':'failed');})
    .catch(()=>{if(active)setLocalQrState('failed');});
  }
  return()=>{active=false;};
 },[settings?.bank_bin,settings?.bank_account_number,doc.total,receipt.payment_reference]);
 const fallbackUrl=settings?.static_qr_url||(online?receipt.payment_qr_url:'');
 useEffect(()=>{
  let active=true;setValidatedFallback('');
  if(!fallbackUrl)return()=>{active=false;};
  const probe=new Image();
  probe.onload=()=>{if(active)setValidatedFallback(fallbackUrl);};
  probe.onerror=()=>{if(active)setValidatedFallback('');};
  probe.src=fallbackUrl;
  return()=>{active=false;probe.onload=null;probe.onerror=null;};
 },[fallbackUrl]);
 if(dataUrl)return <img src={dataUrl} alt="VietQR"/>;
 if(localQrState==='generating')return <p className="pos-receipt-qr-status" role="status">Đang tạo mã VietQR ngoại tuyến…</p>;
 if(validatedFallback)return <img src={validatedFallback} alt="VietQR"/>;
 return <p className="pos-receipt-qr-unavailable" role="alert">{!online?'Đang ngoại tuyến (Offline) — Không thể tải mã QR trực tuyến, vui lòng thu Tiền mặt':'Không thể hiển thị mã QR. Vui lòng thu Tiền mặt hoặc kiểm tra lại cấu hình thanh toán.'}</p>;
}

export function ReceiptPreview({receipt}){
 const {user}=useAuth();const settings=useAppSettings(user?.id,user?.role);
 const {document:doc,items,payment_qr_url,payment_reference}=receipt;
 return <div className="pos-receipt" id="pos-receipt">
  <header><h2>{doc.organization_name}</h2><p>{doc.branch_name}</p><p>{doc.branch_address||''} {doc.branch_phone?`· ${doc.branch_phone}`:''}</p></header>
  <div className="pos-receipt-meta"><span>Hóa đơn #{doc.id}</span><span>{new Date(doc.created_at).toLocaleString('vi-VN')}</span><span>Thu ngân: {doc.performed_by_name}</span><span>Khách hàng: {doc.customer_name||'Khách lẻ'}</span></div>
  <table><thead><tr><th>Sản phẩm</th><th>SL</th><th>Thành tiền</th></tr></thead><tbody>{items.map(item=><tr key={item.product_id}><td>{item.product_name}<small>{item.sku} · {money(item.unit_price)}{Number(item.discount_amount)>0?` · Giảm ${money(item.discount_amount)}`:''}</small></td><td>{item.quantity}</td><td>{money(item.line_total)}</td></tr>)}</tbody></table>
  <dl><div><dt>Tiền hàng</dt><dd>{money(doc.subtotal)}</dd></div><div><dt>Giảm sản phẩm</dt><dd>-{money(doc.item_discount_total)}</dd></div><div><dt>Giảm toàn đơn</dt><dd>-{money(doc.order_discount)}</dd></div><div className="total"><dt>TỔNG THANH TOÁN</dt><dd>{money(doc.total)}</dd></div><div><dt>Phương thức</dt><dd>{doc.payment_method==='CASH'?'Tiền mặt':'Chuyển khoản'}</dd></div>{doc.payment_method==='CASH'&&<><div><dt>Khách đưa</dt><dd>{money(doc.cash_received)}</dd></div><div><dt>Tiền thừa</dt><dd>{money(doc.change_due)}</dd></div></>}</dl>
  <footer>{settings.operations?.receiptFooter||'Cảm ơn quý khách và hẹn gặp lại!'}</footer>
  {doc.payment_method==='BANK_TRANSFER'&&<div className="pos-receipt-qr"><p>{'Chuyển đúng '+money(doc.total)+' · Nội dung: '}<b>{payment_reference}</b></p><VietQrImage receipt={receipt}/></div>}
 </div>;
}

function PosCartPanel({cart,setCart,note,setNote,orderDiscount,setOrderDiscount,paymentMethod,setPaymentMethod,cashReceived,setCashReceived,onCheckout,onSaveOpen,busy,onClear,editing,isOpenOrderDirty,onCancelEditing,paymentConfigured,onOpenPaymentSettings,onStockLimit}){
 const [activeTab,setActiveTab]=useState('cart');
 const subtotal=cart.reduce((sum,item)=>sum+Number(item.sale_price)*item.quantity,0);
 const itemDiscount=cart.reduce((sum,item)=>sum+getDiscount(Number(item.sale_price)*item.quantity,item.discount),0);
 const orderDiscountAmount=getDiscount(subtotal-itemDiscount,orderDiscount);
 const total=Math.max(0,subtotal-itemDiscount-orderDiscountAmount);
 const update=(id,changes)=>setCart(items=>items.map(item=>item.id===id?{...item,...changes}:item));
 
 // Automatically switch to cart tab if cart becomes empty
 useEffect(()=>{
  if(cart.length===0){
   setActiveTab('cart');
  }
 },[cart.length]);

 return <aside className="pos-cart-panel pos-tabbed-panel">
  {editing&&<div className="pos-editing-banner"><strong>{'Đang mở đơn #'+editing}</strong><button type="button" onClick={onCancelEditing}>{'Hủy chọn (Về đơn mới)'}</button></div>}
  <div className="pos-tabs-header">
   <button type="button" className={activeTab==='cart'?'active':''} onClick={()=>setActiveTab('cart')}>
    Sản phẩm đã thêm ({cart.reduce((sum,item)=>sum+item.quantity,0)})
   </button>
   <button type="button" className={activeTab==='payment'?'active':''} disabled={cart.length===0||busy} onClick={()=>setActiveTab('payment')}>
    Giảm giá & Thanh toán
   </button>
  </div>

  {activeTab==='cart'?(
   <div className="pos-tab-content pos-cart-tab-content">
    <div className="pos-cart-top-bar" style={{justifyContent:'flex-end'}}>
     {!!cart.length&&<button type="button" className="pos-clear-btn" onClick={onClear}>
      <Trash2 size={15}/> Xóa giỏ
     </button>}
    </div>
    
    <div className="pos-cart-scrollable">
    <div className="pos-cart-list">
    {cart.length?cart.map(item=><CartItem key={item.id} item={item} onRemove={()=>setCart(items=>items.filter(row=>row.id!==item.id))} onQuantity={quantity=>quantity<1?setCart(items=>items.filter(row=>row.id!==item.id)):update(item.id,{quantity:Math.min(quantity,Number(item.stock))})} onDiscount={discount=>update(item.id,{discount})} onStockLimit={onStockLimit}/>):<EmptyState title="Giỏ hàng đang trống" description="Chạm vào sản phẩm để thêm vào đơn."/>}
    </div>
<div className="pos-cart-note-wrap">
     <label className="pos-note" style={{margin:0}}>Ghi chú đơn hàng<textarea maxLength="500" rows="2" value={note} onChange={event=>setNote(event.target.value)} placeholder="Nhập ghi chú cho đơn hàng..."/></label>
    </div>
    </div>

    <div className="pos-cart-footer-fixed">
     <div className="pos-summary-row">
      <span>Tạm tính:</span>
      <strong>{money(subtotal)}</strong>
     </div>
     {(!editing||isOpenOrderDirty)&&<Button type="button" className="pos-proceed-button" variant="secondary" disabled={cart.length===0||busy} onClick={onSaveOpen}>{'Gửi đơn'}</Button>}
     <Button type="button" data-tour="checkout-next" className="pos-proceed-button" variant="primary" disabled={cart.length===0||busy} onClick={()=>setActiveTab('payment')}>
      Tiếp tục thanh toán →
     </Button>
    </div>
   </div>
  ):(
   <div className="pos-tab-content pos-payment-tab-content">
    <div className="pos-cart-top-bar" style={{justifyContent:'flex-start'}}>
     <Button type="button" variant="secondary" className="pos-back-cart-btn" onClick={()=>setActiveTab('cart')}>
      ← Quay lại giỏ hàng
     </Button>
    </div>

    <div className="pos-checkout-scrollable">
     <div className="pos-order-discount">
      <span>Giảm giá toàn đơn</span>
      <DiscountControl label="Giảm giá toàn đơn" value={orderDiscount} onChange={setOrderDiscount}/>
     </div>
     <div className="pos-totals-breakdown">
      <div><span>Tiền hàng</span><strong>{money(subtotal)}</strong></div>
      <div><span>Giảm sản phẩm</span><strong>-{money(itemDiscount)}</strong></div>
      <div><span>Giảm toàn đơn</span><strong>-{money(orderDiscountAmount)}</strong></div>
      <div className="grand"><span>Tổng thanh toán</span><strong>{money(total)}</strong></div>
     </div>
     <PaymentSection method={paymentMethod} onMethod={setPaymentMethod} total={total} cash={cashReceived} onCash={setCashReceived} paymentConfigured={paymentConfigured} onOpenPaymentSettings={onOpenPaymentSettings}/>
    </div>

    <div className="pos-checkout-footer-fixed">
     <Button type="button" variant="secondary" className="pos-back-cart-btn" onClick={()=>setActiveTab('cart')}>
      Quay lại
     </Button>
     <Button type="button" data-tour="checkout-finish" className="pos-checkout-button" variant="primary" loading={busy} disabled={!cart.length||busy||(paymentMethod==='CASH'&&Number(cashReceived||0)<total)||(paymentMethod==='BANK_TRANSFER'&&!paymentConfigured)} onClick={()=>onCheckout(total,false)}>
      Thanh toán
     </Button>
    </div>
   </div>
  )}
 </aside>;
}

export default function SalesPos(){
 const {user}=useAuth();
 const {activeBranchId:branchId,activeBranch,branches:contextBranches,setActiveBranchId:setBranchId,isOwner}=useBranch();
 const appSettings=useAppSettings(user?.id,user?.role);
 const branches=useResource('/branches');
 const categories=useResource(branchId?`/categories?branch_id=${branchId}`:null);
 const [mode,setMode]=useState(MODES.OWNER);
 const [canChangeMode,setCanChangeMode]=useState(false);
 const [category,setCategory]=useState('');
 const [search,setSearch]=useState('');
 const [cart,setCart]=useState([]);
 const [offlineCount,setOfflineCount]=useState(0);
 const [offlineQueue,setOfflineQueue]=useState([]);
 const [syncingOffline,setSyncingOffline]=useState(false);
 const isSyncingRef=useRef(false);
 const [openOrders,setOpenOrders]=useState([]),[editing,setEditing]=useState(null),[editingBaseline,setEditingBaseline]=useState(null);
 const [customer,setCustomer]=useState(null);
 const [note,setNote]=useState('');
 const [orderDiscount,setOrderDiscount]=useState({type:'PERCENT',value:''});
 const [paymentMethod,setPaymentMethod]=useState('CASH');
 const [cashReceived,setCashReceived]=useState('');
 const [busy,setBusy]=useState(false);
 const submitLock=useRef(false),draftRequestKey=useRef(null);
 const [toast,setToast]=useState(null);
 useEffect(()=>{
  if(!toast)return;
  const timer=setTimeout(()=>setToast(current=>current===toast?null:current),1000);
  return ()=>clearTimeout(timer);
 },[toast]);
 const [receipt,setReceipt]=useState(null);
 const autoPrinted=useRef(null);
 useEffect(()=>{if(!receipt||!appSettings.operations?.autoPrint||receipt.document?.order_status!=='COMPLETED'||receipt.document?.payment_status==='WAITING_PAYMENT'||autoPrinted.current===String(receipt.document?.id))return;autoPrinted.current=String(receipt.document.id);const timer=setTimeout(()=>window.print(),350);return()=>clearTimeout(timer);},[receipt,appSettings.operations?.autoPrint]);
 const [confirmClear,setConfirmClear]=useState(false);
 const [paymentSettingsOpen,setPaymentSettingsOpen]=useState(false);
 const [addProductOpen,setAddProductOpen]=useState(false);
 const [paymentConfigured,setPaymentConfigured]=useState(false);
 const loadPaymentSettings=async()=>{if(!branchId){setPaymentConfigured(false);return;}try{const data=await request(`/branches/${branchId}/payment-settings`);cachePaymentSettings(branchId,data);setPaymentConfigured(Boolean((data.bank_bin&&data.bank_account_number)||(data.static_qr_url)));}catch{const cached=readCachedPaymentSettings(branchId);setPaymentConfigured(Boolean((cached?.bank_bin&&cached?.bank_account_number)||cached?.static_qr_url));}};
 useEffect(()=>{void loadPaymentSettings();},[branchId]);
 
 const products=useResource(branchId?`/products?limit=1000&all=1&status=ACTIVE&branch_id=${branchId}&branchId=${branchId}`:null);
 const inventoryBalances=useResource(branchId?`/inventory/balances?branch_id=${branchId}&branchId=${branchId}`:null);
 const storageScope=`ri_pos_${user?.organization_id||'org'}_${branchId}_${user?.id||'user'}`;
 const productsCacheKey=`${storageScope}_products`;
 const queueKey=`${storageScope}_queue`;
 const cachedProducts=(()=>{try{return JSON.parse(localStorage.getItem(productsCacheKey)||'[]');}catch{return [];}})();
 const cachedCategories=(()=>{try{return JSON.parse(localStorage.getItem(`ri_pos_${user?.organization_id||'org'}_${branchId}_categories`)||'[]');}catch{return [];}})();
 const cachedBranches=(()=>{try{return JSON.parse(localStorage.getItem(`ri_pos_${user?.organization_id||'org'}_branches_${user?.id||'user'}`)||'[]');}catch{return [];}})();

 const isOnline=typeof navigator!=='undefined'?Boolean(navigator.onLine):true;

 const stockMap=useMemo(()=>{
  const map=new Map();
  const items=inventoryBalances.data?.items;
  if(Array.isArray(items)){
   for(const item of items){
    const pId=Number(item.product_id??item.id);
    const qty=Number(item.quantity??item.stock??item.on_hand??item.stock_quantity??0);
     const itemBranchId=Number(item.branch_id??branchId);
     if(Number.isSafeInteger(pId)&&pId>0&&itemBranchId===Number(branchId)){
     map.set(pId,Math.max(0,qty));
    }
   }
  }
  return map;
 },[inventoryBalances.data,branchId]);

 const productItems=useMemo(()=>{
  let source=products.data?.items;
  if(!source||!source.length){
   if(!isOnline){
    source=cachedProducts;
   }else{
    source=[];
   }
  }

  return (source||[]).filter(product=>product.branch_id==null||Number(product.branch_id)===Number(branchId)).map(product=>{
   const pId=Number(product.id??product.product_id);
   let stock=0;
   if(stockMap.has(pId)){
    stock=stockMap.get(pId);
   }else{
    stock=Number(product.stock_remaining??product.stock??product.quantity??product.on_hand??product.stock_quantity??0);
   }

   return {
    ...product,
    id:pId,
    stock:Math.max(0,stock)
   };
  }).sort((a,b)=>Number(b.stock>0)-Number(a.stock>0));
 },[products.data,cachedProducts,isOnline,stockMap,branchId]);

 const branchItems=contextBranches.length?contextBranches:(branches.data?.branches||cachedBranches),categoriesItems=categories.data?.items||cachedCategories;
 const productsResourceRef=useRef(products);productsResourceRef.current=products;
 const inventoryResourceRef=useRef(inventoryBalances);inventoryResourceRef.current=inventoryBalances;
 const refetchProducts=useCallback(()=>{
  productsResourceRef.current?.reload?.();
  inventoryResourceRef.current?.reload?.();
 },[]);
 const applyOptimisticStock=useCallback((soldItems,direction=-1)=>{
  const soldByProduct=new Map();
  for(const item of soldItems||[]){
   const productId=Number(item.product_id??item.id),quantity=Number(item.quantity);
   if(Number.isSafeInteger(productId)&&productId>0&&Number.isSafeInteger(quantity)&&quantity>0)soldByProduct.set(productId,(soldByProduct.get(productId)||0)+quantity);
  }
  if(!soldByProduct.size)return;
  productsResourceRef.current?.mutate?.(current=>{
   let source=Array.isArray(current?.items)?current.items:null;
   if(!source){try{const cached=JSON.parse(localStorage.getItem(productsCacheKey)||'[]');source=Array.isArray(cached)?cached:[];}catch{source=[];}}
   const items=source.map(product=>{
    const sold=soldByProduct.get(Number(product.id));
    return sold?{...product,stock:Math.max(0,Number(product.stock||0)+(direction*Number(sold)))}:product;
   });
   try{localStorage.setItem(productsCacheKey,JSON.stringify(items));}catch{}
   return current&&typeof current==='object'?{...current,items}:{items};
  });
 },[productsCacheKey]);

 useEffect(()=>{if(!branchId||!user?.id)return;try{setCart(JSON.parse(localStorage.getItem(`${storageScope}_cart`)||'[]'));}catch{setCart([]);}},[storageScope,branchId,user?.id]);
 useEffect(()=>{if(!branchId||!user?.id)return;localStorage.setItem(`${storageScope}_cart`,JSON.stringify(cart));},[storageScope,branchId,user?.id,cart]);
 useEffect(()=>{
  if(isOnline&&products.data?.items&&products.data.items.length>0){
   try{localStorage.setItem(productsCacheKey,JSON.stringify(productItems));}catch{}
  }
 },[isOnline,products.data,productItems,productsCacheKey]);
 useEffect(()=>{if(categories.data?.items)localStorage.setItem(`ri_pos_${user?.organization_id||'org'}_${branchId}_categories`,JSON.stringify(categories.data.items));},[categories.data,user?.organization_id,branchId]);
 useEffect(()=>{if(branches.data?.branches)localStorage.setItem(`ri_pos_${user?.organization_id||'org'}_branches_${user?.id||'user'}`,JSON.stringify(branches.data.branches));},[branches.data,user?.organization_id,user?.id]);
 const refreshOpenOrders=useCallback(()=>{if(!branchId)return Promise.resolve();return request(`/sales/open?branch_id=${branchId}`).then(data=>setOpenOrders(data.items||[])).catch(()=>{});},[branchId]);
 const syncOfflineQueue=useCallback(async({retryFailed=false}={})=>{
  if(isSyncingRef.current||!navigator.onLine||!user?.id||!branchId)return;
  isSyncingRef.current=true;setSyncingOffline(true);
  try{
   while(navigator.onLine){
    const queue=readOfflineQueue(queueKey);setOfflineQueue(queue);setOfflineCount(queue.length);
    if(!queue.length)break;
    const entry=queue[0];if(entry.failed&&!retryFailed)break;
    const body=normalizeQueuedSale(entry,branchId);
    if(!Number.isSafeInteger(body.branch_id)||body.branch_id<1||!body.items.length||body.items.some(item=>!Number.isSafeInteger(item.product_id)||item.product_id<1||!Number.isSafeInteger(item.quantity)||item.quantity<1)){
     const invalid={...entry,body,failed:'Dữ liệu đơn offline không hợp lệ: cần chi nhánh và ít nhất một sản phẩm với số lượng hợp lệ.',retryMessage:null};
     const next=[invalid,...queue.slice(1)];writeOfflineQueue(queueKey,next);setOfflineQueue(next);setOfflineCount(next.length);break;
    }
    const normalizedEntry={...entry,body,failed:null,retryMessage:null};
    writeOfflineQueue(queueKey,[normalizedEntry,...queue.slice(1)]);
    try{
     const result=await request('/sales',{method:'POST',body});
     const remaining=readOfflineQueue(queueKey).filter(item=>(item?.body||item)?.request_key!==body.request_key);
     writeOfflineQueue(queueKey,remaining);setOfflineQueue(remaining);setOfflineCount(remaining.length);
     await refreshOpenOrders();refetchProducts();
     setToast({tone:'success',title:result.replayed?`\u0110\u01a1n #${result.id} \u0111\u00e3 c\u00f3 tr\u00ean m\u00e1y ch\u1ee7`:`\u0110\u00e3 \u0111\u1ed3ng b\u1ed9 \u0111\u01a1n #${result.id}`,message:result.replayed?'\u0110\u00e3 x\u00f3a \u0111\u01a1n kh\u1ecfi h\u00e0ng \u0111\u1ee3i v\u00ec m\u00e1y ch\u1ee7 \u0111\u00e3 ghi nh\u1eadn \u0111\u01a1n n\u00e0y.':'\u0110\u01a1n \u0111\u00e3 \u0111\u01b0\u1ee3c c\u1eadp nh\u1eadt tr\u00ean m\u00e1y ch\u1ee7.'});
     retryFailed=false;
    }catch(error){
     const current=readOfflineQueue(queueKey),failedIndex=current.findIndex(item=>(item?.body||item)?.request_key===body.request_key);if(failedIndex<0)break;const first=current[failedIndex];
     const isBusinessError=Number(error.status)>=400&&Number(error.status)<500&&![408,425,429].includes(Number(error.status));
     const updated={...first,body,failed:isBusinessError?(error.message||`Lỗi nghiệp vụ HTTP ${error.status}`):null,retryMessage:isBusinessError?null:(error.message||'Máy chủ tạm thời chưa kết nối được; sẽ tự thử lại khi có mạng.')};
     const next=[...current];next[failedIndex]=updated;writeOfflineQueue(queueKey,next);setOfflineQueue(next);setOfflineCount(next.length);
     if(isBusinessError)setToast({tone:'danger',title:`Lỗi đồng bộ đơn #${body.request_key.slice(0,8)}`,message:error.message||'Máy chủ từ chối dữ liệu đơn.'});
     break;
    }
   }
  }finally{isSyncingRef.current=false;setSyncingOffline(false);}
 },[branchId,queueKey,refetchProducts,refreshOpenOrders,user?.id]);
 useEffect(()=>{refreshOpenOrders();},[refreshOpenOrders]);
 useEffect(()=>{
  const queue=readOfflineQueue(queueKey);setOfflineQueue(queue);setOfflineCount(queue.length);
  if(navigator.onLine&&queue.length)void syncOfflineQueue();
 },[queueKey,syncOfflineQueue]);
 useEffect(()=>{
  const onOnline=()=>void syncOfflineQueue();
  const onVisibility=()=>{if(document.visibilityState==='visible')void syncOfflineQueue();};
  const timer=setInterval(()=>{if(navigator.onLine&&readOfflineQueue(queueKey).length)void syncOfflineQueue();},10000);
  window.addEventListener('online',onOnline);document.addEventListener('visibilitychange',onVisibility);
  return()=>{clearInterval(timer);window.removeEventListener('online',onOnline);document.removeEventListener('visibilitychange',onVisibility);};
 },[queueKey,syncOfflineQueue]);

 useEffect(()=>{if(isOnline)try{localStorage.removeItem(productsCacheKey);}catch{}},[isOnline,productsCacheKey]);
 useEffect(()=>{
  if(!branchId)return;
  const cacheKey=`ri_pos_layout_${branchId}`;
  const fallback=localStorage.getItem(cacheKey);
  if(Object.values(MODES).includes(fallback))setMode(fallback);
  request(`/branches/${branchId}/pos-settings`).then(settings=>{setMode(settings.pos_layout_mode);setCanChangeMode(settings.can_change);localStorage.setItem(cacheKey,settings.pos_layout_mode);}).catch(()=>setCanChangeMode(['OWNER','MANAGER'].includes(user?.role)));
 },[branchId,user?.role]);

 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase();
  const list=productItems.filter(product=>{
   if(product.status&&product.status!=='ACTIVE')return false;
   if(category&&String(product.category_id)!==category)return false;
   if(q&&!`${product.name} ${product.sku} ${product.barcode||''}`.toLowerCase().includes(q))return false;
   return true;
  });
  return list.sort((a,b)=>{
   const stockA=Number(a.stock||0);
   const stockB=Number(b.stock||0);
   const inStockA=stockA>0?1:0;
   const inStockB=stockB>0?1:0;
   if(inStockA!==inStockB)return inStockB-inStockA;
   if(stockA!==stockB)return stockB-stockA;
   return String(a.name||'').localeCompare(String(b.name||''),'vi');
  });
 },[productItems,category,search]);
 useEffect(()=>{
  const q=search.trim().toLowerCase();
  if(!q||!category)return;
  const matching=productItems.filter(product=>`${product.name} ${product.sku} ${product.barcode||''}`.toLowerCase().includes(q));
  if(matching.some(product=>String(product.category_id||'')===category))return;
  if(matching.length)setCategory(String(matching[0].category_id||''));
 },[productItems,category,search]);
 const branch=activeBranch||branchItems.find(item=>String(item.id)===branchId);
 const isOpenOrderDirty=editing!==null&&editingBaseline!==null&&draftSignature({cart,customer,note,orderDiscount})!==editingBaseline;
 const changeMode=next=>{
  if(next===mode||!canChangeMode)return;
  const cacheKey=`ri_pos_layout_${branchId}`;
  setMode(next);
  localStorage.setItem(cacheKey,next);
  setToast({tone:'success',title:'Đã đổi bố cục',message:'Giỏ hàng được giữ nguyên; hệ thống đang đồng bộ cấu hình.'});
  request(`/branches/${branchId}/pos-settings`,{method:'PATCH',body:{pos_layout_mode:next}})
   .then(settings=>{setMode(settings.pos_layout_mode);localStorage.setItem(cacheKey,settings.pos_layout_mode);})
   .catch(()=>setToast({tone:'warning',title:'Đã đổi bố cục trên thiết bị này',message:'Chưa đồng bộ được với máy chủ; hệ thống sẽ dùng cấu hình đã lưu cục bộ.'}));
 };
 const addProduct=product=>{
  if(Number(product.stock)<=0)return;
  setCart(items=>{const found=items.find(item=>item.id===product.id);if(found){if(found.quantity>=Number(product.stock)){setToast({tone:'warning',title:'Đã đạt tồn kho khả dụng',message:product.name});return items;}return items.map(item=>item.id===product.id?{...item,quantity:item.quantity+1}:item);}return [...items,{...product,quantity:1,discount:{type:'PERCENT',value:''}}];});
  setToast({tone:'success',title:'Đã thêm vào giỏ',message:product.name});
  playAppBeep(user?.id);
 };
 const barcodeSubmit=event=>{if(event.key!=='Enter')return;event.preventDefault();const code=search.trim().toLowerCase(),product=productItems.find(item=>String(item.barcode||'').toLowerCase()===code||String(item.sku).toLowerCase()===code);if(product)addProduct(product);else setToast({tone:'danger',title:'Không tìm thấy mã',message:search});};
 const resetDraft=()=>{setEditing(null);setEditingBaseline(null);setCart([]);setCustomer(current=>current?{options:current.options}:null);setNote('');setOrderDiscount({type:'PERCENT',value:''});setPaymentMethod('CASH');setCashReceived('');draftRequestKey.current=makeRequestKey();};
 const checkout=async(total,saveOpen=false)=>{
  if(submitLock.current||!cart.length)return;submitLock.current=true;setBusy(true);setToast(null);
  const isEditing=editing!==null;
  const body={branch_id:Number(branchId),request_key:draftRequestKey.current||(draftRequestKey.current=makeRequestKey()),client_created_at:new Date().toISOString(),order_status:saveOpen?'OPEN':undefined,note:note||undefined,customer_id:customer?.id?Number(customer.id):undefined,order_discount:Number(orderDiscount.value)>0?{type:orderDiscount.type,value:Number(orderDiscount.value)}:undefined,payment:{method:paymentMethod,...(paymentMethod==='CASH'?{cash_received:Number(cashReceived)}:{})},items:cart.map(item=>({product_id:Number(item.id),quantity:item.quantity,...(Number(item.discount.value)>0?{discount:{type:item.discount.type,value:Number(item.discount.value)}}:{})}))};
  const enqueueOfflineSale=()=>{const queue=readOfflineQueue(queueKey);queue.push({body,failed:null,retryMessage:null});writeOfflineQueue(queueKey,queue);setOfflineQueue(queue);setOfflineCount(queue.length);applyOptimisticStock(body.items);resetDraft();setToast({tone:'warning',title:'\u0110\u00e3 l\u01b0u \u0111\u01a1n offline',message:'\u0110\u01a1n s\u1ebd \u0111\u01b0\u1ee3c \u0111\u1ed3ng b\u1ed9 khi k\u1ebft n\u1ed1i m\u1ea1ng tr\u1edf l\u1ea1i.'});};
  try{
   if(!isEditing&&navigator.onLine===false){enqueueOfflineSale();return;}
   const updateBody={note:body.note||null,customer_id:body.customer_id||null,order_discount:body.order_discount,payment_method:paymentMethod,items:body.items};
   const result=isEditing?await request(`/documents/sales/${editing}`,{method:'PUT',body:updateBody}):await postSaleWithRetry(body);
   if(isEditing&&!saveOpen&&paymentMethod==='CASH')await request(`/sales/${result.id}/confirm-payment`,{method:'POST',body:{}});
   if(!isEditing)applyOptimisticStock(body.items);
   refetchProducts();refreshOpenOrders();
   if(saveOpen){resetDraft();setToast({tone:'success',title:isEditing?'Đã cập nhật đơn':'Đã gửi đơn #'+result.id+' thành công',message:isEditing?'Đơn #'+result.id+' đã cập nhật.':'Giỏ hàng đã sẵn sàng cho khách tiếp theo.'});}
   else{const detail=await request(`/sales/${result.id}`);setReceipt(detail);resetDraft();setToast({tone:'success',title:detail.document.payment_status==='WAITING_PAYMENT'?'Đang chờ thanh toán':'Đã tạo hóa đơn',message:`Mã #${result.id}`});if(!isEditing&&detail.document.payment_status!=='WAITING_PAYMENT')document.dispatchEvent(new CustomEvent('retail-tour',{detail:'sale-completed'}));}
  }catch(error){
   const temporarilyUnavailable=isTemporaryConnectionError(error)||(navigator.onLine===false&&!Number(error?.status||0));
   if(!isEditing&&navigator.onLine===false&&temporarilyUnavailable)enqueueOfflineSale();
   else if(navigator.onLine&&temporarilyUnavailable)setToast({tone:'danger',title:'\u004d\u00e1y ch\u1ee7 \u0111ang gi\u00e1n \u0111o\u1ea1n',message:'K\u1ebft n\u1ed1i m\u00e1y ch\u1ee7 t\u1ea1m gi\u00e1n \u0111o\u1ea1n, vui l\u00f2ng b\u1ea5m th\u1eed l\u1ea1i'});
   else setToast({tone:'danger',title:'Thanh to\u00e1n ch\u01b0a ho\u00e0n t\u1ea5t',message:error.message});
  }finally{submitLock.current=false;setBusy(false);}
 };
 const confirmTransfer=async()=>{
  if(!receipt||busy)return;setBusy(true);
  try{await request(`/sales/${receipt.document.id}/confirm-payment`,{method:'POST',body:{}});const detail=await request(`/sales/${receipt.document.id}`);setReceipt(detail);refetchProducts();refreshOpenOrders();setToast({tone:'success',title:'Đã xác nhận chuyển khoản',message:`Hóa đơn #${receipt.document.id} đã thanh toán.`});document.dispatchEvent(new CustomEvent('retail-tour',{detail:'sale-completed'}));}
  catch(error){setToast({tone:'danger',title:'Chưa thể xác nhận',message:error.message});}
  finally{setBusy(false);}
 };
 const loadOpenOrder=async id=>{try{
  const detail=await request(`/sales/${id}`);
  const loadedCart=detail.items.map(item=>{const p=productItems.find(row=>String(row.id)===String(item.product_id))||{};return {...p,id:item.product_id,sale_price:Number(item.unit_price),stock:Math.max(Number(p.stock||0),Number(item.quantity)),quantity:Number(item.quantity),discount:{type:item.discount_type||'PERCENT',value:Number(item.discount_value||0)}};});
  const loadedCustomer=detail.document.customer_id?{id:detail.document.customer_id,name:detail.document.customer_name,options:customer?.options||[]}:null;
  const loadedNote=detail.document.note||'';
  const loadedOrderDiscount={type:'FIXED',value:Number(detail.document.order_discount||0)};
  setEditing(id);setCart(loadedCart);setCustomer(loadedCustomer);setNote(loadedNote);setOrderDiscount(loadedOrderDiscount);setEditingBaseline(draftSignature({cart:loadedCart,customer:loadedCustomer,note:loadedNote,orderDiscount:loadedOrderDiscount}));setPaymentMethod(detail.document.payment_method||'CASH');setCashReceived('');
 }catch(e){setToast({tone:'danger',title:'Could not load open order',message:e.message});}};
 const cancelOpenOrder=async id=>{try{await request(`/sales/${id}/cancel`,{method:'POST',body:{}});refetchProducts();refreshOpenOrders();if(editing===id)resetDraft();setToast({tone:'success',title:'Đã hủy đơn',message:`Mã #${id}`});}catch(e){setToast({tone:'danger',title:'Chưa thể hủy đơn',message:e.message});}};
 const newOrder=()=>{setReceipt(null);resetDraft();refetchProducts();};
 const cartProps={cart,setCart,customer,setCustomer,note,setNote,orderDiscount,setOrderDiscount,paymentMethod,setPaymentMethod,cashReceived,setCashReceived,onCheckout:checkout,onSaveOpen:()=>checkout(undefined,true),busy,onClear:()=>setConfirmClear(true),editing,isOpenOrderDirty,onCancelEditing:resetDraft,paymentConfigured,onOpenPaymentSettings:()=>setPaymentSettingsOpen(true),onStockLimit:maxStock=>setToast({tone:'warning',title:'Tồn kho giới hạn',message:`Tồn kho chỉ còn ${maxStock} sản phẩm`})};

 return <div className="sales-pos">
  <header className="pos-header"><div><span className="pos-eyebrow">RETAIL INSIGHT POS</span><h1>Bán hàng tại quầy</h1><p>{branch?.name||'Chọn chi nhánh'} · {user?.name||user?.email}</p><span className={`badge ${navigator.onLine?'badge-success':'badge-warning'}`}>{navigator.onLine?'Online':'Offline'}{offlineCount?` · ${offlineCount} đơn chờ đồng bộ`:''}</span></div><div className="pos-header-actions">{isOwner?<select value={branchId} onChange={event=>{if(cart.length&&!window.confirm('Đổi chi nhánh sẽ xóa giỏ hàng hiện tại. Tiếp tục?'))return;resetDraft();setBranchId(event.target.value);setCategory('');}}>{branchItems.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>:<span className="branch-static-badge">{branch?.name||`Chi nhánh #${branchId}`}</span>}{['OWNER','MANAGER'].includes(user?.role)&&<button type="button" className="pos-history-link" onClick={()=>setPaymentSettingsOpen(true)}><CreditCard size={16}/> Cài đặt thanh toán</button>}<Link className="pos-history-link" to="/sales/history"><History size={16}/> Lịch sử</Link></div></header>
  {toast&&<div className="pos-toast"><Toast tone={toast.tone} title={toast.title} onDismiss={()=>setToast(null)}>{toast.message}</Toast></div>}
  {!!openOrders.length&&<section className="card" style={{marginBottom:14,padding:14}}><strong>Đơn đang mở · {openOrders.length}</strong><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>{openOrders.map(order=><span key={order.id} style={{display:'inline-flex',gap:6,alignItems:'center',border:'1px solid var(--ri-border)',borderRadius:8,padding:'6px 9px'}}><button className="pos-history-link" onClick={()=>loadOpenOrder(order.id)}>#{order.id} · {money(order.total)}</button><button className="pos-icon-button" aria-label={`Hủy đơn ${order.id}`} onClick={()=>cancelOpenOrder(order.id)}><Trash2 size={14}/></button></span>)}</div></section>}
  {!!offlineQueue.length&&<section className="card" style={{marginBottom:14,padding:14}}><strong>Hàng đợi offline · {offlineQueue.length}</strong><div style={{display:'grid',gap:8,marginTop:8}}>{offlineQueue.map((entry,index)=>{const queuedBody=entry?.body||entry||{},requestKey=queuedBody.request_key||`offline-${index}`,status=entry.failed?`Lỗi đồng bộ: ${entry.failed}`:entry.retryMessage?`Đang thử lại: ${entry.retryMessage}`:'Đang chờ đồng bộ';return <div key={requestKey} style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',flexWrap:'wrap'}}><span>#{String(requestKey).slice(0,8)} · {status}</span><span style={{display:'flex',gap:6}}><button type="button" className="btn btn-secondary btn-sm" disabled={!navigator.onLine||syncingOffline} onClick={()=>void syncOfflineQueue({retryFailed:true})}>{syncingOffline?'Đang đồng bộ…':'Đồng bộ ngay'}</button><button type="button" className="btn btn-secondary btn-sm" onClick={()=>{const q=readOfflineQueue(queueKey).filter(item=>(item?.body||item)?.request_key!==requestKey);writeOfflineQueue(queueKey,q);setOfflineQueue(q);setOfflineCount(q.length);applyOptimisticStock(queuedBody.items,1);if(navigator.onLine)refetchProducts();}}>Xóa khỏi hàng đợi</button></span></div>;})}</div></section>}
  <div className="pos-workspace"><main className="pos-catalog"><div className="pos-search-row"><div className="pos-search"><Search size={19}/><input autoFocus aria-label="Tìm sản phẩm" placeholder="Tìm tên sản phẩm hoặc mã sản phẩm..." value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={barcodeSubmit}/>{!!search&&<button type="button" className="pos-search-clear" aria-label="Xóa từ khóa tìm kiếm" onClick={()=>setSearch('')}><X size={16}/></button>}</div>{['OWNER','MANAGER','INVENTORY'].includes(user?.role)&&<button type="button" className="btn btn-primary pos-add-product" onClick={()=>setAddProductOpen(true)}><Plus size={16}/> Thêm sản phẩm</button>}</div><CategoryFilter items={categoriesItems} value={category} onChange={setCategory}/><ProductGrid products={filtered} loading={products.loading&&!productItems.length} error={productItems.length?'':products.error} onAdd={addProduct} cart={cart}/></main><PosCartPanel {...cartProps}/></div>
  <AddProductModal open={addProductOpen} allowAddToCart onClose={()=>setAddProductOpen(false)} onCreated={product=>{refetchProducts();categories.reload?.();if(product.addToCart&&Number(product.stock)>0)addProduct({...product,id:Number(product.id),stock:Number(product.stock),sale_price:Number(product.sale_price),sku:product.sku,name:product.name});}}/>
  <PaymentSettingsModal open={paymentSettingsOpen} branchId={branchId} onClose={()=>setPaymentSettingsOpen(false)} onSaved={()=>void loadPaymentSettings()}/>
  <Modal open={confirmClear} onClose={()=>setConfirmClear(false)} title="Xóa toàn bộ giỏ hàng?" footer={<><Button variant="secondary" onClick={()=>setConfirmClear(false)}>Hủy</Button><Button variant="danger" onClick={()=>{setCart([]);setConfirmClear(false);}}>Xóa giỏ</Button></>}><p>Thao tác này chỉ xóa giỏ hiện tại, không ảnh hưởng các hóa đơn đã tạo.</p></Modal>
  <Modal open={Boolean(receipt)} onClose={()=>setReceipt(null)} title={receipt?.document?.payment_status==='WAITING_PAYMENT'?'Đơn chờ thanh toán':'Thanh toán thành công'} className="pos-receipt-modal" footer={<><Button variant="secondary" onClick={()=>window.print()}><Printer size={16}/> In hóa đơn</Button><Link to="/sales/history"><Button variant="secondary"><ReceiptText size={16}/> Xem lịch sử</Button></Link>{receipt?.document?.payment_status==='WAITING_PAYMENT'&&<Button loading={busy} onClick={confirmTransfer}><CheckCircle2 size={16}/> Xác nhận đã nhận đủ tiền</Button>}<Button variant={receipt?.document?.payment_status==='WAITING_PAYMENT'?'secondary':'primary'} onClick={newOrder}>Tạo đơn mới</Button></>}>{receipt&&<ReceiptPreview receipt={receipt}/>}</Modal>
 </div>;
}
