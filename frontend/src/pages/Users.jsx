import React,{useState} from 'react';
import {UsersRound,UserRoundPlus,UserCheck,Search} from 'lucide-react';
import {useAuth} from '../auth/AuthContext';
import {ROLE_LABELS,ROLES} from '../config/roles';
import {Card,PageHeader,Badge} from '../components/ui/Elements';

export default function Users(){
  const {users,requests,user,staffEnabled,setRole,setStatus,approve,reject,addStaff}=useAuth();
  const [query,setQuery]=useState('');
  const [newUser,setNewUser]=useState({name:'',email:'',branch:'1100',role:ROLES.CASHIER});
  const [message,setMessage]=useState('');

  const allowed=users.filter(u=>u.tenantId===user?.tenantId&&u.role!==ROLES.OWNER);
  const filtered=allowed.filter(u=>`${u.name} ${u.email} ${u.branch}`.toLowerCase().includes(query.toLowerCase()));

  const create=e=>{
    e.preventDefault();
    setMessage(addStaff(newUser.name,newUser.email,newUser.role,newUser.branch)?'Đã tạo nhân viên.':'Không thể tạo: kiểm tra email hoặc quyền.');
  };

  return (
    <>
      <PageHeader
        eyebrow="NHÂN SỰ CỬA HÀNG"
        title="Quản lý nhân viên"
        description="Chủ cửa hàng quản lý tài khoản nhân viên và quyền trong phạm vi cửa hàng của mình."
      />

      <Card>
        <h2>Phân quyền nhân viên qua API</h2>
        <p className="muted">
          Để quản lý nhân viên thực tế trên cơ sở dữ liệu MySQL retail_app, vui lòng sử dụng màn hình <strong>Nhân sự & Phân quyền</strong> trên thanh điều hướng chính.
        </p>
      </Card>
    </>
  );
}
