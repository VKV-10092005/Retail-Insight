import React,{useRef,useState} from 'react';
import {Upload,Trash2} from 'lucide-react';
import {compressProductImage} from '../../utils/product-image';
import './image-upload-field.css';

const copy={
 title:'T\u1ea3i \u1ea3nh s\u1ea3n ph\u1ea9m l\u00ean',
 description:'H\u1ed7 tr\u1ee3 JPG, PNG, WebP \u00b7 T\u1ef1 \u0111\u1ed9ng n\u00e9n t\u1ed1i \u0111a 400 \u00d7 400 px',
 change:'\u0110\u1ed5i \u1ea3nh',
 remove:'X\u00f3a \u1ea3nh',
 choose:'Ch\u1ecdn \u1ea3nh s\u1ea3n ph\u1ea9m',
 preview:'Xem tr\u01b0\u1edbc \u1ea3nh s\u1ea3n ph\u1ea9m'
};

export default function ImageUploadField({imageUrl='',onChange,onError,compact=false}){
 const inputRef=useRef(null),[busy,setBusy]=useState(false);
 const selectImage=async event=>{
  const file=event.target.files?.[0];
  if(!file)return;
  setBusy(true);
  try{onChange?.(await compressProductImage(file));}
  catch(error){onError?.(error.message||'Kh\u00f4ng th\u1ec3 x\u1eed l\u00fd \u1ea3nh.');}
  finally{setBusy(false);event.target.value='';}
 };
 const openPicker=()=>inputRef.current?.click();
 return <div className={`image-upload-field ${compact?'is-compact':''}`}>
  <input ref={inputRef} className="image-upload-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label={copy.choose} onChange={selectImage}/>
  {imageUrl?<>
   <img className="image-upload-preview" src={imageUrl} alt={copy.preview}/>
   <div className="image-upload-actions">
    <button type="button" className="image-upload-change" onClick={openPicker} disabled={busy}><Upload size={15}/>{busy?'\u0110ang x\u1eed l\u00fd...':copy.change}</button>
    <button type="button" className="image-upload-remove" onClick={()=>onChange?.('')}><Trash2 size={14}/>{copy.remove}</button>
   </div>
  </>:<button type="button" className="image-upload-trigger" onClick={openPicker} disabled={busy}>
   <span className="image-upload-icon"><Upload size={19}/></span>
   <span className="image-upload-copy"><strong>{busy?'\u0110ang n\u00e9n \u1ea3nh...':copy.title}</strong><small>{copy.description}</small></span>
  </button>}
 </div>;
}
