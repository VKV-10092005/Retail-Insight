import {createHash} from 'node:crypto';
import {z} from 'zod';
import {Temporal} from '@js-temporal/polyfill';

export class P14Error extends Error {
 constructor(status,code,message=code){super(message);this.status=status;this.code=code;}
}
export const fail=(status,code)=>{throw new P14Error(status,code);};
export const ZONE='Asia/Ho_Chi_Minh';
export const EPOCH=1;
export const REQUEST_VERSION='document-envelope-v2';
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const price=z.number().finite().min(0).max(100000000)
 .refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'Tối đa 2 chữ số thập phân');
const base={
 branch_id:z.coerce.number().int().positive().max(4294967295),
 request_key:z.string().min(12).max(80),
 note:z.string().max(500).optional(),
 items:z.array(z.object({product_id:z.coerce.number().int().positive().max(4294967295),
  quantity:z.number().int().positive().max(100000),unit_price:price.optional()}).strict()).min(1).max(100)
};
const unique=v=>new Set(v.items.map(i=>i.product_id)).size===v.items.length;
const legacySchema=z.object(base).strict().refine(unique,'Không lặp sản phẩm');
const dateSchema=z.string().refine(isDate);
const newSchema=z.object({...base,business_date:dateSchema.optional()}).strict().refine(unique,'Không lặp sản phẩm');
export function isDate(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'0001-01-01')return false;
 try{return Temporal.PlainDate.from(s,{overflow:'reject'}).toString()===s;}catch{return false;}
}
export function parseDocument(raw,type,{legacy=false}={}){
 if(!['SALE','RECEIPT'].includes(type))fail(400,'DOCUMENT_TYPE');
 const d=(legacy?legacySchema:newSchema).parse(raw);
 d.items.sort((a,b)=>a.product_id-b.product_id);
 if(type==='SALE'&&d.items.some(i=>i.unit_price!==undefined))fail(400,'SALE_SERVER_PRICE');
 if(type==='RECEIPT'&&d.items.some(i=>i.unit_price===undefined))fail(400,'RECEIPT_PRICE_REQUIRED');
 return d;
}
// Zod field ordering, numeric unit_price and omitted fields match the existing writer.
export function legacyHash(raw,type){return hash(parseDocument(raw,type,{legacy:true}));}
export function cents(value){
 if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value*100-Math.round(value*100))>=0.00001))fail(400,'DECIMAL_INVALID');
 const text=typeof value==='number'?value.toFixed(2):String(value);
 if(!/^\d+(\.\d{1,2})?$/.test(text))fail(400,'DECIMAL_INVALID');
 const [whole,fraction='']=text.split('.');
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}
export const money=n=>(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');
export function envelope(d,type){
 return {version:REQUEST_VERSION,type,branch_id:d.branch_id,request_key:d.request_key,
  note:Object.hasOwn(d,'note')?{value:d.note}:{omitted:true},
  business_date:Object.hasOwn(d,'business_date')?{value:d.business_date}:{omitted:true},
  items:d.items.map(i=>({product_id:i.product_id,quantity:i.quantity,
   ...(i.unit_price===undefined?{}:{unit_price:money(cents(i.unit_price))})}))};
}
export function utcInstant(s){
 if(s instanceof Date)fail(503,'DRIVER_DATE_OBJECT'); // Never silently lose DB microseconds.
 if(typeof s!=='string')fail(503,'UTC_INSTANT_REQUIRED');
 return Temporal.Instant.from(s.includes('T')?s:s.replace(' ','T')+'Z');
}
export const utcSql=i=>i.toString({fractionalSecondDigits:6}).replace('T',' ').replace('Z','');
export function acceptance(raw){
 const i=utcInstant(raw),floor=i.round({smallestUnit:'second',roundingMode:'floor'});
 return {accepted_at_utc:utcSql(i),created_at:utcSql(floor).slice(0,19),
  business_date:floor.toZonedDateTimeISO(ZONE).toPlainDate().toString()};
}
export function monthRange(date){
 if(!isDate(date)||date<'1000-01-01'||date>='9999-12-01')fail(400,'PERIOD_DOMAIN');
 const start=Temporal.PlainDate.from(date).with({day:1});
 return {date_start:start.toString(),date_end_exclusive:start.add({months:1}).toString()};
}
export function assertControl(c){
 if(!c||c.mode!=='ENFORCED'||Number(c.schema_version)!==2||
  Number(c.required_writer_epoch)!==EPOCH||!['RECORDED_TIME','BUSINESS_DATE'].includes(c.reader_basis))
  fail(503,'P14_INCOMPATIBLE');
}
export function assertPolicy(p,branch,org){
 if(!p||String(p.organization_id)!==String(org)||String(p.branch_id)!==String(branch)||
  p.live_date_mode!=='TODAY_ONLY'||p.business_timezone!==ZONE||
  p.date_algorithm_version!=='business-date-v2')fail(503,'POLICY_MISSING_OR_INCOMPATIBLE');
}
export function assertPeriod(p,date){
 const r=monthRange(date);
 if(!p||p.live_state!=='OPEN'||p.date_start!==r.date_start||p.date_end_exclusive!==r.date_end_exclusive)
  fail(409,'PERIOD_CLOSED_OR_MISSING');
}
export function nextRevision(s){
 const n=BigInt(s);
 if(n<0n||n>=18446744073709551615n)fail(503,'REVISION_OVERFLOW');
 return (n+1n).toString();
}
export function prepareLines(d,type,products,balances){
 let total=0n;
 const lines=d.items.map(item=>{
  const p=products.find(p=>String(p.id)===String(item.product_id));
  const b=balances.find(b=>String(b.product_id)===String(item.product_id));
  if(!p||p.status!=='ACTIVE')fail(404,'PRODUCT_NOT_ACTIVE');
  if(!b||!Number.isInteger(Number(b.quantity)))fail(503,'BALANCE_MISSING');
  const next=BigInt(b.quantity)+(type==='SALE'?-1n:1n)*BigInt(item.quantity);
  if(next<0n)fail(409,'INSUFFICIENT_STOCK');
  if(next>2147483647n)fail(400,'STOCK_OVERFLOW');
  const unit=cents(type==='SALE'?p.sale_price:item.unit_price);
  total+=unit*BigInt(item.quantity);
  if(total>100000000000000n)fail(400,'TOTAL_OVERFLOW');
  return {...item,sku:p.sku,product_name:p.name,unit_price:money(unit),
   quantity_delta:type==='SALE'?-item.quantity:item.quantity,balance_after:Number(next)};
 });
 return {lines,total:money(total)};
}
export function replay(row,d,type,raw){
 if(!row)return null;
 if(String(row.branch_id)!==String(d.branch_id))fail(409,'REQUEST_KEY_CONFLICT');
 if(!row.receipt_id){
  if(row.business_date_origin==='SERVER_TODAY')fail(503,'INCOMPLETE_NATIVE_DOCUMENT');
  if(row.payload_hash!==legacyHash(raw,type))fail(409,'REQUEST_KEY_CONFLICT');
  return {id:row.id,total:row.total,replayed:true};
 }
 const eh=Buffer.isBuffer(row.envelope_hash)?row.envelope_hash.toString('hex'):row.envelope_hash;
 if(row.request_schema_version!==REQUEST_VERSION||eh!==hash(envelope(d,type)))
  fail(409,'REQUEST_KEY_CONFLICT');
 const result=typeof row.response_json==='string'?JSON.parse(row.response_json):row.response_json;
 if(!result||String(result.id)!==String(row.id))fail(503,'RECEIPT_CORRUPT');
 return {...result,replayed:true};
}

