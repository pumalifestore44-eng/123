const AI_AGENT_TABLE = 'ai_agent_requests';
const AI_POST_TABLE = 'ai_post_requests';
const AI_AGENT_HISTORY_MODE = 'latest-20-paged-v2';
const AI_AGENT_HISTORY_LIMIT = 20;
const AI_AGENT_CONVERSATION_KEY = 'smax_ai_agent_conversation_id_v1';
const AI_AGENT_POSITION_KEY = 'smax_ai_agent_launcher_position_v1';

function aiAgentUuid() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getConversationId() {
    let id = localStorage.getItem(AI_AGENT_CONVERSATION_KEY);
    if (!id) {
        id = aiAgentUuid();
        localStorage.setItem(AI_AGENT_CONVERSATION_KEY, id);
    }
    return id;
}

function loadLauncherPosition() {
    try {
        const value = JSON.parse(localStorage.getItem(AI_AGENT_POSITION_KEY) || 'null');
        if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
        return { x: value.x, y: value.y };
    } catch {
        return null;
    }
}

function saveLauncherPosition(position) {
    try {
        localStorage.setItem(AI_AGENT_POSITION_KEY, JSON.stringify(position));
    } catch (error) {
        console.warn('[AI Agent] Không thể lưu vị trí bong bóng:', error);
    }
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function formatTime(value) {
    try {
        return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    } catch {
        return '';
    }
}

function getPublicSupabaseConfig() {
    const cfg = window.SMAX_PUBLIC_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anonKey) {
        throw new Error('Chưa tìm thấy cấu hình Supabase của ứng dụng.');
    }
    return cfg;
}

function getPancakeUploadConfig() {
    const cfg = window.SMAX_PANCAKE_UPLOAD;
    if (!cfg || !cfg.endpoint || !cfg.apiKey) {
        throw new Error('Chưa tìm thấy cấu hình upload Pancake của ứng dụng.');
    }
    return cfg;
}

// Only a remote image URL from Pancake may be saved in AI requests.
function isPublicAiAgentImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
    } catch {
        return false;
    }
}

async function uploadAiAgentImageToPancake(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
        throw new Error('Tệp tải lên không phải hình ảnh.');
    }
    const { endpoint, apiKey } = getPancakeUploadConfig();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${endpoint}?api_key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        let detail = '';
        try { detail = await response.text(); } catch {}
        throw new Error(detail || `Pancake upload HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data?.success === false) {
        throw new Error(String(data?.message || data?.error || 'Pancake từ chối upload ảnh.'));
    }
    // Pancake responses may be flat or wrapped. Do not accept blob:/data: links.
    const imageUrl = [
        data?.content_url, data?.data?.content_url,
        data?.data?.url, data?.url
    ].find(isPublicAiAgentImageUrl);

    if (!imageUrl) {
        throw new Error('Pancake chưa trả link HTTPS công khai cho ảnh; không dùng link blob để gửi AI Agent.');
    }
    return imageUrl.trim();
}

function createAgentIcon() {
    return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3V5M8.5 4.5L9.4 6.1M15.5 4.5L14.6 6.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <rect x="4.5" y="6.5" width="15" height="12" rx="4" stroke="currentColor" stroke-width="1.8"/>
            <path d="M8.5 11H8.51M15.5 11H15.51" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M9 14.5C10.7 15.5 13.3 15.5 15 14.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            <path d="M4.5 12H2.8M21.2 12H19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`;
}

function createCloseIcon() {
    return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`;
}

function createAttachIcon() {
    return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21.4 11.6L12 21a6 6 0 01-8.5-8.5l10-10a4 4 0 115.7 5.7l-10 10a2 2 0 01-2.9-2.8l9.3-9.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
}


function createProductIcon() {
    return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7.5L12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M4.5 7.8L12 12l7.5-4.2M12 12v8.5" stroke="currentColor" stroke-width="1.8" strokke-linejoin="round"/>
        </svg>`;
}

