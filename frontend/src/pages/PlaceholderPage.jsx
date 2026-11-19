import React from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {getDefaultRoute} from '../config/roles';
import {Badge,Button} from '../design-system';
import {ArrowLeft,Sparkles} from 'lucide-react';

export default function PlaceholderPage({
  title = 'Tính năng đang được chuẩn bị',
  description = 'Phần mềm đang hoàn thiện phân hệ này theo lộ trình kỹ thuật chi tiết.',
  badge = 'Giai đoạn phát triển tiếp theo'
}){
  const {user}=useAuth();
  const homeRoute = user ? getDefaultRoute(user.role) : '/welcome';

  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'65vh',padding:'24px'}}>
      <div className="ri-card" style={{maxWidth:'580px',width:'100%',textAlign:'center',padding:'40px 24px'}}>
        {/* Robot AI SVG in neutral thinking pose */}
        <div style={{display:'flex',justifyContent:'center',marginBottom:'20px'}}>
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="60" r="54" fill="var(--ri-elevated)" stroke="var(--ri-border)" strokeWidth="2"/>
            {/* Robot Head */}
            <rect x="35" y="32" width="50" height="38" rx="12" fill="#0F172A" stroke="var(--ri-primary)" strokeWidth="2"/>
            {/* Visor */}
            <rect x="42" y="38" width="36" height="18" rx="6" fill="#030712"/>
            {/* Blinking eyes */}
            <circle cx="51" cy="47" r="4" fill="#38BDF8"/>
            <circle cx="69" cy="47" r="4" fill="#38BDF8"/>
            {/* Antenna */}
            <line x1="60" y1="22" x2="60" y2="32" stroke="var(--ri-primary)" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="60" cy="20" r="4" fill="var(--ri-warning)"/>
            {/* Body */}
            <rect x="38" y="74" width="44" height="30" rx="8" fill="#1E293B" stroke="var(--ri-primary)" strokeWidth="2"/>
            {/* Gear / Sparkle */}
            <circle cx="60" cy="89" r="6" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="2 2"/>
          </svg>
        </div>

        <div style={{marginBottom:'12px'}}>
          <Badge variant="warning">
            <Sparkles size={12} style={{marginRight:'4px',display:'inline'}}/>
            {badge}
          </Badge>
        </div>

        <h1 style={{fontSize:'1.375rem',fontWeight:700,margin:'0 0 10px',color:'var(--ri-text)'}}>
          {title}
        </h1>

        <p style={{color:'var(--ri-muted)',fontSize:'0.9375rem',lineHeight:'1.6',margin:'0 0 24px'}}>
          {description}
        </p>

        <div style={{display:'flex',justifyContent:'center',gap:'12px',flexWrap:'wrap'}}>
          <Link to={homeRoute}>
            <Button variant="primary">
              <ArrowLeft size={16}/> Quay về trang làm việc chính
            </Button>
          </Link>
          <Link to="/support">
            <Button variant="secondary">
              Liên hệ hỗ trợ
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
