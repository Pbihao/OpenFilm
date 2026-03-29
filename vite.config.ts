import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import fsp from 'node:fs/promises';

const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  json: 'application/json',
};

/** Vite dev-server plugin: local-data read/write endpoints */
const localDataPlugin = {
  name: 'local-data',
  configureServer(server: any) {
    /** POST /api/local-save?session=xxx&filename=yyy  → writes local-data/xxx/yyy */
    server.middlewares.use('/api/local-save', async (req: any, res: any) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
      try {
        const url = new URL(req.url, 'http://localhost');
        const session = url.searchParams.get('session') || 'default';
        const filename = url.searchParams.get('filename') || 'file';
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk);
        const data = Buffer.concat(chunks);
        const filepath = path.join(process.cwd(), 'local-data', session, filename);
        await fsp.mkdir(path.dirname(filepath), { recursive: true });
        await fsp.writeFile(filepath, data);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
    });

    /** GET /api/local-data?session=xxx&filename=yyy  → serves local-data/xxx/yyy */
    server.middlewares.use('/api/local-data', async (req: any, res: any) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
      try {
        const url = new URL(req.url, 'http://localhost');
        const session = url.searchParams.get('session') || '';
        const filename = url.searchParams.get('filename') || '';
        if (!session || !filename) { res.statusCode = 400; res.end('Bad request'); return; }
        const filepath = path.join(process.cwd(), 'local-data', session, filename);
        const data = await fsp.readFile(filepath);
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        res.setHeader('Content-Type', MIME_MAP[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(data);
      } catch {
        res.statusCode = 404;
        res.end('Not found');
      }
    });
  },
};

export default defineConfig({
  plugins: [react(), localDataPlugin],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: { headers: crossOriginHeaders },
  preview: { headers: crossOriginHeaders },
});
