#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const configPath = path.resolve(__dirname, 'config.json');
const statePath = path.resolve(__dirname, 'state.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (err) { return null; }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (err) { return {}; }
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function getMsgTypeFromPagePid(pid) {
  if (!pid) return 'facebook_message';
  const p = pid.toString();
  if (p.startsWith('ig')) return 'instagram_message';
  if (p.startsWith('tt')) return 'tiktokweb_message';
  if (p.startsWith('zl')) return 'zaloweb_message';
  return 'facebook_message';
}

async function fetchSmaxTokenFromSupabase(config) {
  if (!config.supabaseUrl || !config.supabaseKey) return '';
  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/smax_tokens?select=token&limit=1`, {
      headers: { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}` }
    });
    if (!res.ok) return '';
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const tokenValue = data[0].token;
      return tokenValue.startsWith('Bearer ') ? tokenValue : 'Bearer ' + tokenValue;
    }
  } catch (e) { console.error('load token error', e.message || e); }
  return '';
}

async function sendSmaxReply(config, pagePid, threadTid, text, token) {
  const msgType = getMsgTypeFromPagePid(pagePid);
  const url = `https://api.smax.ai/bizs/${config.smaxBizId}/pages/${pagePid}/threads/${threadTid}/messages`;
  const body = JSON.stringify({ type: msgType, messages: [{ message: text }] });
  console.log('SEND_SMART:', { url, bodySnippet: text.slice(0,120), tokenPresent: !!token });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
      body
    });
    const respText = await res.text();
    if (!res.ok) {
      console.error('SMAX reply failed', res.status, respText);
      return false;
    }
    console.log('SMAX reply success', res.status, respText.slice(0,200));
    return true;
  } catch (e) {
    console.error('SMAX send exception', e.message || e);
    return false;
  }
}

function getMessageOrigin(thread) {
  const isShop = thread.reply === false ||
                 thread.reply === 'false' ||
                 thread.is_replied === true ||
                 thread.is_replied === 'true' ||
                 thread.replied === true ||
                 thread.replied === 'true' ||
                 thread.last_message_by === 'page' ||
                 thread.last_message_is_page_message === true ||
                 thread.last_message?.is_page_message === true ||
                 thread.is_page_message === true ||
                 thread.last_message?.sender_type === 'page' ||
                 thread.last_message?.from_page === true ||
                 thread.last_message?.is_page_msg === true ||
                 thread.last_message_by_shop === true ||
                 thread.last_message_by_page === true;
  if (isShop) return 'shop';
  return 'customer';
}

async function pollSmax(config, token, state) {
  const res = await fetch(`https://api.smax.ai/bizs/${config.smaxBizId}/threads`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
    body: JSON.stringify({ page_pids: config.smaxPageIds, keyword: null, reply: null, seen: null, after: '', limit: 50 })
  });
  if (!res.ok) return;
  const data = await res.json();
  const threads = data.data || [];
  for (const thread of threads.slice().reverse()) {
    const tid = thread.tid || thread.id;
    if (!tid) continue;
    const text = (thread.message || thread.last_message || thread.last_message_text || '').toString();
    const textSnippet = text ? text.replace(/\s+/g, ' ').slice(0, 200) : '';
    const origin = getMessageOrigin(thread);
    console.log('POLLER:', { tid, origin, snippet: textSnippet });
    if (!text) continue;
    const normTextQuick = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const globalKeywords = (config.rules || []).flatMap(r => (r.keywords || [])).map(k => (typeof k === 'string' ? k : '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean);
    const globalMatched = globalKeywords.find(kw => normTextQuick.includes(kw));
    console.log('GLOBAL MATCH CHECK:', { normTextQuick, globalKeywords, globalMatched });
    const bestRule = (config.rules || []).find(rule => {
      if (!rule.active) return false;
      if (rule.triggerType === 'customer' && origin !== 'customer') return false;
      if (rule.triggerType === 'shop' && origin !== 'shop') return false;
      if (rule.triggerType === 'both') return true;
      return false;
    });
    console.log('bestRule:', bestRule ? bestRule.name : null);
    if (!bestRule) continue;
    const normText = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const dedupKey = `${tid}:${bestRule.name}:${normText.slice(0,120)}`;
    if (state.replied?.includes(dedupKey)) continue;
    const normKeywords = (bestRule.keywords || []).map(k => (typeof k === 'string' ? k : '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean);
    console.log('checking rule', bestRule.name, 'normText:', normText, 'normKeywords:', normKeywords);
    const matchedKeyword = normKeywords.find(normKw => normText.includes(normKw));
    if (!matchedKeyword) continue;
    console.log('matched', matchedKeyword, 'thread', tid, 'origin', origin, 'textSnippet:', textSnippet);
    if (await sendSmaxReply(config, thread.page_pid || config.smaxPageIds[0], tid, bestRule.response, token)) {
      state.replied = state.replied || [];
      state.replied.push(dedupKey);
      writeState(state);
    }
  }
}

async function main() {
  console.log('Chatbot starting...');
  const config = readConfig();
  if (!config) {
    console.error('Missing config.json');
    process.exit(1);
  }
  console.log('Loaded config:', {
    mode: config.mode,
    pollIntervalMs: config.pollIntervalMs,
    useSupabaseToken: config.useSupabaseToken,
    smaxBizId: config.smaxBizId,
    pageIds: config.smaxPageIds
  });
  const state = readState();
  let token = config.smaxToken;
  if (config.useSupabaseToken && !token) {
    token = await fetchSmaxTokenFromSupabase(config);
  }
  if (!token) {
    console.error('No SMAX token available');
    process.exit(1);
  }
  console.log('Starting initial poll...');
  await pollSmax(config, token, state);
  console.log('Polling every', config.pollIntervalMs || 5000, 'ms');
  setInterval(async () => {
    await pollSmax(config, token, state);
  }, config.pollIntervalMs || 5000);
}

main();
