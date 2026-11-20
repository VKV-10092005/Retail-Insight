import React,{useState,useEffect} from 'react';
import {useBranch} from '../branches/BranchContext';
import {useAuth} from '../auth/AuthContext';
import {request,useResource} from './shared';
import ImageUploadField from '../components/common/ImageUploadField';
import {X,RefreshCw,Plus,Check} from 'lucide-react';
import './AddProductModal.css';

export default function AddProductModal({open,onClose,onCreated,allowAddToCart=false}){
 const {user}=useAuth();
 const {activeBranchId,activeBranch}=useBranch();
 const categories=useResource(open&&activeBranchId?`/categories?branch_id=${activeBranchId}`:null);
 const [categoryList,setCategoryList]=useState([]);
 const [form,setForm]=useState({name:'',sku:'',category_id:'',unit:'Cái',sale_price:'',cost_price:'0',quantity:'10',addToCart:false,image_url:''});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [showCategoryInput,setShowCategoryInput]=useState(false),[newCategoryName,setNewCategoryName]=useState(''),[categoryBusy,setCategoryBusy]=useState(false);
 const [categoryInlineError,setCategoryInlineError]=useState(''),[categoryInlineSuccess,setCategoryInlineSuccess]=useState('');

 useEffect(()=>{
  if(categories.data?.items){
   setCategoryList(categories.data.items);
  }
 },[categories.data?.items]);

 if(!open)return null;
 const update=(key,value)=>setForm(current=>({...current,[key]:value}));
 const close=()=>{if(busy)return;setError('');setCategoryInlineError('');setCategoryInlineSuccess('');onClose();};

 const createCategory=async event=>{
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
   const res=await request('/categories',{
    method:'POST',
    body:{
     name:trimmed,
     ...(activeBranchId?{branch_id:Number(activeBranchId)}:{})
    }
   });
   const created={id:res.id,name:res.name||trimmed};
   setCategoryList(prev=>{
    const exists=prev.some(c=>String(c.id)===String(created.id));
    return exists?prev:[...prev,created];
   });
   update('category_id',String(created.id));
   setNewCategoryName('');
   setShowCategoryInput(false);
   setCategoryInlineSuccess('Đã thêm danh mục mới');
   setTimeout(()=>setCategoryInlineSuccess(''),3000);
   categories.reload?.();
  }catch(err){
   setCategoryInlineError(err.message||'Không thể tạo danh mục mới.');
  }finally{
   setCategoryBusy(false);
  }
 };

 const submit=async event=>{
  event.preventDefault();if(busy)return;setError('');
  const quantity=Number(form.quantity),salePrice=Number(form.sale_price),costPrice=Number(form.cost_price);
  if(!Number.isInteger(quantity)||quantity<0){setError('Số lượng nhập phải là số nguyên từ 0 trở lên.');return;}
  if(!Number.isFinite(salePrice)||salePrice<=0){setError('Giá bán phải lớn hơn 0.');return;}
  if(!Number.isFinite(costPrice)||costPrice<0){setError('Giá vốn phải từ 0 trở lên.');return;}
  if(quantity>0&&costPrice>0&&costPrice<100){setError('Đơn giá nhập thấp hơn 100 VNĐ. Hãy kiểm tra lại đơn vị nghìn đồng.');return;}
  if(quantity>0&&!activeBranchId){setError('Chưa xác định được chi nhánh nhập kho.');return;}
  setBusy(true);
  try{
   const product=await request('/products',{method:'POST',body:{sku:form.sku.trim(),name:form.name.trim(),sale_price:salePrice,cost_price:user?.role==='CASHIER'?null:costPrice,category_id:form.category_id?Number(form.category_id):null,branch_id:Number(activeBranchId),status:'ACTIVE',image_url:form.image_url||null,attributes:{unit:form.unit.trim()||'Cái'}}});
   if(quantity>0)await request('/documents/receipts',{method:'POST',body:{branch_id:Number(activeBranchId),request_key:globalThis.crypto?.randomUUID?.()||`new-product-${Date.now()}`,note:'Nhập kho ban đầu khi tạo sản phẩm',items:[{product_id:Number(product.id),quantity,unit_cost:costPrice}]}});
   onCreated?.({...product,stock:quantity,quantity:1,addToCart:allowAddToCart&&form.addToCart});
   onClose();setForm({name:'',sku:'',category_id:'',unit:'Cái',sale_price:'',cost_price:'0',quantity:'10',addToCart:false,image_url:''});
  }catch(err){setError(err.message||'Không thể lưu sản phẩm.');}
  finally{setBusy(false);}
 };

 return <div className="modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><section className="modal add-product-modal" role="dialog" aria-modal="true" aria-labelledby="add-product-title">
  <header className="modal-head"><div><h2 id="add-product-title">Thêm sản phẩm &amp; Nhập kho</h2><p className="muted">Tạo sản phẩm đang bán và nhập tồn kho ban đầu.</p></div><button type="button" className="icon-button" aria-label="Đóng" onClick={close}><X size={20}/></button></header>
  {error&&<p role="alert" className="auth-error">{error}</p>}
  <form onSubmit={submit}><div className="add-product-grid" style={{alignItems:'start'}}>
   <label>Tên sản phẩm *<input className="ri-control" required maxLength={180} value={form.name} onChange={e=>update('name',e.target.value)} autoFocus/></label>
   <label>Mã sản phẩm *<div className="add-product-sku"><input className="ri-control" required maxLength={100} value={form.sku} onChange={e=>update('sku',e.target.value.toUpperCase())}/><button type="button" className="btn btn-secondary btn-sm" onClick={()=>update('sku',`SP-${Math.floor(100000+Math.random()*900000)}`)}><RefreshCw size={14}/> Tạo mã tự động</button></div></label>
   <label>Danh mục phân loại
    <div className="add-product-category">
     <select className="ri-control" value={form.category_id} onChange={e=>update('category_id',e.target.value)}>
      <option value="">Chọn danh mục</option>
      {categoryList.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
     </select>
     <button type="button" className="add-product-category-toggle" title="Tạo danh mục mới" aria-label="Tạo danh mục mới" onClick={()=>{setShowCategoryInput(value=>!value);setCategoryInlineError('');}}>
      <Plus size={18}/>
     </button>
    </div>
    {showCategoryInput&&(
     <div style={{marginTop:'7px'}}>
      <div className="add-product-category-create">
       <input className="ri-control" autoFocus maxLength={120} aria-label="Tên danh mục mới" placeholder="Tên danh mục mới" value={newCategoryName} onChange={e=>{setNewCategoryName(e.target.value);setCategoryInlineError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();createCategory();}}}/>
       <button type="button" className="btn btn-primary btn-sm" disabled={categoryBusy||!newCategoryName.trim()} onClick={createCategory}>{categoryBusy?'Đang thêm…':'Thêm'}</button>
       <button type="button" className="icon-button" aria-label="Hủy tạo danh mục" onClick={()=>{setShowCategoryInput(false);setNewCategoryName('');setCategoryInlineError('');}} disabled={categoryBusy}><X size={16}/></button>
      </div>
      {categoryInlineError&&<p role="alert" style={{margin:'4px 0 0',color:'var(--ri-danger,#ef4444)',fontSize:'0.8rem',fontWeight:500}}>{categoryInlineError}</p>}
     </div>
    )}
    {categoryInlineSuccess&&<p style={{display:'flex',alignItems:'center',gap:4,margin:'4px 0 0',color:'var(--ri-success,#10b981)',fontSize:'0.8rem',fontWeight:500}}><Check size={14}/>{categoryInlineSuccess}</p>}
   </label>
   <label>Đơn vị tính<input className="ri-control" maxLength={50} value={form.unit} onChange={e=>update('unit',e.target.value)}/></label>
   <label>Giá bán niêm yết (VNĐ) *<input className="ri-control" required type="number" min="1" step="1" value={form.sale_price} onChange={e=>update('sale_price',e.target.value)}/></label>
   <label>Giá vốn nhập (VNĐ)<input className="ri-control" type="number" min="0" step="1" value={form.cost_price} onChange={e=>update('cost_price',e.target.value)}/></label>
   <label className="add-product-quantity">Số lượng nhập kho ban đầu ({activeBranch?.name||`Chi nhánh #${activeBranchId||'—'}`})<input className="ri-control" required type="number" min="0" step="1" value={form.quantity} onChange={e=>update('quantity',e.target.value)}/><small>Tự động nhập thẳng vào kho chi nhánh hiện tại.</small></label>
  </div>
   <div className="add-product-image-field"><span>{'\u1ea2nh s\u1ea3n ph\u1ea9m'}</span><ImageUploadField imageUrl={form.image_url} onChange={value=>update('image_url',value)} onError={setError}/></div>
  <footer className="add-product-footer">{allowAddToCart?<label className="add-product-cart-check"><input type="checkbox" checked={form.addToCart} onChange={e=>update('addToCart',e.target.checked)}/> Thêm ngay 1 sản phẩm vào giỏ hàng hiện tại</label>:<span/>}<button type="submit" className="btn btn-primary" disabled={busy}>{busy?'Đang lưu…':'Lưu & Mở bán'}</button></footer></form>
 </section></div>;
}
