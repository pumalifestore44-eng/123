import { primarySupabase } from './supabase-config.mjs';

// A single Supabase Auth session serves Pumalife's main login and GomShip printing.
// Only the signed-in user's access/refresh tokens are stored; never the password.
const SESSION_KEY = 'pumalife:auth:session:v1';
let cached = null;
const authHeaders = { 'Content-Type': 'application/json', apikey: primarySupabase.anonKey };

function loadSession() {
  if (cached) return cached;
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (value && typeof value.access_token === 'string' &&
        typeof value.refresh_token === 'string' &&
        Number.isFinite(value.expires_at)) {
      cached = value;
      return value;
    }
  } catch {}
  return null;
}

function saveSession(value) {
  if (!value?.access_token || !value?.refresh_token)
    throw new Error('Supabase Auth không trả về phiên đăng nhập hợp lệ');
  cached = {
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    expires_at: Date.now() + Math.max(0, Number(value.expires_in || 3600) - 60) * 1000
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(cached));
  return cached.access_token;
}

export function clearPumalifeSession() {
  cached = null;
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('is_logged_in');
  } catch {}
}

async function authRequest(grantType, body) {
  const response = await fetch(primarySupabase.url +
    '/auth/v1/token?grant_type=' + grantType, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.access_token)
    throw new Error(result?.error_description || result?.msg ||
      'Không xác thực được tài khoản Pumalife với Supabase Auth');
  return result;
}

export async function signInPumalife(email, password) {
  if (!email?.trim() || !password)
    throw new Error('Vui lòng nhập email và mật khẩu');
  const value = await authRequest('password', { email: email.trim(), password });
  const token = saveSession(value);
  localStorage.setItem('is_logged_in', 'true');
  return token;
}

let refreshPromise = null;
export async function getPumalifeAccessToken() {
  const session = loadSession();
  if (!session) return null;
  if (session.expires_at > Date.now() + 10000) return session.access_token;
  if (!refreshPromise) {
    refreshPromise = authRequest('refresh_token', {
      refresh_token: session.refresh_token
    }).then(saveSession).catch(error => {
      clearPumalifeSession();
      throw error;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}
