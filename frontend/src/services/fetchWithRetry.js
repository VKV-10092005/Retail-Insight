const unavailableMessage='Máy chủ đang khởi động, vui lòng đợi vài giây và thử lại';
const retryStatuses=new Set([502,503,504]);

function wait(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Aborted','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});
  });
}

export async function fetchWithRetry(input,options={}){
  if(options.method&&options.method.toUpperCase()!=='GET')window.dispatchEvent(new Event('api-cache-invalidate'));
  const signal=options.signal;
  for(let attempt=0;attempt<=2;attempt++){
    try{
      const response=await fetch(input,options);
      if(response.status===423){
        try{const data=await response.clone().json();if(data?.code==='ACCOUNT_TEMP_LOCKED')window.dispatchEvent(new CustomEvent('account-temp-locked',{detail:data}));}catch{}
      }
      if(!retryStatuses.has(response.status))return response;
      if(attempt===2)throw new Error(unavailableMessage);
      try{await response.body?.cancel();}catch{}
    }catch(error){
      if(error?.name==='AbortError')throw error;
      if(error?.message===unavailableMessage)throw error;
      if(!(error instanceof TypeError)&&!(/ECONNREFUSED|Failed to fetch|NetworkError/i.test(error?.message||'')))throw error;
      if(attempt===2)throw new Error(unavailableMessage);
    }
    await wait(800,signal);
  }
}
