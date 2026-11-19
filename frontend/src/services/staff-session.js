import {apiUrl} from './apiUrl.js';
export async function staffSessionRequest(path){
 const response=await fetch(apiUrl(path),{method:'POST',credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'retail-web'},body:'{}'});
 const data=response.status===204?null:await response.json();
 if(!response.ok){const error=new Error(data?.message||'Không thể chuyển phiên nhân viên');error.status=response.status;throw error;}
 return data;
}
