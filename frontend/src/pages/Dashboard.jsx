import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {getJSON} from '../services/api';
import {PageHeader,Card} from '../components/ui/Elements';
import {money} from '../operations/shared';
const dayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
export default function Dashboard(){
 const {user}=useAuth();const [data,setData]=useState(null),[error,setError]=useState(''),[profit,setProfit]=useState(null);
 useEffect(()=>{const c=new AbortController();getJSON('/dashboard/overview',{signal:c.signal}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[]);
 useEffect(()=>{if(!['OWNER','MANAGER'].includes(user?.role))return;const today=dayKey(),month=today.slice(0,7),start=`${month}-01`;Promise.all([getJSON(`/bi/overview?start=${today}&end=${today}`),getJSON(`/bi/overview?start=${start}&end=${today}`)]).then(([day,monthData])=>setProfit({day:day.kpi,month:monthData.kpi})).catch(()=>{});},[user?.role]);
 return <><PageHeader title={`Xin chào, ${user.name}`} description="Thông tin tài khoản và số liệu cửa hàng từ retail_app."/>{error?<p role="alert">{error}</p>:data?<div className="grid gap-4 md:grid-cols-2"><Card><h2>{data.organization.name}</h2><p>Mã cửa hàng: {data.organization.id}</p></Card><Card><h2>{data.branches} chi nhánh</h2><p>{user.email}</p><p>Vai trò: {user.role}</p></Card></div>:<p role="status">Đang tải cửa hàng...</p>}{profit&&<div className="grid gap-4 md:grid-cols-2" style={{marginTop:16}}><Card><h2>Lợi nhuận gộp hôm nay</h2><strong style={{fontSize:26}}>{money(profit.day.gross_profit)}</strong><p>Doanh thu thuần {money(profit.day.net_revenue)} · Giá vốn {money(profit.day.total_cogs)}</p></Card><Card><h2>Lợi nhuận gộp tháng này</h2><strong style={{fontSize:26}}>{money(profit.month.gross_profit)}</strong><p>Doanh thu thuần {money(profit.month.net_revenue)} · Giá vốn {money(profit.month.total_cogs)}</p></Card></div>}<Card><h2>Báo cáo chi tiết</h2><p>Xu hướng doanh thu, giá vốn và lợi nhuận được phân quyền theo chi nhánh.</p><Link to="/reports">Mở báo cáo BI</Link></Card><Card><Link to="/research-demo">Xem dashboard nghiên cứu mẫu</Link></Card></>;
}
