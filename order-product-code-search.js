(() => {
    const previousFetch = window.fetch.bind(window);
    const MAX_IDS_PER_QUERY = 80;

    function getRequestUrl(input) {
        if (typeof input === 'string') return input;
        if (input && typeof input.url === 'string') return input.url;
        return '';
    }

    function getRequestMethod(input, init) {
        if (init && init.method) return String(init.method).toUpperCase();
        if (input && typeof input.method === 'string') return input.method.toUpperCase();
        return 'GET';
    }

    function getHeaders(input, init) {
        if (init && init.headers) return init.headers;
        if (input && input.headers) return input.headers;
        return {};
    }

    function extractSearchTerm(productNameFilter) {
        const value = String(productNameFilter || '');
        const prefix = 'ilike.*';
        if (!value.startsWith(prefix)) return '';
        return value.slice(prefix.length).replace(/\*$/, '').trim();
    }

    async function safeJson(response) {
        if (!response || !response.ok) return [];
        try {
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }

    async function collectOrderIdsByItemField(origin, headers, field, values, output) {
        const ids = Array.from(values || []);
        for (let index = 0; index < ids.length; index += MAX_IDS_PER_QUERY) {
            const chunk = ids.slice(index, index + MAX_IDS_PER_QUERY);
            if (!chunk.length) continue;

            const idList = chunk.map(value => encodeURIComponent(String(value))).join(',');
            const url = `${origin}/rest/v1/pancake_order_items?select=order_id&${field}=in.(${idList})&limit=5000`;

            try {
                const response = await previousFetch(url, { headers });
                if (!response.ok) continue;
                const rows = await safeJson(response);
                rows.forEach(row => {
                    if (row && row.order_id !== null && row.order_id !== undefined) {
                        output.add(String(row.order_id));
                    }
                });
            } catch (error) {
                console.warn('[Order Search] Không thể dò đơn theo ' + field + ':', error);
            }
        }
    }

    window.fetch = async function orderProductCodeSearchFetch(input, init = {}) {
        const requestUrl = getRequestUrl(input);
        const method = getRequestMethod(input, init);

        if (method !== 'GET' || !requestUrl) {
            return previousFetch(input, init);
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(requestUrl, window.location.origin);
        } catch {
            return previousFetch(input, init);
        }

        const isOrderProductNameSearch =
            parsedUrl.pathname.endsWith('/rest/v1/pancake_order_items') &&
            parsedUrl.searchParams.get('select') === 'order_id' &&
            parsedUrl.searchParams.has('product_name');

        if (!isOrderProductNameSearch) {
            return previousFetch(input, init);
        }

        const searchTerm = extractSearchTerm(parsedUrl.searchParams.get('product_name'));
        if (!searchTerm) {
            return previousFetch(input, init);
        }

        const headers = getHeaders(input, init);
        const origin = parsedUrl.origin;
        const encodedTerm = encodeURIComponent(searchTerm);

        try {
            const originalNameSearchPromise = previousFetch(input, init);
            const productCodeSearchPromise = previousFetch(
                `${origin}/rest/v1/pancake_products?select=id&product_code=ilike.*${encodedTerm}*&limit=5000`,
                { headers }
            );
            const variationSkuSearchPromise = previousFetch(
                `${origin}/rest/v1/pancake_variations?select=id,product_id&sku=ilike.*${encodedTerm}*&limit=5000`,
                { headers }
            );

            const [nameResponse, productResponse, variationResponse] = await Promise.all([
                originalNameSearchPromise,
                productCodeSearchPromise,
                variationSkuSearchPromise
            ]);

            if (!nameResponse.ok) {
                return nameResponse;
            }

            const orderIds = new Set();
            const nameRows = await safeJson(nameResponse);
            nameRows.forEach(row => {
                if (row && row.order_id !== null && row.order_id !== undefined) {
                    orderIds.add(String(row.order_id));
                }
            });

            const productIds = new Set();
            if (productResponse.ok) {
                const products = await safeJson(productResponse);
                products.forEach(product => {
                    if (product && product.id !== null && product.id !== undefined) {
                        productIds.add(String(product.id));
                    }
                });
            } else {
                console.warn('[Order Search] Tra mã sản phẩm thất bại:', productResponse.status);
            }

            const variationIds = new Set();
            if (variationResponse.ok) {
                const variations = await safeJson(variationResponse);
                variations.forEach(variation => {
                    if (variation && variation.id !== null && variation.id !== undefined) {
                        variationIds.add(String(variation.id));
                    }
                    // Một số đơn cũ sau khi chỉnh sửa chỉ còn product_id,
                    // vì vậy luôn lấy thêm product_id cha của SKU biến thể.
                    if (variation && variation.product_id !== null && variation.product_id !== undefined) {
                        productIds.add(String(variation.product_id));
                    }
                });
            } else {
                console.warn('[Order Search] Tra SKU biến thể thất bại:', variationResponse.status);
            }

            await Promise.all([
                collectOrderIdsByItemField(origin, headers, 'product_id', productIds, orderIds),
                collectOrderIdsByItemField(origin, headers, 'variation_id', variationIds, orderIds)
            ]);

            return new Response(
                JSON.stringify(Array.from(orderIds).map(order_id => ({ order_id }))),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        } catch (error) {
            console.warn('[Order Search] Mở rộng tìm kiếm theo mã sản phẩm thất bại, dùng tìm kiếm mặc định:', error);
            return previousFetch(input, init);
        }
    };
})();