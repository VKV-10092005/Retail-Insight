/**
 * ====================================================================
 * RETAIL INSIGHT — AI SECURITY GUARD (ENTERPRISE EDITION)
 * Lớp bảo vệ chuyên sâu và chủ động cho AI Assistant & Hệ thống:
 * 1. Nhận diện các nhóm hành vi bất thường & Tấn công (Injection, Leakage, SQL, RBAC, Multi-Tenant)
 * 2. Ghi nhận Security Logs chi tiết vào audit_logs với Severity (LOW, MEDIUM, HIGH, CRITICAL)
 * 3. Tự động gửi cảnh báo khẩn cấp cho ADMIN (security_notifications)
 * 4. Cơ chế phát hiện tái phạm & Tự động khóa tài khoản tạm thời 15 phút
 * 5. Thu hồi phiên đăng nhập & Chặn truy cập tức thì ở Backend
 * 6. Khôi phục tự động sau khi hết thời gian khóa và hỗ trợ ADMIN mở khóa thủ công
 * ====================================================================
 */

import { pool } from '../db/pool.js';
import {getPlatformSettings} from './appSettings.js';
const lockableRoles=new Set(['OWNER','MANAGER','CASHIER','INVENTORY']);

// 1. IN-MEMORY RATE LIMITER (Tối đa 15 tin nhắn / phút cho mỗi user)
const userRateBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 phút
const MAX_REQUESTS_PER_WINDOW = 15;

setInterval(() => {
  const now = Date.now();
  for (const [userId, record] of userRateBuckets.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      userRateBuckets.delete(userId);
    }
  }
}, 5 * 60 * 1000).unref();

export function checkAiRateLimit(userId,limit=MAX_REQUESTS_PER_WINDOW) {
  limit=Math.max(1,Math.min(120,Number(limit)||MAX_REQUESTS_PER_WINDOW));
  if (!userId) return { allowed: true, remaining: limit };

  const now = Date.now();
  const key = String(userId);
  const record = userRateBuckets.get(key) || { count: 0, windowStart: now };

  if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record.count = 1;
    record.windowStart = now;
    userRateBuckets.set(key, record);
    return { allowed: true, remaining: limit - 1 };
  }

  if (record.count >= limit) {
    const retryAfterSec = Math.ceil((record.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSec, remaining: 0 };
  }

  record.count += 1;
  userRateBuckets.set(key, record);
  return { allowed: true, remaining: limit - record.count };
}

