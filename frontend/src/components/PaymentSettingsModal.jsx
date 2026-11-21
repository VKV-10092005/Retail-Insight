import React,{useEffect,useRef,useState} from 'react';
import {CreditCard,ImagePlus,Save,Upload,ArrowRight,X,Phone,MapPin,Wifi,Receipt} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import jsQR from 'jsqr';
import {request} from '../operations/shared';
import {useAuth} from '../auth/AuthContext';
import {Button,Modal} from '../design-system';
import {VIETQR_BANKS} from '../data/vietqrBanks';
import {cachePaymentSettings} from '../vietqr';
import './PaymentSettingsModal.css';

const empty={bank_bin:'',bank_code:'',bank_account_number:'',bank_account_name:'',static_qr_url:'',store_phone:'',store_address:'',wifi_password:''};
const snapshot=value=>({bank_bin:String(value.bank_bin||''),bank_code:String(value.bank_code||''),bank_account_number:String(value.bank_account_number||''),bank_account_name:String(value.bank_account_name||''),static_qr_url:String(value.static_qr_url||''),store_phone:String(value.store_phone||''),store_address:String(value.store_address||''),wifi_password:String(value.wifi_password||'')});

function parseTlv(payload){
 const fields={};let offset=0;
 while(offset+4<=payload.length){
  const tag=payload.slice(offset,offset+2),length=Number(payload.slice(offset+2,offset+4));
  if(!/^\d{2}$/.test(tag)||!Number.isInteger(length)||length<0||offset+4+length>payload.length)break;
  fields[tag]=payload.slice(offset+4,offset+4+length);offset+=4+length;
 }
 return fields;
}

function extractVietQrAccount(payload){
 const root=parseTlv(payload);
 for(const [tag,value] of Object.entries(root)){
  if(!/^(?:26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51)$/.test(tag))continue;
  const template=parseTlv(value);
  if(template['00']!=='A000000727')continue;
  const beneficiary=parseTlv(template['01']||'');
  let bankBin='',accountNumber='';
  if(/^\d{6}$/.test(template['01']||'')){bankBin=template['01'];accountNumber=template['02']||'';}
  else{bankBin=beneficiary['00']||'';accountNumber=beneficiary['01']||'';}
  if(!bankBin&&/^\d{6}/.test(template['01']||'')){const direct=template['01'];bankBin=direct.slice(0,6);accountNumber=direct.slice(6);}
  if(/^\d{6}$/.test(bankBin)&&/^[A-Za-z0-9-]{4,40}$/.test(accountNumber))return {bank_bin:bankBin,bank_account_number:accountNumber};
 }
 return null;
}

function toBlob(canvas,type,quality){
 return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}

