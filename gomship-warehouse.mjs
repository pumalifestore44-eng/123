// Pumalife SPX warehouse IDs are NOT the GomShip warehouse IDs.
// Never send a local ID to GomShip without resolving it against GomShip's catalog.
const clean = value => String(value ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const digits = value => String(value ?? '').replace(/\D/g, '').replace(/^84/, '0');
const defaultFlag = value => value === true || value === 1 || value === '1' || value === 'true';

function detailAddress(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  return String(raw.specific_address ?? raw.detail_address ?? raw.full_address ??
    raw.address_line ?? raw.street_address ?? raw.address ?? '').trim();
}

// Read the actual GET /api/v1/warehouses response, including arrays inside
// data, result, pagination and common warehouse collection wrappers.
export function parseGomshipWarehouseList(response) {
  function findRows(node, depth = 0) {
    if (Array.isArray(node)) return node;
    if (!node || typeof node !== 'object' || depth > 4) return null;
    for (const key of ['data','items','warehouses','list','results','records','rows','result']) {
      if (node[key] === undefined) continue;
      const found = findRows(node[key], depth + 1);
      if (found) return found;
    }
    return null;
  }
  const rows = findRows(response);
  if (!rows) throw new Error('GET /warehouses không trả danh sách kho hợp lệ.');
  const records = rows.map(item => {
    const id = Number(item?.id ?? item?.warehouse_id);
    const location = item?.address_info ?? item?.location ??
      (item?.address && typeof item.address === 'object' ? item.address : {});
    return {
      id,
      name: String(item?.name ?? item?.warehouse_name ?? '').trim(),
      contact: String(item?.contact_name ?? item?.sender_name ??
        item?.contact?.name ?? item?.contact ?? '').trim(),
      phone: String(item?.contact_phone ?? item?.phone ?? item?.sender_phone ??
        item?.phone_number ?? item?.contact?.phone ?? '').trim(),
      address: detailAddress(item?.specific_address ?? item?.detail_address ??
        item?.address ?? item?.full_address ?? location),
      city: String(item?.city ?? item?.province ?? location?.city ?? '').trim(),
      district: String(item?.district ?? location?.district ?? '').trim(),
      ward: String(item?.ward ?? location?.ward ?? '').trim(),
      province_code: String(item?.province_code ?? location?.province_code ?? '').trim(),
      ward_code: String(item?.ward_code ?? location?.ward_code ?? '').trim(),
      is_default: defaultFlag(item?.is_default ?? item?.isDefault ?? item?.default ?? item?.is_primary),
      raw: item
    };
  }).filter(w => Number.isSafeInteger(w.id) && w.id > 0);
  const ids = new Set();
  return records.filter(w => !ids.has(w.id) && ids.add(w.id));
}

export function matchLocalWarehouse(local, official) {
  if (!local || !Array.isArray(official)) return null;
  const phone = digits(local.sender_phone);
  const address = clean(local.sender_detail_address);
  const names = [local.name, local.sender_name].map(clean).filter(Boolean);
  // Match a specific registered pickup location, never just a shared phone.
  const matches = official.filter(w => {
    const officialAddress = clean(w.address);
    const addressMatches = officialAddress === address ||
      officialAddress.startsWith(address + ' ') ||
      address.startsWith(officialAddress + ' ');
    if (!address || !officialAddress || !addressMatches) return false;
    const phoneMatches = phone && digits(w.phone) === phone;
    const nameMatches = clean(w.name) && names.includes(clean(w.name));
    return Boolean(phoneMatches || nameMatches);
  });
  return matches.length === 1 ? matches[0] : null;
}

// Only the explicitly marked Pumalife DEFAULT warehouse can use a default
// shortcut. For every other warehouse, a match or a user-selected GomShip
// warehouse is required. Legacy ID 24 is the owner's previously confirmed
// GomShip store-9 default, used only if still present in the live catalog.
export function suggestGomshipWarehouse(local, official) {
  if (!local || !Array.isArray(official) || !official.length) return null;
  const matched = matchLocalWarehouse(local, official);
  if (matched) return { warehouse: matched, reason: 'address' };
  if (!defaultFlag(local.is_default)) return null;
  const defaultEntries = official.filter(w => w.is_default);
  if (defaultEntries.length === 1) return { warehouse: defaultEntries[0], reason: 'default' };
  if (defaultEntries.length > 1) return null;
  const historicalDefault = official.find(w => w.id === 24);
  if (historicalDefault) return { warehouse: historicalDefault, reason: 'legacy_default' };
  if (official.length === 1) return { warehouse: official[0], reason: 'only_warehouse' };
  return null;
}

export function validateGomshipWarehouseChoice(local, official, selected, { manual = false } = {}) {
  const id = Number(selected);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error('Chưa chọn kho lấy hàng GomShip hợp lệ.');
  const warehouse = official.find(w => w.id === id);
  if (!warehouse) throw new Error('Kho được chọn không có trong tài khoản GomShip.');
  const suggestion = suggestGomshipWarehouse(local, official);
  if (suggestion?.warehouse.id === id) return warehouse;
  // Explicit manual choice from the official catalog is acceptable. The
  // confirmation dialog must show the chosen warehouse before the real POST.
  if (manual) return warehouse;
  throw new Error('Kho Pumalife chưa khớp với kho GomShip. Hãy chọn đúng kho GomShip trong danh sách.');
}

export function formatGomshipWarehouse(w) {
  return [
    (w.is_default ? '★ ' : '') + (w.name || 'Kho GomShip') + ' (#' + w.id + ')',
    [w.address, w.ward, w.district, w.city].filter(Boolean).join(', '),
    w.phone
  ].filter(Boolean).join(' — ');
}

export function buildGomshipWarehouseCreatePayload(form) {
  const name = String(form.name || '').trim();
  const contactName = String(form.contact_name || '').trim();
  const phone = String(form.contact_phone || '').trim();
  const address = String(form.address || '').trim();
  const city = String(form.city || '').trim();
  const provinceCode = String(form.province_code || '').trim();
  const ward = String(form.ward || '').trim();
  const wardCode = String(form.ward_code || '').trim();
  if (!name || !contactName || !/^0\d{9,10}$/.test(phone) ||
      !address || !city || !/^\d{1,3}$/.test(provinceCode) ||
      !ward || !/^\d{1,6}$/.test(wardCode)) {
    throw new Error('Hãy nhập đầy đủ tên kho, liên hệ, số điện thoại, địa chỉ và chọn tỉnh/phường GomShip.');
  }
  return {
    name, contact_name: contactName, contact_phone: phone,
    address, city, district: '', province_code: provinceCode,
    ward, ward_code: wardCode, is_default: false
  };
}