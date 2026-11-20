const unavailableMessage='Máy chủ đang khởi động, vui lòng đợi vài giây và thử lại';
const retryStatuses=new Set([502,503,504]);
const inflightGets=new Map();let requestEpoch=0;
function invalidateClientCache(){requestEpoch++;if(typeof window!=='undefined')window.dispatchEvent(new Event('api-cache-invalidate'));}

function wait(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Aborted','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});
  });
}

function withAbort(promise,signal){
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(new DOMException('Aborted','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}

async function performFetchWithRetry(input,options={}){
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

function prepareOptions(options={}){
  const opts={...options};
  const headers=new Headers(opts.headers||{});
  if(typeof window!=='undefined'){
    const token=localStorage.getItem('token')||localStorage.getItem('accessToken');
    if(token&&!headers.has('Authorization')){
      headers.set('Authorization',`Bearer ${token}`);
    }
  }
  opts.headers=headers;
  return opts;
}

export async function fetchWithRetry(input,options={}){
  const finalOptions=prepareOptions(options);
  const method=String(finalOptions.method||input?.method||'GET').toUpperCase();
  if(method!=='GET'){
    invalidateClientCache();
    return performFetchWithRetry(input,finalOptions).then(response=>{if(response.ok)invalidateClientCache();return response;});
  }
  const url=typeof input==='string'?input:input.url;
  const headers=[...finalOptions.headers.entries()].sort(([a],[b])=>a.localeCompare(b));
  const key=JSON.stringify([requestEpoch,url,finalOptions.credentials||'same-origin',headers]);
  const existing=inflightGets.get(key);if(existing)return withAbort(existing,finalOptions.signal).then(response=>response.clone());
  const {signal:_signal,...sharedOptions}=finalOptions;
  const shared=performFetchWithRetry(input,sharedOptions);
  inflightGets.set(key,shared);
  shared.then(()=>{if(inflightGets.get(key)===shared)inflightGets.delete(key);},()=>{if(inflightGets.get(key)===shared)inflightGets.delete(key);});
  return withAbort(shared,finalOptions.signal).then(response=>response.clone());
}
