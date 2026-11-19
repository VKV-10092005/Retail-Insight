import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {startWorker} from './launcher.js';
// Importing this module is inert. Only an explicitly forked IPC child can accept a start message.
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 if(process.argv[2]!=='--rc2-disposable-worker'||process.env.P14_RC2_WORKER!=='1'||!process.send)
  throw Error('RC2 worker disabled: explicit approved test IPC controller required');
 let started=false;
 process.once('message',async message=>{
  try{
   if(started||message?.kind!=='RC2_START')throw Error('Start refused');started=true;
   // startWorker checks permit before invoking the connector or listen adapters.
   const mysql=await import('mysql2/promise');
   const running=await startWorker(message,{
    createPool:options=>mysql.default.createPool(options),
    listen:(app,port,host)=>new Promise((resolve,reject)=>{const s=app.listen(port,host,()=>resolve(s));s.on('error',reject);})
   });
   process.send({kind:'READY',instance:message.worker.instance,pid:process.pid,
    port:message.worker.port,serverUuid:running.identity.server_uuid});
   const stop=async()=>{await running.stop();process.exit(0);};
   process.once('SIGTERM',stop);process.once('disconnect',stop);
  }catch{process.send?.({kind:'REJECTED',code:'RC2_WORKER_START_REJECTED'});process.exitCode=1;process.disconnect?.();}
 });
}

