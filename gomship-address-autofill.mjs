// Parse user-entered administrative components without guessing codes.
// Actual codes are always selected from the live GomShip province/ward catalogs.
export function normalizeAdministrativeName(value = '') {
  return String(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(?:thanh pho|tp|t p|tinh|quan|q|huyen|h|thi xa|tx|phuong|p|xa|thi tran|tt|dac khu)\s+/, '')
    .trim();
}

const normalizeFullName = value => String(value || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function categoryOfName(value='') {
  const name = normalizeFullName(value);
  if (/^(?:tinh|thanh pho|tp|t p)\s/.test(name)) return 'province-or-city';
  if (/^(?:quan|q|huyen|h|thi xa|tx)\s/.test(name)) return 'district';
  if (/^(?:phuong|p|xa|thi tran|tt|dac khu)\s/.test(name)) return 'ward';
  return '';
}

// A segment beginning with a house number or an explicit street/building
// descriptor is detail, not a district or ward candidate. Other unlabelled
// segments still require an EXACT match against the live GomShip catalog.
function looksLikeAddressDetail(segment = '') {
  const value = normalizeFullName(segment);
  return /^(?:\d+[a-z]?(?:[\/.-]\d*[a-z]*)*\b|duong |pho |ngo |hem |ap |thon |khu pho |chung cu |toa nha |nha so |so nha )/.test(value);
}

export function parseGomshipAdministrativeAddress(value = '') {
  const segments = String(value).split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
  // Many orders write "Lâm Đồng" instead of "Tỉnh Lâm Đồng". Accept the
  // last comma-separated segment as a CANDIDATE only; the live GomShip picker
  // still must provide one exact normalized matching province before selection.
  const last = segments.at(-1) || '';
  const category = categoryOfName(last);
  const province = category === 'province-or-city' || (category === '' && segments.length >= 2)
    ? last : '';
  let ward = '', district = '';
  if (province) {
    const admin = segments.slice(0, -1);
    let wardIndex = -1;
    for (let i = admin.length - 1; i >= 0; i--) {
      const segment = admin[i];
      const kind = categoryOfName(segment);
      if (kind === 'ward' && !ward) {
        ward = segment;
        wardIndex = i;
      }
      if ((kind === 'district' || (kind === 'province-or-city' && i > 0)) &&
          !district) district = segment;
    }
    // Example: "... , phường 2, tân bình, Hồ Chí Minh".
    // Tân Bình is an UNPREFIXED district candidate located strictly between
    // a labelled ward and the province. It MUST match one district option
    // returned by GomShip for this province, otherwise no code is selected.
    if (!district && wardIndex >= 0) {
      const betweenWardAndProvince = admin.slice(wardIndex + 1);
      if (betweenWardAndProvince.length === 1 &&
          categoryOfName(betweenWardAndProvince[0]) === '') {
        district = betweenWardAndProvince[0];
      }
    }
    // Older 3-tier addresses often omit ALL administrative prefixes:
    // "Phước Bửu, Xuyên Mộc, Bà Rịa Vũng Tàu"
    // "5/10 Nguyễn Huệ, Phước Hòa, Phú Mỹ, Bà Rịa Vũng Tàu".
    // Treat the final two segments before the province as ward/district
    // CANDIDATES. Both must match the corresponding live GomShip catalogs.
    if (!ward && !district && admin.length >= 3 &&
        categoryOfName(admin.at(-1)) === '' &&
        categoryOfName(admin.at(-2)) === '') {
      ward = admin.at(-2);
      district = admin.at(-1);
    }

    // Three segments may be either:
    //  - "105 Mô Xoài, Bà Rịa, Hồ Chí Minh" (new 2-tier)
    //  - "Phước Bửu, Xuyên Mộc, Bà Rịa Vũng Tàu" (old 3-tier)
    // Look for a clearly street-like first segment before deciding. Never
    // guess the actual codes; the GomShip catalog must confirm every level.
    if (!ward && !district && admin.length === 2 &&
        categoryOfName(admin[0]) === '' &&
        categoryOfName(admin[1]) === '') {
      if (looksLikeAddressDetail(admin[0])) {
        ward = admin[1];
      } else {
        ward = admin[0];
        district = admin[1];
      }
    }

    // An explicit old district may be followed by an unprefixed ward:
    // "5/10 Nguyễn Huệ, Phước Hòa, Thị xã Phú Mỹ, Bà Rịa Vũng Tàu".
    if (district && !ward) {
      const districtIndex = admin.findIndex(item => item === district);
      const beforeDistrict = admin[districtIndex - 1];
      if (districtIndex > 0 && beforeDistrict &&
          categoryOfName(beforeDistrict) === '' &&
          !looksLikeAddressDetail(beforeDistrict)) {
        ward = beforeDistrict;
      }
    }
  }
  return { province, district, ward, twoTier: Boolean(province && ward && !district) };
}

// Only exact matches (or exact matches after stripping an administrative
// prefix) are allowed. Ambiguous names are rejected rather than guessed.
export function findGomshipAdministrativeOption(select, target) {
  if (!target) return null;
  const options = Array.from(select?.options || [])
    .filter(o => o.value && o.dataset?.source === 'gomship');
  const fullName = normalizeFullName(target);
  const exact = options.filter(o => normalizeFullName(o.dataset.name || o.textContent) === fullName);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const canonicalName = normalizeAdministrativeName(target);
  const normalized = options.filter(o =>
    normalizeAdministrativeName(o.dataset.name || o.textContent) === canonicalName);
  return normalized.length === 1 ? normalized[0] : null;
}

/**
 * Resolve address auto-fill source from the ACTUAL form state.
 * Never query SPX if the screen still shows GomShip administrative options.
 */
export function resolveAddressAutofillCarrier({
  carrierValue = '', carrierLabel = '', provinceOptions = []
} = {}) {
  const value = String(carrierValue).trim().toLowerCase();
  const gomshipList = Array.from(provinceOptions).some(option =>
    option?.dataset?.source === 'gomship' ||
    /gomship/i.test(String(option?.textContent || '')));
  const labelGomship = /gomship/i.test(String(carrierLabel));
  if (value === 'gomship' || (value !== 'spx' && (labelGomship || gomshipList)))
    return 'gomship';
  if (value === 'spx') return gomshipList ? 'mismatch' : 'spx';
  return 'unknown';
}