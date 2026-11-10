// Chrome Extension Background Service Worker
// Cho phép click vào icon của Extension để mở trực tiếp thanh Side Panel bên phải trình duyệt

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
