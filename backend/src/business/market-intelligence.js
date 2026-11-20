import {Router} from 'express';
import {z} from 'zod';
import {pool} from '../db/pool.js';
import {requireRoles} from '../middlewares/auth.js';
import {asyncRoute,HttpError} from '../utils/http.js';
import {assertBranch} from './common.js';

const router=Router();
const eligibleRoles=['OWNER','MANAGER','INVENTORY'];
const CACHE_HOURS=24;
const FALLBACK_CACHE_HOURS=1;
const MIN_MARGIN_RATE=0.15;
const inFlight=new Map();
let tableReady;

export async function ensureMarketPriceChecksTable(){
 if(!tableReady)tableReady=pool.execute(`CREATE TABLE IF NOT EXISTS market_price_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  checked_by INT UNSIGNED NULL,
  result_json JSON NOT NULL,
  source_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  model_name VARCHAR(80) NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_market_price_check_org_product (organization_id,product_id),
  KEY idx_market_price_check_expiry (expires_at),
  CONSTRAINT fk_market_price_check_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_market_price_check_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_market_price_check_user FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE SET NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).then(()=>true).catch(error=>{tableReady=null;throw error;});
 return tableReady;
}

const listQuery=z.object({q:z.string().trim().max(100).default(''),branch_id:z.coerce.number().int().positive().optional(),mode:z.enum(['all','priority']).default('all'),limit:z.coerce.number().int().min(1).max(200).default(100)});
const checkBody=z.object({product_id:z.coerce.number().int().positive(),quantity:z.coerce.number().int().min(0).max(1000000).default(0),refresh:z.boolean().default(false)}).strict();

router.get('/products',requireRoles(...eligibleRoles),asyncRoute(async(req,res)=>{
 const query=listQuery.parse(req.query),org=req.organizationId,filterArgs=[],where=["p.organization_id=?","p.status='ACTIVE'"];
 let branchSql='';
 if(query.branch_id){await assertBranch(req.user,query.branch_id);branchSql=' AND i.branch_id=?';}
 if(query.q){where.push('(p.name LIKE ? OR p.sku LIKE ?)');filterArgs.push(`%${query.q}%`,`%${query.q}%`);}
 const priorityOrder=query.mode==='priority'?'low_stock ASC,sold_90d DESC,p.name':'p.name';
 const [items]=await pool.execute(`SELECT p.id,p.sku,p.name,p.category_id,c.name category_name,p.cost_price,p.sale_price AS selling_price,p.sale_price,
  COALESCE(stock.quantity,0) stock_quantity,COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.min_stock')) AS DECIMAL(14,2)),10) min_stock,
  COALESCE(sales.sold_90d,0) sold_90d,
  CASE WHEN COALESCE(stock.quantity,0)<=COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.min_stock')) AS DECIMAL(14,2)),10) THEN 0 ELSE 1 END low_stock
 FROM products p
 LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
 LEFT JOIN (SELECT product_id,SUM(quantity) quantity FROM inventory_balances i WHERE i.organization_id=?${branchSql} GROUP BY product_id) stock ON stock.product_id=p.id
 LEFT JOIN (SELECT si.product_id,SUM(si.quantity-COALESCE(si.returned_quantity,0)) sold_90d FROM stock_document_items si JOIN stock_documents d ON d.organization_id=si.organization_id AND d.id=si.document_id WHERE si.organization_id=? AND d.type='SALE' AND d.order_status='COMPLETED' AND d.payment_status='PAID' AND d.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 DAY) GROUP BY si.product_id) sales ON sales.product_id=p.id
 WHERE ${where.join(' AND ')} ORDER BY ${priorityOrder} LIMIT ${query.limit}`,[org,...(query.branch_id?[query.branch_id]:[]),org,org,...filterArgs]);
 res.json({items,mode:query.mode,branch_id:query.branch_id??null,source:'RETAIL_APP'});
}));

const generatedSchema={type:'object',properties:{market_observations:{type:'array',items:{type:'object',properties:{retailer:{type:'string'},listing_title:{type:'string'},price:{type:'number'},url:{type:'string'},price_note:{type:'string'}},required:['retailer','listing_title','price','url','price_note']}},sourcing_suggestions:{type:'array',items:{type:'object',properties:{supplier_name:{type:'string'},channel:{type:'string'},indicative_unit_price:{type:'number'},minimum_order:{type:'string'},discount_terms:{type:'string'},quality_notes:{type:'string'},url:{type:'string'}},required:['supplier_name','channel','indicative_unit_price','minimum_order','discount_terms','quality_notes','url']}},market_summary:{type:'string'},sourcing_note:{type:'string'}},required:['market_observations','sourcing_suggestions','market_summary','sourcing_note']};

function collectGroundingSources(response){
 const sources=[],seen=new Set();
 for(const candidate of response?.candidates||[]){
  for(const chunk of candidate?.groundingMetadata?.groundingChunks||[]){
   if(typeof chunk?.web?.uri!=='string')continue;
   try{const url=new URL(chunk.web.uri);if(!['https:','http:'].includes(url.protocol)||seen.has(url.href))continue;seen.add(url.href);sources.push({title:String(chunk.web.title||url.hostname).slice(0,180),url:url.href});}catch{}
  }
 }
 return sources;
}
function normaliseGroundedResult(raw,sources){
 const allowed=new Set(sources.map(item=>item.url));
 const observations=(Array.isArray(raw.market_observations)?raw.market_observations:[]).flatMap(row=>{
  const price=Number(row.price);let url='';try{url=new URL(row.url).href;}catch{return [];}
  if(!allowed.has(url)||!Number.isFinite(price)||price<=0)return [];
  return [{retailer:String(row.retailer||'Nguồn bán lẻ').slice(0,100),listing_title:String(row.listing_title||'').slice(0,240),price:Math.round(price),url,price_note:String(row.price_note||'').slice(0,300)}];
 }).slice(0,20);
 const suppliers=(Array.isArray(raw.sourcing_suggestions)?raw.sourcing_suggestions:[]).flatMap(row=>{
  const price=Number(row.indicative_unit_price);let url='';try{url=new URL(row.url).href;}catch{return [];}
  if(!allowed.has(url))return [];
  return [{supplier_name:String(row.supplier_name||'Kênh nguồn hàng').slice(0,160),channel:String(row.channel||'').slice(0,180),indicative_unit_price:Number.isFinite(price)&&price>0?Math.round(price):null,minimum_order:String(row.minimum_order||'Chưa công bố').slice(0,180),discount_terms:String(row.discount_terms||'Chưa công bố').slice(0,300),quality_notes:String(row.quality_notes||'').slice(0,500),url}];
 }).slice(0,8);
 const prices=observations.map(row=>row.price).sort((a,b)=>a-b);
 const average=prices.length?Math.round(prices.reduce((sum,value)=>sum+value,0)/prices.length):null;
 return {min_market_price:prices[0]??null,avg_market_price:average,max_market_price:prices.at(-1)??null,market_observations:observations,sourcing_suggestions:suppliers,market_summary:String(raw.market_summary||'').slice(0,1200),sourcing_note:String(raw.sourcing_note||'').slice(0,1200),sources,confidence:prices.length>=4?'HIGH':prices.length>=2?'MEDIUM':'LOW',source_count:sources.length,observation_count:observations.length,minimum_margin_rate:MIN_MARGIN_RATE};
}
function withProductPricing(result,product){
 const cost=product.cost_price==null?null:Number(product.cost_price),sale=Number(product.sale_price||0),avg=result.avg_market_price;
 const minimumViable=cost!=null?Math.ceil(cost/(1-MIN_MARGIN_RATE)):null;
 const optimal=avg==null?sale:Math.max(minimumViable||0,Math.round(avg*0.98));
 let competitiveness='COMPETITIVE';
 if(minimumViable!=null&&sale<minimumViable)competitiveness='LOW_MARGIN';
 else if(avg!=null&&sale>avg*1.05)competitiveness='ABOVE_MARKET';
 return {...result,price_competitiveness:competitiveness,optimal_selling_price:optimal,minimum_viable_price:minimumViable,product:{id:Number(product.id),sku:product.sku,name:product.name,cost_price:cost,selling_price:sale},minimum_margin_rate:MIN_MARGIN_RATE};
}
function categoryMargin(categoryName){
 const category=String(categoryName||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/dien tu|cong nghe|gia dung|thiet bi/.test(category))return 0.18;
 if(/my pham|lam dep|thoi trang|phu kien/.test(category))return 0.32;
 if(/thuc pham|do uong|bach hoa|tieu dung/.test(category))return 0.22;
 if(/duoc|suc khoe|me va be/.test(category))return 0.25;
 return 0.24;
}

function localFallbackAnalysis(product,quantity,error){
 const cost=Math.max(0,Number(product.cost_price)||0),sale=Math.max(0,Number(product.sale_price)||0);
 const margin=categoryMargin(product.category_name);
 const costBased=cost>0?Math.ceil(cost/(1-margin)):0;
 const reference=sale>0&&costBased>0?Math.round(sale*0.6+costBased*0.4):(sale||costBased||0);
 const minPrice=reference>0?Math.max(cost>0?Math.ceil(cost/(1-MIN_MARGIN_RATE)):1,Math.round(reference*0.9)):null;
 const avgPrice=reference>0?Math.max(minPrice,Math.round(reference)):null;
 const maxPrice=reference>0?Math.max(avgPrice,Math.round(reference*1.12)):null;
 const keyword=encodeURIComponent(`${product.name} ${product.category_name||''}`.trim());
 const supplierPrice=cost>0?Math.round(cost):avgPrice?Math.round(avgPrice*(1-margin)):null;
 const requested=quantity>0?`${quantity.toLocaleString('vi-VN')} sản phẩm`:'Liên hệ để xác nhận';
 const reason=error?.message?'Dịch vụ tra cứu trực tuyến tạm thời không khả dụng. ':'';
 return {
  min_market_price:minPrice,avg_market_price:avgPrice,max_market_price:maxPrice,
  market_observations:[],
  sourcing_suggestions:[
   {supplier_name:'Nhà phân phối chính hãng',channel:'Kênh phân phối theo danh mục',indicative_unit_price:supplierPrice,minimum_order:requested,discount_terms:'Yêu cầu báo giá theo số lượng và điều kiện giao hàng',quality_notes:'Ưu tiên đơn vị có hóa đơn, chứng từ nguồn gốc và chính sách đổi trả; cần xác minh báo giá trước khi nhập.',url:`https://www.google.com/search?q=${keyword}+nh%C3%A0+ph%C3%A2n+ph%E1%BB%91i+ch%C3%ADnh+h%C3%A3ng`},
   {supplier_name:'Sàn bán sỉ và đại lý khu vực',channel:'So sánh nhiều nguồn cung',indicative_unit_price:supplierPrice,minimum_order:requested,discount_terms:'Đàm phán chiết khấu theo số lượng thực nhập',quality_notes:'Đối chiếu uy tín người bán, phí vận chuyển, hạn dùng và quy cách đóng gói trước khi đặt hàng.',url:`https://www.google.com/search?q=${keyword}+ngu%E1%BB%93n+s%E1%BB%89+Vi%E1%BB%87t+Nam`}
  ],
  market_summary:`${reason}Khoảng giá trên là ước tính nội bộ từ giá nhập ${cost>0?cost.toLocaleString('vi-VN')+' ₫':'chưa có'}, giá bán ${sale>0?sale.toLocaleString('vi-VN')+' ₫':'chưa có'} và biên giá tham khảo ${(margin*100).toFixed(0)}% của danh mục ${product.category_name||'chung'}. Cần đối chiếu listing thực tế trước khi quyết định giá.`,
  sourcing_note:'Đây là gợi ý kênh tìm nguồn dự phòng, không phải báo giá đã được xác minh. Hãy yêu cầu báo giá, hóa đơn và điều kiện giao hàng trực tiếp từ nhà cung cấp.',
  sources:[],confidence:'LOW',source_count:0,observation_count:0,minimum_margin_rate:MIN_MARGIN_RATE,fallback:true,analysis_mode:'LOCAL_ESTIMATE'
 };
}

