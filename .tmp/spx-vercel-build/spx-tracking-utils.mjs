export function extractSpxCode(value) {
    const matches = [...String(value ?? '').toUpperCase().matchAll(/\bSPXVN[A-Z0-9]{6,30}\b/g)].map(m => m[0]);
    const codes = [...new Set(matches)];
    if (codes.length !== 1) throw new Error(codes.length ? 'Có nhiều mã vận đơn. Vui lòng nhập từng mã.' : 'Không tìm thấy mã vận đơn SPXVN hợp lệ.');
    return codes[0];
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
    return {
        tracking_code_group_name: group,
        tracking_code_subgroup_name: String(info.tracking_code_subgroup_name || ''),
        latest_event: String(latest?.description || latest?.tracking_name || ''),
        is_picked_up: group.toLowerCase() === 'in transit'
    };
}

export function buildSpxTrackingPatch(record, result, now = new Date().toISOString()) {
    const picked = Boolean(record.is_picked_up || result.is_picked_up);
    return {
        ...result,
        is_picked_up: picked,
        picked_up_at: record.picked_up_at || (picked ? now : null),
        last_checked_at: now,
        last_error: null
    };
}
