import { Router } from 'express';
import { randomInt, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { authenticate } from '../middlewares/auth.js';
import { asyncRoute, HttpError } from '../utils/http.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { canExposeDevOtp } from '../utils/otp-security.js';

const router = Router();
const authThrottle = ({windowMs,limit,skipSuccessfulRequests=false}) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests,
  message: { message: 'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau.' }
});
const loginLimiter=authThrottle({windowMs:15*60*1000,limit:10,skipSuccessfulRequests:true});
const otpLimiter=authThrottle({windowMs:10*60*1000,limit:5});
router.use(['/login','/google'],loginLimiter);
router.use(['/request-unlock','/forgot-password/send-otp','/forgot-password/verify-otp','/forgot-password/reset','/send-register-otp','/verify-register-otp','/send-password-otp','/verify-password-otp'],otpLimiter);

const emailSchema = z.string().trim().toLowerCase().email('Địa chỉ email không hợp lệ').max(254);

export const strongPasswordSchema = z.string()
  .min(12, 'Mật khẩu phải có tối thiểu 12 ký tự')
  .refine(v => Buffer.byteLength(v) <= 72, 'Mật khẩu tối đa 72 byte')
  .refine(v => /[A-Z]/.test(v), 'Mật khẩu phải chứa ít nhất 1 chữ cái viết hoa (A-Z)')
  .refine(v => /[0-9]/.test(v), 'Mật khẩu phải chứa ít nhất 1 chữ số (0-9)')
  .refine(v => /[^A-Za-z0-9]/.test(v), 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (!@#$%^&*...)');

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).refine(v => Buffer.byteLength(v) <= 72, 'Mật khẩu tối đa 72 byte')
}).strict();

const registrationSchema = z.object({
  verification_token: z.string().min(1, 'Yêu cầu mã xác thực email OTP trước khi hoàn tất đăng ký'),
  name: z.string().trim().min(2, 'Họ và tên tối thiểu 2 ký tự').max(120),
  storeName: z.string().trim().min(2, 'Tên cửa hàng tối thiểu 2 ký tự').max(160),
  password: strongPasswordSchema,
  confirm_password: z.string()
}).refine(d => d.password === d.confirm_password, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirm_password']
});

const cookieOptions = { httpOnly: true, secure: config.production, sameSite: config.production ? 'none' : 'lax', path: '/' };

async function session(res, user) {
  const id = randomUUID();
  await pool.execute(
    'INSERT INTO auth_sessions(id,organization_id,user_id,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))',
    [id, user.organization_id ?? null, user.id]
  );
  const token = jwt.sign(
    {},
    config.secret,
    { algorithm: 'HS256', subject: String(user.id), jwtid: id, issuer: 'retail-app', audience: 'retail-web', expiresIn: '8h' }
  );
  const refreshToken = jwt.sign(
    { purpose: 'refresh', session_id: id },
    config.secret,
    { algorithm: 'HS256', subject: String(user.id), jwtid: randomUUID(), issuer: 'retail-app', audience: 'retail-web', expiresIn: '7d' }
  );
  res.cookie('session', token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
  return { id, token, accessToken: token, refreshToken };
}

const dummyHash = await bcrypt.hash(randomUUID(), 12);

// 1. GỬI MÃ OTP ĐĂNG KÝ MỚI
router.post('/send-register-otp', asyncRoute(async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body);

  const [existing] = await pool.execute('SELECT id FROM users WHERE email=?', [email]);
  if (existing.length) {
    throw new HttpError(409, 'Email này đã được đăng ký tài khoản. Vui lòng đăng nhập.');
  }

  const otp = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(otp, 10);

  // Vô hiệu hóa các OTP đăng ký cũ chưa dùng
  await pool.execute(
    'UPDATE registration_otps SET consumed_at=UTC_TIMESTAMP() WHERE email=? AND consumed_at IS NULL',
    [email]
  );

  await pool.execute(
    'INSERT INTO registration_otps(email, otp_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))',
    [email, hash]
  );

  const mailRes = await sendOtpEmail(email, otp, '', 'đăng ký tài khoản Retail Insight');

  if (mailRes.sent) {
    res.json({
      success: true,
      message: `Mã xác thực 6 số đã được gửi tới ${email}. Mã có hiệu lực trong 5 phút.`,
      smtp_configured: true
    });
  } else {
    res.json({
      success: true,
      message: mailRes.configured
        ? 'Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.'
        : `Chưa cấu hình SMTP Gmail trong backend/.env.`,
      smtp_configured: mailRes.configured,
      ...(canExposeDevOtp(mailRes) ? { dev_otp: otp } : {})
    });
  }
}));

