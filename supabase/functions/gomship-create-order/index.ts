// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROOT = "https://api.gomship.vn/api/v1";
const STORE_ID = 9;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const send = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: CORS });
const message = e => e instanceof Error ? e.message : String(e);
const svcKey = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); }
  catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); }
})();
const db = createClient(Deno.env.get("SUPABASE_URL") || "", svcKey || "", {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function authRow() {
  let { data, error } = await db.from("gomship_auth").select("*").eq("id", STORE_ID).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const refresh_token = Deno.env.get("GOMSHIP_INITIAL_REFRESH_TOKEN");
  const device_id = Deno.env.get("GOMSHIP_DEVICE_ID");
  if (!refresh_token || !device_id) throw new Error(
    "Chưa có gomship_auth hoặc GOMSHIP_INITIAL_REFRESH_TOKEN, GOMSHIP_DEVICE_ID trong Secrets"
  );
  const created = await db.from("gomship_auth").insert({ id: STORE_ID, refresh_token, device_id });
  if (created.error && created.error.code !== "23505") throw created.error;
  ({ data, error } = await db.from("gomship_auth").select("*").eq("id", STORE_ID).single());
  if (error) throw error;
  return data;
}

async function access(force = false, rejectedToken = null) {
  // Restored shared-session authentication at the store owner's request.
  // Note: GomShip refresh-token rotation can log out browser sessions.
  // Prefer an existing valid access token before attempting any refresh.
  for (let i = 0; i < 3; i++) {
    const row = await authRow();
    const isValid = row.access_token && row.expires_at &&
      Date.parse(row.expires_at) > Date.now() + 60000;
    // Avoid needless refresh-token rotation if a parallel invocation has
    // already replaced the token that received a 401.
    if (isValid && (!force || (rejectedToken && row.access_token !== rejectedToken)))
      return row.access_token;
    console.info("GOMSHIP AUTH shared refresh", {
      store_id: STORE_ID, reason: force ? "carrier_401" : "token_expired"
    });
    const response = await fetch(ROOT + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: row.refresh_token, device_id: row.device_id }),
      signal: AbortSignal.timeout(20000)
    });
    const value = await response.json().catch(() => null);
    if (!response.ok || value?.success !== true || !value?.data?.access_token) {
      const newer = await authRow();
      if (newer.refresh_token !== row.refresh_token) { force = false; continue; }
      throw new Error("Refresh GomShip thất bại: HTTP " + response.status +
        " - " + String(value?.message || "Kiểm tra phiên đăng nhập"));
    }
    const { data: stored, error } = await db.from("gomship_auth").update({
      access_token: value.data.access_token,
      refresh_token: value.data.refresh_token || row.refresh_token,
      expires_at: new Date(Date.now() + (Number(value.data.expires_in) || 900) * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", STORE_ID).eq("refresh_token", row.refresh_token).select("id");
    if (error) throw error;
    if (stored?.length) return value.data.access_token;
    force = false;
  }
  throw new Error("Không đồng bộ được refresh token");
}

async function gomship(path, token, method = "GET", body, key) {
  const res = await fetch(ROOT + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
      "X-Store-Id": String(STORE_ID),
      ...(key ? { "Idempotency-Key": key } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000)
  });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { raw: txt.slice(0, 500) }; }
  return { ok: res.ok && data?.success !== false, status: res.status, data };
}

function listFrom(root) {
  return [root, root?.data, root?.data?.list, root?.data?.items,
    root?.data?.results, root?.data?.provinces, root?.data?.districts, root?.data?.wards,
    root?.items, root?.list, root?.districts, root?.wards].find(Array.isArray) || [];
}
const nameOf = row => String(row?.name ?? row?.province_name ?? row?.district_name ?? row?.ward_name ?? "");
const codeOf = row => String(row?.code ?? row?.province_code ?? row?.district_code ?? row?.ward_code ?? row?.id ?? "");
const normalize = s => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
// SPX may label "TP. Hồ Chí Minh", whereas GomShip lists "Thành phố Hồ Chí Minh".
// Match common administrative *abbreviations*, but still require exactly one matched
// catalog entry. The official GomShip name/code is used in every downstream request.
const canonicalPlaceName = value => normalize(value)
  .replace(/^tp(?:\.\s*|\s+)/, "thanh pho ")
  .replace(/^q(?:\.\s*|\s+)/, "quan ")
  .replace(/^h(?:\.\s*|\s+)/, "huyen ")
  .replace(/^p(?:\.\s*|\s+)/, "phuong ")
  .replace(/^tx(?:\.\s*|\s+)/, "thi xa ")
  .replace(/^tt(?:\.\s*|\s+)/, "thi tran ")
  .replace(/[.,]/g, " ")
  .replace(/\b0+(\d+)\b/g, "$1")
  .replace(/\s+/g, " ").trim()
  // GomShip sometimes includes the administrative type, e.g. "Tỉnh Cà Mau",
  // while the SPX picker provides only "Cà Mau". Removing a type prefix is
  // safe only with an exact unique catalog match; never guess a new province.
  .replace(/^(?:thanh pho|tinh) /, "");
async function locations(path, token) {
  const response = await gomship(path, token);
  if (!response.ok) throw new Error("Lỗi tải mã địa chỉ GomShip tại " + path + ": HTTP " + response.status);
  const list = listFrom(response.data);
  if (!list.length) throw new Error("Không đọc được danh sách địa chỉ GomShip");
  return list;
}

