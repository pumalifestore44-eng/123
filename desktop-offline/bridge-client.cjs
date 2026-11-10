const http = require('http');
const payload = process.argv[2];
if (!payload) { console.error('Usage: node bridge-client.cjs <json>'); process.exit(2); }
const data = Buffer.from(payload);
const req = http.request({ hostname: '127.0.0.1', port: 17891, path: '/command', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
  let out = ''; res.on('data', c => out += c); res.on('end', () => { console.log(out); process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1); });
});
req.on('error', e => { console.error('BRIDGE_ERROR', e.message); process.exit(1); });
req.end(data);
