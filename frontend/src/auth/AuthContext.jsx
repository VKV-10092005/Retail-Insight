import React,{createContext,useContext,useEffect,useState} from 'react';
import {authRequest} from '../services/auth';
import {staffSessionRequest} from '../services/staff-session';
import {roles,ROLE_LABELS,ROLES,getDefaultRoute} from '../config/roles';

export {roles,ROLE_LABELS,ROLES,getDefaultRoute};

const Context=createContext(null);

export function AuthProvider({children}){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [impersonating,setImpersonating]=useState(false);
 const [staffEnabled,setStaffEnabled]=useState(false);
 
 async function refresh(){
  try {
   const data=await authRequest('/me');
   setUser(data.user);
   setImpersonating(data.user?.impersonating===true);
   return data.user;
  } catch (err) {
   if (err.status === 401) {
    const storedRefreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
    if (storedRefreshToken) {
     try {
      const refreshRes = await authRequest('/refresh', {
       method: 'POST',
       body: { refreshToken: storedRefreshToken }
      });
      if (refreshRes?.accessToken || refreshRes?.token) {
       localStorage.setItem('token', refreshRes.accessToken || refreshRes.token);
       localStorage.setItem('accessToken', refreshRes.accessToken || refreshRes.token);
       if (refreshRes.refreshToken) localStorage.setItem('refreshToken', refreshRes.refreshToken);
       const retryMe = await authRequest('/me');
       setUser(retryMe.user);
       setImpersonating(retryMe.user?.impersonating === true);
       return retryMe.user;
      }
     } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
     }
    }
   }
   throw err;
  }
 }

 function updateUser(patch){setUser(current=>current?{...current,...patch}:current);}

 async function impersonateStaff(id){
  const data=await staffSessionRequest(`/staff/${encodeURIComponent(id)}/impersonate`);
  setUser(data.user);setImpersonating(true);setError('');return data.user;
 }
 async function returnToOwner(){
  const data=await staffSessionRequest('/staff/impersonate/return');
  setUser(data.user);setImpersonating(false);setError('');return data.user;
 }
 
 useEffect(()=>{
  refresh()
   .catch(e=>{if(e.status!==401)setError(e.message);})
   .finally(()=>setLoading(false));
 },[]);
 
 useEffect(()=>{
  const expired=()=>{
   const isPublic = typeof window !== 'undefined' && ['/login', '/register', '/welcome', '/forgot-password'].some(p => window.location.pathname.startsWith(p));
   const hasToken = typeof window !== 'undefined' && Boolean(localStorage.getItem('token') || localStorage.getItem('accessToken'));
   if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
   }
   setUser(null);
   setImpersonating(false);
   if (!isPublic && hasToken) {
    setError('Phiên đăng nhập đã hết hạn.');
   }
  };
  window.addEventListener('auth-expired',expired);
  return()=>window.removeEventListener('auth-expired',expired);
 },[]);
 
 async function login(data){
  setError('');
  const res = await authRequest('/login',{method:'POST',body:data});
  if (res?.accessToken || res?.token) {
   localStorage.setItem('token', res.accessToken || res.token);
   localStorage.setItem('accessToken', res.accessToken || res.token);
  }
  if (res?.refreshToken) {
   localStorage.setItem('refreshToken', res.refreshToken);
  }
  const u=await refresh();
  return u;
 }
 
 async function logout(){
  try{
   await authRequest('/logout',{method:'POST'});
  }catch(e){
   if(e.status===401){setUser(null);setImpersonating(false);}
   else setError(e.message);
  }finally{
   if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
   }
   setUser(null);
   setImpersonating(false);
   setError('');
  }
 }
 
 const unavailable=()=>{
  setError('Chức năng này không còn sử dụng mô phỏng. Sử dụng trang Quản lý nhân viên để quản lý nhân sự thực tế.');
  return false;
 };
 
 return <Context.Provider value={{
  user,
  impersonating,
  impersonateStaff,
  returnToOwner,
  loading,
  error,
  clearError: () => setError(''),
  login,
  logout,
  refresh,
  updateUser,
  register: async data => {
   const res = await authRequest('/register', { method: 'POST', body: data });
   if (res?.accessToken || res?.token) {
    localStorage.setItem('token', res.accessToken || res.token);
    localStorage.setItem('accessToken', res.accessToken || res.token);
   }
   if (res?.refreshToken) {
    localStorage.setItem('refreshToken', res.refreshToken);
   }
   return res;
  },
  users:user?[user]:[],
  requests:[],
  roles,
  staffEnabled,
  setStaffEnabled,
  approve:unavailable,
  reject:unavailable,
  setRole:unavailable,
  setStatus:unavailable,
  addStaff:unavailable
 }}>{children}</Context.Provider>;
}

export const useAuth=()=>{
 const c=useContext(Context);
 if(!c)throw Error('AuthProvider missing');
 return c;
};
