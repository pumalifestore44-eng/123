const spxMarkup = `
<div style="width:100%;container-type:inline-size;background:#fff;color:#000;font-family:Arial,sans-serif;">
 <div style="height:calc(100cqw * 104 / 74);display:grid;grid-template-rows:14% 6% 12% 5% 34% 12% 10% 7%;border:1px solid #000;box-sizing:border-box;font-size:2.4cqw;line-height:1.1;">
  <div style="display:grid;grid-template-columns:40% 60%;align-items:center;border-bottom:1px dashed #000;padding:1.5cqw;min-height:0;">
   <svg viewBox="0 0 150 78" role="img" aria-label="SPX Express" style="width:90%;height:100%;max-height:16cqw;"><text x="4" y="56" fill="#ed6a43" font-family="Arial,sans-serif" font-style="italic" font-weight="900" font-size="64">SPX</text><path d="M2 65H112" stroke="#ed6a43" stroke-width="5"/><text x="93" y="72" fill="#ed6a43" font-family="Arial,sans-serif" font-weight="700" font-size="11">EXPRESS</text></svg>
   <div style="display:flex;flex-direction:column;align-items:center;min-width:0;gap:1cqw;">
    <div style="height:11cqw;width:100%;"><svg id="jtWaybillBarcodeImage" style="display:block;width:100%;height:100%;"></svg></div>
    <div style="font-size:2.2cqw;white-space:nowrap;">Mã vận đơn: <span id="jtWaybillDisplayCode">---</span></div>
    <span id="jtWaybillDisplayCodeSub" style="display:none;"></span><span id="jtPrintTime" style="display:none;"></span>
   </div>
  </div>
  <div id="jtPrintSpxSortCodes" style="display:grid;grid-template-columns:66% 34%;align-items:center;border-bottom:1px dashed #000;min-height:0;">
   <div id="jtPrintSpxFirstSort" style="font-weight:800;font-size:5.5cqw;text-align:center;overflow-wrap:anywhere;line-height:1;">---</div>
   <div id="jtPrintSpxThirdSort" style="font-weight:800;font-size:3.7cqw;text-align:center;border-left:1px dashed #000;overflow-wrap:anywhere;">---</div>
  </div>
  <div style="display:grid;grid-template-columns:50% 50%;border-bottom:1px dashed #000;min-height:0;">
   <div style="padding:0.7cqw;overflow-wrap:anywhere;font-size:2.25cqw;"><strong>Từ:</strong><div id="jtPrintSenderName">PUMALIFE STORE</div><div id="jtPrintSenderAddress" style="display:none;"></div><div id="jtPrintSenderPhone"></div></div>
   <div style="padding:0.7cqw;border-left:1px dashed #000;overflow-wrap:anywhere;font-size:2.25cqw;"><strong>Đến:</strong><div id="jtPrintReceiverName"></div><div id="jtPrintReceiverAddress"></div><div id="jtPrintReceiverPhone"></div><span id="jtPrintReceiverOrderCode" style="display:none;"></span></div>
  </div>
  <div style="display:grid;grid-template-columns:60% 40%;border-bottom:1px dashed #000;align-items:center;font-size:1.65cqw;min-height:0;">
   <div style="padding:0.7cqw;">Người gửi cam kết hàng hóa có đầy đủ hóa đơn, chứng từ, giấy phép cần thiết theo quy định của pháp luật và tự chịu trách nhiệm về hàng hóa.</div>
   <div id="spxParcelNote" style="border-left:1px dashed #000;padding:0.7cqw;font-size:2.2cqw;">CHO THỬ HÀNG</div>
  </div>
  <div style="display:grid;grid-template-columns:72% 28%;border-bottom:1px dashed #000;min-height:0;">
   <div style="padding:0.7cqw;min-width:0;"><strong style="display:block;font-size:2.55cqw;margin-bottom:2cqw;">Nội dung hàng (Tổng SL sản phẩm: <span id="jtPrintTotalQty">0</span>)</strong><div id="jtPrintProductsList" contenteditable="true" spellcheck="false" style="font-size:2.6cqw;line-height:1.25;overflow-wrap:anywhere;outline:none;"></div></div>
   <div style="display:flex;flex-direction:column;border-left:1px dashed #000;min-width:0;">
    <div id="jtWaybillQRCode" style="width:100%;aspect-ratio:1;padding:1cqw;box-sizing:border-box;flex:0 0 auto;"></div>
    <div id="jtPrintSpxReturnSort" style="border-top:1px dashed #000;border-bottom:1px dashed #000;display:flex;align-items:center;justify-content:center;text-align:center;flex:1;padding:0.7cqw;font-size:2.2cqw;overflow-wrap:anywhere;">---</div>
    <div style="padding:1cqw 0.5cqw;text-align:center;line-height:1.2;"><div style="font-size:2.2cqw;">Ngày tạo đơn:</div><div id="spxWaybillCreatedDate" style="font-size:3.1cqw;font-weight:700;"></div><div id="spxWaybillCreatedTime" style="font-size:3.1cqw;font-weight:700;"></div></div>
   </div>
  </div>
  <div style="display:grid;grid-template-columns:50% 50%;border-bottom:1px dashed #000;min-height:0;">
   <div style="padding:0.7cqw;overflow-wrap:anywhere;"><strong>Chỉ dẫn giao hàng:</strong><div id="jtPrintShippingInstructions" contenteditable="true" spellcheck="false" style="font-size:2.05cqw;line-height:1.1;outline:none;">ĐỒNG KIỂM, CHO THỬ HÀNG<br>Chuyển hoàn sau 3 lần phát;<br>Lưu kho 24h dù KH từ chối nhận;<br>Gọi người gửi nếu giao không được.</div></div>
   <div style="padding:0.7cqw;border-left:1px dashed #000;display:flex;flex-direction:column;justify-content:space-between;"><strong>Chữ ký người nhận:</strong><div style="font-size:1.55cqw;">Người nhận đồng ý việc SPX thu thập bằng chứng giao hàng (hình ảnh, chữ ký). Bưu phẩm được kiểm tra theo chỉ dẫn giao hàng của người gửi.</div></div>
  </div>
  <div style="border-bottom:1px dashed #000;display:flex;flex-direction:column;justify-content:space-between;padding:1cqw;min-height:0;">
   <div style="display:flex;justify-content:space-between;gap:1cqw;"><span>Tiền thu Người nhận:</span><span id="spxWaybillWeight">Khối lượng: —</span></div>
   <div id="jtPrintCODAmount" style="font-weight:800;font-size:4cqw;text-align:center;">0 đ</div>
   <strong style="font-size:2.8cqw;text-align:center;">XEM TRÊN ỨNG DỤNG TÀI XẾ</strong>
  </div>
  <div style="display:grid;grid-template-columns:28% 72%;align-items:center;padding:0.7cqw;gap:1cqw;min-height:0;">
   <div style="background:#000;color:#fff;font-size:3.2cqw;font-weight:700;padding:1.5cqw 0.7cqw;clip-path:polygon(0 0,85% 0,100% 50%,85% 100%,0 100%);">☎ 1900 6885</div>
   <div style="font-size:1.9cqw;line-height:1.25;">Tra cứu hành trình và thông tin vận đơn trên ứng dụng SPX Express.<br>Thông tin giao hàng được cập nhật theo vận đơn.</div>
  </div>
 </div>
</div>`;

