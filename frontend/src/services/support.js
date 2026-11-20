import {apiUrl} from './apiUrl.js';
import {dispatchAuthExpired} from './api.js';
import {fetchWithRetry} from './fetchWithRetry.js';

async function call(path,{method='GET',body}={}){
 const response=await fetchWithRetry(apiUrl(path),{method,credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'retail-web'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const data=response.status===204?null:await response.json();
 if(!response.ok){if(response.status===401)dispatchAuthExpired();const error=new Error(data?.message||'Không thể kết nối kênh hỗ trợ');error.status=response.status;throw error;}
 return data;
}

export const getSupportThreads=()=>call('/support/threads');
export const deleteSupportThread=id=>call(`/support/threads/${encodeURIComponent(id)}`,{method:'DELETE'});
export const getSupportDirectory=()=>call('/support/directory');
export const createSupportThread=recipient_user_id=>call('/support/threads',{method:'POST',body:{recipient_user_id}});
export const setSupportCategory=(id,category)=>call(`/support/threads/${encodeURIComponent(id)}/category`,{method:'PATCH',body:{category}});
export const getSupportMessages=id=>call(`/support/threads/${encodeURIComponent(id)}/messages`);
export const sendSupportMessage=(id,content)=>call(`/support/threads/${encodeURIComponent(id)}/messages`,{method:'POST',body:{content}});
export const sendSupportTyping=(id,isTyping=true)=>call(`/support/threads/${encodeURIComponent(id)}/typing`,{method:'POST',body:{is_typing:isTyping}});
export const recallSupportMessage=id=>call(`/support/messages/${encodeURIComponent(id)}/recall`,{method:'POST',body:{}});
