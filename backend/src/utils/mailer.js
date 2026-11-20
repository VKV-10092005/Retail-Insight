import tls from 'node:tls';

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const cleanHeader = value => String(value || '').replace(/[\r\n]+/g, ' ').trim();
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function mailbox(value) {
  const cleaned = cleanHeader(value);
  const bracketed = /<([^<>]+)>$/.exec(cleaned)?.[1];
  return bracketed || cleaned;
}
function subjectForPurpose(purpose) {
  const normalizedPurpose = String(purpose || '').toLocaleLowerCase('vi-VN');
  if (normalizedPurpose.includes('cửa hàng')) {
    return 'Retail Insight - Hoàn tất thiết lập cửa hàng của bạn';
  }
  if (normalizedPurpose.includes('đăng ký')) {
    return 'Retail Insight - Xác nhận thông tin đăng ký tài khoản';
  }
  if (normalizedPurpose.includes('đặt lại mật khẩu')) {
    return 'Retail Insight - Yêu cầu đặt lại mật khẩu truy cập';
  }
  if (normalizedPurpose.includes('đổi mật khẩu')) {
    return 'Retail Insight - Xác nhận thay đổi mật khẩu truy cập';
  }
  return 'Retail Insight - Xác nhận yêu cầu của bạn';
}

/**
 * Gửi email qua SMTP (hỗ trợ Gmail TLS port 465 hoặc SMTP thông thường)
 * Không phụ thuộc thư viện bên ngoài.
 */
