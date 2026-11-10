import test from 'node:test';
import assert from 'node:assert/strict';
import { findMessageRanges } from '../conversation-search-utils.mjs';
test('Vietnamese accents, case and đ', () => {
 const text = 'Đã GỬI hàng';
 const ranges = findMessageRanges(text, 'da gui');
 assert.deepEqual(ranges.map(([a,b]) => text.slice(a,b)), ['Đã GỬI']);
});
test('decomposed accents keep highlight boundaries', () => {
 const text = 'đa\u0303 nha\u0323\u0302n';
 const ranges = findMessageRanges(text, 'da nhan');
 assert.deepEqual(ranges, [[0,text.length]]);
});
test('literal product codes and regex characters', () => {
 assert.deepEqual(findMessageRanges('GW3774 size 42 + [a]', 'gw3774'), [[0,6]]);
 assert.deepEqual(findMessageRanges('a.* b', '.*'), [[1,3]]);
});
test('multiple matches and Unicode offsets', () => {
 const text = '👟 giá 795k, GIÁ 899k';
 assert.deepEqual(findMessageRanges(text, 'gia').map(([a,b]) => text.slice(a,b)), ['giá','GIÁ']);
});
test('blank and missing queries', () => {
 assert.deepEqual(findMessageRanges('hello', '   '), []);
 assert.deepEqual(findMessageRanges('hello', 'xyz'), []);
});
test('text resembling HTML is treated literally', () => {
 const text = '<img src=x onerror=alert(1)>';
 assert.deepEqual(findMessageRanges(text, '<img'), [[0,4]]);
});
