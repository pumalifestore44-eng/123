import { hasGomshipLabelAccess, fetchLabelPdf, isGomshipShipmentByOrder } from './gomship-label-client.mjs';

let activeOrderId = '';
let currentUrl = '';
let selected = false;
let requestId = 0;
let initialized = false;

const el = id => document.getElementById(id);

function releasePdf() {
  if (currentUrl) {
    const previous = currentUrl;
    currentUrl = '';
    // Keep a small grace period for PDF viewers that are completing a print operation.
    const timer = setTimeout(() => URL.revokeObjectURL(previous), 120000);
    if (typeof timer?.unref === 'function') timer.unref();
  }
}

function updateTabStyles(active) {
  const tab = el('gomshipPdfTemplateTab');
  if (!tab) return;
  tab.setAttribute('aria-selected', String(active));
  tab.style.borderColor = active ? '#2563eb' : 'var(--border)';
  tab.style.background = active ? '#eff6ff' : 'var(--bg-card)';
}

function leaveGomship() {
  selected = false;
  requestId++;
  updateTabStyles(false);
  const hint = el('jtPrintEditHint');
  if (hint) hint.textContent = '✏️ Có thể bấm vào nội dung chữ trên bill để sửa trước khi in';
  const currentTemplate = el('jtWaybillPrintContent')?.dataset?.waybillTemplate || 'spx';
  document.querySelectorAll('button[data-waybill-template]').forEach(button => {
    const active = button.dataset.waybillTemplate === currentTemplate;
    button.setAttribute('aria-selected', String(active));
    button.style.borderColor = active ? '#2563eb' : 'var(--border)';
    button.style.background = active ? '#eff6ff' : 'var(--bg-card)';
  });
  const html = el('jtWaybillPrintContent');
  const pdf = el('gomshipPdfPreview');
  if (html) html.style.display = 'flex';
  if (pdf) {
    pdf.style.display = 'none';
    const viewer = pdf.querySelector('iframe');
    if (viewer) viewer.src = 'about:blank';
  }
  releasePdf();
}

export function initializeGomshipPrintPreview() {
  if (initialized) return;
  const tab = el('gomshipPdfTemplateTab');
  if (!tab) return;
  initialized = true;
  tab.addEventListener('click', () => {
    void selectGomshipPdf().catch(error => {
      const status = el('gomshipPdfStatus');
      if (status) status.textContent = 'Không mở được PDF GomShip: ' + (error?.message || String(error));
    });
  });
  document.querySelectorAll('button[data-waybill-template]').forEach(button => {
    button.addEventListener('click', leaveGomship);
  });

}

export function prepareGomshipPrintPreview(orderId) {
  initializeGomshipPrintPreview();
  leaveGomship();
  activeOrderId = String(orderId || '');
  const canPrint = hasGomshipLabelAccess(activeOrderId);
  const tab = el('gomshipPdfTemplateTab');
  if (tab) {
    tab.hidden = !canPrint;
    tab.style.display = canPrint ? 'block' : 'none';
  }
  // A different browser might not yet hold a label capability. The caller
  // probes the linked shipment after the SPX print modal becomes visible.
  return canPrint;
}

export async function autoSelectGomshipPdfIfAvailable(orderId) {
  const id = String(orderId || '');
  if (!id || id !== activeOrderId) return false;
  const initialRequestId = requestId;
  const shouldShow = hasGomshipLabelAccess(id) || await isGomshipShipmentByOrder(id);
  // A manual template switch or a different order cancels auto-selection.
  if (id !== activeOrderId || initialRequestId !== requestId || !shouldShow) return false;
  const tab = el('gomshipPdfTemplateTab');
  if (tab) { tab.hidden = false; tab.style.display = 'block'; }
  await selectGomshipPdf();
  return true;
}

export function closeGomshipPrintPreview() {
  leaveGomship();
  activeOrderId = '';
}

export function isGomshipPdfSelected() {
  return selected;
}

export function getGomshipPdfPrintUrl() {
  return selected ? currentUrl : '';
}

export async function selectGomshipPdf() {
  if (!activeOrderId)
    throw new Error('Chưa xác định được đơn cần in GomShip.');

  const id = ++requestId;
  selected = true;
  const html = el('jtWaybillPrintContent');
  const panel = el('gomshipPdfPreview');
  const status = el('gomshipPdfStatus');
  const viewer = panel?.querySelector('iframe');
  if (!panel || !viewer) throw new Error('Thiếu khung xem PDF GomShip.');

  if (html) html.style.display = 'none';
  panel.style.display = 'flex';
  if (status) status.textContent = 'Đang tải nhãn PDF chính thức từ GomShip...';
  const hint = el('jtPrintEditHint');
  if (hint) hint.textContent = 'PDF gốc GomShip · Không chỉnh sửa nội dung trong giao diện xem trước';
  viewer.style.display = 'none';

  document.querySelectorAll('button[data-waybill-template]').forEach(button => {
    button.setAttribute('aria-selected', 'false');
    button.style.borderColor = 'var(--border)';
    button.style.background = 'var(--bg-card)';
  });
  updateTabStyles(true);
  releasePdf();
  try {
    const blob = await fetchLabelPdf(activeOrderId);
    if (id !== requestId || !selected) return;
    currentUrl = URL.createObjectURL(blob);
    viewer.src = currentUrl;
    viewer.style.display = 'block';
    if (status) status.textContent =
      'Nhãn GomShip gốc · PDF. Bấm “In vận đơn” bên dưới để in (Ctrl+P nếu trình duyệt không tự mở hộp thoại).';
  } catch (error) {
    if (id !== requestId || !selected) return;
    if (status) status.textContent = 'Không tải được nhãn GomShip: ' + (error?.message || String(error));
  }
}