const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'smax_threads.json');
let text = fs.readFileSync(file, 'utf8');
if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
const parsed = JSON.parse(text);
const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.data) ? parsed.data : (Array.isArray(parsed.threads) ? parsed.threads : []));
const unreplied = rows
  .filter((x) => x && x.replied === false)
  .sort((a,b) => new Date(b.last_message_at || b.updated_at || b.created_at || 0) - new Date(a.last_message_at || a.updated_at || a.created_at || 0))
  .slice(0, 10)
  .map((x) => ({
    name: x.customer?.name || x.customers?.[0]?.name || x.customer_name || '',
    platform: x.platform || '',
    page_pid: x.page_pid || '',
    tid: x.tid || '',
    message: x.message || x.customer?.last_content_by_user || '',
    last_message_at: x.last_message_at || x.updated_at || x.created_at || '',
    read: x.read,
    replied: x.replied
  }));
console.log(JSON.stringify(unreplied, null, 2));
