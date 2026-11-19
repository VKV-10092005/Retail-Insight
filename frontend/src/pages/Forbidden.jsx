import React from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {getDefaultRoute,ROLE_LABELS} from '../config/roles';
import {Button,Badge} from '../design-system';
import {ShieldAlert,ArrowLeft,Home} from 'lucide-react';

export default function Forbidden(){
  const {user}=useAuth();
  const homeRoute = user ? getDefaultRoute(user.role) : '/welcome';

  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'70vh',padding:'24px'}}>
      <div className="ri-card" style={{maxWidth:'540px',width:'100%',textAlign:'center',padding:'40px 24px'}}>
        {/* Robot AI SVG in Warning / Lock Pose */}
        <div style={{display:'flex',justifyContent:'center',marginBottom:'20px'}}>
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="60" r="54" fill="var(--ri-danger-bg)" stroke="var(--ri-danger)" strokeWidth="2"/>
            {/* Robot Head */}
            <rect x="35" y="32" width="50" height="38" rx="12" fill="#0F172A" stroke="var(--ri-danger)" strokeWidth="2"/>
            {/* Visor */}
            <rect x="42" y="38" width="36" height="18" rx="6" fill="#030712"/>
            {/* Warning Eyes (Red/Orange) */}
            <circle cx="51" cy="47" r="4" fill="#F87171"/>
            <circle cx="69" cy="47" r="4" fill="#F87171"/>
            {/* Antenna */}
            <line x1="60" y1="22" x2="60" y2="32" stroke="var(--ri-danger)" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="60" cy="20" r="4" fill="#DC2626"/>
            {/* Shield / Lock on chest */}
            <rect x="38" y="74" width="44" height="30" rx="8" fill="#1E293B" stroke="var(--ri-danger)" strokeWidth="2"/>
            {/* Lock symbol */}
            <rect x="52" y="86" width="16" height="12" rx="2" fill="var(--ri-danger)"/>
            <path d="M55 86 V82 C55 79.5 65 79.5 65 82 V86" stroke="var(--ri-danger)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        <div style={{marginBottom:'12px'}}>
          <Badge variant="danger">
            <ShieldAlert size={13} style={{marginRight:'4px',display:'inline'}}/>
            403 - KHÔNG CÓ QUYỀN TRUY CẬP
          </Badge>
        </div>

        <h1 style={{fontSize:'1.375rem',fontWeight:700,margin:'0 0 10px',color:'var(--ri-text)'}}>
          Giới hạn phạm vi quyền hạn
        </h1>

        <p style={{color:'var(--ri-muted)',fontSize:'0.9375rem',lineHeight:'1.6',margin:'0 0 16px'}}>
          Tài khoản của bạn ({user ? <strong>{ROLE_LABELS[user.role] || user.role}</strong> : 'Khách'}) không được phân quyền truy cập chức năng này.
        </p>

        <p style={{color:'var(--ri-muted)',fontSize:'0.875rem',lineHeight:'1.5',margin:'0 0 24px'}}>
          Nếu đây là nhu cầu công việc của bạn, vui lòng liên hệ Chủ cửa hàng (OWNER) để được mở rộng phân quyền tương ứng.
        </p>

        <div style={{display:'flex',justifyContent:'center',gap:'12px',flexWrap:'wrap'}}>
          <Link to={homeRoute}>
            <Button variant="primary">
              <Home size={16}/> Quay về trang làm việc chính
            </Button>
          </Link>
          <Link to="/support">
            <Button variant="secondary">
              Yêu cầu hỗ trợ
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
