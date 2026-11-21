import React from 'react';
import {Navigate,Outlet,useLocation} from 'react-router-dom';
import {useAuth} from './AuthContext';
import {isAdminPath,isRouteAllowed,getDefaultRoute,ROLES} from '../config/roles';

export default function ProtectedRoute({allow, children}){
  const {user,loading,error}=useAuth();
  const location=useLocation();

  if(loading){
    return (
      <div className="op-state" role="status" style={{padding:'40px',textAlign:'center'}}>
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if(!user){
    if(isAdminPath(location.pathname))return <Navigate to="/login" replace/>;
    // Nếu truy cập root "/" hoặc "/welcome" khi chưa đăng nhập -> chuyển về /welcome
    if(location.pathname==='/'||location.pathname==='/welcome'){
      return <Navigate to="/welcome" replace/>;
    }
    // Deep link nội bộ -> chuyển về /login kèm redirect param
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname+location.search)}`} replace/>;
  }

  // Kiểm tra danh sách allow cụ thể nếu có truyền prop
  if(allow && !allow.includes(user.role)){
    if(isAdminPath(location.pathname))return <Navigate to="/404" replace/>;
    return <Navigate to="/forbidden" replace/>;
  }

  // Kiểm tra cấu hình route cho Role hiện tại
  if(!isRouteAllowed(user.role, location.pathname)){
    // PLATFORM_ADMIN bị chặn khỏi shop routes → redirect về control panel.
    if(user.role===ROLES.PLATFORM_ADMIN){
      return <Navigate to={getDefaultRoute(user.role)} replace/>;
    }
    return <Navigate to="/forbidden" replace/>;
  }

  // Render children nếu được bọc trực tiếp, hoặc Outlet nếu là Layout Route
  return (
    <>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {children ? children : <Outlet/>}
    </>
  );
}
