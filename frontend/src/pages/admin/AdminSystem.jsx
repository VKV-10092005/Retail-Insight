import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  ShieldAlert,
  XCircle,
  Wrench,
  Sparkles,
  Zap,
  X
} from 'lucide-react';
import './AdminSystem.css';
import { apiUrl } from '../../services/apiUrl';
import { ADMIN_PATHS } from '../../config/roles';

function request(url, opts = {}) {
  return fetch(apiUrl(url), {
    credentials: 'include',
    headers: { 'X-Requested-With': 'retail-web', ...(opts.headers || {}) },
    ...opts
  }).then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || response.statusText);
    return data;
  });
}

const number = value => Number(value || 0).toLocaleString('vi-VN');
const mb = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' MB';
const formatUptime = value => {
  const seconds = Math.max(0, Number(value) || 0),
    days = Math.floor(seconds / 86400),
    hours = Math.floor(seconds % 86400 / 3600),
    minutes = Math.floor(seconds % 3600 / 60);
  return [days ? days + ' ngày' : '', hours ? hours + ' giờ' : '', minutes ? minutes + ' phút' : ''].filter(Boolean).join(' ') || 'Dưới 1 phút';
};

function State({ status }) {
  const ok = status === 'ok' || status === 'ACTIVE' || status === 'READY',
    degraded = status === 'degraded';
  const unavailable = status === 'NOT_CONFIGURED' || status === 'STOPPED' || status === 'UNAVAILABLE';
  const label = ok
    ? 'Hoạt động'
    : status === 'NOT_CONFIGURED'
    ? 'Chưa cấu hình'
    : status === 'UNAVAILABLE'
    ? 'Đang ngủ / chưa phản hồi'
    : status === 'STOPPED'
    ? 'Đã dừng'
    : degraded
    ? 'Có dịch vụ cần kiểm tra'
    : status === 'UNKNOWN'
    ? 'Chưa xác định'
    : 'Ngoại tuyến';
  return (
    <span className={'system-state ' + (ok ? 'ok' : unavailable ? 'muted' : degraded ? 'warn' : 'error')}>
      {ok ? <CheckCircle2 size={14} /> : unavailable || degraded ? <AlertTriangle size={14} /> : <XCircle size={14} />} {label}
    </span>
  );
}

function Progress({ value, color }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="system-progress">
      <span style={{ width: percent + '%', background: color || '#0284C7' }} />
    </div>
  );
}

function ServiceCard({ icon: Icon, title, status, latency, message, actions, children }) {
  return (
    <article className="system-card system-service-card">
      <div className="system-card-top">
        <span className="system-service-icon">
          <Icon size={19} />
        </span>
        <span className="system-latency">{latency === null || latency === undefined ? '—' : number(latency) + ' ms'}</span>
      </div>
      <h2>{title}</h2>
      <State status={status} />
      {message && <p className="system-health-message">{message}</p>}
      <div className="system-card-stats">{children}</div>
      {actions && <div className="system-card-actions">{actions}</div>}
    </article>
  );
}

