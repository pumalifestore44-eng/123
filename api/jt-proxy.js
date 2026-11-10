// Vercel Serverless Function: Proxy J&T Express API
// Handles: /api/jt-proxy?path=/api/region/list&level=1&dataType=2
// This proxies requests to https://ylvipapi.jtexpress.vn to bypass CORS

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, authToken, langType, routeName, cookie, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Get the target path from query parameter
        const targetPath = req.query.path || '';
        if (!targetPath) {
            return res.status(400).json({ error: 'Missing path parameter' });
        }

        // Build query string from remaining params (exclude 'path')
        const queryParams = { ...req.query };
        delete queryParams.path;
        const queryString = new URLSearchParams(queryParams).toString();

        const targetUrl = `https://ylvipapi.jtexpress.vn${targetPath}${queryString ? '?' + queryString : ''}`;

        // Forward headers from the client request
        const forwardHeaders = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': req.headers['content-type'] || 'application/json',
            'Origin': 'https://khachhang.jtexpress.vn',
            'Referer': 'https://khachhang.jtexpress.vn/',
        };

        // Forward auth headers if present
        if (req.headers['authtoken']) forwardHeaders['authToken'] = req.headers['authtoken'];
        if (req.headers['langtype']) forwardHeaders['langType'] = req.headers['langtype'];
        if (req.headers['routename']) forwardHeaders['routeName'] = req.headers['routename'];
        if (req.headers['cookie']) forwardHeaders['cookie'] = req.headers['cookie'];

        const fetchOptions = {
            method: req.method,
            headers: forwardHeaders,
        };

        // Forward body for POST/PUT requests
        if (req.method === 'POST' || req.method === 'PUT') {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, fetchOptions);
        const data = await response.json();

        return res.status(response.status).json(data);
    } catch (error) {
        console.error('J&T Proxy Error:', error);
        return res.status(500).json({ error: 'Proxy request failed', message: error.message });
    }
}
