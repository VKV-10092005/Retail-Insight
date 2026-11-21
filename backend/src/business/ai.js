import {Router} from 'express';
import {z} from 'zod';
import {pool} from '../db/pool.js';
import {requireRoles} from '../middlewares/auth.js';
import {asyncRoute,HttpError} from '../utils/http.js';
import {positiveId,branchClause,assertBranch} from './common.js';
import {researchSelect} from '../db/research.js';
import {restartAiService} from '../services/aiServiceManager.js';
import {config} from '../config/env.js';
const router=Router();
export async function aiCall(path,body,{timeoutMs=15000}={}){
 const token=process.env.AI_SERVICE_TOKEN;if(!token||token.length<32)throw new HttpError(503,'Chưa cấu hình AI_SERVICE_TOKEN giữa backend và AI service');
 const base=config.aiServiceUrl;
 let response;try{response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs)});}catch(error){if(error?.cause?.code==='ECONNREFUSED'||error?.cause?.code==='ECONNRESET'){restartAiService();throw new HttpError(503,'AI FastAPI is starting or restarting. Please retry shortly.');}throw new HttpError(503,'Cannot connect to AI service at '+base+': '+(error?.message||'network error'));}
 if(response.status===429 && (path==='/health'||path==='/')){
  return {status:'ONLINE',ready:true,service:'retail-ai'};
 }
 let data;try{data=await response.json();}catch{throw new HttpError(503,'AI service returned an invalid response');}
 if(!response.ok)throw new HttpError(response.status>=500?503:422,typeof data.detail==='string'?data.detail:'Input AI không hợp lệ');return data;
}
const query=z.object({origin:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),task:z.enum(['sku','total','replenishment','stockout','multi','multi_sku']).default('multi'),branch_id:positiveId.optional(),category_id:positiveId.optional(),product_id:positiveId.optional(),product_ids:z.string().max(2000).optional(),version:z.string().max(80).optional()});
router.get('/ai/health',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>{
 try{
  const health=await aiCall('/health');
  res.json({status:'ONLINE',ready:health.ready===true,service:health.service||'retail-ai',upstream:health.status});
 }catch(err){
  if(err?.status===429||err?.message?.includes('429')){
   return res.json({status:'ONLINE',ready:true,service:'retail-ai',upstream:'RATE_LIMITED'});
  }
  throw err;
 }
}));
function addMonth(month,delta){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7);}
function addDays(value,delta){const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+delta);return date.toISOString().slice(0,10);}
async function loadOperationalProducts(req,q,origin,selectedIds=[]){
 const productArgs=[req.organizationId];let productWhere="p.organization_id=? AND p.status='ACTIVE'";
 if(q.category_id){productWhere+=' AND p.category_id=?';productArgs.push(q.category_id);}
 if(q.product_id){productWhere+=' AND p.id=?';productArgs.push(q.product_id);}
 if(selectedIds.length){productWhere+=` AND p.id IN (${selectedIds.map(()=>'?').join(',')})`;productArgs.push(...selectedIds);}
 const [products]=await pool.execute(`SELECT p.id,p.sku,p.name,p.category_id,c.name category_name,p.attributes,p.sale_price,DATE_FORMAT(p.created_at,'%Y-%m') first_month,DATE_FORMAT(p.created_at,'%Y-%m-%d') first_date FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.organization_id=p.organization_id WHERE ${productWhere} ORDER BY p.id LIMIT 100000`,productArgs);
 if(!products.length)return [];
 const stockArgs=[req.organizationId];let stockWhere='i.organization_id=?'+branchClause(req.user,'i',stockArgs);
 if(q.branch_id){stockWhere+=' AND i.branch_id=?';stockArgs.push(q.branch_id);}
 const coverageArgs=[req.organizationId];let branchWhere="organization_id=? AND status='ACTIVE'";
 if(q.branch_id){branchWhere+=' AND id=?';coverageArgs.push(q.branch_id);}
 else if(req.user.role!=='OWNER'){branchWhere+=' AND id IN (SELECT branch_id FROM user_branch_roles WHERE organization_id=? AND user_id=?)';coverageArgs.push(req.organizationId,req.user.id);}
 const endDate=addMonth(origin,1)+'-01',start28=addDays(endDate,-28),start84=addDays(endDate,-84);
 const salesArgs=[req.organizationId];let salesWhere="d.organization_id=? AND d.type='SALE'"+branchClause(req.user,'d',salesArgs);
 if(q.branch_id){salesWhere+=' AND d.branch_id=?';salesArgs.push(q.branch_id);}
 if(q.category_id){salesWhere+=' AND p.category_id=?';salesArgs.push(q.category_id);}
 const [stockResult,coverageResult,recentResult,categoryResult]=await Promise.all([
  pool.execute(`SELECT i.product_id,SUM(i.quantity) stock,COUNT(DISTINCT i.branch_id) recorded_branches FROM inventory_balances i WHERE ${stockWhere} GROUP BY i.product_id`,stockArgs),
  pool.execute(`SELECT COUNT(*) total FROM branches WHERE ${branchWhere}`,coverageArgs),
  pool.execute(`SELECT x.product_id,p.category_id,SUM(CASE WHEN d.created_at>=? THEN x.quantity ELSE 0 END) quantity_28,SUM(x.quantity) quantity_84 FROM stock_documents d JOIN stock_document_items x ON x.document_id=d.id AND x.organization_id=d.organization_id JOIN products p ON p.id=x.product_id AND p.organization_id=x.organization_id WHERE ${salesWhere} AND d.created_at>=? AND d.created_at<? GROUP BY x.product_id,p.category_id`,[start28,...salesArgs,start84,endDate]),
  pool.execute("SELECT category_id,COUNT(*) total FROM products WHERE organization_id=? AND status='ACTIVE' GROUP BY category_id",[req.organizationId])
 ]);
 const stocks=stockResult[0],branchCoverage=coverageResult[0][0],recent=recentResult[0],categoryCounts=categoryResult[0];
 const stockMap=new Map(stocks.map(row=>[Number(row.product_id),Number(row.recorded_branches)===Number(branchCoverage.total)?Number(row.stock):null]));
 const categoryCount=new Map(categoryCounts.map(row=>[row.category_id==null?'none':String(row.category_id),Number(row.total)]));
 const categoryQuantity=new Map();const productSales=new Map();
 for(const row of recent){const key=row.category_id==null?'none':String(row.category_id);categoryQuantity.set(key,(categoryQuantity.get(key)||0)+Number(row.quantity_84));productSales.set(Number(row.product_id),{quantity28:Number(row.quantity_28),quantity84:Number(row.quantity_84)});}
 const categoryRate=new Map([...categoryQuantity].map(([key,quantity])=>[key,quantity/(84*(categoryCount.get(key)||1))]));
 function observedDays(firstDate,start){const since=firstDate>start?firstDate:start;return Math.max(1,Math.min(84,Math.ceil((Date.parse(`${endDate}T00:00:00Z`)-Date.parse(`${since}T00:00:00Z`))/86400000)));}
 return products.map(product=>{
  const attributes=typeof product.attributes==='string'?JSON.parse(product.attributes):product.attributes||{};
  const sales=productSales.get(Number(product.id))||{quantity28:0,quantity84:0};
  const days28=Math.max(1,Math.min(28,Math.ceil((Date.parse(`${endDate}T00:00:00Z`)-Date.parse(`${product.first_date>start28?product.first_date:start28}T00:00:00Z`))/86400000)));
  const days84=observedDays(product.first_date,start84);const key=product.category_id==null?'none':String(product.category_id);
  return {...product,id:String(product.id),category_id:product.category_id==null?null:Number(product.category_id),attributes,stock:stockMap.has(Number(product.id))?stockMap.get(Number(product.id)):null,min_stock:attributes.min_stock==null?null:Number(attributes.min_stock),daily_rate_28:sales.quantity28/days28,daily_rate_84:sales.quantity84/days84,category_daily_rate:categoryRate.get(key)||0};
 });
}
function adaptiveEstimate(product,origin){
 const daily28=Math.max(0,Number(product.daily_rate_28)||0),daily84=Math.max(0,Number(product.daily_rate_84)||0),peer=Math.max(0,Number(product.category_daily_rate)||0),minimum=Math.max(0,Number(product.min_stock)||0),floor=minimum/90,observed=.65*daily28+.35*daily84;
 const daily=observed>0?(floor ? .9*observed+.1*floor : observed):peer>0?(floor ? .8*peer+.2*floor : peer):floor;
 const name=String(product.category_name||'').trim().toLowerCase();
 const forecasts=[1,2,3].map(horizon=>{const month=addMonth(origin,horizon),number=Number(month.slice(5,7));let season=1;
  if(['bút','vở','sách','giấy','họa cụ','văn phòng phẩm','stationery','school'].some(word=>name.includes(word)))season=[8,9].includes(number)?1.2:[6,7].includes(number)?1.08:number===1?1.05:1;
  else if(['áo','quần','giày','mũ','balo','túi','thời trang','fashion','footwear','apparel'].some(word=>name.includes(word)))season=[11,12].includes(number)?1.12:[4,5,6,7,8].includes(number)?1.08:number===1?.94:1;
  else if(['nước','đồ uống','giải khát','beverage'].some(word=>name.includes(word))&&[4,5,6,7,8].includes(number))season=1.08;
  else if(['thực phẩm','bánh','kẹo','food','grocery'].some(word=>name.includes(word))&&[1,2].includes(number))season=1.06;
  const [year,monthNumber]=month.split('-').map(Number),days=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  return {month,horizon,quantity:Math.round(Math.max(0,daily*days*season)*100)/100,seasonality_factor:season};
 });
 return {...product,product_id:String(product.id),quantity:forecasts[0].quantity,predicted:forecasts[0].quantity,horizon:1,forecasts,method:'ADAPTIVE_FORECAST',basis:observed>0?'SKU_DAILY_SALES':peer>0?'CATEGORY_PEER_DAILY_SALES':floor>0?'MIN_STOCK_BENCHMARK':'NO_SIGNAL_ZERO_FLOOR',confidence:observed>0?'MEDIUM':'LOW',daily_rate:Math.round(daily*1e6)/1e6,seasonality_factor:forecasts[0].seasonality_factor};
}
function localForecastFallback(task,products,origin,rows=[]){
 const estimated=products.map(product=>adaptiveEstimate(product,origin));
 if(task==='total'||task==='multi'){
  if(!estimated.length)return {status:'INSUFFICIENT_DATA',reason:'NO_ACTIVE_PRODUCTS',items:[],metrics:null};
  const items=[1,2,3].map(horizon=>{const forecasts=estimated.map(product=>product.forecasts[horizon-1]),quantity=Math.round(forecasts.reduce((sum,row)=>sum+row.quantity,0)*100)/100;return {month:forecasts[0]?.month,horizon,quantity,predicted:quantity,corrected:quantity,actual:null,factor:forecasts.reduce((sum,row)=>sum+row.seasonality_factor,0)/forecasts.length,method:'ADAPTIVE_FORECAST'};});
  return {status:'ADAPTIVE_FORECAST',reason:'AI_SERVICE_UNAVAILABLE_LOCAL_FALLBACK',method:'ADAPTIVE_COLD_START_BENCHMARK',origin,items,metrics:null};
 }
 const items=estimated.map(item=>{
  const stock=item.stock==null?null:Number(item.stock),minimum=item.min_stock==null?null:Number(item.min_stock),days=stock!=null&&item.quantity>0?Math.min(365,stock/item.quantity*30):null,below=minimum!=null&&stock!=null&&stock<=minimum;
  if(task==='replenishment'){
   const target=stock==null||item.quantity==null?null:Math.max(Math.ceil(minimum||0),Math.ceil(item.quantity)+Math.ceil(.2*item.quantity));
   return {...item,days_of_supply:days,target_stock:target,recommended_quantity:target==null?null:Math.max(0,target-stock),status:stock==null?'MISSING_STOCK':target>stock?'REPLENISH':'SUFFICIENT_STOCK',reason:stock==null?'Chưa có bản ghi tồn kho':'Dự phòng tồn kho theo nhu cầu dự báo'};
  }
  if(task==='stockout'){
   const risk=Boolean(below||(days!=null&&days<=30));return {...item,days_of_supply:days,below_min_stock:below,risk,priority:below?'Cần nhập: dưới min_stock':risk?'Ưu tiên kiểm tra':'Theo dõi'};
  }
  return item;
 });
 const history=task==='sku'?(()=>{const byMonth=new Map(rows.filter(row=>products.some(product=>String(product.id)===String(row.product_id))).map(row=>[row.month,Number(row.quantity)]));return Array.from({length:12},(_,index)=>{const month=addMonth(origin,index-11);return {month,quantity:byMonth.get(month)||0};});})():undefined;
 return {status:'ADAPTIVE_FORECAST',reason:'AI_SERVICE_UNAVAILABLE_LOCAL_FALLBACK',method:'ADAPTIVE_COLD_START_BENCHMARK',items,...(history?{history}:{}),missing_inputs:items.filter(item=>item.stock==null).map(item=>({product_id:item.id,reason:'MISSING_STOCK'})),metrics:null};
}
router.get('/ai/readiness',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>res.json(await aiCall('/v1/readiness'))));
async function computeForecast(req){
 const q=query.parse(req.query),now=new Date().toISOString().slice(0,7),origin=q.origin||addMonth(now,-1);
 if(origin>=now)throw new HttpError(400,'Chỉ dùng tháng đã kết thúc làm origin');
 if(q.branch_id)await assertBranch(req.user,q.branch_id,['MANAGER']);
 const args=[req.organizationId];let where="d.organization_id=? AND d.type='SALE'"+branchClause(req.user,'d',args);
 if(q.branch_id){where+=' AND d.branch_id=?';args.push(q.branch_id);}if(q.category_id){where+=' AND p.category_id=?';args.push(q.category_id);}if(q.product_id){where+=' AND p.id=?';args.push(q.product_id);}
 // Bound history to the observation window; never pad months before the store existed.
 const [orgResult,coverageResult]=await Promise.all([
  pool.execute("SELECT DATE_FORMAT(created_at,'%Y-%m') first_month FROM organizations WHERE id=?",[req.organizationId]),
  pool.execute("SELECT DATE_FORMAT(MIN(d.created_at),'%Y-%m') first_sale_month FROM stock_documents d WHERE d.organization_id=? AND d.type='SALE'",[req.organizationId])
 ]);
 const org=orgResult[0][0],coverage=coverageResult[0][0];
 const firstComplete=addMonth(org.first_month,1);
 if(q.task==='multi'||q.task==='total'){
  const start=firstComplete>addMonth(origin,-239)?firstComplete:addMonth(origin,-239);
  const [monthly]=await pool.execute(`SELECT DATE_FORMAT(d.created_at,'%Y-%m') month,SUM(x.quantity) quantity FROM stock_documents d JOIN stock_document_items x ON x.document_id=d.id AND x.organization_id=d.organization_id JOIN products p ON p.id=x.product_id AND p.organization_id=x.organization_id WHERE ${where} AND d.created_at>=? AND d.created_at<? GROUP BY month ORDER BY month`,[...args,start+'-01',addMonth(origin,1)+'-01']);
  const known=new Map(monthly.map(r=>[r.month,Number(r.quantity)]));const history=[];
  for(let month=start;month<=origin;month=addMonth(month,1))history.push({month,quantity:known.get(month)||0});
  const products=await loadOperationalProducts(req,q,origin);
  let result;try{result=await aiCall('/v1/adaptive-total',{origin,history,horizons:[1,2,3],products},{timeoutMs:5000});}catch(error){if(Number(error.status)!==503)throw error;result=localForecastFallback(q.task,products,origin,history);}
  if(q.task==='total')return ({...result,items:(result.items||[]).map(r=>({...r,predicted:r.predicted??r.quantity,corrected:r.corrected??r.quantity,actual:null,factor:r.factor??r.trend??1})),history,source:'OPERATIONAL',origin,observation_start:firstComplete,metrics:null});
  return ({...result,source:'OPERATIONAL',origin,observation_start:firstComplete,metrics:null});
 }

 const [rows]=await pool.execute(`SELECT x.product_id,DATE_FORMAT(d.created_at,'%Y-%m') month,SUM(x.quantity) quantity,SUM(x.quantity*x.unit_price)/NULLIF(SUM(x.quantity),0) unit_price FROM stock_documents d JOIN stock_document_items x ON x.document_id=d.id AND x.organization_id=d.organization_id JOIN products p ON p.id=x.product_id AND p.organization_id=x.organization_id WHERE ${where} AND d.created_at>=? AND d.created_at<? GROUP BY x.product_id,month ORDER BY month`,[...args,firstComplete+'-01',addMonth(origin,1)+'-01']);
 const cohortArgs=[req.organizationId];let cohortWhere="d.organization_id=? AND d.type='SALE'"+branchClause(req.user,'d',cohortArgs);
 if(q.branch_id){cohortWhere+=' AND d.branch_id=?';cohortArgs.push(q.branch_id);}
 const [cohorts]=await pool.execute(`SELECT JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.group_id')) group_id,JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.brand_id')) brand_id,DATE_FORMAT(d.created_at,'%Y-%m') month,SUM(x.quantity) quantity FROM stock_documents d JOIN stock_document_items x ON x.document_id=d.id AND x.organization_id=d.organization_id JOIN products p ON p.id=x.product_id AND p.organization_id=x.organization_id WHERE ${cohortWhere} AND d.created_at>=? AND d.created_at<? GROUP BY group_id,brand_id,month`,[...cohortArgs,firstComplete+'-01',addMonth(origin,1)+'-01']);
  let selectedIds=[];
  if(q.task==='multi_sku'){
   selectedIds=(q.product_ids||'').split(',').filter(Boolean).map(id=>positiveId.parse(Number(id)));
   if(!selectedIds.length)return {status:'SELECT_PRODUCT',reason:'Chọn ít nhất một SKU để chạy dự báo hàng loạt.',items:[],metrics:null};
   if(selectedIds.length>120)throw new HttpError(400,'Chỉ có thể dự báo tối đa 120 SKU mỗi lượt.');
  }
  // Feature inference is chunked into 100-row requests by FastAPI; do not reject a tenant just over that batch size.
  const products=await loadOperationalProducts(req,q,origin,selectedIds);
  const stockAsOf='CURRENT';
 const history=[];for(let month=firstComplete;month<=origin;month=addMonth(month,1)){if(history.length>=240)break;history.push({month,quantity:rows.filter(r=>r.month===month).reduce((s,r)=>s+Number(r.quantity),0)});}
  const body={cohorts:cohorts.map(r=>({...r,quantity:Number(r.quantity)})),task:q.task,origin,history,rows:rows.map(r=>({...r,quantity:Number(r.quantity),unit_price:Number(r.unit_price)})),products,version:q.version??null,current_origin:addMonth(now,-1)};
  let result;try{result=await aiCall('/v1/operational',body,{timeoutMs:5000});}catch(error){if(Number(error.status)!==503)throw error;result=localForecastFallback(q.task,products,origin,rows);}
  if(result.status==='READY'&&(q.task==='sku'||q.task==='multi_sku')){
   const byProduct=new Map(body.products.map(p=>[p.id,p]));
   result.items=(result.items||[]).map(item=>{const product=byProduct.get(String(item.product_id));return {...item,sku:product?.sku,name:product?.name,stock:product?.stock,min_stock:product?.min_stock};});
  }
  const skuHistory=q.task==='sku'?(()=>{const productRows=rows.filter(row=>String(row.product_id)===String(q.product_id));const known=new Map(productRows.map(row=>[row.month,Number(row.quantity)]));const items=[];for(let month=firstComplete;month<=origin;month=addMonth(month,1)){if(items.length>=240)break;items.push({month,quantity:known.get(month)||0});}return items;})():undefined;
  return ({...result,...(skuHistory?{history:skuHistory}:{}),source:'OPERATIONAL',origin,observation_start:firstComplete,first_sale_month:coverage.first_sale_month,stock_as_of:stockAsOf,metrics:null});
}
router.get('/ai/forecast',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>res.json(await computeForecast(req))));
router.get('/ai/summary',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>{
 const tasks=['sku','total','replenishment','stockout','multi'];
 const settled=await Promise.allSettled(tasks.map(task=>computeForecast({user:req.user,organizationId:req.organizationId,query:{...req.query,task}})));
 const results=settled.map((entry,index)=>entry.status==='fulfilled'?entry.value:{status:'UNAVAILABLE',reason:'AI_SERVICE_UNAVAILABLE',message:entry.reason?.message||'Task unavailable; other results are preserved.',items:[],metrics:null,task:tasks[index]});
 const [sku,total,replenishment,stockout,multi]=results;
 res.json({source:'OPERATIONAL',as_of:new Date().toISOString(),metrics:null,
 forecast_total:['READY','ADAPTIVE_FORECAST'].includes(total.status)?total.items.at(-1)?.corrected??total.items.at(-1)?.quantity??null:null,
 sku_forecast_total:['READY','ADAPTIVE_FORECAST'].includes(sku.status)?sku.items.reduce((s,r)=>s+Number(r.quantity),0):null,
 recommended_sku_count:['READY','ADAPTIVE_FORECAST','PARTIAL'].includes(replenishment.status)&&!replenishment.items.some(r=>r.recommended_quantity===null)?replenishment.items.filter(r=>r.recommended_quantity>0).length:null,
 recommended_quantity:['READY','ADAPTIVE_FORECAST','PARTIAL'].includes(replenishment.status)&&!replenishment.items.some(r=>r.recommended_quantity===null)?replenishment.items.reduce((s,r)=>s+Number(r.recommended_quantity||0),0):null,
 alert_count:['READY','ADAPTIVE_FORECAST','PARTIAL'].includes(stockout.status)&&!stockout.missing_inputs?.length?stockout.items.filter(r=>r.risk).length:null,
  status:results.every(r=>r.status==='READY')?'READY':results.some(r=>r.status==='ADAPTIVE_FORECAST')?'ADAPTIVE_FORECAST':'PARTIAL',
  statuses:Object.fromEntries(tasks.map((task,index)=>[task,results[index].status])),
  task_errors:results.filter(r=>r.status==='UNAVAILABLE'||r.status==='PARTIAL').map(r=>({task:r.task,message:r.message||r.reason||'Data or model unavailable.'})),
  multi:multi.items||[],
  recommendations:['READY','PARTIAL'].includes(replenishment.status)?replenishment.items.filter(r=>(r.recommended_quantity||0)>0).slice(0,10):[],alerts:['READY','PARTIAL'].includes(stockout.status)?stockout.items.filter(r=>r.risk).slice(0,10):[]});
}));
router.use('/research',requireRoles('PLATFORM_ADMIN'));
router.get('/research/datasets',asyncRoute(async(req,res)=>{const [items]=await pool.execute('SELECT DISTINCT dataset_id FROM organization_dataset_access ORDER BY dataset_id');res.json({items});}));
router.use('/research/:dataset',asyncRoute(async(req,res,next)=>{
 if(req.params.dataset!=='nckh-2022-2023')throw new HttpError(404,'Không tìm thấy dataset');
 next();
}));
router.get('/research/:dataset/status',asyncRoute(async(req,res)=>{
 let database={status:'UNAVAILABLE',message:'Nguồn MySQL nghiên cứu chưa được cấu hình hoặc chưa nạp trên máy này.'};
 try {
  const [runs]=await researchSelect('SELECT COUNT(*) total FROM retail_management.ai_forecast_runs');
  const [snapshots]=await researchSelect('SELECT COUNT(*) total,MAX(snapshot_date) latest_snapshot FROM retail_management.branch_inventory');
  database={status:'READY',runs:Number(runs[0]?.total||0),inventory_snapshots:Number(snapshots[0]?.total||0),latest_snapshot:snapshots[0]?.latest_snapshot||null};
 } catch { /* Keep dataset artifacts usable when the optional research database is absent. */ }
 let artifacts={status:'UNAVAILABLE',message:'Không tải được bộ kết quả nghiên cứu đã bàn giao.'};
 try { const data=await aiCall('/v1/research/runs'); artifacts={status:'READY',runs:data.runs?.length||0}; } catch { /* Report the source state without exposing technical errors. */ }
 res.json({dataset:req.params.dataset,database,artifacts});
}));
router.get('/research/:dataset/runs',asyncRoute(async(req,res)=>res.json(await aiCall('/v1/research/runs'))));
router.get('/research/:dataset/forecasts',asyncRoute(async(req,res)=>{
 const q=z.object({run:z.enum(['MA2_80_10_10_V1','AUTO_SELECTION_ARCHIVE']),q:z.string().max(100).default(''),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)}).parse(req.query);
 res.json(await aiCall('/v1/research/forecasts?'+new URLSearchParams(Object.entries(q).map(([k,v])=>[k,String(v)]))));
}));
router.get('/research/:dataset/products',asyncRoute(async(req,res)=>{
 const q=z.string().max(100).parse(req.query.q||'');const [items]=await researchSelect('SELECT product_id,style_code,listing_price,cost_price,group_id FROM retail_management.products WHERE product_id LIKE ? ORDER BY product_id LIMIT 100',['%'+q+'%']);res.json({items,source:'HISTORICAL_RESEARCH'});
}));
router.get('/research/:dataset/mysql-runs',asyncRoute(async(req,res)=>{
 const [items]=await researchSelect('SELECT run_id,model_name,model_version,forecast_month,training_end_date,test_wape,test_mae,test_rmse,data_source FROM retail_management.ai_forecast_runs ORDER BY run_id DESC');res.json({items,source:'HISTORICAL_RESEARCH_MYSQL'});
}));
router.get('/research/:dataset/mysql-forecasts',asyncRoute(async(req,res)=>{
 const q=z.object({run_id:positiveId,q:z.string().max(100).default(''),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)}).parse(req.query);
 const [[count]]=await researchSelect('SELECT COUNT(*) total FROM retail_management.ai_forecast_sku_results WHERE run_id=? AND product_id LIKE ?',[q.run_id,'%'+q.q+'%']);
 const [items]=await researchSelect(`SELECT f.product_id,f.forecast_month,f.predicted_quantity,r.model_name,r.model_version,r.data_source FROM retail_management.ai_forecast_sku_results f JOIN retail_management.ai_forecast_runs r ON r.run_id=f.run_id WHERE f.run_id=? AND f.product_id LIKE ? ORDER BY f.product_id LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`,[q.run_id,'%'+q.q+'%']);res.json({items,total:count.total,page:q.page,source:'HISTORICAL_RESEARCH_MYSQL'});
}));
router.get('/research/:dataset/inventory',asyncRoute(async(req,res)=>{
 const q=z.object({branch_id:positiveId.optional(),q:z.string().max(100).default(''),snapshot:z.iso.date().optional(),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(100).default(100)}).parse(req.query);
 const [[latest]]=await researchSelect('SELECT MAX(snapshot_date) snapshot FROM retail_management.branch_inventory');
 const date=q.snapshot||latest.snapshot;if(!date)return res.json({items:[],total:0,page:q.page,limit:q.limit,source:'HISTORICAL_RESEARCH',snapshot:null});
 const values=[date,'%'+q.q+'%'];let where='snapshot_date=? AND product_id LIKE ?';if(q.branch_id){where+=' AND branch_id=?';values.push(q.branch_id);}
 const [[count]]=await researchSelect(`SELECT COUNT(*) total FROM retail_management.branch_inventory WHERE ${where}`,values);
 const [items]=await researchSelect(`SELECT branch_id,product_id,quantity_on_hand,quantity_reserved,quantity_incoming,data_source,snapshot_date FROM retail_management.branch_inventory WHERE ${where} ORDER BY branch_id,product_id LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`,values);res.json({items,total:Number(count.total),page:q.page,limit:q.limit,source:'HISTORICAL_RESEARCH',snapshot:date,notice:'Tồn kho lịch sử; giữ nguyên nhãn SIMULATED/ACTUAL của nguồn, không phải tồn kho vận hành hiện tại'});
}));
export default router;
