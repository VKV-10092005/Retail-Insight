import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card } from '../../components/ui/Elements';
import { useResource, State, Table, number, money, params, AiResultNotice, vndNumber } from '../shared';
import AiOfflineCard, { isAiOfflineError } from './AiOfflineCard';
import AiFeatureGuideBanner from './AiFeatureGuideBanner';
import QuickReceiptModal from './QuickReceiptModal';
import { ClipboardList, ShoppingCart, Search, CheckCircle2, Edit3, PackagePlus, AlertCircle } from 'lucide-react';
import {BranchSelect,useBranch} from '../../branches/BranchContext';
import {useAuth} from '../../auth/AuthContext';
import useAppSettings from '../../hooks/useAppSettings';

export default function Replenishment() {
  const {user}=useAuth();
  const appSettings=useAppSettings(user?.id,user?.role);
  const safetyFactor=Number(appSettings.ai?.safetyFactor)||1.5;
  const {activeBranchId,activeBranch}=useBranch();
  const navigate = useNavigate();
  const today = new Date();
  const defaultOrigin = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);

  const [filters, setFilters] = useState({
    branch_id: '',
    status_filter: 'REPLENISH', // REPLENISH | ALL | SUFFICIENT
    origin: defaultOrigin
  });
  const [search, setSearch] = useState('');

  // Lưu trữ số lượng đề xuất do người dùng tùy chỉnh trực tiếp trên bảng
  const [customQuantities, setCustomQuantities] = useState({});
  const [actionSuccess, setActionSuccess] = useState('');
  const [receiptItem, setReceiptItem] = useState(null);

  const ready = useResource('/ai/readiness');
  const productQuery = activeBranchId ? `&branch_id=${encodeURIComponent(activeBranchId)}` : '';
  const productsPage1 = useResource(`/products?limit=100&page=1${productQuery}`);
  const productsPage2 = useResource(`/products?limit=100&page=2${productQuery}`);
  const productById = useMemo(() => new Map([
    ...(productsPage1.data?.items ?? []), ...(productsPage2.data?.items ?? [])
  ].map(product => [String(product.id), product])), [productsPage1.data, productsPage2.data]);

  const queryParams = params({
    task: 'replenishment',
    branch_id: activeBranchId,
    origin: filters.origin
  });

  const replenishmentResource = useResource(`/ai/forecast?${queryParams}`);
  const isOffline = isAiOfflineError(replenishmentResource?.error) || (!replenishmentResource?.loading && !replenishmentResource?.data && isAiOfflineError(ready?.error));

  const handleQtyChange = (itemId, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setCustomQuantities(prev => ({
      ...prev,
      [itemId]: num
    }));
  };

  const handleCreateReceipt = (itemsToImport) => {
    // Chuyển hướng sang trang Nhập hàng (/receipts) kèm thông tin số lượng đã đề xuất
    navigate('/receipts', {
      state: {
        fromReplenishment: true,
        items: itemsToImport.map(item => ({
          product_id: item.product_id,
          sku: item.sku,
          name: item.name,
          quantity: customQuantities[item.product_id] ?? item.recommended_quantity ?? 0,
          cost_price: vndNumber(item.costPrice ?? item.cost_price ?? 0)
        }))
      }
    });
  };

  return (
    <div className="ai-page-container">
      <PageHeader
        eyebrow="TỐI ƯU HÓA CHUỖI CUNG ỨNG"
        title="Gợi ý bổ sung hàng hóa thông minh"
        description="Thuật toán tự động tính toán sản lượng nhập tối ưu: Q = max(0, Nhu cầu dự báo + Tồn an toàn - Tồn hiện tại)."
      />
      <AiFeatureGuideBanner pageKey="replenishment">Tính toán chính xác số lượng cần nhập bổ sung tối ưu cho từng sản phẩm (kết hợp dự báo AI và công thức EOQ) kèm dự trù sẵn tổng vốn nhập hàng, giúp chủ cửa hàng lên phiếu nhập kho nhanh gọn mà không cần tính tay trên Excel.</AiFeatureGuideBanner>
      {actionSuccess && <p role="status" className="op-success" style={{ marginBottom: 16 }}>{actionSuccess}</p>}

      {/* BỘ LỌC TẬP TRUNG */}
      <Card className="ai-filters-card" style={{ marginBottom: '24px' }}>
        <div className="ai-filter-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {/* 1. Chi nhánh */}
          <label className="ai-filter-item">
            <span className="ai-filter-label">1. Chi nhánh bổ sung</span>
            <BranchSelect/>
          </label>

          {/* 2. Trạng thái đề xuất */}
          <label className="ai-filter-item">
            <span className="ai-filter-label">2. Trạng thái đề xuất</span>
            <select
              className="ri-control"
              value={filters.status_filter}
              onChange={e => setFilters({ ...filters, status_filter: e.target.value })}
            >
              <option value="REPLENISH">Chỉ hiện mặt hàng cần nhập (Số lượng &gt; 0)</option>
              <option value="ALL">Tất cả sản phẩm trong danh mục</option>
              <option value="SUFFICIENT">Đã đủ tồn kho (Không cần nhập)</option>
            </select>
          </label>

          {/* 3. Tìm kiếm sản phẩm */}
          <label className="ai-filter-item">
            <span className="ai-filter-label">3. Tìm mã sản phẩm / Tên sản phẩm</span>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--ri-muted)' }} />
              <input
                type="text"
                placeholder="Nhập mã hoặc tên sản phẩm..."
                className="ri-control"
                style={{ paddingLeft: '32px' }}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </label>
        </div>
      </Card>

      {/* NẾU FASTAPI AI SERVICE CHƯA KHỞI ĐỘNG */}
      {isOffline && (
        <AiOfflineCard
          onRetry={() => {
            replenishmentResource?.reload();
            ready?.reload();
          }}
          loading={replenishmentResource?.loading || ready?.loading}
        />
      )}

      {/* KHI SẴN SÀNG */}
      {!isOffline && (
        <State resource={replenishmentResource}>
          {result => {
            const rawRows = result?.items ?? [];

            // Chuẩn hóa dữ liệu từng dòng
            const parsedRows = rawRows.map(r => {
              const stock = r.stock != null ? Number(r.stock) : 0;
              const predicted = r.predicted != null ? Number(r.predicted) : (r.quantity != null ? Number(r.quantity) : 0);
              const baseSafetyStock = r.safety_stock != null ? Number(r.safety_stock) : Math.ceil(predicted * 0.2);
              const safetyStock = Math.ceil(baseSafetyStock * (safetyFactor / 1.5));
              const defaultRecommend = r.recommended_quantity != null ? Number(r.recommended_quantity) : (r.stock==null?0:Math.max(0, Math.max(Number(r.min_stock||0),Math.ceil(predicted)+safetyStock) - stock));
              const userQty = customQuantities[r.product_id] !== undefined ? customQuantities[r.product_id] : defaultRecommend;
              const product = productById.get(String(r.product_id));
              const costPrice = vndNumber(product?.cost_price ?? r.cost_price ?? 0);

              return {
                ...r,
                cost_price: costPrice,
                stock,
                predicted,
                safetyStock,
                defaultRecommend,
                currentRecommend: userQty,
                costPrice,
                estimatedAmount: userQty * costPrice
              };
            });

            // Lọc theo bộ lọc và tìm kiếm
            const filteredRows = parsedRows.filter(r => {
              if (filters.status_filter === 'REPLENISH' && r.currentRecommend <= 0) return false;
              if (filters.status_filter === 'SUFFICIENT' && r.currentRecommend > 0) return false;
              if (search) {
                const q = search.toLowerCase();
                const skuMatch = String(r.sku || r.product_id || '').toLowerCase().includes(q);
                const nameMatch = String(r.name || '').toLowerCase().includes(q);
                if (!skuMatch && !nameMatch) return false;
              }
              return true;
            });

            const needReplenishItems = parsedRows.filter(r => r.currentRecommend > 0);
            const totalReplenishQty = needReplenishItems.reduce((sum, r) => sum + r.currentRecommend, 0);
            const totalEstimatedAmount = needReplenishItems.reduce((sum, r) => sum + r.estimatedAmount, 0);

            return (
              <>
                <AiResultNotice result={result} partialText={result?.status==='PARTIAL'?'Mô hình chưa sẵn sàng; đề xuất dùng trung bình bán 3 tháng gần nhất và mức tồn tối thiểu.':undefined} />
                {/* 3 THẺ TỔNG HỢP GỢI Ý NHẬP HÀNG */}
                <div className="stat-grid" style={{ marginBottom: '24px' }}>
                  <Card className="stat" style={{ borderLeft: '4px solid var(--ri-primary)' }}>
                    <div className="stat-top">Số mặt hàng đề xuất nhập</div>
                    <strong style={{ fontSize: '1.85rem', color: 'var(--ri-primary)' }}>
                      {needReplenishItems.length} sản phẩm
                    </strong>
                    <small>Mặt hàng có tồn kho dưới ngưỡng an toàn</small>
                  </Card>

                  <Card className="stat">
                    <div className="stat-top">Tổng sản lượng đề xuất nhập</div>
                    <strong style={{ fontSize: '1.85rem' }}>
                      {number(totalReplenishQty)} đơn vị
                    </strong>
                    <small>Đã tính toán theo tồn kho và nhu cầu</small>
                  </Card>

                  <Card className="stat">
                    <div className="stat-top">Tổng giá trị vốn ước tính</div>
                    <strong style={{ fontSize: '1.85rem', color: 'var(--ri-success)' }}>
                      {money(totalEstimatedAmount)}
                    </strong>
                    <small>Ước tính theo giá vốn tham khảo</small>
                  </Card>
                </div>

                {/* BẢNG TÍNH TOÁN NHẬP HÀNG THÔNG MINH */}
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h2 style={{ margin: 0 }}>Bảng tính toán và tùy chỉnh sản lượng nhập kho</h2>
                      <p className="muted" style={{ margin: '4px 0 0' }}>
                        Bạn có thể chỉnh sửa trực tiếp số lượng nhập ở cột <strong>Số lượng đề xuất nhập</strong> trước khi tạo phiếu.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={needReplenishItems.length === 0}
                      onClick={() => handleCreateReceipt(needReplenishItems)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <PackagePlus size={18} />
                      <span>Tạo phiếu nhập hàng từ gợi ý ({needReplenishItems.length} sản phẩm)</span>
                    </button>
                  </div>

                  <Table
                    rows={filteredRows}
                    empty={parsedRows.length>0 && filters.status_filter==="REPLENISH" && !search ? <div style={{display:"grid",justifyItems:"center",gap:8}}><span>Tất cả mặt hàng hiện đang đủ tồn kho theo bộ lọc.</span><button type="button" className="btn btn-secondary btn-sm" onClick={()=>setFilters(current=>({...current,status_filter:"ALL"}))}>Xem tất cả sản phẩm trong danh mục</button></div> : "Không có sản phẩm nào phù hợp trong phạm vi đã chọn."}
                    columns={[
                      ["sku", "Mã sản phẩm", r => <strong>{r.sku || `#${r.product_id}`}</strong>],
                      ["name", "Tên sản phẩm", r => r.name || `Sản phẩm #${r.product_id}`],
                      ["stock", "Tồn hiện tại", r => number(r.stock)],
                      ["min_stock", "Mức tồn tối thiểu", r => r.min_stock != null ? number(r.min_stock) : '—'],
                      ["predicted", "Nhu cầu dự báo", r => number(r.predicted)],
                      ["safetyStock", "Tồn an toàn", r => number(r.safetyStock)],
                      [
                        "recommend",
                        "Số lượng đề xuất nhập",
                        r => (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="number"
                              min="0"
                              className="ri-control"
                              style={{ width: '90px', padding: '6px 8px', fontWeight: 700, color: r.currentRecommend > 0 ? 'var(--ri-primary)' : 'inherit' }}
                              value={r.currentRecommend}
                              onChange={e => handleQtyChange(r.product_id, e.target.value)}
                            />
                            {customQuantities[r.product_id] !== undefined && (
                              <Edit3 size={14} style={{ color: 'var(--ri-warning)' }} title="Đã chỉnh sửa thủ công" />
                            )}
                          </div>
                        )
                      ],
                      ["costPrice", "Giá vốn dự kiến", r => r.costPrice > 0 ? money(r.costPrice) : '—'],
                      ["estimatedAmount", "Thành tiền ước tính", r => <span style={{ fontWeight: 600 }}>{money(r.estimatedAmount)}</span>],
                      ["receiptAction", "Thao tác", r => <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setActionSuccess(''); setReceiptItem({ ...r, initialQuantity: r.currentRecommend, costPrice: r.costPrice, source: 'gợi ý nhập hàng' }); }}>Nhập hàng →</button>]
                    ]}
                  />

                  <p className="muted" style={{ marginTop: '14px' }}>
                    * Thuật toán tự động cân bằng chi phí lưu kho và rủi ro gián đoạn nguồn hàng, đảm bảo cung ứng đủ cho chu kỳ bán lẻ kế tiếp.
                  </p>
                </Card>
              </>
            );
          }}
        </State>
      )}
      <QuickReceiptModal item={receiptItem} branchId={activeBranchId} branchName={activeBranch?.name} onClose={() => setReceiptItem(null)} onSuccess={(item, quantity) => { setReceiptItem(null); setActionSuccess(`Đã nhập thêm ${number(quantity)} sản phẩm ${item.name || item.sku || ''} vào kho.`); replenishmentResource.reload(); productsPage1.reload(); productsPage2.reload(); }} />
    </div>
  );
}
