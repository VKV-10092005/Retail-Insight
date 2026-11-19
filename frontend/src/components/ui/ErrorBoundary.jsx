import React from 'react';
import {Button} from '../../design-system';
import {AlertOctagon,RotateCcw,Home} from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[React ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'55vh',padding:'24px'}}>
          <div className="ri-card" style={{maxWidth:'600px',width:'100%',padding:'36px 24px',textAlign:'center'}}>
            <div style={{display:'flex',justifyContent:'center',marginBottom:'16px'}}>
              <AlertOctagon size={48} style={{color:'#EF4444'}}/>
            </div>
            
            <h2 style={{fontSize:'1.25rem',fontWeight:700,marginBottom:'8px',color:'var(--ri-text)'}}>
              Đã xảy ra lỗi khi hiển thị nội dung trang
            </h2>
            
            <p style={{color:'var(--ri-muted, #64748B)',fontSize:'0.875rem',lineHeight:'1.5',marginBottom:'16px'}}>
              Hệ thống ghi nhận sự cố giao diện không mong muốn. Dữ liệu thực tế của bạn trong cơ sở dữ liệu không bị ảnh hưởng.
            </p>

            {this.state.error && (
              <div style={{
                background:'var(--ri-danger-bg, #FEF2F2)',
                border:'1px solid var(--ri-danger, #FCA5A5)',
                borderRadius:'8px',
                padding:'12px',
                textAlign:'left',
                fontSize:'0.8125rem',
                fontFamily:'monospace',
                color:'#B91C1C',
                marginBottom:'20px',
                overflowX:'auto',
                maxHeight:'160px'
              }}>
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div style={{display:'flex',justifyContent:'center',gap:'12px',flexWrap:'wrap'}}>
              <Button variant="primary" onClick={()=>window.location.reload()}>
                <RotateCcw size={16}/> Tải lại trang
              </Button>
              <Button variant="secondary" onClick={()=>{this.handleReset();window.location.href='/';}}>
                <Home size={16}/> Quay về trang chủ
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