let legacyMarkup, legacyStyle, context = null;
const snapshots = new Map();
const rootElement = () => document.getElementById('jtWaybillPrintContent');
function initialize() {
    if (legacyMarkup !== undefined) return;
    const root = rootElement();
    legacyMarkup = root.innerHTML; legacyStyle = root.getAttribute('style');
    document.querySelectorAll('[data-waybill-template]').forEach(button => {
        button.addEventListener('click', () => switchWaybillTemplate(button.dataset.waybillTemplate));
    });
    window.pickWaybillTemplate = pickWaybillTemplate;
}

function selectFrame(type) {
    const root = rootElement();
    root.dataset.waybillTemplate = type;
    root.setAttribute('style', type === 'spx'
        ? 'width:100%;max-width:400px;padding:0;border:none;background:#fff;color:#000;box-sizing:border-box;page-break-inside:avoid;'
        : legacyStyle);
    root.innerHTML = snapshots.get(type) || (type === 'spx' ? spxMarkup : legacyMarkup);
    document.querySelectorAll('button[data-waybill-template]').forEach(button => {
        const active = button.dataset.waybillTemplate === type;
        button.setAttribute('aria-selected', String(active));
        button.style.borderColor = active ? '#2563eb' : 'var(--border)';
        button.style.background = active ? '#eff6ff' : 'var(--bg-card)';
    });
}

export function prepareWaybillTemplate(type = 'spx') {
    initialize(); snapshots.clear(); context = null;
    selectFrame(type === 'legacy' ? 'legacy' : 'spx');
}

function snapshot() {
    const root = rootElement(), copy = root.cloneNode(true);
    root.querySelectorAll('canvas').forEach((canvas, index) => {
        const image = document.createElement('img'); image.src = canvas.toDataURL(); image.style.cssText = canvas.style.cssText;
        copy.querySelectorAll('canvas')[index]?.replaceWith(image);
    });
    return copy.innerHTML;
}

export function completeWaybillTemplate(order, sender) {
    context = { order, sender };
    applyTemplateGraphics();
}

