#!/usr/bin/env node
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

// Generic API endpoints (optional if using SMAX directly)
const MESSAGES_API_URL = process.env.MESSAGES_API_URL || '';
const SEND_API_URL = process.env.SEND_API_URL || '';
const AUTH_HEADER = process.env.AUTH_HEADER || ''; // Optional, e.g. 'Bearer x'

// SMAX configuration (preferred if you want to use SMAX API directly)
const SMAX_BIZ_ID = process.env.SMAX_BIZ_ID || 'tuant2lqd';
const SMAX_PAGE_IDS = (process.env.SMAX_PAGE_IDS || 'fb1574281086218015,ig17841471719838606,ttw6622749003845042177,zlw266741166578791076').split(',').map(s=>s.trim()).filter(Boolean);
const SMAX_TOKEN = process.env.SMAX_TOKEN || ''; // include 'Bearer ' prefix or not
// Optionally fetch SMAX token from Supabase if you store it there
const SUPABASE_URL = "https://nwyxvnehuiyenjuxihro.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53eXh2bmVodWl5ZW5qdXhpaHJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MjI0ODcsImV4cCI6MjEwMTQ5ODQ4N30.mkq0XJjYlutwgFWDVNjAbDTUI1UX2e7M9_9b8KSXrw0";

const KEYWORDS = (process.env.KEYWORDS || '').split(',').map(s=>s.trim()).filter(Boolean);
const RESPONSE_TEMPLATE = process.env.RESPONSE_TEMPLATE || 'Xin chào! Đây là trả lời tự động.';

const USE_SMAX = !!(SMAX_BIZ_ID && (SMAX_TOKEN || (SUPABASE_URL && SUPABASE_KEY)));

console.log('Keyword Chatbot starting...');
console.log('Poll interval:', POLL_INTERVAL_MS, 'ms');
console.log('Keywords:', KEYWORDS.join(', '));
if (USE_SMAX) console.log('SMAX mode enabled for biz:', SMAX_BIZ_ID);
else console.log('Using generic endpoints:', MESSAGES_API_URL, SEND_API_URL);

let lastSeenId = null;
const responded = new Set();
let smaxToken = SMAX_TOKEN.startsWith('Bearer ') || SMAX_TOKEN.startsWith('bearer ') ? SMAX_TOKEN : (SMAX_TOKEN ? ('Bearer ' + SMAX_TOKEN) : '');

// We'll perform validation after attempting to load SMAX token from Supabase (if configured)

async function poll() {
  try {
    if (USE_SMAX) {
      await pollSmax();
      return;
    }

    // Generic endpoint mode
    const headers = {};
    if (AUTH_HEADER) headers['Authorization'] = AUTH_HEADER;

    const res = await fetch(MESSAGES_API_URL, { headers });
    if (!res.ok) {
      console.warn('Messages fetch failed', res.status);
      return;
    }
    const messages = await res.json();
    if (!Array.isArray(messages) || messages.length === 0) return;

    // Assume messages are ordered newest first; reverse for chronological handling
    const ordered = Array.isArray(messages) ? messages.slice().reverse() : [];

    for (const msg of ordered) {
      // Expect message object shape: { id, conversation_id, text, sender, created_at }
      const id = msg.id || msg.mid || msg.message_id || msg._id;
      if (!id) continue;
      if (lastSeenId && responded.has(id)) continue;
      // if we have lastSeenId, skip older ones
      if (lastSeenId && id <= lastSeenId) continue;

      const text = (msg.text || msg.message || msg.body || '').toString();
      if (!text) continue;

      for (const kw of KEYWORDS) {
        if (!kw) continue;
        // simple case-insensitive substring match
        if (text.toLowerCase().includes(kw.toLowerCase())) {
          // Already responded?
          if (responded.has(id)) break;

          console.log(`Keyword matched (${kw}) in message ${id}:`, text.substring(0,80));
          // send reply
          const payload = {
            conversation_id: msg.conversation_id || msg.conv_id || msg.cid || null,
            message: RESPONSE_TEMPLATE,
            keyword: kw,
            original_message_id: id
          };

          try {
            const sendRes = await fetch(SEND_API_URL, {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
              body: JSON.stringify(payload)
            });
            if (!sendRes.ok) {
              console.warn('Send failed', await sendRes.text());
            } else {
              console.log('Replied to', id);
              responded.add(id);
            }
          } catch (e) {
            console.error('Send error', e.message || e);
          }

          break; // don't match multiple keywords for same message
        }
      }

      lastSeenId = id;
    }
  } catch (e) {
    console.error('Poll error', e.message || e);
  }
}

