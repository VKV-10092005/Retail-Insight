import React from 'react';
import {Link,Navigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {getDefaultRoute} from '../config/roles';
import {Store,ShoppingCart,Warehouse,BrainCircuit,ArrowRight,ShieldCheck,CheckCircle2} from 'lucide-react';
import {ThemeToggle} from '../design-system/ThemeProvider.jsx';
import AiRobotMascot from '../components/welcome/AiRobotMascot';

export default function Welcome(){
  const {user,loading}=useAuth();

  // Đã đăng nhập -> chuyển về đúng trang làm việc theo Role
  if(!loading && user){
    return <Navigate to={getDefaultRoute(user.role)} replace/>;
  }

  return (
    <div className="welcome-cinematic">
      {/* Background ambient lighting effects */}
      <div className="glow-sphere glow-primary" aria-hidden="true"/>
      <div className="glow-sphere glow-secondary" aria-hidden="true"/>
      <div className="grid-overlay" aria-hidden="true"/>

      {/* Top Navbar */}
      <header className="welcome-nav">
        <Link to="/welcome" className="welcome-brand" aria-label="RetailInsight">
          <div className="welcome-logo-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <span>Retail<strong>Insight</strong></span>
        </Link>
        <div className="welcome-nav-actions">
          <ThemeToggle/>
          <Link to="/login" className="btn-welcome-ghost">Đăng nhập</Link>
          <Link to="/register" className="btn-welcome-primary">
            Đăng ký cửa hàng <ArrowRight size={16}/>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="welcome-hero">
        <div className="hero-content">
          <div className="hero-badge">
            <ShieldCheck size={14}/>
            <span>NỀN TẢNG QUẢN LÝ BÁN LẺ THỰC TẾ & TÍCH HỢP TRÍ TUỆ NHÂN TẠO</span>
          </div>
          <h1 className="hero-title">
            Vận hành cửa hàng <span className="gradient-text">chính xác</span>,<br/>
            bổ sung hàng hóa <span className="gradient-text">thông minh</span>.
          </h1>
          <p className="hero-description">
            Retail Insight kết hợp nghiệp vụ bán hàng POS tinh gọn, quản trị kho đa chi nhánh phân quyền 4 vai trò (Chủ cửa hàng, Quản lý, Kho, Thu ngân) và giải thuật AI dự báo nhu cầu sản phẩm trên dữ liệu thực tế.
          </p>

          <div className="hero-ctas">
            <Link to="/register" className="btn-cta-primary">
              Bắt đầu với cửa hàng của bạn
              <ArrowRight size={18}/>
            </Link>
            <Link to="/login" className="btn-cta-secondary">
              Đăng nhập phiên làm việc
            </Link>
          </div>

          <div className="hero-trust-points">
            <div className="trust-item">
              <CheckCircle2 size={16}/>
              <span>Bảo mật phiên JWT & phân quyền 4 vai trò thực tế</span>
            </div>
            <div className="trust-item">
              <CheckCircle2 size={16}/>
              <span>Kiểm soát tồn kho đa chi nhánh theo thời gian thực</span>
            </div>
            <div className="trust-item">
              <CheckCircle2 size={16}/>
              <span>Mô hình AI dự báo nhu cầu sản phẩm & cảnh báo thiếu hàng</span>
            </div>
          </div>
        </div>

        {/* Robot AI Vector Mascot Đa Lớp Cao Cấp Kèm 3 Thẻ Nổi */}
        <div className="hero-visual" aria-hidden="true">
          <AiRobotMascot />
        </div>
      </main>

      {/* 4 Pillars Section */}
      <section className="welcome-pillars">
        <div className="section-label">KIẾN TRÚC & NĂNG LỰC CỐT LÕI</div>
        <h2 className="section-heading">Thiết kế đáp ứng 4 trụ cột nghiệp vụ bán lẻ</h2>

        <div className="pillars-grid">
          <div className="pillar-card">
            <div className="pillar-icon blue">
              <Store size={26}/>
            </div>
            <h3>Quản lý Đa chi nhánh & Phân quyền</h3>
            <p>
              Tổ chức linh hoạt cho mô hình 1 chủ tự vận hành hoặc chuỗi nhiều chi nhánh. Phân quyền chặt chẽ theo 4 vai trò: Chủ cửa hàng, Quản lý chi nhánh, Nhân viên kho và Thu ngân.
            </p>
          </div>

          <div className="pillar-card">
            <div className="pillar-icon emerald">
              <ShoppingCart size={26}/>
            </div>
            <h3>Bán hàng POS Tối giản</h3>
            <p>
              Giao diện quầy thu ngân (Quiet POS) tối ưu thao tác nhanh, kiểm tra tồn kho khả dụng tức thì, giao dịch an toàn với database transaction và cơ chế chống trừ kho hai lần.
            </p>
          </div>

          <div className="pillar-card">
            <div className="pillar-icon amber">
              <Warehouse size={26}/>
            </div>
            <h3>Nhập kho & Quản lý Tồn kho</h3>
            <p>
              Quản lý chứng từ nhập - xuất - chuyển kho rõ ràng. Theo dõi lịch sử biến động theo từng sản phẩm, đối chiếu tồn thực tế và thiết lập định mức an toàn.
            </p>
          </div>

          <div className="pillar-card">
            <div className="pillar-icon teal">
              <BrainCircuit size={26}/>
            </div>
            <h3>Dự báo AI & Gợi ý Bổ sung</h3>
            <p>
              Tích hợp mô hình dự báo nhu cầu sản phẩm, dự báo tổng chuỗi, thuật toán gợi ý số lượng cần nhập hàng và cảnh báo sớm nguy cơ thiếu hàng dựa trên dữ liệu lịch sử.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="welcome-footer">
        <div>Retail Insight © 2026 · Đề tài Nghiên cứu Khoa học Bán lẻ Tích hợp AI</div>
        <div className="footer-links">
          <Link to="/login">Đăng nhập</Link>
          <Link to="/register">Đăng ký cửa hàng</Link>
          <Link to="/support">Trung tâm hỗ trợ</Link>
        </div>
      </footer>
    </div>
  );
}
