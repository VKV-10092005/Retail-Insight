import {fetchWithRetry} from './fetchWithRetry.js';
﻿const apiBase=import.meta.env.VITE_API_URL||import.meta.env.VITE_API_BASE_URL||'/api/v1';
const base=import.meta.env.VITE_API_URL?`${apiBase.replace(/\/$/,'')}/auth`:import.meta.env.VITE_AUTH_BASE_URL||`${apiBase.replace(/\/$/,'')}/auth`;
export async function authRequest(path,{method='GET',body}={}){
 const res=await fetchWithRetry(`${base}${path}`,{method,credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'retail-web'},...(body?{body:JSON.stringify(body)}:{})});
 const data=res.status===204?null:await res.json();
 if(!res.ok){if(res.status===423&&data?.code==='ACCOUNT_TEMP_LOCKED')window.dispatchEvent(new CustomEvent('account-temp-locked',{detail:data}));const error=new Error(data?.message||'Không thể kết nối dịch vụ');error.status=res.status;error.data=data;throw error;}
 return data;
}
