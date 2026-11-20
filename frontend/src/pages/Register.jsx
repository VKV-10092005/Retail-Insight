import React,{useState,useEffect,useRef} from 'react';
import {Link,Navigate,useNavigate} from 'react-router-dom';
import {ChartNoAxesCombined,UserPlus,ArrowLeft,CheckCircle2,Send,RefreshCw,Lock,Unlock,AlertCircle,Eye,EyeOff} from 'lucide-react';
import {useAuth} from '../auth/AuthContext';
import {getDefaultRoute} from '../config/roles';
import {Button} from '../design-system';
import {ThemeToggle} from '../design-system/ThemeProvider.jsx';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import PasswordChecklist, { isPasswordStrong } from '../components/auth/PasswordChecklist';
import {authRequest} from '../services/auth';
import OtpInput from '../components/auth/OtpInput';
import AuthShowcasePanel from '../components/auth/AuthShowcasePanel';

export default function Register(){
  const {user,refresh}=useAuth();
  const navigate=useNavigate();

  // Form fields
  const [name, setName]=useState('');
  const [email, setEmail]=useState('');
  const [storeName, setStoreName]=useState('');
  const [password, setPassword]=useState('');
  const [confirmPassword, setConfirmPassword]=useState('');
  const [showPassword, setShowPassword]=useState(false);
  const [showConfirmPassword, setShowConfirmPassword]=useState(false);

  // OTP Verification state
  const [currentStep, setCurrentStep]=useState(1);
  const [slideDir, setSlideDir]=useState('forward');
  const [sendingOtp, setSendingOtp]=useState(false);
  const [otpSent, setOtpSent]=useState(false);
  const [otpCode, setOtpCode]=useState('');
  const [verifyingOtp, setVerifyingOtp]=useState(false);
  const verifyOtpLock=useRef(false);
  const [failedAttempts,setFailedAttempts]=useState(0);
  const [lockSeconds,setLockSeconds]=useState(0);
  const [otpVerified, setOtpVerified]=useState(false);
  const [verificationToken, setVerificationToken]=useState('');
  const [countdown, setCountdown]=useState(0);

  // Status message & busy state
  const [error, setError]=useState('');
  const [infoMsg, setInfoMsg]=useState('');
  const [busy, setBusy]=useState(false);
  const infoIsError=infoMsg.startsWith('Không thể gửi email xác thực');

  // Đếm ngược 60s trước khi gửi lại OTP
  useEffect(()=>{
    if(countdown <= 0) return;
    const timer = setInterval(()=>setCountdown(c=>c-1),1000);
    return ()=>clearInterval(timer);
  },[countdown]);
  useEffect(()=>{
    if(lockSeconds<=0)return;
    const timer=setTimeout(()=>setLockSeconds(seconds=>Math.max(0,seconds-1)),1000);
    return()=>clearTimeout(timer);
  },[lockSeconds]);
  useEffect(()=>{if(lockSeconds===0&&failedAttempts>=5){setFailedAttempts(0);setError('');}},[lockSeconds,failedAttempts]);

  if(user) return <Navigate to={getDefaultRoute(user.role)} replace/>;

  // 1. GỬI MÃ OTP VỀ EMAIL ĐĂNG KÝ
  async function handleSendOtp(){
    if(!email.trim() || !/\S+@\S+\.\S+/.test(email.trim())){
      setError('Vui lòng nhập địa chỉ email hợp lệ trước khi gửi mã');
      return;
    }

    setError('');
    setInfoMsg('');
    setSendingOtp(true);

    try{
      const res = await authRequest('/send-register-otp', {
        method: 'POST',
        body: { email: email.trim().toLowerCase() }
      });
      setOtpSent(true);
      setCountdown(60);
      setOtpCode('');
      setFailedAttempts(0);setLockSeconds(0);
      setError('');
      setInfoMsg(res.message);
    }catch(err){
      setError(err.message || 'Không thể gửi mã xác thực email');
    }finally{
      setSendingOtp(false);
    }
  }

  // 2. XÁC NHẬN MÃ OTP ĐĂNG KÝ
  async function handleVerifyOtp(){
    if(lockSeconds>0)return;
    if(verifyOtpLock.current)return;
    if(!otpCode.trim() || otpCode.trim().length !== 6){
      setError('Vui lòng nhập đúng 6 chữ số mã xác thực');
      return;
    }

    setError('');
    setInfoMsg('');
    verifyOtpLock.current=true;
    setVerifyingOtp(true);

    try{
      const res = await authRequest('/verify-register-otp', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), otp: otpCode.trim() }
      });
      setOtpVerified(true);
      setFailedAttempts(0);
      setVerificationToken(res.verification_token);
      setInfoMsg(res.message || 'Xác thực email thành công! Vui lòng thiết lập cửa hàng.');
      setSlideDir('forward');
      setCurrentStep(2);
    }catch(err){
      const attempts=failedAttempts+1;
      setFailedAttempts(attempts);
      if(attempts>=5){setLockSeconds(30);setError('Bạn đã nhập sai mã OTP quá nhiều lần. Vui lòng chờ 30s hoặc bấm Gửi lại mã mới.');}
      else setError(err.message || 'Mã xác thực không hợp lệ hoặc đã hết hạn');
      setOtpCode('');
    }finally{
      verifyOtpLock.current=false;
      setVerifyingOtp(false);
    }
  }

  useEffect(()=>{
    if(otpSent&&currentStep===1&&otpCode.length===6&&!otpVerified&&!verifyingOtp)handleVerifyOtp();
  },[otpSent,currentStep,otpCode,otpVerified,verifyingOtp]);

  // 3. ĐĂNG KÝ VÀ KHỞI TẠO CỬA HÀNG
  async function submit(e){
    e.preventDefault();
    setError('');

    if(!otpVerified || !verificationToken){
      setError('Vui lòng hoàn tất xác thực email trước khi đăng ký');
      return;
    }
    if(!storeName.trim()){
      setError('Vui lòng nhập tên cửa hàng / doanh nghiệp');
      return;
    }
    if(!isPasswordStrong(password)){
      setError('Mật khẩu chưa đáp ứng đủ 4 tiêu chí bảo mật');
      return;
    }
    if(password !== confirmPassword){
      setError('Mật khẩu xác nhận không khớp với mật khẩu đã nhập');
      return;
    }

    setBusy(true);
    try{
      const regRes = await authRequest('/register', {
        method: 'POST',
        body: {
          verification_token: verificationToken,
          name: name.trim(),
          storeName: storeName.trim(),
          password,
          confirm_password: confirmPassword
        }
      });
      if(regRes?.accessToken || regRes?.token){
        localStorage.setItem('token', regRes.accessToken || regRes.token);
        localStorage.setItem('accessToken', regRes.accessToken || regRes.token);
      }
      if(regRes?.refreshToken){
        localStorage.setItem('refreshToken', regRes.refreshToken);
      }
      // Đăng nhập tự động ngay sau khi đăng ký
      const newUser=await refresh();
      try{if(newUser?.id)localStorage.setItem(`onboarding_main_pending_${newUser.id}`,'true');}catch{}
      navigate('/', {replace:true});
    }catch(err){
      setError(err.message || 'Không thể tạo cửa hàng');
    }finally{
      setBusy(false);
    }
  }

  // Xử lý Google Sign-In trên trang Đăng ký
  async function handleGoogleSuccess(idToken){
    setError('');
    setBusy(true);
    try{
      const res = await authRequest('/google', {
        method: 'POST',
        body: { id_token: idToken }
      });

      if(res.status === 'LOGGED_IN'){
        if(res?.accessToken || res?.token){
          localStorage.setItem('token', res.accessToken || res.token);
          localStorage.setItem('accessToken', res.accessToken || res.token);
        }
        if(res?.refreshToken){
          localStorage.setItem('refreshToken', res.refreshToken);
        }
        await refresh();
        navigate('/', {replace:true});
      } else if(res.status === 'NEED_OTP_AND_ONBOARDING'){
        // Tự động điền email và họ tên từ Google
        setEmail(res.email);
        setName(res.full_name || '');
        setOtpSent(true);
        setCountdown(60);
        setOtpCode('');
        setInfoMsg(res.message);
        setSlideDir('backward');
        setCurrentStep(1);
      }
    }catch(err){
      setError(err.message || 'Đăng ký bằng Google thất bại');
    }finally{
      setBusy(false);
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
        title="Cửa hàng của bạn."
        highlight="Không gian vận hành độc lập."
        description="Khởi tạo tài khoản Chủ cửa hàng (OWNER) và chi nhánh ban đầu. Hệ thống sẵn sàng với đầy đủ phân quyền và cơ chế bảo mật xác thực hai bước."
        badgeText="KHỞI TẠO CỬA HÀNG & PHÂN QUYỀN 4 ROLE"
      />

      <section className="auth-form-wrap">
        <div className="auth-form-card" style={{maxWidth:'520px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'4px'}}>
            <UserPlus size={24} style={{color:'var(--ri-primary)'}}/>
            <h2 style={{margin:0,fontSize:'1.375rem'}}>Đăng ký cửa hàng</h2>
          </div>
          <p style={{margin:'0 0 16px',color:'var(--ri-muted)',fontSize:'0.875rem'}}>
            Tạo tài khoản quản trị viên cho cửa hàng hoặc chuỗi bán lẻ
          </p>

          {/* Stepper Indicator 2 Bước */}
          <div className="auth-stepper">
            <div
              className={`auth-step-item ${currentStep === 1 ? 'active' : ''} ${otpVerified ? 'completed' : ''}`}
              style={{cursor: otpVerified ? 'pointer' : 'default'}}
              onClick={() => { if (otpVerified) { setSlideDir('backward'); setCurrentStep(1); } }}
            >
              <div className="auth-step-num">
                {otpVerified ? <CheckCircle2 size={16}/> : '1'}
              </div>
              <span className="auth-step-label">1. Xác thực tài khoản</span>
            </div>

            <div className={`auth-step-line ${currentStep > 1 || otpVerified ? 'active' : ''}`}/>

            <div
              className={`auth-step-item ${currentStep === 2 ? 'active' : ''}`}
              style={{cursor: otpVerified ? 'pointer' : 'default'}}
              onClick={() => { if (otpVerified) { setSlideDir('forward'); setCurrentStep(2); } }}
            >
              <div className="auth-step-num">2</div>
              <span className="auth-step-label">2. Thiết lập cửa hàng</span>
            </div>
          </div>

          {error && (
            <div className="auth-error" role="alert" style={{margin:'0 0 12px'}}>
              {error}
            </div>
          )}

          {infoMsg && (
            <div className={infoIsError ? 'bg-red-50 border-red-200 text-red-700' : ''} role={infoIsError ? 'alert' : 'status'} style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              padding: '10px 14px',
              background: infoIsError ? undefined : 'var(--ri-success-bg, color-mix(in srgb, var(--ri-success) 12%, transparent))',
              border: infoIsError ? undefined : '1px solid var(--ri-success)',
              borderRadius: 'var(--ri-radius)',
              color: infoIsError ? undefined : 'var(--ri-success)',
              fontSize: '0.8125rem',
              marginBottom: '12px',
              lineHeight: 1.5
            }}>
              {infoIsError
                ? <AlertCircle size={16} style={{flexShrink:0}}/>
                : <CheckCircle2 size={16} style={{flexShrink:0}}/>}
              <span>{infoMsg}</span>
            </div>
          )}

          {/* Chỉ render bước đang hoạt động để khung tự động ôm sát nội dung (Dynamic Auto Height) */}
          {currentStep === 1 && (
            <div className={`auth-step-pane ${slideDir === 'backward' ? 'slide-backward' : 'slide-forward'}`}>
              {/* Nút Tiếp tục với Google ở đầu form */}
              <GoogleSignInButton
                onSuccess={handleGoogleSuccess}
                onError={err => setError(err)}
                disabled={busy || sendingOtp}
                text="Đăng ký nhanh với Google"
              />

              <div style={{
                display: 'flex',
                alignItems: 'center',
                margin: '10px 0 14px',
                color: 'var(--ri-text-muted)',
                fontSize: '0.8125rem'
              }}>
                <div style={{flex: 1, height: '1px', background: 'var(--ri-border)'}}/>
                <span style={{padding: '0 12px'}}>hoặc đăng ký bằng email</span>
                <div style={{flex: 1, height: '1px', background: 'var(--ri-border)'}}/>
              </div>

              <div style={{display:'grid',gap:'12px'}}>
                <label className="ri-field">
                  <span>Họ và tên chủ cửa hàng *</span>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    className="ri-control"
                    placeholder="Ví dụ: Trần Văn Nam"
                    value={name}
                    onChange={e=>setName(e.target.value)}
                    disabled={busy}
                  />
                </label>

                <label className="ri-field">
                  <span>Email đăng nhập *</span>
                  <div style={{display:'flex',gap:'8px'}}>
                    <input
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      className="ri-control"
                      style={{flex:1}}
                      placeholder="name@cuahang.vn"
                      value={email}
                      onChange={e=>{
                        setEmail(e.target.value);
                        if(otpVerified){
                          setOtpVerified(false);
                          setVerificationToken('');
                        }
                      }}
                      disabled={busy || otpVerified}
                    />
                    {!otpVerified ? (
                      <button
                        type="button"
                        className="ri-btn ri-btn-primary"
                        disabled={sendingOtp || (countdown > 0&&lockSeconds===0) || busy}
                        onClick={handleSendOtp}
                        style={{display:'inline-flex',alignItems:'center',gap:'6px',whiteSpace:'nowrap',fontSize:'0.8125rem',padding:'0 14px'}}
                      >
                        {sendingOtp ? <RefreshCw size={14} className="spin"/> : <Send size={14}/>}
                        {countdown > 0 ? `${countdown}s` : (otpSent ? 'Gửi lại' : 'Gửi mã')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ri-btn ri-btn-secondary ri-btn-sm"
                        onClick={() => {
                          setOtpVerified(false);
                          setVerificationToken('');
                          setOtpSent(false);
                          setOtpCode('');
                        }}
                        title="Đổi email khác"
                      >
                        Đổi email
                      </button>
                    )}
                  </div>
                </label>

                {/* Ô NHẬP VÀ XÁC NHẬN MÃ OTP */}
                {otpSent && !otpVerified && (
                  <div style={{
                    background: 'var(--ri-elevated)',
                    border: '1px dashed var(--ri-primary)',
                    borderRadius: 'var(--ri-radius)',
                    padding: '14px 12px',
                    margin: '2px 0 0'
                  }}>
                    <div style={{marginBottom: '10px'}}>
                      <p style={{margin:'0 0 10px',fontSize:'0.8125rem',color:'var(--ri-text-muted)',lineHeight:1.5}}>
                        Hệ thống vừa gửi mã xác thực 6 số đến Gmail <strong>{email}</strong>. Vui lòng mở hòm thư và nhập mã để xác nhận:
                      </p>
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs" style={{marginBottom:'12px'}}>
                        Lưu ý: Nếu chưa thấy email trong Hộp thư đến sau 15 giây, vui lòng kiểm tra thêm mục Thư rác (Spam) và chọn 'Báo cáo không phải thư rác'.
                      </div>
                      <span style={{fontWeight: 600, fontSize: '0.875rem', color: 'var(--ri-text)', display: 'block', marginBottom: '12px'}}>
                        Nhập mã OTP 6 số gửi về hòm thư *
                      </span>
                      <OtpInput
                        value={otpCode}
                        onChange={value=>{setOtpCode(value);if(error)setError('');}}
                        disabled={verifyingOtp||lockSeconds>0}
                        autoFocus={true}
                      />
                      {error&&<p role="alert" style={{color:'var(--ri-danger)',fontSize:'0.875rem',fontWeight:600,margin:'10px 0 0',textAlign:'center'}}>{error}</p>}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'12px',fontSize:'0.8125rem'}}>
                      <span style={{color: 'var(--ri-text-muted)'}}>Chưa nhận được email?</span>
                      <button
                        type="button"
                        className="ri-btn ri-btn-secondary ri-btn-sm"
                        disabled={sendingOtp || (countdown > 0&&lockSeconds===0) || busy}
                        onClick={handleSendOtp}
                        style={{display: 'inline-flex', alignItems: 'center', gap: '4px'}}
                      >
                        <RefreshCw size={12} className={sendingOtp ? 'spin' : ''}/>
                        {lockSeconds>0?'Gửi lại mã mới':countdown > 0 ? `Gửi lại sau (${countdown}s)` : 'Gửi lại mã'}
                      </button>
                    </div>
                    {verifyingOtp&&<p role="status" style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,margin:'10px 0 0',color:'var(--ri-primary)',fontSize:'0.875rem'}}><RefreshCw size={15} className="spin"/>Đang tự động xác thực mã OTP...</p>}
                    {lockSeconds>0&&<p role="status" style={{margin:'8px 0 0',textAlign:'center',color:'var(--ri-danger)',fontSize:'0.8125rem'}}>Ô nhập OTP tạm khóa còn {lockSeconds}s.</p>}
                  </div>
                )}

                
              </div>
            </div>
          )}

          {/* BƯỚC 2: THIẾT LẬP CỬA HÀNG */}
          {currentStep === 2 && (
            <div className="auth-step-pane slide-forward">
              <form onSubmit={submit} style={{display:'grid',gap:'12px'}}>
                <label className="ri-field">
                  <span>Tên cửa hàng / Doanh nghiệp *</span>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    className="ri-control"
                    placeholder="Ví dụ: Siêu thị Tiện ích An Lành"
                    value={storeName}
                    onChange={e=>setStoreName(e.target.value)}
                    disabled={busy}
                    autoFocus={true}
                  />
                </label>

                <label className="ri-field">
                  <span>Mật khẩu quản trị *</span>
                  <div style={{position:'relative'}}>
                    <input
                      type={showPassword?'text':'password'}
                      required
                      autoComplete="new-password"
                      className="ri-control"
                      placeholder="Tối thiểu 12 ký tự an toàn..."
                      value={password}
                      onChange={e=>setPassword(e.target.value)}
                      disabled={busy}
                      style={{paddingRight:'42px'}}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={()=>setShowPassword(v=>!v)}
                      aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                      title={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
                      style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--ri-text-muted)',padding:'4px',display:'flex',alignItems:'center',justifyContent:'center'}}
                    >
                      {showPassword?<EyeOff size={16}/>:<Eye size={16}/>}
                    </button>
                  </div>
                </label>

                <PasswordChecklist password={password} confirmPassword={confirmPassword}/>

                <label className="ri-field">
                  <span>Xác nhận mật khẩu *</span>
                  <div style={{position:'relative'}}>
                    <input
                      type={showConfirmPassword?'text':'password'}
                      required
                      autoComplete="new-password"
                      className="ri-control"
                      placeholder="Nhập lại mật khẩu..."
                      value={confirmPassword}
                      onChange={e=>setConfirmPassword(e.target.value)}
                      disabled={busy}
                      style={{paddingRight:'42px'}}
                    />
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

                {/* Hàng nút hành động: Quay lại và Hoàn tất đăng ký */}
                <div style={{display:'flex',gap:'10px',alignItems:'center',marginTop:'12px'}}>
                  <button
                    type="button"
                    className="ri-btn ri-btn-secondary"
                    onClick={() => { setSlideDir('backward'); setCurrentStep(1); }}
                    disabled={busy}
                    style={{display:'inline-flex',alignItems:'center',gap:'6px'}}
                  >
                    ← Quay lại
                  </button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={busy}
                    disabled={busy}
                    style={{flex:1}}
                  >
                    {busy ? 'Đang tạo cửa hàng...' : 'Hoàn tất đăng ký'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          <div className="auth-links" style={{marginTop:'16px',fontSize:'0.875rem',textAlign:'center'}}>
            Đã có tài khoản? <Link to="/login" style={{fontWeight:600}}>Đăng nhập tại đây</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