// 2. XÁC NHẬN MÃ OTP ĐĂNG KÝ -> CẤP VERIFICATION_TOKEN
router.post('/verify-register-otp', asyncRoute(async (req, res) => {
  const schema = z.object({
    email: emailSchema,
    otp: z.string().trim().min(6, 'Mã OTP gồm 6 chữ số').max(6)
  });
  const data = schema.parse(req.body);

  const [rows] = await pool.execute(
    'SELECT id, otp_hash, expires_at FROM registration_otps WHERE email=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1',
    [data.email]
  );

  if (!rows.length) {
    throw new HttpError(400, 'Mã xác thực không tồn tại hoặc đã hết hạn (quá 5 phút). Vui lòng gửi lại mã mới.');
  }

  const valid = await bcrypt.compare(data.otp, rows[0].otp_hash);
  if (!valid) {
    throw new HttpError(400, 'Mã xác thực OTP không chính xác. Vui lòng kiểm tra lại.');
  }

  // Đánh dấu đã dùng
  await pool.execute('UPDATE registration_otps SET consumed_at=UTC_TIMESTAMP() WHERE id=?', [rows[0].id]);

  const verificationToken = jwt.sign(
    { email: data.email, purpose: 'registration_verified' },
    config.secret,
    { expiresIn: '15m' }
  );

  res.json({
    valid: true,
    verification_token: verificationToken,
    message: 'Xác thực email thành công! Vui lòng hoàn tất thông tin cửa hàng.'
  });
}));

// 3. ĐĂNG KÝ HOÀN TẤT TÀI KHOẢN VÀ CỬA HÀNG (DÙNG CHO CẢ FORM REGISTER VÀ GOOGLE COMPLETE)
async function completeStoreRegistration(req, res) {
  const data = registrationSchema.parse(req.body);

  let claims;
  try {
    claims = jwt.verify(data.verification_token, config.secret);
  } catch {
    throw new HttpError(400, 'Phiên xác thực email đã hết hạn (quá 15 phút). Vui lòng xác thực lại mã OTP.');
  }

  if (claims.purpose !== 'registration_verified' || !claims.email) {
    throw new HttpError(403, 'Token xác thực không hợp lệ');
  }

  const email = claims.email.toLowerCase().trim();
  const hash = await bcrypt.hash(data.password, 12);
  const c = await pool.getConnection();
  let user;

  try {
    await c.beginTransaction();
    const [org] = await c.execute('INSERT INTO organizations(name,slug) VALUES (?,?)', [data.storeName, randomUUID()]);
    const [u] = await c.execute(
      "INSERT INTO users(organization_id,email,password_hash,full_name,role) VALUES (?,?,?,?,'OWNER')",
      [org.insertId, email, hash, data.name]
    );
    const [branch] = await c.execute('INSERT INTO branches(organization_id,name) VALUES (?,?)', [org.insertId, data.storeName]);
    await c.execute(
      "INSERT INTO user_branch_roles(organization_id,user_id,branch_id,role) VALUES (?,?,?,'OWNER')",
      [org.insertId, u.insertId, branch.insertId]
    );
    user = { id: u.insertId, organization_id: org.insertId, email, full_name: data.name, role: 'OWNER' };
    await c.commit();
  } catch (err) {
    await c.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Email này đã được sử dụng');
    throw err;
  } finally {
    c.release();
  }

  // Đăng nhập tự động ngay sau khi đăng ký
  const sess = await session(res, user);
  res.status(201).json({
    status: 'LOGGED_IN',
    message: 'Khởi tạo cửa hàng thành công! Đang chuyển hướng vào hệ thống.',
    user: { id: user.id, email: user.email, name: user.full_name, role: user.role },
    token: sess.token,
    accessToken: sess.accessToken,
    refreshToken: sess.refreshToken
  });
}

