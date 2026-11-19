import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{MYSQL_DATABASE:'retail_app',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'1',MYSQL_USER:'isolated-test',MYSQL_PASSWORD:'isolated-test',JWT_SECRET:'isolated-test-secret-at-least-32-bytes',NODE_ENV:'test'});
const {period,filters}=await import('../src/business/common.js');
const {pool}=await import('../src/db/pool.js');
pool.query=pool.execute=pool.getConnection=async()=>{throw Error('Unit tests must never connect to MySQL');};
test.after(()=>pool.end());
for(const value of ['0001-01-01','1000-01-01','1900-02-28','2000-02-29','2024-02-29','2024-04-30','2024-12-31','2400-02-29','9999-12-31']){
 test('valid Gregorian day '+value,()=>assert.equal(period.parse({start:value,end:value}).start,value));
}
for(const value of ['0000-01-01','1900-02-29','2100-02-29','2023-02-29','2024-02-30','2024-04-31','2024-00-01','2024-13-01','2024-01-00','2024-01-32','2024-2-09','2024-02-9',' 2024-02-29','2024-02-29 ','2024-02-29T00:00:00Z','10000-01-01','']){
 for(const field of ['start','end'])test('reject '+field+' '+JSON.stringify(value),()=>assert.equal(period.safeParse({[field]:value}).success,false));
}
test('reject reversed interval with issue on end',()=>{
 const result=period.safeParse({start:'2024-03-01',end:'2024-02-29'});
 assert.equal(result.success,false);assert.ok(result.error.issues.some(i=>i.path[0]==='end'));
});
test('optional bounds and pagination defaults remain compatible',()=>{
 assert.deepEqual(period.parse({}),{page:1,limit:20});
 assert.equal(period.parse({start:'2024-02-29'}).start,'2024-02-29');
 assert.equal(period.parse({end:'2024-02-29'}).end,'2024-02-29');
 for(const suffix of ['\n','\r','\r\n'])for(const field of ['start','end'])assert.equal(period.safeParse({[field]:'2024-02-29'+suffix}).success,false);
});
test('UTC predicate preserves complete final day including maximum Gregorian date',()=>{
 const result=filters({id:1,organization_id:101,role:'OWNER'},{start:'0001-01-01',end:'9999-12-31'});
 assert.ok(!result.sql.includes('created_at'));
 assert.deepEqual(result.values,[101]);assert.equal(result.calendar.range_clipped,true);
 assert.ok(!result.sql.includes('DATE_ADD'));
});
test('non-owner branch constraint and existing id validation remain',()=>{
 const result=filters({id:2,organization_id:101,role:'CASHIER'},{branch_id:'11'});
 assert.match(result.sql,/scope.organization_id=d.organization_id/);
 assert.match(result.sql,/scope.branch_id=d.branch_id/);
 assert.deepEqual(result.values,[101,2,11]);
 for(const q of [{product_id:0},{category_id:-1},{page:0},{limit:101}])assert.equal(period.safeParse(q).success,false);
});
