import React, { useRef, useState, useEffect } from 'react';

export default function OtpInput({ value = '', onChange, disabled = false, autoFocus = true, length = 6 }) {
  const inputsRef = useRef([]);
  const [warning, setWarning] = useState('');
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus && !disabled && !value) {
      const timer = setTimeout(() => inputsRef.current[0]?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled, value]);

  const applyDigits = (next) => onChange?.(next.join(''));

  const handleChange = (event, index) => {
    const rawVal = event.target.value;

    // Khi người dùng xóa rỗng ô (Backspace hoặc Select + Delete)
    if (rawVal === '') {
      const next = [...digits];
      next[index] = '';
      applyDigits(next);
      setWarning('');
      return;
    }

    // Lọc ký tự số
    const numDigits = rawVal.replace(/\D/g, '');

    // Hỗ trợ trường hợp dán nhiều chữ số hoặc autofill
    if (numDigits.length > 1) {
      const next = [...digits];
      const startIdx = numDigits.length >= length ? 0 : index;
      for (let i = 0; i < numDigits.length && startIdx + i < length; i++) {
        next[startIdx + i] = numDigits[i];
      }
      applyDigits(next);
      setWarning('');
      const focusIdx = Math.min(startIdx + numDigits.length, length - 1);
      setTimeout(() => inputsRef.current[focusIdx]?.focus(), 10);
      return;
    }

    // Nếu không chứa chữ số nào (ví dụ ký tự chữ, phím dấu tiếng Việt của Unikey...)
    if (!numDigits) {
      setWarning('Vui lòng nhập đúng ký tự số (0–9).');
      return;
    }

    // Điền chữ số mới nhất (numDigits.slice(-1))
    const lastDigit = numDigits.slice(-1);
    const next = [...digits];
    next[index] = lastDigit;
    applyDigits(next);
    setWarning('');

    // Nhảy mượt mà sang ô tiếp theo sau 10ms
    if (index < length - 1) {
      setTimeout(() => inputsRef.current[index + 1]?.focus(), 10);
    }
  };

  const handlePaste = (event, index) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text');
    const numDigits = pasted.replace(/\D/g, '');
    if (!numDigits) {
      setWarning('Vui lòng nhập đúng ký tự số (0–9).');
      return;
    }
    const next = [...digits];
    const startIdx = numDigits.length >= length ? 0 : index;
    for (let i = 0; i < numDigits.length && startIdx + i < length; i++) {
      next[startIdx + i] = numDigits[i];
    }
    applyDigits(next);
    setWarning('');
    const focusIdx = Math.min(startIdx + numDigits.length, length - 1);
    setTimeout(() => inputsRef.current[focusIdx]?.focus(), 10);
  };

  const handleKeyDown = (event, index) => {
    if (event.key === 'ArrowLeft') {
      inputsRef.current[Math.max(0, index - 1)]?.focus();
    } else if (event.key === 'ArrowRight') {
      inputsRef.current[Math.min(length - 1, index + 1)]?.focus();
    } else if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div>
      <div
        style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}
        role="group"
        aria-label={`Nhập mã OTP ${length} chữ số`}
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => (inputsRef.current[index] = element)}
            type="tel"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={digit}
            disabled={disabled}
            aria-label={`Chữ số OTP thứ ${index + 1}`}
            onChange={(event) => handleChange(event, index)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPaste={(event) => handlePaste(event, index)}
            style={{
              width: 48,
              height: 54,
              textAlign: 'center',
              fontSize: '1.5rem',
              fontWeight: 700,
              fontFamily: 'var(--ri-font-mono, monospace)',
              border: digit ? '2px solid var(--ri-primary)' : '2px solid var(--ri-border)',
              borderRadius: 'var(--ri-radius)',
              background: 'var(--ri-surface)',
              color: 'var(--ri-text)',
              outline: 'none',
              transition: 'border-color .15s ease, box-shadow .15s ease',
              boxShadow: 'none',
              cursor: disabled ? 'not-allowed' : 'text',
              opacity: disabled ? 0.5 : 1,
              caretColor: 'transparent'
            }}
            className="otp-box"
          />
        ))}
      </div>
      {warning && (
        <p
          role="alert"
          style={{
            color: 'var(--ri-danger)',
            fontSize: '0.875rem',
            fontWeight: 600,
            margin: '8px 0 0',
            textAlign: 'center'
          }}
        >
          {warning}
        </p>
      )}
      <style>{`.otp-box:focus{border-color:var(--ri-primary)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--ri-primary) 20%,transparent)!important}.otp-box:disabled{cursor:not-allowed}`}</style>
    </div>
  );
}
