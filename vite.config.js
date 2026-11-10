import { defineConfig } from 'vite';
import { resolve } from 'path';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  return await new Promise((resolveBody, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolveBody({});
        return;
      }

      try {
        resolveBody(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function wrapNodeResponse(res) {
  return {
    setHeader(name, value) {
      res.setHeader(name, value);
      return this;
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(body) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(body));
      return this;
    },
    end(body) {
      res.end(body);
      return this;
    }
  };
}

async function installLocalApiHandlers(server) {
  const { default: jtSyncHandler } = await import('./api/jt-sync.js');
  const { default: jtTrackHandler } = await import('./api/jt-track.js');
  const { default: spxOrderExtraHandler } = await import('./api/spx-order-extra.js');
  const { default: spxTrackHandler } = await import('./api/spx-track.js');

  server.middlewares.use(async (req, res, next) => {
    try {
      if (req.url && req.url.split('?')[0] === '/api/spx-track') {
        await spxTrackHandler(req, wrapNodeResponse(res));
        return;
      }

      // POST /api/jt-sync -> call jtSyncHandler
      if (req.url && req.url.startsWith('/api/jt-sync') && req.method === 'POST') {
        await jtSyncHandler(req, wrapNodeResponse(res));
        return;
      }

      // GET/POST /api/jt-track -> call jtTrackHandler
      if (req.url && req.url.startsWith('/api/jt-track') && (req.method === 'GET' || req.method === 'POST')) {
        await jtTrackHandler(req, wrapNodeResponse(res));
        return;
      }

      // POST /api/spx-order-extra -> emulate the Vercel Serverless Function locally.
      // Vite/preview do not execute files in /api automatically, so without this
      // handler fetch('/api/spx-order-extra') returns 404.
      if (req.url && req.url.startsWith('/api/spx-order-extra')) {
        if (req.method === 'POST') {
          req.body = await readJsonBody(req);
        }
        await spxOrderExtraHandler(req, wrapNodeResponse(res));
        return;
      }
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: 'Local API handler error',
        message: err instanceof Error ? err.message : String(err)
      }));
      return;
    }

    next();
  });
}

export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      '/api-jt': {
        target: 'https://ylvipapi.jtexpress.vn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-jt/, ''),
        headers: {
          'Origin': 'https://khachhang.jtexpress.vn',
          'Referer': 'https://khachhang.jtexpress.vn/'
        }
      },
      '/api-spx': {
        target: 'https://spx.vn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-spx/, ''),
        headers: {
          'Origin': 'https://spx.vn',
          'Referer': 'https://spx.vn/spx-admin/single-order/create'
        }
      }
    }
  },
  plugins: [
    {
      name: 'local-api-handlers',
      async configureServer(server) {
        await installLocalApiHandlers(server);
      },
      async configurePreviewServer(server) {
        await installLocalApiHandlers(server);
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        bill: resolve(__dirname, 'bill.html')
      }
    }
  }
});
