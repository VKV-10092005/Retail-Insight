import React,{useEffect,useState} from 'react';
import {CheckCircle2,LockKeyhole,LogOut,Send} from 'lucide-react';
import {authRequest} from '../../services/auth';
import './AccountLockedModal.css';

export default function AccountLockedModal(){
 const [lock,setLock]=useState(null),[note,setNote]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const receive=e=>{setLock(e.detail||{});setSent(Boolean(e.detail?.unlock_requested));};window.addEventListener('account-temp-locked',receive);return()=>window.removeEventListener('account-temp-locked',receive);},[]);
 async function submit(e){e.preventDefault();if(note.trim().length<2)return;setBusy(true);setError('');try{await authRequest('/request-unlock',{method:'POST',body:{note:note.trim()}});setSent(true);}catch(err){setError(err.message||'Không gửi được yêu cầu.');}finally{setBusy(false);}}
 if(!lock)return null;
 return <div className="account-lock-backdrop" role="dialog" aria-modal="true" aria-labelledby="account-lock-title"><section className="account-lock-card"><div className="account-lock-icon"><LockKeyhole size={28}/></div><h2 id="account-lock-title">Tài khoản của bạn đã bị khóa tạm thời</h2><p className="account-lock-reason"><strong>Lý do:</strong> {lock.reason||'Phát hiện sự kiện an ninh cần được xem xét.'}</p>{lock.locked_at&&<p className="account-lock-time">Thời điểm khóa: {new Date(lock.locked_at).toLocaleString('vi-VN')}</p>}{sent?<><div className="account-lock-success"><CheckCircle2 size={16}/> Đã gửi yêu cầu mở khóa tới Quản trị viên nền tảng, vui lòng chờ xét duyệt.</div><button className="account-lock-submit" onClick={()=>{window.dispatchEvent(new Event('auth-expired'));setLock(null);}}><LogOut size={16}/> Đăng xuất</button></>:<form onSubmit={submit}><label htmlFor="unlock-note">Lời nhắn giải trình</label><textarea id="unlock-note" maxLength={500} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Mô tả ngắn tình huống để Admin xem xét" required/><div className="account-lock-error">{error}</div><button className="account-lock-submit" type="submit" disabled={busy||note.trim().length<2}><Send size={16}/>{busy?'Đang gửi...':'Gửi yêu cầu mở khóa'}</button></form>}</section></div>;
}
