import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, LineChart, BarChart, Bar, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import {completeTour,getTourState,markTourShown} from '../components/onboarding/tourState';
import { useBranch } from '../branches/BranchContext';
import { Card, PageHeader } from '../components/ui/Elements';
import { useResource, State, Table, params, money, number } from './shared';
import { formatBusinessTime } from './business-time';
import PaymentSettingsModal from '../components/PaymentSettingsModal';
import {
  ShoppingCart,
  PackagePlus,
  TrendingUp,
  AlertTriangle,
  ReceiptText,
  Clock,
  ArrowRight,
  Store,
  Layers,
  CheckCircle2,
  Circle,
  Package,
  Boxes,
  HelpCircle,
  X,
  Sparkles,
  ChevronRight,
  Check
} from 'lucide-react';

const aiStatusLabel = status => ({
  READY: 'Sẵn sàng',
  ADAPTIVE_FORECAST: 'Dự báo thích ứng',
  PARTIAL: 'Có kết quả một phần',
  UNAVAILABLE: 'Chưa khả dụng'
}[status] || 'Đang cập nhật');

export function Trend({ rows, x = 'month', series, tooltipSeries = series }) {
 const hasData=rows?.length>0&&rows.some(row=>series.some(([key])=>Number(row[key]||0)>0));
 const peakValue=rows?.reduce((peak,row)=>Math.max(peak,...series.map(([key])=>Number(row[key]||0))),0)||0;
 const step=peakValue>0?10**Math.floor(Math.log10(peakValue*1.2)):1;
 const maxY=peakValue>0?Math.ceil(peakValue*1.2/step)*step:1;
 const isRevenueChart=series.some(([key])=>key==='revenue');
 const isMovementChart=series.some(([key])=>key==='incoming')&&series.some(([key])=>key==='outgoing');
 const averageRevenue=isRevenueChart&&rows?.length?rows.reduce((sum,row)=>sum+Number(row.revenue||0),0)/rows.length:0;
 const compactCurrency=value=>{const n=Number(value||0);if(!n)return '0';if(n>=1e6){const m=n/1e6;return `${Number.isInteger(m)?m:m.toFixed(1)}Tr`;}return n>=1e3?`${Math.round(n/1e3)}k`:String(Math.round(n));};
 const fields=isRevenueChart?[["revenue","Doanh thu thu\u1ea7n"],["total_cogs","Gi\u00e1 v\u1ed1n"],["gross_profit","L\u1ee3i nhu\u1eadn g\u1ed9p"],["orders","S\u1ed1 \u0111\u01a1n h\u00e0ng"]]:tooltipSeries;
 if(!rows?.length)return <div className="op-state" style={{padding:'40px 20px',textAlign:'center'}}><p className="muted">{'Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u bi\u1ec3u \u0111\u1ed3 trong kho\u1ea3ng th\u1eddi gian \u0111\u00e3 ch\u1ecdn.'}</p><Link to="/sales" className="btn btn-secondary"><ShoppingCart size={14}/>{'T\u1ea1o \u0111\u01a1n h\u00e0ng t\u1ea1i qu\u1ea7y POS'}</Link></div>;
 const Chart=isRevenueChart||isMovementChart?ComposedChart:LineChart;
 return <div className="op-chart" style={{position:'relative'}}>
  {!hasData&&<div className="bi-empty-overlay"><p>{'Ch\u01b0a ph\u00e1t sinh giao d\u1ecbch trong k\u1ef3 n\u00e0y'}</p><Link to="/sales" className="btn btn-primary"><ShoppingCart size={14}/>{'M\u1edf b\u00e1n h\u00e0ng POS'}</Link></div>}
  <ResponsiveContainer width="100%" height="100%"><Chart data={rows} margin={{top:18,right:22,left:8,bottom:10}}>
   <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--ri-border)"/>
   <XAxis dataKey={x} interval="preserveStartEnd" minTickGap={18} tick={{fontSize:11,fill:'var(--ri-muted)'}} axisLine={false} tickLine={false}/>
   <YAxis width={72} domain={isRevenueChart?[dataMin=>Math.min(0,dataMin),maxY]:[0,maxY]} tickFormatter={isRevenueChart?compactCurrency:number} tick={{fontSize:11,fill:'var(--ri-muted)'}} axisLine={false} tickLine={false}/>
   <Tooltip content={({active,payload,label})=>{const row=payload?.[0]?.payload;if(!active||!row)return null;const tooltipFields=isMovementChart?[['incoming','Lượng hàng nhập'],['outgoing','Lượng hàng xuất bán']]:fields;return <div className="bi-chart-tooltip"><strong>{label}</strong>{tooltipFields.map(([key,name])=><div className="bi-tooltip-row" key={key}><span>{name}</span><b>{['revenue','net_revenue','total_cogs','gross_profit'].includes(key)?money(row[key]||0):number(row[key]||0)}</b></div>)}</div>;}}/>
   <Legend wrapperStyle={{fontSize:12,paddingTop:8}} content={isRevenueChart||isMovementChart?()=> <div style={{display:'flex',justifyContent:'center',gap:20,fontSize:12,paddingTop:8}}>{(isRevenueChart?[['Doanh thu thuần','#2563EB'],['Lợi nhuận gộp','#10B981']]:[['Lượng hàng nhập','#10B981'],['Lượng hàng xuất bán','#2563EB']]).map(([label,color])=><span key={label}><i style={{display:'inline-block',width:9,height:9,borderRadius:9,background:color,marginRight:6}}/>{label}</span>)}</div>:undefined}/>
   {isRevenueChart&&<defs><linearGradient id="biRevenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={.26}/><stop offset="90%" stopColor="#2563EB" stopOpacity={.015}/></linearGradient></defs>}
   {isMovementChart&&<defs><linearGradient id="biIncomingGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={.25}/><stop offset="95%" stopColor="#10B981" stopOpacity={.015}/></linearGradient><linearGradient id="biOutgoingGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={.24}/><stop offset="95%" stopColor="#2563EB" stopOpacity={.015}/></linearGradient></defs>}
   {isRevenueChart&&<Area type="monotone" dataKey="revenue" name={'Doanh thu thu\u1ea7n'} stroke="none" fill="url(#biRevenueGradient)" isAnimationActive={false}/>}
   {isRevenueChart&&<Line type="monotone" dataKey="revenue" name={'Doanh thu thu\u1ea7n'} stroke="#2563EB" strokeWidth={2.5} dot={false} activeDot={{r:5,strokeWidth:2}} isAnimationActive={false}/>}
   {isRevenueChart&&<Line type="monotone" dataKey="gross_profit" name={'L\u1ee3i nhu\u1eadn g\u1ed9p'} stroke="#10B981" strokeWidth={2.5} dot={false} activeDot={{r:5,strokeWidth:2}} isAnimationActive={false}/>}
   {isMovementChart&&series.map(([key,label,color])=><React.Fragment key={key}><Area type="monotone" dataKey={key} name={label} stroke="none" fill={`url(#${key==='incoming'?'biIncomingGradient':'biOutgoingGradient'})`} isAnimationActive={false}/><Line type="monotone" dataKey={key} name={label} stroke={key==='incoming'?'#10B981':'#2563EB'} strokeWidth={2.5} dot={false} activeDot={{r:5}} isAnimationActive={false}/></React.Fragment>)}
   {isRevenueChart&&averageRevenue>0&&<ReferenceLine y={averageRevenue} stroke="#94A3B8" strokeDasharray="5 5" label={{value:'Trung bình kỳ',position:'insideTopLeft',fill:'#64748B',fontSize:10}}/>}
   {series.filter(([key])=>!isRevenueChart||!['revenue','gross_profit'].includes(key)).map(([key,label,color])=><Line key={key} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={2.5} isAnimationActive={false} connectNulls={false} dot={false} activeDot={{r:5}}/>)}
  </Chart></ResponsiveContainer>
 </div>;
}
export function Bars({ rows, x, value }) {
 if(!rows?.length)return <div className="op-state">{'Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u bi\u1ec3u \u0111\u1ed3'}</div>;
 return <div className="op-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{left:8,right:20,top:8,bottom:8}}>
  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--ri-border)"/>
  <XAxis type="number" tickFormatter={value==='revenue'?val=>{const n=Number(val||0);return n>=1e6?`${+(n/1e6).toFixed(1)}Tr`:n>=1e3?`${Math.round(n/1e3)}k`:String(n);}:number} axisLine={false} tickLine={false} tick={{fontSize:10,fill:'var(--ri-muted)'}}/>
  <YAxis type="category" dataKey={x} width={128} tick={{fontSize:10,fill:'var(--ri-muted)'}} axisLine={false} tickLine={false} interval={0}/>
  <Tooltip formatter={val=>[value==='revenue'?money(val):number(val),value==='revenue'?'Doanh thu':'S\u1ed1 l\u01b0\u1ee3ng']} contentStyle={{background:'var(--ri-surface)',border:'1px solid var(--ri-border)',borderRadius:10,boxShadow:'var(--ri-shadow-md)'}}/>
  <Bar dataKey={value} name={value==='revenue'?'Doanh thu':'S\u1ed1 l\u01b0\u1ee3ng'} fill="#2563EB" isAnimationActive={false} radius={[0,6,6,0]} maxBarSize={24}/>
 </BarChart></ResponsiveContainer></div>;
}
function BranchPerformanceChart({ rows }) {
 const data=rows||[];
 if(!data.length)return <div className="op-state">Chưa có chi nhánh trong phạm vi này.</div>;
 if(data.length===1){
  const row=data[0], revenue=Number(row.net_revenue??row.revenue??0), profit=Math.max(0,Number(row.gross_profit??0)), cogs=Math.max(0,Number(row.total_cogs??(revenue-profit)));
  return <div style={{height:270,position:'relative'}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{name:'Lợi nhuận gộp',value:profit},{name:'Giá vốn hàng bán',value:cogs}]} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="82%" paddingAngle={3} cornerRadius={5} isAnimationActive={false}>{['#10B981','#2563EB'].map((color,index)=><Cell key={index} fill={color}/>)}</Pie><Tooltip formatter={value=>money(value)} contentStyle={{background:'var(--ri-surface)',border:'1px solid var(--ri-border)',borderRadius:12}}/><Legend verticalAlign="bottom" height={30}/></PieChart></ResponsiveContainer><div style={{position:'absolute',inset:'0 0 30px',display:'grid',placeContent:'center',textAlign:'center',pointerEvents:'none'}}><small className="muted">Tổng doanh thu thuần</small><strong style={{fontSize:18}}>{money(revenue)}</strong></div></div>;
 }
 return <div className="op-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:12,right:12,bottom:8,left:0}}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--ri-border)"/><XAxis dataKey="name" tick={{fontSize:10,fill:'var(--ri-muted)'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={value=>value>=1e6?`${(value/1e6).toFixed(1)}Tr`:value>=1e3?`${Math.round(value/1e3)}k`:value} tick={{fontSize:10,fill:'var(--ri-muted)'}} axisLine={false} tickLine={false}/><Tooltip formatter={value=>money(value)} contentStyle={{background:'var(--ri-surface)',border:'1px solid var(--ri-border)',borderRadius:12}}/><Legend/><Bar dataKey="net_revenue" name="Doanh thu thuần" fill="#2563EB" barSize={28} radius={[6,6,0,0]}/><Bar dataKey="gross_profit" name="Tiền lãi" fill="#10B981" barSize={28} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>;
}
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {activeBranchId,branches:branchList,setActiveBranchId,isOwner}=useBranch();
  const canSee = ['OWNER', 'MANAGER'].includes(user?.role);
  const [dashboardBranch,setDashboardBranch]=useState(activeBranchId);
  const selectedBranchId=dashboardBranch==='ALL'?'':activeBranchId;
  const selectedBranchName = selectedBranchId
    ? branchList.find(branch => String(branch.id) === String(selectedBranchId))?.name || `Chi nhánh ${selectedBranchId}`
    : 'Tất cả chi nhánh';

  // Bộ lọc thời gian nhanh: today | 7d | 30d
  const [timePreset, setTimePreset] = useState('7d');
  const storeInfo = useResource('/dashboard/overview');

  useEffect(()=>{if(activeBranchId)setDashboardBranch(activeBranchId);},[activeBranchId]);
  const changeDashboardBranch=value=>{setDashboardBranch(value);if(value!=='ALL')setActiveBranchId(value);};

  // Trạng thái modal Onboarding lần đầu
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [paymentSettingsOpen,setPaymentSettingsOpen]=useState(false);
  const setupOrganizationId=storeInfo.data?.organization?.id||user?.tenantId;
  const setupRoadmapKey=`retail_insight_setup_roadmap_hidden_${setupOrganizationId||'unknown'}_${user?.id||'unknown'}`;
  const [registrationTourPending,setRegistrationTourPending]=useState(false);
  const [setupRoadmapHidden,setSetupRoadmapHidden]=useState(false);
  useEffect(()=>{
    setRegistrationTourPending(getTourState(user?.id).pending);
    let hidden=false;try{hidden=localStorage.getItem(setupRoadmapKey)==='true';}catch{}
    setSetupRoadmapHidden(hidden);
    const completed=event=>{if(String(event.detail?.userId)===String(user?.id))setRegistrationTourPending(false);};
    window.addEventListener('retail-tour-completed',completed);
    return()=>window.removeEventListener('retail-tour-completed',completed);
  },[setupRoadmapKey,user?.id]);
  const hideSetupRoadmap=()=>{setSetupRoadmapHidden(true);try{localStorage.setItem(setupRoadmapKey,'true');}catch{}};
  const paymentBranchId=activeBranchId;

  const dateFilter = useMemo(() => {
    const now = new Date();
    const timezone = storeInfo.data?.calendar?.timezone || 'Asia/Ho_Chi_Minh';
    const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now).map(part => [part.type, part.value]));
    const end = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    let start = end;
    if (timePreset === '7d') {
      const d = new Date(`${end}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 6);
      start = d.toISOString().slice(0, 10);
    } else if (timePreset === '30d') {
      const d = new Date(`${end}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 29);
      start = d.toISOString().slice(0, 10);
    }
    return { start, end, granularity: 'day' };
  }, [timePreset, storeInfo.data?.calendar?.timezone]);

  const branchFilter = selectedBranchId ? { branch_id: selectedBranchId } : {};
  const overviewResource = useResource(canSee ? `/bi/overview?${params({...dateFilter,...branchFilter})}` : '/dashboard/overview');
  const aiSummary = useResource(canSee ? `/ai/summary?${params(branchFilter)}` : null);
  const recentSales = useResource(canSee ? `/sales?${params({limit:5,...branchFilter})}` : null);
  const lowStockResource = useResource(canSee ? `/inventory?${params({limit:10,...branchFilter})}` : null);

  // Tự động mở modal onboarding lần đầu đăng nhập nếu chưa xem và chưa hoàn tất 3 bước
  useEffect(() => {
    if (!isOwner || storeInfo.loading || !storeInfo.data) return;
    const storageKey = `ri_welcome_seen_${user?.id}`;
    const tourState=getTourState(user?.id);
    let alreadySeen=false;try{alreadySeen=localStorage.getItem(storageKey)==='true';}catch{}
    const ob = storeInfo.data?.onboarding;
    const isCompleted = ob?.has_receipts && ob?.has_payment_settings && ob?.has_sales;

    if((alreadySeen||isCompleted)&&tourState.pending&&!tourState.completed){completeTour(user?.id);return;}
    if(tourState.pending&&!tourState.completed&&!tourState.shown&&!alreadySeen&&!isCompleted){
      markTourShown(user?.id);
      setShowWelcomeModal(true);
    }
  }, [isOwner, user?.id, storeInfo.data, storeInfo.loading]);

  // Lắng nghe sự kiện mở modal onboarding từ menu hoặc nút khác
  useEffect(() => {
    const handleOpenWelcome=()=>{
      const state=getTourState(user?.id);
      if(state.pending&&!state.completed&&!state.shown){markTourShown(user?.id);setShowWelcomeModal(true);}
    };
    window.addEventListener('retail-open-welcome', handleOpenWelcome);
    return () => window.removeEventListener('retail-open-welcome', handleOpenWelcome);
  },[user?.id]);

  const dismissWelcomeModal = () => {
    if (user?.id) {
      try{localStorage.setItem(`ri_welcome_seen_${user?.id}`, 'true');}catch{}
      completeTour(user.id);
    }
    setShowWelcomeModal(false);
  };

  // Giao diện giới hạn cho CASHIER / INVENTORY
  if (!canSee) {
    return (
      <>
        <PageHeader
          eyebrow="KHÔNG GIAN LÀM VIỆC"
          title={`Xin chào, ${user?.name || user?.email}`}
          description="Bàn làm việc được phân quyền theo chi nhánh được chỉ định."
        />
        <Card style={{ maxWidth: '600px', margin: '20px 0' }}>
          <h3>Vai trò: {user?.role}</h3>
          <p className="muted">Email tài khoản: {user?.email}</p>
          <div style={{ marginTop: '20px' }}>
            <Link
              className="btn btn-primary"
              to={user?.role === 'CASHIER' ? '/sales' : '/inventory'}
            >
              Mở nghiệp vụ chính của bạn <ArrowRight size={16} />
            </Link>
          </div>
        </Card>
      </>
    );
  }

  // Dữ liệu onboarding checklist từ MySQL backend
  const onboarding = storeInfo.data?.onboarding || {
    has_categories: false,
    category_count: 0,
    has_products: false,
    product_count: 0,
    has_receipts: false,
    receipt_count: 0,
    has_sales: false,
    sale_count: 0
  };

  // Định nghĩa 4 bước checklist theo yêu cầu thực tế
  const checklistSteps = [
    {id:1,title:'BƯỚC 1: NHẬP HÀNG VÀO KHO',done:onboarding.has_receipts,badgeText:onboarding.has_receipts?`Đã có ${onboarding.receipt_count} phiếu nhập`:'Chưa nhập hàng',bullets:['Chọn sản phẩm hoặc tạo sản phẩm mới','Nhập số lượng, giá nhập và giá bán','Xác nhận để cập nhật tồn kho'],link:'/receipts',actionText:'Nhập hàng ngay',doneText:'Xem phiếu nhập'},
    {id:2,title:'BƯỚC 2: CÀI ĐẶT THANH TOÁN',done:onboarding.has_payment_settings,badgeText:onboarding.has_payment_settings?'Đã cấu hình thanh toán':'Chưa cấu hình thanh toán',bullets:['Thêm thông tin tài khoản nhận tiền','Cấu hình QR chuyển khoản nếu cần','Có thể cập nhật bất cứ lúc nào'],link:'/settings',actionText:'Cài đặt thanh toán',doneText:'Xem cài đặt'},
    {id:3,title:'BƯỚC 3: BẮT ĐẦU BÁN HÀNG TRÊN POS',done:onboarding.has_sales,badgeText:onboarding.has_sales?`Đã có ${onboarding.sale_count} đơn hàng`:'Chưa phát sinh đơn hàng',bullets:['Mở quầy POS','Tạo hóa đơn đầu tiên','Theo dõi doanh thu trên Dashboard'],link:'/sales',actionText:'Mở quầy POS',doneText:'Mở quầy POS'}
  ];

  const completedStepsCount = checklistSteps.filter(s => s.done).length;
  const progressPercent = Math.round((completedStepsCount / checklistSteps.length) * 100);
  const onboardingComplete = onboarding.has_receipts && onboarding.has_payment_settings && onboarding.has_sales;
  const hasStoreActivity=Boolean(onboarding.has_products||onboarding.has_receipts||onboarding.has_sales||Number(onboarding.product_count)>0||Number(onboarding.receipt_count)>0||Number(onboarding.sale_count)>0||Number(onboarding.total_revenue)>0);
  const showSetupRoadmap=isOwner&&registrationTourPending&&!setupRoadmapHidden&&!hasStoreActivity&&!storeInfo.loading&&Boolean(storeInfo.data?.onboarding)&&!onboardingComplete;

  return (
    <div className="dashboard-container">
      <PageHeader
        eyebrow="TỔNG QUAN VẬN HÀNH"
        title="Trung tâm điều hành cửa hàng"
        description="Theo dõi hoạt động kinh doanh, xuất nhập kho và giao dịch phát sinh tức thời trên dữ liệu thực tế."
      />

      {/* 1. KHU VỰC LỐI TẮT NHANH (QUICK ACTIONS) - 4 CHỨC NĂNG CỐT LÕI */}
      <Card className="quick-actions-card" style={{ marginBottom: '24px', padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 700 }}>Thao tác nhanh</h3>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Các nghiệp vụ cốt lõi thường dùng trong ca làm việc</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {/* 1. Bán hàng POS */}
            <Link to="/sales" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingCart size={16} />
              <span>Bán hàng POS</span>
            </Link>

            {/* 2. Nhập hàng */}
            <Link to="/receipts" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <PackagePlus size={16} />
              <span>Nhập hàng</span>
            </Link>

            {/* 3. Thêm sản phẩm */}
            {/* Danh sách sản phẩm */}
            <Link to="/products" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Boxes size={16} />
              <span>Danh sách sản phẩm</span>
            </Link>

            {/* Nút mở lại Hướng dẫn khởi tạo */}
            {isOwner && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowWelcomeModal(true)}
                title="Xem hướng dẫn thiết lập 3 bước"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <HelpCircle size={15} />
                <span>Hướng dẫn</span>
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* 2. CHECKLIST 4 BƯỚC KHỞI TẠO CỬA HÀNG DÀNH CHO OWNER (DỰA TRÊN DỮ LIỆU THẬT 100%) */}
      {showSetupRoadmap && (
        <Card style={{ marginBottom: '24px', background: 'var(--ri-surface)', border: '1px solid var(--ri-border)' }}>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Store size={20} style={{ color: 'var(--ri-primary)' }} />
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                    Lộ trình khởi tạo & sẵn sàng vận hành
                  </h3>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Hệ thống tự động kiểm tra dữ liệu thực tế từ cơ sở dữ liệu để đánh dấu hoàn thành từng bước:
                </p>
              </div>

              {/* Huy hiệu tiến độ */}
              <div style={{ display:'flex',alignItems:'flex-start',gap:'10px',textAlign: 'right' }}>
                <div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: progressPercent === 100 ? 'rgba(16,185,129,0.1)' : 'rgba(37,99,235,0.1)',
                  color: progressPercent === 100 ? 'var(--ri-success)' : 'var(--ri-primary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  marginBottom: '6px'
                }}>
                  {progressPercent === 100 ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}
                  <span>{completedStepsCount}/3 bước hoàn tất ({progressPercent}%)</span>
                </div>
                {/* Progress bar */}
                <div style={{ width: '160px', height: '6px', background: 'var(--ri-border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: progressPercent === 100 ? 'var(--ri-success)' : 'var(--ri-primary)',
                    transition: 'width 0.4s ease'
                  }} />
                </div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={hideSetupRoadmap} aria-label="Ẩn lộ trình khởi tạo" title="Ẩn lộ trình khởi tạo" style={{padding:'6px',lineHeight:0}}><X size={16}/></button>
              </div>
            </div>

            {/* 4 THẺ BƯỚC THIẾT LẬP */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              {checklistSteps.map(step => (
                <div
                  key={step.id}
                  style={{
                    background: step.done ? 'var(--ri-elevated)' : 'var(--ri-surface)',
                    border: step.done ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--ri-border)',
                    borderRadius: '10px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative'
                  }}
                >
                  <div>
                    {/* Header bước & Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: step.done ? 'var(--ri-success)' : 'var(--ri-primary)'
                      }}>
                        {step.title}
                      </span>
                      {step.done ? (
                        <CheckCircle2 size={18} style={{ color: 'var(--ri-success)', flexShrink: 0 }} />
                      ) : (
                        <Circle size={18} style={{ color: 'var(--ri-muted)', flexShrink: 0 }} />
                      )}
                    </div>

                    {/* Huy hiệu số lượng thực tế */}
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: step.done ? 'var(--ri-success)' : 'var(--ri-muted)',
                        background: step.done ? 'rgba(16,185,129,0.1)' : 'var(--ri-border)',
                        padding: '2px 8px',
                        borderRadius: '10px'
                      }}>
                        {step.badgeText}
                      </span>
                    </div>

                    {/* Nội dung gạch đầu dòng */}
                    <ul style={{ margin: '0 0 16px', paddingLeft: '18px', fontSize: '0.82rem', color: 'var(--ri-muted)', lineHeight: '1.45' }}>
                      {step.bullets.map((b, idx) => (
                        <li key={idx} style={{ marginBottom: '3px' }}>{b}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Nút hành động tương ứng */}
                  <div style={{ marginTop: 'auto' }}>
                    {step.id === 1 ? (
                      <Link
                        to={step.link}
                        data-tour="onboarding-step-1"
                        className={`btn ${step.done ? 'btn-secondary' : 'btn-primary'}`}
                        style={{ width: '100%', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <span>{step.done ? step.doneText : step.actionText}</span>
                        <ArrowRight size={13} />
                      </Link>
                    ) : step.id === 2 ? (
                      <button
                        type="button"
                        className={`btn ${step.done ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => setPaymentSettingsOpen(true)}
                        disabled={!paymentBranchId}
                        style={{ width: '100%', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <span>{step.done ? step.doneText : step.actionText}</span>
                        <ArrowRight size={13} />
                      </button>
                    ) : (
                      <Link
                        to={step.link}
                        className={`btn ${step.done ? 'btn-secondary' : 'btn-primary'}`}
                        style={{ width: '100%', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <span>{step.done ? step.doneText : step.actionText}</span>
                        <ArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* 3. BỘ LỌC THỜI GIAN GỌN NHẸ (Hôm nay / 7 ngày qua / 30 ngày qua) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'inline-flex', background: 'var(--ri-elevated)', border: '1px solid var(--ri-border)', padding: '3px', borderRadius: '10px' }}>
          <button
            type="button"
            className="btn"
            style={{
              height: '32px',
              padding: '0 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '8px',
              background: timePreset === 'today' ? 'var(--ri-surface)' : 'transparent',
              color: timePreset === 'today' ? 'var(--ri-primary)' : 'var(--ri-muted)',
              border: timePreset === 'today' ? '1px solid var(--ri-border)' : '1px solid transparent',
              boxShadow: timePreset === 'today' ? 'var(--ri-shadow-sm)' : 'none'
            }}
            onClick={() => setTimePreset('today')}
          >
            Hôm nay
          </button>
          <button
            type="button"
            className="btn"
            style={{
              height: '32px',
              padding: '0 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '8px',
              background: timePreset === '7d' ? 'var(--ri-surface)' : 'transparent',
              color: timePreset === '7d' ? 'var(--ri-primary)' : 'var(--ri-muted)',
              border: timePreset === '7d' ? '1px solid var(--ri-border)' : '1px solid transparent',
              boxShadow: timePreset === '7d' ? 'var(--ri-shadow-sm)' : 'none'
            }}
            onClick={() => setTimePreset('7d')}
          >
            7 ngày qua
          </button>
          <button
            type="button"
            className="btn"
            style={{
              height: '32px',
              padding: '0 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '8px',
              background: timePreset === '30d' ? 'var(--ri-surface)' : 'transparent',
              color: timePreset === '30d' ? 'var(--ri-primary)' : 'var(--ri-muted)',
              border: timePreset === '30d' ? '1px solid var(--ri-border)' : '1px solid transparent',
              boxShadow: timePreset === '30d' ? 'var(--ri-shadow-sm)' : 'none'
            }}
            onClick={() => setTimePreset('30d')}
          >
            30 ngày qua
          </button>
        </div>

        {branchList.length>0&&<label style={{display:'grid',gap:4,minWidth:210,fontSize:12,fontWeight:600,marginLeft:'auto'}}>Phạm vi chi nhánh{isOwner?<select className="ri-control" value={dashboardBranch} onChange={event=>changeDashboardBranch(event.target.value)}><option value="ALL">Tất cả chi nhánh (Toàn chuỗi)</option>{branchList.map(branch=><option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}</select>:<span className="branch-static-badge">{selectedBranchName}</span>}</label>}

      </div>
            {/* Danh sách sản phẩm */}
      <State resource={overviewResource}>
        {data => {
          return (
            <>
              {/* 4 THẺ KPI TỔNG QUÁT */}
              <div className="stat-grid" style={{ marginBottom: '24px' }}>
                <Card className="stat"><div className="stat-top">{'Doanh thu thu\u1ea7n'}</div><strong style={{fontSize:'1.5rem',color:'var(--ri-primary)'}}>{money(data.kpi?.net_revenue??data.kpi?.revenue)}</strong><small>{timePreset==='7d'?'7 ng\u00e0y g\u1ea7n nh\u1ea5t':'30 ng\u00e0y g\u1ea7n nh\u1ea5t'}</small></Card>
                <Card className="stat"><div className="stat-top">{'L\u1ee3i nhu\u1eadn g\u1ed9p'}</div><strong style={{fontSize:'1.5rem',color:'var(--ri-success)'}}>{money(data.kpi?.gross_profit)}</strong><small>{`${number(data.kpi?.profit_margin_pct,1)}% t\u1ef7 su\u1ea5t l\u1ee3i nhu\u1eadn`}</small></Card>
                <Card className="stat"><div className="stat-top">{'T\u1ed5ng \u0111\u01a1n ho\u00e0n t\u1ea5t'}</div><strong style={{fontSize:'1.5rem'}}>{number(data.kpi?.orders)}</strong><small>{`${number(Number(data.kpi?.orders||0)/(timePreset==='7d'?7:30),1)} \u0111\u01a1n/ng\u00e0y trung b\u00ecnh`}</small></Card>
                <Card className="stat"><div className="stat-top">{'Gi\u00e1 tr\u1ecb trung b\u00ecnh \u0111\u01a1n (AOV)'}</div><strong style={{fontSize:'1.5rem'}}>{money(Number(data.kpi?.orders||0)?Number((data.kpi?.net_revenue??data.kpi?.revenue)||0)/Number(data.kpi.orders):0)}</strong><small>{'Doanh thu thu\u1ea7n / s\u1ed1 \u0111\u01a1n'}</small></Card>
              </div>

              {isOwner&&<Card style={{marginBottom:24}}><h2 style={{margin:'0 0 6px'}}>Hiệu quả kinh doanh theo từng chi nhánh</h2><p className="muted" style={{margin:'0 0 14px'}}>So sánh doanh thu thuần, giá vốn, lợi nhuận và tồn kho trong phạm vi thời gian đã chọn. Bấm tên chi nhánh để xem sâu dữ liệu.</p><div className="op-grid" style={{gridTemplateColumns:'minmax(280px,0.9fr) minmax(0,1.35fr)',alignItems:'center'}}><div style={{minHeight:260}}><BranchPerformanceChart rows={(data.by_branch||[]).map(row=>({...row,net_revenue:Number(row.net_revenue??row.revenue??0)}))}/></div><div className="dashboard-branch-table"><Table rows={data.by_branch||[]} empty="Chưa có chi nhánh trong phạm vi này." columns={[["name","Chi nhánh",r=><button type="button" onClick={()=>changeDashboardBranch(String(r.id))} style={{border:0,padding:0,background:'transparent',color:'var(--ri-primary)',fontWeight:700,cursor:'pointer'}}>{r.name}</button>],["orders","Đơn",r=>number(r.orders)],["net_revenue","Doanh thu",r=>money(r.net_revenue??r.revenue)],["total_cogs","Giá vốn",r=>money(r.total_cogs)],["gross_profit","Tiền lãi",r=><strong>{money(r.gross_profit)}</strong>]]}/></div></div></Card>}

              <Card style={{marginBottom:'24px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                  <div><h2 style={{margin:'0 0 6px'}}>Tổng hợp Dự báo AI</h2><p className="muted" style={{margin:0}}>Trạng thái độc lập của 5 tác vụ; phần còn lại vẫn hiển thị khi một tác vụ thiếu dữ liệu.</p></div>
                  <button type="button" className="btn btn-secondary" onClick={aiSummary.reload} disabled={aiSummary.loading}>{aiSummary.loading?'Đang tổng hợp...':'Làm mới dự báo AI'}</button>
                </div>
                {aiSummary.loading&&<p role="status" style={{marginTop:12}}>Đang tổng hợp kết quả AI...</p>}
                {aiSummary.error&&<p role="alert" style={{marginTop:12,color:'var(--ri-warning)'}}>Báo cáo AI tạm thời chưa tải được. Các số liệu bán hàng và tồn kho bên dưới vẫn hoạt động.</p>}
                {aiSummary.data&&<>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:10,marginTop:16}}>
                    {[
                      ['Dự báo sản phẩm',aiSummary.data.statuses?.sku,aiSummary.data.sku_forecast_total==null?'—':number(aiSummary.data.sku_forecast_total)],
                      ['Tổng nhu cầu',aiSummary.data.statuses?.total,aiSummary.data.forecast_total==null?'—':number(aiSummary.data.forecast_total)],
                      ['Gợi ý nhập',aiSummary.data.statuses?.replenishment,aiSummary.data.recommended_quantity==null?'—':`${number(aiSummary.data.recommended_quantity)} đơn vị`],
                      ['Thiếu hàng',aiSummary.data.statuses?.stockout,aiSummary.data.alert_count==null?'—':`${number(aiSummary.data.alert_count)} sản phẩm`],
                      ['Nhiều tháng',aiSummary.data.statuses?.multi,`${aiSummary.data.multi?.length||0} kỳ`]
                    ].map(([label,status,value])=><div key={label} style={{padding:12,border:'1px solid var(--ri-border)',borderRadius:10,minWidth:0}}><small style={{color:'var(--ri-text-muted)'}}>{label} · {aiStatusLabel(status)}</small><strong style={{display:'block',marginTop:6,overflowWrap:'anywhere'}}>{value}</strong></div>)}
                  </div>
                  {Object.values(aiSummary.data.statuses||{}).includes('UNAVAILABLE')&&<p role="status" className="muted" style={{margin:'12px 0 0'}}>Một số dự báo chưa sẵn sàng. Hãy ghi nhận tối thiểu 14–30 ngày giao dịch hoặc nạp mô hình/bộ dữ liệu mẫu NCKH; nếu dịch vụ AI đang tạm dừng, hãy kiểm tra kết nối.</p>}
                  {!!aiSummary.data.task_errors?.some(item=>item.message?.includes("npm start"))&&<p className="muted">AI FastAPI không phản hồi. Chạy <code>npm start</code> tại thư mục gốc để khởi động lại.</p>}
                  {aiSummary.data.status==='ADAPTIVE_FORECAST'&&<p role="status" className="muted" style={{margin:'12px 0 0'}}>Một hoặc nhiều kết quả dùng dự báo thích ứng cho cửa hàng mới; số liệu mang tính tham khảo.</p>}                  {aiSummary.data.status==='PARTIAL'&&<p role="status" className="muted" style={{margin:'12px 0 0'}}>Một số tác vụ chưa đủ dữ liệu hoặc chưa có mô hình; kết quả khả dụng vẫn được giữ lại.</p>}
                  {!!aiSummary.data.recommendations?.length&&<p style={{margin:'12px 0 0'}}>Đề xuất nhập: {aiSummary.data.recommendations.slice(0,5).map(r=>`${r.sku||r.product_id} (${number(r.recommended_quantity)})`).join(' · ')}</p>}
                  {!!aiSummary.data.alerts?.length&&<p style={{margin:'8px 0 0'}}>Cảnh báo: {aiSummary.data.alerts.slice(0,5).map(r=>r.sku||r.product_id).join(' · ')}</p>}
                </>}
              </Card>

              {/* 1 BIỂU ĐỒ XU HƯỚNG DOANH THU TỔNG HỢP */}
              <Card style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Xu hướng doanh thu bán hàng</h2>
                    <p className="muted" style={{ margin: '4px 0 0' }}>Diễn biến tổng doanh thu theo chu kỳ thời gian đã chọn</p>
                  </div>
                  <Link to="/reports" className="btn btn-secondary" style={{ fontSize: '11px' }}>
                    Xem báo cáo BI chuyên sâu <ArrowRight size={14} />
                  </Link>
                </div>
                <Trend rows={data.trend} x="period" series={[["revenue", "Doanh thu", "var(--ri-primary)"]]} tooltipSeries={[["revenue","Doanh thu"],["orders","Số đơn"],["gross_profit","Tiền lãi"]]} />
              </Card>

              {/* 2 BẢNG TÓM TẮT NGẮN: CẢNH BÁO HÀNG SẮP HẾT & GIAO DỊCH GẦN NHẤT */}
              <div className="op-grid" style={{ marginBottom: '24px' }}>
                {/* Bảng 1: Cảnh báo hàng sắp hết dựa trên min_stock thực tế */}
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={18} style={{ color: 'var(--ri-warning)' }} />
                      <h2 style={{ margin: 0, fontSize: '1rem' }}>Cảnh báo hàng sắp hết</h2>
                    </div>
                    <Link to="/inventory" style={{ color: 'var(--ri-primary)', fontSize: '12px', fontWeight: 600 }}>Xem tồn kho</Link>
                  </div>

                  <State resource={lowStockResource} fallback={<p className="muted">Đang tải thông tin tồn kho...</p>}>
                    {stockData => {
                      // Lọc sản phẩm có tồn kho <= mức tồn tối thiểu (mặc định 10 nếu chưa cài)
                      const items = (stockData?.items ?? []).filter(p => {
                        const threshold = p.min_stock != null ? Number(p.min_stock) : 10;
                        return p.quantity != null && Number(p.quantity) <= threshold;
                      }).slice(0, 5);

                      return (
                        <Table
                          rows={items}
                          empty="Tất cả mặt hàng đều đảm bảo mức tồn an toàn."
                          columns={[
                            ["sku", "Mã sản phẩm", r => <strong>{r.sku}</strong>],
                            ["name", "Tên sản phẩm"],
                            ["quantity", "Tồn kho", r => (
                              <span style={{ fontWeight: 700, color: Number(r.quantity) <= 5 ? 'var(--ri-danger)' : 'var(--ri-warning)' }}>
                                {number(r.quantity)}
                              </span>
                            )],
                            ["min_stock", "Mức tối thiểu", r => (
                              <span className="muted">{number(r.min_stock != null ? r.min_stock : 10)}</span>
                            )]
                          ]}
                        />
                      );
                    }}
                  </State>
                </Card>

                {/* Bảng 2: Giao dịch phát sinh gần nhất */}
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={18} style={{ color: 'var(--ri-primary)' }} />
                      <h2 style={{ margin: 0, fontSize: '1rem' }}>Giao dịch bán lẻ gần nhất</h2>
                    </div>
                    <Link to="/sales/history" style={{ color: 'var(--ri-primary)', fontSize: '12px', fontWeight: 600 }}>Lịch sử hóa đơn</Link>
                  </div>

                  <State resource={recentSales} fallback={<p className="muted">Đang tải hóa đơn gần nhất...</p>}>
                    {salesData => (
                      <Table
                        rows={(salesData?.items ?? []).slice(0, 5)}
                        empty="Chưa có giao dịch bán hàng nào phát sinh."
                        columns={[
                          ["id", "Số HĐ", r => `#${r.id}`],
                          ["branch_name", "Chi nhánh"],
                          ["created_at", "Thời gian", r => formatBusinessTime(r.created_at, data.calendar)],
                          ["total", "Tổng tiền", r => <strong>{money(r.total)}</strong>]
                        ]}
                      />
                    )}
                  </State>
                </Card>
              </div>
            </>
          );
        }}
      </State>

      {/* 5. MODAL HƯỚNG DẪN ONBOARDING (CHỈ XUẤT HIỆN LẦN ĐẦU ĐĂNG NHẬP HOẶC KHI CLICK 'HƯỚNG DẪN') */}
      {showWelcomeModal && !storeInfo.loading && storeInfo.data?.onboarding && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={dismissWelcomeModal}
        >
          <div
            style={{
              background: 'var(--ri-surface)',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '28px',
              boxShadow: 'var(--ri-shadow-lg, 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04))',
              border: '1px solid var(--ri-border)',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Nút đóng */}
            <button
              type="button"
              onClick={dismissWelcomeModal}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ri-muted)',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            {/* Header modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(37,99,235,0.1)',
                color: 'var(--ri-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Sparkles size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                  Chào mừng đến với Retail Insight!
                </h3>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>
                  3 bước cơ bản để đưa cửa hàng vào hoạt động kinh doanh thực tế
                </p>
              </div>
            </div>

            {/* Nội dung tóm tắt 3 bước */}
            <div style={{margin:'20px 0',display:'flex',flexDirection:'column',gap:12}}>{checklistSteps.map(step=><div key={step.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:10,background:'var(--ri-elevated)',borderRadius:8}}><span style={{width:24,height:24,borderRadius:'50%',background:step.done?'var(--ri-success)':'var(--ri-primary)',color:'#fff',display:'grid',placeItems:'center',fontSize:12,fontWeight:700,flexShrink:0}}>{step.done?'✓':step.id}</span><div style={{flex:1}}><div style={{fontWeight:600,fontSize:'.9rem'}}>{step.title.replace(/^BƯỚC \d: /,'')}</div><div className="muted" style={{fontSize:'.8rem'}}>{step.bullets.join(' · ')}</div>{step.id===2?<button type="button" onClick={()=>{dismissWelcomeModal();setPaymentSettingsOpen(true);}} style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:6,padding:0,border:0,background:'transparent',color:'var(--ri-primary)',font:'inherit',fontSize:'.8rem',fontWeight:600,cursor:'pointer'}}>{step.actionText}<ArrowRight size={13}/></button>:<Link to={step.link} onClick={dismissWelcomeModal} style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:6,fontSize:'.8rem',fontWeight:600}}>{step.actionText}<ArrowRight size={13}/></Link>}</div></div>)}</div>
            {!onboardingComplete && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={dismissWelcomeModal}
                style={{ padding: '8px 18px' }}
              >
                Để sau
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  dismissWelcomeModal();
                  navigate('/receipts');
                }}
                style={{ padding: '8px 20px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>Bắt đầu thiết lập</span>
                <ArrowRight size={15} />
              </button>
            </div>}
          </div>
        </div>
      )}
      <PaymentSettingsModal
        open={paymentSettingsOpen}
        onClose={()=>setPaymentSettingsOpen(false)}
        branchId={paymentBranchId}
        onSaved={()=>storeInfo.reload()}
      />
    </div>
  );
}
