import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBranch } from '../branches/BranchContext';
import { formatBusinessTime } from './business-time';
import { Card, PageHeader } from '../components/ui/Elements';
import { useResource, request, State, Table, Message, money, number, params, Pager } from './shared';
import AiFeatureGuideBanner from './ai/AiFeatureGuideBanner';
import { Button, Badge } from '../design-system';
import {
  ClipboardCheck,
  ArrowRightLeft,
  Warehouse,
  Plus,
  Trash2,
  Printer,
  X,
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Search,
  FileText
} from 'lucide-react';

export default function StockOperations() {
  const { user } = useAuth();
  const {activeBranchId,activeBranch,setActiveBranchId,isOwner}=useBranch();
  const [activeTab, setActiveTab] = useState('stocktake'); // 'stocktake' | 'transfer'

  // Master data
  const branches = useResource('/branches');
  const [historyType, setHistoryType] = useState(''); // '' | 'ADJUSTMENT' | 'TRANSFER'
  const [historyPage, setHistoryPage] = useState(1);
  const [historyBranch, setHistoryBranch] = useState(activeBranchId);

  // ─── STATE TAB 1: KIỂM KÊ KHO (STOCKTAKE) ──────────────────────────────────
  const [stocktakeBranch, setStocktakeBranch] = useState(activeBranchId);
  const [stocktakeNote, setStocktakeNote] = useState('');
  const [stocktakeLines, setStocktakeLines] = useState([
    { product_id: '', system_quantity: 0, actual_quantity: 0, reason: '' }
  ]);
  const [stocktakeBusy, setStocktakeBusy] = useState(false);
  const [stocktakeError, setStocktakeError] = useState('');
  const [stocktakeSuccess, setStocktakeSuccess] = useState('');

  // ─── STATE TAB 2: ĐIỀU CHUYỂN KHO (STOCK TRANSFER) ─────────────────────────
  const [sourceBranch, setSourceBranch] = useState(activeBranchId);
  const [destBranch, setDestBranch] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferLines, setTransferLines] = useState([
    { product_id: '', quantity: 1, current_stock: 0 }
  ]);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');

  // Detail Modal
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Idempotency keys
  const stocktakeIdempotency = useRef(null);
  const transferIdempotency = useRef(null);

  // Auto select default branch
  useEffect(() => {
    if(activeBranchId){setStocktakeBranch(activeBranchId);setSourceBranch(activeBranchId);setHistoryBranch(activeBranchId);}
    if (branches.data?.branches?.length) {
      const firstId = String(branches.data.branches[0].id);
      if (!stocktakeBranch) setStocktakeBranch(firstId);
      if (!sourceBranch) setSourceBranch(firstId);
      if (!destBranch && branches.data.branches.length > 1) {
        setDestBranch(String(branches.data.branches[1].id));
      }
    }
  }, [activeBranchId,branches.data, stocktakeBranch, sourceBranch, destBranch]);

  // Load products for selected branch
  const stocktakeProducts = useResource(
    stocktakeBranch ? `/products?limit=200&branch_id=${stocktakeBranch}` : null
  );
  const transferProducts = useResource(
    sourceBranch ? `/products?limit=200&branch_id=${sourceBranch}` : null
  );

  // Documents list
  const historyQuery = useMemo(() => {
    const q = { page: historyPage, limit: 15 };
    if (historyType) q.type = historyType;
    if (activeBranchId) q.branch_id = activeBranchId;
    return params(q);
  }, [historyPage, historyType, activeBranchId]);

  const documents = useResource(`/stock-operations?${historyQuery}`);
  const calendar = documents.data?.calendar;

  // ─── HANDLERS CHO KIỂM KÊ ─────────────────────────────────────────────────
  const handleSelectStocktakeProduct = (index, productId) => {
    const p = stocktakeProducts.data?.items?.find(item => String(item.id) === String(productId));
    const sysStock = p?.stock != null ? Number(p.stock) : 0;
    setStocktakeLines(prev =>
      prev.map((line, i) =>
        i === index
          ? {
              ...line,
              product_id: productId,
              system_quantity: sysStock,
              actual_quantity: sysStock, // Default actual to system
              unit_price: Number(p?.cost_price || p?.sale_price || 0)
            }
          : line
      )
    );
  };

  const updateStocktakeLine = (index, field, value) => {
    setStocktakeLines(prev =>
      prev.map((line, i) => (i === index ? { ...line, [field]: value } : line))
    );
  };

  const addStocktakeLine = () => {
    setStocktakeLines(prev => [
      ...prev,
      { product_id: '', system_quantity: 0, actual_quantity: 0, reason: '' }
    ]);
  };

  const removeStocktakeLine = index => {
    setStocktakeLines(prev => prev.filter((_, i) => i !== index));
  };

  const submitStocktake = async e => {
    e.preventDefault();
    setStocktakeError('');
    setStocktakeSuccess('');

    // Validation
    if (!stocktakeBranch) {
      setStocktakeError('Vui lòng chọn chi nhánh thực hiện kiểm kê.');
      return;
    }
    const validLines = stocktakeLines.filter(l => l.product_id);
    if (!validLines.length) {
      setStocktakeError('Vui lòng chọn ít nhất 1 sản phẩm để kiểm kê.');
      return;
    }

    setStocktakeBusy(true);
    try {
      const body = {
        branch_id: Number(stocktakeBranch),
        note: stocktakeNote?.trim() || undefined,
        items: validLines.map(l => ({
          product_id: Number(l.product_id),
          actual_quantity: Number(l.actual_quantity || 0),
          reason: l.reason?.trim() || undefined
        }))
      };

      const fingerprint = JSON.stringify(body);
      if (stocktakeIdempotency.current?.fingerprint !== fingerprint) {
        stocktakeIdempotency.current = { fingerprint, key: crypto.randomUUID() };
      }
      body.request_key = stocktakeIdempotency.current.key;

      const result = await request('/adjustments', { method: 'POST', body });
      const detail = await request(`/stock-operations/${result.id}`);
      setSelectedDoc(detail);
      setStocktakeSuccess(`Đã xác nhận phiếu kiểm kê kho #${result.id} thành công!`);

      // Reset form
      setStocktakeLines([{ product_id: '', system_quantity: 0, actual_quantity: 0, reason: '' }]);
      setStocktakeNote('');
      stocktakeIdempotency.current = null;
      documents.reload();
      stocktakeProducts.reload();
    } catch (err) {
      setStocktakeError(err.message || 'Lỗi xử lý phiếu kiểm kê.');
    } finally {
      setStocktakeBusy(false);
    }
  };

  // ─── HANDLERS CHO ĐIỀU CHUYỂN KHO ──────────────────────────────────────────
  const handleSelectTransferProduct = (index, productId) => {
    const p = transferProducts.data?.items?.find(item => String(item.id) === String(productId));
    const curStock = p?.stock != null ? Number(p.stock) : 0;
    setTransferLines(prev =>
      prev.map((line, i) =>
        i === index
          ? {
              ...line,
              product_id: productId,
              current_stock: curStock,
              quantity: curStock > 0 ? 1 : 0
            }
          : line
      )
    );
  };

  const updateTransferLine = (index, field, value) => {
    setTransferLines(prev =>
      prev.map((line, i) => (i === index ? { ...line, [field]: value } : line))
    );
  };

  const addTransferLine = () => {
    setTransferLines(prev => [
      ...prev,
      { product_id: '', quantity: 1, current_stock: 0 }
    ]);
  };

  const removeTransferLine = index => {
    setTransferLines(prev => prev.filter((_, i) => i !== index));
  };

  const submitTransfer = async e => {
    e.preventDefault();
    setTransferError('');
    setTransferSuccess('');

    if (!sourceBranch || !destBranch) {
      setTransferError('Vui lòng chọn cả chi nhánh xuất và chi nhánh nhận.');
      return;
    }
    if (sourceBranch === destBranch) {
      setTransferError('Chi nhánh xuất và chi nhánh nhận phải khác nhau.');
      return;
    }
    const validLines = transferLines.filter(l => l.product_id);
    if (!validLines.length) {
      setTransferError('Vui lòng chọn ít nhất 1 sản phẩm để điều chuyển.');
      return;
    }

    // Kiểm tra tồn kho trước khi gửi
    for (const l of validLines) {
      if (Number(l.quantity) > Number(l.current_stock)) {
        setTransferError(`Số lượng chuyển vượt quá tồn kho khả dụng (${l.current_stock}).`);
        return;
      }
    }

    setTransferBusy(true);
    try {
      const body = {
        source_branch_id: Number(sourceBranch),
        destination_branch_id: Number(destBranch),
        note: transferNote?.trim() || undefined,
        items: validLines.map(l => ({
          product_id: Number(l.product_id),
          quantity: Number(l.quantity)
        }))
      };

      const fingerprint = JSON.stringify(body);
      if (transferIdempotency.current?.fingerprint !== fingerprint) {
        transferIdempotency.current = { fingerprint, key: crypto.randomUUID() };
      }
      body.request_key = transferIdempotency.current.key;

      const result = await request('/transfers', { method: 'POST', body });
      const detail = await request(`/stock-operations/${result.id}`);
      setSelectedDoc(detail);
      setTransferSuccess(`Đã ghi nhận điều chuyển hàng hóa #${result.id} thành công!`);

      // Reset form
      setTransferLines([{ product_id: '', quantity: 1, current_stock: 0 }]);
      setTransferNote('');
      transferIdempotency.current = null;
      documents.reload();
      transferProducts.reload();
    } catch (err) {
      setTransferError(err.message || 'Lỗi xử lý điều chuyển kho.');
    } finally {
      setTransferBusy(false);
    }
  };

  const branchCount = branches.data?.branches?.length || 0;

  return (
    <>
      <PageHeader
        eyebrow="QUẢN LÝ KHO NÂNG CAO"
        title="Kiểm kê & Điều chuyển kho"
        description="Kiểm đếm tồn kho thực tế, cân đối sổ sách và luân chuyển hàng hóa giữa các chi nhánh."
      />

      <AiFeatureGuideBanner pageKey="stock-operations">
        <span style={{ display: 'block', marginBottom: 6 }}><strong>Kiểm kê tồn kho:</strong> Giúp đối chiếu số lượng hàng đếm thực tế trên kệ với số liệu trên phần mềm; khi có hao hụt, hư hỏng hoặc thất thoát, hệ thống tự động tính chênh lệch và cân bằng lại tồn kho kèm lý do rõ ràng.</span>
        <span style={{ display: 'block' }}><strong>Điều chuyển kho:</strong> Giúp luân chuyển hàng hóa trực tiếp giữa các chi nhánh trong chuỗi (tự động trừ kho chi nhánh gửi và cộng kho chi nhánh nhận) mà không làm sai lệch báo cáo doanh thu hay giá vốn.</span>
      </AiFeatureGuideBanner>

      {/* Tabs chuyển đổi giữa Kiểm kê và Điều chuyển */}
      <div className="stock-operation-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <Button
          variant={activeTab === 'stocktake' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveTab('stocktake')}
        >
          <ClipboardCheck size={16} /> Kiểm kê tồn kho
        </Button>
        <Button
          variant={activeTab === 'transfer' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveTab('transfer')}
        >
          <ArrowRightLeft size={16} /> Điều chuyển kho
        </Button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: FORM KIỂM KÊ KHO (STOCKTAKE / ADJUSTMENT)                     */}
      {/* =================================================================== */}
      {activeTab === 'stocktake' && (
        <Card style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardCheck size={20} style={{ color: 'var(--ri-primary)' }} />
                Lập phiếu kiểm kê & Cân đối kho
              </h2>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.875rem' }}>
                Đếm số lượng thực tế tại quầy kệ; hệ thống tự động tính độ lệch và điều chỉnh số dư sổ cái kho.
              </p>
            </div>
          </div>

          <Message error={stocktakeError} success={stocktakeSuccess} />

          <form onSubmit={submitStocktake} className="op-form">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <label>
                Chi nhánh kiểm kê *
                {isOwner?<select
                  required
                  className="ri-control"
                  value={stocktakeBranch}
                  onChange={e => setActiveBranchId(e.target.value)}
                >
                  <option value="">Chọn chi nhánh kiểm kê</option>
                  {branches.data?.branches?.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>:<div className="branch-static-badge">{activeBranch?.name||`Chi nhánh #${activeBranchId}`}</div>}
              </label>

              <label>
                Mục đích / Ghi chú kiểm kê
                <input
                  type="text"
                  maxLength="500"
                  className="ri-control"
                  placeholder="Ví dụ: Kiểm kê định kỳ cuối tháng, kiểm tra hàng cận date..."
                  value={stocktakeNote}
                  onChange={e => setStocktakeNote(e.target.value)}
                />
              </label>
            </div>

            {/* BẢNG CÁC MẶT HÀNG KIỂM KÊ */}
            <div style={{ marginTop: '16px', overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', minWidth: '900px', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ width: '27%', }}>Sản phẩm cần kiểm kê *</th>
                    <th style={{ width: '13%', textAlign: 'center' }}>Tồn sổ sách</th>
                    <th style={{ width: '14%', textAlign: 'center' }}>Tồn thực tế *</th>
                    <th style={{ width: '15%', textAlign: 'center' }}>Chênh lệch</th>
                    <th style={{ width: '23%' }}>Lý do chênh lệch</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {stocktakeLines.map((line, idx) => {
                    const variance = Number(line.actual_quantity || 0) - Number(line.system_quantity || 0);

                    return (
                      <tr key={idx}>
                        <td>
                          <select
                            required
                            className="ri-control"
                            value={line.product_id}
                            onChange={e => handleSelectStocktakeProduct(idx, e.target.value)}
                          >
                            <option value="">-- Chọn sản phẩm kiểm kê --</option>
                            {stocktakeProducts.data?.items?.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.sku} · {p.name} (Tồn: {p.stock ?? 0})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 600 }}>
                          {number(line.system_quantity)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max="100000"
                            required
                            className="ri-control"
                            style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.05rem', maxWidth: '120px', margin: '0 auto' }}
                            value={line.actual_quantity}
                            onChange={e => updateStocktakeLine(idx, 'actual_quantity', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {variance > 0 ? (
                            <span style={{ color: 'var(--ri-success)', fontWeight: 700 }}>+{variance} (Thừa)</span>
                          ) : variance < 0 ? (
                            <span style={{ color: 'var(--ri-danger)', fontWeight: 700 }}>{variance} (Thiếu)</span>
                          ) : (
                            <span style={{ color: 'var(--ri-muted)', fontWeight: 600 }}>0 (Khớp)</span>
                          )}
                        </td>
                        <td>
                          <input type="text" className="ri-control" style={{ width: '100%', minWidth: 0, fontSize: '0.8rem' }} placeholder="Hỏng, thất thoát, thừa quà tặng..." value={line.reason} onChange={e => updateStocktakeLine(idx, 'reason', e.target.value)} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {stocktakeLines.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => removeStocktakeLine(idx)}
                              title="Bỏ dòng này"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <Button type="button" variant="secondary" size="sm" onClick={addStocktakeLine}>
                <Plus size={15} /> Thêm sản phẩm kiểm kê
              </Button>

              <Button
                type="submit"
                variant="primary"
                loading={stocktakeBusy}
                disabled={stocktakeBusy || !stocktakeBranch}
              >
                {stocktakeBusy ? 'Đang cân đối kho...' : 'Xác nhận & Cân đối sổ kho'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* =================================================================== */}
      {/* TAB 2: FORM ĐIỀU CHUYỂN KHO (STOCK TRANSFER)                         */}
      {/* =================================================================== */}
      {activeTab === 'transfer' && (
        <Card style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowRightLeft size={20} style={{ color: 'var(--ri-primary)' }} />
                Lập phiếu điều chuyển hàng hóa nội bộ
              </h2>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.875rem' }}>
                Luân chuyển sản phẩm giữa 2 chi nhánh; tự động trừ tồn kho nguồn và cộng tồn kho đích trong một giao dịch.
              </p>
            </div>
          </div>

          <Message error={transferError} success={transferSuccess} />

          {/* Trường hợp chỉ có 1 chi nhánh: Hiển thị hướng dẫn thân thiện */}
          {branchCount < 2 ? (
            <div
              style={{
                padding: '24px',
                borderRadius: '8px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                textAlign: 'center',
                margin: '12px 0'
              }}
            >
              <Building2 size={36} style={{ color: 'var(--ri-primary)', margin: '0 auto 10px' }} />
              <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', color: 'var(--ri-text)' }}>
                Cửa hàng hiện tại mới chỉ có 1 chi nhánh
              </h3>
              <p className="muted" style={{ margin: '0 auto 16px', maxWidth: '520px', fontSize: '0.875rem' }}>
                Tính năng điều chuyển hàng hóa yêu cầu tối thiểu 2 chi nhánh độc lập trong cùng hệ thống.
                Hãy tạo thêm chi nhánh mới tại mục <strong>Tổ chức & Chi nhánh</strong> để bắt đầu sử dụng.
              </p>
              {['OWNER'].includes(user?.role) && (
                <Link to="/branches" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={15} /> Tạo thêm chi nhánh ngay
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={submitTransfer} className="op-form">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <label>
                  Chi nhánh xuất (Nguồn) *
                  {isOwner?<select
                    required
                    className="ri-control"
                    value={sourceBranch}
                    onChange={e => {
                      setActiveBranchId(e.target.value);
                      // Reset lines khi đổi kho nguồn
                      setTransferLines([{ product_id: '', quantity: 1, current_stock: 0 }]);
                    }}
                  >
                    <option value="">-- Chọn chi nhánh xuất --</option>
                    {branches.data?.branches?.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>:<div className="branch-static-badge">{activeBranch?.name||`Chi nhánh #${activeBranchId}`}</div>}
                </label>

                <label>
                  Chi nhánh nhận (Đích) *
                  <select
                    required
                    className="ri-control"
                    value={destBranch}
                    onChange={e => setDestBranch(e.target.value)}
                  >
                    <option value="">-- Chọn chi nhánh nhận --</option>
                    {branches.data?.branches
                      ?.filter(b => String(b.id) !== String(sourceBranch))
                      .map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                  </select>
                </label>

                <label style={{ gridColumn: '1 / -1' }}>
                  Ghi chú điều chuyển
                  <input
                    type="text"
                    maxLength="500"
                    className="ri-control"
                    placeholder="Ví dụ: Bổ sung hàng cho chi nhánh Quận 1 cuối tuần..."
                    value={transferNote}
                    onChange={e => setTransferNote(e.target.value)}
                  />
                </label>
              </div>

              {/* BẢNG CÁC SẢN PHẨM ĐIỀU CHUYỂN */}
              <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', minWidth: '650px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '45%' }}>Sản phẩm điều chuyển *</th>
                      <th style={{ width: '20%', textAlign: 'center' }}>Tồn tại kho xuất</th>
                      <th style={{ width: '20%', textAlign: 'center' }}>Số lượng chuyển *</th>
                      <th style={{ width: '15%', textAlign: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferLines.map((line, idx) => {
                      const isOverStock = Number(line.quantity) > Number(line.current_stock);

                      return (
                        <tr key={idx}>
                          <td>
                            <select
                              required
                              className="ri-control"
                              value={line.product_id}
                              onChange={e => handleSelectTransferProduct(idx, e.target.value)}
                            >
                              <option value="">-- Chọn sản phẩm cần chuyển --</option>
                              {transferProducts.data?.items?.map(p => (
                                <option key={p.id} value={p.id} disabled={Number(p.stock || 0) <= 0}>
                                  {p.sku} · {p.name} {Number(p.stock || 0) <= 0 ? '(Hết hàng)' : `(Còn ${p.stock})`}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 600 }}>
                            <span style={{ color: Number(line.current_stock) <= 0 ? 'var(--ri-danger)' : 'inherit' }}>
                              {number(line.current_stock)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              min="1"
                              max={line.current_stock || 100000}
                              required
                              className="ri-control"
                              style={{
                                textAlign: 'center',
                                fontWeight: 700,
                                fontSize: '1.05rem',
                                maxWidth: '120px',
                                margin: '0 auto',
                                borderColor: isOverStock ? 'var(--ri-danger)' : undefined
                              }}
                              value={line.quantity}
                              onChange={e => updateTransferLine(idx, 'quantity', e.target.value)}
                            />
                            {isOverStock && (
                              <small style={{ color: 'var(--ri-danger)', display: 'block', marginTop: '4px' }}>
                                Vượt tồn kho ({line.current_stock})
                              </small>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {transferLines.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => removeTransferLine(idx)}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <Button type="button" variant="secondary" size="sm" onClick={addTransferLine}>
                  <Plus size={15} /> Thêm sản phẩm điều chuyển
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  loading={transferBusy}
                  disabled={transferBusy || !sourceBranch || !destBranch || sourceBranch === destBranch}
                >
                  {transferBusy ? 'Đang điều chuyển...' : 'Xác nhận điều chuyển kho'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* =================================================================== */}
      {/* 3. LỊCH SỬ CÁC PHIẾU KIỂM KÊ & ĐIỀU CHUYỂN KHO                       */}
      {/* =================================================================== */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Lịch sử chứng từ kho</h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              Tra cứu toàn bộ phiếu kiểm kê định kỳ và điều chuyển nội bộ giữa các chi nhánh.
            </p>
          </div>

          {/* Bộ lọc nhanh theo Loại phiếu và Chi nhánh */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="ri-control"
              style={{ fontSize: '0.85rem', width: 'auto' }}
              value={historyType}
              onChange={e => {
                setHistoryType(e.target.value);
                setHistoryPage(1);
              }}
            >
              <option value="">Tất cả nghiệp vụ</option>
              <option value="ADJUSTMENT">Chỉ phiếu kiểm kê</option>
              <option value="TRANSFER">Chỉ phiếu điều chuyển (Transfer)</option>
            </select>

            {isOwner?<select
              className="ri-control"
              style={{ fontSize: '0.85rem', width: 'auto' }}
              value={activeBranchId}
              onChange={e => {
                setActiveBranchId(e.target.value);
                setHistoryPage(1);
              }}
            >
              {branches.data?.branches?.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>:<span className="branch-static-badge">{activeBranch?.name||`Chi nhánh #${activeBranchId}`}</span>}
          </div>
        </div>

        <State resource={documents}>
          {data => (
            <>
              <Table
                rows={data?.items ?? []}
                empty="Chưa phát sinh phiếu kiểm kê hoặc điều chuyển kho nào."
                columns={[
                  ['id', 'Số phiếu', r => <strong>#{r.id}</strong>],
                  [
                    'type',
                    'Loại nghiệp vụ',
                    r => (
                      <Badge variant={r.type === 'ADJUSTMENT' ? 'info' : 'warning'}>
                        {r.type === 'ADJUSTMENT' ? 'Kiểm kê kho' : 'Điều chuyển'}
                      </Badge>
                    )
                  ],
                  [
                    'branch_name',
                    'Chi nhánh liên quan',
                    r =>
                      r.type === 'TRANSFER' ? (
                        <span>
                          <strong>{r.branch_name}</strong> → <span style={{ color: 'var(--ri-primary)' }}>{r.destination_branch_name}</span>
                        </span>
                      ) : (
                        <span>{r.branch_name}</span>
                      )
                  ],
                  ['total', 'Giá trị cân đối / Luân chuyển', r => money(r.total)],
                  ['performed_by_name', 'Người thực hiện', r => r.performed_by_name || 'Hệ thống'],
                  ['created_at', 'Thời gian ghi nhận', r => formatBusinessTime(r.created_at, calendar)],
                  [
                    'note',
                    'Ghi chú',
                    r => <span className="muted" style={{ fontSize: '0.85rem' }}>{r.note || '—'}</span>
                  ],
                  [
                    'actions',
                    'Thao tác',
                    r => (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                          try {
                            const detail = await request(`/stock-operations/${r.id}`);
                            setSelectedDoc(detail);
                          } catch (err) {
                            alert(err.message);
                          }
                        }}
                      >
                        Chi tiết
                      </button>
                    )
                  ]
                ]}
              />
              <Pager data={data} onChange={setHistoryPage} />
            </>
          )}
        </State>
      </Card>

      {/* =================================================================== */}
      {/* 4. MODAL CHI TIẾT CHỨNG TỪ (HỖ TRỢ IN ẤN)                           */}
      {/* =================================================================== */}
      {selectedDoc && (
        <Card className="op-invoice" style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} style={{ color: 'var(--ri-primary)' }} />
              {selectedDoc.document.type === 'ADJUSTMENT'
                ? `Phiếu kiểm kê & Cân đối kho #${selectedDoc.document.id}`
                : `Phiếu điều chuyển hàng hóa nội bộ #${selectedDoc.document.id}`}
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                <Printer size={15} /> In phiếu
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDoc(null)}>
                <X size={15} /> Đóng
              </Button>
            </div>
          </div>

          <div style={{ margin: '14px 0', padding: '12px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px' }}>
            <p style={{ margin: '2px 0' }}>
              <strong>Đơn vị:</strong> {selectedDoc.document.organization_name}
            </p>
            {selectedDoc.document.type === 'TRANSFER' ? (
              <p style={{ margin: '2px 0' }}>
                <strong>Từ chi nhánh:</strong> {selectedDoc.document.branch_name} → <strong>Đến chi nhánh:</strong> {selectedDoc.document.destination_branch_name}
              </p>
            ) : (
              <p style={{ margin: '2px 0' }}>
                <strong>Chi nhánh kiểm kê:</strong> {selectedDoc.document.branch_name}
              </p>
            )}
            <p style={{ margin: '2px 0' }}>
              <strong>Người thực hiện:</strong> {selectedDoc.document.performed_by_name} · <strong>Thời gian:</strong> {formatBusinessTime(selectedDoc.document.created_at, selectedDoc.calendar || calendar)}
            </p>
            {selectedDoc.document.note && (
              <p style={{ margin: '2px 0' }}>
                <strong>Ghi chú:</strong> {selectedDoc.document.note}
              </p>
            )}
          </div>

          {/* Bảng chi tiết mặt hàng */}
          <Table
            rows={selectedDoc.items}
            columns={
              selectedDoc.document.type === 'ADJUSTMENT'
                ? [
                    ['sku', 'Mã sản phẩm', r => <strong>{r.sku}</strong>],
                    ['product_name', 'Tên sản phẩm'],
                    ['system_quantity', 'Tồn sổ sách', r => number(r.system_quantity)],
                    ['actual_quantity', 'Tồn thực tế', r => <strong>{number(r.actual_quantity)}</strong>],
                    [
                      'variance',
                      'Chênh lệch',
                      r => (
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              Number(r.variance) > 0
                                ? 'var(--ri-success)'
                                : Number(r.variance) < 0
                                ? 'var(--ri-danger)'
                                : 'var(--ri-muted)'
                          }}
                        >
                          {Number(r.variance) > 0 ? `+${r.variance}` : r.variance}
                        </span>
                      )
                    ],
                    ['unit_price', 'Đơn giá vốn', r => money(r.unit_price)],
                    ['line_total', 'Giá trị lệch', r => money(r.line_total)]
                  ]
                : [
                    ['sku', 'Mã sản phẩm', r => <strong>{r.sku}</strong>],
                    ['product_name', 'Tên sản phẩm'],
                    ['quantity', 'Số lượng chuyển', r => <strong>{number(r.quantity)}</strong>],
                    ['unit_price', 'Đơn giá xuất', r => money(r.unit_price)],
                    ['line_total', 'Thành tiền', r => money(r.line_total)]
                  ]
            }
          />

          <h3 style={{ textAlign: 'right', marginTop: '16px', color: 'var(--ri-primary)' }}>
            Tổng giá trị: {money(selectedDoc.document.total)}
          </h3>

          <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '12px' }}>
            Chứng từ kiểm soát kho nội bộ thuộc hệ thống Retail Insight. Số dư kho đã được cập nhật tự động vào sổ cái kho.
          </p>
        </Card>
      )}
    </>
  );
}
