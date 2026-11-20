import React,{useState} from 'react';
import {Backpack,CupSoda,House,Package,Pencil,Shirt} from 'lucide-react';
import './ProductThumbnail.css';
export function productVisual(product={}){
 const text=`${product.category_name||''} ${product.name||''}`.toLocaleLowerCase('vi');
 if(/bút|sổ|văn phòng|giấy|thước/.test(text))return {Icon:Pencil,kind:'stationery'};
 if(/balo|túi|ví|vali/.test(text))return {Icon:Backpack,kind:'bags'};
 if(/áo|dép|giày|thời trang|quần/.test(text))return {Icon:Shirt,kind:'fashion'};
 if(/nước|uống|bánh|kẹo|trà|cà phê/.test(text))return {Icon:CupSoda,kind:'food'};
 if(/gia dụng|nồi|chảo|ly|cốc|đèn/.test(text))return {Icon:House,kind:'home'};
 return {Icon:Package,kind:'default'};
}
export default function ProductThumbnail({product,size=40,className=''}){
 const [failed,setFailed]=useState(false);const visual=productVisual(product);
 const Icon=visual.Icon;
 return <span className={`product-thumbnail product-thumbnail-${visual.kind} ${className}`} style={{width:size,height:size,flex:`0 0 ${size}px`}}>{product.image_url&&!failed?<img src={product.image_url} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<Icon size={Math.round(size*.48)} strokeWidth={1.8} aria-hidden="true"/>}</span>;
}
