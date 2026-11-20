import React from 'react';
import {ResponsiveContainer,AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,BarChart,Bar,Legend} from 'recharts';
import {salesTrend} from '../../data/mockData';
import {number} from '../../utils/format';
export function SalesChart({year='all',type='area'}){const data=salesTrend.filter(i=>year==='all'||i.month.endsWith(year==='2022'?'22':'23'));return <div className="chart-container"><ResponsiveContainer width="100%" height="100%">{type==='bar'?<BarChart data={data} margin={{top:12,right:8,left:0,bottom:0}}><CartesianGrid vertical={false} stroke="#e9edf4" strokeDasharray="4 4"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#8b96ac'}} interval="preserveStartEnd"/><YAxis axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#8b96ac'}} width={35}/><Tooltip formatter={v=>[`${number(v,2)} tỷ ₫`,'Doanh thu']}/><Bar dataKey="revenue" name="Doanh thu (tỷ)" fill="#0284c7" radius={[5,5,0,0]} maxBarSize={26}/></BarChart>:<AreaChart data={data} margin={{top:12,right:8,left:0,bottom:0}}><defs><linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0284c7" stopOpacity={0.24}/><stop offset="100%" stopColor="#0284c7" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9edf4" strokeDasharray="4 4"/><XAxis dataKey="month" tick={{fontSize:11,fill:'#8b96ac'}} axisLine={false} tickLine={false} interval="preserveStartEnd"/><YAxis tick={{fontSize:11,fill:'#8b96ac'}} axisLine={false} tickLine={false} width={35}/><Tooltip formatter={v=>[`${number(v,2)} tỷ ₫`,'Doanh thu']}/><Area name="Doanh thu (tỷ)" type="monotone" dataKey="revenue" stroke="#0284c7" strokeWidth={3} fill="url(#revGradient)" activeDot={{r:5}}/></AreaChart>}</ResponsiveContainer></div>}





