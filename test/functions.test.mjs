import { onRequest } from '../functions/api/data.js';
const store = new Map();
const KV = {
  async getWithMetadata(k, t) { const v = store.get(k); if (!v) return { value: null, metadata: null }; return { value: t === 'json' ? JSON.parse(v.body) : v.body, metadata: v.meta }; },
  async put(k, body, o = {}) { store.set(k, { body, meta: o.metadata }); }
};
const env = { SOUGEI_KV: KV, REQUIRE_ACCESS: '0' };
const req = (method, body, headers = {}) => ({ request: new Request('https://x/api/data', { method, body, headers }), env });
let r = await (await onRequest(req('GET'))).json(); console.log('empty GET', r);
r = await onRequest(req('PUT', JSON.stringify({ a: 1 }))); const v1 = (await r.json()).version; console.log('PUT1', r.status);
r = await onRequest(req('PUT', JSON.stringify({ a: 2 }), { 'If-Match': 'old' })); console.log('stale PUT', r.status);
r = await onRequest(req('PUT', JSON.stringify({ a: 3 }), { 'If-Match': v1 })); console.log('PUT2', r.status);
r = await (await onRequest(req('GET'))).json(); console.log('GET', r.data);
env.REQUIRE_ACCESS = '1'; r = await onRequest(req('GET')); console.log('no access', r.status);
console.log('history keys', [...store.keys()].filter(k => k.includes('history')).length);