function parseJsonText(text){
 const cleaned=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 return JSON.parse(cleaned);
}

async function requestGroundedAnalysis(product,quantity){
 const apiKey=String(process.env.GEMINI_API_KEY||'').trim();
 if(!apiKey)throw new Error('Chưa cấu hình GEMINI_API_KEY.');
 const configuredModel=String(process.env.GEMINI_MARKET_MODEL||'').trim();
 const model=['gemini-2.5-flash','gemini-flash-latest'].includes(configuredModel)?configuredModel:'gemini-flash-latest';
 const prompt=`Tra cứu trên Google Search bằng tiếng Việt mặt bằng bán lẻ hiện tại tại Việt Nam cho đúng mặt hàng sau. Tên: ${product.name}. Mã nội bộ: ${product.sku}. Danh mục: ${product.category_name||'chưa phân loại'}. Quy cách/đơn vị đã biết: ${product.unit||'không có dữ liệu quy cách'}.
Tìm các trang sản phẩm hiện đang bán từ Shopee, Lazada, Tiki, Bách Hóa Xanh, WinMart hoặc cửa hàng/nhà phân phối có uy tín. Chỉ ghi listing có đúng sản phẩm và quy cách có thể xác minh; giá phải là giá bán hiện tại bằng VND, không tự quy đổi giá khuyến mãi/voucher không áp dụng rộng rãi. Nếu không tìm được đủ listing đáng tin cậy, trả về mảng rỗng thay vì ước đoán. Với mỗi observation và supplier phải dùng URL lấy từ kết quả Google Search grounding, tuyệt đối không tạo URL, tên nhà bán hay báo giá không tìm thấy.
Đồng thời đề xuất nguồn nhập sỉ phù hợp sản phẩm. Ưu tiên nhà phân phối chính hãng, chợ đầu mối hoặc sàn B2B có trang nguồn kiểm chứng. Chỉ đưa ra giá tham khảo/điều kiện chiết khấu khi trang tìm được có căn cứ; nếu chưa rõ ghi 'Chưa công bố'. Số lượng dự kiến cần nhập: ${quantity||'chưa cung cấp'}.
Trả về JSON đúng schema. Không đưa ra URL nếu URL đó không xuất hiện trong citations của Google Search. Mô tả sự không chắc chắn trong market_summary/sourcing_note.`;
 let response;
 try{
  response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],tools:[{google_search:{}}],generationConfig:{temperature:0.2,responseMimeType:'application/json',responseJsonSchema:generatedSchema}}),signal:AbortSignal.timeout(25000)});
 }catch(error){throw new Error(error.name==='TimeoutError'?'Tra cứu thị trường hết thời gian chờ.':'Không kết nối được Gemini API.');}
 if(!response.ok){const status=response.status;try{await response.arrayBuffer();}catch{}throw new Error(`Gemini API trả về HTTP ${status}.`);}
 let payload;try{payload=await response.json();}catch{throw new Error('Gemini API trả về dữ liệu không hợp lệ.');}
 const outputText=(payload.candidates?.[0]?.content?.parts||[]).map(part=>part?.text||'').join('');
 let raw;try{raw=parseJsonText(outputText);}catch{throw new Error('Không đọc được JSON từ Gemini API.');}
 const sources=collectGroundingSources(payload);
 return {result:normaliseGroundedResult(raw,sources),model};
}

