import React,{useEffect,useRef,useState} from 'react';
import {Check,Music,Printer,Settings as SettingsIcon,Monitor,ShieldCheck,Volume2,Sparkles,BellRing,Bot} from 'lucide-react';
import {PageHeader,Card} from '../components/ui/Elements';
import {useTheme} from '../design-system';
import {request} from '../operations/shared';
import {useAuth} from '../auth/AuthContext';
import {cacheAppSettings,DEFAULT_SETTINGS,readAppSettings} from '../services/appSettings';
import {NOTIFICATION_SOUND_TONES,playNotificationSound} from '../utils/notificationSound';
import './Settings.css';

const defaults={...DEFAULT_SETTINGS.general,...DEFAULT_SETTINGS.operations,...DEFAULT_SETTINGS.ai,...DEFAULT_SETTINGS.platform};
export default function Settings(){
 const {user}=useAuth();const {preference,setTheme}=useTheme();const platform=user?.role==='PLATFORM_ADMIN';
 const canSell=['OWNER','MANAGER','CASHIER'].includes(user?.role),canOperate=['OWNER','MANAGER','INVENTORY'].includes(user?.role);
 const [form,setForm]=useState({...defaults,theme:preference});const [initial,setInitial]=useState(null);const [error,setError]=useState('');const [saveState,setSaveState]=useState('');
 const formRef=useRef(form),debounceRef=useRef(null),saveStateTimer=useRef(null),writeQueue=useRef(Promise.resolve()),writeVersion=useRef(0);
 useEffect(()=>{formRef.current=form;},[form]);
 useEffect(()=>{setForm(current=>({...current,theme:preference}));},[preference]);
 useEffect(()=>{let live=true;const path=platform?'/platform/settings':'/settings';request(path).then(data=>{
  if(!live)return;const cached=readAppSettings(user?.id);const next=platform?{...defaults,...cached.platform,...data,...data.general}:{...defaults,...cached.general,...cached.operations,...cached.ai,...data.general,...data.operations};
  formRef.current=next;cacheAppSettings(user?.id,platform?{...cached,platform:data,general:{...cached.general,...data.general}}:{...cached,...data,general:{...cached.general,...data.general},operations:{...cached.operations,...data.operations}},user?.role);
  if(data.general?.theme)setTheme(data.general.theme);setForm(next);setInitial(next);
 }).catch(reason=>{if(!live)return;setError(reason.message||'Không tải được cài đặt.');const cached=readAppSettings(user?.id);const next={...defaults,...cached.general,...cached.operations,...cached.ai,...cached.platform,theme:preference};formRef.current=next;setForm(next);setInitial(next);});return()=>{live=false;clearTimeout(debounceRef.current);clearTimeout(saveStateTimer.current);};},[user?.id,platform]);

 function persist(snapshot){
  if(!initial)return;clearTimeout(debounceRef.current);clearTimeout(saveStateTimer.current);setError('');setSaveState('saving');
  const version=++writeVersion.current;const cached=readAppSettings(user?.id);
  const local=platform?{...cached,platform:{maintenance:snapshot.maintenance,aiChatLimit:Number(snapshot.aiChatLimit),auditEnabled:snapshot.auditEnabled},general:{theme:snapshot.theme,sound:snapshot.sound,soundTone:snapshot.soundTone||'ting-tong',numberFormat:snapshot.numberFormat,timezone:snapshot.timezone}}:{...cached,general:{theme:snapshot.theme,sound:snapshot.sound,soundTone:snapshot.soundTone||'ting-tong',numberFormat:snapshot.numberFormat,timezone:snapshot.timezone},operations:{...(canSell?{autoPrint:snapshot.autoPrint,receiptFooter:snapshot.receiptFooter}:{}),...(canOperate?{lowStockThreshold:Number(snapshot.lowStockThreshold),dailyDigest:snapshot.dailyDigest,monthlyDigest:snapshot.monthlyDigest}:{})}};
  cacheAppSettings(user?.id,local,user?.role);
  if(snapshot.theme!==preference)setTheme(snapshot.theme);
  const path=platform?'/platform/settings':'/settings';
  const body=platform?{maintenance:snapshot.maintenance,aiChatLimit:Number(snapshot.aiChatLimit),auditEnabled:snapshot.auditEnabled,general:{theme:snapshot.theme,sound:snapshot.sound,numberFormat:snapshot.numberFormat,timezone:snapshot.timezone}}:{general:{theme:snapshot.theme,sound:snapshot.sound,numberFormat:snapshot.numberFormat,timezone:snapshot.timezone},operations:{...(canSell?{autoPrint:snapshot.autoPrint,receiptFooter:snapshot.receiptFooter}:{}),...(canOperate?{lowStockThreshold:Number(snapshot.lowStockThreshold),dailyDigest:snapshot.dailyDigest,monthlyDigest:snapshot.monthlyDigest}:{})}};
  writeQueue.current=writeQueue.current.catch(()=>{}).then(()=>request(path,{method:'PUT',body})).then(result=>{
   if(version!==writeVersion.current)return;const base=readAppSettings(user?.id);const merged=platform?{...base,platform:result,general:{...base.general,...result.general}}:{...base,...result};cacheAppSettings(user?.id,merged,user?.role);setInitial(snapshot);setSaveState('saved');saveStateTimer.current=setTimeout(()=>setSaveState(current=>current==='saved'?'':current),2000);
  }).catch(reason=>{if(version===writeVersion.current){setError(reason.message||'Không tự động lưu được cài đặt.');setSaveState('error');}});
 }
 function update(name,value,immediate=false){const next={...formRef.current,[name]:value};formRef.current=next;setForm(next);setSaveState('');if(name==='theme')setTheme(value);clearTimeout(debounceRef.current);if(immediate)persist(next);else debounceRef.current=setTimeout(()=>persist(next),500);}
 function updateAi(name,value){const current=readAppSettings(user?.id),nextAi={...current.ai,[name]:value};cacheAppSettings(user?.id,{...current,ai:nextAi},user?.role);const next={...formRef.current,[name]:value};formRef.current=next;setForm(next);setInitial(currentForm=>currentForm?{...currentForm,[name]:value}:currentForm);setSaveState('saved');clearTimeout(saveStateTimer.current);saveStateTimer.current=setTimeout(()=>setSaveState(current=>current==='saved'?'':current),2000);}
 function selectSoundTone(tone){const next={...formRef.current,soundTone:tone},cached=readAppSettings(user?.id);formRef.current=next;setForm(next);cacheAppSettings(user?.id,{...cached,general:{...cached.general,soundTone:tone}},user?.role);setInitial(current=>current?{...current,soundTone:tone}:current);setSaveState('saved');clearTimeout(saveStateTimer.current);saveStateTimer.current=setTimeout(()=>setSaveState(current=>current==='saved'?'':current),2000);void playNotificationSound(tone);}
 function flush(){clearTimeout(debounceRef.current);persist(formRef.current);}
 const status=saveState==='saving'?'Đang lưu…':saveState==='saved'?'✓ Đã tự động lưu':saveState==='error'?'Chưa lưu được':'';
 const soundPreview=<button type="button" className="btn btn-secondary btn-sm" disabled={!form.sound} onClick={()=>void playNotificationSound(form.soundTone||'ting-tong')} title="Phát thử âm thanh thông báo"><Volume2 size={15}/>Nghe thử</button>;
 return <><PageHeader eyebrow="TÙY CHỈNH TRẢI NGHIỆM" title="Cài đặt" description="Thiết lập giao diện, hiển thị và các tùy chọn vận hành phù hợp với vai trò của bạn." actions={status&&<span role="status" style={{fontSize:12,color:saveState==='error'?'var(--ri-danger)':'var(--ri-success)',fontWeight:600}}>{status}</span>}/>
  {error&&<p role="alert" style={{color:'var(--ri-danger)'}}>{error}</p>}
  {platform?<><Card><div className="feature-heading"><Monitor size={20}/><div><h2>Cài đặt chung</h2><p>Tùy chỉnh giao diện và cách thông tin hiển thị.</p></div></div>
   <label className="setting-field">Chế độ giao diện<select className="ri-control" value={form.theme} onChange={e=>update('theme',e.target.value,true)}><option value="light">Sáng</option><option value="dark">Tối</option><option value="system">Theo hệ thống</option></select></label>
   <SettingToggle title="Âm thanh thông báo" description="Phát âm báo khi có thông báo mới." checked={form.sound} onChange={v=>update('sound',v,true)} action={soundPreview}/>
   {form.sound&&<SoundTonePicker value={form.soundTone||'ting-tong'} onChange={selectSoundTone}/>}
   <div className="settings-general-pair"><label className="setting-field">Định dạng số<select className="ri-control" value={form.numberFormat} onChange={e=>update('numberFormat',e.target.value,true)}><option value="vi-VN">Việt Nam (1.234,56)</option><option value="en-US">Quốc tế (1,234.56)</option></select></label><label className="setting-field">Múi giờ<select className="ri-control" value={form.timezone} onChange={e=>update('timezone',e.target.value,true)}><option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option></select></label></div>
  </Card><Card><div className="feature-heading"><ShieldCheck size={20}/><div><h2>Cài đặt Quản trị Nền tảng</h2><p>Điều khiển các chính sách dùng chung trên toàn hệ thống.</p></div></div>
   <SettingToggle title="Chế độ bảo trì hệ thống" description="Tạm dừng API cho người dùng cửa hàng; quản trị nền tảng vẫn truy cập được." checked={form.maintenance} onChange={v=>update('maintenance',v,true)}/>
   <label className="setting-field">Giới hạn gọi AI Chatbot mỗi phút<input className="ri-control" type="number" min="1" max="120" value={form.aiChatLimit} onChange={e=>update('aiChatLimit',e.target.value)} onBlur={flush}/></label>
   <SettingToggle title="Tự động ghi nhật ký kiểm toán bảo mật" description="Ghi sự kiện an ninh vào audit log và áp dụng quy tắc phát hiện tái phạm." checked={form.auditEnabled} onChange={v=>update('auditEnabled',v,true)}/>
  </Card></>:<div className="settings-grid">
   <Card><div className="feature-heading"><Monitor size={20}/><div><h2>Cài đặt chung</h2><p>Tùy chỉnh giao diện và cách thông tin hiển thị.</p></div></div>
    <label className="setting-field">Chế độ giao diện<select className="ri-control" value={form.theme} onChange={e=>update('theme',e.target.value,true)}><option value="light">Sáng</option><option value="dark">Tối</option><option value="system">Theo hệ thống</option></select></label>
    <SettingToggle title="Âm thanh thông báo & thao tác POS" description="Phát tiếng bíp nhẹ khi thêm sản phẩm hoặc có thông báo mới." checked={form.sound} onChange={v=>update('sound',v,true)} action={soundPreview}/>
    {form.sound&&<SoundTonePicker value={form.soundTone||'ting-tong'} onChange={selectSoundTone}/>}
    <div className="settings-general-pair"><label className="setting-field">Định dạng số<select className="ri-control" value={form.numberFormat} onChange={e=>update('numberFormat',e.target.value,true)}><option value="vi-VN">Việt Nam (1.234,56)</option><option value="en-US">Quốc tế (1,234.56)</option></select></label><label className="setting-field">Múi giờ<select className="ri-control" value={form.timezone} onChange={e=>update('timezone',e.target.value,true)}><option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option></select></label></div>
   </Card>
   {canSell&&<Card><div className="feature-heading"><Printer size={20}/><div><h2>Cài đặt Bán hàng &amp; Hóa đơn</h2><p>Tùy chỉnh thao tác sau thanh toán và nội dung hóa đơn.</p></div></div>
    <SettingToggle title="Tự động mở hộp thoại in hóa đơn" description="In tự động sau khi thanh toán hoàn tất." checked={form.autoPrint} onChange={v=>update('autoPrint',v,true)}/>
    <label className="setting-field">Lời chào chân trang hóa đơn<textarea className="ri-control" rows="2" maxLength="180" value={form.receiptFooter||''} onChange={e=>update('receiptFooter',e.target.value)} onBlur={flush}/></label>
   </Card>}
   {canOperate&&<Card><div className="feature-heading"><SettingsIcon size={20}/><div><h2>Cài đặt Kho &amp; Cảnh báo tự động</h2><p>Thiết lập ngưỡng tồn kho và lịch nhận Digest.</p></div></div>
    <label className="setting-field">Ngưỡng cảnh báo tồn kho thấp mặc định<input className="ri-control" type="number" min="0" max="100000" value={form.lowStockThreshold} onChange={e=>update('lowStockThreshold',e.target.value)} onBlur={flush}/></label>
    <SettingToggle title="Báo cáo tổng kết cuối ngày" description="Daily Digest" checked={form.dailyDigest} onChange={v=>update('dailyDigest',v,true)}/>
    <SettingToggle title="Báo cáo tổng kết cuối tháng" description="Monthly Digest" checked={form.monthlyDigest} onChange={v=>update('monthlyDigest',v,true)}/>
   </Card>}
   <Card className="settings-ai-card"><div className="feature-heading"><Sparkles size={20}/><div><h2>Cài đặt Trợ lý AI &amp; Dự báo</h2><p>Tùy chỉnh kỳ theo dõi, độ nhạy tồn kho và trợ lý nổi.</p></div></div>
    <label className="setting-field">Kỳ hạn dự báo mặc định<select className="ri-control" value={form.forecastHorizonDays} onChange={e=>updateAi('forecastHorizonDays',Number(e.target.value))}><option value={7}>7 ngày tới</option><option value={14}>14 ngày tới</option><option value={30}>30 ngày tới</option></select></label>
    <label className="setting-field">Hệ số an toàn tồn kho (Safety Factor)<input className="ri-control" type="number" min="1" max="3" step="0.1" value={form.safetyFactor} onChange={e=>{const value=Number(e.target.value);if(value>=1&&value<=3)updateAi('safetyFactor',value);}}/><small>Điều chỉnh độ nhạy cảnh báo từ 1,0 đến 3,0.</small></label>
    <SettingToggle title="Tự động gửi thông báo khi sắp hết hàng" description="Hiển thị cảnh báo tồn kho thấp trong chuông thông báo." checked={form.autoLowStockNotifications} onChange={v=>updateAi('autoLowStockNotifications',v)}/>
    <SettingToggle title="Hiển thị trợ lý AI nổi ở góc màn hình" description="Bật hoặc ẩn nhanh Robot trợ lý AI nổi." checked={form.showFloatingAiAssistant} onChange={v=>updateAi('showFloatingAiAssistant',v)}/>
   </Card>
  </div>}
 </>;
}
function SettingToggle({title,description,checked,onChange,action}){return <div className="setting-row"><div><strong>{title}</strong><p>{description}</p></div><div style={{display:'flex',alignItems:'center',gap:10}}>{action}<label className="switch"><input type="checkbox" checked={Boolean(checked)} onChange={e=>onChange(e.target.checked)}/><span/></label></div></div>;}
function SoundTonePicker({value,onChange}){return <div role="radiogroup" aria-label="Kiểu nhạc chuông thông báo" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:8,margin:'8px 0 18px'}}>{NOTIFICATION_SOUND_TONES.map(tone=>{const selected=value===tone.id;return <button key={tone.id} type="button" role="radio" aria-checked={selected} onClick={()=>onChange(tone.id)} style={{display:'flex',alignItems:'center',gap:9,minHeight:58,padding:'9px 11px',border:`1px solid ${selected?'var(--ri-primary)':'var(--ri-border)'}`,borderRadius:10,background:selected?'color-mix(in srgb,var(--ri-primary) 10%,var(--ri-surface))':'var(--ri-surface)',color:'var(--ri-text)',textAlign:'left',cursor:'pointer',boxShadow:selected?'0 0 0 2px color-mix(in srgb,var(--ri-primary) 14%,transparent)':'none'}}><Music size={17} color={selected?'var(--ri-primary)':'var(--ri-muted)'}/><span style={{display:'grid',flex:1,gap:2}}><strong style={{fontSize:12}}>{tone.label}</strong><small style={{fontSize:10,color:'var(--ri-muted)'}}>{tone.description}</small></span>{selected&&<Check size={16} color="var(--ri-primary)"/>}</button>;})}</div>;}
