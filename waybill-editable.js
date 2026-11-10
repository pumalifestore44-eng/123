// Make every textual field in the single-waybill preview editable before printing.
// Excludes barcode/QR graphics and action controls.
(function () {
  function enableFullWaybillEditing() {
    const root = document.getElementById('jtWaybillPrintContent');
    if (!root) return;

    // Leaf text elements are editable individually so layout/QR/barcode DOM is not damaged.
    root.querySelectorAll('span, strong, div').forEach(el => {
      if (el.id === 'jtWaybillQRCode' || el.closest('#jtWaybillQRCode')) return;
      if (el.querySelector('svg, canvas, img')) return;
      if (el.children.length > 0) return;
      const text = (el.textContent || '').trim();
      if (!text) return;
      el.contentEditable = 'true';
      el.spellcheck = false;
      el.dataset.waybillEditable = '1';
      el.title = 'Bấm để chỉnh sửa trước khi in';
      el.style.cursor = 'text';
      el.style.outline = 'none';
    });

    // Existing product list/instructions can contain child rows, keep them editable as blocks.
    ['jtPrintProductsList','jtPrintShippingInstructions'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.contentEditable = 'true';
        el.spellcheck = false;
        el.dataset.waybillEditable = '1';
        el.title = 'Bấm để chỉnh sửa trước khi in';
        el.style.cursor = 'text';
        el.style.outline = 'none';
      }
    });
  }

  document.addEventListener('focusin', e => {
    if (e.target && e.target.closest && e.target.closest('#jtWaybillPrintContent')) enableFullWaybillEditing();
  });

  const observer = new MutationObserver(() => {
    const modal = document.getElementById('jtWaybillPrintModal');
    if (modal && modal.style.display !== 'none') enableFullWaybillEditing();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('jtWaybillPrintModal');
    if (modal) observer.observe(modal, { attributes:true, attributeFilter:['style'], subtree:false });
  });

  window.enableFullWaybillEditing = enableFullWaybillEditing;
})();