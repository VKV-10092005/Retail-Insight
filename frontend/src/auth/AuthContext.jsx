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
  const data=await authRequest('/me');
  setUser(data.user);
  setImpersonating(data.user?.impersonating===true);
  return data.user;
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
  const expired=()=>{setUser(null);setImpersonating(false);setError('Phiên đăng nhập đã hết hạn.');};
  window.addEventListener('auth-expired',expired);
  return()=>window.removeEventListener('auth-expired',expired);
 },[]);
 
 async function login(data){
  setError('');
  await authRequest('/login',{method:'POST',body:data});
  const u=await refresh();
  return u;
 }
 
 async function logout(){
  try{
   await authRequest('/logout',{method:'POST'});
   setUser(null);
   setImpersonating(false);
   setError('');
  }catch(e){
   if(e.status===401){setUser(null);setImpersonating(false);}
   else setError(e.message);
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
  login,
  logout,
  refresh,
  updateUser,
  register:data=>authRequest('/register',{method:'POST',body:data}),
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
