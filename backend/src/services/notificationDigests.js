import {pool} from '../db/pool.js';
import {businessDay,businessMonth,resolveBusinessRange} from '../business/business-calendar.js';
import {getSettings} from './appSettings.js';

export async function generateNotificationDigests({organizationId,userId=null,role='OWNER',type,period}){
 const base=period?new Date(`${period}T00:00:00Z`):new Date(),monthly=type==='MONTHLY';
 const periodKey=monthly?businessMonth(base):businessDay(base),start=monthly?`${periodKey}-01`:periodKey;
 const endDate=new Date(`${start}T00:00:00Z`);if(monthly)endDate.setUTCMonth(endDate.getUTCMonth()+1);else endDate.setUTCDate(endDate.getUTCDate()+1);
 const lastDate=new Date(endDate.getTime()-86400000).toISOString().slice(0,10),range=resolveBusinessRange({start,end:lastDate});
 const targets=[];
 if(role==='OWNER'){
  const [users]=await pool.execute("SELECT u.id,u.role,r.branch_id FROM users u LEFT JOIN user_branch_roles r ON r.organization_id=u.organization_id AND r.user_id=u.id WHERE u.organization_id=? AND u.status='ACTIVE' AND u.role IN ('OWNER','MANAGER','CASHIER','INVENTORY') ORDER BY u.id",[organizationId]);
  const byUser=new Map();for(const row of users){if(!byUser.has(row.id))byUser.set(row.id,{id:row.id,role:row.role,branchIds:[]});if(row.branch_id)byUser.get(row.id).branchIds.push(Number(row.branch_id));}targets.push(...byUser.values());
 }else{
  const [users]=await pool.execute('SELECT r.branch_id FROM user_branch_roles r WHERE r.organization_id=? AND r.user_id=?',[organizationId,userId]);
  targets.push({id:userId,role,branchIds:users.map(u=>Number(u.branch_id))});
 }
 let created=0;
 for(const target of targets){
  const preferences=await getSettings('USER',target.id),operations=preferences.operations||{};
  if((monthly?operations.monthlyDigest:operations.dailyDigest)!==true)continue;
  const lowStockThreshold=Number(operations.lowStockThreshold??10);
  const branchIds=target.role==='OWNER'?[]:target.branchIds;if(['CASHIER','INVENTORY'].includes(target.role)&&!branchIds.length)continue;
  let body;
  if(target.role==='INVENTORY'){
   const [low]=await pool.execute(`SELECT b.id branch_id,b.name branch_name,p.id product_id,p.name,p.sku,i.quantity,COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.min_stock')) AS DECIMAL(14,2)),?) min_stock FROM inventory_balances i JOIN products p ON p.organization_id=i.organization_id AND p.id=i.product_id JOIN branches b ON b.organization_id=i.organization_id AND b.id=i.branch_id WHERE i.organization_id=? AND p.status='ACTIVE' AND i.quantity<=COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'$.min_stock')) AS DECIMAL(14,2)),?) AND i.branch_id IN (${branchIds.map(()=>'?').join(',')}) ORDER BY i.quantity LIMIT 100`,[lowStockThreshold,organizationId,lowStockThreshold,...branchIds]);body={low_stock:low};
   const [receipts]=await pool.execute(`SELECT d.id,d.branch_id,b.name branch_name,d.created_at,d.total,d.note,COUNT(i.id) item_count FROM stock_documents d JOIN branches b ON b.organization_id=d.organization_id AND b.id=d.branch_id LEFT JOIN stock_document_items i ON i.organization_id=d.organization_id AND i.document_id=d.id WHERE d.organization_id=? AND d.type='RECEIPT' AND d.created_at>=? AND d.created_at<? AND d.branch_id IN (${branchIds.map(()=>'?').join(',')}) GROUP BY d.id,d.branch_id,b.name,d.created_at,d.total,d.note ORDER BY d.created_at DESC LIMIT 100`,[organizationId,range.startSql,range.endSql,...branchIds]);
   const [transfers]=await pool.execute(`SELECT d.id,d.branch_id source_branch_id,b.name source_branch,d.destination_branch_id,db.name destination_branch,d.created_at,COUNT(i.id) item_count FROM stock_documents d JOIN branches b ON b.organization_id=d.organization_id AND b.id=d.branch_id JOIN branches db ON db.organization_id=d.organization_id AND db.id=d.destination_branch_id LEFT JOIN stock_document_items i ON i.organization_id=d.organization_id AND i.document_id=d.id WHERE d.organization_id=? AND d.type='TRANSFER' AND d.created_at>=? AND d.created_at<? AND (d.branch_id IN (${branchIds.map(()=>'?').join(',')}) OR d.destination_branch_id IN (${branchIds.map(()=>'?').join(',')})) GROUP BY d.id,d.branch_id,b.name,d.destination_branch_id,db.name,d.created_at ORDER BY d.created_at DESC LIMIT 100`,[organizationId,range.startSql,range.endSql,...branchIds,...branchIds]);body={low_stock:low,recent_receipts:receipts,transfers};
  }else{
   const args=[organizationId,range.startSql,range.endSql];let branchSql='';if(branchIds.length){branchSql=` AND d.branch_id IN (${branchIds.map(()=>'?').join(',')})`;args.push(...branchIds);}
   const grossLine='(i.line_total-CASE WHEN COALESCE(d.subtotal,0)>COALESCE(d.item_discount_total,0) THEN i.line_total/NULLIF(d.subtotal-d.item_discount_total,0)*COALESCE(d.order_discount,0) ELSE 0 END)';
   const netLine=`(${grossLine}-CASE WHEN COALESCE(d.total,0)>0 THEN COALESCE(d.returned_amount,0)*${grossLine}/d.total ELSE 0 END)`;
   const [byBranch]=await pool.execute(`SELECT d.branch_id,b.name branch_name,COUNT(DISTINCT d.id) order_count,COALESCE(SUM(${netLine}),0) revenue FROM stock_documents d JOIN branches b ON b.organization_id=d.organization_id AND b.id=d.branch_id LEFT JOIN stock_document_items i ON i.organization_id=d.organization_id AND i.document_id=d.id WHERE d.organization_id=? AND d.type='SALE' AND d.payment_status='PAID' AND d.order_status='COMPLETED' AND d.created_at>=? AND d.created_at<?${branchSql} GROUP BY d.branch_id,b.name ORDER BY revenue DESC`,args);
   let previous=[];
   if(monthly){const prevStart=new Date(`${start}T00:00:00Z`);prevStart.setUTCMonth(prevStart.getUTCMonth()-1);const prevKey=prevStart.toISOString().slice(0,7),prevEnd=new Date(`${start}T00:00:00Z`),prevLast=new Date(prevEnd.getTime()-86400000).toISOString().slice(0,10),prevRange=resolveBusinessRange({start:`${prevKey}-01`,end:prevLast}),prevArgs=[organizationId,prevRange.startSql,prevRange.endSql];let prevBranch='';if(branchIds.length){prevBranch=` AND d.branch_id IN (${branchIds.map(()=>'?').join(',')})`;prevArgs.push(...branchIds);}previous=(await pool.execute(`SELECT d.branch_id,COALESCE(SUM(d.total),0) revenue FROM stock_documents d WHERE d.organization_id=? AND d.type='SALE' AND d.payment_status='PAID' AND d.created_at>=? AND d.created_at<?${prevBranch} GROUP BY d.branch_id`,prevArgs))[0];}
   if(target.role==='CASHIER'){
    const [own]=await pool.execute(`SELECT d.branch_id,b.name branch_name,COUNT(*) order_count,COALESCE(SUM(d.total),0) revenue FROM stock_documents d JOIN branches b ON b.organization_id=d.organization_id AND b.id=d.branch_id WHERE d.organization_id=? AND d.performed_by=? AND d.type='SALE' AND d.payment_status='PAID' AND d.created_at>=? AND d.created_at<?${branchSql} GROUP BY d.branch_id,b.name`,[organizationId,target.id,range.startSql,range.endSql,...branchIds]);body={cashier_id:target.id,branches:own};
   }else{
    body={branches:byBranch,total_orders:byBranch.reduce((n,b)=>n+Number(b.order_count),0),total_revenue:byBranch.reduce((n,b)=>n+Number(b.revenue),0),previous_month:previous};
    if(['OWNER','MANAGER'].includes(target.role)){
     const [profitByBranch]=await pool.execute(`SELECT d.branch_id,b.name branch_name,COALESCE(SUM(${netLine}),0) net_revenue,COALESCE(SUM((i.quantity-COALESCE(i.returned_quantity,0))*COALESCE(i.unit_cost,bal.average_cost,0)),0) total_cogs,COALESCE(SUM(${netLine}),0)-COALESCE(SUM((i.quantity-COALESCE(i.returned_quantity,0))*COALESCE(i.unit_cost,bal.average_cost,0)),0) gross_profit FROM stock_documents d JOIN branches b ON b.organization_id=d.organization_id AND b.id=d.branch_id LEFT JOIN stock_document_items i ON i.organization_id=d.organization_id AND i.document_id=d.id LEFT JOIN inventory_balances bal ON bal.organization_id=i.organization_id AND bal.branch_id=d.branch_id AND bal.product_id=i.product_id WHERE d.organization_id=? AND d.type='SALE' AND d.payment_status='PAID' AND d.order_status='COMPLETED' AND d.created_at>=? AND d.created_at<?${branchSql} GROUP BY d.branch_id,b.name ORDER BY d.branch_id`,args);
     for(const branch of byBranch){const profit=profitByBranch.find(row=>Number(row.branch_id)===Number(branch.branch_id));if(profit){branch.revenue=profit.net_revenue;branch.gross_profit=profit.gross_profit;branch.profit=profit.gross_profit;}}
     body.profit_by_branch=profitByBranch;body.total_gross_profit=profitByBranch.reduce((sum,row)=>sum+Number(row.gross_profit),0);body.total_cogs=profitByBranch.reduce((sum,row)=>sum+Number(row.total_cogs),0);
    }
   }
  }
  const title=`${monthly?'Báo cáo tháng':'Tổng kết ngày'} ${periodKey}`;
  for(const branchId of branchIds.length?branchIds:[null]){
   let subBody=body;
   if(branchId&&body.branches){
    const scopedBranches=body.branches.filter(branch=>Number(branch.branch_id)===branchId);
    const scopedProfit=body.profit_by_branch?.filter(branch=>Number(branch.branch_id)===branchId);
    subBody={...body,branches:scopedBranches,total_orders:scopedBranches.reduce((sum,row)=>sum+Number(row.order_count||0),0),total_revenue:scopedBranches.reduce((sum,row)=>sum+Number(row.revenue||0),0)};
    if(scopedProfit){subBody.profit_by_branch=scopedProfit;subBody.total_gross_profit=scopedProfit.reduce((sum,row)=>sum+Number(row.gross_profit),0);subBody.total_cogs=scopedProfit.reduce((sum,row)=>sum+Number(row.total_cogs),0);}
   }
   const [[exists]]=await pool.execute('SELECT id FROM notification_digests WHERE organization_id=? AND user_id=? AND digest_type=? AND period_key=? AND branch_id <=> ? LIMIT 1',[organizationId,target.id,type,periodKey,branchId]);if(exists)continue;
   await pool.execute('INSERT INTO notification_digests(organization_id,user_id,branch_id,digest_type,period_key,title,body) VALUES (?,?,?,?,?,?,?)',[organizationId,target.id,branchId,type,periodKey,title,JSON.stringify(subBody)]);created++;
  }
 }
 return {created,type,period:periodKey};
}

