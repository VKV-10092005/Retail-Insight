import React from 'react';
import {CheckCircle2,Circle} from 'lucide-react';

export function checkPasswordCriteria(password = '') {
  return {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password)
  };
}

export function isPasswordStrong(password = '') {
  const c = checkPasswordCriteria(password);
  return c.length && c.uppercase && c.number && c.special;
}

export default function PasswordChecklist({ password = '', confirmPassword = null }) {
  const criteria = checkPasswordCriteria(password);
  const isMatch = confirmPassword !== null ? (password && password === confirmPassword) : null;

  const items = [
    { key: 'length', label: 'Tối thiểu 12 ký tự', met: criteria.length },
    { key: 'uppercase', label: 'Ít nhất 1 chữ cái viết hoa (A-Z)', met: criteria.uppercase },
    { key: 'number', label: 'Ít nhất 1 chữ số (0-9)', met: criteria.number },
    { key: 'special', label: 'Ít nhất 1 ký tự đặc biệt (!@#$%^&*...)', met: criteria.special }
  ];

  return (
    <div style={{
      background: 'var(--ri-elevated)',
      border: '1px solid var(--ri-border)',
      borderRadius: 'var(--ri-radius)',
      padding: '10px 14px',
      marginTop: '6px',
      fontSize: '0.8125rem'
    }}>
      <div style={{fontWeight: 600, color: 'var(--ri-text)', marginBottom: '6px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
        Yêu cầu mật khẩu mạnh:
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '4px 12px'}}>
        {items.map(item => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: item.met ? 'var(--ri-success)' : 'var(--ri-text-muted)',
              transition: 'color 0.2s ease',
              fontWeight: item.met ? 500 : 400
            }}
          >
            {item.met ? (
              <CheckCircle2 size={13} style={{flexShrink: 0, color: 'var(--ri-success)'}}/>
            ) : (
              <Circle size={13} style={{flexShrink: 0, color: 'var(--ri-text-muted)', opacity: 0.6}}/>
            )}
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {confirmPassword !== null && confirmPassword.length > 0 && (
        <div style={{
          marginTop: '6px',
          paddingTop: '6px',
          borderTop: '1px dashed var(--ri-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: isMatch ? 'var(--ri-success)' : 'var(--ri-danger)',
          fontWeight: 500
        }}>
          {isMatch ? (
            <CheckCircle2 size={13} style={{flexShrink: 0, color: 'var(--ri-success)'}}/>
          ) : (
            <Circle size={13} style={{flexShrink: 0, color: 'var(--ri-danger)'}}/>
          )}
          <span>{isMatch ? 'Mật khẩu xác nhận đã khớp' : 'Mật khẩu xác nhận chưa khớp'}</span>
        </div>
      )}
    </div>
  );
}
