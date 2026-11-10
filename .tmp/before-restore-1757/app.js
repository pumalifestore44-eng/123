import { setupSpxTracking } from './spx-tracking.js';
import { buildMultiImagePayload, getMessageTypeForPagePid, isImageAttachment, formatMessageText } from './messagePayloadUtils.mjs';
import { cacheThreads, readCachedThreads, cacheMessages, readCachedMessages, downloadOfflineData } from './offline-message-cache.js';

const recentOrdersForEdit = [];

// Polyfill to bypass Chrome Extension CSP blocking inline 'onclick' event handlers.
// It intercepts click events in the capturing phase, parses the 'onclick' attribute,
// and executes the corresponding function on the window object.
document.addEventListener('click', function(event) {
    let target = event.target;
    while (target && target !== document) {
        if (target.hasAttribute && target.hasAttribute('onclick')) {
            const interactive = event.target.closest && event.target.closest('a[href],button,textarea,input,select,summary,[role="button"],[role="link"]');
            if (interactive && interactive !== target && target.contains(interactive)) {
                target = target.parentNode;
                continue;
            }

            const onclickStr = target.getAttribute('onclick');
            
            // Matches any function call like func(args) or window.func(args)
            const match = onclickStr.match(/([\w\.]+)\((.*?)\)/);
            if (match) {
                const funcPath = match[1];
                const argsStr = match[2];
                
                let func = window;
                let context = window;
                const pathParts = funcPath.replace('window.', '').split('.');
                for (const part of pathParts) {
                    if (func && func[part] !== undefined) {
                        context = func;
                        func = func[part];
                    } else {
                        func = undefined;
                        break;
                    }
                }
                
                if (typeof func === 'function') {
                    const args = [];
                    if (argsStr.trim()) {
                        // Regex to split arguments by comma, ignoring commas inside single or double quotes
                        const rawArgs = argsStr.split(/,(?=(?:(?:[^']*'){2})*[^']*$)(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                        for (let rawArg of rawArgs) {
                            rawArg = rawArg.trim();
                            if (rawArg === 'event') {
                                args.push(event);
                            } else if (rawArg === 'this') {
                                args.push(target);
                            } else if (rawArg.startsWith('this.')) {
                                const prop = rawArg.substring(5);
                                args.push(target[prop]);
                            } else if ((rawArg.startsWith("'") && rawArg.endsWith("'")) || (rawArg.startsWith('"') && rawArg.endsWith('"'))) {
                                args.push(rawArg.substring(1, rawArg.length - 1));
                            } else if (!isNaN(rawArg) && rawArg !== '') {
                                args.push(Number(rawArg));
                            } else {
                                if (rawArg === 'true') args.push(true);
                                else if (rawArg === 'false') args.push(false);
                                else if (rawArg === 'null') args.push(null);
                                else args.push(rawArg);
                            }
                        }
                    }
                    
                    event.preventDefault();
                    event.stopPropagation();
                    
                    func.apply(context === window ? null : context, args);
                    return;
                }
            }
        }
        target = target.parentNode;
    }
}, true); // Capture phase is critical to intercept before chrome blocks/ignores

document.addEventListener('click', function(event) {
    let node = event.target;
    while (node && node.nodeType !== 1) node = node.parentNode;
    if (node && node.closest && node.closest('.jt-waybill-link')) {
        event.stopPropagation();
    }
}, true);

function closeVisibleModals() {
    const modalSelectors = '[id$="Modal"], [id$="modal"]';
    const modals = Array.from(document.querySelectorAll(modalSelectors));
    for (const modal of modals) {
        const style = window.getComputedStyle(modal);
        if (style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) !== 0) {
            modal.style.display = 'none';
            return true;
        }
    }
    return false;
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
        if (closeVisibleModals()) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
}, true);

// Credentials & Connection Configuration
// Legacy (existing) Supabase where data was previously stored
const LEGACY_SUPABASE_URL = 'https://ufnamlpgosesmscnlzfz.supabase.co';
const LEGACY_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbmFtbHBnb3Nlc21zY25semZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTg5MTQsImV4cCI6MjA4Mzk5NDkxNH0.t-pTrUabgpVw1oEtr3oqdsv5rNIepi8hbWuroto-MJw';

// Display Supabase (new): reads should come from this database
const SUPABASE_URL = 'https://zltgekgggxatdcpdqqsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsdGdla2dnZ3hhdGRjcGRxcXNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDY2OTcsImV4cCI6MjEwMDM4MjY5N30.39k7BOff9KY2JfV6ffwLcQ7q4Xh7g0ix9QyujnL9G0E';
window.SMAX_PUBLIC_SUPABASE = Object.freeze({ url: SUPABASE_URL, anonKey: SUPABASE_KEY });
window.desktopOrderBridgeExecute = async function(raw) { const cmd=typeof raw==='string'?JSON.parse(raw):raw; if(cmd?.action==='update_product_image') return await desktopUpdateProductImage(cmd); if(cmd?.action==='create_product_add_latest_order') return await desktopCreateProductAddLatestOrder(cmd); if(cmd?.action==='add_existing_product') return await desktopAddExistingProduct(cmd); if(cmd?.action==='get_thread_messages') return await desktopGetThreadMessages(cmd); if(cmd?.action==='get_unanswered_threads') return await desktopGetUnansweredThreads(cmd); if(cmd?.action==='upload_create_add_confirm') return await desktopUploadCreateAddConfirm(cmd); if(cmd?.action==='ensure_variation') return await desktopEnsureVariation(cmd); if(cmd?.action==='add_order_item') return await desktopAddOrderItem(cmd); return {ok:false,error:'unsupported action'}; };
// Wrap global fetch to replicate write requests to the legacy Supabase as well.
// Reads will continue to use `SUPABASE_URL` (the display DB). Mutations (POST/PATCH/PUT/DELETE)
// sent to `SUPABASE_URL` will also be forwarded to `LEGACY_SUPABASE_URL` with legacy keys.
if (typeof window !== 'undefined' && window.fetch) {
    const __origFetch = window.fetch.bind(window);
    window.fetch = async function(input, init = {}) {
        const reqUrl = (typeof input === 'string') ? input : (input && input.url) || '';
        const method = (init && init.method) ? init.method.toUpperCase() : 'GET';

        // Safety: prevent accidental insertion of explicit `id` into chatbot_images
        try {
            if (reqUrl && reqUrl.startsWith(SUPABASE_URL) && method === 'POST' && reqUrl.indexOf('/rest/v1/chatbot_images') !== -1) {
                if (init && init.body) {
                    try {
                        // If body is JSON string, parse and remove id
                        if (typeof init.body === 'string') {
                            const parsedBody = JSON.parse(init.body);
                            if (parsedBody && parsedBody.id !== undefined) {
                                delete parsedBody.id;
                                init.body = JSON.stringify(parsedBody);
                            }
                        }
                    } catch (e) {
                        // ignore parse errors (non-JSON bodies)
                    }
                }
            }
        } catch (e) {
            console.warn('Fetch body sanitize error', e);
        }

        // Perform primary request first (to display Supabase)
        const primaryResp = await __origFetch(input, init);

        // If primary failed and this looks like a nested-select to Supabase,
        // attempt a client-side fallback by fetching parent rows and related rows separately,
        // then return a synthetic Response so existing code calling fetch().json() still works.
        try {
            if (reqUrl && reqUrl.startsWith(SUPABASE_URL) && method === 'GET' && primaryResp && !primaryResp.ok) {
                // parse URL and query params
                let parsed;
                try {
                    parsed = new URL(reqUrl);
                } catch (e) {
                    // fallback: if reqUrl lacks origin, prepend SUPABASE_URL
                    parsed = new URL(reqUrl, SUPABASE_URL);
                }
                const params = parsed.searchParams;
                const select = params.get('select') || '';

                // Helper to build synthetic Response from JS object
                const makeResponse = (obj) => new Response(JSON.stringify(obj), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });

                // Fallback for pancake_products with pancake_variations
                if (parsed.pathname.includes('/rest/v1/pancake_products') && /pancake_variations\(/i.test(select)) {
                    // remove the nested relation from select
                    const cleanedSelect = select.replace(/,?\s*pancake_variations\([^)]*\)/i, '').replace(/^,|,$/g, '') || '*';
                    // build parent URL
                    const parentParams = new URLSearchParams(parsed.searchParams);
                    parentParams.set('select', cleanedSelect);
                    const parentUrl = `${parsed.origin}${parsed.pathname}?${parentParams.toString()}`;
                    const parentRes = await __origFetch(parentUrl, init);
                    let parents = [];
                    if (parentRes && parentRes.ok) parents = await parentRes.json();

                    // collect ids
                    const ids = (parents || []).map(p => p.id).filter(Boolean);
                    if (ids.length === 0) return makeResponse(parents);

                    // fetch related variations in one call
                    const relUrl = `${SUPABASE_URL}/rest/v1/pancake_variations?select=*&product_id=in.(${ids.map(encodeURIComponent).join(',')})`;
                    const relRes = await __origFetch(relUrl, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
                    const relRows = (relRes && relRes.ok) ? await relRes.json() : [];

                    const map = Object.create(null);
                    relRows.forEach(r => {
                        const k = r.product_id;
                        if (!map[k]) map[k] = [];
                        map[k].push(r);
                    });

                    const merged = (parents || []).map(p => Object.assign({}, p, { pancake_variations: map[p.id] || [] }));
                    return makeResponse(merged);
                }

                // Fallback for pancake_orders with items:pancake_order_items
                if (parsed.pathname.includes('/rest/v1/pancake_orders') && /pancake_order_items\(/i.test(select)) {
                    const cleanedSelect = select.replace(/,?\s*items:pancake_order_items\([^)]*\)/i, '').replace(/^,|,$/g, '') || '*';
                    const parentParams = new URLSearchParams(parsed.searchParams);
                    parentParams.set('select', cleanedSelect);
                    const parentUrl = `${parsed.origin}${parsed.pathname}?${parentParams.toString()}`;
                    const parentRes = await __origFetch(parentUrl, init);
                    let parents = [];
                    if (parentRes && parentRes.ok) parents = await parentRes.json();

                    const ids = (parents || []).map(p => p.id).filter(Boolean);
                    if (ids.length === 0) return makeResponse(parents);

                    const relUrl = `${SUPABASE_URL}/rest/v1/pancake_order_items?select=*&order_id=in.(${ids.map(encodeURIComponent).join(',')})`;
                    const relRes = await __origFetch(relUrl, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
                    const relRows = (relRes && relRes.ok) ? await relRes.json() : [];

                    const map = Object.create(null);
                    relRows.forEach(r => {
                        const k = r.order_id;
                        if (!map[k]) map[k] = [];
                        map[k].push(r);
                    });

                    const merged = (parents || []).map(p => Object.assign({}, p, { items: map[p.id] || [] }));
                    return makeResponse(merged);
                }
            }
        } catch (e) {
            console.warn('Nested-select fallback error', e);
        }

                    // If GET to SUPABASE_URL failed, try fallback to legacy SUPABASE
                    if (reqUrl && reqUrl.startsWith(SUPABASE_URL) && method === 'GET' && (!primaryResp || !primaryResp.ok) && LEGACY_SUPABASE_URL) {
                        try {
                            const legacyUrl = reqUrl.replace(SUPABASE_URL, LEGACY_SUPABASE_URL);
                            const legacyInit = Object.assign({}, init);
                            legacyInit.headers = Object.assign({}, legacyInit.headers || {});
                            legacyInit.headers['apikey'] = LEGACY_SUPABASE_KEY;
                            legacyInit.headers['Authorization'] = `Bearer ${LEGACY_SUPABASE_KEY}`;
                            const fallbackResp = await __origFetch(legacyUrl, legacyInit);
                            if (fallbackResp && fallbackResp.ok) return fallbackResp;
                        } catch (e) {
                            console.warn('Legacy Supabase fallback failed', e);
                        }
                    }

                    // If this was a mutating request to SUPABASE_URL, also mirror it to legacy DB (fire-and-forget)
                    try {
                        if (reqUrl && reqUrl.startsWith(SUPABASE_URL) && method !== 'GET' && LEGACY_SUPABASE_URL && !reqUrl.includes('/functions/v1/') && !reqUrl.includes('/rest/v1/ai_agent_requests')) {
                            const legacyUrl = reqUrl.replace(SUPABASE_URL, LEGACY_SUPABASE_URL);
                            const legacyInit = Object.assign({}, init);
                            legacyInit.headers = Object.assign({}, legacyInit.headers || {});
                            legacyInit.headers['apikey'] = LEGACY_SUPABASE_KEY;
                            legacyInit.headers['Authorization'] = `Bearer ${LEGACY_SUPABASE_KEY}`;
                            __origFetch(legacyUrl, legacyInit).catch(err => console.warn('Legacy Supabase sync failed', err));
                        }
                    } catch (e) {
                        console.warn('Error replicating to legacy Supabase', e);
                    }

                    return primaryResp;
    };
}
const SMAX_BIZ_ID = 'tuant2lqd';
const PANCAKE_API_KEY = '8477ff85ed5446be826044de9ff8869d'; // Pancake API key dùng để upload ảnh
window.SMAX_PANCAKE_UPLOAD = Object.freeze({ endpoint: 'https://pos.pancake.vn/api/v1/contents', apiKey: PANCAKE_API_KEY });
const SMAX_PAGE_IDS = ['fb1574281086218015', 'ig17841471719838606', 'ttw6622749003845042177', 'zlw266741166578791076'];
const PANCAKE_SHOP_ID = '1290216404';
let PANCAKE_ACCESS_TOKEN = '';

async function fetchPancakeTokenFromSupabase() {
    try {
        console.log('🔄 Syncing Pancake Token from Supabase...');
        const url = `${SUPABASE_URL}/rest/v1/token_pancake?select=*&limit=1`;
        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await res.json();
        if (data && data[0]) {
            const token = data[0].value || data[0].token || data[0].access_token;
            if (token) {
                PANCAKE_ACCESS_TOKEN = token;
                window.PANCAKE_ACCESS_TOKEN = token;
                console.log('✅ Pancake Token synced from Supabase successfully');
            }
        }
    } catch (err) {
        console.warn('❌ Fetch Pancake Token Error:', err);
    }
}

// Local Application State
let smaxToken = '';
let smaxThreads = [];
let activeThread = null;
let activeMessages = [];
let selectedPagePid = 'all';
let currentJtPrintOrderId = null;
let currentJtPrintCount = 0;
const linkedCustomersMap = new Map(); // fb_id -> external_conversation_link

async function loadLinkedCustomers() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?select=fb_id,external_conversation_link&external_conversation_link=not.is.null`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (res.ok) {
            const data = await res.json();
            linkedCustomersMap.clear();
            data.forEach(c => {
                if (c.fb_id && c.external_conversation_link) {
                    linkedCustomersMap.set(c.fb_id.toString(), c.external_conversation_link);
                }
            });
        }
    } catch (err) {
        console.warn('Lỗi tải danh sách khách hàng đã liên kết:', err);
    }
}

let currentSmaxFilterReply = null; // null = all, false = unreplied
let currentSmaxFilterSeen = null; // null = all, false = unseen
let currentSmaxSearch = '';
let currentSmaxAfter = '';
let isLoadingThreads = false;
let isLoadingMessages = false;
let quickReplies = [];
let spxWarehouses = [];
let editingQuickReplyId = null;
let dashboardOrdersPage = 0;
const DASHBOARD_ORDERS_LIMIT = 20;
let dashboardProductsPage = 0;
let dashboardCustomersPage = 0;
let pendingImageUrl = null;    // CDN URL sau khi upload xong
let pendingImageFile = null;   // File object đang chờ gửi
let pendingImageBlobUrl = null; // Blob URL local để preview
let threadOrdersMap = {}; // Map: tid -> [{display_id, status}]
const PRODUCTS_LIMIT = 15;
const CUSTOMERS_LIMIT = 15;

// Platforms SVG Icons Helper
const getPlatformIcon = (platform, size = 14) => {
    const cleanPid = (platform || '').toString().toLowerCase();
    
    // Phát hiện kênh Shopee
    if (cleanPid.includes('shopee')) {
        return `<img src="https://upload.wikimedia.org/wikipedia/commons/f/fe/Shopee.svg" style="width:${size}px; height:${size}px; object-fit:contain; vertical-align:middle; display:inline-block;" title="Shopee">`;
    }
    
    // Phát hiện kênh Lazada
    if (cleanPid.includes('lazada')) {
        return `<img src="https://img.icons8.com/color/48/lazada.png" style="width:${size}px; height:${size}px; object-fit:contain; vertical-align:middle; display:inline-block;" title="Lazada">`;
    }
    
    // Phát hiện TikTok
    if (cleanPid.startsWith('tt') || cleanPid.includes('tiktok') || cleanPid.includes('6622749003845042177')) {
        return `<img src="https://img.icons8.com/color/48/tiktok.png" style="width:${size}px; height:${size}px; object-fit:contain; vertical-align:middle; display:inline-block;" title="TikTok Shop">`;
    }
    
    // Phát hiện Instagram (Logo chính thức)
    if (cleanPid.startsWith('ig') || cleanPid.includes('17841471719838606')) {
        return `<img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png" style="width:${size}px; height:${size}px; object-fit:contain; vertical-align:middle; display:inline-block; border-radius:${Math.round(size*0.22)}px;" title="Instagram" alt="Instagram">`;
    }
    
    // Phát hiện Zalo
    if (cleanPid.startsWith('zl') || cleanPid.includes('266741166578791076') || cleanPid.includes('zalo')) {
        return `<img src="https://img.icons8.com/color/48/zalo-music.png" onerror="this.src='https://img.icons8.com/color/48/zalo.png'" style="width:${size}px; height:${size}px; object-fit:contain; vertical-align:middle; display:inline-block;" title="Zalo">`;
    }
    
    // Phát hiện Facebook Page (Logo chính thức)
    if (cleanPid.startsWith('fb') || cleanPid.includes('page') || cleanPid.includes('facebook') || cleanPid.match(/^\d+$/) || cleanPid.includes('1574281086218015')) {
        return `<img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png" style="width:${size}px; height:${size}px; object-fit:contain; vertical-align:middle; display:inline-block;" title="Facebook" alt="Facebook">`;
    }
    
    // Mặc định là đơn tại quầy / Web
    return `<img src="https://pumalife.vn/favicon.ico" onerror="this.src='https://img.icons8.com/fluency/48/shop.png'" style="width:${size}px; height:${size}px; object-fit:contain; vertical-align:middle; display:inline-block;" title="PumaLife Store">`;
};

// ----------------------------------------------------
// 1. INITIALIZATION & SUPABASE TOKEN FETCH
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();

    // Check Login Session state
    const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';
    const loginScreen = document.getElementById('loginScreen');
    const appContainer = document.getElementById('appContainer');

    if (isLoggedIn) {
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        if (window.desktopOffline && navigator.onLine === false) {
            console.log('[Desktop Offline] Khởi động trực tiếp từ dữ liệu local');
            await initApplication();
        } else {
            await fetchSmaxToken();
            if (smaxToken) await initApplication();
        }
    } else {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
        setupLoginHandler();
    }
});

function setupLoginHandler() {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const loginScreen = document.getElementById('loginScreen');
    const appContainer = document.getElementById('appContainer');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const pass = document.getElementById('loginPassword').value;

            if (email === 'pumalifestore@gmail.com' && pass === 'pumalifestore') {
                localStorage.setItem('is_logged_in', 'true');
                if (loginScreen) loginScreen.style.display = 'none';
                if (appContainer) appContainer.style.display = 'flex';
                
                await fetchSmaxToken();
                if (smaxToken) {
                    await initApplication();
                }
            } else {
                if (loginError) {
                    loginError.style.display = 'block';
                    setTimeout(() => {
                        loginError.style.display = 'none';
                    }, 5000);
                }
            }
        });
    }
}

async function fetchSmaxToken() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/smax_tokens?select=token&limit=1`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await response.json();
        if (data && data.length > 0) {
            const tokenValue = data[0].token;
            smaxToken = tokenValue.startsWith('Bearer ') ? tokenValue : 'Bearer ' + tokenValue;
            console.log('✅ Smax Token loaded successfully');
        }
    } catch (err) {
        console.error('❌ Failed to fetch Smax token:', err);
    }
}

async function initApplication() {
    await fetchPancakeTokenFromSupabase();
    await fetchJtConfigFromSupabase();
    setupPageChannels();
    setupEventListeners();
    await loadLinkedCustomers();
    await loadThreads();
    await fetchQuickReplies();
    await fetchDashboardOrders();
    await fetchDashboardProducts();
    await fetchDashboardCustomers();

    // Initialize Routing from current URL Hash
    handleHashRouting();

    // Listen for hash changes (e.g. forward/back browser buttons)
    window.addEventListener('hashchange', handleHashRouting);
    
    // Auto-refresh threads every 25 seconds
    setInterval(async () => {
        if (!isLoadingThreads) {
            await loadThreads(true); // silent background load
        }
    }, 25000);

    // Poll reminders every 20 seconds and show alert when due.
    await checkConversationReminders();
    setInterval(checkConversationReminders, 20000);
}

// ----------------------------------------------------
// ROUTING SYSTEM VIA HASH
// ----------------------------------------------------
async function handleHashRouting() {
    const hash = window.location.hash || '';
    const hashPath = hash.split('?')[0];
    const hashParams = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');
    
    // Đặt cờ tạm thời để tránh sự kiện click tự động kích hoạt hashchange ngược lại
    window.isHandlingHashRouting = true;

    // Handle tab switching
    if (hashPath.startsWith('#don-hang')) {
        const orderTabBtn = document.querySelector('.tab-nav-btn[data-target="orders-tab-content"]');
        if (orderTabBtn) orderTabBtn.click();

        const searchInput = document.getElementById('dashboardOrderSearch');
        const searchTerm = hashParams.get('search') || '';
        if (searchInput) {
            searchInput.value = searchTerm;
        }

        if (searchTerm) {
            await fetchDashboardOrders();
        }

        window.isHandlingHashRouting = false;
        return;
    }
    if (hash.startsWith('#san-pham')) {
        const prodTabBtn = document.querySelector('.tab-nav-btn[data-target="products-tab-content"]');
        if (prodTabBtn) prodTabBtn.click();
        window.isHandlingHashRouting = false;
        return;
    }
    if (hash.startsWith('#khach-hang')) {
        const custTabBtn = document.querySelector('.tab-nav-btn[data-target="customers-tab-content"]');
        if (custTabBtn) custTabBtn.click();
        window.isHandlingHashRouting = false;
        return;
    }
    if (hash.startsWith('#chatbot')) {
        const chatbotTabBtn = document.querySelector('.tab-nav-btn[data-target="chatbot-tab-content"]');
        if (chatbotTabBtn) chatbotTabBtn.click();
        window.isHandlingHashRouting = false;
        return;
    }
    if (hashPath === '#van-don') {
        document.querySelector('.tab-nav-btn[data-target="spx-tracking-tab-content"]')?.click();
        window.isHandlingHashRouting = false;
        return;
    }
    if (hash.startsWith('#website')) {
        const websiteTabBtn = document.querySelector('.tab-nav-btn[data-target="website-tab-content"]');
        if (websiteTabBtn) websiteTabBtn.click();
        window.isHandlingHashRouting = false;
        return;
    }

    if (hash.startsWith('#tin-nhan')) {
        const chatTabBtn = document.querySelector('.tab-nav-btn[data-target="chat-tab-content"]');
        if (chatTabBtn) chatTabBtn.click();

        const queryStr = hash.split('?')[1];
        if (queryStr) {
            const params = new URLSearchParams(queryStr);
            const pid = params.get('pid');
            const tid = params.get('tid');

            if (pid && selectedPagePid !== pid) {
                selectedPagePid = pid;
                document.querySelectorAll('.channel-item').forEach(item => {
                    item.classList.toggle('active', item.dataset.pagePid === pid);
                });
                await loadThreads();
            } else if (!smaxThreads.length) {
                await loadThreads();
            }

            if (tid) {
                // tid & pid already include channel prefix (fb, zlw, ig, ttw) - use as-is for SMAX API
                const pagePidToUse = pid || selectedPagePid;
                // Try to find in already-loaded threads
                const match = smaxThreads.find(t =>
                    t.id === tid || t.thread_id === tid || t.tid === tid
                );
                if (match) {
                    await loadMessages(match);
                } else {
                    // Direct fallback - the tid keeps its prefix (fb/zlw/ig/ttw)
                    await loadMessages({
                        id:       tid,
                        tid:      tid,
                        page_pid: pagePidToUse,
                        user:     { name: 'Khach hang' },
                        customer: { name: 'Khach hang' }
                    });
                }

                // Kích hoạt view chat trên mobile (giống click vào thread)
                const appContainer = document.getElementById('appContainer');
                if (appContainer) appContainer.classList.add('mobile-chat-active');
            }
        }
    }
    window.isHandlingHashRouting = false;
}

// Render dynamic Page selectors on sidebar
function setupPageChannels() {
    const subContainer = document.getElementById('subChannelsContainer');
    if (!subContainer) return;

    // SMAX_PAGE_IDS metadata descriptions
    const pageLabels = {
        'fb1574281086218015': { name: 'Pumalife Store II', icon: 'fb' },
        'ig17841471719838606': { name: 'Pumalife IG', icon: 'ig' },
        'ttw6622749003845042177': { name: 'Pumalife TikTok', icon: 'tt' },
        'zlw266741166578791076': { name: 'Pumalife Zalo', icon: 'zl' }
    };

    SMAX_PAGE_IDS.forEach(pid => {
        const meta = pageLabels[pid] || { name: `Trang ${pid}`, icon: 'fb' };
        const li = document.createElement('div');
        li.className = 'channel-item';
        li.dataset.pagePid = pid;
        li.style.marginTop = '2px';
        li.innerHTML = `
            ${getPlatformIcon(pid, 18)}
            <span>${meta.name}</span>
            <span class="badge" id="badge-${pid}">0</span>
        `;
        li.addEventListener('click', (e) => {
            e.stopPropagation(); // Ngăn sự kiện nổi bọt lên allItem click
            document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            selectedPagePid = pid;
            currentSmaxAfter = '';
            loadThreads();
        });
        subContainer.appendChild(li);
    });

    // Binding click for All channels to toggle drop-down list of sub-channels
    const allItem = document.getElementById('allChannelsItem');
    const chevron = document.getElementById('channelChevron');
    if (allItem) {
        allItem.addEventListener('click', () => {
            const isCollapsed = subContainer.style.display === 'none';
            if (isCollapsed) {
                subContainer.style.display = 'flex';
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            } else {
                subContainer.style.display = 'none';
                if (chevron) chevron.style.transform = 'rotate(-90deg)';
            }

            document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
            allItem.classList.add('active');
            selectedPagePid = 'all';
            currentSmaxAfter = '';
            loadThreads();
        });
    }
}

// ----------------------------------------------------
// 2. LOADING THREADS & RENDERING
// ----------------------------------------------------
function getOfflineThreadScopeKey() {
    return selectedPagePid === TIKTOK_SMAX_MENU_PID
        ? 'threads::botbanhang_tiktok'
        : 'threads::smax::' + String(selectedPagePid || 'all');
}

async function applyOfflineThreadsFallback(listContainer) {
    try {
        const cached = await readCachedThreads(getOfflineThreadScopeKey());
        if (!cached?.threads?.length) return false;
        smaxThreads = cached.threads;
        currentSmaxAfter = '';
        updateBadgeCounters();
        renderThreads();
        if (listContainer) {
            const note = document.createElement('div');
            note.style.cssText = 'padding:8px 12px;font-size:.72rem;color:var(--text-muted);text-align:center;border-bottom:1px dashed var(--border);';
            note.textContent = 'Đang xem dữ liệu offline đã lưu lúc ' + new Date(cached.savedAt).toLocaleString('vi-VN');
            listContainer.prepend(note);
        }
        return true;
    } catch (err) {
        console.warn('[Offline] Không đọc được danh sách hội thoại đã lưu:', err);
        return false;
    }
}

async function loadThreads(silent = false, appendMode = false) {
    if (isLoadingThreads) return;
    isLoadingThreads = true;

    const listContainer = document.getElementById('threadList');
    if (window.desktopOffline && navigator.onLine === false && !appendMode) {
        await applyOfflineThreadsFallback(listContainer);
        isLoadingThreads = false;
        return;
    }
    if (!silent && !appendMode && listContainer) {
        listContainer.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Đang tải danh sách hội thoại...</p>
            </div>`;
    }

    try {
        if (selectedPagePid === TIKTOK_SMAX_MENU_PID) {
            const rows = await fetchTikTokChatboxConversations(0, 50);
            smaxThreads = rows;
            await cacheThreads(getOfflineThreadScopeKey(), smaxThreads).catch(err => console.warn('[Offline] cache BotBanHang threads:', err));
            currentSmaxAfter = '';
            updateBadgeCounters();
            renderThreads();
            fetchThreadOrdersMap();
            return;
        }

        const payload = {
            "page_pids": selectedPagePid === 'all' ? SMAX_PAGE_IDS : [selectedPagePid],
            "group_id": "",
            // keyword is the search term used to filter conversations by message content
            "keyword": currentSmaxSearch || null,
            "tags": [],
            "tags_to_exclude": [],
            "tags_empty": false,
            "tags_condition": "OR",
            "types": [],
            "isnew": false,
            "newtop": false,
            "reply": currentSmaxFilterReply,
            "phone": false,
            "nophone": false,
            "customers": false,
            "is_group": false,
            "is_message": false,
            "auto_refresh_new_message": false,
            "dateRange": [],
            "post_ids": null,
            "ad_ids": [],
            "users": [],
            "seen": currentSmaxFilterSeen,
            "ads": false,
            "no_user": false,
            "after": appendMode ? currentSmaxAfter : "",
            "limit": 50
        };

        const response = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/threads`, {
            method: 'POST',
            headers: {
                'Authorization': smaxToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://smax.ai',
                'Referer': 'https://smax.ai/',
                'Ngrok-Skip-Browser-Warning': 'true'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();
            const newData = result.data || [];
            
            // Debug: log full API response keys to find cursor field
            console.log('📦 Smax threads API response keys:', Object.keys(result));
            console.log('📦 Smax threads result.after:', result.after);
            console.log('📦 Smax threads data count:', newData.length);
            
            // Try multiple possible cursor field names from Smax API
            const afterCursor = result.after || result.cursor || result.next || result.paging?.after || "";
            
            // If we got a full page (50 items) but no explicit cursor,
            // use the last thread's updated_at as a fallback cursor
            if (afterCursor) {
                currentSmaxAfter = afterCursor;
            } else if (newData.length >= 50) {
                // Fallback: use last item's updated_at timestamp as cursor
                const lastThread = newData[newData.length - 1];
                currentSmaxAfter = lastThread?.updated_at || lastThread?.tid || "";
                console.log('📦 Using fallback after cursor:', currentSmaxAfter);
            } else {
                // No more pages
                currentSmaxAfter = "";
            }

            if (appendMode) {
                // Remove duplicates when merging
                const existingIds = new Set(smaxThreads.map(t => t.tid));
                const filteredNewData = newData.filter(t => !existingIds.has(t.tid));
                smaxThreads = [...smaxThreads, ...filteredNewData];
            } else {
                smaxThreads = newData;
            }
            await cacheThreads(getOfflineThreadScopeKey(), smaxThreads).catch(err => console.warn('[Offline] cache Smax threads:', err));

            updateBadgeCounters();
            renderThreads();
            fetchThreadOrdersMap(); // Tải đơn hàng gần đây cho mỗi hội thoại
            
            // Auto refresh currently open chat if new message arrives
            if (activeThread) {
                const liveActive = smaxThreads.find(t => t.tid === activeThread.tid);
                if (liveActive && (liveActive.updated_at !== activeThread.updated_at || liveActive.message !== activeThread.message)) {
                    activeThread = liveActive;
                    await loadMessages(activeThread);
                }
            }
        } else {
            const errText = await response.text();
            console.error('❌ Smax API Response Error:', response.status, errText);
        }
    } catch (e) {
        console.error('Error loading threads:', e);
    } finally {
        isLoadingThreads = false;
    }
}

function updateBadgeCounters() {
    // Basic reactive badge count
    const totalCount = smaxThreads.length;
    const badgeAll = document.getElementById('badge-all');
    if (badgeAll) badgeAll.textContent = totalCount;
    document.getElementById('threadCount').textContent = `${totalCount} hội thoại`;

    SMAX_PAGE_IDS.forEach(pid => {
        const pageBadge = document.getElementById(`badge-${pid}`);
        if (pageBadge) {
            const count = smaxThreads.filter(t => t.page_pid === pid).length;
            pageBadge.textContent = count;
        }
    });
}

// Fetch đơn hàng gần đây từ Supabase và build map tid -> [{display_id, status}]
async function fetchThreadOrdersMap() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?select=display_id,status,conversation_link&conversation_link=neq.&conversation_link=not.is.null&order=inserted_at.desc&limit=500`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (!res.ok) return;
        const orders = await res.json();
        
        const newMap = {};
        orders.forEach(o => {
            if (!o.conversation_link) return;
            // Parse page pid / tid from conversation_link: /#tin-nhan?pid=xxx&tid=yyy
            const pidMatch = o.conversation_link.match(/pid=([^&]+)/);
            const tidMatch = o.conversation_link.match(/tid=([^&]+)/);
            if (pidMatch && tidMatch) {
                const pid = pidMatch[1];
                const tid = tidMatch[1];
                const key = `${pid}_${tid}`;
                if (!newMap[key]) newMap[key] = [];
                newMap[key].push({ display_id: o.display_id, status: o.status });
            }
        });
        
        threadOrdersMap = newMap;
        renderThreads(); // Re-render để hiển thị badge mã đơn
    } catch (err) {
        console.error('fetchThreadOrdersMap error:', err);
    }
}

function renderThreads() {
    const container = document.getElementById('threadList');
    if (!container) return;

    if (smaxThreads.length === 0) {
        container.innerHTML = `
            <div class="loading-state">
                <i data-lucide="inbox" style="width:32px; height:32px; color:var(--text-muted);"></i>
                <p>Không tìm thấy hội thoại nào</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = smaxThreads.map((t, idx) => {
        if (idx === 0) console.log('💬 Smax Thread Object Sample:', t);

        const custName = t.customer?.name || t.name || 'Khách hàng';
        const hasUnread = t.seen === false;
        const activeClass = activeThread && activeThread.tid === t.tid ? 'active' : '';
        const initial = custName.charAt(0).toUpperCase();
        
        // Detect if last message was sent by shop (page)
        // From Smax payload logic, t.reply = false means "shop replied" (no longer needs reply)
        const isShop = t.reply === false || 
                       t.reply === 'false' ||
                       t.is_replied === true || 
                       t.is_replied === 'true' ||
                       t.replied === true || 
                       t.replied === 'true' ||
                       t.last_message_by === 'page' || 
                       t.last_message_is_page_message === true || 
                       t.last_message?.is_page_message === true ||
                       t.is_page_message === true ||
                       t.last_message?.sender_type === 'page' ||
                       t.last_message?.from_page === true ||
                       t.last_message?.is_page_msg === true ||
                       (t.last_message?.user_id !== undefined && t.last_message?.user_id !== null) ||
                       t.last_message_by_shop === true ||
                       t.last_message_by_page === true;
        
        // Log details of the first thread's message sender properties to debug
        if (idx === 0) {
            console.log('💬 Thread Sender Detail:', {
                tid: t.tid,
                message: t.message,
                reply: t.reply,
                is_replied: t.is_replied,
                last_message_by: t.last_message_by,
                isShopResult: isShop
            });
        }
        
        let lastMsg = t.message || 'Chưa có tin nhắn';
        if (lastMsg !== 'Chưa có tin nhắn' && isShop) {
            lastMsg = `<strong style="color: var(--primary);">Shop:</strong> ${lastMsg}`;
        }

        const dateStr = t.updated_at ? new Date(t.updated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
        const avatarUrl = t.customer?.picture || '';

        return `
            <div class="thread-card ${activeClass} ${!isShop ? 'unreplied' : ''}" data-tid="${t.tid}">
                <div class="thread-avatar">
                    ${avatarUrl 
                        ? `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` 
                        : `<span>${initial}</span>`
                    }
                    <div class="platform-badge">
                        ${getPlatformIcon(t.page_pid, 12)}
                    </div>
                </div>
                <div class="thread-info">
                    <div class="thread-meta">
                        <span class="thread-name">${custName}${linkedCustomersMap.has(t.tid) ? ' <span class="linked-badge" title="Đã liên kết hội thoại ngoài">🔗</span>' : ''}</span>
                        <span class="thread-time">${dateStr}</span>
                    </div>
                    <div class="thread-preview-row">
                        <span class="thread-preview">${lastMsg}</span>
                        ${hasUnread ? `<span class="unread-dot"></span>` : ''}
                    </div>
                    ${(() => {
                        const pid = t.page_pid || t.pid || t.page_id || '';
                        const tid = t.tid || t.id || '';
                        const orders = threadOrdersMap[`${pid}_${tid}`] || [];
                        if (orders.length === 0) return '';
                        const badges = orders.slice(0, 3).map(o => {
                            const st = parseInt(o.status);
                            let bgColor, txtColor;
                            if ([0, 12].includes(st)) { bgColor = 'rgba(59,130,246,0.12)'; txtColor = '#2563eb'; }          // Mới / Chờ in
                            else if ([17, 1].includes(st)) { bgColor = 'rgba(245,158,11,0.12)'; txtColor = '#d97706'; }     // Xác nhận
                            else if ([11, 20, 8, 13].includes(st)) { bgColor = 'rgba(139,92,246,0.12)'; txtColor = '#7c3aed'; } // Xử lý
                            else if ([9].includes(st)) { bgColor = 'rgba(6,182,212,0.12)'; txtColor = '#0891b2'; }          // Chờ lấy
                            else if ([2].includes(st)) { bgColor = 'rgba(20,184,166,0.12)'; txtColor = '#0d9488'; }         // Đang giao
                            else if ([3, 16].includes(st)) { bgColor = 'rgba(16,185,129,0.12)'; txtColor = '#059669'; }     // Hoàn thành
                            else if ([6, 7].includes(st)) { bgColor = 'rgba(239,68,68,0.12)'; txtColor = '#dc2626'; }       // Đã hủy
                            else if ([4, 5, 23].includes(st)) { bgColor = 'rgba(217,119,6,0.15)'; txtColor = '#b45309'; }   // Hoàn hàng
                            else { bgColor = '#e0e7ff'; txtColor = '#4338ca'; }
                            return `<span style="display:inline-block;padding:1px 5px;border-radius:4px;font-size:0.65rem;font-weight:600;background:${bgColor};color:${txtColor};white-space:nowrap;">#${o.display_id}</span>`;
                        }).join('');
                        return `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px;">${badges}</div>`;
                    })()}
                </div>
            </div>
        `;
    }).join('');

    // Append "Load more" sentinel at end of list if there's a next page cursor
    if (currentSmaxAfter) {
        container.insertAdjacentHTML('beforeend', `
            <div id="loadMoreSentinel" style="display:flex; align-items:center; justify-content:center; padding:16px; gap:8px; color:var(--text-muted); font-size:0.8rem; cursor:pointer;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>
                Kéo xuống hoặc nhấn để tải thêm hội thoại cũ...
            </div>
        `);

        const sentinelButton = document.getElementById('loadMoreSentinel');
        if (sentinelButton) {
            sentinelButton.addEventListener('click', loadMoreThreads);
        }
    }

    // Bind selection clicks
    container.querySelectorAll('.thread-card').forEach(card => {
        card.addEventListener('click', async () => {
            const tid = card.dataset.tid;
            const thread = smaxThreads.find(t => t.tid === tid);
            if (thread) {
                container.querySelectorAll('.thread-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                activeThread = thread;
                
                // Kích hoạt view chat trên mobile
                const appContainer = document.getElementById('appContainer');
                if (appContainer) appContainer.classList.add('mobile-chat-active');
                
                await loadMessages(thread);
            }
        });
    });

    // Attach infinite scroll detection to thread list container
    setupInfiniteScroll(container);

    // Update thread count display
    document.getElementById('threadCount').textContent = `${smaxThreads.length} hội thoại`;
}

// Infinite Scroll handler
let _infiniteScrollBound = false;
function setupInfiniteScroll(container) {
    if (_infiniteScrollBound) return;
    _infiniteScrollBound = true;

    container.addEventListener('scroll', () => {
        if (isLoadingThreads || !currentSmaxAfter) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        // Trigger when within 80px of bottom
        if (scrollTop + clientHeight >= scrollHeight - 80) {
            loadMoreThreads();
        }
    });
}

async function loadMoreThreads() {
    if (isLoadingThreads || !currentSmaxAfter) return;

    // Show loading indicator in sentinel
    const sentinel = document.getElementById('loadMoreSentinel');
    if (sentinel) {
        sentinel.innerHTML = `
            <div class="spinner" style="width:20px; height:20px; border-width:2px;"></div>
            Đang tải thêm hội thoại...
        `;
        sentinel.style.pointerEvents = 'none';
    }

    await loadThreads(true, true);
}

// Expose this helper to inline onclick handlers when app.js is loaded as a module
window.loadMoreThreads = loadMoreThreads;

// TikTok BotBanHang adapter
const TIKTOK_CHATBOX_MESSAGE_ENDPOINT='https://chatbox-service-v3.botbanhang.vn/app/message/read_message';
const TIKTOK_CHATBOX_SEND_ENDPOINT='https://chatbox-service-v3.botbanhang.vn/app/message/send_message';
const TIKTOK_CHATBOX_CONVERSATION_ENDPOINT='https://chatbox-service-v3.botbanhang.vn/app/conversation/read_conversation';
const TIKTOK_SMAX_MENU_PID='ttw6622749003845042177';
const TIKTOK_CHATBOX_ORG_ID='596265077954244';
const TIKTOK_CHATBOX_PAGE_ID='-000WjmLFtfIyudBja72KDN27KCWFH4jL8Xt';
const TIKTOK_CHATBOX_METADATA='__Dang Le Cong Tuan__552752507768643';
let TIKTOK_CHATBOX_AUTH_CACHE='';
async function loadTikTokChatboxAuth(){
  try{
    const url=SUPABASE_URL+'/rest/v1/integration_settings?select=value&key=eq.tiktok_botbanhang_authorization&limit=1';
    const r=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY}});
    if(!r.ok)throw Error('integration_settings '+r.status);
    const rows=await r.json();
    const value=String(rows?.[0]?.value||'').trim();
    if(value)TIKTOK_CHATBOX_AUTH_CACHE=value;
    return value;
  }catch(e){console.error('[TikTok BotBanHang] load config error:',e);return '';}
}
function getTikTokChatboxAuthorization(){return window.TIKTOK_CHATBOX_AUTHORIZATION||TIKTOK_CHATBOX_AUTH_CACHE||localStorage.getItem('tiktok_chatbox_authorization')||'';}
async function ensureTikTokChatboxAuthorization(){return getTikTokChatboxAuthorization()||await loadTikTokChatboxAuth();}
function isTikTokChatboxThread(t){return !!t&&t.source==='botbanhang_tiktok';}
function normalizeTikTokConversation(x){const c=String(x.client_id||x.fb_client_id||x.customer_id||x.sender_id||x.id||x._id||'');const p=String(x.page_id||x.fb_page_id||x.page_pid||TIKTOK_CHATBOX_PAGE_ID);const u=x.customer||x.client||x.user||{};return {...x,source:'botbanhang_tiktok',platform_type:'TIKTOK',channel:'tiktok',tiktok_client_id:c,client_id:c,tiktok_page_id:p,page_pid:TIKTOK_SMAX_MENU_PID,tid:c,customer:{...u,name:u.name||x.client_name||x.sender_name||x.name||'Khách TikTok',picture:u.picture||u.avatar||x.avatar||x.picture||''},message:x.message||x.last_message?.message||x.last_message?.text||x.last_message||'',updated_at:x.updated_at||x.last_message_at||x.time||x.updatedAt||x.createdAt||'',tiktok_raw_conversation:x};}
async function fetchTikTokChatboxConversations(skip=0,limit=50){const authorization=await ensureTikTokChatboxAuthorization();if(!authorization)throw Error('Chưa cấu hình Authorization TikTok BotBanHang trong integration_settings.');const r=await fetch(TIKTOK_CHATBOX_CONVERSATION_ENDPOINT,{method:'POST',headers:{accept:'application/json, text/plain, */*',authorization,'content-type':'application/json'},body:JSON.stringify({page_id:[TIKTOK_CHATBOX_PAGE_ID],skip,limit,org_id:TIKTOK_CHATBOX_ORG_ID})});if(!r.ok)throw Error('TikTok read_conversation '+r.status+': '+(await r.text()).substring(0,180));const j=await r.json();const rows=Array.isArray(j?.data?.result)?j.data.result:(j?.data?.conversation&&typeof j.data.conversation==='object'?Object.values(j.data.conversation):[]);return rows.map(normalizeTikTokConversation).filter(t=>t.client_id);}
function normalizeTikTokChatboxMessage(x){const rc=x?.raw?.content||{};const text=x.message_text||rc?.text?.body||'';const raw=Array.isArray(x.message_attachments)?x.message_attachments:(Array.isArray(rc.attachments)?rc.attachments:[]);const realPage=x.fb_page_id||rc?.to_user?.id||TIKTOK_CHATBOX_PAGE_ID;const attachments=raw.map((att,n)=>{const d=String(att?.payload?.url||att?.url||'').trim(),mid=String(x.message_mid||rc?.message_id||'').trim(),http=/^https?:\/\//i.test(d);return {...att,type:att?.type||'image',mime_type:att?.mime_type||'image/*',url:http?d:(mid?'https://cdn.botbanhang.vn/media/tiktok/'+encodeURIComponent(realPage)+'/message/'+encodeURIComponent(mid)+'/'+n:''),tiktok_media_id:http?'':d};});return {id:x._id||x.message_mid||rc.message_id,message:text,attachments,is_page_msg:x.message_type==='page',sender_pid:x.sender_id||rc?.from_user?.id,page_pid:TIKTOK_SMAX_MENU_PID,created_at:x.time||x.createdAt||(rc.timestamp?new Date(Number(rc.timestamp)).toISOString():null),platform_type:'TIKTOK',tiktok_raw:x};}
async function fetchTikTokChatboxMessages(t,skip=0,limit=80){const authorization=await ensureTikTokChatboxAuthorization();if(!authorization)throw Error('Chưa cấu hình Authorization TikTok BotBanHang trong integration_settings.');const client_id=String(t.tiktok_client_id||t.client_id||t.tid||''),page_id=String(t.tiktok_page_id||TIKTOK_CHATBOX_PAGE_ID),org_id=String(t.tiktok_org_id||t.org_id||TIKTOK_CHATBOX_ORG_ID);const r=await fetch(TIKTOK_CHATBOX_MESSAGE_ENDPOINT,{method:'POST',headers:{accept:'application/json, text/plain, */*',authorization,'content-type':'application/json'},body:JSON.stringify({page_id,client_id,skip,limit,org_id})});if(!r.ok)throw Error('TikTok read_message '+r.status+': '+(await r.text()).substring(0,180));const j=await r.json();const rows=Array.isArray(j?.data)?j.data:(Array.isArray(j?.data?.result)?j.data.result:(Array.isArray(j?.data?.messages)?j.data.messages:[]));return rows.map(normalizeTikTokChatboxMessage);}
async function sendTikTokChatboxText(t,text){const authorization=await ensureTikTokChatboxAuthorization();if(!authorization)throw Error('Chưa cấu hình Authorization TikTok BotBanHang trong integration_settings.');const page_id=String(t.tiktok_page_id||TIKTOK_CHATBOX_PAGE_ID),client_id=String(t.tiktok_client_id||t.client_id||t.tid||''),org_id=String(t.tiktok_org_id||t.org_id||TIKTOK_CHATBOX_ORG_ID),metadata=String(t.metadata||t.tiktok_metadata||TIKTOK_CHATBOX_METADATA);const r=await fetch(TIKTOK_CHATBOX_SEND_ENDPOINT,{method:'POST',headers:{accept:'application/json, text/plain, */*',authorization,'content-type':'application/json'},body:JSON.stringify({page_id,client_id,text,mentions:[],metadata,org_id})});if(!r.ok)throw Error('TikTok send_message '+r.status+': '+(await r.text()).substring(0,180));const j=await r.json().catch(()=>({}));if(j?.code!==undefined&&Number(j.code)!==200)throw Error('TikTok send_message code '+j.code);return j;}
async function uploadTikTokChatboxImage(file){
 const authorization=await ensureTikTokChatboxAuthorization(); if(!authorization)throw Error('Chưa cấu hình Authorization TikTok BotBanHang trong integration_settings.');
 const fileName=String(file?.name||'image.png'),contentType=String(file?.type||'image/png');
 const q=new URLSearchParams({file_name:fileName,content_type:contentType});
 const r=await fetch('https://chatbox-static-v3.botbanhang.vn/app/upload/s3/get_upload_temp_file_url?'+q,{headers:{accept:'*/*',authorization}});
 if(!r.ok)throw Error('TikTok get upload URL '+r.status+': '+(await r.text()).slice(0,180));
 const j=await r.json();
 const uploadUrl=j?.upload_url||j?.presigned_url||j?.signed_url||j?.url||j?.data?.upload_url||j?.data?.presigned_url||j?.data?.signed_url||j?.data?.url;
 if(!uploadUrl)throw Error('BotBanHang không trả URL upload tạm.');
 const up=await fetch(uploadUrl,{method:'PUT',headers:{'content-type':contentType},body:file}); if(!up.ok)throw Error('TikTok upload ảnh '+up.status);
 return String(j?.file_url||j?.content_url||j?.public_url||j?.data?.file_url||j?.data?.content_url||j?.data?.public_url||uploadUrl.split('?')[0]);
}
async function sendTikTokChatboxImage(t,imageUrl){
 const authorization=await ensureTikTokChatboxAuthorization();if(!authorization)throw Error('Chưa cấu hình Authorization TikTok BotBanHang trong integration_settings.');
 const page_id=String(t.tiktok_page_id||TIKTOK_CHATBOX_PAGE_ID),client_id=String(t.tiktok_client_id||t.client_id||t.tid||''),org_id=String(t.tiktok_org_id||t.org_id||TIKTOK_CHATBOX_ORG_ID),metadata=String(t.metadata||t.tiktok_metadata||TIKTOK_CHATBOX_METADATA);
 const r=await fetch(TIKTOK_CHATBOX_SEND_ENDPOINT,{method:'POST',headers:{accept:'application/json, text/plain, */*',authorization,'content-type':'application/json'},body:JSON.stringify({page_id,client_id,attachments:[{url:imageUrl,type:'image'}],metadata,org_id})});
 if(!r.ok)throw Error('TikTok send image '+r.status+': '+(await r.text()).slice(0,180)); const j=await r.json().catch(()=>({}));if(j?.code!==undefined&&Number(j.code)!==200)throw Error('TikTok send image code '+j.code);return j;
}


// ----------------------------------------------------
// 3. MESSAGES HISTORY FETCHING & RENDERING
// ----------------------------------------------------
let messageLoadVersion = 0;

async function loadMessages(thread) {
    if (isLoadingMessages) return;
    isLoadingMessages = true;

    ++messageLoadVersion;
    // Keep activeThread aligned with the current loaded thread so background pagination can continue
    activeThread = thread;

    // Update URL hash router path: /#tin-nhan?pid=xxx&tid=yyy
    const targetHash = `#tin-nhan?pid=${thread.page_pid || selectedPagePid}&tid=${thread.tid || thread.id}`;
    if (window.location.hash !== targetHash) {
        // Prevent infinite loops by blocking the trigger logic flag
        window.history.pushState(null, null, targetHash);
    }

    // Show wrapper and hide empty state
    document.getElementById('emptyChatState').style.display = 'none';
    const wrapper = document.getElementById('chatWrapper');
    wrapper.style.display = 'flex';

    // Populate header details
    document.getElementById('activeCustName').textContent = thread.customer?.name || thread.name || 'Khách hàng';
    
    const avatarContainer = document.getElementById('activeCustAvatar');
    const avatarUrl = thread.customer?.picture || '';
    if (avatarUrl) {
        avatarContainer.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
        avatarContainer.innerHTML = '';
        avatarContainer.textContent = (thread.customer?.name || 'K').charAt(0).toUpperCase();
    }

    const flowContainer = document.getElementById('messagesFlow');
    flowContainer.dataset.conversationKey = JSON.stringify([thread.page_pid || selectedPagePid, thread.tid || thread.id]);
    flowContainer.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Đang tải lịch sử tin nhắn...</p>
        </div>`;

    try {
        if (window.desktopOffline && navigator.onLine === false) {
            const cached = await readCachedMessages(thread).catch(() => null);
            if (cached?.messages?.length) {
                activeMessages = cached.messages;
                renderMessages(true);
                updateDetailsPanel(thread);
                const note=document.createElement('div');
                note.style.cssText='position:sticky;top:0;z-index:3;margin:8px auto;padding:6px 10px;border-radius:999px;background:var(--bg-panel);border:1px solid var(--border);font-size:.72rem;color:var(--text-muted);width:max-content;max-width:90%;';
                note.textContent='OFFLINE · dữ liệu lưu trên PC lúc '+new Date(cached.savedAt).toLocaleString('vi-VN');
                flowContainer.prepend(note);
            } else flowContainer.innerHTML='<div class="loading-state"><p>Hội thoại này chưa có dữ liệu offline trên PC.</p></div>';
            return;
        }
        if (isTikTokChatboxThread(thread)) {
            const fetched = await fetchTikTokChatboxMessages(thread, 0, 80);
            activeMessages = [...fetched].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
            await cacheMessages(thread, activeMessages).catch(err => console.warn('[Offline] cache BotBanHang messages:', err));
            renderMessages(true);
            updateDetailsPanel(thread);
            await processKeywordTriggersForMessages(thread);
            return;
        }

        let pageLimit = 80;
        let url = `https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${thread.page_pid || selectedPagePid}/threads/${thread.tid || thread.id}/messages?limit=${pageLimit}&sort=-created_at`;

        const response = await fetch(url, {
            headers: {
                'Authorization': smaxToken,
                'Accept': 'application/json, text/plain, */*',
                'Ngrok-Skip-Browser-Warning': 'true'
            }
        });

        if (response.ok) {
            const resData = await response.json();
            const fetched = resData.data || [];
            
            // Trang 1 - Lưu và hiển thị ngay
            activeMessages = [...fetched];
            activeMessages.reverse(); // Đảo ngược để hiển thị từ trên xuống
            await cacheMessages(thread, activeMessages).catch(err => console.warn('[Offline] cache Smax messages:', err));
            renderMessages(true); // Cuộn xuống đáy cho tin nhắn mới nhất
            updateDetailsPanel(thread);
            await processKeywordTriggersForMessages(thread);

            // Bắt đầu tải ngầm các trang tin nhắn cũ hơn
            if (fetched.length >= 20) {
                const oldestMsg = fetched[fetched.length - 1];
                loadOlderMessagesBackground(thread, oldestMsg.created_at);
            }
        } else {
            const errText = await response.text().catch(() => '');
            throw new Error(`API ${response.status}: ${errText.substring(0, 120)}`);
        }
    } catch (e) {
        console.error('loadMessages error:', e);
        const cached = await readCachedMessages(thread).catch(() => null);
        if (cached?.messages?.length) {
            activeMessages = cached.messages;
            renderMessages(true);
            updateDetailsPanel(thread);
            const note = document.createElement('div');
            note.style.cssText = 'position:sticky;top:0;z-index:3;margin:8px auto;padding:6px 10px;border-radius:999px;background:var(--bg-panel);border:1px solid var(--border);font-size:.72rem;color:var(--text-muted);width:max-content;max-width:90%;';
            note.textContent = 'Offline · dữ liệu lưu lúc ' + new Date(cached.savedAt).toLocaleString('vi-VN');
            flowContainer.prepend(note);
        } else {
            flowContainer.innerHTML = `<div class="loading-state"><p style="color:var(--danger);">Không thể tải tin nhắn</p><p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">${e.message}</p></div>`;
        }
    } finally {
        isLoadingMessages = false;
    }
}

// Tải ngầm tin nhắn cũ hơn ở chế độ chạy nền
async function loadOlderMessagesBackground(thread, cursor, loadVersion = messageLoadVersion) {
    let currentCursor = cursor;
    let hasMore = true;
    let loopCount = 0;
    let maxPages = 14; // Tiếp tục tải tối đa 14 trang nữa (khoảng 1100 tin nhắn)
    let pageLimit = 80;
    let accumulatedMessages = []; // Mảng gom cụm tin nhắn cũ tải ngầm

    console.log('[Background Fetch] Bắt đầu tải tin nhắn cũ trong nền...');

    while (hasMore && loopCount < maxPages && activeThread && (loadVersion === messageLoadVersion && (activeThread.tid || activeThread.id) === (thread.tid || thread.id) && (activeThread.page_pid || selectedPagePid) === (thread.page_pid || selectedPagePid))) {
        try {
            let url = `https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${thread.page_pid || selectedPagePid}/threads/${thread.tid || thread.id}/messages?limit=${pageLimit}&sort=-created_at&cusor=${encodeURIComponent(currentCursor)}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': smaxToken,
                    'Accept': 'application/json, text/plain, */*',
                    'Ngrok-Skip-Browser-Warning': 'true'
                }
            });

            if (response.ok) {
                const resData = await response.json();
                const fetched = resData.data || [];
                
                if (fetched.length > 0) {
                    // Lọc trùng tin nhắn so với activeMessages và so với accumulatedMessages
                    const uniqueNewMsgs = fetched.filter(m => 
                        !activeMessages.some(existing => (existing.pid || existing.id || existing.mid) === (m.pid || m.id || m.mid)) &&
                        !accumulatedMessages.some(existing => (existing.pid || existing.id || existing.mid) === (m.pid || m.id || m.mid))
                    );
                    
                    if (uniqueNewMsgs.length === 0) {
                        hasMore = false;
                        break;
                    }

                    accumulatedMessages = accumulatedMessages.concat(uniqueNewMsgs);

                    const oldestMsg = fetched[fetched.length - 1];
                    currentCursor = oldestMsg.created_at;

                    if (fetched.length < 20) {
                        hasMore = false;
                    }
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        } catch (err) {
            console.error('[Background Fetch] Lỗi tải tin nhắn cũ:', err);
            hasMore = false;
        }
        loopCount++;
    }

    // Chèn tin nhắn cũ vào đầu container mà KHÔNG rebuild toàn bộ DOM
    if (accumulatedMessages.length > 0 && activeThread && (loadVersion === messageLoadVersion && (activeThread.tid || activeThread.id) === (thread.tid || thread.id) && (activeThread.page_pid || selectedPagePid) === (thread.page_pid || selectedPagePid))) {
        accumulatedMessages.reverse();
        activeMessages = accumulatedMessages.concat(activeMessages);
        await cacheMessages(thread, activeMessages).catch(err => console.warn('[Offline] refresh Smax cache:', err));

        const container = document.getElementById('messagesFlow');
        if (container) {
            // Lưu vị trí cuộn trước khi chèn
            const prevScrollHeight = container.scrollHeight;
            
            // Build HTML chỉ cho tin nhắn cũ mới tải
            const olderHtml = accumulatedMessages.map(msg => buildMessageHtml(msg)).join('');
            
            // Chèn vào đầu container mà không đụng chạm DOM hiện tại
            container.insertAdjacentHTML('afterbegin', olderHtml);
            
            // Neo giữ thanh cuộn: bù đắp chiều cao mới thêm vào
            container.scrollTop = container.scrollHeight - prevScrollHeight + container.scrollTop;
        }
        console.log(`[Background Fetch] Đã chèn ${accumulatedMessages.length} tin nhắn cũ thành công.`);
    }

    console.log('[Background Fetch] Đã hoàn tất tải tin nhắn cũ trong nền.');
}

// Helper: Build HTML cho 1 tin nhắn
function buildMessageHtml(msg) {
    const isMe = msg.is_page_msg === true || 
                 (activeThread && msg.sender_pid === activeThread.page_pid) || 
                 msg.sender_pid === msg.page_pid || 
                 (msg.user_id !== undefined && msg.user_id !== null);
    
    const rowClass = isMe ? 'msg-shop' : 'msg-customer';
    let bodyHtml = '';

    if (msg.message) {
        bodyHtml += `<div class="message-text" style="word-break: break-word;">${formatMessageText(msg.message)}</div>`;
    }

    const attachments = msg.attachments || 
                        (msg.facebook && msg.facebook.attachments) || 
                        (msg.instagram && msg.instagram.attachments) || 
                        (msg.tiktokweb && msg.tiktokweb.attachments) || 
                        (msg.zaloweb && msg.zaloweb.attachments) || [];

    if (Array.isArray(attachments) && attachments.length > 0) {
        attachments.forEach(att => {
            const imgUrl = att.offline_url || att.url || (att.payload && att.payload.url) || att.url_preview || '';
            const isImg = isImageAttachment(att, imgUrl);

            if (isImg && imgUrl) {
                bodyHtml += `
                    <div class="image-attachment-wrapper">
                        <img src="${imgUrl}" class="chat-img-preview" onclick="viewFullImage(this.src)" />
                    </div>`;
            } else if (imgUrl) {
                bodyHtml += `
                    <div class="file-attachment">
                        📎 <a href="${imgUrl}" target="_blank">Tải tệp tin (${att.title || 'Đính kèm'})</a>
                    </div>`;
            }
        });
    }

    let date = '';
    if (msg.created_at) {
        const msgDate = new Date(msg.created_at);
        // show full date (dd/mm/yyyy HH:MM) when message is outside business hours or on a different day
        const now = new Date();
        const isDifferentDay = msgDate.toDateString() !== now.toDateString();
        const hour = msgDate.getHours();
        const outsideBusinessHours = (hour < 8 || hour >= 18);
        if (isDifferentDay || outsideBusinessHours) {
            date = msgDate.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } else {
            date = msgDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
    }

    return `
        <div class="message-row ${rowClass}">
            <div class="message-bubble">
                ${bodyHtml}
                <span class="msg-time">${date}</span>
            </div>
        </div>
    `;
}

function renderMessages(shouldScroll = true) {
    const container = document.getElementById('messagesFlow');
    if (!container) return;

    if (activeMessages.length === 0) {
        container.innerHTML = `<div class="loading-state"><p>Chưa có lịch sử nhắn tin.</p></div>`;
        return;
    }

    container.innerHTML = activeMessages.map(msg => buildMessageHtml(msg)).join('');

    // Cuộn xuống đáy khi hiển thị lần đầu
    if (shouldScroll) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 30);
    }
}

async function updateDetailsPanel(thread) {
    document.getElementById('detailsName').textContent = thread.customer?.name || thread.name || 'Khách hàng';
    document.getElementById('detailsId').textContent = `TID: ${thread.tid}`;
    
    const detailsAvatar = document.getElementById('detailsAvatar');
    const avatarUrl = thread.customer?.picture || '';
    if (avatarUrl) {
        detailsAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
        detailsAvatar.innerHTML = '';
        detailsAvatar.textContent = (thread.customer?.name || 'K').charAt(0).toUpperCase();
    }

    // Dynamic Smax Customer Contact properties if present
    const phone = thread.customer?.phone || thread.customer?.phone_number || 'Chưa cập nhật';
    const address = thread.customer?.address || 'Chưa cập nhật';
    
    document.getElementById('detailsPhone').textContent = phone;
    document.getElementById('detailsAddress').textContent = address;

    // Add edit buttons for phone and address (remove previous buttons to avoid duplicates)
    const existingPhoneBtn = document.getElementById('editPhoneBtn');
    if (existingPhoneBtn) existingPhoneBtn.remove();
    const existingAddrBtn = document.getElementById('editAddrBtn');
    if (existingAddrBtn) existingAddrBtn.remove();

    const phoneEl = document.getElementById('detailsPhone');
    if (phoneEl) {
        phoneEl.insertAdjacentHTML('afterend', ` <button id="editPhoneBtn" style="margin-left:8px; padding:4px 8px; font-size:0.78rem; border-radius:6px; border:1px solid var(--border); background:transparent; cursor:pointer;">Sửa</button>`);
        const btn = document.getElementById('editPhoneBtn');
        if (btn) {
            btn.addEventListener('click', () => openEditCustomerField('phone_numbers'));
        }
    }

    const addrEl = document.getElementById('detailsAddress');
    if (addrEl) {
        addrEl.insertAdjacentHTML('afterend', ` <button id="editAddrBtn" style="margin-left:8px; padding:4px 8px; font-size:0.78rem; border-radius:6px; border:1px solid var(--border); background:transparent; cursor:pointer;">Sửa</button>`);
        const btn2 = document.getElementById('editAddrBtn');
        if (btn2) {
            btn2.addEventListener('click', () => openEditCustomerField('shop_customer_addresses'));
        }
    }

    // Reset linked conv UI
    const linkedConvEl = document.getElementById('detailsLinkedConv');
    if (linkedConvEl) linkedConvEl.innerHTML = '<span style="color:var(--text-muted); font-size:0.75rem;">Đang tải...</span>';

    // Fetch external_conversation_link từ pancake_customers
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(thread.tid)}&select=external_conversation_link`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (res.ok) {
            const data = await res.json();
            const link = (data && data[0]) ? data[0].external_conversation_link : null;
            if (link && linkedConvEl) {
                linkedConvEl.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <a href="${link}" target="_blank" style="color:var(--primary); font-weight:600; text-decoration:underline; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="external-link" style="width:12px;height:12px;"></i> Mở hội thoại ngoài</a>
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <button onclick="editExternalConversation('${encodeURIComponent(thread.tid)}')" style="padding:4px 10px; border-radius:6px; border:1px solid var(--border); background:transparent; color:var(--primary); font-size:0.75rem; font-weight:600; cursor:pointer;">Sửa</button>
                            <button onclick="unlinkExternalConversation('${encodeURIComponent(thread.tid)}')" style="padding:4px 10px; border-radius:6px; border:1px solid var(--danger); background:transparent; color:var(--danger); font-size:0.75rem; font-weight:600; cursor:pointer;">Bỏ liên kết</button>
                            <button onclick="openReminderModal('${encodeURIComponent(thread.tid)}','${thread.page_pid || selectedPagePid || ''}')" style="padding:4px 10px; border-radius:6px; border:1px solid var(--primary); background:var(--primary); color:#fff; font-size:0.75rem; font-weight:600; cursor:pointer;">Thêm nhắc nhở</button>
                        </div>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            } else if (linkedConvEl) {
                linkedConvEl.innerHTML = `
                    <div style="color:var(--text-muted); font-size:0.8rem;">Chưa liên kết</div>
                    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                        <button onclick="editExternalConversation('${encodeURIComponent(thread.tid)}')" style="padding:4px 10px; border-radius:6px; border:1px solid var(--border); background:transparent; color:var(--primary); font-size:0.75rem; font-weight:600; cursor:pointer;">Thêm liên kết</button>
                        <button onclick="openReminderModal('${encodeURIComponent(thread.tid)}','${thread.page_pid || selectedPagePid || ''}')" style="padding:4px 10px; border-radius:6px; border:1px solid var(--primary); background:var(--primary); color:#fff; font-size:0.75rem; font-weight:600; cursor:pointer;">Thêm nhắc nhở</button>
                    </div>
                `;
            }
        } else if (linkedConvEl) {
            linkedConvEl.innerHTML = `
                <div style="color:var(--text-muted); font-size:0.8rem;">Chưa liên kết</div>
                <button onclick="editExternalConversation('${encodeURIComponent(thread.tid)}')" style="margin-top:8px; padding:4px 10px; border-radius:6px; border:1px solid var(--border); background:transparent; color:var(--primary); font-size:0.75rem; font-weight:600; cursor:pointer;">Thêm liên kết</button>
            `;
        }
    } catch (err) {
        console.warn('Lỗi tải external_conversation_link:', err);
        if (linkedConvEl) linkedConvEl.textContent = 'Chưa liên kết';
    }

    // Fetch orders history from Supabase
    fetchCustomerOrdersHistory(thread);

    // Ensure lucide icons update for newly added buttons
    if (window.lucide) lucide.createIcons();
}

// --- Conversation Reminders Modal & Handlers ---
window.openReminderModal = function(encodedTid, pagePid) {
    const tid = decodeURIComponent(encodedTid || '');
    // If modal exists, just show and update tid
    let modal = document.getElementById('reminderModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reminderModal';
        modal.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.4); z-index:4000;';
        modal.innerHTML = `
            <div style="background:var(--bg-panel); padding:18px; border-radius:10px; width:420px; max-width:92%; box-shadow:0 8px 30px rgba(2,6,23,0.6);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:1rem;">Thêm nhắc nhở</strong>
                    <button id="reminderCloseBtn" style="background:transparent;border:none;font-size:1.1rem;cursor:pointer;">✕</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <label style="font-size:0.85rem; color:var(--text-muted);">Nội dung</label>
                    <textarea id="reminderContent" rows="4" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border);"></textarea>
                    <label style="font-size:0.85rem; color:var(--text-muted);">Thời gian nhắc</label>
                    <input id="reminderAt" type="datetime-local" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border);">
                    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:6px;">
                        <button id="reminderCancel" style="padding:8px 12px; border-radius:6px; background:transparent; border:1px solid var(--border); cursor:pointer;">Hủy</button>
                        <button id="reminderSave" style="padding:8px 12px; border-radius:6px; background:var(--primary); color:#fff; border:none; cursor:pointer;">Lưu</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('reminderCloseBtn').addEventListener('click', closeReminderModal);
        document.getElementById('reminderCancel').addEventListener('click', closeReminderModal);
        document.getElementById('reminderSave').addEventListener('click', async function() {
            await window.saveConversationReminder(tid, pagePid);
        });
    }
    // clear inputs
    const contentEl = document.getElementById('reminderContent');
    const atEl = document.getElementById('reminderAt');
    if (contentEl) contentEl.value = '';
    if (atEl) atEl.value = '';
    modal.style.display = 'flex';
};

window.closeReminderModal = function() {
    const modal = document.getElementById('reminderModal');
    if (modal) modal.style.display = 'none';
};

window.saveConversationReminder = async function(tid, pagePid) {
    const contentEl = document.getElementById('reminderContent');
    const atEl = document.getElementById('reminderAt');
    const content = contentEl ? contentEl.value.trim() : '';
    const atVal = atEl ? atEl.value : null;

    if (!content) {
        alert('Vui lòng nhập nội dung nhắc nhở.');
        return;
    }

    let reminderAtIso = null;
    if (atVal) {
        // convert local datetime-local string to ISO with timezone
        const dt = new Date(atVal);
        if (isNaN(dt.getTime())) {
            alert('Thời gian không hợp lệ.');
            return;
        }
        reminderAtIso = dt.toISOString();
    }

    const payload = {
        thread_id: tid,
        reminder_at: reminderAtIso,
        is_completed: false,
        last_notified_at: null,
        content: content,
        page_pid: pagePid || null
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/conversation_reminders`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            if (typeof showToast === 'function') showToast('Đã thêm nhắc nhở', 'success');
            closeReminderModal();
        } else {
            const txt = await res.text();
            alert('Lỗi lưu nhắc nhở: ' + res.status + '\n' + txt);
        }
    } catch (err) {
        console.error('saveConversationReminder error', err);
        alert('Lỗi kết nối khi lưu nhắc nhở');
    }
};

async function fetchDueConversationReminders() {
    try {
        const now = new Date().toISOString();
        const url = `${SUPABASE_URL}/rest/v1/conversation_reminders?select=*&is_completed=eq.false&reminder_at=lte.${encodeURIComponent(now)}&order=reminder_at.asc`;
        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (!res.ok) {
            throw new Error(`Supabase fetch due reminders failed: ${res.status}`);
        }
        const reminders = await res.json();
        return Array.isArray(reminders) ? reminders : [];
    } catch (err) {
        console.error('fetchDueConversationReminders error', err);
        return [];
    }
}

async function completeConversationReminder(reminderId) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/conversation_reminders?id=eq.${encodeURIComponent(reminderId)}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                is_completed: true,
                last_notified_at: new Date().toISOString()
            })
        });
        if (!res.ok) {
            throw new Error(`Supabase complete reminder failed: ${res.status}`);
        }
        return true;
    } catch (err) {
        console.error('completeConversationReminder error', err);
        showToastMessage('Không thể xác nhận nhắc nhở.');
        return false;
    }
}

async function showReminderNotification(reminder) {
    if (!reminder || document.getElementById('reminderAlertModal')) return;

    const modal = document.createElement('div');
    modal.id = 'reminderAlertModal';
    modal.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.35); z-index:5000;';

    const notice = document.createElement('div');
    notice.style.cssText = 'background:var(--bg-panel); padding:18px; border-radius:12px; width:420px; max-width:92%; box-shadow:0 10px 40px rgba(0,0,0,0.25);';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;';
    const title = document.createElement('strong');
    title.textContent = 'Nhắc nhở đến giờ';
    const closeButton = document.createElement('button');
    closeButton.textContent = '✕';
    closeButton.style.cssText = 'background:transparent;border:none;font-size:1.1rem;cursor:pointer;';
    header.appendChild(title);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.style.cssText = 'margin-bottom:16px; color:var(--text-main); line-height:1.5;';
    const contentLabel = document.createElement('div');
    contentLabel.style.cssText = 'font-size:0.95rem; margin-bottom:8px;';
    contentLabel.textContent = `Nội dung: ${reminder.content || ''}`;
    const timeLabel = document.createElement('div');
    timeLabel.style.cssText = 'font-size:0.85rem; color:var(--text-muted);';
    timeLabel.textContent = `Thời gian: ${new Date(reminder.reminder_at).toLocaleString()}`;
    body.appendChild(contentLabel);
    body.appendChild(timeLabel);

    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';
    const snoozeButton = document.createElement('button');
    snoozeButton.textContent = 'Để sau';
    snoozeButton.style.cssText = 'padding:8px 12px; border-radius:6px; background:transparent; border:1px solid var(--border); cursor:pointer;';
    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Đã thực hiện';
    confirmButton.style.cssText = 'padding:8px 12px; border-radius:6px; background:var(--primary); color:#fff; border:none; cursor:pointer;';
    actionRow.appendChild(snoozeButton);
    actionRow.appendChild(confirmButton);

    notice.appendChild(header);
    notice.appendChild(body);
    notice.appendChild(actionRow);
    modal.appendChild(notice);
    document.body.appendChild(modal);

    const closeModal = () => {
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    };

    closeButton.addEventListener('click', closeModal);
    snoozeButton.addEventListener('click', closeModal);
    confirmButton.addEventListener('click', async () => {
        const success = await completeConversationReminder(reminder.id);
        if (success) {
            showToastMessage('Đã xác nhận nhắc nhở.');
            closeModal();
            setTimeout(checkConversationReminders, 500);
        }
    });
}

async function checkConversationReminders() {
    const reminders = await fetchDueConversationReminders();
    if (!reminders || reminders.length === 0) return;
    await showReminderNotification(reminders[0]);
}

// Hàm liên kết hội thoại Smax hiện tại với tab đang mở trong trình duyệt Chrome
window.linkActiveThreadWithCurrentTab = function() {
    if (!activeThread) {
        alert('Vui lòng chọn một khách hàng/hội thoại trước.');
        return;
    }
    
    // Kiểm tra môi trường Chrome Extension
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        // Query tab đang active ở cửa sổ được focus cuối cùng (window chính của người dùng)
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, async function(tabs) {
            console.log('[Extension Link] Active Tabs in last focused window:', tabs);
            let activeTab = tabs && tabs[0];
            
            // Nếu không tìm thấy hoặc là trang extension, thử tìm trong tất cả windows
            if (!activeTab || (activeTab.url && activeTab.url.startsWith('chrome-extension://'))) {
                chrome.tabs.query({ active: true }, async function(allActiveTabs) {
                    console.log('[Extension Link] All active tabs:', allActiveTabs);
                    activeTab = allActiveTabs.find(t => t.url && !t.url.startsWith('chrome-extension://'));
                    if (activeTab && activeTab.url) {
                        await saveExternalConversationLink(activeThread.tid, activeTab.url);
                    } else {
                        askUserForManualLink();
                    }
                });
            } else if (activeTab.url) {
                await saveExternalConversationLink(activeThread.tid, activeTab.url);
            } else {
                askUserForManualLink();
            }
        });
    } else {
        // Fallback cho môi trường web thông thường
        askUserForManualLink();
    }
};

function askUserForManualLink() {
    const manualUrl = prompt('Không tự động lấy được URL của tab hiện tại. Vui lòng dán liên kết hội thoại ngoài (Facebook/Pancake...) vào đây:');
    if (manualUrl && manualUrl.trim()) {
        saveExternalConversationLink(activeThread.tid, manualUrl.trim());
    }
}

async function saveExternalConversationLink(fbId, url) {
    try {
        // Kiểm tra xem khách hàng có trong DB không để thực hiện PATCH hoặc POST
        const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}&select=fb_id`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!checkRes.ok) throw new Error('Không thể kiểm tra thông tin khách hàng');
        const checkData = await checkRes.json();
        
        const pageIdToSave = activeThread?.page_pid || activeThread?.pid || activeThread?.page_id || selectedPagePid || '';

        let saveRes;
        if (checkData && checkData.length > 0) {
            // Update
            saveRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    page_id: pageIdToSave,
                    external_conversation_link: url,
                    updated_at: new Date().toISOString()
                })
            });
        } else {
            // Insert mới khách hàng với thông tin cơ bản
            saveRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fb_id: fbId,
                    page_id: pageIdToSave,
                    name: activeThread.customer?.name || activeThread.name || 'Khách hàng',
                    external_conversation_link: url,
                    inserted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
            });
        }
        
        if (saveRes.ok) {
            linkedCustomersMap.set(fbId.toString(), url);
            renderThreads();

            if (typeof showToast === 'function') {
                showToast('Đã liên kết hội thoại thành công!', 'success');
            } else {
                alert('Đã liên kết hội thoại thành công!');
            }
            // Tải lại chi tiết panel
            updateDetailsPanel(activeThread);
        } else {
            throw new Error(await saveRes.text());
        }
    } catch (e) {
        console.error('Lỗi khi lưu liên kết hội thoại:', e);
        alert('Lỗi lưu liên kết: ' + e.message);
    }
}


// ----------------------------------------------------
// 4. ACTION TRIGGERS & SEND MESSAGES
// ----------------------------------------------------
async function sendMessage() {
    if (!activeThread) return;
    
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text && !pendingImageFile && !pendingImageUrl) return;

    input.value = '';

    // TikTok BotBanHang dùng API riêng, tuyệt đối không đi qua Smax.
    if (isTikTokChatboxThread(activeThread)) {
        const statusEl=document.getElementById('pendingAttachmentStatus');
        try {
            let imageUrl=null;
            if(pendingImageFile){ if(statusEl)statusEl.textContent='Đang tải ảnh lên BotBanHang...'; imageUrl=await uploadTikTokChatboxImage(pendingImageFile); }
            else if(pendingImageUrl){ if(/botbanhang\.vn/i.test(pendingImageUrl))imageUrl=pendingImageUrl; else throw Error('Vui lòng chọn lại ảnh để upload trực tiếp lên BotBanHang.'); }
            if(imageUrl){ if(statusEl)statusEl.textContent='Đang gửi ảnh...'; await sendTikTokChatboxImage(activeThread,imageUrl); activeMessages.push({attachments:[{type:'image',payload:{url:imageUrl},url:imageUrl}],created_at:new Date().toISOString(),is_page_msg:true,user_id:1,platform_type:'TIKTOK'}); }
            if(text){ await sendTikTokChatboxText(activeThread,text); activeMessages.push({message:text,created_at:new Date().toISOString(),is_page_msg:true,user_id:1,platform_type:'TIKTOK'}); activeThread.message=text; await processOutgoingKeywordTrigger(activeThread,text); } else if(imageUrl) activeThread.message='[Hình ảnh]';
            const env=document.getElementById('pendingAttachmentEnv');if(env)env.style.display='none';if(pendingImageBlobUrl){URL.revokeObjectURL(pendingImageBlobUrl);pendingImageBlobUrl=null;}pendingImageUrl=null;pendingImageFile=null;activeThread.updated_at=new Date().toISOString();renderMessages();renderThreads();
        } catch(e){ console.error('[TikTok BotBanHang] send_message error:',e);input.value=text;if(statusEl)statusEl.textContent='Gửi thất bại';if(typeof showToast==='function')showToast('Gửi TikTok thất bại: '+e.message,'error'); }
        return;
    }

    // --- Nếu có ảnh pending: gửi ảnh trước ---
    if (pendingImageFile || pendingImageUrl) {
        const statusEl = document.getElementById('pendingAttachmentStatus');
        if (statusEl) statusEl.textContent = 'Đang gửi...';

        let imageUrl = pendingImageUrl;
        if (!imageUrl && pendingImageFile) {
            // Upload nếu chưa có URL (upload ngầm chưa xong)
            try {
                const formData = new FormData();
                formData.append('file', pendingImageFile);
                const uploadRes = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
                    method: 'POST', body: formData
                });
                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    imageUrl = uploadData.content_url || uploadData.url || null;
                }
            } catch(err) { console.error('Upload error:', err); }
        }

        // Clear pending state
        const env = document.getElementById('pendingAttachmentEnv');
        if (env) env.style.display = 'none';
        if (pendingImageBlobUrl) { URL.revokeObjectURL(pendingImageBlobUrl); pendingImageBlobUrl = null; }
        pendingImageUrl = null; pendingImageFile = null;

        if (imageUrl) {
            // Gửi ảnh qua Smax API
            const pagePid = activeThread.page_pid;
            const payload = buildMultiImagePayload({
                pagePid,
                threadId: activeThread.tid,
                imageUrls: [imageUrl],
                timestamp: Date.now()
            });
            try {
                const resp = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${pagePid}/threads/${activeThread.tid}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': smaxToken, 'Content-Type': 'application/json', 'Origin': 'https://smax.ai', 'Referer': 'https://smax.ai/' },
                    body: JSON.stringify(payload)
                });
                if (resp.ok) {
                    activeMessages.push({ attachments: [{ type: 'image', payload: { url: imageUrl } }], created_at: new Date().toISOString(), user_id: 1 });
                    renderMessages();
                }
            } catch(e) { console.error('Send image error:', e); }
        }

        // Nếu có thêm text, tiếp tục gửi text sau
        if (!text) return;
    }
    const pagePid = activeThread.page_pid;
    let msgType = 'facebook_message';
    
    if (pagePid.toString().startsWith('ig') || activeThread.channel === 'instagram') {
        msgType = 'instagram_message';
    } else if (pagePid.toString().startsWith('tt') || activeThread.channel === 'tiktok') {
        msgType = 'tiktokweb_message';
    } else if (pagePid.toString().startsWith('zl') || activeThread.channel === 'zalo') {
        msgType = 'zaloweb_message';
    }

    try {
        const response = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${pagePid}/threads/${activeThread.tid}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': smaxToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://smax.ai',
                'Referer': 'https://smax.ai/'
            },
            body: JSON.stringify({
                type: msgType,
                messages: [{ message: text }]
            })
        });

        if (response.ok) {
            // Append locally to activeMessages flow instantly for fast reactive UX
            activeMessages.push({
                message: text,
                created_at: new Date().toISOString(),
                user_id: 1 // mock shop agent user_id to trigger right side styling
            });
                renderMessages();
                await processOutgoingKeywordTrigger(activeThread, text);

            // Update thread list preview and sender status immediately
            const threadId = activeThread.tid;
            const threadIdx = smaxThreads.findIndex(th => th.tid === threadId);
            if (threadIdx !== -1) {
                smaxThreads[threadIdx].message = text;
                smaxThreads[threadIdx].is_replied = true;
                smaxThreads[threadIdx].replied = true;
                smaxThreads[threadIdx].reply = false; // false = shop replied (no longer needs reply)
                smaxThreads[threadIdx].last_message_by = 'page';
                smaxThreads[threadIdx].updated_at = new Date().toISOString();
                
                // Move current active thread to the top of list
                const [moved] = smaxThreads.splice(threadIdx, 1);
                smaxThreads.unshift(moved);
                renderThreads();
            }
        } else {
            console.error('Failed to send Smax message');
        }
    } catch (e) {
        console.error(e);
    }
}

// Stage image for sending: hiển thị preview + upload ngầm lấy sẵn URL
async function stageImageForSend(file) {
    if (!file || !activeThread) return;

    const env     = document.getElementById('pendingAttachmentEnv');
    const preview = document.getElementById('pendingImagePreview');
    const statusEl= document.getElementById('pendingAttachmentStatus');

    // Hiển thị preview ngay lập tức bằng blob URL local
    if (pendingImageBlobUrl) URL.revokeObjectURL(pendingImageBlobUrl);
    pendingImageBlobUrl = URL.createObjectURL(file);
    pendingImageFile = file;
    pendingImageUrl  = null;

    if (env && preview) {
        preview.src = pendingImageBlobUrl;
        env.style.display = 'flex';
        if (statusEl) statusEl.textContent = 'Đang tải lên...';
    }

    // Upload ngầm lên Pancake để lấy sẵn CDN URL
    try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
            method: 'POST', body: formData
        });
        if (res.ok) {
            const data = await res.json();
            pendingImageUrl = data.content_url || data.url || null;
            if (statusEl) statusEl.textContent = pendingImageUrl ? 'Đã tải xong – sẵn sàng gửi' : 'Lỗi upload';
        } else {
            if (statusEl) statusEl.textContent = 'Upload lỗi – vẫn có thể gửi';
        }
    } catch (err) {
        console.error('[stageImageForSend] Upload error:', err);
        if (statusEl) statusEl.textContent = 'Lỗi kết nối – vẫn có thể gửi';
    }
}

// Image File Upload Helper
async function uploadAndSendImage(fileOrFiles) {
    if (!activeThread) return;

    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    const validFiles = files.filter(Boolean);
    if (validFiles.length === 0) return;

    const flowContainer = document.getElementById('messagesFlow');
    const loadingBubble = document.createElement('div');
    loadingBubble.className = 'message-row msg-shop';
    loadingBubble.innerHTML = `
        <div class="message-bubble" style="opacity: 0.7;">
            🔄 Đang tải ${validFiles.length > 1 ? `${validFiles.length} hình ảnh` : 'hình ảnh'} lên Cloud...
        </div>`;
    if (flowContainer) {
        flowContainer.appendChild(loadingBubble);
        flowContainer.scrollTop = flowContainer.scrollHeight;
    }

    try {
        const uploadedUrls = [];

        for (const file of validFiles) {
            const formData = new FormData();
            formData.append('file', file);

            const uploadRes = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
                method: 'POST',
                body: formData
            });

            const resData = await uploadRes.json();
            const imageUrl = resData.content_url || (resData.data && resData.data.url) || (resData.url && resData.url);

            if (!resData.success && !imageUrl) {
                throw new Error('Upload ảnh thất bại: ' + JSON.stringify(resData));
            }
            if (imageUrl) uploadedUrls.push(imageUrl);
        }

        if (uploadedUrls.length === 0) throw new Error('Không có URL ảnh nào trả về');

        if (loadingBubble) loadingBubble.remove();

        const pagePid = activeThread.page_pid;
        const timestamp = Date.now();
        const payload = buildMultiImagePayload({
            pagePid,
            threadId: activeThread.tid,
            imageUrls: uploadedUrls,
            timestamp
        });

        const sendRes = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${pagePid}/threads/${activeThread.tid}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': smaxToken,
                'Content-Type': 'application/json',
                'Origin': 'https://smax.ai',
                'Referer': 'https://smax.ai/',
                'Ngrok-Skip-Browser-Warning': 'true',
                'Accept': 'application/json, text/plain, */*',
                'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site'
            },
            body: JSON.stringify(payload)
        });

        if (sendRes.ok) {
            // Push ngay lập tức vào tin nhắn hiện tại để hiển thị nhanh
            activeMessages.push({
                message: "",
                attachments: uploadedUrls.map(url => ({ type: "image", url })),
                created_at: new Date().toISOString(),
                user_id: 1 // giả lập shop gửi
            });
            renderMessages();

            // Cập nhật preview hội thoại ở sidebar
            const threadId = activeThread.tid;
            const threadIdx = smaxThreads.findIndex(th => th.tid === threadId);
            if (threadIdx !== -1) {
                smaxThreads[threadIdx].message = uploadedUrls.length > 1 ? `[${uploadedUrls.length} hình ảnh]` : "[Hình ảnh]";
                smaxThreads[threadIdx].is_replied = true;
                smaxThreads[threadIdx].replied = true;
                smaxThreads[threadIdx].reply = false;
                smaxThreads[threadIdx].last_message_by = 'page';
                smaxThreads[threadIdx].updated_at = new Date().toISOString();
                
                const [moved] = smaxThreads.splice(threadIdx, 1);
                smaxThreads.unshift(moved);
                renderThreads();
            }

            // Tự động tải lại tin nhắn thực tế từ Smax sau 1.5 giây để đồng bộ cấu hình chuẩn
            setTimeout(() => {
                if (activeThread && activeThread.tid === threadId) {
                    fetchMessages(activeThread, true);
                }
            }, 1500);
        } else {
            throw new Error('Gửi tin nhắn ảnh qua Smax thất bại!');
        }
    } catch (err) {
        console.error(err);
        if (loadingBubble) {
            loadingBubble.innerHTML = `<div class="message-bubble" style="background-color:var(--danger)">❌ Gửi ảnh thất bại!</div>`;
            setTimeout(() => loadingBubble.remove(), 3000);
        }
    }
}

// ----------------------------------------------------
// 5. ATTACHING EVENT HANDLERS & FILTERS
// ----------------------------------------------------
function resetSmaxPageFilterToAll() {
    selectedPagePid = 'all';
    currentSmaxAfter = '';
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const allItem = document.getElementById('allChannelsItem');
    if (allItem) allItem.classList.add('active');
    const menu = document.getElementById('channelFilterMenu');
    if (menu) menu.querySelectorAll('.channel-filter-item').forEach(item => item.classList.toggle('active', item.dataset.pid === 'all'));
    const label = document.querySelector('#channelFilterBtn .filter-label');
    if (label) label.textContent = 'ALL';
}

function setupEventListeners() {
    setupSpxTracking({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
    // Send Button
    document.getElementById('btnSendMessage').addEventListener('click', sendMessage);

    // Sidebar Tab Navigation Controls
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;

            if (targetId === 'chat-tab-content' && !window.isHandlingHashRouting) {
                resetSmaxPageFilterToAll();
                loadThreads();
            }

            // Cập nhật hash tương ứng nếu click trực tiếp từ người dùng (không phải do routing kích hoạt)
            if (!window.isHandlingHashRouting) {
                if (targetId === 'orders-tab-content') {
                    window.location.hash = '#don-hang';
                } else if (targetId === 'products-tab-content') {
                    window.location.hash = '#san-pham';
                } else if (targetId === 'customers-tab-content') {
                    window.location.hash = '#khach-hang';
                } else if (targetId === 'chatbot-tab-content') {
                    window.location.hash = '#chatbot';
                } else if (targetId === 'spx-tracking-tab-content') {
                    window.location.hash = '#van-don';
                } else if (targetId === 'website-tab-content') {
                    window.location.hash = '#website';
                } else if (targetId === 'chat-tab-content') {
                    if (activeThread) {
                        window.location.hash = `#tin-nhan?pid=${activeThread.page_pid}&tid=${activeThread.tid}`;
                    } else {
                        window.location.hash = '#tin-nhan';
                    }
                }
            }

            document.querySelectorAll('.tab-nav-btn').forEach(b => {
                b.classList.remove('active');
                b.style.color = 'var(--text-muted)';
            });
            btn.classList.add('active');
            btn.style.color = 'var(--primary)';

            // Hide all tab views, show target view
            document.querySelectorAll('.tab-view-panel').forEach(panel => {
                panel.style.display = 'none';
            });
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.style.display = targetId === 'orders-tab-content' ? 'flex' : 'flex';
            }

            // If entering orders tab, fetch fresh data (only if not currently routing/loading)
            if (!window.isHandlingHashRouting) {
                if (targetId === 'orders-tab-content') {
                    fetchDashboardOrders();
                } else if (targetId === 'products-tab-content') {
                    fetchDashboardProducts();
                } else if (targetId === 'customers-tab-content') {
                    fetchDashboardCustomers();
                }
            }
        });
    });

    // Orders Dashboard Reload
    document.getElementById('btnReloadAllOrders').addEventListener('click', () => {
        fetchDashboardOrders();
    });

    const btnOpenWalkIn = document.getElementById('btnOpenWalkInOrderModal');
    if (btnOpenWalkIn) {
        btnOpenWalkIn.addEventListener('click', () => {
            document.getElementById('walkInOrderModal').style.display = 'flex';
            loadWalkInCustomerSuggestions();
        });
    }

    const walkInCustomerSearch = document.getElementById('walkInCustomerSearch');
    if (walkInCustomerSearch) {
        walkInCustomerSearch.addEventListener('input', () => {
            clearTimeout(window.walkInCustomerSearchDebounce);
            window.walkInCustomerSearchDebounce = setTimeout(() => {
                loadWalkInCustomerSuggestions(walkInCustomerSearch.value.trim());
            }, 250);
        });
    }

    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('walkInCustomerSuggestions');
        if (!dropdown) return;
        if (event.target.closest('#walkInCustomerSuggestions') || event.target === walkInCustomerSearch) return;
        dropdown.style.display = 'none';
    });

    // Orders Dashboard Search Debouncer
    const dashboardSearch = document.getElementById('dashboardOrderSearch');
    if (dashboardSearch) {
        dashboardSearch.addEventListener('input', () => {
            clearTimeout(window.dashboardSearchDebouncer);
            window.dashboardSearchDebouncer = setTimeout(() => {
                dashboardOrdersPage = 0; // Reset pagination page on search
                fetchDashboardOrders();
            }, 400);
        });
    }

    // Orders Dashboard Status filter change
    const dashboardFilter = document.getElementById('dashboardOrderStatusFilter');
    if (dashboardFilter) {
        dashboardFilter.addEventListener('change', () => {
            dashboardOrdersPage = 0; // Reset page
            fetchDashboardOrders();
        });
    }

    const dashboardWarehouseFilter = document.getElementById('dashboardWarehouseFilter');
    if (dashboardWarehouseFilter) dashboardWarehouseFilter.addEventListener('change', () => { dashboardOrdersPage = 0; fetchDashboardOrders(); });

    // Orders Dashboard Pagination buttons
    document.getElementById('btnPrevOrdersPage').addEventListener('click', () => {
        if (dashboardOrdersPage > 0) {
            dashboardOrdersPage--;
            fetchDashboardOrders();
        }
    });

    document.getElementById('btnNextOrdersPage').addEventListener('click', () => {
        dashboardOrdersPage++;
        fetchDashboardOrders();
    });


    // --- PRODUCTS EVENT LISTENERS ---
    const btnOpenAddProductModal = document.getElementById('btnOpenAddProductModal');
    const prodImageInput = document.getElementById('prodImage');
    const prodImageFileInput = document.getElementById('prodImageFile');
    const btnSelectProdImage = document.getElementById('btnSelectProdImage');

    if (btnOpenAddProductModal) {
        btnOpenAddProductModal.addEventListener('click', () => {
            document.getElementById('productForm').reset();
            document.getElementById('productEditId').value = '';
            document.getElementById('productModalTitle').textContent = 'Thêm sản phẩm mới';
            
            // Ẩn preview ảnh cũ
            const previewContainer = document.getElementById('prodImagePreviewContainer');
            if (previewContainer) previewContainer.style.display = 'none';
            if (prodImageFileInput) prodImageFileInput.value = '';
            
            document.getElementById('productModal').style.display = 'flex';
        });
    }

    if (btnSelectProdImage && prodImageFileInput) {
        btnSelectProdImage.addEventListener('click', () => {
            prodImageFileInput.click();
        });
    }

    if (prodImageFileInput) {
        prodImageFileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) {
                window.handleProductImageUpload(file);
            }
        });
    }

    // Sự kiện paste (Ctrl+V) ảnh trực tiếp vào input prodImage
    if (prodImageInput) {
        prodImageInput.addEventListener('paste', async (e) => {
            const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items || [];
            for (const item of items) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        window.handleProductImageUpload(file);
                    }
                }
            }
        });
    }

    const btnCloseProductModal = document.getElementById('btnCloseProductModal');
    if (btnCloseProductModal) {
        btnCloseProductModal.addEventListener('click', () => {
            document.getElementById('productModal').style.display = 'none';
        });
    }

    const btnCloseVariationsModal = document.getElementById('btnCloseVariationsModal');
    if (btnCloseVariationsModal) {
        btnCloseVariationsModal.addEventListener('click', () => {
            document.getElementById('productVariationsModal').style.display = 'none';
        });
    }

    const btnCloseProductOrdersModal = document.getElementById('btnCloseProductOrdersModal');
    if (btnCloseProductOrdersModal) {
        btnCloseProductOrdersModal.addEventListener('click', () => {
            document.getElementById('productOrdersModal').style.display = 'none';
        });
    }

    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', handleProductFormSubmit);
    }

    const productSearch = document.getElementById('productSearch');
    if (productSearch) {
        productSearch.addEventListener('input', () => {
            clearTimeout(window.productSearchDebouncer);
            window.productSearchDebouncer = setTimeout(() => {
                dashboardProductsPage = 0;
                fetchDashboardProducts();
            }, 400);
        });
    }
    document.getElementById('btnPrevProductsPage').addEventListener('click', () => {
        if (dashboardProductsPage > 0) {
            dashboardProductsPage--;
            fetchDashboardProducts();
        }
    });
    document.getElementById('btnNextProductsPage').addEventListener('click', () => {
        dashboardProductsPage++;
        fetchDashboardProducts();
    });

    // --- CUSTOMERS EVENT LISTENERS ---
    const btnOpenAddCustomerModal = document.getElementById('btnOpenAddCustomerModal');
    if (btnOpenAddCustomerModal) {
        btnOpenAddCustomerModal.addEventListener('click', () => {
            document.getElementById('customerForm').reset();
            document.getElementById('customerEditId').value = '';
            document.getElementById('customerModalTitle').textContent = 'Thêm khách hàng mới';
            document.getElementById('customerModal').style.display = 'flex';
        });
    }
    const btnCloseCustomerModal = document.getElementById('btnCloseCustomerModal');
    if (btnCloseCustomerModal) {
        btnCloseCustomerModal.addEventListener('click', () => {
            document.getElementById('customerModal').style.display = 'none';
        });
    }



    // Customer form + search + pagination
    const customerForm = document.getElementById('customerForm');
    if (customerForm) {
        customerForm.addEventListener('submit', handleCustomerFormSubmit);
    }
    const customerSearch = document.getElementById('customerSearch');
    if (customerSearch) {
        customerSearch.addEventListener('input', () => {
            clearTimeout(window.customerSearchDebouncer);
            window.customerSearchDebouncer = setTimeout(() => {
                dashboardCustomersPage = 0;
                fetchDashboardCustomers();
            }, 400);
        });
    }
    document.getElementById('btnPrevCustomersPage').addEventListener('click', () => {
        if (dashboardCustomersPage > 0) {
            dashboardCustomersPage--;
            fetchDashboardCustomers();
        }
    });
    document.getElementById('btnNextCustomersPage').addEventListener('click', () => {
        dashboardCustomersPage++;
        fetchDashboardCustomers();
    });

    // Close customer orders modal
    const btnCloseCustomerOrdersModal = document.getElementById('btnCloseCustomerOrdersModal');
    if (btnCloseCustomerOrdersModal) {
        btnCloseCustomerOrdersModal.addEventListener('click', () => {
            document.getElementById('customerOrdersModal').style.display = 'none';
        });
    }

    // Textarea Enter to send, Ctrl+Enter or Shift+Enter to newline
    document.getElementById('messageInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            sendMessage();
        }
    });

    // Paste image into messageInput
    document.getElementById('messageInput').addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items || [];
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) stageImageForSend(blob);
                return;
            }
        }
    });

    // Clear pending image button
    const clearPendingBtn = document.getElementById('clearPendingImage');
    if (clearPendingBtn) {
        clearPendingBtn.addEventListener('click', () => {
            pendingImageUrl = null;
            pendingImageFile = null;
            if (pendingImageBlobUrl) { URL.revokeObjectURL(pendingImageBlobUrl); pendingImageBlobUrl = null; }
            const env = document.getElementById('pendingAttachmentEnv');
            if (env) env.style.display = 'none';
            const preview = document.getElementById('pendingImagePreview');
            if (preview) preview.src = '';
        });
    }

    // Link Current Tab
    const btnLink = document.getElementById('btnLinkCurrentTab');
    if (btnLink) {
        btnLink.addEventListener('click', () => {
            window.linkActiveThreadWithCurrentTab();
        });

        // Drag & Drop link support
        btnLink.addEventListener('dragover', (e) => {
            e.preventDefault();
            btnLink.style.transform = 'scale(1.25)';
            btnLink.style.backgroundColor = 'var(--bg-panel-hover)';
            btnLink.style.borderRadius = '50%';
        });

        const resetBtnStyle = () => {
            btnLink.style.transform = '';
            btnLink.style.backgroundColor = '';
            btnLink.style.borderRadius = '';
        };

        btnLink.addEventListener('dragleave', resetBtnStyle);
        btnLink.addEventListener('dragend', resetBtnStyle);

        btnLink.addEventListener('drop', async (e) => {
            e.preventDefault();
            resetBtnStyle();

            if (!activeThread) {
                alert('Vui lòng chọn một khách hàng/hội thoại trước.');
                return;
            }

            let url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (url && url.trim()) {
                url = url.trim();
                await saveExternalConversationLink(activeThread.tid, url);
            } else {
                alert('Không thể nhận dạng liên kết được thả vào đây.');
            }
        });
    }

    // Refresh Chat
    document.getElementById('btnRefreshChat').addEventListener('click', async () => {
        if (activeThread) await loadMessages(activeThread);
    });
    // Toggle Details Drawer
    document.getElementById('btnToggleDetails').addEventListener('click', () => {
        const detailsEl = document.getElementById('detailsPanel');
        const overlayEl = document.getElementById('detailsOverlay');
        detailsEl.classList.toggle('hidden');
        if (window.innerWidth <= 768) {
            detailsEl.classList.toggle('visible');
            if (overlayEl) overlayEl.classList.toggle('visible');
        }
    });
    
    const closeDetailsFn = () => {
        document.getElementById('detailsPanel').classList.add('hidden');
        document.getElementById('detailsPanel').classList.remove('visible');
        const overlayEl = document.getElementById('detailsOverlay');
        if (overlayEl) overlayEl.classList.remove('visible');
    };
    document.getElementById('btnCloseDetails').addEventListener('click', closeDetailsFn);
    const overlayEl = document.getElementById('detailsOverlay');
    if (overlayEl) overlayEl.addEventListener('click', closeDetailsFn);

    // Mobile Back Button logic
    const backBtn = document.getElementById('btnMobileBack');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            const container = document.getElementById('appContainer');
            if (container) container.classList.remove('mobile-chat-active');
        });
    }

    // Search bar matching threads
    const searchInput = document.getElementById('threadSearch');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    searchInput.addEventListener('input', () => {
        const val = searchInput.value.trim();
        currentSmaxSearch = val;
        clearSearchBtn.style.display = val ? 'block' : 'none';
        
        // Debounce search API calls
        clearTimeout(window.searchDebouncer);
        window.searchDebouncer = setTimeout(() => {
            currentSmaxAfter = '';
            loadThreads();
        }, 400);
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentSmaxSearch = '';
        clearSearchBtn.style.display = 'none';
        currentSmaxAfter = '';
        loadThreads();
    });

    const channelFilterBtn = document.getElementById('channelFilterBtn');
    const channelFilterMenu = document.getElementById('channelFilterMenu');
    if (channelFilterBtn && channelFilterMenu) {
        channelFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            channelFilterMenu.classList.toggle('open');
            channelFilterBtn.parentElement.classList.toggle('open');
        });

        channelFilterMenu.querySelectorAll('.channel-filter-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const pid = item.dataset.pid;
                if (!pid) return;
                selectedPagePid = pid;
                currentSmaxAfter = '';
                loadThreads();
                channelFilterMenu.querySelectorAll('.channel-filter-item').forEach(btn => btn.classList.toggle('active', btn === item));
                const label = item.textContent.trim();
                const labelEl = channelFilterBtn.querySelector('.filter-label');
                if (labelEl) labelEl.textContent = label;
                channelFilterMenu.classList.remove('open');
                channelFilterBtn.parentElement.classList.remove('open');
            });
        });

        document.addEventListener('click', (event) => {
            if (!channelFilterMenu.contains(event.target) && event.target !== channelFilterBtn) {
                channelFilterMenu.classList.remove('open');
                channelFilterBtn.parentElement.classList.remove('open');
            }
        });
    }

    // Filter Buttons (All, Seen, Unseen, Unreplied)
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const filter = tab.dataset.filter;
            if (filter === 'all') {
                currentSmaxFilterReply = null;
                currentSmaxFilterSeen = null;
            } else if (filter === 'seen') {
                currentSmaxFilterReply = false;
                currentSmaxFilterSeen = true;
            } else if (filter === 'unseen') {
                currentSmaxFilterReply = null;
                currentSmaxFilterSeen = false;
            } else if (filter === 'unreplied') {
                currentSmaxFilterReply = true;
                currentSmaxFilterSeen = false;
            }
            currentSmaxAfter = '';
            loadThreads();
        });
    });

    // Upload files handler – hỗ trợ chọn nhiều ảnh cùng lúc
    const fileInput = document.getElementById('imageFileInput');
    document.getElementById('btnUploadImage').addEventListener('click', () => {
        fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
        const files = Array.from(fileInput.files || []);
        if (files.length === 0) return;
        // Reset input để có thể chọn lại cùng file sau này
        fileInput.value = '';

        // Gửi nhiều ảnh trong 1 payload theo format Smax: messages:[{temp_id,picture}, ...]
        await uploadAndSendImage(files);
    });

    // Quick Replies Toggle Button
    const btnQuick = document.getElementById('btnQuickReplies');
    const popover = document.getElementById('quickReplyPopover');
    const addForm = document.getElementById('quickReplyForm');
    const listEl = document.getElementById('quickReplyList');
    
    if (btnQuick && popover) {
        btnQuick.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = popover.style.display === 'flex';
            popover.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                if (addForm) addForm.style.display = 'none';
                if (listEl) listEl.style.display = 'flex';
                renderQuickReplies();
            }
        });

        // Hide when clicking outside
        document.addEventListener('click', (e) => {
            if (!popover.contains(e.target) && e.target !== btnQuick && !btnQuick.contains(e.target)) {
                popover.style.display = 'none';
            }
        });

        // Toggle Form Add New QR
        const btnToggleAdd = document.getElementById('btnToggleAddQuickReply');
        if (btnToggleAdd && addForm && listEl) {
            btnToggleAdd.addEventListener('click', (e) => {
                e.stopPropagation();
                const isFormVisible = addForm.style.display === 'flex' || addForm.style.display === 'block';
                if (isFormVisible) {
                    addForm.style.display = 'none';
                    listEl.style.display = 'flex';
                } else {
                    addForm.style.display = 'block';
                    listEl.style.display = 'none';                    // Reset fields
                    editingQuickReplyId = null;
                    document.getElementById('qrShortcutInput').value = '';
                    document.getElementById('qrContentInput').value = '';
                    document.getElementById('qrImageInput').value = '';
                    const saveBtn = document.getElementById('btnSaveAddQR');
                    if (saveBtn) saveBtn.textContent = 'Lưu lại';
                }
            });
        }

        // Cancel Add
        const btnCancelQR = document.getElementById('btnCancelAddQR');
        if (btnCancelQR && addForm && listEl) {
            btnCancelQR.addEventListener('click', (e) => {
                e.stopPropagation();
                addForm.style.display = 'none';
                listEl.style.display = 'flex';
                editingQuickReplyId = null;
                const saveBtn = document.getElementById('btnSaveAddQR');
                if (saveBtn) saveBtn.textContent = 'Lưu lại';
            });
        }

        // Image file picker inside QR form
        const qrImgFile = document.getElementById('qrImageFileInput');
        const btnUploadQRImg = document.getElementById('btnUploadQRImage');
        const qrImgInput = document.getElementById('qrImageInput');
        if (qrImgFile && btnUploadQRImg) {
            btnUploadQRImg.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                qrImgFile.click();
            });

            qrImgFile.addEventListener('change', async (e) => {
                e.stopPropagation();
                const file = qrImgFile.files[0];
                if (!file) return;

                btnUploadQRImg.innerHTML = '...';
                btnUploadQRImg.disabled = true;

                try {
                    // Upload image via Pancake API (same as pumalifeorder)
                    const formData = new FormData();
                    formData.append('file', file);
                    const res = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
                        method: 'POST',
                        body: formData
                    });
                    const resData = await res.json();
                    const imageUrl = resData.content_url || (resData.data && resData.data.url);
                    if (resData.success && imageUrl && qrImgInput) {
                        qrImgInput.value = imageUrl;
                    } else {
                        console.error('QR image upload failed:', resData);
                    }
                } catch (err) {
                    console.error('QR image upload error:', err);
                } finally {
                    btnUploadQRImg.innerHTML = '<i data-lucide="upload" style="width:14px;"></i>';
                    btnUploadQRImg.disabled = false;
                    if (window.lucide) lucide.createIcons();
                }
            });
        }

        // Save QR code click
        const btnSaveQR = document.getElementById('btnSaveAddQR');
        if (btnSaveQR) {
            btnSaveQR.addEventListener('click', async (e) => {
                e.stopPropagation();
                const shortcut = document.getElementById('qrShortcutInput').value.trim();
                const content = document.getElementById('qrContentInput').value.trim();
                const imageUrl = document.getElementById('qrImageInput').value.trim();

                if (!content) {
                    alert('Vui lòng nhập nội dung tin nhắn!');
                    return;
                }

                btnSaveQR.disabled = true;
                btnSaveQR.innerHTML = 'Đang lưu...';

                try {
                    const formattedShortcut = shortcut ? (shortcut.startsWith('/') ? shortcut : '/' + shortcut) : '';
                    const isEditing = editingQuickReplyId !== null;
                    const payload = {
                        shortcut: formattedShortcut,
                        content: content,
                        image_url: imageUrl || null
                    };
                    if (!isEditing) payload.created_at = new Date().toISOString();

                    const endpoint = isEditing
                        ? `${SUPABASE_URL}/rest/v1/quick_replies?id=eq.${editingQuickReplyId}`
                        : `${SUPABASE_URL}/rest/v1/quick_replies`;

                    const res = await fetch(endpoint, {
                        method: isEditing ? 'PATCH' : 'POST',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify(payload)
                    });

                    if (res.ok) {
                        await fetchQuickReplies();
                        if (addForm) addForm.style.display = 'none';
                        if (listEl) listEl.style.display = 'flex';
                        editingQuickReplyId = null;
                    } else {
                        alert('Lỗi lưu tin nhắn mẫu: ' + res.statusText);
                    }
                } catch (err) {
                    console.error('Save QR error:', err);
                    alert('Lỗi kết nối tới Supabase!');
                } finally {
                    btnSaveQR.disabled = false;
                    btnSaveQR.innerHTML = 'Lưu lại';
                }
            });
        }
    }

    const whSelect = document.getElementById('jtWarehouseSelect');
    if (whSelect) whSelect.addEventListener('change', () => { renderSelectedWarehouseSummary(); renderWarehousePicker(); });
    const whPickerBtn = document.getElementById('jtWarehousePickerButton');
    if (whPickerBtn) whPickerBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleWarehousePicker(); });
    const btnOpenWh = document.getElementById('btnOpenWarehouseModal');
    if (btnOpenWh) btnOpenWh.addEventListener('click', window.openWarehouseModal);
    const btnDeleteWhModal = document.getElementById('btnDeleteWarehouseInModal');
    if (btnDeleteWhModal) btnDeleteWhModal.addEventListener('click', window.deleteEditingWarehouse);
    const btnCloseWh = document.getElementById('btnCloseWarehouseModal');
    if (btnCloseWh) btnCloseWh.addEventListener('click', window.closeWarehouseModal);
    const btnCancelWh = document.getElementById('btnCancelWarehouse');
    if (btnCancelWh) btnCancelWh.addEventListener('click', window.closeWarehouseModal);
    const whForm = document.getElementById('warehouseForm');
    if (whForm) whForm.addEventListener('submit', handleWarehouseSubmit);
    const whState = document.getElementById('whState');
    if (whState) whState.addEventListener('change', loadWarehouseDistricts);
    const whDistrict = document.getElementById('whDistrict');
    if (whDistrict) whDistrict.addEventListener('change', loadWarehouseWards);
    document.getElementsByName('whAddressDataType').forEach(r => r.addEventListener('change', async () => {
        updateWarehouseAddressUI();
        await loadWarehouseProvinces();
    }));
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('jtWarehousePickerMenu');
        const btn = document.getElementById('jtWarehousePickerButton');
        if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) menu.style.display = 'none';
    });

    // Copy Phone button handler
    document.getElementById('btnCopyPhone').addEventListener('click', () => {
        const phone = document.getElementById('detailsPhone').textContent;
        if (phone && phone !== 'Chưa cập nhật') {
            navigator.clipboard.writeText(phone);
            alert('Đã sao chép số điện thoại!');
        }
    });

    // Lightbox Modal Close Triggers
    const lightbox = document.getElementById('imageLightbox');
    if (lightbox) {
        lightbox.addEventListener('click', (e) => {
            if (e.target.id === 'imageLightbox' || e.target.classList.contains('lightbox-close')) {
                lightbox.style.display = 'none';
            }
        });
    }
}

// Global Image Zoom Function
window.viewFullImage = function(url) {
    const lightbox = document.getElementById('imageLightbox');
    const img = document.getElementById('lightboxImg');
    if (lightbox && img) {
        img.src = url;
        lightbox.style.display = 'flex';
    }
};

// Escape HTML utility helper
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ----------------------------------------------------
// 6. QUICK REPLIES LOGIC
// ----------------------------------------------------
async function fetchQuickReplies() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/quick_replies?select=*&order=created_at.desc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (response.ok) {
            quickReplies = await response.json();
            renderQuickReplies();
        }
    } catch (e) {
        console.error('Error fetching quick replies:', e);
    }
}

function renderQuickReplies(filterTerm = '') {
    const listEl = document.getElementById('quickReplyList');
    const popover = document.getElementById('quickReplyPopover');
    const addForm = document.getElementById('quickReplyForm');
    if (!listEl || !popover) return;

    let filtered = quickReplies;
    if (filterTerm && filterTerm.startsWith('/')) {
        const term = filterTerm.toLowerCase().substring(1);
        filtered = quickReplies.filter(qr => {
            const sc = (qr.shortcut || '').toLowerCase().replace(/^\//, '');
            return sc.startsWith(term) || (qr.content || '').toLowerCase().includes(term);
        });
    }

    if (filtered.length === 0) {
        if (filterTerm) popover.style.display = 'none';
        return;
    }

    if (filterTerm) {
        popover.style.display = 'flex';
        if (addForm) addForm.style.display = 'none';
        listEl.style.display = 'flex';
    }

    listEl.innerHTML = filtered.map(qr => `
        <div class="quick-reply-item-row" onclick="insertQuickReply('${(qr.content || '').replace(/'/g, "\\'")}', '${qr.image_url || ''}')" style="flex-direction: row; align-items: center; gap: 10px;">
            ${qr.image_url ? `<img src="${qr.image_url}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink:0;">` : ''}
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
                ${qr.shortcut ? `<span class="quick-reply-row-shortcut">${qr.shortcut}</span>` : ''}
                <div class="quick-reply-row-content" title="${qr.content}">${qr.content}</div>
            </div>
            <button type="button" class="edit-qr-btn" title="Chỉnh sửa tin nhắn mẫu" aria-label="Chỉnh sửa" onclick="editQuickReply(${qr.id}, event)" style="border:0;background:transparent;padding:5px;color:var(--primary);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            </button>
            <i data-lucide="trash-2" class="delete-qr-icon" style="width: 14px; height: 14px; color: var(--danger); cursor: pointer; flex-shrink:0;" onclick="deleteQuickReply(${qr.id}, event)"></i>
        </div>
    `).join('');
    
    if (window.lucide) lucide.createIcons();
}

window.sendSmaxImageMessage = async function(thread, imageUrl) {
    if (!thread || !imageUrl) return;
    const pagePid = thread.page_pid;
    let msgType = 'facebook_message';
    if (pagePid.toString().startsWith('ig')) msgType = 'instagram_message';
    else if (pagePid.toString().startsWith('tt')) msgType = 'tiktokweb_message';
    else if (pagePid.toString().startsWith('zl')) msgType = 'zaloweb_message';
    
    try {
        const resp = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${pagePid}/threads/${thread.tid}/messages`, {
            method: 'POST',
            headers: { 'Authorization': smaxToken, 'Content-Type': 'application/json', 'Origin': 'https://smax.ai', 'Referer': 'https://smax.ai/' },
            body: JSON.stringify({ type: msgType, messages: [{ temp_id: `${thread.tid}-${Date.now()}-img`, picture: imageUrl }] })
        });
        if (resp.ok) {
            // Nếu gửi ảnh cho chính hội thoại đang active thì render lên giao diện
            if (activeThread && activeThread.tid === thread.tid) {
                activeMessages.push({ attachments: [{ type: 'image', payload: { url: imageUrl } }], created_at: new Date().toISOString(), user_id: 1 });
                renderMessages();
            }
        } else {
            console.error('Send image api failed:', await resp.text());
        }
    } catch(e) { 
        console.error('Send image error:', e); 
    }
};

window.insertQuickReply = function(content, imageUrl) {
    const input = document.getElementById('messageInput');
    const popover = document.getElementById('quickReplyPopover');
    if (input) {
        if (input.value.startsWith('/')) {
            input.value = content;
        } else {
            input.value = input.value + content;
        }
        input.focus();
    }
    if (popover) {
        popover.style.display = 'none';
    }

    // Gửi ảnh của tin nhắn mẫu qua hàm vừa định nghĩa
    if (imageUrl && activeThread) {
        window.sendSmaxImageMessage(activeThread, imageUrl);
    }
};

window.editQuickReply = function(id, event) {
    if (event) event.stopPropagation();
    const qr = quickReplies.find(item => String(item.id) === String(id));
    if (!qr) return;
    const addForm = document.getElementById('quickReplyForm');
    const listEl = document.getElementById('quickReplyList');
    editingQuickReplyId = qr.id;
    document.getElementById('qrShortcutInput').value = qr.shortcut || '';
    document.getElementById('qrContentInput').value = qr.content || '';
    document.getElementById('qrImageInput').value = qr.image_url || '';
    if (listEl) listEl.style.display = 'none';
    if (addForm) addForm.style.display = 'block';
    const saveBtn = document.getElementById('btnSaveAddQR');
    if (saveBtn) saveBtn.textContent = 'Lưu thay đổi';
    document.getElementById('qrContentInput')?.focus();
};

async function deleteQuickReply(id, event) {
    if (event) event.stopPropagation();
    if (!confirm('Bạn có chắc muốn xóa tin nhắn mẫu này không?')) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/quick_replies?id=eq.${id}`, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (res.ok) {
            quickReplies = quickReplies.filter(qr => qr.id !== id);
            renderQuickReplies();
        }
    } catch (e) {
        console.error('Delete quick reply error:', e);
    }
}

// Bind keyboard listening for slash commands
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('messageInput');
    if (input) {
        input.addEventListener('input', () => {
            const val = input.value;
            if (val.startsWith('/')) {
                renderQuickReplies(val);
            } else {
                const popover = document.getElementById('quickReplyPopover');
                if (popover && popover.style.display === 'flex' && !val) {
                    popover.style.display = 'none';
                }
            }
        });
    }
});

window.copyToClipboard = function(text, event) {
    if (event) event.stopPropagation(); // prevent row click expand
    if (!text || text === '---') return;
    
    // Copy using navigator.clipboard or fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToastMessage("Đã copy: " + text);
        }).catch(err => {
            console.error("Failed to copy text: ", err);
            fallbackCopyText(text);
        });
    } else {
        fallbackCopyText(text);
    }
};

function showRobotMessageOverlay(messageText, externalLink) {
    let overlay = document.getElementById('robot-message-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'robot-message-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(0,0,0,0.45)';
        overlay.style.zIndex = '99999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '20px';
        overlay.innerHTML = `
            <div id="robot-message-card" style="width:min(720px,100%); max-height:90vh; overflow-y:auto; background:var(--bg-panel); border-radius:18px; box-shadow:0 24px 80px rgba(0,0,0,0.18); padding:24px; position:relative;">
                <button id="robot-message-close" style="position:absolute; top:16px; right:16px; border:none; background:none; color:var(--text-muted); font-size:18px; cursor:pointer;">×</button>
                <h3 style="margin:0 0 10px; font-size:1.15rem; color:var(--text-main);">Nội dung tin nhắn tự động</h3>
                <p style="margin:0 0 18px; color:var(--text-muted); font-size:0.9rem; line-height:1.5;">Bạn có thể copy nội dung bên dưới và dán vào khung chat hội thoại liên kết ngoài.</p>
                <textarea id="robot-message-textarea" style="width:100%; min-height:240px; border:1px solid var(--border); border-radius:12px; padding:14px; font-size:0.9rem; color:var(--text-main); background:var(--bg-card); resize:vertical; white-space:pre-wrap; line-height:1.5;">${escapeHtml(messageText)}</textarea>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:16px;">
                    <button id="robot-message-copy" style="padding:10px 16px; border:none; border-radius:10px; background:linear-gradient(135deg,var(--primary),#6366f1); color:#fff; font-weight:700; cursor:pointer;">Copy nội dung</button>
                    <button id="robot-message-open-link" ${externalLink ? '' : 'disabled'} style="padding:10px 16px; border-radius:10px; border:1px solid var(--border); font-weight:700; ${externalLink ? 'background:var(--bg-card); color:var(--text-main); cursor:pointer;' : 'background:var(--bg-card); color:var(--text-muted); cursor:not-allowed; opacity:0.5;'}">Mở hội thoại liên kết</button>
                    <button id="robot-message-close-btn" style="padding:10px 16px; border:none; border-radius:10px; background:var(--border); color:var(--text-main); font-weight:700; cursor:pointer;">Đóng</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeOverlay = () => {
            if (overlay) overlay.remove();
        };

        overlay.querySelector('#robot-message-close')?.addEventListener('click', closeOverlay);
        overlay.querySelector('#robot-message-close-btn')?.addEventListener('click', closeOverlay);
        overlay.querySelector('#robot-message-copy')?.addEventListener('click', () => {
            const text = document.getElementById('robot-message-textarea')?.value || '';
            if (text) copyToClipboard(text);
        });
        overlay.querySelector('#robot-message-open-link')?.addEventListener('click', () => {
            if (externalLink) {
                window.open(externalLink, '_blank');
            }
        });
    } else {
        const textarea = overlay.querySelector('#robot-message-textarea');
        if (textarea) textarea.value = messageText;
        const linkBtn = overlay.querySelector('#robot-message-open-link');
        if (linkBtn) {
            if (externalLink) {
                linkBtn.disabled = false;
                linkBtn.style.background = 'var(--bg-card)';
                linkBtn.style.color = 'var(--text-main)';
                linkBtn.style.cursor = 'pointer';
                linkBtn.style.opacity = '1';
            } else {
                linkBtn.disabled = true;
                linkBtn.style.background = 'var(--bg-card)';
                linkBtn.style.color = 'var(--text-muted)';
                linkBtn.style.cursor = 'not-allowed';
                linkBtn.style.opacity = '0.5';
            }
        }
    }
}

function fallbackCopyText(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";  //avoid scrolling to bottom
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToastMessage("Đã copy: " + text);
    } catch (err) {
        console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
}

function showToastMessage(msg) {
    if (typeof showToast === 'function') {
        showToast(msg);
    } else {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.backgroundColor = 'var(--primary)';
        toast.style.color = '#fff';
        toast.style.padding = '10px 16px';
        toast.style.borderRadius = '8px';
        toast.style.zIndex = '9999';
        toast.style.fontSize = '0.85rem';
        toast.style.fontWeight = '600';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }
}

function getStatusTextFromCode(statusCode) {
    const code = parseInt(statusCode, 10);
    switch (code) {
        case 0: return 'Chờ xử lý (Mới)';
        case 17: return 'Đã xác nhận';
        case 1: return 'Đã xác nhận';
        case 11: return 'Đang nhập hàng';
        case 20: return 'Đã mua hàng';
        case 8: return 'Đang đóng gói';
        case 18: return 'Gửi BE';
        case 19: return 'Gửi Grab';
        case 21: return 'Gửi GH khác';
        case 22: return 'Lấy tại shop';
        case 25: return 'Chờ Deal';
        case 9: return 'Chờ lấy hàng';
        case 24: return 'Đang vận chuyển';
        case 2: return 'Đang giao';
        case 3: return 'Hoàn thành';
        case 16: return 'Đã lấy hàng';
        case 6: return 'Đã hủy';
        case 4: return 'Đang trả hàng';
        case 5: return 'Đã trả hàng';
        case 23: return 'Trả hàng một phần';
        case 7: return 'Đã xóa';
        case 12: return 'Chờ in';
        case 13: return 'Đã in';
        default: return 'Chờ xử lý (Mới)';
    }
}

function normalizeStatusText(status) {
    if (status === null || status === undefined) return 'Chờ xử lý (Mới)';
    const raw = String(status).trim();
    if (!raw) return 'Chờ xử lý (Mới)';
    if (/^[0-9]+$/.test(raw)) {
        return getStatusTextFromCode(raw);
    }

    const normalizedKey = raw.toLowerCase();
    switch (normalizedKey) {
        case 'chờ xử lý (mới)':
        case 'chờ xử lý':
            return 'Chờ xử lý (Mới)';
        case 'đã xác nhận':
            return 'Đã xác nhận';
        case 'chờ deal':
            return 'Chờ Deal';
        case 'đã mua hàng':
            return 'Đã mua hàng';
        case 'đang đóng gói':
            return 'Đang đóng gói';
        case 'gửi be':
        case 'gửi b e':
            return 'Gửi BE';
        case 'gửi grab':
            return 'Gửi Grab';
        case 'gửi gh khác':
        case 'gửi gh khac':
            return 'Gửi GH khác';
        case 'lấy tại shop':
        case 'lay tai shop':
            return 'Lấy tại shop';
        case 'đang nhập hàng':
            return 'Đang nhập hàng';
        case 'chờ lấy hàng':
            return 'Chờ lấy hàng';
        case 'đang vận chuyển':
            return 'Đang vận chuyển';
        case 'đang giao':
            return 'Đang giao';
        case 'hoàn thành':
            return 'Hoàn thành';
        case 'đã lấy hàng':
            return 'Đã lấy hàng';
        case 'đã hủy':
            return 'Đã hủy';
        case 'đang trả hàng':
            return 'Đang trả hàng';
        case 'đã trả hàng':
            return 'Đã trả hàng';
        case 'trả hàng một phần':
            return 'Trả hàng một phần';
        case 'đã xóa':
            return 'Đã xóa';
        case 'chờ in':
            return 'Chờ in';
        case 'đã in':
            return 'Đã in';
        default:
            return raw;
    }
}

function getStatusCodeFromText(statusText) {
    if (statusText === null || statusText === undefined) return null;
    const normalized = String(statusText).trim().toLowerCase();
    switch (normalized) {
        case 'chờ xử lý (mới)':
        case 'chờ xử lý':
            return 0;
        case 'đã xác nhận':
            return 1;
        case 'chờ deal':
            return 25;
        case 'đã mua hàng':
            return 20;
        case 'đang đóng gói':
            return 8;
        case 'gửi be':
        case 'gửi b e':
            return 18;
        case 'gửi grab':
            return 19;
        case 'gửi gh khác':
        case 'gửi gh khac':
            return 21;
        case 'lấy tại shop':
        case 'lay tai shop':
            return 22;
        case 'đang nhập hàng':
            return 11;
        case 'chờ lấy hàng':
            return 9;
        case 'đang vận chuyển':
            return 24;
        case 'đang giao':
            return 2;
        case 'hoàn thành':
            return 3;
        case 'đã lấy hàng':
            return 16;
        case 'đã hủy':
            return 6;
        case 'đang trả hàng':
            return 4;
        case 'đã trả hàng':
            return 5;
        case 'trả hàng một phần':
            return 23;
        case 'đã xóa':
            return 7;
        case 'chờ in':
            return 12;
        case 'đã in':
            return 13;
        default:
            return null;
    }
}

function getStatusClass(status) {
    const st = normalizeStatusText(status);
    switch (st) {
        case 'Chờ xử lý (Mới)': return 'order-status-new';
        case 'Đã xác nhận': return 'order-status-confirmed';
        case 'Đang nhập hàng': return 'order-status-importing';
        case 'Đã mua hàng': return 'order-status-purchased';
        case 'Đang đóng gói': return 'order-status-packing';
        case 'Gửi BE': return 'order-status-be';
        case 'Gửi Grab': return 'order-status-grab';
        case 'Gửi GH khác': return 'order-status-gh-other';
        case 'Lấy tại shop': return 'order-status-pickup-shop';
        case 'Chờ Deal': return 'order-status-wait-deal';
        case 'Chờ lấy hàng': return 'order-status-wait-pickup';
        case 'Đang vận chuyển': return 'order-status-shipping';
        case 'Đang giao': return 'order-status-shipping';
        case 'Hoàn thành': return 'order-status-done';
        case 'Đã lấy hàng': return 'order-status-collected';
        case 'Đã hủy': return 'order-status-cancel';
        case 'Đang trả hàng': return 'order-status-returning';
        case 'Đã trả hàng': return 'order-status-returned';
        case 'Trả hàng một phần': return 'order-status-partial-return';
        case 'Đã xóa': return 'order-status-deleted';
        case 'Chờ in': return 'order-status-wait-print';
        case 'Đã in': return 'order-status-printed';
        default: return 'order-status-new';
    }
}

async function fetchCustomerOrdersHistory(thread) {
    const container = document.getElementById('customerOrdersList');
    if (!container) return;

    container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 16px 0;">🔄 Đang tải đơn hàng...</div>';

    try {
        const rawPid = (thread.page_pid || "").toString();
        const rawTid = (thread.tid || "").toString();
        const cleanPid = rawPid.replace(/^\D+/, "");
        const cleanTid = rawTid.replace(/^\D+/, "");

        const rawPhone = thread.customer?.phone || thread.customer?.phone_number || '';
        const cleanPhone = rawPhone.toString().replace(/[^0-9]/g, "");

        // Tập hợp tất cả các trường hợp định dạng ID của hội thoại để đối chiếu
        const possibilities = [
            `conversation_id.eq.${cleanPid}_${cleanTid}`,
            `conversation_id.eq.${rawPid}_${rawTid}`,
            `conversation_id.eq.${rawTid}`,
            `conversation_link.ilike.*${rawTid}*`
        ];
        if (cleanPhone) {
            possibilities.push(`bill_phone_number.eq.${cleanPhone}`);
        }

        let url = `${SUPABASE_URL}/rest/v1/pancake_orders?select=*,items:pancake_order_items(*)&order=inserted_at.desc&limit=10`;
        url += `&or=(${possibilities.join(',')})`;

        // Debug: log the final URL to help diagnose loading issues
        console.debug('fetchCustomerOrdersHistory -> URL:', url);
        const response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!response.ok) throw new Error('Failed to query orders from Supabase');

        const orders = await response.json();
        if (!orders || orders.length === 0) {
            container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 16px 0;">Không tìm thấy đơn hàng nào.</div>';
            return;
        }

        recentOrdersForEdit.length = 0;
        container.innerHTML = orders.map((order, orderIndex) => {
            recentOrdersForEdit.push(order);
            const statusText = normalizeStatusText(order.status);
            const statusClass = getStatusClass(statusText);

            const total = parseInt(order.total_price) || 0;
            const cod = parseInt(order.cod) || 0;
            const prepaid = parseInt(order.prepaid) || 0;
            const shippingFee = parseInt(order.shipping_fee) || 0;
            const surcharge = parseInt(order.surcharge) || 0;
            const items = order.items || [];
            
            const itemsSubtotal = items.reduce((sum, it) => sum + ((parseInt(it.retail_price || it.price) || 0) * (it.quantity || 1)), 0);

            const dateStr = order.inserted_at ? new Date(order.inserted_at).toLocaleDateString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : '---';

            const itemsHtml = items.map(item => {
                const imgUrl = item.variation_info?.images?.[0] || item.image || item.thumbnail || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=80&h=80&fit=crop';
                const itemNote = item.item_note || item.variation_info?.item_note || item.note || '';
                return `
                    <div style="font-size:0.78rem; display:flex; align-items:flex-start; gap:8px; margin-bottom:4px; color:var(--text-main);">
                        <img src="${imgUrl}" alt="Product" 
                             style="width:24px; height:24px; border-radius:4px; object-fit:cover; border:1px solid var(--border); flex-shrink:0; margin-top:2px;">
                        <div style="flex:1; min-width:0;">
                            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;" title="${item.product_name}">${item.product_name}</div>
                            ${itemNote ? `<div style="font-size:0.7rem; color:var(--primary); font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="Ghi chú: ${itemNote}">📝 ${itemNote}</div>` : ''}
                        </div>
                        <span style="font-weight:700; color:var(--text-muted); margin-left:auto;">x${item.quantity}</span>
                    </div>
                `;
            }).join('') || '<span style="color:var(--text-muted); font-size:0.75rem;">Không có sản phẩm</span>';

            const statusCodePreview = getStatusCodeFromText(statusText);
            const selectHtml = `
                <select class="order-status-badge ${statusClass}" 
                        onclick="event.stopPropagation();" 
                        onchange="updateOrderStatus('${order.id}', this.value, this); event.stopPropagation();" 
                        style="border: none; outline: none; cursor: pointer; padding: 4px 8px; border-radius: 8px; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; max-width:110px;">
                    <option value="Chờ xử lý (Mới)" ${statusCodePreview === 0 ? 'selected' : ''}>MỚI</option>
                    <option value="Đã xác nhận" ${statusCodePreview === 1 ? 'selected' : ''}>XÁC NHẬN</option>
                    <option value="Chờ Deal" ${statusCodePreview === 25 ? 'selected' : ''}>CHỜ DEAL</option>
                    <option value="Đã mua hàng" ${statusCodePreview === 20 ? 'selected' : ''}>MUA HÀNG</option>
                    <option value="Đang đóng gói" ${statusCodePreview === 8 ? 'selected' : ''}>ĐÓNG GÓI</option>
                    <option value="Gửi BE" ${statusCodePreview === 18 ? 'selected' : ''}>GỬI BE</option>
                    <option value="Gửi Grab" ${statusCodePreview === 19 ? 'selected' : ''}>GỬI Grab</option>
                    <option value="Gửi GH khác" ${statusCodePreview === 21 ? 'selected' : ''}>GỬI GH khác</option>
                    <option value="Lấy tại shop" ${statusCodePreview === 22 ? 'selected' : ''}>LẤY TẠI SHOP</option>
                    <option value="Đang nhập hàng" ${statusCodePreview === 11 ? 'selected' : ''}>NHẬP HÀNG</option>
                    <option value="Chờ lấy hàng" ${statusCodePreview === 9 ? 'selected' : ''}>CHỜ LẤY</option>
                    <option value="Đang vận chuyển" ${statusCodePreview === 24 ? 'selected' : ''}>ĐANG VẬN CHUYỂN</option>
                    <option value="Đang giao" ${statusCodePreview === 2 ? 'selected' : ''}>ĐANG GIAO</option>
                    <option value="Hoàn thành" ${statusCodePreview === 3 ? 'selected' : ''}>HOÀN THÀNH</option>
                    <option value="Đã hủy" ${statusCodePreview === 6 ? 'selected' : ''}>ĐÃ HỦY</option>
                    <option value="Đã xóa" ${statusCodePreview === 7 ? 'selected' : ''}>ĐÃ XÓA</option>
                    <option value="Chờ in" ${statusCodePreview === 12 ? 'selected' : ''}>CHỜ IN</option>
                    <option value="Đã in" ${statusCodePreview === 13 ? 'selected' : ''}>ĐÃ IN</option>
                </select>
            `;

            const jtWaybillId = order.spx_tn || order.sls_tn || order.order_sn || order.jt_waybill_id || '';
            const jtStatusName = order.spx_status_name || order.jt_status_name || '';
            const deliveryWarehouseAddress = order.warehouse_address || order.pickup_address || order.sender_address || order.jt_sender_address || order.spx_pickup_address || '';
            let jtStatusColor = '#64748b';
            if (order.jt_status_code === 100) jtStatusColor = 'var(--success)';
            else if (order.jt_status_code === 94 || order.jt_status_code === 2) jtStatusColor = 'var(--primary)';
            else if (order.jt_status_code === 10 || order.jt_status_code === 1) jtStatusColor = '#2563eb';

            let jtActionHtml = '';
            if (jtWaybillId) {
                jtActionHtml = `
                    <div style="display:flex; flex-direction:column; gap:4px; margin-top:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;">
                            <a class="jt-waybill-link" href="bill.html?waybillId=${encodeURIComponent(jtWaybillId)}" target="_blank" rel="noopener noreferrer" style="font-family:monospace; font-weight:700; color:var(--text-main); text-decoration:underline; cursor:pointer;">
                                ${jtWaybillId}
                            </a>
                            ${jtStatusName ? `<span style="font-weight:600; color:${jtStatusColor};">${jtStatusName}</span>` : ''}
                        </div>
                        <div style="display:flex; gap:5px; width:100%;">
                        <button class="btn-primary-quick" onclick="window.openJtWaybillPrintPreview('${order.id}', event)" style="flex:1; padding:4px; font-size:0.7rem; border-radius:6px; background-color:#dc2626; color:#fff; border:none; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:3px;">
                            <i data-lucide="printer" style="width:12px;height:12px;"></i> In bill
                        </button>
                        <button class="btn-danger-quick" onclick="cancelSpxOrder('${order.id}', '${jtWaybillId}', event)" style="flex:1; padding:4px; font-size:0.7rem; border-radius:6px; background-color:#ef4444; color:#fff; border:none; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:2px;">
                            <i data-lucide="x-circle" style="width:12px;height:12px;"></i> Hủy SPX
                        </button>
                        </div>
                    </div>
                `;
            } else {
                jtActionHtml = `
                    <button class="btn-primary-quick" onclick="openSpxCreateModal('${order.id}', event)" style="width:100%; padding:5px; font-size:0.72rem; border-radius:6px; background-color:#ff4d2d; color:#fff; border:none; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:4px; margin-top:8px;">
                        <i data-lucide="send" style="width:12px;height:12px;"></i> Gửi SPX
                    </button>
                `;
            }

            return `
                <div class="order-history-card" style="border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 14px; background: var(--bg-panel); display: flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div class="order-card-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:8px;">
                        <span class="order-card-id" style="font-weight:800; color:var(--text-main); font-size:0.85rem;">Đơn ${order.display_id || order.id}</span>
                        ${selectHtml}
                    </div>
                    
                    <div style="font-size:0.8rem; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
                        <div><strong style="color:var(--text-main);">Người nhận:</strong> ${order.bill_full_name || '---'}</div>
                        <div><strong style="color:var(--text-main);">SĐT:</strong> ${order.bill_phone_number || '---'}</div>
                        <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${order.shipping_address?.full_address || order.shipping_address?.address || ''}">
                            <strong style="color:var(--text-main);">Địa chỉ:</strong> ${order.shipping_address?.full_address || order.shipping_address?.address || '---'}
                        </div>
                    </div>

                    <div class="order-items-wrapper" style="background:var(--bg-card); padding:8px; border-radius:8px; margin:2px 0; border:1px solid var(--border);">
                        ${itemsHtml}
                    </div>

                    <div class="order-card-footer" style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; border-top:1px solid var(--border); padding-top:8px;">
                        <span class="order-date-time" style="font-size:0.75rem; color:var(--text-muted);">${dateStr}</span>
                        <div style="text-align:right;">
                            <div style="font-size:0.75rem; color:var(--text-muted);">COD: <strong style="color:var(--danger); font-size:0.85rem;">${cod.toLocaleString('vi-VN')} đ</strong></div>
                            <div style="font-size:0.72rem; color:var(--text-muted);">Tổng: <strong style="color:var(--primary);">${total.toLocaleString('vi-VN')} đ</strong></div>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
                        <div style="width:100%;">
                            ${jtActionHtml}
                        </div>
                        <div style="display:flex; gap:6px; justify-content:flex-end; align-items:center;">
                            <button onclick="sendInvoiceImageFromDashboard('${order.id}', '${order.display_id || order.id}', event)" title="Gửi ảnh bill cho khách trong hội thoại này" style="padding:5px 9px; font-size:0.72rem; border-radius:6px; background:var(--bg-card); border:1px solid var(--border); color:var(--text-main); cursor:pointer; display:inline-flex; align-items:center; gap:4px; height:27px;">
                                <i data-lucide="send" style="width:12px;height:12px;"></i> Gửi bill
                            </button>
                            <button onclick="openRecentOrderEdit(${orderIndex})" style="padding:5px 10px; font-size:0.75rem; border-radius:6px; background:var(--bg-card); border:1px solid var(--border); color:var(--text-main); cursor:pointer; display:inline-flex; align-items:center; gap:4px; height:27px;">
                                <i data-lucide="edit-3" style="width:12px;height:12px;"></i> Sửa nhanh
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error('Fetch orders history error:', e);
        container.innerHTML = '<div style="font-size: 0.8rem; color: var(--danger); text-align: center; padding: 16px 0;">Không thể tải lịch sử đơn hàng.</div>';
    }
}

// ----------------------------------------------------
// 8. GLOBAL ORDERS DASHBOARD (SUPABASE)
// ----------------------------------------------------
async function fetchDashboardOrders() {
    const tableBody = document.getElementById('dashboardOrdersTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">
                🔄 Đang tải danh sách đơn hàng...
            </td>
        </tr>`;

    try {
        const searchInput = document.getElementById('dashboardOrderSearch');
        const statusFilter = document.getElementById('dashboardOrderStatusFilter');
        
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const selectedStatus = statusFilter ? statusFilter.value : 'all';
        const warehouseFilter = document.getElementById('dashboardWarehouseFilter');
        const selectedWarehouse = warehouseFilter ? warehouseFilter.value : 'all';
        const warehouseWrap = document.getElementById('dashboardWarehouseFilterWrap');
        const isPrintFilter = ['print_pending','Chờ in','printed','Đã in'].includes(selectedStatus);
        if (warehouseWrap) warehouseWrap.style.display = isPrintFilter ? 'block' : 'none';

        const offset = dashboardOrdersPage * DASHBOARD_ORDERS_LIMIT;
        
        // Base query - fetch orders first. Nested-selects can time out on Supabase/Postgres,
        // so items are joined separately in a second request.
        let url = `${SUPABASE_URL}/rest/v1/pancake_orders?select=*&order=inserted_at.desc&limit=${DASHBOARD_ORDERS_LIMIT}&offset=${offset}`;

        let filters = [];
        
        // 1. Filter by Status (If status is chosen, parse it properly to integer comparison)
        if (selectedStatus !== 'all') {
            // Support multiple representations for print-related filters:
            // - internal values: 'print_pending' / 'printed'
            // - dropdown labels: 'Chờ in' / 'Đã in'
            if (selectedStatus === 'print_pending' || selectedStatus === 'Chờ in') {
                // Orders that have a J&T waybill but haven't had a bill printed yet
                filters.push('jt_waybill_id=not.is.null');
                filters.push('bill_print_count=eq.0');
            } else if (selectedStatus === 'printed' || selectedStatus === 'Đã in') {
                // Orders that have a J&T waybill and have been printed at least once
                filters.push('jt_waybill_id=not.is.null');
                filters.push('bill_print_count=gte.1');
            } else {
                // For other status values, try matching both text and numeric forms.
                if (!isNaN(selectedStatus)) {
                    filters.push(`status=eq.${selectedStatus}`);
                } else {
                    try {
                        const mappedCode = getStatusCodeFromText(selectedStatus);
                        const encodedLabel = encodeURIComponent(`"${selectedStatus}"`);
                        if (mappedCode !== null && mappedCode !== undefined) {
                            const encodedCodeString = encodeURIComponent(`"${mappedCode}"`);
                            if (selectedStatus === 'Chờ xử lý (Mới)') {
                                filters.push(`or=(status.eq.${encodedLabel},status.eq.${encodedCodeString},status.is.null)`);
                            } else {
                                filters.push(`or=(status.eq.${encodedLabel},status.eq.${encodedCodeString})`);
                            }
                        } else {
                            filters.push(`status=eq.${encodedLabel}`);
                        }
                    } catch (e) {
                        filters.push(`status=eq.${encodeURIComponent(`"${selectedStatus}"`)}`);
                    }
                }
            }
        }

        // 2. Search robustly: direct order fields and product-name matches are queried separately.
        // Avoids generating one huge PostgREST OR clause when a short product keyword matches many rows.
        let orders = [];
        if (searchTerm) {
            const searchHeaders = {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            };
            const statusQuery = filters.length > 0 ? '&' + filters.join('&') : '';

            const directConditions = [
                `bill_full_name.ilike.*${encodeURIComponent(searchTerm)}*`,
                `bill_phone_number.ilike.*${encodeURIComponent(searchTerm)}*`,
                `note.ilike.*${encodeURIComponent(searchTerm)}*`
            ];
            if (!isNaN(searchTerm)) {
                directConditions.push(`id.eq.${encodeURIComponent(searchTerm)}`);
                directConditions.push(`display_id.eq.${encodeURIComponent(searchTerm)}`);
            }

            const directUrl = `${SUPABASE_URL}/rest/v1/pancake_orders?select=*&order=inserted_at.desc&limit=1000${statusQuery}&or=(${directConditions.join(',')})`;
            const productItemsUrl = `${SUPABASE_URL}/rest/v1/pancake_order_items?select=order_id&product_name=ilike.*${encodeURIComponent(searchTerm)}*&limit=5000`;

            const [directRes, productItemsRes] = await Promise.all([
                fetch(directUrl, { headers: searchHeaders }),
                fetch(productItemsUrl, { headers: searchHeaders })
            ]);

            let directOrders = [];
            if (directRes.ok) {
                directOrders = await directRes.json();
            } else {
                console.warn('Direct order search failed:', directRes.status, await directRes.text());
            }

            let productOrderIds = [];
            if (productItemsRes.ok) {
                const matchedItems = await productItemsRes.json();
                productOrderIds = [...new Set((matchedItems || [])
                    .map(x => x.order_id)
                    .filter(v => v !== null && v !== undefined))];
            } else {
                console.warn('Product-name search failed:', productItemsRes.status, await productItemsRes.text());
            }

            const productOrders = [];
            const CHUNK_SIZE = 80;
            for (let i = 0; i < productOrderIds.length; i += CHUNK_SIZE) {
                const chunk = productOrderIds.slice(i, i + CHUNK_SIZE);
                const idList = chunk.map(id => encodeURIComponent(String(id))).join(',');
                const chunkUrl = `${SUPABASE_URL}/rest/v1/pancake_orders?select=*&id=in.(${idList})&limit=1000${statusQuery}`;
                const chunkRes = await fetch(chunkUrl, { headers: searchHeaders });
                if (chunkRes.ok) {
                    productOrders.push(...await chunkRes.json());
                } else {
                    console.warn('Product order chunk fetch failed:', chunkRes.status, await chunkRes.text());
                }
            }

            const merged = new Map();
            [...directOrders, ...productOrders].forEach(order => {
                if (order && order.id !== undefined && order.id !== null) {
                    merged.set(String(order.id), order);
                }
            });

            const allMatches = [...merged.values()].sort((a, b) => {
                const ta = new Date(a.inserted_at || a.created_at || 0).getTime();
                const tb = new Date(b.inserted_at || b.created_at || 0).getTime();
                return tb - ta;
            });

            orders = allMatches.slice(offset, offset + DASHBOARD_ORDERS_LIMIT);
            window.__dashboardOrderSearchTotal = allMatches.length;
        } else {
            if (filters.length > 0) {
                url += '&' + filters.join('&');
            }

            const response = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });

            if (!response.ok) {
                const body = await response.text();
                console.error('Dashboard orders request failed:', response.status, body);
                throw new Error('Supabase request failed');
            }

            orders = await response.json();
            window.__dashboardOrderSearchTotal = null;
        }

        // Proactively fetch order items separately to avoid nested-select statement timeouts.
        try {
            const orderIds = (orders || []).map(o => o.id).filter(Boolean);
            if (orderIds.length > 0) {
                const itemsUrl = `${SUPABASE_URL}/rest/v1/pancake_order_items?select=*&order_id=in.(${orderIds.map(encodeURIComponent).join(',')})`;
                const itemsRes = await fetch(itemsUrl, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                });
                if (itemsRes.ok) {
                    const items = await itemsRes.json();

                    // Gắn link sản phẩm từ pancake_products vào từng order item.
                    const productIds = [...new Set(items.map(it => it.product_id).filter(Boolean))];
                    let productLinkMap = new Map();
                    if (productIds.length > 0) {
                        try {
                            const productsUrl = SUPABASE_URL + '/rest/v1/pancake_products?select=id,product_link&id=in.(' + productIds.map(encodeURIComponent).join(',') + ')';
                            const productsRes = await fetch(productsUrl, {
                                headers: {
                                    'apikey': SUPABASE_KEY,
                                    'Authorization': 'Bearer ' + SUPABASE_KEY
                                }
                            });
                            if (productsRes.ok) {
                                const productRows = await productsRes.json();
                                productLinkMap = new Map(productRows.map(p => [String(p.id), p.product_link || '']));
                            } else {
                                console.warn('Product link lookup failed:', productsRes.status, await productsRes.text());
                            }
                        } catch (linkErr) {
                            console.warn('Product link lookup error:', linkErr);
                        }
                    }

                    const itemMap = Object.create(null);
                    items.forEach(it => {
                        const key = it.order_id;
                        if (!itemMap[key]) itemMap[key] = [];
                        itemMap[key].push(Object.assign({}, it, {
                            product_link: it.product_link || productLinkMap.get(String(it.product_id)) || ''
                        }));
                    });
                    orders = (orders || []).map(order => Object.assign({}, order, { items: itemMap[order.id] || [] }));
                }
            }
        } catch (e) {
            console.warn('Order items fallback fetch failed:', e);
        }

        // Resolve warehouse_id on each order to the warehouses table for delivery display.
        try {
            const warehouseIds = [...new Set((orders || []).map(o => o.warehouse_id).filter(Boolean))];
            if (warehouseIds.length) {
                const whUrl = `${SUPABASE_URL}/rest/v1/warehouses?select=*&id=in.(${warehouseIds.map(encodeURIComponent).join(',')})`;
                const whRes = await fetch(whUrl, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
                if (whRes.ok) {
                    const whRows = await whRes.json();
                    const whMap = new Map(whRows.map(w => [String(w.id), w]));
                    orders = (orders || []).map(o => Object.assign({}, o, { warehouse: whMap.get(String(o.warehouse_id)) || null }));
                    const whFilter = document.getElementById('dashboardWarehouseFilter');
                    if (whFilter) {
                        const prev = whFilter.value || 'all';
                        whFilter.innerHTML = '<option value="all">Tất cả kho lấy hàng</option>' + whRows.map(w => '<option value="' + String(w.id) + '">' + escapeHtml([w.sender_name,w.sender_detail_address,w.sender_city,w.sender_state].filter(Boolean).join(' - ') || ('Kho '+w.id)) + '</option>').join('');
                        if (Array.from(whFilter.options).some(o => o.value === prev)) whFilter.value = prev;
                    }
                    if (isPrintFilter && selectedWarehouse !== 'all') orders = orders.filter(o => String(o.warehouse_id || '') === String(selectedWarehouse));
                } else console.warn('Warehouse lookup failed:', whRes.status, await whRes.text());
            }
        } catch (e) { console.warn('Warehouse lookup error:', e); }

        // Update total orders counter display
        const countSpan = document.getElementById('ordersTotalCount');
        const mobileCountSpan = document.getElementById('ordersTotalCountMobile');
        if (countSpan) {
            countSpan.textContent = orders.length > 0 ? (offset + orders.length) + '+' : '0';
        }
        if (mobileCountSpan) {
            // For mobile show short form like "2 ĐH" (no plus)
            mobileCountSpan.textContent = orders.length > 0 ? (offset + orders.length) : '0';
        }

        // Enable/Disable pagination buttons
        const btnPrev = document.getElementById('btnPrevOrdersPage');
        const btnNext = document.getElementById('btnNextOrdersPage');
        if (btnPrev) btnPrev.disabled = dashboardOrdersPage === 0;
        if (btnNext) btnNext.disabled = orders.length < DASHBOARD_ORDERS_LIMIT;

        if (!orders || orders.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">
                        Không tìm thấy đơn hàng nào.
                    </td>
                </tr>`;
            return;
        }

        tableBody.innerHTML = orders.map(order => {
            const statusText = normalizeStatusText(order.status);
            const statusClass = getStatusClass(statusText);

            const total = parseInt(order.total_price) || 0;
            const cod = parseInt(order.cod) || 0;
            const prepaid = parseInt(order.prepaid) || 0;
            const shippingFee = parseInt(order.shipping_fee) || 0;
            const surcharge = parseInt(order.surcharge) || 0;
            const items = order.items || [];
            
            // Calculate item subtotal
            const itemsSubtotal = items.reduce((sum, it) => sum + ((parseInt(it.retail_price || it.price) || 0) * (it.quantity || 1)), 0);
            const isPaidInFull = (cod === 0) || (prepaid >= total);

            const dateStr = order.inserted_at ? new Date(order.inserted_at).toLocaleDateString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : '---';

            const itemsHtml = items.map(item => {
                const imgUrl = item.variation_info?.images?.[0] || item.image || item.thumbnail || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=80&h=80&fit=crop';
                const itemNote = item.item_note || item.variation_info?.item_note || item.note || '';
                return `
                    <div style="font-size:0.8rem; display:flex; align-items:flex-start; gap:8px; margin-bottom:4px;">
                        <img src="${imgUrl}" alt="Product" 
                             onclick="window.viewFullImage(this.src); event.stopPropagation();" 
                             style="width:28px; height:28px; border-radius:4px; object-fit:cover; border:1px solid #e2e8f0; cursor:pointer; flex-shrink:0; margin-top:2px;" 
                             title="Click để phóng to ảnh">
                        <div style="flex:1; min-width:0;">
                            <span style="word-break:break-word; max-width:180px; line-height:1.2; font-size:0.78rem;">${item.product_name}</span>
                            ${item.product_link ? `<a href="${escapeHtml(item.product_link)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" style="display:inline-flex;align-items:center;gap:3px;margin-top:2px;font-size:0.7rem;color:var(--primary);text-decoration:none;" title="${escapeHtml(item.product_link)}">🔗 Link sản phẩm</a>` : ''}
                            ${itemNote ? `<div style="font-size:0.72rem; color:var(--primary); font-style:italic; word-break:break-word; line-height:1.1; margin-top:1px;" title="Ghi chú: ${itemNote}">📝 ${itemNote}</div>` : ''}
                        </div>
                        <span style="font-weight:700; color:var(--text-muted); margin-left:auto; padding-left:6px;">x${item.quantity}</span>
                    </div>
                `;
            }).join('') || '<span style="color:var(--text-muted); font-size:0.75rem;">Không có sản phẩm</span>';

            // Select dropdown with colored backgrounds containing all Pancake status options
            const statusCode = getStatusCodeFromText(statusText);
            const selectHtml = `
                <select class="order-status-badge ${statusClass}"
                        onclick="event.stopPropagation();"
                        onchange="updateOrderStatus('${order.id}', this.value, this); event.stopPropagation();"
                        style="border: none; outline: none; cursor: pointer; padding: 6px 12px; border-radius: 12px; font-weight: 700; font-size: 0.72rem; text-transform: uppercase;">
                    <option value="Chờ xử lý (Mới)" ${statusCode === 0 ? 'selected' : ''}>Chờ xử lý (Mới)</option>
                    <option value="Đã xác nhận" ${statusCode === 1 ? 'selected' : ''}>Đã xác nhận</option>
                    <option value="Chờ Deal" ${statusCode === 25 ? 'selected' : ''}>Chờ Deal</option>
                    <option value="Đã mua hàng" ${statusCode === 20 ? 'selected' : ''}>Đã mua hàng</option>
                    <option value="Đang đóng gói" ${statusCode === 8 ? 'selected' : ''}>Đang đóng gói</option>
                    <option value="Gửi BE" ${statusCode === 18 ? 'selected' : ''}>Gửi BE</option>
                    <option value="Gửi Grab" ${statusCode === 19 ? 'selected' : ''}>Gửi Grab</option>
                    <option value="Gửi GH khác" ${statusCode === 21 ? 'selected' : ''}>Gửi GH khác</option>
                    <option value="Lấy tại shop" ${statusCode === 22 ? 'selected' : ''}>Lấy tại shop</option>
                    <option value="Đã lấy hàng" ${statusCode === 16 ? 'selected' : ''}>Đã lấy hàng</option>
                    <option value="Đang nhập hàng" ${statusCode === 11 ? 'selected' : ''}>Đang nhập hàng</option>
                    <option value="Chờ lấy hàng" ${statusCode === 9 ? 'selected' : ''}>Chờ lấy hàng</option>
                    <option value="Đang vận chuyển" ${statusCode === 24 ? 'selected' : ''}>Đang vận chuyển</option>
                    <option value="Đang giao" ${statusCode === 2 ? 'selected' : ''}>Đang giao</option>
                    <option value="Hoàn thành" ${statusCode === 3 ? 'selected' : ''}>Hoàn thành</option>
                    <option value="Đã hủy" ${statusCode === 6 ? 'selected' : ''}>Đã hủy</option>
                    <option value="Đã xóa" ${statusCode === 7 ? 'selected' : ''}>Đã xóa</option>
                    <option value="Chờ in" ${statusCode === 12 ? 'selected' : ''}>Chờ in</option>
                    <option value="Đã in" ${statusCode === 13 ? 'selected' : ''}>Đã in</option>
                </select>
            `;

            // Parse SPX / J&T data from order metadata
            const jtWaybillId = order.spx_tn || order.sls_tn || order.order_sn || order.jt_waybill_id || '';
            const jtStatusName = order.spx_status_name || order.jt_status_name || '';
            const deliveryWarehouse = order.warehouse || null;
            const deliveryWarehouseAddress = deliveryWarehouse ? [deliveryWarehouse.sender_detail_address, deliveryWarehouse.sender_city, deliveryWarehouse.sender_state].filter(Boolean).join(', ') : '';
            let jtStatusColor = '#64748b';
            if (order.jt_status_code === 100) jtStatusColor = 'var(--success)';
            else if (order.jt_status_code === 94 || order.jt_status_code === 2) jtStatusColor = 'var(--primary)';
            else if (order.jt_status_code === 10 || order.jt_status_code === 1) jtStatusColor = '#2563eb';

            let jtColumnHtml = '';
            if (jtWaybillId) {
                jtColumnHtml = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <a class="jt-waybill-link" href="bill.html?waybillId=${encodeURIComponent(jtWaybillId)}" target="_blank" rel="noopener noreferrer" style="font-family:monospace; font-weight:700; color:var(--text-main); font-size:0.82rem; text-decoration:underline;">
                            ${jtWaybillId}
                        </a>
                        ${deliveryWarehouseAddress ? `<div style="font-size:0.72rem; color:var(--text-muted); line-height:1.3; max-width:190px;"><strong>Kho giao:</strong> ${escapeHtml(deliveryWarehouseAddress)}</div>` : ''}
                        ${jtStatusName ? `<span style="font-size:0.75rem; font-weight:600; color:${jtStatusColor};">${jtStatusName}</span>` : ''}
                        <div style="display:flex; gap:4px; margin-top:2px; align-items:center;">
                            <button class="btn-primary-quick" onclick="window.openJtWaybillPrintPreview('${order.id}', event)" style="padding:3px 6px; font-size:0.68rem; border-radius:4px; background-color:#DC2626; color:#fff; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:2px;">
                                <i data-lucide="printer" style="width:10px; height:10px;"></i>
                                In bill
                            </button>
                            <button class="btn-danger-quick" onclick="cancelSpxOrder('${order.id}', '${(order.order_spx || jtWaybillId).replace(/'/g, "\\'")}', event)" style="padding:3px 6px; font-size:0.68rem; border-radius:4px; background-color:#ef4444; color:#fff; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:2px;">
                                <i data-lucide="x-circle" style="width:10px; height:10px;"></i>
                                Hủy
                            </button>
                        </div>
                        ${order.bill_print_count ? `<div style="font-size:0.75rem; color:var(--text-muted);">Đã in bill: ${order.bill_print_count} lần</div>` : ''}
                    </div>
                `;
            } else {
                jtColumnHtml = `
                    <button class="btn-primary-quick" onclick="openSpxCreateModal('${order.id}', event)" style="padding:6px 12px; font-size:0.75rem; border-radius:6px; display:inline-flex; align-items:center; gap:4px; background-color:#ff4d2d; color:#fff; font-weight:700;">
                        <i data-lucide="truck" style="width:12px; height:12px;"></i>
                        Gửi SPX
                    </button>
                `;
            }

            const platformStr = order.page_id || order.conversation_id || order.conversation_link || '';
            const platformIconHtml = getPlatformIcon(platformStr, 15);
            const conversationLink = order.conversation_link || '';
            const tidMatch = conversationLink.match(/tid=([^&]+)/);
            const hasExternalChatLink = /^https?:\/\//i.test(conversationLink) || (tidMatch && linkedCustomersMap.has(tidMatch[1]));

            return `
                <tr class="order-summary-row" onclick="toggleOrderEditRow('${order.id}')" data-conv-id="${order.conversation_id || ''}">
                    <td style="font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:6px;">
                        <span class="order-platform-logo">${platformIconHtml}</span>
                        <span class="order-display-id copyable-cell" ondblclick="copyToClipboard('${order.display_id || order.id}', event)" title="Double-click để copy mã đơn">${order.display_id || order.id}</span>
                        ${hasExternalChatLink ? `<span title="Đã liên kết hội thoại ngoài" style="color:var(--success); font-size:0.92rem;">🔗</span>` : ''}
                        <span class="order-mobile-date" style="font-size:0.72rem; color:#94a3b8; font-weight:500; margin-left:8px;">${dateStr}</span>
                        <div class="order-chat-btn-wrap" style="margin-left: 10px;">
                            <button class="btn-primary-quick order-chat-btn" onclick="goToOrderChat('${order.conversation_link || ''}', event)">
                                <i data-lucide="message-square" style="width:12px; height:12px;"></i>
                                Xem Chat
                            </button>
                        </div>
                    </td>
                    <td style="font-weight:600;"><span class="copyable-cell" ondblclick="copyToClipboard('${(order.bill_full_name || 'Khách hàng').replace(/'/g, "\\'")}', event)" title="Double-click để copy tên">${order.bill_full_name || 'Khách hàng'}</span></td>
                    <td><span class="copyable-cell" ondblclick="copyToClipboard('${order.bill_phone_number || '---'}', event)" title="Double-click để copy SĐT">${order.bill_phone_number || '---'}</span></td>
                    <td>
                        <div style="max-height:80px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; max-width:200px;">
                            ${itemsHtml}
                        </div>
                    </td>
                    <td style="font-weight:700; color:var(--primary); white-space:nowrap;">
                        ${total.toLocaleString('vi-VN')} đ
                        ${isPaidInFull ? '<div style="font-size:0.72rem; color:var(--success); margin-top:4px;">✅ Đã TT đủ</div>' : ''}
                    </td>
                    <td>
                        ${selectHtml}
                    </td>
                    <td>
                        ${jtColumnHtml}
                    </td>
                    <td style="font-size:0.78rem; color:var(--text-muted);">${dateStr}</td>
                </tr>
                <tr id="edit-row-${order.id}" class="order-edit-detail-row" style="display: none;">
                    <td colspan="8">
                        <div class="order-edit-container">
                            <!-- Col 1: Customer + Recipient Details -->
                            <div class="order-edit-col">
                                <div class="order-edit-col-title">Thông tin giao hàng</div>

                                <!-- 1a: Khách hàng (read-only) -->
                                <div style="background:var(--bg-app);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
                                    <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:var(--primary);margin-bottom:8px;letter-spacing:0.05em;">👤 Khách hàng</div>
                                    <div id="edit-cust-info-${order.id}" style="display:flex;flex-direction:column;gap:6px;">
                                        <div style="font-size:0.82rem;color:var(--text-muted);">Đang tải...</div>
                                    </div>
                                </div>

                                <!-- 1b: Người nhận (editable) -->
                                <div style="background:var(--bg-app);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
                                    <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;letter-spacing:0.05em;">📦 Người nhận</div>
                                    <div style="display:flex; flex-direction:row; gap:6px; width:100%; box-sizing:border-box;">
                                        <div class="edit-input-group" style="flex:1 1 0%; min-width:0;">
                                            <label style="font-size:0.75rem; font-weight:600; color:var(--text-muted);">Tên người nhận</label>
                                            <input type="text" id="edit-name-${order.id}" value="${order.bill_full_name || ''}" style="width:100%; box-sizing:border-box; min-width:0;">
                                        </div>
                                        <div class="edit-input-group" style="flex:1 1 0%; min-width:0;">
                                            <label style="font-size:0.75rem; font-weight:600; color:var(--text-muted);">SĐT</label>
                                            <input type="text" id="edit-phone-${order.id}" value="${order.bill_phone_number || ''}" style="width:100%; box-sizing:border-box; min-width:0;">
                                        </div>
                                    </div>
                                    <div class="edit-input-group" style="width:100% !important; margin-top:8px !important;">
                                        <label style="font-size:0.75rem; font-weight:600; color:var(--text-muted);">Địa chỉ chi tiết</label>
                                        <textarea id="edit-address-${order.id}" rows="2" style="width:100% !important; box-sizing:border-box !important;">${order.shipping_address?.full_address || order.shipping_address?.address || ''}</textarea>
                                    </div>
                                </div>
                            </div>

                            <!-- Col 2: Products editable -->
                            <div class="order-edit-col">
                                <div class="order-edit-col-title">Sản phẩm (<span id="product-count-${order.id}">${items.length}</span>)</div>
                                <div id="product-list-${order.id}" style="display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; padding-right:4px;">
                                    ${items.map((it, idx) => {
                                        const thumb = it.variation_info?.images?.[0] || it.image || it.thumbnail || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=80&h=80&fit=crop';
                                        const price = parseInt(it.retail_price || it.price) || 0;
                                        const discount = parseInt(it.discount_each_product || it.discount) || 0;
                                        return `
                                            <div class="order-product-row" data-idx="${idx}" data-price="${price}" data-discount="${discount}" data-product-id="${it.product_id || ''}" data-variation-id="${it.variation_id || ''}" data-sku="${it.sku || ''}" data-thumb="${thumb}" data-name="${it.product_name || it.name || ''}" style="display:flex; flex-direction:column; gap:6px; padding:8px; border-radius:8px; background:var(--bg-app); border:1px solid var(--border); margin-bottom:4px;">
                                                <div style="display:flex; gap:8px; align-items:center;">
                                                    <img src="${thumb}" onclick="window.viewFullImage(this.src)" style="width:38px; height:38px; border-radius:6px; object-fit:cover; border:1px solid var(--border); flex-shrink:0; cursor:pointer;" onerror="this.style.opacity='0.3'" title="Click để phóng to ảnh">
                                                    <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;">
                                                        <input type="text" class="product-name-input" value="${it.product_name || it.name || ''}" style="width:100%; font-weight:600; font-size:0.78rem; color:var(--text-main); border:none; background:transparent; padding:2px 0; outline:none; border-bottom:1px dashed transparent; text-overflow:ellipsis;" onfocus="this.style.borderBottomColor='var(--primary)'" onblur="this.style.borderBottomColor='transparent'" title="Sửa tên sản phẩm trực tiếp">
                                                        <div style="display:flex; align-items:center; gap:2px;">
                                                            <input type="number" class="product-price-input" value="${price}" style="width:75px; font-size:0.72rem; color:var(--text-muted); border:none; background:transparent; outline:none; padding:1px 0; border-bottom:1px dashed transparent; font-weight:500;" onfocus="this.style.borderBottomColor='var(--primary)'" onblur="this.style.borderBottomColor='transparent'" oninput="updateProductPriceLive('${order.id}', ${idx}, this)" title="Sửa đơn giá trực tiếp">
                                                            <span style="font-size:0.7rem; color:var(--text-muted);">đ</span>
                                                        </div>
                                                    </div>
                                                    <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                                                        <button onclick="changeProductQty('${order.id}', ${idx}, -1, ${itemsSubtotal})" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer;font-size:0.85rem;display:inline-flex;align-items:center;justify-content:center;padding:0;">−</button>
                                                        <input type="number" class="product-qty-input" value="${it.quantity}" min="1" data-price="${price}"
                                                               oninput="updateProductQtyInput('${order.id}', ${idx}, this, ${itemsSubtotal})"
                                                               style="width:32px;height:20px;text-align:center;border-radius:4px;border:1px solid var(--border);background:var(--bg-panel);color:var(--text-main);font-size:0.75rem;padding:0;">
                                                        <button onclick="changeProductQty('${order.id}', ${idx}, 1, ${itemsSubtotal})" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer;font-size:0.85rem;display:inline-flex;align-items:center;justify-content:center;padding:0;">+</button>
                                                        <button onclick="removeOrderProduct('${order.id}', ${idx}, ${itemsSubtotal})" style="width:20px;height:20px;border-radius:4px;border:1px solid #fee2e2;background:#fef2f2;color:#ef4444;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;" title="Xóa">
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                                <!-- Discount KM row -->
                                                <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px dashed var(--border); padding-top:4px; font-size:0.75rem;">
                                                    <span style="color:var(--text-muted);">KM (Khuyến mãi):</span>
                                                    <div style="display:flex; align-items:center; gap:2px;">
                                                        <input type="number" class="product-discount-input" value="${discount}" min="0"
                                                               oninput="updateProductDiscount('${order.id}', ${idx}, this, ${itemsSubtotal})"
                                                               style="width:70px; height:20px; text-align:right; border-radius:4px; border:1px solid var(--border); background:var(--bg-panel); color:var(--text-main); font-size:0.75rem; padding:0 4px;">
                                                        <span style="color:var(--text-muted); font-size:0.7rem; font-weight:600;">đ</span>
                                                    </div>
                                                </div>
                                                ${it.product_link ? `
                                                <!-- Product link row -->
                                                <div style="display:flex;align-items:center;gap:5px;border-top:1px dashed var(--border);padding-top:4px;font-size:0.72rem;">
                                                    <span style="color:var(--text-muted);">🔗 Link:</span>
                                                    <a href="${escapeHtml(it.product_link)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" style="color:var(--primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;" title="${escapeHtml(it.product_link)}">Mở sản phẩm</a>
                                                </div>` : ''}
                                                <!-- Item Note row -->
                                                <div style="border-top:1px dashed var(--border); padding-top:4px;">
                                                    <input type="text" class="product-item-note-input" value="${it.item_note || it.variation_info?.item_note || it.note || ''}" placeholder="Ghi chú SP (VD: Giao màu đỏ...)" style="width:100%; font-size:0.72rem; color:var(--text-muted); border:1px solid var(--border); border-radius:4px; background:var(--bg-panel); padding:3px 6px; outline:none; box-sizing:border-box;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'">
                                                </div>
                                            </div>
                                        `;
                                    }).join('') || '<div style="font-size:0.8rem; color:var(--text-muted); padding:12px; text-align:center;">Không có sản phẩm</div>'}
                                </div>
                                <!-- Inline product search bar - Pancake style -->
                                <div style="position:relative; margin-top:8px;" id="search-wrap-${order.id}">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <div style="flex:1; display:flex; align-items:center; border:1px solid var(--border); border-radius:8px; background:var(--bg-app); overflow:hidden;">
                                            <span style="padding:0 8px; color:var(--text-muted); font-size:0.9rem; line-height:1;">🔍</span>
                                            <input type="text" id="product-search-${order.id}"
                                                   placeholder="Tìm sản phẩm (Tên, SKU)..."
                                                   oninput="searchProductInline(this,'${order.id}','dashboard')"
                                                   onfocus="searchProductInline(this,'${order.id}','dashboard')"
                                                   style="width:100%; padding:7px 8px; border:none; background:transparent; color:var(--text-main); font-size:0.8rem; outline:none;">
                                        </div>
                                        <button type="button" onclick="toggleInlineCustomForm('${order.id}', 'dashboard', this)"
                                                style="padding:7px 12px; border-radius:8px; border:1px solid var(--primary); background:transparent; color:var(--primary); font-size:0.8rem; font-weight:600; cursor:pointer; white-space:nowrap;">
                                            + Tùy chỉnh
                                        </button>
                                    </div>
                                    <div id="product-dropdown-${order.id}"
                                         style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg-panel); border:1px solid var(--border); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.15); z-index:999; max-height:260px; overflow-y:auto; margin-top:3px;">
                                    </div>
                                    <!-- Inline custom product form -->
                                    <div id="inline-custom-form-${order.id}" style="display:none; margin-top:6px; padding:10px; border:1px dashed var(--primary); border-radius:10px; background:var(--bg-app);">
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <div id="icf-img-wrap-${order.id}" onclick="triggerInlineImagePaste('${order.id}','dashboard')" style="width:42px;height:42px;border-radius:8px;border:1.5px dashed var(--border);background:var(--bg-card);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:1.2rem;overflow:hidden;" title="Dán ảnh (Ctrl+V)">📷</div>
                                            <input type="text" id="icf-name-${order.id}" placeholder="Tên SP (Dán ảnh)" style="flex:2; padding:7px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-panel); color:var(--text-main); font-size:0.82rem; outline:none;">
                                            <span style="color:var(--text-muted); font-size:0.75rem; white-space:nowrap;">Giá đ</span>
                                            <input type="number" id="icf-price-${order.id}" placeholder="0" min="0" style="width:90px; padding:7px 8px; border:1px solid var(--border); border-radius:8px; background:var(--bg-panel); color:var(--text-main); font-size:0.82rem; outline:none; text-align:right;">
                                            <input type="number" id="icf-qty-${order.id}" value="1" min="1" style="width:44px; padding:7px 6px; border:1px solid var(--border); border-radius:8px; background:var(--bg-panel); color:var(--text-main); font-size:0.82rem; outline:none; text-align:center;">
                                        </div>
                                        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                                            <button type="button" onclick="toggleInlineCustomForm('${order.id}','dashboard',null)" style="padding:6px 14px; border-radius:7px; border:1px solid var(--border); background:transparent; color:var(--text-muted); font-size:0.8rem; font-weight:600; cursor:pointer;">Hủy</button>
                                            <button type="button" onclick="submitInlineCustomForm('${order.id}','dashboard')" style="padding:6px 14px; border-radius:7px; border:none; background:var(--primary); color:#fff; font-size:0.8rem; font-weight:700; cursor:pointer;">Thêm SP</button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Col 3: Payment details -->
                            <div class="order-edit-col">
                                <div class="order-edit-col-title">Chi tiết thanh toán</div>
                                <div class="edit-payment-grid" style="display:flex; flex-direction:row; flex-wrap:nowrap; gap:4px; width:100%; box-sizing:border-box;">
                                    <div class="edit-input-group" style="flex:1 1 0%; min-width:0; margin-bottom:0;">
                                        <label style="font-size:0.7rem; font-weight:600; color:var(--text-muted); white-space:nowrap;">Phí VC</label>
                                        <input type="number" id="edit-shipfee-${order.id}" value="${shippingFee}" oninput="recalcOrderTotals('${order.id}', ${itemsSubtotal})" style="width:100%; min-width:0; box-sizing:border-box; padding:5px 4px;">
                                    </div>
                                    <div class="edit-input-group" style="flex:1 1 0%; min-width:0; margin-bottom:0;">
                                        <label style="font-size:0.7rem; font-weight:600; color:var(--text-muted); white-space:nowrap;">Phụ phí</label>
                                        <input type="number" id="edit-surcharge-${order.id}" value="${surcharge}" oninput="recalcOrderTotals('${order.id}', ${itemsSubtotal})" style="width:100%; min-width:0; box-sizing:border-box; padding:5px 4px;">
                                    </div>
                                    <div class="edit-input-group" style="flex:1 1 0%; min-width:0; margin-bottom:0;">
                                        <label style="font-size:0.7rem; font-weight:600; color:var(--text-muted); white-space:nowrap;">Đặt cọc</label>
                                        <input type="number" id="edit-prepaid-${order.id}" value="${prepaid}" oninput="recalcOrderTotals('${order.id}', ${itemsSubtotal})" style="width:100%; min-width:0; box-sizing:border-box; padding:5px 4px;">
                                    </div>
                                </div>
                                <div style="margin-top:6px; margin-bottom:10px; font-size:0.7rem; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                                    <label style="white-space:nowrap; display:flex; align-items:center; gap:3px; cursor:pointer; color:var(--text-muted);">
                                        <input type="checkbox" id="edit-freeship-${order.id}" onchange="toggleFreeship('${order.id}', ${itemsSubtotal})"> Freeship
                                    </label>
                                    <label style="white-space:nowrap; display:flex; align-items:center; gap:3px; cursor:pointer; color:var(--text-muted);">
                                        <input type="checkbox" id="edit-cod-fee-${order.id}" onchange="toggleCodFee('${order.id}', ${itemsSubtotal})"> Phụ phí 1.5% COD
                                    </label>
                                    <label style="white-space:nowrap; display:flex; align-items:center; gap:3px; cursor:pointer; color:var(--text-muted);">
                                        <input type="checkbox" id="edit-mark-paid-${order.id}" onchange="toggleMarkPaid('${order.id}', ${itemsSubtotal})" ${((cod === 0) || (prepaid >= total)) ? 'checked' : ''}> Đã TT đủ
                                    </label>
                                </div>
                                <div style="border-top: 1px solid var(--border); padding-top:10px; display:flex; flex-direction:column; gap:8px;">
                                    <div class="payment-calc-row" style="display:flex !important; justify-content:space-between !important; align-items:center !important; width:100% !important;">
                                        <span style="font-size:0.8rem; color:var(--text-muted);">Tạm tính hàng:</span>
                                        <span class="payment-calc-val" style="font-weight:600; font-size:0.82rem; color:var(--text-main); display:inline-block !important;">${itemsSubtotal.toLocaleString('vi-VN')} đ</span>
                                    </div>
                                    <div class="payment-calc-row" style="display:flex !important; justify-content:space-between !important; align-items:center !important; width:100% !important;">
                                        <span style="font-size:0.8rem; color:var(--text-muted);">Thành tiền:</span>
                                        <span id="calc-total-${order.id}" class="payment-calc-val" style="font-weight:700; color:var(--primary); font-size:0.85rem; display:inline-block !important;">${total.toLocaleString('vi-VN')} đ</span>
                                    </div>
                                    <div class="payment-calc-row" style="display:flex !important; justify-content:space-between !important; align-items:center !important; width:100% !important;">
                                        <span style="font-size:0.8rem; color:var(--text-muted);">Thu hộ (COD):</span>
                                        <span id="calc-cod-${order.id}" class="payment-calc-val" style="font-weight:700; color:var(--danger); font-size:0.85rem; display:inline-block !important;">${cod.toLocaleString('vi-VN')} đ</span>
                                    </div>
                                    <div class="payment-calc-row" style="display:flex !important; justify-content:space-between !important; align-items:center !important; width:100% !important; font-size:0.76rem; color:var(--text-muted);">
                                        <span>Phụ phí 1.5%:</span>
                                        <span id="calc-cod-fee-${order.id}" class="payment-calc-val" style="font-weight:700; color:var(--text-main); font-size:0.82rem; display:inline-block !important;">0 đ</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Col 4: Note & Actions -->
                            <div class="order-edit-col" style="min-width: 280px; display:flex; flex-direction:column; gap:8px;">
                                <div class="order-edit-col-title">Ghi chú & Thao tác</div>
                                <div class="edit-input-group" style="margin-bottom:0;">
                                    <label style="display:flex; justify-content:space-between; align-items:center;">
                                        Ghi chú đơn hàng
                                        <button type="button" onclick="window.triggerNoteImageUpload('${order.id}', event)" class="btn-secondary-quick" style="padding:2px 8px; font-size:0.7rem; border-radius:5px; background-color: var(--bg-card); border: 1px solid var(--border); color: var(--text-main); cursor:pointer; display:flex; align-items:center; gap:4px;">
                                            <i data-lucide="image" style="width:11px; height:11px;"></i> Thêm ảnh
                                        </button>
                                    </label>
                                    <textarea id="edit-note-${order.id}" rows="3" placeholder="Nhập ghi chú Pancake...">${order.note || ''}</textarea>
                                    <div id="note-images-container-${order.id}" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; min-height:24px;"></div>
                                    <input type="file" id="note-image-input-${order.id}" accept="image/*" style="display:none;" onchange="window.handleNoteImageUpload('${order.id}', event)">
                                </div>
                                
                                <!-- Hình ảnh thực tế sản phẩm -->
                                <div class="edit-input-group" style="margin-bottom:0;">
                                    <label style="display:flex; justify-content:space-between; align-items:center;">
                                        Hình ảnh thực tế sản phẩm
                                    </label>
                                    <div id="real-images-container-${order.id}" style="display:flex; flex-wrap:wrap; gap:6px; margin:4px 0 6px 0; min-height:24px;">
                                        <!-- Images will be rendered here dynamically -->
                                    </div>
                                    <div style="display:flex; gap:6px;">
                                        <button type="button" onclick="window.triggerRealImageUpload('${order.id}', event)" class="btn-secondary-quick" style="padding:4px 10px; font-size:0.72rem; border-radius:6px; background-color: var(--bg-card); border: 1px solid var(--border); color: var(--text-main); cursor:pointer; display:flex; align-items:center; gap:4px;">
                                            <i data-lucide="plus" style="width:12px; height:12px;"></i> Thêm ảnh
                                        </button>
                                        <input type="file" id="real-image-input-${order.id}" accept="image/*" style="display:none;" onchange="window.handleRealImageUpload('${order.id}', event)">
                                    </div>
                                </div>

                                <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end; margin-top:auto; padding-top:8px; width:100%;">
                                    <div id="save-msg-${order.id}" style="min-height:18px; font-size:0.78rem; color:#16a34a; opacity:0; transition:opacity 0.25s ease; white-space:nowrap;">&nbsp;</div>
                                    <div style="display:flex; flex-direction:row; gap:10px; align-items:center; justify-content:flex-end; width:100%;">
                                        <button class="btn-secondary-quick" onclick="copyInvoiceLink('${order.display_id || order.id}', event)" title="Sao chép Link Hóa đơn" style="padding:10px 14px; border-radius:8px; display:flex; align-items:center; background-color: var(--bg-card); border: 1px solid var(--border); color: var(--text-main); cursor:pointer;">
                                            <i data-lucide="link" style="width:16px; height:16px;"></i>
                                        </button>
                                        <button class="btn-secondary-quick" onclick="sendInvoiceImageFromOrder('${order.id}', '${order.display_id || order.id}', event)" title="Gửi bill cho khách của đơn hàng" style="padding:10px 14px; border-radius:8px; display:flex; align-items:center; background-color: var(--bg-card); border: 1px solid var(--border); color: var(--text-main); cursor:pointer;">
                                            <i data-lucide="send" style="width:16px; height:16px;"></i> Gửi bill
                                        </button>
                                        <button class="btn-primary-quick" onclick="saveOrderEdits('${order.id}', ${itemsSubtotal})" title="Lưu thay đổi" style="padding:10px 14px; border-radius:8px; display:flex; align-items:center;">
                                            <i data-lucide="save" style="width:16px; height:16px;"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
        
        // Load and render real product images & note images
        orders.forEach(order => {
            window.loadAndRenderRealImages(order.id, order.display_id || order.id);
            window.loadAndRenderNoteImages(order.id, order.note_image);
            const textarea = document.getElementById(`edit-note-${order.id}`);
            if (textarea) {
                textarea.addEventListener('paste', function(e) {
                    window.handleNoteImagePaste(order.id, e);
                });
            }
        });

    } catch (e) {
        console.error('Fetch dashboard orders error:', e);
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:30px; color:var(--danger); font-weight:600;">
                    Không thể tải dữ liệu đơn hàng từ Supabase.
                </td>
            </tr>`;
    }
}

window.openOrderInDashboard = function(orderId, displayId) {
    const targetDisplayId = String(displayId || orderId || '').trim();
    const targetUrl = targetDisplayId ? `#don-hang?search=${encodeURIComponent(targetDisplayId)}` : '#don-hang';
    window.open(targetUrl, '_blank');
};

// Global update status handler
window.updateOrderStatus = async function(orderId, newStatus, selectElement) {
    // Temporarily update select styling/opacity during API save
    selectElement.style.opacity = '0.5';
    selectElement.disabled = true;

    const statusText = normalizeStatusText(newStatus);
    const statusCode = getStatusCodeFromText(statusText);

    try {
        if (statusCode === 7) {
            // Xác nhận trước khi xóa
            if (!confirm('Bạn có chắc chắn muốn xóa đơn hàng này khỏi hệ thống không?')) {
                selectElement.style.opacity = '1';
                selectElement.disabled = false;
                selectElement.value = selectElement.dataset.prevVal || 'Chờ xử lý (Mới)';
                return;
            }

            // 1. Xóa các items của đơn hàng trong pancake_order_items trước
            await fetch(`${SUPABASE_URL}/rest/v1/pancake_order_items?order_id=eq.${orderId}`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });

            // 2. Xóa chính đơn hàng đó trong pancake_orders
            const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });

            if (deleteRes.ok) {
                if (typeof showToast === 'function') {
                    showToast('🗑️ Đã xóa đơn hàng thành công!', 'success');
                } else {
                    alert('Đã xóa đơn hàng thành công!');
                }

                // Tải lại danh sách đơn hàng trên Dashboard
                if (typeof fetchDashboardOrders === 'function') {
                    fetchDashboardOrders();
                }
                
                // Tải lại lịch sử đơn hàng của khách hàng nếu ở màn hình chat
                if (typeof fetchCustomerOrdersHistory === 'function' && activeThread) {
                    fetchCustomerOrdersHistory(activeThread);
                }
            } else {
                throw new Error(await deleteRes.text());
            }
            return;
        }

        // Lưu giá trị trạng thái trước để khôi phục nếu cần
        selectElement.dataset.prevVal = statusText;

        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                status: statusText
            })
        });

        if (res.ok) {
            // Update color style class based on new value
            selectElement.className = 'order-status-badge ' + getStatusClass(statusText);

            // 🤖 Trigger chatbot auto message if configured
            processChatbotTrigger(orderId, statusCode !== null ? statusCode : statusText);
        } else {
            alert('Lỗi cập nhật trạng thái đơn hàng!');
        }
    } catch (e) {
        console.error('Update/Delete status error:', e);
        alert('Lỗi kết nối mạng: ' + e.message);
    } finally {
        selectElement.style.opacity = '1';
        selectElement.disabled = false;
    }
};

// Phóng to ảnh sản phẩm bằng cách dùng Lightbox
window.showProductLightbox = function(imgSrc) {
    const lightbox = document.getElementById('imageLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    if (lightbox && lightboxImg) {
        lightboxImg.src = imgSrc;
        lightbox.style.display = 'flex';
    }
};

// Toggle detailed accordion edit panel
window.toggleOrderEditRow = function(orderId) {
    const editRow = document.getElementById(`edit-row-${orderId}`);
    if (!editRow) return;

    const wasVisible = editRow.classList.contains('order-edit-open');

    document.querySelectorAll('.order-edit-detail-row').forEach(row => {
        row.classList.remove('order-edit-open');
        row.style.display = 'none';
    });

    if (!wasVisible) {
        editRow.classList.add('order-edit-open');
        editRow.style.display = 'table-row';

        const summaryRow = document.querySelector(`tr.order-summary-row[onclick*="'${orderId}'"]`);
        const convId = summaryRow?.dataset?.convId || '';
        loadOrderCustomerInfo(orderId, convId, 'dashboard');
    }
};

// Normalize localized numeric formats like 585.000 or 585 000 before parsing
window.parseLocalizedNumber = function(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const normalized = raw.replace(/[\.\s]/g, '');
    return parseInt(normalized, 10) || 0;
};

window.calculateCodWithFee = function(total, prepaid, applyFee) {
    const baseCod = total - prepaid;
    if (!applyFee || baseCod <= 0) {
        return { cod: baseCod, codFee15: 0 };
    }
    const rawFee = baseCod * 0.015;
    const codFee15 = Math.ceil(rawFee / 1000) * 1000;
    return { cod: baseCod + codFee15, codFee15 };
};

window.showInlineSaveMessage = function(targetId, message, isError = false, timeout = 3500) {
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    target.textContent = message;
    target.style.color = isError ? '#dc2626' : '#16a34a';
    target.style.opacity = '1';
    target.style.transition = 'opacity 0.25s ease';
    clearTimeout(target._inlineMessageTimer);
    target._inlineMessageTimer = setTimeout(() => {
        target.style.opacity = '0';
    }, timeout);
};

// Freeship checkbox handler
window.toggleFreeship = function(orderId, subtotal) {
    const freeshipCb = document.getElementById(`edit-freeship-${orderId}`);
    const shipfeeInput = document.getElementById(`edit-shipfee-${orderId}`);
    
    if (freeshipCb.checked) {
        shipfeeInput.value = 0;
    } else {
        shipfeeInput.value = 30000;
    }
    recalcOrderTotals(orderId, subtotal);
};

// Mark-paid checkbox handler
window.toggleMarkPaid = function(orderId, subtotal) {
    const markPaidCb = document.getElementById(`edit-mark-paid-${orderId}`);
    const prepaidInput = document.getElementById(`edit-prepaid-${orderId}`);
    if (markPaidCb && prepaidInput) {
        if (markPaidCb.checked) {
            const shipfee = window.parseLocalizedNumber(document.getElementById(`edit-shipfee-${orderId}`).value);
            const surcharge = window.parseLocalizedNumber(document.getElementById(`edit-surcharge-${orderId}`).value);
            const total = subtotal + shipfee + surcharge;
            prepaidInput.value = total;
        }
        recalcOrderTotals(orderId, subtotal);
    }
};

window.toggleCodFee = function(orderId, subtotal) {
    const checkbox = document.getElementById(`edit-cod-fee-${orderId}`);
    const surchargeInput = document.getElementById(`edit-surcharge-${orderId}`);
    if (checkbox?.checked && surchargeInput) {
        surchargeInput.dataset.previousValue = surchargeInput.value;
        const shipfee = window.parseLocalizedNumber(document.getElementById(`edit-shipfee-${orderId}`)?.value);
        const prepaid = window.parseLocalizedNumber(document.getElementById(`edit-prepaid-${orderId}`)?.value);
        const baseCod = subtotal + shipfee - prepaid;
        const codFee15 = baseCod > 0 ? Math.ceil((baseCod * 0.015) / 1000) * 1000 : 0;
        surchargeInput.value = codFee15;
    } else if (surchargeInput?.dataset.previousValue !== undefined) {
        surchargeInput.value = surchargeInput.dataset.previousValue;
        delete surchargeInput.dataset.previousValue;
    }
    recalcOrderTotals(orderId, subtotal);
};

// Recalculate billing values in DOM dynamically
window.recalcOrderTotals = function(orderId, subtotal) {
    const shipfee = window.parseLocalizedNumber(document.getElementById(`edit-shipfee-${orderId}`).value);
    const surcharge = window.parseLocalizedNumber(document.getElementById(`edit-surcharge-${orderId}`).value);
    const prepaid = window.parseLocalizedNumber(document.getElementById(`edit-prepaid-${orderId}`).value);
    const applyCodFee = document.getElementById(`edit-cod-fee-${orderId}`)?.checked === true;
    const total = subtotal + shipfee + surcharge;

    const { cod, codFee15 } = applyCodFee
        ? { cod: total - prepaid, codFee15: surcharge }
        : window.calculateCodWithFee(total, prepaid, false);

    document.getElementById(`calc-total-${orderId}`).textContent = total.toLocaleString('vi-VN') + ' đ';
    document.getElementById(`calc-cod-${orderId}`).textContent = cod.toLocaleString('vi-VN') + ' đ';
    const codFeeEl = document.getElementById(`calc-cod-fee-${orderId}`);
    if (codFeeEl) codFeeEl.textContent = codFee15.toLocaleString('vi-VN') + ' đ';
};

// Save edited order fields up to Supabase
window.saveOrderEdits = async function(orderId, subtotal) {
    const name = document.getElementById(`edit-name-${orderId}`).value.trim();
    const phone = document.getElementById(`edit-phone-${orderId}`).value.trim();
    const address = document.getElementById(`edit-address-${orderId}`).value.trim();
    
    const shipfee = window.parseLocalizedNumber(document.getElementById(`edit-shipfee-${orderId}`).value);
    const surcharge = window.parseLocalizedNumber(document.getElementById(`edit-surcharge-${orderId}`).value);
    let prepaid = window.parseLocalizedNumber(document.getElementById(`edit-prepaid-${orderId}`).value);
    const applyCodFee = document.getElementById(`edit-cod-fee-${orderId}`)?.checked === true;
    const note = document.getElementById(`edit-note-${orderId}`).value.trim();

    // Thu thập danh sách sản phẩm cập nhật từ DOM
    const updatedItems = collectOrderItemsFromDom(orderId);
    const newSubtotal = updatedItems.reduce((s, it) => s + ((it.retail_price || it.price || 0) - (it.discount || 0)) * (it.quantity || 1), 0);
    const actualSubtotal = newSubtotal;

    const total = actualSubtotal + shipfee + surcharge;
    const cod = applyCodFee ? Math.max(0, total - prepaid) : window.calculateCodWithFee(total, prepaid, false).cod;

    try {
        // Bước 1: Cập nhật thông tin cơ bản của đơn hàng (Không gửi kèm order_items giả lên pancake_orders)
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                bill_full_name: name,
                bill_phone_number: phone,
                shipping_fee: shipfee,
                surcharge: surcharge,
                prepaid: prepaid,
                total_price: total,
                cod: cod,
                note: note,
                shipping_address: {
                    full_name: name,
                    phone_number: phone,
                    full_address: address,
                    address: address
                }
            })
        });

        if (!res.ok) throw new Error('Không thể lưu thông tin đơn hàng: ' + await res.text());

        // Bước 2: Đồng bộ sản phẩm vào bảng pancake_order_items.
        // Nếu danh sách sản phẩm mới rỗng, vẫn xóa hết sản phẩm cũ để lưu trạng thái không có hàng.
        await fetch(`${SUPABASE_URL}/rest/v1/pancake_order_items?order_id=eq.${orderId}`, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (updatedItems.length > 0) {
            // 2.2 Định dạng và chuẩn bị dữ liệu gửi lên bảng pancake_order_items
            const itemsPayload = updatedItems.map(it => {
                const img = it.image_url || it.images?.[0] || '';
                return {
                    order_id: orderId,
                    product_id: it.product_id,
                    product_name: it.name || it.product_name,
                    retail_price: it.price || it.retail_price || 0,
                    quantity: it.quantity || 1,
                    discount_each_product: it.discount || 0,
                    item_note: it.item_note || '',
                    variation_info: {
                        name: it.name || it.product_name,
                        type: 'product',
                        images: img ? [img] : [],
                        retail_price: it.price || it.retail_price || 0,
                        item_note: it.item_note || ''
                    }
                };
            });

            // 2.3 Gửi danh sách sản phẩm mới lên
            const itemsRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_order_items`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(itemsPayload)
            });

            if (!itemsRes.ok) throw new Error('Lỗi đồng bộ sản phẩm đơn hàng: ' + await itemsRes.text());
        }

        showInlineSaveMessage(`save-msg-${orderId}`, 'Đã lưu các thay đổi thành công!');
        
        // Không reload toàn bộ dashboard để tránh làm gián đoạn trải nghiệm chỉnh sửa.
        // Nếu cần cập nhật thêm trên giao diện hiện tại, có thể bổ sung cập nhật cục bộ sau.
        
        // Tải lại lịch sử đơn hàng của khách hàng nếu ở màn hình chat
        if (window.activeThread) {
            fetchCustomerOrdersHistory(window.activeThread);
        }
    } catch (e) {
        console.error(e);
        showInlineSaveMessage(`save-msg-${orderId}`, 'Lỗi lưu thay đổi: ' + e.message, true);
    }
};



// ============================================================
// MODAL-BASED QUICK ORDER EDIT
// ============================================================

let _sideEditOrderId = null;
let _sideEditSubtotal = 0;

window.openRecentOrderEdit = function(orderIndex) {
    const order = recentOrdersForEdit[Number(orderIndex)];
    if (!order) {
        console.warn('openRecentOrderEdit: order not found', orderIndex);
        return;
    }
    window.openSideOrderEditModal(encodeURIComponent(JSON.stringify(order)));
};

window.openSideOrderEditModal = function(encodedOrder) {
    let order;
    try {
        order = JSON.parse(decodeURIComponent(encodedOrder));
    } catch (e) {
        console.error('openSideOrderEditModal: failed to parse order', e);
        return;
    }

    _sideEditOrderId = order.id;

    // Compute financial values
    const rawItems = order.order_items || order.items;
    const items = Array.isArray(rawItems) ? rawItems : [];
    const itemsSubtotal = items.reduce((sum, it) => {
        return sum + (parseInt(it.retail_price || it.price) || 0) * (parseInt(it.quantity) || 1);
    }, 0);
    _sideEditSubtotal = itemsSubtotal;

    const shippingFee = parseInt(order.shipping_fee) || 0;
    const surcharge   = parseInt(order.surcharge)    || 0;
    const prepaid     = parseInt(order.prepaid)      || 0;
    const total       = itemsSubtotal + shippingFee + surcharge;
    const cod         = total - prepaid;

    // Modal header
    const titleEl    = document.getElementById('sideOrderEditModalTitle');
    const subtitleEl = document.getElementById('sideOrderEditModalSubtitle');
    if (titleEl)    titleEl.textContent  = `Sửa đơn hàng #${order.display_id || order.code || order.id || ''}`;
    if (subtitleEl) subtitleEl.textContent = `ID: ${order.id || order.display_id || ''}  |  Tạo: ${order.created_at ? new Date(order.created_at).toLocaleDateString('vi-VN') : ''}`;

    // Block 1: Địa chỉ
    document.getElementById('side-edit-name').value    = order.bill_full_name || '';
    document.getElementById('side-edit-phone').value   = order.bill_phone_number || '';
    document.getElementById('side-edit-address').value = order.shipping_address?.full_address || order.shipping_address?.address || '';

    // Load customer info (async)
    loadOrderCustomerInfo(order.id, order.conversation_id || '', 'side');

    // Block 2: Sản phẩm (editable)
    renderSideEditProducts(items, itemsSubtotal);

    // Block 3: Phí vận chuyển
    document.getElementById('side-edit-shipfee').value   = shippingFee;
    document.getElementById('side-edit-surcharge').value = surcharge;
    document.getElementById('side-edit-prepaid').value   = prepaid;
    const freeshipCb = document.getElementById('side-edit-freeship');
    if (freeshipCb) freeshipCb.checked = false;
    // Mark-paid checkbox state: checked if COD is already zero or prepaid >= total
    const markPaidCb = document.getElementById('side-edit-mark-paid');
    if (markPaidCb) {
        try {
            markPaidCb.checked = (cod === 0) || (prepaid >= total);
            if (markPaidCb.checked) {
                // ensure prepaid input reflects full payment when marking paid
                document.getElementById('side-edit-prepaid').value = total;
            }
        } catch (e) { markPaidCb.checked = false; }
    }

    // Tính toán hiển thị
    const fmt = n => n.toLocaleString('vi-VN') + ' đ';
    const subtotalEl = document.getElementById('side-calc-subtotal-val');
    const totalEl    = document.getElementById('side-calc-total-val');
    const codEl      = document.getElementById('side-calc-cod-val');
    if (subtotalEl) subtotalEl.textContent = fmt(itemsSubtotal);
    if (totalEl)    totalEl.textContent    = fmt(total);
    if (codEl)      codEl.textContent      = fmt(cod);

    // Block 4: Ghi chú
    document.getElementById('side-edit-note').value = order.note || '';
    window.loadAndRenderSideNoteImages(order.id, order.note_image);
    window.loadAndRenderSideRealImages(order.id, order.display_id || order.id);
    
    const sideTextarea = document.getElementById('side-edit-note');
    if (sideTextarea) {
        if (sideTextarea._pasteHandler) {
            sideTextarea.removeEventListener('paste', sideTextarea._pasteHandler);
        }
        sideTextarea._pasteHandler = function(e) {
            window.handleSideNoteImagePaste(e);
        };
        sideTextarea.addEventListener('paste', sideTextarea._pasteHandler);
    }

    // Show Modal
    const modal = document.getElementById('sideOrderEditModal');
    if (modal) {
        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
    }
};

// Recalc totals live in the modal
function recalcSideModalTotals() {
    const shipfee   = window.parseLocalizedNumber(document.getElementById('side-edit-shipfee')?.value);
    const surcharge = window.parseLocalizedNumber(document.getElementById('side-edit-surcharge')?.value);
    const prepaid   = window.parseLocalizedNumber(document.getElementById('side-edit-prepaid')?.value);
    const applyFee  = document.getElementById('side-edit-cod-fee')?.checked === true;
    const subtotal  = _sideEditSubtotal;
    const total     = subtotal + shipfee + surcharge;
    const { cod, codFee15 } = applyFee
        ? { cod: Math.max(0, total - prepaid), codFee15: surcharge }
        : window.calculateCodWithFee(total, prepaid, false);
    const fmt       = n => n.toLocaleString('vi-VN') + ' đ';
    const totalEl   = document.getElementById('side-calc-total-val');
    const codEl     = document.getElementById('side-calc-cod-val');
    const codFeeEl  = document.getElementById('side-calc-cod-fee-val');
    if (totalEl) totalEl.textContent = fmt(total);
    if (codEl)   codEl.textContent   = fmt(cod);
    if (codFeeEl) codFeeEl.textContent = fmt(codFee15);
}

// Wire up modal events after DOM is ready
(function initSideOrderEditModal() {
    const setup = () => {
        const modal  = document.getElementById('sideOrderEditModal');
        if (!modal) return; // retry if needed

        const closeFn = () => { modal.style.display = 'none'; };

        document.getElementById('btnCloseSideOrderEditModal')?.addEventListener('click', closeFn);
        document.getElementById('btnCancelSideOrderEdit')?.addEventListener('click', closeFn);
        modal.addEventListener('click', e => { if (e.target === modal) closeFn(); });

        // Helper detect shipping fee by address
        window.detectShippingFeeByAddress = function(addressText) {
            // Phí vận chuyển mặc định thống nhất: 25.000đ cho mọi địa chỉ.
            return 25000;
        };

        // Freeship toggle
        document.getElementById('side-edit-freeship')?.addEventListener('change', function() {
            const addressVal = document.getElementById('side-edit-address')?.value || '';
            const defaultShip = window.detectShippingFeeByAddress(addressVal);
            document.getElementById('side-edit-shipfee').value = this.checked ? 0 : defaultShip;
            recalcSideModalTotals();
        });

        // Address input changes -> auto update ship fee
        document.getElementById('side-edit-address')?.addEventListener('input', function() {
            const freeshipCb = document.getElementById('side-edit-freeship');
            if (freeshipCb && freeshipCb.checked) {
                document.getElementById('side-edit-shipfee').value = 0;
            } else {
                const calculatedShip = window.detectShippingFeeByAddress(this.value);
                document.getElementById('side-edit-shipfee').value = calculatedShip;
            }
            recalcSideModalTotals();
        });

        // Live recalc
        ['side-edit-shipfee', 'side-edit-surcharge', 'side-edit-prepaid', 'side-edit-cod-fee'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', recalcSideModalTotals);
        });

        // Mark-paid checkbox: if checked, auto set prepaid to total and recalc
        const markPaidEl = document.getElementById('side-edit-mark-paid');
        if (markPaidEl) {
            markPaidEl.addEventListener('change', function() {
                try {
                    if (this.checked) {
                        const shipfee = parseInt(document.getElementById('side-edit-shipfee')?.value) || 0;
                        const surcharge = parseInt(document.getElementById('side-edit-surcharge')?.value) || 0;
                        const subtotal = _sideEditSubtotal || 0;
                        const total = subtotal + shipfee + surcharge;
                        document.getElementById('side-edit-prepaid').value = total;
                    }
                } catch (e) { console.warn(e); }
                recalcSideModalTotals();
            });
        }

        const sideCodFeeEl = document.getElementById('side-edit-cod-fee');
        if (sideCodFeeEl) {
            sideCodFeeEl.addEventListener('change', function() {
                const surchargeInput = document.getElementById('side-edit-surcharge');
                if (this.checked && surchargeInput) {
                    surchargeInput.dataset.previousValue = surchargeInput.value;
                    const shipfee = window.parseLocalizedNumber(document.getElementById('side-edit-shipfee')?.value);
                    const prepaid = window.parseLocalizedNumber(document.getElementById('side-edit-prepaid')?.value);
                    const baseCod = _sideEditSubtotal + shipfee - prepaid;
                    surchargeInput.value = baseCod > 0 ? Math.ceil((baseCod * 0.015) / 1000) * 1000 : 0;
                } else if (surchargeInput?.dataset.previousValue !== undefined) {
                    surchargeInput.value = surchargeInput.dataset.previousValue;
                    delete surchargeInput.dataset.previousValue;
                }
                recalcSideModalTotals();
            });
        }

        // Copy link button (hội thoại)
        document.getElementById('btnSideCopyLink')?.addEventListener('click', () => {
            if (window.activeThread && typeof selectedPagePid !== 'undefined') {
                const link = `${location.origin}/#tin-nhan?pid=${selectedPagePid}&tid=${window.activeThread.tid}`;
                navigator.clipboard.writeText(link).then(() => alert('Đã sao chép link hội thoại!'));
            } else {
                alert('Chưa có cuộc hội thoại đang mở.');
            }
        });

        // Copy Link Bill button (hóa đơn)
        document.getElementById('btnSideCopyBillLink')?.addEventListener('click', () => {
            if (_sideEditOrderId) {
                // Lấy display_id từ title modal
                const titleEl = document.getElementById('sideOrderEditModalTitle');
                const displayId = titleEl ? (titleEl.textContent.match(/#(\S+)/)?.[1] || _sideEditOrderId) : _sideEditOrderId;
                window.copyInvoiceLink(displayId);
            } else {
                alert('Chưa có đơn hàng đang mở.');
            }
        });

        // Gửi ảnh bill cho khách của đơn hàng
        document.getElementById('btnSideSendBillImage')?.addEventListener('click', (e) => {
            if (_sideEditOrderId) {
                const titleEl = document.getElementById('sideOrderEditModalTitle');
                const displayId = titleEl ? (titleEl.textContent.match(/#(\S+)/)?.[1] || _sideEditOrderId) : _sideEditOrderId;
                window.sendInvoiceImageFromOrder(_sideEditOrderId, displayId, e);
            } else {
                alert('Chưa có đơn hàng đang mở.');
            }
        });

        // Save button
        document.getElementById('btnSaveSideOrderEdit')?.addEventListener('click', async () => {
            const orderId  = _sideEditOrderId;
            if (!orderId) return;

            const name      = document.getElementById('side-edit-name').value.trim();
            const phone     = document.getElementById('side-edit-phone').value.trim();
            const address   = document.getElementById('side-edit-address').value.trim();
            const shipfee   = window.parseLocalizedNumber(document.getElementById('side-edit-shipfee').value);
            const surcharge = window.parseLocalizedNumber(document.getElementById('side-edit-surcharge').value);
            let prepaid     = window.parseLocalizedNumber(document.getElementById('side-edit-prepaid').value);
            const markPaid  = document.getElementById('side-edit-mark-paid')?.checked === true;
            const note      = document.getElementById('side-edit-note').value.trim();

            // Thu thập danh sách sản phẩm cập nhật từ DOM
            const updatedItems = collectSideModalItems();
            const newSubtotal  = updatedItems.reduce((s, it) => s + ((it.retail_price || it.price || 0) - (it.discount || 0)) * (it.quantity || 1), 0);
            const subtotal     = newSubtotal;

            const total = subtotal + shipfee + surcharge;
            if (markPaid) {
                prepaid = total;
            }
            const cod   = Math.max(0, total - (prepaid || 0));

            const saveBtn = document.getElementById('btnSaveSideOrderEdit');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }

            try {
                // Bước 1: Cập nhật thông tin cơ bản của đơn hàng
                const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        bill_full_name: name,
                        bill_phone_number: phone,
                        shipping_fee: shipfee,
                        surcharge: surcharge,
                        prepaid: prepaid,
                        total_price: total,
                        cod: cod,
                        note: note,
                        shipping_address: {
                            full_name: name,
                            phone_number: phone,
                            full_address: address,
                            address: address
                        }
                    })
                });

                if (!res.ok) throw new Error('Không thể lưu thông tin đơn hàng: ' + await res.text());

                // Bước 2: Đồng bộ sản phẩm vào bảng pancake_order_items.
                await fetch(`${SUPABASE_URL}/rest/v1/pancake_order_items?order_id=eq.${orderId}`, {
                    method: 'DELETE',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                });

                if (updatedItems.length > 0) {
                    // 2.2 Định dạng và chuẩn bị dữ liệu gửi lên bảng pancake_order_items
                    const itemsPayload = updatedItems.map(it => {
                        const img = it.image_url || it.images?.[0] || '';
                        return {
                            order_id: orderId,
                            product_id: it.product_id,
                            product_name: it.name || it.product_name,
                            retail_price: it.price || it.retail_price || 0,
                            quantity: it.quantity || 1,
                            discount_each_product: it.discount || 0,
                            item_note: it.item_note || '',
                            variation_info: {
                                name: it.name || it.product_name,
                                type: 'product',
                                images: img ? [img] : [],
                                retail_price: it.price || it.retail_price || 0,
                                item_note: it.item_note || ''
                            }
                        };
                    });

                    // 2.3 Gửi danh sách sản phẩm mới lên
                    const itemsRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_order_items`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify(itemsPayload)
                    });

                    if (!itemsRes.ok) throw new Error('Lỗi đồng bộ sản phẩm đơn hàng: ' + await itemsRes.text());
                }

                if (window.activeThread) await fetchCustomerOrdersHistory(window.activeThread);
                // Không load lại toàn bộ dashboard khi đang chỉnh sửa nhanh.

                // Tải lại dữ liệu đơn hàng vừa lưu và cập nhật lại modal ngay lập tức
                try {
                    const detailRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}&select=*,pancake_order_items(*)`, {
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                    });
                    if (detailRes && detailRes.ok) {
                        const rows = await detailRes.json();
                        const fresh = rows && rows[0] ? rows[0] : null;
                        if (fresh) {
                            // normalize items field name expected by modal
                            fresh.order_items = fresh.pancake_order_items || fresh.items || fresh.order_items || [];
                            // reopen modal with fresh data (encoded as original open call expects)
                            try {
                                openSideOrderEditModal(encodeURIComponent(JSON.stringify(fresh)));
                            } catch (e) {
                                console.warn('[SideEdit] Failed to reopen modal with fresh data', e);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[SideEdit] Could not reload order after save:', e);
                }

                showInlineSaveMessage('side-edit-save-message', 'Đã lưu thay đổi đơn hàng thành công!');
            } catch (e) {
                console.error(e);
                showInlineSaveMessage('side-edit-save-message', 'Lỗi kết nối mạng khi lưu!', true);
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i data-lucide="save" style="width:16px;height:16px;"></i> Lưu thay đổi';
                    if (window.lucide) lucide.createIcons();
                }
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();

// ----------------------------------------------------
// J&T EXPRESS INTEGRATION BUSINESS LOGIC
// ----------------------------------------------------

// Active configuration keys (load from Supabase or localStorage as fallback)
let jtAuthToken = localStorage.getItem('jt_auth_token') || '';
let jtCookie = localStorage.getItem('jt_cookie') || '';

// Sender defaults (Configured inside Web UI or fallback)
let jtSenderName = 'PUMALIFE STORE';
localStorage.setItem('jt_sender_name', jtSenderName);
let jtSenderPhone = localStorage.getItem('jt_sender_phone') || '0357573070';
let jtSenderAddress = localStorage.getItem('jt_sender_address') || 'pumalife, 47/12A Thăng Long, phường 4, tân bình, hcm';

// Fetch J&T Config from Supabase Table: jt_config
async function fetchJtConfigFromSupabase() {
    try {
        console.log('🔄 Fetching J&T configuration from Supabase...');
        const url = `${SUPABASE_URL}/rest/v1/jt_config?select=*&limit=1`;
        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (res.ok) {
            const data = await res.json();
            if (data && data[0]) {
                const config = data[0];
                if (config.auth_token) {
                    jtAuthToken = config.auth_token;
                    localStorage.setItem('jt_auth_token', jtAuthToken);
                }
                if (config.cookie) {
                    jtCookie = config.cookie;
                    localStorage.setItem('jt_cookie', jtCookie);
                }
                if (config.sender_name) {
                    jtSenderName = config.sender_name;
                    localStorage.setItem('jt_sender_name', jtSenderName);
                }
                if (config.sender_phone) {
                    jtSenderPhone = config.sender_phone;
                    localStorage.setItem('jt_sender_phone', jtSenderPhone);
                }
                if (config.sender_address) {
                    jtSenderAddress = config.sender_address;
                    localStorage.setItem('jt_sender_address', jtSenderAddress);
                }
                console.log('✅ J&T Configuration loaded from Supabase successfully');
                
                // Update config inputs if they exist in DOM
                const authTextarea = document.getElementById('jtAuthToken');
                const cookieTextarea = document.getElementById('jtCookie');
                if (authTextarea) authTextarea.value = jtAuthToken;
                if (cookieTextarea) cookieTextarea.value = jtCookie;
            }
        }
    } catch (err) {
        console.warn('❌ Fetch J&T Config Error:', err);
    }
}

// Cache objects for J&T regions to speed up loads
let jtProvincesCache = [];

// Initialize J&T Modals Event Listeners when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Fill Config Forms
    const authTextarea = document.getElementById('jtAuthToken');
    const cookieTextarea = document.getElementById('jtCookie');
    if (authTextarea) authTextarea.value = jtAuthToken;
    if (cookieTextarea) cookieTextarea.value = jtCookie;

    // Toggle Config Modal
    const btnOpenConfig = document.getElementById('btnOpenJtConfig');
    if (btnOpenConfig) {
        btnOpenConfig.addEventListener('click', () => {
            document.getElementById('jtConfigModal').style.display = 'flex';
        });
    }
    const btnCloseConfig = document.getElementById('btnCloseJtConfig');
    if (btnCloseConfig) {
        btnCloseConfig.addEventListener('click', () => {
            document.getElementById('jtConfigModal').style.display = 'none';
        });
    }

    // Logout Action listener
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) {
                localStorage.removeItem('is_logged_in');
                window.location.reload();
            }
        });
    }

    // Save configuration to Supabase
    const jtConfigForm = document.getElementById('jtConfigForm');
    if (jtConfigForm) {
        jtConfigForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newAuthToken = document.getElementById('jtAuthToken').value.trim();
            const newCookie = document.getElementById('jtCookie').value.trim();
            
            const submitBtn = jtConfigForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Đang lưu cấu hình...';

            try {
                // Kiểm tra xem đã có cấu hình trong DB chưa
                const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/jt_config?select=id&limit=1`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const checkData = await checkRes.json();
                
                let saveRes;
                const payload = {
                    auth_token: newAuthToken,
                    cookie: newCookie,
                    updated_at: new Date().toISOString()
                };

                if (checkData && checkData.length > 0) {
                    // Update bản ghi có sẵn
                    const configId = checkData[0].id;
                    saveRes = await fetch(`${SUPABASE_URL}/rest/v1/jt_config?id=eq.${configId}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify(payload)
                    });
                } else {
                    // Tạo bản ghi mới
                    payload.inserted_at = new Date().toISOString();
                    saveRes = await fetch(`${SUPABASE_URL}/rest/v1/jt_config`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });
                }

                if (saveRes.ok) {
                    jtAuthToken = newAuthToken;
                    jtCookie = newCookie;
                    localStorage.setItem('jt_auth_token', jtAuthToken);
                    localStorage.setItem('jt_cookie', jtCookie);
                    alert('Đã lưu cấu hình J&T lên Supabase thành công!');
                    document.getElementById('jtConfigModal').style.display = 'none';
                } else {
                    const errMsg = await saveRes.text();
                    throw new Error(errMsg);
                }
            } catch (err) {
                console.error('Lỗi khi lưu cấu hình J&T:', err);
                alert('Không thể lưu cấu hình lên Supabase: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        });
    }

    // J&T Address System Selector Cascade Events
    const jtProvinceSel = document.getElementById('jtProvince');
    const jtDistrictSel = document.getElementById('jtDistrict');
    const jtWardSel = document.getElementById('jtWard');
    const jtAddressDataTypeRadios = document.getElementsByName('jtAddressDataType');

    if (jtProvinceSel) {
        jtProvinceSel.addEventListener('change', () => {
            const pid = jtProvinceSel.value;
            refreshSpxSearchablePicker('jtProvince');
            if (pid) loadJtDistricts(pid);
        });
    }

    if (jtDistrictSel) {
        jtDistrictSel.addEventListener('change', () => {
            const did = jtDistrictSel.value;
            refreshSpxSearchablePicker('jtDistrict');
            if (did && !isJtNewAddressSystem()) {
                loadJtWards(did);
            }
        });
    }

    jtAddressDataTypeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            loadJtProvinces();
            refreshAllSpxSearchablePickers();
        });
    });
    refreshAllSpxSearchablePickers();

    // Close Order creation modal
    const btnCloseCreate = document.getElementById('btnCloseJtCreate');
    if (btnCloseCreate) {
        btnCloseCreate.addEventListener('click', () => {
            document.getElementById('jtCreateOrderModal').style.display = 'none';
        });
    }

    // Close Walk-in order modal
    const btnCloseWalkInCreate = document.getElementById('btnCloseWalkInOrderModal');
    if (btnCloseWalkInCreate) {
        btnCloseWalkInCreate.addEventListener('click', () => {
            document.getElementById('walkInOrderModal').style.display = 'none';
        });
    }

    // Submit Create Order J&T Form
    const jtOrderForm = document.getElementById('jtOrderForm');
    if (jtOrderForm) {
        jtOrderForm.addEventListener('submit', handleJtOrderSubmit);
    }

    const walkInOrderForm = document.getElementById('walkInOrderForm');
    if (walkInOrderForm) {
        walkInOrderForm.addEventListener('submit', handleWalkInOrderSubmit);
    }

    // Close tracking view
    const btnCloseTracking = document.getElementById('btnCloseJtTracking');
    if (btnCloseTracking) {
        btnCloseTracking.addEventListener('click', () => {
            document.getElementById('jtTrackingModal').style.display = 'none';
        });
    }
    // Close J&T Waybill Print modal
    const btnCloseJtPrint = document.getElementById('closeJtPrintModalBtn');
    if (btnCloseJtPrint) {
        btnCloseJtPrint.addEventListener('click', () => {
            document.getElementById('jtWaybillPrintModal').style.display = 'none';
        });
    }
    const btnCancelJtPrint = document.getElementById('cancelJtPrintModalBtn');
    if (btnCancelJtPrint) {
        btnCancelJtPrint.addEventListener('click', () => {
            document.getElementById('jtWaybillPrintModal').style.display = 'none';
        });
    }
    const modalJtPrint = document.getElementById('jtWaybillPrintModal');
    if (modalJtPrint) {
        modalJtPrint.addEventListener('click', (e) => {
            if (e.target === modalJtPrint) {
                modalJtPrint.style.display = 'none';
            }
        });
    }
});

// Helper checking J&T Admin mode
function isJtNewAddressSystem() {
    const radios = document.getElementsByName('jtAddressDataType');
    for (const r of radios) {
        if (r.checked) return r.value === '1';
    }
    return false;
}

// Update cascade options visually (e.g. show/hide Ward select)
function updateJtAddressUI() {
    const isNew = isJtNewAddressSystem();
    const label = document.getElementById('jtDistrictLabel');
    const wardGrp = document.getElementById('jtWardGroup');
    const addrCol = document.getElementById('jtAddressDetailGroup');
    const wardSel = document.getElementById('jtWard');

    if (isNew) {
        if (label) label.textContent = 'Quận / Phường';
        if (wardGrp) wardGrp.style.display = 'none';
        if (addrCol) addrCol.style.gridColumn = 'span 2';
        if (wardSel) wardSel.removeAttribute('required');
    } else {
        if (label) label.textContent = 'Quận / Huyện';
        if (wardGrp) wardGrp.style.display = 'block';
        if (addrCol) addrCol.style.gridColumn = 'span 1';
        if (wardSel) wardSel.setAttribute('required', 'required');
    }
}

// API helper to build correct J&T URL based on environment (Vercel vs Local vs Chrome Extension)
function getJtApiUrl(path, queryParams = {}) {
    // If running in Chrome Extension environment, fetch directly to avoid CORS issues
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    const queryString = new URLSearchParams(queryParams).toString();
    const queryPart = queryString ? `?${queryString}` : '';

    if (isExtension) {
        return `https://ylvipapi.jtexpress.vn${path}${queryPart}`;
    } else {
        // Use /api-jt proxy for both Localhost (Vite proxy) and Vercel (Vercel rewrites)
        return `/api-jt${path}${queryPart}`;
    }
}

// Helper checking SPX Address mode: returns 2 for New 2-level address, 0 for Old 3-level address
function getSpxAddressVersion() {
    const radios = document.getElementsByName('jtAddressDataType');
    for (const r of radios) {
        if (r.checked) return r.value === '1' ? 2 : 0;
    }
    return 2; // Default to 2-level
}

// API fetcher for SPX Express Location Layer API
async function fetchSpxRegions(locationId = -1, subLevel = 1, addressVersion = null) {
    if (addressVersion === null) {
        addressVersion = getSpxAddressVersion();
    }

    const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    const baseUrl = isExtension ? 'https://spx.vn' : '/api-spx';
    const url = `${baseUrl}/shipment/merchant/open/location/get_sub_location_layer_info?country=VN&location_id=${locationId}&sub_level=${subLevel}&address_version=${addressVersion}`;

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*'
            }
        });
        if (!res.ok) throw new Error('Failed to fetch SPX locations');
        const json = await res.json();
        return json?.data?.sub_location_info || [];
    } catch (e) {
        console.error('Fetch SPX Region error:', e);
        return [];
    }
}

const spxSearchablePickers = new Map();

function normalizeSpxSearchText(value = '') {
    return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getSpxPickerPlaceholder(selectId) {
    if (selectId === 'jtProvince') return 'Nhập để tìm Tỉnh / Thành phố...';
    if (selectId === 'jtDistrict') return getSpxAddressVersion() === 2 ? 'Nhập để tìm Quận / Phường...' : 'Nhập để tìm Quận / Huyện...';
    return 'Nhập để tìm Phường / Xã...';
}

function ensureSpxSearchablePicker(selectId) {
    const select = document.getElementById(selectId);
    const host = document.getElementById(selectId + 'Picker');
    if (!select || !host) return null;
    let picker = spxSearchablePickers.get(selectId);
    if (!picker) { picker = { selectId, select, host, root:null, button:null, label:null, menu:null, input:null, list:null, activeIndex:-1, filtered:[] }; spxSearchablePickers.set(selectId, picker); }
    if (!picker.root || !document.body.contains(picker.root)) {
        host.innerHTML = '';
        const root = document.createElement('div'); root.style.cssText = 'position:relative;width:100%;';
        const button = document.createElement('button'); button.type='button'; button.style.cssText='width:100%;height:38px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg-app);color:var(--text-main);padding:8px 10px;cursor:pointer;text-align:left;font-family:inherit;';
        const label=document.createElement('span'); label.style.cssText='min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const chev=document.createElement('span'); chev.textContent='▾'; chev.style.cssText='font-size:12px;color:var(--text-muted);flex-shrink:0;'; button.append(label,chev);
        const menu=document.createElement('div'); menu.style.cssText='display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:5000;background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;box-shadow:0 14px 30px rgba(15,23,42,.18);overflow:hidden;';
        const searchWrap=document.createElement('div'); searchWrap.style.cssText='padding:8px;border-bottom:1px solid var(--border);background:var(--bg-panel);';
        const input=document.createElement('input'); input.type='text'; input.autocomplete='off'; input.spellcheck=false; input.style.cssText='width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:7px;background:var(--bg-app);color:var(--text-main);padding:8px 10px;outline:none;font-family:inherit;font-size:.82rem;'; searchWrap.appendChild(input);
        const list=document.createElement('div'); list.style.cssText='max-height:240px;overflow-y:auto;padding:4px;'; menu.append(searchWrap,list); root.append(button,menu); host.appendChild(root);
        Object.assign(picker,{root,button,label,menu,input,list});
        button.addEventListener('click',(e)=>{ e.stopPropagation(); if(select.disabled)return; const wasOpen=menu.style.display==='block'; closeAllSpxSearchablePickers(selectId); if(!wasOpen){ menu.style.display='block'; input.value=''; picker.activeIndex=-1; renderSpxPickerOptions(selectId); setTimeout(()=>input.focus(),0); } });
        input.addEventListener('input',()=>{ picker.activeIndex=-1; renderSpxPickerOptions(selectId); });
        input.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ menu.style.display='none'; button.focus(); return; } if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); if(!picker.filtered.length)return; const d=e.key==='ArrowDown'?1:-1; picker.activeIndex=(picker.activeIndex+d+picker.filtered.length)%picker.filtered.length; renderSpxPickerOptions(selectId); const active=list.querySelector('[data-spx-active]'); if(active) active.scrollIntoView({block:'nearest'}); return; } if(e.key==='Enter'){ e.preventDefault(); const opt=picker.filtered[picker.activeIndex>=0?picker.activeIndex:0]; if(opt)selectSpxPickerOption(selectId,opt.value); } });
    }
    return picker;
}

function closeAllSpxSearchablePickers(exceptId=''){ spxSearchablePickers.forEach((p,id)=>{ if(id!==exceptId&&p.menu)p.menu.style.display='none'; }); }

function renderSpxPickerOptions(selectId){
    const p=ensureSpxSearchablePicker(selectId); if(!p)return;
    const q=normalizeSpxSearchText(p.input?.value||'');
    p.filtered=Array.from(p.select.options||[]).filter(o=>{ if(!o.value)return false; const name=o.getAttribute('data-name')||o.textContent||''; return !q||normalizeSpxSearchText(name).includes(q); });
    if(p.activeIndex>=p.filtered.length)p.activeIndex=p.filtered.length?0:-1;
    p.list.innerHTML='';
    if(!p.filtered.length){ const d=document.createElement('div'); d.textContent='Không tìm thấy địa chỉ phù hợp'; d.style.cssText='padding:10px;color:var(--text-muted);font-size:.8rem;text-align:center;'; p.list.appendChild(d); return; }
    p.filtered.forEach((o,i)=>{ const b=document.createElement('button'); b.type='button'; b.textContent=o.getAttribute('data-name')||o.textContent||''; if(i===p.activeIndex)b.setAttribute('data-spx-active','1'); const selected=String(p.select.value)===String(o.value); b.style.cssText='width:100%;border:0;border-radius:6px;padding:8px 9px;text-align:left;cursor:pointer;font-family:inherit;font-size:.82rem;color:var(--text-main);background:'+((i===p.activeIndex||selected)?'var(--primary-light)':'transparent')+';'; b.addEventListener('mouseenter',()=>{ p.activeIndex=i; Array.from(p.list.children).forEach((el,idx)=>{ el.style.background=(idx===i||String(p.select.value)===String(p.filtered[idx]?.value))?'var(--primary-light)':'transparent'; if(idx===i) el.setAttribute('data-spx-active','1'); else el.removeAttribute('data-spx-active'); }); }); b.addEventListener('mousedown',(e)=>{ e.preventDefault(); e.stopPropagation(); selectSpxPickerOption(selectId,o.value); }); p.list.appendChild(b); });
}

function selectSpxPickerOption(selectId,value){ const p=ensureSpxSearchablePicker(selectId); if(!p||p.select.disabled)return; p.select.value=value; refreshSpxSearchablePicker(selectId); p.menu.style.display='none'; p.select.dispatchEvent(new Event('change',{bubbles:true})); }

function refreshSpxSearchablePicker(selectId){
    const p=ensureSpxSearchablePicker(selectId); if(!p)return;
    p.input.placeholder=getSpxPickerPlaceholder(selectId);
    p.button.disabled=!!p.select.disabled; p.button.style.opacity=p.select.disabled?'.6':'1'; p.button.style.cursor=p.select.disabled?'not-allowed':'pointer';
    const o=p.select.options&&p.select.selectedIndex>=0?p.select.options[p.select.selectedIndex]:null;
    p.label.textContent=o?(o.getAttribute('data-name')||o.textContent||getSpxPickerPlaceholder(selectId)):getSpxPickerPlaceholder(selectId);
    p.label.style.color=o&&o.value?'var(--text-main)':'var(--text-muted)';
    if(p.menu.style.display==='block')renderSpxPickerOptions(selectId);
}

function refreshAllSpxSearchablePickers(){ ['jtProvince','jtDistrict','jtWard'].forEach(refreshSpxSearchablePicker); }

document.addEventListener('click',(e)=>{ let inside=false; spxSearchablePickers.forEach(p=>{ if(p.root&&p.root.contains(e.target))inside=true; }); if(!inside)closeAllSpxSearchablePickers(); });
// SPX Cascade loaders
async function loadJtProvinces() {
    updateJtAddressUI();
    const provinceSel = document.getElementById('jtProvince');
    const districtSel = document.getElementById('jtDistrict');
    const wardSel = document.getElementById('jtWard');

    if (!provinceSel) return;

    provinceSel.innerHTML = '<option value="" disabled selected>Đang tải danh mục SPX...</option>';
    refreshSpxSearchablePicker('jtProvince');
    if (districtSel) {
        districtSel.innerHTML = '<option value="" disabled selected>Chọn Tỉnh / Thành trước</option>';
        districtSel.disabled = true;
        refreshSpxSearchablePicker('jtDistrict');
    }
    if (wardSel) {
        wardSel.innerHTML = '<option value="" disabled selected>Chọn Huyện trước</option>';
        wardSel.disabled = true;
        refreshSpxSearchablePicker('jtWard');
    }

    const version = getSpxAddressVersion();
    const data = await fetchSpxRegions(-1, 1, version);
    provinceSel.innerHTML = `<option value="" disabled selected>Chọn Tỉnh / Thành phố (SPX ${version === 2 ? '2 cấp' : '3 cấp'})</option>`;
    data.forEach(p => {
        const o = document.createElement('option');
        o.value = p.location_id; // Store numerical location_id from SPX
        o.setAttribute('data-name', p.name); // Store SPX name
        o.textContent = p.name;
        provinceSel.appendChild(o);
    });
    refreshAllSpxSearchablePickers();
}

async function loadJtDistricts(parentId) {
    const districtSel = document.getElementById('jtDistrict');
    const wardSel = document.getElementById('jtWard');
    if (!districtSel) return;

    districtSel.innerHTML = '<option value="" disabled selected>Đang tải...</option>';
    districtSel.disabled = false;
    refreshSpxSearchablePicker('jtDistrict');
    if (wardSel) {
        wardSel.innerHTML = '<option value="" disabled selected>Chọn Huyện trước</option>';
        wardSel.disabled = true;
        refreshSpxSearchablePicker('jtWard');
    }

    const version = getSpxAddressVersion();
    const data = await fetchSpxRegions(parentId, 1, version);
    const textLabel = version === 2 ? 'Chọn Quận / Phường (SPX 2 cấp)' : 'Chọn Quận / Huyện (SPX 3 cấp)';
    districtSel.innerHTML = `<option value="" disabled selected>${textLabel}</option>`;
    data.forEach(d => {
        const o = document.createElement('option');
        o.value = d.location_id; // Store numerical location_id from SPX
        o.setAttribute('data-name', d.name);
        o.textContent = d.name;
        districtSel.appendChild(o);
    });
    refreshSpxSearchablePicker('jtDistrict');
    refreshSpxSearchablePicker('jtWard');
}

async function loadJtWards(parentId) {
    const wardSel = document.getElementById('jtWard');
    if (!wardSel) return;

    wardSel.innerHTML = '<option value="" disabled selected>Đang tải...</option>';
    wardSel.disabled = false;
    refreshSpxSearchablePicker('jtWard');

    const version = getSpxAddressVersion();
    const data = await fetchSpxRegions(parentId, 1, version);
    wardSel.innerHTML = '<option value="" disabled selected>Chọn Phường / Xã (SPX 3 cấp)</option>';
    data.forEach(w => {
        const o = document.createElement('option');
        o.value = w.location_id; // Store numerical location_id from SPX
        o.setAttribute('data-name', w.name);
        o.textContent = w.name;
        wardSel.appendChild(o);
    });
    refreshSpxSearchablePicker('jtWard');
}

async function loadSpxWarehouses() {
    const select = document.getElementById('jtWarehouseSelect');
    const summary = document.getElementById('jtWarehouseSummary');
    if (!select) return;
    select.innerHTML = '<option value="">Đang tải kho...</option>';
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/warehouses?select=*&is_active=eq.true&order=is_default.desc,created_at.asc`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error(await res.text());
        spxWarehouses = await res.json();
        select.innerHTML = spxWarehouses.length ? '' : '<option value="">Chưa có kho gửi hàng</option>';
        spxWarehouses.forEach(w => {
            const opt = document.createElement('option');
            opt.value = w.id;
            opt.textContent = (w.is_default ? '★ ' : '') + w.name + ' — ' + w.sender_detail_address;
            if (w.is_default) opt.selected = true;
            select.appendChild(opt);
        });
        if (!select.value && spxWarehouses[0]) select.value = spxWarehouses[0].id;
        renderSelectedWarehouseSummary();
        renderWarehousePicker();
    } catch (err) {
        console.error('Load warehouses error:', err);
        select.innerHTML = '<option value="">Không tải được kho</option>';
        const pickerLabel = document.getElementById('jtWarehousePickerLabel');
        if (pickerLabel) pickerLabel.textContent = 'Không tải được kho';
        if (summary) summary.style.display = 'none';
    }
}

function warehouseDisplayLabel(w) {
    return (w?.is_default ? '★ ' : '') + (w?.name || 'Kho') + ' — ' + (w?.sender_detail_address || '');
}

function renderWarehousePicker() {
    const select = document.getElementById('jtWarehouseSelect');
    const label = document.getElementById('jtWarehousePickerLabel');
    const menu = document.getElementById('jtWarehousePickerMenu');
    if (!select || !label || !menu) return;
    const current = spxWarehouses.find(w => String(w.id) === String(select.value));
    label.textContent = current ? warehouseDisplayLabel(current) : (spxWarehouses.length ? 'Chọn kho gửi hàng' : 'Chưa có kho gửi hàng');
    menu.innerHTML = spxWarehouses.map(w => {
        const selected = String(w.id) === String(select.value);
        return '<div data-wh-row="' + w.id + '" style="display:flex; align-items:center; gap:6px; border-bottom:1px solid var(--border); background:' + (selected ? 'var(--primary-light)' : 'var(--bg-panel)') + ';">' +
            '<button type="button" data-wh-select="' + w.id + '" style="flex:1; min-width:0; text-align:left; border:0; background:transparent; padding:9px 10px; cursor:pointer; color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(warehouseDisplayLabel(w)) + '</button>' +
            '<button type="button" data-wh-edit="' + w.id + '" title="Sửa kho" style="width:34px; height:34px; margin-right:4px; border:0; border-radius:6px; background:transparent; cursor:pointer; color:var(--primary); font-size:15px;">✏</button>' +
        '</div>';
    }).join('');
    menu.querySelectorAll('[data-wh-select]').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        select.value = btn.getAttribute('data-wh-select');
        renderSelectedWarehouseSummary();
        renderWarehousePicker();
        menu.style.display = 'none';
    }));
    menu.querySelectorAll('[data-wh-edit]').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        await window.editSelectedWarehouse(btn.getAttribute('data-wh-edit'));
    }));
}

function toggleWarehousePicker() {
    const menu = document.getElementById('jtWarehousePickerMenu');
    if (!menu) return;
    if (menu.style.display === 'block') menu.style.display = 'none';
    else { renderWarehousePicker(); menu.style.display = 'block'; }
}

function renderSelectedWarehouseSummary() {
    const select = document.getElementById('jtWarehouseSelect');
    const summary = document.getElementById('jtWarehouseSummary');
    if (!select || !summary) return;
    const w = spxWarehouses.find(x => String(x.id) === String(select.value));
    if (!w) { summary.style.display = 'none'; return; }
    summary.style.display = 'block';
    summary.textContent = `${w.sender_name} · ${w.sender_phone} · ${w.sender_detail_address}, ${w.sender_city}, ${w.sender_state}`;
}

window.deleteEditingWarehouse = async function() {
    const editId = document.getElementById('whEditId')?.value || '';
    if (!editId) return;
    const select = document.getElementById('jtWarehouseSelect');
    if (select) select.value = editId;
    await window.deleteSelectedWarehouse();
    window.closeWarehouseModal();
    renderWarehousePicker();
};

window.deleteSelectedWarehouse = async function() {
    const select = document.getElementById('jtWarehouseSelect');
    const warehouseId = select?.value;
    const warehouse = spxWarehouses.find(x => String(x.id) === String(warehouseId));
    if (!warehouse) {
        alert('Vui lòng chọn kho cần xóa.');
        return;
    }

    const defaultNote = warehouse.is_default ? '\n\nKho này đang là kho mặc định. Sau khi xóa, hệ thống sẽ tự đặt một kho còn lại làm mặc định.' : '';
    if (!confirm('Bạn có chắc muốn xóa kho "' + (warehouse.name || '') + '"?' + defaultNote)) return;

    try {
        const res = await fetch(SUPABASE_URL + '/rest/v1/warehouses?id=eq.' + encodeURIComponent(warehouseId), {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Prefer': 'return=minimal'
            }
        });
        if (!res.ok) throw new Error(await res.text());

        await loadSpxWarehouses();

        if (warehouse.is_default && spxWarehouses.length > 0 && !spxWarehouses.some(w => w.is_default)) {
            const next = spxWarehouses[0];
            const setDefaultRes = await fetch(SUPABASE_URL + '/rest/v1/warehouses?id=eq.' + encodeURIComponent(next.id), {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ is_default: true })
            });
            if (setDefaultRes.ok) await loadSpxWarehouses();
        }

        renderSelectedWarehouseSummary();
    } catch (err) {
        alert('Không thể xóa kho: ' + err.message);
    }
};

function getWarehouseAddressVersion() {
    const radios = document.getElementsByName('whAddressDataType');
    for (const r of radios) {
        if (r.checked) return r.value === '1' ? 2 : 0;
    }
    return 2;
}

function updateWarehouseAddressUI() {
    const version = getWarehouseAddressVersion();
    const label = document.getElementById('whDistrictLabel');
    const wardGroup = document.getElementById('whWardGroup');
    const wardSel = document.getElementById('whWard');
    if (version === 2) {
        if (label) label.textContent = 'Quận / Phường *';
        if (wardGroup) wardGroup.style.display = 'none';
        if (wardSel) { wardSel.removeAttribute('required'); wardSel.disabled = true; }
    } else {
        if (label) label.textContent = 'Quận / Huyện *';
        if (wardGroup) wardGroup.style.display = 'block';
        if (wardSel) wardSel.setAttribute('required','required');
    }
}

window.openWarehouseModal = async function() {
    const modal = document.getElementById('warehouseModal');
    const form = document.getElementById('warehouseForm');
    if (form) form.reset();
    const editId = document.getElementById('whEditId');
    if (editId) editId.value = '';
    const title = document.getElementById('warehouseModalTitle');
    if (title) title.textContent = 'Thêm kho gửi hàng';
    const saveBtn = document.getElementById('btnSaveWarehouse');
    if (saveBtn) saveBtn.textContent = 'Lưu kho';
    const deleteBtn = document.getElementById('btnDeleteWarehouseInModal');
    if (deleteBtn) deleteBtn.style.display = 'none';
    const defaultRadio = document.querySelector('input[name="whAddressDataType"][value="1"]');
    if (defaultRadio) defaultRadio.checked = true;
    updateWarehouseAddressUI();
    if (modal) modal.style.display = 'flex';
    await loadWarehouseProvinces();
};
window.closeWarehouseModal = function() {
    const modal = document.getElementById('warehouseModal');
    if (modal) modal.style.display = 'none';
};

window.editSelectedWarehouse = async function(warehouseId = null) {
    const select = document.getElementById('jtWarehouseSelect');
    warehouseId = warehouseId || select?.value;
    const w = spxWarehouses.find(x => String(x.id) === String(warehouseId));
    if (!w) {
        alert('Vui lòng chọn kho cần sửa.');
        return;
    }

    const modal = document.getElementById('warehouseModal');
    const form = document.getElementById('warehouseForm');
    if (form) form.reset();
    document.getElementById('whEditId').value = w.id;
    document.getElementById('whName').value = w.name || w.sender_name || '';
    document.getElementById('whSenderPhone').value = w.sender_phone || '';
    document.getElementById('whDetailAddress').value = w.sender_detail_address || '';
    document.getElementById('whIsDefault').checked = !!w.is_default;

    const addressVersion = Number(w.sender_address_version) === 0 ? 0 : 2;
    const radio = document.querySelector('input[name="whAddressDataType"][value="' + (addressVersion === 2 ? '1' : '2') + '"]');
    if (radio) radio.checked = true;
    updateWarehouseAddressUI();

    const title = document.getElementById('warehouseModalTitle');
    if (title) title.textContent = 'Sửa kho gửi hàng';
    const saveBtn = document.getElementById('btnSaveWarehouse');
    if (saveBtn) saveBtn.textContent = 'Lưu thay đổi';
    const deleteBtn = document.getElementById('btnDeleteWarehouseInModal');
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    if (modal) modal.style.display = 'flex';

    await loadWarehouseProvinces();
    const stateSel = document.getElementById('whState');
    if (stateSel && w.sender_state_location_id) {
        stateSel.value = String(w.sender_state_location_id);
        await loadWarehouseDistricts();
    }

    const districtSel = document.getElementById('whDistrict');
    if (districtSel) {
        if (addressVersion === 2) {
            districtSel.value = String(w.sender_city_location_id || '');
        } else {
            const wantedDistrict = String(w.sender_address_instruction || '').trim().toLowerCase();
            if (wantedDistrict) {
                const match = Array.from(districtSel.options).find(o => String(o.dataset.name || o.textContent || '').trim().toLowerCase() === wantedDistrict);
                if (match) districtSel.value = match.value;
            }
            if (districtSel.value) {
                await loadWarehouseWards();
                const wardSel = document.getElementById('whWard');
                if (wardSel) wardSel.value = String(w.sender_city_location_id || '');
            }
        }
    }
};

async function loadWarehouseProvinces() {
    const stateSel = document.getElementById('whState');
    const districtSel = document.getElementById('whDistrict');
    const wardSel = document.getElementById('whWard');
    if (!stateSel) return;
    stateSel.innerHTML = '<option value="">Đang tải Tỉnh / Thành phố...</option>';
    if (districtSel) { districtSel.innerHTML = '<option value="">Chọn Quận / Huyện</option>'; districtSel.disabled = true; }
    if (wardSel) { wardSel.innerHTML = '<option value="">Chọn Phường / Xã</option>'; wardSel.disabled = true; }
    const version = getWarehouseAddressVersion();
    const rows = await fetchSpxRegions(-1, 1, version);
    stateSel.innerHTML = `<option value="">Chọn Tỉnh / Thành phố (SPX ${version === 2 ? '2 cấp' : '3 cấp'})</option>`;
    rows.forEach(r => {
        const o = document.createElement('option');
        o.value = r.location_id;
        o.dataset.name = r.name;
        o.textContent = r.name;
        stateSel.appendChild(o);
    });
}

async function loadWarehouseDistricts() {
    const stateSel = document.getElementById('whState');
    const districtSel = document.getElementById('whDistrict');
    const wardSel = document.getElementById('whWard');
    if (!stateSel || !districtSel || !stateSel.value) return;
    districtSel.disabled = true;
    const version = getWarehouseAddressVersion();
    districtSel.innerHTML = `<option value="">Đang tải ${version === 2 ? 'Quận / Phường' : 'Quận / Huyện'}...</option>`;
    if (wardSel) { wardSel.innerHTML = '<option value="">Chọn Phường / Xã</option>'; wardSel.disabled = true; }
    const rows = await fetchSpxRegions(parseInt(stateSel.value), 1, version);
    districtSel.innerHTML = `<option value="">Chọn ${version === 2 ? 'Quận / Phường' : 'Quận / Huyện'}</option>`;
    rows.forEach(r => {
        const o = document.createElement('option');
        o.value = r.location_id;
        o.dataset.name = r.name;
        o.textContent = r.name;
        districtSel.appendChild(o);
    });
    districtSel.disabled = false;
}

async function loadWarehouseWards() {
    if (getWarehouseAddressVersion() === 2) return;
    const districtSel = document.getElementById('whDistrict');
    const wardSel = document.getElementById('whWard');
    if (!districtSel || !wardSel || !districtSel.value) return;
    wardSel.disabled = true;
    wardSel.innerHTML = '<option value="">Đang tải Phường / Xã...</option>';
    const rows = await fetchSpxRegions(parseInt(districtSel.value), 1, 0);
    wardSel.innerHTML = '<option value="">Chọn Phường / Xã</option>';
    rows.forEach(r => {
        const o = document.createElement('option');
        o.value = r.location_id;
        o.dataset.name = r.name;
        o.textContent = r.name;
        wardSel.appendChild(o);
    });
    wardSel.disabled = false;
}

async function handleWarehouseSubmit(e) {
    e.preventDefault();
    const stateSel = document.getElementById('whState');
    const districtSel = document.getElementById('whDistrict');
    const wardSel = document.getElementById('whWard');
    const stateOpt = stateSel?.options[stateSel.selectedIndex];
    const districtOpt = districtSel?.options[districtSel.selectedIndex];
    const wardOpt = wardSel?.options[wardSel.selectedIndex];
    const stateName = stateOpt?.dataset?.name || stateOpt?.textContent || '';
    const districtName = districtOpt?.dataset?.name || districtOpt?.textContent || '';
    const wardName = wardOpt?.dataset?.name || wardOpt?.textContent || '';
    const senderName = document.getElementById('whName').value.trim();
    const senderPhone = document.getElementById('whSenderPhone').value.trim();
    const detailAddress = document.getElementById('whDetailAddress').value.trim();
    const isDefault = document.getElementById('whIsDefault').checked;
    const editId = document.getElementById('whEditId')?.value || '';

    const addressVersion = getWarehouseAddressVersion();
    if (!stateSel?.value || !districtSel?.value || (addressVersion === 0 && !wardSel?.value)) {
        alert(addressVersion === 2 ? 'Vui lòng chọn đầy đủ Tỉnh / Quận-Phường.' : 'Vui lòng chọn đầy đủ Tỉnh / Quận / Phường.');
        return;
    }

    const payload = {
        name: senderName,
        sender_name: senderName,
        sender_phone: senderPhone,
        sender_address_pk_id: 12372520,
        sender_address_id: '1903759590504751104',
        sender_country: 'VN',
        sender_state: stateName,
        sender_state_location_id: parseInt(stateSel.value) || 0,
        sender_city: addressVersion === 2 ? districtName : wardName,
        sender_city_location_id: addressVersion === 2 ? (parseInt(districtSel.value) || 0) : (parseInt(wardSel.value) || 0),
        sender_detail_address: detailAddress,
        sender_post_code: '',
        sender_unit_no: '',
        sender_place_id: '',
        sender_address_instruction: addressVersion === 0 ? districtName : '',
        sender_address_version: addressVersion,
        is_active: true,
        is_default: isDefault
    };

    try {
        if (isDefault) {
            await fetch(SUPABASE_URL + '/rest/v1/warehouses?is_default=eq.true', {
                method:'PATCH',
                headers:{ 'apikey':SUPABASE_KEY,'Authorization':'Bearer ' + SUPABASE_KEY,'Content-Type':'application/json' },
                body: JSON.stringify({ is_default:false })
            });
        }
        const endpoint = editId
            ? SUPABASE_URL + '/rest/v1/warehouses?id=eq.' + encodeURIComponent(editId)
            : SUPABASE_URL + '/rest/v1/warehouses';
        const res = await fetch(endpoint, {
            method: editId ? 'PATCH' : 'POST',
            headers:{ 'apikey':SUPABASE_KEY,'Authorization':'Bearer ' + SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        const saved = await res.json();
        const savedId = saved?.[0]?.id || editId;
        window.closeWarehouseModal();
        e.target.reset();
        await loadSpxWarehouses();
        if (savedId) document.getElementById('jtWarehouseSelect').value = savedId;
        renderSelectedWarehouseSummary();
    } catch(err) {
        alert('Không thể lưu kho: ' + err.message);
    }
}

// Open modal to configure new transportation order
// Open modal to configure new transportation order (SPX Express)
window.openSpxCreateModal = window.openJtCreateModal = async function(orderId, event) {
    if (event) event.stopPropagation();

    const localId = document.getElementById('jtLocalOrderId');
    if (localId) localId.value = orderId;

    // Fetch order details from Supabase to prefill details
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}&select=*,items:pancake_order_items(*)`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (!res.ok) throw new Error('Order not found');
        const orders = await res.json();
        if (orders && orders.length > 0) {
            const order = orders[0];
            
            // Prefill Fields
            document.getElementById('jtReceiverName').value = order.bill_full_name || '';
            document.getElementById('jtReceiverPhone').value = order.bill_phone_number || '';
            document.getElementById('jtReceiverAddress').value = order.shipping_address?.full_address || order.shipping_address?.address || '';
            document.getElementById('jtCodMoney').value = order.cod || 0;
            
            // Prefill goods name from order items
            const goodsNames = (order.items || []).map(x => x.product_name).join(', ');
            document.getElementById('jtGoodsName').value = goodsNames || 'Hàng hóa';

            // Show modal and load warehouse + SPX location layer info
            document.getElementById('jtCreateOrderModal').style.display = 'flex';
            await loadSpxWarehouses();
            await loadJtProvinces();
        }
    } catch(e) {
        console.error(e);
        alert('Không lấy được thông tin chi tiết đơn hàng!');
    }
};

// Handle SPX submit creating process using Supabase Edge Function: create-order
async function handleJtOrderSubmit(e) {
    e.preventDefault();

    const addrVersion = getSpxAddressVersion();
    const orderId = document.getElementById('jtLocalOrderId').value;
    const name = document.getElementById('jtReceiverName').value.trim();
    const phone = document.getElementById('jtReceiverPhone').value.trim();
    const detailAddress = document.getElementById('jtReceiverAddress').value.trim();
    const goodsName = document.getElementById('jtGoodsName').value.trim();
    const codMoney = parseInt(document.getElementById('jtCodMoney').value) || 0;
    const weightKg = parseFloat(document.getElementById('jtWeight')?.value) || 1;

    const provSel = document.getElementById('jtProvince');
    const selectedProv = provSel.options[provSel.selectedIndex];
    const provName = selectedProv ? (selectedProv.getAttribute('data-name') || selectedProv.textContent) : '';
    const provId = selectedProv ? (parseInt(selectedProv.value) || 0) : 0;

    const distSel = document.getElementById('jtDistrict');
    const selectedDist = distSel.options[distSel.selectedIndex];
    const distName = selectedDist ? (selectedDist.getAttribute('data-name') || selectedDist.textContent) : '';
    const distId = selectedDist ? (parseInt(selectedDist.value) || 0) : 0;

    let wardName = '';
    let wardId = 0;
    const wardSel = document.getElementById('jtWard');
    if (addrVersion === 0 && wardSel && wardSel.selectedIndex >= 0) {
        const selectedWard = wardSel.options[wardSel.selectedIndex];
        if (selectedWard && selectedWard.value) {
            wardName = selectedWard.getAttribute('data-name') || selectedWard.textContent;
            wardId = parseInt(selectedWard.value) || 0;
        }
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const btnText = submitBtn ? (submitBtn.querySelector('span') || submitBtn) : null;
    if (submitBtn) submitBtn.disabled = true;
    if (btnText) btnText.textContent = 'Đang tạo đơn SPX...';

    try {
        // Business Payload sent to Edge Function
        const cleanPayload = {
            receiver: {
                name: name,
                phone: phone,
                province: {
                    name: provName,
                    id: provId
                },
                district: {
                    name: distName,
                    id: distId
                },
                ward: {
                    name: wardName,
                    id: wardId
                },
                detail_address: detailAddress,
                address_version: addrVersion
            },
            product: {
                name: goodsName,
                weight: weightKg,
                price: 0
            },
            cod: codMoney,
            sender_info: (() => {
                const warehouseId = document.getElementById('jtWarehouseSelect')?.value;
                const w = spxWarehouses.find(x => String(x.id) === String(warehouseId));
                if (!w) throw new Error('Vui lòng chọn kho gửi hàng');
                return {
                    sender_address_pk_id: 12372520,
                    sender_name: w.sender_name,
                    sender_phone: w.sender_phone,
                    sender_address_id: '1903759590504751104',
                    sender_country: w.sender_country || 'VN',
                    sender_state: w.sender_state,
                    sender_state_location_id: w.sender_state_location_id,
                    sender_city: w.sender_city,
                    sender_city_location_id: w.sender_city_location_id,
                    sender_post_code: w.sender_post_code || '',
                    sender_detail_address: w.sender_detail_address,
                    sender_unit_no: w.sender_unit_no || '',
                    sender_place_id: w.sender_place_id || '',
                    sender_address_instruction: w.sender_address_instruction || '',
                    sender_address_version: w.sender_address_version ?? 2
                };
            })()
        };

        // Edge Function cũ của SPX dùng key camelCase senderInfo. Gửi cả 2 dạng để đảm bảo kho đang chọn được dùng,
        // đồng thời gửi warehouse_id để function có thể tra trực tiếp bản ghi kho khi cần.
        cleanPayload.senderInfo = { ...cleanPayload.sender_info };
        cleanPayload.warehouse_id = document.getElementById('jtWarehouseSelect')?.value || null;
        console.log('[SPX] Kho gửi hàng đã chọn:', cleanPayload.warehouse_id, cleanPayload.senderInfo);

        // Call Supabase Edge Function: create-order
        const spxFunctionUrl = `${SUPABASE_URL}/functions/v1/create-order`;
        const res = await fetch(spxFunctionUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(cleanPayload)
        });

        const json = await res.json();

        if (res.ok && json.success) {
            const waybillId = json.spx_tn || json.sls_tn || json.order_sn || '';
            const orderSpx = json.order_sn || '';
            console.log('[SPX] create-order response:', json);

            // Luôn tra lại đơn vừa tạo qua chính Supabase Edge Function create-order.
            // Function sẽ gọi SPX list_all_order và trả estimated_shipping_fee + sort_code_info.
            let extraSpxInfo = null;
            try {
                const extraRes = await fetch(spxFunctionUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        action: 'get_order_extra',
                        spx_tn: json.spx_tn || json.sls_tn || waybillId,
                        sls_tn: json.sls_tn || null,
                        order_sn: json.order_sn || orderSpx
                    })
                });

                const extraJson = await extraRes.json().catch(() => null);
                if (extraRes.ok && extraJson?.success) {
                    extraSpxInfo = extraJson;
                    console.log('[SPX] create-order get_order_extra:', extraJson);
                } else {
                    console.warn('[SPX] Không lấy được extra info từ create-order:', extraJson);
                }
            } catch (extraErr) {
                console.warn('[SPX] Lỗi gọi create-order get_order_extra:', extraErr);
            }

            const hasListAllOrderFee =
                extraSpxInfo?.estimated_shipping_fee !== null &&
                extraSpxInfo?.estimated_shipping_fee !== undefined &&
                extraSpxInfo?.estimated_shipping_fee !== '';

            // batch_create_order thường trả 0 dù phí thực tế chưa được chốt.
            // Chỉ dùng giá trị của create-order làm fallback khi nó > 0.
            const createOrderFeeNumber = Number(json.estimated_shipping_fee);
            const rawEstimatedShippingFee = hasListAllOrderFee
                ? extraSpxInfo.estimated_shipping_fee
                : (Number.isFinite(createOrderFeeNumber) && createOrderFeeNumber > 0
                    ? createOrderFeeNumber
                    : null);

            const hasEstimatedShippingFee =
                rawEstimatedShippingFee !== null &&
                rawEstimatedShippingFee !== undefined &&
                rawEstimatedShippingFee !== '';

            const estimatedShippingFee = hasEstimatedShippingFee
                ? Number(rawEstimatedShippingFee)
                : null;

            const estimatedShippingFeeText =
                estimatedShippingFee !== null && Number.isFinite(estimatedShippingFee)
                    ? estimatedShippingFee.toLocaleString('vi-VN') + ' đ'
                    : 'Chưa lấy được từ SPX';

            // Save SPX waybill ID to Supabase pancake_orders and update status to "Chờ lấy hàng" (status: 9)
            let patchData = {
                jt_waybill_id: waybillId,
                order_spx: orderSpx,
                warehouse_id: cleanPayload.warehouse_id,
                status: 9
            };

            let supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(patchData)
            });

            if (!supabaseRes.ok) {
                // Fallback without order_spx if column is missing from schema
                delete patchData.order_spx;
                supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(patchData)
                });
            }

            if (supabaseRes.ok) {
                alert(`Tạo đơn SPX Express thành công!\nMã vận đơn (SPX TN): ${waybillId}\nMã đơn (Order SN): ${orderSpx}\nTiền ship dự kiến: ${estimatedShippingFeeText}`);
                document.getElementById('jtCreateOrderModal').style.display = 'none';
                fetchDashboardOrders();
                if (typeof window.processChatbotTrigger === 'function') {
                    window.processChatbotTrigger(orderId, 9);
                }
            } else {
                alert(`Đã tạo đơn SPX (${waybillId}) nhưng không đồng bộ được lên Supabase.`);
            }
        } else {
            alert(`Lỗi tạo vận đơn SPX: ${json.error || json.message || JSON.stringify(json)}`);
        }
    } catch (err) {
        console.error('SPX create order error:', err);
        alert('Lỗi kết nối Edge Function SPX create-order!');
    } finally {
        submitBtn.disabled = false;
        if (btnText) btnText.innerHTML = '<i data-lucide="send" style="width:16px;"></i> Tạo Đơn SPX';
        if (window.lucide) lucide.createIcons();
    }
}

async function handleWalkInOrderSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('walkInName').value.trim();
    const phone = document.getElementById('walkInPhone').value.trim();
    const address = document.getElementById('walkInAddress').value.trim();
    const goods = document.getElementById('walkInGoods').value.trim();
    const totalPrice = parseInt(document.getElementById('walkInTotal').value, 10) || 0;
    const cod = parseInt(document.getElementById('walkInCod').value, 10) || 0;
    const note = document.getElementById('walkInNote').value.trim();

    const selectedCustomerInput = document.getElementById('walkInCustomerSearch');
    const selectedCustomerFbId = selectedCustomerInput?.dataset.selectedCustomerId || '';

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Đang tạo...';
    }

    try {
        if (!name || !phone) {
            throw new Error('Vui lòng nhập tên và số điện thoại khách hàng.');
        }

        let newDisplayId = 16000;
        const latestIdRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?select=display_id&display_id=not.is.null&display_id=lt.1000000000&order=display_id.desc&limit=1`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!latestIdRes.ok) {
            throw new Error('Không lấy được mã đơn gần nhất: ' + await latestIdRes.text());
        }

        const latestIds = await latestIdRes.json();
        const latestDisplayId = parseInt(latestIds?.[0]?.display_id, 10);
        if (!isNaN(latestDisplayId) && latestDisplayId > 0) {
            newDisplayId = latestDisplayId + 1;
        }
        // Tạo khách hàng nếu chưa có trong bảng pancake_customers
        if (selectedCustomerFbId) {
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(selectedCustomerFbId)}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        name: name,
                        phone_numbers: phone ? [phone] : [],
                        shop_customer_addresses: address ? [{ full_address: address, address: address, full_name: name }] : undefined,
                        updated_at: new Date().toISOString()
                    })
                });
            } catch (custErr) {
                console.warn('Không thể cập nhật khách hàng đã chọn:', custErr);
            }
        } else if (phone) {
            try {
                const custCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?select=id&phone_numbers=cs.{${encodeURIComponent(phone)}}&limit=1`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                });
                const custCheckData = custCheckRes.ok ? await custCheckRes.json() : [];
                if (custCheckData.length === 0) {
                    await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({
                            name: name,
                            phone_numbers: [phone],
                            shop_customer_addresses: address ? [{ full_address: address, address: address, full_name: name }] : [],
                            inserted_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                    });
                }
            } catch (custErr) {
                console.warn('Không thể kiểm tra/tạo khách hàng:', custErr);
            }
        }

        const combinedNote = [goods, note].filter(Boolean).join(' | ');
        const payload = {
            id: `local_${newDisplayId}`,
            display_id: newDisplayId,
            shop_id: PANCAKE_SHOP_ID,
            bill_full_name: name,
            bill_phone_number: phone,
            status: 'Chờ xử lý (Mới)',
            note: combinedNote,
            inserted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        if (address) {
            payload.shipping_address = { full_address: address, address: address };
        }
        if (totalPrice > 0) {
            payload.total_price = totalPrice;
        }
        if (cod > 0) {
            payload.cod = cod;
        }

        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || 'Không thể tạo đơn vãng lai');
        }

        if (typeof showToast === 'function') {
            showToast(`✅ Đã tạo đơn vãng lai #${newDisplayId}` , 'success');
        } else {
            alert(`Đã tạo đơn vãng lai #${newDisplayId}`);
        }

        const walkInModal = document.getElementById('walkInOrderModal');
        if (walkInModal) walkInModal.style.display = 'none';

        form.reset();
        fetchDashboardOrders();
    } catch (err) {
        console.error('handleWalkInOrderSubmit error:', err);
        alert('Lỗi tạo đơn vãng lai: ' + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
}

async function loadWalkInCustomerSuggestions(query = '') {
    const suggestions = document.getElementById('walkInCustomerSuggestions');
    const searchInput = document.getElementById('walkInCustomerSearch');
    if (!suggestions || !searchInput) return;

    if (!query) {
        suggestions.style.display = 'none';
        suggestions.innerHTML = '';
        searchInput.dataset.selectedCustomerId = '';
        return;
    }

    const cleanQuery = query.trim();
    const encodedQuery = encodeURIComponent(cleanQuery);
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
    };

    let customers = [];
    try {
        const nameUrl = `${SUPABASE_URL}/rest/v1/pancake_customers?select=fb_id,name,phone_numbers,shop_customer_addresses&name=ilike.*${encodedQuery}*&order=inserted_at.desc&limit=8`;
        const nameRes = await fetch(nameUrl, { headers });
        if (!nameRes.ok) throw new Error('Không tải được khách hàng');
        customers = await nameRes.json();

        if (/^\d+$/.test(cleanQuery) && customers.length < 8) {
            const phoneUrl = `${SUPABASE_URL}/rest/v1/pancake_customers?select=fb_id,name,phone_numbers,shop_customer_addresses&phone_numbers=cs.{${encodedQuery}}&order=inserted_at.desc&limit=8`;
            const phoneRes = await fetch(phoneUrl, { headers });
            if (phoneRes.ok) {
                const phoneCustomers = await phoneRes.json();
                const existingFbIds = new Set(customers.map(c => c.fb_id));
                phoneCustomers.forEach(c => {
                    if (!existingFbIds.has(c.fb_id)) customers.push(c);
                });
            }
        }

        if (!customers || customers.length === 0) {
            suggestions.innerHTML = '<div style="padding:12px 14px; color:var(--text-muted);">Không tìm thấy khách hàng phù hợp.</div>';
            suggestions.style.display = 'block';
            return;
        }

        suggestions.innerHTML = customers.map(c => {
            const phones = Array.isArray(c.phone_numbers) ? c.phone_numbers.filter(Boolean).join(', ') : (c.phone_numbers || '');
            const addrObj = Array.isArray(c.shop_customer_addresses) && c.shop_customer_addresses[0];
            const address = addrObj ? (addrObj.full_address || addrObj.address || '') : '';
            return `
                <button type="button" data-customer-id="${encodeURIComponent(c.fb_id || '')}" data-customer-name="${encodeURIComponent(c.name || '')}" data-customer-phone="${encodeURIComponent(phones)}" data-customer-address="${encodeURIComponent(address)}" style="width:100%; text-align:left; padding:12px 14px; border:none; background:none; cursor:pointer; display:flex; flex-direction:column; gap:4px; color:var(--text-main);">
                    <span style="font-weight:700;">${c.name || '(Không tên)'}</span>
                    <span style="font-size:0.82rem; color:var(--text-muted);">${phones || 'Không có số điện thoại'}</span>
                    <span style="font-size:0.8rem; color:var(--text-muted);">${address || 'Không có địa chỉ'}</span>
                </button>
            `;
        }).join('<hr style="margin:0;border:none;border-top:1px solid var(--border);">');
        suggestions.style.display = 'block';
    } catch (err) {
        console.warn('loadWalkInCustomerSuggestions error:', err);
        suggestions.innerHTML = `<div style="padding:12px 14px; color:var(--danger);">Lỗi tải khách hàng</div>`;
        suggestions.style.display = 'block';
    }
}

// Open a simple picker to select a pancake_customers row and associate with order
window.openSelectCustomerForOrder = async function(orderId, context) {
    // Create a lightweight modal if not existing
    let picker = document.getElementById('selectCustomerForOrderModal');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'selectCustomerForOrderModal';
        picker.className = 'lightbox-modal';
        picker.style.cssText = 'display:none; align-items:center; justify-content:center; z-index:2200;';
        picker.innerHTML = `
            <div style="width:720px; max-width:95%; max-height:80vh; overflow:auto; background:var(--bg-panel); border-radius:12px; padding:18px; box-sizing:border-box;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="margin:0;">Chọn khách hàng để thay thế</h3>
                    <button id="closeSelectCustomerForOrder" style="background:none;border:none;font-size:20px;">&times;</button>
                </div>
                <div style="display:flex; gap:8px; margin-bottom:12px;">
                    <input id="selectCustomerForOrderSearch" placeholder="Tìm theo tên hoặc SĐT" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--border);">
                    <button id="selectCustomerForOrderRefresh" class="btn-secondary-quick">Tìm</button>
                </div>
                <div id="selectCustomerForOrderList" style="display:flex; flex-direction:column; gap:8px;">Đang tải...</div>
            </div>`;
        document.body.appendChild(picker);
        document.getElementById('closeSelectCustomerForOrder').addEventListener('click', () => { picker.style.display = 'none'; });
        document.getElementById('selectCustomerForOrderRefresh').addEventListener('click', () => {
            const q = document.getElementById('selectCustomerForOrderSearch').value.trim();
            loadSelectCustomerForOrderList(orderId, q);
        });
        document.getElementById('selectCustomerForOrderSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('selectCustomerForOrderRefresh').click(); } });
    }

    // show modal and load list
    picker.style.display = 'flex';
    document.getElementById('selectCustomerForOrderSearch').value = '';
    loadSelectCustomerForOrderList(orderId, '');
};

async function loadSelectCustomerForOrderList(orderId, query) {
    const list = document.getElementById('selectCustomerForOrderList');
    if (!list) return;
    list.innerHTML = '<div style="padding:12px; color:var(--text-muted);">🔄 Đang tìm...</div>';
    try {
        const encoded = encodeURIComponent(query || '');
        let rows = [];

        if (!query) {
            const url = `${SUPABASE_URL}/rest/v1/pancake_customers?select=fb_id,name,phone_numbers,shop_customer_addresses,avatar_url&order=inserted_at.desc&limit=30`;
            const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            if (!res.ok) throw new Error('Không tải được khách hàng');
            rows = await res.json();
        } else if (/^\d+$/.test(query.trim())) {
            const [nameRes, phoneRes] = await Promise.all([
                fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?select=fb_id,name,phone_numbers,shop_customer_addresses,avatar_url&name=ilike.*${encoded}*&order=inserted_at.desc&limit=15`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }),
                fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?select=fb_id,name,phone_numbers,shop_customer_addresses,avatar_url&phone_numbers=cs.{${encoded}}&order=inserted_at.desc&limit=15`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } })
            ]);
            if (!nameRes.ok || !phoneRes.ok) throw new Error('Không tải được khách hàng');
            const [nameRows, phoneRows] = await Promise.all([nameRes.json(), phoneRes.json()]);
            const seen = new Set();
            rows = [...nameRows, ...phoneRows].filter(c => {
                if (!c || !c.fb_id) return false;
                if (seen.has(c.fb_id)) return false;
                seen.add(c.fb_id);
                return true;
            }).slice(0, 30);
        } else {
            const url = `${SUPABASE_URL}/rest/v1/pancake_customers?select=fb_id,name,phone_numbers,shop_customer_addresses,avatar_url&name=ilike.*${encoded}*&order=inserted_at.desc&limit=30`;
            const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            if (!res.ok) throw new Error('Không tải được khách hàng');
            rows = await res.json();
        }
        if (!rows || rows.length === 0) { list.innerHTML = '<div style="padding:12px; color:var(--text-muted);">Không tìm thấy khách hàng</div>'; return; }

        list.innerHTML = rows.map(c => {
            const phones = Array.isArray(c.phone_numbers) ? c.phone_numbers.filter(Boolean).join(' · ') : (c.phone_numbers || '—');
            const addrObj = Array.isArray(c.shop_customer_addresses) && c.shop_customer_addresses[0];
            const address = addrObj ? (addrObj.full_address || addrObj.address || '') : '';
            return `
                <button type="button" data-fb-id="${encodeURIComponent(c.fb_id||'')}" style="width:100%; text-align:left; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-app); display:flex; gap:12px; align-items:center;">
                    <div style="width:44px;height:44px;flex-shrink:0;">${c.avatar_url ? `<img src="${c.avatar_url}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;">` : `<div style=\"width:44px;height:44px;border-radius:50%;background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--text-muted);\">${(c.name||'?')[0].toUpperCase()}</div>`}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:700;color:var(--text-main)">${c.name||'(Không tên)'}</div>
                        <div style="font-size:0.82rem;color:var(--text-muted);">${phones} ${address ? '· ' + address : ''}</div>
                    </div>
                    <div style="flex-shrink:0;"><span style="font-size:0.82rem;color:var(--primary);font-weight:700;">Chọn</span></div>
                </button>`;
        }).join('');

        // attach click handlers
        Array.from(list.querySelectorAll('button[data-fb-id]')).forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const fbId = decodeURIComponent(btn.dataset.fbId || '');
                if (!confirm('Bạn có muốn thay khách hàng của đơn này bằng khách đã chọn?')) return;
                // Update pancake_orders bill_* and conversation link to associate
                try {
                    // Fetch selected customer details
                    const custRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}&select=name,phone_numbers,shop_customer_addresses,conversation_link&limit=1`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
                    const custData = custRes.ok ? await custRes.json() : [];
                    const c = custData && custData[0] ? custData[0] : null;
                    const name = c?.name || '';
                    const phones = Array.isArray(c?.phone_numbers) ? c.phone_numbers.filter(Boolean) : (c?.phone_numbers ? [c.phone_numbers] : []);
                    const addrObj = Array.isArray(c?.shop_customer_addresses) && c.shop_customer_addresses[0];
                    const address = addrObj ? (addrObj.full_address || addrObj.address || '') : '';

                    // Patch pancake_orders
                    const patchBody = {
                        bill_full_name: name || undefined,
                        bill_phone_number: phones.length > 0 ? phones[0] : undefined,
                        shipping_address: address ? { full_address: address, address: address } : undefined,
                        conversation_id: fbId,
                        conversation_link: c?.conversation_link || undefined,
                        updated_at: new Date().toISOString()
                    };

                    // remove undefined fields
                    Object.keys(patchBody).forEach(k => patchBody[k] === undefined && delete patchBody[k]);

                    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
                        method: 'PATCH',
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(patchBody)
                    });

                    if (!patchRes.ok) throw new Error('Không thể cập nhật đơn hàng: ' + await patchRes.text());
                    alert('Đã cập nhật khách hàng cho đơn hàng.');
                    document.getElementById('selectCustomerForOrderModal').style.display = 'none';
                    fetchDashboardOrders();
                } catch (err) {
                    console.error(err);
                    alert('Lỗi khi cập nhật khách hàng: ' + err.message);
                }
            });
        });

    } catch (err) {
        console.error(err);
        list.innerHTML = '<div style="padding:12px; color:var(--danger);">Lỗi tải khách hàng</div>';
    }
}

window.selectWalkInCustomer = function(button) {
    const searchInput = document.getElementById('walkInCustomerSearch');
    const nameInput = document.getElementById('walkInName');
    const phoneInput = document.getElementById('walkInPhone');
    const addressInput = document.getElementById('walkInAddress');
    const suggestions = document.getElementById('walkInCustomerSuggestions');
    if (!searchInput || !nameInput || !phoneInput || !addressInput || !suggestions) return;

    const customerId = button.dataset.customerId || '';
    const customerName = decodeURIComponent(button.dataset.customerName || '');
    const customerPhone = decodeURIComponent(button.dataset.customerPhone || '');
    const customerAddress = decodeURIComponent(button.dataset.customerAddress || '');

    searchInput.value = `${customerName}${customerPhone ? ' · ' + customerPhone : ''}`;
    searchInput.dataset.selectedCustomerId = customerId;
    nameInput.value = customerName;
    phoneInput.value = customerPhone;
    addressInput.value = customerAddress;
    suggestions.style.display = 'none';
};

// Click handler for customer suggestion buttons
document.addEventListener('click', (event) => {
    const target = event.target.closest('#walkInCustomerSuggestions button');
    if (target) {
        event.preventDefault();
        window.selectWalkInCustomer(target);
    }
});

// Clear selected customer if user edits search manually
const walkInCustomerSearchField = document.getElementById('walkInCustomerSearch');
if (walkInCustomerSearchField) {
    walkInCustomerSearchField.addEventListener('input', () => {
        walkInCustomerSearchField.dataset.selectedCustomerId = '';
    });
}

// Open Print Preview Modal for J&T Express thermal waybill label (A6/A7 format)
window.openJtWaybillPrintPreview = async function(orderId, event) {
    if (event) event.stopPropagation();

    // 1. Fetch order details from Supabase to get latest items & details
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}&select=*,items:pancake_order_items(*)`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error('Không thể tải thông tin đơn hàng');
        const data = await res.json();
        if (!data || data.length === 0) throw new Error('Đơn hàng không tồn tại');

        const order = data[0];
        const items = order.items || [];

        if (!order.jt_waybill_id) {
            alert('Đơn hàng này chưa được gửi J&T để lấy mã vận đơn!');
            return;
        }

        currentJtPrintOrderId = order.id;
        currentJtPrintCount = parseInt(order.bill_print_count) || 0;
        const printCountEl = document.getElementById('jtWaybillPrintCount');
        if (printCountEl) printCountEl.textContent = currentJtPrintCount;

        // 2. Map data fields into Print Preview DOM
        const pad = (n) => String(n).padStart(2, '0');
        const now = new Date();
        const dateStr = `${pad(now.getHours())}:${pad(now.getMinutes())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
        
        document.getElementById('jtPrintTime').textContent = dateStr;
        document.getElementById('jtWaybillDisplayCode').textContent = order.jt_waybill_id;
        
        // Render Barcode
        if (window.JsBarcode) {
            JsBarcode("#jtWaybillBarcodeImage", order.jt_waybill_id, {
                format: "CODE128",
                width: 2.2,
                height: 20,
                displayValue: false,
                margin: 0
            });
            const barcode = document.getElementById('jtWaybillBarcodeImage');
            const barcodeWidth = parseFloat(barcode.getAttribute('width'));
            const barcodeHeight = parseFloat(barcode.getAttribute('height'));
            barcode.setAttribute('viewBox', `0 0 ${barcodeWidth} ${barcodeHeight}`);
            barcode.setAttribute('preserveAspectRatio', 'none');
            barcode.setAttribute('width', '100%');
            barcode.setAttribute('height', '20');
            barcode.style.width = '100%';
            barcode.style.maxWidth = '100%';
            barcode.style.height = '20px';
        }

        // Large QR with a white quiet zone; generate at 4x for clean thermal printing.
        const qrContainer = document.getElementById('jtWaybillQRCode');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            if (window.QRCode) {
                new QRCode(qrContainer, {
                    text: order.jt_waybill_id,
                    width: 500,
                    height: 500,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
                qrContainer.querySelectorAll('canvas, img').forEach(image => {
                    image.style.width = '125px';
                    image.style.height = '125px';
                    image.style.imageRendering = 'pixelated';
                });
            }
        }

        // Decode carrier/region code used by the small text below the barcode.
        let regionCode = 'SPX';
        if (order.jt_waybill_id.startsWith('SPX') || order.jt_waybill_id.startsWith('VN')) {
            regionCode = 'SPX';
        } else if (/^\d/.test(order.jt_waybill_id)) {
            regionCode = order.jt_waybill_id.substring(0, 3) || '806';
        }
        document.getElementById('jtWaybillDisplayCodeSub').textContent = `${regionCode} - A028V08 - 204`;

        // SPX sort codes: lấy từ list_all_order sau khi đã có mã vận đơn.
        // Không in các nhãn "MÃ PHÂN LOẠI SPX", "Đi", "Tuyến", "Hoàn".
        const spxSortWrap = document.getElementById('jtPrintSpxSortCodes');
        const spxFirstSortEl = document.getElementById('jtPrintSpxFirstSort');
        const spxThirdSortEl = document.getElementById('jtPrintSpxThirdSort');
        const spxReturnSortEl = document.getElementById('jtPrintSpxReturnSort');
        const spxNotice = document.getElementById('jtPrintSpxNotice');
        if (spxNotice) { spxNotice.textContent = ''; spxNotice.style.display = 'none'; }
        const showMissingSpxSort = () => {
            if (spxNotice) {
                spxNotice.textContent = 'Chưa lấy được mã phân tuyến từ SPX. Có thể nhập mã đúng từ bill SPX vào khoảng trống bên trái QR trước khi in. Không dùng mã của đơn khác.';
                spxNotice.style.display = 'block';
            }
            if (spxSortWrap) spxSortWrap.style.display = 'block';
            if (spxFirstSortEl) {
                spxFirstSortEl.contentEditable = 'true';
                spxFirstSortEl.style.minHeight = '24px';
                spxFirstSortEl.title = 'Nhập mã phân tuyến của vận đơn này từ bill SPX';
                spxFirstSortEl.setAttribute('aria-label', 'Mã phân tuyến SPX');
            }
        };

        if (spxSortWrap) spxSortWrap.style.display = 'none';
        if (spxFirstSortEl) spxFirstSortEl.textContent = '';
        if (spxThirdSortEl) {
            spxThirdSortEl.textContent = '';
            spxThirdSortEl.style.display = 'none';
        }
        if (spxReturnSortEl) {
            spxReturnSortEl.textContent = '';
            spxReturnSortEl.style.display = 'none';
        }

        if (/^SPX/i.test(String(order.jt_waybill_id || '').trim())) {
            try {
                const sortRes = await fetch(
                    `${SUPABASE_URL}/functions/v1/create-order`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            action: 'get_order_extra',
                            spx_tn: order.jt_waybill_id,
                            order_sn: order.order_spx || null
                        })
                    }
                );

                const sortJson = await sortRes.json().catch(() => null);
                const sortInfo = sortJson?.sort_code_info || null;

                if (sortRes.ok && sortJson?.success && sortInfo) {
                    const firstSort = String(sortInfo.r_first_sort_code || '').trim();
                    const thirdSort = String(sortInfo.r_third_sort_code || '').trim();
                    const returnSort = String(sortInfo.return_first_sort_code || '').trim();

                    if (spxFirstSortEl) {
                        spxFirstSortEl.textContent = firstSort;
                    }

                    if (spxThirdSortEl && thirdSort) {
                        spxThirdSortEl.textContent = thirdSort;
                        spxThirdSortEl.style.display = 'block';
                    }

                    if (spxReturnSortEl && returnSort) {
                        spxReturnSortEl.textContent = returnSort;
                        spxReturnSortEl.style.display = 'block';
                    }

                    if (spxSortWrap && (firstSort || thirdSort)) {
                        spxSortWrap.style.display = 'block';
                    }
                    if (!firstSort && !thirdSort) showMissingSpxSort();
                } else {
                    showMissingSpxSort();
                    console.warn('[SPX BILL] Không lấy được sort_code_info:', sortJson);
                }
            } catch (sortErr) {
                showMissingSpxSort();
                console.warn('[SPX BILL] Lỗi lấy sort_code_info:', sortErr);
            }
        }

        // Sender Info
        document.getElementById('jtPrintSenderName').textContent = 'PUMALIFE STORE';
        const senderAddressEl = document.getElementById('jtPrintSenderAddress');
        if (senderAddressEl) senderAddressEl.remove();
        document.getElementById('jtPrintSenderPhone').textContent = `SĐT: ${jtSenderPhone || '0357573070'}`;

        // Receiver Info
        document.getElementById('jtPrintReceiverName').textContent = order.bill_full_name || 'Khách nhận';
        document.getElementById('jtPrintReceiverAddress').textContent = order.shipping_address?.full_address || order.shipping_address?.address || '---';
        document.getElementById('jtPrintReceiverPhone').textContent = `SĐT: ${order.bill_phone_number || '---'}`;
        document.getElementById('jtPrintReceiverOrderCode').textContent = `Mã đơn hàng: ${order.display_id || order.id}`;

        // Products Info
        const totalQty = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
        document.getElementById('jtPrintTotalQty').textContent = totalQty;
        
        const productsListEl = document.getElementById('jtPrintProductsList');
        if (productsListEl) {
            productsListEl.innerHTML = items.map(it => {
                const name = (it.product_name || it.name || '').toLowerCase();
                const note = it.item_note || it.variation_info?.item_note || it.note || '';
                return `<div>${name} x ${it.quantity || 1}${note ? ` (${note})` : ''}</div>`;
            }).join('');
        }

        // COD Amount
        const codAmount = parseInt(order.cod) || 0;
        document.getElementById('jtPrintCODAmount').textContent = `${codAmount.toLocaleString('vi-VN')} đ`;

        // Show Modal
        document.getElementById('jtWaybillPrintModal').style.display = 'flex';
        // Re-enable click-to-edit after all bill fields have been populated.
        if (typeof window.enableFullWaybillEditing === 'function') {
            window.enableFullWaybillEditing();
        } else {
            const root = document.getElementById('jtWaybillPrintContent');
            if (root) root.querySelectorAll('span, strong, div').forEach(el => {
                if (el.id === 'jtWaybillQRCode' || el.closest('#jtWaybillQRCode') || el.querySelector('svg, canvas, img') || el.children.length) return;
                if (!(el.textContent || '').trim()) return;
                el.contentEditable = 'true'; el.spellcheck = false; el.style.cursor = 'text'; el.style.outline = 'none';
            });
        }

    } catch (err) {
        console.error('Error opening print preview:', err);
        alert('Lỗi: ' + err.message);
    }
};

// Trigger browser print using dynamic hidden iframe for perfect styling preservation
async function incrementJtWaybillPrintCount() {
    if (!currentJtPrintOrderId) return;
    currentJtPrintCount = parseInt(currentJtPrintCount) || 0;
    currentJtPrintCount += 1;
    const printCountEl = document.getElementById('jtWaybillPrintCount');
    if (printCountEl) printCountEl.textContent = currentJtPrintCount;

    try {
        await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${currentJtPrintOrderId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bill_print_count: currentJtPrintCount })
        });
    } catch (err) {
        console.warn('[Chatbot] Không thể cập nhật số lần in bill:', err);
    }
}

window.printJtWaybillContent = async function() {
    const printContent = document.getElementById('jtWaybillPrintContent');
    if (!printContent) return;

    await incrementJtWaybillPrintCount();

    // Create a new iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <html>
        <head>
            <title>In van don J&T / SPX Express</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@800&display=swap" rel="stylesheet">
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    background: #fff;
                    display: flex;
                    justify-content: center;
                    align-items: flex-start;
                }
                #jtWaybillPrintContent {
                    width: 74mm;
                    max-width: 74mm;
                    background: #fff;
                    border: 1px solid #000;
                    padding: 6px;
                    box-sizing: border-box;
                    color: #000;
                    font-family: 'Inter', sans-serif;
                    display: flex;
                    flex-direction: column;
                    font-size: 11px;
                    line-height: 1.25;
                }
                
                #jtWaybillPrintContent div {
                    box-sizing: border-box;
                }
                
                @media print {
                    @page {
                        margin: 0;
                        size: 75mm 105mm;
                    }
                    body {
                        margin: 0;
                    }
                    #jtWaybillPrintContent {
                        border: none !important;
                        width: 74mm !important;
                        max-width: 74mm !important;
                        box-sizing: border-box !important;
                        padding: 4px !important;
                    }
                }
            </style>
        </head>
        <body>
            <div id="jtWaybillPrintContent">
                ${printContent.innerHTML}
            </div>
            <script>
                window.onload = function() {
                    window.focus();
                    window.print();
                    setTimeout(function() {
                        window.parent.document.body.removeChild(window.frameElement);
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    doc.close();
};

// Track J&T Journey journey details
window.openJtTracking = async function(waybillId, event) {
    if (event) event.stopPropagation();

    const titleCode = document.getElementById('trackingWaybillCode');
    const container = document.getElementById('jtTrackingTimelineContainer');
    
    if (titleCode) titleCode.textContent = waybillId;
    if (container) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">🔄 Đang tra cứu hành trình...</div>';
    }

    document.getElementById('jtTrackingModal').style.display = 'flex';

    try {
        const trackUrl = getJtApiUrl('/api/track', { waybillId: waybillId });
        const response = await fetch(trackUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'authToken': jtAuthToken,
                'langType': 'VN',
                'routeName': 'OrderTable',
                'cookie': jtCookie
            }
        });

        if (!response.ok) throw new Error('API request failed');
        const json = await response.json();

        if (json.succ && json.data && json.data.length > 0) {
            const details = json.data[0].details || [];
            if (details.length === 0) {
                container.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">Chưa có thông tin hành trình nào từ bưu tá J&T.</div>';
            } else {
                // Sort scanTime newest first
                details.sort((a, b) => new Date(b.scanTime) - new Date(a.scanTime));
                
                // Keep Supabase sync code updated in background if status code changed
                const newestStatus = details[0];
                const statusCode = newestStatus.code || newestStatus.scanType || newestStatus.scanTypeCode || null;
                const statusName = newestStatus.scanTypeName || newestStatus.memo || newestStatus.statusName || '';
                syncJtStatusToSupabase(waybillId, statusCode, statusName);

                container.innerHTML = details.map((item, index) => {
                    const isActive = index === 0 ? 'color: var(--primary); font-weight:700;' : 'color: var(--text-muted);';
                    return `
                        <div style="position:relative; padding-bottom:12px; display:flex; flex-direction:column; gap:4px;">
                            <div style="position:absolute; left:-18px; top:6px; width:10px; height:10px; border-radius:50%; background-color:${index === 0 ? 'var(--primary)' : 'var(--border)'}; border:2px solid var(--bg-panel);"></div>
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
                                <span style="${isActive}">${item.scanTypeName || 'Cập nhật hành trình'}</span>
                                <span style="font-size:0.75rem; color:var(--text-muted);">${item.scanTime || ''}</span>
                            </div>
                            <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.4;">
                                ${item.waybillTrackingContent || ''}
                                ${item.staffName ? `<br><b>Shipper J&T:</b> ${item.staffName} (${item.staffContact || ''})` : ''}
                            </div>
                            <div style="font-size:0.75rem; color:var(--primary); font-weight:500;">
                                📍 ${item.scanNetworkName || 'J&T Express'}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } else {
            container.innerHTML = `<div style="padding:20px; color:var(--danger); text-align:center;">${json.msg || 'Không tìm thấy thông tin vận đơn.'}</div>`;
        }
    } catch(err) {
        console.error(err);
        container.innerHTML = '<div style="padding:20px; color:var(--danger); text-align:center;">Lỗi mạng không thể tra cứu.</div>';
    }
};

function mapJtTrackingToOrderStatus(statusCode, statusName) {
    const normalized = (statusName || '').toLowerCase();

    if (/ký nhận|giao hàng thành công|hoàn tất giao|đã giao|giao thành công|hoàn tất|đã nhận|ký nhận cpn/.test(normalized) || statusCode === 100) {
        return 3; // Hoàn thành
    }

    if (/đã lấy hàng|lấy hàng|tiếp nhận|đã tiếp nhận|chờ lấy hàng/.test(normalized) || [1, 10].includes(statusCode)) {
        return 9; // Chờ lấy hàng
    }

    if (/đang giao|giao hàng|đang vận chuyển|vận chuyển|đến bưu cục|gửi đi từ bưu cục|hàng đã đến bưu cục|hàng gửi đi từ bưu cục/.test(normalized) || [2, 94].includes(statusCode)) {
        return 2; // Đang giao
    }

    return null;
}

// Sync transport status back to Supabase pancake_orders matching the waybill ID
async function syncJtStatusToSupabase(waybillId, statusCode, statusName) {
    try {
        // Query to match this waybill
        const encodedWaybillId = encodeURIComponent(String(waybillId).trim());
        const matchRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?jt_waybill_id=eq.${encodedWaybillId}&select=id,jt_status_code`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (!matchRes.ok) {
            const errorText = await matchRes.text();
            console.error('Supabase match query failed', { waybillId, encodedWaybillId, statusCode, statusName, errorText });
            return;
        }

        const matches = await matchRes.json();
        if (matches && matches.length > 0) {
            const currentOrder = matches[0];
            const mappedStatus = mapJtTrackingToOrderStatus(statusCode, statusName);
            const updatePayload = {
                jt_status_code: statusCode,
                jt_status_name: statusName
            };

            if (mappedStatus !== null) {
                updatePayload.status = mappedStatus;
            }

            const shouldPatch = currentOrder.jt_status_code !== statusCode || Object.prototype.hasOwnProperty.call(updatePayload, 'status');
            if (shouldPatch) {
                const patchBody = JSON.stringify(updatePayload);
                console.log('Syncing J&T status to Supabase', { orderId: currentOrder.id, patchBody });
                const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${currentOrder.id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: patchBody
                });
                if (patchRes.ok && typeof window.processChatbotTrigger === 'function' && updatePayload.status !== undefined) {
                    window.processChatbotTrigger(currentOrder.id, updatePayload.status);
                }
            }
        }
    } catch (e) {
        console.error('Failed to sync J&T status back to Supabase:', e);
    }
}

// Function to cancel J&T Delivery Order
window.cancelJtOrder = async function(orderId, waybillId, event) {
    if (event) event.stopPropagation();

    if (!confirm(`Bạn có chắc chắn muốn hủy đơn hàng J&T có mã vận đơn: ${waybillId}?`)) {
        return;
    }

    const btn = event.target.closest('button');
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Đang hủy...';

    try {
        // Format date string as YYYY-MM-DD HH:mm:ss in local time (GMT+7)
        const formatLocalTime = (dateObj) => {
            const pad = (num) => String(num).padStart(2, '0');
            const year = dateObj.getFullYear();
            const month = pad(dateObj.getMonth() + 1);
            const date = pad(dateObj.getDate());
            const hours = pad(dateObj.getHours());
            const minutes = pad(dateObj.getMinutes());
            const seconds = pad(dateObj.getSeconds());
            return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
        };

        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 60); // Expand range to 60 days to ensure order is covered

        const createTimeStart = formatLocalTime(pastDate);
        const createTimeEnd = formatLocalTime(today);

        const cleanWaybillId = String(waybillId).trim();
        let jtOrderId = null;

        // If the waybill ID is already the J&T internal order ID (usually starts with '944' and is 18 digits)
        if (cleanWaybillId.startsWith('9') && cleanWaybillId.length >= 17) {
            jtOrderId = cleanWaybillId;
        } else {
            // Otherwise, lookup to match waybill number and get internal order ID
            const searchPayload = {
                "searchType": "waybillIds",
                "senderDetailedAddress": "",
                "queryTimeType": 0,
                "isPartSign": null,
                "createUserLoginCodes": [],
                "paymentModeCodes": [],
                "printStatusArray": [],
                "sendCodes": [],
                "expressTypeCode": "",
                "createTime": [createTimeStart, createTimeEnd],
                "current": 1,
                "size": 20,
                "waybillIds": [cleanWaybillId],
                "createTimeStart": createTimeStart,
                "createTimeEnd": createTimeEnd,
                "queryStatusCode": []
            };

            const pageUrl = getJtApiUrl('/api/order/v2/page');
            const pageRes = await fetch(pageUrl, {
                method: "POST",
                headers: {
                    "Accept": "application/json, text/plain, */*",
                    "Content-Type": "application/json",
                    "Origin": "https://khachhang.jtexpress.vn",
                    "Referer": "https://khachhang.jtexpress.vn/",
                    "authToken": jtAuthToken,
                    "langType": "VN",
                    "routeName": "OrderTable",
                    "cookie": jtCookie
                },
                body: JSON.stringify(searchPayload)
            });

            if (!pageRes.ok) throw new Error('Không thể tìm kiếm thông tin đơn hàng tại J&T');
            const pageData = await pageRes.json();
            console.log("J&T Search Full Data Object:", JSON.stringify(pageData));
            
            if (pageData.succ && pageData.data && pageData.data.records && pageData.data.records.length > 0) {
                jtOrderId = pageData.data.records[0].id;
            }
        }

        if (!jtOrderId) {
            throw new Error('Không tìm thấy bản ghi đơn hàng J&T tương ứng. Chi tiết phản hồi đã in ra Console F12.');
        }

        // Step 2: Call the cancel order API with the retrieved order ID
        const cancelUrl = getJtApiUrl('/api/order/cancel');
        const cancelRes = await fetch(cancelUrl, {
            method: "POST",
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "Origin": "https://khachhang.jtexpress.vn",
                "Referer": "https://khachhang.jtexpress.vn/",
                "authToken": jtAuthToken,
                "langType": "VN",
                "routeName": "OrderTable",
                "cookie": jtCookie
            },
            body: JSON.stringify({
                "orderIds": [jtOrderId]
            })
        });

        if (!cancelRes.ok) throw new Error('Gửi yêu cầu hủy đơn hàng thất bại');
        const cancelData = await cancelRes.json();

        if (cancelData.succ) {
            // Step 3: Remove the waybill ID tracking link from Supabase order
            const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jt_waybill_id: null
                })
            });

            if (supabaseRes.ok) {
                alert(`Đã hủy đơn J&T (Mã vận đơn: ${waybillId}) và đồng bộ thành công!`);
                fetchDashboardOrders();
            } else {
                alert(`Đã hủy trên J&T thành công nhưng không thể cập nhật trạng thái trống lên Supabase.`);
            }
        } else {
            alert(`Lỗi hủy đơn từ J&T: ${cancelData.msg || 'Không rõ nguyên nhân'}`);
        }

    } catch (err) {
        console.error(err);
        alert(`Lỗi trong quá trình hủy đơn: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
};

// Function to cancel SPX Delivery Order
window.cancelSpxOrder = window.cancelJtOrder = async function(orderId, waybillId, event) {
    if (event) event.stopPropagation();

    if (!confirm(`Bạn có chắc chắn muốn hủy đơn hàng SPX có mã vận đơn: ${waybillId}?`)) {
        return;
    }

    const btn = event.target ? (event.target.closest ? event.target.closest('button') : event.target) : null;
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Đang hủy SPX...';
    }

    try {
        // Step 1: Call SPX batch_cancel_order API via Supabase Edge Function create-order (or proxy)
        const edgeRes = await fetch(`${SUPABASE_URL}/functions/v1/create-order`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'cancel',
                waybill_id: waybillId
            })
        });

        let spxSuccess = false;
        let spxErrorMsg = '';

        if (edgeRes.ok) {
            const edgeJson = await edgeRes.json();
            if (edgeJson.success) {
                spxSuccess = true;
            } else {
                spxErrorMsg = edgeJson.error || edgeJson.spx_response?.message || JSON.stringify(edgeJson);
            }
        } else {
            // Fallback try direct proxy
            try {
                const proxyRes = await fetch('/api-spx/shipment/order/logistic/order/batch_cancel_order', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json, text/plain, */*',
                        'content-type': 'application/json;charset=UTF-8',
                        'cookie': 'app_lang=vi; app_source=nss; spx_token=8DyJJxSL3jewqi5uEj9ezFlcuKr599wJNs8iypS5Ut8zp7Cg0GSG8j7en7d2pqmx; spx_sid=a4256cd0e9e795e229148061f41b3d390495efb132107a23b2f82313d5de422c; login_type=1; login_status=true; nss_sys_type=true; nss_cid=VN'
                    },
                    body: JSON.stringify({ list: [waybillId] })
                });
                if (proxyRes.ok) {
                    const proxyJson = await proxyRes.json();
                    if (proxyJson.retcode === 0) spxSuccess = true;
                }
            } catch (proxyErr) {
                console.error('Direct proxy cancel error:', proxyErr);
            }
        }

        if (!spxSuccess) {
            alert(`Không thể hủy đơn hàng trên SPX: ${spxErrorMsg || 'Mã vận đơn không hợp lệ hoặc đơn hàng đã xử lý'}`);
            return;
        }

        // Step 2: Update Supabase order status (jt_waybill_id: null, order_spx: null, status: 6 - Đã hủy)
        let clearData = {
            jt_waybill_id: null,
            order_spx: null,
            status: 6 // Đã hủy
        };

        let supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(clearData)
        });

        if (!supabaseRes.ok) {
            delete clearData.order_spx;
            supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(clearData)
            });
        }

        if (supabaseRes.ok) {
            alert(`Đã hủy thành công đơn hàng SPX (${waybillId}) trên hệ thống SPX và đồng bộ về Supabase!`);
            fetchDashboardOrders();
        } else {
            alert(`Đã hủy trên SPX thành công nhưng không thể cập nhật trạng thái hủy lên Supabase.`);
        }
    } catch (err) {
        console.error(err);
        alert(`Lỗi trong quá trình hủy đơn SPX: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
};

// Function to copy bill.html invoice link to clipboard
window.copyInvoiceLink = function(orderId, event) {
    if (event) event.stopPropagation();
    
    // Construct the bill URL relative to the current host
    const origin = window.location.origin;
    const billUrl = `${origin}/bill.html?id=${orderId}`;
    
    navigator.clipboard.writeText(billUrl).then(() => {
        alert('Đã sao chép link hóa đơn vào bộ nhớ tạm!');
    }).catch(err => {
        console.error('Không thể sao chép link:', err);
        // Fallback prompt if clipboard API fails
        prompt('Sao chép link hóa đơn tại đây:', billUrl);
    });
};

// Share the same invoice rendering between copying and sending a bill.
async function createInvoiceImageBlob(orderId, displayId) {
    let container;
    try {
        // 1. Fetch order data from Supabase
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}&select=*,items:pancake_order_items(*)`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error('Không tải được đơn hàng');
        const data = await res.json();
        if (!data || data.length === 0) throw new Error('Đơn hàng không tồn tại');

        const order = data[0];
        const items = order.items || [];

        // 2. Format values
        const pad = (n) => String(n).padStart(2, '0');
        const dateObj = order.inserted_at ? new Date(order.inserted_at) : new Date();
        const fullDateTime = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())} ${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
        const shipFee = parseInt(order.shipping_fee) || 0;
        const surcharge = parseInt(order.surcharge) || 0;
        const prepaid = parseInt(order.prepaid) || 0;
        const total = parseInt(order.total_price) || 0;
        const cod = parseInt(order.cod) || 0;
        const itemsSubtotal = items.reduce((s, it) => {
            const price = parseInt(it.retail_price || it.price) || 0;
            const discount = parseInt(it.discount_each_product ?? it.discount) || 0;
            return s + ((price - discount) * (it.quantity || 1));
        }, 0);

        // 3. Status label
        const statusText = normalizeStatusText(order.status);
        let statusLabel = statusText.toUpperCase();
        let statusColor = '#D97706'; let statusBg = '#FEF3C7';
        if (statusText === 'Chờ Deal') { statusLabel = 'CHỜ DEAL'; statusColor = '#A855F7'; statusBg = '#F5D0FE'; }
        else if (['Hoàn thành', 'Đã lấy hàng'].includes(statusText)) { statusLabel = 'THÀNH CÔNG'; statusColor = '#059669'; statusBg = '#D1FAE5'; }
        else if (['Đã xác nhận', 'Chờ xử lý (Mới)'].includes(statusText)) { statusLabel = 'ĐÃ XÁC NHẬN'; statusColor = '#D97706'; statusBg = '#FEF3C7'; }
        else if (statusText === 'Đang vận chuyển') { statusLabel = 'ĐANG VẬN CHUYỂN'; statusColor = '#2563EB'; statusBg = '#DBEAFE'; }
        else if (statusText === 'Đang giao') { statusLabel = 'ĐANG GIAO'; statusColor = '#2563EB'; statusBg = '#DBEAFE'; }
        else if (['Đã hủy', 'Đã xóa'].includes(statusText)) { statusLabel = 'ĐÃ HỦY'; statusColor = '#DC2626'; statusBg = '#FEE2E2'; }

        // 4. Product rows HTML
        const productsHtml = items.map(it => {
            const price = parseInt(it.retail_price || it.price) || 0;
            const discount = parseInt(it.discount_each_product ?? it.discount) || 0;
            const finalPrice = price - discount;
            const vInfo = it.variation_info || {};
            const thumb = vInfo?.images?.[0] || it.image || it.thumbnail || '';

            // Tách thông tin biến thể để bill hiển thị rõ ràng, không dồn size/màu vào tên sản phẩm.
            const rawName = String(it.product_name || it.name || vInfo.name || '').trim();
            const itemNote = String(it.item_note || vInfo.item_note || '').trim();
            const fields = Array.isArray(vInfo.fields) ? vInfo.fields : [];

            const findFieldValue = (patterns) => {
                for (const field of fields) {
                    if (!field || typeof field !== 'object') continue;
                    const fieldName = String(field.name || field.label || '').trim();
                    const fieldValue = String(field.value || field.option || field.text || '').trim();
                    if (fieldValue && patterns.some(re => re.test(fieldName))) return fieldValue;
                }
                return '';
            };

            let sizeValue = findFieldValue([/size/i, /kích\s*thước/i]);
            let colorValue = findFieldValue([/màu/i, /color/i]);

            if (!sizeValue) {
                const sizeMatch = itemNote.match(/(?:size|kích\s*thước)\s*[:\-]?\s*([^,|;]+)/i);
                if (sizeMatch) sizeValue = sizeMatch[1].trim();
            }
            if (!colorValue) {
                const colorMatch = itemNote.match(/(?:màu\s*sắc|màu|color)\s*[:\-]?\s*([^,|;]+)/i);
                if (colorMatch) colorValue = colorMatch[1].trim();
            }

            // Dữ liệu cũ thường lưu tên dạng "Tên sản phẩm - 37.5".
            if (!sizeValue) {
                const trailingSize = rawName.match(/\s+-\s+((?:EU\s*)?\d{1,2}(?:\.\d+)?(?:\s*[-/]\s*\d{1,2}(?:\.\d+)?)?)\s*$/i);
                if (trailingSize) sizeValue = trailingSize[1].replace(/^EU\s*/i, '').trim();
            }

            let displayName = rawName;
            if (sizeValue) {
                const escapedSize = sizeValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                displayName = displayName.replace(new RegExp('\\s+-\\s+(?:EU\\s*)?' + escapedSize + '\\s*$', 'i'), '').trim();
            }

            // Nếu item_note có tên gốc rõ ràng (ví dụ "... FV1920-004, size 37.5") thì ưu tiên dùng tên đó.
            const noteBaseName = itemNote.split(/,\s*(?:size|kích\s*thước|màu\s*sắc|màu|color)\b/i)[0]?.trim();
            if (noteBaseName && rawName.toLowerCase().startsWith(noteBaseName.toLowerCase())) {
                displayName = noteBaseName;
            }

            return `
                <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #F1F5F9;">
                    ${thumb ? `<img src="${thumb}" style="width:52px; height:52px; border-radius:8px; object-fit:cover; border:1px solid #E2E8F0;" crossorigin="anonymous">` : ''}
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; font-size:0.85rem; color:#0F172A;">${displayName}</div>
                        ${sizeValue ? `<div style="font-size:0.76rem; color:#475569; margin-top:4px;"><strong>Kích thước:</strong> size ${sizeValue}</div>` : ''}
                        ${colorValue ? `<div style="font-size:0.76rem; color:#475569; margin-top:2px;"><strong>Màu sắc:</strong> ${colorValue}</div>` : ''}
                    </div>
                    <div style="text-align:right;">
                        ${discount > 0 ? `<div style="font-size:0.7rem; color:#64748B; text-decoration:line-through;">${price.toLocaleString('vi-VN')}đ</div>` : ''}
                        <div style="font-weight:700; color:#0F172A;">${finalPrice.toLocaleString('vi-VN')}đ</div>
                        ${discount > 0 ? `<div style="font-size:0.7rem; color:#DC2626;">Giảm giá: -${discount.toLocaleString('vi-VN')}đ/món</div>` : ''}
                        <div style="font-size:0.75rem; color:#64748B;">x${it.quantity || 1}</div>
                    </div>
                </div>`;
        }).join('');

        // 5. Build the full bill HTML string
        const billHtml = `
            <div style="font-family:'Outfit',sans-serif; background:#fff; padding:40px; width:600px; color:#0F172A;">
                <div style="text-align:center; margin-bottom:28px;">
                    <h1 style="font-size:2rem; font-weight:800; letter-spacing:-0.03em; margin:0 0 6px 0;">
                        <span style="color:#DC2626;">PUMALIFE</span> <span style="color:#0F172A;">STORE</span>
                    </h1>
                    <div style="font-size:0.75rem; font-weight:700; letter-spacing:0.1em; color:#64748B; text-transform:uppercase; margin-bottom:10px;">HÓA ĐƠN BÁN HÀNG</div>
                    <span style="background:#F1F5F9; color:#334155; font-size:0.82rem; font-weight:700; padding:4px 14px; border-radius:20px; display:inline-block; margin-bottom:8px;">#${displayId || order.display_id || order.id}</span>
                </div>

                <div style="font-size:0.72rem; font-weight:700; color:#64748B; text-transform:uppercase; letter-spacing:0.05em; margin:20px 0 10px 0;">👤 Thông tin người nhận</div>
                <div style="background:#F8FAFC; border-radius:14px; padding:20px; display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:20px;">
                    <div><div style="font-size:0.7rem; color:#94A3B8; font-weight:600; text-transform:uppercase;">Người nhận</div><div style="font-weight:700; margin-top:3px;">${order.bill_full_name || order.shipping_address?.name || order.customer_name || '-'}</div></div>
                    <div><div style="font-size:0.7rem; color:#94A3B8; font-weight:600; text-transform:uppercase;">SĐT</div><div style="font-weight:700; margin-top:3px;">${order.bill_phone_number || order.shipping_address?.phone || order.customer_phone || '-'}</div></div>
                    <div style="grid-column:span 2;"><div style="font-size:0.7rem; color:#94A3B8; font-weight:600; text-transform:uppercase;">Địa chỉ nhận hàng</div><div style="font-weight:600; margin-top:3px;">${order.shipping_address?.full_address || order.shipping_address?.address || '-'}</div></div>
                    <div><div style="font-size:0.7rem; color:#94A3B8; font-weight:600; text-transform:uppercase;">Ngày đặt hàng</div><div style="font-weight:700; margin-top:3px;">${fullDateTime}</div></div>
                    <div><div style="font-size:0.7rem; color:#94A3B8; font-weight:600; text-transform:uppercase;">Hình thức</div><div style="font-weight:700; margin-top:3px;">${order.shipping_full_name || 'Giao hàng tận nơi'}</div></div>
                </div>

                <div style="font-size:0.72rem; font-weight:700; color:#64748B; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px;">🛍️ Chi tiết sản phẩm</div>
                <div style="margin-bottom:20px;">${productsHtml}</div>

                <div style="background:#F8FAFC; border-radius:14px; padding:20px; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>Tạm tính</span><span style="font-weight:600;">${itemsSubtotal.toLocaleString('vi-VN')}đ</span></div>
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>Phí vận chuyển</span><span style="font-weight:600;">${shipFee.toLocaleString('vi-VN')}đ</span></div>
                    ${surcharge > 0 ? `<div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>Phụ phí</span><span style="font-weight:600;">${surcharge.toLocaleString('vi-VN')}đ</span></div>` : ''}
                    <div style="border-top:1px solid #E2E8F0; padding-top:10px; display:flex; justify-content:space-between; font-size:0.95rem;"><span style="font-weight:700;">Tổng cộng</span><span style="font-weight:800; color:#DC2626;">${total.toLocaleString('vi-VN')}đ</span></div>
                    ${prepaid > 0 ? `<div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#059669;"><span>Đã thanh toán</span><span style="font-weight:600;">${prepaid.toLocaleString('vi-VN')}đ</span></div>` : ''}
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#DC2626;"><span style="font-weight:700;">THU HỘ (COD)</span><span style="font-weight:800; font-size:1rem;">${cod.toLocaleString('vi-VN')}đ</span></div>
                </div>

                <div style="text-align:center; margin-top:28px; padding-top:20px; border-top:1px solid #F1F5F9;">
                    <div style="font-weight:700; color:#0F172A; font-size:0.9rem;">Cảm ơn bạn đã mua sắm!</div>
                    <div style="font-size:0.78rem; color:#64748B; margin-top:6px;">Pumalife Store - 47/12A Thăng Long, P. Tân Sơn Nhất, Hồ Chí Minh<br>Hotline: 03 5757 3070 | Web: pumalifestore.vercel.app</div>
                </div>
            </div>`;

        // 6. Create a hidden off-screen container and render HTML into it
        container = document.createElement('div');
        container.style.cssText = 'position:fixed; left:-9999px; top:0; z-index:-1; background:white;';
        container.innerHTML = billHtml;
        document.body.appendChild(container);

        if (document.fonts?.ready) await document.fonts.ready;
        const canvas = await html2canvas(container.firstElementChild, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false
        });
        return await new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không tạo được ảnh bill')), 'image/png');
        });
    } finally {
        container?.remove();
    }
}

window.copyInvoiceImageFromDashboard = async function(orderId, displayId, event) {
    if (displayId && typeof displayId === 'object') { event = displayId; displayId = null; }
    event?.stopPropagation();
    const btn = event?.target?.closest?.('button') || event?.currentTarget;
    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    try {
        const blob = await createInvoiceImageBlob(orderId, displayId);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showInvoiceToast('📋 Đã sao chép ảnh hóa đơn!');
    } catch (err) {
        console.error('copyInvoiceImageFromDashboard error:', err);
        alert('Không thể sao chép ảnh hóa đơn: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
};

function showInvoiceToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed; bottom:32px; left:50%; transform:translateX(-50%); background:#0F172A; color:#fff; padding:12px 24px; border-radius:12px; font-weight:600; font-size:0.88rem; z-index:99999; font-family:Outfit,sans-serif; box-shadow:0 4px 20px rgba(0,0,0,0.25);';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Lock the destination before rendering/uploading, even if the user changes chats.
const invoiceSendsInFlight = new Set();
// The order screen must use the order's linked recipient, never the last open chat.
window.sendInvoiceImageFromOrder = async function(orderId, displayId, event) {
    event?.stopPropagation();
    const key = `order:${orderId}`;
    const btn = event?.target?.closest?.('button') || event?.currentTarget;
    if (invoiceSendsInFlight.has(key) || btn?.disabled) return;
    invoiceSendsInFlight.add(key);
    const originalContent = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tìm hội thoại…'; }
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error('Không tải được liên kết hội thoại của đơn hàng');
        const order = (await res.json())?.[0];
        if (!order) throw new Error('Đơn hàng không tồn tại');
        const link = String(order.conversation_link || '');
        const params = new URLSearchParams(link.includes('?') ? link.slice(link.indexOf('?') + 1).split('#')[0] : '');
        const tid = params.get('tid') || order.conversation_id;
        const pagePid = params.get('pid') || order.page_pid || order.page_id;
        const matches = smaxThreads.filter(t => String(t.tid) === String(tid) && (!pagePid || String(t.page_pid) === String(pagePid)));
        const recipient = matches.length === 1 ? { ...matches[0] } : (tid && pagePid ? { tid, page_pid: pagePid } : null);
        if (!recipient?.tid || !recipient?.page_pid) {
            throw new Error('Đơn hàng chưa có liên kết hội thoại Smax rõ ràng. Hãy liên kết hội thoại cho đơn trước khi gửi bill.');
        }
        // The shared sender owns the button while rendering/uploading/sending.
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
        await window.sendInvoiceImageFromDashboard(orderId, displayId, event, recipient);
    } catch (err) {
        console.error('sendInvoiceImageFromOrder error:', err);
        alert('Không thể gửi bill: ' + err.message);
    } finally {
        invoiceSendsInFlight.delete(key);
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
    }
};

window.sendInvoiceImageFromDashboard = async function(orderId, displayId, event, recipient) {
    event?.stopPropagation();
    const destination = recipient || activeThread;
    const thread = destination ? { ...destination } : null;
    if (!thread?.page_pid || !thread?.tid) {
        alert('Vui lòng mở hội thoại của khách cần nhận bill trước khi gửi.');
        return;
    }
    if (isTikTokChatboxThread(thread)) {
        alert('Hội thoại này dùng BotBanHang, chưa hỗ trợ gửi bill qua API Smax.');
        return;
    }
    if (!smaxToken) {
        alert('Vui lòng đăng nhập Smax trước khi gửi bill.');
        return;
    }
    const sendKey = JSON.stringify([thread.page_pid, thread.tid, orderId]);
    const btn = event?.target?.closest?.('button') || event?.currentTarget;
    if (invoiceSendsInFlight.has(sendKey) || btn?.disabled) return;
    invoiceSendsInFlight.add(sendKey);
    const originalContent = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tạo bill…'; }
    try {
        const blob = await createInvoiceImageBlob(orderId, displayId);
        if (btn) btn.textContent = 'Đang tải ảnh…';
        const formData = new FormData();
        formData.append('file', blob, 'bill.png');
        const uploadRes = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
            method: 'POST', body: formData
        });
        if (!uploadRes.ok) throw new Error(`Tải ảnh bill thất bại (HTTP ${uploadRes.status})`);
        const uploaded = await uploadRes.json();
        const imageUrl = uploaded.content_url || uploaded.data?.content_url || uploaded.data?.url || uploaded.url;
        if (uploaded.success === false || !imageUrl || !/^https?:\/\//i.test(imageUrl)) {
            throw new Error('Tải ảnh bill thất bại, máy chủ không trả về URL ảnh hợp lệ');
        }
        if (btn) btn.textContent = 'Đang gửi bill…';
        const sendRes = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${thread.page_pid}/threads/${thread.tid}/messages`, {
            method: 'POST',
            headers: { 'Authorization': smaxToken, 'Content-Type': 'application/json', 'Origin': 'https://smax.ai', 'Referer': 'https://smax.ai/' },
            body: JSON.stringify(buildMultiImagePayload({ pagePid: thread.page_pid, threadId: thread.tid, imageUrls: [imageUrl] }))
        });
        if (!sendRes.ok) throw new Error(`Smax từ chối gửi bill (HTTP ${sendRes.status})`);
        const result = await sendRes.json();
        if (result?.success === false || result?.error) throw new Error('Smax báo lỗi khi gửi bill');

        const sentAt = new Date().toISOString();
        if (activeThread?.tid === thread.tid && activeThread?.page_pid === thread.page_pid) {
            activeMessages.push({ message: '', attachments: [{ type: 'image', url: imageUrl, payload: { url: imageUrl } }], created_at: sentAt, is_page_msg: true, user_id: 1 });
            renderMessages();
        }
        const idx = smaxThreads.findIndex(t => t.tid === thread.tid && t.page_pid === thread.page_pid);
        if (idx !== -1) {
            const [updated] = smaxThreads.splice(idx, 1);
            Object.assign(updated, { message: '[Hình ảnh]', is_replied: true, replied: true, reply: false, last_message_by: 'page', updated_at: sentAt });
            smaxThreads.unshift(updated);
            renderThreads();
        }
        showInvoiceToast('✓ Đã gửi bill cho khách qua Smax!');
        setTimeout(() => {
            if (activeThread?.tid === thread.tid && activeThread?.page_pid === thread.page_pid) fetchMessages(activeThread, true);
        }, 1500);
    } catch (err) {
        console.error('sendInvoiceImageFromDashboard error:', err);
        alert('Không thể gửi bill: ' + err.message);
    } finally {
        invoiceSendsInFlight.delete(sendKey);
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
    }
};

// Auto-fill Province/District/Ward from a full Vietnamese address string
window.autoFillAddressFromDetail = async function() {
    const addrInput = document.getElementById('jtReceiverAddress');
    const rawAddr = addrInput ? addrInput.value.trim() : '';
    if (!rawAddr) { alert('Vui lòng nhập địa chỉ chi tiết trước!'); return; }

    const version = getSpxAddressVersion();
    const addressVersion = version === 2 ? 2 : 0;

    // SPX fuzzy search hoạt động tốt nhất với: số nhà + tên đường + tỉnh/thành phố.
    // Chuỗi người dùng có thể chứa phường/xã, quận/huyện, ghi chú giao hàng... nên rút gọn trước khi gửi API.
    const buildSpxFuzzyInput = (fullAddress = '') => {
        let original = String(fullAddress).replace(/\s+/g, ' ').trim();
        if (!original) return original;

        // Chuẩn hóa các cách viết tắt phổ biến của TP.HCM và Hà Nội trước khi phân tích/gửi SPX.
        // Chỉ thay khi là token/nhóm token độc lập để tránh đụng vào tên đường hoặc từ khác.
        original = original
            .replace(/\b(?:tp\s*\.?\s*)?h\s*\.?\s*c\s*\.?\s*m\b/gi, 'Thành phố Hồ Chí Minh')
            .replace(/\b(?:tp\s*\.?\s*)?hcm\b/gi, 'Thành phố Hồ Chí Minh')
            .replace(/\b(?:tp\s*\.?\s*)?tphcm\b/gi, 'Thành phố Hồ Chí Minh')
            .replace(/\b(?:tp\s*\.?\s*)?ho\s+chi\s+minh\b/gi, 'Thành phố Hồ Chí Minh')
            .replace(/\b(?:tp\s*\.?\s*)?hn\b/gi, 'Thành phố Hà Nội')
            .replace(/\b(?:tp\s*\.?\s*)?ha\s+noi\b/gi, 'Thành phố Hà Nội')
            .replace(/\s+/g, ' ').trim();

        const chunks = original.split(/[,;|\n]+/).map(x => x.trim()).filter(Boolean);
        const norm = (v='') => String(v).toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
            .replace(/\s+/g, ' ').trim();

        const provinceKeywords = /^(tinh|thanh pho|tp\.?)(\s|$)/;
        const adminKeywords = /^(phuong|xa|thi tran|quan|huyen|thi xa|thanh pho thuoc)(\s|$)/;
        const noteKeywords = /^(gan|doi dien|ben canh|ke ben|cach|sau|truoc|hem|ngo|ngach|toa nha|chung cu|shop|cua hang|tap hoa|cong|cho|truong|benh vien)(\s|$)/;

        let province = '';
        let street = '';

        // Ưu tiên segment có nhãn Tỉnh/Thành phố.
        for (let i = chunks.length - 1; i >= 0; i--) {
            const n = norm(chunks[i]);
            if (provinceKeywords.test(n)) { province = chunks[i]; break; }
        }

        // Nếu không có nhãn rõ ràng, nhận diện tên tỉnh/thành từ danh mục SPX đã tải.
        if (!province) {
            const provSel = document.getElementById('jtProvince');
            const options = Array.from(provSel?.options || []).filter(o => o.value);
            let best = '';
            for (const chunk of chunks) {
                const cn = norm(chunk);
                for (const opt of options) {
                    const name = opt.getAttribute('data-name') || opt.textContent || '';
                    const clean = norm(name).replace(/^(tinh|thanh pho|tp\.?)\s+/, '');
                    if (clean && cn.includes(clean) && clean.length > norm(best).length) best = name;
                }
            }
            province = best;
        }

        // Segment đường thường là phần đầu có số nhà. Loại các segment hành chính và ghi chú.
        for (const chunk of chunks) {
            const n = norm(chunk);
            if (/\d/.test(n) && !adminKeywords.test(n) && !provinceKeywords.test(n) && !noteKeywords.test(n)) {
                street = chunk;
                break;
            }
        }

        // Trường hợp dữ liệu không có dấu phẩy rõ: lấy từ đầu chuỗi tới trước từ khóa hành chính đầu tiên.
        if (!street) {
            const m = original.match(/^(.+?)(?=\s+(?:phường|xã|thị trấn|quận|huyện|thị xã|tỉnh|thành phố|tp\.)\b)/i);
            street = (m?.[1] || chunks[0] || original).trim();
        }

        // Cắt ghi chú địa điểm khỏi phần đường nếu nó bị dính cùng segment.
        street = street.replace(/\s+(?:gần|đối diện|bên cạnh|kế bên|cách)\s+.+$/i, '').trim();

        const result = [street, province].filter(Boolean).join(', ');
        return result || original;
    };

    const fuzzyInput = buildSpxFuzzyInput(rawAddr);
    console.log('[SPX AutoFill] raw:', rawAddr, '=> fuzzy input:', fuzzyInput);
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    const baseUrl = isExtension ? 'https://spx.vn' : '/api-spx';
    const url = baseUrl + '/shipment/merchant/open/location/v2/detail_address_fuzzy_search?input=' + encodeURIComponent(fuzzyInput) + '&country=VN&language=vi&address_version=' + addressVersion;
    const normalize = (str='') => String(str).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9\\s]/g,' ').replace(/\\s+/g,' ').trim();
    const stripPrefix = (name='') => normalize(name).replace(/^(tinh |thanh pho |tp |quan |huyen |thi xa |phuong |xa |thi tran )/,'').trim();
    const findOption = (select,target) => {
        if(!select || !target) return null;
        const tn=normalize(target), tc=stripPrefix(target); let best=null, score=-1;
        for(const opt of Array.from(select.options||[])){ if(!opt.value)continue; const name=opt.getAttribute('data-name')||opt.textContent||'', nn=normalize(name), nc=stripPrefix(name); let x=0;
            if(nn===tn)x=10000; else if(nc===tc)x=9000; else if(nn.includes(tn)||tn.includes(nn))x=5000+Math.min(nn.length,tn.length); else if(nc.includes(tc)||tc.includes(nc))x=4000+Math.min(nc.length,tc.length);
            if(x>score){score=x;best=opt;}
        } return score>0?best:null;
    };
    try {
        const res=await fetch(url,{method:'GET',headers:{'accept':'application/json, text/plain, */*'},credentials:isExtension?'include':'same-origin'});
        if(!res.ok) throw new Error('SPX fuzzy search HTTP '+res.status);
        const json=await res.json(); if(json?.retcode!==0||!json?.data) throw new Error(json?.message||'SPX không trả về địa chỉ hợp lệ');
        const data=json.data;
        let provSel=document.getElementById('jtProvince'); if(!provSel||provSel.options.length<=1){await loadJtProvinces();provSel=document.getElementById('jtProvince');}
        const provinceOpt=findOption(provSel,data.province||''); if(!provinceOpt)throw new Error('Không tìm thấy Tỉnh/Thành phố '+(data.province||''));
        provSel.value=provinceOpt.value; refreshSpxSearchablePicker('jtProvince'); await loadJtDistricts(provinceOpt.value);
        const distSel=document.getElementById('jtDistrict'), districtTarget=version===2?(data.city||data.district||''):(data.city||''), districtOpt=findOption(distSel,districtTarget);
        if(!districtOpt)throw new Error('Không tìm thấy '+(version===2?'Quận/Phường ':'Quận/Huyện ')+districtTarget);
        distSel.value=districtOpt.value; distSel.disabled=false; refreshSpxSearchablePicker('jtDistrict');
        if(version===0){ await loadJtWards(districtOpt.value); const wardSel=document.getElementById('jtWard'),wardTarget=data.district||'',wardOpt=findOption(wardSel,wardTarget); if(!wardOpt)throw new Error('Không tìm thấy Phường/Xã '+wardTarget); wardSel.value=wardOpt.value;wardSel.disabled=false;refreshSpxSearchablePicker('jtWard'); }
        // Chỉ tự chọn Tỉnh/Quận/Phường; giữ nguyên đầy đủ địa chỉ người dùng nhập.
        addrInput.value = rawAddr;
        lucide.createIcons();
    } catch(err){ console.error('SPX auto-fill fuzzy search error:',err); alert('Không thể tự điền địa chỉ từ SPX: '+err.message); }
};

// ====================================================
// PRODUCTS MANAGEMENT CRUD  
// ====================================================
window.fetchDashboardProducts = async function() {
    const tableBody = document.getElementById('productsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">🔄 Đang tải sản phẩm...</td></tr>`;

    try {
        const searchInput = document.getElementById('productSearch');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const offset = dashboardProductsPage * PRODUCTS_LIMIT;

        // Join pancake_variations so we get real images + prices
        let url = `${SUPABASE_URL}/rest/v1/pancake_products?select=*,pancake_variations(id,name,retail_price,images,sku,stock_quantity,variation_label,fields)&order=created_at.desc&limit=${PRODUCTS_LIMIT}&offset=${offset}`;
        if (searchTerm) {
            url += `&name=ilike.*${encodeURIComponent(searchTerm)}*`;
        }

        const res = await fetch(url, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact' }
        });
        if (!res.ok) throw new Error('Không tải được sản phẩm: ' + await res.text());

        const totalCount = res.headers.get('content-range')?.split('/')?.[1] || '?';
        document.getElementById('productsTotalCount').textContent = totalCount;

        const products = await res.json();

        if (products.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">Không tìm thấy sản phẩm nào</td></tr>`;
            return;
        }

        // Tải số lượng đơn hàng cho các sản phẩm ở trang hiện tại
        let orderCountsMap = {};
        const pIds = products.map(p => p.id).filter(Boolean);
        if (pIds.length > 0) {
            try {
                const countRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_order_items?product_id=in.(${pIds.join(',')})&select=product_id,order_id`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                if (countRes.ok) {
                    const itemRows = await countRes.json();
                    const orderSets = {};
                    itemRows.forEach(item => {
                        if (item.product_id && item.order_id) {
                            if (!orderSets[item.product_id]) orderSets[item.product_id] = new Set();
                            orderSets[item.product_id].add(item.order_id);
                        }
                    });
                    Object.keys(orderSets).forEach(pid => {
                        orderCountsMap[pid] = orderSets[pid].size;
                    });
                }
            } catch (errCount) {
                console.warn('Không thể đếm đơn hàng cho sản phẩm:', errCount);
            }
        }

        tableBody.innerHTML = products.map(p => {
            const variations = Array.isArray(p.pancake_variations) ? p.pancake_variations : [];
            
            // Ảnh: ưu tiên từ biến thể đầu tiên, fallback về product.image_url
            const firstVarImg = variations.length > 0 && Array.isArray(variations[0].images) && variations[0].images[0];
            const img = firstVarImg || p.image_url || '';
            const imgTag = img
                ? `<img src="${img}" style="width:48px; height:48px; border-radius:8px; object-fit:cover; border:1px solid var(--border); cursor:pointer;" onclick="openProductVariations('${p.id}')" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">`
                : '';
            const imgFallback = `<div style="width:48px;height:48px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);display:${img ? 'none' : 'flex'};align-items:center;justify-content:center;color:var(--text-muted);cursor:pointer;" onclick="openProductVariations('${p.id}')"><i data-lucide="image-off" style="width:20px;height:20px;"></i></div>`;

            // Giá: lấy từ biến thể (retail_price), fallback về product.sell_price
            const prices = variations.map(v => parseInt(v.retail_price) || 0).filter(x => x > 0);
            const minPrice = prices.length > 0 ? Math.min(...prices) : (parseInt(p.sell_price || p.price) || 0);
            const maxPrice = prices.length > 0 ? Math.max(...prices) : minPrice;
            const priceStr = prices.length === 0
                ? `<span style="color:var(--text-muted);">Chưa có giá</span>`
                : (minPrice === maxPrice
                    ? `<strong style="color:var(--primary);">${minPrice.toLocaleString('vi-VN')} ₫</strong>`
                    : `<strong style="color:var(--primary);">${minPrice.toLocaleString('vi-VN')} – ${maxPrice.toLocaleString('vi-VN')} ₫</strong>`);

            // Biến thể count badge
            const varCount = variations.length;
            const varBadge = varCount > 0
                ? `<button onclick="openProductVariations('${p.id}')" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;background:var(--bg-card);border:1px solid var(--border);color:var(--text-main);font-size:0.78rem;cursor:pointer;font-weight:600;" title="Xem biến thể">
                        <i data-lucide="layers" style="width:12px;height:12px;"></i> ${varCount} biến thể
                   </button>`
                : `<span style="color:var(--text-muted);font-size:0.8rem;">—</span>`;

            const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString('vi-VN') : '-';

            // Số lượng đơn hàng chứa sản phẩm này
            const orderCount = orderCountsMap[p.id] || 0;
            const orderBadgeBg = orderCount > 0 ? '#10b981' : 'var(--bg-panel)';
            const orderBadgeColor = orderCount > 0 ? '#ffffff' : 'var(--text-muted)';

            return `
                <tr style="border-bottom: 1px solid var(--border); transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-card)'" onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding:12px 20px;">
                        ${imgTag}${imgFallback}
                    </td>
                    <td style="padding:12px 20px;">
                        <div style="font-weight:600; color:var(--text-main); margin-bottom:2px;">${p.name || ''}</div>
                        ${p.product_code ? `<div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">#${p.product_code}</div>` : ''}
                        ${p.product_link ? `<a href="${escapeHtml(p.product_link)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:0.75rem;color:var(--primary);text-decoration:none;max-width:280px;" title="${escapeHtml(p.product_link)}"><i data-lucide="external-link" style="width:12px;height:12px;flex-shrink:0;"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Link sản phẩm</span></a>` : ''}
                    </td>
                    <td style="padding:12px 20px;">${priceStr}</td>
                    <td style="padding:12px 20px;">${varBadge}</td>
                    <td style="padding:12px 20px; color:var(--text-muted); font-size:0.85rem;">${dateStr}</td>
                    <td style="padding:12px 20px; text-align:center;">
                        <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                            <button onclick="openProductOrders('${p.id}','${(p.name || '').replace(/'/g,'')}')" title="Xem ${orderCount} đơn hàng chứa sản phẩm này" style="padding:5px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:5px; background-color:var(--bg-card); border:1px solid var(--border); color:var(--primary); cursor:pointer; font-weight:600;">
                                <i data-lucide="shopping-bag" style="width:14px; height:14px;"></i>
                                <span style="background:${orderBadgeBg}; color:${orderBadgeColor}; font-size:0.72rem; padding:1px 6px; border-radius:10px; font-weight:700; min-width:18px; text-align:center; line-height:1.2;">${orderCount}</span>
                            </button>
                            <button onclick="openProductVariations('${p.id}')" title="Biến thể" style="padding:6px 10px; border-radius:6px; display:inline-flex; align-items:center; background-color:var(--bg-card); border:1px solid var(--border); color:var(--primary); cursor:pointer;">
                                <i data-lucide="layers" style="width:14px;"></i>
                            </button>
                            <button onclick="editProduct('${p.id}')" title="Sửa" style="padding:6px 10px; border-radius:6px; display:inline-flex; align-items:center; background-color:var(--bg-card); border:1px solid var(--border); color:var(--text-main); cursor:pointer;">
                                <i data-lucide="edit-3" style="width:14px;"></i>
                            </button>
                            <button onclick="deleteProduct('${p.id}')" title="Xóa" style="padding:6px 10px; border-radius:6px; display:inline-flex; align-items:center; background-color:var(--bg-card); border:1px solid var(--border); color:var(--danger); cursor:pointer;">
                                <i data-lucide="trash-2" style="width:14px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();
    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--danger); font-weight:600;">Lỗi: ${err.message}</td></tr>`;
    }
};

// Open product variations detail modal
window.openProductVariations = async function(productId) {
    const modal = document.getElementById('productVariationsModal');
    const tbody = document.getElementById('variationsTableBody');
    const imgRow = document.getElementById('variationsModalImageRow');
    const titleEl = document.getElementById('variationsModalProductName');
    const codeEl = document.getElementById('variationsModalProductCode');

    modal.style.display = 'flex';
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">🔄 Đang tải biến thể...</td></tr>`;
    imgRow.innerHTML = '';

    try {
        const [prodRes, varRes] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/pancake_products?id=eq.${productId}&select=name,product_code,image_url`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            }),
            fetch(`${SUPABASE_URL}/rest/v1/pancake_variations?product_id=eq.${productId}&select=*&order=created_at.asc`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            })
        ]);

        const [prodData, variations] = await Promise.all([prodRes.json(), varRes.json()]);
        const prod = prodData[0] || {};

        titleEl.textContent = prod.name || 'Sản phẩm';
        codeEl.textContent = prod.product_code ? `Mã: #${prod.product_code}` : '';

        // Collect all unique images across variations
        const allImages = [];
        if (prod.image_url) allImages.push(prod.image_url);
        variations.forEach(v => {
            if (Array.isArray(v.images)) v.images.forEach(img => { if (img && !allImages.includes(img)) allImages.push(img); });
        });

        if (allImages.length > 0) {
            imgRow.innerHTML = allImages.slice(0, 6).map(src => `
                <img src="${src}" style="width:90px;height:90px;border-radius:10px;object-fit:cover;border:1px solid var(--border);flex-shrink:0;cursor:pointer;" onclick="window.open('${src}','_blank')" onerror="this.style.display='none'">
            `).join('');
        } else {
            imgRow.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;">Không có ảnh</div>`;
        }

        if (variations.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Sản phẩm này chưa có biến thể</td></tr>`;
            return;
        }

        tbody.innerHTML = variations.map(v => {
            const label = v.variation_label || v.name || '—';
            const price = parseInt(v.retail_price) || 0;
            const stock = v.stock_quantity ?? '?';
            const sku = v.sku || '—';
            const stockColor = stock === 0 ? 'var(--danger)' : (stock < 5 ? '#f59e0b' : 'var(--success, #22c55e)');
            const imageSrc = Array.isArray(v.images) && v.images[0] ? v.images[0] : (prod.image_url || '');
            return `
                <tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:12px 16px;">
                        <div style="display:flex; align-items:center; gap:10px; font-weight:600; color:var(--text-main);">
                            ${imageSrc ? `<img src="${imageSrc}" style="width:32px; height:32px; border-radius:8px; object-fit:cover; border:1px solid var(--border);" onerror="this.style.display='none'">` : ''}
                            <span>${label}</span>
                        </div>
                    </td>
                    <td style="padding:12px 16px;font-family:monospace;font-size:0.82rem;color:var(--text-muted);">${sku}</td>
                    <td style="padding:12px 16px;font-weight:700;color:var(--primary);">${price > 0 ? price.toLocaleString('vi-VN') + ' ₫' : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td style="padding:12px 16px;text-align:center;font-weight:700;color:${stockColor};">${stock}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--danger);">Lỗi: ${err.message}</td></tr>`;
    }
};
// Generate variations from text inputs
const VARIATION_SIZE_PRESETS = {
    adidas: '36, 36 2/3, 37 1/3, 38, 38 2/3, 39, 40, 40 2/3, 41 1/3, 42, 42 2/3, 43 1/3, 44, 44 2/3, 45, 45 1/3, 46, 46 2/3, 47 1/3, 48 2/3',
    puma: '35.5, 36, 37, 37.5, 38, 39, 40, 40.5, 41, 42.5, 43, 44.5, 45, 46, 47',
    nike: '36, 36.5, 37.5, 38, 38.5, 39, 40, 40.5, 41, 42, 42.5, 43, 44, 44.5, 45, 46, 46.5, 47, 47.5',
    jeep: '35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45',
    onitsuka: '36, 37, 37.5, 38, 39, 39.5, 40, 40.5, 41, 42, 42.5, 43, 44, 44.5, 45, 46, 46.5, 47',
    converse: '35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45',
    champion: '35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45'
};

window.applyVariationSizePreset = function(autoGenerate = false) {
    const preset = document.getElementById('prodSizePreset')?.value || '';
    const input = document.getElementById('prodVariationInput');
    if (!input) return;

    input.value = VARIATION_SIZE_PRESETS[preset] || '';
    if (autoGenerate && input.value) {
        window.generateVariationsFromInputs();
    }
};

window.attachVariationRowImageHandlers = function(row) {
    const urlInput = row.querySelector('.var-image');
    const fileInput = row.querySelector('.var-image-file');
    const uploadBtn = row.querySelector('.btn-variation-image-upload');
    const thumb = row.querySelector('.var-image-thumb');

    if (!urlInput) return;

    // 1. Live preview on text input/change
    const updateThumb = () => {
        const v = urlInput.value.trim();
        if (v) {
            if (thumb) {
                thumb.src = v;
                thumb.style.display = 'block';
            }
        } else {
            if (thumb) {
                thumb.style.display = 'none';
                thumb.src = '';
            }
        }
    };

    urlInput.addEventListener('input', updateThumb);
    urlInput.addEventListener('change', updateThumb);
    updateThumb();

    // 2. Upload file handler (from file picker or paste)
    const processImageFile = async (file) => {
        if (!file) return;

        const localUrl = URL.createObjectURL(file);
        if (thumb) {
            thumb.src = localUrl;
            thumb.style.display = 'block';
        }
        const originalPlaceholder = urlInput.placeholder;
        urlInput.placeholder = '⏳ Đang tải ảnh lên...';

        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                const cdnUrl = data.content_url || data.url;
                if (cdnUrl) {
                    urlInput.value = cdnUrl;
                    if (thumb) thumb.src = cdnUrl;
                } else {
                    throw new Error('Không lấy được URL CDN');
                }
            } else {
                throw new Error('Tải ảnh lên Pancake thất bại');
            }
        } catch (err) {
            console.warn('Variation image upload error, using Data URL fallback:', err);
            const reader = new FileReader();
            reader.onload = (ev) => {
                urlInput.value = ev.target.result;
                if (thumb) thumb.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        } finally {
            URL.revokeObjectURL(localUrl);
            urlInput.placeholder = originalPlaceholder || 'Ảnh biến thể (URL hoặc Ctrl+V)';
        }
    };

    // 3. Paste Event Handler (Ctrl + V)
    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type && item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    processImageFile(file);
                    return;
                }
            }
        }
    };

    urlInput.placeholder = 'Ảnh biến thể (Dán link hoặc Ctrl+V)';
    urlInput.title = 'Nhập link ảnh hoặc nhấn Ctrl + V để dán ảnh trực tiếp';
    urlInput.addEventListener('paste', handlePaste);
    row.addEventListener('paste', handlePaste);

    // 4. File picker trigger & file change listener
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
    }
    if (thumb && fileInput) {
        thumb.style.cursor = 'pointer';
        thumb.title = 'Click để chọn file hoặc dán ảnh (Ctrl+V)';
        thumb.addEventListener('click', () => fileInput.click());
    }
    if (fileInput) {
        fileInput.addEventListener('change', (ev) => {
            const f = ev.target.files && ev.target.files[0];
            if (f) processImageFile(f);
        });
    }
};

window.renderVariationRowHtml = function(label = '', sku = '', price = 0, stock = 999, varImage = '', thumbSrc = '') {
    const safeLabel = (label || '').replace(/"/g, '&quot;');
    const safeSku = (sku || '').replace(/"/g, '&quot;');
    const safeImage = (varImage || '').replace(/"/g, '&quot;');
    const safeThumb = (thumbSrc || varImage || '').replace(/"/g, '&quot;');

    return `
        <div class="variation-item-row" data-val="${safeLabel}" style="display:grid; grid-template-columns:1.2fr 1.2fr 0.9fr 0.9fr 1.8fr 44px 28px; gap:6px; align-items:center; background:var(--bg-app); border:1px solid var(--border); padding:6px 8px; border-radius:6px;">
            <input type="text" placeholder="Tên biến thể" class="var-label" value="${safeLabel}" style="width:100%; font-weight:600; font-size:0.8rem; border:1px solid var(--border); border-radius:4px; padding:4px 6px; background:var(--bg-panel); color:var(--text-main);" title="Sửa tên biến thể">
            <input type="text" placeholder="SKU" class="var-sku" value="${safeSku}" style="width:100%; border:1px solid var(--border); border-radius:4px; padding:4px 6px; background:var(--bg-panel); color:var(--text-main); font-size:0.8rem;">
            <input type="number" placeholder="Giá" class="var-price" value="${price}" style="width:100%; border:1px solid var(--border); border-radius:4px; padding:4px 6px; background:var(--bg-panel); color:var(--text-main); font-size:0.8rem;">
            <input type="number" placeholder="Kho" class="var-stock" value="${stock}" style="width:100%; border:1px solid var(--border); border-radius:4px; padding:4px 6px; background:var(--bg-panel); color:var(--text-main); font-size:0.8rem;">
            <div style="display:flex; align-items:center; gap:4px; width:100%;">
                <input type="text" placeholder="Ảnh (Dán link hoặc Ctrl+V)" class="var-image" value="${safeImage}" style="flex:1; min-width:0; border:1px solid var(--border); border-radius:4px; padding:4px 6px; background:var(--bg-panel); color:var(--text-main); font-size:0.78rem;">
                <input type="file" class="var-image-file" accept="image/*" style="display:none;">
                <button type="button" class="btn-variation-image-upload" title="Tải ảnh từ máy" style="padding:4px 6px; border-radius:4px; border:1px solid var(--border); background:var(--bg-card); color:var(--primary); cursor:pointer; font-size:0.75rem;">📁</button>
            </div>
            <div style="width:44px; height:44px; display:flex; align-items:center; justify-content:center;">
                <img class="var-image-thumb" src="${safeThumb}" style="width:36px; height:36px; border-radius:6px; object-fit:cover; border:1px solid var(--border); display:${safeThumb? 'block':'none'};" onerror="this.style.display='none'">
            </div>
            <button type="button" onclick="this.closest('.variation-item-row').remove()" style="width:24px; height:24px; border-radius:4px; border:1px solid #fee2e2; background:#fef2f2; color:#ef4444; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; font-size:0.75rem; font-weight:700;" title="Xóa dòng này">✕</button>
        </div>
    `;
};

window.addSingleVariationRow = function(label = '', sku = '', price = 0, stock = 999, image = '') {
    const container = document.getElementById('variationFormListContainer');
    if (!container) return;

    const basePrice = price || parseInt(document.getElementById('prodPrice')?.value) || 0;
    const count = container.children.length + 1;
    const baseCode = sku || ((document.getElementById('prodCode')?.value?.trim() || 'VAR') + '-' + count);
    const commonImage = image || document.getElementById('prodImage')?.value?.trim() || '';

    const div = document.createElement('div');
    div.innerHTML = window.renderVariationRowHtml(label || `Biến thể ${count}`, baseCode, basePrice, stock, commonImage, commonImage);
    const row = div.firstElementChild;
    container.appendChild(row);
    window.attachVariationRowImageHandlers(row);
};

window.generateVariationsFromInputs = function() {
    const rawColorVal = (document.getElementById('prodColorInput')?.value || '').trim();
    const rawSizeVal = (document.getElementById('prodVariationInput')?.value || '').trim();
    const container = document.getElementById('variationFormListContainer');
    const basePrice = parseInt(document.getElementById('prodPrice')?.value) || 0;
    const baseCode = document.getElementById('prodCode')?.value?.trim() || 'VAR';
    const commonImage = document.getElementById('prodImage')?.value?.trim() || '';

    if (!rawColorVal && !rawSizeVal) {
        alert('Vui lòng nhập danh sách Màu sắc và/hoặc Size/Kích thước (cách nhau bằng dấu phẩy)');
        return;
    }

    const colors = rawColorVal ? rawColorVal.split(',').map(s => s.trim()).filter(Boolean) : [];
    const sizes = rawSizeVal ? rawSizeVal.split(',').map(s => s.trim()).filter(Boolean) : [];

    const slugify = (text) => {
        return text.toString().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '')
            .toUpperCase() || 'VAR';
    };

    let items = [];

    if (colors.length > 0 && sizes.length > 0) {
        // Sinh kết hợp Màu x Size (Ma trận Cartesian)
        colors.forEach(c => {
            sizes.forEach(s => {
                items.push({
                    label: `${c} - ${s}`,
                    sku: `${baseCode}-${slugify(c)}-${slugify(s)}`
                });
            });
        });
    } else if (colors.length > 0) {
        colors.forEach(c => {
            items.push({
                label: c,
                sku: `${baseCode}-${slugify(c)}`
            });
        });
    } else {
        sizes.forEach(s => {
            items.push({
                label: s,
                sku: `${baseCode}-${slugify(s)}`
            });
        });
    }

    container.innerHTML = items.map(it => {
        return window.renderVariationRowHtml(it.label, it.sku, basePrice, 999, commonImage, commonImage);
    }).join('');

    container.querySelectorAll('.variation-item-row').forEach(row => {
        window.attachVariationRowImageHandlers(row);
    });
};

async function handleProductFormSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('productEditId').value;
    const name = document.getElementById('prodName').value.trim();
    const price = parseInt(document.getElementById('prodPrice').value) || 0;
    const prodCode = document.getElementById('prodCode').value.trim();
    const productLink = (document.getElementById('prodLink')?.value || '').trim();
    const imgUrl = document.getElementById('prodImage').value.trim();

    // Sinh UUID v4 thủ công cho trường id
    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const productPayload = {
        id: generateUUID(),
        name: name,
        price: price,
        sell_price: price,
        product_code: prodCode || null,
        product_link: productLink || null,
        image_url: imgUrl || null
    };

    try {
        let res;
        let savedProduct;
        if (editId) {
            // Update product (không ghi đè id mới)
            const updatePayload = { ...productPayload };
            delete updatePayload.id;
            
            res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_products?id=eq.${editId}`, {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
                body: JSON.stringify(updatePayload)
            });
            if (!res.ok) throw new Error('Không thể cập nhật sản phẩm gốc: ' + await res.text());
            const updated = await res.json();
            savedProduct = updated[0];
        } else {
            // Insert product
            res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_products`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
                body: JSON.stringify([productPayload])
            });
            if (!res.ok) throw new Error('Không thể thêm sản phẩm gốc: ' + await res.text());
            const inserted = await res.json();
            savedProduct = inserted[0];
        }

        const productId = savedProduct.id;

        // Process Variations
        const varRows = document.querySelectorAll('#variationFormListContainer .variation-item-row');
        if (varRows.length > 0) {
            // Delete existing variations on edit to replace them (Simple sync approach)
            if (editId) {
                await fetch(`${SUPABASE_URL}/rest/v1/pancake_variations?product_id=eq.${productId}`, {
                    method: 'DELETE',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
            }

            // Create batch payload
            const varPayloads = Array.from(varRows).map(row => {
                const labelInput = row.querySelector('.var-label');
                const label = labelInput ? labelInput.value.trim() : (row.getAttribute('data-val') || 'Mặc định');
                const sku = row.querySelector('.var-sku').value.trim();
                const vPrice = parseInt(row.querySelector('.var-price').value) || price;
                const stock = parseInt(row.querySelector('.var-stock').value) || 0;
                const varImage = row.querySelector('.var-image')?.value?.trim() || '';
                const variationImages = varImage ? [varImage] : (imgUrl ? [imgUrl] : []);

                const parts = label.split('-').map(s => s.trim()).filter(Boolean);
                const fields = parts.length > 1
                    ? [{ name: "Màu sắc", value: parts[0] }, { name: "Kích thước", value: parts[1] }]
                    : [{ name: "option", value: label, keyValue: label }];

                return {
                    id: generateUUID(),
                    product_id: productId,
                    name: `${name} - ${label}`,
                    retail_price: vPrice,
                    sku: sku,
                    stock_quantity: stock,
                    variation_label: label,
                    images: variationImages,
                    fields: fields
                };
            });

            const varRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_variations`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(varPayloads)
            });
            if (!varRes.ok) throw new Error('Sản phẩm đã tạo nhưng lỗi lưu các biến thể: ' + await varRes.text());
        }

        document.getElementById('productModal').style.display = 'none';
        alert('Đã lưu sản phẩm và các biến thể thành công!');
        fetchDashboardProducts();
    } catch (err) {
        console.error(err);
        alert('Lỗi: ' + err.message);
    }
}

window.editProduct = async function(id) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_products?id=eq.${id}&select=*,pancake_variations(id,sku,retail_price,stock_quantity,variation_label,images)`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error('Không tải được thông tin sản phẩm');
        const data = await res.json();
        if (data.length > 0) {
            const p = data[0];
            const variations = Array.isArray(p.pancake_variations) ? p.pancake_variations : [];

            document.getElementById('productEditId').value = p.id;
            document.getElementById('prodName').value = p.name || '';
            document.getElementById('prodPrice').value = p.sell_price || p.price || 0;
            document.getElementById('prodCode').value = p.product_code || '';
            if (document.getElementById('prodLink')) document.getElementById('prodLink').value = p.product_link || '';
            document.getElementById('prodImage').value = p.image_url || '';
            
            // Hiển thị preview ảnh nếu có
            const previewContainer = document.getElementById('prodImagePreviewContainer');
            const previewImg = document.getElementById('prodImagePreview');
            const uploadStatus = document.getElementById('prodImageUploadStatus');
            if (p.image_url && previewContainer && previewImg) {
                previewImg.src = p.image_url;
                previewContainer.style.display = 'flex';
                if (uploadStatus) uploadStatus.textContent = 'Ảnh hiện tại của sản phẩm';
            } else if (previewContainer) {
                previewContainer.style.display = 'none';
            }
            
            // Reset input fields
            if (document.getElementById('prodColorInput')) document.getElementById('prodColorInput').value = '';
            const varLabels = variations.map(v => v.variation_label).filter(Boolean);
            document.getElementById('prodVariationInput').value = varLabels.join(', ');

            const container = document.getElementById('variationFormListContainer');
            container.innerHTML = variations.map(v => {
                const variationImage = Array.isArray(v.images) && v.images[0] ? v.images[0] : (p.image_url || '');
                return window.renderVariationRowHtml(v.variation_label || v.name || '', v.sku || '', v.retail_price || 0, v.stock_quantity ?? 0, variationImage, variationImage);
            }).join('');

            // Attach paste & file upload listeners to all existing variation rows
            container.querySelectorAll('.variation-item-row').forEach(row => {
                window.attachVariationRowImageHandlers(row);
            });

            document.getElementById('productModalTitle').innerHTML = '<i data-lucide="package" style="color:var(--primary);width:18px;"></i> Sửa thông tin sản phẩm';
            document.getElementById('productModal').style.display = 'flex';
            lucide.createIcons();
        }
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
};

// Tải ảnh sản phẩm lên API Pancake
window.handleProductImageUpload = async function(file) {
    if (!file) return;
    
    const previewContainer = document.getElementById('prodImagePreviewContainer');
    const previewImg = document.getElementById('prodImagePreview');
    const uploadStatus = document.getElementById('prodImageUploadStatus');
    const prodImageInput = document.getElementById('prodImage');
    
    if (previewContainer && previewImg) {
        // Hiển thị ảnh xem trước local tạm thời
        previewImg.src = URL.createObjectURL(file);
        previewContainer.style.display = 'flex';
        if (uploadStatus) uploadStatus.textContent = 'Đang tải ảnh lên...';
    }
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            const data = await res.json();
            const imageUrl = data.content_url || data.url || null;
            if (imageUrl) {
                if (prodImageInput) prodImageInput.value = imageUrl;
                if (uploadStatus) uploadStatus.textContent = 'Tải lên thành công!';
                // Thay thế ảnh local bằng ảnh CDN chính thức
                if (previewImg) previewImg.src = imageUrl;
            } else {
                if (uploadStatus) uploadStatus.textContent = 'Lỗi phân tích URL ảnh';
            }
        } else {
            if (uploadStatus) uploadStatus.textContent = 'Lỗi tải ảnh (Mã lỗi pos)';
        }
    } catch (err) {
        console.error('Lỗi upload ảnh sản phẩm:', err);
        if (uploadStatus) uploadStatus.textContent = 'Lỗi kết nối tải ảnh';
    }
};

// Xóa ảnh sản phẩm đã chọn
window.removeProductImage = function() {
    const prodImageInput = document.getElementById('prodImage');
    const previewContainer = document.getElementById('prodImagePreviewContainer');
    const previewImg = document.getElementById('prodImagePreview');
    const fileInput = document.getElementById('prodImageFile');
    
    if (prodImageInput) prodImageInput.value = '';
    if (fileInput) fileInput.value = '';
    if (previewImg) previewImg.src = '';
    if (previewContainer) previewContainer.style.display = 'none';
};

window.handleVariationImageUpload = async function(file, row) {
    if (!file || !row) return;

    const imageInput = row.querySelector('.var-image');
    if (!imageInput) return;

    try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Upload thất bại');
        const data = await res.json();
        const imageUrl = data.content_url || data.url;
        if (!imageUrl) throw new Error('Không lấy được URL ảnh');

        imageInput.value = imageUrl;
    } catch (err) {
        console.error('Lỗi upload ảnh biến thể:', err);
        alert('Lỗi tải ảnh biến thể: ' + err.message);
    }
};

document.addEventListener('click', (event) => {
    const uploadBtn = event.target.closest('.btn-variation-image-upload');
    if (!uploadBtn) return;

    const row = uploadBtn.closest('.variation-item-row');
    if (!row) return;

    const fileInput = row.querySelector('.var-image-file');
    if (fileInput) fileInput.click();
});

document.addEventListener('change', async (event) => {
    const fileInput = event.target.closest('.var-image-file');
    if (!fileInput) return;

    const row = fileInput.closest('.variation-item-row');
    const file = fileInput.files && fileInput.files[0];
    if (!row || !file) return;

    await window.handleVariationImageUpload(file, row);
    fileInput.value = '';
});

window.deleteProduct = async function(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa sản phẩm này cùng tất cả biến thể?')) return;
    try {
        // Delete variations first
        await fetch(`${SUPABASE_URL}/rest/v1/pancake_variations?product_id=eq.${id}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        
        // Delete product
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_products?id=eq.${id}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error('Không thể xóa sản phẩm gốc');
        alert('Xóa sản phẩm thành công!');
        fetchDashboardProducts();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
};

// View orders containing this product
window.openProductOrders = async function(productId, productName) {
    try {
        const modal = document.getElementById('productOrdersModal');
        if (!modal) {
            alert('Không tìm thấy modal');
            return;
        }
        
        const tbody = document.getElementById('productOrdersTableBody');
        if (!tbody) {
            alert('Không tìm thấy table body');
            return;
        }

        document.getElementById('productOrdersModalTitle').textContent = `Đơn hàng chứa sản phẩm: ${productName}`;
        modal.style.display = 'flex';
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">🔄 Đang tải đơn hàng...</td></tr>';

        // Fetch order items containing this product
        const itemsRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_order_items?product_id=eq.${productId}&select=order_id&order=created_at.desc`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        
        if (!itemsRes.ok) throw new Error('Không thể lấy danh sách đơn hàng');
        
        const items = await itemsRes.json();
        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Không có đơn hàng nào chứa sản phẩm này</td></tr>';
            return;
        }

        const orderIds = [...new Set(items.map(i => i.order_id))];
        
        // Fetch order details
        const ordersRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=in.(${orderIds.join(',')})&select=*,items:pancake_order_items(*)&order=inserted_at.desc`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        
        if (!ordersRes.ok) throw new Error('Không thể lấy thông tin đơn hàng');
        
        const orders = await ordersRes.json();
        
        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Không có đơn hàng</td></tr>';
            return;
        }

        const STATUS_LABELS = {
            0: { label: 'Mới', color: '#3b82f6' },
            1: { label: 'Xác nhận', color: '#f59e0b' },
            2: { label: 'Đang xử lý', color: '#f59e0b' },
            3: { label: 'Đã giao', color: '#22c55e' },
            4: { label: 'Hoàn trả', color: '#ef4444' },
            5: { label: 'Hủy', color: '#6b7280' },
            12: { label: 'Chờ in', color: '#3b82f6' }
        };

        tbody.innerHTML = orders.map(order => {
            const normalizedStatus = normalizeStatusText(order.status);
            const statusInfo = {
                label: normalizedStatus,
                color: (() => {
                    const code = getStatusCodeFromText(normalizedStatus);
                    if (code === 0) return '#3b82f6';
                    if (code === 1) return '#f59e0b';
                    if (code === 2 || code === 24) return '#f59e0b';
                    if (code === 3) return '#22c55e';
                    if (code === 6 || code === 7) return '#ef4444';
                    if (code === 12 || code === 13) return '#3b82f6';
                    return '#6b7280';
                })(),
            };
            const dateStr = order.inserted_at ? new Date(order.inserted_at).toLocaleDateString('vi-VN') : '-';
            const itemsInOrder = Array.isArray(order.items) ? order.items : [];
            const productCount = itemsInOrder.filter(i => i.product_id === productId).length;
            const displayId = order.display_id || order.id;
            
            return `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding:12px 16px; text-align:center;">
                        <a href="#" style="color:var(--primary);font-weight:600;text-decoration:none;" onclick="window.openOrderInDashboard('${order.id}', '${String(displayId).replace(/'/g, "\\'")}'); return false;">
                            #${displayId}
                        </a>
                    </td>
                    <td style="padding:12px 16px;">${order.bill_full_name || '—'}</td>
                    <td style="padding:12px 16px;">${order.bill_phone_number || '—'}</td>
                    <td style="padding:12px 16px; text-align:center;">
                        <span style="display:inline-block;padding:4px 10px;border-radius:6px;background:${statusInfo.color}15;color:${statusInfo.color};font-size:0.8rem;font-weight:600;">${statusInfo.label}</span>
                    </td>
                    <td style="padding:12px 16px; text-align:center; color:var(--primary); font-weight:600;">×${productCount}</td>
                    <td style="padding:12px 16px; color:var(--primary); font-weight:600;">${(parseInt(order.total) || 0).toLocaleString('vi-VN')} ₫</td>
                    <td style="padding:12px 16px; color:var(--text-muted); font-size:0.85rem;">${dateStr}</td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();
    } catch (err) {
        console.error(err);
        alert('Lỗi: ' + err.message);
    }
};



// ====================================================
// CUSTOMERS MANAGEMENT CRUD
// ====================================================
window.fetchDashboardCustomers = async function() {
    const tableBody = document.getElementById('customersTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">🔄 Đang tải thông tin khách hàng...</td></tr>`;

    try {
        const searchInput = document.getElementById('customerSearch');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const offset = dashboardCustomersPage * CUSTOMERS_LIMIT;

        let url = `${SUPABASE_URL}/rest/v1/pancake_customers?select=*&order=inserted_at.desc&limit=${CUSTOMERS_LIMIT}&offset=${offset}`;
        if (searchTerm) {
            url += `&name=ilike.*${encodeURIComponent(searchTerm)}*`;
        }

        const res = await fetch(url, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact' }
        });
        if (!res.ok) throw new Error('Không tải được danh sách khách hàng');

        const totalCount = res.headers.get('content-range')?.split('/')?.[1] || '?';
        document.getElementById('customersTotalCount').textContent = totalCount;

        const customers = await res.json();

        if (customers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">Không tìm thấy khách hàng nào</td></tr>`;
            return;
        }

        const ORDER_STATUS_MAP = {
            1: { label: 'Mới', color: '#3b82f6' },
            2: { label: 'Đang xử lý', color: '#f59e0b' },
            3: { label: 'Đã giao', color: '#22c55e' },
            4: { label: 'Hoàn trả', color: '#ef4444' },
            5: { label: 'Hủy', color: '#6b7280' }
        };

        tableBody.innerHTML = customers.map(c => {
            // Avatar
            const avatar = c.avatar_url
                ? `<img src="${c.avatar_url}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--border);" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : '';
            const avatarFallback = `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#8b5cf6);display:${c.avatar_url ? 'none' : 'flex'};align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;color:white;">${(c.name || '?')[0].toUpperCase()}</div>`;

            // Phone
            const phones = Array.isArray(c.phone_numbers) ? c.phone_numbers.filter(Boolean).join(', ') : (c.phone_numbers || '—');

            // Address
            const addrObj = Array.isArray(c.shop_customer_addresses) && c.shop_customer_addresses[0];
            const address = addrObj ? (addrObj.full_address || addrObj.address || '—') : '—';

            // IDs
            const fbId = c.fb_id || '';
            const pageId = c.page_id || '';
            const encodedFbId = encodeURIComponent(fbId);

            // Conversation link
            const convLink = c.conversation_link || '';
            const extLink = c.external_conversation_link || '';
            const convBtn = convLink
                ? `<a href="${convLink}" title="Mở hội thoại" style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:6px;background:var(--primary);color:white;text-decoration:none;font-size:0.78rem;font-weight:600;" target="_blank" rel="noopener noreferrer">
                       <i data-lucide="message-circle" style="width:13px;height:13px;"></i> Mở chat
                   </a>`
                : `<button onclick="openAddConversationForCustomer('${encodeURIComponent(c.fb_id||'')}')" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--primary);font-weight:700;">Thêm hội thoại</button>`;
            
            const extLinkBtn = extLink
                ? `<a href="${extLink}" title="Mở hội thoại ngoài" style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border);color:var(--primary);text-decoration:none;font-size:0.78rem;font-weight:600;" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">
                       <i data-lucide="external-link" style="width:13px;height:13px;"></i> Ngoài
                   </a>`
                : `<button onclick="editExternalConversation('${encodeURIComponent(c.fb_id||'')}'); event.stopPropagation();" style="padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-muted);font-weight:700;font-size:0.78rem;cursor:pointer;">+ Thêm ngoài</button>`;

            return `
                <tr style="border-bottom: 1px solid var(--border); transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-card)'" onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding:12px 16px; text-align:center;">
                        ${avatar}${avatarFallback}
                    </td>
                    <td style="padding:12px 16px;">
                        <div style="font-weight:600; color:var(--text-main);">${c.name || ''}</div>
                    </td>
                    <td style="padding:12px 16px; color:var(--text-main); font-size:0.85rem;">${phones || '—'}</td>
                    <td style="padding:12px 16px; color:var(--text-muted); font-size:0.82rem; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${address}">${address}</td>
                    <td style="padding:12px 16px; font-family:monospace; font-size:0.75rem; color:var(--text-muted);" title="${pageId}">${pageId || '—'}</td>
                    <td style="padding:12px 16px; font-family:monospace; font-size:0.75rem; color:var(--text-muted); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${fbId}">${fbId || '—'}</td>
                    <td style="padding:12px 16px; text-align:center;">
                        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                            ${convBtn}${extLinkBtn}
                        </div>
                    </td>
                    <td style="padding:12px 16px; text-align:center;">
                        <div style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;">
                            <button onclick="openCustomerOrders('${encodedFbId}','${(c.name||'').replace(/'/g,'')}')" title="Xem đơn hàng" style="padding:5px 9px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; background:var(--bg-card); border:1px solid var(--border); color:var(--primary); cursor:pointer; font-size:0.75rem; font-weight:600;">
                                <i data-lucide="shopping-bag" style="width:13px;height:13px;"></i> Đơn hàng
                            </button>
                            <button onclick="editCustomer('${encodedFbId}')" title="Sửa" style="padding:5px 9px; border-radius:6px; display:inline-flex; align-items:center; background:var(--bg-card); border:1px solid var(--border); color:var(--text-main); cursor:pointer;">
                                <i data-lucide="edit-3" style="width:13px;height:13px;"></i>
                            </button>
                            <button onclick="deleteCustomer('${encodedFbId}')" title="Xóa" style="padding:5px 9px; border-radius:6px; display:inline-flex; align-items:center; background:var(--bg-card); border:1px solid var(--border); color:var(--danger); cursor:pointer;">
                                <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();
    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--danger); font-weight:600;">Lỗi: ${err.message}</td></tr>`;
    }
};

// Open linked orders modal for a customer
window.openCustomerOrders = async function(encodedFbId, customerName) {
    const modal = document.getElementById('customerOrdersModal');
    const tbody = document.getElementById('customerOrdersTableBody');
    const titleEl = document.getElementById('customerOrdersModalTitle');
    const subtitleEl = document.getElementById('customerOrdersModalSubtitle');

    modal.style.display = 'flex';
    titleEl.textContent = `Đơn hàng của: ${customerName}`;
    subtitleEl.textContent = 'Đang tải...';
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">🔄 Đang tải đơn hàng...</td></tr>`;

    try {
        const fbId = decodeURIComponent(encodedFbId);
        // Orders link by conversation_id which matches fb_id pattern
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?conversation_id=eq.${encodeURIComponent(fbId)}&select=*&order=inserted_at.desc&limit=50`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const orders = res.ok ? await res.json() : [];

        subtitleEl.textContent = `Tìm thấy ${orders.length} đơn hàng`;

        const STATUS_LABELS = {
            1: { label: 'Mới', color: '#3b82f6' },
            2: { label: 'Đang xử lý', color: '#f59e0b' },
            3: { label: 'Đã giao', color: '#22c55e' },
            4: { label: 'Hoàn trả', color: '#ef4444' },
            5: { label: 'Hủy', color: '#6b7280' }
        };

        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Khách hàng này chưa có đơn hàng nào</td></tr>`;
            return;
        }

        tbody.innerHTML = orders.map(o => {
            const shipAddr = o.shipping_address ? (o.shipping_address.full_address || o.shipping_address.address || '—') : '—';
            const total = parseInt(o.total_price || o.cod || 0);
            const statusValue = normalizeStatusText(o.status);
            const statusCode = getStatusCodeFromText(statusValue);
            const st = {
                label: statusValue,
                color: statusCode === 0 ? '#3b82f6' : statusCode === 1 ? '#f59e0b' : statusCode === 2 || statusCode === 24 ? '#f59e0b' : statusCode === 3 ? '#22c55e' : statusCode === 6 || statusCode === 7 ? '#ef4444' : '#6b7280'
            };
            const dateStr = o.inserted_at ? new Date(o.inserted_at).toLocaleDateString('vi-VN') : '—';
            const convLink = o.conversation_link ? `<a href="${o.conversation_link}" style="color:var(--primary);margin-left:6px;font-size:0.75rem;">[Chat]</a>` : '';
            return `
                <tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:10px 16px;font-family:monospace;font-size:0.82rem;color:var(--text-muted);">#${o.display_id || o.id}${convLink}</td>
                    <td style="padding:10px 16px;font-size:0.82rem;color:var(--text-muted);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${shipAddr}">${shipAddr}</td>
                    <td style="padding:10px 16px;font-weight:700;color:var(--primary);">${total.toLocaleString('vi-VN')} ₫</td>
                    <td style="padding:10px 16px;"><span style="padding:3px 10px;border-radius:20px;background:${st.color}22;color:${st.color};font-size:0.78rem;font-weight:600;">${st.label}</span></td>
                    <td style="padding:10px 16px;font-size:0.82rem;color:var(--text-muted);">${dateStr}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--danger);">Lỗi: ${err.message}</td></tr>`;
    }
};


async function handleCustomerFormSubmit(e) {
    e.preventDefault();
    const editFbId = document.getElementById('customerEditId').value;
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const address = document.getElementById('custAddress').value.trim();
    const pageId = document.getElementById('custPageId').value.trim();
    const conversationLink = document.getElementById('custConversationLink').value.trim();
    const externalConversationLink = document.getElementById('custExternalConversationLink').value.trim();

    // phone_numbers is a jsonb array in pancake_customers
    const payload = {
        name: name,
        phone_numbers: phone ? [phone] : [],
        shop_customer_addresses: address ? [{ full_address: address, address: address, full_name: name }] : [],
        page_id: pageId || null,
        conversation_link: conversationLink || null,
        external_conversation_link: externalConversationLink || null
    };

    try {
        let res;
        if (editFbId) {
            const decodedId = decodeURIComponent(editFbId);
            res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(decodedId)}`, {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
                body: JSON.stringify(payload)
            });
        } else {
            // Insert new customer
            res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
                body: JSON.stringify([payload])
            });
        }

        if (!res.ok) throw new Error('Không thể lưu khách hàng: ' + await res.text());
        
        document.getElementById('customerModal').style.display = 'none';
        alert('Đã lưu thông tin khách hàng thành công!');
        fetchDashboardCustomers();
    } catch (err) {
        console.error(err);
        alert('Lỗi: ' + err.message);
    }
}
window.editCustomer = async function(encodedId) {
    try {
        const fbId = decodeURIComponent(encodedId);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error('Không tải được thông tin khách hàng');
        const data = await res.json();
        if (data.length > 0) {
            const c = data[0];
            document.getElementById('customerEditId').value = encodeURIComponent(c.fb_id || '');
            document.getElementById('custName').value = c.name || '';
            // Get first phone number
            const phones = Array.isArray(c.phone_numbers) ? c.phone_numbers : [];
            document.getElementById('custPhone').value = phones[0] || '';
            // Get address from shop_customer_addresses
            const addr = Array.isArray(c.shop_customer_addresses) && c.shop_customer_addresses[0];
            document.getElementById('custAddress').value = addr ? (addr.full_address || addr.address || '') : '';
            // Page ID
            document.getElementById('custPageId').value = c.page_id || '';
            // Conversation links
            document.getElementById('custConversationLink').value = c.conversation_link || '';
            document.getElementById('custExternalConversationLink').value = c.external_conversation_link || '';
            
            document.getElementById('customerModalTitle').innerHTML = '<i data-lucide="users" style="color:var(--primary);width:18px;"></i> Sửa thông tin khách hàng';
            document.getElementById('customerModal').style.display = 'flex';
            lucide.createIcons();
        }
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
};

window.deleteCustomer = async function(encodedId) {
    if (!confirm('Bạn có chắc chắn muốn xóa khách hàng này?')) return;
    try {
        const fbId = decodeURIComponent(encodedId);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error('Không thể xóa khách hàng: ' + await res.text());
        alert('Xóa khách hàng thành công!');
        fetchDashboardCustomers();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
};



// ================================================================
// PRODUCT EDITING IN ORDER FORMS
// ================================================================

function collectOrderItemsFromDom(orderId) {
    const list = document.getElementById(`product-list-${orderId}`);
    if (!list) return [];
    const rows = list.querySelectorAll('.order-product-row');
    const result = [];
    rows.forEach(row => {
        const qtyInput = row.querySelector('.product-qty-input');
        const qty = parseInt(qtyInput?.value) || 1;
        
        const priceInput = row.querySelector('.product-price-input');
        const price = priceInput ? (parseInt(priceInput.value) || 0) : (parseInt(row.dataset.price) || 0);
        
        const discountInput = row.querySelector('.product-discount-input');
        const discount = discountInput ? (parseInt(discountInput.value) || 0) : (parseInt(row.dataset.discount) || 0);
        
        const productId = row.dataset.productId || null;
        const variationId = row.dataset.variationId || null;
        const sku = row.dataset.sku || '';
        
        const nameInput = row.querySelector('.product-name-input');
        const name = nameInput ? nameInput.value.trim() : (row.dataset.name || '');
        
        const thumb = row.querySelector('img')?.src || row.dataset.thumb || '';
        
        const itemNoteInput = row.querySelector('.product-item-note-input');
        const item_note = itemNoteInput ? itemNoteInput.value.trim() : '';

        result.push({ 
            product_id: productId,
            variation_id: variationId,
            name: name,
            product_name: name,
            sku: sku,
            image_url: thumb,
            quantity: qty, 
            retail_price: price, 
            price: price,
            discount: discount,
            item_note: item_note
        });
    });
    return result;
}

window.changeProductQty = function(orderId, idx, delta, oldSubtotal) {
    const list = document.getElementById(`product-list-${orderId}`);
    if (!list) return;
    const rows = list.querySelectorAll('.order-product-row');
    const row = rows[idx];
    if (!row) return;
    const qtyInput = row.querySelector('.product-qty-input');
    if (!qtyInput) return;
    qtyInput.value = Math.max(1, (parseInt(qtyInput.value) || 1) + delta);
    _recalcDashboardSubtotal(orderId, oldSubtotal);
};

window.updateProductQtyInput = function(orderId, idx, input, oldSubtotal) {
    if (parseInt(input.value) < 1) input.value = 1;
    _recalcDashboardSubtotal(orderId, oldSubtotal);
};

window.removeOrderProduct = function(orderId, idx, oldSubtotal) {
    const list = document.getElementById(`product-list-${orderId}`);
    if (!list) return;
    const rows = list.querySelectorAll('.order-product-row');
    if (rows[idx]) rows[idx].remove();
    const countEl = document.getElementById(`product-count-${orderId}`);
    if (countEl) countEl.textContent = list.querySelectorAll('.order-product-row').length;
    _recalcDashboardSubtotal(orderId, oldSubtotal);
};

window.updateProductPriceLive = function(orderId, idx, input) {
    let val = parseInt(input.value) || 0;
    if (val < 0) { val = 0; input.value = 0; }
    const rows = document.querySelectorAll(`#product-list-${orderId} .order-product-row`);
    if (rows[idx]) rows[idx].dataset.price = val;
    _recalcDashboardSubtotal(orderId, 0);
};

function _recalcDashboardSubtotal(orderId, fallbackSubtotal) {
    const list = document.getElementById(`product-list-${orderId}`);
    let newSubtotal = 0;
    if (list) {
        list.querySelectorAll('.order-product-row').forEach(row => {
            const priceInput = row.querySelector('.product-price-input');
            const price = priceInput ? (parseInt(priceInput.value) || 0) : (parseInt(row.dataset.price) || 0);
            const discount = parseInt(row.dataset.discount) || 0;
            const qty = parseInt(row.querySelector('.product-qty-input')?.value) || 1;
            newSubtotal += (price - discount) * qty;
        });
    } else {
        newSubtotal = fallbackSubtotal;
    }
    const shipfee   = parseInt(document.getElementById(`edit-shipfee-${orderId}`)?.value)   || 0;
    const surcharge = parseInt(document.getElementById(`edit-surcharge-${orderId}`)?.value) || 0;
    const prepaid   = parseInt(document.getElementById(`edit-prepaid-${orderId}`)?.value)   || 0;
    const total     = newSubtotal + shipfee + surcharge;
    const cod       = total - prepaid;
    const fmt       = n => n.toLocaleString('vi-VN') + ' đ';
    const totalEl   = document.getElementById(`calc-total-${orderId}`);
    const codEl     = document.getElementById(`calc-cod-${orderId}`);
    if (totalEl) totalEl.textContent = fmt(total);
    if (codEl)   codEl.textContent   = fmt(cod);
}

window.openSideProductImagePreview = function(src, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (!src) return;
    let overlay = document.getElementById('sideProductImagePreview');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sideProductImagePreview';
        overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.88);align-items:center;justify-content:center;padding:30px;cursor:zoom-out;';
        overlay.innerHTML = '<img alt="Ảnh sản phẩm" style="max-width:92vw;max-height:92vh;object-fit:contain;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.45);"><button type="button" aria-label="Đóng" style="position:absolute;right:24px;top:18px;width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.95);font-size:28px;line-height:1;cursor:pointer;color:#334155;">×</button>';
        overlay.addEventListener('click', () => { overlay.style.display = 'none'; });
        overlay.querySelector('img').addEventListener('click', e => e.stopPropagation());
        document.body.appendChild(overlay);
    }
    overlay.querySelector('img').src = src;
    overlay.style.display = 'flex';
};

function renderSideEditProducts(items, subtotal) {
    const container = document.getElementById('side-edit-products-container');
    if (!container) return;

    const existingBtn = document.getElementById('side-edit-add-product-btn');
    if (existingBtn) existingBtn.remove();

    container.innerHTML = items.length > 0
        ? items.map((it, idx) => {
            const thumb = it.variation_info?.images?.[0] || it.image || it.thumbnail || '';
            const price = parseInt(it.retail_price || it.price) || 0;
            const discount = parseInt(it.discount_each_product || it.discount) || 0;
            return `
                <div class="side-product-row" data-idx="${idx}" data-price="${price}" data-discount="${discount}" data-product-id="${it.product_id || ''}" data-variation-id="${it.variation_id || ''}" data-sku="${it.sku || ''}" data-thumb="${thumb}" data-name="${it.product_name || it.name || ''}"
                     style="display:flex; flex-direction:column; gap:6px; padding:8px; background:var(--bg-app); border-radius:8px; border:1px solid var(--border); margin-bottom:4px;">
                    <div style="display:flex; gap:8px; align-items:center;">
                        ${thumb ? `<img src="${thumb}" onclick="openSideProductImagePreview(this.src, event)" title="Click để xem ảnh lớn" style="width:38px;height:38px;border-radius:6px;object-fit:cover;border:1px solid var(--border);flex-shrink:0;cursor:zoom-in;" onerror="this.style.opacity='0.3'">` : `<div style="width:38px;height:38px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;">📦</div>`}
                        <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;">
                            <input type="text" class="side-product-name-input" value="${it.product_name || it.name || ''}" style="width:100%; font-weight:600; color:var(--text-main); font-size:0.82rem; border:none; background:transparent; padding:2px 0; outline:none; border-bottom:1px dashed transparent; text-overflow:ellipsis;" onfocus="this.style.borderBottomColor='var(--primary)'" onblur="this.style.borderBottomColor='transparent'" title="Sửa tên sản phẩm trực tiếp">
                            <div style="display:flex; align-items:center; gap:2px;">
                                <input type="number" class="side-product-price-input" value="${price}" style="width:75px; font-size:0.72rem; color:var(--text-muted); border:none; background:transparent; outline:none; padding:1px 0; border-bottom:1px dashed transparent; font-weight:500;" onfocus="this.style.borderBottomColor='var(--primary)'" onblur="this.style.borderBottomColor='transparent'" oninput="updateSideProductPriceLive(${idx}, this)" title="Sửa đơn giá trực tiếp">
                                <span style="font-size:0.7rem; color:var(--text-muted);">đ</span>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                            <button onclick="changeSideProductQty(${idx},-1)" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer;font-size:0.85rem;display:inline-flex;align-items:center;justify-content:center;padding:0;">−</button>
                            <input type="number" class="side-product-qty" value="${it.quantity||1}" min="1" data-price="${price}"
                                   oninput="updateSideProductQty(${idx},this)"
                                   style="width:32px;height:20px;text-align:center;border-radius:4px;border:1px solid var(--border);background:var(--bg-panel);color:var(--text-main);font-size:0.75rem;padding:0;">
                            <button onclick="changeSideProductQty(${idx},1)" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer;font-size:0.85rem;display:inline-flex;align-items:center;justify-content:center;padding:0;">+</button>
                            <button onclick="removeSideProduct(${idx})" style="width:20px;height:20px;border-radius:4px;border:1px solid #fee2e2;background:#fef2f2;color:#ef4444;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;">✕</button>
                        </div>
                    </div>
                    <!-- Discount row in sidebar -->
                    <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px dashed var(--border); padding-top:4px; font-size:0.75rem;">
                        <span style="color:var(--text-muted);">KM (Khuyến mãi):</span>
                        <div style="display:flex; align-items:center; gap:2px;">
                            <input type="number" class="side-product-discount" value="${discount}" min="0"
                                   oninput="updateSideProductDiscount(${idx}, this)"
                                   style="width:70px; height:20px; text-align:right; border-radius:4px; border:1px solid var(--border); background:var(--bg-panel); color:var(--text-main); font-size:0.75rem; padding:0 4px;">
                            <span style="color:var(--text-muted); font-size:0.7rem; font-weight:600;">đ</span>
                        </div>
                    </div>
                    <!-- Item Note row -->
                    <div style="border-top:1px dashed var(--border); padding-top:4px;">
                        <input type="text" class="side-product-item-note" value="${it.item_note || it.variation_info?.item_note || it.note || ''}" placeholder="Ghi chú SP (VD: Giao màu đỏ...)" style="width:100%; font-size:0.72rem; color:var(--text-muted); border:1px solid var(--border); border-radius:4px; background:var(--bg-panel); padding:3px 6px; outline:none; box-sizing:border-box;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'">
                    </div>
                </div>
            `;
        }).join('')
        : '<div style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:16px;">Không có sản phẩm</div>';

    const rows = container.querySelectorAll('.side-product-row');
    items.forEach((it, idx) => { if (rows[idx]) rows[idx]._itemData = it; });

    // Cập nhật số lượng sản phẩm
    const countEl = document.getElementById('side-product-count');
    if (countEl) countEl.textContent = items.length;

    // Remove old search wrap if exists
    const existingWrap = document.getElementById('side-edit-search-wrap');
    if (existingWrap) existingWrap.remove();

    // Add inline search bar - Pancake style
    const searchWrap = document.createElement('div');
    searchWrap.id = 'side-edit-search-wrap';
    searchWrap.style.cssText = 'position:relative; margin-top:8px;';
    searchWrap.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <div style="flex:1; display:flex; align-items:center; border:1px solid var(--border); border-radius:8px; background:var(--bg-app); overflow:hidden;">
                <span style="padding:0 8px; color:var(--text-muted); font-size:0.9rem; line-height:1;">🔍</span>
                <input type="text" id="side-product-search-input"
                       placeholder="Tìm sản phẩm (Tên, SKU)..."
                       oninput="searchProductInline(this,null,'modal')"
                       onfocus="searchProductInline(this,null,'modal')"
                       style="width:100%; padding:7px 8px; border:none; background:transparent; color:var(--text-main); font-size:0.8rem; outline:none;">
            </div>
            <button type="button" onclick="toggleInlineCustomForm(null,'modal',this)"
                    style="padding:7px 10px; border-radius:8px; border:1px solid var(--primary); background:transparent; color:var(--primary); font-size:0.8rem; font-weight:600; cursor:pointer; white-space:nowrap;">
                + Tùy chỉnh
            </button>
        </div>
        <div id="side-product-dropdown"
             style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg-panel); border:1px solid var(--border); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.2); z-index:1200; max-height:240px; overflow-y:auto; margin-top:3px;">
        </div>
        <!-- Inline custom product form - side modal -->
        <div id="side-inline-custom-form" style="display:none; margin-top:6px; padding:10px; border:1px dashed var(--primary); border-radius:10px; background:var(--bg-app);">
            <div style="display:flex; align-items:center; gap:8px;">
                <div id="side-icf-img-wrap" onclick="triggerInlineImagePaste(null,'modal')" style="width:42px;height:42px;border-radius:8px;border:1.5px dashed var(--border);background:var(--bg-card);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:1.2rem;overflow:hidden;" title="Dán ảnh (Ctrl+V)">📷</div>
                <input type="text" id="side-icf-name" placeholder="Tên SP (Dán ảnh)" style="flex:2; padding:7px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-panel); color:var(--text-main); font-size:0.82rem; outline:none;">
                <span style="color:var(--text-muted); font-size:0.75rem; white-space:nowrap;">Giá đ</span>
                <input type="number" id="side-icf-price" placeholder="0" min="0" style="width:90px; padding:7px 8px; border:1px solid var(--border); border-radius:8px; background:var(--bg-panel); color:var(--text-main); font-size:0.82rem; outline:none; text-align:right;">
                <input type="number" id="side-icf-qty" value="1" min="1" style="width:44px; padding:7px 6px; border:1px solid var(--border); border-radius:8px; background:var(--bg-panel); color:var(--text-main); font-size:0.82rem; outline:none; text-align:center;">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                <button type="button" onclick="toggleInlineCustomForm(null,'modal',null)" style="padding:6px 14px; border-radius:7px; border:1px solid var(--border); background:transparent; color:var(--text-muted); font-size:0.8rem; font-weight:600; cursor:pointer;">Hủy</button>
                <button type="button" onclick="submitInlineCustomForm(null,'modal')" style="padding:6px 14px; border-radius:7px; border:none; background:var(--primary); color:#fff; font-size:0.8rem; font-weight:700; cursor:pointer;">Thêm SP</button>
            </div>
        </div>
    `;
    container.parentElement.appendChild(searchWrap);

    _recalcSideModalFromDom();
}

window.changeSideProductQty = function(idx, delta) {
    const rows = document.querySelectorAll('#side-edit-products-container .side-product-row');
    const row = rows[idx];
    if (!row) return;
    const input = row.querySelector('.side-product-qty');
    if (!input) return;
    input.value = Math.max(1, (parseInt(input.value) || 1) + delta);
    _recalcSideModalFromDom();
};

window.updateSideProductQty = function(idx, input) {
    if (parseInt(input.value) < 1) input.value = 1;
    _recalcSideModalFromDom();
};

window.removeSideProduct = function(idx) {
    const rows = document.querySelectorAll('#side-edit-products-container .side-product-row');
    if (rows[idx]) rows[idx].remove();
    _recalcSideModalFromDom();
};

window.updateSideProductPriceLive = function(idx, input) {
    let val = parseInt(input.value) || 0;
    if (val < 0) { val = 0; input.value = 0; }
    const rows = document.querySelectorAll('#side-edit-products-container .side-product-row');
    if (rows[idx]) rows[idx].dataset.price = val;
    _recalcSideModalFromDom();
};

function _recalcSideModalFromDom() {
    let newSubtotal = 0;
    document.querySelectorAll('#side-edit-products-container .side-product-row').forEach(row => {
        const priceInput = row.querySelector('.side-product-price-input');
        const price = priceInput ? (parseInt(priceInput.value) || 0) : (parseInt(row.dataset.price) || 0);
        const discount = parseInt(row.dataset.discount) || 0;
        const qty = parseInt(row.querySelector('.side-product-qty')?.value) || 1;
        newSubtotal += (price - discount) * qty;
    });
    _sideEditSubtotal = newSubtotal;
    const shipfee   = parseInt(document.getElementById('side-edit-shipfee')?.value)   || 0;
    const surcharge = parseInt(document.getElementById('side-edit-surcharge')?.value) || 0;
    const prepaid   = parseInt(document.getElementById('side-edit-prepaid')?.value)   || 0;
    const total     = newSubtotal + shipfee + surcharge;
    const cod       = total - prepaid;
    const fmt       = n => n.toLocaleString('vi-VN') + ' đ';
    const subtotalEl = document.getElementById('side-calc-subtotal-val');
    const totalEl    = document.getElementById('side-calc-total-val');
    const codEl      = document.getElementById('side-calc-cod-val');
    if (subtotalEl) subtotalEl.textContent = fmt(newSubtotal);
    if (totalEl)    totalEl.textContent    = fmt(total);
    if (codEl)      codEl.textContent      = fmt(cod);
}

function collectSideModalItems() {
    const rows = document.querySelectorAll('#side-edit-products-container .side-product-row');
    const result = [];
    rows.forEach(row => {
        const qty = parseInt(row.querySelector('.side-product-qty')?.value) || 1;
        
        const priceInput = row.querySelector('.side-product-price-input');
        const price = priceInput ? (parseInt(priceInput.value) || 0) : (parseInt(row.dataset.price) || 0);
        
        const discountInput = row.querySelector('.side-product-discount');
        const discount = discountInput ? (parseInt(discountInput.value) || 0) : (parseInt(row.dataset.discount) || 0);
        
        const productId = row.dataset.productId || null;
        const variationId = row.dataset.variationId || null;
        const sku = row.dataset.sku || '';
        
        const nameInput = row.querySelector('.side-product-name-input');
        const name = nameInput ? nameInput.value.trim() : (row.dataset.name || '');
        
        const thumb = row.querySelector('img')?.src || row.dataset.thumb || '';
        
        const itemNoteInput = row.querySelector('.side-product-item-note');
        const item_note = itemNoteInput ? itemNoteInput.value.trim() : '';

        result.push({ 
            product_id: productId,
            variation_id: variationId,
            name: name,
            product_name: name,
            sku: sku,
            image_url: thumb,
            quantity: qty, 
            retail_price: price, 
            price: price,
            discount: discount,
            item_note: item_note
        });
    });
    return result;
}

// ================================================================
// INLINE PRODUCT SEARCH DROPDOWN (Pancake style)
// ================================================================

let _inlineSearchTimer = null;

window.searchProductInline = async function(inputEl, orderId, context) {
    const query = inputEl.value.trim();
    const dropdownEl = context === 'dashboard' 
        ? document.getElementById(`product-dropdown-${orderId}`)
        : document.getElementById('side-product-dropdown');

    if (!dropdownEl) return;

    dropdownEl.style.display = 'block';

    clearTimeout(_inlineSearchTimer);
    _inlineSearchTimer = setTimeout(async () => {
        dropdownEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:0.78rem;">Đang tìm sản phẩm...</div>';
        try {
            let url = `${SUPABASE_URL}/rest/v1/pancake_products?select=id,name,image_url,pancake_variations(id,name,retail_price,images,sku,stock_quantity)&order=created_at.desc&limit=8`;
            if (query) {
                url += `&name=ilike.*${encodeURIComponent(query)}*`;
            }
            const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            if (!res.ok) throw new Error(await res.text());
            const products = await res.json();

            if (products.length === 0) {
                dropdownEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:0.78rem;">Không tìm thấy sản phẩm</div>';
                return;
            }

            let html = '';
            products.forEach(p => {
                const variations = Array.isArray(p.pancake_variations) ? p.pancake_variations : [];
                if (variations.length === 0) return;

                const firstImg = p.image_url || variations[0]?.images?.[0] || 'https://via.placeholder.com/40';
                
                // Lấy khoảng giá hiển thị (Ví dụ: 1.080.000 đ)
                const prices = variations.map(v => parseInt(v.retail_price) || 0);
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const priceText = minPrice === maxPrice 
                    ? `${minPrice.toLocaleString('vi-VN')} đ` 
                    : `${minPrice.toLocaleString('vi-VN')} - ${maxPrice.toLocaleString('vi-VN')} đ`;

                // Tạo các nút bấm cho từng biến thể
                const variantButtonsHtml = variations.map(v => {
                    const vImg = v.images?.[0] || firstImg;
                    const fullName = (v.name && v.name.toLowerCase().includes(p.name.toLowerCase())) 
                        ? v.name 
                        : (p.name + (v.name ? ' - ' + v.name : ''));
                    const itemData = {
                        id: v.id || `${p.id}_${v.name || ''}`,
                        product_id: p.id,
                        variation_id: v.id || null,
                        product_name: fullName,
                        variation_name: v.name || '',
                        retail_price: parseInt(v.retail_price) || 0,
                        price: parseInt(v.retail_price) || 0,
                        image: vImg,
                        sku: v.sku || '',
                        variation_info: { 
                            name: fullName,
                            images: v.images || (vImg ? [vImg] : []),
                            retail_price: parseInt(v.retail_price) || 0
                        }
                    };

                    let displayName = v.name || 'Mặc định';
                    // Strip product name prefix if present to display only the size/variant attribute
                    if (displayName.toLowerCase().startsWith(p.name.toLowerCase())) {
                        displayName = displayName.substring(p.name.length).replace(/^[\s\-–—]+/, '');
                    }

                    return `
                        <button type="button" 
                                onclick="selectInlineVariation('${orderId}', '${context}', '${encodeURIComponent(JSON.stringify(itemData))}')"
                                style="display:inline-block; padding:4px 8px; margin:2px; font-size:0.72rem; border-radius:4px; border:1px solid var(--border); background:var(--bg-card); color:var(--text-main); cursor:pointer; font-weight:600; outline:none; transition: all 0.15s;"
                                onmouseover="this.style.borderColor='var(--primary)'; this.style.background='var(--bg-app)';"
                                onmouseout="this.style.borderColor='var(--border)'; this.style.background='var(--bg-card)';">
                            ${displayName}
                        </button>
                    `;
                }).join('');

                html += `
                    <div style="display:flex; gap:12px; align-items:flex-start; padding:10px; border-bottom:1px solid var(--border); background:var(--bg-panel);">
                        <img src="${firstImg}" style="width:40px; height:40px; border-radius:6px; object-fit:cover; border:1px solid var(--border); flex-shrink:0;">
                        <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; text-align:left;">
                            <div style="font-weight:700; font-size:0.82rem; color:var(--text-main); line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.name}</div>
                            <div style="font-size:0.75rem; color:var(--primary); font-weight:700;">${priceText}</div>
                            <div style="display:flex; flex-wrap:wrap; margin-top:2px; gap:2px;">
                                ${variantButtonsHtml}
                            </div>
                        </div>
                    </div>
                `;
            });

            dropdownEl.innerHTML = html;

        } catch (e) {
            console.error(e);
            dropdownEl.innerHTML = `<div style="padding:12px;text-align:center;color:var(--danger);font-size:0.78rem;">Lỗi tìm kiếm sản phẩm</div>`;
        }
    }, 250);
};

// Helper to check if a DOM row represents the EXACT same product variation
function _isSameProductVariation(row, item) {
    const rowItemData = row._itemData || {};
    const rowVarId = row.dataset.variationId || rowItemData.variation_id || rowItemData.id || '';
    const itemVarId = item.variation_id || item.id || '';
    
    // 1. If both have valid variation_id, compare them
    if (rowVarId && itemVarId && String(rowVarId) === String(itemVarId)) {
        return true;
    }
    
    // 2. If both have non-empty SKU, compare SKU
    const rowSku = (row.dataset.sku || rowItemData.sku || '').trim();
    const itemSku = (item.sku || '').trim();
    if (rowSku && itemSku && rowSku.toLowerCase() === itemSku.toLowerCase()) {
        return true;
    }
    
    // 3. Compare product_id + product_name (including variation name)
    const rowProdId = (row.dataset.productId || rowItemData.product_id || '').trim();
    const itemProdId = (item.product_id || '').trim();
    const rowNameInput = row.querySelector('.product-name-input, .side-product-name-input');
    const rowName = (rowNameInput ? rowNameInput.value : (row.dataset.name || rowItemData.product_name || rowItemData.name || '')).trim().toLowerCase();
    const itemName = (item.product_name || item.name || '').trim().toLowerCase();

    if (rowProdId && itemProdId && rowProdId === itemProdId && rowName && itemName && rowName === itemName) {
        return true;
    }

    return false;
}

// Global click handler to close dropdowns when clicking outside
document.addEventListener('click', function(e) {
    // Check dashboard dropdowns
    document.querySelectorAll('[id^="product-dropdown-"]').forEach(dropdown => {
        const orderId = dropdown.id.replace('product-dropdown-', '');
        const wrap = document.getElementById(`search-wrap-${orderId}`);
        if (wrap && !wrap.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
    // Check side edit modal dropdown
    const sideDropdown = document.getElementById('side-product-dropdown');
    const sideWrap = document.getElementById('side-edit-search-wrap');
    if (sideDropdown && sideWrap && !sideWrap.contains(e.target)) {
        sideDropdown.style.display = 'none';
    }
});

window.selectInlineVariation = function(orderId, context, encodedJson) {
    const item = JSON.parse(decodeURIComponent(encodedJson));
    item.quantity = 1; // Default quantity is 1 when selected

    if (context === 'dashboard') {
        const list = document.getElementById(`product-list-${orderId}`);
        if (list) {
            // Check if exact same variation already exists in this edit session
            let existingIdx = -1;
            const rows = list.querySelectorAll('.order-product-row');
            rows.forEach((row, rIdx) => {
                if (_isSameProductVariation(row, item)) {
                    existingIdx = rIdx;
                }
            });

            if (existingIdx !== -1) {
                const qtyInput = rows[existingIdx].querySelector('.product-qty-input');
                if (qtyInput) {
                    qtyInput.value = (parseInt(qtyInput.value) || 1) + 1;
                    _recalcDashboardSubtotal(orderId, 0);
                }
            } else {
                _addItemToDashboardList(orderId, item);
            }
            // Clear input search
            const input = document.getElementById(`product-search-${orderId}`);
            if (input) input.value = '';
            const dropdown = document.getElementById(`product-dropdown-${orderId}`);
            if (dropdown) dropdown.style.display = 'none';
        }
    } else {
        const container = document.getElementById('side-edit-products-container');
        if (container) {
            let existingIdx = -1;
            const rows = container.querySelectorAll('.side-product-row');
            rows.forEach((row, rIdx) => {
                if (_isSameProductVariation(row, item)) {
                    existingIdx = rIdx;
                }
            });

            if (existingIdx !== -1) {
                const qtyInput = rows[existingIdx].querySelector('.side-product-qty');
                if (qtyInput) {
                    qtyInput.value = (parseInt(qtyInput.value) || 1) + 1;
                    _recalcSideModalFromDom();
                }
            } else {
                _addItemToSideModal(item);
            }
            // Clear input search
            const input = document.getElementById('side-product-search-input');
            if (input) input.value = '';
            const dropdown = document.getElementById('side-product-dropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
    }
};

function _addItemToDashboardList(orderId, item) {
    const list = document.getElementById(`product-list-${orderId}`);
    if (!list) return;
    const existingRows = list.querySelectorAll('.order-product-row');
    const idx = existingRows.length;
    const price = parseInt(item.retail_price || item.price) || 0;
    const discount = parseInt(item.discount_each_product || item.discount) || 0;
    const thumb = item.image || (item.variation_info?.images?.[0]) || '';

    const div = document.createElement('div');
    div.className = 'order-product-row';
    div.dataset.idx = idx;
    div.dataset.price = price;
    div.dataset.discount = discount;
    div.dataset.productId = item.product_id || '';
    div.dataset.variationId = item.variation_id || item.id || '';
    div.dataset.sku = item.sku || '';
    div.dataset.thumb = thumb;
    div.dataset.name = item.product_name || item.name || '';
    div._itemData = item;
    div.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:8px;background:var(--bg-app);border:1px solid var(--border);margin-bottom:4px;';
    div.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;">
            ${thumb ? `<img src="${thumb}" style="width:38px;height:38px;border-radius:6px;object-fit:cover;border:1px solid var(--border);flex-shrink:0;">` : `<div style="width:38px;height:38px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;">📦</div>`}
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:0.78rem;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.product_name}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:1px;">${price.toLocaleString('vi-VN')} đ/sp</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                <button onclick="changeProductQty('${orderId}',${idx},-1,0)" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer;font-size:0.85rem;display:inline-flex;align-items:center;justify-content:center;padding:0;">−</button>
                <input type="number" class="product-qty-input" value="${item.quantity}" min="1" data-price="${price}"
                       oninput="updateProductQtyInput('${orderId}',${idx},this,0)"
                       style="width:32px;height:20px;text-align:center;border-radius:4px;border:1px solid var(--border);background:var(--bg-panel);color:var(--text-main);font-size:0.75rem;padding:0;">
                <button onclick="changeProductQty('${orderId}',${idx},1,0)" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer;font-size:0.85rem;display:inline-flex;align-items:center;justify-content:center;padding:0;">+</button>
                <button onclick="removeOrderProduct('${orderId}',${idx},0)" style="width:20px;height:20px;border-radius:4px;border:1px solid #fee2e2;background:#fef2f2;color:#ef4444;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;">✕</button>
            </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px dashed var(--border);padding-top:4px;font-size:0.75rem;">
            <span style="color:var(--text-muted);">KM (Khuyến mãi):</span>
            <div style="display:flex;align-items:center;gap:2px;">
                <input type="number" class="product-discount-input" value="${discount}" min="0"
                       oninput="updateProductDiscount('${orderId}',${idx},this,0)"
                       style="width:70px;height:20px;text-align:right;border-radius:4px;border:1px solid var(--border);background:var(--bg-panel);color:var(--text-main);font-size:0.75rem;padding:0 4px;">
                <span style="color:var(--text-muted);font-size:0.7rem;font-weight:600;">đ</span>
            </div>
        </div>
        <div style="border-top:1px dashed var(--border);padding-top:4px;">
            <input type="text" class="product-item-note-input" value="" placeholder="Ghi chú SP (VD: Giao màu đỏ...)" style="width:100%;font-size:0.72rem;color:var(--text-muted);border:1px solid var(--border);border-radius:4px;background:var(--bg-panel);padding:3px 6px;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'">
        </div>`;
    list.appendChild(div);

    const countEl = document.getElementById(`product-count-${orderId}`);
    if (countEl) countEl.textContent = list.querySelectorAll('.order-product-row').length;
    _recalcDashboardSubtotal(orderId, 0);
}

function _addItemToSideModal(item) {
    const container = document.getElementById('side-edit-products-container');
    if (!container) return;

    // Remove empty placeholder if exists
    const placeholder = container.querySelector('div:not(.side-product-row)');
    if (placeholder) placeholder.remove();

    const rows = container.querySelectorAll('.side-product-row');
    const idx = rows.length;
    const price = parseInt(item.retail_price || item.price) || 0;
    const discount = parseInt(item.discount_each_product || item.discount) || 0;
    const thumb = item.image || (item.variation_info?.images?.[0]) || '';

    const div = document.createElement('div');
    div.className = 'side-product-row';
    div.dataset.idx = idx;
    div.dataset.price = price;
    div.dataset.discount = discount;
    div.dataset.productId = item.product_id || '';
    div.dataset.variationId = item.variation_id || item.id || '';
    div.dataset.sku = item.sku || '';
    div.dataset.thumb = thumb;
    div.dataset.name = item.product_name || item.name || '';
    div._itemData = item;
    div.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--bg-app);border-radius:8px;border:1px solid var(--border);margin-bottom:4px;';
    div.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;">
            ${thumb ? `<img src="${thumb}" style="width:38px;height:38px;border-radius:6px;object-fit:cover;border:1px solid var(--border);flex-shrink:0;">` : `<div style="width:38px;height:38px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;">📦</div>`}
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;color:var(--text-main);font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.product_name}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:1px;">${price.toLocaleString('vi-VN')} đ/sp</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                <button onclick="changeSideProductQty(${idx},-1)" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer;font-size:0.85rem;display:inline-flex;align-items:center;justify-content:center;padding:0;">−</button>
                <input type="number" class="side-product-qty" value="${item.quantity}" min="1" data-price="${price}"
                       oninput="updateSideProductQty(${idx},this)"
                       style="width:32px;height:20px;text-align:center;border-radius:4px;border:1px solid var(--border);background:var(--bg-panel);color:var(--text-main);font-size:0.75rem;padding:0;">
                <button onclick="changeSideProductQty(${idx},1)" style="width:20px;height:20px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer;font-size:0.85rem;display:inline-flex;align-items:center;justify-content:center;padding:0;">+</button>
                <button onclick="removeSideProduct(${idx})" style="width:20px;height:20px;border-radius:4px;border:1px solid #fee2e2;background:#fef2f2;color:#ef4444;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;">✕</button>
            </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px dashed var(--border);padding-top:4px;font-size:0.75rem;">
            <span style="color:var(--text-muted);">KM (Khuyến mãi):</span>
            <div style="display:flex;align-items:center;gap:2px;">
                <input type="number" class="side-product-discount" value="${discount}" min="0"
                       oninput="updateSideProductDiscount(${idx},this)"
                       style="width:70px;height:20px;text-align:right;border-radius:4px;border:1px solid var(--border);background:var(--bg-panel);color:var(--text-main);font-size:0.75rem;padding:0 4px;">
                <span style="color:var(--text-muted);font-size:0.7rem;font-weight:600;">đ</span>
            </div>
        </div>
        <div style="border-top:1px dashed var(--border);padding-top:4px;">
            <input type="text" class="side-product-item-note" value="" placeholder="Ghi chú SP (VD: Giao màu đỏ...)" style="width:100%;font-size:0.72rem;color:var(--text-muted);border:1px solid var(--border);border-radius:4px;background:var(--bg-panel);padding:3px 6px;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'">
        </div>`;
    container.appendChild(div);
    _recalcSideModalFromDom();
}


// ================================================================
// QUICK PRODUCT CREATION & KM DISCOUNT LOGIC
// ================================================================

window.updateProductDiscount = function(orderId, idx, input, oldSubtotal) {
    const list = document.getElementById(`product-list-${orderId}`);
    if (!list) return;
    const rows = list.querySelectorAll('.order-product-row');
    const row = rows[idx];
    if (row) {
        let discount = parseInt(input.value) || 0;
        if (discount < 0) { discount = 0; input.value = 0; }
        row.dataset.discount = discount;
    }
    _recalcDashboardSubtotal(orderId, oldSubtotal);
};

window.updateSideProductDiscount = function(idx, input) {
    const rows = document.querySelectorAll('#side-edit-products-container .side-product-row');
    const row = rows[idx];
    if (row) {
        let discount = parseInt(input.value) || 0;
        if (discount < 0) { discount = 0; input.value = 0; }
        row.dataset.discount = discount;
    }
    _recalcSideModalFromDom();
};

// ================================================================
// INLINE CUSTOM PRODUCT FORM (no popup)
// ================================================================
const _icfState = {};

window.toggleInlineCustomForm = function(orderId, context, triggerBtn) {
    const formId = context === 'dashboard' ? `inline-custom-form-${orderId}` : 'side-inline-custom-form';
    const form = document.getElementById(formId);
    if (!form) return;
    const isShowing = form.style.display !== 'none';
    form.style.display = isShowing ? 'none' : 'block';
    if (!isShowing) {
        const key = context === 'dashboard' ? orderId : '__side__';
        _icfState[key] = { image: null };
        if (context === 'dashboard') {
            const n = document.getElementById(`icf-name-${orderId}`);
            const p = document.getElementById(`icf-price-${orderId}`);
            const q = document.getElementById(`icf-qty-${orderId}`);
            const w = document.getElementById(`icf-img-wrap-${orderId}`);
            if (n) n.value = ''; if (p) p.value = ''; if (q) q.value = '1';
            if (w) w.innerHTML = '\ud83d\udcf7';
        } else {
            const n = document.getElementById('side-icf-name');
            const p = document.getElementById('side-icf-price');
            const q = document.getElementById('side-icf-qty');
            const w = document.getElementById('side-icf-img-wrap');
            if (n) n.value = ''; if (p) p.value = ''; if (q) q.value = '1';
            if (w) w.innerHTML = '\ud83d\udcf7';
        }
        setTimeout(() => {
            const el = context === 'dashboard'
                ? document.getElementById(`icf-name-${orderId}`)
                : document.getElementById('side-icf-name');
            if (el) el.focus();
        }, 50);
    }
};

window.triggerInlineImagePaste = function(orderId, context) {
    const nameInputId = context === 'dashboard' ? `icf-name-${orderId}` : 'side-icf-name';
    const imgWrapId   = context === 'dashboard' ? `icf-img-wrap-${orderId}` : 'side-icf-img-wrap';
    const nameEl = document.getElementById(nameInputId);
    if (!nameEl) return;
    nameEl.focus();
    const pasteHandler = async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) return;
                
                const key = context === 'dashboard' ? orderId : '__side__';
                _icfState[key] = _icfState[key] || {};
                const wrap = document.getElementById(imgWrapId);
                
                // Hiển thị preview local ngay lập tức
                const localUrl = URL.createObjectURL(file);
                if (wrap) wrap.innerHTML = `<img src="${localUrl}" style="width:100%;height:100%;object-fit:cover;opacity:0.5;"><span style="position:absolute;font-size:0.55rem;color:var(--primary);font-weight:700;">Uploading...</span>`;
                
                // Upload lên Pancake API để lấy CDN URL
                try {
                    const formData = new FormData();
                    formData.append('file', file);
                    const res = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
                        method: 'POST', body: formData
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const cdnUrl = data.content_url || data.url || null;
                        if (cdnUrl) {
                            _icfState[key].image = cdnUrl;
                            if (wrap) wrap.innerHTML = `<img src="${cdnUrl}" style="width:100%;height:100%;object-fit:cover;">`;
                        } else {
                            // Fallback data URL nếu API không trả URL
                            const reader = new FileReader();
                            reader.onload = (ev) => { _icfState[key].image = ev.target.result; if (wrap) wrap.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`; };
                            reader.readAsDataURL(file);
                        }
                    } else {
                        // Fallback data URL nếu upload lỗi
                        const reader = new FileReader();
                        reader.onload = (ev) => { _icfState[key].image = ev.target.result; if (wrap) wrap.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`; };
                        reader.readAsDataURL(file);
                    }
                } catch (err) {
                    console.error('Upload inline image error:', err);
                    const reader = new FileReader();
                    reader.onload = (ev) => { _icfState[key].image = ev.target.result; if (wrap) wrap.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`; };
                    reader.readAsDataURL(file);
                }
                URL.revokeObjectURL(localUrl);
                return;
            }
        }
    };
    nameEl._icfPasteHandler && nameEl.removeEventListener('paste', nameEl._icfPasteHandler);
    nameEl._icfPasteHandler = pasteHandler;
    nameEl.addEventListener('paste', pasteHandler);
};

window.submitInlineCustomForm = async function(orderId, context) {
    const key = context === 'dashboard' ? orderId : '__side__';
    const state = _icfState[key] || {};
    let name, price, qty;
    if (context === 'dashboard') {
        name  = (document.getElementById(`icf-name-${orderId}`)?.value || '').trim();
        price = parseInt(document.getElementById(`icf-price-${orderId}`)?.value) || 0;
        qty   = parseInt(document.getElementById(`icf-qty-${orderId}`)?.value) || 1;
    } else {
        name  = (document.getElementById('side-icf-name')?.value || '').trim();
        price = parseInt(document.getElementById('side-icf-price')?.value) || 0;
        qty   = parseInt(document.getElementById('side-icf-qty')?.value) || 1;
    }
    if (!name) { alert('Vui lòng nhập tên sản phẩm'); return; }
    const defaultImg = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=80&h=80&fit=crop';
    const imageUrl = state.image || defaultImg;
    const isDataUrl = imageUrl.startsWith('data:');
    const submitBtnSelector = context === 'dashboard'
        ? `#inline-custom-form-${orderId} button:last-child`
        : '#side-inline-custom-form button:last-child';
    const submitBtn = document.querySelector(submitBtnSelector);
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Đang lưu...'; }
    try {
        // Sinh UUID thay vì number ID
        const genUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
        const tempProdId = genUUID();
        const tempVarId = genUUID();

        // Nếu ảnh đã là CDN URL (upload sẵn qua paste), dùng trực tiếp
        const finalImageUrl = isDataUrl ? null : imageUrl;

        const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_products`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify({ id: tempProdId, name, image_url: finalImageUrl })
        });
        if (!prodRes.ok) throw new Error(await prodRes.text());
        const [product] = await prodRes.json();
        const varRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_variations`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify({ id: tempVarId, product_id: product.id, name, retail_price: price, images: finalImageUrl ? [finalImageUrl] : [], sku: 'SP_' + Date.now().toString().slice(-6) })
        });
        if (!varRes.ok) throw new Error(await varRes.text());
        const [variation] = await varRes.json();
        const newItem = { product_id: product.id, product_name: name, variation_name: '', retail_price: price, price, image: state.image || defaultImg, sku: variation.sku, quantity: qty, discount: 0 };
        if (context === 'dashboard') { _addItemToDashboardList(orderId, newItem); } else { _addItemToSideModal(newItem); }
        toggleInlineCustomForm(orderId, context, null);
        if (typeof showToast === 'function') showToast('\u0110\u00e3 th\u00eam s\u1ea3n ph\u1ea9m t\u00f9y ch\u1ec9nh!', 'success');
    } catch (e) {
        console.error(e);
        alert('L\u1ed7i t\u1ea1o s\u1ea3n ph\u1ea9m: ' + e.message);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Th\u00eam SP'; }
    }
};

// (Legacy wrapper kept for safety)
window.openQuickProductModal = function(orderId, context) {
    toggleInlineCustomForm(orderId, context, null);
};

window.previewQpImage = function(url) {
    const preview = document.getElementById('qpImagePreview');
    if (!preview) return;
    if (url && url.startsWith('http')) {
        preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='❌'">`;
    } else {
        preview.innerHTML = '📷';
        preview.style.fontSize = '1.4rem';
    }
};

// Wire close modal events
(function initQuickProductEvents() {
    const setup = () => {
        const modal = document.getElementById('quickProductModal');
        if (!modal) return;
        const closeFn = () => { modal.style.display = 'none'; };
        document.getElementById('btnCloseQuickProductModal')?.addEventListener('click', closeFn);
        document.getElementById('btnCancelQuickProduct')?.addEventListener('click', closeFn);
        modal.addEventListener('click', e => { if (e.target === modal) closeFn(); });
    };
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', setup); } else { setup(); }
})();

window.handleQuickProductSubmit = async function(event) {
    event.preventDefault();
    const saveBtn = document.getElementById('btnSaveQuickProduct');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang tạo...'; }

    const orderId = document.getElementById('quickProductOrderId').value;
    const context = document.getElementById('quickProductContext').value;
    
    const name = document.getElementById('qpName').value.trim();
    const price = parseInt(document.getElementById('qpPrice').value) || 0;
    const size = document.getElementById('qpSize').value.trim();
    const qty = parseInt(document.getElementById('qpQty').value) || 1;
    const imageUrl = (document.getElementById('qpImage')?.value || '').trim() ||
                     'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=80&h=80&fit=crop';

    const tempGenUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
    const tempProdId = tempGenUUID();
    const tempVarId = tempGenUUID();

    try {
        // Step 1: Insert into pancake_products
        const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_products`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                id: tempProdId,
                name: name,
                image_url: imageUrl
            })
        });

        if (!prodRes.ok) throw new Error('Không tạo được sản phẩm gốc: ' + await prodRes.text());
        const createdProds = await prodRes.json();
        const product = createdProds[0];

        // Step 2: Insert into pancake_variations
        const varRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_variations`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                id: tempVarId,
                product_id: product.id,
                name: size ? `${name} - ${size}` : name,
                retail_price: price,
                images: [imageUrl],
                sku: 'SP_' + Date.now().toString().slice(-6)
            })
        });

        if (!varRes.ok) throw new Error('Không tạo được biến thể sản phẩm: ' + await varRes.text());
        const createdVars = await varRes.json();
        const variation = createdVars[0];

        // Prepare item data structure to append to order list
        const newItem = {
            product_id: product.id,
            product_name: variation.name,
            variation_name: size || '',
            retail_price: price,
            price: price,
            image: imageUrl,
            sku: variation.sku,
            quantity: qty,
            discount: 0,
            variation_info: { images: [imageUrl] }
        };

        // Add to order
        if (context === 'dashboard') {
            _addItemToDashboardList(orderId, newItem);
        } else {
            _addItemToSideModal(newItem);
        }

        // Close modal
        document.getElementById('quickProductModal').style.display = 'none';
        if (typeof showToast === 'function') showToast('Đã thêm sản phẩm tùy chỉnh thành công!', 'success');
    } catch (e) {
        console.error(e);
        alert('Lỗi tạo sản phẩm tùy chỉnh: ' + e.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Xác nhận tạo';
        }
    }
};

// ================================================================
// LOAD CUSTOMER INFO (read-only block in order edit panels)
// ================================================================
window.loadOrderCustomerInfo = async function(orderId, convId, context) {
    // Select the target container
    const containerId = context === 'side' ? 'side-cust-info' : `edit-cust-info-${orderId}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    // Helper to render
    const renderCust = (name, phones, avatar) => {
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                ${avatar
                    ? `<img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--border);flex-shrink:0;" onerror="this.style.display='none'">`
                    : `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;color:white;flex-shrink:0;">${(name||'?')[0].toUpperCase()}</div>`
                }
                <div style="min-width:0;">
                    <div style="font-weight:700;font-size:0.85rem;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name || '—'}</div>
                    <div style="font-size:0.77rem;color:var(--text-muted);margin-top:2px;">${phones || '—'}</div>
                    <div style="margin-top:6px;">
                        <button class="btn-secondary-quick" onclick="openSelectCustomerForOrder('${orderId}', '${context}')" style="padding:6px 10px; border-radius:8px;">Thay khách hàng</button>
                    </div>
                </div>
            </div>`;
    };

    // If no convId, show fallback with the option to replace customer
    if (!convId) {
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:6px; font-size:0.8rem; color:var(--text-muted);">
                <div>Không có thông tin khách hàng</div>
                <button class="btn-secondary-quick" onclick="openSelectCustomerForOrder('${orderId}', '${context}')" style="padding:6px 10px; border-radius:8px; align-self:flex-start;">Thay khách hàng</button>
            </div>`;
        return;
    }

    try {
        // pancake_customers.fb_id = conversation_id of order
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(convId)}&select=name,phone_numbers,avatar_url&limit=1`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (data.length === 0) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:6px; font-size:0.8rem; color:var(--text-muted);">
                    <div>Không tìm thấy khách hàng (conv: ${convId.slice(0,12)}...)</div>
                    <button class="btn-secondary-quick" onclick="openSelectCustomerForOrder('${orderId}', '${context}')" style="padding:6px 10px; border-radius:8px; align-self:flex-start;">Thay khách hàng</button>
                </div>`;
            return;
        }
        const c = data[0];
        const phones = Array.isArray(c.phone_numbers)
            ? c.phone_numbers.filter(Boolean).join(' · ')
            : (c.phone_numbers || '—');
        renderCust(c.name, phones, c.avatar_url);
    } catch (e) {
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:6px; font-size:0.8rem; color:var(--text-muted);">
                <div>Lỗi tải thông tin KH</div>
                <button class="btn-secondary-quick" onclick="openSelectCustomerForOrder('${orderId}', '${context}')" style="padding:6px 10px; border-radius:8px; align-self:flex-start;">Thay khách hàng</button>
            </div>`;
    }
};

// ================================================================
// QUICK CREATE ORDER FROM CHAT PANEL
// ================================================================
window.quickCreateOrder = async function() {
    if (!activeThread) {
        if (typeof showToast === 'function') {
            showToast('Vui lòng chọn một hội thoại trước!', 'error');
        } else {
            alert('Vui lòng chọn một hội thoại trước khi tạo đơn hàng.');
        }
        return;
    }

    const btn = document.getElementById('btnQuickCreateOrder');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.innerHTML = '<i data-lucide="loader-2" style="animation:spin 1s linear infinite;"></i>';
        if (window.lucide) lucide.createIcons();
    }

    try {
        const custName    = activeThread.customer?.name || activeThread.name || '';
        let custPhone     = activeThread.customer?.phone || activeThread.customer?.phone_number || '';
        let custAddress   = activeThread.customer?.address || '';
        const convId      = activeThread.tid || '';
        const pageId      = activeThread.page_pid || activeThread.pid || activeThread.page_id || selectedPagePid || '';

        // Nếu khách đã từng có đơn, ưu tiên lấy SĐT + địa chỉ từ đơn gần nhất.
        // Chỉ ghi đè khi đơn gần nhất có dữ liệu; nếu trống thì giữ thông tin hiện tại từ hội thoại.
        try {
            // Lấy nhiều đơn gần nhất vì đơn mới nhất có thể chỉ có SĐT nhưng chưa có địa chỉ.
            // Sau đó lấy riêng giá trị SĐT/địa chỉ gần nhất không rỗng.
            const latestOrderUrl = SUPABASE_URL + '/rest/v1/pancake_orders?conversation_id=eq.' + encodeURIComponent(convId) + '&select=bill_phone_number,shipping_address,inserted_at&order=inserted_at.desc&limit=20';
            const latestOrderRes = await fetch(latestOrderUrl, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
            });
            if (latestOrderRes.ok) {
                const latestOrders = await latestOrderRes.json();
                if (Array.isArray(latestOrders) && latestOrders.length > 0) {
                    const readAddress = (raw) => {
                        if (!raw) return '';
                        let obj = raw;
                        if (typeof obj === 'string') {
                            try { obj = JSON.parse(obj); } catch (_) { return obj.trim(); }
                        }
                        return String(
                            obj?.full_address ||
                            obj?.address ||
                            obj?.address_detail ||
                            obj?.detail_address ||
                            obj?.street ||
                            ''
                        ).trim();
                    };

                    const phoneOrder = latestOrders.find(o => String(o?.bill_phone_number || '').trim());
                    const addressOrder = latestOrders.find(o => readAddress(o?.shipping_address));
                    const latestPhone = phoneOrder ? String(phoneOrder.bill_phone_number || '').trim() : '';
                    const latestAddress = addressOrder ? readAddress(addressOrder.shipping_address) : '';

                    if (latestPhone) custPhone = latestPhone;
                    if (latestAddress) custAddress = latestAddress;
                }
            }
        } catch (historyErr) {
            console.warn('[Tạo đơn nhanh] Không lấy được thông tin đơn gần nhất:', historyErr);
        }

        const shippingAddress = custAddress
            ? { full_address: custAddress, address: custAddress }
            : {};

        // 1. Lấy mã đơn hợp lệ lớn nhất hiện tại rồi tạo mã mới = mã đơn lớn nhất + 1
        let newDisplayId = 16000; // Fallback nếu database chưa có đơn
        const latestIdRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?select=display_id&display_id=not.is.null&display_id=lt.1000000000&order=display_id.desc&limit=1`, {
            headers: {
                'apikey':        SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!latestIdRes.ok) {
            throw new Error('Không lấy được mã đơn gần nhất: ' + await latestIdRes.text());
        }

        const latestIds = await latestIdRes.json();
        const latestDisplayId = parseInt(latestIds?.[0]?.display_id, 10);
        if (!isNaN(latestDisplayId) && latestDisplayId > 0) {
            newDisplayId = latestDisplayId + 1;
        }
        const conversationLink = `/#tin-nhan?pid=${pageId}&tid=${convId}`;

        // 2. Kiểm tra xem khách hàng đã tồn tại trong pancake_customers chưa
        try {
            const checkCustRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(convId)}&select=fb_id`, {
                headers: {
                    'apikey':        SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            if (checkCustRes.ok) {
                const custData = await checkCustRes.json();
                const customerSyncPayload = {
                    name: custName || undefined,
                    phone_numbers: custPhone ? [custPhone] : undefined,
                    shop_customer_addresses: custAddress ? [{
                        full_address: custAddress,
                        address: custAddress,
                        full_name: custName || undefined,
                        phone_number: custPhone || undefined
                    }] : undefined,
                    page_id: pageId || undefined,
                    conversation_link: conversationLink || undefined,
                    updated_at: new Date().toISOString()
                };
                Object.keys(customerSyncPayload).forEach(k => customerSyncPayload[k] === undefined && delete customerSyncPayload[k]);

                if (!custData || custData.length === 0) {
                    console.log('[Tạo đơn nhanh] Khách hàng chưa có trong bảng khách hàng, tự động tạo mới từ dữ liệu đơn gần nhất...');
                    await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers`, {
                        method: 'POST',
                        headers: {
                            'apikey':        SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type':  'application/json'
                        },
                        body: JSON.stringify({
                            fb_id: convId,
                            avatar_url: activeThread.customer?.picture || '',
                            inserted_at: new Date().toISOString(),
                            ...customerSyncPayload
                        })
                    });
                } else {
                    // Khách đã tồn tại: đồng bộ SĐT + địa chỉ từ đơn hàng sang bảng pancake_customers.
                    await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(convId)}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify(customerSyncPayload)
                    });
                }            }
        } catch (custErr) {
            console.warn('Lỗi kiểm tra/tạo thông tin khách hàng mới:', custErr);
        }

        const payload = {
            id:                `local_${newDisplayId}`,
            display_id:        newDisplayId, // Kiểu bigint (số nguyên)
            shop_id:           '1290216404', // Mặc định từ dữ liệu database
            conversation_id:   convId,
            page_id:           pageId,
            conversation_link: conversationLink, // Link hội thoại để liên kết đơn hàng
            bill_full_name:    custName,
            bill_phone_number: custPhone,
            shipping_address:  shippingAddress,
            status:            'Chờ xử lý (Mới)',
            shipping_fee:      25000,
            surcharge:         0,
            prepaid:           0,
            note:              '',
            inserted_at:       new Date().toISOString(),
            updated_at:        new Date().toISOString()
        };

        // Tránh lội trùng khóa chính khi nhiều luồng cùng tạo đơn hoặc khi
        // cách tìm display_id lớn nhất chưa thấy một ID cũ lớn hơn.
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders`, {
            method: 'POST',
            headers: {
                'apikey':        SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type':  'application/json',
                'Prefer':        'return=representation'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());
        const [newOrder] = await res.json();

        if (typeof showToast === 'function') {
            showToast('✅ Đã tạo đơn #' + (newOrder.display_id || newOrder.id) + ' thành công!', 'success');
        }

        // Refresh recent orders in panel
        if (typeof fetchCustomerOrdersHistory === 'function' && activeThread) {
            fetchCustomerOrdersHistory(activeThread);
        }

        // Also refresh dashboard if open
        const ordersTab = document.getElementById('orders-tab-content');
        if (ordersTab && ordersTab.style.display !== 'none') {
            fetchDashboardOrders();
        }

    } catch (e) {
        console.error('quickCreateOrder error:', e);
        if (typeof showToast === 'function') {
            showToast('Lỗi tạo đơn: ' + e.message, 'error');
        } else {
            alert('Lỗi tạo đơn hàng: ' + e.message);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.innerHTML = originalHTML;
            if (window.lucide) lucide.createIcons();
        }
    }
};

// Inject spin keyframe once
(function() {
    if (document.getElementById('qs-spin')) return;
    const s = document.createElement('style');
    s.id = 'qs-spin';
    s.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
})();


// ================================================================
// CHATBOT AUTO MESSAGE FEATURE — Supabase chatbot_scripts
// ================================================================

const CHATBOT_STATUS_LABELS = {
    '-1': 'Gửi tin nhắn (thủ công)',
    '0':  'Chờ xử lý (Mới)',
    '1':  'Đã xác nhận',
    '2':  'Đang giao',
    '3':  'Hoàn thành',
    '4':  'Đã giao',
    '5':  'Hủy',
    '6':  'Đã hủy',
    '7':  'Đang trả hàng',
    '8':  'Đang đóng gói',
    '9':  'Chờ lấy hàng',
    '11': 'Đang nhập hàng',
    '18': 'Gửi BE',
    '19': 'Gửi Grab',
    '21': 'Gửi GH khác',
    '22': 'Lấy tại shop',
    '24': 'Đang vận chuyển',
    '25': 'Chờ Deal',
    '16': 'Đã thu tiền',
    '17': 'Chờ xác nhận',
    '20': 'Đã mua hàng'
};

let chatbotConfig = {};         // { [status_id]: { enabled, message, status_name, send_method } }
let lastFocusedTextarea = null;
let keywordRules = [];        // Stored locally in browser and synced to Supabase
const keywordTriggerHistory = {}; // { [threadId]: Set<messageToken> }

async function loadKeywordRules() {
    let loadedFromSupabase = false;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_keyword_rules?select=*&order=inserted_at.asc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (res.ok) {
            const rows = await res.json();
            if (Array.isArray(rows)) {
                keywordRules = rows.map(row => ({
                    id: row.rule_id || `kr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    enabled: row.enabled === true,
                    type: normalizeRuleType(row.type || 'incoming'),
                    keyword: row.keyword || '',
                    message: row.message || '',
                    send_method: normalizeSendMethod(row.send_method || 'api_smax'),
                    created_at: row.inserted_at || row.created_at || '',
                    updated_at: row.updated_at || ''
                }));
                loadedFromSupabase = true;
            }
        }
    } catch (err) {
        console.warn('[Chatbot] Lỗi load keyword rules từ Supabase:', err);
    }

    if (!loadedFromSupabase) {
        try {
            const raw = localStorage.getItem('smaxChatbotKeywordRules');
            keywordRules = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(keywordRules)) keywordRules = [];
        } catch (err) {
            console.warn('[Chatbot] Lỗi đọc quy tắc từ khóa từ localStorage:', err);
            keywordRules = [];
        }
    }
}

function saveKeywordRulesToStorage() {
    localStorage.setItem('smaxChatbotKeywordRules', JSON.stringify(keywordRules));
}

async function saveKeywordRulesToSupabase() {
    if (!Array.isArray(keywordRules)) return;

    const payload = keywordRules.map(rule => ({
        rule_id: rule.id,
        enabled: rule.enabled === true,
        type: rule.type || 'incoming',
        keyword: normalizeRuleKeywordText(rule.keyword),
        message: rule.message || '',
        send_method: rule.send_method || 'api_smax',
        updated_at: new Date().toISOString()
    }));

    if (payload.length === 0) {
        console.log('[Chatbot] saveKeywordRulesToSupabase skipped because payload is empty');
        return;
    }

    console.log('[Chatbot] saveKeywordRulesToSupabase payload:', payload);

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_keyword_rules`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(payload)
        });

        const responseText = await res.text();
        console.log('[Chatbot] saveKeywordRulesToSupabase response:', res.status, responseText);

        if (!res.ok) {
            throw new Error(responseText || 'Lỗi lưu keyword rules lên Supabase');
        }
    } catch (err) {
        console.warn('[Chatbot] Lỗi lưu keyword rules lên Supabase:', err);
        throw err;
    }
}

function persistKeywordRules() {
    saveKeywordRulesToStorage();
    saveKeywordRulesToSupabase().catch(err => {
        console.warn('[Chatbot] Không thể đồng bộ quy tắc từ khóa lên Supabase, lưu localStorage tạm thời:', err);
    });
}

function normalizeRuleType(value) {
    const v = (value || '').toString().trim().toLowerCase();
    if (!v) return 'incoming';
    if (v.includes('out') || v.includes('shop') || v.includes('kích hoạt') || v.includes('send') || v.includes('api_smax')) return 'outgoing';
    return 'incoming';
}

function normalizeSendMethod(value) {
    const v = (value || '').toString().trim().toLowerCase();
    if (v === 'robot' || v === 'api_smax' || v === 'both') return v;
    if (v.includes('robot')) return 'robot';
    if (v.includes('api')) return 'api_smax';
    return 'api_smax';
}

function normalizeRuleKeywordText(value) {
    return (value || '').toString().trim();
}

function renderKeywordRules() {
    const container = document.getElementById('chatbotKeywordRules');
    if (!container) return;

    if (!Array.isArray(keywordRules)) keywordRules = [];
    container.innerHTML = '';

    if (keywordRules.length === 0) {
        container.innerHTML = `<div style="padding:18px; border:1px dashed var(--border); border-radius:14px; color:var(--text-muted); font-size:0.88rem;">Chưa có quy tắc từ khóa nào. Nhấn nút Thêm quy tắc để tạo.</div>`;
        return;
    }

    keywordRules.forEach((rule, index) => {
        const ruleCard = document.createElement('div');
        ruleCard.className = 'chatbot-card';
        ruleCard.style.padding = '14px 18px';
        ruleCard.style.display = 'grid';
        ruleCard.style.gridTemplateColumns = '1fr auto';
        ruleCard.style.gap = '12px';
        ruleCard.style.alignItems = 'start';
        ruleCard.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.9rem; color:var(--text-main);">
                        <input type="checkbox" id="keyword-enabled-${rule.id}" ${rule.enabled ? 'checked' : ''} onchange="toggleKeywordRuleEnabled('${rule.id}', this.checked)">
                        Bật quy tắc
                    </label>
                    <span style="font-size:0.82rem; color:var(--text-muted);">${rule.type === 'outgoing' ? 'Shop → Kích hoạt' : 'Khách hàng → Auto trả lời'}</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="font-size:0.82rem; color:var(--text-muted);">Từ khóa / cụm từ</label>
                        <input class="chatbot-msg-textarea" id="keyword-${rule.id}" type="text" value="${escapeHtml(rule.keyword || '')}" placeholder="Ví dụ: cảm ơn, /thanks, hoàn tiền" oninput="updateKeywordRuleField('${rule.id}','keyword', this.value)">
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Có thể nhập nhiều từ khóa cách nhau bằng dấu phẩy.</div>
                    </div>
                    <div>
                        <label style="font-size:0.82rem; color:var(--text-muted);">Loại kích hoạt</label>
                        <select class="chatbot-msg-textarea" id="keyword-type-${rule.id}" style="height:42px; padding:10px;" onchange="updateKeywordRuleField('${rule.id}','type', this.value)">
                            <option value="incoming" ${rule.type === 'incoming' ? 'selected' : ''}>Tin nhắn khách hàng</option>
                            <option value="outgoing" ${rule.type === 'outgoing' ? 'selected' : ''}>Tin nhắn shop</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label style="font-size:0.82rem; color:var(--text-muted);">Nội dung trả lời tự động</label>
                        <textarea class="chatbot-msg-textarea" id="keyword-msg-${rule.id}" onfocus="lastFocusedTextarea = this" oninput="updateKeywordRuleField('${rule.id}','message', this.value)" placeholder="Nội dung sẽ gửi khi kích hoạt từ khóa...">${escapeHtml(rule.message || '')}</textarea>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                    <label style="font-size:0.82rem; font-weight:600; color:var(--text-main);">Phương thức gửi:</label>
                        <select id="keyword-send-method-${rule.id}" style="padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-panel); color:var(--text-main); font-family:inherit; font-size:0.86rem;" onchange="updateKeywordRuleField('${rule.id}','send_method', this.value)">
                        <option value="api_smax" ${rule.send_method === 'api_smax' ? 'selected' : ''}>API Smax</option>
                        <option value="robot" ${rule.send_method === 'robot' ? 'selected' : ''}>Robot + copy</option>
                        <option value="both" ${rule.send_method === 'both' ? 'selected' : ''}>Cả hai</option>
                    </select>
                    <button type="button" onclick="deleteKeywordRule('${rule.id}')" style="padding:10px 14px; border:none; border-radius:10px; background:var(--danger); color:#fff; cursor:pointer;">Xóa</button>
                </div>
            </div>
        `;
        container.appendChild(ruleCard);
    });
}

window.addKeywordRule = function() {
    const newRule = {
        id: `kr_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        enabled: true,
        type: 'incoming',
        keyword: '',
        message: '',
        send_method: 'api_smax'
    };
    keywordRules.unshift(newRule);
    persistKeywordRules();
    renderKeywordRules();
};

window.toggleKeywordRuleEnabled = function(id, checked) {
    const rule = keywordRules.find(r => r.id === id);
    if (!rule) return;
    rule.enabled = checked;
    persistKeywordRules();
};

window.updateKeywordRuleField = function(id, field, value) {
    const rule = keywordRules.find(r => r.id === id);
    if (!rule) return;
    if (field === 'type') {
        rule.type = normalizeRuleType(value);
    } else if (field === 'keyword') {
        rule.keyword = value;
    } else if (field === 'message') {
        rule.message = value;
    } else if (field === 'send_method') {
        rule.send_method = normalizeSendMethod(value);
    }
    persistKeywordRules();
};

window.deleteKeywordRule = function(id) {
    keywordRules = keywordRules.filter(r => r.id !== id);
    persistKeywordRules();
    renderKeywordRules();
};

function buildKeywordRuleMessage(rule, thread) {
    if (!rule) return '';
    const displayId = thread?.customer?.display_id || thread?.display_id || thread?.tid || '';
    const customerName = thread?.customer?.name || thread?.name || '';
    return (rule.message || '')
        .replace(/#DISPLAY_ID/g, displayId)
        .replace(/#CUSTOMER_NAME/g, customerName)
        .replace(/#THREAD_ID/g, thread?.tid || '')
        .replace(/#PAGE_ID/g, thread?.page_pid || thread?.pid || '')
        .trim();
}

function getKeywordMatches(text) {
    if (!text) return [];
    const lowerText = text.toLowerCase();
    return keywordRules
        .filter(rule => rule.enabled && normalizeRuleKeywordText(rule.keyword))
        .map(rule => ({ ...rule, terms: normalizeRuleKeywordText(rule.keyword).split(',').map(term => term.trim()).filter(Boolean) }))
        .map(rule => ({ rule, matchedTerm: rule.terms.find(term => lowerText.includes(term.toLowerCase())) }))
        .filter(item => item.matchedTerm);
}

function findMatchingKeywordRule(text, direction) {
    if (!text) return null;
    const lowerText = normalizeRuleKeywordText(text).toLowerCase();
    const candidates = keywordRules
        .filter(rule => {
            const ruleType = (rule.type || 'incoming').toString().trim().toLowerCase();
            return rule.enabled && ruleType === direction && normalizeRuleKeywordText(rule.keyword);
        })
        .map(rule => ({
            rule,
            terms: normalizeRuleKeywordText(rule.keyword).split(',').map(term => term.trim()).filter(Boolean)
        }))
        .map(item => ({
            rule: item.rule,
            matched: item.terms.find(term => lowerText.includes(term.toLowerCase())),
            score: item.terms.reduce((score, term) => {
                if (!term) return score;
                return lowerText.includes(term.toLowerCase()) ? term.length : score;
            }, 0)
        }))
        .filter(item => item.matched);

    console.log('[Chatbot] findMatchingKeywordRule', {
        text: lowerText,
        direction,
        keywordRulesCount: keywordRules.length,
        candidates: candidates.map(c => ({ rule: c.rule, matched: c.matched, score: c.score }))
    });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].rule;
}

async function processOutgoingKeywordTrigger(thread, text) {
    if (!thread || !text) return;
    const matchingRule = findMatchingKeywordRule(text, 'outgoing');
    console.log('[Chatbot] processOutgoingKeywordTrigger', { text, matchingRule });
    if (!matchingRule) return;

    const token = `${thread.tid || thread.id || 'unknown'}::outgoing::${text}`;
    if (!keywordTriggerHistory[token]) keywordTriggerHistory[token] = new Set();
    if (keywordTriggerHistory[token].has(text)) return;
    keywordTriggerHistory[token].add(text);

    await sendKeywordRuleReply(matchingRule, thread, text, null);
}

function getMessageToken(msg) {
    return msg.id || msg.mid || msg.pid || msg.message_id || msg.created_at || JSON.stringify(msg);
}

async function processKeywordTriggersForMessages(thread) {
    if (!thread || !Array.isArray(activeMessages) || activeMessages.length === 0) return;
    const threadKey = thread.tid || thread.id || 'unknown';
    if (!keywordTriggerHistory[threadKey]) {
        keywordTriggerHistory[threadKey] = new Set();
    }

    const incomingRules = keywordRules.filter(rule => rule.enabled && rule.type === 'incoming');
    if (incomingRules.length === 0) return;

    console.log('[Chatbot] processKeywordTriggersForMessages activeMessages length:', activeMessages.length, 'incomingRules:', incomingRules.length);

    for (const msg of activeMessages) {
        const token = getMessageToken(msg);
        if (keywordTriggerHistory[threadKey].has(token)) continue;

        const isCustomer = !msg.is_page_msg && !msg.user_id && msg.sender_pid !== thread.page_pid;
        console.log('[Chatbot] message check', { msg, isCustomer, threadPid: thread.page_pid });

        if (!isCustomer) {
            keywordTriggerHistory[threadKey].add(token);
            continue;
        }

        const text = (msg.message || '').toString().trim();
        if (!text) {
            keywordTriggerHistory[threadKey].add(token);
            continue;
        }

        const matchingRule = findMatchingKeywordRule(text, 'incoming');
        console.log('[Chatbot] incoming rule match', { text, matchingRule });
        if (matchingRule) {
            keywordTriggerHistory[threadKey].add(token);
            await sendKeywordRuleReply(matchingRule, thread, text, msg);
            // Don't break here so multiple keywords in one message can still be handled by different rules
        }
    }
}

async function sendKeywordRuleReply(rule, thread, triggerText, message) {
    if (!rule || !thread) return;
    const replyText = buildKeywordRuleMessage(rule, thread);
    if (!replyText) return;

    const pagePid = thread.page_pid || thread.pid || thread.page_id || selectedPagePid || '';
    const externalLink = await getExternalConversationLinkForTrigger(thread, null);
    const sendMethod = rule.send_method || 'api_smax';

    if (sendMethod === 'robot' || sendMethod === 'both') {
        if (!externalLink) {
            console.warn('[Chatbot] Không tìm thấy đường dẫn hội thoại ngoài cho thread', thread.tid);
        } else {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(replyText);
                } else {
                    fallbackCopyText(replyText);
                }
            } catch (err) {
                console.warn('[Chatbot] Copy robot thất bại:', err);
            }
            showRobotMessageOverlay(replyText, externalLink);
            if (typeof showToast === 'function') showToast(`🤖 Quy tắc từ khóa đã copy nội dung cho hội thoại`, 'success');
        }
    }

    if ((sendMethod === 'api_smax' || sendMethod === 'both') && pagePid && thread.tid) {
        let msgType = 'facebook_message';
        if (pagePid.toString().startsWith('ig')) msgType = 'instagram_message';
        else if (pagePid.toString().startsWith('tt')) msgType = 'tiktokweb_message';
        else if (pagePid.toString().startsWith('zl')) msgType = 'zaloweb_message';

        try {
            const sendRes = await fetch(`https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${pagePid}/threads/${thread.tid}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': smaxToken,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'Origin': 'https://smax.ai',
                    'Referer': 'https://smax.ai/'
                },
                body: JSON.stringify({ type: msgType, messages: [{ message: replyText }] })
            });
            if (sendRes.ok) {
                console.log('[Chatbot] ✅ Gửi tự động theo quy tắc từ khóa cho thread', thread.tid);
            } else {
                console.error('[Chatbot] Lỗi gửi theo quy tắc từ khóa:', await sendRes.text());
            }
        } catch (err) {
            console.error('[Chatbot] Lỗi gửi theo quy tắc từ khóa:', err);
        }
    }
}

// ---------- LOAD LINKED EXTERNAL CONVERSATION LINKS ----------
async function fetchExternalConversationLinkForTid(tid) {
    if (!tid) return null;
    if (linkedCustomersMap.has(tid)) return linkedCustomersMap.get(tid);

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(tid)}&select=external_conversation_link`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const link = data?.[0]?.external_conversation_link || null;
        if (link) linkedCustomersMap.set(tid, link);
        return link;
    } catch (err) {
        console.warn('[Chatbot] Lỗi lấy external conversation link:', err);
        return null;
    }
}

async function getExternalConversationLinkForTrigger(thread, order) {
    let link = null;
    if (thread && thread.tid) link = await fetchExternalConversationLinkForTid(thread.tid);

    if (!link && order?.conversation_link) {
        if (/^https?:\/\//i.test(order.conversation_link)) {
            link = order.conversation_link;
        } else {
            const tidMatch = order.conversation_link.match(/tid=([^&]+)/);
            if (tidMatch) link = await fetchExternalConversationLinkForTid(tidMatch[1]);
        }
    }

    return link;
}

// ---------- LOAD CONFIG FROM SUPABASE ----------
async function loadChatbotConfig() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_scripts?select=*&order=status_id.asc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (!res.ok) throw new Error(await res.text());
        const rows = await res.json();
        chatbotConfig = {};
        rows.forEach(row => {
            chatbotConfig[row.status_id] = {
                enabled:     row.is_enabled === true,
                message:     row.message_template || '',
                status_name: row.status_name || '',
                send_method: row.send_method || 'both',
                updated_at:  row.updated_at || ''
            };
        });
        return true;
    } catch (e) {
        console.error('[Chatbot] Lỗi load config:', e);
        return false;
    }
}

// ---------- RENDER STATUS CARDS ----------
async function renderChatbotStatusList() {
    const container = document.getElementById('chatbotStatusList');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:0.88rem;">
        <div class="spinner" style="margin:0 auto 12px;"></div>Đang tải cấu hình từ Supabase...
    </div>`;

    await loadChatbotConfig();
    container.innerHTML = '';

    // Sort keys
    const statusIds = Object.keys(chatbotConfig).sort((a, b) => parseInt(a) - parseInt(b));

    if (statusIds.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:0.85rem;">
            Chưa có dữ liệu trong bảng <code>chatbot_scripts</code>. Hãy thêm dữ liệu vào Supabase trước.
        </div>`;
        return;
    }

    statusIds.forEach(sid => {
        const cfg = chatbotConfig[sid];
        const statusId = parseInt(sid);
        const label = cfg.status_name || CHATBOT_STATUS_LABELS[sid] || `Trạng thái ${sid}`;

        const card = document.createElement('div');
        card.className = 'chatbot-card' + (cfg.enabled ? ' enabled' : '');
        card.dataset.statusId = sid;
        card.innerHTML = `
            <div class="chatbot-card-header" onclick="toggleChatbotCard('${sid}')">
                <div class="chatbot-status-icon">
                    <i data-lucide="${cfg.enabled ? 'bot' : 'minus-circle'}"></i>
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-weight:700; font-size:0.9rem; color:var(--text-main);">${label}</span>
                        ${cfg.enabled ? '<span class="chatbot-auto-badge">AUTO GỬI</span>' : ''}
                    </div>
                    <div style="font-size:0.76rem; color:var(--text-muted); margin-top:2px;">Pancake Status ID: ${sid}</div>
                </div>
                <label class="chatbot-toggle" onclick="event.stopPropagation()">
                    <input type="checkbox" id="toggle-${sid}" ${cfg.enabled ? 'checked' : ''} onchange="onChatbotToggle('${sid}', this.checked)">
                    <span class="chatbot-toggle-slider"></span>
                </label>
                <i data-lucide="chevron-down" style="width:18px;height:18px;color:var(--text-muted);transition:transform 0.2s;" id="chevron-${sid}"></i>
            </div>
            <div class="chatbot-card-body" id="body-${sid}">
                <div style="font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:8px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                    Nội dung tin nhắn tự động:
                    <span style="font-size:0.75rem; color:var(--text-muted);">(Click macro bên trên để chèn biến)</span>
                </div>
                <textarea class="chatbot-msg-textarea" id="msg-${sid}"
                    placeholder="Nhập nội dung tin nhắn tự động... Dùng #DISPLAY_ID, #CUSTOMER_NAME, v.v."
                    onfocus="lastFocusedTextarea = this">${escapeHtml(cfg.message || '')}</textarea>
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:10px;">
                    <label for="send-method-${sid}" style="font-size:0.82rem; font-weight:600; color:var(--text-main);">Phương thức gửi:</label>
                    <select id="send-method-${sid}" style="padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-panel); color:var(--text-main); font-family:inherit; font-size:0.86rem;">
                        <option value="api_smax" ${cfg.send_method === 'api_smax' ? 'selected' : ''}>Gửi qua API Smax</option>
                        <option value="robot" ${cfg.send_method === 'robot' ? 'selected' : ''}>Robot mở link ngoài + copy nội dung</option>
                        <option value="both" ${cfg.send_method === 'both' ? 'selected' : ''}>Cả hai (API + robot)</option>
                    </select>
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; font-style:italic;">
                    Khi chế độ <strong>robot</strong> được chọn, hệ thống sẽ mở link hội thoại ngoài và copy sẵn nội dung tin nhắn để bạn dán thủ công.
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; font-style:italic;">
                    Khi chế độ <strong>API Smax</strong> được chọn, hệ thống sẽ gửi tin nhắn tự động qua Smax.ai.
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();

    // Update last saved info
    const latestTs = Object.values(chatbotConfig)
        .map(c => c.updated_at).filter(Boolean).sort().reverse()[0];
    const lastSavedEl = document.getElementById('chatbotLastSaved');
    if (lastSavedEl) {
        lastSavedEl.textContent = latestTs
            ? 'Cập nhật lần cuối: ' + new Date(latestTs).toLocaleString('vi-VN')
            : 'Chưa có cập nhật nào.';
    }

    // Render keyword rule section after status cards
    await loadKeywordRules();
    renderKeywordRules();
}

// ---------- TOGGLE CARD EXPAND ----------
window.toggleChatbotCard = function(sid) {
    const body = document.getElementById('body-' + sid);
    const chevron = document.getElementById('chevron-' + sid);
    if (!body) return;
    const isOpen = body.classList.toggle('open');
    if (chevron) chevron.style.transform = isOpen ? 'rotate(180deg)' : '';
    if (isOpen) {
        const ta = document.getElementById('msg-' + sid);
        if (ta) { ta.focus(); lastFocusedTextarea = ta; }
    }
};

// ---------- TOGGLE ENABLE (UI only — saved on "Lưu cấu hình") ----------
window.onChatbotToggle = function(sid, checked) {
    if (!chatbotConfig[sid]) chatbotConfig[sid] = { enabled: false, message: '', status_name: '', send_method: 'api_smax' };
    chatbotConfig[sid].enabled = checked;

    const card = document.querySelector(`.chatbot-card[data-status-id="${sid}"]`);
    if (card) {
        card.classList.toggle('enabled', checked);
        if (checked) {
            const body = document.getElementById('body-' + sid);
            if (body && !body.classList.contains('open')) toggleChatbotCard(sid);
        }
    }
    if (window.lucide) lucide.createIcons();
};

// ---------- INSERT MACRO ----------
window.insertMacro = function(macro) {
    if (!lastFocusedTextarea) {
        if (typeof showToast === 'function') showToast('Hãy click vào ô soạn tin nhắn trước!', 'info');
        return;
    }
    const ta = lastFocusedTextarea;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    ta.value = ta.value.slice(0, start) + macro + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + macro.length;
    ta.focus();
};

// ---------- SAVE CONFIG TO SUPABASE ----------
window.saveChatbotConfig = async function() {
    const btn = document.getElementById('btnSaveChatbotConfig');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

    try {
        // Collect current values from DOM
        const updates = [];
        Object.keys(chatbotConfig).forEach(sid => {
            const toggle   = document.getElementById('toggle-' + sid);
            const textarea = document.getElementById('msg-' + sid);
            const select   = document.getElementById('send-method-' + sid);
            const statusName = chatbotConfig[sid]?.status_name || CHATBOT_STATUS_LABELS[sid] || `Trạng thái ${sid}`;
            updates.push({
                status_id:        parseInt(sid),
                is_enabled:       toggle ? toggle.checked : chatbotConfig[sid].enabled,
                message_template: textarea ? textarea.value.trim() : (chatbotConfig[sid].message || ''),
                status_name:      statusName,
                send_method:      select ? select.value : (chatbotConfig[sid].send_method || 'api_smax'),
                updated_at:       new Date().toISOString()
            });
        });

        // UPSERT to Supabase chatbot_scripts
        const res = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_scripts`, {
            method: 'POST',
            headers: {
                'apikey':        SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type':  'application/json',
                'Prefer':        'resolution=merge-duplicates'
            },
            body: JSON.stringify(updates)
        });

        if (!res.ok) throw new Error(await res.text());

        // Update local cache
        updates.forEach(u => {
            if (chatbotConfig[u.status_id]) {
                chatbotConfig[u.status_id].enabled    = u.is_enabled;
                chatbotConfig[u.status_id].message    = u.message_template;
                chatbotConfig[u.status_id].send_method = u.send_method;
                chatbotConfig[u.status_id].updated_at = u.updated_at;
            }
        });

        // Also persist keyword rules if any exist
        try {
            await saveKeywordRulesToSupabase();
            saveKeywordRulesToStorage();
        } catch (kwErr) {
            console.warn('[Chatbot] Không thể lưu quy tắc từ khóa lên Supabase:', kwErr);
            if (typeof showToast === 'function') showToast('Lưu cấu hình thành công, nhưng không lưu được quy tắc từ khóa.', 'warning');
        }

        const lastSavedEl = document.getElementById('chatbotLastSaved');
        if (lastSavedEl) lastSavedEl.textContent = 'Đã lưu lúc: ' + new Date().toLocaleString('vi-VN');

        if (typeof showToast === 'function') showToast('✅ Đã lưu cấu hình Chatbot lên Supabase!', 'success');
    } catch (e) {
        console.error('[Chatbot] Lỗi lưu config:', e);
        if (typeof showToast === 'function') showToast('Lỗi lưu cấu hình: ' + e.message, 'error');
        else alert('Lỗi lưu cấu hình: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }
};

// ---------- PROCESS CHATBOT TRIGGER ----------
window.processChatbotTrigger = async function(orderId, newStatusId) {
    // Use cached config; if empty reload from Supabase
    if (Object.keys(chatbotConfig).length === 0) await loadChatbotConfig();

    const statusKey = String(newStatusId);
    const parsedStatus = parseInt(newStatusId, 10);
    const statusCode = Number.isNaN(parsedStatus) ? getStatusCodeFromText(newStatusId) : parsedStatus;
    const cfg = chatbotConfig[statusKey] || chatbotConfig[parsedStatus] || chatbotConfig[statusCode];

    console.log('[Chatbot] Trigger order:', orderId, 'status:', newStatusId, 'resolvedStatusCode:', statusCode, 'cfgFound:', !!cfg);
    if (!cfg || !cfg.enabled || !cfg.message) {
        if (!cfg) console.warn('[Chatbot] Không tìm thấy cấu hình chatbot cho trạng thái:', newStatusId);
        return;
    }
    const sendMethod = cfg.send_method || 'api_smax';

    try {
        // Fetch order from Supabase, including nested order items for macros like #PRODUCTS
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}&select=*,items:pancake_order_items(*)`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) return;
        const [order] = await res.json();
        if (!order) return;

        let rawOrderItems = Array.isArray(order.items) ? order.items : [];
        if (!rawOrderItems.length && Array.isArray(order.pancake_order_items)) {
            rawOrderItems = order.pancake_order_items;
        }

        const shippingAddr  = order.shipping_address || {};
        const fullAddress   = shippingAddr.full_address || shippingAddr.address || '';
        const receiverName  = shippingAddr.name || order.bill_full_name || '';
        const receiverPhone = shippingAddr.phone || shippingAddr.phone_number || order.bill_phone_number || '';
        const displayId     = order.display_id || order.id || '';
        const orderTotal    = (order.total_amount || order.total || 0).toLocaleString('vi-VN') + 'đ';
        const remaining     = (order.cod || order.remaining || 0).toLocaleString('vi-VN') + 'đ';
        const linkBillId    = order.display_id || order.id;
        const linkBill      = `${window.location.origin}/bill.html?id=${linkBillId}`;
        const jtWaybillId   = order.jt_waybill_id || '';

        const productsText = rawOrderItems
            .map(item => {
                const productName = item.product_name || item.name || '';
                const quantity = Number(item.quantity || item.qty || 0);
                return productName ? (quantity > 0 ? `${productName} x${quantity}` : productName) : '';
            })
            .filter(Boolean)
            .join(', ');

        let msgText = cfg.message
            .replace(/#DISPLAY_ID/g,    displayId)
            .replace(/#CUSTOMER_NAME/g, order.bill_full_name || '')
            .replace(/#LINKBILL/g,      linkBill)
            .replace(/#RECEIVER_NAME/g, receiverName)
            .replace(/#RECEIVER_PHONE/g,receiverPhone)
            .replace(/#FULL_ADDRESS/g,  fullAddress)
            .replace(/#ORDER_TOTAL/g,   orderTotal)
            .replace(/#REMAINING/g,     remaining)
            .replace(/#PRODUCTS/g,      productsText)
            .replace(/#JT_WAYBILL_ID/g, jtWaybillId);

        // Determine target thread and external link for robot mode
        const convId = order.conversation_id || '';
        let tid = convId;
        if (!tid && order.conversation_link) {
            const tidMatch = order.conversation_link.match(/tid=([^&]+)/);
            if (tidMatch) tid = tidMatch[1];
        }

        let thread = null;
        if (tid) {
            thread = smaxThreads.find(t =>
                t.tid === tid ||
                t.conversation_id === tid ||
                t.id === tid ||
                t.thread_id === tid
            );
        }

        if (!thread && order.conversation_link) {
            const linkTidMatch = order.conversation_link.match(/tid=([^&]+)/);
            const linkPidMatch = order.conversation_link.match(/pid=([^&]+)/);
            const fallbackTid = linkTidMatch ? linkTidMatch[1] : '';
            const fallbackPagePid = linkPidMatch ? linkPidMatch[1] : (order.page_id || order.page_pid || '');
            if (fallbackTid) {
                thread = { tid: fallbackTid, page_pid: fallbackPagePid, pid: fallbackPagePid };
            }
        }

        const externalLink = await getExternalConversationLinkForTrigger(thread, order);

        if (sendMethod === 'robot' || sendMethod === 'both') {
            if (!externalLink) {
                const warningMsg = `Không tìm được đường dẫn hội thoại ngoài cho đơn ${displayId}. Nội dung đã được sao chép để dán thủ công.`;
                console.warn('[Chatbot] ' + warningMsg);
                if (typeof showToast === 'function') showToast(warningMsg, 'warning');
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(msgText);
                    } else if (typeof copyToClipboard === 'function') {
                        copyToClipboard(msgText);
                    }
                } catch (err) {
                    console.warn('[Chatbot] Copy nội dung tự động thất bại:', err);
                    if (typeof showToast === 'function') {
                        showToast('⚠️ Không thể copy nội dung tự động. Vui lòng copy thủ công bên dưới.', 'warning');
                    }
                }
                showRobotMessageOverlay(msgText, externalLink);
                if (sendMethod === 'robot') {
                    return;
                }
            } else {
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(msgText);
                    } else if (typeof copyToClipboard === 'function') {
                        copyToClipboard(msgText);
                    }
                    if (typeof showToast === 'function') {
                        showToast(`🤖 Robot đã copy nội dung tin nhắn cho đơn #${displayId}`, 'success');
                    }
                } catch (err) {
                    console.warn('[Chatbot] Copy nội dung tự động thất bại:', err);
                    if (typeof showToast === 'function') {
                        showToast('⚠️ Không thể copy nội dung tự động. Vui lòng copy thủ công bên dưới.', 'warning');
                    }
                }
                showRobotMessageOverlay(msgText, externalLink);
            }
        }

        if (sendMethod === 'api_smax' || sendMethod === 'both') {
            if (!thread) {
                console.warn('[Chatbot] Không tìm thấy thread Smax để gửi API cho đơn:', displayId);
                return;
            }

            const pagePid = thread.page_pid || thread.pid || '';
            if (!pagePid) return;

            let msgType = 'facebook_message';
            if (pagePid.toString().startsWith('ig')) msgType = 'instagram_message';
            else if (pagePid.toString().startsWith('tt')) msgType = 'tiktokweb_message';
            else if (pagePid.toString().startsWith('zl')) msgType = 'zaloweb_message';

            const sendRes = await fetch(
                `https://api.smax.ai/bizs/${SMAX_BIZ_ID}/pages/${pagePid}/threads/${thread.tid}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': smaxToken,
                        'Content-Type':  'application/json',
                        'Accept':        'application/json, text/plain, */*',
                        'Origin':        'https://smax.ai',
                        'Referer':       'https://smax.ai/'
                    },
                    body: JSON.stringify({ type: msgType, messages: [{ message: msgText }] })
                }
            );

            if (sendRes.ok) {
                console.log('[Chatbot] ✅ Gửi thành công cho đơn', displayId);
                if (typeof showToast === 'function')
                    showToast(`🤖 Chatbot đã gửi tin nhắn cho đơn #${displayId}`, 'success');
            } else {
                console.error('[Chatbot] Lỗi gửi:', await sendRes.text());
            }
        }
    } catch (e) {
        console.error('[Chatbot] Lỗi trigger:', e);
    }
};

// ---------- INIT: render when chatbot tab clicked ----------
document.addEventListener('DOMContentLoaded', () => {
    const btns = document.querySelectorAll('[data-target="chatbot-tab-content"]');
    if (btns.length) {
        btns.forEach(btn => btn.addEventListener('click', () => setTimeout(renderChatbotStatusList, 50)));
    }
});
// ---------- Giao diện đơn hàng liên kết chat ----------
window.goToOrderChat = function(convLink, event) {
    if (event) event.stopPropagation();
    if (!convLink) {
        showToast('Đơn hàng này không có liên kết hội thoại chat!', 'error');
        return;
    }
    // Trích xuất hash path từ link, loại bỏ tiền tố slash nếu có
    let hashPath = convLink;
    if (hashPath.includes('#')) {
        hashPath = hashPath.substring(hashPath.indexOf('#'));
    }
    window.location.hash = hashPath;
};

// =====================================================
// PAYMENT HISTORY (Lịch sử giao dịch) - Pancake POS
// =====================================================
function setupPaymentHistory() {
    // Pancake POS credentials (dùng từ biến const ở đầu file nếu có, hoặc define local)
    const SHOP_ID = (typeof PANCAKE_SHOP_ID !== 'undefined') ? PANCAKE_SHOP_ID : '1290216404';
    const getToken = () => (typeof PANCAKE_ACCESS_TOKEN !== 'undefined' && PANCAKE_ACCESS_TOKEN)
        ? PANCAKE_ACCESS_TOKEN
        : (window.PANCAKE_ACCESS_TOKEN || '');

    let currentPage = 1;
    let totalPages = 1;
    let isLoading = false;
    let currentSearch = '';
    let searchDebounceTimer;

    const modal        = document.getElementById('paymentHistoryModal');
    const openBtn      = document.getElementById('btnOpenPaymentHistory');
    const openBtnOrders = document.getElementById('btnOpenPaymentHistoryOrders');
    const closeBtn     = document.getElementById('closePaymentHistory');
    const refreshBtn   = document.getElementById('refreshPaymentHistory');
    const prevBtn      = document.getElementById('prevPaymentPage');
    const nextBtn      = document.getElementById('nextPaymentPage');
    const tbody        = document.getElementById('paymentHistoryTableBody');
    const loadingEl    = document.getElementById('paymentLoading');
    const currentPageEl = document.getElementById('paymentCurrentPage');
    const totalPagesEl  = document.getElementById('paymentTotalPages');
    const searchInput  = document.getElementById('paymentHistorySearch');

    if (!modal) { console.warn('paymentHistoryModal not found'); return; }

    // ── Open Modal ──
    function openModal() {
        modal.style.display = 'flex';
        if (searchInput) searchInput.value = '';
        currentSearch = '';
        fetchPaymentHistory(1);
    }

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (openBtnOrders) openBtnOrders.addEventListener('click', openModal);

    // ── Close Modal ──
    if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

    // ── Refresh ──
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (currentSearch) searchAllPaymentHistory(currentSearch);
            else fetchPaymentHistory(currentPage);
        });
    }

    // ── Pagination ──
    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentPage > 1 && !isLoading) fetchPaymentHistory(currentPage - 1);
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages && !isLoading) fetchPaymentHistory(currentPage + 1);
    });

    // ── Search ──
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.trim();
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                if (currentSearch) searchAllPaymentHistory(currentSearch);
                else fetchPaymentHistory(1);
            }, 600);
        });
    }

    // ── Fetch (paginated) ──
    async function fetchPaymentHistory(page = 1) {
        if (isLoading) return;
        isLoading = true;
        tbody.innerHTML = '';
        if (loadingEl) { loadingEl.style.display = 'inline'; loadingEl.textContent = 'Đang tải...'; }
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;

        try {
            const token = getToken();
            if (!token) {
                // Thử sync token từ Supabase trước
                if (typeof fetchPancakeTokenFromSupabase === 'function') {
                    await fetchPancakeTokenFromSupabase();
                }
            }
            const now = new Date();
            const startTime = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000);
            const endTime   = Math.floor(now.getTime() / 1000) + 86400;
            const t = getToken();

            const url = `https://pos.pancake.vn/api/v1/shops/${SHOP_ID}/payment_accounts/get_payment_histories?access_token=${t}&page=${page}&page_size=20&startDate=${startTime}&endDate=${endTime}&pageSize=20`;
            const res  = await fetch(url);
            const data = await res.json();

            if (data.success && data.data) {
                currentPage = data.page_number || page;
                totalPages  = data.total_pages || 1;
                if (currentPageEl) currentPageEl.textContent = currentPage;
                if (totalPagesEl)  totalPagesEl.textContent  = `/ ${totalPages}`;
                renderPaymentHistory(data.data);
            } else {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--danger);">Lỗi tải dữ liệu hoặc token hết hạn. (${data.message || ''})</td></tr>`;
            }
        } catch (err) {
            console.error('Fetch Payment History Error:', err);
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--danger);">Lỗi kết nối: ${err.message}</td></tr>`;
        } finally {
            isLoading = false;
            if (loadingEl) loadingEl.style.display = 'none';
            if (prevBtn) prevBtn.disabled = currentPage <= 1;
            if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
        }
    }

    // ── Search all pages ──
    async function searchAllPaymentHistory(keyword) {
        if (isLoading) return;
        isLoading = true;
        tbody.innerHTML = '';
        if (loadingEl) { loadingEl.style.display = 'inline'; loadingEl.textContent = 'Đang tìm kiếm...'; }
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        if (currentPageEl) currentPageEl.textContent = '-';
        if (totalPagesEl)  totalPagesEl.textContent  = '';

        try {
            const now = new Date();
            const startTime = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000);
            const endTime   = Math.floor(now.getTime() / 1000) + 86400;
            const t = getToken();

            let allResults = [], page = 1, hasNext = true;
            while (hasNext && page <= 25) {
                const url = `https://pos.pancake.vn/api/v1/shops/${SHOP_ID}/payment_accounts/get_payment_histories?access_token=${t}&page=${page}&page_size=30&startDate=${startTime}&endDate=${endTime}&pageSize=30&search=${encodeURIComponent(keyword)}`;
                const res  = await fetch(url);
                const data = await res.json();
                if (data.success && data.data && data.data.length > 0) {
                    allResults = [...allResults, ...data.data];
                    if (data.page_number >= data.total_pages || data.data.length < 30) hasNext = false;
                    else page++;
                } else hasNext = false;
            }

            if (allResults.length > 0) renderPaymentHistory(allResults);
            else tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">Không tìm thấy kết quả nào</td></tr>`;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--danger);">Lỗi: ${err.message}</td></tr>`;
        } finally {
            isLoading = false;
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }

    // ── Render rows ──
    function renderPaymentHistory(transactions) {
        tbody.innerHTML = '';
        if (!transactions || transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Không có giao dịch nào</td></tr>`;
            return;
        }

        transactions.forEach(trans => {
            const row = document.createElement('tr');
            row.style.cssText = 'border-bottom:1px solid var(--border);transition:background 0.12s;';
            row.onmouseenter = () => row.style.background = 'var(--bg-card)';
            row.onmouseleave = () => row.style.background = '';

            // Date/time
            const raw = trans.date || trans.inserted_at;
            let dateDsp = '---', timeDsp = '';
            if (raw) {
                const d = new Date(raw);
                d.setHours(d.getHours() + 7);
                dateDsp = d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
                timeDsp = d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
            }

            // Amount
            const amount  = trans.amount || 0;
            const amtStr  = new Intl.NumberFormat('vi-VN').format(amount) + '₫';
            const isPlus  = amount > 0;
            const amtColor = isPlus ? '#10b981' : '#ef4444';

            // Content
            const content = trans.payment_content || trans.note || '---';

            // Match status
            let matchHtml = '';
            if (trans.order) {
                const oid  = trans.order.custom_id || trans.order.display_id || trans.order.id;
                const name = trans.order.name || '';
                matchHtml  = `<div style="display:flex;flex-direction:column;gap:2px;">
                    <span style="color:#10b981;font-weight:700;font-size:0.8rem;padding:2px 6px;background:#ecfdf5;border-radius:4px;width:fit-content;">#${oid}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted);">${name}</span>
                </div>`;
            } else if (trans.shop_transaction && trans.shop_transaction.name) {
                matchHtml = `<span style="color:#10b981;font-size:0.8rem;">${trans.shop_transaction.name}</span>`;
            } else {
                matchHtml = `<button class="btn-match-order" data-id="${trans.id}" style="padding:4px 10px;font-size:0.75rem;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer;white-space:nowrap;">Khớp đơn</button>`;
            }

            row.innerHTML = `
                <td style="padding:10px 16px;vertical-align:top;">
                    <div style="font-weight:600;font-size:0.82rem;color:var(--text-main);">${dateDsp}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted);">${timeDsp}</div>
                </td>
                <td style="padding:10px 16px;text-align:right;vertical-align:top;font-weight:700;color:${amtColor};font-size:0.88rem;">
                    ${isPlus ? '+' : ''}${amtStr}
                </td>
                <td style="padding:10px 16px;vertical-align:top;font-size:0.82rem;color:var(--text-main);line-height:1.5;word-break:break-word;">
                    ${content}
                </td>
                <td style="padding:10px 16px;vertical-align:top;text-align:center;">
                    ${matchHtml}
                </td>
            `;
            tbody.appendChild(row);
        });

        // Event delegation cho nút Khớp đơn
        if (!tbody.hasAttribute('data-match-listener')) {
            tbody.setAttribute('data-match-listener', 'true');
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-match-order');
                if (btn) openMatchModal(btn.getAttribute('data-id'));
            });
        }
    }

    // ── Match Order Modal ──
    let currentMatchTransId = null;
    let selectedOrderForMatch = null;
    let matchDebounceTimer;

    const matchModal      = document.getElementById('matchOrderModal');
    const matchInput      = document.getElementById('matchOrderInput');
    const matchResult     = document.getElementById('matchOrderResult');
    const confirmMatchBtn = document.getElementById('confirmMatchBtn');
    const closeMatchBtn   = document.getElementById('closeMatchModal');

    function openMatchModal(transId) {
        currentMatchTransId = transId;
        selectedOrderForMatch = null;
        if (matchModal) matchModal.style.display = 'flex';
        if (matchInput) { matchInput.value = ''; matchInput.focus(); }
        if (matchResult) matchResult.innerHTML = '';
        if (confirmMatchBtn) confirmMatchBtn.disabled = true;
    }

    if (closeMatchBtn) closeMatchBtn.addEventListener('click', () => { if (matchModal) matchModal.style.display = 'none'; });
    if (matchModal) matchModal.addEventListener('click', (e) => { if (e.target === matchModal) matchModal.style.display = 'none'; });

    if (matchInput) {
        matchInput.addEventListener('input', (e) => {
            const q = e.target.value.trim();
            if (confirmMatchBtn) confirmMatchBtn.disabled = true;
            clearTimeout(matchDebounceTimer);
            if (q.length < 2) { if (matchResult) matchResult.innerHTML = ''; return; }
            if (matchResult) matchResult.innerHTML = '<div style="padding:8px;font-size:0.8rem;color:var(--text-muted);">Đang tìm...</div>';
            matchDebounceTimer = setTimeout(async () => {
                try {
                    const t   = getToken();
                    const url = `https://pos.pancake.vn/api/v1/shops/${SHOP_ID}/orders?access_token=${t}&page=1&page_size=30&es_only=true&option_sort=inserted_at_desc&search=${encodeURIComponent(q)}`;
                    const res = await fetch(url);
                    const data = await res.json();
                    let orders = [];
                    if (data.success && data.data && data.data.length > 0) orders = data.data;
                    else if (data.data && Array.isArray(data.data)) orders = data.data;

                    if (orders.length > 0 && matchResult) {
                        matchResult.innerHTML = '';
                        orders.forEach(order => {
                            let numId = null;
                            if (order.order_link) {
                                try { const u = new URL(order.order_link); numId = parseInt(u.searchParams.get('order_id')); } catch {}
                            }
                            if (!numId) numId = order.id;
                            const dId  = order.custom_id || order.display_id || order.id;
                            const name = order.bill_full_name || order.shipping_address?.full_name || order.customer?.name || '---';
                            const div  = document.createElement('div');
                            div.style.cssText = 'padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:0.83rem;transition:background 0.1s;';
                            div.onmouseenter = () => div.style.background = 'var(--bg-card)';
                            div.onmouseleave = () => div.style.background = '';
                            div.innerHTML = `<strong style="color:var(--primary);">#${dId}</strong> · ${name}`;
                            div.addEventListener('click', () => {
                                selectedOrderForMatch = numId;
                                if (matchInput) matchInput.value = `#${dId} – ${name}`;
                                if (matchResult) matchResult.innerHTML = '';
                                if (confirmMatchBtn) confirmMatchBtn.disabled = false;
                            });
                            matchResult.appendChild(div);
                        });
                    } else {
                        if (matchResult) matchResult.innerHTML = '<div style="padding:8px;color:var(--danger);font-size:0.8rem;">Không tìm thấy đơn hàng</div>';
                    }
                } catch (err) {
                    if (matchResult) matchResult.innerHTML = `<div style="padding:8px;color:var(--danger);font-size:0.8rem;">Lỗi: ${err.message}</div>`;
                }
            }, 500);
        });
    }

    if (confirmMatchBtn) {
        confirmMatchBtn.addEventListener('click', async () => {
            if (!currentMatchTransId || !selectedOrderForMatch) return;
            confirmMatchBtn.textContent = 'Đang xử lý...';
            confirmMatchBtn.disabled = true;
            try {
                const t = getToken();
                const payload = {
                    payment_history_id: parseInt(currentMatchTransId),
                    order_id: parseInt(selectedOrderForMatch)
                };
                const url = `https://pos.pancake.vn/api/v1/shops/${SHOP_ID}/payment_accounts/linked_order?access_token=${t}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                if (result.success) {
                    showToast('✅ Khớp đơn thành công!', 'success');
                    if (matchModal) matchModal.style.display = 'none';
                    if (currentSearch) searchAllPaymentHistory(currentSearch);
                    else fetchPaymentHistory(currentPage);
                } else {
                    showToast('Lỗi: ' + (result.message || 'Không thể khớp đơn'), 'error');
                }
            } catch (err) {
                showToast('Lỗi kết nối: ' + err.message, 'error');
            } finally {
                confirmMatchBtn.textContent = 'Khớp đơn';
                confirmMatchBtn.disabled = false;
            }
        });
    }

    // Expose for external call
    window.fetchPaymentHistory = fetchPaymentHistory;
    window.searchAllPaymentHistory = searchAllPaymentHistory;
    window.openPaymentHistoryModal = openModal;
}

// Khởi tạo khi DOM ready (append vào DOMContentLoaded listener chính)
document.addEventListener('DOMContentLoaded', () => {
    setupPaymentHistory();

    // Mobile Hamburger Menu logic
    const menuBtn = document.getElementById('mobileMenuBtn');
    const dropdown = document.getElementById('mobileDropdownMenu');
    if (menuBtn && dropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isFlex = dropdown.style.display === 'flex';
            dropdown.style.display = isFlex ? 'none' : 'flex';
        });

        // Close dropdown when any menu item is clicked
        dropdown.querySelectorAll('.tab-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dropdown.style.display = 'none';
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }
});

window.loadAndRenderSideRealImages = async function(orderId, displayId) {
    const side = document.getElementById('side-real-images-container');
    if (!side) return;
    side.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);">Đang tải...</div>';
    const normalizedOrderId = normalizeOrderId(displayId || orderId) || (displayId || orderId);
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_images?order_id=eq.${encodeURIComponent(normalizedOrderId)}`, {headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}});
        const rows = res.ok ? await res.json() : []; const row = rows[0] || null; side._chatbotImageRow = row;
        let images = row && Array.isArray(row.hinhanh) ? row.hinhanh : [];
        side.innerHTML = images.length ? images.map((img,idx)=>`<div style="position:relative;width:50px;height:50px;border-radius:6px;border:1px solid var(--border);overflow:hidden;"><img src="${img}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="window.viewFullImage('${img}')"><button type="button" onclick="window.deleteSideRealImage(${idx},event)" style="position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#ef4444;color:#fff;border:0;padding:0;font-size:9px;">✕</button></div>`).join('') : '<div style="font-size:0.75rem;color:var(--text-muted);">Chưa có ảnh</div>';
    } catch(e) { side.innerHTML='<div style="font-size:0.75rem;color:var(--danger);">Lỗi tải ảnh</div>'; }
};
window.triggerSideRealImageUpload = function(e){ if(e)e.stopPropagation(); document.getElementById('side-real-image-input')?.click(); };
window.handleSideRealImageUpload = async function(e){ if(e)e.stopPropagation(); const input=e.target,file=input.files?.[0]; if(!file||!_sideEditOrderId)return; const temp=document.createElement('input'); temp.type='file'; const dt=new DataTransfer();dt.items.add(file);temp.files=dt.files; const fake={target:temp,stopPropagation(){}}; const proxyId='side-real-proxy-'+_sideEditOrderId; const side=document.getElementById('side-real-images-container'); side.id='real-images-container-'+_sideEditOrderId; try{await window.handleRealImageUpload(_sideEditOrderId,fake);}finally{side.id='side-real-images-container';window.loadAndRenderSideRealImages(_sideEditOrderId,document.getElementById('sideOrderEditModalTitle')?.textContent.match(/#(\S+)/)?.[1]||_sideEditOrderId);input.value='';}};
window.deleteSideRealImage = async function(index,e){if(e)e.stopPropagation();const side=document.getElementById('side-real-images-container');const row=side?._chatbotImageRow;if(!row||!confirm('Bạn có chắc chắn muốn xóa ảnh này không?'))return;let images=Array.isArray(row.hinhanh)?[...row.hinhanh]:[];images.splice(index,1);const res=await fetch(`${SUPABASE_URL}/rest/v1/chatbot_images?id=eq.${row.id}`,{method:'PATCH',headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({hinhanh:images})});if(res.ok)window.loadAndRenderSideRealImages(_sideEditOrderId,row.order_id);};

// ================================================================
// REAL PRODUCT IMAGES (chatbot_images table in Supabase)
// ================================================================
function normalizeOrderId(value) {
    if (value === undefined || value === null) return '';
    const str = value.toString().trim();
    const match = str.match(/\d+$/);
    return match ? match[0] : str;
}

window.loadAndRenderRealImages = async function(orderId, displayId) {
    const container = document.getElementById(`real-images-container-${orderId}`);
    if (!container) return;

    container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted);">🔄 Đang tải...</div>';

    try {
        const queryVal = displayId || orderId;
        const normalizedOrderId = normalizeOrderId(queryVal) || queryVal;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_images?order_id=eq.${encodeURIComponent(normalizedOrderId)}`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
                const row = data[0];
                container._chatbotImageRow = row;
                
                let images = [];
                if (Array.isArray(row.hinhanh)) {
                    images = row.hinhanh;
                } else if (typeof row.hinhanh === 'string') {
                    if (row.hinhanh.startsWith('{') && row.hinhanh.endsWith('}')) {
                        images = row.hinhanh.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(s => s);
                    } else {
                        images = [row.hinhanh];
                    }
                }
                
                if (images.length > 0) {
                    container.innerHTML = images.map((img, idx) => `
                        <div style="position:relative; width:50px; height:50px; border-radius:6px; border:1px solid var(--border); overflow:hidden;">
                            <img src="${img}" style="width:100%; height:100%; object-fit:cover; cursor:pointer;" onclick="window.viewFullImage('${img}')">
                            <button type="button" onclick="window.deleteRealImage('${orderId}', ${idx}, event)" style="position:absolute; top:2px; right:2px; width:14px; height:14px; border-radius:50%; background:rgba(239,68,68,0.9); color:#fff; border:none; display:flex; align-items:center; justify-content:center; font-size:9px; cursor:pointer; padding:0;">✕</button>
                        </div>
                    `).join('');
                } else {
                    container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); line-height:24px;">Chưa có ảnh</div>';
                }
            } else {
                container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); line-height:24px;">Chưa có ảnh</div>';
            }
        } else {
            container.innerHTML = '<div style="font-size:0.75rem; color:var(--danger); line-height:24px;">Lỗi tải ảnh</div>';
        }
    } catch (e) {
        console.error('Error loading real images:', e);
        container.innerHTML = '<div style="font-size:0.75rem; color:var(--danger); line-height:24px;">Lỗi kết nối</div>';
    }
};

window.deleteRealImage = async function(orderId, index, event) {
    if (event) event.stopPropagation();
    
    const container = document.getElementById(`real-images-container-${orderId}`);
    if (!container || !container._chatbotImageRow) return;

    if (!confirm('Bạn có chắc chắn muốn xóa ảnh này không?')) return;

    const row = container._chatbotImageRow;
    let images = Array.isArray(row.hinhanh) ? [...row.hinhanh] : [];
    images.splice(index, 1);

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_images?id=eq.${row.id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hinhanh: images
            })
        });

        if (res.ok) {
            const displayId = row.order_id;
            window.loadAndRenderRealImages(orderId, displayId);
        } else {
            alert('Lỗi xóa ảnh!');
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối xóa ảnh!');
    }
};

window.triggerRealImageUpload = function(orderId, event) {
    if (event) event.stopPropagation();
    const fileInput = document.getElementById(`real-image-input-${orderId}`);
    if (fileInput) fileInput.click();
};

window.handleRealImageUpload = async function(orderId, event) {
    if (event) event.stopPropagation();
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    const container = document.getElementById(`real-images-container-${orderId}`);
    if (!container) return;

    const originalHtml = container.innerHTML;
    container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); line-height:24px;">📤 Đang tải...</div>';

    try {
        // 1. Upload to Pancake
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) throw new Error('Upload to Pancake POS failed');
        const uploadData = await uploadRes.json();
        const imageUrl = uploadData.content_url || uploadData.url;
        if (!imageUrl) throw new Error('Không lấy được link ảnh từ Pancake');

        // 2. Fetch order details for name & display ID
        const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}&select=bill_full_name,display_id`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (!orderRes.ok) {
            const errorText = await orderRes.text();
            throw new Error(`Không thể tải thông tin đơn hàng: ${orderRes.status} ${errorText}`);
        }
        const orders = await orderRes.json();
        if (!orders || orders.length === 0) throw new Error('Không tìm thấy đơn hàng');
        const order = orders[0];
        
        const displayId = order.display_id || orderId;
        const customerName = order.bill_full_name || 'Khách nhận';
        const normalizedDisplayId = normalizeOrderId(displayId) || displayId;

        const row = container._chatbotImageRow;
        if (row) {
            let images = Array.isArray(row.hinhanh) ? [...row.hinhanh] : [];
            images.push(imageUrl);

            const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_images?id=eq.${row.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    hinhanh: images
                })
            });

            if (saveRes.ok) {
                window.loadAndRenderRealImages(orderId, normalizedDisplayId);
            } else {
                const saveText = await saveRes.text();
                throw new Error(`Lưu vào Database thất bại: ${saveRes.status} ${saveText}`);
            }
        } else {
            // Race-safe: check if a row for this order_id already exists before attempting insert
            const checkUrl = `${SUPABASE_URL}/rest/v1/chatbot_images?order_id=eq.${encodeURIComponent(normalizedDisplayId)}&select=id,hinhanh&limit=1`;
            let existingRow = null;
            try {
                const checkRes = await fetch(checkUrl, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                if (checkRes.ok) {
                    const arr = await checkRes.json();
                    if (Array.isArray(arr) && arr.length > 0) existingRow = arr[0];
                }
            } catch (e) {
                console.warn('check existing chatbot_images failed', e);
            }

            if (existingRow && existingRow.id) {
                // Merge into existing row
                const mergedImages = Array.isArray(existingRow.hinhanh) ? Array.from(new Set([...(existingRow.hinhanh || []), imageUrl])) : [imageUrl];
                const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_images?id=eq.${existingRow.id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ hinhanh: mergedImages })
                });
                if (patchRes.ok) {
                    window.loadAndRenderRealImages(orderId, normalizedDisplayId);
                } else {
                    const txt = await patchRes.text();
                    throw new Error(`Lưu vào Database thất bại (patch): ${patchRes.status} ${txt}`);
                }
            } else {
                // No existing row -> insert (use on_conflict as extra safety)
                const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/chatbot_images?on_conflict=order_id`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        order_id: normalizedDisplayId.toString(),
                        customer_name: customerName,
                        hinhanh: [imageUrl],
                        processed: true,
                        status_id: 11
                    })
                });

                if (insertRes.ok) {
                    window.loadAndRenderRealImages(orderId, normalizedDisplayId);
                } else {
                    const insertText = await insertRes.text();
                    throw new Error(`Lưu vào Database thất bại (insert): ${insertRes.status} ${insertText}`);
                }
            }
        }
        
    } catch (err) {
        console.error('Real image upload error:', err);
        alert('Lỗi tải ảnh lên: ' + err.message);
        container.innerHTML = originalHtml;
    } finally {
        fileInput.value = '';
    }
};


// ================================================================
// NOTE IMAGES (note_image jsonb array in pancake_orders)
// ================================================================
window.loadAndRenderNoteImages = function(orderId, noteImages) {
    const container = document.getElementById(`note-images-container-${orderId}`);
    if (!container) return;

    let images = [];
    if (Array.isArray(noteImages)) {
        images = noteImages;
    } else if (typeof noteImages === 'string') {
        if (noteImages.startsWith('{') && noteImages.endsWith('}')) {
            images = noteImages.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(s => s);
        } else {
            images = [noteImages];
        }
    } else if (noteImages && typeof noteImages === 'object') {
        images = Object.values(noteImages).filter(s => typeof s === 'string');
    }

    container._noteImages = images;

    if (images.length > 0) {
        container.innerHTML = images.map((img, idx) => `
            <div style="position:relative; width:50px; height:50px; border-radius:6px; border:1px solid var(--border); overflow:hidden;">
                <img src="${img}" style="width:100%; height:100%; object-fit:cover; cursor:pointer;" onclick="window.viewFullImage('${img}')">
                <button type="button" onclick="window.deleteNoteImage('${orderId}', ${idx}, event)" style="position:absolute; top:2px; right:2px; width:14px; height:14px; border-radius:50%; background:rgba(239,68,68,0.9); color:#fff; border:none; display:flex; align-items:center; justify-content:center; font-size:9px; cursor:pointer; padding:0;">✕</button>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); line-height:24px;">Chưa có ảnh ghi chú</div>';
    }
};

window.triggerNoteImageUpload = function(orderId, event) {
    if (event) event.stopPropagation();
    const fileInput = document.getElementById(`note-image-input-${orderId}`);
    if (fileInput) fileInput.click();
};

window.handleNoteImageUpload = async function(orderId, event) {
    if (event) event.stopPropagation();
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    await window.uploadAndAddNoteImage(orderId, file);
    fileInput.value = '';
};

window.handleNoteImagePaste = async function(orderId, event) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            await window.uploadAndAddNoteImage(orderId, file);
        }
    }
};

window.uploadAndAddNoteImage = async function(orderId, file) {
    const container = document.getElementById(`note-images-container-${orderId}`);
    if (!container) return;

    const originalHtml = container.innerHTML;
    container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); line-height:24px;">📤 Đang tải...</div>';

    try {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) throw new Error('Upload to Pancake POS failed');
        const uploadData = await uploadRes.json();
        const imageUrl = uploadData.content_url || uploadData.url;
        if (!imageUrl) throw new Error('Không lấy được link ảnh từ Pancake');

        let images = container._noteImages || [];
        images.push(imageUrl);

        const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                note_image: images
            })
        });

        if (saveRes.ok) {
            window.loadAndRenderNoteImages(orderId, images);
        } else {
            throw new Error('Lưu vào Database thất bại');
        }
    } catch (err) {
        console.error('Note image upload error:', err);
        alert('Lỗi tải ảnh ghi chú: ' + err.message);
        container.innerHTML = originalHtml;
    }
};

window.deleteNoteImage = async function(orderId, index, event) {
    if (event) event.stopPropagation();
    const container = document.getElementById(`note-images-container-${orderId}`);
    if (!container || !container._noteImages) return;

    if (!confirm('Bạn có chắc chắn muốn xóa ảnh ghi chú này không?')) return;

    let images = [...container._noteImages];
    images.splice(index, 1);

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                note_image: images
            })
        });

        if (res.ok) {
            window.loadAndRenderNoteImages(orderId, images);
        } else {
            alert('Lỗi xóa ảnh ghi chú!');
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối xóa ảnh ghi chú!');
    }
};

// ================================================================
// SIDE NOTE IMAGES (modal edit note)
// ================================================================
window.loadAndRenderSideNoteImages = function(orderId, noteImages) {
    const container = document.getElementById('side-note-images-container');
    if (!container) return;

    let images = [];
    if (Array.isArray(noteImages)) {
        images = noteImages;
    } else if (typeof noteImages === 'string') {
        if (noteImages.startsWith('{') && noteImages.endsWith('}')) {
            images = noteImages.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(s => s);
        } else {
            images = [noteImages];
        }
    } else if (noteImages && typeof noteImages === 'object') {
        images = Object.values(noteImages).filter(s => typeof s === 'string');
    }

    container._noteImages = images;

    if (images.length > 0) {
        container.innerHTML = images.map((img, idx) => `
            <div style="position:relative; width:50px; height:50px; border-radius:6px; border:1px solid var(--border); overflow:hidden;">
                <img src="${img}" style="width:100%; height:100%; object-fit:cover; cursor:pointer;" onclick="window.viewFullImage('${img}')">
                <button type="button" onclick="window.deleteSideNoteImage(${idx}, event)" style="position:absolute; top:2px; right:2px; width:14px; height:14px; border-radius:50%; background:rgba(239,68,68,0.9); color:#fff; border:none; display:flex; align-items:center; justify-content:center; font-size:9px; cursor:pointer; padding:0;">✕</button>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); line-height:24px;">Chưa có ảnh ghi chú</div>';
    }
};

window.triggerSideNoteImageUpload = function(event) {
    if (event) event.stopPropagation();
    const fileInput = document.getElementById('side-note-image-input');
    if (fileInput) fileInput.click();
};

window.handleSideNoteImageUpload = async function(event) {
    if (event) event.stopPropagation();
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    await window.uploadAndAddSideNoteImage(file);
    fileInput.value = '';
};

window.handleSideNoteImagePaste = async function(event) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            await window.uploadAndAddSideNoteImage(file);
        }
    }
};

window.uploadAndAddSideNoteImage = async function(file) {
    const orderId = _sideEditOrderId;
    if (!orderId) return;

    const container = document.getElementById('side-note-images-container');
    if (!container) return;

    const originalHtml = container.innerHTML;
    container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); line-height:24px;">📤 Đang tải...</div>';

    try {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch(`https://pos.pancake.vn/api/v1/contents?api_key=${PANCAKE_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) throw new Error('Upload to Pancake POS failed');
        const uploadData = await uploadRes.json();
        const imageUrl = uploadData.content_url || uploadData.url;
        if (!imageUrl) throw new Error('Không lấy được link ảnh từ Pancake');

        let images = container._noteImages || [];
        images.push(imageUrl);

        const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                note_image: images
            })
        });

        if (saveRes.ok) {
            window.loadAndRenderSideNoteImages(orderId, images);
        } else {
            throw new Error('Lưu vào Database thất bại');
        }
    } catch (err) {
        console.error('Side note image upload error:', err);
        alert('Lỗi tải ảnh ghi chú: ' + err.message);
        container.innerHTML = originalHtml;
    }
};

window.deleteSideNoteImage = async function(index, event) {
    if (event) event.stopPropagation();
    const orderId = _sideEditOrderId;
    if (!orderId) return;

    const container = document.getElementById('side-note-images-container');
    if (!container || !container._noteImages) return;

    if (!confirm('Bạn có chắc chắn muốn xóa ảnh ghi chú này không?')) return;

    let images = [...container._noteImages];
    images.splice(index, 1);

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                note_image: images
            })
        });

        if (res.ok) {
            window.loadAndRenderSideNoteImages(orderId, images);
        } else {
            alert('Lỗi xóa ảnh ghi chú!');
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối xóa ảnh ghi chú!');
    }
};

// Add or edit conversation_link for a pancake_customers row
window.openAddConversationForCustomer = async function(encodedFbId) {
    const fbId = decodeURIComponent(encodedFbId || '');
    if (!fbId) { alert('Không có FB ID khách hàng.'); return; }

    // Ask user for conversation link or pid/tid pair
    const current = '';
    const input = prompt('Dán đường dẫn hội thoại (ví dụ: /#tin-nhan?pid=...&tid=...) hoặc dán full URL:', current);
    if (!input) return;

    // Normalize: if path starts with '/#' convert to origin + path
    let convLink = input.trim();
    if (convLink && convLink.startsWith('/#')) {
        convLink = location.origin + convLink;
    }

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation_link: convLink, updated_at: new Date().toISOString() })
        });
        if (!res.ok) throw new Error('Không thể cập nhật khách hàng: ' + await res.text());
        alert('Đã lưu hội thoại cho khách hàng.');
        fetchDashboardCustomers();
    } catch (err) {
        console.error(err);
        alert('Lỗi khi lưu hội thoại: ' + err.message);
    }
};

// Edit external conversation link for thread
window.editExternalConversation = async function(encodedFbId) {
    const fbId = decodeURIComponent(encodedFbId || '');
    if (!fbId) { alert('Không có FB ID khách hàng.'); return; }

    const input = prompt('Dán đường dẫn hội thoại ngoài (Facebook/Zalo/...) hoặc dán URL:', '');
    if (input === null) return; // User cancelled

    if (input.trim() === '') {
        alert('Hãy nhập đường dẫn hoặc bỏ liên kết bằng nút "Bỏ liên kết"');
        return;
    }

    let url = input.trim();
    if (url && url.startsWith('/#')) {
        url = location.origin + url;
    }

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ external_conversation_link: url, updated_at: new Date().toISOString() })
        });
        if (!res.ok) throw new Error('Không thể cập nhật: ' + await res.text());
        linkedCustomersMap.set(fbId.toString(), url);
        if (typeof showToast === 'function') {
            showToast('Đã cập nhật liên kết hội thoại ngoài!', 'success');
        } else {
            alert('Đã cập nhật liên kết hội thoại ngoài!');
        }
        renderThreads();
        if (activeThread && activeThread.tid === fbId) {
            updateDetailsPanel(activeThread);
        }
        fetchDashboardCustomers();
    } catch (err) {
        console.error(err);
        alert('Lỗi cập nhật: ' + err.message);
    }
};

// Unlink external conversation link
window.unlinkExternalConversation = async function(encodedFbId) {
    const fbId = decodeURIComponent(encodedFbId || '');
    if (!fbId) { alert('Không có FB ID khách hàng.'); return; }

    if (!confirm('Bạn có chắc chắn muốn bỏ liên kết hội thoại ngoài này không?')) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ external_conversation_link: null, updated_at: new Date().toISOString() })
        });
        if (!res.ok) throw new Error('Không thể bỏ liên kết: ' + await res.text());
        linkedCustomersMap.delete(fbId.toString());
        if (typeof showToast === 'function') {
            showToast('Đã bỏ liên kết hội thoại ngoài!', 'success');
        } else {
            alert('Đã bỏ liên kết hội thoại ngoài!');
        }
        renderThreads();
        if (activeThread && activeThread.tid === fbId) {
            updateDetailsPanel(activeThread);
        }
        fetchDashboardCustomers();
    } catch (err) {
        console.error(err);
        alert('Lỗi bỏ liên kết: ' + err.message);
    }
};

// Open modal to edit customer fields (phone_numbers or shop_customer_addresses)
window.openEditCustomerField = async function(fieldName) {
    if (!activeThread) { alert('Vui lòng chọn hội thoại trước'); return; }
    const fbId = activeThread.tid;
    // Fetch existing customer row
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}&select=fb_id,name,phone_numbers,shop_customer_addresses&limit=1`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error('Không thể tải thông tin khách hàng');
        const data = await res.json();
        const existing = (Array.isArray(data) && data[0]) ? data[0] : null;

        let currentVal = '';
        if (fieldName === 'phone_numbers') {
            if (existing && Array.isArray(existing.phone_numbers) && existing.phone_numbers.length>0) currentVal = existing.phone_numbers[0];
        } else if (fieldName === 'shop_customer_addresses') {
            if (existing && existing.shop_customer_addresses) currentVal = JSON.stringify(existing.shop_customer_addresses[0] || {});
        }

        const input = prompt(`Nhập giá trị mới cho ${fieldName.replace('_',' ')}:`, currentVal || '');
        if (input === null) return; // cancel

        // Build payload
        let payload = {};
        if (fieldName === 'phone_numbers') {
            // store as single-element array
            payload.phone_numbers = [input.trim()];
        } else if (fieldName === 'shop_customer_addresses') {
            // try parse JSON for address object, otherwise save as simple text address
            try {
                const obj = JSON.parse(input);
                payload.shop_customer_addresses = [obj];
            } catch (e) {
                payload.shop_customer_addresses = [{ full_address: input.trim() }];
            }
        }

        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/pancake_customers?fb_id=eq.${encodeURIComponent(fbId)}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer':'return=representation' },
            body: JSON.stringify(payload)
        });
        if (!patchRes.ok) throw new Error(await patchRes.text());
        if (typeof showToast === 'function') showToast('Đã cập nhật thông tin khách hàng', 'success');
        // Refresh details panel
        if (activeThread) updateDetailsPanel(activeThread);
    } catch (err) {
        console.error('openEditCustomerField error', err);
        alert('Lỗi cập nhật: ' + (err.message || err));
    }
};

async function cacheMessageMediaForOffline(messages) {
    if (!window.desktopOffline?.cacheMedia || !Array.isArray(messages)) return messages;
    for (const msg of messages) {
        const attachments = msg.attachments || msg.facebook?.attachments || msg.instagram?.attachments || msg.tiktokweb?.attachments || msg.zaloweb?.attachments || [];
        if (!Array.isArray(attachments)) continue;
        for (const att of attachments) {
            const url = att.url || att.payload?.url || att.url_preview || '';
            if (!url || att.offline_url) continue;
            try { att.offline_url = await window.desktopOffline.cacheMedia(url); }
            catch (e) { console.warn('[Offline media] Không tải được', url, e); }
        }
    }
    return messages;
}

async function syncThreadMessagesToOffline(thread) {
    if (isTikTokChatboxThread(thread)) {
        const fetched = await fetchTikTokChatboxMessages(thread, 0, 80);
        const messages = [...fetched].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
        await cacheMessageMediaForOffline(messages);
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
    await cacheMessageMediaForOffline(all);
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
        alert('Đã lưu offline '+ok+'/'+threads.length+' hội thoại, '+totalMessages+' tin nhắn.'+(failed?' Lỗi '+failed+' hội thoại.':'')+'\nDữ liệu: '+dataPath);
    } catch (err) {
        console.error('[Offline] sync error:', err);
        alert('Không thể lưu dữ liệu offline: ' + err.message);
    } finally { if(btn && original) btn.textContent=original; }
};

async function desktopAddOrderItem(cmd){
 const h={apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY};
 const customer=String(cmd.customer||'').toLowerCase(),sku=String(cmd.sku||''),size=String(cmd.size||''),price=Number(cmd.price),qty=Number(cmd.quantity||1);
 let r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?select=*,items:pancake_order_items(*)&order=inserted_at.desc&limit=200',{headers:h}); if(!r.ok)return {ok:false,error:'order read failed'};
 let allOrders=await r.json(); let orders=cmd.displayId!=null?allOrders.filter(o=>String(o.display_id)===String(cmd.displayId)):allOrders.filter(o=>JSON.stringify(o).toLowerCase().includes(customer)); if(!orders.length)return {ok:false,error:cmd.displayId!=null?'Không tìm thấy đơn #'+cmd.displayId:'Không tìm thấy đơn khách'}; const o=orders[0];
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_products?select=id,name,image_url,product_code,pancake_variations(id,name,retail_price,images,sku,variation_label,fields)&or=(product_code.ilike.*'+encodeURIComponent(sku)+'*,name.ilike.*'+encodeURIComponent(sku)+'*)&limit=20',{headers:h}); if(!r.ok)return {ok:false,error:'product read failed'}; const p=(await r.json())[0]; if(!p)return {ok:false,error:'Không tìm thấy SKU '+sku};
 const v=(p.pancake_variations||[]).find(x=>[x.name,x.variation_label,JSON.stringify(x.fields||[])].join(' ').includes(size)); if(!v)return {ok:false,error:'Không tìm thấy size '+size};
 const current=Array.isArray(o.items)?o.items:[]; if(current.some(x=>String(x.product_name||'').includes(sku)&&String(x.product_name||'').includes(size)))return {ok:false,error:'Đã có trong đơn #'+o.display_id};
 const name=(p.name||sku)+' - '+size,row={order_id:o.id,product_id:p.id,product_name:name,retail_price:price,quantity:qty,discount_each_product:0,item_note:'',variation_info:{name,type:'product',images:v.images?.length?v.images:(p.image_url?[p.image_url]:[]),retail_price:price,item_note:'',sku:v.sku||sku,size}};
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_order_items',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(row)}); if(!r.ok)return {ok:false,error:'Ghi sản phẩm lỗi'};
 const subtotal=current.concat([row]).reduce((n,x)=>n+((Number(x.retail_price||x.price)||0)-(Number(x.discount_each_product||x.discount)||0))*(Number(x.quantity)||1),0),total=subtotal+Number(o.shipping_fee||0)+Number(o.surcharge||0),cod=Math.max(0,total-Number(o.prepaid||0));
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?id=eq.'+encodeURIComponent(o.id),{method:'PATCH',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({total_price:total,cod})}); if(!r.ok)return {ok:false,error:'Cập nhật tổng lỗi'};
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?id=eq.'+encodeURIComponent(o.id)+'&select=display_id,bill_full_name,total_price,cod,items:pancake_order_items(*)',{headers:h}); const z=(await r.json())[0],found=z?.items?.some(x=>x.product_name===name&&Number(x.retail_price)===price&&Number(x.quantity)===qty); return found?{ok:true,displayId:z.display_id,customer:z.bill_full_name,sku,size,price,quantity:qty,total:z.total_price,cod:z.cod}:{ok:false,error:'Không xác minh được sau khi ghi'};
}

async function desktopEnsureVariation(cmd){
 const h={apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'}; const sku=String(cmd.sku||''),size=String(cmd.size||''),price=Number(cmd.price||0);
 let r=await fetch(SUPABASE_URL+'/rest/v1/pancake_products?select=id,name,image_url,product_code,pancake_variations(id,name,retail_price,images,sku,variation_label,fields)&or=(product_code.ilike.*'+encodeURIComponent(sku)+'*,name.ilike.*'+encodeURIComponent(sku)+'*)&limit=20',{headers:h}); if(!r.ok)return {ok:false,error:'product read failed'}; const p=(await r.json())[0]; if(!p)return {ok:false,error:'Không tìm thấy SKU '+sku};
 let v=(p.pancake_variations||[]).find(x=>[x.name,x.variation_label,JSON.stringify(x.fields||[])].join(' ').includes(size)); if(v)return {ok:true,created:false,product:p.name,size,variationId:v.id};
 const sample=(p.pancake_variations||[])[0]||{}; const row={id:'desktop-'+Date.now()+'-'+Math.random().toString(36).slice(2,10),product_id:p.id,name:(p.name||sku)+' - '+size,retail_price:price||Number(sample.retail_price||0),sku:sku+'-'+size,stock_quantity:0,variation_label:size,images:sample.images||[],fields:[{name:'Size',value:size}]};
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_variations',{method:'POST',headers:{...h,Prefer:'return=representation'},body:JSON.stringify(row)}); if(!r.ok)return {ok:false,error:'Tạo variation lỗi: '+await r.text()}; const a=await r.json(); return {ok:true,created:true,product:p.name,size,variationId:a[0]?.id};
}

async function desktopUploadCreateAddConfirm(cmd){
 const h={apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY};
 const sourceUrl=String(cmd.imageUrl||''),name=String(cmd.name||'Set đồng hồ Dickies'),price=Number(cmd.price||389000),customer=String(cmd.customer||'Rainnguyen').toLowerCase();
 let ir=await fetch(sourceUrl); if(!ir.ok)return {ok:false,error:'Không tải được ảnh nguồn: '+ir.status}; const blob=await ir.blob(); const fd=new FormData(); fd.append('file',blob,'dickies-watch.jpg');
 let ur=await fetch('https://pos.pancake.vn/api/v1/contents?api_key='+PANCAKE_API_KEY,{method:'POST',body:fd}); if(!ur.ok)return {ok:false,error:'Upload Pancake lỗi: '+await ur.text()}; const ud=await ur.json(); const imageUrl=ud.content_url||ud.url; if(!imageUrl)return {ok:false,error:'Pancake không trả content_url'};
 const uuid=()=>crypto.randomUUID?crypto.randomUUID():'desktop-'+Date.now()+'-'+Math.random().toString(36).slice(2); const pid=uuid(),vid=uuid(),code='DICKIES-SET-'+Date.now();
 let r=await fetch(SUPABASE_URL+'/rest/v1/pancake_products',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify([{id:pid,name,price,sell_price:price,product_code:code,image_url:imageUrl}])}); if(!r.ok)return {ok:false,error:'Tạo sản phẩm lỗi: '+await r.text()};
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_variations',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify([{id:vid,product_id:pid,name:name+' - Mặc định',retail_price:price,sku:code,stock_quantity:999,variation_label:'Mặc định',images:[imageUrl],fields:[{name:'option',value:'Mặc định',keyValue:'Mặc định'}]}])}); if(!r.ok)return {ok:false,error:'Tạo variation lỗi: '+await r.text()};
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?select=*,items:pancake_order_items(*)&order=inserted_at.desc&limit=200',{headers:h}); if(!r.ok)return {ok:false,error:'Đọc đơn lỗi'}; const o=(await r.json()).filter(x=>JSON.stringify(x).toLowerCase().includes(customer))[0]; if(!o)return {ok:false,error:'Không tìm thấy đơn Rainnguyen'}; const row={order_id:o.id,product_id:pid,product_name:name+' - Mặc định',retail_price:price,quantity:1,discount_each_product:0,item_note:'',variation_info:{name:name+' - Mặc định',type:'product',images:[imageUrl],retail_price:price,item_note:'',sku:code}};
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_order_items',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(row)}); if(!r.ok)return {ok:false,error:'Thêm vào đơn lỗi: '+await r.text()}; const current=Array.isArray(o.items)?o.items:[],subtotal=current.concat([row]).reduce((n,x)=>n+((Number(x.retail_price||x.price)||0)-(Number(x.discount_each_product||x.discount)||0))*(Number(x.quantity)||1),0),total=subtotal+Number(o.shipping_fee||0)+Number(o.surcharge||0),cod=Math.max(0,total-Number(o.prepaid||0));
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?id=eq.'+encodeURIComponent(o.id),{method:'PATCH',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({total_price:total,cod,status:1})}); if(!r.ok)return {ok:false,error:'Cập nhật đơn lỗi: '+await r.text()};
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?id=eq.'+encodeURIComponent(o.id)+'&select=display_id,bill_full_name,total_price,cod,status,items:pancake_order_items(*)',{headers:h}); const z=(await r.json())[0]; const found=z?.items?.some(x=>x.product_id===pid&&Number(x.retail_price)===price); return found&&Number(z.status)===1?{ok:true,displayId:z.display_id,customer:z.bill_full_name,product:name,price,imageUrl,total:z.total_price,cod:z.cod,status:z.status}:{ok:false,error:'Không xác minh được thay đổi',verify:z};
}

async function desktopGetUnansweredThreads(cmd){
 const limit=Math.max(1,Math.min(50,Number(cmd.limit||10))); if(!smaxToken)return {ok:false,error:'Chưa có Smax token'};
 const payload={page_pids:SMAX_PAGE_IDS,group_id:'',keyword:null,tags:[],tags_to_exclude:[],tags_empty:false,tags_condition:'OR',types:[],isnew:false,newtop:false,reply:false,phone:false,nophone:false,customers:false,is_group:false,is_message:false,auto_refresh_new_message:false,dateRange:[],post_ids:null,ad_ids:[],users:[],seen:null,ads:false,no_user:false,after:'',limit:50};
 const r=await fetch('https://api.smax.ai/bizs/'+SMAX_BIZ_ID+'/threads',{method:'POST',headers:{Authorization:smaxToken,'Content-Type':'application/json',Accept:'application/json, text/plain, */*'},body:JSON.stringify(payload)}); if(!r.ok)return {ok:false,error:'Smax threads lỗi '+r.status+': '+await r.text()}; const j=await r.json(),rows=Array.isArray(j.data)?j.data:[];
 const pick=rows.filter(x=>x.replied===false||x.reply===false||x.is_replied===false).slice(0,limit).map(x=>({tid:x.tid||x.id||x.pid,pagePid:x.page_pid||x.pagePid||x.page?.pid,name:x.name||x.customer_name||x.customer?.name||x.sender_name||'',updatedAt:x.updated_at||x.last_message_at||x.created_at||'',lastMessage:x.last_message?.message||x.last_message?.text||x.last_message||x.message||'',replied:x.replied??x.reply??x.is_replied,read:x.read??x.seen})); return {ok:true,count:pick.length,threads:pick};
}

async function desktopGetThreadMessages(cmd){
 const pagePid=String(cmd.pagePid||''),tid=String(cmd.tid||''),limit=Math.max(1,Math.min(200,Number(cmd.limit||80))); if(!pagePid||!tid)return {ok:false,error:'Thiếu pagePid hoặc tid'}; if(!smaxToken)return {ok:false,error:'Chưa có Smax token'};
 const url='https://api.smax.ai/bizs/'+SMAX_BIZ_ID+'/pages/'+encodeURIComponent(pagePid)+'/threads/'+encodeURIComponent(tid)+'/messages?limit='+limit+'&sort=-created_at'; const r=await fetch(url,{headers:{Authorization:smaxToken,Accept:'application/json, text/plain, */*'}}); if(!r.ok)return {ok:false,error:'Smax messages lỗi '+r.status+': '+await r.text()}; const j=await r.json(); const rows=Array.isArray(j.data)?j.data:(Array.isArray(j)?j:[]); return {ok:true,count:rows.length,messages:rows};
}

async function desktopAddExistingProduct(cmd){ const h={apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY}; const customer=String(cmd.customer||'').toLowerCase(),q=String(cmd.product||'').toLowerCase(),price=Number(cmd.price||0),qty=Number(cmd.quantity||1); let r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?select=*,items:pancake_order_items(*)&order=inserted_at.desc&limit=200',{headers:h}); if(!r.ok)return {ok:false,error:'order read failed'}; const o=(await r.json()).filter(x=>JSON.stringify(x).toLowerCase().includes(customer))[0]; if(!o)return {ok:false,error:'Không tìm thấy đơn khách'}; r=await fetch(SUPABASE_URL+'/rest/v1/pancake_products?select=id,name,image_url,product_code,pancake_variations(id,name,retail_price,images,sku,variation_label,fields)&name=ilike.*'+encodeURIComponent(q)+'*&limit=10',{headers:h}); if(!r.ok)return {ok:false,error:'product read failed'}; const p=(await r.json())[0]; if(!p)return {ok:false,error:'Không tìm thấy sản phẩm '+cmd.product}; const v=(p.pancake_variations||[])[0]||{},name=p.name+(v.variation_label?' - '+v.variation_label:''); const current=Array.isArray(o.items)?o.items:[]; const row={order_id:o.id,product_id:p.id,product_name:name,retail_price:price||Number(v.retail_price||0),quantity:qty,discount_each_product:0,item_note:'',variation_info:{name,type:'product',images:v.images?.length?v.images:(p.image_url?[p.image_url]:[]),retail_price:price||Number(v.retail_price||0),sku:v.sku||p.product_code||''}}; r=await fetch(SUPABASE_URL+'/rest/v1/pancake_order_items',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(row)}); if(!r.ok)return {ok:false,error:'Ghi sản phẩm lỗi: '+await r.text()}; const subtotal=current.concat([row]).reduce((n,x)=>n+((Number(x.retail_price||x.price)||0)-(Number(x.discount_each_product||x.discount)||0))*(Number(x.quantity)||1),0),total=subtotal+Number(o.shipping_fee||0)+Number(o.surcharge||0),cod=Math.max(0,total-Number(o.prepaid||0)); r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?id=eq.'+encodeURIComponent(o.id),{method:'PATCH',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({total_price:total,cod})}); if(!r.ok)return {ok:false,error:'Cập nhật tổng lỗi'}; r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?id=eq.'+encodeURIComponent(o.id)+'&select=display_id,bill_full_name,total_price,cod,items:pancake_order_items(*)',{headers:h}); const z=(await r.json())[0],found=z?.items?.some(x=>x.product_id===p.id&&Number(x.retail_price)===Number(row.retail_price)); return found?{ok:true,displayId:z.display_id,customer:z.bill_full_name,product:p.name,price:row.retail_price,total:z.total_price,cod:z.cod}:{ok:false,error:'Không xác minh được'};}

async function desktopCreateProductAddLatestOrder(cmd){const h={apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation'};const name=String(cmd.name),sku=String(cmd.sku),size=String(cmd.size),price=Number(cmd.price),qty=Number(cmd.quantity||1);let r=await fetch(SUPABASE_URL+'/rest/v1/pancake_products?select=id,name,product_code&or=(product_code.eq.'+encodeURIComponent(sku)+',name.eq.'+encodeURIComponent(name)+')&limit=10',{headers:h});if(!r.ok)return {ok:false,error:'product lookup failed: '+await r.text()};let ps=await r.json(),p=ps[0];if(!p){r=await fetch(SUPABASE_URL+'/rest/v1/pancake_products',{method:'POST',headers:h,body:JSON.stringify({id:crypto.randomUUID(),name,product_code:sku,image_url:cmd.image_url||null})});if(!r.ok)return {ok:false,error:'create product failed: '+await r.text()};p=(await r.json())[0];}let vres=await fetch(SUPABASE_URL+'/rest/v1/pancake_variations?select=id,name,variation_label,retail_price,sku&product_id=eq.'+encodeURIComponent(p.id)+'&variation_label=eq.'+encodeURIComponent(size)+'&limit=1',{headers:h});if(!vres.ok)return {ok:false,error:'variation lookup failed: '+await vres.text()};let vs=await vres.json(),v=vs[0];if(!v){r=await fetch(SUPABASE_URL+'/rest/v1/pancake_variations',{method:'POST',headers:h,body:JSON.stringify({id:crypto.randomUUID(),product_id:p.id,name:name+' - '+size,variation_label:size,retail_price:price,sku:sku+'-'+size,images:cmd.image_url?[cmd.image_url]:[],fields:[{name:'Size',value:size}]})});if(!r.ok)return {ok:false,error:'create variation failed: '+await r.text()};v=(await r.json())[0];}r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?select=*,items:pancake_order_items(*)&order=inserted_at.desc&limit=200',{headers:h});if(!r.ok)return {ok:false,error:'order read failed'};const customer=String(cmd.customer||'').toLowerCase(),o=(await r.json()).filter(x=>JSON.stringify(x).toLowerCase().includes(customer))[0];if(!o)return {ok:false,error:'Không tìm thấy đơn khách '+cmd.customer};const row={order_id:o.id,product_id:p.id,product_name:name+' - '+size,retail_price:price,quantity:qty,discount_each_product:0,item_note:'',variation_info:{name:name+' - '+size,type:'product',images:cmd.image_url?[cmd.image_url]:[],retail_price:price,sku:sku+'-'+size}};r=await fetch(SUPABASE_URL+'/rest/v1/pancake_order_items',{method:'POST',headers:h,body:JSON.stringify(row)});if(!r.ok)return {ok:false,error:'add item failed: '+await r.text()};const current=Array.isArray(o.items)?o.items:[],subtotal=current.concat([row]).reduce((n,x)=>n+(Number(x.retail_price)||0)*(Number(x.quantity)||1),0),total=subtotal+Number(o.shipping_fee||0)+Number(o.surcharge||0),cod=Math.max(0,total-Number(o.prepaid||0));r=await fetch(SUPABASE_URL+'/rest/v1/pancake_orders?id=eq.'+encodeURIComponent(o.id),{method:'PATCH',headers:h,body:JSON.stringify({total_price:total,cod})});if(!r.ok)return {ok:false,error:'update total failed: '+await r.text()};return {ok:true,createdProduct:!ps.length,productId:p.id,variationId:v.id,displayId:o.display_id,customer:o.bill_full_name,price,total,cod};}

async function desktopUpdateProductImage(cmd){
 const h={apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation'};
 const sku=String(cmd.sku||''),src=String(cmd.image_url||''); if(!sku||!src)return {ok:false,error:'Thiếu sku hoặc image_url'};
 let dl=await fetch(src); if(!dl.ok)return {ok:false,error:'Không tải được ảnh nguồn: '+dl.status}; const blob=await dl.blob(); const fd=new FormData(); fd.append('file',blob,'product.jpg');
 const up=await fetch('https://pos.pancake.vn/api/v1/contents?api_key='+encodeURIComponent(PANCAKE_API_KEY),{method:'POST',body:fd}); if(!up.ok)return {ok:false,error:'Pancake upload lỗi '+up.status+': '+await up.text()}; const ud=await up.json(); const pancakeUrl=ud?.data?.content_url||ud?.data?.url||ud?.content_url||ud?.url; if(!pancakeUrl)return {ok:false,error:'Pancake không trả về content_url',response:ud};
 let r=await fetch(SUPABASE_URL+'/rest/v1/pancake_products?select=id,name,product_code&product_code=eq.'+encodeURIComponent(sku)+'&limit=1',{headers:h}); if(!r.ok)return {ok:false,error:'product lookup failed: '+await r.text()}; const ps=await r.json(); if(!ps[0])return {ok:false,error:'Không tìm thấy sản phẩm '+sku}; const p=ps[0];
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_products?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',headers:h,body:JSON.stringify({image_url:pancakeUrl})}); if(!r.ok)return {ok:false,error:'product update failed: '+await r.text()};
 r=await fetch(SUPABASE_URL+'/rest/v1/pancake_variations?product_id=eq.'+encodeURIComponent(p.id),{headers:h}); const vs=r.ok?await r.json():[]; if(vs.length){r=await fetch(SUPABASE_URL+'/rest/v1/pancake_variations?id=eq.'+encodeURIComponent(vs[0].id),{method:'PATCH',headers:h,body:JSON.stringify({images:[pancakeUrl]})}); if(!r.ok)return {ok:false,error:'variation update failed: '+await r.text()};}
 return {ok:true,productId:p.id,name:p.name,sourceUrl:src,pancakeUrl,variationUpdated:vs.length>0};
}
