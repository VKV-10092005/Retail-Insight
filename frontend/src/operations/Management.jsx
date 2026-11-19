import React,{useEffect,useState} from 'react';
import {LogIn,Users,UserPlus,Building2,Eye,EyeOff,CreditCard} from 'lucide-react';
import {Card,PageHeader} from '../components/ui/Elements';
import {useResource,request,State,Table,Message} from './shared';
import {useAuth} from '../auth/AuthContext';
import {ROLE_LABELS,ROLES} from '../config/roles';
import PaymentSettingsModal from '../components/PaymentSettingsModal';

export default function Management({staff=false, mode}){
  const isStaffMode = staff || mode === 'staff';
  const {refresh,impersonateStaff,user}=useAuth();
  const [storeName,setStoreName]=useState(user?.storeName||'');
  const [storeSaving,setStoreSaving]=useState(false);
  const branches=useResource('/branches');
  const users=useResource(isStaffMode ? '/staff' : null);

  const [form,setForm]=useState({
    name:'',
    address:'',
    phone:'',
    catalog_mode:'SHARED',
    email:'',
    password:'',
    role:'CASHIER',
    branch_ids:[],
    status:'ACTIVE'
  });
  const [editing,setEditing]=useState(null);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [busy,setBusy]=useState(false);
  const [switchingId,setSwitchingId]=useState(null);
  const [detailBranchId,setDetailBranchId]=useState(null);
  const [selectedBranchId,setSelectedBranchId]=useState(null);
  const [showPassword,setShowPassword]=useState(false);
  const [paymentBranchId,setPaymentBranchId]=useState(null);

  const staffItems=users.data?.items??[];
  const owner=staffItems.find(item=>item.role==='OWNER');
  const branchRows=(branches.data?.branches??[]).map(branch=>{
    const assigned=staffItems.filter(item=>item.role!=='OWNER'&&item.branch_ids?.some(id=>String(id)===String(branch.id)));
    return {...branch,staff:assigned,manager:assigned.find(item=>item.role==='MANAGER')};
  });
  const detailBranch=branchRows.find(branch=>String(branch.id)===String(detailBranchId));

  useEffect(()=>{
    if(isStaffMode&&(selectedBranchId||editing))document.getElementById('staff-account-form')?.scrollIntoView({behavior:'smooth',block:'start'});
  },[isStaffMode,selectedBranchId,editing]);

  function startCreateForBranch(branch){
    setEditing(null);setSelectedBranchId(branch.id);setDetailBranchId(null);setError('');setSuccess('');
    setShowPassword(false);
    setForm({name:'',address:'',phone:'',email:'',password:'',role:'CASHIER',branch_ids:[branch.id],status:'ACTIVE'});
  }

  async function switchToStaff(row){
    setError('');setSwitchingId(row.id);
    try{
      const next=await impersonateStaff(row.id);
      const targetPath={CASHIER:'/sales',INVENTORY:'/inventory',MANAGER:'/'}[next.role];
      if(!targetPath)throw new Error('Vai trò nhân viên không có trang làm việc mặc định.');
      window.location.assign(targetPath);
    }
    catch(err){setError(err.message||'Không thể đăng nhập nhanh vào tài khoản nhân viên.');}
    finally{setSwitchingId(null);}
  }

  const change=(k,v)=>setForm({...form,[k]:v});
  const storeNameDirty=storeName!==(user?.storeName||'');
  async function saveStoreName(){setError('');setSuccess('');setStoreSaving(true);try{await request('/auth/profile',{method:'PATCH',body:{full_name:user?.full_name||user?.name,phone:user?.phone||null,organization_name:storeName.trim()}});await refresh();setSuccess('Đã lưu tên cửa hàng.');}catch(err){setError(err.message||'không thể lưu tên cửa hàng.');}finally{setStoreSaving(false);}}

  async function submit(e){
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try{
      let body,path,method;
      if(isStaffMode){
        body=editing
          ? {status:form.status, role:form.role, branch_ids:form.branch_ids,...(form.password?{password:form.password}:{})}
          : {name:form.name, email:form.email, password:form.password, role:form.role, branch_ids:form.branch_ids};
        path='/staff' + (editing ? '/' + editing : '');
        method=editing ? 'PATCH' : 'POST';
      } else {
        body={name:form.name, address:form.address, phone:form.phone,catalog_mode:form.catalog_mode||'SHARED'};
        path='/branches' + (editing ? '/' + editing : '');
        method=editing ? 'PUT' : 'POST';
      }

      await request(path,{method,body});
      setSuccess('Đã lưu thay đổi vào cơ sở dữ liệu.');
      setEditing(null);
      setSelectedBranchId(null);
      setForm({
        ...form,
        name:'',
        email:'',
        password:'',
        address:'',
        phone:'',
        catalog_mode:'SHARED',
        branch_ids:[]
      });
      branches.reload();
      if(users) users.reload();
      await refresh();
    }catch(err){
      setError(err.message || 'Lỗi lưu thông tin');
    }finally{
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="QUẢN TRỊ HỆ THỐNG"
        title={isStaffMode ? 'Nhân sự & Phân quyền' : 'Chi nhánh cửa hàng'}
        description={
          isStaffMode
            ? 'Chủ cửa hàng cấp tài khoản, vai trò và chỉ định chi nhánh làm việc. Toàn bộ quyền được xác thực ở Backend.'
            : 'Quản lý danh sách chi nhánh trực thuộc cửa hàng hoặc chuỗi kinh doanh của bạn.'
        }
      />

      <Message error={error} success={success}/>

      {!isStaffMode&&<Card style={{marginBottom:16}}><h2 style={{margin:'0 0 6px'}}>{'Tên cửa hàng / Tổ chức'}</h2><p className="muted" style={{margin:'0 0 12px'}}>{'Tên này được dùng làm thương hiệu chung cho các chi nhánh.'}</p><div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}><label style={{flex:'1 1 280px'}}>{'Tên cửa hàng'}<input className="ri-control" value={storeName} maxLength={160} onChange={e=>setStoreName(e.target.value)}/></label>{storeNameDirty&&<button type="button" className="btn btn-primary" onClick={saveStoreName} disabled={storeSaving||storeName.trim().length<2}>{storeSaving?'Saving...':'Lưu thay đổi'}</button>}</div></Card>}
      {isStaffMode ? <>
      <Card style={{marginBottom:16,display:'flex',alignItems:'center',gap:14}}>
        <span style={{width:44,height:44,borderRadius:12,display:'grid',placeItems:'center',background:'var(--ri-primary-soft,rgba(37,99,235,.1))',color:'var(--ri-primary)'}}><Building2 size={22}/></span>
        <div><div style={{fontSize:12,color:'var(--ri-muted)',fontWeight:700}}>CHỦ CỬA HÀNG · QUẢN LÝ TOÀN CHUỖI</div><strong>{owner?.name||'Tài khoản chủ cửa hàng'}</strong><div style={{fontSize:13,color:'var(--ri-muted)'}}>{owner?.email||'—'}</div></div>
      </Card>
      <div style={{display:'flex',alignItems:'end',justifyContent:'space-between',gap:12,margin:'20px 0 12px',flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 4px'}}>Chi nhánh & nhân sự</h2><p style={{margin:0,color:'var(--ri-muted)'}}>Chọn chi nhánh để xem danh sách, phân quyền hoặc điều chuyển nhân sự.</p></div><span style={{fontSize:13,color:'var(--ri-muted)'}}>{branchRows.length} chi nhánh</span></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:14,marginBottom:24}}>
        {branchRows.map(branch=>{
          const managers=branch.staff.filter(item=>item.role==='MANAGER').length;
          const cashiers=branch.staff.filter(item=>item.role==='CASHIER').length;
          const inventory=branch.staff.filter(item=>item.role==='INVENTORY').length;
          return <Card key={branch.id} style={{display:'grid',gap:12}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:10}}><div><h3 style={{margin:'0 0 5px'}}>{branch.name}</h3><div style={{fontSize:13,color:'var(--ri-muted)'}}>{branch.address||'Chưa khai báo địa chỉ'} · #{branch.id}</div></div><Building2 size={20} color="var(--ri-primary)"/></div>
            <div style={{padding:'10px 12px',borderRadius:9,background:'var(--ri-surface-subtle,rgba(127,127,127,.08))'}}><div style={{fontSize:12,color:'var(--ri-muted)'}}>QUẢN LÝ PHỤ TRÁCH</div><strong>{branch.manager?.name||'Chủ cửa hàng trực tiếp quản lý'}</strong>{branch.manager&&<div style={{fontSize:12,color:'var(--ri-muted)'}}>{branch.manager.email}</div>}</div>
            <div style={{display:'flex',gap:7,flexWrap:'wrap',fontSize:12}}><span>{managers} Quản lý</span><span>·</span><span>{cashiers} Thu ngân</span><span>·</span><span>{inventory} Nhân viên kho</span></div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn btn-secondary btn-sm" onClick={()=>setDetailBranchId(branch.id)}><Users size={15}/>Chi tiết nhân sự</button><button className="btn btn-primary btn-sm" onClick={()=>startCreateForBranch(branch)}><UserPlus size={15}/>Thêm nhân viên vào chi nhánh</button></div>
          </Card>;
        })}
        {!branchRows.length&&<Card>Chưa có chi nhánh nào.</Card>}
      </div>
      {detailBranch&&<div className="modal-overlay" role="presentation" onClick={()=>setDetailBranchId(null)}><section className="modal" role="dialog" aria-modal="true" aria-label={`Nhân sự ${detailBranch.name}`} onClick={event=>event.stopPropagation()} style={{width:'min(1080px,96vw)',maxHeight:'90vh',overflow:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:12,marginBottom:16}}><div><div style={{fontSize:12,color:'var(--ri-muted)'}}>CHI TIẾT NHÂN SỰ CHI NHÁNH</div><h2 style={{margin:'4px 0'}}>{detailBranch.name}</h2><div style={{color:'var(--ri-muted)',fontSize:13}}>{detailBranch.address||'Chưa khai báo địa chỉ'} · #{detailBranch.id}</div></div><button className="btn btn-secondary btn-sm" onClick={()=>setDetailBranchId(null)}>Đóng</button></div>
        <Table rows={detailBranch.staff} empty="Chi nhánh chưa có nhân viên." columns={[["name","Họ tên"],["email","Email đăng nhập"],["role","Vai trò",row=><strong>{ROLE_LABELS[row.role]||row.role}</strong>],["status","Trạng thái",row=><span style={{color:row.status==='ACTIVE'?'var(--ri-success)':'var(--ri-danger)',fontWeight:600}}>{row.status==='ACTIVE'?'Hoạt động':'Đã khóa'}</span>],["actions","Thao tác",row=><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><button className="btn btn-secondary btn-sm" onClick={()=>{setEditing(row.id);setSelectedBranchId(detailBranch.id);setForm({...form,...row,password:'',branch_ids:row.branch_ids||[detailBranch.id]});setShowPassword(false);setDetailBranchId(null);}}>Phân quyền / Điều chuyển</button>{row.status==='ACTIVE'&&['MANAGER','CASHIER','INVENTORY'].includes(row.role)&&<button type="button" className="btn btn-primary btn-sm" disabled={switchingId!==null} onClick={()=>switchToStaff(row)}><LogIn size={14}/>{switchingId===row.id?'Đang chuyển…':'Đăng nhập nhanh'}</button>}</div>]]}/>
        <div style={{marginTop:14}}><button className="btn btn-primary" onClick={()=>startCreateForBranch(detailBranch)}><UserPlus size={16}/>Cấp tài khoản nhân viên trong chi nhánh</button></div>
      </section></div>}
      </> : null}

      {!isStaffMode&&<Card style={{marginBottom:'24px'}}>
        <State resource={isStaffMode ? users : branches}>
          {data=>(
            <Table
              rows={isStaffMode ? (data?.items ?? []) : (data?.branches ?? [])}
              empty={isStaffMode ? 'Chưa có nhân viên nào.' : 'Chưa có chi nhánh nào.'}
              columns={
                isStaffMode
                  ? [
                      ["name","Họ và tên"],
                      ["email","Email đăng nhập"],
                      ["role","Vai trò",r=><strong>{ROLE_LABELS[r.role] || r.role}</strong>],
                      [
                        "branch_ids",
                        "Chi nhánh phân công",
                        r=>(
                          r.branch_ids?.length
                            ? r.branch_ids.map(id=>branches.data?.branches?.find(b=>b.id===id)?.name || `Chi nhánh #${id}`).join(', ')
                            : 'Chưa gán chi nhánh'
                        )
                      ],
                      [
                        "status",
                        "Trạng thái",
                        r=><span style={{color:r.status==='ACTIVE'?'var(--ri-success)':'var(--ri-danger)',fontWeight:600}}>{r.status==='ACTIVE'?'Hoạt động':'Đã khóa'}</span>
                      ],
                      [
                        "edit",
                        "Thao tác",
                        r=>(
                          r.role !== 'OWNER' && (
                            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><button
                              className="btn btn-secondary btn-sm"
                              onClick={()=>{
                                setEditing(r.id);
                                setForm({...form,...r,password:''});
                              }}
                            >
                              Phân quyền / Khóa
                            </button>{isStaffMode&&r.status==='ACTIVE'&&['MANAGER','CASHIER','INVENTORY'].includes(r.role)&&<button type="button" className="btn btn-primary btn-sm" disabled={switchingId!==null} onClick={()=>switchToStaff(r)}><LogIn size={14}/>{switchingId===r.id?'Đang chuyển…':'Đăng nhập nhanh'}</button>}</div>
                          )
                        )
                      ]
                    ]
                  : [
                      ["name","Tên chi nhánh",r=><h3 style={{margin:0}}>{r.name}</h3>],
                      ["id","Mã chi nhánh",r=>`#${r.id}`],
                      ["address","Địa chỉ",r=>r.address||'—'],
                      ["phone","Số điện thoại",r=>r.phone||'—'],
                      ["status","Trạng thái",r=><span style={{color:r.status==='ACTIVE'?'var(--ri-success)':'var(--ri-danger)',fontWeight:600}}>{r.status==='ACTIVE'?'Hoạt động':'Đã khóa'}</span>],
                      [
                        "edit",
                        "Thao tác",
                        r=>(<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={()=>{
                              setEditing(r.id);
                              setForm({...form,...r,address:r.address||'',phone:r.phone||''});
                            }}
                          >
                            Sửa
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={()=>setPaymentBranchId(String(r.id))}><CreditCard size={14}/> Cài đặt thanh toán</button>
                          </div>)
                      ]
                    ]
              }
            />
          )}
        </State>
      </Card>}

      {(!isStaffMode||editing||selectedBranchId)&&<Card id="staff-account-form">
        <h2>{editing ? 'Cập nhật thông tin' : (isStaffMode ? 'Thêm mới nhân viên' : 'Thêm mới chi nhánh')}</h2>
        
        <form className="op-form" onSubmit={submit}>
          {(!isStaffMode || !editing) && (
            <label>
              {isStaffMode ? 'Họ và tên nhân viên *' : 'Tên chi nhánh *'}
              <input
                required
                maxLength={120}
                className="ri-control"
                placeholder={isStaffMode ? "Ví dụ: Lê Thị Hoa" : "Ví dụ: Chi nhánh Cầu Giấy"}
                value={form.name}
                onChange={e=>change('name',e.target.value)}
              />
            </label>
          )}

          {isStaffMode ? (
            <>
              {!editing && (
                <>
                  <label>
                    Email nhân viên *
                    <input
                      required
                      type="email"
                      maxLength={254}
                      className="ri-control"
                      placeholder="hoa.le@cuahang.vn"
                      value={form.email}
                      onChange={e=>change('email',e.target.value)}
                    />
                  </label>

                  <label>
                    Mật khẩu khởi tạo (tối thiểu 12 ký tự) *
                    <div style={{position:'relative'}}><input required type={showPassword?'text':'password'} minLength={12} maxLength={72} autoComplete="new-password" className="ri-control" style={{width:'100%',paddingRight:42}} placeholder="Mật khẩu ban đầu cấp cho nhân viên..." value={form.password} onChange={e=>change('password',e.target.value)}/><button type="button" aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'} onClick={()=>setShowPassword(value=>!value)} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',border:0,background:'transparent',color:'var(--ri-muted)',padding:4}}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
                  </label>
                </>
              )}

              {editing&&<label>
                Đặt lại mật khẩu (để trống nếu không đổi)
                <div style={{position:'relative'}}><input type={showPassword?'text':'password'} minLength={12} maxLength={72} autoComplete="new-password" className="ri-control" style={{width:'100%',paddingRight:42}} placeholder="Mật khẩu mới, tối thiểu 12 ký tự" value={form.password||''} onChange={e=>change('password',e.target.value)}/><button type="button" aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'} onClick={()=>setShowPassword(value=>!value)} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',border:0,background:'transparent',color:'var(--ri-muted)',padding:4}}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
              </label>}

              <label>
                Vai trò phân quyền *
                <select
                  className="ri-control"
                  value={form.role}
                  onChange={e=>{const role=e.target.value;setForm(current=>({...current,role,branch_ids:role==='MANAGER'&&current.branch_ids.length>1?[current.branch_ids[0]]:current.branch_ids}));}}
                >
                  <option value={ROLES.MANAGER}>{ROLE_LABELS[ROLES.MANAGER]}</option>
                  <option value={ROLES.INVENTORY}>{ROLE_LABELS[ROLES.INVENTORY]}</option>
                  <option value={ROLES.CASHIER}>{ROLE_LABELS[ROLES.CASHIER]}</option>
                </select>
              </label>

              <fieldset style={{border:'1px solid var(--ri-border)',borderRadius:'8px',padding:'12px',margin:'8px 0'}}>
                <legend style={{padding:'0 6px',fontWeight:600,fontSize:'0.875rem'}}>Chi nhánh được phân công làm việc * {form.role==='MANAGER'&&'(chọn đúng một chi nhánh)'}</legend>
                <div style={{display:'grid',gap:'8px',maxHeight:'160px',overflowY:'auto',padding:'4px'}}>
                  {branches.data?.branches?.map(b=>(
                    <label className="op-checkbox" key={b.id} style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer'}}>
                      <input
                        type={form.role==='MANAGER'?'radio':'checkbox'}
                        name="staff-assigned-branch"
                        checked={form.branch_ids.some(id=>String(id)===String(b.id))}
                        onChange={e=>{
                          change(
                            'branch_ids',
                            e.target.checked
                              ? form.role==='MANAGER'?[b.id]:[...form.branch_ids, b.id]
                              : form.branch_ids.filter(id=>id!==b.id)
                          );
                        }}
                      />
                      <span>{b.name}</span>
                    </label>
                  ))}
                  {(!branches.data?.branches || branches.data.branches.length === 0) && (
                    <p style={{margin:0,color:'var(--ri-muted)'}}>Chưa có chi nhánh nào để phân công.</p>
                  )}
                </div>
              </fieldset>

              {editing && (
                <label>
                  Trạng thái tài khoản
                  <select
                    className="ri-control"
                    value={form.status}
                    onChange={e=>change('status',e.target.value)}
                  >
                    <option value="ACTIVE">Hoạt động</option>
                    <option value="DISABLED">Đã khóa tài khoản</option>
                  </select>
                </label>
              )}
            </>
          ) : (
            <>
              <label>
                Địa chỉ chi nhánh
                <input
                  maxLength={500}
                  className="ri-control"
                  placeholder="Địa chỉ số nhà, đường, quận/huyện..."
                  value={form.address}
                  onChange={e=>change('address',e.target.value)}
                />
              </label>

              <label>
                Số điện thoại liên hệ
                <input
                  maxLength={30}
                  className="ri-control"
                  placeholder="Số điện thoại bàn hoặc di động..."
                  value={form.phone}
                  onChange={e=>change('phone',e.target.value)}
                />
              </label>
              <label>
                Chế độ danh mục hàng hóa
                <select className="ri-control" value={form.catalog_mode||'SHARED'} onChange={e=>change('catalog_mode',e.target.value)}>
                  <option value="SHARED">Dùng chung danh mục với cửa hàng gốc</option>
                  <option value="INDEPENDENT">Danh mục & kho hàng độc lập</option>
                </select>
                <small style={{color:'var(--ri-muted)',fontWeight:400}}>{form.catalog_mode==='INDEPENDENT'?'Chi nhánh chỉ thấy sản phẩm riêng và sản phẩm đã nhập kho tại đây.':'Kế thừa sản phẩm dùng chung toàn chuỗi; tồn kho vẫn tách theo chi nhánh.'}</small>
              </label>
            </>
          )}

          <div className="op-actions" style={{marginTop:'16px'}}>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Đang lưu…' : (editing ? 'Cập nhật thay đổi' : 'Lưu thông tin')}
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={()=>{
                  setEditing(null);
                  setSelectedBranchId(null);
                  setForm({
                    ...form,
                    name:'',
                    email:'',
                    password:'',
                    address:'',
                    phone:'',
                    catalog_mode:'SHARED',
                    branch_ids:[]
                  });
                }}
              >
                Hủy sửa
              </button>
            )}
          </div>
        </form>
      </Card>}
      {!isStaffMode&&<PaymentSettingsModal open={Boolean(paymentBranchId)} branchId={paymentBranchId} onClose={()=>setPaymentBranchId(null)} onSaved={()=>branches.reload()}/>}
    </>
  );
}
