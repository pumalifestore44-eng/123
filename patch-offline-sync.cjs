const fs=require('fs');
const p=__dirname+'/app.js';
let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('window.downloadOfflineMessageData = async function() {');
if(start<0) throw Error('downloadOfflineMessageData not found');
const replacement=`async function syncThreadMessagesToOffline(thread) {
    if (isTikTokChatboxThread(thread)) {
        const fetched = await fetchTikTokChatboxMessages(thread, 0, 80);
        const messages = [...fetched].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
        await cacheMessages(thread, messages);
        return messages.length;
    }
    const pagePid = thread.page_pid || selectedPagePid;
    const tid = thread.tid || thread.id;
    let cursor = '', all = [];
    const seen = new Set();
    for (let page=0; page<15; page++) {
        let url = 'https://api.smax.ai/bizs/'+SMAX_BIZ_ID+'/pages/'+pagePid+'/threads/'+tid+'/messages?limit=80&sort=-created_at';
        if (cursor) url += '&cusor=' + encodeURIComponent(cursor);
        const response = await fetch(url,{headers:{'Authorization':smaxToken,'Accept':'application/json, text/plain, */*','Ngrok-Skip-Browser-Warning':'true'}});
        if (!response.ok) throw new Error('Smax '+response.status);
        const rows = (await response.json()).data || [];
        if (!rows.length) break;
        let added=0;
        for (const m of rows) {
            const id=m.pid||m.id||m.mid||JSON.stringify([m.created_at,m.message,m.text]);
            if(!seen.has(id)){ seen.add(id); all.push(m); added++; }
        }
        if (!added || rows.length < 20) break;
        cursor = rows[rows.length-1]?.created_at || '';
        if (!cursor) break;
    }
    all.sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
    await cacheMessages(thread, all);
    return all.length;
}

window.downloadOfflineMessageData = async function() {
    const btn = document.querySelector('[onclick="window.downloadOfflineMessageData()"]');
    const original = btn?.textContent;
    try {
        if (!navigator.onLine) throw new Error('PC đang không có mạng. Hãy kết nối mạng để đồng bộ lần đầu.');
        if (!smaxThreads.length) await loadThreads(false, false);
        const threads = [...smaxThreads];
        if (!threads.length) throw new Error('Không có hội thoại để đồng bộ.');
        await cacheThreads(getOfflineThreadScopeKey(), threads);
        let ok=0, failed=0, totalMessages=0;
        for (let i=0;i<threads.length;i++) {
            if(btn) btn.textContent='Đang lưu '+(i+1)+'/'+threads.length+'...';
            try { totalMessages += await syncThreadMessagesToOffline(threads[i]); ok++; }
            catch(e) { failed++; console.warn('[Offline sync] thread failed', threads[i]?.tid, e); }
        }
        const dataPath = window.desktopOffline ? await window.desktopOffline.dataPath() : 'IndexedDB';
        alert('Đã lưu offline '+ok+'/'+threads.length+' hội thoại, '+totalMessages+' tin nhắn.'+(failed?' Lỗi '+failed+' hội thoại.':'')+'\\nDữ liệu: '+dataPath);
    } catch (err) {
        console.error('[Offline] sync error:', err);
        alert('Không thể lưu dữ liệu offline: ' + err.message);
    } finally { if(btn && original) btn.textContent=original; }
};
`;
s=s.slice(0,start)+replacement;
fs.writeFileSync(p,s);
console.log('offline sync patched');
