import {assertControl} from './domain.js';
// Standalone readiness/drain building block, deliberately not mounted in app/server.
export function createP14Lifecycle({enabled=false,probe,close=async()=>{}}={}){
 let draining=false,inflight=0,waiters=[];
 return {
  async readiness(){
   if(!enabled||draining)return {ready:false,reason:draining?'DRAINING':'NOT_ACTIVATED'};
   try{assertControl(await probe());return {ready:true};}catch{return {ready:false,reason:'INCOMPATIBLE_OR_UNAVAILABLE'};}
  },
  enter(){
   if(!enabled||draining)throw Error('P14 admission closed');
   inflight++;let done=false;
   return ()=>{if(done)return;done=true;inflight--;if(!inflight){for(const w of waiters)w();waiters=[];}};
  },
  async drain({timeoutMs=30000}={}){
   draining=true;
   let timer;
   try{
    if(inflight)await Promise.race([
     new Promise(resolve=>waiters.push(resolve)),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('P14 drain deadline; inflight must be cancelled by owner')),timeoutMs);})
    ]);
    await close();
   }finally{clearTimeout(timer);}
  },
  get inflight(){return inflight;}
 };
}

