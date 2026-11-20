import React,{useRef,useState} from 'react';
import {Link,NavLink} from 'react-router-dom';
import {createPortal} from 'react-dom';
import {useAuth} from '../../auth/AuthContext';
import {ROLE_LABELS,ROLES} from '../../config/roles';
import {
  Bot,
  LayoutDashboard,
  Boxes,
  Warehouse,
  BrainCircuit,
  ClipboardList,
  Store,
  ChartColumnIncreasing,
  ChartNoAxesCombined,
  X,
  UsersRound,
  PackagePlus,
  FileText,
  ShoppingCart,
  LifeBuoy,
  AlertTriangle,
  ClipboardCheck,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import './Sidebar.css';

const MENU_HELP={
  '/':'Tại đây giúp bạn xem nhanh tình hình kinh doanh và các chỉ số chính.',
  '/reports':'Tại đây giúp bạn phân tích doanh thu, lợi nhuận và hiệu quả bán hàng.',
  '/sales':'Tại đây giúp bạn chọn sản phẩm, lập giỏ hàng và thanh toán tại quầy.',
  '/sales/history':'Tại đây giúp bạn tra cứu hóa đơn và theo dõi trạng thái đơn hàng.',
  '/products':'Tại đây giúp bạn quản lý danh mục, giá bán và thông tin sản phẩm.',
  '/receipts':'Tại đây giúp bạn nhập hàng, cập nhật tồn kho và xem phiếu nhập.',
  '/inventory':'Tại đây giúp bạn theo dõi tồn kho hiện tại của cửa hàng.',
  '/stock-operations':'Tại đây giúp bạn kiểm kê và điều chuyển hàng giữa các chi nhánh.',
  '/forecast':'Tại đây giúp bạn dự báo nhu cầu cho một sản phẩm.',
  '/forecast/total':'Tại đây giúp bạn xem tổng nhu cầu dự báo theo kỳ.',
  '/forecast/multi':'Tại đây giúp bạn so sánh nhu cầu dự báo của nhiều sản phẩm.',
  '/alerts':'Tại đây giúp bạn phát hiện sản phẩm sắp thiếu hàng và xử lý kịp thời.',
  '/replenishment':'Tại đây giúp bạn xem gợi ý nhập hàng dựa trên nhu cầu và tồn kho.',
  '/support':'Tại đây giúp bạn gửi yêu cầu và liên hệ bộ phận hỗ trợ.'
};

export default function Sidebar({open,onClose,isCollapsed,onToggleCollapsed,width,onWidthChange,clickedNavItems=[],onNavItemClick}){
  const {user}=useAuth();
  const role=user?.role;
  const resizeRef=useRef(null);
  const [isResizing,setIsResizing]=useState(false);
  const [menuTooltip,setMenuTooltip]=useState(null);
  const wasNavItemClicked=key=>{
    if(clickedNavItems.includes(key))return true;
    try{return JSON.parse(localStorage.getItem(`clicked_nav_items_${user?.id}`)||'[]').includes(key);}catch{return false;}
  };

  const handleResizeStart=event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    resizeRef.current={pointerId:event.pointerId,startX:event.clientX,startWidth:width};
    setIsResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const handleResizeMove=event=>{
    const resize=resizeRef.current;
    if(!resize||resize.pointerId!==event.pointerId)return;
    onWidthChange(resize.startWidth+(event.clientX-resize.startX));
  };
  const handleResizeEnd=event=>{
    if(!resizeRef.current||resizeRef.current.pointerId!==event.pointerId)return;
    resizeRef.current=null;
    setIsResizing(false);
    try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{}
  };

  let navGroups=[];

  if(role===ROLES.PLATFORM_ADMIN){
    navGroups=[
      {
        label:'QUẢN TRỊ NỀN TẢNG',
        items:[
          ['/admin','Tổng quan nền tảng',Store],
          ['/admin/tickets','Yêu cầu Thiết kế Website',LifeBuoy],
          ['/admin/system','Giám sát Hệ thống',ShieldCheck],
          ['/admin/security','Quản lý An ninh',ShieldAlert],
          ['/research','Dataset nghiên cứu',BrainCircuit]
        ]
      },
      {
        label:'HỆ THỐNG',
        items:[
          ['/support','Trung tâm hỗ trợ',LifeBuoy]
        ]
      }
    ];
  } else if(role===ROLES.CASHIER){
    navGroups=[
      {
        label:'BÁN HÀNG TẠI QUẦY',
        items:[
          ['/sales','Bán hàng tại quầy',ShoppingCart],
          ['/sales/history','Lịch sử hóa đơn',FileText],
          ['/products','Danh sách sản phẩm',Boxes],
        ]
      },
      {
        label:'HỆ THỐNG',
        items:[
          ['/support','Trung tâm hỗ trợ',LifeBuoy]
        ]
      }
    ];
  } else if(role===ROLES.INVENTORY){
    navGroups=[
      {
        label:'QUẢN LÝ KHO CHI NHÁNH',
        items:[
          ['/inventory','Tồn kho chi nhánh',Warehouse],
          ['/receipts','Nhập hàng',PackagePlus],
          ['/stock-operations','Kiểm kê & Chuyển kho',ClipboardCheck],
          ['/market-intelligence','Gi\u00e1 th\u1ecb tr\u01b0\u1eddng & Ngu\u1ed3n cung',ChartNoAxesCombined],
          ['/products','Danh sách sản phẩm',Boxes],
        ]
      },
      {
        label:'HỆ THỐNG',
        items:[
          ['/support','Trung tâm hỗ trợ',LifeBuoy]
        ]
      }
    ];
  } else if(role===ROLES.MANAGER){
    navGroups=[
      {
        label:'TỔNG QUAN',
        items:[
          ['/','Tổng quan',LayoutDashboard],
          ['/reports','Báo cáo BI',ChartColumnIncreasing]
        ]
      },
      {
        label:'BÁN HÀNG & SẢN PHẨM',
        items:[
          ['/sales','Bán hàng POS',ShoppingCart],
          ['/sales/history','Lịch sử bán hàng',FileText],
          ['/products','Danh sách sản phẩm',Boxes],
        ]
      },
      {
        label:'QUẢN LÝ KHO',
        items:[
          ['/inventory','Tồn kho',Warehouse],
          ['/receipts','Nhập hàng',PackagePlus],
          ['/stock-operations','Kiểm kê & Chuyển kho',ClipboardCheck],
          ['/market-intelligence','Gi\u00e1 th\u1ecb tr\u01b0\u1eddng & Ngu\u1ed3n cung',ChartNoAxesCombined]
        ]
      },
      {
        label:'PHÂN TÍCH & AI',
        items:[
          ['/forecast','Dự báo từng sản phẩm',BrainCircuit],
          ['/forecast/total','Tổng nhu cầu',ChartColumnIncreasing],
          ['/forecast/multi','Dự báo nhiều tháng',ChartNoAxesCombined],
          ['/alerts','Cảnh báo thiếu hàng',AlertTriangle],
          ['/replenishment','Gợi ý nhập hàng',ClipboardList],
        ]
      },
      {
        label:'HỆ THỐNG',
        items:[
          ['/support','Trung tâm hỗ trợ',LifeBuoy]
        ]
      }
    ];
  } else {
    // Mặc định: OWNER (Chủ cửa hàng - Toàn quyền quản lý kinh doanh)
    navGroups=[
      {
        label:'TỔNG QUAN',
        items:[
          ['/','Tổng quan',LayoutDashboard],
          ['/reports','Báo cáo BI',ChartColumnIncreasing]
        ]
      },
      {
        label:'BÁN HÀNG & SẢN PHẨM',
        items:[
          ['/sales','Bán hàng POS',ShoppingCart],
          ['/sales/history','Lịch sử bán hàng',FileText],
          ['/products','Danh sách sản phẩm',Boxes],
        ]
      },
      {
        label:'QUẢN LÝ KHO',
        items:[
          ['/inventory','Tồn kho',Warehouse],
          ['/receipts','Nhập hàng',PackagePlus],
          ['/stock-operations','Kiểm kê & Chuyển kho',ClipboardCheck],
          ['/market-intelligence','Gi\u00e1 th\u1ecb tr\u01b0\u1eddng & Ngu\u1ed3n cung',ChartNoAxesCombined]
        ]
      },
      {
        label:'PHÂN TÍCH & AI',
        items:[
          ['/forecast','Dự báo từng sản phẩm',BrainCircuit],
          ['/forecast/total','Tổng nhu cầu',ChartColumnIncreasing],
          ['/forecast/multi','Dự báo nhiều tháng',ChartNoAxesCombined],
          ['/alerts','Cảnh báo thiếu hàng',AlertTriangle],
          ['/replenishment','Gợi ý nhập hàng',ClipboardList]
        ]
      },
      {
        label:'HỆ THỐNG',
        items:[
          ['/support','Trung tâm hỗ trợ',LifeBuoy]
        ]
      }
    ];
  }

  return (
    <>
      <div className={`sidebar-backdrop ${open?'active':''}`} onClick={onClose}/>
      <aside
        className={`sidebar ${open?'sidebar-open':''} ${isCollapsed?'sidebar-collapsed':''} ${isResizing?'sidebar-resizing':''}`}
      >
        <div className="brand">
          <Link to="/welcome" className="brand-home" aria-label="RetailInsight home" title={user?.storeName||'RetailInsight'}>
            <div className="brand-logo"><ChartNoAxesCombined size={23}/></div>
            <strong className="brand-name"><span>Retail</span><em>Insight</em></strong>
          </Link>
          <button className="mobile-close" aria-label="Đóng menu" onClick={onClose}><X size={20}/></button>
        </div>

        <nav className="nav">
          {navGroups.map(g=>(
            <div className="nav-group" key={g.label}>
              <div className="nav-label">{g.label}</div>
              {g.items.map(([path,label,Icon])=>(
                <NavLink
                  to={path}
                  end={['/','/forecast','/admin'].includes(path)}
                  key={path}
                  onClick={event=>{onNavItemClick?.(path);setMenuTooltip(null);onClose?.(event);}}
                  title={label}
                  aria-label={label}
                  data-tooltip={label}
                  data-tooltip-content={MENU_HELP[path]||`Tại đây giúp bạn sử dụng chức năng ${label}.`}
                  data-tour={`nav-${path.replaceAll('/','-').replace(/^-/, '')||'dashboard'}`}
                  onMouseEnter={event=>{if(wasNavItemClicked(path)){setMenuTooltip(null);return;}const rect=event.currentTarget.getBoundingClientRect();setMenuTooltip({text:MENU_HELP[path]||`Tại đây giúp bạn sử dụng chức năng ${label}.`,left:rect.right+12,top:rect.top+rect.height/2});}}
                  onMouseLeave={()=>setMenuTooltip(null)}
                  onFocus={event=>{if(wasNavItemClicked(path)){setMenuTooltip(null);return;}const rect=event.currentTarget.getBoundingClientRect();setMenuTooltip({text:MENU_HELP[path]||`Tại đây giúp bạn sử dụng chức năng ${label}.`,left:rect.right+12,top:rect.top+rect.height/2});}}
                  onBlur={()=>setMenuTooltip(null)}
                  className={({isActive})=>`nav-item ${isActive?'active':''}`}
                >
                  <Icon size={19}/>
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div
            className="sidebar-role-badge"
            title={`Vai trò: ${ROLE_LABELS[role]||'Tài khoản'}`}
            aria-label={`Vai trò: ${ROLE_LABELS[role]||'Tài khoản'}`}
            data-tooltip={`Vai trò: ${ROLE_LABELS[role]||'Tài khoản'}`}
          >
            <span className="research-dot"/>
            <span>{ROLE_LABELS[role]||'Tài khoản'}</span>
          </div>
          <div className="sidebar-footer">© 2026 RetailInsight</div>
        </div>
        {!isCollapsed&&<div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="Kéo để thay đổi chiều rộng thanh điều hướng" onPointerDown={handleResizeStart} onPointerMove={handleResizeMove} onPointerUp={handleResizeEnd} onPointerCancel={handleResizeEnd} onLostPointerCapture={handleResizeEnd}/>} 
      </aside>
      {menuTooltip&&createPortal(<div className="sidebar-menu-tooltip" role="tooltip" style={{left:menuTooltip.left,top:menuTooltip.top}}>{menuTooltip.text}</div>,document.body)}
    </>
  );
}
