import { primarySupabase } from './supabase-config.mjs';
import { getPumalifeAccessToken } from './pumalife-session.mjs';
import { parseGomshipWarehouseList, suggestGomshipWarehouse, matchLocalWarehouse, formatGomshipWarehouse, buildGomshipWarehouseCreatePayload, validateGomshipWarehouseChoice } from './gomship-warehouse.mjs';

// GomShip is the default carrier; the user may still switch to direct SPX.
const byId = (id) => document.getElementById(id);

export function isGomshipSelected() {
  return byId('shipmentCarrier')?.value === 'gomship';
}

export function setupGomshipControls() {
  const provider = byId('shipmentCarrier');
  if (!provider || provider.dataset.gomshipBound) return;
  provider.dataset.gomshipBound = '1';

  const refreshView = () => {
    const gomship = isGomshipSelected();
    const heading = byId('shipmentModalHeading');
    if (heading) heading.textContent = gomship ? 'Tạo vận đơn qua GomShip (SPX)' : 'Tạo vận đơn SPX Express';
    const btnLabel = byId('jtSubmitLabel');
    if (btnLabel) btnLabel.textContent = gomship ? 'Tạo vận đơn GomShip' : 'Tạo Đơn SPX';
    const warehouseGroup = byId('gomshipWarehouseGroup');
    if (warehouseGroup) warehouseGroup.style.display = gomship ? 'block' : 'none';
    const pumalifeWarehouse = byId('jtWarehouseSelect');
    if (pumalifeWarehouse) pumalifeWarehouse.required = !gomship;
    const payerGroup = byId('gomshipPaymentMethodGroup');
    if (payerGroup) { payerGroup.hidden = !gomship; payerGroup.style.display = gomship ? '' : 'none'; }
  };
  provider.addEventListener('change', refreshView);
  byId('jtWarehouseSelect')?.addEventListener('change', syncGomshipWarehouseSelection);
  byId('gomshipWarehouseSelect')?.addEventListener('change', () => {
    const select = byId('gomshipWarehouseSelect');
    if (select) select.dataset.selection = 'manual';
    const selected = gomshipWarehouses.find(w => String(w.id) === String(select?.value));
    const status = byId('gomshipWarehouseStatus');
    if (status) status.textContent = selected
      ? 'Đã chọn thủ công kho GomShip #' + selected.id +
        '. Xác nhận địa chỉ lấy hàng trước khi tạo vận đơn.'
      : 'Vui lòng chọn kho GomShip tương ứng.';
  });
  byId('gomshipWarehouseReload')?.addEventListener('click', () => {
    loadGomshipWarehouseCatalog().catch(error => {
      const status = byId('gomshipWarehouseStatus');
      if (status) status.textContent = 'Lỗi tải kho GomShip: ' + error.message;
    });
  });
  const createPanel = byId('gomshipCreateWarehousePanel');
  createPanel?.addEventListener('toggle', () => {
    if (createPanel.open) openGomshipWarehouseCreator().catch(showWarehouseCreateError);
  });
  byId('gsWhProvince')?.addEventListener('change', () => {
    loadCreateWarehouseWards().catch(showWarehouseCreateError);
  });
  byId('gsWhCreateSubmit')?.addEventListener('click', () => {
    createGomshipWarehouseFromForm().catch(showWarehouseCreateError);
  });
  refreshView();
}

function getFunctionSettings() {
  if (!primarySupabase?.url || !primarySupabase?.anonKey) {
    throw new Error('Thiếu cấu hình Supabase chính.');
  }
  return {
    url: primarySupabase.url.replace(/\/$/, '') + '/functions/v1/gomship-create-order',
    anonKey: primarySupabase.anonKey
  };
}

let gomshipWarehouses = [];

function selectedLocalWarehouse() {
  const select = byId('jtWarehouseSelect');
  const option = select?.options?.[select.selectedIndex];
  if (!select?.value || !option) return null;
  return {
    id: String(select.value),
    name: option.dataset?.localName || '',
    sender_name: option.dataset?.senderName || '',
    sender_phone: option.dataset?.senderPhone || '',
    sender_detail_address: option.dataset?.senderAddress || '',
    is_default: option.dataset?.localDefault === 'true' ||
      String(option.textContent || '').trim().startsWith('★')
  };
}

