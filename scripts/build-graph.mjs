#!/usr/bin/env node
/**
 * 道路ネットワーク作成スクリプト
 * ------------------------------------------------------------
 * OpenStreetMap の道路データ(Overpass API)から、施設周辺の車道だけを取り出し、
 * ブラウザで経路計算できる小さなバイナリ(public/graph/roads.bin)にします。
 *
 * 使い方:
 *   node scripts/build-graph.mjs                       # config の施設中心・半径で作成
 *   node scripts/build-graph.mjs --lat 34.9895 --lng 138.3712 --radius 12
 *   node scripts/build-graph.mjs --input roads.osm.json  # 取得済みのOverpass JSONから作成
 *
 * 出力:
 *   public/graph/roads.bin   … 道路グラフ(下記フォーマット)
 *   public/graph/meta.json   … 作成日・範囲・件数・出典
 *
 * バイナリ形式 (リトルエンディアン)
 *   'SGR1' | nNodes u32 | nEdges u32
 *   lat i32[n] (1e-6度) | lng i32[n] | offset u32[n+1] | target u32[m] | time u16[m] (0.1秒) | dist u16[m] (m)
 *
 * データ出典: © OpenStreetMap contributors (ODbL)
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));

// 施設: デイサービス籠上の湯 (おおよその位置。必要に応じて --lat --lng で上書き)
const LAT = +(args.lat ?? 34.9895), LNG = +(args.lng ?? 138.3712);
const RADIUS_KM = +(args.radius ?? 12);
const OUT = resolve(ROOT, args.out ?? 'public/graph');
const OVERPASS = args.overpass ?? 'https://overpass-api.de/api/interpreter';

// 道路種別ごとの想定速度(km/h)。市街地の送迎を想定した控えめな値
export const SPEED = {
  motorway: 80, motorway_link: 45, trunk: 45, trunk_link: 35, primary: 35, primary_link: 30,
  secondary: 30, secondary_link: 25, tertiary: 27, tertiary_link: 22, unclassified: 22,
  residential: 18, living_street: 10, service: 10, road: 15
};
const NO_ACCESS = new Set(['no', 'private', 'agricultural', 'forestry', 'delivery']);

function bbox(lat, lng, km) {
  const dLat = km / 111.0, dLng = km / (111.0 * Math.cos(lat * Math.PI / 180));
  return { s: lat - dLat, w: lng - dLng, n: lat + dLat, e: lng + dLng };
}

async function fetchOverpass(b) {
  const types = Object.keys(SPEED).join('|');
  const q = `[out:json][timeout:300];way["highway"~"^(${types})$"](${b.s},${b.w},${b.n},${b.e});(._;>;);out body qt;`;
  console.log('Overpass APIから道路データを取得中…', OVERPASS);
  const r = await fetch(OVERPASS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'sougei-graph-builder' }, body: 'data=' + encodeURIComponent(q) });
  if (!r.ok) throw new Error('Overpass API ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}

function speedOf(tags) {
  let v = SPEED[tags.highway];
  if (tags.highway === 'service' && ['parking_aisle', 'drive-through'].includes(tags.service)) return 0;
  const ms = parseFloat(tags.maxspeed);
  if (isFinite(ms) && ms > 0) v = Math.min(v * 1.2, Math.max(8, ms * 0.75)); // 規制速度の75%程度を目安
  return v;
}
function onewayOf(tags) {
  const o = tags.oneway;
  if (o === 'yes' || o === '1' || o === 'true') return 1;
  if (o === '-1' || o === 'reverse') return -1;
  if (o === 'no') return 0;
  if (tags.junction === 'roundabout' || tags.highway === 'motorway' || tags.highway === 'motorway_link') return 1;
  return 0;
}
function hav(aLat, aLng, bLat, bLng) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLng - aLng) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function buildGraph(osm) {
  const nodePos = new Map();
  for (const e of osm.elements) if (e.type === 'node') nodePos.set(e.id, [e.lat, e.lon]);
  const idx = new Map(); const lat = [], lng = [];
  const id = (osmId) => { let i = idx.get(osmId); if (i === undefined) { i = lat.length; idx.set(osmId, i); const p = nodePos.get(osmId); lat.push(p[0]); lng.push(p[1]); } return i; };
  const edges = []; // [from, to, timeSec, distM]
  let ways = 0;
  for (const w of osm.elements) {
    if (w.type !== 'way' || !w.tags || !SPEED[w.tags.highway]) continue;
    const t = w.tags;
    if (NO_ACCESS.has(t.access) || NO_ACCESS.has(t.motor_vehicle) || NO_ACCESS.has(t.vehicle) || t.area === 'yes') continue;
    const v = speedOf(t); if (!v) continue;
    const ow = onewayOf(t);
    const nds = w.nodes.filter((n) => nodePos.has(n));
    if (nds.length < 2) continue;
    ways++;
    for (let k = 0; k < nds.length - 1; k++) {
      const a = id(nds[k]), b = id(nds[k + 1]);
      const d = hav(lat[a], lng[a], lat[b], lng[b]);
      const sec = d / (v / 3.6);
      if (ow >= 0) edges.push([a, b, sec, d]);
      if (ow <= 0) edges.push([b, a, sec, d]);
    }
  }
  // 最大連結成分だけ残す(孤立した道路に吸着して到達不能になるのを防ぐ)
  const n0 = lat.length; const parent = new Int32Array(n0).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const [a, b] of edges) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  const size = new Map(); for (let i = 0; i < n0; i++) { const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
  let best = -1, bs = 0; for (const [r, s] of size) if (s > bs) { bs = s; best = r; }
  const remap = new Int32Array(n0).fill(-1); let n = 0;
  for (let i = 0; i < n0; i++) if (find(i) === best) remap[i] = n++;
  const E = edges.filter(([a, b]) => remap[a] >= 0 && remap[b] >= 0).map(([a, b, s, d]) => [remap[a], remap[b], s, d]);
  E.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const m = E.length;
  const buf = new ArrayBuffer(12 + n * 8 + (n + 1) * 4 + m * 4 + m * 4);
  const dv = new DataView(buf); dv.setUint8(0, 83); dv.setUint8(1, 71); dv.setUint8(2, 82); dv.setUint8(3, 49);
  dv.setUint32(4, n, true); dv.setUint32(8, m, true);
  let o = 12;
  const LAT = new Int32Array(buf, o, n); o += n * 4; const LNG = new Int32Array(buf, o, n); o += n * 4;
  const OFF = new Uint32Array(buf, o, n + 1); o += (n + 1) * 4; const TGT = new Uint32Array(buf, o, m); o += m * 4;
  const TIME = new Uint16Array(buf, o, m); o += m * 2; const DIST = new Uint16Array(buf, o, m);
  for (let i = 0; i < n0; i++) if (remap[i] >= 0) { LAT[remap[i]] = Math.round(lat[i] * 1e6); LNG[remap[i]] = Math.round(lng[i] * 1e6); }
  let e = 0;
  for (let i = 0; i < n; i++) { OFF[i] = e; while (e < m && E[e][0] === i) { TGT[e] = E[e][1]; TIME[e] = Math.min(65535, Math.max(1, Math.round(E[e][2] * 10))); DIST[e] = Math.min(65535, Math.round(E[e][3])); e++; } }
  OFF[n] = m;
  return { buf, nodes: n, edges: m, ways, droppedNodes: n0 - n };
}

async function main() {
  const b = bbox(LAT, LNG, RADIUS_KM);
  const osm = args.input ? JSON.parse(await readFile(resolve(process.cwd(), args.input), 'utf8')) : await fetchOverpass(b);
  const g = buildGraph(osm);
  await mkdir(OUT, { recursive: true });
  await writeFile(resolve(OUT, 'roads.bin'), Buffer.from(g.buf));
  const meta = { built: new Date().toISOString(), center: { lat: LAT, lng: LNG }, radiusKm: RADIUS_KM, bbox: b, nodes: g.nodes, edges: g.edges, ways: g.ways, bytes: g.buf.byteLength, speeds: SPEED, attribution: '© OpenStreetMap contributors (ODbL)' };
  await writeFile(resolve(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`作成しました: 交差点・点 ${g.nodes.toLocaleString()} / 区間 ${g.edges.toLocaleString()} / ${(g.buf.byteLength / 1048576).toFixed(1)}MB (孤立部分 ${g.droppedNodes} 点を除外)`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
