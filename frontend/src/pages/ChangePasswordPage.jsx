import React,{useState,useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {Card,PageHeader} from '../components/ui/Elements';
import {Mail,KeyRound,ShieldCheck,Lock,Unlock,CheckCircle2,AlertCircle,Send,RefreshCw,ArrowRight,Eye,EyeOff} from 'lucide-react';
import PasswordChecklist, { isPasswordStrong } from '../components/auth/PasswordChecklist';
import OtpInput from '../components/auth/OtpInput';
import {apiUrl} from '../services/apiUrl';

async function apiRequest(url, opts={}){
  const r = await fetch(apiUrl(url),{
    credentials:'include',
    headers:{'X-Requested-With':'retail-web','Content-Type':'application/json'},
    ...opts
  });
  const d = await r.json();
  if(!r.ok) throw new Error(d.message || r.statusText);
  return d;
}

export default function ChangePasswordPage(){
  const {user}=useAuth();
  const navigate=useNavigate();

  // Bước 1 state: Gửi & Xác thực OTP
  const [sendingOtp,setSendingOtp]=useState(false);
  const [otpSent,setOtpSent]=useState(false);
  const [otpMsg,setOtpMsg]=useState(null);
  const [otpErr,setOtpErr]=useState(null);
  const [otpCode,setOtpCode]=useState('');
  const [verifyingOtp,setVerifyingOtp]=useState(false);
  const [otpToken,setOtpToken]=useState(null); // Khi xác thực thành công, lưu token
  const [otpVerified,setOtpVerified]=useState(false);
  const [countdown,setCountdown]=useState(0);

  // Bước 2 state: Đổi mật khẩu
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [showCurrentPassword,setShowCurrentPassword]=useState(false);
  const [showNewPassword,setShowNewPassword]=useState(false);
  const [showConfirmPassword,setShowConfirmPassword]=useState(false);
  const [changing,setChanging]=useState(false);
  const [changeErr,setChangeErr]=useState(null);
  const [changeSuccess,setChangeSuccess]=useState(false);

  // Đồng hồ đếm ngược gửi lại OTP
  useEffect(()=>{
    if(countdown <= 0) return;
    const timer = setInterval(()=>setCountdown(c=>c-1),1000);
    return ()=>clearInterval(timer);
  },[countdown]);

  // Gửi mã OTP
  async function handleSendOtp(){
    setSendingOtp(true);
    setOtpMsg(null);
    setOtpErr(null);
    setOtpCode('');

    try{
      const res = await apiRequest('/auth/send-password-otp',{
        method:'POST'
      });
      setOtpSent(true);
      setOtpMsg(res.message);
      setCountdown(60); // Đếm ngược 60s mới cho gửi lại
    }catch(err){
      setOtpErr(err.message || 'Không thể gửi mã xác thực');
    }finally{
      setSendingOtp(false);
    }
  }

  // Xác nhận mã OTP
  async function handleVerifyOtp(e){
    e.preventDefault();
    if(!otpCode.trim() || otpCode.trim().length !== 6){
      setOtpErr('Vui lòng nhập đúng 6 chữ số mã xác thực');
      return;
    }

    setVerifyingOtp(true);
    setOtpErr(null);

    try{
      const res = await apiRequest('/auth/verify-password-otp',{
        method:'POST',
        body:JSON.stringify({ otp: otpCode.trim() })
      });
      setOtpToken(res.otp_token);
      setOtpVerified(true);
      setOtpMsg(res.message || 'Xác thực OTP thành công!');
    }catch(err){
      setOtpErr(err.message || 'Mã xác thực không hợp lệ');
    }finally{
      setVerifyingOtp(false);
    }
  }

  // Cập nhật mật khẩu mới
  async function handleChangePassword(e){
    e.preventDefault();
    setChangeErr(null);

    if(!otpToken){
      setChangeErr('Phiên xác thực OTP không tồn tại. Vui lòng xác thực lại.');
      return;
    }

    if(!isPasswordStrong(newPassword)){
      setChangeErr('Mật khẩu mới chưa đáp ứng đầy đủ 4 tiêu chí mật khẩu mạnh');
      return;
    }

    if(newPassword !== confirmPassword){
      setChangeErr('Mật khẩu xác nhận không khớp với mật khẩu mới');
      return;
    }

    if(newPassword === currentPassword){
      setChangeErr('Mật khẩu mới không được trùng với mật khẩu hiện tại');
      return;
    }

    setChanging(true);
    try{
      await apiRequest('/auth/change-password',{
        method:'POST',
        body:JSON.stringify({
          otp_token: otpToken,
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword
        })
      });
      setChangeSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }catch(err){
      setChangeErr(err.message || 'Lỗi khi cập nhật mật khẩu');
    }finally{
      setChanging(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="BẢO MẬT TÀI KHOẢN"
        title="Đổi mật khẩu bảo mật 2 bước"
        description="Xác minh quyền sở hữu qua Gmail đăng ký trước khi tạo mật khẩu mới để bảo vệ an toàn dữ liệu kinh doanh."
      />

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))',gap:'24px',maxWidth:'1000px'}}>
        {/* BƯỚC 1: XÁC THỰC EMAIL / GMAIL */}
        <Card style={{border: otpVerified ? '1px solid var(--ri-success)' : undefined}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'18px'}}>
            <div style={{
              background: otpVerified ? 'var(--ri-success-bg)' : 'var(--ri-primary-bg)',
              padding:'10px',
              borderRadius:'10px',
              color: otpVerified ? 'var(--ri-success)' : 'var(--ri-primary)'
            }}>
              {otpVerified ? <ShieldCheck size={24}/> : <Mail size={24}/>}
            </div>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <span style={{fontSize:'0.75rem',fontWeight:700,padding:'2px 8px',borderRadius:'4px',background: otpVerified ? 'var(--ri-success)' : 'var(--ri-primary)',color:'#fff'}}>
                  BƯỚC 1
                </span>
                <h2 style={{margin:0,fontSize:'1.125rem',color:'var(--ri-text)'}}>Xác thực Email</h2>
              </div>
              <small style={{color:'var(--ri-text-muted)'}}>
                {otpVerified ? 'Đã xác minh quyền sở hữu tài khoản' : 'Nhận mã OTP 6 số gửi về hòm thư'}
              </small>
            </div>
          </div>

          {/* Email hiện tại */}
          <div style={{marginBottom:'16px'}}>
            <label className="ri-field">
              <span>Email nhận mã xác thực</span>
              <div style={{display:'flex',gap:'8px'}}>
                <input
                  type="email"
                  disabled
                  className="ri-control"
                  style={{flex:1,background:'var(--ri-elevated)',opacity:0.85,cursor:'not-allowed'}}
                  value={user?.email || ''}
                />
                {!otpVerified && (
                  <button
                    type="button"
                    className="ri-btn ri-btn-primary"
                    disabled={sendingOtp || countdown > 0}
                    onClick={handleSendOtp}
                    style={{display:'inline-flex',alignItems:'center',gap:'6px',whiteSpace:'nowrap'}}
                  >
                    {sendingOtp ? (
                      <RefreshCw size={15} className="spin"/>
                    ) : (
                      <Send size={15}/>
                    )}
                    {countdown > 0 ? `Gửi lại (${countdown}s)` : (otpSent ? 'Gửi lại mã' : 'Gửi mã về Gmail')}
                  </button>
                )}
              </div>
            </label>
          </div>

          {/* Thông báo gửi mã / lỗi */}
          {otpMsg && (
            <div style={{display:'flex',gap:'10px',alignItems:'flex-start',padding:'12px 14px',background:'var(--ri-success-bg,color-mix(in srgb,var(--ri-success) 12%,transparent))',border:'1px solid var(--ri-success)',borderRadius:'var(--ri-radius)',color:'var(--ri-success)',marginBottom:'16px',fontSize:'0.875rem',lineHeight:1.5}}>
              <CheckCircle2 size={18} style={{flexShrink:0,marginTop:'2px'}}/>
              <span>{otpMsg}</span>
            </div>
          )}

          {otpErr && (
            <div style={{display:'flex',gap:'10px',alignItems:'center',padding:'12px 14px',background:'var(--ri-danger-bg,color-mix(in srgb,var(--ri-danger) 12%,transparent))',border:'1px solid var(--ri-danger)',borderRadius:'var(--ri-radius)',color:'var(--ri-danger)',marginBottom:'16px',fontSize:'0.875rem'}}>
              <AlertCircle size={18} style={{flexShrink:0}}/>
              <span>{otpErr}</span>
            </div>
          )}

          {/* Form nhập mã OTP khi đã gửi */}
          {otpSent && !otpVerified && (
            <form onSubmit={handleVerifyOtp} style={{display:'grid',gap:'14px',marginTop:'8px',paddingTop:'16px',borderTop:'1px dashed var(--ri-border)'}}>
              <div>
                <span style={{display:'block',fontSize:'0.875rem',fontWeight:600,color:'var(--ri-text)',marginBottom:'14px'}}>
                  Nhập mã xác thực OTP (6 chữ số) *
                </span>
                <OtpInput
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={verifyingOtp}
                  autoFocus={true}
                />
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 0',
                fontSize: '0.8125rem'
              }}>
                <span style={{color: 'var(--ri-text-muted)'}}>Chưa nhận được email?</span>
                <button
                  type="button"
                  className="ri-btn ri-btn-secondary ri-btn-sm"
                  disabled={sendingOtp || countdown > 0}
                  onClick={handleSendOtp}
                  style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}
                >
                  <RefreshCw size={12} className={sendingOtp ? 'spin' : ''}/>
                  {countdown > 0 ? `Gửi lại sau (${countdown}s)` : 'Gửi lại mã'}
                </button>
              </div>

              <button
                type="submit"
                className="ri-btn ri-btn-primary"
                disabled={verifyingOtp || otpCode.length !== 6}
                style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'8px'}}
              >
                <CheckCircle2 size={16}/>
                {verifyingOtp ? 'Đang xác thực...' : 'Xác nhận mã OTP'}
              </button>
            </form>
          )}

          {/* Trạng thái khi đã xác thực xong */}
          {otpVerified && (
            <div style={{padding:'12px',background:'var(--ri-elevated)',borderRadius:'var(--ri-radius)',display:'flex',alignItems:'center',gap:'10px'}}>
              <CheckCircle2 size={20} style={{color:'var(--ri-success)'}}/>
              <span style={{fontSize:'0.875rem',fontWeight:600,color:'var(--ri-text)'}}>
                Mã xác thực hợp lệ. Hãy tạo mật khẩu mới ở Bước 2.
              </span>
            </div>
          )}
        </Card>

        {/* BƯỚC 2: NHẬP VÀ ĐỔI MẬT KHẨU MỚI */}
        <Card style={{
          opacity: otpVerified ? 1 : 0.65,
          border: changeSuccess ? '1px solid var(--ri-success)' : undefined
        }}>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'18px'}}>
            <div style={{
              background: otpVerified ? 'var(--ri-primary-bg)' : 'var(--ri-elevated)',
              padding:'10px',
              borderRadius:'10px',
              color: otpVerified ? 'var(--ri-primary)' : 'var(--ri-text-muted)'
            }}>
              {otpVerified ? <Unlock size={24}/> : <Lock size={24}/>}
            </div>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <span style={{
                  fontSize:'0.75rem',
                  fontWeight:700,
                  padding:'2px 8px',
                  borderRadius:'4px',
                  background: otpVerified ? 'var(--ri-primary)' : 'var(--ri-text-muted)',
                  color:'#fff'
                }}>
                  BƯỚC 2
                </span>
                <h2 style={{margin:0,fontSize:'1.125rem',color:'var(--ri-text)'}}>Đổi mật khẩu mới</h2>
              </div>
              <small style={{color:'var(--ri-text-muted)'}}>
                {otpVerified ? 'Nhập mật khẩu hiện tại và tạo mật khẩu mới' : 'Bị khóa — Yêu cầu hoàn tất Bước 1'}
              </small>
            </div>
          </div>

          {changeSuccess ? (
            <div style={{textAlign:'center',padding:'24px 16px'}}>
              <CheckCircle2 size={48} style={{color:'var(--ri-success)',margin:'0 auto 12px'}}/>
              <h3 style={{margin:'0 0 8px',color:'var(--ri-text)'}}>Đã cập nhật mật khẩu thành công!</h3>
              <p style={{color:'var(--ri-text-muted)',fontSize:'0.875rem',lineHeight:1.6,marginBottom:'20px'}}>
                Mật khẩu mới của bạn đã được lưu an toàn với chuẩn mã hóa bcrypt. Bạn có thể sử dụng mật khẩu mới này cho các lần đăng nhập tiếp theo.
              </p>
              <button
                type="button"
                className="ri-btn ri-btn-primary"
                onClick={()=>navigate('/profile')}
                style={{display:'inline-flex',alignItems:'center',gap:'6px'}}
              >
                Về trang hồ sơ cá nhân <ArrowRight size={16}/>
              </button>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} style={{display:'grid',gap:'14px'}}>
              {changeErr && (
                <div style={{display:'flex',gap:'10px',alignItems:'center',padding:'12px 14px',background:'var(--ri-danger-bg,color-mix(in srgb,var(--ri-danger) 12%,transparent))',border:'1px solid var(--ri-danger)',borderRadius:'var(--ri-radius)',color:'var(--ri-danger)',fontSize:'0.875rem'}}>
                  <AlertCircle size={18} style={{flexShrink:0}}/>
                  <span>{changeErr}</span>
                </div>
              )}

              <label className="ri-field">
                <span>Mật khẩu hiện tại *</span>
                <div style={{position:'relative'}}>
                  <input
                    type={showCurrentPassword?'text':'password'}
                    required
                    disabled={!otpVerified || changing}
                    className="ri-control"
                    style={{width:'100%',boxSizing:'border-box',paddingLeft:'36px',paddingRight:'42px'}}
                    placeholder={otpVerified ? 'Nhập mật khẩu đang sử dụng...' : 'Đang bị khóa...'}
                    value={currentPassword}
                    onChange={e=>setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <KeyRound size={16} style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',color:'var(--ri-text-muted)'}}/>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={()=>setShowCurrentPassword(v=>!v)}
                    aria-label={showCurrentPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                    title={showCurrentPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                    style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ri-text-muted)',padding:'4px',display:'flex',alignItems:'center',justifyContent:'center'}}
                  >
                    {showCurrentPassword?<EyeOff size={16}/>:<Eye size={16}/>}
                  </button>
                </div>
              </label>

              <label className="ri-field">
                <span>Mật khẩu mới (Tối thiểu 12 ký tự) *</span>
                <div style={{position:'relative'}}>
                  <input
                    type={showNewPassword?'text':'password'}
                    required
                    disabled={!otpVerified || changing}
                    minLength={12}
                    className="ri-control"
                    style={{width:'100%',boxSizing:'border-box',paddingLeft:'36px',paddingRight:'42px'}}
                    placeholder={otpVerified ? 'Mật khẩu mới (tối thiểu 12 ký tự)...' : 'Đang bị khóa...'}
                    value={newPassword}
                    onChange={e=>setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Lock size={16} style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',color:'var(--ri-text-muted)'}}/>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={()=>setShowNewPassword(v=>!v)}
                    aria-label={showNewPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                    title={showNewPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                    style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ri-text-muted)',padding:'4px',display:'flex',alignItems:'center',justifyContent:'center'}}
                  >
                    {showNewPassword?<EyeOff size={16}/>:<Eye size={16}/>}
                  </button>
                </div>
              </label>

              {otpVerified && (
                <PasswordChecklist password={newPassword} confirmPassword={confirmPassword}/>
              )}

              <label className="ri-field">
                <span>Xác nhận mật khẩu mới *</span>
                <div style={{position:'relative'}}>
                  <input
                    type={showConfirmPassword?'text':'password'}
                    required
                    disabled={!otpVerified || changing}
                    minLength={12}
                    className="ri-control"
                    style={{width:'100%',boxSizing:'border-box',paddingLeft:'36px',paddingRight:'42px'}}
                    placeholder={otpVerified ? 'Nhập lại mật khẩu mới...' : 'Đang bị khóa...'}
                    value={confirmPassword}
                    onChange={e=>setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Lock size={16} style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',color:'var(--ri-text-muted)'}}/>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={()=>setShowConfirmPassword(v=>!v)}
                    aria-label={showConfirmPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                    title={showConfirmPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                    style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ri-text-muted)',padding:'4px',display:'flex',alignItems:'center',justifyContent:'center'}}
                  >
                    {showConfirmPassword?<EyeOff size={16}/>:<Eye size={16}/>}
                  </button>
                </div>
              </label>

              <div style={{marginTop:'8px'}}>
                <button
                  type="submit"
                  className="ri-btn ri-btn-primary"
                  disabled={!otpVerified || changing}
                  style={{display:'inline-flex',alignItems:'center',gap:'8px'}}
                >
                  <KeyRound size={16}/>
                  {changing ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                </button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
