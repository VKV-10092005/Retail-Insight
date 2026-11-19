import React,{useState,useEffect,useRef} from 'react';
import {useAuth} from '../auth/AuthContext';
import {ROLE_LABELS} from '../config/roles';
import {Card,PageHeader} from '../components/ui/Elements';
import {User,Mail,Phone,Shield,Calendar,CheckCircle2,AlertCircle,Camera,Trash2} from 'lucide-react';
import UserAvatar from '../components/common/UserAvatar';
import {apiUrl} from '../services/apiUrl';
import './ProfilePage.css';

async function apiRequest(url, opts={}){
  const r = await fetch(apiUrl(url),{
    credentials:'include',
    headers:{'X-Requested-With':'retail-web','Content-Type':'application/json'},
    ...opts
  });
  const d = await r.json().catch(()=>({}));
  if(!r.ok){const error=new Error(d.message||d.error||r.statusText||`HTTP ${r.status}`);error.status=r.status;error.data=d;throw error;}
  return d;
}

export default function ProfilePage(){
  const {user,updateUser}=useAuth();
  const avatarInput=useRef(null);
  const [avatarSaving,setAvatarSaving]=useState(false);
  const savedProfileRef=useRef(null),saveInFlightRef=useRef(false),pendingProfileRef=useRef(null),saveTimerRef=useRef(null);
  
  const [fullName,setFullName]=useState(user?.full_name || user?.name || '');
  const [phone,setPhone]=useState(user?.phone || '');
  const [bio,setBio]=useState(user?.bio || '');
  const [organizationName,setOrganizationName]=useState(user?.storeName || '');
  const [organizationAddress,setOrganizationAddress]=useState(user?.organizationAddress || '');
  const [saveState,setSaveState]=useState('idle');
  const [successMsg,setSuccessMsg]=useState(null);
  const [errMsg,setErrMsg]=useState(null);

  useEffect(()=>{
    if(user){
      setFullName(user.full_name || user.name || '');
      setPhone(user.phone || '');
      setBio(user.bio || '');
      setOrganizationName(user.storeName || '');
      setOrganizationAddress(user.organizationAddress || '');
      savedProfileRef.current={full_name:user.full_name||user.name||'',phone:user.phone||'',bio:user.bio||'',organization_name:user.storeName||'',organization_address:user.organizationAddress||''};
    }
  },[user?.id]);

  const roleLabel = ROLE_LABELS[user?.role] || user?.role || 'Người dùng';
  const orgName = user?.storeName || (user?.role === 'PLATFORM_ADMIN' ? 'Hệ thống Quản trị Nền tảng' : 'Cửa hàng chính');
  const profileSnapshot=()=>({full_name:fullName.trim(),phone:phone.trim(),bio:bio.trim(),organization_name:organizationName.trim(),organization_address:organizationAddress.trim()});
  async function persistProfile(snapshot=profileSnapshot()){
    clearTimeout(saveTimerRef.current);
    if(!snapshot.full_name||snapshot.full_name.length<2){setErrMsg('Họ và tên phải có tối thiểu 2 ký tự');setSaveState('error');return;}
    const previous=savedProfileRef.current;
    if(!previous||Object.keys(snapshot).every(key=>snapshot[key]===previous[key]))return;
    if(saveInFlightRef.current){pendingProfileRef.current=snapshot;return;}
    saveInFlightRef.current=true;setSaveState('saving');setErrMsg(null);
    try{
      const res=await apiRequest('/auth/profile',{method:'PUT',body:JSON.stringify({full_name:snapshot.full_name,phone:snapshot.phone||null,bio:snapshot.bio||null,...(user?.role==='OWNER'?{organization_name:snapshot.organization_name,organization_address:snapshot.organization_address||null}:{})})});
      const savedUser=res.user||{full_name:snapshot.full_name,name:snapshot.full_name,phone:snapshot.phone||null,bio:snapshot.bio||null,...(user?.role==='OWNER'?{storeName:snapshot.organization_name,organizationAddress:snapshot.organization_address||null}:{})};
      savedProfileRef.current=snapshot;updateUser(savedUser);setSaveState('saved');
    }catch(err){setErrMsg(err.message);setSaveState('error');}
    finally{
      saveInFlightRef.current=false;
      const pending=pendingProfileRef.current;pendingProfileRef.current=null;
      if(pending&&Object.keys(pending).some(key=>pending[key]!==savedProfileRef.current?.[key]))void persistProfile(pending);
    }
  }
  useEffect(()=>{
    if(!savedProfileRef.current)return;
    const snapshot=profileSnapshot();
    if(Object.keys(snapshot).every(key=>snapshot[key]===savedProfileRef.current[key]))return;
    setSaveState('idle');saveTimerRef.current=setTimeout(()=>void persistProfile(snapshot),800);
    return()=>clearTimeout(saveTimerRef.current);
  },[fullName,phone,bio,organizationName,organizationAddress]);
  useEffect(()=>()=>clearTimeout(saveTimerRef.current),[]);

  async function changeAvatar(file){
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setErrMsg('Chỉ hỗ trợ ảnh PNG, JPEG hoặc WEBP.');return;}
    setErrMsg(null);setAvatarSaving(true);
    try{
      const dataUrl=await new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const side=Math.min(image.width,image.height),x=(image.width-side)/2,y=(image.height-side)/2;canvas.getContext('2d').drawImage(image,x,y,side,side,0,0,256,256);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',0.85));};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Không đọc được ảnh đã chọn.'));};image.src=url;});
      const response=await apiRequest('/auth/avatar',{method:'PUT',body:JSON.stringify({avatar_url:dataUrl})});
      updateUser({avatar_url:response.avatar_url});setSuccessMsg('Đã cập nhật ảnh đại diện.');
    }catch(error){setErrMsg(error.message||'Không thể cập nhật ảnh đại diện.');}
    finally{setAvatarSaving(false);if(avatarInput.current)avatarInput.current.value='';}
  }
  async function removeAvatar(){setAvatarSaving(true);setErrMsg(null);try{await apiRequest('/auth/avatar',{method:'PUT',body:JSON.stringify({avatar_url:null})});updateUser({avatar_url:null});setSuccessMsg('Đã xóa ảnh đại diện.');}catch(error){setErrMsg(error.message||'Không thể xóa ảnh đại diện.');}finally{setAvatarSaving(false);}}

  return (
    <>
      <PageHeader
        eyebrow="TÀI KHOẢN CỦA BẠN"
        title="Hồ sơ cá nhân"
        description="Quản lý thông tin tài khoản, vai trò phân quyền và thông tin liên hệ trong hệ thống Retail Insight."
      />

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))',gap:'24px',maxWidth:'1000px'}}>
        {/* Cột trái: Form cập nhật thông tin */}
        <Card>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'20px'}}>
            <div style={{background:'var(--ri-primary-bg)',padding:'10px',borderRadius:'10px',color:'var(--ri-primary)'}}>
              <User size={24}/>
            </div>
            <div>
              <h2 style={{margin:0,fontSize:'1.125rem',color:'var(--ri-text)'}}>Thông tin chỉnh sửa</h2>
              <small style={{color:'var(--ri-text-muted)'}}>Cập nhật họ tên và số điện thoại liên hệ</small>
            </div>
            <span className={`profile-autosave-status ${saveState}`} aria-live="polite">{saveState==='saving'?'Đang lưu...':saveState==='saved'?'✓ Đã tự động lưu':saveState==='error'?'Chưa lưu được':''}</span>
          </div>

          <div className="profile-avatar-row">
            <div className="profile-avatar-wrap"><UserAvatar className="profile-avatar" avatarUrl={user?.avatar_url} name={user?.full_name||user?.name} size={88}/>
              <button type="button" className="profile-avatar-camera" title="Tải ảnh đại diện" aria-label="Tải ảnh đại diện" disabled={avatarSaving} onClick={()=>avatarInput.current?.click()}><Camera size={16}/></button>
              <input ref={avatarInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>changeAvatar(event.target.files?.[0])}/>
            </div>
            <div><strong>Ảnh đại diện</strong><small>Ảnh PNG, JPEG hoặc WEBP · tối đa 256 × 256 px</small>{user?.avatar_url&&<button type="button" className="profile-avatar-remove" onClick={removeAvatar} disabled={avatarSaving}><Trash2 size={13}/> Xóa ảnh</button>}</div>
          </div>

          {successMsg && (
            <div style={{display:'flex',gap:'10px',alignItems:'center',padding:'12px 16px',background:'var(--ri-success-bg,color-mix(in srgb,var(--ri-success) 12%,transparent))',border:'1px solid var(--ri-success)',borderRadius:'var(--ri-radius)',color:'var(--ri-success)',marginBottom:'16px',fontSize:'0.875rem'}}>
              <CheckCircle2 size={18}/>
              <span>{successMsg}</span>
            </div>
          )}

          {errMsg && (
            <div style={{display:'flex',gap:'10px',alignItems:'center',padding:'12px 16px',background:'var(--ri-danger-bg,color-mix(in srgb,var(--ri-danger) 12%,transparent))',border:'1px solid var(--ri-danger)',borderRadius:'var(--ri-radius)',color:'var(--ri-danger)',marginBottom:'16px',fontSize:'0.875rem'}}>
              <AlertCircle size={18}/>
              <span>{errMsg}</span>
            </div>
          )}

          <form onSubmit={event=>event.preventDefault()} style={{display:'grid',gap:'16px'}}>
            <label className="ri-field">
              <span>Họ và tên *</span>
              <div style={{position:'relative'}}>
                <input
                  type="text"
                  required
                  className="ri-control"
                  style={{width:'100%',boxSizing:'border-box',paddingLeft:'36px'}}
                  value={fullName}
                  onChange={e=>setFullName(e.target.value)}
                  onBlur={()=>void persistProfile()}
                  placeholder="Nhập họ và tên đầy đủ..."
                  minLength={2}
                  maxLength={120}
                />
                <User size={16} style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',color:'var(--ri-text-muted)'}}/>
              </div>
            </label>

            {user?.role === 'OWNER' && <>
              <label className="ri-field"><span>Tên cửa hàng / tổ chức *</span><input className="ri-control" required minLength={2} maxLength={160} value={organizationName} onChange={e=>setOrganizationName(e.target.value)} onBlur={()=>void persistProfile()}/></label>
              <label className="ri-field"><span>Địa chỉ cửa hàng</span><textarea className="ri-control" maxLength={500} value={organizationAddress} onChange={e=>setOrganizationAddress(e.target.value)} onBlur={()=>void persistProfile()}/></label>
            </>}

            <label className="ri-field">
              <span>Số điện thoại liên hệ</span>
              <div style={{position:'relative'}}>
                <input
                  type="tel"
                  className="ri-control"
                  style={{width:'100%',boxSizing:'border-box',paddingLeft:'36px'}}
                  value={phone}
                  onChange={e=>setPhone(e.target.value)}
                  onBlur={()=>void persistProfile()}
                  placeholder="Ví dụ: 0912345678"
                  maxLength={50}
                />
                <Phone size={16} style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',color:'var(--ri-text-muted)'}}/>
              </div>
            </label>

            <label className="ri-field">
              <span>Thông tin tiểu sử</span>
              <textarea rows={3} maxLength={300} className="ri-control" value={bio} onChange={event=>setBio(event.target.value)} onBlur={()=>void persistProfile()} placeholder="Giới thiệu ngắn về vai trò, lĩnh vực phụ trách hoặc thông tin liên hệ thêm của bạn..."/>
              <small style={{color:'var(--ri-text-muted)',fontSize:'0.75rem',textAlign:'right'}}>{bio.length}/300</small>
            </label>

            <label className="ri-field">
              <span>Email đăng nhập (Chỉ đọc)</span>
              <div style={{position:'relative'}}>
                <input
                  type="email"
                  disabled
                  className="ri-control"
                  style={{width:'100%',boxSizing:'border-box',paddingLeft:'36px',background:'var(--ri-elevated)',opacity:0.85,cursor:'not-allowed'}}
                  value={user?.email || ''}
                />
                <Mail size={16} style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',color:'var(--ri-text-muted)'}}/>
              </div>
              <small style={{color:'var(--ri-text-muted)',fontSize:'0.75rem',marginTop:'4px'}}>
                Email dùng để định danh và nhận mã OTP xác thực bảo mật 2 bước.
              </small>
            </label>

          </form>
        </Card>

        {/* Cột phải: Thông tin phân quyền & Hệ thống */}
        <div style={{display:'flex',flexDirection:'column',gap:'24px'}}>
          <Card>
            <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'18px'}}>
              <div style={{background:'var(--ri-success-bg)',padding:'10px',borderRadius:'10px',color:'var(--ri-success)'}}>
                <Shield size={24}/>
              </div>
              <div>
                <h2 style={{margin:0,fontSize:'1.125rem',color:'var(--ri-text)'}}>Vai trò & Tổ chức</h2>
                <small style={{color:'var(--ri-text-muted)'}}>Phạm vi phân quyền và cửa hàng làm việc</small>
              </div>
            </div>

            <div style={{display:'grid',gap:'14px',fontSize:'0.875rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:'12px',borderBottom:'1px solid var(--ri-border)'}}>
                <span style={{color:'var(--ri-text-muted)'}}>Vai trò tài khoản:</span>
                <span style={{fontWeight:600,color:'var(--ri-primary)',background:'var(--ri-primary-bg)',padding:'4px 10px',borderRadius:'6px'}}>
                  {roleLabel} ({user?.role})
                </span>
              </div>

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:'12px',borderBottom:'1px solid var(--ri-border)'}}>
                <span style={{color:'var(--ri-text-muted)'}}>Tổ chức / Cửa hàng:</span>
                <strong style={{color:'var(--ri-text)'}}>{orgName}</strong>
              </div>

            </div>
          </Card>

          <Card>
            <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'12px'}}>
              <div style={{background:'var(--ri-warning-bg)',padding:'10px',borderRadius:'10px',color:'var(--ri-warning)'}}>
                <Calendar size={20}/>
              </div>
              <div>
                <h3 style={{margin:0,fontSize:'1rem',color:'var(--ri-text)'}}>Bảo mật tài khoản</h3>
                <small style={{color:'var(--ri-text-muted)'}}>Cơ chế xác thực 2 bước qua Gmail</small>
              </div>
            </div>
            <p style={{margin:0,fontSize:'0.8125rem',color:'var(--ri-text-muted)',lineHeight:1.6}}>
              Khi thực hiện đổi mật khẩu hoặc cập nhật nhạy cảm, hệ thống sẽ gửi mã OTP 6 số đến Gmail <strong style={{color:'var(--ri-text)'}}>{user?.email}</strong> để xác minh quyền sở hữu.
            </p>
          </Card>
        </div>
      </div>

    </>
  );
}
