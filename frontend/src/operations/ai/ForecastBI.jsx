import React from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Elements';
import { number } from '../shared';

const glassTooltip = ({ active, payload, label }) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const fields = [
    ['actual', row.estimated ? 'Ước tính theo trung bình lịch sử' : 'Thực tế bán'], ['forecast', 'Dự báo AI']
  ].filter(([key]) => row[key] != null);
  if(row.confidenceBand)fields.push(['confidenceBand','Khoảng tham chiếu ±1σ lịch sử']);
  return <div className="bi-chart-tooltip"><strong>{label}</strong>{fields.map(([key, title]) => <div className="bi-tooltip-row" key={key}><span>{title}</span><b>{key==='confidenceBand'?`${number(row[key][0])} – ${number(row[key][1])}`:number(row[key])}</b></div>)}</div>;
};
const multiTooltip = ({active,payload,label}) => {
  if(!active||!payload?.length)return null;
  const unique=[...new Map(payload.filter(item=>item.value!=null).map(item=>[item.dataKey,item])).values()];
  return <div className="bi-chart-tooltip"><strong>{label}</strong>{unique.map(item=><div className="bi-tooltip-row" key={item.dataKey}><span>{item.name}</span><b>{number(item.value)}</b></div>)}</div>;
};

export function makeForecastTimeline(history, forecasts) {
  const actual = (history || []).slice(-4).map(row => ({ month: row.month, actual: Number(row.quantity || 0) }));
  const mean = actual.length ? actual.reduce((sum,row)=>sum+row.actual,0)/actual.length : 0;
  const variance = actual.length > 1 ? actual.reduce((sum,row)=>sum+(row.actual-mean)**2,0)/(actual.length-1) : 0;
  const sigma = Math.sqrt(variance);
  const padded = actual.length && actual.length < 4 ? [...Array.from({length:4-actual.length},()=>({actual:mean,estimated:true})),...actual] : actual;
  const historical = padded.map((row,index)=>({period:`T-${padded.length-index}`,actual:row.actual,forecast:null,estimated:Boolean(row.estimated)}));
  if(historical.length)historical[historical.length-1].forecast=historical[historical.length-1].actual;
  const future=(forecasts||[]).map((row,index)=>{const value=Number(row.forecast??row.quantity??0);return {period:row.period||`T+${row.horizon??index+1}`,actual:null,forecast:value,confidenceBand:[Math.max(0,value-sigma),value+sigma]};});
  return {data:[...historical,...future],meanForecast:future.length?future.reduce((sum,row)=>sum+row.forecast,0)/future.length:0,historySigma:sigma};
}

export function ForecastKpis({ items }) {
  return <div className="stat-grid three forecast-bi-kpis" style={{ marginBottom: 24 }}>
    {items.map(item => <Card className="stat" key={item.label} style={{ borderTop: `3px solid ${item.color || '#4F46E5'}` }}>
      <div className="stat-top">{item.label}</div><strong style={{ color: item.color || 'var(--ri-text)' }}>{item.value}</strong><small>{item.detail}</small>
    </Card>)}
  </div>;
}

export function ForecastBIChart({ data, height = 340, xKey = 'period' }) {
  const currentPeriod = data.some(row => row.period === 'T-1') ? 'T-1' : null;
  return <div style={{ width: '100%', height }}>
    <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 16, right: 22, left: 4, bottom: 4 }}>
      <defs><linearGradient id="forecastAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4F46E5" stopOpacity={0.26}/><stop offset="95%" stopColor="#4F46E5" stopOpacity={0.015}/></linearGradient></defs>
      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--ri-border)"/>
      <XAxis dataKey={xKey} interval="preserveStartEnd" minTickGap={18} tick={{ fontSize: 11, fill: 'var(--ri-muted)' }} axisLine={false} tickLine={false}/>
      <YAxis tickFormatter={number} tick={{ fontSize: 11, fill: 'var(--ri-muted)' }} axisLine={false} tickLine={false}/>
      <Tooltip content={glassTooltip}/>
      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} content={()=><div style={{display:'flex',justifyContent:'center',gap:18,flexWrap:'wrap',fontSize:10,paddingTop:8}}><span><i style={{display:'inline-block',width:9,height:9,borderRadius:9,background:'#10B981',marginRight:6}}/>Thực tế bán</span><span><i style={{display:'inline-block',width:9,height:9,borderRadius:9,background:'#4F46E5',marginRight:6}}/>Dự báo AI</span><span><i style={{display:'inline-block',width:9,height:9,borderRadius:9,background:'#C7D2FE',marginRight:6}}/>Khoảng tham chiếu ±1σ lịch sử</span></div>}/>
      {currentPeriod&&<ReferenceLine x={currentPeriod} stroke="#64748B" strokeDasharray="5 5" strokeWidth={1.5}/>}
      <Area type="monotone" dataKey="confidenceBand" name="Khoảng tham chiếu ±1σ lịch sử" stroke="none" fill="#A5B4FC" fillOpacity={0.28} connectNulls isAnimationActive={false}/>
      <Area type="monotone" dataKey="forecast" name="Dự báo AI" stroke="none" fill="url(#forecastAreaGradient)" connectNulls isAnimationActive={false}/>
      <Line type="monotone" dataKey="actual" name="Thực tế bán" stroke="#10B981" strokeWidth={2.5} dot={{r:4,fill:'#10B981',stroke:'#fff',strokeWidth:2}} activeDot={{ r: 5 }}/>
      <Line type="monotone" dataKey="forecast" name="Dự báo AI" stroke="#4F46E5" strokeWidth={3} strokeDasharray="6 4" dot={{r:5,fill:'#4F46E5',stroke:'#fff',strokeWidth:2}} activeDot={{ r: 6 }}/>
    </ComposedChart></ResponsiveContainer>
  </div>;
}

