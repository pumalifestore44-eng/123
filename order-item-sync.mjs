/**
 * Save edited Supabase order items without delete-all/reinsert-all.
 *
 * An optional SQL RPC makes the order+items operation transactional. Until it
 * has been installed, existing rows retain their numeric primary keys and
 * new rows are inserted BEFORE any existing item is changed or deleted.
 * The SQL migration also repairs a stale serial/identity sequence.
 */
const ITEM_COLUMNS = [
  'product_id', 'variation_id', 'product_name', 'retail_price', 'quantity',
  'discount_each_product', 'item_note', 'variation_info'
];

const positiveId = value => {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('ID sản phẩm trong đơn không hợp lệ.');
  return id;
};

export function buildEditedOrderItems(orderId, items) {
  return items.map((item) => {
    const image = item.image_url || item.images?.[0] || '';
    const price = Number(item.retail_price ?? item.price ?? 0);
    const qty = Number(item.quantity ?? 1);
    const discount = Number(item.discount ?? item.discount_each_product ?? 0);
    if (![price, qty, discount].every(Number.isFinite) || price < 0 || discount < 0 ||
      !Number.isInteger(qty) || qty < 1) {
      throw new Error('Giá, số lượng hoặc mức giảm của sản phẩm không hợp lệ.');
    }
    const name = String(item.name || item.product_name || '').trim();
    if (!name) throw new Error('Không được để trống tên sản phẩm trong đơn.');
    const id = positiveId(item.order_item_id);
    return {
      ...(id === null ? {} : { id }),
      order_id: String(orderId),
      product_id: item.product_id || null,
      variation_id: item.variation_id || null,
      product_name: name,
      retail_price: price,
      quantity: qty,
      discount_each_product: discount,
      item_note: item.item_note || '',
      variation_info: {
        ...(item.variation_info && typeof item.variation_info === 'object' ? item.variation_info : {}),
        name,
        type: 'product',
        images: image ? [image] : [],
        retail_price: price,
        item_note: item.item_note || ''
      }
    };
  });
}

export function planEditedOrderItems(existing, desired) {
  const oldById = new Map();
  for (const item of existing) {
    const id = positiveId(item.id);
    if (oldById.has(id)) throw new Error('ID sản phẩm cũ trùng, không thể lưu.');
    oldById.set(id, item);
  }
  const used = new Set();
  const update = [], create = [];
  for (let index = 0; index < desired.length; index++) {
    const row = desired[index];
    const id = positiveId(row.id);
    if (id === null) {
      create.push({ index, row });
      continue;
    }
    if (!oldById.has(id)) {
      throw new Error('Đơn hàng đã thay đổi ở nơi khác. Vui lòng tải lại trước khi lưu.');
    }
    if (used.has(id)) throw new Error('Một dòng sản phẩm đang bị lặp ID trong biểu mẫu.');
    used.add(id);
    update.push({ index, row, before: oldById.get(id) });
  }
  const remove = [...oldById.values()].filter(item => !used.has(Number(item.id)));
  return { update, create, remove };
}

