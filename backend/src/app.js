import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import hpp from 'hpp';
import {rateLimit} from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { config } from './config/env.js';
import { isAllowedVercelOrigin } from './config/origins.js';
import { pool,verifyDatabase } from './db/pool.js';
import auth from './routes/auth.js';
import { authenticate,tenantScope,requireRoles,branchScope } from './middlewares/auth.js';
import { asyncRoute,HttpError } from './utils/http.js';
import catalog from './business/catalog.js';
import productImport from './business/product-import.js';
import receiptImport from './business/receipt-import.js';
import ledger from './business/ledger.js';
import bi from './business/bi.js';
import ai from './business/ai.js';
import platform from './routes/platform.js';
import support from './routes/support.js';
import tts from './routes/tts.js';
import assistant from './routes/assistant.js';
import categoriesRoute from './routes/categories.js';
import market from './business/market.js';
import marketIntelligence from './business/market-intelligence.js';
import notifications from './business/notifications.js';
import {calendarMetadata} from './business/business-calendar.js';
import settings from './business/settings.js';
import {getPlatformSettings} from './services/appSettings.js';
import {cacheReadResponses,invalidateReadCache} from './middleware/readCache.js';
import {createNotFoundScannerGuard} from './middlewares/threatProtection.js';
const app=express();
const __filename=fileURLToPath(import.meta.url);
const __dirname=dirname(__filename);
const frontendDist=join(__dirname,'..','..','frontend','dist');
const apiLimiter=rateLimit({windowMs:60_000,limit:100,standardHeaders:'draft-7',legacyHeaders:false,skip:req=>req.method==='OPTIONS'||(req.method==='GET'&&req.path==='/auth/me'),message:{message:'Quá nhiều yêu cầu. Vui lòng thử lại sau.'}});
const isPrivateDevelopmentOrigin=origin=>{
 if(!origin)return true;
 if(config.origins.includes(origin))return true;
 if(isAllowedVercelOrigin(origin,process.env.NODE_ENV))return true;
 if(config.production)return false;
 try{
  const url=new URL(origin);
  if(!['http:','https:'].includes(url.protocol))return false;
  const host=url.hostname;
  if(host==='localhost'||host==='127.0.0.1')return true;
  const octets=host.split('.').map(Number);
  if(octets.length!==4||octets.some(value=>!Number.isInteger(value)||value<0||value>255))return false;
  return (octets[0]===192&&octets[1]===168)||octets[0]===10;
 }catch{return false;}
};
const corsOptions={
 origin(origin,callback){
  const allowed=isPrivateDevelopmentOrigin(origin);
  callback(allowed?null:new HttpError(403,'Origin không được CORS cho phép'),allowed);
 },
 credentials:true
};
app.disable('x-powered-by');
app.use(helmet({
 contentSecurityPolicy:{directives:{defaultSrc:["'self'"],baseUri:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],formAction:["'self'",'https://accounts.google.com'],scriptSrc:["'self'",'https://accounts.google.com'],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],imgSrc:["'self'",'data:','blob:','https:'],fontSrc:["'self'",'data:','https://fonts.gstatic.com'],connectSrc:["'self'",'https:','wss:'],frameSrc:['https://accounts.google.com']},reportOnly:false},
 frameguard:{action:'deny'},noSniff:true,
 hsts:config.production?{maxAge:15_552_000,includeSubDomains:false}:false,
 referrerPolicy:{policy:'strict-origin-when-cross-origin'}
}));
app.set('trust proxy',process.env.TRUST_PROXY==='1'?1:false);
app.use((req,res,next)=>{const started=Date.now(),requestPath=req.path;res.on('finish',()=>console.log(JSON.stringify({method:req.method,path:requestPath,status:res.statusCode,elapsed_ms:Date.now()-started})));next();});
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({limit:'1mb',extended:true}));
app.use(hpp());
app.use(cookieParser());
app.use('/api', (req,res,next)=>{
 res.set('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
  if(req.headers.origin && !isPrivateDevelopmentOrigin(req.headers.origin)) return next(new HttpError(403,'Origin không được phép'));
  if(req.get('X-Requested-With')!=='retail-web') return next(new HttpError(403,'Thiếu header bảo vệ CSRF'));
 }
 next();
});
app.use('/api',createNotFoundScannerGuard());
app.use('/api/v1',apiLimiter);
app.get('/api/health',asyncRoute(async(req,res)=>{await verifyDatabase();res.json({status:'ok',database:'retail_app'});}));
app.use('/api/v1/auth',auth);
app.use('/api/v1',authenticate,asyncRoute(async(req,res,next)=>{
 const config=await getPlatformSettings();if(config.maintenance&&req.user?.role!=='PLATFORM_ADMIN')return res.status(503).json({message:'Hệ thống đang bảo trì. Vui lòng thử lại sau.'});next();
}));
app.use('/api/v1',tenantScope);
app.use('/api/v1/market-intelligence',marketIntelligence);
app.use('/api/v1',invalidateReadCache);
app.use('/api/v1',cacheReadResponses);
app.use('/api/v1/platform',platform);
app.use('/api/v1/tts',tts);
app.use('/api/v1/categories', categoriesRoute);
app.use('/api/v1',productImport,receiptImport,catalog,ledger,bi,ai,market,notifications,settings);
app.use('/api/v1/support', support);
app.use('/api/v1/assistant', assistant);
app.get('/api/v1/dashboard/overview',requireRoles('OWNER','MANAGER'),asyncRoute(async(req,res)=>{
 const [[row], [counts], [catCount], [prodCount], [receiptCount], [saleCount], [paymentCount]]=await Promise.all([
  pool.execute('SELECT name FROM organizations WHERE id=?',[req.organizationId]),
  pool.execute('SELECT COUNT(*) AS branches FROM branches WHERE organization_id=?',[req.organizationId]),
  pool.execute('SELECT COUNT(*) AS total FROM categories WHERE organization_id=?',[req.organizationId]),
  pool.execute("SELECT COUNT(*) AS total FROM products WHERE organization_id=? AND status='ACTIVE'",[req.organizationId]),
  pool.execute("SELECT COUNT(*) AS total FROM stock_documents WHERE organization_id=? AND type='RECEIPT'",[req.organizationId]),
  pool.execute("SELECT COUNT(*) AS total FROM stock_documents WHERE organization_id=? AND type='SALE'",[req.organizationId]),
  pool.execute('SELECT COUNT(*) AS total FROM branches WHERE organization_id=? AND bank_bin IS NOT NULL AND bank_account_number IS NOT NULL',[req.organizationId])
 ]);

 res.json({
  organization:{id:req.organizationId,name:row?.name || ''},
  branches:counts?.branches || 0,
  calendar:calendarMetadata(),
  onboarding:{
   has_categories:(catCount?.total || 0) > 0,
   category_count:catCount?.total || 0,
   has_products:(prodCount?.total || 0) > 0,
   product_count:prodCount?.total || 0,
   has_receipts:(receiptCount?.total || 0) > 0,
   receipt_count:receiptCount?.total || 0,
   has_sales:(saleCount?.total || 0) > 0,
   sale_count:saleCount?.total || 0,
   has_payment_settings:(paymentCount?.total || 0) > 0
  }
 });
}));
app.get('/api/v1/branches',asyncRoute(async(req,res)=>{
 const [rows]=req.user.role==='OWNER'
 ? await pool.execute('SELECT id,name,status,address,phone,catalog_mode FROM branches WHERE organization_id=?',[req.organizationId])
 : await pool.execute('SELECT b.id,b.name,b.status,b.address,b.phone,b.catalog_mode FROM branches b JOIN user_branch_roles r ON r.organization_id=b.organization_id AND r.branch_id=b.id WHERE r.organization_id=? AND r.user_id=?',[req.organizationId,req.user.id]);
 res.json({branches:rows});
}));
app.post('/api/v1/branches',requireRoles('OWNER'),asyncRoute(async(req,res)=>{
 const {name,address='',phone='',catalog_mode='SHARED'}=req.body||{};
 if(typeof name!=='string'||name.trim().length<2||name.trim().length>160)throw new HttpError(400,'Tên chi nhánh phải có từ 2 đến 160 ký tự');
 if(!['SHARED','INDEPENDENT'].includes(catalog_mode))throw new HttpError(400,'Chế độ danh mục không hợp lệ');
 const [result]=await pool.execute('INSERT INTO branches (organization_id,name,address,phone,catalog_mode) VALUES (?,?,?,?,?)',[req.organizationId,name.trim(),String(address).trim()||null,String(phone).trim()||null,catalog_mode]);
 res.status(201).json({branch:{id:result.insertId,name:name.trim(),address,phone,catalog_mode,status:'ACTIVE'}});
}));
app.put('/api/v1/branches/:branchId',requireRoles('OWNER'),asyncRoute(async(req,res)=>{
 const id=Number(req.params.branchId),{name,address='',phone='',catalog_mode='SHARED'}=req.body||{};
 if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,'Chi nhánh không hợp lệ');
 if(typeof name!=='string'||name.trim().length<2||name.trim().length>160)throw new HttpError(400,'Tên chi nhánh phải có từ 2 đến 160 ký tự');
 if(!['SHARED','INDEPENDENT'].includes(catalog_mode))throw new HttpError(400,'Chế độ danh mục không hợp lệ');
 const [result]=await pool.execute('UPDATE branches SET name=?,address=?,phone=?,catalog_mode=? WHERE id=? AND organization_id=?',[name.trim(),String(address).trim()||null,String(phone).trim()||null,catalog_mode,id,req.organizationId]);
 if(!result.affectedRows)throw new HttpError(404,'Không tìm thấy chi nhánh');
 res.json({branch:{id,name:name.trim(),address,phone,catalog_mode}});
}));
app.get('/api/v1/branches/:branchId',branchScope(),(req,res)=>res.json({branch:req.branch}));
app.get('/api/v1/branches/:branchId/management',branchScope('MANAGER'),(req,res)=>res.json({branch:req.branch}));
app.get('/api/v1/users',requireRoles('OWNER'),asyncRoute(async(req,res)=>{
 const [rows]=await pool.execute('SELECT id,email,full_name,role,status FROM users WHERE organization_id=?',[req.organizationId]);
 res.json({users:rows});
}));
// Phục vụ giao diện Frontend tĩnh và fallback SPA khi chạy độc lập / Production
if(existsSync(frontendDist)){
 app.use(express.static(frontendDist,{maxAge:'1d',etag:true}));
 app.get(/^(?!\/api).*/,(_req,res)=>res.sendFile(join(frontendDist,'index.html')));
}
app.use('/api',(req,res)=>res.status(404).json({message:'API chưa được triển khai'}));
app.use((req,res)=>res.status(404).json({message:'Đường dẫn không tồn tại'}));
app.use((err,req,res,next)=>{
 if(err instanceof ZodError){
  const dates=err.issues.filter(i=>['start','end'].includes(i.path[0]));
  const message=dates.length?dates.map(i=>i.path[0]+': '+i.message).join('; '):'Dữ liệu không hợp lệ';
  return res.status(400).json(config.production?{message}:{message,issues:err.issues.map(i=>({path:i.path,message:i.message}))});
 }
 if(err.code==='ER_DUP_ENTRY')return res.status(409).json({message:'Dữ liệu đã tồn tại'});
 if(err.code==='ER_NO_REFERENCED_ROW_2')return res.status(400).json({message:'Tham chiếu dữ liệu không hợp lệ'});
 const candidateStatus=Number(err.status);
 const status=Number.isInteger(candidateStatus)&&candidateStatus>=400&&candidateStatus<=599?candidateStatus:500;
 if(status>=500) console.error('API error:',req.method,req.originalUrl,err.code||err.name,err.message,err.stack);
 const message=status>=500?'Dịch vụ tạm thời không khả dụng':String(err.message||'Yêu cầu không hợp lệ');
 res.status(status).json({message});
});
export default app;



