const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeStatusText,
  getStatusCodeFromText,
  getStatusClass,
  getStatusTextFromCode,
} = require('../statusUtils.js');

test('normalizeStatusText keeps real order statuses instead of defaulting to mới', () => {
  assert.equal(normalizeStatusText('Đã xác nhận'), 'Đã xác nhận');
  assert.equal(normalizeStatusText('Đang giao'), 'Đang giao');
  assert.equal(normalizeStatusText('Chờ lấy hàng'), 'Chờ lấy hàng');
  assert.equal(normalizeStatusText('Chờ xử lý (Mới)'), 'Chờ xử lý (Mới)');
});

test('status mapping resolves the correct code and CSS class for real statuses', () => {
  assert.equal(getStatusCodeFromText('Đã xác nhận'), 1);
  assert.equal(getStatusCodeFromText('Đang giao'), 2);
  assert.equal(getStatusCodeFromText('Hoàn thành'), 3);
  assert.equal(getStatusClass('Đã xác nhận'), 'order-status-confirmed');
  assert.equal(getStatusClass('Hoàn thành'), 'order-status-done');
});

test('numeric status codes map to proper Vietnamese text', () => {
  assert.equal(getStatusTextFromCode(1), 'Đã xác nhận');
  assert.equal(getStatusTextFromCode(2), 'Đang giao');
  assert.equal(getStatusTextFromCode(3), 'Hoàn thành');
  assert.equal(getStatusTextFromCode(24), 'Đang vận chuyển');
});