function createSendIcon() {
    return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 3L10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M21 3L14 21L10 14L3 10L21 3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>`;
}

function initAiAgentChat() {
    console.info(`[AI Agent] history mode: ${AI_AGENT_HISTORY_MODE}`);
    if (document.getElementById('aiAgentLauncher')) return;

    const launcher = document.createElement('button');
    launcher.id = 'aiAgentLauncher';
    launcher.className = 'ai-agent-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Mở AI Agent');
    launcher.setAttribute('aria-controls', 'aiAgentPanel');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.title = 'AI Agent · Kéo để di chuyển';
    launcher.innerHTML = `${createAgentIcon()}<span class="ai-agent-launcher-dot" aria-hidden="true"></span>`;

    const panel = document.createElement('section');
    panel.id = 'aiAgentPanel';
    panel.className = 'ai-agent-panel';
    panel.setAttribute('aria-label', 'AI Agent');
    panel.innerHTML = `
        <div class="ai-agent-header">
            <div class="ai-agent-avatar">${createAgentIcon()}</div>
            <div class="ai-agent-header-copy">
                <strong>AI Agent</strong>
                <span><i class="ai-agent-online-dot" aria-hidden="true"></i>Sẵn sàng nhận yêu cầu thực thi</span>
            </div>
            <button type="button" class="ai-agent-close" id="aiAgentClose" aria-label="Đóng AI Agent">
                ${createCloseIcon()}
            </button>
        </div>
        <div class="ai-agent-messages" id="aiAgentMessages" aria-live="polite"></div>
        <form class="ai-agent-composer" id="aiAgentForm">
            <div class="ai-agent-request-type">
                <label for="aiAgentRequestType">Loại yêu cầu</label>
                <select id="aiAgentRequestType" aria-label="Loại yêu cầu AI Agent">
                    <option value="general">Yêu cầu chung</option>
                    <option value="post">Yêu cầu đăng bài</option>
                </select>
            </div>
            <div class="ai-agent-attachments" id="aiAgentAttachments" style="display:none;"></div>
            <div class="ai-agent-product-picker" id="aiAgentProductPicker" style="display:none;">
                <div class="ai-agent-product-search-row">
                    <input type="search" id="aiAgentProductSearch" class="ai-agent-product-search" placeholder="Tìm tên sản phẩm..." autocomplete="off">
                    <button type="button" class="ai-agent-product-close" id="aiAgentProductClose" aria-label="Đóng danh sách sản phẩm">×</button>
                </div>
                <div class="ai-agent-product-list" id="aiAgentProductList"></div>
            </div>
            <div class="ai-agent-input-shell">
                <button class="ai-agent-attach" id="aiAgentAttach" type="button" aria-label="Thêm hình ảnh" title="Thêm hình ảnh">
                    ${createAttachIcon()}
                </button>
                <button class="ai-agent-product-btn" id="aiAgentProductBtn" type="button" aria-label="Chọn sản phẩm" title="Chọn sản phẩm từ danh sách">
                    ${createProductIcon()}
                </button>
                <input type="file" id="aiAgentImageInput" accept="image/*" multiple hidden>
                <textarea
                    class="ai-agent-input"
                    id="aiAgentInput"
                    rows="1"
                    maxlength="12000"
                    placeholder="Nhập yêu cầu cho AI Agent..."
                    aria-label="Yêu cầu cho AI Agent"
                ></textarea>
                <button class="ai-agent-send" id="aiAgentSend" type="submit" aria-label="Gửi yêu cầu">
                    ${createSendIcon()}
                </button>
            </div>
            <div class="ai-agent-helper">
                <span id="aiAgentHelperText">Enter để gửi · Shift+Enter xuống dòng</span>
                <span id="aiAgentCharCount">0/12000</span>
            </div>
        </form>
    `;

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    const closeBtn = panel.querySelector('#aiAgentClose');
    const form = panel.querySelector('#aiAgentForm');
    const input = panel.querySelector('#aiAgentInput');
    const requestType = panel.querySelector('#aiAgentRequestType');
    const sendBtn = panel.querySelector('#aiAgentSend');
    const attachBtn = panel.querySelector('#aiAgentAttach');
    const imageInput = panel.querySelector('#aiAgentImageInput');
    const attachmentsEl = panel.querySelector('#aiAgentAttachments');

    const productBtn = panel.querySelector('#aiAgentProductBtn');
    const productPicker = panel.querySelector('#aiAgentProductPicker');
    const productSearch = panel.querySelector('#aiAgentProductSearch');
    const productList = panel.querySelector('#aiAgentProductList');
    const productClose = panel.querySelector('#aiAgentProductClose');
    const helperText = panel.querySelector('#aiAgentHelperText');
    const charCount = panel.querySelector('#aiAgentCharCount');
    const messages = panel.querySelector('#aiAgentMessages');

    let history = [];
    let historyGeneration = 0;
    let historyLoadState = 'idle';
    let historyLoadError = '';
    let historyPollTimer = null;
    let hasOlderHistory = false;
    let loadingOlderHistory = false;
    let isSending = false;
    let pendingAttachments = [];

    let productSearchTimer = null;
    let productSearchAbort = null;
    let dragState = null;
    let suppressLauncherClickUntil = 0;
    const launcherMargin = 8;

    const setLauncherPosition = (x, y, persist = false) => {
        const rect = launcher.getBoundingClientRect();
        const width = rect.width || 58;
        const height = rect.height || 58;
        const nextX = clampNumber(x, launcherMargin, window.innerWidth - width - launcherMargin);
        const nextY = clampNumber(y, launcherMargin, window.innerHeight - height - launcherMargin);

        launcher.style.left = nextX + 'px';
        launcher.style.top = nextY + 'px';
        launcher.style.right = 'auto';
        launcher.style.bottom = 'auto';

        if (persist) {
            saveLauncherPosition({ x: Math.round(nextX), y: Math.round(nextY) });
        }
        return { x: nextX, y: nextY };
    };

    const positionPanelNearLauncher = () => {
        if (!panel.classList.contains('is-open')) return;

        const launcherRect = launcher.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const gap = 12;
        const margin = 10;
        const panelWidth = panelRect.width;
        const panelHeight = panelRect.height;

        let left = launcherRect.left;
        if (launcherRect.left + panelWidth > window.innerWidth - margin) {
            left = launcherRect.right - panelWidth;
        }
        left = clampNumber(left, margin, window.innerWidth - panelWidth - margin);

        let top;
        const roomAbove = launcherRect.top - gap - margin;
        const roomBelow = window.innerHeight - launcherRect.bottom - gap - margin;

        if (roomAbove >= panelHeight) {
            top = launcherRect.top - panelHeight - gap;
            panel.style.transformOrigin = launcherRect.left > window.innerWidth / 2 ? 'bottom right' : 'bottom left';
        } else if (roomBelow >= panelHeight) {
            top = launcherRect.bottom + gap;
            panel.style.transformOrigin = launcherRect.left > window.innerWidth / 2 ? 'top right' : 'top left';
        } else {
            top = launcherRect.top + (launcherRect.height / 2) - (panelHeight / 2);
            panel.style.transformOrigin = launcherRect.left > window.innerWidth / 2 ? 'center right' : 'center left';
        }

        top = clampNumber(top, margin, window.innerHeight - panelHeight - margin);
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    };

    const savedLauncherPosition = loadLauncherPosition();
    if (savedLauncherPosition) {
        requestAnimationFrame(() => {
            setLauncherPosition(savedLauncherPosition.x, savedLauncherPosition.y, false);
        });
    }

    launcher.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        const rect = launcher.getBoundingClientRect();
        dragState = {
            pointerId: event.pointerId,
            startPointerX: event.clientX,
            startPointerY: event.clientY,
            startX: rect.left,
            startY: rect.top,
            moved: false
        };

        launcher.classList.add('is-dragging');
        try { launcher.setPointerCapture(event.pointerId); } catch {}
        event.preventDefault();
    });

    launcher.addEventListener('pointermove', (event) => {
        if (!dragState || event.pointerId !== dragState.pointerId) return;

        const dx = event.clientX - dragState.startPointerX;
        const dy = event.clientY - dragState.startPointerY;

        if (!dragState.moved && Math.hypot(dx, dy) >= 4) {
            dragState.moved = true;
        }
        if (!dragState.moved) return;

        setLauncherPosition(dragState.startX + dx, dragState.startY + dy, false);
        positionPanelNearLauncher();
        event.preventDefault();
    });

    const finishLauncherDrag = (event) => {
        if (!dragState || event.pointerId !== dragState.pointerId) return;

        const wasMoved = dragState.moved;
        dragState = null;
        launcher.classList.remove('is-dragging');

        try { launcher.releasePointerCapture(event.pointerId); } catch {}

        if (wasMoved) {
            const rect = launcher.getBoundingClientRect();
            setLauncherPosition(rect.left, rect.top, true);
            positionPanelNearLauncher();
            suppressLauncherClickUntil = Date.now() + 350;
            event.preventDefault();
        }
    };

    launcher.addEventListener('pointerup', finishLauncherDrag);
    launcher.addEventListener('pointercancel', finishLauncherDrag);

    window.addEventListener('resize', () => {
        const rect = launcher.getBoundingClientRect();
        if (launcher.style.left || launcher.style.top) {
            setLauncherPosition(rect.left, rect.top, true);
        }
        positionPanelNearLauncher();
    });

    const updateComposerState = () => {
        const hasUploading = pendingAttachments.some(item => item.status === 'uploading');
        const hasFailed = pendingAttachments.some(item =>
            item.status === 'error' || (item.status === 'done' && !isPublicAiAgentImageUrl(item.url)));
        sendBtn.disabled = isSending || hasUploading || hasFailed;
        attachBtn.disabled = isSending || pendingAttachments.length >= 5;
        productBtn.disabled = isSending;
        requestType.disabled = isSending;

        if (hasUploading) {
            helperText.textContent = 'Đang upload ảnh lên Pancake...';
        } else if (hasFailed) {
            helperText.textContent = 'Có ảnh upload lỗi · Xóa ảnh lỗi hoặc chọn lại';
        } else if (pendingAttachments.length > 0) {
            helperText.textContent = `${pendingAttachments.length} ảnh đã sẵn sàng · Enter để gửi`;
        } else {
            helperText.textContent = 'Ctrl+V để dán ảnh · Enter để gửi';
        }
    };

    const revokePendingPreview = (item) => {
        if (item?.previewUrl && item.previewUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(item.previewUrl); } catch {}
            item.previewUrl = '';
        }
    };

    const renderPendingAttachments = () => {
        attachmentsEl.innerHTML = '';
        attachmentsEl.style.display = pendingAttachments.length ? 'flex' : 'none';

        pendingAttachments.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'ai-agent-attachment-card';

            const img = document.createElement('img');
            // Before upload completes use the temporary blob preview; afterwards
            // show the actual Pancake URL so Copy Image Address is public.
            const uploaded = item.status === 'done' && isPublicAiAgentImageUrl(item.url);
            img.src = uploaded ? item.url : (item.previewUrl || '');
            img.alt = item.fileName || 'Ảnh đính kèm';
            if (uploaded) img.title = 'Ảnh trên Pancake — mở ảnh để lấy link trực tiếp';

            const status = document.createElement('div');
            status.className = 'ai-agent-attachment-status ' + (
                item.status === 'done' ? 'is-done' :
                item.status === 'error' ? 'is-error' : 'is-uploading'
            );
            status.textContent =
                item.status === 'done' ? 'Đã upload' :
                item.status === 'error' ? 'Lỗi upload' : 'Đang upload...';

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'ai-agent-attachment-remove';
            remove.setAttribute('aria-label', 'Xóa ảnh');
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                const current = pendingAttachments.find(x => x.id === item.id);
                revokePendingPreview(current);
                pendingAttachments = pendingAttachments.filter(x => x.id !== item.id);
                renderPendingAttachments();
            });

            if (uploaded) {
                const link = document.createElement('a');
                link.href = item.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.title = 'Mở ảnh Pancake trực tiếp';
                link.appendChild(img);
                card.append(link, status, remove);
            } else {
                card.append(img, status, remove);
            }
            attachmentsEl.appendChild(card);
        });

        updateComposerState();
    };

    const uploadPendingAttachment = async (item) => {
        item.status = 'uploading';
        item.error = '';
        renderPendingAttachments();

        try {
            const imageUrl = await uploadAiAgentImageToPancake(item.file);
            // The user may have removed the attachment while upload was running.
            if (pendingAttachments.includes(item)) {
                item.url = imageUrl;
                item.status = 'done';
            }
            // Once Pancake confirms the permanent URL, discard the local blob.
            revokePendingPreview(item);
        } catch (error) {
            console.error('[AI Agent] Upload ảnh Pancake thất bại:', error);
            item.status = 'error';
            item.error = error?.message || 'Upload ảnh thất bại';
        } finally {
            renderPendingAttachments();
        }
    };

    attachBtn.addEventListener('click', () => {
        if (!attachBtn.disabled) imageInput.click();
    });


    const queueImageFiles = async (files) => {
        const imageFiles = Array.from(files || []).filter(file => file && String(file.type || '').startsWith('image/'));
        if (!imageFiles.length) return;

        const slots = Math.max(0, 5 - pendingAttachments.length);
        const selected = imageFiles.slice(0, slots);
        if (!selected.length) {
            helperText.textContent = 'Tối đa 5 ảnh cho mỗi yêu cầu.';
            return;
        }

        const newItems = selected.map((file, index) => ({
            id: aiAgentUuid(),
            file,
            fileName: file.name || `clipboard-image-${Date.now()}-${index + 1}.png`,
            previewUrl: URL.createObjectURL(file),
            url: '',
            status: 'uploading',
            error: ''
        }));

        pendingAttachments.push(...newItems);
        renderPendingAttachments();
        await Promise.all(newItems.map(uploadPendingAttachment));
    };

    imageInput.addEventListener('change', async () => {
        const files = Array.from(imageInput.files || []);
        imageInput.value = '';
        await queueImageFiles(files);
    });

    input.addEventListener('paste', async (event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageFiles = items
            .filter(item => String(item.type || '').startsWith('image/'))
            .map(item => item.getAsFile())
            .filter(Boolean);

        if (!imageFiles.length) return;
        event.preventDefault();
        await queueImageFiles(imageFiles);
        input.focus();
    });

    const setProductPickerOpen = (open) => {
        productPicker.style.display = open ? 'block' : 'none';
        productBtn.classList.toggle('is-active', open);
        if (open) {
            productSearch.value = '';
            searchProducts('');
            setTimeout(() => productSearch.focus(), 20);
        } else {
            if (productSearchAbort) productSearchAbort.abort();
            productSearchAbort = null;
            productSearch.value = '';
        }
    };

    const renderProductChoices = (products, message = '') => {
        productList.innerHTML = '';
        if (message) {
            const empty = document.createElement('div');
            empty.className = 'ai-agent-product-empty';
            empty.textContent = message;
            productList.appendChild(empty);
            return;
        }

        if (!Array.isArray(products) || products.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ai-agent-product-empty';
            empty.textContent = 'Không tìm thấy sản phẩm.';
            productList.appendChild(empty);
            return;
        }

        products.forEach((product) => {
            const name = String(product?.name || '').trim();
            if (!name) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ai-agent-product-option';
            button.title = `Chèn sản phẩm: ${name}`;

            const imageUrl = String(
                product?.image_url ||
                product?.pancake_variations?.find(v => Array.isArray(v?.images) && v.images[0])?.images?.[0] ||
                ''
            ).trim();

            const thumbWrap = document.createElement('span');
            thumbWrap.className = 'ai-agent-product-thumb-wrap';

            if (imageUrl) {
                const thumb = document.createElement('img');
                thumb.className = 'ai-agent-product-thumb';
                thumb.src = imageUrl;
                thumb.alt = name;
                thumb.loading = 'lazy';
                thumb.referrerPolicy = 'no-referrer';
                thumb.addEventListener('error', () => {
                    thumb.remove();
                    thumbWrap.classList.add('is-empty');
                    thumbWrap.textContent = '📦';
                });
                thumbWrap.appendChild(thumb);
            } else {
                thumbWrap.classList.add('is-empty');
                thumbWrap.textContent = '📦';
            }

            const nameEl = document.createElement('span');
            nameEl.className = 'ai-agent-product-name';
            nameEl.textContent = name;

            button.append(thumbWrap, nameEl);
            button.addEventListener('click', () => {
                const line = `Sản phẩm: ${name}`;
                const current = input.value.trimEnd();
                input.value = current ? `${current}\n${line}` : line;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                setProductPickerOpen(false);
                input.focus();
            });
            productList.appendChild(button);
        });
    };

    const searchProducts = async (term = '') => {
        const query = String(term || '').trim();
        if (productSearchAbort) productSearchAbort.abort();
        productSearchAbort = new AbortController();

        renderProductChoices([], 'Đang tải danh sách sản phẩm...');
        try {
            const { url, anonKey } = getPublicSupabaseConfig();
            const endpoint = new URL(`${url}/rest/v1/pancake_products`);
            endpoint.searchParams.set('select', 'id,name,image_url,pancake_variations(images)');
            endpoint.searchParams.set('order', 'created_at.desc');
            endpoint.searchParams.set('limit', '40');
            if (query) endpoint.searchParams.set('name', `ilike.*${query}*`);

            const response = await fetch(endpoint.toString(), {
                method: 'GET',
                headers: {
                    apikey: anonKey,
                    Authorization: `Bearer ${anonKey}`,
                    Accept: 'application/json'
                },
                signal: productSearchAbort.signal,
                cache: 'no-store'
            });

            if (!response.ok) {
                let detail = '';
                try { detail = await response.text(); } catch {}
                throw new Error(detail || `Supabase trả về HTTP ${response.status}`);
            }

            const products = await response.json();
            renderProductChoices(products);
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('[AI Agent] Không tải được danh sách sản phẩm:', error);
            renderProductChoices([], 'Không tải được danh sách sản phẩm.');
        }
    };

    productBtn.addEventListener('click', () => {
        const isOpen = productPicker.style.display !== 'none';
        setProductPickerOpen(!isOpen);
    });

    productClose.addEventListener('click', () => setProductPickerOpen(false));

    productSearch.addEventListener('input', () => {
        clearTimeout(productSearchTimer);
        productSearchTimer = setTimeout(() => searchProducts(productSearch.value), 250);
    });

    const getStatusView = (rawStatus) => {
        const statusValue = String(rawStatus || 'pending').toLowerCase();
        const statusMap = {
            sending: ['sending', 'Đang gửi...'],
            pending: ['queued', 'Đã vào hàng đợi'],
            processing: ['processing', 'Đang thực thi...'],
            completed: ['completed', 'Hoàn thành'],
            failed: ['error', 'Thất bại'],
            cancelled: ['error', 'Đã hủy'],
            error: ['error', 'Gửi lỗi']
        };
        return statusMap[statusValue] || ['queued', statusValue];
    };

    const render = ({ forceScrollToBottom = false } = {}) => {
        // Preserve the user's reading position when history polling refreshes the DOM.
        // On mobile, forcing scrollTop on every 4s poll made it impossible to scroll up.
        const previousScrollTop = messages.scrollTop;
        const distanceFromBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
        const wasNearBottom = distanceFromBottom <= 72;

        messages.innerHTML = '';

        const note = document.createElement('div');
        note.className = 'ai-agent-empty-note';
        if (historyLoadState === 'loading' && history.length === 0) {
            note.textContent = 'Đang tải lịch sử yêu cầu từ Supabase...';
        } else if (historyLoadState === 'error' && history.length === 0) {
            note.textContent = historyLoadError || 'Không tải được lịch sử từ Supabase.';
        } else if (history.length > 0) {
            note.textContent = `Đã tải ${history.length} yêu cầu từ Supabase.`;
        } else {
            note.textContent = 'Chưa có yêu cầu nào trong Supabase.';
        }
        messages.appendChild(note);
        if (hasOlderHistory || loadingOlderHistory) {
            const moreButton = document.createElement('button');
            moreButton.type = 'button';
            moreButton.className = 'ai-agent-load-more';
            moreButton.textContent = loadingOlderHistory ? 'Đang tải...' : 'Tải thêm 20 yêu cầu cũ';
            moreButton.disabled = loadingOlderHistory;
            moreButton.style.cssText = 'display:block;margin:8px auto 12px;padding:9px 16px;border:1px solid #7954ef;border-radius:18px;background:#fff;color:#6333d8;font-weight:600;cursor:pointer';
            moreButton.addEventListener('click', loadOlderHistory);
            messages.appendChild(moreButton);
        }

        history.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'ai-agent-message-row';

            const bubble = document.createElement('div');
            bubble.className = 'ai-agent-message';
            bubble.textContent = item.text || '';
            if (item.requestType === 'post') {
                const label = document.createElement('span');
                label.className = 'ai-agent-post-label';
                label.textContent = 'Yêu cầu đăng bài';
                bubble.prepend(label);
            }

            const meta = document.createElement('div');
            meta.className = 'ai-agent-message-meta';

            const time = document.createElement('span');
            time.textContent = formatTime(item.createdAt);

            const status = document.createElement('span');
            const [statusClass, statusText] = getStatusView(item.status);
            status.className = `ai-agent-status is-${statusClass}`;
            status.textContent = statusText;

            meta.append(time, status);
            row.append(bubble);

            if (Array.isArray(item.imageUrls) && item.imageUrls.length > 0) {
                const imageGrid = document.createElement('div');
                imageGrid.className = 'ai-agent-message-images';
                item.imageUrls.forEach((url) => {
                    const link = document.createElement('a');
                    link.href = url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.title = 'Mở ảnh Pancake';

                    const image = document.createElement('img');
                    image.src = url;
                    image.alt = 'Ảnh yêu cầu AI Agent';
                    link.appendChild(image);
                    imageGrid.appendChild(link);
                });
                row.appendChild(imageGrid);
            }

            row.append(meta);
            messages.appendChild(row);

            const responseText = item.responseText || item.errorText || '';
            if (responseText) {
                const responseRow = document.createElement('div');
                responseRow.className = 'ai-agent-response-row';

                const responseBubble = document.createElement('div');
                responseBubble.className = 'ai-agent-response' + (item.errorText ? ' is-error' : '');
                responseBubble.textContent = responseText;

                const responseMeta = document.createElement('div');
                responseMeta.className = 'ai-agent-response-meta';
                responseMeta.textContent = item.errorText ? 'AI Agent · Lỗi' : 'AI Agent';

                responseRow.append(responseBubble, responseMeta);
                messages.appendChild(responseRow);
            }
        });

        if (forceScrollToBottom || wasNearBottom) {
            messages.scrollTop = messages.scrollHeight;
        } else {
            // New history entries are appended at the bottom, so keeping the same
            // scrollTop preserves the item the user is currently reading.
            messages.scrollTop = previousScrollTop;
        }
    };

    const mapHistoryRow = (row, type) => ({
        id: row.id,
        clientRequestId: row.client_request_id,
        text: row.metadata?.original_text || row.request_text || '',
        requestType: type,
        createdAt: row.created_at,
        status: row.status || 'pending',
        responseText: row.response_text || '',
        errorText: row.error_text || '',
        imageUrls: Array.isArray(row.metadata?.image_urls)
            ? row.metadata.image_urls.filter(isPublicAiAgentImageUrl) : [],
        metadata: row.metadata || {},
        updatedAt: row.updated_at
    });

    const mergeHistory = (items) => {
        // A locally submitted request first has clientRequestId only; Supabase later adds id.
        // Match by clientRequestId first so the optimistic bubble is replaced, not duplicated.
        const byKey = new Map();
        for (const item of [...history, ...items]) {
            const key = item.clientRequestId
                ? 'client:' + item.clientRequestId
                : 'server:' + item.id;
            const previous = byKey.get(key);
            if (!previous || item.id || !previous.id) byKey.set(key, item);
        }
        history = [...byKey.values()].sort((a, b) =>
            new Date(a.createdAt) - new Date(b.createdAt) ||
            String(a.id || a.clientRequestId).localeCompare(String(b.id || b.clientRequestId)));
    };

    const loadHistoryFromSupabase = async ({ silent = false } = {}) => {
        const generation = historyGeneration;
        const type = requestType.value;
        const table = type === 'post' ? AI_POST_TABLE : AI_AGENT_TABLE;
        if (!silent) {
            historyLoadState = 'loading';
            historyLoadError = '';
            render();
        }

        try {
            const { url, anonKey } = getPublicSupabaseConfig();
            const select = [
                'id',
                'client_request_id',
                'conversation_id',
                'request_text',
                'status',
                'response_text',
                'error_text',
                'metadata',
                'created_at',
                'updated_at'
            ].join(',');
            const historyUrl = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.desc&limit=${AI_AGENT_HISTORY_LIMIT}`;

            const response = await fetch(historyUrl, {
                method: 'GET',
                headers: {
                    apikey: anonKey,
                    Authorization: `Bearer ${anonKey}`,
                    Accept: 'application/json'
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                let detail = '';
                try { detail = await response.text(); } catch {}
                throw new Error(detail || `Supabase trả về HTTP ${response.status}`);
            }

            const rows = await response.json();
            if (generation !== historyGeneration) return false;
            const historyRows = Array.isArray(rows) ? rows : [];
            mergeHistory(historyRows.map(row => mapHistoryRow(row, type)));
            if (historyRows.length === AI_AGENT_HISTORY_LIMIT && history.length <= AI_AGENT_HISTORY_LIMIT) hasOlderHistory = true;
            historyLoadState = 'loaded';
            historyLoadError = '';
            render();
            return true;
        } catch (error) {
            if (generation !== historyGeneration) return false;
            console.error('[AI Agent] Không tải được lịch sử Supabase:', error);
            historyLoadState = 'error';
            historyLoadError = type === 'post' ? 'Chưa tải được yêu cầu đăng bài. Hãy kiểm tra bảng ai_post_requests và chạy file create_ai_post_requests_table.sql nếu chưa tạo bảng.' : 'Không tải được lịch sử từ Supabase. Hãy chạy SQL cập nhật quyền đọc AI Agent.';
            render();
            return false;
        }
    };

    const loadOlderHistory = async () => {
        if (loadingOlderHistory || !history.length) return;
        const generation = historyGeneration;
        const type = requestType.value;
        const table = type === 'post' ? AI_POST_TABLE : AI_AGENT_TABLE;
        loadingOlderHistory = true;
        const previousHeight = messages.scrollHeight;
        const previousTop = messages.scrollTop;
        render();
        try {
            const { url, anonKey } = getPublicSupabaseConfig();
            const oldest = history[0];
            const select = 'id,client_request_id,conversation_id,request_text,status,response_text,error_text,metadata,created_at,updated_at';
            const historyUrl = url + '/rest/v1/' + table +
                '?select=' + encodeURIComponent(select) +
                '&created_at=lt.' + encodeURIComponent(oldest.createdAt) +
                '&order=created_at.desc&limit=' + AI_AGENT_HISTORY_LIMIT;
            const response = await fetch(historyUrl, {
                method: 'GET',
                headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey, Accept: 'application/json' },
                cache: 'no-store'
            });
            if (!response.ok) throw new Error('Supabase HTTP ' + response.status);
            const rows = await response.json();
            if (generation !== historyGeneration) return;
            if (!Array.isArray(rows)) throw new Error('Dữ liệu lịch sử không hợp lệ');
            mergeHistory(rows.map(row => mapHistoryRow(row, type)));
            hasOlderHistory = rows.length === AI_AGENT_HISTORY_LIMIT;
            loadingOlderHistory = false;
            render();
            messages.scrollTop = previousTop + messages.scrollHeight - previousHeight;
        } catch (error) {
            if (generation !== historyGeneration) return;
            console.error('[AI Agent] Không tải được lịch sử cũ:', error);
            loadingOlderHistory = false;
            render();
            alert('Không tải được lịch sử cũ. Vui lòng thử lại.');
        }
    };

    const startHistoryPolling = () => {
        if (historyPollTimer) return;
        historyPollTimer = window.setInterval(() => {
            if (panel.classList.contains('is-open') && !isSending) {
                loadHistoryFromSupabase({ silent: true });
            }
        }, 4000);
    };

    const stopHistoryPolling = () => {
        if (!historyPollTimer) return;
        clearInterval(historyPollTimer);
        historyPollTimer = null;
    };

    const openPanel = () => {
        panel.classList.add('is-open');
        launcher.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(positionPanelNearLauncher);
        setTimeout(() => input.focus(), 30);
        loadHistoryFromSupabase();
        startHistoryPolling();
    };

    const closePanel = () => {
        panel.classList.remove('is-open');
        launcher.setAttribute('aria-expanded', 'false');
        stopHistoryPolling();
    };

    launcher.addEventListener('click', (event) => {
        if (Date.now() < suppressLauncherClickUntil) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (panel.classList.contains('is-open')) closePanel();
        else openPanel();
    });

    closeBtn.addEventListener('click', closePanel);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel.classList.contains('is-open')) {
            closePanel();
        }
    });

    input.addEventListener('input', () => {
        charCount.textContent = `${input.value.length}/12000`;
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    });
    requestType.addEventListener('change', () => {
        input.placeholder = requestType.value === 'post'
            ? 'Nhập yêu cầu đăng bài: sản phẩm, kênh đăng, nội dung, thời gian...'
            : 'Nhập yêu cầu cho AI Agent...';
        input.focus();
        historyGeneration++;
        history = [];
        hasOlderHistory = false;
        loadingOlderHistory = false;
        void loadHistoryFromSupabase();
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const hasReadyImage = pendingAttachments.some(item =>
                item.status === 'done' && isPublicAiAgentImageUrl(item.url));
            if (!isSending && (input.value.trim() || hasReadyImage)) form.requestSubmit();
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isSending) return;

        const requestText = input.value.trim();
        const submittedType = requestType.value;
        const readyImageUrls = pendingAttachments
            .filter(item => item.status === 'done' && isPublicAiAgentImageUrl(item.url))
            .map(item => item.url);
        // Do not persist temporary browser-local blob: links in either queue.
        if (pendingAttachments.some(item => item.status === 'done' && !isPublicAiAgentImageUrl(item.url))) {
            alert('Ảnh chưa có link Pancake hợp lệ. Hãy xóa ảnh lỗi và upload lại.');
            return;
        }

        if (!requestText && readyImageUrls.length === 0) return;
        if (pendingAttachments.some(item => item.status === 'uploading' || item.status === 'error')) return;

        const requestTextForAgent = [
            requestText,
            readyImageUrls.length ? 'Hình ảnh Pancake:\n' + readyImageUrls.join('\n') : ''
        ].filter(Boolean).join('\n\n');

        if (requestTextForAgent.length > 12000) {
            alert('Nội dung kèm link ảnh vượt quá giới hạn 12.000 ký tự. Vui lòng rút ngắn nội dung.');
            return;
        }

        const clientRequestId = aiAgentUuid();
        const createdAt = new Date().toISOString();
        const localItem = {
            clientRequestId,
            text: requestText || '[Hình ảnh]',
            requestType: submittedType,
            createdAt,
            status: 'sending',
            imageUrls: readyImageUrls
        };

        history.push(localItem);
        input.value = '';
        input.style.height = 'auto';
        charCount.textContent = '0/12000';
        isSending = true;
        updateComposerState();
        render({ forceScrollToBottom: true });

        try {
            const { url, anonKey } = getPublicSupabaseConfig();
            const payload = {
                request_text: requestTextForAgent,
                conversation_id: getConversationId(),
                client_request_id: clientRequestId,
                source: 'smax-chat-manager',
                metadata: {
                    ui: 'ai-agent-bubble',
                    page_path: window.location.pathname,
                    page_hash: window.location.hash || '',
                    original_text: requestText,
                    request_type: submittedType,
                    image_urls: readyImageUrls,
                    attachments: readyImageUrls.map(url => ({ type: 'image', url }))
                }
            };
            const table = submittedType === 'post' ? AI_POST_TABLE : AI_AGENT_TABLE;
            const response = await fetch(`${url}/rest/v1/${table}`, {
                method: 'POST',
                headers: {
                    apikey: anonKey,
                    Authorization: `Bearer ${anonKey}`,
                    'x-client-info': `smax-ai-agent/${getConversationId()}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let detail = '';
                try { detail = await response.text(); } catch {}
                throw new Error(detail || `Supabase trả về HTTP ${response.status}`);
            }

            localItem.status = 'pending';
            pendingAttachments.forEach(revokePendingPreview);
            pendingAttachments = [];
            renderPendingAttachments();
            const loaded = await loadHistoryFromSupabase({ silent: true });
            if (!loaded) render();
        } catch (error) {
            console.error('[AI Agent] Gửi yêu cầu thất bại:', error);
            localItem.status = 'error';
            localItem.errorText = error?.message || 'Không gửi được yêu cầu lên Supabase.';
            render();
        } finally {
            isSending = false;
            updateComposerState();
            input.focus();
        }
    });

    renderPendingAttachments();
    render();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiAgentChat, { once: true });
} else {
    initAiAgentChat();
}
