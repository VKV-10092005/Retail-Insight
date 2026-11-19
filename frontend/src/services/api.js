import {fetchWithRetry} from './fetchWithRetry.js';
﻿const base=import.meta.env.VITE_API_URL||import.meta.env.VITE_API_BASE_URL||'/api/v1';
export async function getJSON(path,{signal}={}){
 const res=await fetchWithRetry(`${base}${path}`,{signal,credentials:'include',headers:{Accept:'application/json'}});
 const data=await res.json();
 if(!res.ok){if(res.status===401)window.dispatchEvent(new Event('auth-expired'));if(res.status===423&&data?.code==='ACCOUNT_TEMP_LOCKED')window.dispatchEvent(new CustomEvent('account-temp-locked',{detail:data}));throw new Error(data.message||`Yêu cầu không thành công (${res.status})`);}
 return data;
}
export const api={dashboard:()=>getJSON('/dashboard/overview'),products:(params='')=>getJSON(`/products${params}`),forecast:()=>getJSON('/forecasts/runs'),replenishment:()=>getJSON('/replenishment')};
export const isMock=(import.meta.env.VITE_DATA_MODE||'mock')==='mock';
