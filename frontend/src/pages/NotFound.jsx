import React from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {getDefaultRoute} from '../config/roles';
import {Button,Badge} from '../design-system';
import {FileQuestion,Home,Search} from 'lucide-react';

export default function NotFound(){
  const {user}=useAuth();
  const homeRoute = user ? getDefaultRoute(user.role) : '/welcome';

  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'70vh',padding:'24px'}}>
      <div className="ri-card" style={{maxWidth:'540px',width:'100%',textAlign:'center',padding:'40px 24px'}}>
        {/* Robot AI SVG in 404 Questioning Pose */}
        <div style={{display:'flex',justifyContent:'center',marginBottom:'20px'}}>
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="60" r="54" fill="var(--ri-elevated)" stroke="var(--ri-border)" strokeWidth="2"/>
            {/* Robot Head tilted slightly */}
            <g transform="rotate(-6 60 50)">
              <rect x="35" y="32" width="50" height="38" rx="12" fill="#0F172A" stroke="var(--ri-primary)" strokeWidth="2"/>
              <rect x="42" y="38" width="36" height="18" rx="6" fill="#030712"/>
              {/* Question mark eye */}
              <circle cx="51" cy="47" r="4" fill="#38BDF8"/>
              <path d="M68 44 C68 42, 72 42, 72 44 C72 46, 70 47, 70 48 M70 51 V51.5" stroke="var(--ri-warning)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="60" y1="22" x2="60" y2="32" stroke="var(--ri-primary)" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="60" cy="20" r="4" fill="#38BDF8"/>
            </g>
            {/* Body */}
            <rect x="38" y="76" width="44" height="28" rx="8" fill="#1E293B" stroke="var(--ri-primary)" strokeWidth="2"/>
            <circle cx="60" cy="90" r="4" fill="var(--ri-muted)"/>
          </svg>
        </div>

        <div style={{marginBottom:'12px'}}>
          <Badge variant="warning">
            <FileQuestion size={13} style={{marginRight:'4px',display:'inline'}}/>
            404 - KHÔNG TÌM THẤY TRANG
          </Badge>
        </div>

        <h1 style={{fontSize:'1.375rem',fontWeight:700,margin:'0 0 10px',color:'var(--ri-text)'}}>
          Đường dẫn không tồn tại
        </h1>

        <p style={{color:'var(--ri-muted)',fontSize:'0.9375rem',lineHeight:'1.6',margin:'0 0 24px'}}>
          Địa chỉ trang bạn vừa truy cập không tồn tại trong hệ thống Retail Insight hoặc đã được di chuyển sang phân hệ khác.
        </p>

        <div style={{display:'flex',justifyContent:'center',gap:'12px',flexWrap:'wrap'}}>
          <Link to={homeRoute}>
            <Button variant="primary">
              <Home size={16}/> Quay về trang làm việc chính
            </Button>
          </Link>
          <Link to="/support">
            <Button variant="secondary">
              Trung tâm hỗ trợ
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
