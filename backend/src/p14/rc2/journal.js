import {mkdir,lstat,open,rename,readFile,unlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {immutable,canonical,digest,reject,isHash} from './contracts.js';

export function journalNamespace({target,schema,releaseDigest,runId}){
 if(!target||!schema||!isHash(releaseDigest)||!/^[a-zA-Z0-9_-]{1,80}$/.test(runId))reject('JOURNAL_BINDING');
 return digest({target,schema,releaseDigest,runId});
}
async function noLinks(p,{allowAbsent=false}={}){
 for(let at=path.resolve(p);;at=path.dirname(at)){
  try{const info=await lstat(at);if(info.isSymbolicLink())reject('JOURNAL_SYMLINK');}
  catch(e){if(e.code!=='ENOENT'||!allowAbsent)throw e;}
  if(path.dirname(at)===at)break;
 }
}
export class FileJournal {
 constructor(root,binding,{durability='file-fsync',fault=async()=>{}}={}){
  this.root=path.resolve(root);this.binding=immutable(binding);
  this.namespace=journalNamespace(binding);this.directory=path.join(this.root,this.namespace);
  this.file=path.join(this.directory,'checkpoint.json');this.lockFile=path.join(this.directory,'owner.lock');
  this.token=null;this.handle=null;this.durability=durability;this.fault=fault;
 }
 async acquire(){
  if(this.handle)reject('JOURNAL_ALREADY_LOCKED');
  await noLinks(this.directory,{allowAbsent:true});
  await mkdir(this.directory,{recursive:true,mode:0o700});
  await noLinks(this.directory);
  const actual=await realpath(this.directory);
  if(path.relative(await realpath(this.root),actual)!==this.namespace)reject('JOURNAL_ESCAPE');
  this.token=randomUUID();
  try{
   this.handle=await open(this.lockFile,'wx',0o600);
   await this.handle.writeFile(canonical({token:this.token,pid:process.pid,namespace:this.namespace,binding:this.binding}));
   await this.handle.sync();
  }catch(e){if(this.handle){await this.handle.close();this.handle=null;}this.token=null;throw e;}
 }
 async assertOwned(){
  if(!this.handle||!this.token)reject('JOURNAL_NOT_LOCKED');
  await noLinks(this.lockFile);
  const owner=JSON.parse(await readFile(this.lockFile,'utf8'));
  if(owner.token!==this.token||owner.namespace!==this.namespace)reject('JOURNAL_LOCK_LOST');
 }
 async load(){
  await this.assertOwned();await noLinks(this.file,{allowAbsent:true});
  try{
   const envelope=JSON.parse(await readFile(this.file,'utf8'));
   if(envelope.namespace!==this.namespace||envelope.sha256!==digest(envelope.data)||
    canonical(envelope.binding)!==canonical(this.binding))reject('JOURNAL_CORRUPT_OR_FOREIGN');
   return envelope.data;
  }catch(e){if(e.code==='ENOENT')return {revision:0,rows:{}};throw e;}
 }
 async get(id){return (await this.load()).rows[id]??null;}
 async put(id,row){
  await this.assertOwned();
  const data=await this.load(),old=data.rows[id];
  if(old?.status==='VERIFIED'&&canonical(old)!==canonical(row))reject('JOURNAL_VERIFIED_IMMUTABLE');
  if(old?.checksum&&old.checksum!==row.checksum)reject('JOURNAL_STEP_CHANGED');
  data.rows[id]=structuredClone(row);data.revision++;
  const tmp=path.join(this.directory,'checkpoint.'+randomUUID()+'.tmp');
  const h=await open(tmp,'wx',0o600);
  try{
   await h.writeFile(canonical({namespace:this.namespace,binding:this.binding,data,sha256:digest(data)}));
   await h.sync();await this.fault('after-file-sync');
  }finally{await h.close();}
  await this.assertOwned();await noLinks(this.file,{allowAbsent:true});
  await rename(tmp,this.file);await this.fault('after-rename');
  // Directory fsync is opt-in and must work; never silently claim unsupported durability on Windows.
  if(this.durability==='file-and-directory-fsync'){
   const d=await open(this.directory,'r');try{await d.sync();}finally{await d.close();}
  }else if(this.durability!=='file-fsync')reject('JOURNAL_DURABILITY_POLICY');
 }
 async release(){
  if(!this.handle)return;
  await this.assertOwned();await this.handle.close();this.handle=null;
  await unlink(this.lockFile);this.token=null;
 }
}
// Test-only store has the same binding/ownership interface, never provides native evidence.
export class MemoryJournal {
 constructor(binding){this.binding=immutable(binding);this.rows=new Map();this.owned=false;}
 async acquire(){if(this.owned)reject('JOURNAL_LOCKED');this.owned=true;}
 async assertOwned(){if(!this.owned)reject('JOURNAL_NOT_LOCKED');}
 async get(id){await this.assertOwned();return this.rows.get(id)??null;}
 async put(id,row){
  await this.assertOwned();const old=this.rows.get(id);
  if(old?.status==='VERIFIED'&&canonical(old)!==canonical(row))reject('JOURNAL_VERIFIED_IMMUTABLE');
  this.rows.set(id,structuredClone(row));
 }
 async release(){this.owned=false;}
}

