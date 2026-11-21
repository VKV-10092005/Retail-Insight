import React,{useState,useRef,useEffect} from 'react';
import {Outlet,useLocation,useNavigate} from 'react-router-dom';
import {ChevronRight,UserRound,LogOut,Store,Lock,User,UsersRound,Settings,Menu,PanelLeft,HelpCircle,PartyPopper} from 'lucide-react';
import {useAuth} from '../../auth/AuthContext';
import {useBranch} from '../../branches/BranchContext';
import {ADMIN_PATHS,ROLE_LABELS,ROLES} from '../../config/roles';
import Sidebar from './Sidebar';
import FloatingRobotChat from '../FloatingRobotChat';
import {ThemeToggle} from '../../design-system/ThemeProvider.jsx';
import {Badge} from '../ui/Elements';
import {ErrorBoundary} from '../ui/ErrorBoundary';
import NotificationBell from './NotificationBell';
import useAppSettings from '../../hooks/useAppSettings';
import UserAvatar from '../common/UserAvatar';
import InteractiveCoachmark,{EXCLUDED_COACHMARK_PATHS,getPageTourScenario} from '../onboarding/InteractiveCoachmark';
import {completeTour,getTourState,markTourShown} from '../onboarding/tourState';

const titleMap = {
  '/': 'Tổng quan',
  '/reports': 'Báo cáo BI',
  '/sales': 'Bán hàng POS',
  '/sales/pos': 'Bán hàng POS',
  '/sales/history': 'Lịch sử bán hàng',
  '/products': 'Danh sách sản phẩm',
  '/products/new': 'Thêm sản phẩm',
  '/inventory': 'Tồn kho chi nhánh',
  '/receipts': 'Nhập hàng',
  '/stock-operations': 'Kiểm kê & Chuyển kho',
  '/forecast': 'Dự báo từng sản phẩm',
  '/forecast/total': 'Tổng nhu cầu',
  '/forecast/multi': 'Dự báo nhiều tháng',
  '/alerts': 'Cảnh báo thiếu hàng',
  '/replenishment': 'Gợi ý nhập hàng',
  '/research': 'Thư viện NCKH',
  '/branches': 'Chi nhánh cửa hàng',
  '/users': 'Nhân sự & Phân quyền',
  '/staff': 'Nhân sự & Phân quyền',
  '/settings': 'Cài đặt',
  '/support': 'Trung tâm hỗ trợ',
  '/profile': 'Hồ sơ cá nhân',
  '/change-password': 'Đổi mật khẩu',
  '/market': 'Giá & Thị trường',
  '/assistant': 'Trợ lý AI',
  [ADMIN_PATHS.ROOT]: 'Tổng quan nền tảng',
  [ADMIN_PATHS.TICKETS]: 'Yêu cầu Thiết kế Website',
  [ADMIN_PATHS.SYSTEM]: 'Giám sát Hệ thống',
  [ADMIN_PATHS.SECURITY]: 'Quản lý An ninh'
};

const SIDEBAR_WIDTH_KEY='ri_sidebar_width';
const SIDEBAR_COLLAPSED_KEY='ri_sidebar_collapsed';
const clampSidebarWidth=value=>Math.min(340,Math.max(210,Number(value)||256));

