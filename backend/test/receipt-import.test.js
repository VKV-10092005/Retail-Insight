import test from 'node:test';
import assert from 'node:assert/strict';
import {readReceiptCSV} from '../src/business/receipt-import.js';

test('receipt CSV accepts the documented columns and valid values',()=>{
 const result=readReceiptCSV('\uFEFFsku,quantity,unit_cost,note\r\nSKU-01,20,12500.50,"Lô đầu"\r\n');
 assert.equal(result.row_count,1);
 assert.deepEqual(result.issues,[]);
 assert.equal(result.rows[0].sku,'SKU-01');
 assert.equal(result.rows[0].quantity,20);
 assert.equal(result.rows[0].unit_cost,12500.5);
});

test('receipt CSV reports duplicate SKU, invalid quantity and invalid unit cost by row',()=>{
 const result=readReceiptCSV('sku,quantity,unit_cost,note\nSKU-01,0,abc,x\nSKU-01,2,100,y\n');
 assert.equal(result.row_count,2);
 assert.ok(result.issues.some(issue=>issue.row===2&&issue.message.includes('Số lượng')));
 assert.ok(result.issues.some(issue=>issue.row===2&&issue.message.includes('Đơn giá')));
 assert.ok(result.issues.some(issue=>issue.row===3&&issue.message.includes('lặp')));
});
