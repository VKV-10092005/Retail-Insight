import React,{useRef,useState} from 'react';
import {Download,FileSpreadsheet,Upload,X} from 'lucide-react';
import {Card} from '../components/ui/Elements';
import {request,Message,Table} from './shared';

export default function ProductImport({onImported,branchId,canImport=true}){
 const [csv,setCSV]=useState(''),[fileInfo,setFileInfo]=useState(null),[dragging,setDragging]=useState(false),[preview,setPreview]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false);
 const current=useRef(''),input=useRef(null);
 function change(text){current.current=text;setCSV(text);setPreview(null);setError('');setSuccess('');}
 async function fileChange(file){
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.csv')){change('');setFileInfo(null);setError('Vui lòng chọn đúng tệp CSV.');return;}
  if(file.size>60000){change('');setFileInfo(null);setError('Tệp CSV tối đa 60.000 byte');return;}
  setFileInfo({name:file.name,size:file.size});change(await file.text());
 }
 function clearFile(){change('');setFileInfo(null);if(input.current)input.current.value='';}
 async function run(mode){setBusy(true);setError('');setSuccess('');const text=csv;try{const data=await request('/products/import',{method:'POST',body:{mode,csv:text,...(branchId?{branch_id:branchId}:{}),...(mode==='commit'?{preview_hash:preview.preview_hash}:{})}});if(mode==='preview'){if(current.current===text)setPreview(data);}else{clearFile();setSuccess(`Đã nhập ${data.count} sản phẩm vào chi nhánh. Tồn kho không thay đổi.`);onImported?.();}}catch(e){setError(e.message);if(e.details?.preview_hash)setPreview(e.details);}finally{setBusy(false);}}
 function template(){const csv=['Ma_SKU,Ten_san_pham,Gia_ban,Gia_von,Ten_danh_muc,Trang_thai','SP-001,Nồi cơm điện Sharp 1.8L,850000,620000,Đồ gia dụng,Dang_ban','SP-002,Ấm siêu tốc Inox 2L,250000,175000,Đồ gia dụng,Dang_ban'].join('\r\n');const url=URL.createObjectURL(new Blob(['﻿',csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='mau-nhap-san-pham.csv';a.click();URL.revokeObjectURL(url);}
 return <Card>
  <div className="feature-heading"><FileSpreadsheet size={22}/><div><h2>Nhập sản phẩm từ CSV</h2><p>Xem trước và kiểm tra toàn bộ dữ liệu trước khi xác nhận ghi.</p></div></div>
  <div className="file-picker-row">
   <button className={`upload-zone compact dark:bg-slate-900/80 dark:border-slate-700 hover:dark:border-sky-500 ${dragging?'is-dragging':''}`} type="button" disabled={busy} onClick={()=>input.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);fileChange(e.dataTransfer.files?.[0]);}}><Upload size={25}/><strong className="dark:text-slate-100">Kéo thả CSV vào đây hoặc bấm để chọn</strong><span className="dark:text-slate-400">Tối đa 200 sản phẩm · 60.000 byte</span></button>
   <button className="btn btn-secondary template-download" type="button" onClick={template} disabled={busy}><Download size={16}/> Tải mẫu CSV</button>
  </div>
  <input ref={input} className="visually-hidden" aria-label="Chọn tệp CSV sản phẩm" type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>fileChange(e.target.files?.[0])}/>
  {fileInfo&&<div className="selected-file"><FileSpreadsheet size={19}/><div><strong>{fileInfo.name}</strong><span>{(fileInfo.size/1024).toLocaleString('vi-VN',{maximumFractionDigits:1})} KB</span></div><button type="button" className="icon-button" aria-label="Bỏ tệp đã chọn" onClick={clearFile} disabled={busy}><X size={16}/></button></div>}
  <p className="muted">Cần 3 cột bắt buộc: Ma_SKU, Ten_san_pham, Gia_ban. Có thể thêm các cột tùy chọn Gia_von, Ten_danh_muc, Trang_thai. Nếu Ten_danh_muc chưa có, hệ thống sẽ tự tạo danh mục khi xác nhận nhập. Có thể dùng tên cột tiếng Việt hoặc tiếng Anh cũ; SKU đã tồn tại sẽ được báo lỗi, import không làm thay đổi tồn kho.</p>
  <Message error={error} success={success}/><div className="op-actions"><button className="btn btn-secondary" disabled={!csv||busy||!canImport} onClick={()=>run('preview')}>{busy?'Đang xử lý…':'Kiểm tra và xem trước CSV'}</button>{preview&&<button className="btn btn-primary" disabled={busy||!preview.can_commit||!canImport} onClick={()=>run('commit')}>Xác nhận nhập {preview.row_count} sản phẩm</button>}</div>
  {preview&&<><p role="status">{preview.row_count} bản ghi · {preview.issues.length} lỗi · {preview.can_commit?'Có thể xác nhận ghi':'Chưa ghi dữ liệu, cần sửa tệp và xem trước lại'}</p>{preview.issues.length>0&&<Table rows={preview.issues} columns={[["row","Bản ghi CSV"],["sku","SKU"],["message","Lỗi"]]}/>}<Table rows={preview.rows.slice(0,20)} columns={[["row","Bản ghi CSV"],["sku","SKU"],["name","Sản phẩm"],["sale_price","Giá bán"],["cost_price","Giá vốn tham khảo"],["category_name","Danh mục",r=>r.category_name||r.category_id||"—"],["status","Trạng thái"]]}/>{preview.rows.length>20&&<p className="muted">Hiển thị 20 bản ghi đầu. Máy chủ đã kiểm tra toàn bộ tệp.</p>}</>}
 </Card>;
}
