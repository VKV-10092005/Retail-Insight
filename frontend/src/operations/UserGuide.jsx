import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Compass, PackagePlus, ShoppingCart, Warehouse, TrendingUp, ShieldCheck,
  ArrowRight, Search, BookOpen, Layers, Users, ChevronDown, ChevronUp,
  Store, BarChart2, BrainCircuit, Building2, Package, ClipboardList,
  RefreshCw, AlertTriangle, CheckCircle2, XCircle, Circle, Lightbulb
} from 'lucide-react';
import { PageHeader, Card } from '../components/ui/Elements';

/* ─── ĐỊNH NGHĨA DỮ LIỆU ─── */

const STEP1_CARDS = [
  {
    num: 1,
    icon: Package,
    color: '#0284C7',
    bg: 'rgba(37,99,235,0.08)',
    title: 'Thiết lập Danh mục & Sản phẩm',
    path: '/products',
    btnLabel: 'Mở Sản phẩm →',
    items: [
      'Tạo các nhóm ngành hàng để phân loại và lọc kho thuận tiện.',
      'Khai báo sản phẩm thủ công hoặc nhập hàng loạt bằng file CSV.',
      'Điền tên hàng, mã SKU duy nhất, đơn vị tính, giá vốn, giá bán niêm yết.',
      'Đặt ngưỡng tồn tối thiểu (min_stock) để hệ thống cảnh báo sắp hết hàng.',
    ],
  },
  {
    num: 2,
    icon: PackagePlus,
    color: '#059669',
    bg: 'rgba(5,150,105,0.08)',
    title: 'Nhập hàng vào kho',
    path: '/receipts',
    btnLabel: 'Mở Nhập hàng →',
    items: [
      'Hàng mới tạo có tồn kho mặc định = 0 và hiển thị nhãn Hết hàng trên POS.',
      'Lập phiếu nhập kho thủ công hoặc import file CSV 4 cột (sku, quantity, unit_cost, note).',
      'Bấm Xác nhận để cộng tồn thực tế vào sổ cái kho.',
      'Có thể lập nhiều phiếu nhập cho nhiều chi nhánh khác nhau.',
    ],
  },
  {
    num: 3,
    icon: ShoppingCart,
    color: '#D97706',
    bg: 'rgba(217,119,6,0.08)',
    title: 'Bán hàng tại quầy POS',
    path: '/sales',
    btnLabel: 'Mở quầy POS →',
    items: [
      'Sau khi kho có hàng, mở giao diện POS để chọn sản phẩm và số lượng.',
      'Chọn khách hàng, áp dụng giảm giá toàn đơn hoặc từng sản phẩm.',
      'Thanh toán bằng Tiền mặt (tính tiền thừa tự động) hoặc Chuyển khoản.',
      'Hệ thống tự động xuất hóa đơn, trừ tồn kho và ghi nhận doanh thu ngay lập tức.',
    ],
  },
  {
    num: 4,
    icon: TrendingUp,
    color: '#0F766E',
    bg: 'rgba(124,58,237,0.08)',
    title: 'Theo dõi & Tối ưu vận hành',
    path: '/',
    btnLabel: 'Xem Tổng quan →',
    items: [
      'Kiểm tra biểu đồ doanh thu thời gian thực trên Trang tổng quan.',
      'Thực hiện kiểm kê cân đối tồn kho định kỳ tại /stock-operations.',
      'Xem gợi ý nhập hàng tự động từ hệ thống Dự báo AI.',
      'Phân tích báo cáo BI để tối ưu danh mục hàng hóa và biên lợi nhuận.',
    ],
  },
];

