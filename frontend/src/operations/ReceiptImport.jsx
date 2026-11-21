import React,{useRef,useState} from 'react';
import {Download,FileSpreadsheet,Upload,X} from 'lucide-react';
import {Card} from '../components/ui/Elements';
import {Message,request,Table,money} from './shared';

export default function ReceiptImport({branchId,note,onCommitted}){
 const input=useRef(null),current=useRef(''),requestKey=useRef(null);
 const [csv,setCSV]=useState(''),[fileInfo,setFileInfo]=useState(null),[dragging,setDragging]=useState(false),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 function resetFile(){current.current='';requestKey.current=null;setCSV('');setFileInfo(null);setPreview(null);if(input.current)input.current.value='';}
 async function choose(file){
  setError('');setSuccess('');setPreview(null);
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.csv')){resetFile();setError('Luồng nhập kho hỗ trợ tệp .csv.');return;}
  if(file.size>100000){resetFile();setError('Tệp CSV tối đa 100.000 byte.');return;}
  const text=await file.text();current.current=text;setCSV(text);setFileInfo({name:file.name,size:file.size});
 }
 function downloadTemplate(){
  const content='\uFEFFMa_san_pham,Ten_san_pham,Danh_muc,So_luong_nhap,Gia_nhap,Gia_ban,image_url\r\nSP-001,Noi com dien Sharp 1.8L,Do gia dung,20,620000,850000,\r\nSP-002,Am sieu toc Inox 2L,Do gia dung,15,175000,250000,\r\n';
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='mau-nhap-hang.csv';anchor.click();URL.revokeObjectURL(url);
 }
 async function run(mode){
  if(!branchId){setError('Vui lòng chọn chi nhánh trước khi kiểm tra tệp.');return;}
  setBusy(true);setError('');setSuccess('');const source=csv;
  try{
   if(mode==='commit'&&!requestKey.current)requestKey.current=crypto.randomUUID();
   const data=await request('/receipts/import',{method:'POST',body:{mode,branch_id:Number(branchId),...(note?.trim()?{note:note.trim()}:{}),csv:source,...(mode==='commit'?{preview_hash:preview.preview_hash,request_key:requestKey.current}:{})}});
   if(mode==='preview'){if(current.current===source)setPreview(data);}
   else{setSuccess(`Đã tạo phiếu nhập #${data.id} gồm ${data.count} sản phẩm, tổng giá trị ${money(data.total)}.`);resetFile();onCommitted?.(data);}
  }catch(err){setError(err.message||'Không thể xử lý tệp nhập hàng');if(err.details?.preview_hash)setPreview(err.details);}
  finally{setBusy(false);}
 }
 return <Card style={{marginBottom:'24px'}}>
  <div className="feature-heading"><FileSpreadsheet size={22}/><div><h2>Nhập hàng loạt từ CSV</h2><p>Đối chiếu SKU theo cửa hàng, xem trước lỗi từng dòng và chỉ ghi kho khi bạn xác nhận.</p></div></div>
  <div className="file-picker-row">
   <button type="button" className={`upload-zone compact dark:bg-slate-900/80 dark:border-slate-700 hover:dark:border-sky-500 ${dragging?'is-dragging':''}`} disabled={busy} onClick={()=>input.current?.click()} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);choose(event.dataTransfer.files?.[0]);}}><Upload size={25}/><strong className="dark:text-slate-100">Kéo thả CSV vào đây hoặc bấm để chọn</strong><span className="dark:text-slate-400">Mã sản phẩm, tên, danh mục, số lượng, giá nhập và giá bán · tối đa 200 dòng</span></button>
   <button type="button" className="btn btn-secondary template-download" onClick={downloadTemplate} disabled={busy}><Download size={16}/> Tải file mẫu</button>
  </div>
  <input ref={input} className="visually-hidden" aria-label="Chọn tệp CSV nhập hàng" type="file" accept=".csv,text/csv" disabled={busy} onChange={event=>choose(event.target.files?.[0])}/>
  {fileInfo&&<div className="selected-file"><FileSpreadsheet size={19}/><div><strong>{fileInfo.name}</strong><span>{(fileInfo.size/1024).toLocaleString('vi-VN',{maximumFractionDigits:1})} KB</span></div><button type="button" className="icon-button" aria-label="Bỏ tệp đã chọn" onClick={resetFile} disabled={busy}><X size={16}/></button></div>}
  <p className="muted">CSV cần có Mã sản phẩm, Số lượng nhập và Giá nhập. Tên sản phẩm, Danh mục và Giá bán được dùng để tự tạo sản phẩm/danh mục khi chưa có. Cột image_url tùy chọn; để trống nếu không dùng ảnh riêng. Vẫn hỗ trợ mẫu cũ dùng cột sku, quantity, unit_cost.</p>
  <Message error={error} success={success}/>
  <div className="op-actions"><button type="button" className="btn btn-secondary" disabled={!csv||!branchId||busy} onClick={()=>run('preview')}>{busy?'Đang kiểm tra…':'Kiểm tra và xem trước CSV'}</button>{preview&&<button type="button" className="btn btn-primary" disabled={busy||!preview.can_commit} onClick={()=>run('commit')}>Xác nhận nhập kho {preview.row_count} sản phẩm</button>}</div>
  {preview&&<><p role="status">{preview.row_count} dòng · {preview.issues.length} lỗi · {preview.can_commit?'Sẵn sàng tạo phiếu nhập':'Chưa ghi dữ liệu; hãy sửa tệp và kiểm tra lại'}</p>{preview.issues.length>0&&<Table rows={preview.issues} columns={[["row","Dòng CSV"],["sku","SKU"],["message","Lỗi"]]}/>}<Table rows={preview.rows.slice(0,20)} columns={[["row","Dòng CSV"],["sku","SKU"],["product_name","Sản phẩm"],["quantity","Số lượng"],["unit_cost","Đơn giá vốn",row=>money(row.unit_cost)],["note","Ghi chú"]]}/>{preview.rows.length>20&&<p className="muted">Hiển thị 20 dòng đầu; máy chủ đã kiểm tra toàn bộ tệp.</p>}</>}
 </Card>;
}