// Read-only location catalog for both GomShip address modes. Fetching
// provinces/wards must not refresh the store's login session.
async function publicGomshipLocations(path: string) {
  if (!/^\/locations\/(?:provinces|districts|wards|provinces-2tier|wards-2tier)(?:\?|$)/.test(path))
    throw new Error("Đường dẫn danh mục địa giới không hợp lệ");
  const response = await fetch(ROOT + path, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false)
    throw new Error("GomShip không trả danh mục 3 cấp: HTTP " + response.status +
      (payload?.message ? " - " + String(payload.message).slice(0, 150) : ""));
  const list = listFrom(payload);
  if (!list.length) throw new Error("Danh mục địa chỉ GomShip trống tại " + path);
  return list;
}
function matchName(list, name) {
  const requested = canonicalPlaceName(name);
  const matches = list.filter(row => canonicalPlaceName(nameOf(row)) === requested);
  if (!matches.length) {
    throw new Error('Không tìm thấy địa chỉ "' + name + '" trong danh mục GomShip (' +
      list.length + ' mục). Kiểm tra danh mục 3 cấp, tên tỉnh hoặc nhập mã GomShip hợp lệ.');
  }
  // Some catalogs repeat the same record. Only collapse *identical codes*;
  // different codes for the same normalized name must stay ambiguous.
  const uniqueCodes = [...new Set(matches.map(codeOf))];
  if (matches.length > 1 && (uniqueCodes.length !== 1 || !uniqueCodes[0])) {
    throw new Error('Địa chỉ "' + name + '" khớp ' + matches.length +
      ' mục GomShip với mã khác nhau (' +
      matches.map(row => codeOf(row) || '?').slice(0, 8).join(', ') +
      '). Hãy nhập mã GomShip chính xác, không tự chọn ngẫu nhiên.');
  }
  return matches[0];
}
function addressModeOf(input) {
  const mode = String(input.address_mode || input.receiver?.address_mode || "2-tier").trim();
  if (mode !== "2-tier" && mode !== "3-tier")
    throw new Error("address_mode phải là 2-tier hoặc 3-tier");
  return mode;
}
async function resolveAddress(input, token) {
  const mode = addressModeOf(input);
  const receiver = input.receiver || {};
  let province_code = String(input.province_code || receiver.province?.gomship_code || "").trim();
  let province_name = String(input.province_name || receiver.province?.name || "").trim();
  let district_code = String(input.district_code || receiver.district?.gomship_code || "").trim();
  let district_name = String(input.district_name || receiver.district?.name || "").trim();
  let ward_code = String(input.ward_code || receiver.ward?.gomship_code || "").trim();
  let ward_name = String(input.ward_name || receiver.ward?.name || "").trim();

  if (mode === "3-tier") {
    // Official GomShip legacy (63-province) location catalog:
    // GET /locations/provinces
    // GET /locations/districts?province=<province name>
    // GET /locations/wards?province=<province name>&district=<district name>
    // SPX picker IDs must never be sent as GomShip administrative codes.
    // Explicit, complete GomShip codes/names can be used without any lookup.
    if (!(province_code && province_name && district_code && district_name && ward_code && ward_name)) {
      try {
        if (!province_code && !province_name) throw new Error("Thiếu tỉnh/thành phố");
        if (!district_code && !district_name) throw new Error("Thiếu quận/huyện");
        if (!ward_code && !ward_name) throw new Error("Thiếu phường/xã");

        const canonical = canonicalPlaceName;
        const pick = (list, code, name, label) => {
          const normalizedCode = value => String(value ?? "").replace(/^0+(?=\d)/, "");
          const codeMatches = row => normalizedCode(codeOf(row)) === normalizedCode(code);
          const row = code ? list.find(codeMatches) : matchName(list, name);
          if (!row) throw new Error("Không tìm thấy " + label + (code ? " mã " + code : " tên " + name));
          if (name && canonical(nameOf(row)) !== canonical(name))
            throw new Error("Tên và mã " + label + " không khớp: " + name);
          if (!codeOf(row) || !nameOf(row)) throw new Error("GomShip thiếu mã hoặc tên " + label);
          return row;
        };

        const province = pick(await locations("/locations/provinces", token),
          province_code, province_name, "tỉnh/thành");
        province_code = codeOf(province);
        province_name = nameOf(province);

        const district = pick(await locations("/locations/districts?province=" +
          encodeURIComponent(province_name), token), district_code, district_name, "quận/huyện");
        district_code = codeOf(district);
        district_name = nameOf(district);

        const ward = pick(await locations("/locations/wards?province=" +
          encodeURIComponent(province_name) + "&district=" +
          encodeURIComponent(district_name), token), ward_code, ward_name, "phường/xã");
        ward_code = codeOf(ward);
        ward_name = nameOf(ward);
      } catch (error) {
        throw new Error("Không tra được địa chỉ GomShip 3 cấp (" + message(error) +
          "). Hãy chọn đúng tỉnh/quận/phường hoặc nhập đủ mã GomShip.");
      }
    }
    if (!(province_code && province_name && district_code && district_name && ward_code && ward_name))
      throw new Error("Địa chỉ 3 cấp cần đủ tỉnh/thành, quận/huyện, phường/xã và mã GomShip tương ứng");
    return { address_mode: mode, province_code, province_name,
      district_code, district_name, ward_code, ward_name };
  }

  if (province_code && province_name && ward_code && ward_name)
    return { address_mode: mode, province_code, province_name,
      district_code: "", district_name: "", ward_code, ward_name };
  if (!province_code) {
    if (!province_name) throw new Error("Thiếu tỉnh/thành phố");
    const row = matchName(await locations("/locations/provinces-2tier", token), province_name);
    province_code = codeOf(row); province_name = nameOf(row);
  }
  if (!ward_code || !ward_name) {
    const list = await locations("/locations/wards-2tier?province=" + encodeURIComponent(province_code), token);
    const row = ward_code ? list.find(x => codeOf(x) === ward_code) : matchName(list, ward_name);
    if (!row) throw new Error("Mã phường không thuộc tỉnh GomShip đã chọn");
    ward_code = codeOf(row); ward_name = nameOf(row);
  }
  if (!province_name) {
    const row = (await locations("/locations/provinces-2tier", token)).find(x => codeOf(x) === province_code);
    if (!row) throw new Error("Mã tỉnh GomShip không hợp lệ");
    province_name = nameOf(row);
  }
  return { address_mode: mode, province_code, province_name,
    district_code: "", district_name: "", ward_code, ward_name };
}
// Local Pumalife warehouse UUID/ID and numeric GomShip warehouse ID belong
// to different catalogs. Only a warehouse registered under this GomShip store
// may be sent to the carrier.
function gomshipWarehouseRows(payload) {
  const collect = (node, depth = 0) => {
    if (Array.isArray(node)) return node;
    if (!node || typeof node !== "object" || depth > 4) return null;
    for (const key of ["data","items","warehouses","list","results","records","rows","result"]) {
      if (node[key] === undefined) continue;
      const found = collect(node[key], depth + 1);
      if (found) return found;
    }
    return null;
  };
  const rows = collect(payload);
  if (!rows) throw new Error("GET /api/v1/warehouses không trả về danh sách kho hợp lệ");
  const ids = new Set();
  return rows.map(row => ({
    ...row,
    id: Number(row?.id ?? row?.warehouse_id)
  })).filter(row => Number.isSafeInteger(row.id) && row.id > 0 &&
    !ids.has(row.id) && ids.add(row.id));
}

