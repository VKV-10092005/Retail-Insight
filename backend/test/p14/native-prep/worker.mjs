import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveNativeWorker} from './harness.js';
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 if(process.argv[2]!=='--prep-native-worker'||process.env.P14_PREP_CHILD!=='1'||!process.send)throw Error('PREP_NATIVE_DISABLED');
 let running,stopping=false;
 const send=m=>process.send?.(m);
 const subscribe=fn=>{process.on('message',fn);return ()=>process.off('message',fn);};
 const stop=async()=>{if(stopping)return;stopping=true;try{await running?.stop();process.exit(0);}catch{process.exit(1);}};
 process.once('message',async message=>{
  try{
   if(message.kind!=='PREP_START')throw Error('PREP_START_REQUIRED');
   const mysql=await import('mysql2/promise');
   running=await serveNativeWorker(message,{createPool:options=>mysql.default.createPool(options),
    listen:(app,port,host)=>new Promise((r,j)=>{const s=app.listen(port,host,()=>r(s));s.once('error',j);}),send,subscribe});
   send({kind:'PREP_READY',pid:process.pid,connectionId:running.connectionId});
   process.on('message',m=>{if(m.kind==='PREP_STOP')void stop();});
   process.once('disconnect',stop);process.once('SIGTERM',stop);
  }catch{send({kind:'PREP_REJECTED'});process.exitCode=1;process.disconnect?.();}
 });
}
