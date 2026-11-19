import React from 'react';
import { ChartNoAxesCombined, TrendingUp, Sparkles, ShieldCheck, ShieldAlert, Store, Users, CheckCircle2 } from 'lucide-react';

/**
 * AuthShowcasePanel — Visual Brand Showcase đẳng cấp thương mại cho cột bên trái
 * Dùng chung cho: /login, /register, /forgot-password
 *
 * Props:
 *   title        {string}  — Tiêu đề chính
 *   highlight    {string}  — Từ khóa nổi bật có hiệu ứng gradient
 *   description  {string}  — Mô tả tóm tắt giá trị hệ thống
 *   badgeText    {string}  — Huy hiệu nhỏ phía trên (mặc định: ENTERPRISE AI RETAIL)
 */
export default function AuthShowcasePanel({
  title = 'Vận hành cửa hàng.',
  highlight = 'Chính xác & Thông minh.',
  description = 'Nền tảng quản lý bán hàng POS, kiểm soát kho đa chi nhánh và giải thuật AI dự báo nhu cầu sản phẩm trên dữ liệu thực tế.',
  badgeText = 'NỀN TẢNG BÁN LẺ & DỰ BÁO AI THỜI GIAN THỰC'
}) {
  return (
    <section className="auth-showcase-panel">
      {/* Background ambient tech lighting */}
      <div className="showcase-glow-primary" aria-hidden="true" />
      <div className="showcase-glow-secondary" aria-hidden="true" />
      <div className="showcase-grid-overlay" aria-hidden="true" />

      {/* Brand Header */}
      <div className="showcase-brand">
        <div className="showcase-logo-box">
          <ChartNoAxesCombined size={24} style={{ color: '#FFFFFF' }} />
        </div>
        <div className="showcase-brand-text">
          <b>retail<span>insight</span></b>
          <span className="showcase-brand-tag">v2.0 PRO</span>
        </div>
      </div>

      {/* Hero Headline */}
      <div className="showcase-hero">
        <div className="showcase-eyebrow">
          <Sparkles size={13} style={{ color: '#38BDF8' }} />
          <span>{badgeText}</span>
        </div>
        <h1 className="showcase-title">
          {title} <br />
          <span className="showcase-title-gradient">{highlight}</span>
        </h1>
        <p className="showcase-desc">{description}</p>
      </div>

      {/* KHUNG MÔ PHỎNG TRỰC QUAN HỆ THỐNG (UI PREVIEW CARD) */}
      <div className="showcase-preview-card" aria-hidden="true">
        {/* Thanh tiêu đề giả lập macOS / App Window */}
        <div className="preview-card-header">
          <div className="preview-window-dots">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>
          <div className="preview-window-title">retail_insight · Live Operations</div>
          <div className="preview-window-badge">
            <span className="live-pulse-dot" /> LIVE
          </div>
        </div>

        {/* Nội dung Mockup */}
        <div className="preview-card-content">
          {/* Widget 1: Tăng trưởng Doanh thu & POS */}
          <div className="preview-widget revenue-widget">
            <div className="preview-widget-head">
              <span className="widget-label">DOANH THU THỰC TẾ HÔM NAY</span>
              <span className="widget-pill green">
                <TrendingUp size={11} /> +28.4%
              </span>
            </div>
            <div className="preview-widget-value">
              184.500.000 <small>VNĐ</small>
            </div>
            {/* Mini Sparkline Chart */}
            <svg className="preview-sparkline" viewBox="0 0 240 38" fill="none">
              <path
                d="M0 30 Q 35 34, 60 22 T 120 18 T 170 10 T 215 12 L 240 4"
                stroke="url(#prevSparkGrad)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M0 30 Q 35 34, 60 22 T 120 18 T 170 10 T 215 12 L 240 4 L 240 38 L 0 38 Z"
                fill="url(#prevSparkFill)"
                opacity="0.25"
              />
              <defs>
                <linearGradient id="prevSparkGrad" x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366F1" />
                  <stop offset="0.6" stopColor="#38BDF8" />
                  <stop offset="1" stopColor="#34D399" />
                </linearGradient>
                <linearGradient id="prevSparkFill" x1="0" y1="0" x2="0" y2="38" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38BDF8" />
                  <stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Widget 2: Cảnh báo Kho Thông minh & Gợi ý ROP */}
          <div className="preview-widget ai-widget">
            <div className="preview-widget-head">
              <span className="widget-label flex-label">
                <Sparkles size={12} style={{ color: '#818CF8' }} /> CẢNH BÁO TỒN KHO THÔNG MINH (AI ROP)
              </span>
              <span className="widget-pill amber">Cần nhập sớm</span>
            </div>
            <div className="ai-alert-row">
              <div className="ai-sku-name">Sữa tươi thanh trùng 950ml · Kho Tổng</div>
              <div className="ai-sku-stats">
                <span>Tồn: <strong>14 hộp</strong></span>
                <span className="ai-rec">Gợi ý AI: <strong>+60 hộp</strong></span>
              </div>
            </div>
          </div>

          {/* Widget 3: Huy hiệu Bảo mật 2 lớp & Phân quyền 4 Role */}
          <div className="preview-widget security-widget">
            <div className="security-badges-row">
              <div className="sec-chip">
                <ShieldCheck size={13} style={{ color: '#10B981' }} />
                <span>Mã hóa JWT & OTP 6 số</span>
              </div>
              <div className="sec-chip">
                <Users size={13} style={{ color: '#38BDF8' }} />
                <span>Phân quyền 4 vai trò</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer của panel */}
      <div className="showcase-footer">
        <div className="showcase-trust-pills">
          <span>✓ Đa chi nhánh</span>
          <span>✓ Quiet POS</span>
              <span>✓ Dự báo sản phẩm</span>
          <span>✓ Gmail SMTP thật</span>
        </div>
        <p className="showcase-copyright">
          Retail Insight © 2026 · Đề tài Nghiên cứu Khoa học Bán lẻ Tích hợp Trí tuệ Nhân tạo
        </p>
      </div>
    </section>
  );
}


