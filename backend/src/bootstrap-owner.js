import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
export const ownerInput = z.object({
 email:z.string().trim().toLowerCase().email().max(254),
 password:z.string().min(12).refine(v=>Buffer.byteLength(v)<=72),
 name:z.string().trim().min(2).max(120),
 storeName:z.string().trim().min(2).max(160)
});
// A dedicated connection owns both the advisory lock and the transaction.
export async function bootstrapOwner(connection, collect) {
 let locked=false, transaction=false;
 try {
  const [[db]]=await connection.query('SELECT DATABASE() AS name');
  if(db.name!=='retail_app')throw Error('WRONG_DATABASE');
  const [[lock]]=await connection.execute('SELECT GET_LOCK(?,0) AS acquired',['retail_app_bootstrap_owner']);
  if(lock.acquired!==1)throw Error('BOOTSTRAP_BUSY');
  locked=true;
  const check=async()=>{
   const [owners]=await connection.execute('SELECT id FROM users WHERE role=? LIMIT 1',['OWNER']);
   if(owners.length)throw Error('OWNER_EXISTS');
  };
  await check();
  const data=ownerInput.parse(await collect());
  const hash=await bcrypt.hash(data.password,12);
  await connection.beginTransaction();transaction=true;
  await check();
  const [org]=await connection.execute('INSERT INTO organizations(name,slug) VALUES (?,?)',[data.storeName,randomUUID()]);
  const [user]=await connection.execute('INSERT INTO users(organization_id,email,password_hash,full_name,role) VALUES (?,?,?,?,?)',[org.insertId,data.email,hash,data.name,'OWNER']);
  const [branch]=await connection.execute('INSERT INTO branches(organization_id,name) VALUES (?,?)',[org.insertId,data.storeName]);
  await connection.execute('INSERT INTO user_branch_roles(organization_id,user_id,branch_id,role) VALUES (?,?,?,?)',[org.insertId,user.insertId,branch.insertId,'OWNER']);
  await connection.commit();transaction=false;
  return {id:user.insertId,organizationId:org.insertId,branchId:branch.insertId,email:data.email};
 } finally {
  try {if(transaction)await connection.rollback();}
  finally {if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',['retail_app_bootstrap_owner']);}
 }
}
