import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, ArrowLeft, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Send, Eye, EyeOff, Lock } from 'lucide-react';
import { ThemeToggle } from '../design-system/ThemeProvider.jsx';
import { authRequest } from '../services/auth';
import OtpInput from '../components/auth/OtpInput';
import PasswordChecklist, { isPasswordStrong } from '../components/auth/PasswordChecklist';
import AuthShowcasePanel from '../components/auth/AuthShowcasePanel';

// Các bước tuần tự:
// BƯỚC 1: Nhập email tài khoản -> Bấm Gửi mã OTP
// BƯỚC 2: Nhập mã OTP 6 số từ Gmail -> Bấm Xác nhận mã OTP
// BƯỚC 3: Nhập Mật khẩu mới & Xác nhận -> Bấm Đặt lại mật khẩu
// BƯỚC 4: Thông báo thành công & Chuyển hướng về /login

export default function ForgotPassword() {
  const navigate = useNavigate();

  // Quản lý bước hiện tại: 1 | 2 | 3 | 4
  const [step, setStep] = useState(1);

  // State Bước 1: Email
  const [email, setEmail] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendInfo, setSendInfo] = useState('');
  const [countdown, setCountdown] = useState(0);

  // State Bước 2: OTP
  const [otp, setOtp] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [resetToken, setResetToken] = useState('');

  // State Bước 3: Mật khẩu mới
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [verifyInfo, setVerifyInfo] = useState('');

  // Đếm ngược 60 giây trước khi cho gửi lại mã OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Tự động chuyển về /login sau khi hoàn tất thành công (Bước 4)
  useEffect(() => {
    if (step !== 4) return;
    const t = setTimeout(() => navigate('/login', { replace: true }), 3500);
    return () => clearTimeout(t);
  }, [step, navigate]);

  // ===== BƯỚC 1: GỬI MÃ OTP VỀ GMAIL =====
  async function handleSendOtp(e) {
    if (e) e.preventDefault();
    if (!email.trim()) return;

    setSendError('');
    setSendingOtp(true);
    try {
      const res = await authRequest('/forgot-password/send-otp', {
        method: 'POST',
        body: { email: email.trim().toLowerCase() }
      });
      setCountdown(60);
      setOtp('');
      setSendInfo(res.message || `Mã OTP đã được gửi tới ${email}. Vui lòng kiểm tra hộp thư.`);
      setStep(2);
    } catch (err) {
      setSendError(err.message || 'Không thể gửi mã xác thực. Vui lòng kiểm tra lại địa chỉ email.');
    } finally {
      setSendingOtp(false);
    }
  }

  // Gửi lại mã OTP (ở Bước 2)
  async function handleResendOtp() {
    setVerifyError('');
    setSendingOtp(true);
    try {
      const res = await authRequest('/forgot-password/send-otp', {
        method: 'POST',
        body: { email: email.trim().toLowerCase() }
      });
      setCountdown(60);
      setOtp('');
      setSendInfo(res.message || 'Mã OTP mới đã được gửi tới Gmail của bạn.');
    } catch (err) {
      setVerifyError(err.message || 'Không thể gửi lại mã OTP. Vui lòng thử lại sau.');
    } finally {
      setSendingOtp(false);
    }
  }

  // ===== BƯỚC 2: XÁC THỰC MÃ OTP =====
  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (otp.length !== 6) {
      setVerifyError('Vui lòng nhập đủ 6 chữ số mã OTP gửi về Gmail.');
      return;
    }

    setVerifyError('');
    setVerifyingOtp(true);
    try {
      const res = await authRequest('/forgot-password/verify-otp', {
        method: 'POST',
        body: {
          email: email.trim().toLowerCase(),
          otp: otp.trim()
        }
      });
      setResetToken(res.reset_token);
      setVerifyInfo(res.message || 'Xác thực OTP thành công. Vui lòng đặt mật khẩu mới.');
      setStep(3);
    } catch (err) {
      setVerifyError(err.message || 'Mã xác thực OTP không chính xác hoặc đã hết hạn.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  // ===== BƯỚC 3: ĐẶT LẠI MẬT KHẨU MỚI =====
  async function handleResetPassword(e) {
    e.preventDefault();
    setResetError('');

    if (!resetToken) {
      setResetError('Phiên xác thực đã hết hạn. Vui lòng thực hiện lại từ đầu.');
      return;
    }
    if (!isPasswordStrong(newPassword)) {
      setResetError('Mật khẩu mới chưa đáp ứng đầy đủ 4 tiêu chí bảo mật.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }

    setResetting(true);
    try {
      await authRequest('/forgot-password/reset', {
        method: 'POST',
        body: {
          email: email.trim().toLowerCase(),
          reset_token: resetToken,
          new_password: newPassword,
          confirm_password: confirmPassword
        }
      });
      setStep(4);
    } catch (err) {
      setResetError(err.message || 'Đặt lại mật khẩu thất bại. Vui lòng thử lại.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="auth-shell">
      {/* Nút điều hướng góc trên */}
      <div style={{ position: 'absolute', top: '20px', right: '24px', display: 'flex', gap: '12px', alignItems: 'center', zIndex: 20 }}>
        <ThemeToggle />
        <Link to="/login" className="btn-auth-nav">
          <ArrowLeft size={14} /> Đăng nhập
        </Link>
      </div>

      <AuthShowcasePanel
        title="Bảo mật tài khoản."
        highlight="Khôi phục dễ dàng & an toàn."
        description="Bảo vệ an toàn dữ liệu kinh doanh với cơ chế xác thực mã OTP 6 số qua Gmail SMTP thật và quy chuẩn mật khẩu mạnh 4 điều kiện."
        badgeText="BẢO MẬT & KHÔI PHỤC TÀI KHOẢN"
      />

      {/* Form Card phải */}
      <section className="auth-form-wrap">
        <div className="auth-form-card">

          {/* ========================================================= */}
          {/* BƯỚC 1: NHẬP EMAIL                                        */}
          {/* ========================================================= */}
          {step === 1 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <KeyRound size={24} style={{ color: 'var(--ri-primary)' }} />
                <h2 style={{ margin: 0, fontSize: '1.375rem' }}>Khôi phục mật khẩu</h2>
              </div>
              <p style={{ margin: '0 0 22px', color: 'var(--ri-text-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                Nhập địa chỉ email tài khoản. Hệ thống sẽ gửi mã OTP 6 chữ số về Gmail của bạn để xác thực.
              </p>

              {sendError && (
                <div style={{
                  display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 14px',
                  background: 'var(--ri-danger-bg, color-mix(in srgb, var(--ri-danger) 12%, transparent))',
                  border: '1px solid var(--ri-danger)', borderRadius: 'var(--ri-radius)',
                  color: 'var(--ri-danger)', fontSize: '0.875rem', marginBottom: '16px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{sendError}</span>
                </div>
              )}

              <form className="auth-fields" onSubmit={handleSendOtp}>
                <label className="ri-field">
                  <span>Email tài khoản *</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="email"
                      required
                      autoFocus
                      maxLength={254}
                      autoComplete="email"
                      className="ri-control"
                      style={{ flex: 1 }}
                      placeholder="name@cuahang.vn"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setSendError(''); }}
                    />
                    <button
                      type="submit"
                      className="ri-btn ri-btn-primary"
                      disabled={sendingOtp || !email.trim()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', padding: '0 16px' }}
                    >
                      {sendingOtp ? <RefreshCw size={14} className="spin" /> : <Send size={14} />}
                      {sendingOtp ? 'Đang gửi...' : 'Gửi mã OTP'}
                    </button>
                  </div>
                </label>
              </form>

              <div className="auth-links" style={{ marginTop: '24px', fontSize: '0.875rem', textAlign: 'center' }}>
                Nhớ mật khẩu? <Link to="/login" style={{ fontWeight: 600 }}>Đăng nhập lại</Link>
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* BƯỚC 2: XÁC THỰC MÃ OTP (CHỈ HIỆN OTP, CHƯA HIỆN MẬT KHẨU) */}
          {/* ========================================================= */}
          {step === 2 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <ShieldCheck size={24} style={{ color: 'var(--ri-primary)' }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                      background: 'var(--ri-primary)', color: '#fff'
                    }}>
                      BƯỚC 2/3
                    </span>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Xác thực mã OTP</h2>
                  </div>
                </div>
              </div>

              <p style={{ margin: '0 0 18px', color: 'var(--ri-text-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                Hệ thống đã gửi mã xác thực 6 số đến Gmail <strong>{email}</strong>. Vui lòng mở hòm thư và nhập mã vào các ô dưới đây:
              </p>

              {/* Thông báo gửi mã thành công */}
              {sendInfo && (
                <div style={{
                  display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 14px',
                  background: 'var(--ri-success-bg, color-mix(in srgb, var(--ri-success) 12%, transparent))',
                  border: '1px solid var(--ri-success)', borderRadius: 'var(--ri-radius)',
                  color: 'var(--ri-success)', fontSize: '0.8125rem', marginBottom: '16px', lineHeight: 1.5
                }}>
                  <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{sendInfo}</span>
                </div>
              )}

              {/* Lỗi xác thực OTP */}
              {verifyError && (
                <div style={{
                  display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 14px',
                  background: 'var(--ri-danger-bg, color-mix(in srgb, var(--ri-danger) 12%, transparent))',
                  border: '1px solid var(--ri-danger)', borderRadius: 'var(--ri-radius)',
                  color: 'var(--ri-danger)', fontSize: '0.875rem', marginBottom: '16px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{verifyError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} style={{ display: 'grid', gap: '16px' }}>
                {/* 6 ô vuông OTP */}
                <div style={{
                  background: 'var(--ri-elevated)',
                  border: '1px dashed var(--ri-primary)',
                  borderRadius: 'var(--ri-radius)',
                  padding: '18px 14px'
                }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: 'var(--ri-text)', marginBottom: '14px', textAlign: 'center' }}>
                    Nhập mã xác thực 6 chữ số *
                  </span>
                  <OtpInput
                    value={otp}
                    onChange={v => { setOtp(v); setVerifyError(''); }}
                    disabled={verifyingOtp}
                    autoFocus={true}
                  />

                  {/* Dòng gửi lại mã */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: '16px', paddingTop: '10px',
                    borderTop: '1px dashed var(--ri-border)', fontSize: '0.8125rem'
                  }}>
                    <span style={{ color: 'var(--ri-text-muted)' }}>Chưa nhận được email?</span>
                    <button
                      type="button"
                      className="ri-btn ri-btn-secondary ri-btn-sm"
                      disabled={sendingOtp || countdown > 0}
                      onClick={handleResendOtp}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      <RefreshCw size={12} className={sendingOtp ? 'spin' : ''} />
                      {countdown > 0 ? `Gửi lại sau (${countdown}s)` : 'Gửi lại mã'}
                    </button>
                  </div>
                </div>

                {/* Nút xác nhận mã OTP */}
                <button
                  type="submit"
                  className="ri-btn ri-btn-primary"
                  disabled={verifyingOtp || otp.length !== 6}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
                >
                  {verifyingOtp ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={16} />}
                  {verifyingOtp ? 'Đang xác thực...' : 'Xác nhận mã OTP'}
                </button>

                {/* Nút quay lại Bước 1 */}
                <button
                  type="button"
                  className="ri-btn ri-btn-secondary"
                  onClick={() => { setStep(1); setVerifyError(''); setSendError(''); setOtp(''); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={14} /> Thay đổi địa chỉ email
                </button>
              </form>
            </>
          )}

          {/* ========================================================= */}
          {/* BƯỚC 3: ĐẶT MẬT KHẨU MỚI (CHỈ HIỆN SAU KHI OTP HỢP LỆ)      */}
          {/* ========================================================= */}
          {step === 3 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Lock size={24} style={{ color: 'var(--ri-primary)' }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                      background: 'var(--ri-success)', color: '#fff'
                    }}>
                      BƯỚC 3/3
                    </span>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Đặt mật khẩu mới</h2>
                  </div>
                </div>
              </div>

              <p style={{ margin: '0 0 18px', color: 'var(--ri-text-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                Xác minh thành công cho tài khoản <strong>{email}</strong>. Hãy tạo mật khẩu mới đạt chuẩn bảo mật bên dưới:
              </p>

              {/* Thông báo xác minh OTP thành công */}
              {verifyInfo && (
                <div style={{
                  display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 14px',
                  background: 'var(--ri-success-bg, color-mix(in srgb, var(--ri-success) 12%, transparent))',
                  border: '1px solid var(--ri-success)', borderRadius: 'var(--ri-radius)',
                  color: 'var(--ri-success)', fontSize: '0.8125rem', marginBottom: '16px', lineHeight: 1.5
                }}>
                  <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{verifyInfo}</span>
                </div>
              )}

              {/* Lỗi đặt lại mật khẩu */}
              {resetError && (
                <div style={{
                  display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 14px',
                  background: 'var(--ri-danger-bg, color-mix(in srgb, var(--ri-danger) 12%, transparent))',
                  border: '1px solid var(--ri-danger)', borderRadius: 'var(--ri-radius)',
                  color: 'var(--ri-danger)', fontSize: '0.875rem', marginBottom: '16px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{resetError}</span>
                </div>
              )}

              <form className="auth-fields" onSubmit={handleResetPassword} style={{ display: 'grid', gap: '16px' }}>
                {/* Ô nhập mật khẩu mới */}
                <label className="ri-field">
                  <span>Mật khẩu mới *</span>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNew ? 'text' : 'password'}
                      required
                      autoFocus
                      autoComplete="new-password"
                      className="ri-control"
                      style={{ paddingRight: '40px' }}
                      placeholder="Tối thiểu 12 ký tự, chữ hoa, số, ký tự đặc biệt"
                      value={newPassword}
                      onChange={e => { setNewPassword(e.target.value); setResetError(''); }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowNew(v => !v)}
                      style={{
                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--ri-text-muted)', padding: '4px', display: 'flex'
                      }}
                      aria-label={showNew ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {newPassword && <PasswordChecklist password={newPassword} />}
                </label>

                {/* Ô xác nhận mật khẩu mới */}
                <label className="ri-field">
                  <span>Xác nhận mật khẩu mới *</span>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      className="ri-control"
                      style={{ paddingRight: '40px' }}
                      placeholder="Nhập lại chính xác mật khẩu mới"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setResetError(''); }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirm(v => !v)}
                      style={{
                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--ri-text-muted)', padding: '4px', display: 'flex'
                      }}
                      aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--ri-danger)', marginTop: '4px', display: 'block' }}>
                      Mật khẩu xác nhận chưa khớp với mật khẩu mới
                    </span>
                  )}
                </label>

                {/* Nút đặt lại mật khẩu */}
                <button
                  type="submit"
                  className="ri-btn ri-btn-primary"
                  disabled={resetting || !isPasswordStrong(newPassword) || newPassword !== confirmPassword}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
                >
                  {resetting ? <RefreshCw size={16} className="spin" /> : <Lock size={16} />}
                  {resetting ? 'Đang cập nhật mật khẩu...' : 'Đặt lại mật khẩu'}
                </button>
              </form>
            </>
          )}

          {/* ========================================================= */}
          {/* BƯỚC 4: THÀNH CÔNG                                        */}
          {/* ========================================================= */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'var(--ri-success-bg, color-mix(in srgb, var(--ri-success) 15%, transparent))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px'
              }}>
                <CheckCircle2 size={36} style={{ color: 'var(--ri-success)' }} />
              </div>
              <h2 style={{ margin: '0 0 10px', fontSize: '1.375rem', color: 'var(--ri-text)' }}>
                Đặt lại mật khẩu thành công!
              </h2>
              <p style={{ margin: '0 0 20px', color: 'var(--ri-text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                Mật khẩu tài khoản <strong>{email}</strong> đã được cập nhật thành công.<br />
                Tất cả các phiên đăng nhập cũ đã được thu hồi để đảm bảo an toàn.
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
                fontSize: '0.8125rem', color: 'var(--ri-text-muted)', marginBottom: '18px'
              }}>
                <RefreshCw size={14} className="spin" />
                <span>Đang tự động chuyển về trang Đăng nhập sau 3 giây...</span>
              </div>
              <Link to="/login">
                <button type="button" className="ri-btn ri-btn-primary" style={{ width: '100%' }}>
                  Đăng nhập ngay
                </button>
              </Link>
            </div>
          )}

        </div>
      </section>
    </div>
  );
}
