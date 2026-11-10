import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || SUPABASE_SERVICE_ROLE_KEY;
const SMAX_BIZ_ID = Deno.env.get('SMAX_BIZ_ID') || 'tuant2lqd';
const SMAX_TOKEN = Deno.env.get('SMAX_TOKEN') || '';
const ZALO_PAGE_PID = Deno.env.get('ZALO_PAGE_PID') || 'zlw266741166578791076';
const ZALO_THREAD_IDS = (Deno.env.get('ZALO_THREAD_IDS') || 'zlw3481453659339661895,zlw2283526825999855015')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUse: false,
  },
});

function parseImageUrls(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && !!v.trim());

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string' && !!v.trim());
      }
    } catch {
      // ignore invalid JSON, fallback to comma-split below
    }

    return trimmed
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
}

function buildZaloPayload({ threadId, text, imageUrls }: { threadId: string; text?: string; imageUrls: string[] }) {
  const messages: Array<{ temp_id: string; message?: string; picture?: string }> = [];
  const baseId = `${threadId}-${Date.now()}`;

  if (text && text.trim()) {
    messages.push({
      temp_id: `${baseId}-text`,
      message: text.trim(),
    });
  }

  imageUrls.forEach((url, index) => {
    messages.push({
      temp_id: `${baseId}-${index}`,
      picture: url,
    });
  });

  return {
    type: 'zaloweb_message',
    messages,
  };
}

async function updatePostStatus(postId: number, status: string) {
  const { error } = await supabase.from('posts').update({ status }).eq('id', postId);
  if (error) {
    console.error(`Failed to set status=${status} for post ${postId}:`, error);
    throw error;
  }
}

async function sendToZaloThread({
  pagePid,
  threadId,
  text,
  imageUrls,
  token,
}: {
  pagePid: string;
  threadId: string;
  text?: string;
  imageUrls: string[];
  token: string;
}) {
  const payload = buildZaloPayload({ threadId, text, imageUrls });
  if (payload.messages.length === 0) {
    throw new Error(`No payload message to send for thread ${threadId}`);
  }

  const response = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${pagePid}/threads/${threadId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://smax.ai',
      Referer: 'https://smax.ai/',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`SMAX send failed for thread ${threadId}: ${response.status} ${bodyText}`);
  }

  return true;
}

async function processPendingZaloPosts() {
  if (!SMAX_TOKEN) {
    throw new Error('Missing SMAX_TOKEN env');
  }

  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('posts')
    .select('*')
    .eq('platforms', 'zalo')
    .eq('status', 'pending')
    .lte('scheduled_at', now);

  if (error) {
    throw error;
  }

  if (!rows || rows.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;

  for (const row of rows) {
    const postId = Number(row.id);
    const targetThreadIds = Array.isArray(row.thread_ids) && row.thread_ids.length
      ? row.thread_ids
      : ZALO_THREAD_IDS;

    try {
      await updatePostStatus(postId, 'processing');

      const content = String(row.content || '').trim();
      const imageUrls = parseImageUrls(row.image_url || row.imageUrl || row.images || row.image_urls);

      for (const tid of targetThreadIds) {
        if (!tid) continue;
        await sendToZaloThread({
          pagePid: ZALO_PAGE_PID,
          threadId: String(tid),
          text: content,
          imageUrls,
          token: SMAX_TOKEN,
        });
      }

      await updatePostStatus(postId, 'completed');
      processed += 1;
      console.log(`Processed post ${postId} to threads: ${targetThreadIds.join(', ')}`);
    } catch (err) {
      console.error(`Error processing post ${postId}:`, err);
      try {
        await updatePostStatus(postId, 'pending');
      } catch {
        // ignore
      }
    }
  }

  return { processed };
}

Deno.serve(async (_req) => {
  try {
    const result = await processPendingZaloPosts();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('scheduled-zalo-send failed:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