export function syncGomshipWarehouseSelection() {
  const select = byId('gomshipWarehouseSelect');
  const status = byId('gomshipWarehouseStatus');
  if (!select) return;
  const local = selectedLocalWarehouse();
  const suggested = suggestGomshipWarehouse(local, gomshipWarehouses);
  const matching = suggested?.warehouse || null;
  select.value = matching ? String(matching.id) : '';
  select.dataset.selection = 'auto';
  if (status) status.textContent = matching
    ? (suggested.reason === 'address'
        ? 'Đã khớp địa chỉ kho Pumalife với GomShip #' + matching.id
        : 'Đã chọn kho mặc định GomShip #' + matching.id) +
      (matching.address ? ' — ' + matching.address : '')
    : (gomshipWarehouses.length
      ? 'Đã tải ' + gomshipWarehouses.length + ' kho GomShip. Hãy chọn kho lấy hàng thực tế bên trên.'
      : 'Chưa tải danh sách kho GomShip.');
}

export async function loadGomshipWarehouseCatalog({ resetSelection = false } = {}) {
  const select = byId('gomshipWarehouseSelect');
  const previousManualId = !resetSelection && select?.dataset?.selection === 'manual' ? String(select.value || '') : '';
  const status = byId('gomshipWarehouseStatus');
  if (select) select.innerHTML = '<option value="">Đang tải kho GomShip...</option>';
  if (status) status.textContent = 'Đang đối chiếu kho gửi hàng với tài khoản GomShip...';
  gomshipWarehouses = [];
  try {
    const response = await callGomshipFunction({action:'list_warehouses'});
    // Parse the complete response, not only one assumed wrapper shape.
    gomshipWarehouses = parseGomshipWarehouseList(response);
    if (select) {
      select.replaceChildren(new Option('Chọn kho lấy hàng trên GomShip', ''));
      for (const w of gomshipWarehouses) {
        select.add(new Option(formatGomshipWarehouse(w), String(w.id)));
      }
    }
    if (previousManualId && gomshipWarehouses.some(w => String(w.id) === previousManualId) && select) {
      select.value = previousManualId;
      select.dataset.selection = 'manual';
      const retained = gomshipWarehouses.find(w => String(w.id) === previousManualId);
      if (status) status.textContent = 'Đã tải ' + gomshipWarehouses.length +
        ' kho từ GET /warehouses; giữ kho đã chọn: ' + formatGomshipWarehouse(retained);
    } else {
      syncGomshipWarehouseSelection();
    }
    if (!gomshipWarehouses.length && status)
      status.textContent = 'GomShip chưa có kho. Hãy tạo kho mới trước khi lập vận đơn.';
    return gomshipWarehouses;
  } catch (error) {
    if (select) select.replaceChildren(new Option('Không tải được kho GomShip', ''));
    if (status) status.textContent = 'Không tải được kho GomShip: ' + error.message;
    throw error;
  }
}

function showWarehouseCreateError(error) {
  const status = byId('gsWhCreateStatus');
  if (status) status.textContent = 'Lỗi: ' + (error?.message || error);
}

async function openGomshipWarehouseCreator() {
  const local = selectedLocalWarehouse();
  if (local) {
    byId('gsWhName').value = local.name || '';
    byId('gsWhContact').value = local.sender_name || local.name || '';
    byId('gsWhPhone').value = local.sender_phone || '';
    byId('gsWhAddress').value = local.sender_detail_address || '';
  }
  const select = byId('gsWhProvince');
  select.replaceChildren(new Option('Đang tải tỉnh/thành GomShip...', ''));
  const provinces = await listGomshipLocations('provinces-2tier');
  select.replaceChildren(new Option('Chọn tỉnh/thành GomShip', ''));
  for (const item of provinces) {
    const option = new Option(item.name, item.code);
    option.dataset.name = item.name;
    select.add(option);
  }
  const status = byId('gsWhCreateStatus');
  if (status) status.textContent = 'Đã tải địa giới 2 cấp của GomShip; hãy chọn tỉnh và phường.';
}

