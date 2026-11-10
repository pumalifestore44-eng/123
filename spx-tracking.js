import { extractSpxCode, extractSpxCodes, buildSpxTrackingPatch, SPX_STAGES, getSpxStage, shouldCheckSpxTracking, SPX_AUTO_CHECK_INTERVAL, isSpxAutoCheckDue } from './spx-tracking-utils.mjs';
import './spx-tracking.css';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa kiểm tra';
function confirmTrackingDeletion(code) {
    return new Promise((resolve, reject) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'spx-delete-dialog';
        dialog.setAttribute('aria-labelledby', 'spxDeleteDialogTitle');
        dialog.innerHTML = `<h3 id="spxDeleteDialogTitle">Xóa vận đơn khỏi danh sách?</h3><p>Mã vận đơn: <strong>${escape(code)}</strong></p><p>Chỉ xóa khỏi danh sách theo dõi. Không hủy vận đơn trên SPX và không xóa đơn bán hàng.</p><div class="spx-delete-dialog-actions"><button type="button" data-delete-cancel autofocus>Hủy</button><button type="button" data-delete-confirm>Xóa vận đơn</button></div>`;
        let approved = false;
        dialog.querySelector('[data-delete-cancel]').addEventListener('click', () => dialog.close());
        dialog.querySelector('[data-delete-confirm]').addEventListener('click', () => { approved = true; dialog.close(); });
        dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => { dialog.remove(); resolve(approved); }, { once: true });
        document.body.appendChild(dialog);
        try { dialog.showModal(); dialog.querySelector('[data-delete-cancel]').focus(); }
        catch (error) { dialog.remove(); reject(error); }
    });
}
let scannerLibrary;
function loadScannerLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (!scannerLibrary) scannerLibrary = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/html5-qrcode.min.js';
        script.onload = () => window.Html5Qrcode ? resolve() : reject(new Error('Không khởi tạo được bộ quét QR.'));
        script.onerror = () => { script.remove(); reject(new Error('Không tải được bộ quét QR. Bạn vẫn có thể nhập mã thủ công.')); };
        document.head.appendChild(script);
    }).catch(err => { scannerLibrary = null; throw err; });
    return scannerLibrary;
}

