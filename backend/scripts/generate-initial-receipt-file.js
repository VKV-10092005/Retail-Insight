import 'dotenv/config';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pool,verifyDatabase} from '../src/db/pool.js';

const ORGANIZATION_ID=45;
const BRANCH_ID=48;
const OWNER_EMAIL='vovuong535@gmail.com';
const OUTPUT_NAME='mau-nhap-hang-120-san-pham.csv';

function csvCell(value){
 const text=String(value??'');
 return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}

async function operationalState(){
 const [[documents]]=await pool.execute("SELECT SUM(type='RECEIPT') receipt_count,SUM(type='SALE') sale_count,COUNT(*) document_count FROM stock_documents WHERE organization_id=?",[ORGANIZATION_ID]);
 const [[movements]]=await pool.execute('SELECT COUNT(*) movement_count FROM inventory_movements WHERE organization_id=?',[ORGANIZATION_ID]);
 const [[inventory]]=await pool.execute('SELECT COALESCE(SUM(quantity),0) total_inventory FROM inventory_balances WHERE organization_id=?',[ORGANIZATION_ID]);
 return {document_count:Number(documents.document_count),receipt_count:Number(documents.receipt_count||0),sale_count:Number(documents.sale_count||0),movement_count:Number(movements.movement_count),total_inventory:Number(inventory.total_inventory)};
}

async function main(){
 await verifyDatabase();
 const [[owner]]=await pool.execute("SELECT id FROM users WHERE organization_id=? AND email=? AND role='OWNER' LIMIT 1",[ORGANIZATION_ID,OWNER_EMAIL]);
 if(!owner)throw new Error(`Không tìm thấy OWNER ${OWNER_EMAIL} trong organization_id=${ORGANIZATION_ID}`);
 const [[branch]]=await pool.execute("SELECT id FROM branches WHERE organization_id=? AND id=? AND status='ACTIVE' LIMIT 1",[ORGANIZATION_ID,BRANCH_ID]);
 if(!branch)throw new Error(`Không tìm thấy chi nhánh ACTIVE branch_id=${BRANCH_ID}`);
 const stateBefore=await operationalState();
 // if(stateBefore.receipt_count!==0||stateBefore.sale_count!==0||stateBefore.total_inventory!==0)throw new Error(`Trạng thái vận hành không đúng yêu cầu 2/4: ${JSON.stringify(stateBefore)}`);
 if(stateBefore.receipt_count!==0||stateBefore.sale_count!==0||stateBefore.total_inventory!==0)throw new Error(`Trạng thái vận hành không đúng yêu cầu 2/4: ${JSON.stringify(stateBefore)}`);
 // 
 const [products]=await pool.execute(`SELECT id,sku,name,cost_price,COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(attributes,'$.min_stock')) AS UNSIGNED),0) min_stock FROM products WHERE organization_id=? AND status='ACTIVE' ORDER BY id LIMIT 120`,[ORGANIZATION_ID]);
 if(products.length!==120)throw new Error(`Cần đúng 120 sản phẩm ACTIVE, hiện truy vấn được ${products.length}`);
 const rows=products.map((product,index)=>{
  if(product.cost_price===null)throw new Error(`SKU ${product.sku} chưa có giá vốn`);
  const minStock=Number(product.min_stock)||0;
  const proposed=Math.max(20,20+(index%31),minStock+1);
  if(proposed>50)throw new Error(`SKU ${product.sku} có min_stock=${minStock}; không thể đề xuất trong khoảng 20–50 và vẫn lớn hơn min_stock`);
  return {sku:product.sku,quantity:proposed,unit_cost:Number(product.cost_price).toFixed(2),note:'Nhập kho ban đầu'};
 });
 const csv='\uFEFF'+[['sku','quantity','unit_cost','note'],...rows.map(row=>[row.sku,row.quantity,row.unit_cost,row.note])].map(columns=>columns.map(csvCell).join(',')).join('\r\n')+'\r\n';
 const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const outputPath=path.join(projectRoot,OUTPUT_NAME);
 await writeFile(outputPath,csv,'utf8');
 const stateAfter=await operationalState();
 if(JSON.stringify(stateAfter)!==JSON.stringify(stateBefore))throw new Error('Trạng thái database đã thay đổi ngoài dự kiến trong lúc xuất file');
 console.log(`Đã tạo ${rows.length} dòng sản phẩm thật.`);
 console.log(`File: ${outputPath}`);
 console.log(`Database giữ nguyên: ${JSON.stringify(stateAfter)}`);
}

main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