router.post('/register', asyncRoute(completeStoreRegistration));
router.post('/google/complete', asyncRoute(completeStoreRegistration));

// 4. XÁC THỰC GOOGLE OAUTH 2.0 (GOOGLE ID TOKEN)
router.post('/google', asyncRoute(async (req, res) => {
  const { id_token } = z.object({ id_token: z.string().min(1, 'Thiếu Google ID Token') }).parse(req.body);

  let googlePayload;
  if (id_token === 'mock_google_token' && process.env.NODE_ENV !== 'production') {
    googlePayload = {
      email: 'test_google_owner@gmail.com',
      name: 'Nguyễn Văn Google',
      email_verified: 'true'
    };
  } else {
    try {
      const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new HttpError(401, errData.error_description || 'Xác thực Google ID Token không thành công');
      }
      googlePayload = await resp.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(502, 'Không thể kết nối đến máy chủ xác thực Google');
    }
  }

  if (googlePayload.email_verified !== 'true' && googlePayload.email_verified !== true) {
    throw new HttpError(400, 'Tài khoản Google này chưa được xác thực địa chỉ email');
  }

  if (process.env.GOOGLE_CLIENT_ID && googlePayload.aud && googlePayload.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new HttpError(401, 'Google Client ID không khớp với cấu hình hệ thống');
  }

  const googleEmail = googlePayload.email.toLowerCase().trim();
  const googleName = (googlePayload.name || googleEmail.split('@')[0]).trim();

  // Kiểm tra xem email Google đã có tài khoản trong hệ thống chưa
  const [rows] = await pool.execute(
    'SELECT u.* FROM users u LEFT JOIN organizations o ON o.id=u.organization_id WHERE u.email=? AND (o.status=? OR u.role=?)',
    [googleEmail, 'ACTIVE', 'PLATFORM_ADMIN']
  );

  if (rows.length && rows[0].status === 'ACTIVE') {
    const u = rows[0];
    const sess = await session(res, u);
    await pool.execute('UPDATE users SET last_login_at=UTC_TIMESTAMP() WHERE id=?', [u.id]);
    return res.json({
      status: 'LOGGED_IN',
      message: 'Đăng nhập Google thành công',
      user: { id: u.id, email: u.email, name: u.full_name, role: u.role },
      token: sess.token,
      accessToken: sess.accessToken,
      refreshToken: sess.refreshToken
    });
  }

  // Nếu tài khoản Google chưa có shop: Tự động gửi OTP 6 số để xác minh quyền sở hữu và chuyển sang bước hoàn thiện shop
  const otp = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(otp, 10);

  await pool.execute(
    'UPDATE registration_otps SET consumed_at=UTC_TIMESTAMP() WHERE email=? AND consumed_at IS NULL',
    [googleEmail]
  );
  await pool.execute(
    'INSERT INTO registration_otps(email, otp_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))',
    [googleEmail, hash]
  );

  const mailRes = await sendOtpEmail(googleEmail, otp, googleName, 'kết nối Google & tạo cửa hàng');

  res.json({
    status: 'NEED_OTP_AND_ONBOARDING',
    email: googleEmail,
    full_name: googleName,
    message: mailRes.sent
      ? `Mã xác thực 6 số đã được gửi đến Gmail ${googleEmail}. Vui lòng kiểm tra hộp thư để hoàn thiện thông tin Shop.`
      : (mailRes.configured ? 'Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.' : `Chưa cấu hình SMTP Gmail trong backend/.env.`),
    smtp_configured: mailRes.configured,
    ...(canExposeDevOtp(mailRes) ? { dev_otp: otp } : {})
  });
}));

