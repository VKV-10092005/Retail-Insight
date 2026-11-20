import React, { useState } from 'react';
import { PageHeader, Card, Badge } from '../../components/ui/Elements';
import { useResource, State, Table, number, aiStatus, aiReason, params, AiResultNotice } from '../shared';
import AiOfflineCard, { isAiOfflineError } from './AiOfflineCard';
import AiFeatureGuideBanner from './AiFeatureGuideBanner';
import { ForecastBIChart, ForecastKpis, makeForecastTimeline } from './ForecastBI';
import { ChartColumnIncreasing, TrendingUp, TrendingDown, Sliders, ShieldCheck } from 'lucide-react';
import {BranchSelect,useBranch} from '../../branches/BranchContext';

export default function ForecastTotal() {
  const {activeBranchId}=useBranch();
  const today = new Date();
  const defaultOrigin = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);

  const [filters, setFilters] = useState({
    branch_id: '',
    origin: defaultOrigin
  });

  const ready = useResource('/ai/readiness');

  const queryParams = params({
    task: 'total',
    branch_id: activeBranchId,
    origin: filters.origin
  });

  const forecast = useResource(`/ai/forecast?${queryParams}`);
  const isOffline = isAiOfflineError(forecast?.error) || (!forecast?.loading && !forecast?.data && isAiOfflineError(ready?.error));

  return (
    <div className="ai-page-container">
      <PageHeader
        eyebrow="PHÂN TÍCH & TRÍ TUỆ NHÂN TẠO"
        title="Dự báo tổng nhu cầu toàn chi nhánh"
        description="Ước tính tổng sức mua toàn bộ danh mục sản phẩm và áp dụng thuật toán hiệu chỉnh xu hướng quy mô cửa hàng."
      />
      <AiFeatureGuideBanner pageKey="forecast-total">Giúp nắm bắt bức tranh tổng sức mua của cả chi nhánh theo từng ngày/tuần, hỗ trợ lên kế hoạch dòng tiền, sắp xếp nhân sự ca bán và chuẩn bị ngân sách nhập hàng tổng thể.</AiFeatureGuideBanner>

      {/* BỘ LỌC TẬP TRUNG (LOẠI BỎ CHỌN SẢN PHẨM LẺ) */}
      <Card className="ai-filters-card" style={{ marginBottom: '24px' }}>
        <div className="ai-filter-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <label className="ai-filter-item">
            <span className="ai-filter-label">1. Chi nhánh áp dụng</span>
            <BranchSelect/>
          </label>

          <label className="ai-filter-item">
            <span className="ai-filter-label">2. Kỳ dự báo gốc (Origin month)</span>
            <input
              type="month"
              className="ri-control"
              value={filters.origin}
              onChange={e => setFilters({ ...filters, origin: e.target.value })}
            />
          </label>
        </div>
      </Card>

      {/* KHI FASTAPI AI SERVICE CHƯA KHỞI ĐỘNG */}
      {isOffline && (
        <AiOfflineCard
          onRetry={() => {
            forecast?.reload();
            ready?.reload();
          }}
          loading={forecast?.loading || ready?.loading}
        />
      )}

      {/* KHI SẴN SÀNG */}
      {!isOffline && (
        <State resource={forecast}>
          {result => {
            const rows = result?.items ?? [];
            const latest = rows.length > 0 ? rows[rows.length - 1] : null;
            const previous = rows.length > 1 ? rows[rows.length - 2] : null;

            const totalForecast = latest ? Number(latest.corrected ?? latest.predicted ?? 0) : 0;
            const prevActual = previous ? Number(previous.actual ?? 0) : 0;
            const percentChange = prevActual > 0 ? ((totalForecast - prevActual) / prevActual) * 100 : null;
            const factor = latest?.factor != null ? Number(latest.factor) : 1.0;
            const historyWindow=(result?.history||[]).slice(-4);
            const forecastPoints=rows.map((row,index)=>({period:`T+${row.horizon??index+1}`,horizon:row.horizon??index+1,forecast:Number(row.corrected??row.predicted??0)}));
            const {data:chartData,meanForecast:averageForecast}=makeForecastTimeline(historyWindow,forecastPoints);

            return (
              <>
                <AiResultNotice result={result} />
                {/* 3 THẺ KPI TỔNG HỢP */}
                <ForecastKpis items={[
                  {label:'Tổng sản lượng dự báo kỳ tới',value:number(totalForecast),detail:'Toàn chi nhánh · sau hiệu chỉnh',color:'#0284C7'},
                  {label:'Trung bình mỗi kỳ',value:number(averageForecast),detail:`Hệ số hiệu chỉnh gần nhất: ${factor.toFixed(3)}x`,color:'#0EA5E9'},
                  {label:'Biến động so với kỳ trước',value:percentChange==null?'Chưa đủ 2 kỳ':`${percentChange>=0?'+':''}${percentChange.toFixed(1)}%`,detail:'So với sản lượng thực tế tháng gần nhất',color:percentChange==null?'#64748B':percentChange>=0?'#10B981':'#EF4444'}
                ]}/>

                {/* BIỂU ĐỒ XU HƯỚNG TỔNG SỨC MUA */}
                <Card style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0 }}>Xu hướng tổng sức mua toàn chi nhánh</h2>
                    <span className="forecast-average-badge">Trung bình dự báo: {number(averageForecast)} / kỳ</span>
                  </div>

                  {chartData.length > 0 ? (
                    <div style={{ width: '100%' }}>
                      <ForecastBIChart data={chartData} height={340} xKey="period"/>
                    </div>
                  ) : (
                    <p className="muted">Chưa có đủ chuỗi lịch sử bán hàng để lập biểu đồ xu hướng tổng.</p>
                  )}
                </Card>

                {/* BẢNG CHI TIẾT TỔNG NHU CẦU */}
                <Card>
                  <h2>Bảng theo dõi tổng sản lượng theo kỳ</h2>
                  <Table
                    rows={rows}
                    empty="Chưa có dữ liệu dự báo tổng."
                    columns={[
                      ["month", "Tháng / Kỳ"],
                      ["actual", "Sản lượng thực tế", r => r.actual != null ? number(r.actual) : '—'],
                      ["predicted", "Dự báo gốc", r => r.predicted != null ? number(r.predicted) : '—'],
                      ["factor", "Hệ số hiệu chỉnh", r => r.factor != null ? `${Number(r.factor).toFixed(3)}x` : '—'],
                      ["corrected", "Sản lượng sau hiệu chỉnh", r => <strong>{r.corrected != null ? number(r.corrected) : (r.predicted != null ? number(r.predicted) : '—')}</strong>]
                    ]}
                  />
                  <p className="muted" style={{ marginTop: '12px' }}>
                    * Thuật toán hiệu chỉnh tổng nhu cầu tự động điều hòa sai lệch giữa tổng dự báo từng sản phẩm và sức mua chung của chi nhánh.
                  </p>
                </Card>
              </>
            );
          }}
        </State>
      )}
    </div>
  );
}
