import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupGomshipControls, isGomshipSelected } from '../gomship-integration.mjs';

test('create-order modal defaults to GomShip and has no visible testing or advanced config panel', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const modal = html.split('<form id="jtOrderForm"')[1]?.split('</form>')[0];
  assert.ok(modal, 'Shipment form exists');
  const options = modal.match(/<option value="(?:gomship|spx)"[^>]*>[^<]*<\/option>/g);
  assert.ok(options && options.length === 2);
  assert.match(options[0], /value="gomship" selected/);
  assert.match(options[1], /value="spx"/);
  assert.doesNotMatch(modal, /gomshipTestAuth|gomshipTestAddress|gomshipTestStatus|gomshipSettings|Kiểm tra kết nối|Kiểm tra địa chỉ|Mã tỉnh GomShip|Ghi chú GomShip/);
  for (const [id,value] of [
    ['gomshipProvinceCode',''], ['gomshipDistrictCode',''], ['gomshipWardCode',''],
    ['gomshipProductValue','999999'], ['gomshipNote','[CHO THỬ HÀNG]']
  ]) {
    assert.ok(modal.includes('<input type="hidden" id="' + id + '" value="' + value + '">'),
      'Hidden payload field missing ' + id);
  }
  assert.match(app, /carrier\.value = 'gomship'; carrier\.dispatchEvent\(new Event\('change'\)\)/);
  assert.doesNotMatch(app, /carrier\.value = 'spx'/);
});

test('carrier select updates heading and button, without revealing any testing area', () => {
  const provider = {
    value: 'gomship', dataset: {}, callbacks: {},
    addEventListener(name, callback) { this.callbacks[name] = callback; }
  };
  const heading = { textContent: '' };
  const button = { textContent: '' };
  const nodes = {
    shipmentCarrier: provider,
    shipmentModalHeading: heading,
    jtSubmitLabel: button
  };
  globalThis.document = { getElementById: id => nodes[id] ?? null };
  setupGomshipControls();
  assert.equal(isGomshipSelected(), true);
  assert.match(heading.textContent, /GomShip/);
  assert.match(button.textContent, /GomShip/);
  provider.value = 'spx';
  provider.callbacks.change();
  assert.equal(isGomshipSelected(), false);
  assert.equal(heading.textContent, 'Tạo vận đơn SPX Express');
  assert.equal(button.textContent, 'Tạo Đơn SPX');
  provider.value = 'gomship';
  provider.callbacks.change();
  assert.equal(isGomshipSelected(), true);
  assert.match(heading.textContent, /GomShip/);
});
