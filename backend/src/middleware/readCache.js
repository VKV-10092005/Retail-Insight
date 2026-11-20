const DEFAULT_TTL_MS=30_000;
const MAX_ENTRIES=5_000;
const MAX_CACHE_BYTES=32*1024*1024;
const MAX_ENTRY_BYTES=1024*1024;
const cache=new Map();
let cacheBytes=0;
const cacheablePath=/^\/(?:dashboard\/overview|branches|categories|products|inventory(?:\/balances|\/movements)?|stock-operations(?:\/[^/]+)?|sales(?:\/open)?|receipts|adjustments|transfers|bi\/overview|ai\/(?:forecast|summary)|platform(?:\/.*)?)$/;

function removeCache(key){const entry=cache.get(key);if(entry){cacheBytes-=entry.bytes;cache.delete(key);}}
function trimCache(){
 while(cache.size>MAX_ENTRIES||cacheBytes>MAX_CACHE_BYTES)removeCache(cache.keys().next().value);
}

function invalidateOrganization(organizationId,platformWide=false){
 if(platformWide||!organizationId){cache.clear();cacheBytes=0;return;}
 for(const [key,entry] of cache)if(String(entry.organizationId)===String(organizationId))removeCache(key);
}

export function invalidateReadCache(req,res,next){
 if(!['GET','HEAD','OPTIONS'].includes(req.method))res.once('finish',()=>{
  if(res.statusCode>=200&&res.statusCode<300)invalidateOrganization(req.organizationId,req.user?.role==='PLATFORM_ADMIN');
 });
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
