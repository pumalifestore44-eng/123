import { findMessageRanges } from './conversation-search-utils.mjs';
import './conversation-search.css';

export function mountConversationSearch(doc = document) {
  const flow = doc.getElementById('messagesFlow');
  const wrapper = doc.getElementById('chatWrapper');
  const header = wrapper?.querySelector('.chat-header');
  const actions = header?.querySelector('.header-actions');
  if (!flow || !actions || doc.getElementById('btnSearchConversation')) return;
  const icon = path => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' + path + '</svg>';
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.id = 'btnSearchConversation';
  toggle.className = 'action-btn';
  toggle.title = 'Tìm tin nhắn trong hội thoại';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'conversationSearchBar');
  toggle.innerHTML = icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>');
  actions.prepend(toggle);
  const bar = doc.createElement('div');
  bar.id = 'conversationSearchBar';
  bar.hidden = true;
  bar.setAttribute('role', 'search');
  bar.setAttribute('aria-label', 'Tìm nội dung trong hội thoại hiện tại');
  bar.innerHTML = '<div class="conversation-search-controls"><input id="conversationSearchInput" type="search" autocomplete="off" placeholder="Tìm tin nhắn..." aria-label="Nội dung tin nhắn cần tìm" aria-describedby="conversationSearchStatus"><button type="button" data-search-prev title="Tin nhắn khớp trước" aria-label="Tin nhắn khớp trước">' + icon('<path d="m6 15 6-6 6 6"/>') + '</button><button type="button" data-search-next title="Tin nhắn khớp tiếp theo" aria-label="Tin nhắn khớp tiếp theo">' + icon('<path d="m6 9 6 6 6-6"/>') + '</button><button type="button" data-search-close title="Đóng tìm kiếm" aria-label="Đóng tìm kiếm">' + icon('<path d="m6 6 12 12M6 18 18 6"/>') + '</button></div><div id="conversationSearchStatus" role="status" aria-live="polite"></div>';
  header.after(bar);
  const input = bar.querySelector('input');
  const status = bar.querySelector('[role=status]');
  const previous = bar.querySelector('[data-search-prev]');
  const next = bar.querySelector('[data-search-next]');
  let matches = [], selected = -1, timer;
  let key = flow.dataset.conversationKey || '';
  const observer = new MutationObserver(() => {
    const newKey = flow.dataset.conversationKey || '';
    if (newKey !== key) { key = newKey; input.value = ''; matches = []; selected = -1; }
    if (!bar.hidden) { clearTimeout(timer); timer = setTimeout(() => search(false), 60); }
  });
  function observe() {
    observer.observe(flow, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-conversation-key'] });
  }
  function clearMarks() {
    flow.querySelectorAll('mark.conversation-search-mark').forEach(mark => mark.replaceWith(doc.createTextNode(mark.textContent)));
    flow.querySelectorAll('.conversation-search-current').forEach(row => row.classList.remove('conversation-search-current'));
  }
  function updateStatus() {
    const total = flow.querySelectorAll('.message-row').length;
    status.textContent = input.value.trim()
      ? (matches.length ? (selected + 1) + '/' + matches.length + ' tin nhắn khớp' : 'Không có kết quả') + ' · Trong ' + total + ' tin nhắn đã tải'
      : 'Tìm trong ' + total + ' tin nhắn đã tải · Tự cập nhật khi tải lịch sử cũ';
    previous.disabled = next.disabled = !matches.length;
  }
  function select(index, scroll) {
    flow.querySelectorAll('.conversation-search-current').forEach(row => row.classList.remove('conversation-search-current'));
    selected = matches.length ? (index + matches.length) % matches.length : -1;
    const row = matches[selected];
    if (row) {
      row.classList.add('conversation-search-current');
      if (scroll) {
        const top = row.getBoundingClientRect().top - flow.getBoundingClientRect().top + flow.scrollTop;
        flow.scrollTop = Math.max(0, top - flow.clientHeight / 2 + row.clientHeight / 2);
      }
    }
    updateStatus();
  }
  function search(scroll = true) {
    clearTimeout(timer);
    observer.disconnect();
    const retained = matches[selected];
    clearMarks();
    matches = [];
    if (input.value.trim()) {
      flow.querySelectorAll('.message-text').forEach(text => {
        const value = text.textContent;
        const ranges = findMessageRanges(value, input.value);
        if (!ranges.length) return;
        const fragment = doc.createDocumentFragment();
        let end = 0;
        for (const [start, stop] of ranges) {
          fragment.append(doc.createTextNode(value.slice(end, start)));
          const mark = doc.createElement('mark');
          mark.className = 'conversation-search-mark';
          mark.textContent = value.slice(start, stop);
          fragment.append(mark);
          end = stop;
        }
        fragment.append(doc.createTextNode(value.slice(end)));
        text.replaceChildren(fragment);
        const row = text.closest('.message-row');
        if (row && !matches.includes(row)) matches.push(row);
      });
    }
    const retainedIndex = matches.indexOf(retained);
    select(!scroll && retainedIndex >= 0 ? retainedIndex : matches.length - 1, scroll);
    observe();
  }
  function close() {
    clearTimeout(timer);
    observer.disconnect();
    clearMarks();
    input.value = '';
    matches = [];
    selected = -1;
    bar.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    observe();
    toggle.focus();
  }
  toggle.addEventListener('click', () => {
    if (!bar.hidden) return close();
    bar.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    search(false);
    input.focus();
  });
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(true), 150); });
  previous.addEventListener('click', () => { if (timer) search(false); select(selected - 1, true); });
  next.addEventListener('click', () => { if (timer) search(false); select(selected + 1, true); });
  bar.querySelector('[data-search-close]').addEventListener('click', close);
  bar.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Enter' && event.target === input) { event.preventDefault(); search(false); select(selected + (event.shiftKey ? -1 : 1), true); }
  });
  observe();
}
mountConversationSearch();
