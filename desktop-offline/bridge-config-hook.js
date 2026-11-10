window.__installDesktopOrderConfig = function(baseUrl, apiKey) {
  window.dispatchEvent(new CustomEvent('desktop-order-config', { detail: { baseUrl, apiKey } }));
};
