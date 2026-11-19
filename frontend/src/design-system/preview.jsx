import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Button,Input,Select,Search,Card,Table,Modal,Drawer,Tabs,Tooltip,Toast,Badge,Skeleton,EmptyState,ErrorState,ConfirmationDialog,ThemeProvider,ThemeSelect,useTheme} from './index.jsx';
import {Card as LegacyCard,Badge as LegacyBadge,Select as LegacySelect,SearchField} from '../components/ui/Elements.jsx';
import '../styles/global.css';
import './tokens.css';
import './components.css';
import './legacy.css';
import './preview.css';
function Lab(){
 const {resolved}=useTheme(),[modal,setModal]=useState(false),[drawer,setDrawer]=useState(false),[confirm,setConfirm]=useState(false);
 const [toast,setToast]=useState(false),[failure,setFailure]=useState(false),[confirmed,setConfirmed]=useState(0),[text,setText]=useState(''),[legacy,setLegacy]=useState('A');
 const inputRef=useRef(null);
 return <main className="ri-lab" id="main"><a className="ri-lab-skip" href="#components">Bỏ qua phần giới thiệu</a>
  <header className="ri-lab-header"><div><p className="ri-lab-eyebrow">RETAIL INSIGHT / CONCEPT C / UI1</p><h1>Nền tảng giao diện</h1>
   <p>Component Lab độc lập. Không có dữ liệu kinh doanh, không kết nối API, không tạo giao dịch.</p></div>
   <div><ThemeSelect/><p data-testid="resolved-theme">Theme: {resolved}</p></div></header>
  <section className="ri-lab-palette" aria-label="Màu semantic">{['bg','surface','elevated','primary','success','warning','danger'].map(token=><div key={token}><span style={{background:'var(--ri-'+token+')'}}/><code>{token}</code></div>)}</section>
  <div className="ri-lab-grid" id="components">
   <Card><h2>Button và trạng thái</h2><div className="ri-lab-actions"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button disabled>Disabled</Button><Button loading>Loading (mẫu UI)</Button></div>
    <div className="ri-lab-actions"><Tooltip content="Nhãn giải thích component, không phải hành động nghiệp vụ."><Button variant="secondary">Thông tin tooltip</Button></Tooltip><Button variant="secondary" onClick={()=>setToast(true)}>Mở thông báo</Button></div></Card>
   <Card><h2>Form và validation</h2><div className="ri-lab-form"><Input ref={inputRef} label="Nhãn văn bản" value={text} onChange={e=>setText(e.target.value)} description="Trường minh họa, không lưu tài khoản."/>
    <Input label="Trường có lỗi" defaultValue="Ví dụ" error="Thông báo validation mẫu UI1." required/>
    <Input label="Trường vô hiệu hóa" value="Chỉ đọc trạng thái UI" disabled readOnly/>
    <Select label="Lựa chọn minh họa" defaultValue="one"><option value="one">Lựa chọn một</option><option value="two">Lựa chọn hai</option></Select>
    <Search label="Tìm component" placeholder="Nhập tên component"/></div></Card>
   <Card><h2>Modal, Drawer, Confirmation</h2><div className="ri-lab-actions"><Button onClick={()=>setModal(true)}>Mở Modal</Button><Button variant="secondary" onClick={()=>setDrawer(true)}>Mở Drawer</Button><Button variant="secondary" onClick={()=>setConfirm(true)}>Mở xác nhận UI</Button></div>
    <label className="ri-lab-checkbox"><input type="checkbox" checked={failure} onChange={e=>setFailure(e.target.checked)}/>Kiểm tra lỗi callback UI</label>
    <p data-testid="callback-count">{confirmed} callback UI hoàn tất; không gọi API.</p></Card>
   <Card><h2>Tabs và dữ liệu trình bày</h2><Tabs label="Ví dụ tabs" items={[
    {id:'first',label:'Thông tin',content:<Input label="Bản nháp trong tab" defaultValue="Nội dung được giữ khi đổi tab"/>},
    {id:'disabled',label:'Chưa bật',disabled:true,content:'Không mở'},
    {id:'second',label:'Trạng thái',content:<p>Tabs hỗ trợ phím mũi tên, Home và End.</p>} ]}/></Card>
   <Card><h2>Badge, Skeleton và Empty State</h2><div className="ri-lab-actions">{['neutral','info','success','warning','danger'].map(v=><Badge variant={v} key={v}>{v}</Badge>)}</div>
    <Skeleton label="Skeleton minh họa UI1"/><EmptyState title="Chưa có nội dung minh họa" description="Empty state có lời giải thích rõ ràng."/></Card>
   <Card><h2>Error State</h2><ErrorState title="Lỗi minh họa component" message="Không phải lỗi giao dịch hoặc lỗi dịch vụ thật." reference="UI1-PREVIEW" onRetry={()=>setToast(true)} retryLabel="Kiểm tra phản hồi UI"/></Card>
   <Card className="ri-lab-wide"><Table caption="Danh mục component UI1, không phải dữ liệu bán hàng" columns={[{key:'name',label:'Component'},{key:'purpose',label:'Mục đích'},{key:'state',label:'Trạng thái minh họa'}]}
    rows={[{id:'button',name:'Button',purpose:'Tương tác bàn phím',state:'Default / focus / disabled'},{id:'dialog',name:'Modal',purpose:'Focus trap và quay lại trigger',state:'Open / close'},{id:'table',name:'Table',purpose:'Header, caption, vùng cuộn',state:'Rows / empty'}]}/></Card>
   <LegacyCard className="ri-lab-wide"><h2>Tương thích component hiện có</h2><LegacyBadge variant="success">Legacy Badge</LegacyBadge><div className="ri-lab-actions">
    <LegacySelect ariaLabel="Legacy Select" value={legacy} onChange={setLegacy} options={['A','B']}/><SearchField value={text} onChange={setText} placeholder="Legacy search"/></div><p data-testid="legacy-value">Giá trị legacy: {legacy}</p>
    <div className="op-form"><label>Legacy input<input defaultValue="Chỉ kiểm tra CSS"/></label></div>
   </LegacyCard>
  </div>
  <Modal open={modal} onClose={()=>setModal(false)} title="Modal kiểm tra"><Input label="Nội dung trong Modal"/><Button variant="secondary" onClick={()=>setModal(false)}>Hoàn tất kiểm tra</Button></Modal>
  <Drawer open={drawer} onClose={()=>setDrawer(false)} title="Drawer kiểm tra"><p>Panel responsive độc lập với điều hướng ứng dụng.</p><Input label="Nội dung trong Drawer"/></Drawer>
  <ConfirmationDialog open={confirm} onClose={()=>setConfirm(false)} title="Xác nhận callback UI" description="Chỉ gọi callback thử nghiệm, không thay đổi dữ liệu." onConfirm={async()=>{await new Promise(r=>setTimeout(r,350));if(failure)throw Error('Lỗi callback thử nghiệm UI1.');setConfirmed(n=>n+1);}}/>
  {toast&&<div className="ri-toast-stack"><Toast title="Thông báo UI1" onDismiss={()=>setToast(false)}>Đây là phản hồi của component, không có API hoặc giao dịch.</Toast></div>}
  <footer className="ri-lab-footer">UI1 only · Không có chatbot, landing hoặc POS mới · Hỗ trợ reduced motion</footer>
 </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider><Lab/></ThemeProvider></React.StrictMode>);