// 5. ĐĂNG NHẬP TRUYỀN THỐNG BẰNG EMAIL & MẬT KHẨU
router.post('/login', asyncRoute(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const [rows] = await pool.execute(
    'SELECT u.* FROM users u LEFT JOIN organizations o ON o.id=u.organization_id WHERE u.email=? AND (o.status=? OR u.role=?)',
    [data.email, 'ACTIVE', 'PLATFORM_ADMIN']
  );
  const u = rows[0];
  const valid = await bcrypt.compare(data.password, u?.password_hash || dummyHash);
  if (!u || !valid || u.status !== 'ACTIVE') throw new HttpError(401, 'Email hoặc mật khẩu không đúng');

  // Kiểm tra tài khoản có đang bị tạm khóa an ninh không
  const sess = await session(res, u);
  const loginSessionId = sess.id;
  res.clearCookie('owner_session', cookieOptions);
  if ((Number(u.is_locked) === 1 && (!u.locked_until || new Date(u.locked_until) > new Date())) || (u.locked_until && new Date(u.locked_until) > new Date())) {
    if(u.unlock_requested_at){await pool.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?',[loginSessionId]);res.clearCookie('session',cookieOptions);res.clearCookie('refreshToken',cookieOptions);}
    return res.status(423).json({code:'ACCOUNT_TEMP_LOCKED',reason:u.lock_reason,locked_at:u.locked_at||u.locked_until,unlock_requested:Boolean(u.unlock_requested_at),message:'Tài khoản của bạn đã bị khóa tạm thời.'});
  }
  await pool.execute('UPDATE users SET last_login_at=UTC_TIMESTAMP() WHERE id=?', [u.id]);
  res.json({
    message: 'Đăng nhập thành công',
    token: sess.token,
    accessToken: sess.accessToken,
    refreshToken: sess.refreshToken,
    user: { id: u.id, email: u.email, name: u.full_name, role: u.role }
  });
}));

router.post('/request-unlock', authenticate, asyncRoute(async (req,res) => {
  if (req.user.role === 'PLATFORM_ADMIN') throw new HttpError(400,'Tài khoản quản trị nền tảng không thể yêu cầu mở khóa.');
  const {note}=z.object({note:z.string().trim().min(2).max(500)}).parse(req.body);
  const [[user]]=await pool.execute('SELECT id,organization_id,full_name,email,is_locked,locked_until FROM users WHERE id=?',[req.user.id]);
  if(!user || !((Number(user.is_locked)===1 && (!user.locked_until || new Date(user.locked_until)>new Date())) || (user.locked_until && new Date(user.locked_until)>new Date()))) throw new HttpError(400,'Tài khoản hiện không bị khóa.');
  await pool.execute('UPDATE users SET unlock_request_note=?,unlock_requested_at=UTC_TIMESTAMP() WHERE id=?',[note,req.user.id]);
  await pool.execute(`INSERT INTO security_notifications(user_id,username,organization_id,event_type,title,message,severity)
    VALUES(?,?,?,'ACCOUNT_UNLOCK_REQUEST',?,?, 'HIGH')`,[user.id,user.full_name||user.email,user.organization_id,'Yêu cầu mở khóa tài khoản',`${user.full_name||user.email} gửi yêu cầu mở khóa: ${note}`]);
  await pool.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=? AND user_id=?',[req.sessionId,req.user.id]);
  res.clearCookie('session',cookieOptions);
  res.clearCookie('owner_session',cookieOptions);
  res.json({success:true,message:'Đã gửi yêu cầu mở khóa tới Quản trị viên nền tảng.'});
}));

