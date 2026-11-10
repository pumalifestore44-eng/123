const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://edhkxrsgbwszfiwfoqnx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkaGt4cnNnYndzemZpd2ZvcW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTc5MDYsImV4cCI6MjA4Mzk5MzkwNn0.mL7Q7UipdD1Ir49kjWQyjXF0-t4sBaBvMhThor9Tiyg';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const ZALO_PAGE_PID = process.env.ZALO_PAGE_PID || 'zlw266741166578791076';
const ZALO_THREAD_IDS = (process.env.ZALO_THREAD_IDS || 'zlw3481453659339661895,zlw2283526825999855015').split(',').map(v => v.trim()).filter(Boolean);
const ZALO_THREADS = new Map([
  ['zlw3481453659339661895', 'zlw3481453659339661895'],
  ['zlw2283526825999855015', 'zlw2283526825999855015']
]);

async function supabaseFetch(path, options = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  return res;
}

function getTargetThreadIds(record) {
  const explicit = record?.thread_id || record?.tid || record?.target_thread_id || record?.conversation_id || '';
  if (explicit && ZALO_THREADS.has(String(explicit))) return [String(explicit)];

  if (String(record?.target || '').toLowerCase() === 'zalo') {
    return ZALO_THREAD_IDS;
  }

  return ZALO_THREAD_IDS;
}

function parseImageUrls(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (e) {}
    return trimmed.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function buildZaloPayload({ threadId, text, imageUrls }) {
  const messages = [];
  const baseId = `${threadId}-${Date.now()}`;

  if (text && text.trim()) {
    messages.push({
      temp_id: `${baseId}-text`,
      message: text.trim()
    });
  }

  imageUrls.forEach((url, index) => {
    messages.push({
      temp_id: `${baseId}-${index}`,
      picture: url
    });
  });

  return {
    type: 'zaloweb_message',
    messages
  };
}

async function sendToZaloThread({ pagePid, threadId, text, imageUrls, smaxToken }) {
  const payload = buildZaloPayload({ threadId, text, imageUrls });
  if (payload.messages.length === 0) {
    throw new Error(`Thread ${threadId}: no content to send`);
  }

  const res = await fetch(`https://api.smax.ai/bizs/${process.env.SMAX_BIZ_ID || 'tuant2lqd'}/pages/${pagePid}/threads/${threadId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: smaxToken,
      'Content-Type': 'application/json',
      Origin: 'https://smax.ai',
      Referer: 'https://smax.ai/'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Thread ${threadId} send failed: ${res.status} ${bodyText}`);
  }

  return true;
}

async function fetchPendingZaloPosts() {
  const nowIso = new Date().toISOString();
  const query = `?select=*&status=eq.pending&platforms=eq.zalo&scheduled_at.lte.${encodeURIComponent(nowIso)}`;

  const res = await supabaseFetch(`/rest/v1/posts${query}`, {
    method: 'GET'
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase fetch pending posts failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function markStatus(recordId, status) {
  const res = await supabaseFetch(`/rest/v1/posts?id=eq.${recordId}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ status })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Update status ${status} failed for ${recordId}: ${res.status} ${text}`);
  }
}

async function sendScheduledZaloPosts() {
  const pendingPosts = await fetchPendingZaloPosts();

  if (!pendingPosts.length) {
    return;
  }

  const smaxToken = process.env.SMAX_TOKEN || '';
  if (!smaxToken) {
    console.warn('SMAX_TOKEN missing; skipping send');
    return;
  }

  for (const record of pendingPosts) {
    const recordId = record.id;
    const targetThreadIds = getTargetThreadIds(record);
    if (!targetThreadIds.length) {
      console.warn(`Skip record ${recordId}: no valid Zalo thread target`);
      continue;
    }

    try {
      await markStatus(recordId, 'processing');

      const content = String(record.content || '').trim();
      const imageUrls = parseImageUrls(record.image_url || record.imageUrl || record.images || record.image_urls);

      for (const tid of targetThreadIds) {
        await sendToZaloThread({
          pagePid: ZALO_PAGE_PID,
          threadId: tid,
          text: content,
          imageUrls,
          smaxToken
        });
        console.log(`Sent post ${recordId} to thread ${tid}`);
      }

      await markStatus(recordId, 'completed');
      console.log(`Processed post ${recordId} -> ${targetThreadIds.join(', ')}`);
    } catch (error) {
      console.error(`Failed record ${recordId}:`, error.message || error);
      try {
        await markStatus(recordId, 'pending');
      } catch (e) {}
    }
  }
}

async function main() {
  console.log('Scheduled Zalo sender started');
  await sendScheduledZaloPosts();
  setInterval(sendScheduledZaloPosts, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
