import React, { useState, useMemo, useEffect } from 'react';
import { PageHeader, Card, Badge } from '../../components/ui/Elements';
import { useResource, State, Table, number, money, aiStatus, aiReason, params, AiResultNotice } from '../shared';
import AiOfflineCard, { isAiOfflineError } from './AiOfflineCard';
import AiFeatureGuideBanner from './AiFeatureGuideBanner';
import { ForecastBIChart, ForecastKpis, makeForecastTimeline } from './ForecastBI';
import { BrainCircuit, Search, Package, TrendingUp, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import {BranchSelect,useBranch} from '../../branches/BranchContext';

export default function ForecastSku() {
  const {activeBranchId}=useBranch();
  const today = new Date();
  const defaultOrigin = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);

  const [filters, setFilters] = useState({
    branch_id: '',
    product_id: '',
    origin: defaultOrigin
  });
  const [skuSearch, setSkuSearch] = useState('');

  const productQuery = activeBranchId ? `&branch_id=${activeBranchId}` : '';
  const products = useResource('/products?limit=100&page=1' + productQuery);
  const productsPage2 = useResource('/products?limit=100&page=2' + productQuery);
  const ready = useResource('/ai/readiness');

  const queryParams = params({
    task: 'sku',
    branch_id: activeBranchId,
    product_id: filters.product_id,
    origin: filters.origin
  });

  const forecast = useResource(filters.product_id ? `/ai/forecast?${queryParams}` : null);

  // Lọc danh sách sản phẩm theo ô tìm kiếm
  const filteredProducts = useMemo(() => {
    const list = [...(products.data?.items ?? []), ...(productsPage2.data?.items ?? [])];
    if (!skuSearch) return list;
    const q = skuSearch.toLowerCase();
    return list.filter(p => `${p.sku} ${p.name}`.toLowerCase().includes(q));
  }, [products.data, productsPage2.data, skuSearch]);

  const selectedProduct = useMemo(() => {
    return [...(products.data?.items ?? []), ...(productsPage2.data?.items ?? [])].find(p => String(p.id) === String(filters.product_id));
  }, [products.data, productsPage2.data, filters.product_id]);

  useEffect(() => {
    if (filters.product_id || products.loading || productsPage2.loading) return;
    const list = [...(products.data?.items ?? []), ...(productsPage2.data?.items ?? [])];
    if (!list.length) return;
    const preferred = list.find(p => Number(p.total_sold ?? p.sales_count ?? p.sales ?? 0) > 0) || list[0];
    setFilters(current => current.product_id ? current : { ...current, product_id: String(preferred.id) });
  }, [filters.product_id, products.data, productsPage2.data, products.loading, productsPage2.loading]);

  const isOffline = isAiOfflineError(forecast?.error) || (!forecast?.loading && !forecast?.data && isAiOfflineError(ready?.error));

  return (
    <div className="ai-page-container">
      <PageHeader
        eyebrow="PHÂN TÍCH & TRÍ TUỆ NHÂN TẠO"
        title="Dự báo từng sản phẩm"
        description="Mô hình Hybrid 30 kết hợp GBDT và chuỗi thời gian để dự báo sản lượng bán cho từng mặt hàng cụ thể."
      />
      <AiFeatureGuideBanner pageKey="forecast-sku">Giúp chủ cửa hàng biết trước sức mua của từng mặt hàng cụ thể trong kỳ tới dựa trên dữ liệu bán hàng lịch sử, từ đó chủ động chuẩn bị hàng trước các đợt cao điểm và tránh nhập dư gây đọng vốn.</AiFeatureGuideBanner>

      {/* BỘ LỌC TẬP TRUNG */}
      <Card className="ai-filters-card" style={{ marginBottom: '24px' }}>
        {(products.error || productsPage2.error) && <p role="alert">Không tải đủ danh sách sản phẩm: {products.error || productsPage2.error}</p>}
        <div className="ai-filter-grid">
          {/* 1. Chọn Chi nhánh */}
          <label className="ai-filter-item">
            <span className="ai-filter-label">1. Chi nhánh áp dụng</span>
            <BranchSelect onChange={()=>setFilters(current=>({...current,product_id:''}))}/>
          </label>

          {/* 2. Chọn Tháng gốc (Origin) */}
          <label className="ai-filter-item">
            <span className="ai-filter-label">2. Tháng lịch sử gốc (đã chốt)</span>
            <input
              type="month"
              className="ri-control"
              value={filters.origin}
              onChange={e => setFilters({ ...filters, origin: e.target.value })}
            />
          </label>

          {/* 3. Chọn sản phẩm cụ thể */}
          <div className="ai-filter-item" style={{ gridColumn: 'span 2' }}>
            <span className="ai-filter-label">3. Chọn sản phẩm cần dự báo *</span>
            <div className="sku-picker-grid">
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--ri-muted)' }} />
                <input
                  type="text"
                  placeholder="Lọc nhanh tên hoặc mã sản phẩm..."
                  className="ri-control"
                  style={{ paddingLeft: '32px' }}
                  value={skuSearch}
                  onChange={e => setSkuSearch(e.target.value)}
                />
              </div>
              <select
                className="ri-control"
                value={filters.product_id}
                onChange={e => setFilters({ ...filters, product_id: e.target.value })}
              >
                <option value="">-- Vui lòng chọn một mã sản phẩm cần dự báo --</option>
                {filteredProducts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name} ({money(p.sale_price)})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* NẾU FASTAPI CHƯA KHỞI ĐỘNG */}
      {isOffline && (
        <AiOfflineCard
          onRetry={() => {
            forecast?.reload();
            ready?.reload();
          }}
          loading={forecast?.loading || ready?.loading}
        />
      )}

      {/* NẾU CHƯA CHỌN SẢN PHẨM */}
      {!isOffline && !filters.product_id && (
        <Card className="ai-empty-prompt-card">
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <BrainCircuit size={48} style={{ color: 'var(--ri-primary)', margin: '0 auto 12px' }} />
            <h3 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 600 }}>Chưa chọn sản phẩm dự báo</h3>
            <p style={{ color: 'var(--ri-muted)', maxWidth: '520px', margin: '0 auto' }}>
              Vui lòng chọn một mặt hàng từ danh sách sản phẩm ở bộ lọc phía trên để hệ thống nạp lịch sử xuất bán và chạy mô hình Hybrid 30.
            </p>
          </div>
        </Card>
      )}

      {/* KHI ĐÃ CHỌN SẢN PHẨM VÀ SERVICE SẴN SÀNG */}
      {!isOffline && filters.product_id && (
        <State resource={forecast}>
          {result => {
            const rows = result?.items ?? [];
            const item = rows.find(r => String(r.product_id) === String(filters.product_id) || String(r.sku) === selectedProduct?.sku) || rows[0];
            const forecastQty = item ? Number(item.quantity ?? 0) : 0;
            const currentStock = item?.stock != null ? Number(item.stock) : (selectedProduct?.stock ?? '—');
            const safetyStock = Math.ceil(forecastQty * 0.25);

            // Xây dựng chuỗi dữ liệu biểu đồ: lịch sử + điểm dự báo
            const history = result?.history ?? [];
            const historyWindow = history.slice(-4);
            const forecastPoints=item?(item.forecasts?.length?item.forecasts.map(f=>({period:`T+${f.horizon}`,horizon:f.horizon,forecast:Number(f.corrected??f.quantity??0)})):[{period:'T+1',forecast:forecastQty}]):[];
            const {data:chartData,meanForecast:averageForecast}=makeForecastTimeline(historyWindow,forecastPoints);
            const totalForecast=forecastPoints.reduce((sum,row)=>sum+Number(row.forecast||0),0);
            const latestActual=Number(historyWindow.at(-1)?.quantity||0);
            const trend=latestActual>0?((forecastQty-latestActual)/latestActual)*100:null;

            return (
              <>
                <AiResultNotice result={result} />
                {/* THẺ TÓM TẮT DỰ BÁO CỦA RIÊNG SẢN PHẨM */}
                <ForecastKpis items={[
                  {label:'Tổng sản lượng dự báo kỳ tới',value:number(totalForecast),detail:`${selectedProduct?.sku||item?.sku||''} · ${selectedProduct?.name||item?.name||'Sản phẩm đã chọn'}`,color:'#0284C7'},
                  {label:'Trung bình mỗi kỳ',value:number(averageForecast),detail:`Tồn hiện tại: ${typeof currentStock==='number'?number(currentStock):currentStock} · Tồn an toàn: ${number(safetyStock)}`,color:'#0EA5E9'},
                  {label:'Xu hướng so với thực tế gần nhất',value:trend==null?'Chưa đủ dữ liệu':`${trend>=0?'+':''}${trend.toFixed(1)}%`,detail:'So với kỳ bán thực tế gần nhất',color:trend==null?'#64748B':trend>=0?'#10B981':'#EF4444'}
                ]}/>

                {/* BIỂU ĐỒ SO SÁNH LỊCH SỬ VS. DỰ BÁO */}
                <Card style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0 }}>So sánh lịch sử bán thực tế & Điểm dự báo tháng tới</h2>
                    <span className="forecast-average-badge">Trung bình dự báo: {number(averageForecast)} / kỳ</span>
                  </div>

                  {chartData.length > 0 ? (
                    <div style={{ height: '320px', width: '100%' }}>
                      <ForecastBIChart data={chartData} height={320} xKey="period"/>
                    </div>
                  ) : (
                    <p className="muted">Chưa có lịch sử xuất bán cho sản phẩm này.</p>
                  )}
                </Card>

                {/* BẢNG THÔNG SỐ ĐỘ TIN CẬY MÔ HÌNH HYBRID 30 */}
                <Card>
                  <h2>Thông số kỹ thuật & Độ tin cậy mô hình</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', margin: '16px 0' }}>
                    <div className="ai-param-card">
                      <div className="ai-param-title">Thuật toán cốt lõi</div>
                      <div className="ai-param-value">Hybrid 30 (LightGBM + Time-Series)</div>
                      <small className="ai-param-desc">Phân tách đặc trưng danh mục và chuỗi thời gian</small>
                    </div>
                    <div className="ai-param-card">
                      <div className="ai-param-title">Cửa sổ quan sát lịch sử</div>
                      <div className="ai-param-value">Tối thiểu 6 tháng liên tục</div>
                      <small className="ai-param-desc">Không tự tạo thêm dữ liệu ảo hoặc điền số 0</small>
                    </div>
                    <div className="ai-param-card">
                      <div className="ai-param-title">Trạng thái mô hình</div>
                      <div className="ai-model-status-wrap">
                        <span className="ai-param-value" style={{ color: result?.status === 'READY' ? 'var(--ri-success)' : 'var(--ri-warning)' }}>
                          {aiStatus(result?.status)}
                        </span>
                        <small className="ai-param-desc">{aiReason(result?.reason) || 'Đạt tiêu chuẩn suy luận trên dữ liệu thực'}</small>
                      </div>
                    </div>
                  </div>
                </Card>
              </>
            );
          }}
        </State>
      )}
    </div>
  );
}
