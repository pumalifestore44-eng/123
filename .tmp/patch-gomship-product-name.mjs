import { readFileSync, writeFileSync } from 'node:fs';

function edit(path, changes) {
  let source = readFileSync(path, 'utf8');
  for (const [before, after] of changes) {
    if (!source.includes(before)) throw new Error('Target not found in ' + path + ': ' + before.slice(0, 90));
    if (source.split(before).length !== 2) throw new Error('Ambiguous patch in ' + path);
    source = source.replace(before, after);
  }
  writeFileSync(path, source);
  console.log('Updated ' + path);
}

const root = 'smax-chat-manager - Copy (2)/';
edit(root + 'app.js', [
  [
    "import { primarySupabase } from './supabase-config.mjs';",
    "import { primarySupabase } from './supabase-config.mjs';\nimport { formatShipmentProductName } from './shipment-product-name.mjs';"
  ],
  [
    `            // Prefill goods name from order items
            const goodsNames = (order.items || []).map(x => (x.product_name || x.name || 'Sản phẩm') + ' x' + (x.quantity || 1)).join(', ');
            const groupPrefix = activeShipmentBundle.members.length > 1 ? 'Đơn ' + activeShipmentBundle.labels.join(', ') + ': ' : '';
            document.getElementById('jtGoodsName').value = groupPrefix + (goodsNames || 'Hàng hóa');`,
    `            // Include the human-facing Pumalife order code (#display_id) and
            // all ordered items, variants, SKUs and quantities in the shipment.
            // This same field becomes product.name on GomShip's POST /orders.
            document.getElementById('jtGoodsName').value =
                formatShipmentProductName(order, activeShipmentBundle.labels);`
  ]
]);

edit(root + 'index.html', [
  [
    `                    <div class="form-group">
                        <label>Tên sản phẩm</label>
                        <input type="text" id="jtGoodsName" required style="width:100%; border:1px solid var(--border); border-radius:8px; background:var(--bg-app); color:var(--text-main); padding:8px;">
                    </div>`,
    `                    <div class="form-group" style="grid-column:1/-1;">
                        <label for="jtGoodsName">Tên sản phẩm (gồm mã đơn hàng và thông tin sản phẩm)</label>
                        <textarea id="jtGoodsName" required rows="3" style="width:100%; min-height:76px; box-sizing:border-box; resize:vertical; overflow-wrap:anywhere; border:1px solid var(--border); border-radius:8px; background:var(--bg-app); color:var(--text-main); padding:8px;"></textarea>
                    </div>`
  ]
]);
