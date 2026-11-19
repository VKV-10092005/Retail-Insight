import 'dotenv/config';
import {createHash} from 'node:crypto';
import {pool,verifyDatabase} from '../src/db/pool.js';

const OWNER_EMAIL='vuong4651050332@st.qnu.edu.vn';
const ORGANIZATION_ID=46;
const BRANCH_ID=49;
const RECEIPT_KEY='seed-fashion-stationery-org46-branch49-v1';
const RECEIPT_NOTE='Nhập kho hàng thời trang & đồ học tập đầu kỳ';

const catalog=[
 {name:'Áo thời trang',prefix:'TT-AO',items:[
  ['Áo thun cotton basic form rộng màu đen size M',65000,129000,'Cái',8,'M','Đen'],['Áo thun cotton basic form rộng màu trắng size L',65000,129000,'Cái',8,'L','Trắng'],['Áo polo nam cotton trơn màu navy size L',115000,229000,'Cái',6,'L','Navy'],['Áo sơ mi trắng dài tay công sở nam size M',145000,289000,'Cái',6,'M','Trắng'],['Áo sơ mi nữ cổ đức xanh nhạt size M',135000,269000,'Cái',6,'M','Xanh nhạt'],['Áo khoác gió unisex chống nắng màu đen size L',185000,369000,'Chiếc',5,'L','Đen'],['Áo hoodie nỉ unisex màu xám size XL',210000,419000,'Chiếc',5,'XL','Xám'],['Áo croptop nữ cotton màu be size S',70000,149000,'Cái',7,'S','Be'],['Áo cardigan nữ len mỏng màu kem size M',175000,349000,'Chiếc',5,'M','Kem'],['Áo thun thể thao khô nhanh màu xanh size L',95000,189000,'Cái',6,'L','Xanh']
 ]},
 {name:'Quần & Chân váy',prefix:'TT-QV',items:[
  ['Quần jean ống suông nữ xanh nhạt size 28',210000,419000,'Cái',5,'28','Xanh nhạt'],['Quần jean ống đứng nam xanh đậm size 32',225000,449000,'Cái',5,'32','Xanh đậm'],['Quần tây nam công sở màu đen size 32',195000,389000,'Cái',5,'32','Đen'],['Quần tây nữ lưng cao màu đen size M',185000,369000,'Cái',5,'M','Đen'],['Quần short kaki nam màu be size L',125000,249000,'Cái',6,'L','Be'],['Quần short thể thao nữ màu đen size M',85000,169000,'Cái',7,'M','Đen'],['Chân váy chữ A nữ màu kem size M',135000,269000,'Cái',5,'M','Kem'],['Chân váy midi xếp ly màu nâu size M',165000,329000,'Cái',5,'M','Nâu'],['Quần legging nữ co giãn màu đen size L',95000,189000,'Cái',7,'L','Đen'],['Quần jogger nỉ unisex màu xám size L',155000,309000,'Cái',5,'L','Xám']
 ]},
 {name:'Giày dép',prefix:'TT-GIAY',items:[
  ["Giày thể thao Biti's Hunter nam size 41 màu trắng",495000,699000,'Đôi',4,'41','Trắng'],["Giày thể thao Biti's Hunter nữ size 38 màu hồng",475000,679000,'Đôi',4,'38','Hồng'],['Giày sneaker canvas cổ thấp màu trắng size 39',185000,369000,'Đôi',5,'39','Trắng'],['Giày sandal nữ quai ngang màu đen size 37',155000,309000,'Đôi',5,'37','Đen'],['Dép quai ngang EVA unisex màu xanh size 40',55000,109000,'Đôi',8,'40','Xanh'],['Giày lười nam da tổng hợp màu nâu size 42',285000,569000,'Đôi',4,'42','Nâu'],['Giày búp bê nữ mũi tròn màu kem size 36',175000,349000,'Đôi',4,'36','Kem'],['Dép tổ ong nam đế dày màu đen size 41',35000,69000,'Đôi',10,'41','Đen'],['Sandal trẻ em quai dán màu xanh size 30',95000,189000,'Đôi',6,'30','Xanh'],['Giày tây nam công sở màu đen size 40',395000,629000,'Đôi',3,'40','Đen']
 ]},
 {name:'Mũ nón & Phụ kiện',prefix:'TT-PK',items:[
  ['Mũ lưỡi trai kaki thêu chữ màu be',55000,119000,'Chiếc',8,'Free size','Be'],['Mũ bucket vải cotton hai mặt màu đen kem',65000,139000,'Chiếc',7,'Free size','Đen/Kem'],['Mũ bảo hiểm nửa đầu có kính màu trắng size M',185000,299000,'Chiếc',5,'M','Trắng'],['Thắt lưng nam khóa kim da tổng hợp màu nâu',95000,189000,'Chiếc',6,'105 cm','Nâu'],['Thắt lưng nữ bản nhỏ khóa tròn màu đen',75000,149000,'Chiếc',6,'95 cm','Đen'],['Tất vớ cổ thấp cotton nam màu trắng hộp 3 đôi',35000,69000,'Hộp',10,'Free size','Trắng'],['Tất vớ cổ trung nữ màu pastel hộp 3 đôi',38000,79000,'Hộp',10,'Free size','Pastel'],['Khăn choàng cổ lụa mỏng màu xanh navy',85000,169000,'Chiếc',5,'Free size','Navy'],['Kính mát thời trang unisex gọng đen',115000,229000,'Chiếc',5,'Free size','Đen'],['Ví mini nữ da tổng hợp màu đỏ đô',95000,189000,'Chiếc',5,'Free size','Đỏ đô']
 ]},
 {name:'Balo & Túi xách',prefix:'TT-TUI',items:[
  ['Balo học sinh chống gù tiểu học màu xanh navy',285000,459000,'Chiếc',4,'12 inch','Navy'],['Balo laptop 15.6 inch chống nước màu đen',325000,519000,'Chiếc',4,'15.6 inch','Đen'],['Balo thời trang mini nữ màu kem',175000,349000,'Chiếc',5,'Mini','Kem'],['Túi đeo chéo canvas unisex màu xanh rêu',125000,249000,'Chiếc',5,'Free size','Xanh rêu'],['Túi tote vải canvas in hình màu trắng',65000,129000,'Chiếc',8,'Free size','Trắng'],['Túi xách nữ công sở da tổng hợp màu nâu',295000,489000,'Chiếc',4,'Medium','Nâu'],['Túi bao tử thể thao unisex màu đen',85000,169000,'Chiếc',6,'Free size','Đen'],['Cặp sách học sinh tiểu học màu hồng',245000,399000,'Chiếc',4,'12 inch','Hồng'],['Túi đựng laptop chống sốc 14 inch màu xám',115000,229000,'Chiếc',5,'14 inch','Xám'],['Ví cầm tay nam khóa kéo màu đen',125000,249000,'Chiếc',5,'Free size','Đen']
 ]},
 {name:'Bút viết & Dụng cụ học tập',prefix:'HT-BUT',items:[
  ['Bút bi Thiên Long TL-027 mực xanh',3200,5000,'Cây',15,'0.5 mm','Xanh'],['Bút bi Thiên Long TL-027 mực đen',3200,5000,'Cây',15,'0.5 mm','Đen'],['Bút gel Thiên Long GEL-08 mực xanh',6500,10000,'Cây',12,'0.5 mm','Xanh'],['Bút chì gỗ 2B Staedtler Noris',8500,14000,'Cây',12,'2B','Vàng/Đen'],['Bút chì bấm 0.5 mm thân xanh',12000,22000,'Cây',10,'0.5 mm','Xanh'],['Gôm tẩy trắng Thiên Long E-011',3500,6000,'Cục',15,'Tiêu chuẩn','Trắng'],['Thước kẻ nhựa trong 20 cm',4000,7000,'Cái',15,'20 cm','Trong'],['Hộp bút vải nhiều ngăn màu xanh',45000,89000,'Chiếc',8,'Tiêu chuẩn','Xanh'],['Compa học sinh kèm bút chì',18000,35000,'Bộ',10,'Tiêu chuẩn','Bạc'],['Bút nhớ dòng pastel bộ 6 màu',35000,69000,'Bộ',8,'6 màu','Pastel']
 ]},
 {name:'Sách vở & Giấy in',prefix:'HT-SACH',items:[
  ['Vở kẻ ngang Campus 200 trang khổ A5',18500,28000,'Quyển',12,'A5','Trắng'],['Vở ô ly Hồng Hà 96 trang khổ A4',8500,13000,'Quyển',15,'96 trang','Trắng'],['Vở ô ly Hồng Hà 200 trang khổ A4',14500,22000,'Quyển',12,'200 trang','Trắng'],['Sổ tay lò xo bìa kraft 120 trang',22000,39000,'Quyển',10,'A5','Kraft'],['Giấy in Double A A4 70 gsm ram 500 tờ',78000,99000,'Ram',8,'A4','Trắng'],['Giấy in PaperOne A4 70 gsm ram 500 tờ',72000,95000,'Ram',8,'A4','Trắng'],['Giấy note vuông 3x3 inch màu vàng',8500,15000,'Xấp',12,'3x3 inch','Vàng'],['Bìa hồ sơ lá A4 trong suốt',2500,5000,'Cái',20,'A4','Trong'],['Tập giấy kiểm tra học sinh 4 ô ly',4500,8000,'Quyển',15,'4 ô ly','Trắng'],['Sổ kế hoạch tuần bìa mềm khổ A5',28000,49000,'Quyển',8,'A5','Nhiều màu']
 ]},
 {name:'Họa cụ & Văn phòng phẩm',prefix:'HT-VP',items:[
  ['Bút màu sáp Thiên Long CR-C06 bộ 12 màu',22000,39000,'Hộp',10,'12 màu','Nhiều màu'],['Bút chì màu Colokit Colokit CP-06 bộ 12 màu',35000,59000,'Hộp',8,'12 màu','Nhiều màu'],['Màu nước học sinh bộ 12 màu kèm cọ',32000,55000,'Bộ',8,'12 màu','Nhiều màu'],['Giấy vẽ mỹ thuật A4 định lượng 180 gsm xấp 20 tờ',18000,32000,'Xấp',10,'A4','Trắng'],['Kéo học sinh lưỡi thép đầu tù 13 cm',12000,22000,'Cái',10,'13 cm','Xanh'],['Keo khô Thiên Long G-077 8 g',6500,11000,'Thỏi',12,'8 g','Trắng'],['Bấm kim số 10 mini kèm 500 ghim',28000,49000,'Bộ',8,'Số 10','Xanh'],['Kẹp giấy kim loại 28 mm hộp 100 cái',14000,25000,'Hộp',10,'28 mm','Bạc'],['Máy tính khoa học Casio fx-580VN X',575000,699000,'Chiếc',3,'fx-580VN X','Đen'],['Băng keo trong văn phòng 2.4 cm x 20 yard',8500,15000,'Cuộn',12,'2.4 cm','Trong']
 ]}
];

