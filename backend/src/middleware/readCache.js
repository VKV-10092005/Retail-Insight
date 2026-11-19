const DEFAULT_TTL_MS=20_000;
const MAX_ENTRIES=500;
const cache=new Map();
const cacheablePath=/^\/(?:dashboard\/overview|branches|categories|products|inventory(?:\/balances|\/movements)?|sales\/open|bi\/overview|platform\/(?:dashboard|organizations|security\/(?:stats|logs|notifications)))$/;

function trimCache(){
 while(cache.size>MAX_ENTRIES)cache.delete(cache.keys().next().value);
}

export function invalidateReadCache(_req,_res,next){
 if(!['GET','HEAD','OPTIONS'].includes(_req.method))cache.clear();
 next();
}

export function cacheReadResponses(_req,res,next){
 const req=_req;
 if(req.method!=='GET'||!req.user||!cacheablePath.test(req.path))return next();
 const key=[req.user.id,req.user.organization_id||'platform',req.user.role,req.originalUrl].join(':');
 const entry=cache.get(key);
 if(entry&&entry.expiresAt>Date.now()){
  cache.delete(key);cache.set(key,entry);
  res.set('X-API-Cache','HIT');
  return res.status(entry.status).type('application/json').send(entry.body);
 }
 if(entry)cache.delete(key);
 const sendJson=res.json.bind(res);
 res.set('X-API-Cache','MISS');
 res.json=body=>{
  if(res.statusCode>=200&&res.statusCode<300){
   const serialized=JSON.stringify(body);
   cache.set(key,{status:res.statusCode,body:serialized,expiresAt:Date.now()+DEFAULT_TTL_MS});
   trimCache();
  }
  return sendJson(body);
 };
 next();
}