export async function sendOtpEmail(toEmail, otpCode, fullName = '', purpose = 'Đổi mật khẩu') {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const gasMailWebhookUrl = process.env.GAS_MAIL_WEBHOOK_URL;
  const resendApiKey = process.env.RESEND_API_KEY;
  const smtpConfigured = Boolean(user && pass);
  const smtpFrom = process.env.SMTP_FROM || process.env.EMAIL_FROM || `Retail Insight <${user || ''}>`;
  const smtpFromEmail = mailbox(smtpFrom);
  const configuredResendFrom = process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.EMAIL_FROM;
  const resendFromEmail = mailbox(configuredResendFrom);
  const resendFrom = !configuredResendFrom || /@gmail\.com$/i.test(resendFromEmail)
    ? 'Retail Insight <onboarding@resend.dev>'
    : configuredResendFrom;

  if (!gasMailWebhookUrl && !resendApiKey && !smtpConfigured) {
    return {
      sent: false,
      configured: false,
      reason: 'Chưa cấu hình GAS_MAIL_WEBHOOK_URL, RESEND_API_KEY hoặc SMTP_USER và SMTP_PASS trong backend/.env'
    };
  }

  if (!emailPattern.test(toEmail)) {
    const error = 'Địa chỉ email nhận không hợp lệ';
    console.error('[mailer] OTP email validation failed:', { provider: 'none', toEmail, error });
    return { sent: false, configured: true, error };
  }

  const safePurpose = cleanHeader(purpose);
  const subject = subjectForPurpose(safePurpose);
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const recipientName = cleanHeader(fullName) || 'Quý khách';
  const textBody = [
    `Xin chào ${recipientName},`,
    '',
    `Bạn vừa yêu cầu ${safePurpose} trên Retail Insight.`,
    `Mã xác thực của bạn: ${otpCode}`,
    '',
    'Mã này có hiệu lực trong 5 phút và chỉ được sử dụng một lần.',
    'Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.',
    '',
    'Retail Insight'
  ].join('\r\n');

  const htmlBody = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;background:#f8fafc;color:#1e293b;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:28px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
    <h1 style="margin:0 0 24px;color:#0369a1;font-size:22px;">Retail Insight</h1>
    <p style="margin:0 0 16px;line-height:1.6;">Xin chào <strong>${escapeHtml(recipientName)}</strong>,</p>
    <p style="margin:0 0 20px;line-height:1.6;">Bạn vừa yêu cầu ${escapeHtml(safePurpose)}. Sử dụng mã dưới đây để tiếp tục:</p>
    <p style="margin:20px 0;padding:14px;text-align:center;background:#f0f9ff;border-radius:6px;color:#0369a1;font-size:28px;font-weight:700;letter-spacing:6px;">${escapeHtml(otpCode)}</p>
    <p style="margin:0 0 16px;line-height:1.6;">Mã này có hiệu lực trong 5 phút và chỉ được sử dụng một lần.</p>
    <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.</p>
  </div>
</body>
</html>
  `.trim();

  let gasError;
  if (gasMailWebhookUrl) {
    try {
      const response = await fetch(gasMailWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toEmail, subject, text: textBody, html: htmlBody, otp: otpCode }),
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
      });
      const responseBody = await response.text();
      if (response.ok) return { sent: true, configured: true, provider: 'google-apps-script' };

      gasError = `Google Apps Script webhook failed (${response.status} ${response.statusText}): ${responseBody}`;
      console.error('[mailer] Google Apps Script OTP email failed:', {
        status: response.status,
        statusText: response.statusText,
        response: responseBody,
        to: toEmail
      });
    } catch (err) {
      gasError = `Google Apps Script webhook could not be completed: ${err?.message || String(err)}`;
      console.error('[mailer] Google Apps Script OTP email request error:', {
        error: err?.stack || err?.message || String(err),
        to: toEmail
      });
    }
  }

  let resendError;
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: resendFrom, to: [toEmail], subject, text: textBody, html: htmlBody }),
        signal: AbortSignal.timeout(10000)
      });
      const responseBody = await response.text();
      if (response.ok) return { sent: true, configured: true, provider: 'resend' };

      resendError = `Resend request failed (${response.status} ${response.statusText}): ${responseBody}`;
      console.error('[mailer] Resend OTP email failed:', {
        status: response.status,
        statusText: response.statusText,
        response: responseBody,
        from: resendFrom,
        to: toEmail
      });
    } catch (err) {
      resendError = `Resend request could not be completed: ${err?.message || String(err)}`;
      console.error('[mailer] Resend OTP email request error:', {
        error: err?.stack || err?.message || String(err),
        from: resendFrom,
        to: toEmail
      });
    }
  }

  const providerError = [gasError, resendError].filter(Boolean).join('; ');

  // Render chặn SMTP trên một số gói. Chỉ thử SMTP sau GAS/Resend và khi đã cấu hình đủ.
  if (!smtpConfigured) {
    return { sent: false, configured: true, error: providerError || 'SMTP chưa được cấu hình' };
  }
  if (!emailPattern.test(smtpFromEmail) || port !== 465 || !emailPattern.test(user)) {
    const smtpError = 'Cấu hình SMTP không hợp lệ; SMTP TLS yêu cầu port 465 và địa chỉ email hợp lệ';
    console.error('[mailer] SMTP configuration invalid:', {
      host,
      port,
      userConfigured: Boolean(user),
      from: smtpFrom,
      error: smtpError
    });
    return { sent: false, configured: true, error: providerError ? `${providerError}; ${smtpError}` : smtpError };
  }

  return new Promise((resolve) => {
    let socket;
    let settled = false;
    const timeoutTimer = setTimeout(() => {
      try { socket?.destroy(); } catch {}
      const error = 'SMTP timeout sau 10s';
      console.error('[mailer] SMTP OTP email timeout:', { host, port, from: smtpFrom, to: toEmail, error });
      if (!settled) {
        settled = true;
        resolve({ sent: false, configured: true, error });
      }
    }, 10000);

    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      try { socket?.end(); } catch {}
      if (!result.sent) {
        console.error('[mailer] SMTP OTP email failed:', {
          host,
          port,
          from: smtpFrom,
          to: toEmail,
          error: result.error
        });
      }
      resolve(result);
    };

    try {
      socket = tls.connect({ host, port, servername: host, minVersion: 'TLSv1.2', timeout: 8000 }, () => {
        // Connected
      });

      let step = 0;
      let buffer = '';

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop(); // keep remainder

        for (const line of lines) {
          if (!line) continue;
          const code = parseInt(line.slice(0, 3), 10);
          const isFinal = line[3] === ' ';

          if (!isFinal) continue;

          switch (step) {
            case 0: // Greeting (220)
              if (code !== 220) return cleanup({ sent: false, configured: true, error: `Greeting error: ${line}` });
              step = 1;
              socket.write(`EHLO retail-app\r\n`);
              break;

            case 1: // EHLO response (250)
              if (code !== 250) return cleanup({ sent: false, configured: true, error: `EHLO error: ${line}` });
              step = 2;
              socket.write(`AUTH LOGIN\r\n`);
              break;

            case 2: // AUTH LOGIN prompt (334)
              if (code !== 334) return cleanup({ sent: false, configured: true, error: `AUTH LOGIN error: ${line}` });
              step = 3;
              socket.write(`${Buffer.from(user).toString('base64')}\r\n`);
              break;

            case 3: // Username response (334)
              if (code !== 334) return cleanup({ sent: false, configured: true, error: `Username error: ${line}` });
              step = 4;
              socket.write(`${Buffer.from(pass.replace(/\s+/g, '')).toString('base64')}\r\n`);
              break;

            case 4: // Password response (235 Auth success)
              if (code !== 235) return cleanup({ sent: false, configured: true, error: `Auth error: ${line}` });
              step = 5;
              socket.write(`MAIL FROM:<${smtpFromEmail}>\r\n`);
              break;

            case 5: // MAIL FROM response (250)
              if (code !== 250) return cleanup({ sent: false, configured: true, error: `MAIL FROM error: ${line}` });
              step = 6;
              socket.write(`RCPT TO:<${toEmail}>\r\n`);
              break;

            case 6: // RCPT TO response (250)
              if (code !== 250) return cleanup({ sent: false, configured: true, error: `RCPT TO error: ${line}` });
              step = 7;
              socket.write(`DATA\r\n`);
              break;

            case 7: // DATA response (354)
              if (code !== 354) return cleanup({ sent: false, configured: true, error: `DATA prompt error: ${line}` });
              step = 8;
              const mimeBoundary = `retail-insight-${Date.now()}`;
              const msg = [
                `From: ${cleanHeader(smtpFrom)}`,
                `To: <${toEmail}>`,
                `Subject: ${subjectEncoded}`,
                `MIME-Version: 1.0`,
                `Content-Type: multipart/alternative; boundary="${mimeBoundary}"`,
                ``,
                `--${mimeBoundary}`,
                `Content-Type: text/plain; charset=UTF-8`,
                `Content-Transfer-Encoding: 8bit`,
                ``,
                textBody,
                ``,
                `--${mimeBoundary}`,
                `Content-Type: text/html; charset=UTF-8`,
                `Content-Transfer-Encoding: 8bit`,
                ``,
                htmlBody,
                ``,
                `--${mimeBoundary}--`,
                `.`
              ].join('\r\n') + '\r\n';
              socket.write(msg);
              break;

            case 8: // Message accepted (250)
              if (code !== 250) return cleanup({ sent: false, configured: true, error: `Send error: ${line}` });
              step = 9;
              socket.write(`QUIT\r\n`);
              cleanup({ sent: true, configured: true, provider: 'smtp' });
              break;
          }
        }
      });

      socket.on('error', (err) => {
        cleanup({ sent: false, configured: true, error: err.message });
      });
    } catch (err) {
      cleanup({ sent: false, configured: true, error: err.message });
    }
  });
}
