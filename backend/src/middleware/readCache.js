const DEFAULT_TTL_MS=30_000;
const MAX_ENTRIES=5_000;
const MAX_CACHE_BYTES=32*1024*1024;
const MAX_ENTRY_BYTES=1024*1024;
const cache=new Map();
let cacheBytes=0;
const cacheablePath=/^\/(?:dashboard\/overview|branches|categories|products|inventory(?:\/balances|\/movements)?|sales\/open|bi\/overview|platform\/(?:dashboard|organizations|security\/(?:stats|logs|notifications)))$/;

function removeCache(key){const entry=cache.get(key);if(entry){cacheBytes-=entry.bytes;cache.delete(key);}}
function trimCache(){
 while(cache.size>MAX_ENTRIES||cacheBytes>MAX_CACHE_BYTES)removeCache(cache.keys().next().value);
}

export function invalidateReadCache(req,_res,next){
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  if(req.user?.role==='PLATFORM_ADMIN'||!req.organizationId){cache.clear();cacheBytes=0;}
  else for(const [key,entry] of cache)if(String(entry.organizationId)===String(req.organizationId))removeCache(key);
 }
 next();
}

export function cacheReadResponses(_req,res,next){
 const req=_req;
 if(req.method!=='GET'||!req.user||!cacheablePath.test(req.path))return next();
 const organizationId=req.organizationId??req.user.organization_id??'platform';
 const branchId=req.query.branch_id||req.query.branchId||req.params.branchId||req.body?.branch_id||'all';
 const key=[organizationId,branchId,req.user.id,req.user.role,req.originalUrl].join(':');
 const entry=cache.get(key);
 if(entry&&entry.expiresAt>Date.now()){
  removeCache(key);cache.set(key,entry);cacheBytes+=entry.bytes;
  res.set('X-API-Cache','HIT');
  return res.status(entry.status).type('application/json').send(entry.body);
 }
 if(entry)removeCache(key);
 const sendJson=res.json.bind(res);
 res.set('X-API-Cache','MISS');
 res.json=body=>{
  if(res.statusCode>=200&&res.statusCode<300){
   const serialized=JSON.stringify(body);
   const bytes=typeof serialized==='string'?Buffer.byteLength(serialized):MAX_ENTRY_BYTES+1;
   if(typeof serialized==='string'&&bytes<=MAX_ENTRY_BYTES){
    removeCache(key);
    cache.set(key,{status:res.statusCode,body:serialized,bytes,organizationId,branchId,expiresAt:Date.now()+DEFAULT_TTL_MS});
    cacheBytes+=bytes;trimCache();
   }
  }
  return sendJson(body);
 };
 next();
}
