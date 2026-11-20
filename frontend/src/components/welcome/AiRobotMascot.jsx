import React from 'react';
import { Sparkles, PackageCheck, Zap, TrendingUp } from 'lucide-react';

/**
 * AiRobotMascot — Mascot Robot AI 3D Nhún Nhảy Sinh Động & Bố Cục Thoáng Đẹp
 * - Robot 3D nhún nhảy vui tươi (robotDanceBounce) kèm đĩa bóng đổ 3D co giãn đồng bộ
 * - 3 thẻ chỉ số nổi bay lơ lửng lệch pha tạo chiều sâu
 * - Badge trạng thái tách biệt ở đáy, z-index cao, tuyệt đối không bị che khuất chữ
 */
export default function AiRobotMascot() {
  return (
    <div className="mascot-stage" aria-hidden="true">
      {/* Vòng hào quang phát sáng nền công nghệ */}
      <div className="mascot-ambient-glow" />

      {/* Thẻ nổi 1: Dự báo nhu cầu AI (Góc trên phải) */}
      <div className="floating-card card-top-right">
        <div className="floating-card-icon teal">
          <Sparkles size={16} />
        </div>
        <div className="floating-card-body">
          <div className="floating-card-title">Dự báo nhu cầu AI</div>
          <div className="floating-card-value">
            <strong>98.4%</strong>
            <span className="floating-card-trend">
              <TrendingUp size={12} /> +14.2%
            </span>
          </div>
          {/* Mini Sparkline Chart */}
          <svg className="mini-sparkline" viewBox="0 0 100 24" fill="none">
            <path
              d="M0 18 Q 20 20, 35 12 T 65 14 T 85 4 L 100 2"
              stroke="url(#sparkGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M0 18 Q 20 20, 35 12 T 65 14 T 85 4 L 100 2 L 100 24 L 0 24 Z"
              fill="url(#sparkFill)"
              opacity="0.3"
            />
            <defs>
              <linearGradient id="sparkGrad" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
                <stop stopColor="#38BDF8" />
                <stop offset="1" stopColor="#38BDF8" />
              </linearGradient>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#38BDF8" />
                <stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Thẻ nổi 2: Tồn kho tối ưu (Góc dưới trái - bố trí thoáng) */}
      <div className="floating-card card-bottom-left">
        <div className="floating-card-icon emerald">
          <PackageCheck size={16} />
        </div>
        <div className="floating-card-body">
          <div className="floating-card-title">Tồn kho tối ưu</div>
          <div className="floating-card-value">
            <strong>42 sản phẩm</strong>
            <span className="floating-card-pill emerald">Định mức ROP</span>
          </div>
          <div className="floating-card-sub">Cảnh báo thiếu hàng sớm</div>
        </div>
      </div>

      {/* Thẻ nổi 3: POS thời gian thực (Góc dưới phải - bố trí thoáng) */}
      <div className="floating-card card-bottom-right">
        <div className="floating-card-icon amber">
          <Zap size={16} />
        </div>
        <div className="floating-card-body">
          <div className="floating-card-title">POS thời gian thực</div>
          <div className="floating-card-value">
            <strong>1.2s</strong>
            <span className="floating-card-pill amber">Zero-lock</span>
          </div>
          <div className="floating-card-sub">Chống trừ kho 2 lần</div>
        </div>
      </div>

      {/* Cụm Robot Mascot 3D Nhún Nhảy Vui Tươi */}
      <div className="robot-chassis">
        {/* Vòng hào quang phát sáng cyan sau lưng */}
        <div className="robot-3d-halo" />

        {/* Khung nhún nhảy của Robot */}
        <div className="robot-dancer-wrap">
          <img
            src="/images/robot-mascot-cutout.png"
            alt="Trợ lý AI Retail Insight"
            className="welcome-robot-3d-img"
            style={{
              animation: 'robotDanceBounce 2.2s cubic-bezier(0.34, 1.56, 0.64, 1) infinite',
              transformOrigin: 'center bottom',
              willChange: 'transform',
            }}
            draggable="false"
          />
        </div>

        {/* Đĩa bóng đổ mềm 3D co giãn đồng bộ theo nhịp nảy */}
        <div
          className="robot-floor-shadow"
          style={{
            animation: 'floorShadowBounce 2.2s cubic-bezier(0.34, 1.56, 0.64, 1) infinite',
            willChange: 'transform, opacity',
          }}
        />
      </div>

      {/* Badge trạng thái AI Trực quan đặt thoáng ở đáy, z-index cao chống che khuất */}
      <div className="robot-status-pill-wrap">
        <div className="robot-status-pill">
          <span className="live-pulse-dot" />
          <span>Trợ lý AI Bán lẻ Trực quan</span>
        </div>
      </div>
    </div>
  );
}


