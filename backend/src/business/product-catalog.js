import {pool} from '../db/pool.js';
import {HttpError} from '../utils/http.js';
import {assertBranch,positiveId} from './common.js';

export async function getBranchCatalogMode(user,branchId){
 const id=positiveId.parse(branchId);
 await assertBranch(user,id);
 const [[branch]]=await pool.execute("SELECT id,catalog_mode FROM branches WHERE id=? AND organization_id=? AND status='ACTIVE'",[id,user.organization_id]);
 return {id:Number(branch.id),catalog_mode:branch.catalog_mode};
}

export async function resolveProductWriteTarget(req,requestedBranchId){
 const role=req.user.role;
 if(!['OWNER','MANAGER','CASHIER','INVENTORY'].includes(role))throw new HttpError(403,'Không có quyền tạo sản phẩm');
 let branchId=requestedBranchId?positiveId.parse(requestedBranchId):null;
 if(!branchId&&role!=='OWNER'){
  const [assignments]=await pool.execute("SELECT branch_id FROM user_branch_roles WHERE organization_id=? AND user_id=? AND role=? ORDER BY branch_id",[req.organizationId,req.user.id,role]);
  if(assignments.length!==1)throw new HttpError(400,'Chọn chi nhánh cần tạo sản phẩm');
  branchId=Number(assignments[0].branch_id);
 }
 if(!branchId)return null;
 const branch=await getBranchCatalogMode(req.user,branchId);
 if(!['OWNER','MANAGER'].includes(role)&&branch.catalog_mode!=='INDEPENDENT')throw new HttpError(403,'Chỉ được tạo sản phẩm khi chi nhánh dùng danh mục độc lập');
 return branch.catalog_mode==='INDEPENDENT'?branch.id:null;
}

export async function assertProductVisibleInBranch(connection,organizationId,branchId,productId){
 const [[row]]=await connection.execute(`SELECT p.branch_id,b.catalog_mode,EXISTS(SELECT 1 FROM inventory_balances i WHERE i.organization_id=p.organization_id AND i.product_id=p.id AND i.branch_id=b.id) AS stocked_here FROM products p JOIN branches b ON b.organization_id=p.organization_id AND b.id=? WHERE p.organization_id=? AND p.id=?`,[branchId,organizationId,productId]);
 if(!row)throw new HttpError(404,'Sản phẩm không thuộc cửa hàng');
 const visible=row.catalog_mode==='INDEPENDENT'
  ? Number(row.branch_id)===Number(branchId)||Boolean(row.stocked_here)
  : row.branch_id==null||Number(row.branch_id)===Number(branchId);
 if(!visible)throw new HttpError(404,'Sản phẩm không thuộc danh mục của chi nhánh');
}
