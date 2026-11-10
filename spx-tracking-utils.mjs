export function extractSpxCode(value) {
    const matches = [...String(value ?? '').toUpperCase().matchAll(/\bSPXVN[A-Z0-9]{6,30}\b/g)].map(m => m[0]);
    const codes = [...new Set(matches)];
    if (codes.length !== 1) throw new Error(codes.length ? 'Có nhiều mã vận đơn. Vui lòng nhập từng mã.' : 'Không tìm thấy mã vận đơn SPXVN hợp lệ.');
    return codes[0];
}

export function extractSpxCodes(value) {
    const text = String(value ?? '').trim();
    // Preserve the existing ability to paste one complete QR tracking URL.
    if (/^https?:\/\/\S+$/i.test(text)) return { codes: [extractSpxCode(text)], duplicates: 0 };
    const tokens = text.toUpperCase().split(/[\s,\-–—]+/).filter(Boolean);
    if (!tokens.length) throw new Error('Vui lòng nhập ít nhất một mã vận đơn SPXVN.');
    const invalid = tokens.filter(token => !/^SPXVN[A-Z0-9]{6,30}$/.test(token));
    if (invalid.length) throw new Error(`Mã không hợp lệ: ${invalid.slice(0, 5).join(', ')}. Vui lòng sửa trước khi thêm.`);
    const codes = [...new Set(tokens)];
    return { codes, duplicates: tokens.length - codes.length };
}

export const SPX_STAGES = [
    { key: 'pending_pickup', label: 'Chờ lấy hàng', countId: 'spxPendingCount', listId: 'spxPendingList' },
    { key: 'in_transit', label: 'Đang vận chuyển', countId: 'spxTransitCount', listId: 'spxTransitList' },
    { key: 'out_for_delivery', label: 'Đang giao hàng', countId: 'spxDeliveringCount', listId: 'spxDeliveringList' },
    { key: 'delivered', label: 'Đã giao hàng', countId: 'spxDeliveredCount', listId: 'spxDeliveredList' }
];

function mapSpxStage(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    if (['pending pickup', 'awaiting pickup', 'chờ lấy hàng'].includes(normalized)) return 'pending_pickup';
    if (['in transit', 'đang vận chuyển'].includes(normalized)) return 'in_transit';
    if (['out for delivery', 'delivering', 'đang giao hàng', 'đang giao'].includes(normalized)) return 'out_for_delivery';
    if (['delivered', 'delivered successfully', 'delivery successful', 'đã giao hàng', 'giao hàng thành công'].includes(normalized)) return 'delivered';
    return null;
}

export function getSpxStage(record) {
    const group = mapSpxStage(record.tracking_code_group_name);
    const subgroup = mapSpxStage(record.tracking_code_subgroup_name);
    // SPX may retain the broad In Transit group while the subgroup is Delivering.
    if (group === 'delivered') return group;
    if (group === 'in_transit' && ['out_for_delivery', 'delivered'].includes(subgroup)) return subgroup;
    return group || subgroup || (record.is_picked_up ? 'in_transit' : 'pending_pickup');
}

export function shouldCheckSpxTracking(record) {
    return getSpxStage(record) !== 'delivered';
}

export const SPX_AUTO_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
export function isSpxAutoCheckDue(lastCheckAt, now = Date.now()) {
    const timestamp = Number(lastCheckAt);
    return Number.isFinite(timestamp) && timestamp > 0 && now - timestamp >= SPX_AUTO_CHECK_INTERVAL;
}

export function parseSpxTracking(response, expectedCode) {
    if (Number(response?.retcode) !== 0 || response?.retcode == null) {
        throw new Error(response?.message || 'SPX không trả về kết quả hợp lệ.');
    }
    const info = response?.data?.order_info;
    if (!info?.spx_tn || String(info.spx_tn).toUpperCase() !== expectedCode) {
        throw new Error('Kết quả SPX không khớp mã vận đơn đang tra cứu.');
    }
    const group = String(info.tracking_code_group_name || '').trim();
    if (!group) throw new Error('SPX chưa trả về trạng thái vận đơn.');
    const records = response.data.sls_tracking_info?.records || [];
    const latest = [...records].sort((a, b) => Number(b.actual_time || 0) - Number(a.actual_time || 0))[0];
    const status = {
        tracking_code_group_name: group,
        tracking_code_subgroup_name: String(info.tracking_code_subgroup_name || ''),
        latest_event: String(latest?.description || latest?.tracking_name || '')
    };
    return { ...status, is_picked_up: getSpxStage(status) !== 'pending_pickup' };
}

export function buildSpxTrackingPatch(record, result, now = new Date().toISOString()) {
    const picked = Boolean(record.is_picked_up || result.is_picked_up || getSpxStage(result) !== 'pending_pickup');
    return {
        ...result,
        is_picked_up: picked,
        picked_up_at: record.picked_up_at || (picked ? now : null),
        last_checked_at: now,
        last_error: null
    };
}