// 5.1 LÀM MỚI PHIÊN ĐĂNG NHẬP (HỖ TRỢ IPHONE/SAFARI CHẶN COOKIE)
router.post('/refresh', asyncRoute(async (req, res) => {
  const incomingToken = req.body?.refreshToken || req.headers['x-refresh-token'] || req.cookies?.refreshToken;
  if (!incomingToken) throw new HttpError(401, 'Thiếu refresh token');

  let claims;
  try {
    claims = jwt.verify(incomingToken, config.secret, { algorithms: ['HS256'], issuer: 'retail-app', audience: 'retail-web' });
  } catch {
    throw new HttpError(401, 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
  }

  const userId = claims.sub;
  const [users] = await pool.execute(
    'SELECT u.* FROM users u LEFT JOIN organizations o ON o.id=u.organization_id WHERE u.id=? AND u.status=? AND (o.status=? OR u.role=?)',
    [userId, 'ACTIVE', 'ACTIVE', 'PLATFORM_ADMIN']
  );
  if (!users.length) throw new HttpError(401, 'Tài khoản không hợp lệ hoặc đã bị khóa');

  const u = users[0];
  const sess = await session(res, u);
  res.json({
    message: 'Làm mới token thành công',
    token: sess.token,
    accessToken: sess.accessToken,
    refreshToken: sess.refreshToken,
    user: { id: u.id, email: u.email, name: u.full_name, role: u.role }
  });
}));

// 6. LẤY THÔNG TIN TÀI KHOẢN ĐANG ĐĂNG NHẬP (/me)
router.get('/me', authenticate, asyncRoute(async (req, res) => {
  const u = req.user;
  if (u.role === 'PLATFORM_ADMIN') {
    return res.json({ user: { ...u, name: u.full_name, phone: u.phone || null, tenantId: null, stores: [], branches: [] } });
  }
  const [branches] = u.role === 'OWNER'
    ? await pool.execute("SELECT id,name FROM branches WHERE organization_id=? AND status='ACTIVE'", [u.organization_id])
    : await pool.execute(
        "SELECT b.id,b.name,r.role FROM branches b JOIN user_branch_roles r ON r.branch_id=b.id AND r.organization_id=b.organization_id WHERE r.organization_id=? AND r.user_id=? AND b.status='ACTIVE'",
        [u.organization_id, u.id]
      );
  const [[organization]] = await pool.execute('SELECT name,address FROM organizations WHERE id=?',[u.organization_id]);
  res.json({ user: { ...u, name: u.full_name, phone: u.phone || null, branch_id: branches.length===1?Number(branches[0].id):null, storeName: organization?.name || '', organizationAddress: organization?.address || '', tenantId: u.organization_id, stores: branches.map(b => String(b.id)), branches, impersonating: Boolean(req.cookies.owner_session) } });
}));

// 7. CẬP NHẬT THÔNG TIN HỒ SƠ (/profile)
const updateProfileHandler=asyncRoute(async (req, res) => {
  const schema = z.object({
    full_name: z.string().trim().min(2, 'Họ và tên tối thiểu 2 ký tự').max(120),
    phone: z.string().trim().max(50).optional().nullable(),
    avatar_url: z.string().max(500000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    organization_name: z.string().trim().min(2).max(160).optional(),
    organization_address: z.string().trim().max(500).optional().nullable()
  });
  const data = schema.parse(req.body);
  if (data.organization_name !== undefined && (req.user.role !== 'OWNER' || !req.user.organization_id)) throw new HttpError(403, 'Chỉ chủ cửa hàng được cập nhật thông tin tổ chức');
  await pool.execute('UPDATE users SET full_name=?, phone=?, avatar_url=IF(?,?,avatar_url), bio=? WHERE id=?', [data.full_name, data.phone || null, data.avatar_url !== undefined, data.avatar_url === undefined ? null : data.avatar_url, data.bio === undefined ? req.user.bio || null : data.bio || null, req.user.id]);
  if (data.organization_name !== undefined) {
    await pool.execute('UPDATE organizations SET name=?,address=? WHERE id=?',[data.organization_name,data.organization_address || null,req.user.organization_id]);
  }
  const [[savedUser]]=await pool.execute('SELECT id,organization_id,email,full_name,phone,avatar_url,bio,role FROM users WHERE id=?',[req.user.id]);
  const [[savedOrganization]]=savedUser.organization_id?await pool.execute('SELECT name,address FROM organizations WHERE id=?',[savedUser.organization_id]):[[null]];
  res.json({message:'Cập nhật thông tin hồ sơ thành công',user:{...savedUser,name:savedUser.full_name,phone:savedUser.phone||null,avatar_url:savedUser.avatar_url||null,bio:savedUser.bio||null,...(savedOrganization?{storeName:savedOrganization.name||'',organizationAddress:savedOrganization.address||''}:{})}});
});
router.patch('/profile', authenticate, updateProfileHandler);
router.put('/profile', authenticate, updateProfileHandler);

router.put('/avatar', authenticate, asyncRoute(async (req, res) => {
  const { avatar_url } = z.object({ avatar_url: z.string().max(500000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).nullable() }).strict().parse(req.body);
  await pool.execute('UPDATE users SET avatar_url=? WHERE id=?', [avatar_url, req.user.id]);
  res.json({ avatar_url });
}));

// 8. ĐỔI MẬT KHẨU 2 BƯỚC: GỬI MÃ OTP
router.post('/send-password-otp', authenticate, asyncRoute(async (req, res) => {
  const otp = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(otp, 10);

  await pool.execute(
    'UPDATE password_otps SET consumed_at=UTC_TIMESTAMP() WHERE user_id=? AND consumed_at IS NULL',
    [req.user.id]
  );
  await pool.execute(
    'INSERT INTO password_otps(user_id,email,otp_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))',
    [req.user.id, req.user.email, hash]
  );

  const mailResult = await sendOtpEmail(req.user.email, otp, req.user.full_name, 'đổi mật khẩu');
  if (mailResult.sent) {
    res.json({
      success: true,
      message: `Mã xác thực 6 số đã được gửi tới Gmail ${req.user.email}. Mã có hiệu lực trong 5 phút.`,
      smtp_configured: true
    });
  } else {
    res.json({
      success: true,
      message: mailResult.configured
        ? 'Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.'
        : `Chưa cấu hình SMTP Gmail trong backend/.env.`,
      smtp_configured: mailResult.configured,
      ...(canExposeDevOtp(mailResult) ? { dev_otp: otp } : {})
    });
  }
}));

// 9. ĐỔI MẬT KHẨU 2 BƯỚC: XÁC MINH MÃ OTP
router.post('/verify-password-otp', authenticate, asyncRoute(async (req, res) => {
  const { otp } = z.object({ otp: z.string().trim().min(6, 'Mã OTP gồm 6 chữ số').max(6) }).parse(req.body);
  const [rows] = await pool.execute(
    'SELECT id,otp_hash,expires_at FROM password_otps WHERE user_id=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1',
    [req.user.id]
  );
  if (!rows.length) throw new HttpError(400, 'Mã xác thực không tồn tại hoặc đã hết hạn (quá 5 phút). Vui lòng gửi lại mã mới.');
  const valid = await bcrypt.compare(otp, rows[0].otp_hash);
  if (!valid) throw new HttpError(400, 'Mã xác thực OTP không chính xác. Vui lòng kiểm tra lại.');

  const otpToken = jwt.sign(
    { sub: String(req.user.id), otp_id: rows[0].id, purpose: 'pwd_change' },
    config.secret,
    { expiresIn: '10m' }
  );
  res.json({
    valid: true,
    otp_token: otpToken,
    message: 'Xác thực mã OTP thành công. Vui lòng nhập mật khẩu mới.'
  });
}));

// 10. ĐỔI MẬT KHẨU 2 BƯỚC: THỰC THI ĐỔI MẬT KHẨU (KIỂM TRA MẬT KHẨU MẠNH)
router.post('/change-password', authenticate, asyncRoute(async (req, res) => {
  const schema = z.object({
    otp_token: z.string().min(1, 'Yêu cầu xác thực OTP qua Gmail trước khi đổi mật khẩu'),
    current_password: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    new_password: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự').refine(v => Buffer.byteLength(v) <= 72, 'Mật khẩu tối đa 72 byte'),
    confirm_password: z.string()
  }).refine(d => d.new_password === d.confirm_password, { message: 'Mật khẩu xác nhận không khớp', path: ['confirm_password'] });
  const data = schema.parse(req.body);

  let tokenClaims;
  try {
    tokenClaims = jwt.verify(data.otp_token, config.secret);
  } catch {
    throw new HttpError(400, 'Phiên xác thực OTP đã hết hạn hoặc không hợp lệ. Vui lòng lấy mã OTP mới.');
  }
  if (String(tokenClaims.sub) !== String(req.user.id) || tokenClaims.purpose !== 'pwd_change') {
    throw new HttpError(403, 'Mã xác thực không hợp lệ cho tài khoản này.');
  }

  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
  if (!rows.length || !(await bcrypt.compare(data.current_password, rows[0].password_hash))) {
    throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  }

  if (data.current_password === data.new_password) {
    throw new HttpError(400, 'Mật khẩu mới không được trùng với mật khẩu hiện tại');
  }

  if (tokenClaims.otp_id) {
    await pool.execute('UPDATE password_otps SET consumed_at=UTC_TIMESTAMP() WHERE id=?', [tokenClaims.otp_id]);
  }

  const hash = await bcrypt.hash(data.new_password, 12);
  await pool.execute('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.id]);
  await pool.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL',[req.user.id]);
  await session(res,req.user);
  res.json({ message: 'Đã đổi mật khẩu thành công' });
}));

// 11. ĐĂNG XUẤT
router.post('/logout', authenticate, asyncRoute(async (req, res) => {
  await pool.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=? AND user_id=?', [req.sessionId, req.user.id]);
  if(req.cookies.owner_session){
    try{
      const ownerClaims=jwt.verify(req.cookies.owner_session,config.secret,{algorithms:['HS256'],issuer:'retail-app',audience:'retail-web'});
      await pool.execute('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE id=? AND user_id=? AND organization_id=?',[ownerClaims.jti,ownerClaims.sub,req.user.organization_id]);
    }catch{}
  }
  res.clearCookie('session', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
  res.clearCookie('owner_session', cookieOptions);
  res.status(204).end();
}));

// 12. QUÊN MẬT KHẨU – GỬI MÃ OTP VỀ GMAIL (KHÔNG YÊU CẦU ĐĂNG NHẬP)
router.post('/forgot-password/send-otp', asyncRoute(async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body);

  // Kiểm tra email tồn tại và tài khoản đang hoạt động
  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.status FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE u.email = ? AND (o.status = 'ACTIVE' OR u.role = 'PLATFORM_ADMIN')
     LIMIT 1`,
    [email]
  );
  if (!rows.length || rows[0].status !== 'ACTIVE') {
    await bcrypt.compare(randomUUID(), dummyHash);
    return res.json({success:true,message:'Nếu tài khoản hợp lệ, mã xác thực sẽ được gửi tới email đã đăng ký.'});
  }

  const user = rows[0];
  const otp = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(otp, 10);

  // Vô hiệu hóa các OTP quên mật khẩu cũ
  await pool.execute(
    'UPDATE password_otps SET consumed_at=UTC_TIMESTAMP() WHERE user_id=? AND consumed_at IS NULL',
    [user.id]
  );
  await pool.execute(
    'INSERT INTO password_otps(user_id, email, otp_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))',
    [user.id, email, hash]
  );

  const mailRes = await sendOtpEmail(email, otp, user.full_name || '', 'đặt lại mật khẩu Retail Insight');

  if (mailRes.sent) {
    res.json({
      success: true,
      message: `Mã xác thực 6 số đã được gửi tới ${email}. Mã có hiệu lực trong 5 phút.`
    });
  } else {
    throw new HttpError(502,
      mailRes.configured
        ? 'Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.'
        : 'Chưa cấu hình SMTP Gmail trong backend/.env. Vui lòng liên hệ quản trị viên.'
    );
  }
}));

// 13. QUÊN MẬT KHẨU – BƯỚC 2: XÁC THỰC MÃ OTP TỪ GMAIL -> TRẢ VỀ RESET_TOKEN
router.post('/forgot-password/verify-otp', asyncRoute(async (req, res) => {
  const schema = z.object({
    email: emailSchema,
    otp: z.string().trim().min(6, 'Mã OTP gồm 6 chữ số').max(6)
  });
  const data = schema.parse(req.body);

  const [users] = await pool.execute(
    'SELECT id, status FROM users WHERE email=? AND status=? LIMIT 1',
    [data.email, 'ACTIVE']
  );
  if (!users.length) throw new HttpError(404, 'Email không tồn tại hoặc tài khoản đang bị khóa.');

  const userId = users[0].id;

  const [otpRows] = await pool.execute(
    'SELECT id, otp_hash FROM password_otps WHERE user_id=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1',
    [userId]
  );
  if (!otpRows.length) {
    throw new HttpError(400, 'Mã xác thực không tồn tại hoặc đã hết hạn (quá 5 phút). Vui lòng yêu cầu gửi lại mã.');
  }

  const valid = await bcrypt.compare(data.otp, otpRows[0].otp_hash);
  if (!valid) {
    throw new HttpError(400, 'Mã xác thực OTP không chính xác. Vui lòng kiểm tra lại Gmail.');
  }

  // Đánh dấu mã OTP đã được xác thực
  await pool.execute('UPDATE password_otps SET consumed_at=UTC_TIMESTAMP() WHERE id=?', [otpRows[0].id]);

  // Sinh reset_token tạm thời (có hiệu lực 10 phút)
  const resetToken = jwt.sign(
    { sub: String(userId), email: data.email, otp_id: otpRows[0].id, purpose: 'forgot_pwd_reset' },
    config.secret,
    { expiresIn: '10m' }
  );

  res.json({
    success: true,
    reset_token: resetToken,
    message: 'Xác thực mã OTP thành công. Vui lòng đặt mật khẩu mới.'
  });
}));

// 14. QUÊN MẬT KHẨU – BƯỚC 3: ĐẶT LẠI MẬT KHẨU MỚI BẰNG RESET_TOKEN
router.post('/forgot-password/reset', asyncRoute(async (req, res) => {
  const schema = z.object({
    email: emailSchema,
    reset_token: z.string().min(1, 'Thiếu token xác thực OTP'),
    new_password: strongPasswordSchema,
    confirm_password: z.string()
  }).refine(d => d.new_password === d.confirm_password, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirm_password']
  });

  const data = schema.parse(req.body);

  let tokenClaims;
  try {
    tokenClaims = jwt.verify(data.reset_token, config.secret);
  } catch {
    throw new HttpError(400, 'Phiên xác thực đã hết hạn hoặc không hợp lệ. Vui lòng gửi lại mã OTP.');
  }

  if (tokenClaims.purpose !== 'forgot_pwd_reset' || tokenClaims.email !== data.email) {
    throw new HttpError(403, 'Token xác thực không hợp lệ cho tài khoản này.');
  }

  const userId = tokenClaims.sub;

  const [users] = await pool.execute('SELECT id FROM users WHERE id=? AND status=? LIMIT 1', [userId, 'ACTIVE']);
  if (!users.length) throw new HttpError(404, 'Tài khoản không tồn tại hoặc đang bị khóa.');

  // Cập nhật mật khẩu mới
  const newHash = await bcrypt.hash(data.new_password, 12);
  await pool.execute('UPDATE users SET password_hash=? WHERE id=?', [newHash, userId]);

  // Thu hồi tất cả phiên đăng nhập cũ (bảo mật)
  await pool.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL', [userId]);

  res.json({ message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.' });
}));

export default router;