export function setupSpxTracking({ supabaseUrl, supabaseKey }) {
    const panel = document.getElementById('spx-tracking-tab-content');
    if (!panel || panel.dataset.initialized) return;
    panel.dataset.initialized = 'true';
    const $ = id => panel.querySelector(`#${id}`);
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' };
    let rows = [], loaded = false, loading, adding = false, checkingBatch = false, deleting = null;
    let scanner, cameraStarting, scanBusy = false, interval, visible = false;
    let feedbackTimer, finishFeedback;
    const checking = new Set();
    const autoCheckKey = `spx-tracking:last-check:${supabaseUrl}`;
    let lastCheckAt = 0;
    function readLastCheck() {
        try { return Number(localStorage.getItem(autoCheckKey)) || 0; } catch { return lastCheckAt; }
    }
    function rememberCheck(timestamp = Date.now()) {
        lastCheckAt = timestamp;
        try { localStorage.setItem(autoCheckKey, String(timestamp)); } catch {}
        scheduleAutoCheck();
    }
    function scheduleAutoCheck() {
        clearTimeout(interval);
        if (!visible || document.hidden) return;
        interval = setTimeout(() => {
            if (visible && !document.hidden) void onVisible();
        }, lastCheckAt ? Math.max(60000, SPX_AUTO_CHECK_INTERVAL - (Date.now() - lastCheckAt)) : SPX_AUTO_CHECK_INTERVAL);
    }

    function notify(message, error = false) {
        $('spxTrackingNotice').textContent = message;
        $('spxTrackingNotice').classList.toggle('spx-error', error);
    }
    function clearScanFeedback() {
        clearTimeout(feedbackTimer);
        $('spxQrFeedback').hidden = true;
        finishFeedback?.();
        finishFeedback = null;
    }
    function showScanFeedback(message, kind, autoHide = true) {
        clearScanFeedback();
        if ($('spxQrArea').hidden) return Promise.resolve();
        const feedback = $('spxQrFeedback');
        feedback.textContent = message;
        feedback.dataset.kind = kind;
        feedback.hidden = false;
        if (!autoHide) return Promise.resolve();
        return new Promise(resolve => {
            finishFeedback = resolve;
            feedbackTimer = setTimeout(clearScanFeedback, 2000);
        });
    }
    async function db(query, options = {}) {
        const res = await fetch(`${supabaseUrl}/rest/v1/spx_tracking${query}`, { ...options, headers: { ...headers, ...options.headers } });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            if (data?.code === 'PGRST205' || data?.code === '42P01') throw new Error('Chưa khởi tạo dữ liệu vận đơn. Vui lòng chạy file SQL spx_tracking được cung cấp rồi tải lại.');
            throw new Error(data?.message || `Không lưu/tải được vận đơn (HTTP ${res.status}).`);
        }
        return data;
    }
    function controls() {
        $('spxCheckActive').disabled = Boolean(deleting) || checkingBatch || adding || checking.size > 0 || Boolean(loading) || !loaded || !rows.some(shouldCheckSpxTracking);
        $('spxReloadTracking').disabled = Boolean(deleting) || Boolean(loading) || checkingBatch || checking.size > 0 || adding;
        $('spxAddTracking').disabled = Boolean(deleting) || adding || checkingBatch || checking.size > 0;
    }
    function render() {
        const search = $('spxTrackingSearch').value.trim().toLowerCase();
        for (const stage of SPX_STAGES) {
            const all = rows.filter(r => getSpxStage(r) === stage.key);
            $(stage.countId).textContent = all.length;
            const filtered = all.filter(r => `${r.spx_tn} ${r.note || ''}`.toLowerCase().includes(search));
            $(stage.listId).innerHTML = filtered.length ? filtered.map(row => `
                <article class="spx-tracking-card">
                    <div class="spx-card-heading"><a href="https://spx.vn/m/track?${encodeURIComponent(row.spx_tn)}" target="_blank" rel="noopener noreferrer">${escape(row.spx_tn)} ↗</a><span class="spx-source">${row.source === 'qr' ? 'Quét QR' : 'Nhập tay'}</span></div>
                    <span class="spx-status spx-status-${stage.key}">${escape(row.tracking_code_group_name ? stage.label : 'Chờ kiểm tra SPX')}</span>
                    ${row.tracking_code_group_name ? `<div class="spx-card-meta">SPX: ${escape(row.tracking_code_group_name)}${row.tracking_code_subgroup_name && row.tracking_code_subgroup_name !== row.tracking_code_group_name ? ` · ${escape(row.tracking_code_subgroup_name)}` : ''}</div>` : ''}
                    ${row.note ? `<p class="spx-card-note">${escape(row.note)}</p>` : ''}
                    ${row.latest_event ? `<p>${escape(row.latest_event)}</p>` : ''}
                    <div class="spx-card-meta">Thêm: ${date(row.created_at)}${row.picked_up_at ? `<br>Ghi nhận đã lấy: ${date(row.picked_up_at)}` : ''}<br>Kiểm tra: ${date(row.last_checked_at)}</div>
                    ${row.last_error ? `<p class="spx-error">${escape(row.last_error)}</p>` : ''}
                    <div class="spx-card-actions">
                        <button type="button" data-spx-check="${escape(row.spx_tn)}" ${deleting || checking.size || checkingBatch || adding || loading ? 'disabled' : ''}>${checking.has(row.spx_tn) ? 'Đang kiểm tra…' : 'Kiểm tra SPX'}</button>
                        <button type="button" class="spx-delete-tracking" data-spx-delete="${escape(row.spx_tn)}" ${deleting || checking.size || checkingBatch || adding || loading ? 'disabled' : ''}>${deleting === row.spx_tn ? 'Đang xóa…' : 'Xóa'}</button>
                    </div>
                </article>`).join('') : `<div class="spx-empty">${!loaded ? 'Chưa tải dữ liệu vận đơn.' : search ? 'Không tìm thấy mã phù hợp.' : `Chưa có vận đơn trong mục ${stage.label.toLowerCase()}.`}</div>`;
        }
        controls();
    }
    async function load() {
        if (loading) return loading;
        loading = (async () => {
            const all = [];
            for (let offset = 0; ; offset += 1000) {
                const page = await db(`?select=*&order=created_at.desc,spx_tn.asc&limit=1000&offset=${offset}`);
                if (!Array.isArray(page)) throw new Error('Dữ liệu vận đơn không hợp lệ.');
                all.push(...page);
                if (page.length < 1000) break;
            }
            rows = all;
            loaded = true;
            render();
        })();
        controls();
        try { await loading; } finally { loading = null; render(); }
    }
    async function checkOne(code) {
        if (deleting || checking.has(code)) return false;
        const record = rows.find(r => r.spx_tn === code);
        if (!record) return false;
        checking.add(code);
        render();
        try {
            const res = await fetch(`/api/spx-track?spx_tn=${encodeURIComponent(code)}`, { cache: 'no-store' });
            if (res.headers.get('x-vercel-error') === 'FUNCTION_INVOCATION_FAILED') {
                throw new Error('API tra cứu SPX chưa khởi chạy được trên máy chủ. Cần triển khai bản cập nhật API.');
            }
            const result = await res.json().catch(() => null);
            if (!res.ok || result?.error) throw new Error(result?.error || `Không tra cứu được SPX (HTTP ${res.status}).`);
            if (result?.spx_tn !== code || !result.tracking_code_group_name || typeof result.is_picked_up !== 'boolean') throw new Error('Kết quả SPX không hợp lệ.');
            const { spx_tn, ...status } = result;
            const patch = buildSpxTrackingPatch(record, status);
            const saved = await db(`?spx_tn=eq.${encodeURIComponent(code)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
            if (!saved?.[0]) throw new Error('Không cập nhật được vận đơn.');
            Object.assign(record, saved[0]);
            return true;
        } catch (err) {
            record.last_error = err.message;
            // Keep the pickup classification on API failure; persist only the error.
            try { await db(`?spx_tn=eq.${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ last_error: err.message }) }); } catch {}
            return false;
        } finally { checking.delete(code); render(); }
    }
    async function checkActive() {
        if (deleting || checkingBatch || checking.size || adding || loading || !loaded) return;
        checkingBatch = true;
        const codes = rows.filter(shouldCheckSpxTracking).map(r => r.spx_tn);
        if (codes.length) rememberCheck();
        let ok = 0, completed = 0;
        render();
        try {
            for (const code of codes) {
                if (!visible || document.hidden) break;
                notify(`Đang kiểm tra ${completed + 1}/${codes.length} vận đơn…`);
                if (await checkOne(code)) ok++;
                completed++;
            }
            if (completed) notify(`Đã kiểm tra ${completed} vận đơn: ${ok} thành công${completed > ok ? `, ${completed - ok} lỗi (xem từng vận đơn)` : ''}.`, completed > ok);
        } finally { checkingBatch = false; render(); }
    }
    async function add(value, source) {
        if (deleting || adding || checkingBatch || checking.size) return;
        const { codes, duplicates } = source === 'manual' ? extractSpxCodes(value) : { codes: [extractSpxCode(value)], duplicates: 0 };
        const code = codes[0];
        adding = true; controls();
        try {
            const result = await db('?on_conflict=spx_tn', {
                method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
                body: JSON.stringify(codes.map(spx_tn => ({ spx_tn, source, note: $('spxTrackingNote').value.trim() })))
            });
            await load();
            const inserted = result?.length || 0;
            const skipped = duplicates + codes.length - inserted;
            notify(codes.length === 1 && !duplicates
                ? inserted ? `Đã thêm ${code} vào danh sách chưa lấy hàng.` : `${code} đã có trong danh sách, giữ nguyên dữ liệu.`
                : `Đã thêm ${inserted} vận đơn mới${skipped ? `, bỏ qua ${skipped} mã trùng` : ''}.`);
            $('spxTrackingCode').value = ''; $('spxTrackingNote').value = '';
            if (source === 'manual') $('spxTrackingCode').focus();
            return { code, duplicate: !result?.length };
        } finally { adding = false; render(); }
    }
    async function stopCamera() {
        clearScanFeedback();
        if (cameraStarting) { try { await cameraStarting; } catch {} }
        if (scanner?.isScanning) await scanner.stop();
        scanner?.clear(); scanner = null;
        $('spxQrArea').hidden = true;
        $('spxStopCamera').hidden = true;
    }
    async function scanResult(value) {
        if (scanBusy) return;
        scanBusy = true;
        try {
            if (deleting || adding || checkingBatch || checking.size) {
                await showScanFeedback('Hệ thống đang lưu hoặc kiểm tra vận đơn. Vui lòng quét lại sau giây lát.', 'pending');
                return;
            }
            const code = extractSpxCode(value);
            void showScanFeedback(`Đã đọc mã ${code} · Đang lưu…`, 'pending', false);
            const result = await add(code, 'qr');
            if (result) await showScanFeedback(
                result.duplicate ? `Mã trùng: ${code} · Đã có trong danh sách` : `Đã lưu vận đơn ${code}`,
                result.duplicate ? 'duplicate' : 'success'
            );
        }
        catch (err) {
            notify(err.message, true);
            await showScanFeedback(err.message, 'error');
        }
        finally { scanBusy = false; }
    }
    $('spxTrackingForm').addEventListener('submit', event => {
        event.preventDefault();
        add($('spxTrackingCode').value, 'manual').catch(err => notify(err.message, true));
    });
    $('spxTrackingCode').addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            $('spxTrackingForm').requestSubmit();
        }
    });
    $('spxTrackingSearch').addEventListener('input', render);
    $('spxReloadTracking').addEventListener('click', () => load().then(() => notify('Đã tải lại danh sách vận đơn.')).catch(err => notify(err.message, true)));
    $('spxCheckActive').addEventListener('click', checkActive);
    panel.addEventListener('click', event => {
        const deleteCode = event.target.closest('[data-spx-delete]')?.dataset.spxDelete;
        if (deleteCode) { void deleteTracking(deleteCode); return; }
        const code = event.target.closest('[data-spx-check]')?.dataset.spxCheck;
        if (code) {
            rememberCheck();
            checkOne(code).then(ok => notify(ok ? `Đã cập nhật ${code}.` : `Không kiểm tra được ${code}. Xem lỗi trên vận đơn.`, !ok));
        }
    });
    async function deleteTracking(code) {
        if (deleting || adding || checkingBatch || checking.size || loading || !rows.some(row => row.spx_tn === code)) return;
        deleting = code; render();
        try {
            if (!await confirmTrackingDeletion(code)) return;
            const removed = await db(`?spx_tn=eq.${encodeURIComponent(code)}`, { method:'DELETE', headers:{ Prefer:'return=representation' } });
            if (!Array.isArray(removed) || !removed.some(row => row.spx_tn === code)) throw new Error('Chưa xóa được vận đơn. Hãy tải lại danh sách hoặc kiểm tra quyền xóa bảng spx_tracking.');
            rows = rows.filter(row => row.spx_tn !== code);
            notify(`Đã xóa ${code} khỏi danh sách theo dõi.`);
        } catch (err) { notify(err.message, true); }
        finally { deleting = null; render(); }
    }
    $('spxStartCamera').addEventListener('click', async () => {
        const btn = $('spxStartCamera'); btn.disabled = true;
        try {
            await loadScannerLibrary(); await stopCamera();
            if (!visible) return;
            $('spxQrArea').hidden = false;
            scanner = new window.Html5Qrcode('spxQrReader');
            cameraStarting = scanner.start({ facingMode: 'environment' }, { fps: 8, qrbox: { width: 240, height: 240 } }, scanResult, () => {});
            try { await cameraStarting; } finally { cameraStarting = null; }
            $('spxStopCamera').hidden = false;
            notify('Đưa QR trên bill vào khung. Quét thành công sẽ tự lưu mã vận đơn.');
        } catch (err) { notify(`Không mở được camera. Cho phép truy cập camera hoặc chọn ảnh bill. ${err.message || err}`, true); }
        finally { btn.disabled = false; }
    });
    $('spxStopCamera').addEventListener('click', () => stopCamera().catch(err => notify(String(err), true)));
    $('spxQrFile').addEventListener('change', async event => {
        const file = event.target.files?.[0]; if (!file) return;
        $('spxStartCamera').disabled = true;
        try {
            await loadScannerLibrary(); await stopCamera();
            $('spxQrArea').hidden = false;
            scanner = new window.Html5Qrcode('spxQrReader');
            const value = await scanner.scanFile(file, true);
            await scanResult(value);
            await stopCamera();
        } catch (err) { notify(`Không đọc được QR từ ảnh bill. Hãy chọn ảnh rõ nét hoặc nhập mã thủ công. ${err.message || err}`, true); }
        finally { event.target.value = ''; $('spxStartCamera').disabled = false; }
    });
    async function onVisible() {
        if (deleting || checkingBatch || checking.size || adding) { scheduleAutoCheck(); return; }
        try {
            await load();
            const latestSavedCheck = Math.max(0, ...rows.map(row => Date.parse(row.last_checked_at) || 0));
            lastCheckAt = Math.max(lastCheckAt, readLastCheck(), latestSavedCheck);
            // First use starts the daily window; adding/scanning never triggers an immediate lookup.
            if (!lastCheckAt) rememberCheck();
            if (visible && !document.hidden && isSpxAutoCheckDue(lastCheckAt)) {
                if (rows.some(shouldCheckSpxTracking)) await checkActive();
                else rememberCheck();
            }
        }
        catch (err) { notify(err.message, true); }
        finally { scheduleAutoCheck(); }
    }
    const syncVisibility = () => {
        const next = panel.style.display !== 'none';
        if (next === visible) return;
        visible = next;
        clearTimeout(interval);
        if (visible) {
            void onVisible();
        } else { void stopCamera().catch(() => {}); }
    };
    new MutationObserver(syncVisibility).observe(panel, { attributes: true, attributeFilter: ['style'] });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { clearTimeout(interval); void stopCamera().catch(() => {}); }
        else if (visible) void onVisible();
    });
    window.addEventListener('pagehide', () => { void stopCamera().catch(() => {}); });
    render(); syncVisibility();
}