const GROUPS = [
  {
    id: 'A',
    icon: Warehouse,
    color: '#059669',
    title: 'Nhóm A — Quản lý Hàng hóa & Kho vận',
    sections: [
      {
        title: 'Danh mục & Sản phẩm',
        path: '/products',
        btn: 'Mở Sản phẩm →',
        lines: [
          'Lọc theo nhóm hàng, tìm kiếm nhanh theo tên hoặc mã SKU.',
          'Cập nhật giá bán, giá vốn tham khảo, hình ảnh và ngưỡng cảnh báo min_stock.',
          'Hỗ trợ nhập hàng loạt bằng file CSV hoặc tạo thủ công từng sản phẩm.',
        ],
      },
      {
        title: 'Nhập hàng & Import CSV',
        path: '/receipts',
        btn: 'Mở Nhập hàng →',
        lines: [
          'Ghi nhận hàng nhập theo từng chi nhánh riêng biệt.',
          'Tải file mẫu CSV gồm 4 cột: sku, quantity, unit_cost, note.',
          'Kiểm tra lỗi từng dòng trước khi xác nhận ghi sổ cái kho.',
        ],
      },
      {
        title: 'Tồn kho hiện tại',
        path: '/inventory',
        btn: 'Xem tồn kho →',
        lines: [
          'Tra cứu số lượng hàng khả dụng tại từng chi nhánh.',
          'Xem tổng giá trị tồn kho theo giá vốn.',
          'Lọc nhanh các mặt hàng dưới định mức an toàn min_stock.',
        ],
      },
      {
        title: 'Kiểm kê & Điều chuyển kho',
        path: '/stock-operations',
        btn: 'Mở kiểm kê →',
        lines: [
          'Kiểm kê cân đối: đối chiếu tồn sổ sách với tồn thực tế, ghi lý do hao hụt/thừa.',
          'Điều chuyển liên chi nhánh: trừ kho xuất, cộng kho nhận trong một giao dịch an toàn.',
          'Hệ thống tự động điều chỉnh sổ cái kho sau mỗi phiếu kiểm kê hoặc điều chuyển.',
        ],
      },
    ],
  },
  {
    id: 'B',
    icon: ShoppingCart,
    color: '#D97706',
    title: 'Nhóm B — Bán hàng POS & Báo cáo Kinh doanh',
    sections: [
      {
        title: 'Quầy thu ngân POS',
        path: '/sales',
        btn: 'Mở quầy POS →',
        lines: [
          'Tab 1 — Sản phẩm đã thêm: chọn món, chỉnh số lượng, chọn khách hàng, ghi chú.',
          'Tab 2 — Giảm giá & Thanh toán: tính tiền thừa tự động (tiền mặt) hoặc xác nhận chuyển khoản.',
          'Hệ thống tự động khóa món hết hàng để chống bán âm kho.',
        ],
      },
      {
        title: 'Lịch sử bán lẻ',
        path: '/sales/history',
        btn: 'Xem lịch sử →',
        lines: [
          'Lưu trữ toàn bộ chứng từ hóa đơn kèm thời gian và chi nhánh.',
          'Xem chi tiết từng mặt hàng, nhân viên thực hiện và phương thức thanh toán.',
        ],
      },
      {
        title: 'Tổng quan & Báo cáo BI',
        path: '/reports',
        btn: 'Xem Báo cáo BI →',
        lines: [
          'Thống kê doanh thu, số đơn hàng, sản lượng bán theo bộ lọc thời gian.',
          'Bộ lọc nhanh: Hôm nay, 7 ngày qua, 30 ngày qua và theo chi nhánh.',
          'Cảnh báo các mặt hàng sắp hết hàng ngay trên Tổng quan.',
        ],
      },
      {
        title: 'Giá & Nguồn nhập thị trường',
        path: '/market',
        btn: 'Mở thị trường →',
        lines: [
          'Phân tích biên lợi nhuận (%) dựa trên giá vốn nhập gần nhất và giá bán niêm yết.',
          'Cảnh báo đỏ các mặt hàng có biên lợi nhuận thấp (< 10%).',
        ],
      },
    ],
  },
  {
    id: 'C',
    icon: BrainCircuit,
    color: '#0F766E',
    title: 'Nhóm C — Phân tích Dự báo AI & Trợ lý ảo',
    sections: [
      {
        title: 'Dự báo nhu cầu (SKU / Tổng / Hàng loạt)',
        path: '/forecast',
        btn: 'Xem Dự báo →',
        lines: [
          'Phân tích lịch sử để dự báo sản lượng tiêu thụ từ 1 đến 3 tháng tới.',
          'Cửa hàng mới < 6 tháng lịch sử: kích hoạt chế độ Dự báo thích ứng (Cold-Start).',
          'Hỗ trợ dự báo từng SKU (/forecast), tổng ngành (/forecast/total) và hàng loạt (/forecast/multi).',
        ],
      },
      {
        title: 'Cảnh báo thiếu hàng & Gợi ý nhập',
        path: '/alerts',
        btn: 'Xem Cảnh báo →',
        lines: [
          'Ước tính số ngày tồn kho còn lại (Days of Supply) cho từng mặt hàng.',
          'Đề xuất số lượng cần nhập bổ sung tối ưu để tránh đứt hàng hoặc đọng vốn.',
        ],
      },
      {
        title: 'Dataset nghiên cứu',
        path: '/research',
        btn: 'Mở Dataset →',
        lines: [
          'Tra cứu kho dữ liệu lịch sử chuẩn ngành hàng và snapshot tồn kho.',
          'Phục vụ đối chứng và hiệu chỉnh mô hình dự báo.',
        ],
      },
      {
        title: 'Trợ lý AI (Chatbot)',
        path: null,
        btn: null,
        lines: [
          'Hỗ trợ tra cứu nhanh số liệu kinh doanh và hướng dẫn thao tác theo vai trò.',
          'Bảo mật tuyệt đối: dữ liệu hoàn toàn tách biệt giữa các cửa hàng.',
        ],
      },
    ],
  },
  {
    id: 'D',
    icon: Building2,
    color: '#0284C7',
    title: 'Nhóm D — Quản trị Tổ chức & Chi nhánh',
    sections: [
      {
        title: 'Hồ sơ & Chi nhánh',
        path: '/branches',
        btn: 'Mở Chi nhánh →',
        lines: [
          'Cập nhật thông tin cửa hàng: tên, địa chỉ, số điện thoại liên hệ.',
          'Quản lý danh sách chi nhánh hoạt động, thêm hoặc tắt chi nhánh theo nhu cầu.',
        ],
      },
      {
        title: 'Nhân sự & Phân quyền',
        path: '/staff',
        btn: 'Mở Nhân sự →',
        lines: [
          'Tạo tài khoản nhân viên, gán chi nhánh làm việc và chọn vai trò phù hợp.',
          'Khóa/mở khóa tài khoản và hỗ trợ Đăng nhập nhanh để kiểm tra giao diện từng nhân viên.',
        ],
      },
    ],
  },
];

