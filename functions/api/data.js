// 利用者・車両・配車結果の保存 (Cloudflare KV)
// GET  /api/data            → { data, version }
// PUT  /api/data  (If-Match: <version>)  → { version }   他の人が先に保存していたら 409
//
// 利用者の住所や介助情報は個人情報です。必ず Cloudflare Access でサイト全体を保護してください。
// 環境変数 REQUIRE_ACCESS=1 にすると、Access を通っていないリクエストを拒否します。
const KEY = 'sougei:data';

export async function onRequest({ request, env }) {
  if (!env.SOUGEI_KV) return json({ error: 'KV(SOUGEI_KV)が設定されていません' }, 501);
  if (env.REQUIRE_ACCESS === '1' && !request.headers.get('Cf-Access-Jwt-Assertion')) return json({ error: 'ログインが必要です' }, 401);

  if (request.method === 'GET') {
    const { value, metadata } = await env.SOUGEI_KV.getWithMetadata(KEY, 'json');
    return json({ data: value, version: metadata?.version || null, updatedBy: metadata?.by || null, updatedAt: metadata?.at || null });
  }
  if (request.method === 'PUT') {
    const cur = await env.SOUGEI_KV.getWithMetadata(KEY);
    const curVer = cur.metadata?.version || null;
    const ifMatch = request.headers.get('If-Match');
    if (curVer && ifMatch !== curVer) return json({ error: '他の端末で更新されています', version: curVer }, 409);
    const body = await request.text();
    if (body.length > 20 * 1024 * 1024) return json({ error: 'データが大きすぎます' }, 413);
    try { JSON.parse(body); } catch { return json({ error: 'JSONではありません' }, 400); }
    const version = crypto.randomUUID();
    const by = request.headers.get('Cf-Access-Authenticated-User-Email') || '';
    await env.SOUGEI_KV.put(KEY, body, { metadata: { version, by, at: new Date().toISOString() } });
    // 履歴を30日残す(誤操作からの復旧用)
    await env.SOUGEI_KV.put(KEY + ':history:' + Date.now(), body, { expirationTtl: 60 * 60 * 24 * 30, metadata: { by } });
    return json({ version });
  }
  return json({ error: 'Method Not Allowed' }, 405);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
