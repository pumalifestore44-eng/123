// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || "";

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

const SPX_BASE_URL =
  "https://spx.vn";

const SPX_COOKIE =
  "app_lang=vi; " +
  "app_source=nss; " +
  "spx_token=FIoHD7vGnP44NlXtOP3CDS925cDB7QK9chWRiYNKYtHst3TR2jgQccImgafbjcy6; " +
  "spx_sid=d31b2fd660c503c3b4bcbb735465fee22d114064a7736c0a6979125dfc7107cc; " +
  "login_type=1; " +
  "login_status=true; " +
  "nss_sys_type=true; " +
  "nss_cid=VN";

const SPX_HEADERS = {
  accept:
    "application/json, text/plain, */*",

  "accept-language":
    "en-US,en;q=0.9",

  origin:
    "https://spx.vn",

  referer:
    "https://spx.vn/spx-admin/single-order/create",

  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/153.0.0.0 Safari/537.36",

  cookie:
    SPX_COOKIE,
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":
    "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS",

  "Content-Type":
    "application/json; charset=utf-8",
};


// ============================================================
// RESPONSE JSON
// ============================================================

function responseJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

async function parseResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `SPX non-JSON. HTTP ${response.status}: ${text}`
    );
  }
}

// Chỉ lấy order_sn của bản ghi khớp chính xác spx_tn.
// Không lấy nhầm sls_tn dù cả hai đều bắt đầu bằng VN.
function findOrderSnInObject(node, targetSpxTn) {
  if (!node || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findOrderSnInObject(item, targetSpxTn);
      if (found) return found;
    }
    return null;
  }

  const info = node.order_info || node;

  if (
    String(info.spx_tn || "").trim() === targetSpxTn &&
    /^VN[A-Z0-9]{10,}$/.test(
      String(info.order_sn || "").trim()
    )
  ) {
    return String(info.order_sn).trim();
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      const found = findOrderSnInObject(value, targetSpxTn);
      if (found) return found;
    }
  }

  return null;
}

async function getOrderSnWithDebug(keyword) {
  const cleanKeyword = String(keyword).trim();

  if (
    cleanKeyword.startsWith("VN") &&
    !cleanKeyword.startsWith("SPXVN")
  ) {
    return { orderSn: cleanKeyword };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const thirtyDaysAgoSec = nowSec - 30 * 24 * 60 * 60;

  const payloadsToTry = [
    {
      name: "query_order_list_search_content_1",
      url:
        SPX_BASE_URL +
        "/shipment/order/logistic/order/query_order_list",
      body: {
        order_type: 1,
        search_type: 1,
        search_content: cleanKeyword,
        page_size: 10,
        page_number: 1
      }
    },
    {
      name: "query_order_list_search_content_2",
      url:
        SPX_BASE_URL +
        "/shipment/order/logistic/order/query_order_list",
      body: {
        search_type: 1,
        search_content: cleanKeyword,
        page_size: 10,
        page_number: 1
      }
    },
    {
      name: "list_all_order_recent",
      url:
        SPX_BASE_URL +
        "/shipment/order/logistic/order/list_all_order",
      body: {
        issue_type_list: [],
        page_size: 10,
        offset: 0,
        date_range_list: [
          {
            type: 1,
            start: thirtyDaysAgoSec,
            end: nowSec + 86400
          }
        ],
        tracking_code_info_list: [],
        language: "vi"
      }
    },
    {
      name: "query_order_list_keyword",
      url:
        SPX_BASE_URL +
        "/shipment/order/logistic/order/query_order_list",
      body: {
        keyword: cleanKeyword,
        page_number: 1,
        page_size: 10
      }
    }
  ];

  const debugResponses = [];

  for (const config of payloadsToTry) {
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          ...SPX_HEADERS,
          "content-type": "application/json;charset=UTF-8",
          referer: "https://spx.vn/spx-admin/order/trackings"
        },
        body: JSON.stringify(config.body)
      });

      const data = await parseResponse(response);

      debugResponses.push({
        name: config.name,
        retcode: data?.retcode,
        data_sample: JSON.stringify(data).slice(0, 500)
      });

      const foundOrderSn = findOrderSnInObject(
        data,
        cleanKeyword
      );

      if (foundOrderSn) {
        console.log(
          `Tìm thấy order_sn bằng ${config.name}: ` +
          `${cleanKeyword} -> ${foundOrderSn}`
        );

        return { orderSn: foundOrderSn };
      }
    } catch (err) {
      debugResponses.push({
        name: config.name,
        error: String(err)
      });
    }
  }

  return {
    orderSn: cleanKeyword,
    debugInfo: debugResponses
  };
}

async function cancelSpxOrder(waybillId) {
  const { orderSn, debugInfo } =
    await getOrderSnWithDebug(waybillId);

  console.log(
    `Bắt đầu hủy đơn SPX: ` +
    `waybillId=${waybillId}, targetOrderSn=${orderSn}`
  );

  const response = await fetch(
    SPX_BASE_URL +
      "/shipment/order/logistic/order/batch_cancel_order",
    {
      method: "POST",
      headers: {
        ...SPX_HEADERS,
        "content-type": "application/json;charset=UTF-8",
        referer: "https://spx.vn/spx-admin/order/trackings"
      },
      body: JSON.stringify({ list: [orderSn] })
    }
  );

  const data = await parseResponse(response);
  const failList = data?.data?.fail_list || [];

  if (failList.length > 0) {
    const failItem = failList[0];

    return {
      success: false,
      retcode: failItem.retcode,
      message:
        failItem.message || "Hủy đơn thất bại từ SPX",
      target_order_sn: orderSn,
      lookup_debug: debugInfo,
      spx_response: data
    };
  }

  const isSuccess =
    data?.retcode === 0 || data?.success === true;

  return {
    success: isSuccess,
    target_order_sn: orderSn,
    spx_response: data
  };
}

