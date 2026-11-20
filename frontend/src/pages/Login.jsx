import React,{useState,useEffect,useRef} from 'react';
import {Link,Navigate,useSearchParams,useNavigate} from 'react-router-dom';
import {ChartNoAxesCombined,LockKeyhole,ArrowLeft,Mail,ShieldCheck,CheckCircle2,AlertCircle,Store,User,KeyRound,X,RefreshCw,Eye,EyeOff} from 'lucide-react';
import {useAuth} from '../auth/AuthContext';
import {getDefaultRoute,isRouteAllowed} from '../config/roles';
import {Button} from '../design-system';
import {ThemeToggle} from '../design-system/ThemeProvider.jsx';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import PasswordChecklist, { isPasswordStrong } from '../components/auth/PasswordChecklist';
import {authRequest} from '../services/auth';
import {setTokens} from '../services/tokenStorage';
import {warmApi} from '../services/api';
import OtpInput from '../components/auth/OtpInput';
import AuthShowcasePanel from '../components/auth/AuthShowcasePanel';

export default function Login(){
  const {user,loading,login,refresh,error:sessionError,clearError}=useAuth();
  const [searchParams]=useSearchParams();
  const navigate=useNavigate();
  const redirectParam = searchParams.get('redirect');

  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [showGooglePassword,setShowGooglePassword]=useState(false);
  const [showGoogleConfirmPassword,setShowGoogleConfirmPassword]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  // Xóa sạch thông báo lỗi cũ khi render màn hình đăng nhập
  useEffect(()=>{
    setError('');
    if(typeof clearError==='function') clearError();
  },[clearError]);

  // Modal hoàn thiện Shop sau Google OAuth
  const [googleModal, setGoogleModal] = useState(null);
  const googleOtpLock=useRef(false); 
  // googleModal: { step: 1 | 2, email: '', fullName: '', otp: '', countdown: 60, resending: false, resendMsg: '', verificationToken: '', storeName: '', password: '', confirmPassword: '', error: '', busy: false }

  if(!loading && user){
    const target = (redirectParam && isRouteAllowed(user.role, redirectParam))
      ? redirectParam
      : getDefaultRoute(user.role);
    return <Navigate to={target} replace/>;
  }

  async function submit(e){
    e.preventDefault();
    setError('');
    setBusy(true);
    try{
      const loggedUser = await login({email,password});
      const target = (redirectParam && loggedUser && isRouteAllowed(loggedUser.role, redirectParam))
        ? redirectParam
        : getDefaultRoute(loggedUser?.role);
      navigate(target, {replace:true});
    }catch(err){
      setError(err.message || 'Email hoặc mật khẩu không chính xác');
    }finally{
      setBusy(false);
    }
  }

  // Đồng hồ đếm ngược gửi lại OTP trong Google Modal
  useEffect(() => {
    if (!googleModal?.countdown || googleModal.countdown <= 0) return;
    const timer = setInterval(() => {
      setGoogleModal(m => (m && m.countdown > 0 ? { ...m, countdown: m.countdown - 1 } : m));
    }, 1000);
    return () => clearInterval(timer);
  }, [googleModal?.countdown]);

  useEffect(()=>{
    if(!googleModal?.lockSeconds)return;
    const timer=setTimeout(()=>setGoogleModal(m=>{
      if(!m)return m;
      const lockSeconds=Math.max(0,(m.lockSeconds||0)-1);
      return {...m,lockSeconds,...(lockSeconds===0?{failedAttempts:0,error:''}:{})};
    }),1000);
    return()=>clearTimeout(timer);
  },[googleModal?.lockSeconds]);

  // Xử lý gửi lại mã OTP trong Google Modal
  async function handleResendGoogleOtp() {
    if (!googleModal?.email || (googleModal.countdown > 0 && !googleModal.lockSeconds) || googleModal.resending) return;
    setGoogleModal(m => ({ ...m, resending: true, error: '', resendMsg: '' }));
    try {
      const res = await authRequest('/send-register-otp', {
        method: 'POST',
        body: { email: googleModal.email }
      });
      setGoogleModal(m => ({
        ...m,
        resending: false,
        countdown: 60,
        otp:'',failedAttempts:0,lockSeconds:0,
        resendMsg: res.message || 'Đã gửi lại mã xác thực 6 số về Gmail của bạn.'
      }));
    } catch (err) {
      setGoogleModal(m => ({
        ...m,
        resending: false,
        error: err.message || 'Không thể gửi lại mã xác thực'
      }));
    }
  }

  // Xử lý đăng nhập Google
  async function handleGoogleSuccess(idToken){
    setError('');
    setBusy(true);
    try{
      const res = await authRequest('/google', {
        method: 'POST',
        body: { id_token: idToken }
      });

      if(res.status === 'LOGGED_IN'){
        setTokens({
          accessToken: res.accessToken || res.token,
          refreshToken: res.refreshToken
        });
        const loggedUser = await refresh();
        const target = (redirectParam && loggedUser && isRouteAllowed(loggedUser.role, redirectParam))
          ? redirectParam
          : getDefaultRoute(loggedUser?.role);
        navigate(target, {replace:true});
      } else if(res.status === 'NEED_OTP_AND_ONBOARDING'){
        // Tài khoản mới chưa có Shop -> Mở Modal xác thực OTP và hoàn thiện Shop (để trống ô OTP)
        setGoogleModal({
          step: 1,
          email: res.email,
          fullName: res.full_name || '',
          otp: '',
          countdown: 60,
          resending: false,
          resendMsg: '',
          verificationToken: '',
          storeName: '',
          password: '',
          confirmPassword: '',
          error: '',
          busy: false,
          failedAttempts:0,
          lockSeconds:0
        });
      }
    }catch(err){
      setError(err.message || 'Đăng nhập Google thất bại');
    }finally{
      setBusy(false);
    }
  }

  // Bước 1 Modal: Xác thực OTP đăng ký Google
  async function handleVerifyGoogleOtp(e){
    e?.preventDefault?.();
    if(googleOtpLock.current)return;
    if(googleModal.lockSeconds>0)return;
    if(!googleModal.otp.trim()||googleModal.otp.trim().length!==6){
      setGoogleModal(m=>({...m,error:'Vui lòng nhập đủ 6 chữ số mã OTP'}));
      return;
    }
    googleOtpLock.current=true;
    setGoogleModal(m=>({...m,busy:true,error:''}));
    try{
      const res=await authRequest('/verify-register-otp',{method:'POST',body:{email:googleModal.email,otp:googleModal.otp.trim()}});
      setGoogleModal(m=>({...m,step:2,verificationToken:res.verification_token,busy:false,error:'',failedAttempts:0,lockSeconds:0}));
    }catch(err){
      setGoogleModal(m=>{
        const failedAttempts=(m.failedAttempts||0)+1;
        return {...m,otp:'',busy:false,failedAttempts,lockSeconds:failedAttempts>=5?30:0,error:failedAttempts>=5?'Bạn đã nhập sai mã OTP quá nhiều lần. Vui lòng chờ 30s hoặc bấm Gửi lại mã mới.':err.message||'Mã xác thực không hợp lệ hoặc đã hết hạn'};
      });
    }finally{
      googleOtpLock.current=false;
    }
  }

  useEffect(()=>{
    if(googleModal?.step===1&&googleModal.otp.length===6&&!googleModal.busy)handleVerifyGoogleOtp();
  },[googleModal?.step,googleModal?.otp,googleModal?.busy]);
  // Bước 2 Modal: Hoàn thiện thông tin Shop sau Google
  async function handleCompleteGoogleOnboarding(e){
    e.preventDefault();
    if(!isPasswordStrong(googleModal.password)){
      setGoogleModal(m => ({ ...m, error: 'Mật khẩu chưa đáp ứng đủ 4 tiêu chí bảo mật' }));
      return;
    }
    if(googleModal.password !== googleModal.confirmPassword){
      setGoogleModal(m => ({ ...m, error: 'Mật khẩu xác nhận không khớp' }));
      return;
    }
    if(!googleModal.storeName.trim()){
      setGoogleModal(m => ({ ...m, error: 'Vui lòng nhập tên cửa hàng / doanh nghiệp' }));
      return;
    }

    setGoogleModal(m => ({ ...m, busy: true, error: '' }));
    try{
      const completeRes = await authRequest('/google/complete', {
        method: 'POST',
        body: {
          verification_token: googleModal.verificationToken,
          name: googleModal.fullName.trim() || 'Chủ cửa hàng',
          storeName: googleModal.storeName.trim(),
          password: googleModal.password,
          confirm_password: googleModal.confirmPassword
        }
      });

      setTokens({
        accessToken: completeRes?.accessToken || completeRes?.token,
        refreshToken: completeRes?.refreshToken
      });
      const loggedUser = await refresh();
      setGoogleModal(null);
      const target = (redirectParam && loggedUser && isRouteAllowed(loggedUser.role, redirectParam))
        ? redirectParam
        : getDefaultRoute(loggedUser?.role);
      navigate(target, {replace:true});
    }catch(err){
      setGoogleModal(m => ({ ...m, busy: false, error: err.message || 'Không thể khởi tạo cửa hàng' }));
    }
  }

  return (
    <div className="auth-shell">
      <div style={{position:'absolute',top:'20px',right:'24px',display:'flex',gap:'12px',alignItems:'center',zIndex:20}}>
        <ThemeToggle/>
        <Link to="/welcome" className="btn-auth-nav">
          <ArrowLeft size={14}/> Trang chủ
        </Link>
      </div>

      <AuthShowcasePanel
        title="Quản lý cửa hàng."
        highlight="Bán lẻ thông minh & chính xác."
        description="Nền tảng quản lý tích hợp nghiệp vụ bán hàng POS, kiểm soát kho đa chi nhánh và giải thuật AI dự báo nhu cầu SKU theo thời gian thực."
        badgeText="HỆ THỐNG QUẢN LÝ BÁN LẺ & DỰ BÁO AI"
      />

      <section className="auth-form-wrap">
        <div className="auth-form-card">
          <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
            <LockKeyhole size={24} style={{color:'var(--ri-primary)'}}/>
            <h2 style={{margin:0,fontSize:'1.375rem'}}>Đăng nhập</h2>
          </div>
          <p style={{margin:'0 0 20px',color:'var(--ri-muted)',fontSize:'0.875rem'}}>
            Đăng nhập nhanh với Google hoặc tài khoản email của bạn
          </p>

          {/* Nút Tiếp tục với Google */}
          <GoogleSignInButton
            onSuccess={handleGoogleSuccess}
            onError={err => setError(err)}
            disabled={busy}
            text="Tiếp tục với Google"
          />

          <div style={{
            display: 'flex',
            alignItems: 'center',
            margin: '16px 0 20px',
            color: 'var(--ri-text-muted)',
            fontSize: '0.8125rem'
          }}>
            <div style={{flex: 1, height: '1px', background: 'var(--ri-border)'}}/>
            <span style={{padding: '0 12px'}}>hoặc đăng nhập bằng email</span>
            <div style={{flex: 1, height: '1px', background: 'var(--ri-border)'}}/>
          </div>

          <form className="auth-fields" onSubmit={submit}>
            <label className="ri-field">
              <span>Email *</span>
              <input
                type="email"
                className="ri-control"
                autoComplete="username"
                required
                maxLength={254}
                placeholder="name@cuahang.vn"
                value={email}
                onChange={e=>setEmail(e.target.value)}
              />
            </label>

            <label className="ri-field">
              <span>Mật khẩu *</span>
              <div style={{position:'relative'}}>
                <input
                  type={showPassword?'text':'password'}
                  className="ri-control"
                  autoComplete="current-password"
                  required
                  placeholder="Nhập mật khẩu..."
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                  style={{width:'100%',paddingRight:'44px'}}
                />
                <button
                  type="button"
                  onClick={()=>setShowPassword(visible=>!visible)}
                  aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                  title={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                  style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',display:'grid',placeItems:'center',width:'32px',height:'32px',padding:0,border:0,borderRadius:'8px',background:'transparent',color:'var(--ri-muted)',cursor:'pointer'}}
                >
                  {showPassword?<EyeOff size={18}/>:<Eye size={18}/>} 
                </button>
              </div>
            </label>

            {(error||sessionError)&&(
              <div className="auth-error" role="alert" style={{margin:'4px 0'}}>
                {error||sessionError}
              </div>
            )}

            <Button type="submit" variant="primary" loading={busy} disabled={busy} style={{width:'100%',marginTop:'8px'}}>
              {busy ? 'Đang xác thực...' : 'Đăng nhập'}
            </Button>
          </form>

          <div className="auth-links" style={{marginTop:'24px',fontSize:'0.875rem',textAlign:'center'}}>
            <Link to="/register" style={{fontWeight:600}}>Đăng ký cửa hàng mới</Link>
            <span style={{margin:'0 8px',color:'var(--ri-border)'}}>·</span>
            <Link to="/forgot-password" style={{color:'var(--ri-muted)'}}>Quên mật khẩu?</Link>
          </div>
        </div>
      </section>

      {/* MODAL HOÀN THIỆN SHOP KHI ĐĂNG NHẬP GOOGLE LẦN ĐẦU */}
      {googleModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--ri-surface)',
            border: '1px solid var(--ri-border)',
            borderRadius: 'var(--ri-radius-lg)',
            boxShadow: 'var(--ri-shadow-lg)',
            width: '100%',
            maxWidth: '500px',
            padding: '28px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px'}}>
              <div>
                <h3 style={{margin:0,fontSize:'1.25rem',color:'var(--ri-text)'}}>
                  Khởi tạo cửa hàng mới
                </h3>
                <p style={{margin:'4px 0 0',fontSize:'0.8125rem',color:'var(--ri-text-muted)'}}>
                  Tài khoản Google chưa liên kết cửa hàng. Vui lòng hoàn tất 2 bước thiết lập.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={()=>setGoogleModal(null)}
                style={{cursor:'pointer'}}
                aria-label="Đóng"
              >
                <X size={18}/>
              </button>
            </div>

            {/* Stepper Indicator 2 Bước */}
            <div className="auth-stepper">
              <div
                className={`auth-step-item ${googleModal.step === 1 ? 'active' : ''} ${googleModal.step > 1 ? 'completed' : ''}`}
                style={{cursor: googleModal.verificationToken ? 'pointer' : 'default'}}
                onClick={() => { if (googleModal.verificationToken) setGoogleModal(m => ({ ...m, step: 1 })); }}
              >
                <div className="auth-step-num">
                  {googleModal.step > 1 ? <CheckCircle2 size={16}/> : '1'}
                </div>
                <span className="auth-step-label">1. Xác thực Gmail</span>
              </div>

              <div className={`auth-step-line ${googleModal.step > 1 ? 'active' : ''}`}/>

              <div
                className={`auth-step-item ${googleModal.step === 2 ? 'active' : ''}`}
                style={{cursor: googleModal.verificationToken ? 'pointer' : 'default'}}
                onClick={() => { if (googleModal.verificationToken) setGoogleModal(m => ({ ...m, step: 2 })); }}
              >
                <div className="auth-step-num">2</div>
                <span className="auth-step-label">2. Thiết lập cửa hàng</span>
              </div>
            </div>

            {googleModal.error && googleModal.step === 2 && (
              <div style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--ri-danger-bg, color-mix(in srgb, var(--ri-danger) 12%, transparent))',
                border: '1px solid var(--ri-danger)',
                borderRadius: 'var(--ri-radius)',
                color: 'var(--ri-danger)',
                fontSize: '0.875rem',
                marginBottom: '16px'
              }}>
                <AlertCircle size={16} style={{flexShrink:0}}/>
                <span>{googleModal.error}</span>
              </div>
            )}

            {/* BƯỚC 1: XÁC THỰC MÃ OTP GỬI VỀ GMAIL */}
            {googleModal.step === 1 && (
              <div className="auth-step-pane slide-backward">
                <form onSubmit={event=>event.preventDefault()} style={{display:'grid',gap:'14px'}}>
                  <p style={{margin:0,fontSize:'0.875rem',color:'var(--ri-text-muted)',lineHeight:1.6}}>
                    Hệ thống vừa gửi mã xác thực 6 số đến Gmail <strong>{googleModal.email}</strong>. Vui lòng mở hòm thư và nhập mã để xác nhận:
                  </p>
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs">
                    Lưu ý: Nếu chưa thấy email trong Hộp thư đến sau 15 giây, vui lòng kiểm tra thêm mục Thư rác (Spam) và chọn 'Báo cáo không phải thư rác'.
                  </div>

                  {googleModal.resendMsg && (
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '10px 12px',
                      background: 'var(--ri-success-bg, color-mix(in srgb, var(--ri-success) 12%, transparent))',
                      border: '1px solid var(--ri-success)',
                      borderRadius: 'var(--ri-radius)',
                      color: 'var(--ri-success)',
                      fontSize: '0.8125rem'
                    }}>
                      <CheckCircle2 size={16} style={{flexShrink:0}}/>
                      <span>{googleModal.resendMsg}</span>
                    </div>
                  )}

                  <label className="ri-field">
                    <span>Mã OTP 6 chữ số *</span>
                    <OtpInput
                      value={googleModal.otp}
                      onChange={(val) => setGoogleModal(m => ({ ...m, otp: val, error: '' }))}
                      disabled={googleModal.busy||googleModal.lockSeconds>0}
                      autoFocus={true}
                    />
                    {googleModal.error&&<p role="alert" style={{color:'var(--ri-danger)',fontSize:'0.875rem',fontWeight:600,margin:'8px 0 0',textAlign:'center'}}>{googleModal.error}</p>}
                    {googleModal.busy&&<p role="status" style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,margin:'8px 0 0',color:'var(--ri-primary)',fontSize:'0.875rem'}}><RefreshCw size={15} className="spin"/>Đang tự động xác thực mã OTP...</p>}
                    {googleModal.lockSeconds>0&&<p role="status" style={{margin:'8px 0 0',textAlign:'center',color:'var(--ri-danger)',fontSize:'0.8125rem'}}>Ô nhập OTP tạm khóa còn {googleModal.lockSeconds}s.</p>}
                  </label>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderTop: '1px dashed var(--ri-border)',
                    fontSize: '0.8125rem'
                  }}>
                    <span style={{color: 'var(--ri-text-muted)'}}>Chưa nhận được email?</span>
                    <button
                      type="button"
                      className="ri-btn ri-btn-secondary ri-btn-sm"
                      disabled={(googleModal.countdown > 0&&googleModal.lockSeconds===0) || googleModal.resending}
                      onClick={handleResendGoogleOtp}
                      style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}
                    >
                      <RefreshCw size={13} className={googleModal.resending ? 'spin' : ''}/>
                      {googleModal.lockSeconds>0?'Gửi lại mã mới':googleModal.countdown > 0 ? `Gửi lại sau (${googleModal.countdown}s)` : 'Gửi lại mã'}
                    </button>
                  </div>

                </form>
              </div>
            )}

            {/* BƯỚC 2: HOÀN THIỆN THÔNG TIN SHOP */}
            {googleModal.step === 2 && (
              <div className="auth-step-pane slide-forward">
                <form onSubmit={handleCompleteGoogleOnboarding} style={{display:'grid',gap:'12px'}}>
                  <label className="ri-field">
                    <span>Họ và tên chủ cửa hàng *</span>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      className="ri-control"
                      value={googleModal.fullName}
                      onChange={e=>setGoogleModal(m=>({...m,fullName:e.target.value}))}
                      placeholder="Ví dụ: Trần Văn Nam"
                    />
                  </label>

                  <label className="ri-field">
                    <span>Tên cửa hàng / Doanh nghiệp *</span>
                    <input
                      type="text"
                      required
                      maxLength={160}
                      className="ri-control"
                      placeholder="Ví dụ: Siêu thị Tiện ích An Lành"
                      value={googleModal.storeName}
                      onChange={e=>setGoogleModal(m=>({...m,storeName:e.target.value}))}
                      autoFocus={true}
                    />
                  </label>

                  <label className="ri-field">
                    <span>Mật khẩu quản trị *</span>
                    <div style={{position:'relative'}}>
                      <input
                        type={showGooglePassword?'text':'password'}
                        required
                        autoComplete="new-password"
                        className="ri-control"
                        placeholder="Tối thiểu 12 ký tự..."
                        value={googleModal.password}
                        onChange={e=>setGoogleModal(m=>({...m,password:e.target.value}))}
                        style={{paddingRight:'42px'}}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={()=>setShowGooglePassword(v=>!v)}
                        aria-label={showGooglePassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                        title={showGooglePassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                        style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ri-text-muted)',padding:'4px',display:'flex',alignItems:'center',justifyContent:'center'}}
                      >
                        {showGooglePassword?<EyeOff size={16}/>:<Eye size={16}/>}
                      </button>
                    </div>
                  </label>

                  <PasswordChecklist password={googleModal.password} confirmPassword={googleModal.confirmPassword}/>

                  <label className="ri-field">
                    <span>Xác nhận mật khẩu *</span>
                    <div style={{position:'relative'}}>
                      <input
                        type={showGoogleConfirmPassword?'text':'password'}
                        required
                        autoComplete="new-password"
                        className="ri-control"
                        placeholder="Nhập lại mật khẩu..."
                        value={googleModal.confirmPassword}
                        onChange={e=>setGoogleModal(m=>({...m,confirmPassword:e.target.value}))}
                        style={{paddingRight:'42px'}}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={()=>setShowGoogleConfirmPassword(v=>!v)}
                        aria-label={showGoogleConfirmPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                        title={showGoogleConfirmPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                        style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ri-text-muted)',padding:'4px',display:'flex',alignItems:'center',justifyContent:'center'}}
                      >
                        {showGoogleConfirmPassword?<EyeOff size={16}/>:<Eye size={16}/>}
                      </button>
                    </div>
                  </label>

                  <div style={{display:'flex',gap:'10px',justifyContent:'space-between',alignItems:'center',marginTop:'12px'}}>
                    <button
                      type="button"
                      className="ri-btn ri-btn-secondary"
                      onClick={() => setGoogleModal(m => ({ ...m, step: 1 }))}
                      disabled={googleModal.busy}
                      style={{display:'inline-flex',alignItems:'center',gap:'6px'}}
                    >
                      ← Quay lại
                    </button>
                    <div style={{display:'flex',gap:'10px'}}>
                      <button type="submit" className="ri-btn ri-btn-primary" disabled={googleModal.busy}>
                        {googleModal.busy ? 'Đang khởi tạo...' : 'Hoàn tất & Truy cập'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
