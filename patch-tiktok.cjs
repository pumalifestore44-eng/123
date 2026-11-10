const fs = require('fs');
const p = __dirname + '/app.js';
let s = fs.readFileSync(p, 'utf8');
function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(label + ' target missing');
  s = s.replace(oldText, newText);
}
replaceOnce(
`    try {\r\n        const payload = {\r\n            "page_pids": selectedPagePid === 'all' ? SMAX_PAGE_IDS : [selectedPagePid],`,
`    try {\r\n        if (selectedPagePid === TIKTOK_SMAX_MENU_PID) {\r\n            const rows = await fetchTikTokChatboxConversations(0, 50);\r\n            smaxThreads = rows;\r\n            currentSmaxAfter = '';\r\n            updateBadgeCounters();\r\n            renderThreads();\r\n            fetchThreadOrdersMap();\r\n            return;\r\n        }\r\n\r\n        const payload = {\r\n            "page_pids": selectedPagePid === 'all' ? SMAX_PAGE_IDS : [selectedPagePid],`, 'loadThreads');
replaceOnce(
`    try {\r\n        let pageLimit = 80;\r\n        let url = \`https://api.smax.ai/bizs/\${SMAX_BIZ_ID}/pages/\${thread.page_pid || selectedPagePid}/threads/\${thread.tid || thread.id}/messages?limit=\${pageLimit}&sort=-created_at\`;`,
`    try {\r\n        if (isTikTokChatboxThread(thread)) {\r\n            const fetched = await fetchTikTokChatboxMessages(thread, 0, 80);\r\n            activeMessages = [...fetched].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));\r\n            renderMessages(true);\r\n            updateDetailsPanel(thread);\r\n            await processKeywordTriggersForMessages(thread);\r\n            return;\r\n        }\r\n\r\n        let pageLimit = 80;\r\n        let url = \`https://api.smax.ai/bizs/\${SMAX_BIZ_ID}/pages/\${thread.page_pid || selectedPagePid}/threads/\${thread.tid || thread.id}/messages?limit=\${pageLimit}&sort=-created_at\`;`, 'loadMessages');
replaceOnce(
`    input.value = '';\r\n\r\n    // --- Nếu có ảnh pending: gửi ảnh trước ---`,
`    input.value = '';\r\n\r\n    // TikTok BotBanHang dùng API riêng, tuyệt đối không đi qua Smax.\r\n    if (isTikTokChatboxThread(activeThread)) {\r\n        if (!text) {\r\n            if (typeof showToast === 'function') showToast('TikTok BotBanHang hiện mới hỗ trợ gửi tin nhắn text.', 'error');\r\n            return;\r\n        }\r\n        try {\r\n            await sendTikTokChatboxText(activeThread, text);\r\n            activeMessages.push({ message: text, created_at: new Date().toISOString(), is_page_msg: true, user_id: 1, platform_type: 'TIKTOK' });\r\n            renderMessages();\r\n            activeThread.message = text;\r\n            activeThread.updated_at = new Date().toISOString();\r\n            renderThreads();\r\n            await processOutgoingKeywordTrigger(activeThread, text);\r\n        } catch (e) {\r\n            console.error('[TikTok BotBanHang] send_message error:', e);\r\n            input.value = text;\r\n            if (typeof showToast === 'function') showToast('Gửi TikTok thất bại: ' + e.message, 'error');\r\n        }\r\n        return;\r\n    }\r\n\r\n    // --- Nếu có ảnh pending: gửi ảnh trước ---`, 'sendMessage');
fs.writeFileSync(p, s);
console.log('TikTok BotBanHang patch applied');
