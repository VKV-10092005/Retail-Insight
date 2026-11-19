export function allowedOrigins(origins, environment) {
 const configured=String(origins||'').split(',').map(value=>value.trim()).filter(Boolean);
 const normalized=configured.map(origin=>{
  const parsed=new URL(origin);
  if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==origin)throw Error('FRONTEND_URL/CORS_ORIGIN must contain explicit HTTP(S) origins without paths or trailing slashes');
  return origin;
 });
 return [...new Set([...normalized,...(environment==='development'?['http://localhost:5173','http://127.0.0.1:5173']:[])])];
}

export function isAllowedVercelOrigin(origin, environment) {
 if(environment!=='production'||typeof origin!=='string')return false;
 try{
  const parsed=new URL(origin);
  if(parsed.protocol!=='https:'||parsed.origin!==origin)return false;
  return parsed.hostname==='vercel.app'||parsed.hostname.endsWith('.vercel.app');
 }catch{return false;}
}
