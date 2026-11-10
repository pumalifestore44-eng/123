(function (global) {
  function getStatusTextFromCode(statusCode) {
    const code = parseInt(statusCode, 10);
    switch (code) {
      case 0: return 'Chờ xử lý (Mới)';
      case 17: return 'Đã xác nhận';
      case 1: return 'Đã xác nhận';
      case 11: return 'Đang nhập hàng';
      case 20: return 'Đã mua hàng';
      case 8: return 'Đang đóng gói';
      case 18: return 'Gửi BE';
      case 19: return 'Gửi Grab';
      case 21: return 'Gửi GH khác';
      case 22: return 'Lấy tại shop';
      case 25: return 'Chờ Deal';
      case 9: return 'Chờ lấy hàng';
      case 24: return 'Đang vận chuyển';
      case 2: return 'Đang giao';
      case 3: return 'Hoàn thành';
      case 16: return 'Đã lấy hàng';
      case 6: return 'Đã hủy';
      case 4: return 'Đang trả hàng';
      case 5: return 'Đã trả hàng';
      case 23: return 'Trả hàng một phần';
      case 7: return 'Đã xóa';
      case 12: return 'Chờ in';
      case 13: return 'Đã in';
      default: return 'Chờ xử lý (Mới)';
    }
  }

  function normalizeStatusText(status) {
    if (status === null || status === undefined) return 'Chờ xử lý (Mới)';
    const raw = String(status).trim();
    if (!raw) return 'Chờ xử lý (Mới)';
    if (/^[0-9]+$/.test(raw)) {
      return getStatusTextFromCode(raw);
    }

    const normalizedKey = raw.toLowerCase();
    switch (normalizedKey) {
      case 'chờ xử lý (mới)':
      case 'chờ xử lý':
        return 'Chờ xử lý (Mới)';
      case 'đã xác nhận':
        return 'Đã xác nhận';
      case 'chờ deal':
        return 'Chờ Deal';
      case 'đã mua hàng':
        return 'Đã mua hàng';
      case 'đang đóng gói':
        return 'Đang đóng gói';
      case 'gửi be':
      case 'gửi b e':
        return 'Gửi BE';
      case 'gửi grab':
        return 'Gửi Grab';
      case 'gửi gh khác':
      case 'gửi gh khac':
        return 'Gửi GH khác';
      case 'lấy tại shop':
      case 'lay tai shop':
        return 'Lấy tại shop';
      case 'đang nhập hàng':
        return 'Đang nhập hàng';
      case 'chờ lấy hàng':
        return 'Chờ lấy hàng';
      case 'đang vận chuyển':
        return 'Đang vận chuyển';
      case 'đang giao':
        return 'Đang giao';
      case 'hoàn thành':
        return 'Hoàn thành';
      case 'đã lấy hàng':
        return 'Đã lấy hàng';
      case 'đã hủy':
        return 'Đã hủy';
      case 'đang trả hàng':
        return 'Đang trả hàng';
      case 'đã trả hàng':
        return 'Đã trả hàng';
      case 'trả hàng một phần':
        return 'Trả hàng một phần';
      case 'đã xóa':
        return 'Đã xóa';
      case 'chờ in':
        return 'Chờ in';
      case 'đã in':
        return 'Đã in';
      default:
        return raw;
    }
  }

  function getStatusCodeFromText(statusText) {
    if (statusText === null || statusText === undefined) return null;
    const normalized = String(statusText).trim().toLowerCase();
    switch (normalized) {
      case 'chờ xử lý (mới)':
      case 'chờ xử lý':
        return 0;
      case 'đã xác nhận':
        return 1;
      case 'chờ deal':
        return 25;
      case 'đã mua hàng':
        return 20;
      case 'đang đóng gói':
        return 8;
      case 'gửi be':
      case 'gửi b e':
        return 18;
      case 'gửi grab':
        return 19;
      case 'gửi gh khác':
      case 'gửi gh khac':
        return 21;
      case 'lấy tại shop':
      case 'lay tai shop':
        return 22;
      case 'đang nhập hàng':
        return 11;
      case 'chờ lấy hàng':
        return 9;
      case 'đang vận chuyển':
        return 24;
      case 'đang giao':
        return 2;
      case 'hoàn thành':
        return 3;
      case 'đã lấy hàng':
        return 16;
      case 'đã hủy':
        return 6;
      case 'đang trả hàng':
        return 4;
      case 'đã trả hàng':
        return 5;
      case 'trả hàng một phần':
        return 23;
      case 'đã xóa':
        return 7;
      case 'chờ in':
        return 12;
      case 'đã in':
        return 13;
      default:
        return null;
    }
  }

  function getStatusClass(status) {
    const st = normalizeStatusText(status);
    switch (st) {
      case 'Chờ xử lý (Mới)': return 'order-status-new';
      case 'Đã xác nhận': return 'order-status-confirmed';
      case 'Đang nhập hàng': return 'order-status-importing';
      case 'Đã mua hàng': return 'order-status-purchased';
      case 'Đang đóng gói': return 'order-status-packing';
      case 'Gửi BE': return 'order-status-be';
      case 'Gửi Grab': return 'order-status-grab';
      case 'Gửi GH khác': return 'order-status-gh-other';
      case 'Lấy tại shop': return 'order-status-pickup-shop';
      case 'Chờ Deal': return 'order-status-wait-deal';
      case 'Chờ lấy hàng': return 'order-status-wait-pickup';
      case 'Đang vận chuyển': return 'order-status-shipping';
      case 'Đang giao': return 'order-status-shipping';
      case 'Hoàn thành': return 'order-status-done';
      case 'Đã lấy hàng': return 'order-status-collected';
      case 'Đã hủy': return 'order-status-cancel';
      case 'Đang trả hàng': return 'order-status-returning';
      case 'Đã trả hàng': return 'order-status-returned';
      case 'Trả hàng một phần': return 'order-status-partial-return';
      case 'Đã xóa': return 'order-status-deleted';
      case 'Chờ in': return 'order-status-wait-print';
      case 'Đã in': return 'order-status-printed';
      default: return 'order-status-new';
    }
  }

  const api = {
    getStatusTextFromCode,
    normalizeStatusText,
    getStatusCodeFromText,
    getStatusClass,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.StatusUtils = api;
  global.getStatusTextFromCode = getStatusTextFromCode;
  global.normalizeStatusText = normalizeStatusText;
  global.getStatusCodeFromText = getStatusCodeFromText;
  global.getStatusClass = getStatusClass;
})(typeof window !== 'undefined' ? window : globalThis);