export default function AdminSystem() {
  const [health, setHealth] = useState(null),
    [loading, setLoading] = useState(true),
    [err, setErr] = useState(null),
    [lastChecked, setLastChecked] = useState(null),
    [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem('admin.system.autoRefresh') === 'true'),
    [history, setHistory] = useState([]);

  const [healingTarget, setHealingTarget] = useState(null);
  const [diagnosingTarget, setDiagnosingTarget] = useState(null);
  const [healBanner, setHealBanner] = useState(null);
  const [diagnosticModal, setDiagnosticModal] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const started = performance.now();
    try {
      if (!quiet) setLoading(true);
      setErr(null);
      const data = await request('/platform/system-health');
      const checkedAt = new Date();
      data.client_latency_ms = Number((performance.now() - started).toFixed(2));
      setHealth(data);
      setLastChecked(checkedAt);
      setHistory(rows => [{ checkedAt, data }, ...rows].slice(0, 8));
    } catch (error) {
      const checkedAt = new Date();
      setErr(error.message);
      setLastChecked(checkedAt);
      const failed = {
        mysql: { status: 'error', latency_ms: null },
        backend: { status: 'error', latency_ms: Number((performance.now() - started).toFixed(2)) },
        fastapi: { status: 'error', latency_ms: null }
      };
      setHistory(rows => [{ checkedAt, data: failed }, ...rows].slice(0, 8));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    localStorage.setItem('admin.system.autoRefresh', String(autoRefresh));
  }, [autoRefresh]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => void load({ quiet: true }), 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const handleAutoHeal = async target => {
    if (healingTarget || loading) return;
    setHealingTarget(target);
    setHealBanner(null);
    try {
      const res = await request('/platform/auto-heal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      setHealBanner({
        type: res.success ? 'success' : 'warn',
        message: res.message || 'Thao tác tự động khắc phục hoàn tất.'
      });
      await load({ quiet: true });
    } catch (error) {
      setHealBanner({
        type: 'error',
        message: `Khắc phục thất bại: ${error.message || 'Lỗi kết nối'}`
      });
    } finally {
      setHealingTarget(null);
    }
  };

  const handleDiagnose = async target => {
    if (diagnosingTarget) return;
    setDiagnosingTarget(target);
    try {
      const res = await request('/platform/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      setDiagnosticModal(res);
    } catch (error) {
      setHealBanner({
        type: 'error',
        message: `Chẩn đoán thất bại: ${error.message || 'Không thể lấy thông số'}`
      });
    } finally {
      setDiagnosingTarget(null);
    }
  };

  const overall = health && health.mysql.status === 'ok' && health.backend.status === 'ok' && health.fastapi.status === 'ok' ? 'ok' : 'degraded';
  const tasks = health?.scheduler_tasks || [],
    activeTasks = tasks.filter(task => task.status === 'ACTIVE').length;
  const usedMemory = health?.host?.used_memory_percent || 0;
  const ramLabel = health?.host ? number(health.host.used_memory_mb / 1024) + ' GB / ' + number(health.host.total_memory_mb / 1024) + ' GB' : '—';
  const modelStatuses = health?.fastapi?.models || [];

  const isAiDegraded = health?.fastapi?.status !== 'ok' || (health?.fastapi?.latency_ms && health.fastapi.latency_ms > 3000);

  return (
    <div className="page-wrapper system-page">
      <div className="page-header system-page-header">
        <div>
          <span className="system-eyebrow">
            <Activity size={14} /> PLATFORM OPERATIONS
          </span>
          <h1 className="page-title">Giám sát Hệ thống</h1>
          <p className="page-subtitle">
            Theo dõi sức khỏe dịch vụ, dữ liệu và tài nguyên máy chủ
            {lastChecked ? ' · Kiểm tra lúc ' + lastChecked.toLocaleTimeString('vi-VN') : ''}
          </p>
        </div>
        <div className="system-header-actions">
          <label className="system-auto-toggle">
            <input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} />
            <span className="system-switch" />
            <span>Tự động làm mới mỗi 30 giây</span>
          </label>
          <button
            type="button"
            className="ri-btn ri-btn-secondary system-diagnose-header-btn"
            onClick={() => handleDiagnose('system')}
            disabled={diagnosingTarget === 'system'}
          >
            <Sparkles size={16} className={diagnosingTarget === 'system' ? 'system-spin' : ''} />
            <span>{diagnosingTarget === 'system' ? 'Đang phân tích...' : 'AI Chẩn đoán Toàn diện'}</span>
          </button>
          <Link to={ADMIN_PATHS.SECURITY} className="ri-btn ri-btn-secondary system-security-link">
            <ShieldAlert size={16} /> Quản lý an ninh
          </Link>
          <button className="ri-btn ri-btn-primary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'system-spin' : ''} />
            {loading ? 'Đang kiểm tra...' : 'Kiểm tra lại'}
          </button>
        </div>
      </div>

      {healBanner && (
        <div className={`system-banner ${healBanner.type}`}>
          <div className="system-banner-content">
            {healBanner.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{healBanner.message}</span>
          </div>
          <button type="button" className="system-banner-close" onClick={() => setHealBanner(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {err && (
        <div className="op-state system-error" role="alert">
          {err}
        </div>
      )}
      {loading && !health && (
        <div className="op-state" role="status">
          Đang thu thập chỉ số hạ tầng...
        </div>
      )}
      {health && (
        <>
          <div className="system-overview">
            <div>
              <span className="system-overview-label">TRẠNG THÁI TOÀN HỆ THỐNG</span>
              <div className="system-overview-status">
                <State status={overall} />
                <span>
                  retail_app · {health.backend.node_version}
                </span>
              </div>
            </div>
            <div className="system-overview-meta">
              <span>
                <Server size={15} /> {health.host.cpu_cores} lõi CPU
              </span>
              <span>
                <Activity size={15} /> Tải hệ thống {health.host.loadavg.map(value => Number(value).toFixed(2)).join(' / ')}
              </span>
            </div>
          </div>

          <section className="system-section">
            <div className="system-section-heading">
              <div>
                <span className="system-eyebrow">SERVICE HEALTH</span>
                <h2>Dịch vụ nền tảng</h2>
              </div>
              <span className="system-section-note">Cơ chế Tự phục hồi 1 chạm & AI Chẩn đoán sự cố</span>
            </div>
            <div className="system-service-grid">
              <ServiceCard
                icon={Database}
                title="MySQL Database"
                status={health.mysql.status}
                latency={health.mysql.latency_ms}
                actions={
                  <>
                    <button
                      type="button"
                      className="system-action-btn heal-btn"
                      onClick={() => handleAutoHeal('database')}
                      disabled={healingTarget === 'database'}
                    >
                      <Wrench size={13} className={healingTarget === 'database' ? 'system-spin' : ''} />
                      <span>{healingTarget === 'database' ? 'Đang làm mới...' : 'Tự động khắc phục'}</span>
                    </button>
                    <button
                      type="button"
                      className="system-action-btn diag-btn"
                      onClick={() => handleDiagnose('database')}
                      disabled={diagnosingTarget === 'database'}
                    >
                      <Sparkles size={13} className={diagnosingTarget === 'database' ? 'system-spin' : ''} />
                      <span>{diagnosingTarget === 'database' ? 'Đang phân tích...' : 'AI Phân tích'}</span>
                    </button>
                  </>
                }
              >
                <div>
                  <span>Kết nối hiện tại</span>
                  <strong>{number(health.mysql.threads_connected)} Threads</strong>
                </div>
                <div>
                  <span>Dung lượng lưu trữ</span>
                  <strong>{number(health.mysql.storage_mb)} MB</strong>
                </div>
                <div>
                  <span>Hóa đơn · Sản phẩm</span>
                  <strong>
                    {number(health.mysql.invoice_count)} · {number(health.mysql.product_count)}
                  </strong>
                </div>
              </ServiceCard>

              <ServiceCard
                icon={Server}
                title="Backend API"
                status={health.backend.status}
                latency={health.backend.latency_ms}
                actions={
                  <>
                    <button
                      type="button"
                      className="system-action-btn heal-btn"
                      onClick={() => handleAutoHeal('backend')}
                      disabled={healingTarget === 'backend'}
                    >
                      <Wrench size={13} className={healingTarget === 'backend' ? 'system-spin' : ''} />
                      <span>{healingTarget === 'backend' ? 'Đang tối ưu...' : 'Tự động khắc phục'}</span>
                    </button>
                    <button
                      type="button"
                      className="system-action-btn diag-btn"
                      onClick={() => handleDiagnose('backend')}
                      disabled={diagnosingTarget === 'backend'}
                    >
                      <Sparkles size={13} className={diagnosingTarget === 'backend' ? 'system-spin' : ''} />
                      <span>{diagnosingTarget === 'backend' ? 'Đang phân tích...' : 'AI Phân tích'}</span>
                    </button>
                  </>
                }
              >
                <div>
                  <span>Thời gian hoạt động</span>
                  <strong>{formatUptime(health.backend.uptime_seconds)}</strong>
                </div>
                <div>
                  <span>RAM tiến trình</span>
                  <strong>
                    {mb(health.backend.memory_rss_mb)} RSS · {mb(health.backend.heap_used_mb)} Heap
                  </strong>
                </div>
                <div>
                  <span>Scheduler tổng kết</span>
                  <strong>{health.backend.scheduler.active ? 'Đang hoạt động' : 'Đã dừng'}</strong>
                </div>
              </ServiceCard>

              <ServiceCard
                icon={Activity}
                title="AI Service · FastAPI"
                status={health.fastapi.status}
                latency={health.fastapi.latency_ms}
                message={health.fastapi.message}
                actions={
                  <>
                    <button
                      type="button"
                      className={`system-action-btn heal-btn ${isAiDegraded ? 'urgent' : ''}`}
                      onClick={() => handleAutoHeal('ai_service')}
                      disabled={healingTarget === 'ai_service'}
                    >
                      <Zap size={13} className={healingTarget === 'ai_service' ? 'system-spin' : ''} />
                      <span>
                        {healingTarget === 'ai_service'
                          ? 'Đang gửi warm-up...'
                          : isAiDegraded
                          ? 'Đánh thức & Khắc phục'
                          : 'Tự động khắc phục'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="system-action-btn diag-btn"
                      onClick={() => handleDiagnose('ai_service')}
                      disabled={diagnosingTarget === 'ai_service'}
                    >
                      <Sparkles size={13} className={diagnosingTarget === 'ai_service' ? 'system-spin' : ''} />
                      <span>{diagnosingTarget === 'ai_service' ? 'Đang phân tích...' : 'AI Phân tích'}</span>
                    </button>
                  </>
                }
              >
                <div className="system-model-list">
                  <span>Mô hình / thuật toán sẵn sàng</span>
                  {modelStatuses.length ? (
                    modelStatuses.map(model => (
                      <span key={model.name} className="system-model-item">
                        <State status={model.status} />
                        <strong>{model.name}</strong>
                      </span>
                    ))
                  ) : (
                    <strong>{health.fastapi.status === 'ok' ? 'Không lấy được readiness' : 'Chưa kết nối AI Service'}</strong>
                  )}
                </div>
                <div>
                  <span>Thời điểm ping</span>
                  <strong>{health.fastapi.latency_ms === null ? '—' : number(health.fastapi.latency_ms) + ' ms'}</strong>
                </div>
              </ServiceCard>
            </div>
          </section>

          <section className="system-section">
            <div className="system-section-heading">
              <div>
                <span className="system-eyebrow">HOST & OPERATIONS</span>
                <h2>Tài nguyên Máy chủ & Hiệu năng Vận hành</h2>
              </div>
            </div>
            <div className="system-resource-grid">
              <article className="system-card system-resource-card">
                <div className="system-resource-title">
                  <span className="system-service-icon">
                    <HardDrive size={18} />
                  </span>
                  <div>
                    <h3>Bộ nhớ RAM máy chủ</h3>
                    <span>Host operating system</span>
                  </div>
                </div>
                <div className="system-resource-value">
                  <strong>{ramLabel}</strong>
                  <b>{number(usedMemory)}%</b>
                </div>
                <Progress value={usedMemory} color={usedMemory > 85 ? '#EF4444' : '#0284C7'} />
                <div className="system-card-foot">
                  <span>Đang dùng {number(health.host.used_memory_mb / 1024)} GB</span>
                  <span>{health.host.cpu_cores} nhân CPU</span>
                </div>
              </article>

              <article className="system-card system-resource-card">
                <div className="system-resource-title">
                  <span className="system-service-icon">
                    <Database size={18} />
                  </span>
                  <div>
                    <h3>Dung lượng Cơ sở dữ liệu</h3>
                    <span>Chỉ số database retail_app · thang hiển thị 1 GB</span>
                  </div>
                </div>
                <div className="system-resource-value">
                  <strong>{number(health.mysql.storage_mb)} MB</strong>
                  <b>{number(health.mysql.table_count)} bảng</b>
                </div>
                <Progress
                  value={health.mysql.storage_mb ? Math.min(100, (health.mysql.storage_mb / 1024) * 100) : 0}
                  color="#0EA5E9"
                />
                <div className="system-card-foot">
                  <span>{number(health.mysql.transaction_count)} giao dịch</span>
                  <span>
                    {number(health.mysql.invoice_count)} hóa đơn · {number(health.mysql.product_count)} sản phẩm
                  </span>
                </div>
              </article>

              <article className="system-card system-resource-card">
                <div className="system-resource-title">
                  <span className="system-service-icon">
                    <Cpu size={18} />
                  </span>
                  <div>
                    <h3>Độ sẵn sàng dịch vụ</h3>
                    <span>SLA & tác vụ tự động</span>
                  </div>
                </div>
                <div className="system-resource-value">
                  <strong>
                    {activeTasks}/{tasks.length} tác vụ hoạt động
                  </strong>
                  <b>{tasks.length ? Math.round((activeTasks / tasks.length) * 100) : 0}%</b>
                </div>
                <Progress
                  value={tasks.length ? (activeTasks / tasks.length) * 100 : 0}
                  color={activeTasks === tasks.length ? '#10B981' : '#F59E0B'}
                />
                <div className="system-task-list">
                  {tasks.map(task => (
                    <div key={task.name}>
                      <span title={task.detail}>{task.name}</span>
                      <State status={task.status} />
                    </div>
                  ))}
                </div>
                <div className="system-card-actions system-task-actions">
                  <button
                    type="button"
                    className="system-action-btn heal-btn"
                    onClick={() => handleAutoHeal('background_jobs')}
                    disabled={healingTarget === 'background_jobs'}
                  >
                    <Wrench size={13} className={healingTarget === 'background_jobs' ? 'system-spin' : ''} />
                    <span>
                      {healingTarget === 'background_jobs'
                        ? 'Đang kích hoạt...'
                        : activeTasks < tasks.length
                        ? 'Kích hoạt tác vụ (100%)'
                        : 'Tự động kiểm tra'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="system-action-btn diag-btn"
                    onClick={() => handleDiagnose('background_jobs')}
                    disabled={diagnosingTarget === 'background_jobs'}
                  >
                    <Sparkles size={13} className={diagnosingTarget === 'background_jobs' ? 'system-spin' : ''} />
                    <span>{diagnosingTarget === 'background_jobs' ? 'Đang phân tích...' : 'AI Phân tích'}</span>
                  </button>
                </div>
              </article>
            </div>
          </section>

          <section className="system-section system-history-section">
            <div className="system-section-heading">
              <div>
                <span className="system-eyebrow">SESSION HISTORY</span>
                <h2>Lịch sử kiểm tra sức khỏe phiên làm việc</h2>
              </div>
              <span className="system-section-note">Lưu tối đa 8 lần kiểm tra trong phiên này</span>
            </div>
            <div className="system-card system-history-card">
              <div className="system-table-scroll">
                <table className="system-history-table">
                  <thead>
                    <tr>
                      <th>Thời điểm</th>
                      <th>MySQL</th>
                      <th>Backend</th>
                      <th>AI Service</th>
                      <th>Trạng thái chung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry, index) => {
                      const good =
                        entry.data.mysql.status === 'ok' &&
                        entry.data.backend.status === 'ok' &&
                        entry.data.fastapi.status === 'ok';
                      return (
                        <tr key={entry.checkedAt.toISOString() + index}>
                          <td>{entry.checkedAt.toLocaleString('vi-VN')}</td>
                          <td>{entry.data.mysql.latency_ms === null ? '—' : number(entry.data.mysql.latency_ms) + ' ms'}</td>
                          <td>{entry.data.backend.latency_ms === null ? '—' : number(entry.data.backend.latency_ms) + ' ms'}</td>
                          <td>{entry.data.fastapi.latency_ms === null ? '—' : number(entry.data.fastapi.latency_ms) + ' ms'}</td>
                          <td>
                            <State status={good ? 'ok' : 'degraded'} />
                          </td>
                        </tr>
                      );
                    })}
                    {!history.length && (
                      <tr>
                        <td colSpan="5" className="system-empty">
                          Chưa có lịch sử kiểm tra.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Modal AI Chẩn đoán sự cố */}
      {diagnosticModal && (
        <div className="system-modal-backdrop" onClick={() => setDiagnosticModal(null)}>
          <div className="system-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="system-modal-header">
              <div className="system-modal-title-wrap">
                <span className={`system-modal-sparkle ${diagnosticModal.status || 'ok'}`}>
                  <Sparkles size={18} />
                </span>
                <div>
                  <h3>{diagnosticModal.title || 'Báo cáo AI Chẩn đoán Sức khỏe'}</h3>
                  <span className="system-modal-subtitle">Trí tuệ nhân tạo Retail Insight · Phân tích thời gian thực</span>
                </div>
              </div>
              <button
                type="button"
                className="system-modal-close"
                onClick={() => setDiagnosticModal(null)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="system-modal-body">
              <div className="system-diag-block root-cause">
                <h4>
                  <span className="diag-icon">🔍</span> Nguyên nhân gốc rễ (Root Cause)
                </h4>
                <p>{diagnosticModal.root_cause}</p>
              </div>

              <div className="system-diag-block impact">
                <h4>
                  <span className="diag-icon">⚠️</span> Mức độ ảnh hưởng (Impact Assessment)
                </h4>
                <p>{diagnosticModal.impact}</p>
              </div>

              <div className="system-diag-block recommendations">
                <h4>
                  <span className="diag-icon">💡</span> Khuyến nghị tối ưu (Actionable Recommendations)
                </h4>
                <ul>
                  {diagnosticModal.recommendations?.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="system-modal-footer">
              {diagnosticModal.can_auto_heal && diagnosticModal.target !== 'system' && (
                <button
                  type="button"
                  className="ri-btn ri-btn-primary system-modal-heal-btn"
                  onClick={() => {
                    const tgt = diagnosticModal.target;
                    setDiagnosticModal(null);
                    void handleAutoHeal(tgt);
                  }}
                >
                  <Wrench size={15} />
                  <span>Tự động khắc phục ngay</span>
                </button>
              )}
              <button
                type="button"
                className="ri-btn ri-btn-secondary"
                onClick={() => setDiagnosticModal(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
