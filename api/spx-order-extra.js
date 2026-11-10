// Vercel Serverless Function: read SPX shipping fee/sort codes from list_all_order
// Uses the payload shape confirmed working in SPX Admin:
// date_range_list + tracking_code_info_list: [].
// SPX auth is taken from SPX_COOKIE when configured; the fallback mirrors the
// currently working cookie used by the create-order Edge Function.

const SPX_BASE_URL = 'https://spx.vn';

const SPX_COOKIE =
    process.env.SPX_COOKIE ||
    'app_lang=vi; nss_sys_type=true; nss_cid=VN; spx_first_login_flag=true; spx_token=2yG6A8m06Sr6JACeYuz7FLHsfLQMGJzV1SVp1MctkeFT4XT5M5Eg2ajHAlh40rjr; spx_sid=d31b2fd660c503c3b4bcbb735465fee22d114064a7736c0a6979125dfc7107cc; login_type=1; login_status=true';

function normalizeCode(value) {
    return value === null || value === undefined
        ? ''
        : String(value).trim();
}

function findOrder(list, targetCodes) {
    if (!Array.isArray(list) || !targetCodes.length) return null;

    const targetSet = new Set(targetCodes.map(normalizeCode).filter(Boolean));

    return list.find((item) => {
        const info = item?.order_info || {};

        const candidates = [
            info.spx_tn,
            info.sls_tn,
            info.order_sn,
            item?.spx_tn,
            item?.sls_tn,
            item?.order_sn
        ]
            .map(normalizeCode)
            .filter(Boolean);

        return candidates.some((code) => targetSet.has(code));
    }) || null;
}

function extractList(data) {
    const candidates = [
        data?.data?.list,
        data?.data?.order_list,
        data?.data?.orders,
        data?.list
    ];
    return candidates.find(Array.isArray) || [];
}

async function fetchOrderPage(offset = 0, pageSize = 10) {
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = nowSec - 180 * 24 * 60 * 60;

    const response = await fetch(
        SPX_BASE_URL + '/shipment/order/logistic/order/list_all_order',
        {
            method: 'POST',
            headers: {
                accept: 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'content-type': 'application/json;charset=UTF-8',
                origin: 'https://spx.vn',
                priority: 'u=1, i',
                referer: 'https://spx.vn/spx-admin/order/trackings',
                'sec-ch-ua': '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                    'Chrome/153.0.0.0 Safari/537.36',
                cookie: SPX_COOKIE
            },
            body: JSON.stringify({
                issue_type_list: [],
                page_size: pageSize,
                offset,
                date_range_list: [
                    {
                        type: 1,
                        start: startSec,
                        end: nowSec + 86400
                    }
                ],
                tracking_code_info_list: [],
                language: 'vi'
            })
        }
    );

    const text = await response.text();

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            'SPX list_all_order trả dữ liệu không phải JSON. HTTP ' +
            response.status +
            ': ' +
            text.slice(0, 300)
        );
    }

    if (!response.ok) {
        throw new Error(
            data?.message ||
            data?.error ||
            ('SPX list_all_order HTTP ' + response.status)
        );
    }

    if (data?.retcode !== 0) {
        throw new Error(
            'SPX list_all_order retcode=' +
            String(data?.retcode) +
            ': ' +
            (data?.message || data?.error || 'Unknown error')
        );
    }

    return {
        data,
        list: extractList(data)
    };
}

async function findOrderFromSpx(targetCodes) {
    const pageSize = 10;
    const maxPages = 20;

    for (let page = 0; page < maxPages; page++) {
        const offset = page * pageSize;
        const { data, list } = await fetchOrderPage(offset, pageSize);
        const order = findOrder(list, targetCodes);

        if (order) {
            return { order, data, offset };
        }

        if (list.length < pageSize) {
            break;
        }
    }

    return null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Chỉ hỗ trợ POST'
        });
    }

    try {
        const input = req.body || {};

        const targetCodes = [
            input.spx_tn,
            input.sls_tn,
            input.order_sn,
            input.waybill_id
        ]
            .map(normalizeCode)
            .filter(Boolean);

        if (!targetCodes.length) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu mã SPX TN / SLS TN / Order SN'
            });
        }

        let lastError = null;

        // Đơn vừa tạo đôi khi mất vài giây mới xuất hiện trong list_all_order.
        for (let attempt = 1; attempt <= 6; attempt++) {
            try {
                const found = await findOrderFromSpx(targetCodes);

                if (found?.order) {
                    const order = found.order;
                    const info = order.order_info || {};

                    const rawFee =
                        info.estimated_shipping_fee ??
                        order.estimated_shipping_fee;

                    const fee =
                        rawFee === null ||
                        rawFee === undefined ||
                        rawFee === ''
                            ? null
                            : Number(rawFee);

                    return res.status(200).json({
                        success: true,
                        estimated_shipping_fee:
                            Number.isFinite(fee) ? fee : rawFee,
                        sort_code_info:
                            order.sort_code_info ||
                            info.sort_code_info ||
                            null,
                        order_info: {
                            order_sn:
                                info.order_sn ||
                                order.order_sn ||
                                null,
                            sls_tn:
                                info.sls_tn ||
                                order.sls_tn ||
                                null,
                            spx_tn:
                                info.spx_tn ||
                                order.spx_tn ||
                                null
                        },
                        attempt,
                        offset: found.offset
                    });
                }
            } catch (err) {
                lastError = err;
                console.warn(
                    '[SPX ORDER EXTRA] attempt=' + attempt,
                    err instanceof Error ? err.message : String(err)
                );
            }

            if (attempt < 6) {
                await new Promise((resolve) =>
                    setTimeout(resolve, attempt * 700)
                );
            }
        }

        return res.status(404).json({
            success: false,
            error:
                lastError?.message ||
                'Đơn chưa xuất hiện trong list_all_order của SPX'
        });
    } catch (error) {
        console.error('SPX order extra error:', error);

        return res.status(500).json({
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : String(error)
        });
    }
}
