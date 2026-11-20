import React,{useCallback,useEffect,useRef,useState} from 'react';

const GOOGLE_SCRIPT_URL='https://accounts.google.com/gsi/client';
const GOOGLE_TIMEOUT_MS=10_000;
let googleIdentityPromise;

function loadGoogleIdentity(){
  if(window.google?.accounts?.id)return Promise.resolve(window.google);
  if(googleIdentityPromise)return googleIdentityPromise;

  googleIdentityPromise=new Promise((resolve,reject)=>{
    let script=document.querySelector(`script[src="${GOOGLE_SCRIPT_URL}"]`);
    if(!script){
      script=document.createElement('script');
      script.src=GOOGLE_SCRIPT_URL;
      script.async=true;
      script.defer=true;
      document.head.appendChild(script);
    }

    const startedAt=Date.now();
    const pollId=window.setInterval(()=>{
      if(window.google?.accounts?.id){
        window.clearInterval(pollId);
        resolve(window.google);
      }else if(Date.now()-startedAt>=GOOGLE_TIMEOUT_MS){
        window.clearInterval(pollId);
        googleIdentityPromise=undefined;
        reject(new Error('Không thể tải dịch vụ đăng nhập Google. Vui lòng thử lại.'));
      }
    },50);

    script.addEventListener('error',()=>{
      window.clearInterval(pollId);
      googleIdentityPromise=undefined;
      reject(new Error('Không thể kết nối dịch vụ đăng nhập Google.'));
    },{once:true});
  });

  return googleIdentityPromise;
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  disabled=false,
  text='Tiếp tục với Google'
}){
  const [loading,setLoading]=useState(false);
  const [showOfficialButton,setShowOfficialButton]=useState(false);
  const [gisReady,setGisReady]=useState(Boolean(window.google?.accounts?.id));
  const officialButtonRef=useRef(null);
  const timeoutRef=useRef(null);
  const mountedRef=useRef(true);
  const clientId=import.meta.env.VITE_GOOGLE_CLIENT_ID||'';

  const clearSafetyTimeout=useCallback(()=>{
    if(timeoutRef.current){
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current=null;
    }
  },[]);

  const resetPendingState=useCallback(()=>{
    clearSafetyTimeout();
    if(mountedRef.current)setLoading(false);
  },[clearSafetyTimeout]);

  const handleCredential=useCallback((response)=>{
    resetPendingState();
    if(response?.credential){
      onSuccess(response.credential);
    }else{
      onError?.('Không nhận được thông tin xác thực từ Google');
    }
  },[onError,onSuccess,resetPendingState]);

  const initializeGoogle=useCallback((google)=>{
    google.accounts.id.initialize({
      client_id:clientId,
      callback:handleCredential,
      cancel_on_tap_outside:false
    });
  },[clientId,handleCredential]);

  const openOfficialFallback=useCallback(()=>{
    resetPendingState();
    if(mountedRef.current)setShowOfficialButton(true);
  },[resetPendingState]);

  useEffect(()=>{
    mountedRef.current=true;
    if(clientId){
      loadGoogleIdentity()
        .then(google=>{
          if(!mountedRef.current)return;
          initializeGoogle(google);
          setGisReady(true);
        })
        .catch(()=>{
          if(mountedRef.current)setGisReady(false);
        });
    }

    return()=>{
      mountedRef.current=false;
      clearSafetyTimeout();
      window.google?.accounts?.id?.cancel?.();
    };
  },[clearSafetyTimeout,clientId,initializeGoogle]);

  useEffect(()=>{
    if(!showOfficialButton||!gisReady||!officialButtonRef.current||!clientId)return;
    const container=officialButtonRef.current;
    container.replaceChildren();
    initializeGoogle(window.google);
    window.google.accounts.id.renderButton(container,{
      type:'standard',
      theme:'outline',
      size:'large',
      shape:'rectangular',
      text:text.toLocaleLowerCase('vi-VN').includes('đăng ký')?'signup_with':'continue_with',
      logo_alignment:'left',
      width:Math.min(Math.max(container.clientWidth||320,240),400),
      locale:'vi'
    });
  },[clientId,gisReady,initializeGoogle,showOfficialButton,text]);

  async function handleClick(){
    if(disabled||loading)return;

    if(!clientId){
      const useMock=window.confirm(
        'Chưa cấu hình VITE_GOOGLE_CLIENT_ID trong frontend/.env!\n\n'+
        'Bạn có muốn dùng tài khoản Google thử nghiệm (test_google_owner@gmail.com) để kiểm tra luồng xác thực OTP & Hoàn thiện Shop không?'
      );
      if(useMock)onSuccess('mock_google_token');
      return;
    }

    setLoading(true);
    clearSafetyTimeout();
    timeoutRef.current=window.setTimeout(()=>{
      if(!mountedRef.current)return;
      setLoading(false);
      setShowOfficialButton(true);
      timeoutRef.current=null;
    },GOOGLE_TIMEOUT_MS);

    try{
      const google=await loadGoogleIdentity();
      if(!mountedRef.current)return;
      initializeGoogle(google);
      setGisReady(true);
      google.accounts.id.prompt(notification=>{
        if(!mountedRef.current)return;
        const unavailable=notification.isNotDisplayed?.()||notification.isSkippedMoment?.();
        const dismissed=notification.isDismissedMoment?.()
          && notification.getDismissedReason?.()!=='credential_returned';
        if(unavailable||dismissed)openOfficialFallback();
      });
    }catch(err){
      resetPendingState();
      onError?.(err.message||'Lỗi đăng nhập Google');
    }
  }

  if(showOfficialButton&&clientId){
    return(
      <div style={{marginBottom:'16px'}}>
        <div
          ref={officialButtonRef}
          aria-label="Đăng nhập bằng Google"
          style={{display:'flex',justifyContent:'center',minHeight:'44px',opacity:disabled?0.6:1,pointerEvents:disabled?'none':'auto'}}
        />
      </div>
    );
  }

  return(
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled||loading}
      className="btn-google-auth"
      style={{
        display:'flex',alignItems:'center',justifyContent:'center',gap:'12px',width:'100%',
        padding:'10px 16px',background:'var(--ri-surface)',border:'1px solid var(--ri-border)',
        borderRadius:'var(--ri-radius)',color:'var(--ri-text)',fontSize:'0.875rem',fontWeight:600,
        cursor:(disabled||loading)?'not-allowed':'pointer',boxShadow:'var(--ri-shadow-sm)',
        transition:'all 0.2s ease',marginBottom:'16px'
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" style={{flexShrink:0}} aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.79l7.97-6.2z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      <span>{loading?'Đang kết nối Google...':text}</span>
    </button>
  );
}
