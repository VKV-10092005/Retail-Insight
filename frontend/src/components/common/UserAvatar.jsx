import React from 'react';
import {Headphones} from 'lucide-react';

export default function UserAvatar({avatarUrl,name='',size=40,isSupportChannel=false,className='',style={}}){
  const dimension=typeof size==='number'?`${size}px`:size;
  const imageUrl=typeof avatarUrl==='string'?avatarUrl.trim():'';
  return <span className={`user-avatar ${className}`.trim()} role="img" aria-label={name?`Ảnh đại diện ${name}`:'Ảnh đại diện'} style={{width:dimension,height:dimension,flex:`0 0 ${dimension}`,display:'inline-grid',placeItems:'center',overflow:'hidden',borderRadius:'50%',background:'#CBD5E1',color:'#64748B',...style}}>
    {imageUrl?<img src={imageUrl} alt="" style={{display:'block',width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>:isSupportChannel?<Headphones size={Number.parseInt(dimension,10)*0.52||20} strokeWidth={2.2}/>:<svg viewBox="0 0 48 48" width="72%" height="72%" aria-hidden="true" focusable="false"><circle cx="24" cy="16" r="9" fill="#64748B"/><path d="M7 42c.7-9.1 7.9-15 17-15s16.3 5.9 17 15c.1 1.2-.8 2-2 2H9c-1.2 0-2.1-.8-2-2Z" fill="#64748B"/></svg>}
  </span>;
}
