import {fetchWithRetry} from './fetchWithRetry.js';
import {apiUrl} from './apiUrl.js';
const CACHE_TTL=20_000,CACHE_STALE_LIMIT=5*60_000;
function cacheKey(userId,path){return `retail_api_swr_${userId}_${path}`;}
function readCache(userId,path){try{const value=JSON.parse(sessionStorage.getItem(cacheKey(userId,path))||'null');return value?.savedAt&&Date.now()-value.savedAt<CACHE_STALE_LIMIT?value.data:null;}catch{return null;}}
function writeCache(userId,path,data){try{sessionStorage.setItem(cacheKey(userId,path),JSON.stringify({savedAt:Date.now(),data}));}catch{}}
export function clearApiCache(){try{for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith('retail_api_swr_'))sessionStorage.removeItem(key);}}catch{}}
if(typeof window!=='undefined'){window.addEventListener('api-cache-invalidate',clearApiCache);window.addEventListener('auth-expired',clearApiCache);}
async function fetchJSON(path,{signal}={}){
 const res=await fetchWithRetry(apiUrl(path),{signal,credentials:'include',headers:{Accept:'application/json','X-Requested-With':'retail-web'}});
 const data=await res.json();
 if(!res.ok){if(res.status===401)window.dispatchEvent(new Event('auth-expired'));if(res.status===423&&data?.code==='ACCOUNT_TEMP_LOCKED')window.dispatchEvent(new CustomEvent('account-temp-locked',{detail:data}));throw new Error(data.message||`Yêu cầu không thành công (${res.status})`);}
 return data;
}
export async function getJSON(path,{signal,userId}={}){
 if(!userId)return fetchJSON(path,{signal});
 const cached=readCache(userId,path);
 if(cached!==null){
  const cacheRecord=(()=>{try{return JSON.parse(sessionStorage.getItem(cacheKey(userId,path))||'null');}catch{return null;}})();
  if(cacheRecord&&Date.now()-cacheRecord.savedAt>CACHE_TTL){fetchJSON(path).then(data=>{writeCache(userId,path,data);window.dispatchEvent(new CustomEvent('api-cache-updated',{detail:{path,userId,data}}));}).catch(()=>{});}
  return cached;
 }
 const data=await fetchJSON(path,{signal});writeCache(userId,path,data);return data;
}
export function warmApi(){fetchJSON('/auth/me').catch(()=>{});}
export const api={dashboard:()=>getJSON('/dashboard/overview'),products:(params='')=>getJSON(`/products${params}`),forecast:()=>getJSON('/forecasts/runs'),replenishment:()=>getJSON('/replenishment')};
export const isMock=(import.meta.env.VITE_DATA_MODE||'mock')==='mock';
