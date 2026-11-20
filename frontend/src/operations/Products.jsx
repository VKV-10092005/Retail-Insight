import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBranch } from '../branches/BranchContext';
import { PageHeader, Card, Badge } from '../components/ui/Elements';
import { useResource, request, State, Table, Message, money, Pager, params } from './shared';
import { Plus, PlusCircle, Search, Pencil, X, Check, FolderOpen, FolderPlus, Trash2, CircleHelp, ArrowRight, PackagePlus, Sparkles } from 'lucide-react';
import './ProductCreate.css';
import AddProductModal from './AddProductModal';
import ImageUploadField from '../components/common/ImageUploadField';
import ProductThumbnail from '../components/common/ProductThumbnail';

export default function Products({
  readOnly = false,
  hideCostPrice = false
}) {
  const { user } = useAuth();
  const {activeBranchId:productBranchId,activeBranch,branches,setActiveBranchId,isOwner}=useBranch();
  const navigate=useNavigate();
  const [searchParams,setSearchParams]=useSearchParams();
  const canEdit = !readOnly && ['OWNER', 'MANAGER'].includes(user?.role);
  const canEditProduct=!readOnly&&['OWNER','MANAGER','INVENTORY'].includes(user?.role);
  const canManageCategories=canEdit;
  const [query, setQuery] = useState({ q: '', category_id: '', status: '', page: 1 });
  const list = useResource(productBranchId?'/products?' + params({...query,limit:500,branchId:productBranchId,branch_id:productBranchId}):null);
  const categories = useResource('/categories'+(productBranchId?'?branch_id='+productBranchId:''));
  const canCreate=['OWNER','MANAGER'].includes(user?.role)||(['CASHIER','INVENTORY'].includes(user?.role)&&list.data?.catalog_mode==='INDEPENDENT');
  const canBulkImport=['OWNER','MANAGER','INVENTORY'].includes(user?.role);

  // State Checkbox & Bulk Actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkImportOpen,setBulkImportOpen]=useState(false);
  const [bulkImportRows,setBulkImportRows]=useState([]);
  const [commonImportQty,setCommonImportQty]=useState('');
  const [bulkImportError,setBulkImportError]=useState('');

  // State cho Modal Sửa sản phẩm
  const [editingProduct, setEditingProduct] = useState(null);
  // originalProduct lưu dữ liệu gốc để so sánh isDirty
  const [originalProduct, setOriginalProduct] = useState(null);
  const [importQty,setImportQty]=useState('');
  const [importUnitCost,setImportUnitCost]=useState('');
  const [editForm, setEditForm] = useState({
    sku: '',
    name: '',
    sale_price: '',
    cost_price: '',
    category_id: '',
    status: 'ACTIVE',
    unit: 'Cái',
    image_url: ''
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activationNotice, setActivationNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showCategoryManager,setShowCategoryManager]=useState(false);
  const [categoryTags,setCategoryTags]=useState([]);
  const [categoryInput,setCategoryInput]=useState('');
  const [showCategoryHelp,setShowCategoryHelp]=useState(false);
  const [categorySuccess,setCategorySuccess]=useState('');
  const [categoryBusy,setCategoryBusy]=useState(false);
  const [categoryError,setCategoryError]=useState('');
  const [editingCategory,setEditingCategory]=useState(null);
  const [editingCategoryName,setEditingCategoryName]=useState('');
  const [addProductOpen,setAddProductOpen]=useState(false);
  const [showEditCategoryInput, setShowEditCategoryInput] = useState(false);
  const [newEditCategoryName, setNewEditCategoryName] = useState('');
  const [editCategoryBusy, setEditCategoryBusy] = useState(false);
  const [editCategoryInlineError, setEditCategoryInlineError] = useState('');
  const [editCategoryInlineSuccess, setEditCategoryInlineSuccess] = useState('');

  const handleAddEditCategory = async (e) => {
    if (e) e.preventDefault();
    const trimmed = newEditCategoryName.trim();
    if (!trimmed) {
      setEditCategoryInlineError('Vui lòng nhập tên danh mục.');
      return;
    }
    const currentItems = categories.data?.items || [];
    const isDuplicate = currentItems.some(
      c => (c.name || '').trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setEditCategoryInlineError('Danh mục này đã tồn tại trong cửa hàng.');
      return;
    }

    setEditCategoryBusy(true);
    setEditCategoryInlineError('');
    setEditCategoryInlineSuccess('');
    try {
      const res = await request('/categories', {
        method: 'POST',
        body: {
          name: trimmed,
          ...(productBranchId ? { branch_id: Number(productBranchId) } : {})
        }
      });
      await categories.reload();
      setEditForm(prev => ({ ...prev, category_id: String(res.id) }));
      setNewEditCategoryName('');
      setShowEditCategoryInput(false);
      setEditCategoryInlineSuccess('Đã thêm danh mục mới');
      setTimeout(() => setEditCategoryInlineSuccess(''), 3000);
    } catch (err) {
      setEditCategoryInlineError(err.message || 'Không thể tạo danh mục mới.');
    } finally {
      setEditCategoryBusy(false);
    }
  };

  useEffect(()=>{
    if(searchParams.get('openCategoryModal')!=='1')return;
    setShowCategoryManager(true);
    const next=new URLSearchParams(searchParams);next.delete('openCategoryModal');setSearchParams(next,{replace:true});
  },[searchParams,setSearchParams]);

  const addCategoryTags=values=>setCategoryTags(current=>{
    const seen=new Set(current.map(name=>name.normalize('NFKC').trim().toLocaleLowerCase('vi'))),next=[...current];
    for(const value of values){const name=value.trim(),key=name.normalize('NFKC').toLocaleLowerCase('vi');if(name&&!seen.has(key)){seen.add(key);next.push(name);}}
    return next;
  });
  const updateCategoryInput=event=>{
    const parts=event.target.value.split(',');
    if(parts.length>1){addCategoryTags(parts.slice(0,-1));setCategoryInput(parts.at(-1));}
    else setCategoryInput(event.target.value);
    setCategoryError('');setCategorySuccess('');
  };
  const handleCategoryTagKeyDown=event=>{
    if(event.key==='Enter'||event.key===','){event.preventDefault();addCategoryTags([categoryInput]);setCategoryInput('');setCategoryError('');setCategorySuccess('');}
  };
  const createCategory=async event=>{
    event.preventDefault();if(categoryBusy)return;
    const names=[...categoryTags,...categoryInput.split(',')].map(name=>name.trim()).filter(Boolean),seen=new Set(),unique=names.filter(name=>{const key=name.normalize('NFKC').toLocaleLowerCase('vi');if(seen.has(key))return false;seen.add(key);return true;});
    if(!unique.length){setCategoryError('Nhập ít nhất một tên danh mục.');return;}
    const existing=new Set((categories.data?.items||[]).map(category=>category.name.normalize('NFKC').toLocaleLowerCase('vi'))),toCreate=unique.filter(name=>!existing.has(name.normalize('NFKC').toLocaleLowerCase('vi')));
    if(!toCreate.length){setCategoryError('Các danh mục này đã tồn tại.');return;}
    setCategoryBusy(true);setCategoryError('');setCategorySuccess('');const created=[];
    try{
      for(const name of toCreate){await request('/categories',{method:'POST',body:{name,...(productBranchId?{branch_id:Number(productBranchId)}:{})}});created.push(name);}
      setCategoryTags([]);setCategoryInput('');categories.reload();setCategorySuccess('Đã tạo '+created.length+' danh mục thành công.');
    }catch(error){
      categories.reload();const createdSet=new Set(created.map(name=>name.normalize('NFKC').toLocaleLowerCase('vi')));setCategoryTags(unique.filter(name=>!createdSet.has(name.normalize('NFKC').toLocaleLowerCase('vi'))));setCategoryInput('');
      setCategoryError(error.message||'Không thể lưu các danh mục.');
    }finally{setCategoryBusy(false);}
  };
  const renameCategory=async id=>{
    if(!editingCategoryName.trim()||categoryBusy)return;
    setCategoryBusy(true);setCategoryError('');
    try{await request(`/categories/${id}`,{method:'PUT',body:{name:editingCategoryName.trim()}});setEditingCategory(null);categories.reload();}
    catch(error){setCategoryError(error.message||'Không thể đổi tên danh mục.');}
    finally{setCategoryBusy(false);}
  };
  const deleteCategory=async id=>{
    if(categoryBusy)return;
    setCategoryBusy(true);setCategoryError('');
    try{await request(`/categories/${id}`,{method:'DELETE'});categories.reload();}
    catch(error){setCategoryError(error.message||'Không thể xóa danh mục.');}
    finally{setCategoryBusy(false);}
  };

  // Mở modal sửa
  const openEditModal = (p) => {
    setError('');
    setSuccess('');
    setEditingProduct(p);
    const form = {
      sku: p.sku || '',
      name: p.name || '',
      sale_price: p.sale_price || '',
      cost_price: p.cost_price != null ? p.cost_price : '',
      category_id: p.category_id || '',
      status: p.status || 'ACTIVE',
      unit: p.attributes?.unit || 'Cái',
      image_url: p.image_url || ''
    };
    setOriginalProduct(form);
    setEditForm(form);
    setImportQty('');
    setImportUnitCost(p.cost_price != null?String(p.cost_price):'');
  };

  const closeEditModal = () => {
    setEditingProduct(null);
    setOriginalProduct(null);
    setImportQty('');
    setImportUnitCost('');
    setError('');
    setShowEditCategoryInput(false);
    setNewEditCategoryName('');
    setEditCategoryInlineError('');
    setEditCategoryInlineSuccess('');
  };

  // Lưu chỉnh sửa sản phẩm
  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const quantity=Number(importQty||0);
    const unitCost=Number(importUnitCost);
    if(!Number.isInteger(quantity)||quantity<0){setError('Số lượng nhập thêm phải là số nguyên từ 0 trở lên.');return;}
    if(quantity>0&&(!productBranchId||importUnitCost===''||!Number.isFinite(unitCost)||unitCost<0)){
      setError(!productBranchId?'Chưa xác định được chi nhánh nhập kho.':'Đơn giá nhập phải là số hợp lệ từ 0 trở lên.');
      return;
    }
    if(quantity>0&&unitCost>0&&unitCost<100){setError('Đơn giá nhập thấp hơn 100 VNĐ. Hãy kiểm tra lại đơn vị nghìn đồng trước khi nhập kho.');return;}
    setBusy(true);

    try {
      if(productInfoDirty){
        await request(`/products/${editingProduct.id}`, {
          method: 'PUT',
          body: {
            sku: editForm.sku,
            name: editForm.name,
            status: editForm.status,
            sale_price: Number(editForm.sale_price),
            cost_price: editForm.cost_price === '' ? null : Number(editForm.cost_price),
            category_id: editForm.category_id ? Number(editForm.category_id) : null,
            ...(user?.role==='INVENTORY'?{branch_id:Number(productBranchId)}:{}),
            attributes:{...(editingProduct.attributes||{}),unit:editForm.unit.trim()||'Cái'},
            image_url: editForm.image_url || null
          }
        });
      }
      if(quantity>0){
        await request('/documents/receipts',{
          method:'POST',
          body:{
            branch_id:Number(productBranchId),
            request_key:crypto.randomUUID(),
            note:'Nhập bổ sung từ danh sách sản phẩm',
            items:[{product_id:Number(editingProduct.id),quantity,unit_cost:unitCost}]
          }
        });
      }
      closeEditModal();
      list.reload();
      setSuccess(quantity>0
        ? `Đã nhập thêm ${quantity.toLocaleString('vi-VN')} sản phẩm "${editForm.name}"${productInfoDirty?' và cập nhật thông tin thành công.':'.'}`
        : `Đã cập nhật sản phẩm "${editForm.name}" thành công.`);
    } catch (err) {
      setError(err.message || 'Lỗi cập nhật sản phẩm');
    } finally {
      setBusy(false);
    }
  };

  // Chuyển nhanh trạng thái kinh doanh
  const toggleStatus = async (product) => {
    const nextStatus = product.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await request(`/products/${product.id}`, {
        method: 'PUT',
        body: {
          sku: product.sku,
          name: product.name,
          sale_price: Number(product.sale_price),
          cost_price: product.cost_price != null ? Number(product.cost_price) : null,
          category_id: product.category_id ? Number(product.category_id) : null,
          status: nextStatus
        }
      });
      setSuccess(`Đã ${nextStatus === 'ACTIVE' ? 'kích hoạt bán lại' : 'tạm ngừng kinh doanh'} mã ${product.sku}.`);
      if (nextStatus === 'ACTIVE') setActivationNotice(true);
      list.reload();
    } catch (err) {
      setError(err.message || 'Không thể đổi trạng thái');
    }
  };

  const deleteProduct = async product => {
    if (!window.confirm(`Xóa vĩnh viễn sản phẩm “${product.name}” (${product.sku})? Nếu có tồn kho hoặc lịch sử giao dịch, hệ thống sẽ từ chối.`)) return;
    try {
      await request(`/products/${product.id}`, {method:'DELETE'});
      setSuccess(`Đã xóa sản phẩm ${product.sku}.`);
      list.reload();
    } catch (err) { setError(err.message || 'Không thể xóa sản phẩm.'); }
  };

  // ── Bulk Actions ──────────────────────────────────────────────
  const bulkUpdateStatus = async (nextStatus) => {
    if (!selectedIds.length || bulkBusy) return;
    setBulkBusy(true); setError(''); setSuccess('');
    const items = (list.data?.items ?? []);
    let done = 0, skipped = 0;
    for (const id of selectedIds) {
      const p = items.find(item => item.id === id);
      if (!p) { skipped++; continue; }
      try {
        await request(`/products/${id}`, {
          method: 'PUT',
          body: {
            sku: p.sku, name: p.name,
            sale_price: Number(p.sale_price),
            cost_price: p.cost_price != null ? Number(p.cost_price) : null,
            category_id: p.category_id ? Number(p.category_id) : null,
            status: nextStatus
          }
        });
        done++;
      } catch { skipped++; }
    }
    setSuccess(`Đã cập nhật ${done} sản phẩm${skipped ? `, bỏ qua ${skipped}` : ''}.`);
    if (nextStatus === 'ACTIVE' && done > 0) setActivationNotice(true);
    setSelectedIds([]);
    list.reload();
    setBulkBusy(false);
  };

  const bulkDelete = async () => {
    if (!selectedIds.length || bulkBusy) return;
    if (!window.confirm(`Xóa ${selectedIds.length} sản phẩm đã chọn? Sản phẩm có tồn kho hoặc giao dịch sẽ bị bỏ qua.`)) return;
    setBulkBusy(true); setError(''); setSuccess('');
    let done = 0, skipped = 0;
    for (const id of selectedIds) {
      try {
        await request(`/products/${id}`, { method: 'DELETE' });
        done++;
      } catch { skipped++; }
    }
    setSuccess(`Đã xóa ${done} sản phẩm${skipped ? `, bỏ qua ${skipped} (có tồn kho/giao dịch)` : ''}.`);
    setSelectedIds([]);
    list.reload();
    setBulkBusy(false);
  };



  // Derived: statuses of currently selected products (for smart bulk buttons)
  const selectedProducts = (list.data?.items ?? []).filter(p => selectedIds.includes(p.id));
  const hasActiveSelected = selectedProducts.some(p => p.status === 'ACTIVE');
  const hasDisabledSelected = selectedProducts.some(p => p.status === 'DISABLED');

  const openBulkImport=()=>{
    setBulkImportRows(selectedProducts.map(product=>({
      product_id:Number(product.id),
      sku:product.sku,
      name:product.name,
      stock:Number(product.stock_remaining??product.stock??0),
      quantity:'',
      unit_cost:product.cost_price!=null?String(product.cost_price):''
    })));
    setCommonImportQty('');
    setBulkImportError('');
    setBulkImportOpen(true);
  };
  const closeBulkImport=()=>{
    if(bulkBusy)return;
    setBulkImportOpen(false);
    setBulkImportRows([]);
    setCommonImportQty('');
    setBulkImportError('');
  };
  const applyCommonImportQty=()=>{
    const quantity=Number(commonImportQty);
    if(!Number.isInteger(quantity)||quantity<0||quantity>100000){setBulkImportError('Số lượng áp dụng phải là số nguyên từ 0 đến 100.000.');return;}
    setBulkImportRows(rows=>rows.map(row=>({...row,quantity:String(quantity)})));
    setBulkImportError('');
  };
  const updateBulkImportRow=(productId,field,value)=>setBulkImportRows(rows=>rows.map(row=>row.product_id===productId?{...row,[field]:value}:row));
  const submitBulkImport=async event=>{
    event.preventDefault();
    if(bulkBusy)return;
    const rows=bulkImportRows.filter(row=>Number(row.quantity)>0);
    if(!rows.length){setBulkImportError('Nhập số lượng lớn hơn 0 cho ít nhất một sản phẩm.');return;}
    if(rows.length>100){setBulkImportError('Mỗi phiếu nhập hỗ trợ tối đa 100 sản phẩm.');return;}
    const invalid=rows.find(row=>!Number.isInteger(Number(row.quantity))||Number(row.quantity)<1||Number(row.quantity)>100000||row.unit_cost===''||!Number.isFinite(Number(row.unit_cost))||Number(row.unit_cost)<0);
    if(invalid){setBulkImportError(`Kiểm tra lại số lượng và đơn giá nhập của sản phẩm ${invalid.sku}.`);return;}
    const lowCost=rows.find(row=>Number(row.unit_cost)>0&&Number(row.unit_cost)<100);
    if(lowCost){setBulkImportError(`Đơn giá nhập của ${lowCost.sku} thấp hơn 100 VNĐ. Hãy kiểm tra lại đơn vị nghìn đồng.`);return;}
    if(!productBranchId){setBulkImportError('Chưa xác định được chi nhánh nhập kho.');return;}
    setBulkBusy(true);setBulkImportError('');setError('');setSuccess('');
    try{
      await request('/documents/receipts',{
        method:'POST',
        body:{
          branch_id:Number(productBranchId),
          request_key:crypto.randomUUID(),
          note:'Nhập hàng loạt từ danh sách sản phẩm',
          items:rows.map(row=>({product_id:row.product_id,quantity:Number(row.quantity),unit_cost:Number(row.unit_cost)}))
        }
      });
      setBulkImportOpen(false);setBulkImportRows([]);setCommonImportQty('');setSelectedIds([]);list.reload();
      setSuccess(`Đã nhập kho thành công ${rows.length} sản phẩm tại ${activeBranch?.name||`chi nhánh #${productBranchId}`}.`);
    }catch(importError){setBulkImportError(importError.message||'Không thể nhập kho hàng loạt.');}
    finally{setBulkBusy(false);}
  };

  // isDirty: so sánh form hiện tại với dữ liệu gốc
  const productInfoDirty = originalProduct != null && (
    String(editForm.sku).trim() !== String(originalProduct.sku).trim() ||
    String(editForm.name).trim() !== String(originalProduct.name).trim() ||
    String(editForm.sale_price) !== String(originalProduct.sale_price) ||
    String(editForm.cost_price) !== String(originalProduct.cost_price) ||
    String(editForm.category_id) !== String(originalProduct.category_id) ||
    String(editForm.status) !== String(originalProduct.status) ||
    String(editForm.unit) !== String(originalProduct.unit) ||
    String(editForm.image_url || '') !== String(originalProduct.image_url || '')
  );
  const isDirty=productInfoDirty||Number(importQty)>0;

  return (
    <div className="products-container">
      <PageHeader
        eyebrow="QUẢN TRỊ HÀNG HÓA"
        title="Danh sách sản phẩm"
        description={
          readOnly
            ? "Tra cứu thông tin mã sản phẩm, tên hàng hóa, danh mục và giá bán niêm yết tại quầy."
            : "Quản lý danh sách sản phẩm kinh doanh của cửa hàng. Cập nhật giá niêm yết và trạng thái bán."
        }
        actions={
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          {canManageCategories&&<button type="button" className="btn btn-secondary" onClick={()=>{setCategoryError('');setCategorySuccess('');setShowCategoryManager(true);}} style={{display:'inline-flex',alignItems:'center',gap:8}}><FolderOpen size={16}/><span>Quản lý danh mục</span></button>}
          {canBulkImport&&<button type="button" className="btn btn-secondary" onClick={()=>navigate('/receipts?tab=bulk')} style={{display:'inline-flex',alignItems:'center',gap:8}}><PackagePlus size={16}/><span>Nhập hàng loạt</span></button>}
          {canCreate && <button type="button" className="btn btn-primary" onClick={()=>setAddProductOpen(true)} style={{display:'inline-flex',alignItems:'center',gap:8}}><PlusCircle size={16}/><span>Thêm sản phẩm mới</span></button>}
          </div>
        }
      />

      {activationNotice && <Card role="status" style={{ marginBottom: 18, border: '1px solid #A5F3FC', background: 'linear-gradient(120deg, #ECFEFF, #F0F9FF)', color: '#164E63' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Sparkles size={24} style={{ color: '#0284C7', flexShrink: 0 }} />
          <div style={{ flex: '1 1 420px' }}><strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: 4 }}>Sản phẩm đã sẵn sàng mở bán trên hệ thống!</strong><span>Bạn có thể chuyển ngay sang quầy <strong>Bán hàng POS</strong> để tạo đơn, thu tiền mặt hoặc hiển thị mã <strong>VietQR động</strong> cho khách quét chuyển khoản — hệ thống sẽ tự động trừ tồn kho và hạch toán doanh thu, tiền lãi theo thời gian thực.</span></div>
          <Link to="/sales" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>Mở quầy Bán hàng POS →</Link>
          <button type="button" onClick={() => setActivationNotice(false)} aria-label="Ẩn thông báo" style={{ border: 0, background: 'transparent', color: '#164E63', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
      </Card>}

      <Message error={error} success={success} />

      {showCategoryManager&&canManageCategories&&(
        <div className="modal-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowCategoryManager(false);}}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="category-manager-title" style={{width:'min(680px,100%)',maxHeight:'85vh',overflowY:'auto'}}>
            <div className="modal-head">
              <h2 id="category-manager-title">Quản lý danh mục</h2>
              <button type="button" className="icon-button" aria-label="Đóng" onClick={()=>setShowCategoryManager(false)}><X size={18}/></button>
            </div>
            <p className="muted">Xem số sản phẩm trong từng danh mục, tạo mới, đổi tên hoặc xóa danh mục đang trống.</p>
            <form onSubmit={createCategory} style={{display:'grid',gap:10,margin:'16px 0'}}>
              <div style={{position:'relative',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',minHeight:46,padding:'7px 42px 7px 10px',border:'1px solid var(--ri-border)',borderRadius:9,background:'var(--ri-surface)'}}>
                {categoryTags.map((name,index)=><span key={name} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 9px',borderRadius:999,background:'var(--ri-elevated)',color:'var(--ri-text)',fontSize:13}}>{name}<button type="button" aria-label={'Xóa '+name} disabled={categoryBusy} onClick={()=>setCategoryTags(current=>current.filter((_,tagIndex)=>tagIndex!==index))} style={{border:0,background:'transparent',padding:0,lineHeight:1,cursor:'pointer',color:'var(--ri-muted)',fontSize:17}}>×</button></span>)}
                <input value={categoryInput} onChange={updateCategoryInput} onKeyDown={handleCategoryTagKeyDown} disabled={categoryBusy} maxLength={120} aria-label={'Tên danh mục'} placeholder={categoryTags.length?'Nhập thêm danh mục...':'Nhập tên danh mục...'} style={{flex:'1 1 180px',minWidth:150,border:0,outline:0,boxShadow:'none',background:'transparent',padding:'7px 2px'}}/>
                <button type="button" aria-label={'Hướng dẫn nhập nhiều danh mục'} aria-describedby={showCategoryHelp?'category-input-help':undefined} aria-expanded={showCategoryHelp} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setShowCategoryHelp(true)} onMouseLeave={()=>setShowCategoryHelp(false)} onFocus={()=>setShowCategoryHelp(true)} onBlur={()=>setShowCategoryHelp(false)} onClick={()=>setShowCategoryHelp(true)} style={{position:'absolute',right:10,top:10,border:0,background:'transparent',color:'var(--ri-muted)',padding:3,cursor:'help'}}><CircleHelp size={18}/></button>
                {showCategoryHelp&&<div id="category-input-help" role="tooltip" style={{position:'absolute',right:0,top:'calc(100% + 7px)',zIndex:5,width:'min(360px,85vw)',padding:'10px 12px',borderRadius:8,background:'var(--ri-text)',color:'var(--ri-surface)',fontSize:12,lineHeight:1.5,boxShadow:'var(--ri-shadow-md)'}}>Nhập tên danh mục, sau đó nhấn Enter hoặc dấu phẩy (,) để thêm nhiều danh mục cùng lúc.</div>}
              </div>
              <div><button type="submit" className="btn btn-primary" disabled={categoryBusy||categories.loading||(!categoryTags.length&&!categoryInput.trim())} style={{whiteSpace:'nowrap'}}><FolderPlus size={16}/> Lưu danh mục</button></div>
            </form>
            <Message error={categoryError} success={categorySuccess}/>
            {!!categorySuccess&&<button type="button" className="btn btn-primary" onClick={()=>{setShowCategoryManager(false);setAddProductOpen(true);}} style={{display:'inline-flex',alignItems:'center',gap:8,marginBottom:14}}>Thêm sản phẩm ngay <ArrowRight size={16}/></button>}
            <State resource={categories}>{data=><div style={{display:'grid',gap:8}}>{(data?.items||[]).map(category=><div key={category.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',border:'1px solid var(--ri-border)',borderRadius:9}}><FolderOpen size={17} style={{color:'var(--ri-primary)',flexShrink:0}}/>{editingCategory===category.id?<input autoFocus className="ri-control" value={editingCategoryName} maxLength={120} onChange={event=>setEditingCategoryName(event.target.value)} style={{flex:1}}/>:<strong style={{flex:1}}>{category.name}</strong>}<span className="muted" style={{whiteSpace:'nowrap'}}>{Number(category.product_count||0)} sản phẩm</span>{editingCategory===category.id?<><button type="button" className="btn btn-primary btn-sm" disabled={categoryBusy||!editingCategoryName.trim()} onClick={()=>renameCategory(category.id)} aria-label="Lưu tên danh mục"><Check size={15}/></button><button type="button" className="btn btn-secondary btn-sm" disabled={categoryBusy} onClick={()=>setEditingCategory(null)} aria-label="Hủy đổi tên"><X size={15}/></button></>:<button type="button" className="btn btn-secondary btn-sm" disabled={categoryBusy} onClick={()=>{setEditingCategory(category.id);setEditingCategoryName(category.name);}} aria-label={'Đổi tên '+category.name}><Pencil size={15}/></button>}<button type="button" className="btn btn-secondary btn-sm" disabled={categoryBusy||Number(category.product_count)>0} onClick={()=>deleteCategory(category.id)} aria-label={'Xóa '+category.name} title={Number(category.product_count)>0?'Chỉ xóa được danh mục chưa có sản phẩm':'Xóa danh mục rỗng'}><Trash2 size={15}/></button></div>)}{!(data?.items||[]).length&&<p className="muted">Cửa hàng chưa có danh mục nào. Bạn có thể tạo danh mục ngay tại đây.</p>}</div>}</State>
          </section>
        </div>
      )}

      {/* THANH TÌM KIẾM VÀ BỘ LỌC GỌN GÀNG */}
      <Card style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div className="op-toolbar" style={{ margin: 0, alignItems: 'end', display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 1.2fr)', gap: 12 }}>
          <label style={{ minWidth: 0 }}>
            Tìm kiếm theo Mã sản phẩm hoặc Tên
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--ri-muted)' }} />
              <input
                className="ri-control"
                style={{ paddingLeft: '32px' }}
                value={query.q}
                onChange={e => setQuery({ ...query, q: e.target.value, page: 1 })}
                placeholder="Nhập mã sản phẩm hoặc tên hàng..."
              />
            </div>
          </label>

          <label style={{ minWidth: 0 }}>
            Danh mục phân loại
            <select
              className="ri-control"
              value={query.category_id}
              onChange={e => setQuery({ ...query, category_id: e.target.value, page: 1 })}
            >
              <option value="">Tất cả danh mục</option>
              {categories.data?.items?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label style={{ minWidth: 0 }}>
            Trạng thái kinh doanh
            <select
              className="ri-control"
              value={query.status}
              onChange={e => setQuery({ ...query, status: e.target.value, page: 1 })}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang kinh doanh</option>
              <option value="DISABLED">Ngừng kinh doanh</option>
            </select>
          </label>

          <label style={{ minWidth: 0 }}>
            Chi nhánh
            {isOwner ? (
              <select className="ri-control" value={productBranchId || ''} onChange={event => setActiveBranchId(event.target.value)}>
                {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            ) : (
              <input className="ri-control" value={activeBranch?.name || `#${productBranchId}`} readOnly aria-label="Chi nhánh hiện tại" />
            )}
          </label>
        </div>
      </Card>


      {/* BULK ACTION BAR */}
      {selectedIds.length > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'10px 16px',marginBottom:12,background:'var(--ri-elevated)',border:'1px solid var(--ri-border)',borderRadius:9}}>
          <span style={{fontWeight:600,fontSize:14}}>Đã chọn {selectedIds.length} sản phẩm</span>
          <button type="button" className="btn btn-sm" disabled={bulkBusy} onClick={openBulkImport} style={{display:'inline-flex',alignItems:'center',gap:6,background:'#0284C7',borderColor:'#0284C7',color:'#fff'}}><PackagePlus size={15}/> {selectedIds.length===1?'Nhập hàng':'Nhập hàng loạt'}</button>
          {hasActiveSelected && <button type="button" className="btn btn-secondary btn-sm" disabled={bulkBusy} onClick={() => bulkUpdateStatus('DISABLED')}>Tạm ngừng</button>}
          {hasDisabledSelected && <button type="button" className="btn btn-secondary btn-sm" disabled={bulkBusy} onClick={() => bulkUpdateStatus('ACTIVE')}>Mở bán</button>}
          <button type="button" className="btn btn-secondary btn-sm" disabled={bulkBusy} style={{color:'var(--ri-danger)'}} onClick={bulkDelete}>Xóa</button>
        </div>
      )}

      {/* BẢNG DANH MỤC SẢN PHẨM */}
      <Card>
        <State resource={list}>
          {data => {
            const rawItems = data?.items ?? [];
            const filteredItems = query.status
              ? rawItems.filter(p => p.status === query.status)
              : rawItems;
            const sortedItems = [...filteredItems].sort((a, b) => {
              const categoryA = (a.category_name || '').trim();
              const categoryB = (b.category_name || '').trim();
              if (!categoryA && categoryB) return 1;
              if (categoryA && !categoryB) return -1;
              const categoryOrder = categoryA.localeCompare(categoryB, 'vi');
              if (categoryOrder !== 0) return categoryOrder;
              return (a.name || '').localeCompare(b.name || '', 'vi');
            });

            return (
              <>
                <Table
                  rows={sortedItems}
                  empty="Không tìm thấy sản phẩm nào trong danh mục."
                  columns={[
                    ...(canEdit ? [[
                      "checkbox",
                      <input
                        type="checkbox"
                        aria-label="Chọn tất cả"
                        checked={filteredItems.length > 0 && filteredItems.every(p => selectedIds.includes(p.id))}
                        onChange={e => setSelectedIds(e.target.checked ? filteredItems.map(p => p.id) : [])}
                      />,
                      r => <input
                        type="checkbox"
                        aria-label={"Chọn " + r.name}
                        checked={selectedIds.includes(r.id)}
                        onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id))}
                      />
                    ]] : []),
                    ["sku", "Mã sản phẩm", r => <strong>{r.sku}</strong>],
                    ["name", "Tên sản phẩm", r => <span style={{display:"inline-flex",alignItems:"center",gap:10,minWidth:180}}><ProductThumbnail product={r} size={38}/><strong>{r.name}</strong></span>],
                    ["category_name", "Danh mục", r => r.category_name || 'Chưa phân loại'],
                    [
                      "total_imported",
                      <span style={{ display: 'block', textAlign: 'right' }}>Tổng nhập</span>,
                      r => (
                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                          {new Intl.NumberFormat('vi-VN').format(Number(r.total_imported || 0))}
                        </div>
                      )
                    ],
                    [
                      "total_sold",
                      <span style={{ display: 'block', textAlign: 'right' }}>Đã bán</span>,
                      r => (
                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                          {new Intl.NumberFormat('vi-VN').format(Number(r.total_sold || 0))}
                        </div>
                      )
                    ],
                    [
                      "stock_remaining",
                      <span style={{ display: 'block', textAlign: 'right' }}>Còn lại</span>,
                      r => {
                        const remaining = Number(r.stock_remaining ?? r.stock ?? 0);
                        const minStock = Number(r.min_stock || 10);
                        const isOut = remaining <= 0;
                        const isLow = remaining > 0 && remaining <= minStock;
                        const color = isOut ? 'var(--ri-danger, #dc2626)' : isLow ? 'var(--ri-warning, #d97706)' : 'inherit';
                        return (
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500, color }}>
                            {new Intl.NumberFormat('vi-VN').format(remaining)}
                          </div>
                        );
                      }
                    ],
                    ["sale_price", <span style={{ display: 'block', textAlign: 'right' }}>Giá bán niêm yết</span>, r => <span style={{ display: 'block', textAlign: 'right', fontWeight: 600, color: 'var(--ri-primary)', fontVariantNumeric: 'tabular-nums' }}>{money(r.sale_price)}</span>],
                    ...(!hideCostPrice && user?.role !== 'CASHIER'
                      ? [["cost_price", <span style={{ display: 'block', textAlign: 'right' }}>Giá vốn</span>, r => <span style={{ display: 'block', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.cost_price != null ? money(r.cost_price) : '—'}</span>]]
                      : []),
                    [
                      "status",
                      "Trạng thái",
                      r => (
                        r.status === 'ACTIVE' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--ri-success-bg)',
                            color: 'var(--ri-success)',
                            padding: '3px 9px',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: 600
                          }}>
                            ● Đang bán
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--ri-disabled-bg)',
                            color: 'var(--ri-disabled-text)',
                            padding: '3px 9px',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: 600
                          }}>
                            ○ Ngừng bán
                          </span>
                        )
                      )
                    ],
                    ...(canEditProduct
                      ? [
                          [
                            "actions",
                            "Thao tác",
                            r => (
                              <button type="button" className="btn btn-secondary btn-sm product-action-edit" onClick={() => openEditModal(r)} title="Chỉnh sửa sản phẩm" aria-label="Chỉnh sửa sản phẩm"><Pencil size={14} /></button>
                            )
                          ]
                        ]
                      : [])
                  ]}
                />
                <Pager data={data} onChange={page => setQuery({ ...query, page })} />
              </>
            );
          }}
        </State>
      </Card>

      {bulkImportOpen&&(
        <div className="modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)closeBulkImport();}}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title" style={{width:'min(980px,100%)',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-head">
              <div><h2 id="bulk-import-title" style={{marginBottom:4}}>{selectedIds.length===1?'Nhập hàng vào kho':'Nhập kho đồng loạt'}</h2><p className="muted" style={{margin:0,fontSize:13}}>Chi nhánh: <strong>{activeBranch?.name||`#${productBranchId}`}</strong> · {bulkImportRows.length} sản phẩm đã chọn</p></div>
              <button type="button" className="icon-button" onClick={closeBulkImport} disabled={bulkBusy} aria-label="Đóng"><X size={18}/></button>
            </div>

            <form onSubmit={submitBulkImport} style={{display:'grid',gap:16,marginTop:16}}>
              {bulkImportRows.length>1&&<div style={{display:'flex',alignItems:'end',gap:10,flexWrap:'wrap',padding:'12px 14px',background:'#F8FAFC',border:'1px solid var(--ri-border)',borderRadius:10}}>
                <label style={{display:'grid',gap:5,flex:'1 1 260px',fontWeight:600,fontSize:13}}>Áp dụng số lượng chung cho tất cả<input type="number" inputMode="numeric" min="0" max="100000" step="1" className="ri-control" value={commonImportQty} onChange={event=>setCommonImportQty(event.target.value)} placeholder="Ví dụ: 20"/></label>
                <button type="button" className="btn btn-secondary" onClick={applyCommonImportQty}>Áp dụng</button>
              </div>}

              <div className="table-scroll" style={{maxHeight:'52vh',border:'1px solid var(--ri-border)',borderRadius:10}}>
                <table className="data-table">
                  <thead><tr><th>Mã sản phẩm</th><th>Tên sản phẩm</th><th style={{textAlign:'right'}}>Tồn hiện tại</th><th style={{minWidth:155}}>Số lượng nhập thêm</th><th style={{minWidth:180}}>Đơn giá nhập (VNĐ)</th></tr></thead>
                  <tbody>{bulkImportRows.map(row=><tr key={row.product_id}>
                    <td><strong>{row.sku}</strong></td>
                    <td>{row.name}</td>
                    <td style={{textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{new Intl.NumberFormat('vi-VN').format(row.stock)}</td>
                    <td><input aria-label={`Số lượng nhập ${row.sku}`} type="number" inputMode="numeric" min="0" max="100000" step="1" className="ri-control" value={row.quantity} onChange={event=>updateBulkImportRow(row.product_id,'quantity',event.target.value)} placeholder="0"/></td>
                    <td><input aria-label={`Đơn giá nhập ${row.sku}`} type="number" inputMode="decimal" min="0" step=".01" className="ri-control" value={row.unit_cost} onChange={event=>updateBulkImportRow(row.product_id,'unit_cost',event.target.value)}/></td>
                  </tr>)}</tbody>
                </table>
              </div>

              {bulkImportError&&<p className="auth-error" role="alert" style={{margin:0}}>{bulkImportError}</p>}
              <div className="op-actions" style={{justifyContent:'flex-end',margin:0}}>
                {bulkImportRows.some(row=>Number(row.quantity)>0)&&<button type="submit" className="btn btn-primary" disabled={bulkBusy} style={{display:'inline-flex',alignItems:'center',gap:7,background:'#0284C7',borderColor:'#0284C7'}}><PackagePlus size={16}/>{bulkBusy?'Đang nhập kho…':'Xác nhận nhập kho'}</button>}
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL SỬA SẢN PHẨM */}
      {editingProduct && (
        <div className="modal-overlay" onClick={closeEditModal} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div
            className="modal"
            style={{
              width: 'min(740px, 96vw)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
              borderRadius: '16px'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 1. Header cố định */}
            <div
              className="modal-head"
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--ri-border)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Chỉnh sửa thông tin sản phẩm</h2>
              <button
                type="button"
                className="icon-button"
                onClick={closeEditModal}
                aria-label="Đóng"
                style={{ padding: '6px', borderRadius: '8px', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form bọc body và footer */}
            <form
              id="product-edit-form"
              className="op-form product-edit-form"
              onSubmit={handleUpdate}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                margin: 0,
                overflow: 'hidden'
              }}
            >
              {/* 2. Vùng nội dung ở giữa có thanh cuộn mượt */}
              <div
                className="modal-body"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                <label>
                  Mã sản phẩm *
                  <input
                    type="text"
                    required
                    className="ri-control"
                    value={editForm.sku}
                    onChange={e => setEditForm({ ...editForm, sku: e.target.value })}
                  />
                </label>

                <label>
                  Tên sản phẩm *
                  <input
                    type="text"
                    required
                    className="ri-control"
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label>
                    Giá bán niêm yết (VNĐ) *
                    <input
                      type="number"
                      required
                      min="0"
                      step=".01"
                      className="ri-control"
                      value={editForm.sale_price}
                      onChange={e => setEditForm({ ...editForm, sale_price: e.target.value })}
                    />
                  </label>

                  {!hideCostPrice && (
                    <label>
                      Giá vốn tham khảo (VNĐ)
                      <input
                        type="number"
                        min="0"
                        step=".01"
                        className="ri-control"
                        value={editForm.cost_price}
                        onChange={e => setEditForm({ ...editForm, cost_price: e.target.value })}
                      />
                    </label>
                  )}
                </div>

                {/* Hàng 3: Danh mục phân loại, Trạng thái kinh doanh, Đơn vị tính */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', alignItems: 'start' }}>
                  {/* Cột 1: Danh mục phân loại */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0 }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475467', margin: 0 }}>
                      Danh mục phân loại
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        className="ri-control"
                        style={{ flex: 1, minWidth: 0, height: '42px' }}
                        value={editForm.category_id}
                        onChange={e => setEditForm({ ...editForm, category_id: e.target.value })}
                      >
                        <option value="">Chưa phân loại</option>
                        {categories.data?.items?.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        style={{
                          width: '42px',
                          height: '42px',
                          minWidth: '42px',
                          border: '1px solid #CBD5E1',
                          borderRadius: '10px',
                          background: 'var(--ri-surface)',
                          color: 'var(--ri-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0
                        }}
                        title="Tạo danh mục mới"
                        aria-label="Tạo danh mục mới"
                        onClick={() => { setShowEditCategoryInput(v => !v); setEditCategoryInlineError(''); }}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {showEditCategoryInput && (
                      <div style={{ marginTop: '4px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            className="ri-control"
                            autoFocus
                            maxLength={120}
                            aria-label="Tên danh mục mới"
                            placeholder="Tên danh mục mới"
                            style={{ height: '36px', fontSize: '13px' }}
                            value={newEditCategoryName}
                            onChange={e => { setNewEditCategoryName(e.target.value); setEditCategoryInlineError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEditCategory(); } }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ height: '36px', whiteSpace: 'nowrap', padding: '0 10px' }}
                            disabled={editCategoryBusy || !newEditCategoryName.trim()}
                            onClick={handleAddEditCategory}
                          >
                            {editCategoryBusy ? 'Đang thêm…' : 'Thêm'}
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Hủy tạo danh mục"
                            onClick={() => { setShowEditCategoryInput(false); setNewEditCategoryName(''); setEditCategoryInlineError(''); }}
                            disabled={editCategoryBusy}
                            style={{ width: '36px', height: '36px', display: 'grid', placeItems: 'center' }}
                          >
                            <X size={16} />
                          </button>
                        </div>
                        {editCategoryInlineError && (
                          <p role="alert" style={{ margin: '4px 0 0', color: 'var(--ri-danger, #ef4444)', fontSize: '0.8rem', fontWeight: 500 }}>
                            {editCategoryInlineError}
                          </p>
                        )}
                      </div>
                    )}
                    {editCategoryInlineSuccess && (
                      <p style={{ margin: '4px 0 0', color: 'var(--ri-success, #10b981)', fontSize: '0.8rem', fontWeight: 500 }}>
                        ✓ {editCategoryInlineSuccess}
                      </p>
                    )}
                  </div>

                  {/* Cột 2: Trạng thái kinh doanh */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0 }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475467', margin: 0 }}>
                      Trạng thái kinh doanh
                    </label>
                    <select
                      className="ri-control"
                      style={{ height: '42px' }}
                      value={editForm.status}
                      onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      <option value="ACTIVE">Đang bán (ACTIVE)</option>
                      <option value="DISABLED">Ngừng bán (DISABLED)</option>
                    </select>
                  </div>

                  {/* Cột 3: Đơn vị tính */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0 }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#475467', margin: 0 }}>
                      Đơn vị tính
                    </label>
                    <input
                      type="text"
                      maxLength={50}
                      className="ri-control"
                      style={{ height: '42px' }}
                      value={editForm.unit}
                      onChange={e => setEditForm({ ...editForm, unit: e.target.value })}
                    />
                  </div>
                </div>

                <div className="product-image-editor"><span>{'\u1ea2nh s\u1ea3n ph\u1ea9m'}</span><ImageUploadField imageUrl={editForm.image_url} onChange={image_url=>setEditForm(current=>({...current,image_url}))} onError={message=>setError(message)}/></div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10,marginTop:4}}>
                  {[
                    ['Tổng nhập',editingProduct.total_imported,'var(--ri-primary)'],
                    ['Đã bán',editingProduct.total_sold,'var(--ri-text)'],
                    ['Còn lại',editingProduct.stock_remaining,Number(editingProduct.stock_remaining||0)>0?'var(--ri-success, #15803d)':'var(--ri-danger, #dc2626)']
                  ].map(([label,value,color])=><div key={label} style={{background:'#F8FAFC',border:'1px solid var(--ri-border)',borderRadius:10,padding:'12px 14px',minWidth:0}}><div style={{fontSize:12,color:'#64748B',fontWeight:600,marginBottom:5}}>{label}</div><strong style={{display:'block',fontSize:20,color,fontVariantNumeric:'tabular-nums'}}>{new Intl.NumberFormat('vi-VN').format(Number(value||0))}</strong></div>)}
                </div>

                <section style={{marginTop:4,padding:'14px 16px',border:'1px solid var(--ri-border)',borderRadius:10,background:'var(--ri-elevated)'}}>
                  <h3 style={{fontSize:15,margin:'0 0 12px'}}>Nhập thêm hàng vào kho ({activeBranch?.name||`Chi nhánh #${productBranchId}`})</h3>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>
                    <label>
                      Số lượng nhập thêm
                      <input type="number" inputMode="numeric" min="0" step="1" className="ri-control" value={importQty} onChange={event=>setImportQty(event.target.value)} placeholder="0"/>
                    </label>
                    <label>
                      Đơn giá nhập lô này (VNĐ)
                      <input type="number" inputMode="decimal" min="0" step=".01" className="ri-control" value={importUnitCost} onChange={event=>setImportUnitCost(event.target.value)} required={Number(importQty)>0}/>
                    </label>
                  </div>
                </section>

                {error&&<p className="auth-error" role="alert" style={{marginBottom:0}}>{error}</p>}
              </div>

              {/* 3. Footer cố định ở đáy */}
              <div
                className="modal-footer"
                style={{
                  padding: '14px 24px',
                  borderTop: '1px solid var(--ri-border)',
                  background: 'var(--ri-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  flexShrink: 0
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeEditModal}
                  disabled={busy}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !isDirty}
                >
                  {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <AddProductModal open={addProductOpen} onClose={()=>setAddProductOpen(false)} onCreated={()=>list.reload()}/>
    </div>
  );
}