// 2. INPUT INSPECTION & HÀNH VI BẤT THƯỜNG
export function inspectInput(message, history = [], user = {}) {
  const rawText = String(message || '').trim();
  const historyText = Array.isArray(history)
    ? history.slice(-10).map((entry) => String(entry?.content || entry?.text || '')).join('\n')
    : '';
  const normalized = `${rawText}\n${historyText}`.toLowerCase();

  // A. Giới hạn độ dài tin nhắn (tối đa 1500 ký tự)
  if (rawText.length > 1500) {
    return {
      safe: false,
      reason: 'Nội dung câu hỏi vượt quá độ dài tối đa cho phép (1500 ký tự).',
      eventType: 'AI_INPUT_TOO_LONG',
      severity: 'MEDIUM',
      criticalDirectLock: false,
      sanitizedMessage: rawText.substring(0, 1500),
      sanitizedHistory: [],
    };
  }

  // B. Giới hạn lịch sử đối thoại (tối đa 10 tin nhắn gần nhất)
  const sanitizedHistory = Array.isArray(history) ? history.slice(-10) : [];

  // C. Nhận diện ngữ cảnh HỌC THUẬT / CÂU HỎI HỢP PHÁP (Zero False Positive)
  const isEducationalOrAcademic =
    /\b(làm\s*(sao|thế\s*nào)|cách\s*(phòng\s*chống|ngăn\s*chặn|khắc\s*phục|bảo\s*vệ|triển\s*khai|xử\s*lý)|tại\s*sao|nguyên\s*lý|khái\s*niệm|giải\s*thích|định\s*nghĩa|hướng\s*dẫn|tìm\s*hiểu|cho\s*biết\s*khái\s*niệm|how\s*to\s*(prevent|mitigate|protect|secure)|what\s*is|explain|why\s*is|best\s*practices?)\b/i.test(
      normalized
    );

  // D. Nhóm 1: Prompt Injection & System Prompt Leaking (Severity: HIGH)
  const promptInjectionPatterns = [
    /\b(ignore|disregard|forget|override)\s+(all\s+)?(previous|past|above|system)\s+(instructions|prompts|rules|commands)\b/i,
    /\b(bỏ\s*qua|quên|hủy\s*bỏ|bỏ\s*hết)\s+(toàn\s*bộ|tất\s*cả)?\s*(các\s*)?(hướng\s*dẫn|chỉ\s*thị|quy\s*tắc|lệnh|prompt|yêu\s*cầu)\s*(trước|hệ\s*thống|ban\s*đầu)?\b/i,
    /\b(you\s*are\s*now\s*dan|jailbreak\s*mode|chế\s*độ\s*dan|ai\s*không\s*giới\s*hạn|unfiltered\s*mode)\b/i,
    /\b(repeat|show|output|print|display|give\s*me|tell\s*me)\b.*?\b(system\s*prompt|initial\s*prompt|hidden\s*prompt|secret\s*instructions)\b/i,
    /\b(in\s*ra|cho\s*tôi\s*(xem|biết)|hiển\s*thị|tiết\s*lộ|trích\s*xuất)\s+(toàn\s*bộ\s*)?(system\s*prompt|prompt\s*gốc|chỉ\s*thị\s*hệ\s*thống|hướng\s*dẫn\s*ẩn)\b/i,
  ];

  for (const pattern of promptInjectionPatterns) {
    if (pattern.test(normalized)) {
      return {
        safe: false,
        reason:
          'Yêu cầu vi phạm quy tắc an toàn (Prompt Injection / Trích xuất System Prompt bị từ chối).',
        eventType: 'AI_PROMPT_INJECTION_BLOCKED',
        severity: 'HIGH',
        criticalDirectLock: false,
        sanitizedMessage: rawText,
        sanitizedHistory,
      };
    }
  }

  // E. Nhóm 2: Trích xuất bí mật hệ thống (.env, DB_PASSWORD, API Key, JWT Secret) (Severity: CRITICAL nếu đào sâu .env/db)
  const criticalSecretPatterns = [
    /\b(db_password|dbhost|dbuser|database_url|connection\s*string|\.env)\b/i,
    /\b(in\s*ra|cho\s*tôi\s*(xem|biết)|đọc\s*file|dump)\s*.*(\.env|db_password|jwt_secret)\b/i,
  ];

  if (!isEducationalOrAcademic) {
    for (const pattern of criticalSecretPatterns) {
      if (pattern.test(normalized)) {
        return {
          safe: false,
          reason: 'Yêu cầu trích xuất biến môi trường, khóa cấu hình cơ sở dữ liệu bị nghiêm cấm.',
          eventType: 'AI_SENSITIVE_DATA_REQUEST',
          severity: 'CRITICAL',
          criticalDirectLock: true, // Hành vi CRITICAL kích hoạt khóa ngay lập tức
          sanitizedMessage: rawText,
          sanitizedHistory,
        };
      }
    }

    const highSecretPatterns = [
      /\b(cho\s*tôi\s*(xem|biết)|in\s*ra|tiết\s*lộ|cung\s*cấp|xuất)\s*.*(gemini_api_key|groq_api_key|api\s*key|jwt_secret|access_token|refresh_token)\b/i,
      /\b(show|read|dump|print|reveal)\s*.*(api_key|secret_key|private_key|token)\b/i,
    ];

    for (const pattern of highSecretPatterns) {
      if (pattern.test(normalized)) {
        return {
          safe: false,
          reason: 'Yêu cầu truy cập khóa xác thực, token bí mật bị từ chối.',
          eventType: 'AI_SENSITIVE_DATA_REQUEST',
          severity: 'HIGH',
          criticalDirectLock: false,
          sanitizedMessage: rawText,
          sanitizedHistory,
        };
      }
    }
  }

  // F. Nhóm 3: Leo thang đặc quyền & Đổi Role (CASHIER -> ADMIN, Bỏ qua RBAC) (Severity: HIGH)
  const privilegeEscalationPatterns = [
    /\b(đổi\s*role|thay\s*đổi\s*role|chuyển\s*role|cấp\s*quyền\s*admin|set\s*role\s*=\s*['"]?admin['"]?|cashier\s*thành\s*(admin|owner))\b/i,
    /\b(tôi\s*là|coi\s*như\s*tôi\s*là|gán\s*cho\s*tôi\s*quyền|chuyển\s*tôi\s*thành)\s*(admin\s*tối\s*cao|super\s*admin|platform_admin|owner\s*hệ\s*thống|root)\b/i,
    /\b(act\s*as|assume\s*role|pretend\s*you\s*are)\s*(super\s*admin|platform_admin|system\s*root)\b/i,
    /\b(bỏ\s*qua\s*quyền\s*hạn|vượt\s*qua\s*rbac|bỏ\s*kiểm\s*tra\s*role|bỏ\s*qua\s*organization_id|bỏ\s*qua\s*branch_id)\b/i,
  ];

  for (const pattern of privilegeEscalationPatterns) {
    if (pattern.test(normalized)) {
      return {
        safe: false,
        reason: 'Hành vi giả danh quyền hạn, cố gắng đổi vai trò hoặc vượt qua cơ chế RBAC bị từ chối.',
        eventType: 'AI_PRIVILEGE_ESCALATION_BLOCKED',
        severity: 'HIGH',
        criticalDirectLock: false,
        sanitizedMessage: rawText,
        sanitizedHistory,
      };
    }
  }

  // G. Nhóm 4: Truy cập trái phép dữ liệu chi nhánh khác / khách hàng khác (Cross-tenant / Cross-branch) (Severity: HIGH)
  const crossTenantPatterns = [
    /\b(xem|lấy|truy\s*xuất|hiển\s*thị|tra\s*cứu)\b.*?\b(chi\s*nhánh\s*khác|cửa\s*hàng\s*khác|ngoài\s*quyền|ngoài\s*phạm\s*vi|toàn\s*hệ\s*thống)\b/i,
    /\b(dữ\s*liệu|khách\s*hàng|nhân\s*viên|doanh\s*thu|kho|hóa\s*đơn)\b.*?\b(chi\s*nhánh\s*khác|cửa\s*hàng\s*khác|ngoài\s*phạm\s*vi|ngoài\s*quyền)\b/i,
    /\b(cross\s*tenant|access\s*other\s*(organization|branch))\b/i,
  ];

  if (!isEducationalOrAcademic) {
    for (const pattern of crossTenantPatterns) {
      if (pattern.test(normalized)) {
        return {
          safe: false,
          reason: 'Yêu cầu xem dữ liệu chi nhánh hoặc khách hàng ngoài phạm vi được cấp phép bị từ chối.',
          eventType: 'AI_UNAUTHORIZED_CROSS_TENANT_ACCESS',
          severity: 'HIGH',
          criticalDirectLock: false,
          sanitizedMessage: rawText,
          sanitizedHistory,
        };
      }
    }
  }

  // H. Nhóm 5: SQL Injection & Thực thi SQL tùy ý / Phá hoại DB (Severity: CRITICAL nếu phá hoại, HIGH nếu bẫy query)
  const destructiveSqlPatterns = [
    /;\s*(drop\s+table|truncate\s+table|alter\s+table)\b/i,
    /\b(delete\s+from|insert\s+into|update)\s+users\b/i,
    /\b(xuất\s*toàn\s*bộ\s*database|dump\s*database|export\s*all\s*tables)\b/i,
  ];

  if (!isEducationalOrAcademic) {
    for (const pattern of destructiveSqlPatterns) {
      if (pattern.test(normalized)) {
        return {
          safe: false,
          reason: 'Lệnh phá hoại cơ sở dữ liệu hoặc xuất toàn bộ database đã bị ngăn chặn khẩn cấp.',
          eventType: 'AI_MALICIOUS_SQL_BLOCKED',
          severity: 'CRITICAL',
          criticalDirectLock: true, // SQL phá hoại kích hoạt khóa tài khoản ngay lập tức
          sanitizedMessage: rawText,
          sanitizedHistory,
        };
      }
    }

    const exploitativeSqlPatterns = [
      /\bunion\s+(all\s+)?select\b/i,
      /\bselect\s+.*?\s+from\s+(users|auth_sessions|organizations)\b/i,
      /['"]?\s*(or|and)\s*['"]?1['"]?\s*=\s*['"]?1\s*(--|#|\/\*)/i,
      /\bwhere\s+['"]?1['"]?\s*=\s*['"]?1/i,
    ];

    for (const pattern of exploitativeSqlPatterns) {
      if (pattern.test(normalized)) {
        return {
          safe: false,
          reason: 'Câu lệnh truy vấn SQL tùy ý hoặc mẫu tấn công SQL Injection bị từ chối.',
          eventType: 'AI_MALICIOUS_SQL_BLOCKED',
          severity: 'HIGH',
          criticalDirectLock: false,
          sanitizedMessage: rawText,
          sanitizedHistory,
        };
      }
    }
  }

  return {
    safe: true,
    reason: null,
    eventType: null,
    severity: 'LOW',
    criticalDirectLock: false,
    sanitizedMessage: rawText,
    sanitizedHistory,
    isEducational: isEducationalOrAcademic,
  };
}

// 3. OUTPUT SANITIZATION (Data Masking & Secrets Stripping)
export function sanitizeOutput(reply) {
  if (!reply || typeof reply !== 'string') return '';

  let cleaned = reply;

  // Mask Google / Gemini API Keys
  cleaned = cleaned.replace(/AIza[0-9A-Za-z\-_]{35}/g, '[KHÓA_API_ĐÃ_ĐƯỢC_BẢO_VỆ]');
  cleaned = cleaned.replace(/AQ\.[0-9A-Za-z\-_]{20,}/g, '[KHÓA_API_ĐÃ_ĐƯỢC_BẢO_VỆ]');

  // Mask Groq API Keys
  cleaned = cleaned.replace(/gsk_[0-9A-Za-z\-_]{20,}/g, '[KHÓA_API_ĐÃ_ĐƯỢC_BẢO_VỆ]');

  // Mask JWT Tokens
  cleaned = cleaned.replace(
    /eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g,
    '[TOKEN_XÁC_THỰC_ĐÃ_ẨN]'
  );

  // Mask Bcrypt Hashes
  cleaned = cleaned.replace(
    /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g,
    '[MẬT_KHẨU_MÃ_HÓA_ĐÃ_ẨN]'
  );

  // Mask DB connection string
  cleaned = cleaned.replace(
    /(mysql|postgres|mongodb):\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,
    '[URI_CƠ_SỞ_DỮ_LIỆU_ĐÃ_ẨN]'
  );

  // Mask MySQL Error Stack Traces
  cleaned = cleaned.replace(
    /(?:ER_[A-Z_]+|SequelizeDatabaseError|You have an error in your SQL syntax)[^\n]*/gi,
    '[Lỗi cơ sở dữ liệu nội bộ đã được che giấu vì lý do an ninh]'
  );

  // Mask/Clean internal technical route paths to friendly Vietnamese names
  cleaned = cleaned.replace(/\/ai\/replenishment\b/g, 'tính năng Gợi ý nhập hàng');
  cleaned = cleaned.replace(/\/ai\/forecast-(?:sku|multi)\b/g, 'tính năng Dự báo sản phẩm');
  cleaned = cleaned.replace(/\/ai\/forecast-total\b/g, 'tính năng Dự báo tổng nhu cầu');
  cleaned = cleaned.replace(/\/ai\/stockout\b/g, 'mục Cảnh báo thiếu hàng');
  cleaned = cleaned.replace(/\/sales\/history\b/g, 'mục Lịch sử bán hàng');
  cleaned = cleaned.replace(/\/sales\b/g, 'màn hình Bán hàng POS');
  cleaned = cleaned.replace(/\/receipts\b/g, 'mục Phiếu nhập hàng');
  cleaned = cleaned.replace(/\/inventory\b/g, 'mục Quản lý tồn kho');
  cleaned = cleaned.replace(/\/stock-operations\b/g, 'mục Kiểm kê & Điều chuyển kho');
  cleaned = cleaned.replace(/\/products\/new\b/g, 'mục Thêm sản phẩm mới');
  cleaned = cleaned.replace(/\/products\b/g, 'mục Quản lý sản phẩm');
  cleaned = cleaned.replace(/\/dashboard\b/g, 'trang Tổng quan');
  cleaned = cleaned.replace(/\/bi\b/g, 'mục Báo cáo phân tích');
  cleaned = cleaned.replace(/\/market\b/g, 'mục Giá thị trường');
  cleaned = cleaned.replace(/\/admin\/security\b/g, 'mục Giám sát An ninh');
  cleaned = cleaned.replace(/\/admin\b/g, 'trang Quản trị nền tảng');
  cleaned = cleaned.replace(/\/profile\b/g, 'mục Hồ sơ cá nhân');
  cleaned = cleaned.replace(/\/(?:users|staff)\b/g, 'mục Quản lý nhân sự');
  cleaned = cleaned.replace(/\/api\/[a-zA-Z0-9_\-\/]+/g, 'hệ thống nội bộ');

  return cleaned;
}

// 4. KHÓA TÀI KHOẢN TẠM THỜI (TEMPORARY ACCOUNT LOCKING)
export async function lockUserAccount(userId, durationMinutes = 15, reason = 'Phát hiện hành vi vi phạm an ninh nghiêm trọng') {
  if (!userId) return false;
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `UPDATE users SET is_locked=1,
       locked_until=IF(? IS NULL,NULL,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)),
       locked_at=UTC_TIMESTAMP(),lock_reason=?
       WHERE id=? AND role IN ('OWNER','MANAGER','CASHIER','INVENTORY')`,
      [durationMinutes, durationMinutes, String(reason||'').slice(0,500), userId]
    );
    if (!result.affectedRows){
      await connection.rollback();
      return false;
    }
    await connection.execute(
      'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE user_id=?',
      [userId]
    );
    await connection.commit();

    console.warn(`[SecurityGuard] Tài khoản User ID ${userId} đã bị tạm khóa ${durationMinutes} phút. Lý do: ${reason}`);
    return true;
  } catch (err) {
    await connection.rollback();
    console.error(`[SecurityGuard] Lỗi khi khóa tài khoản User ID ${userId}:`, err.message);
    return false;
  } finally {
    connection.release();
  }
}

// 5. MỞ KHÓA TÀI KHOẢN THỦ CÔNG (ADMIN UNLOCK)
export async function unlockUserAccount(userId, adminUserId = null, reason = 'Quản trị viên mở khóa thủ công') {
  if (!userId) return false;
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]=await connection.execute(
      `UPDATE users 
       SET is_locked=0,locked_until = NULL,locked_at=NULL,lock_reason = NULL,
           unlock_request_note=NULL,unlock_requested_at=NULL
       WHERE id = ?`,
      [userId]
    );
    if(!result.affectedRows){
      await connection.rollback();
      return false;
    }

    await connection.execute(
      `UPDATE audit_logs
       SET status='RESOLVED',unlocked_by=?,unlocked_at=UTC_TIMESTAMP(),unlock_reason=?
       WHERE user_id=? AND status='TEMPORARILY_LOCKED'`,
      [adminUserId,reason,userId]
    );

    // Ghi nhận sự kiện ADMIN mở khóa vào audit_logs
    await connection.execute(
      `INSERT INTO audit_logs (user_id, event_type, severity, status, details, unlocked_by, unlocked_at, unlock_reason)
       VALUES (?, 'ADMIN_UNLOCKED_USER', 'LOW', 'RESOLVED', ?, ?, UTC_TIMESTAMP(), ?)`,
      [userId, JSON.stringify({ action: 'UNLOCK_USER', adminUserId }), adminUserId, reason]
    );
    await connection.commit();

    console.log(`[SecurityGuard] Tài khoản User ID ${userId} đã được mở khóa bởi Admin ${adminUserId || 'System'}`);
    return true;
  } catch (err) {
    await connection.rollback();
    console.error(`[SecurityGuard] Lỗi khi mở khóa tài khoản User ID ${userId}:`, err.message);
    return false;
  } finally {
    connection.release();
  }
}

