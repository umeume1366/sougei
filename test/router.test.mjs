import { buildGraph } from '../scripts/build-graph.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../public/router.js');
// 合成データ: 40x40 の格子(約100m間隔)。横の道は residential、縦の1本は primary、1本は一方通行、離れた孤立道路あり
const els = []; let id = 1; const nid = (i, j) => i * 1000 + j + 1;
const lat0 = 34.98, lng0 = 138.36, step = 0.0009;
for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) els.push({ type: 'node', id: nid(i, j), lat: lat0 + i * step, lon: lng0 + j * step * 1.1 });
for (let i = 0; i < 40; i++) els.push({ type: 'way', id: 100000 + i, nodes: [...Array(40).keys()].map((j) => nid(i, j)), tags: { highway: i === 20 ? 'primary' : 'residential' } });
for (let j = 0; j < 40; j++) els.push({ type: 'way', id: 200000 + j, nodes: [...Array(40).keys()].map((i) => nid(i, j)), tags: { highway: 'residential', ...(j === 5 ? { oneway: 'yes' } : {}) } });
els.push({ type: 'node', id: 9000001, lat: 35.2, lon: 138.9 }, { type: 'node', id: 9000002, lat: 35.201, lon: 138.9 });
els.push({ type: 'way', id: 999, nodes: [9000001, 9000002], tags: { highway: 'residential' } });
els.push({ type: 'way', id: 998, nodes: [nid(0,0), nid(0,1)], tags: { highway: 'footway' } });
const g = buildGraph({ elements: els });
console.log('nodes', g.nodes, 'edges', g.edges, 'dropped', g.droppedNodes, 'bytes', g.buf.byteLength);
console.assert(g.nodes === 1600 && g.droppedNodes === 2, 'component filter');
const r = R.load(g.buf);
const pts = [{ lat: lat0 + 20 * step, lng: lng0 + 20 * step * 1.1 }, { lat: lat0, lng: lng0 }, { lat: lat0 + 39 * step + 0.0002, lng: lng0 + 39 * step * 1.1 }, { lat: lat0 + 10 * step, lng: lng0 + 5 * step * 1.1 }];
const t0 = performance.now(); const M = r.matrix(pts); const dt = performance.now() - t0;
console.log('time(min)', M.time.map((row) => row.map((x) => x == null ? 'x' : x.toFixed(1)).join(' ')));
console.log('km', M.dist.map((row) => row.map((x) => x == null ? 'x' : x.toFixed(2)).join(' ')), 'snap', M.snap, dt.toFixed(1) + 'ms');
const p = r.path([pts[1], pts[2]]); console.log('path pts', p.length);
// 直線距離との比較: 0→1 の道路距離は マンハッタン距離 程度
console.assert(M.dist[1][2] > 5 && M.dist[1][2] < 9, 'distance plausible');
// 大きめのグラフで速度確認 (300x300 = 9万点)
{
  const E = []; const N = 300; const id2 = (i, j) => i * N + j + 1;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) E.push({ type: 'node', id: id2(i, j), lat: 34.9 + i * 0.0005, lon: 138.3 + j * 0.0006 });
  for (let i = 0; i < N; i++) { E.push({ type: 'way', id: 1e7 + i, nodes: [...Array(N).keys()].map((j) => id2(i, j)), tags: { highway: i % 20 ? 'residential' : 'secondary' } }); E.push({ type: 'way', id: 2e7 + i, nodes: [...Array(N).keys()].map((j) => id2(j, i)), tags: { highway: i % 20 ? 'residential' : 'secondary' } }); }
  const G = buildGraph({ elements: E }); const RR = R.load(G.buf);
  const P = Array.from({ length: 20 }, (_, k) => ({ lat: 34.9 + ((k * 37) % 290) * 0.0005, lng: 138.3 + ((k * 53) % 290) * 0.0006 }));
  const s = performance.now(); RR.matrix(P); console.log(`90k nodes, 20 points matrix: ${(performance.now() - s).toFixed(0)}ms, ${(G.buf.byteLength/1048576).toFixed(1)}MB`);
}