function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
 return value;
}
function sameJson(a,b){
 const value=typeof a==='string'?JSON.parse(a):a;
 return JSON.stringify(stable(value))===JSON.stringify(stable(b));
}

async function seed(){
 await verifyDatabase();
 const connection=await pool.getConnection();
 try{
  await connection.beginTransaction();
  const [[owner]]=await connection.execute('SELECT id,organization_id,role FROM users WHERE email=? FOR UPDATE',[OWNER_EMAIL]);
  if(!owner||Number(owner.organization_id)!==ORGANIZATION_ID||owner.role!=='OWNER')throw new Error('OWNER_SCOPE_MISMATCH');
  const [[branch]]=await connection.execute('SELECT id,organization_id,status FROM branches WHERE id=? FOR UPDATE',[BRANCH_ID]);
  if(!branch||Number(branch.organization_id)!==ORGANIZATION_ID||branch.status!=='ACTIVE')throw new Error('BRANCH_SCOPE_MISMATCH');
  const [[organization]]=await connection.execute('SELECT id,status FROM organizations WHERE id=? FOR UPDATE',[ORGANIZATION_ID]);
  if(!organization||organization.status!=='ACTIVE')throw new Error('ORGANIZATION_NOT_ACTIVE');

  const products=[];
  for(let categoryIndex=0;categoryIndex<catalog.length;categoryIndex++){
   const category=catalog[categoryIndex];
   const [existingCategories]=await connection.execute('SELECT id FROM categories WHERE organization_id=? AND name=? FOR UPDATE',[ORGANIZATION_ID,category.name]);
   let categoryId=existingCategories[0]?.id;
   if(!categoryId){const [result]=await connection.execute('INSERT INTO categories(organization_id,name) VALUES (?,?)',[ORGANIZATION_ID,category.name]);categoryId=result.insertId;}
   for(let itemIndex=0;itemIndex<category.items.length;itemIndex++){
    const [name,costPrice,salePrice,unit,minStock,size,color]=category.items[itemIndex];
    if(salePrice<=costPrice)throw new Error('INVALID_PRICE_MARGIN');
    const sku=`${category.prefix}-${String(itemIndex+1).padStart(3,'0')}`;
    const quantity=15+((products.length*7+categoryIndex*3)%36);
    if(quantity<=minStock)throw new Error('INITIAL_STOCK_BELOW_MINIMUM');
    const attributes={unit,min_stock:minStock,size,color};
    const [existingProducts]=await connection.execute('SELECT id,category_id,name,cost_price,sale_price,status,attributes FROM products WHERE organization_id=? AND sku=? FOR UPDATE',[ORGANIZATION_ID,sku]);
    let productId=existingProducts[0]?.id;
    if(productId){
     const current=existingProducts[0];
     if(Number(current.category_id)!==Number(categoryId)||current.name!==name||Number(current.cost_price)!==costPrice||Number(current.sale_price)!==salePrice||current.status!=='ACTIVE'||!sameJson(current.attributes,attributes))throw new Error('EXISTING_SEED_SKU_CONFLICT');
    }else{
     const [result]=await connection.execute('INSERT INTO products(organization_id,category_id,sku,name,sale_price,cost_price,attributes,status) VALUES (?,?,?,?,?,?,?,\'ACTIVE\')',[ORGANIZATION_ID,categoryId,sku,name,salePrice,costPrice,JSON.stringify(attributes)]);
     productId=result.insertId;
    }
    products.push({id:Number(productId),sku,name,costPrice,salePrice,quantity,attributes});
   }
  }
  if(products.length!==80)throw new Error('SEED_PRODUCT_COUNT_MISMATCH');
  products.sort((a,b)=>a.id-b.id);
  const payload={branch_id:BRANCH_ID,request_key:RECEIPT_KEY,note:RECEIPT_NOTE,items:products.map(p=>({product_id:p.id,quantity:p.quantity,unit_price:p.costPrice}))};
  const payloadHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const [[existingReceipt]]=await connection.execute("SELECT id,payload_hash,total FROM stock_documents WHERE organization_id=? AND type='RECEIPT' AND request_key=? FOR UPDATE",[ORGANIZATION_ID,RECEIPT_KEY]);
  let receiptId,replayed=false,total=products.reduce((sum,p)=>sum+p.costPrice*p.quantity,0);
  if(existingReceipt){
   if(existingReceipt.payload_hash!==payloadHash)throw new Error('IDEMPOTENCY_KEY_CONFLICT');
   const [[itemCount]]=await connection.execute('SELECT COUNT(*) total FROM stock_document_items WHERE organization_id=? AND document_id=?',[ORGANIZATION_ID,existingReceipt.id]);
   if(Number(itemCount.total)!==80)throw new Error('EXISTING_RECEIPT_ITEM_COUNT_MISMATCH');
   receiptId=Number(existingReceipt.id);total=Number(existingReceipt.total);replayed=true;
  }else{
   const [receipt]=await connection.execute("INSERT INTO stock_documents(organization_id,branch_id,type,request_key,payload_hash,performed_by,total,note,subtotal,item_discount_total,order_discount) VALUES (?,?,'RECEIPT',?,?,?, ?,?, ?,0,0)",[ORGANIZATION_ID,BRANCH_ID,RECEIPT_KEY,payloadHash,owner.id,total,RECEIPT_NOTE,total]);
   receiptId=Number(receipt.insertId);
   for(const product of products){
    await connection.execute('INSERT INTO inventory_balances(organization_id,branch_id,product_id,quantity) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[ORGANIZATION_ID,BRANCH_ID,product.id,product.quantity]);
    const [[balance]]=await connection.execute('SELECT quantity FROM inventory_balances WHERE organization_id=? AND branch_id=? AND product_id=? FOR UPDATE',[ORGANIZATION_ID,BRANCH_ID,product.id]);
    await connection.execute('INSERT INTO stock_document_items(organization_id,document_id,product_id,sku,product_name,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?,?,?)',[ORGANIZATION_ID,receiptId,product.id,product.sku,product.name,product.quantity,product.costPrice,product.costPrice*product.quantity]);
    await connection.execute('INSERT INTO inventory_movements(organization_id,branch_id,product_id,document_id,quantity_delta,balance_after) VALUES (?,?,?,?,?,?)',[ORGANIZATION_ID,BRANCH_ID,product.id,receiptId,product.quantity,balance.quantity]);
   }
  }
  const [seedSkus]=await connection.execute(`SELECT COUNT(*) total FROM products WHERE organization_id=? AND sku IN (${products.map(()=>'?').join(',')})`,[ORGANIZATION_ID,...products.map(p=>p.sku)]);
  const [[stock]]=await connection.execute(`SELECT COUNT(*) products,SUM(i.quantity) quantity FROM inventory_balances i WHERE i.organization_id=? AND i.branch_id=? AND i.product_id IN (${products.map(()=>'?').join(',')})`,[ORGANIZATION_ID,BRANCH_ID,...products.map(p=>p.id)]);
  await connection.commit();
  console.log(JSON.stringify({organization_id:ORGANIZATION_ID,branch_id:BRANCH_ID,categories:catalog.length,products:Number(seedSkus[0].total),receipt_id:receiptId,receipt_item_count:80,total_received_units:products.reduce((sum,p)=>sum+p.quantity,0),current_seed_stock:Number(stock.quantity||0),receipt_total_vnd:total,idempotent_replay:replayed}));
 }catch(error){await connection.rollback();throw error;}
 finally{connection.release();}
}

try{await seed();}
catch(error){console.error(JSON.stringify({status:'FAILED',code:error.code||error.message||'SEED_FAILED'}));process.exitCode=1;}
finally{await pool.end();}
