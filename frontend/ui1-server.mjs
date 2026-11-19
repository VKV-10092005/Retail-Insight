import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 if(process.argv[2]!=='--serve-ui1')throw Error('Explicit --serve-ui1 required');
 const root=fs.realpathSync(fileURLToPath(new URL('./dist-ui1/',import.meta.url)));
 if(!fs.existsSync(path.join(root,'ui1-preview.html')))throw Error('Build UI1 preview first');
 const server=http.createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  let p;try{p=decodeURIComponent(new URL(req.url,'http://ui1.invalid').pathname);}catch{res.writeHead(400);res.end();return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  if(p==='/'){res.writeHead(302,{Location:'/ui1-preview.html'});res.end();return;}
  if(!['/ui1-preview.html','/theme-init.js'].includes(p)&&!/^\/assets\/[a-zA-Z0-9_-]+\.(js|css|woff2|svg)$/.test(p)){res.writeHead(403);res.end('UI1 only; application and API access blocked');return;}
  try{
   const file=fs.realpathSync(path.join(root,p.slice(1)));
   if(!file.startsWith(root+path.sep))throw Error('Outside UI1 build');
   const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)];
   res.setHeader('Content-Type',type);if(req.method==='HEAD'){res.end();return;}
   const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{res.writeHead(404);res.end('UI1 artifact not found');}
 });
 server.on('error',()=>{console.error('UI1 server unavailable; check build and port13320');process.exitCode=1;});
 server.listen(13320,'127.0.0.1',()=>console.log('UI1_STATIC_READY http://127.0.0.1:13320/ui1-preview.html'));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}