function gomshipWarehouseDetails(row) {
  const loc = row.address_info ?? row.location ??
    (row.address && typeof row.address === "object" ? row.address : {});
  const address = row.specific_address ?? row.detail_address ?? row.full_address ??
    row.address ?? loc;
  const detail = typeof address === "string" ? address :
    address?.specific_address ?? address?.detail_address ??
    address?.full_address ?? address?.street_address ?? "";
  return {
    id: row.id,
    name: String(row.name ?? row.warehouse_name ?? ""),
    contact_name: String(row.contact_name ?? row.sender_name ?? row.contact?.name ?? ""),
    contact_phone: String(row.contact_phone ?? row.phone ??
      row.sender_phone ?? row.phone_number ?? row.contact?.phone ?? ""),
    address: String(detail || ""),
    city: String(row.city ?? row.province ?? loc.city ?? ""),
    district: String(row.district ?? loc.district ?? ""),
    ward: String(row.ward ?? loc.ward ?? ""),
    province_code: String(row.province_code ?? loc.province_code ?? ""),
    ward_code: String(row.ward_code ?? loc.ward_code ?? ""),
    is_default: row.is_default === true || row.is_default === 1 ||
      row.is_default === "1" || row.isDefault === true || row.default === true ||
      row.is_default === "true" || row.is_primary === true
  };
}

async function listStoreWarehouses(token) {
  const response = await gomship("/warehouses", token);
  if (!response.ok) throw new Error("Không tải được kho GomShip: HTTP " +
    response.status + " - " + String(response.data?.message || "").slice(0, 180));
  return gomshipWarehouseRows(response.data);
}

// This POST is deliberately separate from warehouse selection and order creation.
// No warehouse is created until the signed-in Pumalife user confirms in the UI.
async function createStoreWarehouse(input, req) {
  const operator = await verifyGomshipPrintOperator(req);
  if (!operator.ok) return send({ success: false, error: operator.error }, operator.status);

  const source = input.warehouse || {};
  const name = String(source.name || "").trim();
  const contact_name = String(source.contact_name || "").trim();
  const contact_phone = String(source.contact_phone || "").trim();
  const address = String(source.address || "").trim();
  const city = String(source.city || "").trim();
  const province_code = String(source.province_code || "").trim();
  const ward = String(source.ward || "").trim();
  const ward_code = String(source.ward_code || "").trim();
  if (!name || !contact_name || !/^0\d{9,10}$/.test(contact_phone) ||
      !address || !city || !/^\d{1,3}$/.test(province_code) ||
      !ward || !/^\d{1,6}$/.test(ward_code) ||
      [name,contact_name,address,city,ward].some(x=>x.length>180)) {
    return send({success:false,error:"Thông tin kho GomShip không hợp lệ hoặc thiếu cấp địa chỉ"},400);
  }

  // The provided code/name pair must be part of the *official* GomShip
  // 2-tier catalog; SPX administrative codes must never be forwarded.
  const provinces = await publicGomshipLocations("/locations/provinces-2tier");
  const province = provinces.find(row => codeOf(row) === province_code);
  if (!province || canonicalPlaceName(nameOf(province)) !== canonicalPlaceName(city))
    return send({success:false,error:"Mã và tên tỉnh/thành không khớp với GomShip"},400);
  const wards = await publicGomshipLocations(
    "/locations/wards-2tier?province=" + encodeURIComponent(province_code));
  const matched = wards.find(row => codeOf(row) === ward_code);
  if (!matched || canonicalPlaceName(nameOf(matched)) !== canonicalPlaceName(ward))
    return send({success:false,error:"Mã và tên phường/xã không khớp với GomShip"},400);
  const payload = {
    name, contact_name, contact_phone, address,
    city:nameOf(province), district:"", province_code,
    ward:nameOf(matched), ward_code, is_default:false
  };
  const token = await access();
  // Never retry this POST on ambiguous failures; it could have created a
  // warehouse already. Re-fetch the catalog to reconcile.
  let result;
  try {
    result = await gomship("/warehouses",token,"POST",payload);
  } catch(err) {
    return send({success:false,needs_review:true,
      error:"Chưa rõ GomShip đã tạo kho hay chưa. Hãy tải lại danh sách kho trước khi thử lại."},502);
  }
  if(!result.ok) return send({success:false,error:
    "GomShip không tạo kho: " + String(result.data?.message || "HTTP "+result.status).slice(0,200),
    upstream_status:result.status},502);
  // GomShip can wrap the created warehouse in data, data.warehouse or data.data.
  // Return a verified positive numeric ID only; the UI re-fetches the official catalog.
  const root = result.data || {};
  const candidates = [root.data?.id,root.data?.warehouse_id,root.data?.warehouse?.id,
    root.data?.data?.id,root.warehouse?.id,root.id,root.warehouse_id];
  const newId = candidates.map(Number).find(id => Number.isSafeInteger(id) && id > 0) || null;
  return send({success:true,action:"create_warehouse",created:true,warehouse_id:newId},201);
}

