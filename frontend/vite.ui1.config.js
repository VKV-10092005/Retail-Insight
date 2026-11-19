import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins:[react(),{name:'ui1-isolation',configureServer(server){
  server.middlewares.use((req,res,next)=>{
   let p;try{p=decodeURIComponent(new URL(req.url,'http://ui1.invalid').pathname);}catch{res.statusCode=400;res.end();return;}
   if(p==='/'){res.writeHead(302,{Location:'/ui1-preview.html'});res.end();return;}
   if(p.startsWith('/api')||p==='/index.html'||/^\/(?:src\/(?:main|app|auth|operations|pages|services)|@fs\/)/.test(p)){
    res.statusCode=403;res.end('UI1 preview blocks application and API entry points');return;
   }next();
  });
 }}],
 optimizeDeps:{entries:['ui1-preview.html']},
 envDir:false,server:{host:'127.0.0.1',port:13320,strictPort:true,proxy:{}},
 build:{outDir:'dist-ui1',rollupOptions:{input:'ui1-preview.html'}}
});
