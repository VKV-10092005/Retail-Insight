import React,{useEffect,useState} from 'react';

export default function GoogleSignInButton({
  onSuccess,
  onError,
  disabled = false,
  text = 'Tiếp tục với Google'
}) {
  const [loading, setLoading] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  useEffect(() => {
    // Tải thư viện Google Identity Services nếu chưa có
    if (!window.google && clientId) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, [clientId]);

  async function handleClick() {
    if (disabled || loading) return;

    // Nếu chưa cấu hình Google Client ID trên môi trường phát triển
    if (!clientId) {
      const useMock = window.confirm(
        'Chưa cấu hình VITE_GOOGLE_CLIENT_ID trong frontend/.env!\n\n' +
        'Bạn có muốn dùng tài khoản Google thử nghiệm (test_google_owner@gmail.com) để kiểm tra luồng xác thực OTP & Hoàn thiện Shop không?'
      );
      if (useMock) {
        onSuccess('mock_google_token');
      }
      return;
    }

    try {
      setLoading(true);
      if (!window.google?.accounts?.id) {
        // Chờ script tải
        await new Promise(r => setTimeout(r, 600));
      }

      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            setLoading(false);
            if (response.credential) {
              onSuccess(response.credential);
            } else if (onError) {
              onError('Không nhận được thông tin xác thực từ Google');
            }
          }
        });
        window.google.accounts.id.prompt();
      } else {
        // Fallback popup nếu GIS không tải được
        alert('Không thể kết nối dịch vụ Google Identity Services. Vui lòng kiểm tra kết nối mạng.');
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      if (onError) onError(err.message || 'Lỗi đăng nhập Google');
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="btn-google-auth"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        width: '100%',
        padding: '10px 16px',
        background: 'var(--ri-surface)',
        border: '1px solid var(--ri-border)',
        borderRadius: 'var(--ri-radius)',
        color: 'var(--ri-text)',
        fontSize: '0.875rem',
        fontWeight: 600,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        boxShadow: 'var(--ri-shadow-sm)',
        transition: 'all 0.2s ease',
        marginBottom: '16px'
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" style={{flexShrink: 0}}>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.79l7.97-6.2z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        <path fill="none" d="M0 0h48v48H0z"/>
      </svg>
      <span>{loading ? 'Đang kết nối Google...' : text}</span>
    </button>
  );
}