async function loadCreateWarehouseWards() {
  const province = byId('gsWhProvince');
  const wards = byId('gsWhWard');
  wards.replaceChildren(new Option('Chọn tỉnh trước...', ''));
  if (!province?.value) return;
  wards.replaceChildren(new Option('Đang tải phường/xã...', ''));
  const options = await listGomshipLocations('wards-2tier',{provinceCode:province.value});
  wards.replaceChildren(new Option('Chọn phường/xã GomShip', ''));
  for (const item of options) {
    const option = new Option(item.name,item.code);
    option.dataset.name = item.name;
    wards.add(option);
  }
}

export async function createGomshipWarehouseFromForm() {
  const button = byId('gsWhCreateSubmit');
  if (button?.disabled) return;
  const province = byId('gsWhProvince');
  const ward = byId('gsWhWard');
  const provinceOption = province?.options?.[province.selectedIndex];
  const wardOption = ward?.options?.[ward.selectedIndex];
  const warehouse = buildGomshipWarehouseCreatePayload({
    name:byId('gsWhName')?.value,contact_name:byId('gsWhContact')?.value,
    contact_phone:byId('gsWhPhone')?.value,address:byId('gsWhAddress')?.value,
    city:provinceOption?.dataset?.name || '',
    province_code:province?.value,ward:wardOption?.dataset?.name || '',
    ward_code:ward?.value
  });
  const description = warehouse.name + '\\n' + warehouse.contact_phone + '\\n' +
    warehouse.address + ', ' + warehouse.ward + ', ' + warehouse.city;
  if (!window.confirm('TẠO KHO MỚI TRÊN GOMSHIP?\\n' + description +
    '\\n\\nKho mới KHÔNG được đặt làm mặc định.')) return {cancelled:true};
  if (button) button.disabled = true;
  const status = byId('gsWhCreateStatus');
  if (status) status.textContent = 'Đang gửi yêu cầu tạo kho lên GomShip...';
  try {
    const response = await callGomshipFunction(
      {action:'create_warehouse',warehouse},{authorizedWrite:true});
    if (status) status.textContent = 'GomShip đã xác nhận tạo kho. Đang tải lại danh sách kho...';
    await loadGomshipWarehouseCatalog();
    const select = byId('gomshipWarehouseSelect');
    const createdId = String(response.warehouse_id || '');
    const newWarehouse = gomshipWarehouses.find(w => String(w.id) === createdId) ||
      gomshipWarehouses.find(w => w.name === warehouse.name &&
        w.address === warehouse.address && w.phone === warehouse.contact_phone);
    if (newWarehouse && select) {
      select.value = String(newWarehouse.id);
      select.dataset.selection = 'manual';
      if (status) status.textContent = 'Đã tạo và chọn kho GomShip #' + newWarehouse.id;
    } else if (status) {
      status.textContent = 'Đã tạo kho nhưng chưa đối chiếu được ID; chọn kho mới trong danh sách để sử dụng.';
    }
    return response;
  } catch(error) {
    if (status) status.textContent = 'Tạo kho chưa xác nhận: ' + error.message +
      '. Hãy tải lại danh sách kho trước khi thử tạo lại.';
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

export async function callGomshipFunction(payload, { authorizedWrite = false } = {}) {
  const { url, anonKey } = getFunctionSettings();
  const userToken = authorizedWrite ? await getPumalifeAccessToken() : null;
  if (authorizedWrite && !userToken)
    throw new Error('Vui lòng đăng nhập lại Pumalife trước khi tạo kho GomShip.');
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': 'Bearer ' + (userToken || anonKey)
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35000)
    });
  } catch (error) {
    throw new Error('Không gọi được function: ' + (error?.message || error) +
      '. Kiểm tra function đã deploy ở Supabase chính và Verify JWT còn bật.');
  }
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 600) }; }
  if (!response.ok || data?.success === false) {
    const details = String(data?.error || data?.message || JSON.stringify(data));
    if (/Refresh GomShip thất bại.*401|Kiểm tra phiên đăng nhập/i.test(details)) {
      throw new Error('Phiên xác thực GomShip đã hết hạn (HTTP 401). Chủ shop cần đăng nhập lại và đồng bộ phiên GomShip, sau đó bấm Tải lại danh sách kho.');
    }
    throw new Error('HTTP ' + response.status + ': ' + details);
  }
  return data;
}

