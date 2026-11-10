const safeUrls = value => [...new Set((Array.isArray(value) ? value : []).filter(url => {
    try { return new URL(url).protocol === 'https:'; } catch { return false; }
}))];

// Expose only bill tracking information, never the authenticated management payload.
export function toBillTrackingResponse(result, expectedWaybill) {
    if (result?.retcode !== 0 || !result?.data) throw new Error('SPX không trả về chi tiết vận đơn. Phiên đăng nhập có thể đã hết hạn.');
    const data = result.data;
    if (data.order_info?.spx_tn !== expectedWaybill) throw new Error('Chi tiết SPX không khớp vận đơn của bill.');
    const tracking = data.tracking_info || {};
    return {
        retcode: 0,
        data: {
            order_info: {
                spx_tn: expectedWaybill,
                tracking_code_group_name: data.order_info.tracking_code_group_name,
                tracking_code_subgroup_name: data.order_info.tracking_code_subgroup_name
            },
            sls_tracking_info: {
                records: (data.sls_tracking_info?.records || []).map(record => ({
                    tracking_code: record.tracking_code, tracking_name: record.tracking_name,
                    milestone_name: record.milestone_name, actual_time: record.actual_time,
                    description: record.description, buyer_description: record.buyer_description,
                    seller_description: record.seller_description,
                    current_location: {
                        full_address: record.current_location?.full_address || '',
                        location_name: record.current_location?.location_name || ''
                    }
                }))
            },
            tracking_info: {
                pod_list: safeUrls(tracking.pod_list),
                returning_start_time: tracking.returning_start_time ?? 0,
                ep_info_list: (Array.isArray(tracking.ep_info_list) ? tracking.ep_info_list : []).map(item => ({
                    tracking_code: String(item.tracking_code || ''),
                    pod_list: safeUrls(item.pod_list),
                    pop_list: safeUrls(item.pop_list)
                }))
            }
        },
        message: 'success'
    };
}
