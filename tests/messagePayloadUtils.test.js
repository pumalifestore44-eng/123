const test = require('node:test');
const assert = require('node:assert/strict');

test('message links open in a new tab and preserve bill query strings', async () => {
  const { formatMessageText } = await import('../messagePayloadUtils.mjs');
  const html = formatMessageText('Bill: https://pumalifeorder.vercel.app/bill.html?id=16815&shop=1\nXem www.example.com.');
  assert.match(html, /href="https:\/\/pumalifeorder.vercel.app\/bill.html\?id=16815&amp;shop=1" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/www.example.com"[^>]*>www.example.com<\/a>\./);
  assert.ok(html.includes('\nXem '));
});

test('link formatting escapes untrusted content and excludes surrounding punctuation', async () => {
  const { formatMessageText } = await import('../messagePayloadUtils.mjs');
  const html = formatMessageText('<img src=x onerror="alert(1)"> javascript:alert(1) (https://example.com/a_(b)).');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /href="https:\/\/example.com\/a_\(b\)"/);
  assert.ok(html.endsWith('</a>).'));
  assert.equal(formatMessageText('https://'), 'https://');
  assert.equal(formatMessageText('Chào bạn & cảm ơn'), 'Chào bạn &amp; cảm ơn');
});

test('buildMultiImagePayload creates a single Zaloweb request with indexed picture entries', async () => {
  const { buildMultiImagePayload, getMessageTypeForPagePid } = await import('../messagePayloadUtils.mjs');

  const payload = buildMultiImagePayload({
    pagePid: 'zlw4022282657786800069',
    threadId: 'thread-001',
    imageUrls: ['a.png', 'b.png', 'c.png'],
    timestamp: 1700000000000
  });

  assert.equal(getMessageTypeForPagePid('zlw4022282657786800069'), 'zaloweb_message');
  assert.deepEqual(payload.type, 'zaloweb_message');
  assert.equal(payload.messages.length, 3);
  assert.deepEqual(payload.messages.map(item => item.picture), ['a.png', 'b.png', 'c.png']);
  assert.deepEqual(payload.messages.map(item => item.temp_id), [
    'thread-001-1700000000000-0',
    'thread-001-1700000000000-1',
    'thread-001-1700000000000-2'
  ]);
});

test('isImageAttachment recognizes Instagram CDN URLs without file extensions', async () => {
  const { isImageAttachment } = await import('../messagePayloadUtils.mjs');

  assert.equal(isImageAttachment({}, 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=2193946888216988&signature=test'), true);
  assert.equal(isImageAttachment({}, 'https://scontent.xx.fbcdn.net/v/t1.15752-9/image.jpg?oh=test'), true);
  assert.equal(isImageAttachment({}, 'https://example.com/document.pdf'), false);
});

test('encodeURIComponent order data remains decodable when JSON contains apostrophes', () => {
  const order = { id: 'order-1', items: [{ product_name: "Men's shirt" }] };
  const encoded = encodeURIComponent(JSON.stringify(order)).replace(/'/g, '%27');

  assert.deepEqual(JSON.parse(decodeURIComponent(encoded)), order);
});
