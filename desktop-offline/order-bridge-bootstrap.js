import { installDesktopOrderBridge } from './order-bridge-module.js';

window.addEventListener('desktop-order-config', (event) => {
  installDesktopOrderBridge(event.detail);
});