async function processQrImage(file){
 const image=await createImageBitmap(file);
 const scanScale=Math.min(1,1600/Math.max(image.width,image.height));
 const scanCanvas=document.createElement('canvas');
 scanCanvas.width=Math.max(1,Math.round(image.width*scanScale));scanCanvas.height=Math.max(1,Math.round(image.height*scanScale));
 const scanContext=scanCanvas.getContext('2d',{willReadFrequently:true});
 scanContext.drawImage(image,0,0,scanCanvas.width,scanCanvas.height);
 const pixels=scanContext.getImageData(0,0,scanCanvas.width,scanCanvas.height);
 const decoded=jsQR(pixels.data,scanCanvas.width,scanCanvas.height,{inversionAttempts:'attemptBoth'});
 const account=decoded?.data?extractVietQrAccount(decoded.data):null;

 const scale=Math.min(1,800/image.width);
 let width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
 let blob=null;
 for(let attempt=0;attempt<12;attempt++){
  canvas.width=width;canvas.height=height;
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
  blob=await toBlob(canvas,'image/webp',0.82)||await toBlob(canvas,'image/jpeg',0.82);
  if(blob&&blob.size<=120*1024)break;
  width=Math.max(1,Math.round(width*.88));height=Math.max(1,Math.round(height*.88));
 }
 image.close?.();
 if(!blob)throw new Error('Trình duyệt không thể nén ảnh QR này.');
 return {dataUrl:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Không thể đọc ảnh QR đã nén.'));reader.readAsDataURL(blob);}),account,blobSize:blob.size};
}

export default function PaymentSettingsModal({open,onClose,branchId,onSaved}){
 const {user}=useAuth();
 const navigate=useNavigate();
 const fileInput=useRef(null);
 const [validationErrors,setValidationErrors]=useState({});
 const [form,setForm]=useState(empty),[initialConfig,setInitialConfig]=useState(null),[tab,setTab]=useState('bank'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[banks,setBanks]=useState(VIETQR_BANKS),[bankSearch,setBankSearch]=useState(''),[showBanks,setShowBanks]=useState(false),[manualBin,setManualBin]=useState(false),[dragging,setDragging]=useState(false),[imageProcessing,setImageProcessing]=useState(false),[qrSuccess,setQrSuccess]=useState(''),[readyNotice,setReadyNotice]=useState(false);
 const isDirty=Boolean(initialConfig&&JSON.stringify(snapshot(form))!==JSON.stringify(initialConfig));

 useEffect(()=>{let active=true;const cacheKey='ri_vietqr_bank_catalogue';try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(Array.isArray(cached?.data)&&Date.now()-cached.savedAt<86400000)setBanks([...new Map([...VIETQR_BANKS,...cached.data].map(bank=>[String(bank.bin),bank])).values()]);}catch{}fetch('https://api.vietqr.io/v2/banks').then(r=>{if(!r.ok)throw Error('Bank catalogue unavailable');return r.json();}).then(json=>{if(!active||!Array.isArray(json.data))return;const rows=json.data.filter(b=>b.bin&&b.code).map(b=>({bin:String(b.bin),code:String(b.code),name:String(b.shortName||b.name||b.code),legalName:String(b.name||''),logo:b.logo||`https://api.vietqr.io/img/${b.code}.png`}));const all=[...new Map([...VIETQR_BANKS,...rows].map(bank=>[String(bank.bin),bank])).values()];setBanks(all);localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),data:rows}));}).catch(()=>{});return()=>{active=false;};},[]);
 useEffect(()=>{if(!open||!branchId)return;setError('');setSaved(false);setQrSuccess('');setImageProcessing(false);setInitialConfig(null);request(`/branches/${branchId}/payment-settings`).then(data=>{const next={...empty,...data};cachePaymentSettings(branchId,next);setForm(next);setInitialConfig(snapshot(next));}).catch(e=>setError(e.message));},[open,branchId]);
 useEffect(()=>{const selected=banks.find(bank=>bank.bin===form.bank_bin);if(selected){setBankSearch(`${selected.name} (${selected.code} · ${selected.bin})`);setManualBin(false);}else if(form.bank_bin){setManualBin(true);setBankSearch('Ngân hàng khác (nhập mã BIN thủ công)');}},[banks,form.bank_bin]);
 const set=(key,value)=>{setForm(current=>({...current,[key]:value}));setValidationErrors(current=>{const next={...current};delete next[key];return next;});};
 const profileAccountName=String(user?.full_name||user?.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,char=>char==='đ'?'d':'D').toUpperCase().trim();

 async function chooseFile(file){
  if(!file)return;setError('');setQrSuccess('');
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)){setError("Chỉ hỗ trợ ảnh PNG, JPG hoặc WEBP.");return;}
  if(file.size>15*1024*1024){setError("Ảnh gốc tối đa 15 MB.");return;}
  setImageProcessing(true);
  try{
   const processed=await processQrImage(file);
   if(processed.account){
    const bank=VIETQR_BANKS.find(item=>item.bin===processed.account.bank_bin)||banks.find(item=>item.bin===processed.account.bank_bin);
    setForm(current=>({...current,bank_bin:processed.account.bank_bin,bank_code:bank?.code||'',bank_account_number:processed.account.bank_account_number,bank_account_name:current.bank_account_name||profileAccountName,static_qr_url:''}));
    setManualBin(false);setTab('bank');setShowBanks(false);
    setQrSuccess("Đã nhận diện tự động: "+(bank?.name||('BIN '+processed.account.bank_bin))+" - STK "+processed.account.bank_account_number+". Hệ thống sẽ tự động sinh mã VietQR kèm số tiền cho từng hóa đơn!");
   }else{
    setForm(current=>({...current,static_qr_url:processed.dataUrl,bank_bin:'',bank_code:'',bank_account_number:'',bank_account_name:''}));
    setQrSuccess("Không đọc được thông tin tài khoản từ mã QR; đã lưu ảnh QR nén để dùng khi thanh toán.");
   }
  }catch(err){setError(err.message||"Không thể xử lý ảnh QR.");}
  finally{setImageProcessing(false);}
 }

 async function save(event){
  event.preventDefault();if(busy||!isDirty)return;setBusy(true);setError('');setValidationErrors({});
  const body={
    bank_bin:String(form.bank_bin||'').trim(),
    bank_code:String(form.bank_code||'').trim(),
    bank_account_number:String(form.bank_account_number||'').trim(),
    bank_account_name:String(form.bank_account_name||'').trim(),
    static_qr_url:String(form.static_qr_url||'').trim(),
    store_phone:String(form.store_phone||'').trim(),
    store_address:String(form.store_address||'').trim(),
    wifi_password:String(form.wifi_password||'').trim()
  };
  try{
    await request(`/branches/${branchId}/payment-settings`,{method:'PUT',body});
    setForm(body);cachePaymentSettings(branchId,body);setInitialConfig(snapshot(body));
    setSaved(true);onSaved?.();setReadyNotice(true);onClose?.();
  }catch(e){
    setError(e.message||'Không lưu được cấu hình thanh toán.');
    setValidationErrors(e.details?.fieldErrors||{});
  }finally{
    setBusy(false);
  }
 }

 return <>
  {readyNotice&&<div className="payment-ready-notice" role="status">
   <button type="button" className="payment-ready-dismiss" aria-label="Đóng thông báo" onClick={()=>setReadyNotice(false)}><X size={17}/></button>
   <strong>Tất cả đã sẵn sàng! Bạn mở quầy bán thử nhé.</strong>
   <button type="button" className="btn btn-primary" onClick={()=>{setReadyNotice(false);navigate('/sales');}}>Mở quầy bán hàng POS <ArrowRight size={16}/></button>
  </div>}
  <Modal open={open} onClose={onClose} title="Cài đặt thanh toán & Hóa đơn" className="payment-settings-modal" footer={isDirty&&<Button type="submit" form="payment-settings-form" loading={busy}><Save size={15}/> Lưu cấu hình</Button>}>
   <form id="payment-settings-form" onSubmit={save} style={{display:'grid',gap:14}}>
    <div role="tablist" aria-label="Chế độ cấu hình VietQR và Hóa đơn" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button type="button" role="tab" aria-selected={tab==='bank'} className={`btn ${tab==='bank'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('bank')}><CreditCard size={15}/> Tài khoản ngân hàng</button>
      <button type="button" role="tab" aria-selected={tab==='upload'} className={`btn ${tab==='upload'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('upload')}><ImagePlus size={15}/> Tải ảnh QR</button>
      <button type="button" role="tab" aria-selected={tab==='receipt'} className={`btn ${tab==='receipt'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('receipt')}><Receipt size={15}/> Nội dung hóa đơn</button>
    </div>

    {tab==='bank'?(
      <>
        <label>Ngân hàng
          <div style={{position:'relative'}}>
            <input role="combobox" aria-expanded={showBanks} aria-controls="vietqr-bank-options" autoComplete="off" value={bankSearch} onFocus={()=>setShowBanks(true)} onChange={e=>{setBankSearch(e.target.value);setShowBanks(true);setManualBin(false);set('bank_bin','');set('bank_code','');}} placeholder="Tìm tên, mã viết tắt hoặc BIN"/>
            {showBanks&&<div id="vietqr-bank-options" role="listbox" style={{position:'absolute',zIndex:5,top:'100%',left:0,right:0,maxHeight:240,overflowY:'auto',background:'var(--ri-surface)',border:'1px solid var(--ri-border)',borderRadius:8,boxShadow:'var(--ri-shadow-lg)'}}>
              {banks.filter(bank=>`${bank.name} ${bank.legalName||''} ${bank.code} ${bank.bin}`.toLocaleLowerCase('vi').includes(bankSearch.toLocaleLowerCase('vi'))).slice(0,30).map(bank=><button key={bank.bin} type="button" role="option" aria-selected={form.bank_bin===bank.bin} onClick={()=>{setForm(f=>({...f,bank_bin:bank.bin,bank_code:bank.code}));setBankSearch(`${bank.name} (${bank.code} · ${bank.bin})`);setShowBanks(false);setManualBin(false);}} style={{display:'flex',width:'100%',alignItems:'center',gap:10,padding:8,border:0,borderBottom:'1px solid var(--ri-border)',background:'transparent',textAlign:'left',cursor:'pointer'}}>{bank.logo&&<img src={bank.logo} alt="" width="28" height="28" onError={e=>{e.currentTarget.style.display='none';}}/>}<span>{bank.name} <small>({bank.code} · {bank.bin})</small></span></button>)}
              <button type="button" role="option" onClick={()=>{setManualBin(true);setBankSearch('Ngân hàng khác (nhập mã BIN thủ công)');setForm(f=>({...f,bank_bin:'',bank_code:'OTHER'}));setShowBanks(false);}} style={{display:'block',width:'100%',padding:10,border:0,background:'transparent',textAlign:'left',cursor:'pointer'}}>Ngân hàng khác (nhập mã BIN thủ công)</button>
            </div>}
          </div>
        </label>
        {manualBin&&<label>Mã BIN ngân hàng<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={form.bank_bin||''} onChange={e=>set('bank_bin',e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="BIN 6 số"/></label>}
        <label>Số tài khoản<input inputMode="numeric" required value={form.bank_account_number||''} onChange={e=>set('bank_account_number',e.target.value)} placeholder="Nhập số tài khoản"/></label>
        <label>Tên chủ tài khoản<input value={form.bank_account_name||''} onChange={e=>set('bank_account_name',e.target.value)} placeholder="Nhập tên chủ tài khoản (VD: NGUYEN VAN A)"/></label>
        <div style={{border:'1px solid var(--ri-border)',borderRadius:10,padding:12,textAlign:'center'}}>
          <strong>Xem trước VietQR</strong>
          {form.bank_bin&&form.bank_account_number?<img style={{display:'block',margin:'8px auto',width:180,height:180,objectFit:'contain'}} src={`https://img.vietqr.io/image/${form.bank_bin}-${encodeURIComponent(form.bank_account_number)}-compact2.png`} alt="Xem trước mã VietQR" onError={e=>{e.currentTarget.style.display='none';}}/>:<p className="muted">Nhập ngân hàng và số tài khoản để xem trước.</p>}
        </div>
      </>
    ):tab==='upload'?(
      <>
        {!form.static_qr_url&&<button type="button" disabled={imageProcessing} className={`payment-qr-dropzone upload-zone compact ${dragging?'is-dragging':''}`} onClick={()=>fileInput.current?.click()} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);chooseFile(event.dataTransfer.files?.[0]);}}><Upload size={26}/><strong>Kéo thả ảnh QR vào đây hoặc bấm để chọn</strong><span>Hỗ trợ PNG, JPG, WEBP · ảnh gốc tối đa 15 MB</span></button>}
        <input ref={fileInput} className="visually-hidden" aria-label="Chọn ảnh QR thanh toán" type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{chooseFile(event.target.files?.[0]);event.target.value='';}}/>
        {imageProcessing&&<p role="status">Đang đọc và nén ảnh QR...</p>}
        {form.static_qr_url&&<div className="payment-qr-preview"><img src={form.static_qr_url} alt="Ảnh QR xem trước"/><div className="payment-qr-preview-actions"><button type="button" className="btn btn-secondary btn-sm" disabled={imageProcessing} onClick={()=>fileInput.current?.click()}>Thay ảnh khác</button><button type="button" className="btn btn-secondary btn-sm" onClick={()=>{set('static_qr_url','');setQrSuccess('');}}>Xóa ảnh</button></div></div>}
      </>
    ):(
      <div style={{display:'grid',gap:12}}>
        <div style={{background:'var(--ri-bg,#f8fafc)',padding:'10px 12px',borderRadius:8,fontSize:13,color:'var(--ri-muted,#64748b)',lineHeight:1.5}}>
          💡 <strong>Nội dung in trên hóa đơn:</strong> Các trường này sẽ hiển thị ở đầu hoặc chân hóa đơn POS. Ô nào để trống sẽ được <strong>ẩn hoàn toàn</strong> (không bao giờ in chữ &quot;Trống&quot;).
        </div>
        <label>
          <span style={{display:'flex',alignItems:'center',gap:6,fontWeight:600,marginBottom:4}}>
            <Phone size={14} color="var(--ri-primary)"/> Số điện thoại cửa hàng (in trên hóa đơn)
          </span>
          <input
            type="text"
            className="ri-control"
            value={form.store_phone||''}
            onChange={e=>set('store_phone',e.target.value)}
            placeholder="VD: 0912 345 678 (để trống nếu không in)"
          />
        </label>
        <label>
          <span style={{display:'flex',alignItems:'center',gap:6,fontWeight:600,marginBottom:4}}>
            <MapPin size={14} color="var(--ri-primary)"/> Địa chỉ cửa hàng (in trên hóa đơn)
          </span>
          <textarea
            rows={2}
            className="ri-control"
            style={{width:'100%',resize:'none'}}
            value={form.store_address||''}
            onChange={e=>set('store_address',e.target.value)}
            placeholder="VD: 123 Đường Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh (để trống nếu không in)"
          />
        </label>
        <label>
          <span style={{display:'flex',alignItems:'center',gap:6,fontWeight:600,marginBottom:4}}>
            <Wifi size={14} color="var(--ri-primary)"/> Mật khẩu Wi-Fi cửa hàng (in trên hóa đơn)
          </span>
          <input
            type="text"
            className="ri-control"
            value={form.wifi_password||''}
            onChange={e=>set('wifi_password',e.target.value)}
            placeholder="VD: cafe@2026 (để trống nếu không in Wi-Fi)"
          />
        </label>
      </div>
    )}

    {qrSuccess&&<p role="status" className="payment-qr-success">{qrSuccess}</p>}
    {error&&<div role="alert" style={{color:'var(--ri-danger)'}}><p style={{margin:'0 0 6px'}}>{error}</p>{Object.entries(validationErrors).length>0&&<ul style={{margin:0,paddingLeft:20}}>{Object.entries(validationErrors).map(([field,message])=><li key={field}>{field}: {message}</li>)}</ul>}</div>}
    {saved&&<p role="status">Đã lưu cấu hình thanh toán &amp; hóa đơn cho chi nhánh.</p>}
   </form>
  </Modal>
 </>;
}
