// 住所 → 緯度経度 (国土地理院 住所検索を中継)
// GET /api/geocode?q=静岡県静岡市葵区籠上7-5
// 出典: 国土地理院 (https://maps.gsi.go.jp/)
export async function onRequestGet({ request }) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (!q) return json({ error: 'q が必要です' }, 400);
  const url = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q);
  const r = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) return json({ error: '国土地理院の住所検索に接続できません (' + r.status + ')' }, 502);
  const list = await r.json();
  const results = (Array.isArray(list) ? list : []).slice(0, 5).map((x) => ({
    lat: x.geometry.coordinates[1], lng: x.geometry.coordinates[0], title: x.properties && x.properties.title
  }));
  return json({ results, source: '国土地理院' }, 200, { 'Cache-Control': 'private, max-age=86400' });
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
