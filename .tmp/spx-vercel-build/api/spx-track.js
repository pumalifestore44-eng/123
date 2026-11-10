import { extractSpxCode, parseSpxTracking } from '../spx-tracking-utils.mjs';

// Public SPX lookup, proxied server-side because browsers cannot set Cookie/Referer.
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Chỉ hỗ trợ GET' });
    }
    let code;
    try {
        const value = new URL(req.url, 'http://localhost').searchParams.get('spx_tn') || '';
        code = extractSpxCode(value);
        if (code !== value.trim().toUpperCase()) throw new Error('Mã vận đơn không hợp lệ');
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
    try {
        const response = await fetch(`https://spx.vn/shipment/order/open/order/get_order_info?spx_tn=${encodeURIComponent(code)}&language_code=vi`, {
            signal: AbortSignal.timeout(20000),
            headers: {
                accept: 'application/json, text/plain, */*',
                'accept-language': 'vi,en;q=0.9',
                referer: `https://spx.vn/m/track?${code}`,
                source: 'mobile',
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
                cookie: 'app_lang=vi; nss_sys_type=true; nss_cid=VN; app_source=nss'
            }
        });
        if (!response.ok) throw new Error(`SPX trả về HTTP ${response.status}`);
        const data = await response.json();
        return res.status(200).json({ spx_tn: code, ...parseSpxTracking(data, code) });
    } catch (err) {
        return res.status(502).json({ error: err.name === 'TimeoutError' ? 'SPX phản hồi quá chậm. Vui lòng thử lại.' : err.message });
    }
}
