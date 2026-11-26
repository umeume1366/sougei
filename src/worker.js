// Cloudflare Workers の入口
//   /api/geocode … 住所 → 位置 (国土地理院)
//   /api/data    … 利用者・車両・配車結果の保存 (KV)
//   それ以外     … public/ の画面ファイルを配信
import { onRequestGet as geocode } from '../functions/api/geocode.js';
import { onRequest as data } from '../functions/api/data.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/geocode') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
      return geocode({ request, env, ctx });
    }
    if (pathname === '/api/data') return data({ request, env, ctx });
    if (pathname.startsWith('/api/')) return new Response('Not Found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