// Server-side proxy: both GomShip 2-tier and 3-tier use GomShip's own
// official location catalog. No GomShip authentication token is exposed.
export async function listGomshipLocations(level, {
  province = '', district = '', provinceCode = ''
} = {}) {
  const result = await callGomshipFunction({
    action: 'list_locations', level, province, district,
    province_code: provinceCode
  });
  if (!Array.isArray(result.items) || !result.items.length)
    throw new Error('Danh mục địa chỉ GomShip đang trống (' + level + ')');
  return result.items.map(item => ({
    code: String(item.code ?? '').trim(),
    name: String(item.name ?? '').trim()
  })).filter(item => item.code && item.name);
}
// Keep previous import compatibility for 3-tier tests and consumers.
export const listGomshipLegacyLocations = listGomshipLocations;

// GomShip create-order API: 0 = Người gửi trả; 1 = Người nhận trả.
export function getGomshipPaymentMethod() {
  const value = byId('gomshipPaymentMethod')?.value ?? '0';
  if (value !== '0' && value !== '1')
    throw new Error('Người trả phí vận chuyển GomShip không hợp lệ.');
  return Number(value);
}

export function buildGomshipPayloadFromForm({ includeOrder = true } = {}) {
  const selected = (id) => {
    const el = byId(id);
    const option = el?.options?.[el.selectedIndex];
    return option?.dataset?.name || option?.textContent?.trim() || '';
  };
  const provinceName = selected('jtProvince');
  const addressThreeTier = document.querySelector('input[name="jtAddressDataType"]:checked')?.value === '2';
  const addressMode = addressThreeTier ? '3-tier' : '2-tier';
  const districtName = addressThreeTier ? selected('jtDistrict') : '';
  const wardName = addressThreeTier ? selected('jtWard') : selected('jtDistrict');
  const receiver = {
    name: byId('jtReceiverName')?.value?.trim() || '',
    phone: byId('jtReceiverPhone')?.value?.trim() || '',
    province: { name: provinceName },
    ...(addressThreeTier ? { district: { name: districtName } } : {}),
    ward: { name: wardName },
    detail_address: byId('jtReceiverAddress')?.value?.trim() || ''
  };
  if (!provinceName || (addressThreeTier && !districtName) || !wardName)
    throw new Error('Vui lòng chọn đủ tỉnh/thành, quận/huyện (nếu dùng 3 cấp) và phường/xã trước khi tạo GomShip.');

  const request = {
    address_mode: addressMode,
    receiver,
    product: {
      name: byId('jtGoodsName')?.value?.trim() || 'giày',
      weight: Number(byId('jtWeight')?.value || 1),
      price: Number(byId('gomshipProductValue')?.value || 999999)
    },
    cod: Number(byId('jtCodMoney')?.value || 0),
    payment_method: getGomshipPaymentMethod(),
    note: byId('gomshipNote')?.value?.trim() || '[CHO THỬ HÀNG]'
  };

  if (addressThreeTier) {
    // GomShip 3-tier selections are sourced from GomShip, NOT SPX location_id.
    for (const id of ['jtProvince', 'jtDistrict', 'jtWard']) {
      const sel = byId(id);
      const option = sel?.options?.[sel.selectedIndex];
      if (!sel?.value || option?.dataset?.source !== 'gomship')
        throw new Error('Địa chỉ 3 cấp chưa tải từ GomShip. Hãy chọn lại Tỉnh / Huyện / Xã.');
    }
    request.province_code = byId('jtProvince').value;
    request.district_code = byId('jtDistrict').value;
    request.ward_code = byId('jtWard').value;
  } else {
    // In GomShip 2-tier, jtDistrict is the ward picker.
    // Never send SPX location_id or legacy manually entered codes.
    for (const id of ['jtProvince', 'jtDistrict']) {
      const sel = byId(id);
      const option = sel?.options?.[sel.selectedIndex];
      if (!sel?.value || option?.dataset?.source !== 'gomship')
        throw new Error('Địa chỉ 2 cấp chưa tải từ GomShip. Hãy chọn lại Tỉnh / Phường / Xã.');
    }
    request.province_code = byId('jtProvince').value;
    request.ward_code = byId('jtDistrict').value;
  }
  if (includeOrder) {
    request.action = 'create';
    request.order_id = byId('jtLocalOrderId')?.value || '';
  }
  return request;
}

