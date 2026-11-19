import React from 'react';
import {Bot,RefreshCw,CheckCircle2,Terminal} from 'lucide-react';
import {Card} from '../../components/ui/Elements';

export function isAiOfflineError(error) {
  if (!error) return false;
  const msg = String(error).toLowerCase();
  return (
    msg.includes('không kết nối được ai service') ||
    msg.includes('dịch vụ không khả dụng') ||
    msg.includes('503') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('ai_service_token') ||
    msg.includes('econnrefused')
  );
}

export default function AiOfflineCard({onRetry, loading = false, serviceName = "Dịch vụ phân tích AI"}) {
  return (
    <Card className="ai-offline-card">
      <div className="ai-offline-header">
        <div className="ai-offline-icon-box">
          <Bot size={36} className="ai-offline-icon" />
        </div>
        <div className="ai-offline-header-content">
          <div className="ai-offline-badge">
            <span className="ai-status-pulse"></span>
            <span>FastAPI Microservice (Cổng 8000) · Chờ kết nối</span>
          </div>
          <h2 className="ai-offline-title">Dịch vụ AI đang chờ kết nối</h2>
          <p className="ai-offline-desc">
            Dịch vụ AI (FastAPI cổng 8000) hiện chưa khởi động hoặc mô hình đang chờ dữ liệu bán hàng thực tế.
            Các nghiệp vụ bán hàng tại quầy, quản lý kho chi nhánh và báo cáo nội bộ vẫn hoạt động hoàn toàn bình thường trên MySQL.
          </p>
        </div>
      </div>

      <div className="ai-offline-instruction-box">
        <div className="ai-instruction-header">
          <Terminal size={16} />
          <span>Lệnh khởi động dịch vụ AI (mở terminal mới):</span>
        </div>
        <div className="ai-command-snippet">
          <code>uvicorn app:app --port 8000</code>
        </div>
        <div className="ai-instruction-notes">
          <span><CheckCircle2 size={14} style={{display:'inline',marginRight:'4px',color:'var(--ri-success)'}}/> Độc lập dữ liệu: Không ảnh hưởng đến hóa đơn và tồn kho thực tế.</span>
        </div>
      </div>

      <div className="ai-offline-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onRetry}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'ri-spin' : ''} />
          {loading ? 'Đang kiểm tra...' : 'Kiểm tra kết nối lại'}
        </button>
      </div>
    </Card>
  );
}
