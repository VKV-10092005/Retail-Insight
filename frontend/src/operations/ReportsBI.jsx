import React, { useState, useMemo, useEffect } from 'react';
import { PageHeader, Card } from '../components/ui/Elements';
import {getJSON} from '../services/api';
import {ResponsiveContainer,PieChart,Pie,Cell,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,LabelList} from 'recharts';
import './ReportsBI.css';
import { useResource, State, Table, params, money, number } from './shared';
import { Trend, Bars } from './Dashboard';
import { Tabs } from '../design-system/Tabs';
import { formatBusinessTime } from './business-time';
import { useAuth } from '../auth/AuthContext';
import { useBranch } from '../branches/BranchContext';
import {
  Download,
  Calendar,
  Building2,
  Tags,
  Layers,
  TrendingUp,
  Boxes,
  Warehouse,
  BarChart3,
  Package
} from 'lucide-react';


const branchColors=['#0284C7','#10B981','#0EA5E9','#F59E0B','#0F766E','#F97316'];
const reportMoney=value=>money(Number(value||0));
const compactMoney=value=>{const n=Number(value||0);if(n>=1e6)return `${(n/1e6).toLocaleString('vi-VN',{maximumFractionDigits:1})}Tr`;if(n>=1e3)return `${Math.round(n/1e3)}k`;return String(Math.round(n));};
function CategoryRevenueChart({rows=[]}){
 const colors=['#0284C7','#0EA5E9','#10B981','#14B8A6','#0F766E','#F59E0B'];
 return <div className="op-chart reports-category-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{top:8,right:54,bottom:8,left:4}}>
  <defs><linearGradient id="categoryRevenueGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#0284C7"/><stop offset="55%" stopColor="#0EA5E9"/><stop offset="100%" stopColor="#10B981"/></linearGradient></defs>
  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--ri-border)"/><XAxis type="number" domain={[0,'dataMax * 1.15']} tickFormatter={compactMoney} axisLine={false} tickLine={false} tick={{fontSize:10,fill:'var(--ri-muted)'}}/><YAxis type="category" dataKey="name" width={160} axisLine={false} tickLine={false} tick={{fontSize:11,fill:'var(--ri-text)'}}/><Tooltip formatter={value=>[reportMoney(value),'Doanh thu']} contentStyle={{background:'var(--ri-surface)',border:'1px solid var(--ri-border)',borderRadius:12,boxShadow:'var(--ri-shadow-md)'}}/><Bar dataKey="revenue" name="Doanh thu" barSize={22} radius={[0,7,7,0]} isAnimationActive={false}>{rows.map((row,index)=><Cell key={row.id||row.name} fill={colors[index%colors.length]}/>) }<LabelList dataKey="revenue" position="right" formatter={compactMoney} style={{fontSize:10,fill:'var(--ri-text)',fontWeight:700}}/></Bar>
 </BarChart></ResponsiveContainer></div>;
}
function BranchRevenueDonut({rows=[]}){
 const total=rows.reduce((sum,row)=>sum+Number(row.revenue||row.net_revenue||0),0);
 const data=rows.map(row=>({...row,revenue:Number(row.revenue??row.net_revenue??0)}));
 if(!data.length||total<=0)return <div className="reports-donut-empty">{'Ch\u01b0a c\u00f3 doanh thu theo chi nh\u00e1nh trong k\u1ef3.'}</div>;
 return <div className="reports-donut-layout"><div className="reports-donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="revenue" nameKey="name" innerRadius="62%" outerRadius="85%" paddingAngle={4} cornerRadius={6} stroke="none" isAnimationActive={false}>{data.map((row,index)=><Cell key={row.id||row.name} fill={branchColors[index%branchColors.length]}/>)}</Pie></PieChart></ResponsiveContainer><div className="reports-donut-center"><small>{'T\u1ed5ng doanh thu'}</small><strong>{total>=1e6?`${(total/1e6).toLocaleString('vi-VN',{maximumFractionDigits:2})} Tr đ`:reportMoney(total)}</strong></div></div><div className="reports-donut-legend">{data.map((row,index)=>{const share=total?Number(row.revenue||0)/total*100:0;return <div className="reports-donut-legend-row" key={row.id||row.name}><span className="reports-donut-label"><i style={{background:branchColors[index%branchColors.length]}}/><b>{row.name}</b></span><strong>{reportMoney(row.revenue)}</strong><small>{share.toLocaleString('vi-VN',{maximumFractionDigits:1})}%</small></div>;})}</div></div>;
}
function BranchInventoryDonut({rows=[]}){
 const total=rows.reduce((sum,row)=>sum+Number(row.quantity||0),0);
 if(!rows.length||total<=0)return <div className="reports-donut-empty">Chưa có dữ liệu tồn kho theo chi nhánh.</div>;
 return <div className="reports-donut-layout"><div className="reports-donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="quantity" nameKey="name" innerRadius="62%" outerRadius="85%" paddingAngle={4} cornerRadius={6} stroke="none" isAnimationActive={false}>{rows.map((row,index)=><Cell key={row.id||row.name} fill={branchColors[index%branchColors.length]}/>)}</Pie></PieChart></ResponsiveContainer><div className="reports-donut-center"><small>Tổng tồn kho</small><strong>{number(total)} đơn vị</strong></div></div><div className="reports-donut-legend">{rows.map((row,index)=>{const share=total?Number(row.quantity||0)/total*100:0;return <div className="reports-donut-legend-row" key={row.id||row.name}><span className="reports-donut-label"><i style={{background:branchColors[index%branchColors.length]}}/><b>{row.name}</b></span><strong>{number(row.quantity)}</strong><small>{share.toLocaleString('vi-VN',{maximumFractionDigits:1})}%</small></div>;})}</div></div>;
}

