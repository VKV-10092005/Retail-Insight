import {useEffect,useState} from 'react';
import {request} from '../operations/shared';
import {APP_SETTINGS_EVENT,readAppSettings,cacheAppSettings,mergeAppSettings} from '../services/appSettings';
export default function useAppSettings(userId,role){
 const [settings,setSettings]=useState(()=>readAppSettings(userId));
 useEffect(()=>{
  if(!userId)return;let live=true;setSettings(readAppSettings(userId));
  const path=role==='PLATFORM_ADMIN'?'/platform/settings':'/settings';
  request(path).then(data=>{if(!live)return;const next=role==='PLATFORM_ADMIN'?mergeAppSettings(readAppSettings(userId),{platform:data,general:data.general}):mergeAppSettings(readAppSettings(userId),data);cacheAppSettings(userId,next,role);setSettings(next);}).catch(()=>{});
  const sync=event=>{if(event.type==='storage'||String(event.detail?.userId)===String(userId))setSettings(readAppSettings(userId));};
  window.addEventListener(APP_SETTINGS_EVENT,sync);window.addEventListener('storage',sync);
  return()=>{live=false;window.removeEventListener(APP_SETTINGS_EVENT,sync);window.removeEventListener('storage',sync);};
 },[userId,role]);
 return settings;
}
