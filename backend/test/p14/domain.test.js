import './no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {acceptance,isDate,monthRange,parseDocument,legacyHash,envelope,hash,replay,
 cents,money,prepareLines,assertControl,assertPolicy,nextRevision} from '../../src/p14/domain.js';
const sale={branch_id:11,request_key:'stable-request-0001',items:[{product_id:31,quantity:1}]};
for(const [s,expected] of [['2026-11-05 16:59:59.999999','2026-11-05'],
 ['2026-11-05 17:00:00.000001','2026-11-06'],['1970-01-01 16:00:00.000000','1970-01-02'],
 ['1975-06-11 16:00:00.000000','1975-06-12'],['2024-02-28 17:00:00.000000','2024-02-29']]){
 test('IANA acceptance '+s,()=>{
  const a=acceptance(s);assert.equal(a.business_date,expected);
  assert.equal(a.accepted_at_utc,s);assert.equal(a.created_at,s.slice(0,19));
 });
}
for(const s of ['0001-01-01','9999-12-31','2024-02-29'])test('Gregorian query domain '+s,()=>assert.ok(isDate(s)));
for(const s of ['0000-01-01','2023-02-29','2024-02-30','2024-1-01','2024-01-01\n'])test('invalid date '+JSON.stringify(s),()=>assert.ok(!isDate(s)));
test('monthly shape and DATE boundary',()=>{
 assert.deepEqual(monthRange('2024-02-29'),{date_start:'2024-02-01',date_end_exclusive:'2024-03-01'});
 assert.throws(()=>monthRange('9999-12-01'));assert.throws(()=>monthRange('0001-01-01'));
});
test('legacy hash exactly reproduces Zod field order/sort and JSON numeric semantics',()=>{
 const raw={items:[{quantity:2,product_id:32},{quantity:1,product_id:31}],note:'',request_key:sale.request_key,branch_id:11};
 const canonical={branch_id:11,request_key:sale.request_key,note:'',items:[{product_id:31,quantity:1},{product_id:32,quantity:2}]};
 assert.equal(legacyHash(raw,'SALE'),createHash('sha256').update(JSON.stringify(canonical)).digest('hex'));
});
test('legacy RECEIPT numeric unit_price remains numeric',()=>{
 const r={...sale,items:[{product_id:31,quantity:1,unit_price:1.2}]};
 assert.equal(legacyHash(r,'RECEIPT'),hash(r));
});
test('explicit date and omitted date differ only in versioned contract',()=>{
 const a=parseDocument(sale,'SALE'),b=parseDocument({...sale,business_date:'2026-11-06'},'SALE');
 assert.notEqual(hash(envelope(a,'SALE')),hash(envelope(b,'SALE')));
 assert.throws(()=>legacyHash({...sale,business_date:'2026-11-06'},'SALE'));
});
test('strict input rejects caller metadata, duplicate items and wrong price direction',()=>{
 for(const field of ['organization_id','created_at','writer_epoch','policy_id','accepted_at_utc'])
  assert.throws(()=>parseDocument({...sale,[field]:1},'SALE'));
 assert.throws(()=>parseDocument({...sale,items:[...sale.items,...sale.items]},'SALE'));
 assert.throws(()=>parseDocument(sale,'RECEIPT'));
 assert.throws(()=>parseDocument({...sale,items:[{...sale.items[0],unit_price:1}]},'SALE'));
});
test('decimal math preserves exact cents and stock limits',()=>{
 assert.equal(money(cents('99999999.99')),'99999999.99');
 const d=parseDocument(sale,'SALE');
 assert.deepEqual(prepareLines(d,'SALE',[{id:31,sku:'S',name:'N',status:'ACTIVE',sale_price:'0.29'}],[{product_id:31,quantity:1}]).total,'0.29');
 assert.throws(()=>prepareLines(d,'SALE',[{id:31,status:'ACTIVE',sale_price:'1.00'}],[{product_id:31,quantity:0}]),e=>e.code==='INSUFFICIENT_STOCK');
 const r=parseDocument({...sale,items:[{product_id:31,quantity:1,unit_price:1}]},'RECEIPT');
 assert.throws(()=>prepareLines(r,'RECEIPT',[{id:31,status:'ACTIVE'}],[{product_id:31,quantity:2147483647}]),e=>e.code==='STOCK_OVERFLOW');
});
test('native replay freezes ID/total and ignores current date or prices',()=>{
 const d=parseDocument(sale,'SALE'),row={id:'9007199254740993',branch_id:11,receipt_id:'1',
 request_schema_version:'document-envelope-v2',envelope_hash:Buffer.from(hash(envelope(d,'SALE')),'hex'),
 response_json:JSON.stringify({id:'9007199254740993',total:10,replayed:false})};
 assert.equal(replay(row,d,'SALE',sale).id,'9007199254740993');
 assert.throws(()=>replay({...row,branch_id:12},d,'SALE',sale),e=>e.code==='REQUEST_KEY_CONFLICT');
 assert.throws(()=>replay({...row,request_schema_version:'unknown'},d,'SALE',sale));
});
test('legacy replay never synthesizes receipt or policy',()=>{
 const d=parseDocument(sale,'SALE'),row={id:1,branch_id:11,total:'10.00',payload_hash:legacyHash(sale,'SALE')};
 assert.deepEqual(replay(row,d,'SALE',sale),{id:1,total:'10.00',replayed:true});
 assert.throws(()=>replay({...row,business_date_origin:'SERVER_TODAY'},d,'SALE',sale),e=>e.code==='INCOMPLETE_NATIVE_DOCUMENT');
});
test('compatibility and policy mismatch fail closed',()=>{
 for(const c of [null,{mode:'MAINTENANCE'},{mode:'ENFORCED',schema_version:2,required_writer_epoch:2}])assert.throws(()=>assertControl(c));
 assert.doesNotThrow(()=>assertControl({mode:'ENFORCED',schema_version:2,required_writer_epoch:1,reader_basis:'RECORDED_TIME'}));
 assert.throws(()=>assertPolicy({organization_id:2,branch_id:11},11,1));
 assert.equal(nextRevision('9007199254740993'),'9007199254740994');assert.throws(()=>nextRevision('18446744073709551615'));
});