export default function AppLayout(){
  const [open,setOpen]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [switchError,setSwitchError]=useState('');
  const [isSidebarCollapsed,setIsSidebarCollapsed]=useState(()=>{
    try{return localStorage.getItem(SIDEBAR_COLLAPSED_KEY)==='true';}catch{return false;}
  });
  const [sidebarWidth,setSidebarWidth]=useState(()=>{
    try{return clampSidebarWidth(localStorage.getItem(SIDEBAR_WIDTH_KEY));}catch{return 256;}
  });
  const [pageTour,setPageTour]=useState(null);
  const [tourState,setTourState]=useState({userId:null,pending:false,completed:false,shown:false});
  const [celebration,setCelebration]=useState(false);
  const [clickedNavItems,setClickedNavItems]=useState([]);
  const location=useLocation();
  const navigate=useNavigate();
  const {user,logout,impersonating,returnToOwner}=useAuth();
  const celebrationKey=`retail_insight_first_order_celebrated_${user?.organization_id||user?.organization?.id||user?.id||'unknown'}`;
  const {activeBranchId,activeBranch,branches:branchList,setActiveBranchId,isOwner}=useBranch();
  const appSettings=useAppSettings(user?.id,user?.role);
  const menuRef=useRef(null);

  useEffect(()=>{
    if(!user?.id){setClickedNavItems([]);return;}
    try{
      const stored=JSON.parse(localStorage.getItem(`clicked_nav_items_${user.id}`)||'[]');
      setClickedNavItems(Array.isArray(stored)?stored:[]);
    }catch{setClickedNavItems([]);}
  },[user?.id]);
  useEffect(()=>{
    if(!user?.id){setPageTour(null);setTourState({userId:null,pending:false,completed:false,shown:false});return;}
    setPageTour(null);
    setTourState({userId:String(user.id),...getTourState(user.id)});
  },[user?.id]);
  useEffect(()=>{
    const onTourCompleted=event=>{
      if(String(event.detail?.userId)!==String(user?.id))return;
      setTourState({userId:String(user.id),pending:false,completed:true,shown:true});
      setPageTour(null);
    };
    window.addEventListener('retail-tour-completed',onTourCompleted);
    return()=>window.removeEventListener('retail-tour-completed',onTourCompleted);
  },[user?.id]);
  const completeUserTour=()=>{
    if(!user?.id)return;
    completeTour(user.id);
    setTourState({userId:String(user.id),pending:false,completed:true,shown:true});
    setPageTour(null);
  };
  const markNavClicked=key=>{
    completeUserTour();
    setClickedNavItems(current=>{
      if(current.includes(key))return current;
      const next=[...current,key];
      try{if(user?.id)localStorage.setItem(`clicked_nav_items_${user.id}`,JSON.stringify(next));}catch{}
      return next;
    });
  };

  // Lắng nghe sự kiện hoàn tất đơn hàng để hiển thị chúc mừng
  useEffect(() => {
    if (!user?.id) return;
    const onTourAction = event => {
      if (event.detail?.type === 'sale-completed' && Number(event.detail.previousOrderCount) === 0) {
        try{if(localStorage.getItem(celebrationKey))return;}catch{}
        setCelebration(true);
      }
    };
    document.addEventListener('retail-tour', onTourAction);
    return () => document.removeEventListener('retail-tour', onTourAction);
  }, [user?.id,celebrationKey]);
  const closeCelebration=()=>{try{localStorage.setItem(celebrationKey,'true');}catch{}setCelebration(false);};

  useEffect(() => {
    setPageTour(null);
    if (!user?.id||tourState.userId!==String(user.id)||!tourState.pending||tourState.completed||tourState.shown) return;
    const scenario = getPageTourScenario(location.pathname);
    if (!scenario) return;
    const assigned = [];
    const timer = setTimeout(() => {
      const steps = scenario.map(item => {
        const node = document.querySelector(item.selector);
        if (!node || !node.getClientRects().length) return null;
        const previous = node.getAttribute('data-tour');
        node.setAttribute('data-tour', item.id);
        assigned.push({ node, previous, id: item.id });
        return { ...item, target: `[data-tour="${item.id}"]` };
      });
      if(steps.every(Boolean)){
        markTourShown(user.id);
        setTourState(current=>({...current,shown:true}));
        setPageTour({stage:1,steps});
      }
    }, 900);
    return () => {
      clearTimeout(timer);
      assigned.forEach(({ node, previous, id }) => {
        if (node.getAttribute('data-tour') !== id) return;
        if (previous == null) node.removeAttribute('data-tour'); else node.setAttribute('data-tour', previous);
      });
    };
  },[user?.id,location.pathname,tourState.userId,tourState.pending,tourState.completed]);

  const finishPageTour=()=>completeUserTour();

  useEffect(()=>{
    if(!pageTour)return undefined;
    const target=pageTour.steps[pageTour.stage-1]?.target;
    const handleTargetClick=event=>{
      if(event.target instanceof Element&&event.target.closest(target))finishPageTour();
    };
    document.addEventListener('click',handleTargetClick,true);
    return()=>document.removeEventListener('click',handleTargetClick,true);
  },[pageTour]);

  // Đóng dropdown khi click ra ngoài
  useEffect(()=>{
    if(!menuOpen) return;
    function handleClick(e){
      if(menuRef.current&&!menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown',handleClick);
    return ()=>document.removeEventListener('mousedown',handleClick);
  },[menuOpen]);

  useEffect(()=>{
    try{localStorage.setItem(SIDEBAR_COLLAPSED_KEY,String(isSidebarCollapsed));}catch{}
  },[isSidebarCollapsed]);

  useEffect(()=>{
    try{localStorage.setItem(SIDEBAR_WIDTH_KEY,String(sidebarWidth));}catch{}
  },[sidebarWidth]);

  const isPlatformAdmin = user?.role === ROLES.PLATFORM_ADMIN;
  const hasMultipleBranches = branchList.length > 1;

  const singleBranchName = branchList.length === 1
    ? (branchList[0].name || user?.storeName || 'Chi nhánh')
    : (user?.storeName || 'Cửa hàng chính');

  const roleLabel = ROLE_LABELS[user?.role] || user?.role || 'Chủ cửa hàng';
  let displayName = user?.name || user?.full_name;
  if (!displayName || displayName.trim().toLowerCase() === roleLabel.trim().toLowerCase()) {
    displayName = user?.email ? user.email.split('@')[0] : 'Người dùng';
  }

  const activeSidebarWidth = isSidebarCollapsed ? 68 : sidebarWidth;

  return (
    <div
      className="app-shell"
      style={{
        '--active-sidebar-width': `${activeSidebarWidth}px`,
        minHeight: '100vh',
        position: 'relative'
      }}
    >
      <Sidebar
        open={open}
        onClose={()=>setOpen(false)}
        clickedNavItems={clickedNavItems}
        onNavItemClick={markNavClicked}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={()=>setIsSidebarCollapsed(value=>!value)}
        width={sidebarWidth}
        onWidthChange={value=>setSidebarWidth(clampSidebarWidth(value))}
      />
      {appSettings.ai?.showFloatingAiAssistant!==false&&<FloatingRobotChat />}
      <div className="content-shell">
        {!EXCLUDED_COACHMARK_PATHS.has(location.pathname)&&pageTour&&(
          <InteractiveCoachmark
            key={pageTour.stage}
            target={pageTour.steps[pageTour.stage-1].target}
            step={pageTour.stage}
            total={pageTour.steps.length}
            message={pageTour.steps[pageTour.stage-1].message}
            continueLabel={pageTour.stage<pageTour.steps.length?'Tiếp tục':'Đã hiểu'}
            onContinue={()=>pageTour.stage<pageTour.steps.length?setPageTour(current=>current?({...current,stage:current.stage+1}):current):finishPageTour()}
            onSkip={finishPageTour}
          />
        )}
        {celebration&&(
          <div className="interactive-tour-layer" role="dialog" aria-modal="true" onMouseDown={event=>{if(event.target===event.currentTarget)closeCelebration();}} style={{background:'rgba(15,23,42,0.6)',display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'auto',zIndex:10000}}>
            <section className="interactive-tour-card" style={{position:'relative',top:'auto',left:'auto',width:'min(440px,calc(100vw - 32px))',textAlign:'center',padding:'28px 24px'}}>
              <div className="interactive-tour-badge" style={{fontSize:'13px',padding:'6px 14px',marginBottom:'12px',background:'#ecfdf5',color:'#065f46'}}>
                <PartyPopper size={14} aria-hidden="true"/> Chúc mừng!
              </div>
              <h3 style={{margin:'0 0 10px',fontSize:'1.25rem',fontWeight:700,color:'var(--ri-text,#0f172a)'}}>
                Đã hoàn tất đơn hàng đầu tiên!
              </h3>
              <p style={{margin:'0 0 20px',fontSize:'0.875rem',color:'var(--ri-muted,#64748b)',lineHeight:1.6}}>
                Bạn đã hoàn tất quy trình nhập hàng vào kho và bán đơn hàng đầu tiên tại quầy POS. Bây giờ bạn có thể khám phá thêm các tính năng Báo cáo BI, Dự báo AI và Quản trị hệ thống!
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{width:'100%',padding:'10px',fontWeight:600}}
                onClick={()=>{closeCelebration();navigate('/');}}
              >
                Khám phá hệ thống ngay
              </button>
            </section>
          </div>
        )}
        {impersonating&&<div role="status" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'10px 18px',background:'var(--ri-warning-soft,#fff4d6)',borderBottom:'1px solid var(--ri-border)',fontSize:13}}><span>Đang thao tác dưới tài khoản {roleLabel} ({user?.role}).</span><div style={{display:'flex',alignItems:'center',gap:10}}>{switchError&&<span role="alert" style={{color:'var(--ri-danger)'}}>{switchError}</span>}<button type="button" className="btn btn-secondary btn-sm" onClick={async()=>{setSwitchError('');try{await returnToOwner();window.location.assign('/users');}catch(error){setSwitchError(error.message||'Không thể quay lại tài khoản chủ cửa hàng.');}}}>Quay lại tài khoản Chủ cửa hàng</button></div></div>}
        <header className="topbar">
          <div className="topbar-left" style={{gap:'12px'}}>
            <button
              type="button"
              className="sidebar-collapse-btn mobile-menu"
              onClick={() => setOpen(value => !value)}
              aria-label="Mở menu điều hướng"
              title="Mở menu điều hướng"
            >
              <Menu size={19} />
            </button>
            <button
              type="button"
              className="sidebar-collapse-btn desktop-sidebar-toggle"
              onClick={() => setIsSidebarCollapsed(value => !value)}
              aria-label={isSidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              title={isSidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            >
              <PanelLeft size={18} />
            </button>
            <div className="breadcrumb">
              Hệ thống <ChevronRight size={14}/> <strong>{titleMap[location.pathname]||'Trang làm việc'}</strong>
            </div>

            {/* BỘ CHỌN CHI NHÁNH — ẩn với PLATFORM_ADMIN */}
            {!isPlatformAdmin && branchList.length > 0 && (
              <div style={{marginLeft:'16px',display:'inline-flex',alignItems:'center'}}>
                {isOwner && hasMultipleBranches ? (
                  <div className="branch-selector" style={{display:'inline-flex',alignItems:'center',gap:'6px'}}>
                    <Store size={15} style={{color:'var(--ri-primary)'}}/>
                    <select
                      className="ri-control"
                      style={{minHeight:'32px',padding:'4px 28px 4px 8px',fontSize:'0.8125rem'}}
                      value={activeBranchId}
                      onChange={e=>setActiveBranchId(e.target.value)}
                      aria-label="Chọn chi nhánh làm việc"
                    >
                      {branchList.map(b=>(
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div
                    className="branch-static-badge"
                    title={`Chi nhánh: ${activeBranch?.name||singleBranchName}`}
                    style={{
                      display:'inline-flex',alignItems:'center',gap:'6px',
                      padding:'5px 12px',background:'var(--ri-elevated)',
                      border:'1px solid var(--ri-border)',borderRadius:'20px',
                      fontSize:'0.8125rem',fontWeight:600,color:'var(--ri-text)'
                    }}
                  >
                    <Store size={14} style={{color:'var(--ri-primary)'}}/>
                    <span>{activeBranch?.name||singleBranchName}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="topbar-right">
            {/* NÚT CHUYỂN GIAO DIỆN SÁNG / TỐI */}
            <ThemeToggle/>

            <Badge variant="success">{roleLabel}</Badge>

            <span className="topbar-divider"/>

            <NotificationBell/>

            {/* DROPDOWN TÀI KHOẢN */}
            <div ref={menuRef} style={{position:'relative'}}>
              <button
                className="user-pill"
                onClick={()=>setMenuOpen(v=>!v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                style={{cursor:'pointer',border:'none',background:'none',padding:0,display:'flex',alignItems:'center',gap:'8px'}}
              >
                <UserAvatar className="avatar" avatarUrl={user?.avatar_url} name={displayName} size={36}/>
                <div>
                  <strong>{displayName}</strong>
                  <small>{roleLabel}</small>
                </div>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position:'absolute',top:'calc(100% + 8px)',right:0,
                    background:'var(--ri-surface)',border:'1px solid var(--ri-border)',
                    borderRadius:'var(--ri-radius-lg)',boxShadow:'var(--ri-shadow-lg)',
                    minWidth:'220px',zIndex:200,padding:'6px',
                    display:'flex',flexDirection:'column',gap:'2px'
                  }}
                >
                  {[
                    { path: '/profile', label: 'Hồ sơ cá nhân', icon: User, show: true },
                    { path: '/change-password', label: 'Đổi mật khẩu', icon: Lock, show: true },
                    { path: '/branches', label: 'Chi nhánh', icon: Store, show: isOwner },
                    { path: '/staff', label: 'Nhân sự & Phân quyền', icon: UsersRound, show: isOwner },
                    { path: '/settings', label: 'Cài đặt', icon: Settings, show: true },
                    { path: '/guide', label: 'Hướng dẫn thao tác', icon: HelpCircle, show: true }
                  ].filter(item=>item.show).map(item=>(
                    <button
                      key={item.label}
                      role="menuitem"
                      className="ri-dropdown-item"
                      style={{
                        display:'flex',
                        alignItems:'center',
                        gap:'10px',
                        justifyContent:'flex-start',
                        textAlign:'left',
                        width:'100%',
                        fontWeight:400,
                        fontSize:'0.875rem',
                        padding:'9px 12px',
                        border:'none',
                        background:'transparent',
                        borderRadius:'8px',
                        cursor:'pointer'
                      }}
                      onClick={()=>{
                        if(item.path==='/guide'){
                          setMenuOpen(false);
                          navigate('/guide');
                        } else if(item.action){
                          item.action();
                        } else {
                          setMenuOpen(false);
                          navigate(item.path);
                        }
                      }}
                    >
                      <span style={{width:'18px',height:'18px',flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                        <item.icon size={16}/>
                      </span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                  <div style={{height:'1px',background:'var(--ri-border)',margin:'4px 0'}}/>
                  <button
                    role="menuitem"
                    className="ri-dropdown-item ri-dropdown-item-danger"
                    style={{
                      display:'flex',
                      alignItems:'center',
                      gap:'10px',
                      justifyContent:'flex-start',
                      textAlign:'left',
                      width:'100%',
                      fontWeight:400,
                      fontSize:'0.875rem',
                      padding:'9px 12px',
                      color:'var(--ri-danger)',
                      border:'none',
                      background:'transparent',
                      borderRadius:'8px',
                      cursor:'pointer'
                    }}
                    onClick={()=>{setMenuOpen(false);logout();}}
                  >
                    <span style={{width:'18px',height:'18px',flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                      <LogOut size={16}/>
                    </span>
                    <span>Đăng xuất</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* KHU VỰC NỘI DUNG CHÍNH ĐƯỢc BỌC ERROR BOUNDARY */}
        <main className="page-content">
          <ErrorBoundary>
            <Outlet/>
          </ErrorBoundary>
        </main>



        <footer className="footer">
          Retail Insight · Bản quyền © 2026 · Hệ thống Quản lý Cửa hàng Bán lẻ Tích hợp AI
        </footer>
      </div>
    </div>
  );
}