export function ForecastMultiChart({ items }) {
  const chartItems = items || [];
  const products = chartItems.map((item, index) => ({ item, label: item.name || item.sku || `Sản phẩm ${index + 1}` }));
  const isScrollable = chartItems.length > 8;
  const chartWidth = isScrollable ? chartItems.length * 115 : '100%';
  const barSize = isScrollable ? 18 : 24;
  const horizons = [1,2,3];
  const periods = horizons.map(horizon=>({key:`h${horizon}`,horizon,label:`Kỳ T+${horizon}`,color:['#3730A3','#4F46E5','#0EA5E9'][horizon-1]}));
  const data = products.map(({item,label})=>{
    const row={product:label};
    periods.forEach(({key,horizon})=>{
      const forecast=item.forecasts?.find(f=>Number(f.horizon)===horizon);
      row[key]=Number(forecast?.corrected??forecast?.quantity??(horizon===1?item.quantity:0)??0);
    });
    return row;
  });
  return <Card style={{ marginBottom: 24 }}><h2 style={{ marginTop: 0 }}>So sánh nhu cầu theo kỳ dự báo</h2>
    {products.length ? <div style={{ overflowX: isScrollable ? 'auto' : 'hidden', scrollBehavior: 'smooth' }}><div style={{ height: 380, minWidth: chartWidth }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} barCategoryGap="15%" barGap={5} margin={{ top: 25, right: 22, left: 0, bottom: 48 }}>
      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--ri-border)"/><XAxis dataKey="product" interval={0} height={60} tick={{ fontSize: 10,fill:'var(--ri-muted)' }} tickFormatter={name=>name.length>18?`${name.slice(0,17)}…`:name}/><YAxis domain={[0,max=>max>0?max*1.2:1]} tickFormatter={number} tick={{ fontSize: 11 }}/><Tooltip content={multiTooltip}/><Legend wrapperStyle={{ fontSize: 11 }} content={()=><div style={{display:'flex',justifyContent:'center',gap:18,flexWrap:'wrap',fontSize:10,paddingTop:8}}>{periods.map(period=><span key={period.key}><i style={{display:'inline-block',width:9,height:9,borderRadius:3,background:period.color,marginRight:5}}/>{period.label}</span>)}<span><i style={{display:'inline-block',width:14,height:3,verticalAlign:'middle',background:'#10B981',marginRight:5}}/>Nhu cầu trung bình / Kỳ T+1</span></div>}/>
      {periods.map(period=><Bar key={period.key} dataKey={period.key} name={period.label} fill={period.color} barSize={barSize} radius={[6,6,0,0]}/>)}
      <Line type="linear" dataKey="h1" name="Nhu cầu trung bình / Kỳ T+1" stroke="#10B981" strokeWidth={2.75} dot={{r:5,fill:'#10B981',stroke:'#fff',strokeWidth:2}} activeDot={{r:6}} isAnimationActive={false}><LabelList dataKey="h1" position="top" formatter={number} offset={9} style={{fontSize:10,fill:'#047857',fontWeight:700}}/></Line>
    </ComposedChart></ResponsiveContainer></div></div> : <p className="muted">Chưa có sản phẩm để so sánh.</p>}
  </Card>;
}
