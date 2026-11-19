import {pool} from '../db/pool.js';

const cache=new Map();
export async function getSettings(scopeType,scopeId){
 const [rows]=await pool.execute('SELECT settings FROM app_settings WHERE scope_type=? AND scope_id=?',[scopeType,String(scopeId)]);
 if(!rows.length)return {};
 const value=rows[0].settings;return typeof value==='string'?JSON.parse(value):value||{};
}
export async function saveSettings(scopeType,scopeId,settings){
 await pool.execute('INSERT INTO app_settings(scope_type,scope_id,settings) VALUES (?,?,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)',[scopeType,String(scopeId),JSON.stringify(settings)]);
 cache.delete(String(scopeType)+':'+String(scopeId));return settings;
}
export async function getPlatformSettings(){
 const key='PLATFORM:global',now=Date.now(),current=cache.get(key);if(current&&current.expires>now)return current.value;
 const value=await getSettings('PLATFORM','global');cache.set(key,{value,expires:now+2000});return value;
}