async function getProductInfo(productId = 53001) {
  const response = await fetch(
    SPX_BASE_URL +
      `/shipment/order/product/get_product_info?product_id=${productId}`,
    {
      method: "GET",
      headers: SPX_HEADERS
    }
  );

  const data = await parseResponse(response);

  if (
    data?.retcode !== 0 ||
    !data?.data?.pickup_time_info
  ) {
    throw new Error(
      "Không lấy được pickup_time_info từ SPX"
    );
  }

  return data.data;
}

async function getBestVoucher(orderInfo) {
  try {
    const response = await fetch(
      SPX_BASE_URL +
        "/shipment/promotion/logistic/voucher/list_voucher",
      {
        method: "POST",
        headers: {
          ...SPX_HEADERS,
          "content-type": "application/json;charset=UTF-8"
        },
        body: JSON.stringify({ order_info: orderInfo })
      }
    );

    const data = await parseResponse(response);

    const vouchers =
      data?.data?.available_voucher_list ||
      data?.data?.voucher_list ||
      [];

    if (
      !Array.isArray(vouchers) ||
      vouchers.length === 0
    ) {
      return null;
    }

    vouchers.sort((a, b) => {
      const discountA = Number(
        a.shipping_fee_voucher ||
        a.discount_amount ||
        0
      );

      const discountB = Number(
        b.shipping_fee_voucher ||
        b.discount_amount ||
        0
      );

      return discountB - discountA;
    });

    const bestVoucher = vouchers[0];

    return {
      voucher_code: bestVoucher.voucher_code || "",
      account_voucher_id: String(
        bestVoucher.account_voucher_id ?? "0"
      ),
      voucher_name: bestVoucher.voucher_name || "",
      discount_amount: Number(
        bestVoucher.shipping_fee_voucher ||
        bestVoucher.discount_amount ||
        0
      )
    };
  } catch (err) {
    console.error("Lỗi khi lấy list_voucher:", err);
    return null;
  }
}

async function getVoucherInstanceId(
  voucherCode,
  accountVoucherId,
  orderInfo
) {
  try {
    const response = await fetch(
      SPX_BASE_URL +
        "/shipment/promotion/logistic/voucher/check_voucher",
      {
        method: "POST",
        headers: {
          ...SPX_HEADERS,
          "content-type": "application/json;charset=UTF-8"
        },
        body: JSON.stringify({
          voucher_code: voucherCode,
          account_voucher_id: accountVoucherId,
          order_info: orderInfo
        })
      }
    );

    const data = await parseResponse(response);

    const instanceId =
      data?.data?.voucher_instance_id ||
      data?.data?.voucher_info?.voucher_instance_id ||
      data?.voucher_instance_id ||
      null;

    return instanceId ? String(instanceId) : null;
  } catch (err) {
    console.error("Lỗi khi gọi check_voucher:", err);
    return null;
  }
}

async function callCheckOrder(payload) {
  const response = await fetch(
    SPX_BASE_URL +
      "/shipment/order/logistic/order/batch_check_order",
    {
      method: "POST",
      headers: {
        ...SPX_HEADERS,
        "content-type": "application/json;charset=UTF-8"
      },
      body: JSON.stringify(payload)
    }
  );

  return await parseResponse(response);
}

async function callGetNonce() {
  const response = await fetch(
    SPX_BASE_URL +
      "/shipment/order/common/get_nonce_token",
    {
      method: "GET",
      headers: SPX_HEADERS
    }
  );

  const data = await parseResponse(response);

  const nonce =
    data?.nonce_token ??
    data?.nonce ??
    data?.data?.nonce_token ??
    data?.data?.nonce;

  if (!nonce) {
    throw new Error(
      "Không lấy được nonce_token từ SPX"
    );
  }

  return String(nonce);
}

async function callCreateOrder(payload, nonce) {
  const response = await fetch(
    SPX_BASE_URL +
      "/shipment/order/logistic/order/batch_create_order",
    {
      method: "POST",
      headers: {
        ...SPX_HEADERS,
        "content-type": "application/json;charset=UTF-8",
        "x-nonce-token": nonce
      },
      body: JSON.stringify(payload)
    }
  );

  return await parseResponse(response);
}

function findOrderRecordInListAllOrder(
  node,
  targetCodes
) {
  if (!node || typeof node !== "object") return null;

  const codes = targetCodes
    .filter(Boolean)
    .map(x => String(x).trim())
    .filter(Boolean);

  if (codes.length === 0) return null;

  if (
    !Array.isArray(node) &&
    node.order_info &&
    typeof node.order_info === "object"
  ) {
    const orderInfo = node.order_info;

    const orderCodes = [
      orderInfo?.order_sn,
      orderInfo?.sls_tn,
      orderInfo?.spx_tn,
      orderInfo?.waybill_id
    ]
      .filter(Boolean)
      .map(value => String(value).trim());

    if (codes.some(code => orderCodes.includes(code))) {
      return node;
    }
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findOrderRecordInListAllOrder(
        item,
        codes
      );
      if (found) return found;
    }
    return null;
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      const found = findOrderRecordInListAllOrder(
        value,
        codes
      );
      if (found) return found;
    }
  }

  return null;
}

