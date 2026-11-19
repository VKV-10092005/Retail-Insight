export async function compressProductImage(file){
 if(!file||!file.type?.startsWith('image/'))throw new Error('Vui lòng chọn một tệp ảnh hợp lệ.');
 if(file.size>15*1024*1024)throw new Error('Ảnh cần nhỏ hơn 15 MB trước khi tải lên.');
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,400/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('Không thể xử lý ảnh trên trình duyệt này.');
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let output=canvas.toDataURL('image/webp',.82);if(!output.startsWith('data:image/webp'))output=canvas.toDataURL('image/jpeg',.84);
  if(output.length>1200000)throw new Error('Ảnh sau khi nén vẫn quá lớn. Hãy chọn ảnh khác.');
  return output;
 }finally{bitmap.close?.();}
}
