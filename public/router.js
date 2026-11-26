/*!
 * ブラウザ内 経路計算エンジン
 * scripts/build-graph.mjs が作った道路グラフ(roads.bin)を読み込み、
 * ダイクストラ法で 地点間の所要時間行列 と 道路に沿ったルート形状 を計算します。
 * ブラウザ(Web Worker) / Node.js 両対応。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SougeiRouter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SNAP_SPEED_MS = 15 / 3.6; // 道路から家の前までは時速15kmで移動するとみなす

  function load(buffer) {
    const dv = new DataView(buffer);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== 'SGR1') throw new Error('道路データの形式が違います');
    const n = dv.getUint32(4, true), m = dv.getUint32(8, true);
    let o = 12;
    const LAT = new Int32Array(buffer, o, n); o += n * 4;
    const LNG = new Int32Array(buffer, o, n); o += n * 4;
    const OFF = new Uint32Array(buffer, o, n + 1); o += (n + 1) * 4;
    const TGT = new Uint32Array(buffer, o, m); o += m * 4;
    const TIME = new Uint16Array(buffer, o, m); o += m * 2;
    const DIST = new Uint16Array(buffer, o, m);

    // 最寄りノード検索用の格子(約200m)
    const CELL = 2000; // 1e-6度単位で0.002度
    const grid = new Map();
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(LAT[i] / CELL) * 100000 + Math.floor(LNG[i] / CELL);
      let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i);
      if (LAT[i] < minLat) minLat = LAT[i]; if (LAT[i] > maxLat) maxLat = LAT[i];
      if (LNG[i] < minLng) minLng = LNG[i]; if (LNG[i] > maxLng) maxLng = LNG[i];
    }
    // 出次数0のノード(一方通行の行き止まり等)には吸着させない
    const hasOut = (i) => OFF[i + 1] > OFF[i];

    function hav(aLat, aLng, bLat, bLng) {
      const R = 6371000, r = Math.PI / 180;
      const x = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLng - aLng) * r / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(x));
    }
    function snap(p) {
      const la = Math.round(p.lat * 1e6), ln = Math.round(p.lng * 1e6);
      const cy = Math.floor(la / CELL), cx = Math.floor(ln / CELL);
      let best = -1, bd = Infinity;
      for (let r = 0; r <= 6 && (best < 0 || r <= 1); r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
          const a = grid.get((cy + dy) * 100000 + (cx + dx)); if (!a) continue;
          for (const i of a) {
            if (!hasOut(i)) continue;
            const d = hav(p.lat, p.lng, LAT[i] / 1e6, LNG[i] / 1e6);
            if (d < bd) { bd = d; best = i; }
          }
        }
      }
      return { node: best, dist: bd };
    }

    // ---- ダイクストラ(二分ヒープ) ----
    const dist = new Float64Array(n), prev = new Int32Array(n), prevE = new Int32Array(n), stamp = new Uint32Array(n);
    let gen = 0;
    const heapN = new Int32Array(Math.max(16, m + 1)), heapD = new Float64Array(Math.max(16, m + 1)); let hs = 0;
    function push(v, d) { let i = hs++; while (i > 0) { const p = (i - 1) >> 1; if (heapD[p] <= d) break; heapN[i] = heapN[p]; heapD[i] = heapD[p]; i = p; } heapN[i] = v; heapD[i] = d; }
    function pop() {
      const v = heapN[0], last = --hs; const ln = heapN[last], ld = heapD[last]; let i = 0;
      while (true) { let c = 2 * i + 1; if (c >= hs) break; if (c + 1 < hs && heapD[c + 1] < heapD[c]) c++; if (heapD[c] >= ld) break; heapN[i] = heapN[c]; heapD[i] = heapD[c]; i = c; }
      heapN[i] = ln; heapD[i] = ld; return v;
    }
    /** src から targets すべてに到達したら打ち切り */
    function dijkstra(src, targets) {
      gen++; hs = 0;
      stamp[src] = gen; dist[src] = 0; prev[src] = -1; prevE[src] = -1; push(src, 0);
      const need = new Set(targets); need.delete(src);
      while (hs > 0) {
        const d0 = heapD[0]; const u = pop();
        if (d0 > dist[u]) continue;
        if (need.size && need.has(u)) { need.delete(u); if (!need.size) break; }
        for (let e = OFF[u], end = OFF[u + 1]; e < end; e++) {
          const v = TGT[e], nd = d0 + TIME[e];
          if (stamp[v] !== gen || nd < dist[v]) { stamp[v] = gen; dist[v] = nd; prev[v] = u; prevE[v] = e; push(v, nd); }
        }
      }
    }
    const reached = (v) => stamp[v] === gen;
    function trace(src, dst) {
      // dst から prev を辿って距離(m)と経路を返す
      let meters = 0; const path = [];
      for (let v = dst; v !== -1 && v !== undefined; v = prev[v]) { path.push(v); if (prevE[v] >= 0) meters += DIST[prevE[v]]; if (v === src) break; }
      return { meters, path: path.reverse() };
    }

    /** points:[{lat,lng}] → { time:[[分]], dist:[[km]], snap:[{dist(m)}] } */
    function matrix(points) {
      const s = points.map(snap);
      const k = points.length;
      const time = [], km = [];
      const targets = s.map((x) => x.node);
      for (let i = 0; i < k; i++) {
        time.push(new Array(k).fill(0)); km.push(new Array(k).fill(0));
        if (s[i].node < 0) continue;
        dijkstra(s[i].node, targets);
        for (let j = 0; j < k; j++) {
          if (i === j) continue;
          const t = s[j].node;
          if (t < 0 || !reached(t)) { time[i][j] = null; km[i][j] = null; continue; }
          const access = (s[i].dist + s[j].dist) / SNAP_SPEED_MS;
          time[i][j] = (dist[t] / 10 + access) / 60;
          km[i][j] = (trace(s[i].node, t).meters + s[i].dist + s[j].dist) / 1000;
        }
      }
      return { time, dist: km, snap: s.map((x) => ({ meters: Math.round(x.dist) })) };
    }

    /** 経由地を順に結ぶ道路沿いの線 [{lat,lng}] */
    function path(points) {
      const s = points.map(snap); const out = [];
      for (let i = 0; i < points.length - 1; i++) {
        out.push(points[i]);
        const a = s[i].node, b = s[i + 1].node;
        if (a < 0 || b < 0) continue;
        dijkstra(a, [b]);
        if (!reached(b)) continue;
        for (const v of trace(a, b).path) out.push({ lat: LAT[v] / 1e6, lng: LNG[v] / 1e6 });
      }
      out.push(points[points.length - 1]);
      return out;
    }

    return {
      nodes: n, edges: m, matrix, path, snap,
      bounds: { s: minLat / 1e6, n: maxLat / 1e6, w: minLng / 1e6, e: maxLng / 1e6 }
    };
  }

  return { load };
});

// ---- Web Worker として動く場合 ----
if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof importScripts === 'function') {
  let R = null;
  self.onmessage = async (ev) => {
    const { id, type, url, points } = ev.data;
    try {
      if (type === 'load') {
        const r = await fetch(url); if (!r.ok) throw new Error('道路データがありません (' + r.status + ')');
        R = self.SougeiRouter.load(await r.arrayBuffer());
        self.postMessage({ id, ok: true, result: { nodes: R.nodes, edges: R.edges, bounds: R.bounds } });
      } else if (type === 'matrix') self.postMessage({ id, ok: true, result: R.matrix(points) });
      else if (type === 'path') self.postMessage({ id, ok: true, result: R.path(points) });
    } catch (e) { self.postMessage({ id, ok: false, error: e.message }); }
  };
}