function normalizeSortCodeInfo(sortCodeInfo) {
  if (
    !sortCodeInfo ||
    typeof sortCodeInfo !== "object"
  ) {
    return null;
  }

  const result = {
    r_first_sort_code:
      sortCodeInfo.r_first_sort_code ?? null,
    r_third_sort_code:
      sortCodeInfo.r_third_sort_code ?? null,
    return_first_sort_code:
      sortCodeInfo.return_first_sort_code ?? null
  };

  if (
    result.r_first_sort_code === null &&
    result.r_third_sort_code === null &&
    result.return_first_sort_code === null
  ) {
    return null;
  }

  return result;
}

function findSortCodeInfoDeep(node) {
  if (!node || typeof node !== "object") return null;

  if (
    Object.prototype.hasOwnProperty.call(
      node,
      "sort_code_info"
    )
  ) {
    const value = node.sort_code_info;

    if (value && typeof value === "object") {
      return value;
    }
  }

  const hasDirectSortFields =
    Object.prototype.hasOwnProperty.call(
      node,
      "r_first_sort_code"
    ) ||
    Object.prototype.hasOwnProperty.call(
      node,
      "r_third_sort_code"
    ) ||
    Object.prototype.hasOwnProperty.call(
      node,
      "return_first_sort_code"
    );

  if (hasDirectSortFields) {
    return {
      r_first_sort_code:
        node.r_first_sort_code ?? null,
      r_third_sort_code:
        node.r_third_sort_code ?? null,
      return_first_sort_code:
        node.return_first_sort_code ?? null
    };
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findSortCodeInfoDeep(item);
      if (found) return found;
    }
    return null;
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      const found = findSortCodeInfoDeep(value);
      if (found) return found;
    }
  }

  return null;
}

function findSortRelatedFields(
  node,
  path = "root",
  result = []
) {
  if (!node || typeof node !== "object") {
    return result;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      findSortRelatedFields(
        item,
        `${path}[${index}]`,
        result
      );
    });
    return result;
  }

  for (const [key, value] of Object.entries(node)) {
    const currentPath = `${path}.${key}`;

    if (key.toLowerCase().includes("sort")) {
      result.push({ path: currentPath, value });
    }

    if (value && typeof value === "object") {
      findSortRelatedFields(
        value,
        currentPath,
        result
      );
    }
  }

  return result;
}