export async function generatePlatformNotificationDigests({userId=null,type,period}){
 const base=period?new Date(`${period}T00:00:00Z`):new Date(),monthly=type==='MONTHLY';
 const periodKey=monthly?businessMonth(base):businessDay(base),start=monthly?`${periodKey}-01`:periodKey;
 const endDate=new Date(`${start}T00:00:00Z`);if(monthly)endDate.setUTCMonth(endDate.getUTCMonth()+1);else endDate.setUTCDate(endDate.getUTCDate()+1);
 const lastDate=new Date(endDate.getTime()-86400000).toISOString().slice(0,10),range=resolveBusinessRange({start,end:lastDate});
 const [admins]=userId?[[{id:userId}]]:await pool.execute("SELECT id FROM users WHERE role='PLATFORM_ADMIN' AND status='ACTIVE' ORDER BY id");
 const [[orgs]]=await pool.execute('SELECT COUNT(*) total,COALESCE(SUM(status=\'ACTIVE\'),0) active FROM organizations');
 const [[newOrg]]=await pool.execute('SELECT COUNT(*) total FROM organizations WHERE created_at>=? AND created_at<?',[range.startSql,range.endSql]);
 const [[newUsers]]=await pool.execute("SELECT COUNT(*) total FROM users WHERE created_at>=? AND created_at<? AND role<>'PLATFORM_ADMIN'",[range.startSql,range.endSql]);
 const [[security]]=await pool.execute("SELECT COUNT(*) total,SUM(severity='CRITICAL') critical FROM audit_logs WHERE created_at>=? AND created_at<? AND (severity IN ('HIGH','CRITICAL') OR event_type LIKE '%SECURITY%')",[range.startSql,range.endSql]);
 const body={system_health:'HEALTHY',organizations:Number(orgs.total),active_organizations:Number(orgs.active),new_organizations:Number(newOrg.total),new_users:Number(newUsers.total),security_alerts:Number(security.total||0),critical_security_alerts:Number(security.critical||0)};
 let created=0;for(const admin of admins){const [[exists]]=await pool.execute('SELECT id FROM platform_notification_digests WHERE user_id=? AND digest_type=? AND period_key=?',[admin.id,type,periodKey]);if(exists)continue;await pool.execute('INSERT INTO platform_notification_digests(user_id,digest_type,period_key,title,body) VALUES (?,?,?,?,?)',[admin.id,type,periodKey,`${monthly?'Báo cáo nền tảng tháng':'Tổng kết nền tảng ngày'} ${periodKey}`,JSON.stringify(body)]);created++;}
 return {created,type,period:periodKey};
}
