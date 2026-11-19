import {Router} from 'express';
import {createDocumentWriter} from './writer.js';
// Explicit factory only. app.js does NOT import/mount this router in A1.
export function createP14LedgerRouter({authenticate,tenantScope,...dependencies}){
 if(typeof authenticate!=='function'||typeof tenantScope!=='function')throw Error('Auth middleware required');
 const router=Router(),post=createDocumentWriter(dependencies);
 router.use(authenticate,tenantScope);
 for(const [path,type] of [['sales','SALE'],['receipts','RECEIPT']]){
  router.post('/'+path,(req,res,next)=>{
   const supplied=[req.headers['x-organization-id'],req.query.organization_id,req.body?.organization_id].filter(v=>v!==undefined);
   if(supplied.some(v=>String(v)!==String(req.organizationId)))return res.status(403).json({code:'TENANT_FORBIDDEN'});
   post({context:{org:req.organizationId,userId:req.user?.id,sessionId:req.sessionId},type,body:req.body})
    .then(r=>res.status(r.replayed?200:201).json(r)).catch(next);
  });
 }
 return router;
}