async function getOrderExtraInfoFromListAllOrder(trackingCodes) { const targets = [...new Set(trackingCodes.filter(Boolean).map(x => String(x).trim()).filter(Boolean))]; if (targets.length === 0) {
    return { estimated_shipping_fee: null, sort_code_info: null };
} let lastResponse = null; let lastShippingFee = null; let lastOrderRecord = null; let lastSortCodeInfo = null;
// The detail endpoint can supply routing codes on some shipments. Prefer it when
// an actual order_sn is available; list_all_order is still required on others.
const orderSns = targets.filter(code => /^VN[A-Z0-9]{10,}$/i.test(code)).reverse();
for (const orderSn of orderSns) {
    try {
        const response = await fetch(SPX_BASE_URL + "/shipment/order/logistic/order/get_order_info?order_sn=" + encodeURIComponent(orderSn) + "&language_code=vi", {
            method: "GET", headers: { ...SPX_HEADERS, referer: SPX_BASE_URL + "/spx-admin/order/trackings/" + encodeURIComponent(orderSn) },
            signal: AbortSignal.timeout(15000)
        });
        const detail = await parseResponse(response);
        const info = detail?.data?.order_info;
        const expectedWaybills = targets.filter(code => /^SPX/i.test(code));
        if (detail?.retcode !== 0 || String(info?.order_sn || "").trim() !== orderSn ||
            (expectedWaybills.length && !expectedWaybills.includes(String(info?.spx_tn || "").trim()))) continue;
        const rawFee = info.estimated_shipping_fee;
        if (rawFee !== null && rawFee !== undefined && rawFee !== "" && Number.isFinite(Number(rawFee))) lastShippingFee = Number(rawFee);
        const detailSort = normalizeSortCodeInfo(findSortCodeInfoDeep(detail.data));
        if (detailSort) return { estimated_shipping_fee: lastShippingFee, sort_code_info: detailSort };
        console.log("[ORDER_EXTRA] Detail has no routing code; checking paginated order list", orderSn);
    } catch (error) {
        console.warn("[ORDER_EXTRA] Detail lookup failed; checking order list", error.message);
    }
}
 const retryDelays = [0, 2e3, 4e3, 6e3, 8e3]; for (let attemptIndex = 0; attemptIndex < retryDelays.length; attemptIndex++) {
    const attempt = attemptIndex + 1;
    const delayMs = retryDelays[attemptIndex];
    if (delayMs > 0) {
        console.log(`[LIST_ALL_ORDER] Chờ ${delayMs}ms rồi thử lại attempt=${attempt}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    const nowSec = Math.floor(Date.now() / 1e3);
    const searchStartSec = nowSec - 90 * 24 * 60 * 60;
    const pageSize = 100;
    let foundOrderThisAttempt = false;
    for (let offset = 0; ; offset += pageSize) {
        try {
            console.log(`[LIST_ALL_ORDER] attempt=${attempt}/${retryDelays.length}, offset=${offset}, targets=${JSON.stringify(targets)}`);
            const requestBody = { issue_type_list: [], page_size: pageSize, offset, date_range_list: [{ type: 1, start: searchStartSec, end: nowSec + 86400 }], tracking_code_info_list: [], language: "vi" };
            console.log(`[LIST_ALL_ORDER REQUEST] attempt=${attempt}, offset=${offset}:`, JSON.stringify(requestBody));
            const response = await fetch(SPX_BASE_URL + "/shipment/order/logistic/order/list_all_order", { method: "POST", headers: { ...SPX_HEADERS, "content-type": "application/json;charset=UTF-8", referer: "https://spx.vn/spx-admin/order/trackings" }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(15000) });
            const data = await parseResponse(response);
            lastResponse = data;
            console.log(`[LIST_ALL_ORDER RESPONSE] attempt=${attempt}, offset=${offset}:`, JSON.stringify(data).slice(0, 5e3));
            if (data?.retcode !== 0) {
                console.error(`[LIST_ALL_ORDER] SPX ERROR attempt=${attempt}, offset=${offset}, retcode=${data?.retcode}, message=${data?.message}`, JSON.stringify(data));
                return { estimated_shipping_fee: lastShippingFee, sort_code_info: lastSortCodeInfo };
            }
            const orderRecord = findOrderRecordInListAllOrder(data, targets);
            if (!orderRecord) {
                console.log(`[LIST_ALL_ORDER] Chưa tìm thấy đơn attempt=${attempt}, offset=${offset}`);
                const list = data?.data?.list;
                const total = Number(data?.data?.total);
                // Exhaust actual pages instead of stopping after 60 shipments.
                if (!Array.isArray(list) || list.length === 0 ||
                    (Number.isFinite(total) && data?.data?.total != null && offset + list.length >= total)) break;
                continue;
            }
            foundOrderThisAttempt = true;
            lastOrderRecord = orderRecord;
            console.log(`[LIST_ALL_ORDER] TÌM THẤY FULL ORDER RECORD attempt=${attempt}, offset=${offset}:`, JSON.stringify(orderRecord).slice(0, 5e3));
            const rawShippingFee = orderRecord?.order_info?.estimated_shipping_fee ?? orderRecord?.estimated_shipping_fee;
            if (rawShippingFee !== void 0 && rawShippingFee !== null && rawShippingFee !== "") {
                const parsedFee = Number(rawShippingFee);
                lastShippingFee = Number.isFinite(parsedFee) ? parsedFee : rawShippingFee;
                console.log(`[LIST_ALL_ORDER] estimated_shipping_fee=${lastShippingFee}`);
            }
            else {
                console.log("[LIST_ALL_ORDER] Đã thấy đơn nhưng estimated_shipping_fee chưa có");
            }
            let rawSortCodeInfo = orderRecord?.sort_code_info ?? null;
            if (!rawSortCodeInfo) {
                rawSortCodeInfo = findSortCodeInfoDeep(orderRecord);
            }
            console.log("[LIST_ALL_ORDER] raw sort_code_info:", JSON.stringify(rawSortCodeInfo));
            const sortCodeInfo = normalizeSortCodeInfo(rawSortCodeInfo);
            if (sortCodeInfo) {
                lastSortCodeInfo = sortCodeInfo;
            }
            console.log("[LIST_ALL_ORDER] normalized sort_code_info:", JSON.stringify(sortCodeInfo));
            console.log("[LIST_ALL_ORDER] ALL SORT FIELDS:", JSON.stringify(findSortRelatedFields(orderRecord)));
            if (sortCodeInfo !== null) {
                console.log(`[LIST_ALL_ORDER] LẤY EXTRA INFO THÀNH CÔNG attempt=${attempt}, offset=${offset}`);
                console.log(`[LIST_ALL_ORDER] SHIPPING FEE: ${lastShippingFee}`);
                console.log(`[LIST_ALL_ORDER] SORT CODE: ${JSON.stringify(sortCodeInfo)}`);
                return { estimated_shipping_fee: lastShippingFee, sort_code_info: sortCodeInfo };
            }
            console.log("[LIST_ALL_ORDER] Đã thấy đúng đơn nhưng sort_code_info chưa sẵn sàng. Sẽ retry.");
            break;
        }
        catch (error) {
            console.error(`[LIST_ALL_ORDER] Exception attempt=${attempt}, offset=${offset}:`, error);
            break;
        }
    }
    if (!foundOrderThisAttempt) {
        console.log(`[LIST_ALL_ORDER] attempt=${attempt}: không tìm thấy đơn sau khi duyệt danh sách 90 ngày`);
        break;
    }
} console.warn("[LIST_ALL_ORDER] Hết thời gian chờ sort_code_info:", JSON.stringify({ targets, estimated_shipping_fee: lastShippingFee, sort_code_info: lastSortCodeInfo, last_order_record: lastOrderRecord, last_response: lastResponse }).slice(0, 1e4)); return { estimated_shipping_fee: lastShippingFee, sort_code_info: lastSortCodeInfo }; }

async function executeOrderFlow(
  baseOrder,
  bestVoucher,
  voucherInstanceId
) {
  const checkPayload = { list: [baseOrder] };
  const checkResponse =
    await callCheckOrder(checkPayload);

  if (checkResponse?.retcode !== 0) {
    return {
      success: false,
      step: "check_order",
      retcode: checkResponse?.retcode,
      applied_voucher: bestVoucher,
      sent_payload: checkPayload,
      check_response: checkResponse
    };
  }

  const checkedOrder =
    checkResponse?.data?.list?.[0] || {};

  const createOrder = {
    ...baseOrder,
    ...checkedOrder,
    discount_shipping_fee: String(
      checkedOrder.discount_shipping_fee ?? "0"
    ),
    shipping_fee_voucher: String(
      checkedOrder.shipping_fee_voucher ??
      bestVoucher?.discount_amount ??
      "0"
    ),
    basic_shipping_fee_without_discount: String(
      checkedOrder.basic_shipping_fee_without_discount ??
      "0"
    ),
    estimated_shipping_fee_without_voucher: String(
      checkedOrder.estimated_shipping_fee_without_voucher ??
      "0"
    ),
    total_bsf: String(
      checkedOrder.total_bsf ?? "0"
    ),
    additional_service_fee: String(
      checkedOrder.additional_service_fee ?? "0"
    ),
    voucher_code:
      checkedOrder.voucher_code ||
      baseOrder.voucher_code ||
      "",
    account_voucher_id: String(
      checkedOrder.account_voucher_id ??
      baseOrder.account_voucher_id ??
      "0"
    )
  };

  if (voucherInstanceId) {
    createOrder.voucher_instance_id =
      voucherInstanceId;
  } else if (
    !createOrder.voucher_instance_id ||
    createOrder.voucher_instance_id === "" ||
    createOrder.voucher_instance_id === "0"
  ) {
    delete createOrder.voucher_instance_id;
  }

  if (checkedOrder.deliver_info) {
    createOrder.deliver_info = {
      ...createOrder.deliver_info,
      ...checkedOrder.deliver_info
    };
  }

  if (checkedOrder.fulfillment_info) {
    createOrder.fulfillment_info = {
      ...createOrder.fulfillment_info,
      ...checkedOrder.fulfillment_info
    };
  }

  const nonce = await callGetNonce();
  const createPayload = { list: [createOrder] };

  const createResponse =
    await callCreateOrder(createPayload, nonce);

  const createRetcode =
    createResponse?.retcode ?? null;

  const createdOrder =
    createResponse?.data?.list?.[0] ||
    createResponse?.data?.abnormal_list?.[0] ||
    null;

  if (
    createResponse?.data?.abnormal_list?.length > 0
  ) {
    const abnormal =
      createResponse.data.abnormal_list[0];

    return {
      success: false,
      step: "create_order_abnormal",
      retcode: abnormal.retcode,
      message: abnormal.message,
      nonce,
      applied_voucher: bestVoucher,
      order_response: createResponse
    };
  }

  if (createRetcode !== 0) {
    return {
      success: false,
      step: "create_order",
      retcode: createRetcode,
      message: createResponse?.message,
      nonce,
      applied_voucher: bestVoucher,
      sent_payload: createPayload,
      order_response: createResponse
    };
  }

  const extraOrderInfo =
    await getOrderExtraInfoFromListAllOrder([
      createdOrder?.spx_tn,
      createdOrder?.sls_tn,
      createdOrder?.order_sn
    ]);

  return {
    success: true,
    nonce,
    order_sn: createdOrder?.order_sn || null,
    sls_tn: createdOrder?.sls_tn || null,
    spx_tn: createdOrder?.spx_tn || null,
    applied_voucher: bestVoucher,
    voucher_instance_id: voucherInstanceId,
    estimated_shipping_fee:
      extraOrderInfo.estimated_shipping_fee,
    sort_code_info:
      extraOrderInfo.sort_code_info,
    fee_info: createdOrder?.fee_info || null,
    order_response: createResponse
  };
}

// Chỉ giữ URL ảnh HTTPS hợp lệ.
const safeUrls = value => [
  ...new Set(
    (Array.isArray(value) ? value : []).filter(url => {
      try {
        return new URL(url).protocol === "https:";
      } catch {
        return false;
      }
    })
  )
];

// Dữ liệu trả cho bill: hành trình và ảnh bằng chứng.
// Không trả thông tin quản lý, thanh toán, cookie SPX.
function toBillTrackingResponse(
  result,
  expectedWaybill
) {
  if (
    result?.retcode !== 0 ||
    !result?.data
  ) {
    throw new Error(
      "SPX không trả về chi tiết vận đơn. " +
      "Phiên đăng nhập có thể đã hết hạn."
    );
  }

  const data = result.data;

  if (
    data.order_info?.spx_tn !== expectedWaybill
  ) {
    throw new Error(
      "Chi tiết SPX không khớp vận đơn của bill."
    );
  }

  const tracking = data.tracking_info || {};

  return {
    retcode: 0,
    data: {
      order_info: {
        spx_tn: expectedWaybill,
        tracking_code_group_name:
          data.order_info.tracking_code_group_name,
        tracking_code_subgroup_name:
          data.order_info.tracking_code_subgroup_name
      },
      sls_tracking_info: {
        records: (
          data.sls_tracking_info?.records || []
        ).map(record => ({
          tracking_code: record.tracking_code,
          tracking_name: record.tracking_name,
          milestone_name: record.milestone_name,
          actual_time: record.actual_time,
          description: record.description,
          buyer_description:
            record.buyer_description,
          seller_description:
            record.seller_description,
          current_location: {
            full_address:
              record.current_location?.full_address ||
              "",
            location_name:
              record.current_location?.location_name ||
              ""
          }
        }))
      },
      tracking_info: {
        pod_list: safeUrls(tracking.pod_list),
        returning_start_time:
          tracking.returning_start_time ?? 0,
        ep_info_list: (
          Array.isArray(tracking.ep_info_list)
            ? tracking.ep_info_list
            : []
        ).map(item => ({
          tracking_code: String(
            item.tracking_code || ""
          ),
          pod_list: safeUrls(item.pod_list),
          pop_list: safeUrls(item.pop_list)
        }))
      }
    },
    message: "success"
  };
}

// ACTION get_bill_tracking:
// { action: "get_bill_tracking", order_id: "ID pancake_orders" }
async function getBillTracking(input) {
  const orderId =
    String(input.order_id || "").trim();

  if (
    !/^[a-zA-Z0-9_-]{1,80}$/.test(orderId)
  ) {
    return responseJson(
      {
        success: false,
        error: "Thiếu order_id của bill hợp lệ"
      },
      400
    );
  }

  const { data: order, error } = await supabase
    .from("pancake_orders")
    .select("id,jt_waybill_id,order_spx")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    return responseJson(
      {
        success: false,
        error:
          "Không đọc được bill để lấy thông tin SPX"
      },
      502
    );
  }

  if (!order) {
    return responseJson(
      {
        success: false,
        error: "Không tìm thấy bill"
      },
      404
    );
  }

  const waybill = String(
    order.jt_waybill_id || ""
  )
    .trim()
    .toUpperCase();

  const orderSn =
    String(order.order_spx || "").trim();

  if (!/^SPXVN[A-Z0-9]+$/.test(waybill)) {
    return responseJson(
      {
        success: false,
        error: "Bill chưa có vận đơn SPX"
      },
      422
    );
  }

  if (!/^VN[A-Z0-9]{10,}$/.test(orderSn)) {
    return responseJson(
      {
        success: false,
        error:
          "Bill chưa lưu order_spx (order_sn) " +
          "để lấy ảnh bằng chứng"
      },
      422
    );
  }

  try {
    const response = await fetch(
      SPX_BASE_URL +
        "/shipment/order/logistic/order/get_order_info" +
        "?order_sn=" +
        encodeURIComponent(orderSn) +
        "&language_code=vi",
      {
        method: "GET",
        headers: {
          ...SPX_HEADERS,
          referer:
            "https://spx.vn/spx-admin/order/trackings"
        },
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!response.ok) {
      return responseJson(
        {
          success: false,
          error:
            "SPX trả về HTTP " + response.status
        },
        502
      );
    }

    const data = await parseResponse(response);

    return responseJson({
      success: true,
      ...toBillTrackingResponse(data, waybill)
    });
  } catch (err) {
    return responseJson(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Không tải được ảnh bằng chứng SPX"
      },
      502
    );
  }
}

serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: CORS_HEADERS
    });
  }

  if (req.method !== "POST") {
    return responseJson(
      {
        success: false,
        error: "Chỉ hỗ trợ POST"
      },
      405
    );
  }

  try {
    const input = await req.json();

    if (!SPX_COOKIE) {
      return responseJson(
        {
          success: false,
          error:
            "Chưa cấu hình SPX_COOKIE " +
            "trong Supabase Secrets"
        },
        503
      );
    }

    // Lấy hành trình và ảnh bằng chứng cho bill.
    if (input?.action === "get_bill_tracking") {
      return await getBillTracking(input);
    }

    // Lấy phí vận chuyển và sort code.
    if (input.action === "get_order_extra") {
      const targetCodes = [
        input.spx_tn,
        input.sls_tn,
        input.order_sn,
        input.waybill_id
      ]
        .filter(Boolean)
        .map(value => String(value).trim())
        .filter(Boolean);

      if (targetCodes.length === 0) {
        return responseJson(
          {
            success: false,
            error:
              "Thiếu spx_tn/sls_tn/order_sn/" +
              "waybill_id để lấy thông tin SPX"
          },
          400
        );
      }

      const extraInfo =
        await getOrderExtraInfoFromListAllOrder(
          targetCodes
        );

      const hasExtraInfo =
        extraInfo.estimated_shipping_fee !== null ||
        extraInfo.sort_code_info !== null;

      return responseJson(
        {
          success: hasExtraInfo,
          estimated_shipping_fee:
            extraInfo.estimated_shipping_fee,
          sort_code_info:
            extraInfo.sort_code_info,
          target_codes: targetCodes,
          ...(hasExtraInfo
            ? {}
            : {
                error:
                  "Không tìm thấy estimated_shipping_fee / " +
                  "sort_code_info từ SPX"
              })
        },
        hasExtraInfo ? 200 : 404
      );
    }

    // Hủy đơn SPX.
    if (input.action === "cancel") {
      const targetCode =
        input.order_sn ||
        input.waybill_id ||
        input.spx_tn;

      if (!targetCode) {
        return responseJson(
          {
            success: false,
            error:
              "Thiếu order_sn/waybill_id/" +
              "spx_tn để hủy"
          },
          400
        );
      }

      const cancelResult =
        await cancelSpxOrder(targetCode);

      return responseJson(
        cancelResult,
        cancelResult.success ? 200 : 400
      );
    }

    // Tạo đơn SPX: giữ payload hiện tại của ứng dụng.
    if (!input || !input.receiver) {
      return responseJson(
        {
          success: false,
          error: "Thiếu thông tin receiver"
        },
        400
      );
    }

    const receiver = input.receiver;
    const product = input.product || {};
    const codVal = Number(input.cod) || 0;

    const addrVersion =
      receiver.address_version !== undefined
        ? Number(receiver.address_version)
        : 2;

    const parcelWeight =
      Number(product.weight) || 1;

    const parcelItemName =
      product.name || "giày";

    const itemPrice = product.price
      ? String(product.price)
      : "2999999";

    const insuredValue = product.price
      ? Number(product.price)
      : 2999999;

    let warehouseQuery = supabase
      .from("warehouses")
      .select("*")
      .eq("is_active", true);

    if (input.warehouse_id) {
      warehouseQuery = warehouseQuery.eq(
        "id",
        input.warehouse_id
      );
    } else {
      warehouseQuery = warehouseQuery.eq(
        "is_default",
        true
      );
    }

    const {
      data: warehouse,
      error: warehouseError
    } = await warehouseQuery
      .limit(1)
      .maybeSingle();

    if (warehouseError) {
      console.error(
        "WAREHOUSE QUERY ERROR:",
        warehouseError
      );

      return responseJson(
        {
          success: false,
          step: "warehouse",
          error:
            "Không lấy được thông tin kho gửi hàng " +
            "từ Supabase",
          detail: warehouseError.message
        },
        500
      );
    }

    if (!warehouse) {
      return responseJson(
        {
          success: false,
          step: "warehouse",
          error: input.warehouse_id
            ? "Không tìm thấy kho gửi hàng đã chọn"
            : "Chưa cấu hình kho gửi hàng mặc định"
        },
        400
      );
    }

    const productInfo =
      await getProductInfo(53001);

    const pickupTimeInfo =
      productInfo.pickup_time_info;

    let pickupTime = 0;
    let pickupSlotId = 1;
    let pickupSlotName = "10h đến trước 18h";

    if (pickupTimeInfo?.timeslots?.length > 0) {
      const firstTimeslot =
        pickupTimeInfo.timeslots[0];

      pickupTime = firstTimeslot.date_id;

      if (firstTimeslot.slots?.length > 0) {
        pickupSlotId =
          firstTimeslot.slots[0].slot_id;

        pickupSlotName =
          firstTimeslot.slots[0].slot;
      }
    } else if (
      pickupTimeInfo?.days?.length > 0
    ) {
      pickupTime =
        pickupTimeInfo.days[0].date_id;
    }

    if (!pickupTime) {
      return responseJson(
        {
          success: false,
          step: "pickup_time",
          error:
            "Không tìm được ngày lấy hàng hợp lệ từ SPX"
        },
        400
      );
    }

    const deliverInfo = {
      deliver_name: receiver.name || "",
      deliver_phone: receiver.phone
        ? receiver.phone.startsWith("84")
          ? receiver.phone
          : "84" + receiver.phone.replace(/^0/, "")
        : "",
      deliver_country: "VN",
      deliver_state:
        receiver.province?.name || "",
      deliver_state_location_id:
        Number(receiver.province?.id) || 0,
      deliver_post_code: "",
      deliver_detail_address:
        receiver.detail_address || "",
      deliver_unit_no: "",
      deliver_place_id: "",
      deliver_address_version: addrVersion,
      deliver_instruction: "",
      address_uncertain_tag: 0
    };

    if (receiver.deliver_address_id) {
      deliverInfo.deliver_address_id =
        String(receiver.deliver_address_id);
    }

    if (receiver.deliver_address_pk_id) {
      deliverInfo.deliver_address_pk_id =
        Number(receiver.deliver_address_pk_id);
    }

    const validWardName =
      receiver.ward?.name &&
      receiver.ward.name !== "Chọn Huyện trước" &&
      receiver.ward.name !== "Đang tải..."
        ? receiver.ward.name
        : "";

    const validWardId =
      receiver.ward?.id && receiver.ward.id > 0
        ? Number(receiver.ward.id)
        : 0;

    if (addrVersion === 0) {
      deliverInfo.deliver_city =
        receiver.district?.name || "";

      deliverInfo.deliver_city_location_id =
        Number(receiver.district?.id) || 0;

      deliverInfo.deliver_district =
        validWardName;

      deliverInfo.deliver_district_location_id =
        validWardId;
    } else {
      deliverInfo.deliver_city =
        validWardName ||
        receiver.district?.name ||
        "";

      deliverInfo.deliver_city_location_id =
        validWardId ||
        Number(receiver.district?.id) ||
        0;
    }

    const senderInfo = {
      sender_address_pk_id:
        Number(warehouse.sender_address_pk_id) || 0,
      sender_name:
        warehouse.sender_name ||
        warehouse.name ||
        "",
      sender_phone: warehouse.sender_phone
        ? String(warehouse.sender_phone).startsWith("84")
          ? String(warehouse.sender_phone)
          : "84" +
            String(warehouse.sender_phone).replace(/^0/, "")
        : "",
      sender_address_id:
        warehouse.sender_address_id
          ? String(warehouse.sender_address_id)
          : "",
      sender_country:
        warehouse.sender_country || "VN",
      sender_state:
        warehouse.sender_state || "",
      sender_state_location_id:
        Number(warehouse.sender_state_location_id) || 0,
      sender_city:
        warehouse.sender_city || "",
      sender_city_location_id:
        Number(warehouse.sender_city_location_id) || 0,
      sender_post_code:
        warehouse.sender_post_code || "",
      sender_detail_address:
        warehouse.sender_detail_address || "",
      sender_unit_no:
        warehouse.sender_unit_no || "",
      sender_place_id:
        warehouse.sender_place_id || "",
      sender_address_instruction:
        warehouse.sender_address_instruction || "",
      sender_address_version:
        warehouse.sender_address_version !== undefined
          ? Number(warehouse.sender_address_version)
          : 2
    };

    if (
      !senderInfo.sender_name ||
      !senderInfo.sender_phone ||
      !senderInfo.sender_detail_address
    ) {
      return responseJson(
        {
          success: false,
          step: "warehouse",
          error:
            "Thông tin kho gửi hàng chưa đầy đủ",
          warehouse_id: warehouse.id
        },
        400
      );
    }

    const voucherDeliverInfo = {
      state: deliverInfo.deliver_state,
      city: deliverInfo.deliver_city,
      detail_address:
        deliverInfo.deliver_detail_address,
      address_version:
        deliverInfo.deliver_address_version
    };

    if (
      addrVersion === 0 &&
      deliverInfo.deliver_district
    ) {
      voucherDeliverInfo.district =
        deliverInfo.deliver_district;
    }

    const voucherOrderInfo = {
      product_id: 53001,
      weight: parcelWeight,
      express_insured_value: insuredValue,
      pickup_info: {
        state: senderInfo.sender_state,
        city: senderInfo.sender_city,
        detail_address:
          senderInfo.sender_detail_address,
        address_version:
          senderInfo.sender_address_version
      },
      pickup_postcode: "",
      deliver_info: voucherDeliverInfo,
      delivery_postcode: "",
      collect_type: 1,
      allow_mutual_check: 0,
      allow_try_on: 0,
      allow_partial_delivery: 0,
      vas_info: {},
      insurance_collect: 1,
      cod_amount: codVal,
      cod_collection: codVal > 0 ? 1 : 0
    };

    const bestVoucher =
      await getBestVoucher(voucherOrderInfo);

    let voucherInstanceId = null;

    if (bestVoucher) {
      voucherInstanceId =
        await getVoucherInstanceId(
          bestVoucher.voucher_code,
          bestVoucher.account_voucher_id,
          voucherOrderInfo
        );
    }

    const fulfillmentInfo = {
      cod_collection: codVal > 0 ? 1 : 0,
      cod_amount: codVal,
      collect_type: 1,
      deliver_type: 1,
      insurance_collection: 1,
      is_pickup_weight: 1,
      payment_role: 1,
      allow_mutual_check: 0,
      allow_try_on: 0,
      allow_partial_delivery: 0,
      pickup_time: pickupTime,
      pickup_time_range_id: pickupSlotId,
      pickup_time_range: pickupSlotName
    };

    const baseOrder = {
      base_info: {
        order_type: 1,
        product_id: 53001,
        three_pl_name: "SPX",
        product_name: "Standard Service",
        create_method: 1
      },
      sender_info: senderInfo,
      deliver_info: deliverInfo,
      fulfillment_info: fulfillmentInfo,
      parcel_info: {
        parcel_category: 0,
        parcel_weight: parcelWeight,
        parcel_item_quantity: 1,
        customer_tracking_no: "",
        parcel_item_name: parcelItemName,
        express_insured_value: insuredValue,
        item_list: [
          {
            id: 0,
            item_id: 0,
            account_id: "",
            item_name: parcelItemName,
            item_weight: String(
              Math.round(parcelWeight * 1000)
            ),
            item_price: itemPrice,
            item_picture: "",
            item_code: "",
            item_category_code: "",
            item_quantity: 1
          }
        ]
      },
      vas_info: {},
      voucher_code: bestVoucher
        ? bestVoucher.voucher_code
        : "",
      account_voucher_id: bestVoucher
        ? bestVoucher.account_voucher_id
        : "0",
      product_id: 53001
    };

    if (voucherInstanceId) {
      baseOrder.voucher_instance_id =
        voucherInstanceId;
    }

    const result1 = await executeOrderFlow(
      baseOrder,
      bestVoucher,
      voucherInstanceId
    );

    if (result1.success) {
      return responseJson(result1, 200);
    }

    console.log(
      "Attempt 1 có voucher thất bại:",
      JSON.stringify(result1, null, 2)
    );

    baseOrder.voucher_code = "";
    baseOrder.account_voucher_id = "0";
    delete baseOrder.voucher_instance_id;

    const result2 = await executeOrderFlow(
      baseOrder,
      null,
      null
    );

    return responseJson(
      {
        ...result2,
        attempt_1_error: result1
      },
      result2.success ? 200 : 502
    );
  } catch (error) {
    console.error(
      "CREATE ORDER ERROR:",
      error
    );

    return responseJson(
      {
        success: false,
        step: "exception",
        error:
          error instanceof Error
            ? error.message
            : String(error)
      },
      500
    );
  }
});