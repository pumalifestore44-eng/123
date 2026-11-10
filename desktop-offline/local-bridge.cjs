const http = require('http');

const HOST = '127.0.0.1';
const PORT = 17891;
let mainWindow = null;
const ALLOWED_ACTIONS = new Set(['add_order_item', 'ensure_variation', 'upload_create_add_confirm', 'get_unanswered_threads', 'get_thread_messages', 'update_product_image', 'create_product_add_latest_order', 'add_existing_product']);

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': 'http://127.0.0.1' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function startLocalBridge(win) {
  mainWindow = win;
  const server = http.createServer(async (req, res) => {
    if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') {
      return json(res, 403, { ok: false, error: 'localhost only' });
    }
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, service: 'pumalife-desktop-bridge' });
    if (req.method !== 'POST' || req.url !== '/command') return json(res, 404, { ok: false, error: 'not found' });
    try {
      const body = await readBody(req);
      if (!body || !ALLOWED_ACTIONS.has(body.action)) return json(res, 400, { ok: false, error: 'unsupported action' });
      if (!mainWindow || mainWindow.isDestroyed()) return json(res, 503, { ok: false, error: 'desktop renderer unavailable' });
      const result = await mainWindow.webContents.executeJavaScript(`window.desktopOrderBridgeExecute(${JSON.stringify(JSON.stringify(body))})`, true);
      return json(res, result && result.ok ? 200 : 400, result || { ok: false, error: 'empty result' });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  });
  server.on('error', e => console.error('[Local Bridge]', e.message));
  server.listen(PORT, HOST, () => console.log(`[Local Bridge] http://${HOST}:${PORT}`));
  return server;
}

module.exports = { startLocalBridge, HOST, PORT };