const ROLES_DATA = [
  {
    role: 'OWNER',
    label: 'Chủ cửa hàng',
    icon: ShieldCheck,
    color: '#0284C7',
    bg: 'rgba(37,99,235,0.08)',
    summary: 'Toàn quyền quản trị tổ chức, chi nhánh, nhân sự, tài chính, kho vận, bán hàng và phân tích AI.',
    features: [
      { label: 'Tổng quan & Báo cáo BI', ok: true },
      { label: 'Quản lý Sản phẩm & Danh mục', ok: true },
      { label: 'Nhập hàng & Kiểm kê kho', ok: true },
      { label: 'Tồn kho & Điều chuyển', ok: true },
      { label: 'Bán hàng POS & Lịch sử', ok: true },
      { label: 'Dự báo AI & Cảnh báo', ok: true },
      { label: 'Quản lý Chi nhánh', ok: true },
      { label: 'Nhân sự & Phân quyền', ok: true },
      { label: 'Đăng nhập nhanh nhân viên', ok: true },
      { label: 'Cài đặt & Thanh toán', ok: true },
    ],
    note: 'Có tính năng Đăng nhập nhanh — chuyển sang giao diện nhân viên bất kỳ và quay lại bằng 1 cú click trên thanh thông báo.',
  },
  {
    role: 'MANAGER',
    label: 'Quản lý chi nhánh',
    icon: ClipboardList,
    color: '#059669',
    bg: 'rgba(5,150,105,0.08)',
    summary: 'Điều hành toàn diện chi nhánh được giao. Không có quyền tạo/khóa tài khoản nhân sự hay sửa thông tin pháp lý tổ chức.',
    features: [
      { label: 'Tổng quan & Báo cáo BI', ok: true },
      { label: 'Quản lý Sản phẩm & Danh mục', ok: true },
      { label: 'Nhập hàng & Kiểm kê kho', ok: true },
      { label: 'Tồn kho & Điều chuyển', ok: true },
      { label: 'Bán hàng POS & Lịch sử', ok: true },
      { label: 'Dự báo AI & Cảnh báo', ok: true },
      { label: 'Quản lý Chi nhánh', ok: false },
      { label: 'Nhân sự & Phân quyền', ok: false },
      { label: 'Đăng nhập nhanh nhân viên', ok: false },
      { label: 'Cài đặt & Thanh toán', ok: true },
    ],
    note: 'Phạm vi dữ liệu giới hạn trong chi nhánh được giao quản lý.',
  },
  {
    role: 'CASHIER',
    label: 'Nhân viên thu ngân',
    icon: ShoppingCart,
    color: '#D97706',
    bg: 'rgba(217,119,6,0.08)',
    summary: 'Chỉ thao tác trên quầy Bán hàng POS, xem Lịch sử hóa đơn và cập nhật Hồ sơ cá nhân. Bị chặn truy cập kho, báo cáo doanh thu và quản trị.',
    features: [
      { label: 'Tổng quan & Báo cáo BI', ok: false },
      { label: 'Quản lý Sản phẩm & Danh mục', ok: false },
      { label: 'Nhập hàng & Kiểm kê kho', ok: false },
      { label: 'Tồn kho & Điều chuyển', ok: false },
      { label: 'Bán hàng POS & Lịch sử', ok: true },
      { label: 'Dự báo AI & Cảnh báo', ok: false },
      { label: 'Quản lý Chi nhánh', ok: false },
      { label: 'Nhân sự & Phân quyền', ok: false },
      { label: 'Đăng nhập nhanh nhân viên', ok: false },
      { label: 'Hồ sơ cá nhân', ok: true },
    ],
    note: 'Có thể xem danh sách sản phẩm (chế độ chỉ đọc, ẩn giá vốn) để tra cứu thông tin hàng hóa.',
  },
  {
    role: 'INVENTORY',
    label: 'Nhân viên kho',
    icon: Warehouse,
    color: '#0F766E',
    bg: 'rgba(124,58,237,0.08)',
    summary: 'Chuyên trách quản lý tồn kho, lập phiếu nhập hàng và thực hiện kiểm kê / điều chuyển. Bị chặn truy cập quầy thu ngân POS và báo cáo tài chính.',
    features: [
      { label: 'Tổng quan & Báo cáo BI', ok: false },
      { label: 'Quản lý Sản phẩm & Danh mục', ok: false },
      { label: 'Nhập hàng & Kiểm kê kho', ok: true },
      { label: 'Tồn kho & Điều chuyển', ok: true },
      { label: 'Bán hàng POS & Lịch sử', ok: false },
      { label: 'Dự báo AI & Cảnh báo', ok: false },
      { label: 'Quản lý Chi nhánh', ok: false },
      { label: 'Nhân sự & Phân quyền', ok: false },
      { label: 'Đăng nhập nhanh nhân viên', ok: false },
      { label: 'Hồ sơ cá nhân', ok: true },
    ],
    note: 'Có thể xem danh sách sản phẩm (chế độ chỉ đọc) để kiểm tra thông tin hàng hóa phục vụ công tác kho.',
  },
];