async function validatePickupWarehouse(input, token) {
  // Check the registered GomShip store warehouses before any reservation or POST.
  // The warehouse selected in Pumalife has a different ID namespace.
  const warehouses = await listStoreWarehouses(token);
  const raw = String(input.warehouse_id ?? "").trim();
  const officialId = /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
  const oldLocalId = !officialId && raw ? raw : "";
  const localId = String(input.pumalife_warehouse_id || oldLocalId).trim();
  let local = null;
  if (localId) {
    const { data, error } = await db.from("warehouses")
      .select("id,is_active,is_default,name,sender_name,sender_phone,sender_detail_address")
      .eq("id", localId).maybeSingle();
    if (error) throw error;
    if (!data?.is_active)
      throw new Error("Kho Pumalife đang chọn không tồn tại hoặc đã ngừng hoạt động");
    local = data;
    input.pumalife_warehouse_id = String(data.id);
  }

  if (officialId) {
    if (!Number.isSafeInteger(officialId) || !warehouses.some(w => w.id === officialId))
      throw new Error("Mã kho GomShip #" + raw + " không tồn tại trên tài khoản cửa hàng này");
    return officialId;
  }
  if (!local) throw new Error(
    "Chưa xác định được kho lấy hàng. Hãy mở lại cửa sổ tạo vận đơn để tải kho GomShip và chọn kho tương ứng.");

  // Compatibility for older frontend builds: the old warehouse_id field
  // contained the Pumalife UUID, not a GomShip numeric ID.
  const clean = value => String(value ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/đ/g,"d")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  const phone = value => String(value ?? "").replace(/\D/g,"").replace(/^84/,"0");
  const addr = w => {
    const rawAddress = w.specific_address ?? w.detail_address ?? w.full_address ?? w.address;
    if (typeof rawAddress === "string") return rawAddress;
    return rawAddress?.specific_address ?? rawAddress?.detail_address ??
      rawAddress?.full_address ?? rawAddress?.street_address ?? "";
  };
  const desiredAddress = clean(local.sender_detail_address);
  const desiredPhone = phone(local.sender_phone);
  const desiredNames = [clean(local.name), clean(local.sender_name)].filter(Boolean);
  const exact = warehouses.filter(w => {
    const actualAddress = clean(addr(w));
    if (!desiredAddress || !actualAddress || !(
      actualAddress === desiredAddress ||
      actualAddress.startsWith(desiredAddress + " ") ||
      desiredAddress.startsWith(actualAddress + " "))) return false;
    return Boolean(
      (desiredPhone && desiredPhone === phone(w.phone ?? w.contact_phone ?? w.sender_phone ?? w.contact?.phone)) ||
      desiredNames.includes(clean(w.name ?? w.warehouse_name))
    );
  });
  if (exact.length === 1) return exact[0].id;
  if (!local.is_default) throw new Error(
    "Kho Pumalife này chưa được đối chiếu với kho GomShip. Chọn trực tiếp kho tương ứng từ danh sách GomShip.");

  // Only a Pumalife warehouse marked DEFAULT may inherit the store default.
  // Unlike the previous hardcode, do not force #24 for other warehouses.
  const preferred = warehouses.filter(w =>
    w.is_default === true || w.is_default === 1 || w.is_default === "1" ||
    w.isDefault === true || w.default === true);
  if (preferred.length === 1) return preferred[0].id;
  if (preferred.length === 0) {
    // The owner has previously confirmed #24 as store 9 default. Verify
    // it is STILL present in the current GomShip catalog.
    const legacyDefault = warehouses.find(w => w.id === 24);
    if (legacyDefault) return legacyDefault.id;
    if (warehouses.length === 1) return warehouses[0].id;
  }
  throw new Error("Không xác định duy nhất được kho mặc định GomShip; vui lòng chọn kho trong danh sách.");
}
function orderPayload(input, addr) {
  const receiver = input.receiver || {};
  const product = input.product || {};
  const cod = Number(input.cod ?? 0);
  const weight = Math.round(Number(product.weight ?? 1) * 1000);
  const value = Number(product.price ?? 999999);
  const paymentMethod = input.payment_method == null ? 0 : Number(input.payment_method);
  const warehouseId = Number(input.warehouse_id);
  if (![0, 1].includes(paymentMethod) ||
      (input.payment_method != null && ![0, 1, '0', '1'].includes(input.payment_method)))
    throw new Error('Người trả phí vận chuyển không hợp lệ (chỉ nhận 0 hoặc 1)');
  if (!Number.isFinite(cod) || cod < 0 || !Number.isFinite(weight) || weight <= 0 ||
    !Number.isFinite(value) || value <= 0) throw new Error("COD/trọng lượng/giá trị không hợp lệ");
  const data = {
    receiver_name: String(receiver.name || "").trim(),
    receiver_phone: String(receiver.phone || "").trim(),
    address_mode: addr.address_mode, province_code: addr.province_code,
    province_name: addr.province_name, district_code: addr.district_code, district_name: addr.district_name,
    ward_code: addr.ward_code, ward_name: addr.ward_name,
    specific_address: String(receiver.detail_address || receiver.specific_address || "").trim(),
    cod_amount: cod, order_type: 1, pickup_type: 2, payment_method: paymentMethod,
    carrier_code: "shopee_express", service_code: "standard",
    note: input.note ?? "[CHO THỬ HÀNG]", delivery_requirement: input.delivery_requirement ?? "try_on",
    warehouse_id: warehouseId, product_code: String(product.code || ""),
    product_name: String(product.name || "giày"), product_weight: weight,
    product_height: product.height ?? null, product_width: product.width ?? null,
    product_length: product.length ?? null, product_value: value
  };
  if (!data.receiver_name || !data.receiver_phone || !data.specific_address)
    throw new Error("Thiếu thông tin người nhận");
  return data;
}


/**
 * GomShip's order record ID is not the SPX tracking number.
 * Read only unambiguous order-object fields; never derive it from a waybill.
 */
function gomshipOrderId(response) {
  const root = response?.data ?? response;
  const candidates = [root?.order?.id, root?.order_id, root?.id];
  for (const raw of candidates) {
    const value = Number(raw);
    if (raw !== undefined && raw !== null && String(raw).trim() &&
        Number.isSafeInteger(value) && value > 0) return value;
  }
  return null;
}

