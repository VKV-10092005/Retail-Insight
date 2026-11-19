import React,{useEffect,useMemo,useState} from 'react';
import {Building2,Plus,Save,CreditCard,Edit2} from 'lucide-react';
import {request} from '../operations/shared';
import {Card,PageHeader} from '../components/ui/Elements';
import {Button,Modal} from '../design-system';
import PaymentSettingsModal from '../components/PaymentSettingsModal';

const blank={name:'',address:'',phone:'',catalog_mode:'SHARED'};
const clean=row=>({name:row?.name||'',address:row?.address||'',phone:row?.phone||'',catalog_mode:row?.catalog_mode||'SHARED'});
export default function Branches(){
 const [branches,setBranches]=useState([]),[error,setError]=useState(''),[modal,setModal]=useState(false),[paymentBranch,setPaymentBranch]=useState(''),[editing,setEditing]=useState(null),[form,setForm]=useState(blank),[initial,setInitial]=useState(blank),[busy,setBusy]=useState(false);
 async function reload(){try{const data=await request('/branches');setBranches(data.branches||[]);setError('');}catch(e){setError(e.message);}}
 useEffect(()=>{reload();},[]);
 const isDirty=useMemo(()=>JSON.stringify(form)!==JSON.stringify(initial),[form,initial]);
 function openEditor(row=null){const value=clean(row);setEditing(row?.id||null);setForm(value);setInitial(value);setModal(true);setError('');}
 async function save(e){e.preventDefault();if(!isDirty||busy)return;setBusy(true);setError('');try{await request(editing?`/branches/${editing}`:'/branches',{method:editing?'PUT':'POST',body:form});setModal(false);await reload();}catch(err){setError(err.message||'Không lưu được chi nhánh.');}finally{setBusy(false);}}
 return <><PageHeader title="Chi nhánh cửa hàng" description="Quản lý thông tin chi nhánh, danh mục hàng hóa và thanh toán VietQR."/>
  {error&&!modal&&<p role="alert" style={{color:'var(--ri-danger)'}}>{error}</p>}
  <Card><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:10,flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 4px'}}>Danh sách chi nhánh</h2><p className="muted" style={{margin:0}}>{branches.length} chi nhánh</p></div><Button variant="primary" onClick={()=>openEditor()}><Plus size={16}/> Thêm chi nhánh</Button></div>
   {!branches.length?<p className="muted">Chưa có chi nhánh.</p>:branches.map(branch=><div key={branch.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,borderBottom:'1px solid var(--ri-border)',padding:'14px 0',flexWrap:'wrap'}}>
    <div style={{display:'flex',alignItems:'center',gap:12}}><Building2 size={20}/><div><h3 style={{margin:'0 0 3px'}}>{branch.name}</h3><p className="muted" style={{margin:0}}>{branch.address||'Chưa có địa chỉ'}{branch.phone?` · ${branch.phone}`:''} · {branch.catalog_mode==='INDEPENDENT'?'Danh mục độc lập':'Danh mục dùng chung'}</p></div></div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button variant="secondary" onClick={()=>openEditor(branch)}><Edit2 size={15}/> Sửa</Button><Button variant="secondary" onClick={()=>setPaymentBranch(String(branch.id))}><CreditCard size={15}/> Cài đặt thanh toán</Button></div>
   </div>)}
  </Card>
  <Modal open={modal} onClose={()=>setModal(false)} title={editing?'Sửa chi nhánh':'Thêm chi nhánh'} footer={isDirty&&<Button type="submit" form="branch-form" loading={busy}><Save size={15}/> Lưu thông tin</Button>}>
   <form id="branch-form" onSubmit={save} style={{display:'grid',gap:14}}>
    <label>Tên chi nhánh *<input className="ri-control" required minLength="2" maxLength="160" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>Địa chỉ chi nhánh<input className="ri-control" maxLength="500" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
    <label>Số điện thoại liên hệ<input className="ri-control" type="tel" maxLength="30" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
    <label>Chế độ danh mục hàng hóa<select className="ri-control" value={form.catalog_mode} onChange={e=>setForm({...form,catalog_mode:e.target.value})}><option value="SHARED">Dùng chung giữa các chi nhánh</option><option value="INDEPENDENT">Danh mục độc lập</option></select></label>
    {error&&<p role="alert" style={{color:'var(--ri-danger)',margin:0}}>{error}</p>}
   </form>
  </Modal>
  <PaymentSettingsModal open={Boolean(paymentBranch)} branchId={paymentBranch} onClose={()=>setPaymentBranch('')}/>
 </>;
}
