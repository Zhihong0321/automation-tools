import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCountryCsv} from './country-industry-csv.js';

test('parses quoted commas, escaped quotes, embedded newlines and CRLF',()=>{
  assert.deepEqual(parseCountryCsv('name,email,notes\r\n"Acme, Inc",a@example.com,"one\ntwo ""quoted"""\r\n'),[
    ['name','email','notes'],['Acme, Inc','a@example.com','one\ntwo "quoted"']]);
});
test('handles empty values, final row without newline and malformed quotes',()=>{
  assert.deepEqual(parseCountryCsv('a,b,c\n1,,3\n4,5,'),[['a','b','c'],['1','','3'],['4','5','']]);
  assert.throws(()=>parseCountryCsv('"unclosed'),/unclosed/);
});
