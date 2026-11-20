import tls from 'node:tls';

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const cleanHeader = value => String(value || '').replace(/[\r\n]+/g, ' ').trim();
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function mailbox(value) {
  const cleaned = cleanHeader(value);
  const bracketed = /<([^<>]+)>$/.exec(cleaned)?.[1];
  return bracketed || cleaned;
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
  const subject = `[Retail Insight] Mã xác thực ${safePurpose}: ${otpCode}`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mã xác thực ${escapeHtml(safePurpose)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="margin-bottom: 24px;">
      <h2 style="margin: 0; color: #0284c7; font-size: 22px;">Retail Insight</h2>
      <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Hệ thống Quản lý Bán lẻ Thông minh</p>
    </div>
    
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      Xin chào <strong>${escapeHtml(fullName || 'Quý khách')}</strong>,
    </p>
    
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px;">
      Bạn (hoặc ai đó) vừa yêu cầu <strong>${escapeHtml(safePurpose)}</strong> cho tài khoản Retail Insight liên kết với email này. Vui lòng sử dụng mã xác thực dưới đây để tiếp tục:
    </p>
    
    <div style="text-align: center; margin: 28px 0;">
      <div style="display: inline-block; padding: 14px 32px; background: #f0f9ff; border: 2px dashed #0284c7; border-radius: 8px; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0369a1;">
        ${otpCode}
      </div>
      <p style="margin: 8px 0 0; font-size: 12px; color: #64748b;">Mã này có hiệu lực trong vòng <strong>5 phút</strong>.</p>
    </div>
    
    <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 8px;">
      Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email hoặc liên hệ ngay với quản trị viên để bảo vệ tài khoản.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
    <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
      © 2026 Retail Insight · Email tự động, vui lòng không trả lời.
    </p>
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
        body: JSON.stringify({ to: toEmail, subject, html: htmlBody }),
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
        body: JSON.stringify({ from: resendFrom, to: [toEmail], subject, html: htmlBody }),
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
              const msg = [
                `From: ${cleanHeader(smtpFrom)}`,
                `To: <${toEmail}>`,
                `Subject: ${subjectEncoded}`,
                `MIME-Version: 1.0`,
                `Content-Type: text/html; charset=UTF-8`,
                `Content-Transfer-Encoding: 8bit`,
                ``,
                htmlBody,
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
