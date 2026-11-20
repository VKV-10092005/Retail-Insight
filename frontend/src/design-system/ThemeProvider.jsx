import React,{createContext,useContext,useState,useEffect,useCallback,useId} from 'react';
import {THEME_KEY,normalizeTheme,resolveTheme,applyTheme} from './theme.js';
import {cacheAppSettings,currentSettings} from '../services/appSettings.js';
import {apiUrl} from '../services/apiUrl.js';
import {Sun,Moon} from 'lucide-react';

const Context=createContext(null);

function systemDark(){
  try{return window.matchMedia('(prefers-color-scheme: dark)').matches;}catch{return false;}
}

export function ThemeProvider({children}){
 const [preference,setPreference]=useState(()=>normalizeTheme(document.documentElement.dataset.themePreference || 'light'));
 const [dark,setDark]=useState(systemDark);
 const [storageError,setStorageError]=useState(()=>document.documentElement.dataset.themeStorage==='blocked');

 useEffect(()=>{
  let m;
  const change=e=>setDark(e.matches);
  try{
    m=window.matchMedia('(prefers-color-scheme: dark)');
    setDark(m.matches);
    if(m.addEventListener)m.addEventListener('change',change);
    else m.addListener(change);
  }catch{}
  return ()=>{
    if(m?.removeEventListener)m.removeEventListener('change',change);
    else m?.removeListener?.(change);
  };
 },[]);

 useEffect(()=>{
  const sync=e=>{
    if(e.key===THEME_KEY||e.key===null)setPreference(normalizeTheme(e.newValue));
  };
  window.addEventListener('storage',sync);
  return()=>window.removeEventListener('storage',sync);
 },[]);

 useEffect(()=>{
  applyTheme(preference,dark);
 },[preference,dark]);

 const setTheme=useCallback((v,{persist=false}={})=>{
  const next=normalizeTheme(v);
  applyTheme(next,systemDark());
  setPreference(next);
  try{
    localStorage.setItem(THEME_KEY,next);
    const userId=localStorage.getItem('ri_current_user_id')||'user',settings=currentSettings();cacheAppSettings(userId,{...settings,general:{...settings.general,theme:next}},localStorage.getItem('ri_current_user_role'));
    if(persist&&userId!=='user'){
      const platform=localStorage.getItem('ri_current_user_role')==='PLATFORM_ADMIN';
      fetch(apiUrl(platform?'/platform/settings':'/settings'),{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json','X-Requested-With':'retail-web'},body:JSON.stringify(platform?{general:{...settings.general,theme:next}}:{general:{...settings.general,theme:next}})}).catch(()=>{});
    }
    setStorageError(false);
  }catch{
    setStorageError(true);
  }
 },[]);

 return (
  <Context.Provider value={{preference,resolved:resolveTheme(preference,dark),setTheme,storageError}}>
    {children}
  </Context.Provider>
 );
}

export function useTheme(){
  const c=useContext(Context);
  if(!c)throw Error('ThemeProvider required');
  return c;
}

/**
 * Nút chuyển đổi giao diện Sáng / Tối tinh gọn (Icon Sun / Moon duy nhất)
 */
export function ThemeToggle({className=''}){
  const {resolved,setTheme}=useTheme();
  const isDark = resolved === 'dark';
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      onClick={()=>setTheme(isDark ? 'light' : 'dark',{persist:true})}
      title={isDark ? 'Chuyển sang giao diện Sáng (Light)' : 'Chuyển sang giao diện Tối (Dark)'}
      aria-label={isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
      style={{display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}
    >
      {isDark ? <Sun size={19} style={{color:'#F59E0B'}}/> : <Moon size={19} style={{color:'#0F766E'}}/>}
    </button>
  );
}

export function ThemeSelect({compact=false}){
  const {preference,setTheme,storageError}=useTheme(),id=useId();
  return (
    <div className={'ri-theme-control'+(compact?' ri-theme-compact':'')}>
      <label htmlFor={id} className={compact?'ri-sr-only':''}>Giao diện</label>
      <select id={id} className="ri-control" value={preference} onChange={e=>setTheme(e.target.value)} aria-describedby={storageError?id+'-note':undefined}>
        <option value="light">Sáng</option>
        <option value="dark">Tối</option>
        <option value="system">Hệ thống</option>
      </select>
      {storageError&&<span id={id+'-note'} role="status" className="ri-theme-warning">Không lưu được lựa chọn; chỉ áp dụng trong phiên này.</span>}
    </div>
  );
}