/* ─── SEARCHABLE CONTENT ─── */
function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matchSearch(text, query) {
  if (!query) return true;
  return normalize(text).includes(normalize(query));
}

/* ─── SUB COMPONENTS ─── */

function StepCard({ card, query }) {
  const Icon = card.icon;
  const visible = matchSearch(card.title, query) || card.items.some(i => matchSearch(i, query));
  if (!visible) return null;
  return (
    <div style={{
      background: 'var(--ri-surface)',
      border: '1px solid var(--ri-border)',
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: card.bg, color: card.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={22} />
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: card.color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Bước {card.num}
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{card.title}</div>
        </div>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {card.items.map((item, i) => (
          <li key={i} className="muted" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{item}</li>
        ))}
      </ul>
      <Link
        to={card.path}
        className="btn btn-secondary"
        style={{ alignSelf: 'flex-start', fontSize: '0.82rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        {card.btnLabel}
      </Link>
    </div>
  );
}

function GroupAccordion({ group, query }) {
  const [open, setOpen] = useState(true);
  const Icon = group.icon;
  const visibleSections = group.sections.filter(s =>
    matchSearch(s.title, query) || s.lines.some(l => matchSearch(l, query))
  );
  if (visibleSections.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--ri-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', background: 'var(--ri-surface)', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: `${group.color}18`, color: group.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={18} />
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', flex: 1 }}>{group.title}</span>
        {open ? <ChevronUp size={16} className="muted" /> : <ChevronDown size={16} className="muted" />}
      </button>
      {open && (
        <div style={{ padding: '0 18px 16px', background: 'var(--ri-elevated)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleSections.map((sec, i) => (
            <div key={i} style={{
              background: 'var(--ri-surface)', border: '1px solid var(--ri-border)',
              borderRadius: 10, padding: 16,
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 8 }}>{sec.title}</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {sec.lines.map((l, j) => (
                  <li key={j} className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}>{l}</li>
                ))}
              </ul>
              {sec.btn && sec.path && (
                <Link
                  to={sec.path}
                  className="btn btn-secondary"
                  style={{ marginTop: 12, alignSelf: 'flex-start', fontSize: '0.8rem', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {sec.btn}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoleCard({ rd, query }) {
  const visible = matchSearch(rd.label, query) || matchSearch(rd.summary, query) ||
    rd.features.some(f => matchSearch(f.label, query));
  if (!visible) return null;
  const Icon = rd.icon;
  return (
    <div style={{
      background: 'var(--ri-surface)', border: '1px solid var(--ri-border)',
      borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: rd.bg, color: rd.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{rd.label}</div>
          <code style={{
            fontSize: '0.72rem', fontWeight: 700, color: rd.color,
            background: rd.bg, padding: '1px 7px', borderRadius: 4,
          }}>{rd.role}</code>
        </div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6 }}>{rd.summary}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {rd.features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {f.ok
              ? <CheckCircle2 size={14} style={{ color: 'var(--ri-success)', flexShrink: 0 }} />
              : <XCircle size={14} style={{ color: 'var(--ri-muted)', flexShrink: 0, opacity: 0.5 }} />
            }
            <span style={{ fontSize: '0.84rem', color: f.ok ? 'var(--ri-text)' : 'var(--ri-muted)', opacity: f.ok ? 1 : 0.7 }}>
              {f.label}
            </span>
          </div>
        ))}
      </div>
      {rd.note && (
        <div style={{
          background: rd.bg, borderRadius: 8, padding: '8px 12px',
          fontSize: '0.8rem', color: rd.color, lineHeight: 1.6,
        }}>
          <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Lightbulb size={14}/>{rd.note}</span>
        </div>
      )}
    </div>
  );
}

/* ─── MAIN COMPONENT ─── */

const TABS = [
  { id: 'setup', label: 'Lộ trình khởi tạo', icon: Compass },
  { id: 'ops', label: 'Luồng nghiệp vụ', icon: Layers },
  { id: 'roles', label: 'Phân quyền theo Vai trò', icon: Users },
];

export default function UserGuide() {
  const [activeTab, setActiveTab] = useState('setup');
  const [query, setQuery] = useState('');

  const hasQuery = query.trim().length > 0;

  // Khi search có kết quả, tự mở tất cả accordion
  const tabsToShow = hasQuery ? ['setup', 'ops', 'roles'] : [activeTab];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        eyebrow="TÀI LIỆU VẬN HÀNH"
        title="Hướng dẫn vận hành & Luồng nghiệp vụ hệ thống"
        description="Tra cứu quy trình nghiệp vụ, cách sử dụng các chức năng và phân quyền theo vai trò trong hệ thống Retail Insight."
      />

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <Search size={16} style={{
          position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--ri-muted)', pointerEvents: 'none',
        }} />
        <input
          type="search"
          placeholder="Tìm kiếm hướng dẫn... (ví dụ: nhập kho, POS, dự báo)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 14px 10px 40px',
            border: '1px solid var(--ri-border)',
            borderRadius: 10, background: 'var(--ri-surface)',
            fontSize: '0.9rem', outline: 'none',
            color: 'var(--ri-text)',
          }}
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--ri-muted)', padding: 2,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Tab nav — ẩn khi đang search */}
      {!hasQuery && (
        <div style={{
          display: 'flex', gap: 4, marginBottom: 24,
          background: 'var(--ri-elevated)', borderRadius: 10, padding: 4,
          border: '1px solid var(--ri-border)',
        }}>
          {TABS.map(tab => {
            const TIcon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 7, padding: '9px 10px', border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontWeight: active ? 700 : 400,
                  fontSize: '0.85rem',
                  background: active ? 'var(--ri-surface)' : 'transparent',
                  color: active ? 'var(--ri-primary)' : 'var(--ri-muted)',
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <TIcon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* TAB 1: Lộ trình khởi tạo */}
      {(tabsToShow.includes('setup')) && (
        <section>
          {hasQuery && (
            <div style={{ fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.08em', color: 'var(--ri-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
              Lộ trình khởi tạo
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14, marginBottom: hasQuery ? 24 : 0 }}>
            {STEP1_CARDS.map(card => (
              <StepCard key={card.num} card={card} query={query} />
            ))}
          </div>
        </section>
      )}

      {/* TAB 2: Luồng nghiệp vụ */}
      {(tabsToShow.includes('ops')) && (
        <section>
          {hasQuery && (
            <div style={{ fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.08em', color: 'var(--ri-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
              Luồng nghiệp vụ
            </div>
          )}
          <div style={{ marginBottom: hasQuery ? 24 : 0 }}>
            {GROUPS.map(g => (
              <GroupAccordion key={g.id} group={g} query={query} />
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: Phân quyền */}
      {(tabsToShow.includes('roles')) && (
        <section>
          {hasQuery && (
            <div style={{ fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.08em', color: 'var(--ri-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
              Phân quyền theo Vai trò
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            {ROLES_DATA.map(rd => (
              <RoleCard key={rd.role} rd={rd} query={query} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state khi search không có kết quả */}
      {hasQuery && (
        STEP1_CARDS.every(c => !matchSearch(c.title, query) && !c.items.some(i => matchSearch(i, query))) &&
        GROUPS.every(g => g.sections.every(s => !matchSearch(s.title, query) && !s.lines.some(l => matchSearch(l, query)))) &&
        ROLES_DATA.every(r => !matchSearch(r.label, query) && !matchSearch(r.summary, query) && !r.features.some(f => matchSearch(f.label, query)))
      ) && (
        <div className="op-state" style={{ padding: '48px 20px', textAlign: 'center' }}>
          <Search size={32} style={{ color: 'var(--ri-muted)', marginBottom: 12 }} />
          <p className="muted">Không tìm thấy nội dung phù hợp với "<strong>{query}</strong>".</p>
          <button type="button" className="btn btn-secondary" onClick={() => setQuery('')} style={{ marginTop: 12 }}>
            Xoá tìm kiếm
          </button>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 32, padding: '14px 18px', borderRadius: 10,
        background: 'var(--ri-elevated)', border: '1px solid var(--ri-border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <BookOpen size={18} style={{ color: 'var(--ri-primary)', flexShrink: 0 }} />
        <p className="muted" style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.6 }}>
          Nếu bạn cần hỗ trợ thêm, hãy liên hệ qua trang{' '}
          <Link to="/support" style={{ fontWeight: 600 }}>Hỗ trợ kỹ thuật</Link>
          {' '}hoặc sử dụng{' '}
          <span style={{ fontWeight: 600 }}>Trợ lý AI</span> ngay trên giao diện để được giải đáp trực tiếp.
        </p>
      </div>
    </div>
  );
}
