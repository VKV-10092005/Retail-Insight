import React, { useState, useEffect } from 'react';
import {apiUrl} from '../../services/apiUrl';
import './AdminSecurity.css';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  AlertTriangle,
  Search,
  RefreshCw,
  Clock,
  Eye,
  Bell,
  CheckCircle2,
  X,
  UserCheck,
  UserX,
} from 'lucide-react';

function request(url, opts = {}) {
  return fetch(apiUrl(url), {
    credentials: 'include',
    headers: { 'X-Requested-With': 'retail-web', 'Content-Type': 'application/json' },
    ...opts,
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || r.statusText);
    return d;
  });
}

function formatDate(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const SEVERITY_COLORS = {
  CRITICAL: { bg: '#FEF2F2', border: '#EF4444', text: '#B91C1C' },
  HIGH: { bg: '#FFF7ED', border: '#F97316', text: '#C2410C' },
  MEDIUM: { bg: '#FEFCE8', border: '#EAB308', text: '#854D0E' },
  LOW: { bg: '#F0FDF4', border: '#22C55E', text: '#15803D' },
};

const STATUS_LABELS = {
  SUCCESS: 'Thành công',
  BLOCKED: 'Đã chặn',
  TEMPORARILY_LOCKED: 'Tạm khóa',
  DETECTED: 'Phát hiện',
  RESOLVED: 'Đã xử lý / Mở khóa',
};

const SEVERITY_LABELS = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng',
};

const EVENT_TYPE_LABELS = {
  LOGIN_CONFIRMED: 'Xác nhận đăng nhập',
  AI_PROMPT_INJECTION_BLOCKED: 'Chặn tiêm nhiễm lệnh AI',
  AI_INPUT_TOO_LONG: 'Nội dung gửi AI quá dài',
  AI_SENSITIVE_DATA_REQUEST: 'Yêu cầu dữ liệu nhạy cảm',
  AI_PRIVILEGE_ESCALATION_BLOCKED: 'Chặn leo thang đặc quyền',
  AI_UNAUTHORIZED_CROSS_TENANT_ACCESS: 'Chặn truy cập trái phép giữa các tổ chức',
  AI_MALICIOUS_SQL_BLOCKED: 'Chặn câu lệnh SQL nguy hiểm',
  AI_RATE_LIMIT_EXCEEDED: 'Vượt giới hạn yêu cầu AI',
  ADMIN_UNLOCKED_USER: 'Quản trị viên mở khóa tài khoản',
  IMPERSONATE_STAFF: 'Đăng nhập thay nhân viên',
  SALE_RETURN: 'Hoàn trả đơn bán hàng',
  BANK_PAYMENT_WEBHOOK: 'Thông báo thanh toán ngân hàng',
  SALE_PAYMENT_CONFIRMED: 'Xác nhận thanh toán đơn hàng',
};

const eventTypeLabel = (value) => EVENT_TYPE_LABELS[value] || value || '—';