// --- SMAX helpers ---
async function fetchSmaxTokenFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/smax_tokens?select=token&limit=1`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.length > 0) {
      const val = data[0].token;
      smaxToken = val.startsWith('Bearer ') ? val : ('Bearer ' + val);
      console.log('Loaded SMAX token from Supabase');
    }
  } catch (e) { console.warn('Failed to load SMAX token from Supabase', e.message || e); }
}

function getMsgTypeFromPagePid(pid) {
  if (!pid) return 'facebook_message';
  const p = pid.toString();
  if (p.startsWith('ig')) return 'instagram_message';
  if (p.startsWith('tt')) return 'tiktokweb_message';
  if (p.startsWith('zl')) return 'zaloweb_message';
  return 'facebook_message';
}

async function pollSmax() {
  try {
    if (!smaxToken && SUPABASE_URL && SUPABASE_KEY) {
      await fetchSmaxTokenFromSupabase();
    }
    if (!smaxToken) {
      console.warn('No SMAX token available; skipping SMAX poll');
      return;
    }

    const payload = {
      page_pids: SMAX_PAGE_IDS.length ? SMAX_PAGE_IDS : null,
      keyword: null,
      reply: null,
      seen: null,
      after: "",
      limit: 50
    };

    const res = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/threads`, {
      method: 'POST',
      headers: {
        'Authorization': smaxToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.warn('SMAX threads fetch failed', res.status);
      return;
    }
    const result = await res.json();
    const threads = result.data || [];
    if (!Array.isArray(threads) || threads.length === 0) return;

    // process in chronological order: oldest first
    const ordered = threads.slice().reverse();
    for (const t of ordered) {
      const tid = t.tid || t.id;
      if (!tid) continue;
      // dedupe by thread+message text
      const text = (t.message || t.last_message || t.last_message_text || '').toString();
      if (!text) continue;
      const dedupKey = `${tid}:${text.slice(0,120)}`;
      if (responded.has(dedupKey)) continue;

      for (const kw of KEYWORDS) {
        if (!kw) continue;
        if (text.toLowerCase().includes(kw.toLowerCase())) {
          console.log(`SMAX keyword matched (${kw}) in thread ${tid}:`, text.substring(0,80));
          // send reply to thread
          const pagePid = t.page_pid || (SMAX_PAGE_IDS[0] || '');
          await sendSmaxReply(pagePid, tid, RESPONSE_TEMPLATE);
          responded.add(dedupKey);
          break;
        }
      }
    }
  } catch (e) { console.error('SMAX poll error', e.message || e); }
}

async function sendSmaxReply(pagePid, threadTid, text) {
  if (!smaxToken) {
    console.warn('No SMAX token for sending');
    return false;
  }
  const msgType = getMsgTypeFromPagePid(pagePid);
  try {
    const res = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${pagePid}/threads/${threadTid}/messages`, {
      method: 'POST',
      headers: { 'Authorization': smaxToken, 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' },
      body: JSON.stringify({ type: msgType, messages: [{ message: text }] })
    });
    if (!res.ok) {
      console.warn('Failed to send SMAX reply', res.status, await res.text());
      return false;
    }
    console.log('Sent SMAX reply to', threadTid);
    return true;
  } catch (e) { console.error('SMAX send error', e.message || e); return false; }
}


async function main() {
  // If SMAX mode is requested and token not provided, try to load from Supabase now
  if (SMAX_BIZ_ID && !smaxToken && SUPABASE_URL && SUPABASE_KEY) {
    await fetchSmaxTokenFromSupabase();
  }

  // Validate configuration early to avoid repeated Invalid URL errors
  if (!USE_SMAX) {
    if (!MESSAGES_API_URL || !SEND_API_URL) {
      console.error('Please set MESSAGES_API_URL and SEND_API_URL in .env, or configure SMAX_BIZ_ID and SMAX_TOKEN/SUPABASE settings.');
      process.exit(1);
    }
  }

  const interval = setInterval(poll, POLL_INTERVAL_MS);
  process.on('SIGINT', () => { clearInterval(interval); console.log('Shutting down'); process.exit(0); });
  process.on('SIGTERM', () => { clearInterval(interval); console.log('Shutting down'); process.exit(0); });

  // initial immediate poll
  await poll();
}

main().catch(err => { console.error('Startup error', err); process.exit(1); });
