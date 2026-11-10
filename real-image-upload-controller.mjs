import { uploadRealImageBatch } from './real-image-batch-upload.mjs';

export async function persistRealProductImages({
  orderId, files, fetchImpl, supabaseUrl, supabaseKey, pancakeApiKey,
  onProgress = () => {}
}) {
  const selected = Array.from(files || []);
  if (!selected.length) return { uploaded: [], errors: [], saved: false, total: 0 };

  const headers = { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey };
  const writeHeaders = { ...headers, 'Content-Type': 'application/json' };
  const orderResponse = await fetchImpl(
    supabaseUrl + '/rest/v1/pancake_orders?id=eq.' + encodeURIComponent(orderId) +
      '&select=bill_full_name,display_id&limit=1',
    { headers }
  );
  if (!orderResponse.ok) throw new Error('Không lấy được thông tin đơn: HTTP ' + orderResponse.status);
  const [order] = await orderResponse.json();
  if (!order) throw new Error('Không tìm thấy đơn hàng');
  const displayId = String(order.display_id || orderId).trim().match(/\d+$/)?.[0] ||
    String(order.display_id || orderId).trim();
  const orderImageUrl = supabaseUrl + '/rest/v1/chatbot_images?order_id=eq.' +
    encodeURIComponent(displayId);

  async function checkSaved(response, action) {
    if (!response.ok)
      throw new Error(action + ': HTTP ' + response.status + ' ' + (await response.text()).slice(0, 300));
  }

  const result = await uploadRealImageBatch(selected, {
    uploadFile: async file => {
      const form = new FormData();
      form.append('file', file);
      const response = await fetchImpl(
        'https://pos.pancake.vn/api/v1/contents?api_key=' + encodeURIComponent(pancakeApiKey),
        { method: 'POST', body: form }
      );
      await checkSaved(response, 'Upload ảnh ' + (file.name || ''));
      const data = await response.json();
      return data.content_url || data.url;
    },
    readExisting: async () => {
      const response = await fetchImpl(orderImageUrl + '&select=id,hinhanh&limit=1',
        { headers, cache: 'no-store' });
      await checkSaved(response, 'Đọc ảnh đơn hàng');
      return (await response.json())?.[0] || null;
    },
    updateExisting: async (row, images) => {
      const response = await fetchImpl(supabaseUrl + '/rest/v1/chatbot_images?id=eq.' +
        encodeURIComponent(row.id), {
          method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ hinhanh: images })
        });
      await checkSaved(response, 'Lưu danh sách ảnh');
    },
    createNew: async images => {
      const response = await fetchImpl(supabaseUrl + '/rest/v1/chatbot_images?on_conflict=order_id', {
        method: 'POST',
        headers: { ...writeHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          order_id: displayId,
          customer_name: order.bill_full_name || 'Khách nhận',
          hinhanh: images,
          processed: true,
          status_id: 11
        })
      });
      await checkSaved(response, 'Tạo danh sách ảnh đơn hàng');
    },
    onProgress
  });
  return { ...result, displayId };
}