export default function ReportsBI() {
  const {user}=useAuth();
  const {activeBranchId,activeBranch,branches:branchItems,setActiveBranchId,isOwner}=useBranch();
  const vietnamDateParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
  const today=`${vietnamDateParts.year}-${vietnamDateParts.month}-${vietnamDateParts.day}`;
  const thirtyDaysAgo=new Date(Date.UTC(Number(vietnamDateParts.year),Number(vietnamDateParts.month)-1,Number(vietnamDateParts.day)-30)).toISOString().slice(0,10);

  const [filters, setFilters] = useState({
    start: thirtyDaysAgo,
    end: today,
    branch_id: activeBranchId,
    category_id: '',
    granularity: 'day'
  });

  const [activeTab, setActiveTab] = useState('revenue_branches');

  const categories = useResource('/categories'+(filters.branch_id?`?branch_id=${filters.branch_id}`:''));
  const reportFilters=isOwner?filters:{...filters,branch_id:activeBranchId};
  const biData = useResource(`/bi/overview?${params(reportFilters)}`);
  const [previousKpi,setPreviousKpi]=useState(null);
  useEffect(()=>{
    let live=true;
    setPreviousKpi(null);
    if(!filters.start||!filters.end){setPreviousKpi(null);return()=>{live=false;};}
    const startTime=Date.parse(`${filters.start}T00:00:00Z`),endTime=Date.parse(`${filters.end}T00:00:00Z`);
    const days=Math.max(1,Math.round((endTime-startTime)/86400000)+1);
    const priorEnd=new Date(startTime-86400000).toISOString().slice(0,10);
    const priorStart=new Date(startTime-days*86400000).toISOString().slice(0,10);
    const scope=isOwner?filters:{...filters,branch_id:activeBranchId};
    getJSON(`/bi/overview?${params({...scope,start:priorStart,end:priorEnd})}`).then(result=>{if(live)setPreviousKpi(result.kpi||null);}).catch(()=>{if(live)setPreviousKpi(null);});
    return()=>{live=false;};
  },[filters.start,filters.end,filters.branch_id,filters.category_id,filters.granularity,isOwner,activeBranchId]);

  React.useEffect(()=>{if(activeBranchId)setFilters(current=>({...current,branch_id:activeBranchId}));},[activeBranchId]);
  const changeReportBranch=value=>{setFilters(current=>({...current,branch_id:value}));if(value)setActiveBranchId(value);};

  // Hàm xuất CSV dữ liệu của Tab đang chọn
  const handleExportCSV = (data) => {
    if (!data) return;
    let exportRows = [];
    let filename = `bao-cao-bi-${activeTab}-${today}.csv`;

    if (activeTab === 'revenue_branches') {
      exportRows = (data.by_branch ?? []).map(b => ({
        'Mã chi nhánh': b.id,
        'Tên chi nhánh': b.name,
        'Doanh thu (VNĐ)': b.revenue
      }));
    } else if (activeTab === 'products') {
      exportRows = (data.top_products ?? []).map(p => ({
        'Mã SKU': p.sku,
        'Tên sản phẩm': p.name,
        'Số lượng đã bán': p.quantity,
        'Doanh thu (VNĐ)': p.revenue
      }));
    } else if (activeTab === 'inventory') {
      exportRows = (data.inventory?.highest ?? []).map(i => ({
        'Mã SKU': i.sku,
        'Tên sản phẩm': i.name,
        'Chi nhánh': i.branch_id,
        'Số lượng tồn': i.quantity
      }));
    }

    if (!exportRows.length) {
      alert('Không có dữ liệu trong bảng để xuất báo cáo.');
      return;
    }

    const headers = Object.keys(exportRows[0]);
    const escapeCell = val => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvContent = '﻿' + [
      headers.map(escapeCell).join(','),
      ...exportRows.map(row => headers.map(h => escapeCell(row[h])).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="reports-bi-container">
      <PageHeader
        eyebrow="BÁO CÁO PHÂN TÍCH DOANH NGHIỆP"
        title="Báo cáo thông minh (BI Analytics)"
        description="Phân tích chuyên sâu về doanh thu, hiệu quả mặt hàng và luân chuyển tồn kho theo thời gian thực."
      />

      {/* THANH BỘ LỌC BI CHUYÊN SÂU */}
      <Card style={{ marginBottom: '24px', padding: '18px 22px' }}>
        <div className="op-filters" style={{ margin: 0, alignItems: 'end' }}>
          <label>
            Từ ngày
            <input
              type="date"
              className="ri-control"
              value={filters.start}
              onChange={e => setFilters({ ...filters, start: e.target.value })}
            />
          </label>

          <label>
            Đến ngày
            <input
              type="date"
              className="ri-control"
              value={filters.end}
              onChange={e => setFilters({ ...filters, end: e.target.value })}
            />
          </label>

          <label>
            {isOwner?'Phạm vi chi nhánh':'Chi nhánh được phân công'}
            {isOwner?<select
              className="ri-control"
              value={filters.branch_id}
              onChange={e => changeReportBranch(e.target.value)}
            >
              <option value="">{isOwner?'Tất cả chi nhánh (Toàn chuỗi)':'Chi nhánh của tôi'}</option>
              {branchItems.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>:<span className="branch-static-badge">{activeBranch?.name||`Chi nhánh #${activeBranchId}`}</span>}
          </label>

          <label>
            Danh mục sản phẩm
            <select
              className="ri-control"
              value={filters.category_id}
              onChange={e => setFilters({ ...filters, category_id: e.target.value })}
            >
              <option value="">Tất cả danh mục hàng hóa</option>
              {categories.data?.items?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label>
            Độ chi tiết
            <select
              className="ri-control"
              value={filters.granularity}
              onChange={e => setFilters({ ...filters, granularity: e.target.value })}
            >
              <option value="day">Theo ngày</option>
              <option value="month">Theo tháng</option>
            </select>
          </label>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleExportCSV(biData.data)}
              disabled={biData.loading || !biData.data}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={16} />
              <span>Xuất báo cáo CSV</span>
            </button>
          </div>
        </div>
      </Card>

      {/* DỮ LIỆU BI VỚI 3 TAB PHÂN TÍCH */}
      <State resource={biData}>
        {data => {
          const totalRevenue = data.by_branch?.reduce((acc, b) => acc + Number(b.revenue || 0), 0) || 1;
          const kpi=data.kpi||{};
          const revenue=Number(kpi.net_revenue??kpi.revenue??0),cogs=Number(kpi.total_cogs||0),profit=Number(kpi.gross_profit??(revenue-cogs)),orders=Number(kpi.orders||0);
          const periodDays=Math.max(1,Math.round((Date.parse(`${filters.end}T00:00:00Z`)-Date.parse(`${filters.start}T00:00:00Z`))/86400000)+1);
          const growth=previousKpi&&Number(previousKpi.net_revenue??previousKpi.revenue)>0?(revenue-Number(previousKpi.net_revenue??previousKpi.revenue))/Number(previousKpi.net_revenue??previousKpi.revenue)*100:null;
          const margin=revenue?profit/revenue*100:0;
          const executiveKpis=[
            {label:'Doanh thu thu\u1ea7n',value:reportMoney(revenue),detail:`${number(orders)} \u0111\u01a1n h\u00e0ng trong k\u1ef3`,badge:growth==null?'So v\u1edbi k\u1ef3 tr\u01b0\u1edbc':`${growth>=0?'+':''}${number(growth,1)}%`,tone:growth==null?'neutral':growth>=0?'positive':'negative'},
            {label:'L\u1ee3i nhu\u1eadn g\u1ed9p',value:reportMoney(profit),detail:`Gi\u00e1 v\u1ed1n ${reportMoney(cogs)}`,badge:`${number(margin,1)}% t\u1ef7 su\u1ea5t`,tone:'positive'},
            {label:'T\u1ed5ng \u0111\u01a1n ho\u00e0n t\u1ea5t',value:`${number(orders)} \u0111\u01a1n`,detail:`${number(orders/periodDays,1)} \u0111\u01a1n/ng\u00e0y trung b\u00ecnh`,badge:`${periodDays} ng\u00e0y`,tone:'neutral'},
            {label:'Gi\u00e1 tr\u1ecb trung b\u00ecnh \u0111\u01a1n (AOV)',value:reportMoney(orders?revenue/orders:0),detail:'Doanh thu thu\u1ea7n / s\u1ed1 \u0111\u01a1n',badge:orders?'Trung b\u00ecnh m\u1ed7i \u0111\u01a1n':'Ch\u01b0a c\u00f3 \u0111\u01a1n',tone:'info'}
          ];

          const tabItems = [
            {
              id: 'revenue_branches',
              label: <span className="reports-tab-label"><TrendingUp size={16}/> Doanh thu &amp; Chi nhánh</span>,
              content: (
                <div style={{ marginTop: '20px' }}>
                  <div className="op-grid" style={{ marginBottom: '24px' }}>
                    <Card>
                      <h2>{'Xu h\u01b0\u1edbng doanh thu thu\u1ea7n & l\u1ee3i nhu\u1eadn theo th\u1eddi gian'}</h2>
                      <Trend rows={data.trend} x="period" series={[["revenue","Doanh thu thu\u1ea7n","#0284C7"]]} tooltipSeries={[["revenue","Doanh thu thu\u1ea7n"],["total_cogs","Gi\u00e1 v\u1ed1n"],["gross_profit","L\u1ee3i nhu\u1eadn g\u1ed9p"],["orders","S\u1ed1 \u0111\u01a1n h\u00e0ng"]]} />
                    </Card>

                    <Card>
                      <h2>{'C\u01a1 c\u1ea5u doanh thu theo chi nh\u00e1nh'}</h2>
                      <BranchRevenueDonut rows={data.by_branch||[]}/>
                    </Card>
                  </div>

                  <Card>
                    <h2>Bảng so sánh doanh thu chi tiết giữa các chi nhánh</h2>
                    <Table
                      rows={data.by_branch}
                      empty="Chưa có dữ liệu doanh thu chi nhánh trong kỳ."
                      columns={[
                        ["name", "Tên chi nhánh", r => isOwner?<button type="button" onClick={()=>changeReportBranch(String(r.id))} style={{border:0,padding:0,background:'transparent',color:'var(--ri-primary)',fontWeight:700,cursor:'pointer'}}>{r.name}</button>:<strong>{r.name}</strong>],
                        ["id", "Mã chi nhánh", r => `#${r.id}`],
                        ...(isOwner?[["manager_name","Quản lý phụ trách"],["orders","Số đơn",r=>number(r.orders)]]:[]),
                        ["net_revenue", "Doanh thu thuần", r => money(r.net_revenue)],
                        ...(isOwner?[["total_cogs","Giá vốn",r=>money(r.total_cogs)],["gross_profit","Tiền lãi",r=><strong>{money(r.gross_profit)}</strong>],["profit_margin_pct","Tỷ suất lợi nhuận",r=>`${number(r.profit_margin_pct)}%`],["inventory_quantity","Tổng tồn kho",r=>number(r.inventory_quantity)]]:[]),
                        [
                          "share",
                          "Tỷ trọng đóng góp",
                          r => {
                            const pct = ((Number(r.revenue || 0) / totalRevenue) * 100).toFixed(1);
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '80px', height: '8px', background: 'var(--ri-elevated)', border: '1px solid var(--ri-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--ri-primary)' }} />
                                </div>
                                <span>{pct}%</span>
                              </div>
                            );
                          }
                        ]
                      ]}
                    />
                  </Card>
                </div>
              )
            },
            {
              id: 'products',
              label: <span className="reports-tab-label"><BarChart3 size={16}/> Hiệu quả Sản phẩm</span>,
              content: (
                <div style={{ marginTop: '20px' }}>
                  <div className="op-grid" style={{ marginBottom: '24px' }}>
                    <Card>
                      <h2>Top 10 sản phẩm bán chạy nhất</h2>
                      <Table
                        rows={data.top_products}
                        empty="Chưa có giao dịch bán sản phẩm."
                        columns={[
                          ["sku", "Mã sản phẩm", r => <strong>{r.sku}</strong>],
                          ["name", "Tên sản phẩm"],
                          ["quantity", "Số lượng bán", r => number(r.quantity)],
                          ["revenue", "Doanh thu", r => <span style={{ color: 'var(--ri-success)', fontWeight: 600 }}>{money(r.revenue)}</span>]
                        ]}
                      />
                    </Card>

                    <Card>
                      <h2>Top 10 sản phẩm bán chậm / Cần lưu ý</h2>
                      <Table
                        rows={data.slow_products}
                        empty="Không có sản phẩm trong danh sách bán chậm."
                        columns={[
                          ["sku", "Mã sản phẩm", r => <strong>{r.sku}</strong>],
                          ["name", "Tên sản phẩm"],
                          ["quantity", "Số lượng đã bán", r => (
                            <span style={{ color: Number(r.quantity) === 0 ? 'var(--ri-danger)' : 'inherit' }}>
                              {number(r.quantity)}
                            </span>
                          )]
                        ]}
                      />
                    </Card>
                  </div>

                  <Card>
                    <h2>Doanh thu theo danh mục hàng hóa</h2>
                    <CategoryRevenueChart rows={data.by_category||[]} />
                  </Card>
                </div>
              )
            },
            {
              id: 'inventory',
              label: <span className="reports-tab-label"><Package size={16}/> Xuất - Nhập - Tồn kho</span>,
              content: (
                <div style={{ marginTop: '20px' }}>
                  <Card style={{ marginBottom: '24px' }}>
                    <h2>Biến động xuất - nhập kho theo thời gian</h2>
                    <Trend
                      rows={data.movements}
                      x="period"
                      series={[
                        ["incoming", "Lượng hàng nhập", "var(--ri-success)"],
                        ["outgoing", "Lượng hàng xuất bán", "var(--ri-warning)"]
                      ]}
                    />
                  </Card>

                  <div className="op-grid" style={{ marginBottom: '24px' }}>
                    <Card>
                      <h2>Tồn kho phân bổ theo chi nhánh</h2>
                      <BranchInventoryDonut rows={data.inventory?.by_branch||[]} />
                    </Card>

                    <Card>
                      <h2>Mặt hàng có lượng tồn lớn nhất</h2>
                      <Table
                        rows={data.inventory?.highest}
                        empty="Chưa có dữ liệu tồn kho."
                        columns={[
                          ["sku", "Mã sản phẩm", r => <strong>{r.sku}</strong>],
                          ["name", "Tên sản phẩm"],
                          ["branch_id", "Mã CN", r => `#${r.branch_id}`],
                          ["quantity", "Tồn kho", r => number(r.quantity)]
                        ]}
                      />
                      {data.inventory?.valuation && (
                        <p className="muted" style={{ marginTop: '10px' }}>{data.inventory.valuation_reason}</p>
                      )}
                    </Card>
                  </div>
                </div>
              )
            }
          ];

          return (
            <>
            <div className="reports-executive-kpis">{executiveKpis.map((item,index)=><article className={`reports-exec-kpi tone-${item.tone}`} key={item.label}><div className="reports-exec-kpi-top"><span>{item.label}</span><i>{String(index+1).padStart(2,'0')}</i></div><strong>{item.value}</strong><div className="reports-exec-kpi-foot"><small>{item.detail}</small><b>{item.badge}</b></div></article>)}</div>
            <Tabs
              items={tabItems}
              value={activeTab}
              onValueChange={setActiveTab}
              label="Báo cáo phân tích chuyên sâu"
            />
            </>

          );
        }}
      </State>
    </div>
  );
}
