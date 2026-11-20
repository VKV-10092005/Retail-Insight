import React,{useEffect} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {Activity,ArrowRight,BarChart3,BrainCircuit,CheckCircle2,Layers3,PackageCheck,ShieldCheck,ShoppingCart,Store,TrendingUp,Warehouse,Zap} from 'lucide-react';
import {useAuth} from '../auth/AuthContext';
import {getDefaultRoute} from '../config/roles';
import {warmApi} from '../services/api';
import {ThemeToggle,useTheme} from '../design-system/ThemeProvider.jsx';
import AiRobotMascot from '../components/welcome/AiRobotMascot';
import './WelcomePage.css';
const aiModels=[
 {icon:PackageCheck,title:'Dự báo từng sản phẩm',text:'Ước tính nhu cầu cho từng mặt hàng dựa trên lịch sử bán và xu hướng gần đây.'},
 {icon:BarChart3,title:'Tổng nhu cầu',text:'Tổng hợp lượng hàng cần thiết theo nhóm sản phẩm và chi nhánh.'},
 {icon:Activity,title:'Dự báo nhiều tháng',text:'Theo dõi xu hướng theo tháng để chủ động kế hoạch vốn và nhập hàng.'},
 {icon:ShieldCheck,title:'Cảnh báo thiếu hàng sớm',text:'Nhận diện sản phẩm có nguy cơ hết hàng trước khi ảnh hưởng đến bán hàng.'},
 {icon:Zap,title:'Gợi ý nhập hàng tối ưu (EOQ)',text:'Ước tính lượng nhập phù hợp nhằm cân bằng chi phí và mức tồn kho.'}
];
const comparisons=[
 ['Tốc độ lập đơn & báo cáo','Nhập liệu, tổng hợp thủ công','POS và báo cáo cập nhật tức thì'],
 ['Kiểm soát tồn kho đa chi nhánh','Đối chiếu nhiều bảng tính','Theo dõi tồn kho tập trung theo thời gian thực'],
 ['Độ chính xác dự báo nhập hàng','Ước lượng theo kinh nghiệm','AI phân tích lịch sử bán và xu hướng'],
 ['Bảo mật & Phân quyền','Khó kiểm soát khi chia sẻ file','Phân quyền theo vai trò, lưu vết hoạt động']
];
export default function WelcomePage(){
 useEffect(()=>{warmApi();},[]);
 const {user,loading}=useAuth();
 const {setTheme}=useTheme();
 useEffect(()=>{try{if(!localStorage.getItem('ri.theme'))setTheme('dark');}catch{setTheme('dark');}},[setTheme]);
 useEffect(()=>{
  const nodes=document.querySelectorAll('.welcome-reveal, .welcome-reveal-up');
  if(!('IntersectionObserver'in window)){nodes.forEach(node=>node.classList.add('is-visible'));return undefined;}
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.12});
  nodes.forEach(node=>observer.observe(node));
  return()=>observer.disconnect();
 },[]);
 if(!loading&&user)return <Navigate to={getDefaultRoute(user.role)} replace/>;
 return <div className="welcome-page welcome-cinematic">
  <div className="welcome-grid-pattern" aria-hidden="true"/><div className="welcome-glow welcome-glow-one" aria-hidden="true"/><div className="welcome-glow welcome-glow-two" aria-hidden="true"/>
  <header className="welcome-header-bar"><div className="welcome-header-inner">
   <Link to="/welcome" className="welcome-brand" aria-label="RetailInsight"><span className="welcome-logo-box"><Store size={21}/></span><span>Retail<strong>Insight</strong></span></Link>
   <nav className="welcome-menu" aria-label="Điều hướng chính"><a href="#tinh-nang">Tính năng</a><a href="#du-bao-ai">Dự báo AI</a><a href="#so-sanh-hieu-qua">So sánh hiệu quả</a><a href="#dich-vu-web-app">Dịch vụ Web & App</a></nav>
   <div className="welcome-nav-actions"><ThemeToggle className="welcome-theme-toggle"/><Link to="/login" className="welcome-login">Đăng nhập</Link><Link to="/register" className="welcome-register">Đăng ký cửa hàng <ArrowRight size={16}/></Link></div>
  </div></header>
  <main className="welcome-hero">
   <section className="welcome-hero-copy">
    <div className="welcome-badge">NỀN TẢNG QUẢN LÝ BÁN LẺ THỰC TẾ & TÍCH HỢP TRÍ TUỆ NHÂN TẠO</div>
    <h1>Vận hành cửa hàng<br/><span className="welcome-hero-emphasis">chính xác,</span> bổ sung<br/>hàng hóa <span className="welcome-hero-emphasis">thông minh.</span></h1>
    <p className="welcome-description">Retail Insight kết hợp nghiệp vụ bán hàng POS tinh gọn, quản trị kho đa chi nhánh phân quyền 4 vai trò (Chủ cửa hàng, Quản lý, Kho, Thu ngân) và giải thuật AI dự báo nhu cầu sản phẩm trên dữ liệu thực tế.</p>
    <div className="welcome-actions"><Link to="/register" className="welcome-primary">Bắt đầu với cửa hàng của bạn <ArrowRight size={18}/></Link><Link to="/login" className="welcome-secondary">Đăng nhập phiên làm việc</Link></div>
    <ul className="welcome-trust-list"><li><CheckCircle2 size={17}/>Bảo mật phiên JWT & phân quyền 4 vai trò thực tế</li><li><CheckCircle2 size={17}/>Kiểm soát tồn kho đa chi nhánh theo thời gian thực</li><li><CheckCircle2 size={17}/>Mô hình AI dự báo nhu cầu sản phẩm & cảnh báo thiếu hàng</li></ul>
   </section>
   <section className="welcome-hero-visual" aria-label="Trợ lý AI Retail Insight"><AiRobotMascot/></section>
  </main>
  <section id="tinh-nang" className="welcome-section welcome-feature-section">
   <div className="welcome-section-copy welcome-reveal slide-from-left"><span className="welcome-section-kicker">VẬN HÀNH BÁN LẺ TOÀN DIỆN</span><h2>Mọi nghiệp vụ cửa hàng, trên một nền tảng</h2><p>Kết nối quầy bán, kho hàng và đội ngũ để vận hành nhất quán từ giao dịch đầu tiên đến báo cáo cuối ngày.</p>
    <div className="welcome-feature-list"><article className="welcome-interactive-card welcome-reveal-up" style={{"--reveal-delay":"0ms"}}><ShoppingCart/><div><h3>Bán hàng POS siêu tốc & VietQR động</h3><p>Tạo đơn gọn, nhận thanh toán QR theo số tiền và cập nhật tồn kho ngay.</p></div></article><article className="welcome-interactive-card welcome-reveal-up" style={{"--reveal-delay":"90ms"}}><Warehouse/><div><h3>Quản lý Kho & Đa chi nhánh</h3><p>Kiểm soát nhập xuất, tồn kho và điều chuyển trên cùng một hệ thống.</p></div></article><article className="welcome-interactive-card welcome-reveal-up" style={{"--reveal-delay":"180ms"}}><Layers3/><div><h3>Phân quyền 4 vai trò chặt chẽ</h3><p>Phân chia quyền theo trách nhiệm của Chủ cửa hàng, Quản lý, Kho và Thu ngân.</p></div></article></div>
   </div>
   <div className="welcome-feature-visual welcome-interactive-card welcome-reveal slide-from-right"><div className="feature-window"><div className="feature-window-top"><span>Retail Insight</span><small>Chi nhánh trung tâm</small></div><div className="feature-stats"><article><small>Doanh thu hôm nay</small><b>12.850.000đ</b><span>+18,6%</span></article><article><small>Đơn POS</small><b>48</b><span>Đã đồng bộ</span></article></div><div className="feature-order"><div><ShoppingCart/><span><b>Đơn hàng mới</b><small>Thanh toán VietQR thành công</small></span><CheckCircle2/></div><div className="feature-progress"><i/></div><div className="feature-stock"><PackageCheck/><span><b>Tồn kho đã cập nhật</b><small>Chi nhánh trung tâm · vừa xong</small></span></div></div><div className="feature-float-badge"><TrendingUp/>POS <b>1.2s</b></div></div></div>
  </section>
  <section id="du-bao-ai" className="welcome-section welcome-ai-section">
   <div className="welcome-section-heading welcome-reveal-up"><span className="welcome-section-kicker">DỰ BÁO AI</span><h2>5 công cụ AI hỗ trợ quyết định nhập hàng</h2><p>Từ nhu cầu từng mặt hàng đến lượng đặt tối ưu, dự báo giúp cửa hàng chủ động hơn với hàng hóa và dòng vốn.</p></div>
   <div className="welcome-ai-grid">{aiModels.map((model,index)=>{const Icon=model.icon;return <article className={'welcome-ai-card welcome-interactive-card welcome-reveal-up'} style={{'--reveal-delay':(index*90)+'ms'}} key={model.title}><span className="welcome-ai-number">{String(index+1).padStart(2,'0')}</span><Icon size={22}/><h3>{model.title}</h3><p>{model.text}</p></article>;})}</div>
  </section>
  <section id="so-sanh-hieu-qua" className="welcome-section welcome-comparison-section">
   <div className="welcome-section-heading welcome-reveal-up"><span className="welcome-section-kicker">ĐỐI CHIẾU THỰC NGHIỆM</span><h2>Excel thủ công và Retail Insight AI</h2><p>Thay thao tác rời rạc bằng quy trình bán lẻ có dữ liệu cập nhật và phân quyền rõ ràng.</p></div>
   <div className="welcome-comparison-table welcome-reveal slide-from-right"><div className="welcome-comparison-head"><span>Tiêu chí</span><span>Excel thủ công</span><span>Retail Insight AI</span></div>{comparisons.map(row=><div className="welcome-comparison-row welcome-interactive-card welcome-reveal-up" style={{"--reveal-delay":`${comparisons.indexOf(row)*90}ms`}} key={row[0]}><b>{row[0]}</b><span>{row[1]}</span><strong><CheckCircle2 size={16}/>{row[2]}</strong></div>)}</div>
  </section>
  <section id="dich-vu-web-app" className="welcome-section welcome-service-section">
   <div className="welcome-service-art welcome-reveal slide-from-left"><div className="service-browser welcome-interactive-card"><div><i/><i/><i/><span>retail-insight.vn</span></div><section><aside><Store/><b>Retail Insight</b></aside><article><small>Website bán hàng</small><h3>Mua sắm dễ dàng,<br/>quản lý đồng bộ.</h3><div className="service-products"><i/><i/><i/></div><span className="service-sync"><CheckCircle2/> POS · Kho · VietQR</span></article></section><div className="service-phone"><i/><Store/><b>Retail App</b><small>Đơn hàng & tồn kho</small><span><CheckCircle2/> Đồng bộ tức thì</span></div></div></div>
   <div className="welcome-service-copy welcome-reveal slide-from-right"><span className="welcome-section-kicker">GIẢI PHÁP MỞ RỘNG</span><h2>Website & App bán hàng đồng bộ kho – POS</h2><p>Xây dựng kênh bán hàng riêng với trải nghiệm phù hợp thương hiệu, kết nối đơn hàng trực tuyến vào hoạt động tại cửa hàng.</p><div className="welcome-service-actions"><Link to="/agency-profile" className="welcome-primary">Khám phá bảng giá & Giải pháp <ArrowRight size={17}/></Link><Link to="/support?openWebForm=1" className="welcome-secondary">Đăng ký tư vấn ngay <ArrowRight size={17}/></Link></div></div>
  </section>
  <footer className="welcome-footer">
   <div className="welcome-footer-brand">
    <Link to="/welcome" className="welcome-brand" aria-label="RetailInsight"><span className="welcome-logo-box"><Store size={18}/></span><span>Retail<strong>Insight</strong></span></Link>
    <p>Nền tảng quản lý bán lẻ đa chi nhánh tích hợp trí tuệ nhân tạo dự báo nhu cầu và giải pháp bán hàng đa kênh.</p>
    <span className="welcome-footer-status"><i/>Sẵn sàng vận hành 24/7</span>
   </div>
   <div className="welcome-footer-links"><h3>Tính năng cốt lõi</h3><a href="#tinh-nang">Bán hàng POS & VietQR</a><a href="#tinh-nang">Quản lý kho đa chi nhánh</a><a href="#du-bao-ai">Dự báo nhu cầu AI</a><a href="#so-sanh-hieu-qua">Báo cáo doanh thu & lãi</a></div>
   <div className="welcome-footer-links"><h3>Giải pháp mở rộng</h3><a href="#dich-vu-web-app">Thiết kế Website bán hàng</a><a href="#dich-vu-web-app">Phát triển App Mobile</a><a href="#dich-vu-web-app">Tư vấn triển khai trọn gói</a><Link to="/support">Hỗ trợ kỹ thuật</Link></div>
   <div className="welcome-footer-links"><h3>Truy cập & Khu vực</h3><Link to="/login">Đăng nhập hệ thống</Link><Link to="/register">Đăng ký cửa hàng mới</Link><span className="welcome-footer-location">Quy Nhơn, Gia Lai, Việt Nam</span></div>
   <div className="welcome-footer-bottom"><span>© 2026 Retail Insight · Quản lý bán lẻ tích hợp AI</span><span>Hỗ trợ đa nền tảng Web & Mobile · Bảo mật phân quyền 4 vai trò</span></div>
  </footer>
 </div>;
}
