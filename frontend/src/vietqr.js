import QRCode from 'qrcode';

const CACHE_PREFIX = 'ri_payment_settings_branch_';

export function cachePaymentSettings(branchId, settings) {
  if (!branchId || !settings) return;
  try {
    const cached = {
      branch_id: Number(branchId),
      bank_bin: String(settings.bank_bin || ''),
      bank_code: String(settings.bank_code || ''),
      bank_account_number: String(settings.bank_account_number || ''),
      bank_account_name: String(settings.bank_account_name || ''),
      static_qr_url: String(settings.static_qr_url || ''),
    };
    localStorage.setItem(`${CACHE_PREFIX}${branchId}`, JSON.stringify(cached));
  } catch {
    // Online payment remains available if browser storage is unavailable/full.
  }
}

export function readCachedPaymentSettings(branchId) {
  if (!branchId) return null;
  try {
    const value = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${branchId}`) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function tlv(tag, value) {
  const text = String(value);
  return `${tag}${String(text.length).padStart(2, '0')}${text}`;
}

function cleanPaymentInfo(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, match => match === 'đ' ? 'd' : 'D')
    .replace(/[^A-Za-z0-9 .:/_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 25);
}

function crc16CcittFalse(text) {
  let crc = 0xffff;
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildVietQrPayload({ bankBin, accountNumber, amount, addInfo }) {
  const bin = String(bankBin || '').trim();
  const account = String(accountNumber || '').trim();
  const total = Math.round(Number(amount));
  if (!/^\d{6}$/.test(bin) || !/^[A-Za-z0-9-]{4,40}$/.test(account) || !Number.isSafeInteger(total) || total < 1) {
    return null;
  }

  const beneficiary = tlv('00', bin) + tlv('01', account);
  const napas = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  let payload = tlv('00', '01') + tlv('01', '12') + tlv('38', napas)
    + tlv('53', '704') + tlv('54', String(total)) + tlv('58', 'VN');
  const paymentInfo = cleanPaymentInfo(addInfo);
  if (paymentInfo) payload += tlv('62', tlv('08', paymentInfo));
  const crcInput = `${payload}6304`;
  return `${crcInput}${crc16CcittFalse(crcInput)}`;
}

export async function createVietQrDataUrl(options) {
  const payload = buildVietQrPayload(options);
  if (!payload) return '';
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}
