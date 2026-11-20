import {apiUrl} from './apiUrl.js';
import {dispatchAuthExpired} from './api.js';
import {fetchWithRetry} from './fetchWithRetry.js';
export const NOTIFICATIONS_CHANGED_EVENT='ri:notifications-changed';

async function call(path,{method='GET',body}={}){
 const response=await fetchWithRetry(apiUrl(path),{method,credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'retail-web'},...(body?{body:JSON.stringify(body)}:{})});
 const data=response.status===204?null:await response.json();
 if(!response.ok){if(response.status===401)dispatchAuthExpired();const error=new Error(data?.message||'Không tải được thông báo');error.status=response.status;throw error;}
 return data;
}

export const getNotifications=()=>call('/notifications');
export const markNotificationsRead=ids=>call('/notifications/read',{method:'PATCH',body:{ids}});
export const getNotification=id=>call(`/notifications/${encodeURIComponent(id)}`);
export const deleteNotifications=ids=>call('/notifications',{method:'DELETE',body:{ids}});
export const runNotificationDigest=type=>call('/notifications/digests/run',{method:'POST',body:{type}});
