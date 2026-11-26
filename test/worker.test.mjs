import worker from '../src/worker.js';
const env = { ASSETS: { fetch: async (r) => new Response('asset:' + new URL(r.url).pathname) }, REQUIRE_ACCESS: '0' };
const t = async (path, m = 'GET') => { const r = await worker.fetch(new Request('https://x' + path, { method: m }), env); return r.status + ' ' + (await r.text()).slice(0, 60); };
console.log(await t('/'));
console.log(await t('/graph/roads.bin'));
console.log(await t('/api/data'));          // KV未設定 → 501
console.log(await t('/api/geocode'));       // q なし → 400
console.log(await t('/api/other'));
