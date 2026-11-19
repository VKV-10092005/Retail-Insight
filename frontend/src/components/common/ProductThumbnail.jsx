import React,{useState} from 'react';
import './ProductThumbnail.css';
export function productVisual(product={}){
 const text=`${product.category_name||''} ${product.name||''}`.toLocaleLowerCase('vi');
 if(/bút|sổ|văn phòng|giấy|thước/.test(text))return {icon:'✏️',kind:'stationery'};
 if(/balo|túi|ví|vali/.test(text))return {icon:'🎒',kind:'bags'};
 if(/áo|dép|giày|thời trang|quần/.test(text))return {icon:'👕',kind:'fashion'};
 if(/nước|uống|bánh|kẹo|trà|cà phê/.test(text))return {icon:'🥤',kind:'food'};
 if(/gia dụng|nồi|chảo|ly|cốc|đèn/.test(text))return {icon:'🏠',kind:'home'};
 return {icon:'📦',kind:'default'};
}
export default function ProductThumbnail({product,size=40,className=''}){
 const [failed,setFailed]=useState(false);const visual=productVisual(product);
 return <span className={`product-thumbnail product-thumbnail-${visual.kind} ${className}`} style={{width:size,height:size,flex:`0 0 ${size}px`}}>{product.image_url&&!failed?<img src={product.image_url} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{visual.icon}</span>}</span>;
}