function findWaybill(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 4) return null;
  const keys = ['tracking_number', 'tracking_no', 'tracking_code', 'waybill_number',
    'waybill_code', 'waybill_id', 'carrier_tracking_number', 'spx_tn',
    'shipping_code', 'order_code'];
  for (const key of keys) {
    const value = String(node[key] ?? '').trim().toUpperCase();
    if (/^SPXVN[A-Z0-9]+$/.test(value)) return value;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      const found = findWaybill(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function extractGomshipTracking(result) {
  const response = result?.gomship_response || result?.gomship || result;
  const direct = String(result?.spx_waybill || '').trim().toUpperCase();
  const waybill = /^SPXVN[A-Z0-9]+$/.test(direct) ? direct : findWaybill(response);
  // A numeric GomShip ID or GSS order_code must never be used as an SPX waybill.
  return { waybill: waybill || '', raw: response };
}

export async function submitGomshipForm({ groupOrderIds = [] } = {}) {
  const payload = buildGomshipPayloadFromForm();
  if (groupOrderIds.length > 1) payload.group_order_ids = groupOrderIds.map(String);
  const local = selectedLocalWarehouse();
  const warehouse = validateGomshipWarehouseChoice(
    local, gomshipWarehouses, byId('gomshipWarehouseSelect')?.value,
    {manual: byId('gomshipWarehouseSelect')?.dataset?.selection === 'manual'}
  );
  payload.warehouse_id = warehouse.id;
  // A manually picked GomShip warehouse may not correspond to the selected
  // Pumalife warehouse. Never record a wrong local warehouse ID on the order.
  const matched = matchLocalWarehouse(local, gomshipWarehouses);
  const suggested = suggestGomshipWarehouse(local, gomshipWarehouses);
  const linked = matched?.id === warehouse.id ||
    (local?.is_default && suggested?.warehouse?.id === warehouse.id);
  if (linked) payload.pumalife_warehouse_id = local.id;
  if (!payload.order_id) throw new Error('Thiếu ID đơn hàng Pumalife.');
  if (!payload.receiver.name || !payload.receiver.phone || !payload.receiver.detail_address)
    throw new Error('Thiếu thông tin người nhận.');

  const confirmed = window.confirm(
    'XÁC NHẬN TẠO VẬN ĐƠN THẬT QUA GOMSHIP (SPX)?\\n' +
    (groupOrderIds.length > 1
      ? 'Đơn gộp: ' + groupOrderIds.join(', ') + '\\n'
      : 'Đơn: ' + payload.order_id + '\\n') +
    'Người nhận: ' + payload.receiver.name + '\\n' +
    'Kho lấy hàng GomShip: ' + warehouse.name + ' (#' + warehouse.id + ') — ' + warehouse.address + '\\n' +
    'COD: ' + Number(payload.cod).toLocaleString('vi-VN') + ' đ\\n' +
    'Phí vận chuyển: ' + (payload.payment_method === 1 ? 'Người nhận trả' : 'Người gửi trả') + '\\n' +
    'Thao tác này có thể phát sinh phí vận chuyển.'
  );
  if (!confirmed) return { cancelled: true };
  const result = await callGomshipFunction(payload);
  return { result, localWarehouseId: payload.pumalife_warehouse_id || null,
    ...extractGomshipTracking(result) };
}