export async function saveEditedOrderSafely({
  fetcher = fetch, supabaseUrl, supabaseKey, orderId, patch, items
}) {
  if (!supabaseUrl || !supabaseKey || !orderId) throw new Error('Thiếu cấu hình kết nối hoặc mã đơn hàng.');
  const desired = buildEditedOrderItems(orderId, items);
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };
  const url = (path) => `${supabaseUrl}/rest/v1/${path}`;

  async function request(path, method = 'GET', payload, prefer = 'return=representation') {
    const res = await fetcher(url(path), {
      method,
      headers: { ...headers, Prefer: prefer },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const error = new Error(typeof data === 'object' && data?.message
        ? data.message : String(data || `HTTP ${res.status}`));
      error.status = res.status;
      error.code = data?.code;
      throw error;
    }
    return data;
  }

  // Preferred path: server-side one-transaction update. No partial item deletion.
  try {
    const rpc = await request('rpc/pumalife_save_order_edits', 'POST', {
      p_order_id: String(orderId), p_order_patch: patch, p_items: desired
    });
    if (!Array.isArray(rpc?.item_ids) || rpc.item_ids.length !== desired.length) {
      throw new Error('Kết quả lưu đơn hàng không hợp lệ, hãy tải lại đơn để kiểm tra.');
    }
    return { itemIds: rpc.item_ids.map(positiveId), atomic: true };
  } catch (error) {
    // An RPC that exists but failed MUST NOT be silently retried via a second
    // write path, which could overwrite data after a partial client timeout.
    if (!(error.code === 'PGRST202' || (error.status === 404 &&
        /function|pumalife_save_order_edits|schema cache/i.test(error.message)))) throw error;
  }

  // Compatibility until the RPC migration is deployed. In-place PATCH keeps
  // existing IDs and does not touch the broken database sequence.
  const filterOrder = `order_id=eq.${encodeURIComponent(orderId)}`;
  const snapshot = await request(`pancake_order_items?select=*&${filterOrder}&order=id.asc`);
  if (!Array.isArray(snapshot)) throw new Error('Không đọc được danh sách sản phẩm trước khi lưu.');
  const { update, create, remove } = planEditedOrderItems(snapshot, desired);
  const assigned = desired.map(item => item.id || null);
  const insertedIds = [];
  const changed = [];

  const patchItem = (id, data) => request(
    `pancake_order_items?id=eq.${id}&${filterOrder}`, 'PATCH', data
  );

  try {
    // New items first. If the database sequence is stale, the 23505 occurs
    // here while all previously saved items and the order remain untouched.
    if (create.length) {
      const rows = create.map(({ row }) => {
        const { id, ...withoutId } = row;
        return withoutId;
      });
      const created = await request('pancake_order_items', 'POST', rows);
      if (!Array.isArray(created) || created.length !== create.length) {
        throw new Error('Không xác nhận được ID của sản phẩm mới; cần tải lại đơn.');
      }
      for (let i = 0; i < create.length; i++) {
        const newId = positiveId(created[i].id);
        insertedIds.push(newId);
        assigned[create[i].index] = newId;
      }
    }
    for (const { row, before } of update) {
      const payload = Object.fromEntries(ITEM_COLUMNS.map(k => [k, row[k]]));
      // Do not discard existing variation metadata which is not editable in UI.
      payload.variation_info = { ...(before.variation_info || {}), ...row.variation_info };
      const changedRows = await patchItem(row.id, payload);
      if (!Array.isArray(changedRows) || changedRows.length !== 1) {
        throw new Error('Không cập nhật được một sản phẩm; đơn có thể đã thay đổi.');
      }
      changed.push(before);
    }

    // Deletions must be checked. Never silently ignore a failed DELETE.
    for (const old of remove) {
      const deleted = await request(
        `pancake_order_items?id=eq.${old.id}&${filterOrder}`, 'DELETE'
      );
      if (!Array.isArray(deleted) || deleted.length !== 1) {
        throw new Error('Không xóa được sản phẩm khỏi đơn. Hãy kiểm tra trước khi lưu lại.');
      }
    }
    const orderRows = await request(
      `pancake_orders?id=eq.${encodeURIComponent(orderId)}`, 'PATCH', patch
    );
    if (!Array.isArray(orderRows) || orderRows.length !== 1) {
      throw new Error('Không thể cập nhật thông tin đơn; hãy tải lại trước khi thao tác.');
    }
    const after = await request(`pancake_order_items?select=id,order_id&${filterOrder}`);
    const savedIds = new Set((after || []).map(item => Number(item.id)));
    if (!Array.isArray(after) || after.length !== assigned.length ||
      assigned.some(id => !savedIds.has(id))) {
      throw new Error('Hậu kiểm sản phẩm chưa khớp; vui lòng tải lại đơn để kiểm tra.');
    }
    return { itemIds: assigned, atomic: false };
  } catch (error) {
    // Restore changed rows when possible. Deletions are intentionally last.
    // This fallback is not guaranteed atomic; the installed RPC is.
    for (const previous of changed.reverse()) {
      try {
        await patchItem(previous.id, Object.fromEntries(
          ITEM_COLUMNS.map(k => [k, previous[k]])
        ));
      } catch (rollbackError) {
        console.error('[Order sync] Failed to restore existing item', rollbackError);
      }
    }
    for (const id of insertedIds) {
      try {
        await request(`pancake_order_items?id=eq.${id}&${filterOrder}`, 'DELETE');
      } catch (rollbackError) {
        console.error('[Order sync] Failed to clean inserted item', rollbackError);
      }
    }
    if (error.code === '23505') {
      throw new Error('Bộ đếm ID của pancake_order_items bị lệch (23505). Chưa xóa các sản phẩm cũ; cần chạy SQL sửa sequence trong supabase/fix_order_item_sequence_and_save.sql.');
    }
    throw error;
  }
}