function findSpxWaybill(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 4) return null;
  const keys = ["tracking_number", "tracking_no", "tracking_code", "waybill_number",
    "waybill_code", "carrier_tracking_number", "spx_tn", "shipping_code"];
  for (const key of keys) {
    const code = String(node[key] ?? "").trim().toUpperCase();
    if (/^SPXVN[A-Z0-9]+$/.test(code)) return code;
  }
  for (const item of Object.values(node)) {
    if (item && typeof item === "object") {
      const found = findSpxWaybill(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
}

function randomLabelToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
}

// The same signed-in Pumalife account can print across browsers.
// No separate PDF credentials or print-specific role configuration is needed.
async function verifyGomshipPrintOperator(req) {
  const credential = String(req.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i)?.[1] || "";
  if (!credential)
    return { ok: false, status: 401, error: "Phiên đăng nhập Pumalife không hợp lệ" };
  const { data, error } = await db.auth.getUser(credential);
  const user = !error ? data?.user : null;
  if (!user || user.role !== "authenticated" || !user.email)
    return { ok: false, status: 401, error: "Phiên đăng nhập Pumalife hết hạn hoặc không hợp lệ" };
  // Match the account used on Pumalife's main login, not an extra print login.
  const appEmail = String(Deno.env.get("PUMALIFE_LOGIN_EMAIL") || "pumalifestore@gmail.com")
    .trim().toLowerCase();
  if (String(user.email).toLowerCase() !== appEmail)
    return { ok: false, status: 403, error: "Tài khoản không thuộc hệ thống Pumalife" };
  return { ok: true, user_id: user.id };
}

async function getLabelByOrder(input, req) {
  const operator = await verifyGomshipPrintOperator(req);
  if (!operator.ok) return send({ success: false, error: operator.error }, operator.status);
  const requestedId = String(input.order_id || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(requestedId))
    return send({ success: false, error: "Mã đơn Pumalife không hợp lệ" }, 400);
  const { data: requested, error: requestedError } = await db.from("pancake_orders")
    .select("id,jt_waybill_id,shipping_group_id,shipping_group_root_id")
    .eq("id", requestedId).maybeSingle();
  if (requestedError) throw requestedError;
  if (!requested) return send({ success: false, error: "Không tìm thấy đơn Pumalife" }, 404);
  const rootId = String(requested.shipping_group_root_id || requested.id);
  let root = requested;
  if (rootId !== requestedId) {
    const { data: parent, error: parentError } = await db.from("pancake_orders")
      .select("id,jt_waybill_id,shipping_group_id").eq("id", rootId).maybeSingle();
    if (parentError) throw parentError;
    if (!parent || !requested.shipping_group_id ||
        requested.shipping_group_id !== parent.shipping_group_id)
      return send({ success: false, error: "Không xác minh được đơn gốc của nhóm" }, 409);
    root = parent;
  }
  const { data: shipment, error: shipmentError } = await db.from("gomship_shipments")
    .select("order_id,status,gomship_order_id,spx_waybill")
    .eq("order_id", rootId).eq("status", "created").maybeSingle();
  if (shipmentError) throw shipmentError;
  if (!shipment?.gomship_order_id)
    return send({ success: false, error: "Đơn này không có nhãn GomShip đã tạo" }, 404);
  const savedWaybill = String(shipment.spx_waybill || "").trim().toUpperCase();
  if (!savedWaybill ||
      String(root.jt_waybill_id || "").trim().toUpperCase() !== savedWaybill ||
      String(requested.jt_waybill_id || "").trim().toUpperCase() !== savedWaybill)
    return send({ success: false, error: "Mã vận đơn trên đơn hàng và GomShip không khớp" }, 409);
  return await getGomshipPdfFromShipment(shipment);
}

/**
 * Never trust a client-provided GomShip order ID: query the server's linked shipment.
 * An unguessable per-shipment capability prevents retrieving another order's label
 * with only the public Supabase anon key.
 */
async function getGomshipPdfFromShipment(shipment) {
  const id = Number(shipment.gomship_order_id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return send({ success: false, error: "GomShip order ID không hợp lệ" }, 409);

  const requestLabel = token => fetch(ROOT + "/orders/" + id + "/label", {
    method: "GET",
    headers: {
      Authorization: "Bearer " + token,
      "X-Store-Id": String(STORE_ID),
      Accept: "application/pdf"
    },
    signal: AbortSignal.timeout(30000)
  });
  let labelToken = await access();
  let response = await requestLabel(labelToken);
  if (response.status === 401) {
    labelToken = await access(true, labelToken);
    response = await requestLabel(labelToken);
  }
  if (!response.ok)
    return send({ success: false, error: "Không lấy được nhãn GomShip: HTTP " + response.status }, 502);

  const length = Number(response.headers.get("content-length") || 0);
  if (length > 12 * 1024 * 1024)
    return send({ success: false, error: "File nhãn quá lớn" }, 502);
  const pdf = new Uint8Array(await response.arrayBuffer());
  if (pdf.byteLength < 5 || pdf.byteLength > 12 * 1024 * 1024 ||
      new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-")
    return send({ success: false, error: "GomShip không trả về file PDF hợp lệ" }, 502);
  return new Response(pdf, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="GomShip-' + id + '.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function getLabel(input) {
  const orderId = String(input.order_id || "").trim();
  const suppliedToken = String(input.label_token || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(orderId) || !/^[a-f0-9]{64}$/.test(suppliedToken))
    return send({ success: false, error: "Yêu cầu nhãn không hợp lệ" }, 400);

  const hash = await sha256(suppliedToken);
  const { data: shipment, error: shipmentError } = await db.from("gomship_shipments")
    .select("order_id,status,gomship_order_id,spx_waybill,label_token_hash")
    .eq("order_id", orderId)
    .eq("label_token_hash", hash)
    .eq("status", "created")
    .maybeSingle();
  if (shipmentError) throw shipmentError;
  if (!shipment || !shipment.gomship_order_id)
    return send({ success: false, error: "Không có quyền tải nhãn hoặc chưa có nhãn GomShip" }, 403);

  const { data: sourceOrder, error: sourceError } = await db.from("pancake_orders")
    .select("id,jt_waybill_id").eq("id", orderId).maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceOrder)
    return send({ success: false, error: "Không tìm thấy đơn Pumalife" }, 404);
  const savedWaybill = String(sourceOrder.jt_waybill_id || "").trim().toUpperCase();
  if (savedWaybill && shipment.spx_waybill &&
      savedWaybill !== String(shipment.spx_waybill).trim().toUpperCase())
    return send({ success: false, error: "Mã SPX của đơn không khớp với GomShip" }, 409);

  return await getGomshipPdfFromShipment(shipment);
}


/**
 * Determine the service from the Pumalife order and its waybill before the UI
 * offers cancellation. This does NOT authorize cancellation.
 */
async function getCancelSource(input) {
  const orderId = String(input.order_id || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(orderId))
    return send({ success: false, error: "Thiếu mã đơn Pumalife hợp lệ" }, 400);
  const { data: order, error: orderError } = await db.from("pancake_orders")
    .select("id,jt_waybill_id,shipping_group_root_id").eq("id", orderId).maybeSingle();
  if (orderError) throw orderError;
  const waybill = String(order?.jt_waybill_id || "").trim().toUpperCase();
  if (!order || !/^SPXVN[A-Z0-9]+$/.test(waybill)) {
    return send({ success: false, error: "Đơn Pumalife chưa có mã vận đơn SPX hợp lệ" }, 409);
  }
  const rootId = String(order?.shipping_group_root_id || orderId);
  const { data: ship, error: shipError } = await db.from("gomship_shipments")
    .select("order_id,status,spx_waybill,response").eq("order_id", rootId).maybeSingle();
  if (shipError) throw shipError;
  // A fully cancelled GomShip record is no longer the active shipping provider.
  if (ship?.status === "cancelled")
    return send({ success: true, source: "spx", waybill_id: waybill });
  const storedWaybill = String(ship?.spx_waybill || findSpxWaybill(ship?.response) || "").trim().toUpperCase();
  if (storedWaybill && storedWaybill !== waybill) {
    return send({ success: false, error: "Mã vận đơn trong GomShip không khớp" }, 409);
  }
  return send({
    success: true,
    source: ship ? "gomship" : "spx",
    waybill_id: waybill,
    ...(ship ? { status: ship.status, root_order_id: rootId } : {})
  });
}

async function syncCancelledPumalife(orderId, waybill) {
  const fields = {
    jt_waybill_id: null,
    order_spx: null,
    jt_status_code: null,
    jt_status_name: null,
    status: 6
  };

  async function patch(data) {
    return db.from("pancake_orders").update(data)
      .eq("id", orderId).eq("jt_waybill_id", waybill).select("id");
  }

  let updated = await patch(fields);
  if (updated.error && /order_spx/i.test(updated.error.message || "")) {
    const { order_spx: _removed, ...safeFields } = fields;
    updated = await patch(safeFields);
  }

  if (updated.error) return { ok: false, message: updated.error.message };
  if (!updated.data?.length) {
    // May already be synced by another request.
    const { data: existing, error } = await db.from("pancake_orders")
      .select("jt_waybill_id,status").eq("id", orderId).maybeSingle();
    if (!error && existing && !existing.jt_waybill_id && Number(existing.status) === 6)
      return { ok: true };
    return { ok: false, message: "Mã vận đơn đã thay đổi hoặc đơn không tồn tại; cần kiểm tra đồng bộ" };
  }
  return { ok: true };
}

/**
 * Cancel only a GomShip shipment linked to this Pumalife order.
 * No browser-specific label_token is required. The server verifies the Pumalife
 * order and exact current SPX waybill before using its stored GomShip ID.
 * This is not strong administrator authorization; secure the API before public use.
 */
async function cancelGomshipOrder(input) {
  const requestedId = String(input.order_id || "").trim();
  const suppliedWaybill = String(input.waybill_id || "").trim().toUpperCase();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(requestedId) ||
      !/^SPXVN[A-Z0-9]+$/.test(suppliedWaybill)) {
    return send({ success: false, error: "Thiếu mã đơn hoặc mã vận đơn SPX hợp lệ" }, 400);
  }

  const { data: requested, error: requestedError } = await db.from("pancake_orders")
    .select("id,jt_waybill_id,shipping_group_id,shipping_group_root_id")
    .eq("id", requestedId).maybeSingle();
  if (requestedError) throw requestedError;
  if (!requested) return send({ success: false, error: "Đơn Pumalife không tồn tại" }, 404);
  const orderId = String(requested.shipping_group_root_id || requestedId);
  let order = requested;
  if (orderId !== requestedId) {
    const rootResult = await db.from("pancake_orders")
      .select("id,jt_waybill_id,shipping_group_id").eq("id", orderId).maybeSingle();
    if (rootResult.error) throw rootResult.error;
    order = rootResult.data;
    if (!order || !requested.shipping_group_id ||
        requested.shipping_group_id !== order.shipping_group_id ||
        String(requested.jt_waybill_id || "").toUpperCase() !==
          String(order.jt_waybill_id || "").toUpperCase())
      return send({ success: false, error: "Nhóm giao hàng thay đổi hoặc mã vận đơn không khớp" }, 409);
  }

  const { data: ship, error: shipError } = await db.from("gomship_shipments")
    .select("order_id,status,gomship_order_id,spx_waybill,response")
    .eq("order_id", orderId).maybeSingle();
  if (shipError) throw shipError;
  if (!ship)
    return send({ success: false, error: "Không tìm thấy vận đơn GomShip liên kết với đơn này" }, 404);

  const originalCode = String(
    ship.spx_waybill || findSpxWaybill(ship.response) || order.jt_waybill_id || ""
  ).trim();
  if (!/^SPXVN[A-Z0-9]+$/i.test(originalCode))
    return send({ success: false, error: "Chưa xác định được mã vận đơn SPX của đơn GomShip" }, 409);
  if (suppliedWaybill !== originalCode.toUpperCase())
    return send({ success: false, error: "Mã vận đơn yêu cầu hủy không khớp đơn GomShip" }, 409);
  const liveCode = String(order.jt_waybill_id || "").trim();
  if (liveCode && liveCode.toUpperCase() !== originalCode.toUpperCase())
    return send({ success: false, error: "Đơn Pumalife đã thay mã vận đơn; không thể hủy" }, 409);

  if (ship.status === "cancelled") return send({ success: true, already_cancelled: true, source: "gomship" });
  if (ship.status === "cancel_sync_failed") {
    const synced = await syncCancelledPumalife(orderId, originalCode);
    if (!synced.ok) return send({ success: false,
      error: "GomShip đã hủy nhưng chưa đồng bộ được Pumalife: " + synced.message }, 502);
    const saved = await db.from("gomship_shipments").update({ status: "cancelled" })
      .eq("order_id", orderId).eq("status", "cancel_sync_failed");
    if (saved.error) throw saved.error;
    return send({ success: true, source: "gomship", already_cancelled: true, synced: true });
  }
  if (ship.status !== "created") {
    return send({ success: false, status: ship.status,
      error: "Đơn đang hoặc đã xử lý hủy; đối chiếu GomShip trước khi thử lại" }, 409);
  }
  if (!liveCode)
    return send({ success: false, error: "Đơn Pumalife chưa có mã vận đơn khớp" }, 409);

  // Older GomShip shipments might have their numeric ID only in the stored
  // creation response, before the gomship_order_id column was introduced.
  const carrierId = ship.gomship_order_id ?? gomshipOrderId(ship.response);
  const id = Number(carrierId);
  if (!Number.isSafeInteger(id) || id <= 0)
    return send({ success: false, error: "Không tìm thấy GomShip order ID trong dữ liệu đã lưu. Cần đối chiếu thủ công." }, 409);

  // Reserve this cancellation, preventing double-clicks from sending two DELETEs.
  const { data: claimed, error: claimError } = await db.from("gomship_shipments")
    .update({ status: "cancelling", spx_waybill: originalCode, gomship_order_id: id })
    .eq("order_id", orderId).eq("status", "created")
    .select("order_id");
  if (claimError) throw claimError;
  if (!claimed?.length)
    return send({ success: false, error: "Đơn đã có yêu cầu hủy khác đang xử lý" }, 409);

  let result;
  try {
    let token = await access();
    result = await gomship("/orders/" + id, token, "DELETE");
    if (result.status === 401) {
      token = await access(true, token);
      result = await gomship("/orders/" + id, token, "DELETE");
    }
  } catch (error) {
    await db.from("gomship_shipments").update({
      status: "cancel_needs_review", cancel_response: { error: message(error) }
    }).eq("order_id", orderId).eq("status", "cancelling");
    return send({ success: false, source: "gomship", error:
      "Chưa xác định GomShip đã hủy hay chưa. Kiểm tra trực tiếp trước khi thử lại." }, 502);
  }

  if (!result.ok) {
    await db.from("gomship_shipments").update({
      status: "cancel_needs_review", cancel_response: result.data
    }).eq("order_id", orderId).eq("status", "cancelling");
    return send({ success: false, source: "gomship", gomship_status: result.status,
      error: "GomShip chưa xác nhận hủy: " + String(result.data?.message || result.status) }, 502);
  }

  const { error: saveCancelledError } = await db.from("gomship_shipments").update({
    status: "cancel_sync_failed",
    cancel_response: result.data,
    cancelled_at: new Date().toISOString()
  }).eq("order_id", orderId).eq("status", "cancelling");
  if (saveCancelledError) throw saveCancelledError;

  const synced = await syncCancelledPumalife(orderId, originalCode);
  if (!synced.ok) {
    return send({ success: false, source: "gomship", cancelled_on_gomship: true,
      error: "GomShip đã hủy thành công, nhưng lỗi đồng bộ Pumalife: " + synced.message }, 502);
  }
  const final = await db.from("gomship_shipments").update({ status: "cancelled" })
    .eq("order_id", orderId).eq("status", "cancel_sync_failed");
  if (final.error) throw final.error;
  return send({ success: true, source: "gomship", cancelled: true, order_id: orderId });
}

async function createOrder(input) {
  const id = String(input.order_id || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return send({ success: false, error: "order_id không hợp lệ" }, 400);
  if (!input.receiver?.name || !input.receiver?.phone)
    return send({ success: false, error: "Thiếu receiver" }, 400);
  const { data: sourceOrder, error: sourceError } = await db.from("pancake_orders")
    .select("id,jt_waybill_id,bill_phone_number,shipping_group_id,shipping_group_root_id")
    .eq("id", id).maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceOrder) return send({ success: false, error: "Không tìm thấy đơn hàng Pumalife" }, 404);
  if (String(sourceOrder.jt_waybill_id || "").trim()) return send({
    success: false, error: "Đơn đã có vận đơn; không gửi thêm qua GomShip"
  }, 409);
  const cleanPhone = value => String(value || "").replace(/\D/g, "").replace(/^84/, "0");
  if (cleanPhone(sourceOrder.bill_phone_number) &&
      cleanPhone(input.receiver.phone) !== cleanPhone(sourceOrder.bill_phone_number)) {
    return send({
      success: false,
      error: "SĐT người nhận khác đơn Pumalife. Cập nhật đơn trước khi tạo vận đơn."
    }, 409);
  }

  // Every grouped GomShip shipment is one carrier order owned by its root.
  // Verify the *current* members in Supabase, never trust only browser-provided IDs.
  let groupIds = [];
  if (sourceOrder.shipping_group_id) {
    const { data: members, error: membersError } = await db.from("pancake_orders")
      .select("id,jt_waybill_id,bill_phone_number,shipping_group_root_id")
      .eq("shipping_group_id", sourceOrder.shipping_group_id);
    if (membersError) throw membersError;
    if (members?.length > 1) {
      if (String(sourceOrder.shipping_group_root_id || id) !== id)
        return send({ success: false, error: "Phải tạo GomShip từ đơn gốc của nhóm" }, 409);
      groupIds = members.map(row => String(row.id)).sort();
      const expected = Array.isArray(input.group_order_ids) ?
        input.group_order_ids.map(String).sort() : [];
      if (expected.length !== groupIds.length ||
          expected.some((value, index) => value !== groupIds[index])) {
        return send({ success: false,
          error: "Thành viên nhóm đã thay đổi. Đóng và mở lại cửa sổ tạo vận đơn." }, 409);
      }
      for (const member of members) {
        if (String(member.jt_waybill_id || "").trim())
          return send({ success: false, error: "Có đơn trong nhóm đã có vận đơn" }, 409);
        if (cleanPhone(member.bill_phone_number) !== cleanPhone(sourceOrder.bill_phone_number))
          return send({ success: false, error: "Nhóm có số điện thoại nhận khác nhau" }, 409);
        if (member.shipping_group_root_id &&
            String(member.shipping_group_root_id) !== id)
          return send({ success: false, error: "Đơn gốc của nhóm không đồng nhất" }, 409);
      }
    }
  }
  if (Array.isArray(input.group_order_ids) && input.group_order_ids.length > 1 && groupIds.length < 2)
    return send({ success: false, error: "Nhóm trên Supabase đã thay đổi, cần tải lại" }, 409);

  const { data: previous, error: previousError } = await db.from("gomship_shipments")
    .select("status,response,gomship_order_id,label_token_hash").eq("order_id", id).maybeSingle();
  if (previousError) throw previousError;
  // jt_waybill_id is the source of truth for a waybill recorded in Pumalife.
  // A carrier record marked created/creating is not itself proof that Pumalife
  // has a waybill, but it MUST be reconciled before attempting another POST.
  if (previous && previous.status !== "cancelled") return send({
    success: false,
    error: previous.status === "created"
      ? "GomShip báo đã tạo đơn nhưng jt_waybill_id trên Pumalife đang trống. Cần đồng bộ mã vận đơn, không tạo lại."
      : "jt_waybill_id đang trống nhưng có yêu cầu GomShip chưa xác minh (" + previous.status +
        "). Cần đối chiếu trước khi tạo lại.",
    status: previous.status,
    needs_reconciliation: true
  }, 409);

  let token = await access();
  const address = await resolveAddress(input, token);
  try {
    input.warehouse_id = await validatePickupWarehouse(input, token);
  } catch (error) {
    // Invalid pickup location is a user-correctable error, NOT HTTP 500.
    // This happens before the group claim and the carrier POST.
    return send({ success: false, reason: "invalid_pickup_warehouse",
      error: message(error) }, 400);
  }
  const payload = orderPayload(input, address);
  let groupClaim = null;
  if (groupIds.length > 1) {
    // claim_grouped_shipment serializes membership with direct SPX creation.
    // A claim must remain locked after any uncertain carrier response.
    const claim = await db.rpc("claim_grouped_shipment", {
      p_order_id: id, p_expected_ids: groupIds
    });
    if (claim.error) {
      const detail = String(claim.error.message || "");
      if (/đang tạo vận đơn|chờ xác minh|chưa xác nhận kết quả tạo vận đơn|đã có jt_waybill_id|vẫn có mã vận đơn|đã lấy|đã xóa|thành viên nhóm/i.test(detail))
        return send({ success: false,
          error: "Không thể tạo vận đơn nhóm: " + detail,
          reason: "group_claim_conflict",
          needs_reconciliation: /đang tạo vận đơn|chờ xác minh|chưa xác nhận kết quả tạo vận đơn/i.test(detail)
        }, 409);
      throw new Error("Không khóa được nhóm: " + detail);
    }
    if (!claim.data) throw new Error("Không có mã khóa tạo vận đơn nhóm");
    groupClaim = claim.data;
  }
  const key = crypto.randomUUID();
  // Atomic reservation: a fully cancelled shipment can be archived and replaced.
  // Unfinished / uncertain shipments must never be retried.
  const { data: reservation, error: reservationError } = await db.rpc(
    "reserve_gomship_shipment",
    { p_order_id: id, p_idempotency_key: key, p_request: payload }
  );
  if (reservationError) {
    // No GomShip POST has been sent. Do not strand a group claim when the
    // reservation RPC itself rejects the request.
    if (groupClaim) {
      const released = await db.rpc("release_grouped_shipment", {
        p_order_id: id, p_token: groupClaim
      });
      if (released.error) throw new Error(
        "Giữ lần tạo thất bại và không nhả được khóa nhóm; cần kiểm tra: " +
        released.error.message
      );
    }
    throw new Error("Không thể giữ lần tạo vận đơn mới: " + reservationError.message);
  }
  if (!reservation?.reserved) {
    if (groupClaim) {
      const released = await db.rpc("release_grouped_shipment", {
        p_order_id: id, p_token: groupClaim
      });
      if (released.error) throw new Error("Lỗi nhả khóa nhóm, cần kiểm tra: " + released.error.message);
    }
    return send({
      success: false,
      error: "Chưa thể tạo vận đơn mới: " + String(reservation?.reason || "đơn đang được xử lý"),
      reason: reservation?.reason || "reservation_failed"
    }, 409);
  }

  let result;
  try {
    result = await gomship("/orders", token, "POST", payload, key);
    if (result.status === 401) {
      token = await access(true, token);
      result = await gomship("/orders", token, "POST", payload, key);
    }
  } catch (err) {
    await db.from("gomship_shipments").update({
      status: "needs_review", response: { reason: message(err) }
    }).eq("order_id", id);
    return send({ success: false, error: "Chưa rõ GomShip đã tạo hay chưa, không thử lại ngay", step: "unknown" }, 502);
  }
  const gomshipId = result.ok ? gomshipOrderId(result.data) : null;
  const waybill = result.ok ? findSpxWaybill(result.data) : null;
  const labelToken = gomshipId ? randomLabelToken() : null;
  const { error: saved } = await db.from("gomship_shipments").update({
    status: result.ok ? "created" : "needs_review",
    response: result.data,
    gomship_order_id: gomshipId,
    spx_waybill: waybill,
    label_token_hash: labelToken ? await sha256(labelToken) : null
  }).eq("order_id", id);
  if (saved) throw saved;

  let groupSynced = false;
  if (result.ok && groupIds.length > 1 && waybill) {
    // One transaction updates every member's waybill, status, COD and warehouse.
    // Never let the browser patch only the root of a grouped shipment.
    const { data: finalized, error: finalizeError } = await db.rpc("finish_grouped_shipment", {
      p_order_id: id, p_token: groupClaim, p_waybill: waybill,
      p_order_sn: "", p_warehouse_id: input.pumalife_warehouse_id ? String(input.pumalife_warehouse_id) : null,
      p_cod: Number(payload.cod_amount)
    });
    if (finalizeError || Number(finalized?.count) !== groupIds.length) {
      return send({ success: false, order_id: id, created_on_gomship: true,
        gomship_order_id: gomshipId, spx_waybill: waybill,
        error: "GomShip đã tạo vận đơn nhưng không đồng bộ đủ nhóm. KHÔNG tạo lại. " +
          (finalizeError?.message || "Số đơn cập nhật không khớp, cần đối chiếu") }, 502);
    }
    groupSynced = true;
  }

  return send({
    success: result.ok, order_id: id,
    ...(groupSynced ? { group_synced: true, group_count: groupIds.length } : {}),
    gomship_response: result.data,
    ...(gomshipId ? { gomship_order_id: gomshipId } : {}),
    ...(waybill ? { spx_waybill: waybill } : {}),
    ...(labelToken ? { label_access: { token: labelToken, gomship_order_id: gomshipId } } : {}),
    ...(result.ok ? {} : { error: "GomShip chưa xác nhận thành công", gomship_status: result.status })
  }, result.ok ? 200 : 502);
}

serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return send({ success: false, error: "Chỉ hỗ trợ POST" }, 405);
  const bearer = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(bearer))
    return send({ success: false, error: "Missing Supabase Authorization" }, 401);
  try {
    const input = await req.json();
    if (input.action === "test_auth") {
      // A status check must never rotate the dashboard session gratuitously.
      await access();
      const row = await authRow();
      return send({ success: true, action: "test_auth", store_id: STORE_ID, expires_at: row.expires_at });
    }
    if (input.action === "list_locations") {
      // Pumalife pickers use GomShip official names/codes for BOTH 2/3-tier.
      // This action never creates a shipment or refreshes GomShip auth.
      const level = String(input.level || "");
      const safeName = value => {
        const name = String(value || "").trim();
        if (name.length > 120 || /[\u0000-\u001F]/.test(name))
          throw new Error("Tên địa giới không hợp lệ");
        return name;
      };
      let path: string;
      if (level === "provinces") {
        path = "/locations/provinces";
      } else if (level === "provinces-2tier") {
        path = "/locations/provinces-2tier";
      } else if (level === "wards-2tier") {
        const provinceCode = safeName(input.province_code);
        if (!/^\d{1,3}$/.test(provinceCode))
          return send({ success: false, error: "Thiếu mã tỉnh GomShip 2 cấp hợp lệ" }, 400);
        path = "/locations/wards-2tier?province=" + encodeURIComponent(provinceCode);
      } else if (level === "districts") {
        const province = safeName(input.province);
        if (!province) return send({ success: false, error: "Thiếu tỉnh GomShip" }, 400);
        path = "/locations/districts?province=" + encodeURIComponent(province);
      } else if (level === "wards") {
        const province = safeName(input.province);
        const district = safeName(input.district);
        if (!province || !district)
          return send({ success: false, error: "Thiếu tỉnh/huyện GomShip" }, 400);
        path = "/locations/wards?province=" + encodeURIComponent(province) +
          "&district=" + encodeURIComponent(district);
      } else {
        return send({ success: false, error: "Cấp địa chỉ GomShip không hợp lệ" }, 400);
      }
      const rows = await publicGomshipLocations(path);
      const items = rows.map(row => ({ code: codeOf(row), name: nameOf(row) }))
        .filter(row => row.code && row.name);
      if (!items.length) return send({ success: false, error: "GomShip không trả mã/tên địa chỉ hợp lệ" }, 502);
      return send({ success: true, action: "list_locations", level, items });
    }
    if (input.action === "list_warehouses") {
      const token = await access();
      const rows = await listStoreWarehouses(token);
      return send({ success: true, action: "list_warehouses",
        source:"GET /api/v1/warehouses",count:rows.length,
        items:rows.map(gomshipWarehouseDetails) });
    }
    if (input.action === "create_warehouse")
      return await createStoreWarehouse(input, req);
    if (input.action === "test_address") {
      const address = await resolveAddress(input, await access());
      return send({ success: true, action: "test_address", address });
    }
    if (input.action === "get_cancel_source") return await getCancelSource(input);
    if (input.action === "cancel_order") return await cancelGomshipOrder(input);
    if (input.action === "get_label") return await getLabel(input);
    if (input.action === "get_label_by_order") return await getLabelByOrder(input, req);
    if (!input.action || input.action === "create") return await createOrder(input);
    return send({ success: false, error: "Action không được hỗ trợ" }, 400);
  } catch (err) {
    console.error("GOMSHIP FUNCTION ERROR:", message(err));
    return send({ success: false, error: message(err) }, 500);
  }
});