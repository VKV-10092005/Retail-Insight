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
  const resendApiKey = process.env.RESEND_API_KEY;
  const useResend = Boolean(resendApiKey);
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || `Retail Insight <${user || ''}>`;
  const fromEmail = mailbox(from);

  if (!useResend && (!user || !pass)) {
    return {
      sent: false,
      configured: false,
      reason: 'Chưa cấu hình SMTP_USER và SMTP_PASS trong backend/.env'
    };
  }

  if (!emailPattern.test(fromEmail) || !emailPattern.test(toEmail)) {
    return { sent: false, configured: true, error: 'Địa chỉ email gửi hoặc nhận không hợp lệ' };
  }
  if (!useResend && (port !== 465 || !emailPattern.test(user))) {
    return { sent: false, configured: true, error: 'Cấu hình SMTP không hợp lệ; Gmail yêu cầu TLS port 465 và địa chỉ email hợp lệ' };
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

  if (useResend) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [toEmail], subject, html: htmlBody }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return { sent: false, configured: true, error: `Resend request failed (${response.status})` };
      return { sent: true, configured: true };
    } catch {
      return { sent: false, configured: true, error: 'Resend request could not be completed' };
    }
  }

  return new Promise((resolve) => {
    let socket;
    const timeoutTimer = setTimeout(() => {
      try { socket?.destroy(); } catch {}
      resolve({ sent: false, configured: true, error: 'SMTP timeout sau 10s' });
    }, 10000);

    const cleanup = (result) => {
      clearTimeout(timeoutTimer);
      try { socket?.end(); } catch {}
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
              socket.write(`MAIL FROM:<${fromEmail}>\r\n`);
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
                `From: ${cleanHeader(from)}`,
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
              cleanup({ sent: true, configured: true });
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