// 6. THÔNG BÁO CHO ADMIN (SECURITY NOTIFICATIONS)
export async function notifyAdminSecurityAlert({
  userId = null,
  username = null,
  organizationId = null,
  auditLogId = null,
  eventType,
  severity = 'HIGH',
  title,
  message,
}) {
  try {
    await pool.execute(
      `INSERT INTO security_notifications (user_id, username, organization_id, audit_log_id, event_type, title, message, severity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        username || null,
        organizationId || null,
        auditLogId || null,
        eventType,
        title,
        message,
        severity,
      ]
    );
  } catch (err) {
    console.error('[SecurityGuard] Gửi thông báo an ninh cho Admin thất bại:', err.message);
  }
}

// 7. GHI NHẬN SECURITY LOGS & ĐÁNH GIÁ NGƯỠNG KHÓA TÀI KHOẢN
export async function handleSecurityEvent({
  userId = null,
  username = null,
  role = null,
  organizationId = null,
  branchId = null,
  eventType,
  severity = 'MEDIUM',
  reason = '',
  promptSnippet = '',
  criticalDirectLock = false,
  ipAddress = null,
  userAgent = null,
}) {
  let status = 'BLOCKED';
  let isLockedNow = false;

  try {
    const platformSettings=await getPlatformSettings();
    if(platformSettings.auditEnabled===false){
      if((severity==='HIGH'||severity==='CRITICAL')&&userId&&lockableRoles.has(role)){const locked=await lockUserAccount(userId,15,`${severity}: ${reason||eventType}`);return {status:locked?'TEMPORARILY_LOCKED':status,isLockedNow:locked,auditLogId:null};}
      return {status,isLockedNow,auditLogId:null};
    }
    const cleanSnippet = promptSnippet ? String(promptSnippet).substring(0, 450) : null;
    const safeDetails = { reason, promptSnippet: cleanSnippet };

    // 1. Ghi log vi phạm vào bảng audit_logs
    const [result] = await pool.execute(
      `INSERT INTO audit_logs (
        user_id, username, role, organization_id, branch_id, event_type, severity, status, details, request_snippet, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        username || null,
        role || null,
        organizationId || null,
        branchId || null,
        eventType,
        severity,
        status,
        JSON.stringify(safeDetails),
        cleanSnippet,
        ipAddress || null,
        userAgent ? String(userAgent).substring(0, 255) : null,
      ]
    );

    const auditLogId = result.insertId;

    // 2. Kiểm tra nếu có userId để đánh giá ngưỡng vi phạm
    if (userId) {
      if (lockableRoles.has(role) && (severity === 'HIGH' || severity === 'CRITICAL')) {
        isLockedNow=await lockUserAccount(userId,15,`${severity}: ${reason||eventType}`);
        if(!isLockedNow)return {status,auditLogId,isLockedNow:false};
        status='TEMPORARILY_LOCKED';
        await pool.execute(`UPDATE audit_logs SET status='TEMPORARILY_LOCKED' WHERE id=?`,[auditLogId]);
        await notifyAdminSecurityAlert({userId,username,organizationId,auditLogId,eventType,severity:'CRITICAL',title:`[TỰ ĐỘNG KHÓA] ${username||`ID ${userId}`} bị khóa tạm thời`,message:`Sự kiện ${severity}: ${reason||eventType}`});
        return {status,isLockedNow,auditLogId};
      }

      // Trường hợp B: Đánh giá số lần vi phạm trong vòng 10 phút
      const [[countRow]] = await pool.execute(
        `SELECT SUM(CASE WHEN severity='MEDIUM' THEN 1 ELSE 0 END) AS medium_count,
           SUM(CASE WHEN severity IN ('HIGH','CRITICAL') THEN 1 ELSE 0 END) AS high_critical_count
         FROM audit_logs WHERE user_id=? AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)`,
        [userId]
      );

      const highCriticalCount = Number(countRow?.high_critical_count || 1);

      if(lockableRoles.has(role) && Number(countRow?.medium_count||0)>=3){
        isLockedNow=await lockUserAccount(userId,15,`3 sự kiện an ninh MEDIUM trong 15 phút gần nhất (${eventType})`);
        if(!isLockedNow)return {status,auditLogId,isLockedNow:false};
        status='TEMPORARILY_LOCKED';
        await pool.execute(`UPDATE audit_logs SET status='TEMPORARILY_LOCKED' WHERE id=?`,[auditLogId]);
        await notifyAdminSecurityAlert({userId,username,organizationId,auditLogId,eventType,severity:'HIGH',title:`[TỰ ĐỘNG KHÓA] ${username||`ID ${userId}`} sau 3 vi phạm MEDIUM`,message:'Phát hiện 3 sự kiện mức MEDIUM trong vòng 15 phút.'});
        return {status,isLockedNow,auditLogId};
      }

      // Ngưỡng 3 lần vi phạm mức HIGH trở lên trong 10 phút -> Gửi cảnh báo khẩn cấp ADMIN
      if (highCriticalCount >= 3) {
        await notifyAdminSecurityAlert({
          userId,
          username,
          organizationId,
          auditLogId,
          eventType,
          severity: 'HIGH',
          title: `[CẢNH BÁO TÁI PHẠM] Tài khoản ${username || `ID ${userId}`} vi phạm mức ${severity} lần thứ ${highCriticalCount}`,
          message: `Người dùng đã vi phạm ${highCriticalCount} lần mức HIGH/CRITICAL trong 10 phút. Hệ thống đang tăng mức giám sát và sẽ khóa nếu tiếp tục vi phạm.`,
        });
      } else if (severity === 'HIGH' || severity === 'CRITICAL') {
        // Vi phạm mức HIGH/CRITICAL đơn lẻ: Gửi thông báo thông thường
        await notifyAdminSecurityAlert({
          userId,
          username,
          organizationId,
          auditLogId,
          eventType,
          severity,
          title: `[CẢNH BÁO AN NINH ${severity}] Phát hiện hành vi ${eventType}`,
          message: `Người dùng: ${username || `ID ${userId}`} (${role || 'Unknown'}). Lý do chặn: ${reason}.`,
        });
      }
    }

    return { status, isLockedNow, auditLogId };
  } catch (err) {
    console.error('[SecurityGuard] Lỗi trong handleSecurityEvent:', err.message);
    return { status: 'BLOCKED', isLockedNow: false, auditLogId: null };
  }
}