async function resolveMarketAnalysis(product,quantity){
 try{return await requestGroundedAnalysis(product,quantity);}
 catch(error){
  console.warn('[Market Intelligence] Gemini unavailable, using local estimate:',error?.message||error);
  return {result:localFallbackAnalysis(product,quantity,error),model:'local-pricing-fallback'};
 }
}

router.post('/check',requireRoles(...eligibleRoles),asyncRoute(async(req,res)=>{
 await ensureMarketPriceChecksTable();
 const body=checkBody.parse(req.body),org=req.organizationId;
 const [[product]]=await pool.execute(`SELECT p.id,p.sku,p.name,p.category_id,c.name category_name,p.cost_price,p.sale_price,p.attributes FROM products p LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id WHERE p.id=? AND p.organization_id=? AND p.status='ACTIVE'`,[body.product_id,org]);
 if(!product)throw new HttpError(404,'Không tìm thấy sản phẩm đang kinh doanh trong kho.');
 let cached=null;
 if(!body.refresh){const [rows]=await pool.execute('SELECT result_json,checked_at,expires_at FROM market_price_checks WHERE organization_id=? AND product_id=? AND expires_at>UTC_TIMESTAMP() LIMIT 1',[org,product.id]);if(rows[0])cached={result:typeof rows[0].result_json==='string'?JSON.parse(rows[0].result_json):rows[0].result_json,checked_at:rows[0].checked_at,expires_at:rows[0].expires_at};}
 if(cached){res.json({...withProductPricing(cached.result,product),checked_at:cached.checked_at,expires_at:cached.expires_at,cached:true,requested_quantity:body.quantity});return;}
 const key=`${org}:${product.id}`;
 const attributes=typeof product.attributes==='string'?(()=>{try{return JSON.parse(product.attributes);}catch{return {};}})():(product.attributes||{});
 const checkedBy=req.user.id;
 if(!inFlight.has(key))inFlight.set(key,resolveMarketAnalysis({...product,unit:attributes.unit},body.quantity).then(async response=>{
  const cacheHours=response.result.fallback?FALLBACK_CACHE_HOURS:CACHE_HOURS;
  const expiresAt=new Date(Date.now()+cacheHours*60*60*1000);
  await pool.execute(`INSERT INTO market_price_checks(organization_id,product_id,checked_by,result_json,source_count,model_name,checked_at,expires_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(),?) ON DUPLICATE KEY UPDATE checked_by=VALUES(checked_by),result_json=VALUES(result_json),source_count=VALUES(source_count),model_name=VALUES(model_name),checked_at=UTC_TIMESTAMP(),expires_at=VALUES(expires_at)`,[org,product.id,checkedBy,JSON.stringify(response.result),response.result.source_count,response.model,expiresAt]);
  return response;
 }).finally(()=>inFlight.delete(key)));
 const response=await inFlight.get(key);
 const [rows]=await pool.execute('SELECT checked_at,expires_at FROM market_price_checks WHERE organization_id=? AND product_id=? LIMIT 1',[org,product.id]);
 res.json({...withProductPricing(response.result,product),checked_at:rows[0]?.checked_at??new Date(),expires_at:rows[0]?.expires_at??new Date(Date.now()+CACHE_HOURS*60*60*1000),cached:false,requested_quantity:body.quantity});
}));

router.get('/history',requireRoles(...eligibleRoles),asyncRoute(async(req,res)=>{
 await ensureMarketPriceChecksTable();
 const productId=req.query.product_id?z.coerce.number().int().positive().parse(req.query.product_id):null;
 const args=[req.organizationId],where=['h.organization_id=?'];
 if(productId){where.push('h.product_id=?');args.push(productId);}
 const [items]=await pool.execute(`SELECT h.product_id,p.sku,p.name,h.source_count,h.checked_at,h.expires_at,h.result_json FROM market_price_checks h JOIN products p ON p.organization_id=h.organization_id AND p.id=h.product_id WHERE ${where.join(' AND ')} ORDER BY h.checked_at DESC LIMIT 50`,args);
 res.json({items:items.map(row=>({...row,result_json:typeof row.result_json==='string'?JSON.parse(row.result_json):row.result_json})),source:'MARKET_PRICE_CHECKS'});
}));

export default router;
