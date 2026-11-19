import React,{useId,useRef,useState} from 'react';
export function Tabs({items,value,defaultValue,onValueChange,label='Các thẻ nội dung'}){
 const uid=useId(),refs=useRef(new Map()),[local,setLocal]=useState(defaultValue??items.find(i=>!i.disabled)?.id);
 const selected=value??local,active=items.some(i=>i.id===selected&&!i.disabled)?selected:items.find(i=>!i.disabled)?.id;
 const choose=id=>{if(value===undefined)setLocal(id);onValueChange?.(id);};
 const move=(e,item)=>{
  const enabled=items.filter(i=>!i.disabled),at=enabled.findIndex(i=>i.id===item.id);let next;
  if(e.key==='ArrowRight')next=enabled[(at+1)%enabled.length];
  else if(e.key==='ArrowLeft')next=enabled[(at-1+enabled.length)%enabled.length];
  else if(e.key==='Home')next=enabled[0];else if(e.key==='End')next=enabled.at(-1);
  if(next){e.preventDefault();choose(next.id);refs.current.get(next.id)?.focus();}
 };
 return <div className="ri-tabs"><div className="ri-tab-list" role="tablist" aria-label={label}>{items.map((item,i)=><button key={item.id}
  ref={n=>refs.current.set(item.id,n)} id={uid+'-tab-'+i} type="button" role="tab" aria-selected={active===item.id} aria-controls={uid+'-panel-'+i}
  disabled={item.disabled} tabIndex={active===item.id?0:-1} onClick={()=>choose(item.id)} onKeyDown={e=>move(e,item)}>{item.label}</button>)}</div>
  {items.map((item,i)=><div key={item.id} role="tabpanel" tabIndex={0} id={uid+'-panel-'+i} aria-labelledby={uid+'-tab-'+i}
   hidden={active!==item.id} className="ri-tab-panel">{item.content}</div>)}</div>;
}