export default function AdminSecurity() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [userHistory, setUserHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  async function loadData(page = 1) {
    try {
      setLoading(true);
      setErr(null);

      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search.trim()) params.append('search', search.trim());
      if (severityFilter) params.append('severity', severityFilter);
      if (statusFilter) params.append('status', statusFilter);

      const results = await Promise.allSettled([
        request('/platform/security/stats'),
        request(`/platform/security/logs?${params.toString()}`),
        request('/platform/security/notifications'),
      ]);
      const [statsData,logsData,notifsData]=results;
      if(statsData.status==='fulfilled')setStats(statsData.value);
      if(logsData.status==='fulfilled'){setLogs(logsData.value.logs||[]);setPagination(logsData.value.pagination||{page:1,limit:15,total:0,totalPages:1});}
      if(notifsData.status==='fulfilled')setNotifications(notifsData.value.notifications||[]);
      const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(1);
  }, [severityFilter, statusFilter]);

  function handleSearch(e) {
    e.preventDefault();
    loadData(1);
  }

  async function viewUserHistory(userId) {
    if (!userId) return;
    try {
      setLoadingHistory(true);
      const data = await request(`/platform/security/users/${userId}/history`);
      setUserHistory(data);
    } catch (e) {
      alert(`Lỗi khi lấy lịch sử người dùng: ${e.message}`);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleUnlockSubmit(e) {
    e.preventDefault();
    if (!unlockTarget || !unlockReason.trim()) return;

    try {
      setUnlocking(true);
      await request(`/platform/security/users/${unlockTarget.id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ reason: unlockReason.trim() }),
      });

      alert(`Đã mở khóa thành công cho tài khoản ${unlockTarget.full_name || unlockTarget.email}!`);
      setUnlockTarget(null);
      setUnlockReason('');
      if (userHistory) setUserHistory(null);
      await loadData(pagination.page);
    } catch (e) {
      alert(`Mở khóa thất bại: ${e.message}`);
    } finally {
      setUnlocking(false);
    }
  }

  async function approveUnlock(user) {
    try {
      await request(`/platform/security/users/${user.id}/unlock`, {method:'POST',body:JSON.stringify({reason:'Duyệt yêu cầu mở khóa của người dùng'})});
      await loadData(pagination.page);
    } catch (e) { alert(`Mở khóa thất bại: ${e.message}`); }
  }
  async function handleManualLock(userId) {
    const reason=window.prompt('Lý do khóa tạm thời tài khoản:');
    if(!reason?.trim())return;
    try { await request(`/platform/security/users/${userId}/lock`,{method:'POST',body:JSON.stringify({reason:reason.trim()})});await loadData(pagination.page); }
    catch(e){alert(`Khóa tài khoản thất bại: ${e.message}`);}
  }

  async function markAllNotificationsRead() {
    try {
      await request('/platform/security/notifications/read-all', { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      if (stats) setStats({ ...stats, unreadAlertsCount: 0 });
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="page-wrapper" style={{ paddingBottom: '60px' }}>
      {/* 1. HEADER */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={28} style={{ color: 'var(--ri-primary)' }} />
            Giám sát An ninh & Bảo mật AI
          </h1>
          <p className="page-subtitle">
            Hệ thống phát hiện bất thường, ngăn chặn xâm nhập và quản lý khóa tài khoản tự động
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="ri-btn ri-btn-secondary"
            onClick={() => setShowNotifications(true)}
            style={{ position: 'relative' }}
          >
            <Bell size={16} /> Cảnh báo an ninh
            {stats?.unreadAlertsCount > 0 && (
              <span
                className="security-alert-count"
                style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  fontSize: '11px',
                  borderRadius: '10px',
                  padding: '1px 6px',
                }}
              >
                {stats.unreadAlertsCount}
              </span>
            )}
          </button>
          <button
            className="ri-btn ri-btn-primary"
            onClick={() => loadData(pagination.page)}
            disabled={loading}
          >
            <RefreshCw size={16} /> {loading ? 'Đang cập nhật...' : 'Làm mới dữ liệu'}
          </button>
        </div>
      </div>

      {err && (
        <div className="op-state" style={{ color: 'var(--ri-danger)', marginBottom: '16px' }}>
          {err}
        </div>
      )}

      {/* 2. STATS CARDS */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid var(--ri-primary)' }}>
            <div style={{ color: 'var(--ri-text-muted)', fontSize: '0.8125rem', fontWeight: 600 }}>
              Tổng sự kiện an ninh
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ri-text)', marginTop: '4px' }}>
              {stats.totalEvents.toLocaleString('vi-VN')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ri-text-muted)', marginTop: '4px' }}>
              Ghi nhận qua AI Security Guard
            </div>
          </div>

          <div
            className={`card security-locked-kpi${stats.lockedUsersCount > 0 ? ' has-locks' : ''}`}
            style={{
              padding: '18px 20px',
              borderLeft: stats.lockedUsersCount > 0 ? '4px solid #DC2626' : '4px solid var(--ri-border)',
            }}
          >
            <div className="security-locked-kpi-title" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              Tài khoản đang bị tạm khóa
            </div>
            <div className="security-locked-kpi-value" style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px' }}>
              {stats.lockedUsersCount}
            </div>
            <div className="security-locked-kpi-note" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
              {stats.lockedUsersCount > 0 ? 'Cần xem xét hoặc mở khóa thủ công' : 'Không có tài khoản nào bị khóa'}
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #F97316' }}>
            <div style={{ color: 'var(--ri-text-muted)', fontSize: '0.8125rem', fontWeight: 600 }}>
              Vi phạm Mức độ Cao & Nghiêm trọng
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#C2410C', marginTop: '4px' }}>
              {(stats.criticalCount + stats.highCount).toLocaleString('vi-VN')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ri-text-muted)', marginTop: '4px' }}>
              {stats.criticalCount} CRITICAL · {stats.highCount} HIGH
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid var(--ri-warning)' }}>
            <div style={{ color: 'var(--ri-text-muted)', fontSize: '0.8125rem', fontWeight: 600 }}>
              Cảnh báo mới cho Admin
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ri-text)', marginTop: '4px' }}>
              {stats.unreadAlertsCount}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ri-text-muted)', marginTop: '4px' }}>
              Thông báo phát hiện tấn công khẩn cấp
            </div>
          </div>
        </div>
      )}

      {/* 3. DANH SÁCH TÀI KHOẢN ĐANG BỊ KHÓA TẠM THỜI (NẾU CÓ) */}
      {stats?.lockedUsers && stats.lockedUsers.length > 0 && (
        <div className="card security-locked-list" style={{ marginBottom: '24px', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 className="security-locked-list-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem' }}>
              <Lock size={18} /> Danh sách tài khoản đang bị tạm khóa ({stats.lockedUsers.length})
            </h3>
            <span className="security-locked-list-note" style={{ fontSize: '0.8125rem' }}>
              Tài khoản tự động mở sau khi hết thời gian khóa hoặc được Admin mở thủ công
            </span>
          </div>

          <div className="data-table-wrap">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Cửa hàng</th>
                  <th>Vai trò</th>
                  <th>Lý do khóa</th>
                  <th>Khóa đến khi</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {stats.lockedUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.full_name || 'Chưa đặt tên'}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ri-text-muted)' }}>{u.email} (ID: {u.id})</div>
                    </td>
                    <td>{u.organization_name || 'Hệ thống'}</td>
                    <td>
                      <span className="badge" style={{ fontSize: '0.75rem' }}>{u.role}</span>
                    </td>
                    <td className="security-lock-reason">
                      {u.lock_reason || 'Vi phạm an ninh nhiều lần'}
                      {u.unlock_requested_at && <div className="security-unlock-request" style={{marginTop:6,fontSize:12}}><strong>Yêu cầu mở khóa mới:</strong> {u.unlock_request_note}</div>}
                    </td>
                    <td>
                      <span className="security-lock-time" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
                        <Clock size={14} /> {u.locked_until ? formatDate(u.locked_until) : 'Không thời hạn'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="ri-btn ri-btn-secondary ri-btn-sm"
                        style={{ marginRight: '6px' }}
                        onClick={() => viewUserHistory(u.id)}
                      >
                        <Eye size={14} /> Lịch sử
                      </button>
                      <button
                        className="ri-btn ri-btn-primary ri-btn-sm"
                        style={{ background: '#16A34A', borderColor: '#16A34A' }}
                        onClick={() => u.unlock_requested_at ? approveUnlock(u) : setUnlockTarget(u)}
                      >
                        <Unlock size={14} /> {u.unlock_requested_at ? 'Duyệt mở khóa' : 'Mở khóa'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. THANH TÌM KIẾM & BỘ LỌC SECURITY LOGS */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 250px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--ri-muted)' }} />
            <input
              type="text"
              className="ri-control"
              placeholder="Tìm theo username, User ID, loại vi phạm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px', width: '100%' }}
            />
          </div>

          <div style={{ minWidth: '150px' }}>
            <select
              className="ri-control"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">Tất cả mức độ</option>
              <option value="CRITICAL">CRITICAL (Nghiêm trọng)</option>
              <option value="HIGH">HIGH (Mức cao)</option>
              <option value="MEDIUM">MEDIUM (Trung bình)</option>
              <option value="LOW">LOW (Mức thấp)</option>
            </select>
          </div>

          <div style={{ minWidth: '160px' }}>
            <select
              className="ri-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="BLOCKED">Đã từ chối (BLOCKED)</option>
              <option value="TEMPORARILY_LOCKED">Đã khóa tạm (LOCKED)</option>
              <option value="RESOLVED">Đã mở khóa (RESOLVED)</option>
            </select>
          </div>

          <button type="submit" className="ri-btn ri-btn-secondary">
            Tìm kiếm
          </button>
          {(search || severityFilter || statusFilter) && (
            <button
              type="button"
              className="ri-btn ri-btn-ghost"
              onClick={() => {
                setSearch('');
                setSeverityFilter('');
                setStatusFilter('');
              }}
            >
              Đặt lại
            </button>
          )}
        </form>
      </div>

      {/* 5. BẢNG DANH SÁCH SECURITY LOGS */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
            Nhật ký Sự kiện An ninh ({pagination.total} sự kiện)
          </h3>
          <span style={{ fontSize: '0.8125rem', color: 'var(--ri-text-muted)' }}>
            Trang {pagination.page} / {pagination.totalPages}
          </span>
        </div>

        {loading ? (
          <div className="op-state" style={{ padding: '40px', textAlign: 'center' }}>
            Đang tải dữ liệu nhật ký an ninh...
          </div>
        ) : logs.length === 0 ? (
          <div className="op-state" style={{ padding: '40px', textAlign: 'center' }}>
            Không tìm thấy sự kiện an ninh nào phù hợp với bộ lọc.
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người dùng</th>
                  <th>Cửa hàng / Chi nhánh</th>
                  <th>Loại hành vi</th>
                  <th>Trích đoạn yêu cầu</th>
                  <th>Mức độ</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const sevStyle = SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.MEDIUM;
                  const isUserLocked = log.is_currently_locked === true;
                  const wasLockEvent = log.status === 'TEMPORARILY_LOCKED' || log.event_type === 'ADMIN_UNLOCKED_USER' || Boolean(log.unlocked_at);
                  const currentStatusLabel = isUserLocked ? 'Tạm khóa' : wasLockEvent ? 'Đã mở khóa' : 'Thành công';

                  return (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                        {formatDate(log.created_at)}
                      </td>
                      <td>
                        <strong>{log.username || `User #${log.user_id || 'Ẩn danh'}`}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ri-text-muted)' }}>
                          Vai trò: {log.role || '—'}
                        </div>
                      </td>
                      <td>
                        <div>{log.organization_name || 'Nền tảng'}</div>
                        {log.branch_name && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--ri-text-muted)' }}>
                            {log.branch_name}
                          </div>
                        )}
                      </td>
                      <td>
                        <code style={{ fontSize: '0.75rem', background: 'var(--ri-elevated)', padding: '2px 6px', borderRadius: '4px' }}>
                          {eventTypeLabel(log.event_type)}
                        </code>
                      </td>
                      <td style={{ maxWidth: '260px' }}>
                        <div
                          title={log.request_snippet || ''}
                          style={{
                            fontSize: '0.8125rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--ri-text)',
                          }}
                        >
                          {log.request_snippet || '—'}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`security-severity-badge security-severity-${String(log.severity||'medium').toLowerCase()}`}
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: sevStyle.bg,
                            border: `1px solid ${sevStyle.border}`,
                            color: sevStyle.text,
                          }}
                        >
                          {SEVERITY_LABELS[log.severity] || log.severity}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: isUserLocked ? '#B91C1C' : 'var(--ri-text)',
                          }}
                        >
                          {currentStatusLabel}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {log.user_id && (
                          <button
                            className="ri-btn ri-btn-secondary ri-btn-sm"
                            style={{ marginRight: '6px' }}
                            onClick={() => viewUserHistory(log.user_id)}
                            title="Xem toàn bộ lịch sử vi phạm"
                          >
                            <Eye size={13} /> Lịch sử
                          </button>
                        )}
                        {log.user_id && isUserLocked && (
                          <>
                          <button
                            className="ri-btn ri-btn-primary ri-btn-sm"
                            style={{ background: '#16A34A', borderColor: '#16A34A' }}
                            onClick={() =>
                              setUnlockTarget({
                                id: log.user_id,
                                full_name: log.username,
                                email: `User #${log.user_id}`,
                              })
                            }
                            title="Mở khóa tài khoản"
                          >
                            <Unlock size={13} /> Mở khóa
                          </button>
                          </>
                        )}
                        {log.user_id && log.role!=='PLATFORM_ADMIN' && !isUserLocked && <button className="ri-btn ri-btn-secondary ri-btn-sm" onClick={()=>handleManualLock(log.user_id)}><Lock size={13}/> Khóa tạm thời</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Phân trang */}
        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              className="ri-btn ri-btn-secondary ri-btn-sm"
              disabled={pagination.page <= 1}
              onClick={() => loadData(pagination.page - 1)}
            >
              Trang trước
            </button>
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', fontSize: '0.8125rem' }}>
              Trang {pagination.page} / {pagination.totalPages}
            </span>
            <button
              className="ri-btn ri-btn-secondary ri-btn-sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadData(pagination.page + 1)}
            >
              Trang sau
            </button>
          </div>
        )}
      </div>

      {/* 6. MODAL: XEM LỊCH SỬ VI PHẠM CỦA MỘT TÀI KHOẢN */}
      {userHistory && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '800px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} /> Lịch sử vi phạm của {userHistory.user?.full_name || userHistory.user?.email}
              </h3>
              <button
                className="icon-button"
                onClick={() => setUserHistory(null)}
                aria-label="Đóng hộp thoại"
              >
                <X size={18} />
              </button>
            </div>

            {/* Thông tin tài khoản */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                padding: '12px 16px',
                background: 'var(--ri-elevated)',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '0.8125rem',
              }}
            >
              <div><strong>Email:</strong> {userHistory.user?.email}</div>
              <div><strong>Vai trò:</strong> {userHistory.user?.role}</div>
              <div><strong>Cửa hàng:</strong> {userHistory.user?.organization_name || 'Hệ thống'}</div>
              <div>
                <strong>Trạng thái:</strong>{' '}
                {userHistory.isLocked ? (
                  <span style={{ color: '#B91C1C', fontWeight: 700 }}>
                    Đang bị khóa đến {formatDate(userHistory.user?.locked_until)}
                  </span>
                ) : (
                  <span style={{ color: '#16A34A', fontWeight: 700 }}>Hoạt động bình thường</span>
                )}
              </div>
            </div>

            {userHistory.isLocked && (
              <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#B91C1C', fontSize: '0.8125rem' }}>
                  Lý do khóa: {userHistory.user?.lock_reason || 'Vi phạm an ninh nhiều lần'}
                </span>
                <button
                  className="ri-btn ri-btn-primary ri-btn-sm"
                  style={{ background: '#16A34A', borderColor: '#16A34A' }}
                  onClick={() => setUnlockTarget(userHistory.user)}
                >
                  <Unlock size={14} /> Mở khóa tài khoản này
                </button>
              </div>
            )}

            {/* Bảng lịch sử */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="data-table security-history-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Loại vi phạm</th>
                    <th>Trích đoạn</th>
                    <th>Mức độ</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {userHistory.history.map((h) => {
                    const sev = SEVERITY_COLORS[h.severity] || SEVERITY_COLORS.MEDIUM;
                    return (
                      <tr key={h.id}>
                        <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{formatDate(h.created_at)}</td>
                        <td>
                          <code style={{ fontSize: '0.75rem' }}>{eventTypeLabel(h.event_type)}</code>
                        </td>
                        <td className="security-history-snippet">{h.request_snippet || '—'}</td>
                        <td className="security-history-nowrap">
                          <span
                            className={`security-severity-badge security-severity-${String(h.severity||'medium').toLowerCase()}`}
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: sev.bg,
                              color: sev.text,
                            }}
                          >
                            {SEVERITY_LABELS[h.severity] || h.severity}
                          </span>
                        </td>
                        <td className="security-history-nowrap">{STATUS_LABELS[h.status] || h.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button className="ri-btn ri-btn-secondary" onClick={() => setUserHistory(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: MỞ KHÓA TÀI KHOẢN THỦ CÔNG */}
      {unlockTarget && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#16A34A' }}>
                <Unlock size={20} /> Xác nhận mở khóa tài khoản
              </h3>
              <button className="icon-button" onClick={() => setUnlockTarget(null)} aria-label="Đóng">
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--ri-text)', margin: '0 0 14px' }}>
              Bạn đang thực hiện mở khóa trước thời hạn cho tài khoản:
              <br />
              <strong>{unlockTarget.full_name || unlockTarget.email}</strong> (ID: {unlockTarget.id})
            </p>

            <form onSubmit={handleUnlockSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                  Ghi chú lý do mở khóa (Bắt buộc để lưu vào Audit Log):
                </label>
                <textarea
                  className="ri-control"
                  rows={3}
                  required
                  placeholder="Ví dụ: Đã xác minh người dùng thao tác nhầm / Nghiên cứu học thuật được cấp phép..."
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="ri-btn ri-btn-secondary"
                  onClick={() => setUnlockTarget(null)}
                  disabled={unlocking}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="ri-btn ri-btn-primary"
                  style={{ background: '#16A34A', borderColor: '#16A34A' }}
                  disabled={unlocking || !unlockReason.trim()}
                >
                  {unlocking ? 'Đang mở khóa...' : 'Xác nhận mở khóa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. DRAWER / MODAL: CẢNH BÁO AN NINH ADMIN */}
      {showNotifications && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '650px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                <Bell size={20} style={{ color: 'var(--ri-primary)' }} /> Thông báo An ninh cho Quản trị viên
              </h3>
              <button className="icon-button" onClick={() => setShowNotifications(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--ri-text-muted)' }}>
                {notifications.filter((n) => !n.is_read).length} thông báo chưa đọc
              </span>
              <button className="ri-btn ri-btn-ghost ri-btn-sm" onClick={markAllNotificationsRead}>
                Đánh dấu đã đọc tất cả
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--ri-text-muted)' }}>
                  Không có cảnh báo an ninh nào.
                </div>
              ) : (
                notifications.map((n) => {
                  const isAutoLock = String(n.title || '').includes('TỰ ĐỘNG KHÓA');
                  const notificationClass = n.is_read
                    ? 'is-read'
                    : isAutoLock ? 'is-unread is-auto-lock' : 'is-unread is-warning';
                  return (
                    <div
                      key={n.id}
                      className={`security-notification-card ${notificationClass}`}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong className="security-notification-title" style={{ fontSize: '0.875rem' }}>{n.title}</strong>
                        <span className="security-notification-time" style={{ fontSize: '0.75rem' }}>
                          {formatDate(n.created_at)}
                        </span>
                      </div>
                      <p className="security-notification-message" style={{ margin: 0, fontSize: '0.8125rem' }}>{n.message}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button className="ri-btn ri-btn-secondary" onClick={() => setShowNotifications(false)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
