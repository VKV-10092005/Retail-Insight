import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Badge } from '../../components/ui/Elements';
import { useResource, State, Table, number, params, AiResultNotice, vndNumber } from '../shared';
import AiOfflineCard, { isAiOfflineError } from './AiOfflineCard';
import AiFeatureGuideBanner from './AiFeatureGuideBanner';
import QuickReceiptModal from './QuickReceiptModal';
import { AlertTriangle, AlertCircle, ShieldAlert, ArrowRight, Search, CheckCircle2, PackagePlus } from 'lucide-react';
import {BranchSelect,useBranch} from '../../branches/BranchContext';
import {useAuth} from '../../auth/AuthContext';
import useAppSettings from '../../hooks/useAppSettings';

export default function StockoutAlerts() {
  const {user}=useAuth();
  const appSettings=useAppSettings(user?.id,user?.role);
  const {activeBranchId,activeBranch}=useBranch();
  const horizonDays=Number(appSettings.ai?.forecastHorizonDays)||14;
  const safetyFactor=Number(appSettings.ai?.safetyFactor)||1.5;
  const navigate = useNavigate();
  const today = new Date();
  const defaultOrigin = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);

  const [filters, setFilters] = useState({
    branch_id: '',
    risk_level: 'AT_RISK', // AT_RISK | ALL | HIGH | MEDIUM
    origin: defaultOrigin
  });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [receiptItem, setReceiptItem] = useState(null);
  const [receiptSuccess, setReceiptSuccess] = useState('');
  const pageSize = 12;

  const ready = useResource('/ai/readiness');
  const branchQuery = activeBranchId ? `&branch_id=${encodeURIComponent(activeBranchId)}` : '';
  const productsPage1 = useResource(`/products?limit=100&page=1${branchQuery}`);
  const productsPage2 = useResource(`/products?limit=100&page=2${branchQuery}`);
  const productById = useMemo(() => new Map([...(productsPage1.data?.items ?? []), ...(productsPage2.data?.items ?? [])].map(product => [String(product.id), product])), [productsPage1.data, productsPage2.data]);

  const queryParams = params({
    task: 'stockout',
    branch_id: activeBranchId,
    origin: filters.origin
  });

  const alertsResource = useResource(`/ai/forecast?${queryParams}`);
  const isOffline = isAiOfflineError(alertsResource?.error) || (!alertsResource?.loading && !alertsResource?.data && isAiOfflineError(ready?.error));

  return (
    <div className="ai-page-container">
      <PageHeader
        eyebrow="CẢNH BÁO VẬN HÀNH & TỒN KHO"
        title="Cảnh báo nguy cơ thiếu hàng"
        description="Thuật toán phát hiện sớm nguy cơ đứt gãy hàng hóa dựa trên đối chiếu tồn kho thực tế và tốc độ tiêu thụ dự báo."
      />
      <AiFeatureGuideBanner pageKey="stockout-alerts">Tự động đối chiếu tồn kho thực tế với tốc độ bán dự kiến để cảnh báo sớm những mặt hàng sắp hết trước khi kệ trống, giúp cửa hàng không bị mất doanh thu và giữ chân khách hàng quen.</AiFeatureGuideBanner>
      {receiptSuccess && <p role="status" className="op-success" style={{ marginBottom: 16 }}>{receiptSuccess}</p>}

      {/* BỘ LỌC TẬP TRUNG */}
      <Card className="ai-filters-card" style={{ marginBottom: '24px' }}>
        <div className="ai-filter-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {/* 1. Chi nhánh */}
          <label className="ai-filter-item">
            <span className="ai-filter-label">1. Chi nhánh áp dụng</span>
            <BranchSelect/>
          </label>

          {/* 2. Mức độ rủi ro */}
          <label className="ai-filter-item">
            <span className="ai-filter-label">2. Mức độ rủi ro</span>
            <select
              className="ri-control"
              value={filters.risk_level}
              onChange={e => { setFilters({ ...filters, risk_level: e.target.value }); setPage(1); }}
            >
              <option value="AT_RISK">Tất cả mặt hàng cần chú ý (Cao & Trung bình)</option>
              <option value="ALL">Tất cả mức độ nguy cơ</option>
              <option value="HIGH">Chỉ nguy cơ cao (Cần nhập gấp)</option>
              <option value="MEDIUM">Nguy cơ trung bình (Cần theo dõi)</option>
            </select>
          </label>

          {/* 3. Tìm kiếm sản phẩm */}
          <label className="ai-filter-item">
            <span className="ai-filter-label">3. Tìm mã sản phẩm / Tên sản phẩm</span>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--ri-muted)' }} />
              <input
                type="text"
                placeholder="Nhập mã hoặc tên hàng..."
                className="ri-control"
                style={{ paddingLeft: '32px' }}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </label>
        </div>
      </Card>

      {/* NẾU FASTAPI AI SERVICE CHƯA KHỞI ĐỘNG */}
      {isOffline && (
        <AiOfflineCard
          onRetry={() => {
            alertsResource?.reload();
            ready?.reload();
          }}
          loading={alertsResource?.loading || ready?.loading}
        />
      )}

      {/* KHI SẴN SÀNG */}
      {!isOffline && (
        <State resource={alertsResource}>
          {result => {
            const rawRows = result?.items ?? [];

            // Chuẩn hóa và tính toán mức độ nguy cơ
            const parsedRows = rawRows.map(r => {
              const prob = Number(r.probability ?? 0);
              const stock = Number(r.stock);
              const predicted = Number(r.predicted ?? r.quantity);
              const minStock = Number(r.min_stock);
              const days = Number(r.days_of_supply);
              const hasStock = r.stock != null && Number.isFinite(stock);
              const belowMin = r.below_min_stock === true || (hasStock && r.min_stock != null && stock < minStock);
              const demandShortfall = hasStock && Number.isFinite(predicted) && stock < predicted;
              const riskWindow=horizonDays*(safetyFactor/1.5);
              const shortSupply = r.days_of_supply != null && Number.isFinite(days) && days <= riskWindow;
              const isHigh = belowMin || (hasStock && stock <= 0) || (shortSupply && days <= riskWindow/2);
              const isMedium = !isHigh && (demandShortfall || shortSupply);
              return {
                ...r,
                probValue: prob,
                level: isHigh ? 'HIGH' : isMedium ? 'MEDIUM' : 'LOW'
              };
            });

            // Lọc theo bộ lọc rủi ro & tìm kiếm
            const filteredRows = parsedRows.filter(r => {
              if (filters.risk_level === 'AT_RISK' && r.level === 'LOW') return false;
              if (filters.risk_level === 'HIGH' && r.level !== 'HIGH') return false;
              if (filters.risk_level === 'MEDIUM' && r.level !== 'MEDIUM') return false;
              if (search) {
                const q = search.toLowerCase();
                const skuMatch = String(r.sku || r.product_id || '').toLowerCase().includes(q);
                const nameMatch = String(r.name || '').toLowerCase().includes(q);
                if (!skuMatch && !nameMatch) return false;
              }
              return true;
            }).sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.level] - { HIGH: 0, MEDIUM: 1, LOW: 2 }[b.level]));
            const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
            const currentPage = Math.min(page, pageCount);
            const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

            const highCount = parsedRows.filter(r => r.level === 'HIGH').length;
            const mediumCount = parsedRows.filter(r => r.level === 'MEDIUM').length;
            const totalAlerts = highCount + mediumCount;

            return (
              <>
                <AiResultNotice result={result} partialText={result?.status==='PARTIAL'?'Mô hình xác suất chưa sẵn sàng; danh sách dựa trên tồn kho, mức tồn tối thiểu và ngày tồn kho còn lại.':undefined} />
                {/* 3 THẺ ĐẾM SỐ LƯỢNG MÃ HÀNG CẢNH BÁO */}
                <div className="stat-grid" style={{ marginBottom: '24px' }}>
                  <Card className="stat">
                    <div className="stat-top">Tổng mặt hàng cần chú ý</div>
                    <strong style={{ fontSize: '1.85rem', color: totalAlerts > 0 ? 'var(--ri-danger)' : 'var(--ri-success)' }}>
                      {totalAlerts} sản phẩm
                    </strong>
                    <small>{totalAlerts > 0 ? 'Có nguy cơ đứt hàng trong kỳ tới' : <><CheckCircle2 size={14} aria-hidden="true"/> Tồn kho đảm bảo an toàn</>}</small>
                  </Card>

                  <Card className="stat" style={{ borderLeft: '4px solid var(--ri-danger)' }}>
                    <div className="stat-top">Nguy cơ cao (Cần nhập gấp)</div>
                    <strong style={{ fontSize: '1.85rem', color: 'var(--ri-danger)' }}>
                      {highCount} sản phẩm
                    </strong>
                    <small>Xác suất đứt hàng &gt; 65%</small>
                  </Card>

                  <Card className="stat" style={{ borderLeft: '4px solid var(--ri-warning)' }}>
                    <div className="stat-top">Nguy cơ trung bình (Theo dõi)</div>
                    <strong style={{ fontSize: '1.85rem', color: 'var(--ri-warning)' }}>
                      {mediumCount} sản phẩm
                    </strong>
                    <small>Cần lên kế hoạch bổ sung sớm</small>
                  </Card>
                </div>

                {/* BẢNG DANH SÁCH CẢNH BÁO */}
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <h2 style={{ margin: 0 }}>Danh sách mặt hàng có nguy cơ thiếu tồn kho</h2>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => navigate('/receipts')}
                    >
                      <PackagePlus size={16} /> Mở màn hình Nhập hàng
                    </button>
                  </div>

                  <Table
                    rows={pageRows}
                    empty="Không có mã hàng nào trong diện cảnh báo theo bộ lọc đã chọn."
                    columns={[
                      ["sku", "Mã sản phẩm", r => <strong>{r.sku || `#${r.product_id}`}</strong>],
                      ["name", "Tên sản phẩm", r => r.name || `Sản phẩm #${r.product_id}`],
                      ["stock", "Tồn hiện tại", r => (
                        <span style={{ fontWeight: 600, color: (r.stock ?? 0) <= 0 ? 'var(--ri-danger)' : 'inherit' }}>
                          {r.stock != null ? number(r.stock) : '—'}
                        </span>
                      )],
                      ["predicted", "Nhu cầu dự báo", r => r.predicted != null ? number(r.predicted) : (r.quantity != null ? number(r.quantity) : '—')],
                      ["min_stock", "Mức tồn tối thiểu", r => r.min_stock != null ? number(r.min_stock) : '—'],
                      ["days_of_supply", "Ngày tồn kho còn lại", r => r.days_of_supply != null ? `${number(r.days_of_supply)} ngày` : 'Chưa đủ lịch sử bán'],
                      [
                        "level",
                        "Mức độ rủi ro",
                        r => (
                          r.level === 'HIGH' ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'var(--ri-danger-bg)',
                              color: 'var(--ri-danger)',
                              padding: '4px 10px',
                              borderRadius: '20px',
                              fontSize: '0.8rem',
                              fontWeight: 700
                            }}>
                              <AlertCircle size={14} /> Nguy cơ cao
                            </span>
                           ) : r.level === 'MEDIUM' ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'var(--ri-warning-bg)',
                              color: 'var(--ri-warning)',
                              padding: '4px 10px',
                              borderRadius: '20px',
                              fontSize: '0.8rem',
                              fontWeight: 700
                            }}>
                              <AlertTriangle size={14} /> Trung bình
                            </span>
                          ) : <span style={{ color: 'var(--ri-success)', fontWeight: 700 }}>An toàn</span>
                        )
                      ],
                      [
                        "prob",
                        "Xác suất đứt hàng",
                        r => <strong>{r.probability == null ? (r.method === 'MIN_STOCK_AND_DAYS_OF_SUPPLY' ? 'Theo mức tồn tối thiểu / ngày tồn' : '—') : `${(r.probValue * 100).toFixed(1)}%`}</strong>
                      ],
                      [
                        "action",
                        "Thao tác",
                        r => (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => { setReceiptSuccess(''); const product=productById.get(String(r.product_id)); const costPrice=product?.cost_price??r.cost_price; setReceiptItem({ ...r, costPrice:costPrice==null?null:vndNumber(costPrice), source: 'cảnh báo thiếu hàng' }); }}
                          >
                            Nhập hàng <ArrowRight size={14} style={{ display: 'inline', marginLeft: '4px' }} />
                          </button>
                        )
                      ]
                    ]}
                  />

                  <div className="pagination" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}><span>Trang {currentPage} / {pageCount} · {filteredRows.length} mặt hàng</span><div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn btn-secondary btn-sm" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Trước</button><button type="button" className="btn btn-secondary btn-sm" disabled={currentPage >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Sau</button></div></div>
                  <p className="muted" style={{ marginTop: '14px' }}>
                    * Thuật toán đối chiếu tồn kho đầu kỳ và dự báo nhu cầu phát sinh để cảnh báo sớm trước khi xảy ra tình trạng hết hàng tại quầy.
                  </p>
                </Card>
              </>
            );
          }}
        </State>
      )}
      <QuickReceiptModal item={receiptItem} branchId={activeBranchId} branchName={activeBranch?.name} onClose={() => setReceiptItem(null)} onSuccess={(item, quantity) => { setReceiptItem(null); setReceiptSuccess(`Đã nhập thêm ${number(quantity)} sản phẩm ${item.name || item.sku || ''} vào kho.`); alertsResource.reload(); }} />
    </div>
  );
}


