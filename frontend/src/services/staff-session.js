const base=import.meta.env.VITE_API_URL||import.meta.env.VITE_API_BASE_URL||'/api/v1';
export async function staffSessionRequest(path){
 const response=await fetch(base+path,{method:'POST',credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'retail-web'},body:'{}'});
 const data=response.status===204?null:await response.json();
 if(!response.ok){const error=new Error(data?.message||'Không thể chuyển phiên nhân viên');error.status=response.status;throw error;}
 return data;
}