function applyTemplateGraphics() {
    const root = rootElement(), isSpx = root.dataset.waybillTemplate === 'spx';
    const qr = document.getElementById('jtWaybillQRCode');
    qr.querySelectorAll('img,canvas').forEach(image => {
        image.style.position = isSpx ? 'static' : 'absolute';
        image.style.left = isSpx ? '' : '50%';
        image.style.top = isSpx ? '' : 'var(--qr-top, clamp(2px, calc(100cqw - 100px), 6px))';
        image.style.width = isSpx ? '100%' : 'min(var(--qr-max-size, 120px), calc(100cqw - 4px))';
        image.style.height = 'auto'; image.style.transform = isSpx ? 'none' : 'translateX(-50%)';
        image.style.imageRendering = 'pixelated';
    });
    const barcode = document.getElementById('jtWaybillBarcodeImage');
    barcode.style.height = isSpx ? '100%' : '50px';
    const sort = document.getElementById('jtPrintSpxSortCodes');
    const hasSort = !!document.getElementById('jtPrintSpxFirstSort').textContent.trim();
    sort.style.display = isSpx ? 'grid' : hasSort ? 'block' : 'none';
    const returnSort = document.getElementById('jtPrintSpxReturnSort');
    if (isSpx) {
        returnSort.style.display = 'flex';
        document.getElementById('jtPrintSpxThirdSort').style.display = 'block';
        if (context) {
            const { order, sender } = context;
            document.getElementById('jtPrintSenderAddress').textContent = sender.address || '';
            const raw = order.spx_created_at || order.jt_created_at || order.inserted_at || order.created_at;
            const date = raw ? new Date(typeof raw === 'number' && raw < 1e12 ? raw * 1000 : raw) : null;
            const valid = date && !Number.isNaN(date.getTime());
            document.getElementById('spxWaybillCreatedDate').textContent = valid ? date.toLocaleDateString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric' }) : '—';
            document.getElementById('spxWaybillCreatedTime').textContent = valid ? date.toLocaleTimeString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit' }) : '';
            const weight = Number(order.parcel_weight ?? order.weight);
            document.getElementById('spxWaybillWeight').textContent = weight > 0 ? `Khối lượng: ${weight.toLocaleString('vi-VN')} g` : 'Khối lượng: —';
        }
    } else {
        const thirdSort = document.getElementById('jtPrintSpxThirdSort');
        thirdSort.style.display = thirdSort.textContent.trim() ? 'block' : 'none';
        qr.parentElement.style.setProperty('--qr-max-size', hasSort ? '120px' : '78px');
        if (hasSort) qr.parentElement.style.removeProperty('--qr-top');
        else qr.parentElement.style.setProperty('--qr-top','0px');
        returnSort.style.display = returnSort.textContent.trim() ? 'block' : 'none';
    }
    if (typeof window.enableFullWaybillEditing === 'function') window.enableFullWaybillEditing();
}

function switchWaybillTemplate(type) {
    const root = rootElement();
    if (!context || root.dataset.waybillTemplate === type) return;
    const source = root.cloneNode(true);
    // Capture QR pixels before replacing the DOM; cloned canvases are empty.
    const image = root.querySelector('#jtWaybillQRCode img[src]');
    const qrUrl = image?.src || root.querySelector('#jtWaybillQRCode canvas')?.toDataURL();
    snapshots.set(root.dataset.waybillTemplate, snapshot());
    selectFrame(type);
    source.querySelectorAll('[id]').forEach(field => {
        if (field.id === 'jtPrintShippingInstructions' || !/^(jtPrint|jtWaybillDisplay)/.test(field.id) || field.children.length && field.id !== 'jtPrintProductsList') return;
        const destination = root.querySelector('#' + field.id);
        if (destination) destination.innerHTML = field.innerHTML;
    });
    document.getElementById('jtWaybillBarcodeImage').replaceWith(source.querySelector('#jtWaybillBarcodeImage').cloneNode(true));
    if (qrUrl) {
        const img = document.createElement('img'); img.src = qrUrl;
        document.getElementById('jtWaybillQRCode').replaceChildren(img);
    }
    applyTemplateGraphics();
}

function pickWaybillTemplate() {
    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.style.cssText = 'border:1px solid #dbe3ef;border-radius:14px;padding:22px;max-width:420px;width:90%;font-family:inherit;color:#12263e';
        dialog.innerHTML = '<form method="dialog"><h3 style="margin-top:0">Chọn mẫu in bill</h3><label style="display:block;padding:12px;border:1px solid #dbe3ef;border-radius:8px;margin-bottom:10px"><input type="radio" name="template" value="spx" checked> Mẫu 1 · SPX (mặc định)</label><label style="display:block;padding:12px;border:1px solid #dbe3ef;border-radius:8px"><input type="radio" name="template" value="legacy"> Mẫu 2 · Mẫu hiện tại</label><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button value="cancel" style="padding:9px 14px">Hủy</button><button value="print" style="padding:9px 14px;background:#2563eb;color:white;border:0;border-radius:6px">In bill đã chọn</button></div></form>';
        dialog.addEventListener('close', () => {
            const value = dialog.returnValue === 'print' ? dialog.querySelector('input:checked').value : null;
            dialog.remove(); resolve(value);
        }, { once:true });
        document.body.appendChild(dialog); dialog.showModal();
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once:true });
else initialize();
