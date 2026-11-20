import {fetchWithRetry} from './fetchWithRetry.js';
import {apiUrl} from './apiUrl.js';

export async function staffSessionRequest(path){
  const response=await fetchWithRetry(apiUrl(path),{
    method:'POST',
    credentials:'include',
    headers:{
      Accept:'application/json',
      'Content-Type':'application/json',
      'X-Requested-With':'retail-web'
    },
    body:'{}'
  });
  const data=response.status===204?null:await response.json();
  if(!response.ok){
    const error=new Error(data?.message||'Không thể chuyển phiên nhân viên');
    error.status=response.status;
    throw error;
  }
  if(data?.token||data?.accessToken){
    localStorage.setItem('token',data.token||data.accessToken);
    localStorage.setItem('accessToken',data.token||data.accessToken);
  }
  return data;
}
