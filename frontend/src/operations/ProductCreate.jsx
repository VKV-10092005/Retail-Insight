import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Card } from '../components/ui/Elements';
import { request, useResource, Message } from './shared';
import ProductImport from './ProductImport';
import { Tabs } from '../design-system/Tabs';
import './ProductCreate.css';
import { useAuth } from '../auth/AuthContext';
import { useBranch } from '../branches/BranchContext';
import {
  ArrowLeft,
  RefreshCw,
  FolderPlus,
  Save,
  CheckCircle2,
  FileSpreadsheet,
  PackagePlus,
  X
} from 'lucide-react';

const blankForm = {
  sku: '',
  name: '',
  sale_price: '',
  cost_price: '',
  min_stock: '',
  category_id: '',
  unit: 'Cái',
  status: 'ACTIVE'
};

export default function ProductCreate() {
  const navigate = useNavigate();
  const {user}=useAuth();
  const {activeBranchId:branchId}=useBranch();
  const branchList=useResource('/branches');
  const selectedBranch=branchList.data?.branches?.find(branch=>String(branch.id)===branchId);
  const categories = useResource('/categories'+(branchId?'?branch_id='+branchId:''));
  const canCreateForBranch=['OWNER','MANAGER'].includes(user?.role)||(['CASHIER','INVENTORY'].includes(user?.role)&&selectedBranch?.catalog_mode==='INDEPENDENT');
  const canCreateCategory=['OWNER','MANAGER'].includes(user?.role);

  const [activeTab, setActiveTab] = useState('single');
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal tạo danh mục nhanh
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState('');

  const validOptionalNonNegative = value => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0);
  const isFormValid = form.name.trim().length > 0
    && form.sku.trim().length > 0
    && Number.isFinite(Number(form.sale_price))
    && Number(form.sale_price) > 0
    && validOptionalNonNegative(form.cost_price)
    && validOptionalNonNegative(form.min_stock);

  // Tự sinh mã SKU ngẫu nhiên
  const generateSku = () => {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    setForm(prev => ({ ...prev, sku: `SP-${randomNum}` }));
  };

  // Tạo nhanh danh mục mới
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setCatBusy(true);
    setCatError('');
    try {
      const res = await request('/categories', {
        method: 'POST',
        body: { name: newCategoryName.trim(),...(branchId?{branch_id:Number(branchId)}:{}) }
      });
      categories.reload();
      if (res?.id) {
        setForm(prev => ({ ...prev, category_id: String(res.id) }));
      }
      setNewCategoryName('');
      setShowCategoryModal(false);
      setSuccess('Đã tạo danh mục mới thành công.');
    } catch (err) {
      setCatError(err.message || 'Lỗi tạo danh mục');
    } finally {
      setCatBusy(false);
    }
  };

  // Lưu sản phẩm (hỗ trợ action 'continue' hoặc 'redirect')
  const handleSave = async (e, action = 'redirect') => {
    e.preventDefault();
    if (!isFormValid || busy) return;
    setError('');
    setSuccess('');
    setBusy(true);

    try {
      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        sale_price: Number(form.sale_price),
        cost_price: user?.role==='CASHIER'||form.cost_price === '' ? null : Number(form.cost_price),
        category_id: form.category_id ? Number(form.category_id) : null,
        ...(branchId?{branch_id:Number(branchId)}:{}),
        status: form.status,
        attributes: {
          ...(form.unit ? { unit: form.unit } : {}),
          ...(form.min_stock !== '' ? { min_stock: Number(form.min_stock) } : {})
        }
      };

      await request('/products', {
        method: 'POST',
        body: payload
      });

      if (action === 'continue') {
        setSuccess(`Đã lưu thành công sản phẩm "${form.name}". Tiếp tục thêm mặt hàng mới.`);
        setForm(blankForm);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        navigate('/products', {
          state: { flashMessage: `Đã thêm sản phẩm "${form.name}" vào danh mục.` }
        });
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi lưu sản phẩm. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setBusy(false);
    }
  };

  const tabItems = [
    {
      id: 'single',
      label: <><PackagePlus size={16} /> Thêm từng sản phẩm</>,
      content: (
        <Card style={{ marginTop: '20px', maxWidth: '800px' }}>
          <h2>Thông tin sản phẩm mới</h2>
          <p className="muted">
            Điền đầy đủ các trường thông tin có dấu sao (*) để tạo mới hàng hóa trên hệ thống.
          </p>

          <form className="op-form" onSubmit={e => handleSave(e, 'redirect')} style={{ marginTop: '20px' }}>
            {/* Tên sản phẩm */}
            <label>
              Tên sản phẩm *
              <input
                type="text"
                required
                maxLength={180}
                className="ri-control"
                placeholder="Ví dụ: Áo sơ mi nam Oxford Slim Fit"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </label>

            {/* Mã SKU & Nút tạo tự động */}
            <label>
              Mã sản phẩm *
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  required
                  maxLength={100}
                  className="ri-control"
                  style={{ flex: 1 }}
                  placeholder="Ví dụ: SM-OXF-01"
                  value={form.sku}
                  onChange={e => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={generateSku}
                  style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={15} style={{ color: 'var(--ri-primary)' }} />
                  <span>Tạo mã tự động</span>
                </button>
              </div>
            </label>

            {/* Danh mục & Nút tạo nhanh danh mục */}
            <label>
              Danh mục phân loại
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="ri-control"
                  style={{ flex: 1 }}
                  value={form.category_id}
                  onChange={e => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">-- Chọn danh mục phân loại --</option>
                  {categories.data?.items?.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {canCreateCategory&&<button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCategoryModal(true)}
                  style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <FolderPlus size={15} style={{ color: 'var(--ri-success)' }} />
                  <span>Tạo danh mục</span>
                </button>}
              </div>
            </label>

            {/* Giá bán & Giá vốn */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <label>
                Giá bán niêm yết (VNĐ) *
                <input
                  type="number"
                  required
                  min="0"
                  step=".01"
                  className="ri-control"
                  placeholder="Ví dụ: 250000"
                  value={form.sale_price}
                  onChange={e => setForm({ ...form, sale_price: e.target.value })}
                />
              </label>

              {user?.role!=='CASHIER'&&<label>
                Giá vốn tham khảo (VNĐ)
                <input
                  type="number"
                  min="0"
                  step=".01"
                  className="ri-control"
                  placeholder="Tùy chọn, ví dụ: 160000"
                  value={form.cost_price}
                  onChange={e => setForm({ ...form, cost_price: e.target.value })}
                />
              </label>}

              <label>
                Mức tồn tối thiểu
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="ri-control"
                  placeholder="Tùy chọn, ví dụ: 10"
                  value={form.min_stock}
                  onChange={e => setForm({ ...form, min_stock: e.target.value })}
                />
              </label>
            </div>

            {/* Đơn vị tính & Trạng thái */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <label>
                Đơn vị tính
                <input
                  type="text"
                  maxLength={50}
                  className="ri-control"
                  placeholder="Ví dụ: Cái, Hộp, Bộ, Kg..."
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                />
              </label>

              <label>
                Trạng thái khi tạo
                <select
                  className="ri-control"
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                >
                  <option value="ACTIVE">Kinh doanh ngay (ACTIVE)</option>
                  <option value="DISABLED">Tạm chưa bán (DISABLED)</option>
                </select>
              </label>
            </div>

            {/* 2 NÚT LƯU TIỆN ÍCH */}
            <div className="op-actions" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--ri-border)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !isFormValid || !canCreateForBranch}
                onClick={e => handleSave(e, 'continue')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Save size={16} />
                <span>Lưu & Thêm sản phẩm khác</span>
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !isFormValid || !canCreateForBranch}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <CheckCircle2 size={16} />
                <span>{busy ? 'Đang lưu…' : 'Lưu & Quay lại danh sách'}</span>
              </button>
            </div>
          </form>
        </Card>
      )
    },
    {
      id: 'import',
      label: <><FileSpreadsheet size={16} /> Nhập hàng loạt từ CSV/Excel</>,
      content: (
        <div style={{ marginTop: '20px' }}>
          <ProductImport branchId={branchId?Number(branchId):undefined} canImport={canCreateForBranch} onImported={() => categories.reload()} />
        </div>
      )
    }
  ];

  return (
    <div className="product-create-container">
      <PageHeader
        eyebrow="KHAI BÁO HÀNG HÓA"
        title="Thêm mới sản phẩm"
        description="Khai báo thông tin chi tiết cho từng mặt hàng hoặc nhập hàng loạt từ danh sách file CSV/Excel."
        actions={
          <Link
            to="/products"
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <ArrowLeft size={16} />
            <span>Quay lại danh mục sản phẩm</span>
          </Link>
        }
      />

      <Message error={error} success={success} />
      {!canCreateForBranch&&branchId&&branchList.data&&<p role="status" className="muted">Chỉ Chủ cửa hàng hoặc Quản lý có thể tạo sản phẩm trong chế độ dùng chung. Chi nhánh độc lập cho phép nhân sự được phân công tạo và nhập sản phẩm riêng.</p>}

      <Tabs
        items={tabItems}
        value={activeTab}
        onValueChange={setActiveTab}
        label="Hình thức khai báo sản phẩm"
      />

      {/* MODAL TẠO NHANH DANH MỤC */}
      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal" style={{ width: 'min(440px, 100%)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Tạo danh mục sản phẩm mới</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowCategoryModal(false)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            {catError && <p className="auth-error" style={{ margin: '12px 0 0' }}>{catError}</p>}

            <form onSubmit={handleAddCategory} style={{ marginTop: '16px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                Tên danh mục mới *
                <input
                  type="text"
                  required
                  maxLength={120}
                  className="ri-control"
                  placeholder="Ví dụ: Đồ gia dụng, Thời trang hè..."
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  autoFocus
                />
              </label>

              <div className="op-actions" style={{ marginTop: '20px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCategoryModal(false)}
                  disabled={catBusy}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={catBusy || !newCategoryName.trim()}
                >
                  {catBusy ? 'Đang tạo…' : 'Tạo danh mục'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
