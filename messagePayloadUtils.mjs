// Linkify plain text before escaping so query strings retain their original URL.
export function formatMessageText(text) {
  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const input = String(text ?? '');
  const pattern = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let html = '', offset = 0;
  for (const match of input.matchAll(pattern)) {
    let url = match[0].replace(/[.,!?;:]+$/, '');
    // Keep balanced brackets in URLs, but exclude surrounding sentence brackets.
    while (/[)\]}]$/.test(url)) {
      const close = url.at(-1);
      const open = { ')': '(', ']': '[', '}': '{' }[close];
      if (url.split(close).length <= url.split(open).length) break;
      url = url.slice(0, -1).replace(/[.,!?;:]+$/, '');
    }
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    let valid = false;
    try { valid = ['http:', 'https:'].includes(new URL(href).protocol); } catch {}
    html += escape(input.slice(offset, match.index));
    html += valid
      ? `<a class="message-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a>`
      : escape(url);
    offset = match.index + url.length;
  }
  return html + escape(input.slice(offset));
}

export function getMessageTypeForPagePid(pagePid) {
  const pid = String(pagePid ?? '');
  if (pid.startsWith('ig')) return 'instagram_message';
  if (pid.startsWith('tt')) return 'tiktokweb_message';
  if (pid.startsWith('zl')) return 'zaloweb_message';
  return 'facebook_message';
}

export function isImageAttachment(attachment, imageUrl = '') {
  const url = String(imageUrl || '');
  return attachment?.type === 'image' ||
    String(attachment?.mime_type || '').startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp)(?:[?#]|$)/i.test(url) ||
    /(?:^|\/)lookaside\.fbsbx\.com\/ig_messaging_cdn(?:\/|\?|$)/i.test(url);
}

export function buildMultiImagePayload({ pagePid, threadId, imageUrls, timestamp = Date.now() }) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  if (urls.length === 0) {
    return {
      type: getMessageTypeForPagePid(pagePid),
      messages: []
    };
  }

  return {
    type: getMessageTypeForPagePid(pagePid),
    messages: urls.map((picture, index) => ({
      temp_id: `${threadId}-${timestamp}-${index}`,
      picture
    }))
  };
}
