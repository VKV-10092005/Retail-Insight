import React,{cloneElement,isValidElement,useEffect,useLayoutEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Button,ErrorState} from './primitives.jsx';
const scrollOwners=new Set(),modalStack=[];let originalOverflow='';
function lockScroll(){
 const token={};if(!scrollOwners.size){originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}scrollOwners.add(token);
 return()=>{scrollOwners.delete(token);if(!scrollOwners.size)document.body.style.overflow=originalOverflow;};
}
function focusables(dialog){
 return [...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
  .filter(el=>!el.disabled&&el.tabIndex>=0&&!el.closest('[hidden],[inert]')&&el.getClientRects().length>0);
}
export function Modal({open,onClose,title,children,footer,initialFocusRef,dismissible=true,className=''}){
 const ref=useRef(null),id=useId();
 useLayoutEffect(()=>{
  if(!open||!ref.current)return;
  const dialog=ref.current,previous=document.activeElement,unlock=lockScroll();
  dialog.showModal();modalStack.push(dialog);initialFocusRef?.current?.focus();
  return()=>{
   const at=modalStack.indexOf(dialog);if(at>=0)modalStack.splice(at,1);
   if(dialog.open)dialog.close();unlock();if(previous?.isConnected)previous.focus?.();
  };
 },[open,initialFocusRef]);
 useLayoutEffect(()=>{if(open&&!dismissible)ref.current?.focus();},[open,dismissible]);
 if(!open)return null;
 return createPortal(<dialog ref={ref} tabIndex={-1} className={'ri-dialog '+className} aria-labelledby={id} aria-modal="true"
  onKeyDown={e=>{
   if(e.key!=='Tab'||e.defaultPrevented||modalStack.at(-1)!==ref.current)return;
   const elements=focusables(ref.current),first=elements[0],last=elements.at(-1),active=document.activeElement;
   if(!first){e.preventDefault();ref.current.focus();return;}
   if(e.shiftKey&&(active===first||active===ref.current)){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&(active===last||active===ref.current)){e.preventDefault();first.focus();}
  }}
  onCancel={e=>{e.preventDefault();if(dismissible)onClose?.('escape');}}
  onClick={e=>{if(!dismissible||e.target!==ref.current)return;const r=ref.current.getBoundingClientRect();
   if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose?.('backdrop');}}>
  <header className="ri-dialog-header"><h2 id={id}>{title}</h2><Button variant="ghost" size="sm" disabled={!dismissible} aria-label="Đóng hộp thoại" onClick={()=>onClose?.('close')}>×</Button></header>
  <div className="ri-dialog-body">{children}</div>{footer&&<footer className="ri-dialog-footer">{footer}</footer>}
 </dialog>,document.body);
}
export function Drawer(props){return <Modal {...props} className={'ri-drawer '+(props.className||'')}/>;}
export function ConfirmationDialog({open,onClose,onConfirm,title='Xác nhận thao tác',description,confirmLabel='Xác nhận',cancelLabel='Hủy',danger=false}){
 const cancel=useRef(null),pending=useRef(false),alive=useRef(true),generation=useRef(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;if(open)setError('');},[open]);
 const confirm=async()=>{
  if(pending.current||typeof onConfirm!=='function')return;
  const current=generation.current;pending.current=true;setBusy(true);setError('');
  try{await onConfirm();if(alive.current&&current===generation.current)onClose?.('confirmed');}
  catch(e){if(alive.current&&current===generation.current)setError(e?.message||'Chưa thể hoàn tất thao tác.');}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 };
 return <Modal open={open} onClose={onClose} title={title} initialFocusRef={cancel} dismissible={!busy}
  footer={<><Button ref={cancel} variant="secondary" disabled={busy} onClick={()=>onClose?.('cancel')}>{cancelLabel}</Button>
   <Button variant={danger?'danger':'primary'} loading={busy} disabled={typeof onConfirm!=='function'} onClick={confirm}>{confirmLabel}</Button></>}>
  <p>{description}</p>{error&&<ErrorState title="Thao tác chưa hoàn tất" message={error}/>}
 </Modal>;
}
export function Tooltip({children,content}){
 const id=useId(),[open,setOpen]=useState(false);
 if(!isValidElement(children))throw Error('Tooltip requires one React element');
 return <span className="ri-tooltip-anchor" tabIndex={children.props.disabled?0:undefined} aria-describedby={children.props.disabled?id:undefined}
  onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)}
  onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}
  onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();setOpen(false);e.stopPropagation();}}}>
  {cloneElement(children,{'aria-describedby':[children.props['aria-describedby'],id].filter(Boolean).join(' ')})}
  <span id={id} role="tooltip" className="ri-tooltip" hidden={!open}>{content}</span>
 </span>;
}
