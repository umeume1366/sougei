/* デイサービス送迎システム - 画面ロジック */
(() => {
'use strict';
const O = window.SougeiOptimizer;
const DEMO = !!window.SOUGEI_DEMO;
const DEMO_AUTO = DEMO && !localStorage_has();
function localStorage_has() { try { return !!localStorage.getItem('sougei-cf-v1'); } catch { return false; } }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => p + Math.random().toString(36).slice(2, 9);
const COLORS = ['#1a73e8', '#d93025', '#188038', '#e37400', '#9334e6', '#12b5cb', '#e52592', '#795548', '#5f6368', '#f9ab00'];
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const ICON = {
  wc: '<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px;fill:currentColor"><circle cx="12" cy="4" r="2"/><path d="M19 13v-2c-1.54.02-3.09-.75-4.07-1.83l-1.29-1.43c-.17-.19-.38-.34-.61-.45-.01 0-.01-.01-.02-.01H13c-.35-.2-.75-.3-1.19-.26C10.76 7.11 10 8.04 10 9.09V15c0 1.1.9 2 2 2h5v5h2v-5.5c0-1.1-.9-2-2-2h-3v-3.45c1.29 1.07 3.25 1.94 5 1.95zm-6.17 5c-.41 1.16-1.52 2-2.83 2-1.66 0-3-1.34-3-3 0-1.31.84-2.41 2-2.83V12.1c-2.28.46-4 2.48-4 4.9 0 2.76 2.24 5 5 5 2.42 0 4.44-1.72 4.9-4h-2.07z"/></svg>',
  add: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>'
};

// ============================================================
// データ
// ============================================================
const STORE_KEY = 'sougei-cf-v1';
function localSave() { try { localStorage.setItem(STORE_KEY, payload()); } catch {} }
const store = {
  load() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; } },
  save() { localSave(); if (sync.on) { clearTimeout(sync.timer); sync.timer = setTimeout(syncPush, 1200); } }
};
function normalize(d) {
  d.matrixCache = {}; d.routeCache = {}; d.results ||= {}; d.absent ||= {};
  d.settings = Object.assign({ trafficFactor: 1.2, base: 'pale' }, d.settings || {});
  delete d.settings.apiKey; delete d.settings.mapId; delete d.settings.traffic;
  return d;
}

function sampleData() {
  // サンプル: 発着地点はデイサービス籠上の湯。利用者は架空の人物で、位置は町名付近のおおよその点
  const f = { name: 'デイサービス籠上の湯', address: '静岡県静岡市葵区籠上7-5', lat: 34.9895, lng: 138.3712 };
  const P = [
    ['青木 ハル', '葵区井宮町', 34.9935, 138.3650], ['石井 正雄', '葵区昭府', 35.0000, 138.3672], ['上田 キヨ', '葵区西草深町', 34.9832, 138.3812],
    ['江口 茂', '葵区安西', 34.9810, 138.3722], ['大野 トミ', '葵区新通', 34.9762, 138.3732], ['加藤 一郎', '葵区駒形通', 34.9728, 138.3782],
    ['木村 フミ', '葵区宮ケ崎町', 34.9838, 138.3768], ['工藤 勝', '葵区安東', 34.9872, 138.3918], ['佐々木 和子', '葵区安東', 34.9878, 138.3925],
    ['鈴木 実', '葵区北安東', 34.9925, 138.3918], ['高橋 タケ', '葵区城東町', 34.9822, 138.3932], ['田中 清', '葵区千代田', 34.9902, 138.4048],
    ['中村 ミツ', '葵区上足洗', 34.9982, 138.3978], ['西田 勇', '葵区唐瀬', 34.9968, 138.3832], ['野口 澄子', '葵区松富', 35.0052, 138.3722],
    ['原田 博', '葵区弥勒', 34.9792, 138.3662], ['藤井 静江', '駿河区中島', 34.9572, 138.3752], ['松本 昭', '葵区田町', 34.9792, 138.3692]
  ];
  const users = P.map(([n, town, lat, lng], i) => ({
    id: 'u' + (i + 1), name: n, address: '静岡県静岡市' + town, lat, lng,
    wheelchair: [2, 6, 11, 15].includes(i), boardMin: '', ready: i === 4 ? '08:45' : '', homeFrom: i === 9 ? '16:30' : '',
    maxRideMin: '', fixedVehicle: '', avoidVehicles: [], group: [7, 8].includes(i) ? '工藤・佐々木(同居)' : '',
    days: [[1, 3, 5], [1, 2, 3, 4, 5], [2, 4, 6], [1, 2, 3, 4, 5, 6]][i % 4], note: i === 2 ? '玄関スロープあり' : '', active: true
  }));
  users[8].days = users[7].days;
  const vehicles = [
    { id: 'v1', name: '1号車 ハイエース', seats: 7, wheelchairSlots: 1, maxTrips: 2, availableFrom: '08:00', availableUntil: '18:00', driver: '山田', active: true },
    { id: 'v2', name: '2号車 リフト車', seats: 3, wheelchairSlots: 2, maxTrips: 2, availableFrom: '08:00', availableUntil: '18:00', driver: '森', active: true },
    { id: 'v3', name: '3号車 ノア', seats: 6, wheelchairSlots: 0, maxTrips: 2, availableFrom: '08:15', availableUntil: '17:30', driver: '林', active: true },
    { id: 'v4', name: '4号車 軽', seats: 3, wheelchairSlots: 0, maxTrips: 1, availableFrom: '08:30', availableUntil: '17:00', driver: '池田', active: true }
  ];
  return {
    facility: f, users, vehicles, absent: {},
    settings: {
      trafficFactor: 1.2, base: 'pale', pickupTime: '09:30', dropoffTime: '16:00', defaultBoardMin: 3, wheelchairBoardMin: 7,
      depotMin: 5, turnaroundMin: 10, defaultMaxRideMin: 60, timeSec: 3,
      weights: { vehicle: 30, balance: 0.3, rideSum: 0.05 }
    },
    direction: 'pickup', results: {}, matrixCache: {}, routeCache: {}
  };
}

let S = normalize(store.load() || sampleData());
let curDate = new Date(); curDate.setMinutes(curDate.getMinutes() - curDate.getTimezoneOffset());
let dateStr = curDate.toISOString().slice(0, 10);
const hiddenVehicles = new Set();

const vColor = (vid) => { const i = S.vehicles.findIndex((v) => v.id === vid); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; };
const dowOf = (ds) => new Date(ds + 'T00:00:00').getDay();
function attendees() {
  const d = dowOf(dateStr), abs = new Set(S.absent[dateStr] || []);
  return S.users.filter((u) => u.active !== false && (u.days || []).includes(d) && !abs.has(u.id));
}
const resKey = () => dateStr + '|' + S.direction;

// ============================================================
// 地図 (MapLibre + 地理院タイル / 読み込めない場合は簡易地図)
// ============================================================
let map = null; // { setData, drawRoutes, fit, focus, onClick, highlight, setBase }
const TILES = {
  pale: { name: '淡色', url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png' },
  std: { name: '標準', url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png' },
  photo: { name: '写真', url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg' }
};
const GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
const OSM_ATTR = '道路網 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
const PIN_HTML = `<div style="display:flex;flex-direction:column;align-items:center"><div style="background:#ea4335;color:#fff;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;display:grid;place-items:center;box-shadow:0 2px 4px rgba(0,0,0,.4)"><svg viewBox="0 0 24 24" width="18" height="18" style="transform:rotate(45deg);fill:#fff"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div></div>`;

function MapLibreView(el) {
  const ml = window.maplibregl;
  const base = TILES[S.settings.base] ? S.settings.base : 'pale';
  const m = new ml.Map({
    container: el, center: [S.facility.lng, S.facility.lat], zoom: 13, maxZoom: 18, minZoom: 5, attributionControl: false,
    style: { version: 8, sources: { base: { type: 'raster', tiles: [TILES[base].url], tileSize: 256, maxzoom: 18, attribution: GSI_ATTR } }, layers: [{ id: 'base', type: 'raster', source: 'base' }] }
  });
  m.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');
  m.addControl(new ml.AttributionControl({ compact: false, customAttribution: OSM_ATTR }), 'bottom-right');
  m.dragRotate.disable(); m.touchZoomRotate.disableRotation();
  const loaded = new Promise((res) => m.on('load', () => {
    m.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#000', 'line-opacity': 0.25, 'line-width': 9 } });
    m.addLayer({ id: 'routes-line', type: 'line', source: 'routes', filter: ['!=', ['get', 'straight'], true], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5 } });
    m.addLayer({ id: 'routes-dash', type: 'line', source: 'routes', filter: ['==', ['get', 'straight'], true], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [2, 1.5] } });
    res();
  }));
  let markers = [], byId = new Map(), clickCb = null, popup = null;
  m.on('click', (e) => clickCb && clickCb({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
  const pop = (p, html) => { popup && popup.remove(); popup = new ml.Popup({ offset: 18, closeButton: false, maxWidth: '260px' }).setLngLat([p.lng, p.lat]).setHTML(html).addTo(m); };
  function mk(p, html, onclick, z) {
    const d = document.createElement('div'); d.innerHTML = html; const node = d.firstElementChild; if (z) node.style.zIndex = z;
    node.addEventListener('click', (e) => { e.stopPropagation(); onclick(); });
    const mm = new ml.Marker({ element: node, anchor: html === PIN_HTML ? 'bottom' : 'center' }).setLngLat([p.lng, p.lat]).addTo(m);
    mm._node = node; return mm;
  }
  return {
    setData(fac, pts) {
      markers.forEach((x) => x.remove()); markers = []; byId.clear();
      markers.push(mk(fac, PIN_HTML, () => pop(fac, `<b>${esc(fac.name)}</b><br>${esc(fac.address)}`), 5));
      for (const p of pts) {
        const mm = mk(p, `<div class="mk ${p.color ? '' : 'plain'}" style="${p.color ? 'background:' + p.color : ''}">${esc(p.label ?? '')}</div>`, () => {
          pop(p, `<div style="font:13px Roboto,'Noto Sans JP',sans-serif;min-width:150px"><b style="font-size:14px">${esc(p.title)}</b><br>${esc(p.sub || '')}</div>`); p.onClick && p.onClick();
        });
        markers.push(mm); byId.set(p.id, mm);
      }
    },
    drawRoutes(routes) {
      loaded.then(() => m.getSource('routes').setData({ type: 'FeatureCollection', features: routes.map((r) => ({ type: 'Feature', properties: { color: r.color, straight: !!r.straight }, geometry: { type: 'LineString', coordinates: r.path.map((p) => [+p.lng, +p.lat]) } })) }));
    },
    fit(points) {
      if (!points.length) return;
      const b = new ml.LngLatBounds(); points.forEach((p) => b.extend([+p.lng, +p.lat]));
      const open = !document.body.classList.contains('collapsed'), mob = innerWidth <= 760;
      m.fitBounds(b, { padding: { left: !mob && open ? 430 : 40, right: 60, top: 80, bottom: mob && open ? innerHeight * 0.62 + 20 : 60 }, maxZoom: 16, duration: 400 });
    },
    focus(p) { m.easeTo({ center: [+p.lng, +p.lat], zoom: Math.max(m.getZoom(), 15) }); },
    highlight(id, on) { const x = byId.get(id); if (x) x._node.classList.toggle('hl', on); },
    onClick(cb) { clickCb = cb; },
    setBase(k) {
      if (!TILES[k]) return;
      loaded.then(() => { m.removeLayer('base'); m.removeSource('base'); m.addSource('base', { type: 'raster', tiles: [TILES[k].url], tileSize: 256, maxzoom: 18, attribution: GSI_ATTR }); m.addLayer({ id: 'base', type: 'raster', source: 'base' }, 'routes-casing'); });
    }
  };
}

// ---------- デモ用の架空の街並み (道路・川・公園) ----------
let BASE = null;
function buildBasemap(c) {
  let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const L = { lat0: c.lat - 0.07, lat1: c.lat + 0.07, lng0: c.lng - 0.1, lng1: c.lng + 0.1 };
  const minor = [], major = [], hw = [], parks = [], labels = [];
  // 細街路: ゆがんだ格子
  for (let la = L.lat0; la < L.lat1; la += 0.0032 + r() * 0.0016) {
    const pts = []; let off = (r() - 0.5) * 0.001;
    for (let ln = L.lng0; ln <= L.lng1 + 0.01; ln += 0.01) { off += (r() - 0.5) * 0.0008; pts.push({ lat: la + off, lng: ln }); }
    minor.push(pts);
  }
  for (let ln = L.lng0; ln < L.lng1; ln += 0.0038 + r() * 0.002) {
    const pts = []; let off = (r() - 0.5) * 0.001;
    for (let la = L.lat0; la <= L.lat1 + 0.01; la += 0.01) { off += (r() - 0.5) * 0.0008; pts.push({ lat: la, lng: ln + off }); }
    minor.push(pts);
  }
  // 幹線道路
  const line = (a, b, n = 12, w = 0.002) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return { lat: a.lat + (b.lat - a.lat) * t + Math.sin(t * 5 + a.lat) * w, lng: a.lng + (b.lng - a.lng) * t + Math.cos(t * 4 + a.lng) * w }; });
  major.push(line({ lat: L.lat0, lng: c.lng - 0.012 }, { lat: L.lat1, lng: c.lng + 0.006 }));
  major.push(line({ lat: c.lat + 0.004, lng: L.lng0 }, { lat: c.lat - 0.006, lng: L.lng1 }));
  major.push(line({ lat: L.lat0, lng: c.lng - 0.07 }, { lat: L.lat1, lng: c.lng + 0.05 }, 12, 0.003));
  major.push(line({ lat: c.lat + 0.03, lng: L.lng0 }, { lat: c.lat + 0.022, lng: L.lng1 }));
  hw.push(line({ lat: L.lat0, lng: c.lng + 0.035 }, { lat: L.lat1, lng: c.lng + 0.045 }, 12, 0.004));
  hw.push(line({ lat: c.lat - 0.034, lng: L.lng0 }, { lat: c.lat - 0.02, lng: L.lng1 }, 12, 0.003));
  // 川: 施設の西側を南北に流れる安倍川をイメージ(おおよそ)
  const river = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return { lat: L.lat0 + (L.lat1 - L.lat0) * t, lng: c.lng - 0.0135 - t * 0.004 + Math.sin(t * 6) * 0.0025 }; });
  // 公園
  // 山(賤機山のイメージ): 施設の東側に南北に細長い緑地
  parks.push([{ lat: c.lat - 0.004, lng: c.lng + 0.0075 }, { lat: c.lat + 0.03, lng: c.lng + 0.0055 }, { lat: c.lat + 0.045, lng: c.lng + 0.0105 }, { lat: c.lat + 0.03, lng: c.lng + 0.0125 }, { lat: c.lat + 0.004, lng: c.lng + 0.0115 }]);
  // 駿府城公園のイメージ
  parks.push([{ lat: c.lat - 0.0135, lng: c.lng + 0.0105 }, { lat: c.lat - 0.0135, lng: c.lng + 0.0165 }, { lat: c.lat - 0.0082, lng: c.lng + 0.0165 }, { lat: c.lat - 0.0082, lng: c.lng + 0.0105 }]);
  for (let i = 0; i < 6; i++) {
    const p = { lat: c.lat + (r() - 0.5) * 0.09, lng: c.lng + 0.02 + r() * 0.06 }, w = 0.002 + r() * 0.004, h = 0.0015 + r() * 0.003;
    parks.push([{ lat: p.lat - h, lng: p.lng - w }, { lat: p.lat - h * 0.8, lng: p.lng + w }, { lat: p.lat + h, lng: p.lng + w * 0.9 }, { lat: p.lat + h * 1.1, lng: p.lng - w * 0.7 }]);
  }
  // 町名ラベル(利用者の住所の町名を、その付近に)
  const seen = new Set();
  for (const u of S.users) { const t = (u.address || '').replace(/^.*?市/, '').replace(/^.{1,3}区/, ''); if (!t || seen.has(t) || !isFinite(u.lat)) continue; seen.add(t); labels.push({ lat: +u.lat + 0.0022, lng: +u.lng + 0.001, t }); }
  return { minor, major, hw, river, parks, labels };
}
function basemapSVG(P, z) {
  if (!BASE) BASE = buildBasemap(S.facility);
  const d = (pts, close) => pts.map((p, i) => (i ? 'L' : 'M') + P(p).map((v) => v.toFixed(1)).join(',')).join('') + (close ? 'Z' : '');
  const k = Math.max(0.4, Math.min(2.2, (z - 11) / 3));
  const rw = (() => { const a = P({ lat: 0, lng: 0 }), b = P({ lat: 0, lng: 0.006 }); return Math.abs(b[0] - a[0]); })();
  let h = BASE.parks.map((p) => `<path d="${d(p, true)}" fill="#c8e6c9"/>`).join('');
  h += `<path d="${d(BASE.river)}" fill="none" stroke="#aadaff" stroke-width="${rw.toFixed(1)}" stroke-linecap="round"/>`;
  if (z >= 12.5) h += BASE.minor.map((p) => `<path d="${d(p)}" fill="none" stroke="#fff" stroke-width="${(1.6 * k).toFixed(1)}"/>`).join('');
  h += BASE.major.map((p) => `<path d="${d(p)}" fill="none" stroke="#dadce0" stroke-width="${(6 * k).toFixed(1)}" stroke-linecap="round"/><path d="${d(p)}" fill="none" stroke="#fff" stroke-width="${(4.4 * k).toFixed(1)}" stroke-linecap="round"/>`).join('');
  h += BASE.hw.map((p) => `<path d="${d(p)}" fill="none" stroke="#f0c048" stroke-width="${(7 * k).toFixed(1)}" stroke-linecap="round"/><path d="${d(p)}" fill="none" stroke="#fde293" stroke-width="${(5 * k).toFixed(1)}" stroke-linecap="round"/>`).join('');
  if (z >= 13) h += BASE.labels.map((l) => { const [x, y] = P(l); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="11" fill="#80868b" stroke="#f5f5f5" stroke-width="3" paint-order="stroke" text-anchor="middle">${esc(l.t)}</text>`; }).join('');
  const rl = BASE.river[Math.floor(BASE.river.length * 0.45)]; const [rx, ry] = P(rl);
  h += `<text x="${rx}" y="${ry + 4}" font-size="12" font-style="italic" fill="#4a8fd4" text-anchor="middle">安倍川</text>`;
  { const [mx, my] = P({ lat: S.facility.lat + 0.018, lng: S.facility.lng + 0.009 }); if (z >= 12.5) h += `<text x="${mx}" y="${my}" font-size="11" fill="#3c8a4a" text-anchor="middle" stroke="#c8e6c9" stroke-width="3" paint-order="stroke">賤機山</text>`; }
  return h;
}

function SimpleMapView(el) {
  // Webメルカトルの簡易地図 (タイルなし)。APIキー設定までの確認用
  el.innerHTML = `<div class="smap"${DEMO ? ' style="background:#f5f3ef"' : ''}><svg></svg><div class="note">${DEMO ? 'デモ用の架空の地図です（所要時間は直線距離から推定）' : '地図を読み込めないため簡易表示中'}</div><div class="zoom"><button aria-label="拡大">+</button><button aria-label="縮小">−</button></div></div>`;
  const box = el.firstElementChild, svg = $('svg', box);
  let z = 13, cx = S.facility.lng, cy = S.facility.lat, data = { fac: S.facility, pts: [] }, routes = [], clickCb = null, hl = null;
  const proj = (lat, lng) => { const s = 256 * 2 ** z; const x = (lng + 180) / 360 * s; const sin = Math.sin(lat * Math.PI / 180); const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s; return [x, y]; };
  const unproj = (x, y) => { const s = 256 * 2 ** z; const lng = x / s * 360 - 180; const n = Math.PI - 2 * Math.PI * y / s; return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng }; };
  function draw() {
    const W = box.clientWidth, H = box.clientHeight; const [ox, oy] = proj(cy, cx);
    const P = (p) => { const [x, y] = proj(p.lat, p.lng); return [x - ox + W / 2, y - oy + H / 2]; };
    let h = '';
    if (DEMO) { svg.innerHTML = ''; h += basemapSVG(P, z); }
    // 背景グリッド(道路風)
    const step = DEMO ? 1e9 : 256 / 4; const gx = ((-ox + W / 2) % step + step) % step, gy = ((-oy + H / 2) % step + step) % step;
    for (let x = gx; x < W; x += step) h += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#fff" stroke-width="3"/>`;
    for (let y = gy; y < H; y += step) h += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#fff" stroke-width="3"/>`;
    for (const r of routes) {
      const d = r.path.map((p, i) => (i ? 'L' : 'M') + P(p).map((v) => v.toFixed(1)).join(',')).join('');
      h += `<path d="${d}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="8" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${r.color}" stroke-width="4.5" stroke-linejoin="round" ${r.straight ? 'stroke-dasharray="8 5"' : ''}/>`;
    }
    for (const p of data.pts) {
      const [x, y] = P(p); const big = hl === p.id;
      h += `<g data-id="${esc(p.id)}" style="cursor:pointer" transform="translate(${x},${y}) scale(${big ? 1.35 : 1})"><circle r="12" fill="${p.color || '#5f6368'}" stroke="#fff" stroke-width="2"/><text text-anchor="middle" dy="4" font-size="11" font-weight="700" fill="#fff">${esc(p.label ?? '')}</text><title>${esc(p.title)}</title></g>`;
    }
    const [fx, fy] = P(data.fac);
    h += `<g transform="translate(${fx},${fy})"><path d="M0,0 C-4,-10 -14,-14 -14,-24 A14,14 0 1 1 14,-24 C14,-14 4,-10 0,0Z" fill="#ea4335" stroke="#fff" stroke-width="2"/><path d="M-5,-20v-5h-3l8,-7 8,7h-3v5h-3v-4h-4v4z" fill="#fff"/><text y="14" text-anchor="middle" font-size="12" font-weight="700" fill="#202124" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(data.fac.name)}</text></g>`;
    svg.innerHTML = h;
  }
  const ro = new ResizeObserver(draw); ro.observe(box);
  let drag = null, moved = false;
  box.addEventListener('pointerdown', (e) => { if (e.target.closest('.zoom')) return; drag = [e.clientX, e.clientY, ...proj(cy, cx)]; moved = false; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; const p = unproj(drag[2] - dx, drag[3] - dy); cx = p.lng; cy = p.lat; draw(); });
  box.addEventListener('pointerup', (e) => {
    const was = drag; drag = null; if (!was || moved) return;
    const g = e.target.closest('g[data-id]');
    if (g) { const p = data.pts.find((q) => q.id === g.dataset.id); if (p) { toast(p.title + (p.sub ? '　' + p.sub : '')); p.onClick && p.onClick(); } return; }
    const r = box.getBoundingClientRect(); const [ox, oy] = proj(cy, cx);
    clickCb && clickCb(unproj(ox + (e.clientX - r.left) - box.clientWidth / 2, oy + (e.clientY - r.top) - box.clientHeight / 2));
  });
  box.addEventListener('wheel', (e) => { e.preventDefault(); z = Math.max(8, Math.min(18, z + (e.deltaY < 0 ? 0.5 : -0.5))); draw(); }, { passive: false });
  const [zin, zout] = $$('.zoom button', box);
  zin.onclick = () => { z = Math.min(18, z + 1); draw(); }; zout.onclick = () => { z = Math.max(8, z - 1); draw(); };
  return {
    setData(fac, pts) { data = { fac, pts }; draw(); },
    drawRoutes(r) { routes = r; draw(); },
    fit(points) {
      if (!points.length) return; const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
      cy = (Math.min(...lats) + Math.max(...lats)) / 2; cx = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      const open = !document.body.classList.contains('collapsed'), mob = innerWidth <= 760;
      const W = box.clientWidth - (!mob && open ? 460 : 80), H = box.clientHeight - 160 - (mob && open ? innerHeight * 0.62 : 0);
      for (z = 17; z > 8; z -= 0.5) { const a = proj(Math.max(...lats), Math.min(...lngs)), b = proj(Math.min(...lats), Math.max(...lngs)); if (b[0] - a[0] < W && b[1] - a[1] < H) break; }
      if (!mob && open) { const [x, y] = proj(cy, cx); const p = unproj(x - 200, y); cx = p.lng; }
      if (mob && open) { const [x, y] = proj(cy, cx); const p = unproj(x, y + innerHeight * 0.31); cy = p.lat; }
      draw();
    },
    focus(p) { cx = p.lng; cy = p.lat; if (z < 15) z = 15; draw(); },
    highlight(id, on) { hl = on ? id : null; draw(); },
    onClick(cb) { clickCb = cb; },
    google: false
  };
}

// ============================================================
// 経路計算 (ブラウザ内・OpenStreetMap道路網) / 住所検索 (国土地理院) / データ共有 (Cloudflare KV)
// ============================================================
const router = { worker: null, ready: false, info: null, meta: null, error: null, seq: 0, wait: new Map() };
function routerCall(type, payload) {
  return new Promise((res, rej) => { const id = ++router.seq; router.wait.set(id, { res, rej }); router.worker.postMessage({ id, type, ...payload }); });
}
async function initRouter() {
  try {
    router.worker = new Worker('router.js');
    router.worker.onmessage = (e) => { const w = router.wait.get(e.data.id); if (!w) return; router.wait.delete(e.data.id); e.data.ok ? w.res(e.data.result) : w.rej(new Error(e.data.error)); };
    router.worker.onerror = (e) => { router.error = e.message || 'Worker error'; router.wait.forEach((w) => w.rej(new Error(router.error))); router.wait.clear(); };
    router.info = await routerCall('load', { url: new URL('graph/roads.bin', location.href).href });
    try { router.meta = await (await fetch('graph/meta.json', { cache: 'no-cache' })).json(); } catch {}
    router.ready = true;
    renderMap(false);
  } catch (e) { router.error = e.message; console.warn('道路データを使わず、直線距離で推定します:', e.message); }
  renderSettings();
}

async function getMatrix(points) {
  const est = O.estimateMatrix(points);
  if (!router.ready) return { time: est.time, dist: est.dist, source: '推定(直線距離)・道路データ未読込' };
  const r = await routerCall('matrix', { points: points.map((p) => ({ lat: +p.lat, lng: +p.lng })) });
  const f = +S.settings.trafficFactor || 1; let miss = 0;
  for (let i = 0; i < points.length; i++) for (let j = 0; j < points.length; j++) {
    if (i === j) continue;
    if (r.time[i][j] == null) { miss++; r.time[i][j] = est.time[i][j]; r.dist[i][j] = est.dist[i][j]; } else r.time[i][j] *= f;
  }
  const far = r.snap.map((s, i) => (s.meters > 300 ? points[i].name || '施設' : null)).filter(Boolean);
  if (far.length) toast(`道路データの範囲外か、道路から遠い地点があります: ${far.slice(0, 3).join('、')}${far.length > 3 ? ' ほか' : ''}`);
  return { time: r.time, dist: r.dist, source: `OpenStreetMap道路網・渋滞係数${f}${miss ? '・一部推定' : ''}` };
}

async function routePath(pts) {
  if (!router.ready) return { path: pts, straight: true };
  try { return { path: await routerCall('path', { points: pts.map((p) => ({ lat: +p.lat, lng: +p.lng })) }) }; }
  catch { return { path: pts, straight: true }; }
}

async function geocode(address) {
  if (!address) throw new Error('住所を入力してください');
  let list = null;
  try { const r = await fetch('api/geocode?q=' + encodeURIComponent(address)); if (r.ok) list = (await r.json()).results; } catch {}
  if (!list) {
    try {
      const r = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(address));
      list = (await r.json()).map((x) => ({ lat: x.geometry.coordinates[1], lng: x.geometry.coordinates[0], title: x.properties.title }));
    } catch {}
  }
  if (!list) throw new Error('住所検索に接続できません。「地図で指定」を使ってください');
  if (!list.length) throw new Error('住所が見つかりませんでした。「地図で指定」を使ってください');
  const g = list[0];
  return { lat: +(+g.lat).toFixed(6), lng: +(+g.lng).toFixed(6), formatted: g.title || address };
}

// ---- データ共有: Cloudflare KV (api/data)。使えない環境ではこのブラウザ内だけに保存 ----
const sync = { on: false, version: null, timer: null, status: 'このブラウザ内に保存', at: null };
const payload = () => JSON.stringify({ ...S, matrixCache: undefined, routeCache: undefined });
async function syncLoad(apply = true) {
  try {
    const r = await fetch('api/data', { cache: 'no-store' });
    if (r.status === 401) { sync.status = 'ログインが必要です'; return false; }
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return false;
    const j = await r.json();
    sync.on = true;
    if (j.data && apply && j.version !== sync.version) { S = normalize(Object.assign(sampleData(), j.data)); localSave(); }
    if (!j.data) { sync.version = null; await syncPush(); } else sync.version = j.version;
    sync.status = '職員間で共有中'; sync.at = j.updatedAt;
    return true;
  } catch { return false; }
}
async function syncPush() {
  clearTimeout(sync.timer); sync.timer = null;
  if (!sync.on) return;
  try {
    const r = await fetch('api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(sync.version ? { 'If-Match': sync.version } : {}) }, body: payload() });
    if (r.status === 409) { await syncLoad(); renderAll(false); toast('他の端末で更新されたため最新のデータに切り替えました。直前の変更をもう一度行ってください'); return; }
    if (!r.ok) throw new Error(r.status);
    sync.version = (await r.json()).version; sync.at = new Date().toISOString(); sync.status = '職員間で共有中';
  } catch (e) { sync.status = '共有サーバーに保存できませんでした（このブラウザには保存済み）'; }
  if ($('#syncTxt')) $('#syncTxt').textContent = syncText();
}
const syncText = () => sync.status + (sync.on && sync.at ? `・最終保存 ${new Date(sync.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '');
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !sync.on || sync.timer) return;
  const before = sync.version; await syncLoad();
  if (sync.version !== before && !editing) { renderAll(false); toast('他の端末での更新を読み込みました'); }
});

// ============================================================
// 最適化
// ============================================================
function buildProblem(list, matrix) {
  const dir = S.direction, st = S.settings;
  return {
    direction: dir, facilityTime: dir === 'pickup' ? st.pickupTime : st.dropoffTime, matrix,
    users: list.map((u) => ({ id: u.id, name: u.name, wheelchair: u.wheelchair, boardMin: u.boardMin, ready: dir === 'pickup' ? u.ready : null, homeFrom: dir === 'dropoff' ? u.homeFrom : null, maxRideMin: u.maxRideMin, fixedVehicle: u.fixedVehicle, avoidVehicles: u.avoidVehicles, group: u.group })),
    vehicles: S.vehicles.filter((v) => v.active !== false),
    settings: { defaultBoardMin: +st.defaultBoardMin, wheelchairBoardMin: +st.wheelchairBoardMin, depotMin: +st.depotMin, turnaroundMin: +st.turnaroundMin, defaultMaxRideMin: +st.defaultMaxRideMin, weights: st.weights }
  };
}

let lastProblem = null;
async function runOptimize() {
  const list = attendees().filter((u) => isFinite(u.lat) && isFinite(u.lng));
  const noPos = attendees().length - list.length;
  if (!list.length) return toast('この日の利用者がいません（利用者タブで曜日を確認）');
  if (!S.vehicles.some((v) => v.active !== false)) return toast('使用できる車両がありません');
  busy(true, '準備中…');
  try {
    const pts = [S.facility, ...list];
    busy(true, router.ready ? '道路網で所要時間を計算中…' : '所要時間を推定中…');
    const matrix = await getMatrix(pts);
    busy(true, '配車を最適化中…');
    await new Promise((r) => setTimeout(r, 30));
    const problem = buildProblem(list, { time: matrix.time, dist: matrix.dist });
    const res = O.optimize(problem, { timeMs: (+S.settings.timeSec || 3) * 1000, restarts: 4, seed: 7, coords: pts });
    res.matrixSource = matrix.source; res.createdAt = new Date().toISOString();
    S.results[resKey()] = { res, problem };
    lastProblem = problem; store.save();
    if (noPos) toast(`位置未設定の利用者 ${noPos}名を除外しました`);
    switchView('result'); renderAll(true);
  } catch (e) { console.error(e); toast('最適化に失敗しました: ' + e.message); }
  finally { busy(false); }
}

function moveStop(userId, value) {
  const cur = S.results[resKey()]; if (!cur) return;
  const [vid, trip] = value.split('#');
  const res = O.moveUser(cur.problem, cur.res.assignment, userId, vid, +trip);
  Object.assign(res, { matrixSource: cur.res.matrixSource, createdAt: cur.res.createdAt, manual: true, warnings: cur.res.warnings });
  cur.res = res; store.save(); renderAll(false);
  toast('手動で変更しました（時刻・違反は再計算済み）');
}

// ============================================================
// 描画
// ============================================================
function renderAll(fit) {
  $('#dirPick').classList.toggle('on', S.direction === 'pickup');
  $('#dirDrop').classList.toggle('on', S.direction === 'dropoff');
  $('#timeChip').textContent = S.direction === 'pickup' ? `施設着 ${S.settings.pickupTime}` : `施設発 ${S.settings.dropoffTime}`;
  renderResult(); renderUsers(); renderVehicles(); renderSettings(); renderMap(fit); renderLegend();
}

function currentRes() { return S.results[resKey()]?.res || null; }

function renderResult() {
  const el = $('#v-result'); const res = currentRes();
  const att = attendees(); const d = new Date(dateStr + 'T00:00:00');
  const head = `<div class="sec"><h2>${S.direction === 'pickup' ? '迎え' : '送り'}の配車</h2>
    <div class="muted">${d.getMonth() + 1}月${d.getDate()}日(${DOW[d.getDay()]})・利用予定 ${att.length}名・車両 ${S.vehicles.filter((v) => v.active !== false).length}台</div>
    ${res ? `<div class="kpis"><div class="kpi"><b>${res.summary.usedVehicles}台</b><span>使用車両</span></div><div class="kpi"><b>${res.summary.totalTravelMin}分</b><span>総走行時間</span></div><div class="kpi"><b>${res.summary.totalDistKm}km</b><span>総距離</span></div><div class="kpi"><b>${res.summary.maxRideMin}分</b><span>最長乗車</span></div></div>` : ''}</div>`;
  const actions = `<div class="actions" style="justify-content:space-around">
    <button class="round fill" data-a="opt"><span><svg viewBox="0 0 24 24"><path d="M21.71 11.29l-9-9a1 1 0 0 0-1.42 0l-9 9a1 1 0 0 0 0 1.42l9 9a1 1 0 0 0 1.42 0l9-9a1 1 0 0 0 0-1.42zM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/></svg></span>最適化</button>
    <button class="round" data-a="sheet"><span><svg viewBox="0 0 24 24"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg></span>送迎表</button>
    <button class="round" data-a="fit"><span><svg viewBox="0 0 24 24"><path d="M3 5v4h2V5h4V3H5a2 2 0 0 0-2 2zm2 10H3v4a2 2 0 0 0 2 2h4v-2H5v-4zm14 4h-4v2h4a2 2 0 0 0 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5a2 2 0 0 0-2-2z"/></svg></span>全体表示</button>
    <button class="round" data-a="absent"><span><svg viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-2 14-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg></span>出欠</button></div>`;
  if (!res) {
    el.innerHTML = head + actions + `<div class="sec muted">「配車を最適化」を押すと、${att.length}名の${S.direction === 'pickup' ? '迎え' : '送り'}ルートを自動で作成します。<br><br>欠席者は「出欠」から外せます。</div>`;
  } else {
    const byId = new Map(S.users.map((u) => [u.id, u]));
    const opts = S.vehicles.filter((v) => v.active !== false).flatMap((v) => Array.from({ length: +v.maxTrips || 1 }, (_, t) => `<option value="${esc(v.id)}#${t + 1}">${esc(v.name)} ${t + 1}便</option>`)).join('');
    const vio = res.violations.length
      ? `<div class="alert"><b>確認が必要な点 ${res.violations.length}件</b><ul>${res.violations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
      : `<div class="alert ok"><b>すべての条件を満たしています</b></div>`;
    const warn = (res.warnings || []).length ? `<div class="alert"><b>データの警告</b><ul>${res.warnings.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    const cards = res.vehicles.map((v) => {
      const c = vColor(v.vehicleId); const veh = S.vehicles.find((x) => x.id === v.vehicleId) || {};
      if (!v.trips.length) return `<div class="vcard" style="color:${c}"><div class="vhead"><span class="vdot" style="background:${c}"></span><b style="color:var(--ink)">${esc(v.vehicleName)}</b><span class="meta">未使用</span></div></div>`;
      const trips = v.trips.map((t) => {
        const fac = esc(S.facility.name);
        const rows = t.stops.map((s, i) => {
          const u = byId.get(s.userId) || {};
          const sel = `<select class="mv" data-u="${esc(s.userId)}" aria-label="車両変更"><option value="">車両変更…</option>${opts}</select>`;
          return `<li class="stop" data-u="${esc(s.userId)}"><span class="n">${i + 1}</span><div><div class="nm">${esc(s.name)}${s.wheelchair ? `<span class="tag wc">${ICON.wc} 車椅子</span>` : ''}${u.group ? `<span class="tag">${esc(u.group)}</span>` : ''}${s.flags.map((f) => `<span class="tag bad">${esc(f)}</span>`).join('')}</div><div class="ad">${esc(u.address || '')}${u.note ? '・' + esc(u.note) : ''}</div>${sel}</div><div class="tm">${s.time}<small>乗車${s.rideMin}分</small></div></li>`;
        }).join('');
        return `<div class="trip"><div class="triphead"><b>${t.trip}便</b><span>${t.depart}発 → ${t.arrive}着</span><span>${t.travelMin}分・${t.distKm}km</span><span>座席${t.seatsUsed}/${veh.seats ?? '-'}・車椅子${t.wheelchairsUsed}/${veh.wheelchairSlots ?? '-'}</span></div>
          <ul class="tl" style="--c:${c}"><li><span class="n dep"></span><div><div class="nm">${fac}</div><div class="ad">出発</div></div><div class="tm">${t.depart}</div></li>${rows}<li><span class="n dep"></span><div><div class="nm">${fac}</div><div class="ad">${S.direction === 'pickup' ? '到着' : '帰着'}</div></div><div class="tm">${t.arrive}</div></li></ul></div>`;
      }).join('');
      const tot = v.trips.reduce((a, t) => a + t.stops.length, 0);
      return `<div class="vcard"><div class="vhead" data-v="${esc(v.vehicleId)}" style="color:${c}"><span class="vdot" style="background:${c}"></span><div style="color:var(--ink)"><b>${esc(v.vehicleName)}</b><div class="muted" style="font-size:12px">${veh.driver ? '運転 ' + esc(veh.driver) + '・' : ''}${tot}名・${v.trips.length}便</div></div><span class="meta">${v.trips[0].depart} 〜 ${v.trips[v.trips.length - 1].arrive}</span></div>${trips}</div>`;
    }).join('');
    const foot = `<div class="sec muted" style="font-size:12px">所要時間: ${esc(res.matrixSource || '')}・計算 ${(res.elapsedMs / 1000 || 0).toFixed(1)}秒${res.manual ? '・手動調整あり' : ''}</div>`;
    el.innerHTML = head + actions + warn + vio + cards + foot;
  }
  el.onclick = (e) => {
    const a = e.target.closest('[data-a]'); if (a) return ({ opt: runOptimize, sheet: openSheet, fit: () => renderMap(true), absent: () => { switchView('users'); userFilter = 'today'; renderUsers(); } })[a.dataset.a]();
    if (e.target.closest('select')) return;
    const li = e.target.closest('li.stop'); if (li) { const u = S.users.find((x) => x.id === li.dataset.u); if (u) map.focus(u); }
  };
  $$('select.mv', el).forEach((s) => s.onchange = () => s.value && moveStop(s.dataset.u, s.value));
  $$('li.stop', el).forEach((li) => { li.onmouseenter = () => map.highlight(li.dataset.u, true); li.onmouseleave = () => map.highlight(li.dataset.u, false); });
}

let userFilter = 'today', userQuery = '', editing = null;
function renderUsers() {
  const el = $('#v-users');
  if (editing && editing.type === 'user') return renderUserForm(el);
  const att = new Set(attendees().map((u) => u.id)); const d = dowOf(dateStr); const abs = new Set(S.absent[dateStr] || []);
  let list = S.users;
  if (userFilter === 'today') list = list.filter((u) => (u.days || []).includes(d) && u.active !== false);
  if (userFilter === 'wc') list = list.filter((u) => u.wheelchair);
  if (userFilter === 'nopos') list = list.filter((u) => !isFinite(u.lat));
  if (userQuery) list = list.filter((u) => (u.name + u.address + (u.note || '')).includes(userQuery));
  el.innerHTML = `<div class="actions"><button class="btn fill" id="addUser">${ICON.add}利用者を追加</button><span class="muted" style="margin-left:auto;align-self:center">${att.size}名出席 / 登録${S.users.length}名</span></div>
    <div class="filter">${[['today', `${DOW[d]}曜の利用者`], ['all', 'すべて'], ['wc', '車椅子'], ['nopos', '位置未設定']].map(([k, l]) => `<button class="fchip ${userFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <ul class="list">${list.map((u) => {
      const today = (u.days || []).includes(d) && u.active !== false;
      return `<li data-id="${esc(u.id)}" class="${u.active === false ? 'off' : ''}"><span class="av" style="background:${u.wheelchair ? '#1a73e8' : '#8ab4f8'}">${esc(u.name.slice(0, 1))}</span>
      <div class="t"><b>${esc(u.name)}${u.wheelchair ? `<span class="tag wc">${ICON.wc} 車椅子</span>` : ''}${!isFinite(u.lat) ? '<span class="tag bad">位置未設定</span>' : ''}</b><small>${esc(u.address)}</small><small>${(u.days || []).map((x) => DOW[x]).join('・') || '曜日未設定'}${u.ready ? '・準備' + esc(u.ready) + '〜' : ''}${u.homeFrom ? '・在宅' + esc(u.homeFrom) + '〜' : ''}</small></div>
      ${today && userFilter === 'today' ? `<input type="checkbox" class="switch" data-att="${esc(u.id)}" ${abs.has(u.id) ? '' : 'checked'} title="この日の出欠" aria-label="${esc(u.name)}の出欠">` : ''}</li>`;
    }).join('') || '<li class="muted" style="cursor:default">該当する利用者がいません</li>'}</ul>`;
  $('#addUser').onclick = () => { editing = { type: 'user', data: { id: uid('u'), name: '', address: '', lat: NaN, lng: NaN, wheelchair: false, days: [1, 2, 3, 4, 5], avoidVehicles: [], active: true }, isNew: true }; renderUsers(); };
  $$('.fchip', el).forEach((b) => b.onclick = () => { userFilter = b.dataset.f; renderUsers(); });
  $$('.list li[data-id]', el).forEach((li) => li.onclick = (e) => {
    if (e.target.matches('.switch')) return;
    editing = { type: 'user', data: JSON.parse(JSON.stringify(S.users.find((u) => u.id === li.dataset.id))) }; renderUsers();
    const u = editing.data; if (isFinite(u.lat)) map.focus(u);
  });
  $$('.switch[data-att]', el).forEach((s) => s.onchange = () => {
    const a = new Set(S.absent[dateStr] || []); s.checked ? a.delete(s.dataset.att) : a.add(s.dataset.att);
    S.absent[dateStr] = [...a]; store.save(); renderResult(); renderMap(false);
    toast(s.checked ? '出席にしました' : '欠席にしました（再度最適化してください）');
  });
}

function renderUserForm(el) {
  const u = editing.data; const vs = S.vehicles;
  el.innerHTML = `<div class="formhead"><button class="ibtn" id="fBack" aria-label="戻る">${ICON.back}</button><h3>${editing.isNew ? '利用者を追加' : '利用者を編集'}</h3></div>
  <form class="form" id="uf">
    <label>氏名<input type="text" name="name" required value="${esc(u.name)}"></label>
    <label>住所<input type="text" name="address" value="${esc(u.address)}" placeholder="例: 埼玉県川口市本町4-1-1"></label>
    <div class="row" style="margin-top:8px;flex-wrap:wrap"><button type="button" class="btn" id="geo">${ICON.pin}住所から位置を取得</button><button type="button" class="btn" id="pick">地図で指定</button></div>
    <div class="hint" id="posTxt">${isFinite(u.lat) ? `位置: ${(+u.lat).toFixed(5)}, ${(+u.lng).toFixed(5)}` : '位置が未設定です'}</div>
    <label>利用曜日</label><div class="days">${DOW.map((x, i) => `<label><input type="checkbox" name="day" value="${i}" ${(u.days || []).includes(i) ? 'checked' : ''}><span>${x}</span></label>`).join('')}</div>
    <label class="check"><input type="checkbox" name="wheelchair" ${u.wheelchair ? 'checked' : ''}> 車椅子のまま乗車（車椅子固定枠を使用）</label>
    <div class="grid2">
      <label>迎え: 準備完了時刻<input type="time" name="ready" value="${esc(u.ready || '')}"></label>
      <label>送り: 在宅開始時刻<input type="time" name="homeFrom" value="${esc(u.homeFrom || '')}"></label>
      <label>乗降にかかる時間(分)<input type="number" name="boardMin" min="0" max="30" value="${esc(u.boardMin ?? '')}" placeholder="既定"></label>
      <label>最大乗車時間(分)<input type="number" name="maxRideMin" min="10" max="180" value="${esc(u.maxRideMin ?? '')}" placeholder="既定 ${esc(S.settings.defaultMaxRideMin)}"></label>
    </div>
    <label>車両指定<select name="fixedVehicle"><option value="">指定なし</option>${vs.map((v) => `<option value="${esc(v.id)}" ${u.fixedVehicle === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <label>乗れない車両</label><div>${vs.map((v) => `<label class="check" style="margin-top:6px"><input type="checkbox" name="avoid" value="${esc(v.id)}" ${(u.avoidVehicles || []).includes(v.id) ? 'checked' : ''}> ${esc(v.name)}</label>`).join('')}</div>
    <label>同乗グループ<input type="text" name="group" value="${esc(u.group || '')}" placeholder="同じ名前の人は同じ便に乗せます（例: 同居の夫婦）"></label>
    <label>メモ（送迎表に表示）<textarea name="note">${esc(u.note || '')}</textarea></label>
    <label class="check"><input type="checkbox" name="active" ${u.active !== false ? 'checked' : ''}> 利用中（オフにすると配車対象外）</label>
    <div class="formfoot"><button class="btn fill" type="submit">保存</button><button class="btn" type="button" id="fCancel">キャンセル</button>${editing.isNew ? '' : '<button class="btn danger" type="button" id="fDel" style="margin-left:auto">削除</button>'}</div>
  </form>`;
  const f = $('#uf');
  const close = () => { editing = null; stopPick(); renderAll(false); };
  $('#fBack').onclick = close; $('#fCancel').onclick = close;
  const setPos = (p) => { u.lat = p.lat; u.lng = p.lng; $('#posTxt').textContent = `位置: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`; renderMap(false, u); };
  $('#geo').onclick = async () => { try { const g = await geocode(f.address.value); setPos(g); map.focus(g); toast('位置を取得しました: ' + g.formatted); } catch (e) { toast(e.message); } };
  $('#pick').onclick = () => startPick((p) => setPos(p));
  if ($('#fDel')) $('#fDel').onclick = () => { if ($('#fDel').dataset.c) { S.users = S.users.filter((x) => x.id !== u.id); store.save(); close(); toast('削除しました'); } else { $('#fDel').dataset.c = 1; $('#fDel').textContent = 'もう一度押すと削除'; } };
  f.onsubmit = (e) => {
    e.preventDefault(); const fd = new FormData(f);
    Object.assign(u, {
      name: fd.get('name').trim(), address: fd.get('address').trim(), days: fd.getAll('day').map(Number), wheelchair: !!fd.get('wheelchair'),
      ready: fd.get('ready'), homeFrom: fd.get('homeFrom'), boardMin: fd.get('boardMin'), maxRideMin: fd.get('maxRideMin'),
      fixedVehicle: fd.get('fixedVehicle'), avoidVehicles: fd.getAll('avoid'), group: fd.get('group').trim(), note: fd.get('note').trim(), active: !!fd.get('active')
    });
    if (!u.name) return toast('氏名を入力してください');
    const i = S.users.findIndex((x) => x.id === u.id); if (i < 0) S.users.push(u); else S.users[i] = u;
    store.save(); close(); toast('保存しました');
  };
}

function renderVehicles() {
  const el = $('#v-vehicles');
  if (editing && editing.type === 'veh') {
    const v = editing.data;
    el.innerHTML = `<div class="formhead"><button class="ibtn" id="fBack" aria-label="戻る">${ICON.back}</button><h3>${editing.isNew ? '車両を追加' : '車両を編集'}</h3></div>
    <form class="form" id="vf">
      <label>車両名<input type="text" name="name" required value="${esc(v.name)}" placeholder="例: 1号車 ハイエース"></label>
      <label>運転手<input type="text" name="driver" value="${esc(v.driver || '')}"></label>
      <div class="grid2">
        <label>座席数（運転席・添乗員を除く）<input type="number" name="seats" min="0" max="20" value="${esc(v.seats)}"></label>
        <label>車椅子固定枠<input type="number" name="wheelchairSlots" min="0" max="6" value="${esc(v.wheelchairSlots)}"></label>
        <label>稼働開始<input type="time" name="availableFrom" value="${esc(v.availableFrom || '')}"></label>
        <label>稼働終了<input type="time" name="availableUntil" value="${esc(v.availableUntil || '')}"></label>
        <label>最大便数<select name="maxTrips">${[1, 2, 3].map((n) => `<option ${+v.maxTrips === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <div class="hint">車椅子枠を使うと座席が減る車種は、車椅子の人数を想定した座席数を入力してください。</div>
      <label class="check"><input type="checkbox" name="active" ${v.active !== false ? 'checked' : ''}> 使用する（点検・運転手不在の日はオフ）</label>
      <div class="formfoot"><button class="btn fill" type="submit">保存</button><button class="btn" type="button" id="fCancel">キャンセル</button>${editing.isNew ? '' : '<button class="btn danger" type="button" id="fDel" style="margin-left:auto">削除</button>'}</div>
    </form>`;
    const close = () => { editing = null; renderAll(false); };
    $('#fBack').onclick = close; $('#fCancel').onclick = close;
    if ($('#fDel')) $('#fDel').onclick = () => { if ($('#fDel').dataset.c) { S.vehicles = S.vehicles.filter((x) => x.id !== v.id); store.save(); close(); } else { $('#fDel').dataset.c = 1; $('#fDel').textContent = 'もう一度押すと削除'; } };
    $('#vf').onsubmit = (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      Object.assign(v, { name: fd.get('name').trim(), driver: fd.get('driver').trim(), seats: +fd.get('seats'), wheelchairSlots: +fd.get('wheelchairSlots'), availableFrom: fd.get('availableFrom'), availableUntil: fd.get('availableUntil'), maxTrips: +fd.get('maxTrips'), active: !!fd.get('active') });
      const i = S.vehicles.findIndex((x) => x.id === v.id); if (i < 0) S.vehicles.push(v); else S.vehicles[i] = v;
      store.save(); close(); toast('保存しました');
    };
    return;
  }
  el.innerHTML = `<div class="actions"><button class="btn fill" id="addVeh">${ICON.add}車両を追加</button></div>
  <ul class="list">${S.vehicles.map((v) => `<li data-id="${esc(v.id)}" class="${v.active === false ? 'off' : ''}"><span class="av" style="background:${vColor(v.id)}"><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg></span>
    <div class="t"><b>${esc(v.name)}</b><small>座席${esc(v.seats)}・車椅子${esc(v.wheelchairSlots)}・最大${esc(v.maxTrips)}便${v.driver ? '・運転 ' + esc(v.driver) : ''}</small><small>稼働 ${esc(v.availableFrom || '--:--')}〜${esc(v.availableUntil || '--:--')}</small></div>
    <input type="checkbox" class="switch" data-act="${esc(v.id)}" ${v.active !== false ? 'checked' : ''} aria-label="${esc(v.name)}を使用"></li>`).join('')}</ul>`;
  $('#addVeh').onclick = () => { editing = { type: 'veh', data: { id: uid('v'), name: '', seats: 6, wheelchairSlots: 0, maxTrips: 2, availableFrom: '08:00', availableUntil: '18:00', active: true }, isNew: true }; renderVehicles(); };
  $$('.list li[data-id]', el).forEach((li) => li.onclick = (e) => { if (e.target.matches('.switch')) return; editing = { type: 'veh', data: { ...S.vehicles.find((v) => v.id === li.dataset.id) } }; renderVehicles(); });
  $$('.switch[data-act]', el).forEach((s) => s.onchange = () => { S.vehicles.find((v) => v.id === s.dataset.act).active = s.checked; store.save(); renderResult(); });
}

function renderSettings() {
  const st = S.settings, f = S.facility, w = st.weights || {};
  const el = $('#v-settings');
  if (el.contains(document.activeElement)) return; // 入力中は再描画しない
  el.innerHTML = `<form class="form" id="sf">
    ${DEMO ? '<div class="alert" style="margin:12px 0 0;background:var(--blue-l);color:#174ea6">デモ版です。本番版ではここにGoogle MapsのAPIキーを入れると、実際の地図と道路の所要時間で計算します。</div><div hidden>' : ''}
    <h3 style="margin:12px 0 0">道路データ</h3>
    <div class="hint">${router.ready ? `<b style="color:var(--green)">読込済み</b>・道路の点 ${router.info.nodes.toLocaleString()}・区間 ${router.info.edges.toLocaleString()}${router.meta ? `・施設から半径${esc(router.meta.radiusKm)}km・作成 ${esc(String(router.meta.built).slice(0, 10))}` : ''}` : `<b>未読込</b>（直線距離で推定中）${router.error ? '：' + esc(router.error) : ''}`}</div>
    <label>渋滞係数<input type="number" name="trafficFactor" min="0.8" max="2" step="0.05" value="${esc(st.trafficFactor ?? 1.2)}"></label>
    <div class="hint">道路の標準速度で計算した時間に掛ける値です。送迎の時間帯が混む地域は1.2〜1.4にしてください。実際の所要時間と比べて調整します。</div>
    <h3 style="margin:24px 0 0">データの保存</h3>
    <div class="hint" id="syncTxt">${esc(syncText())}</div>
    <h3 style="margin:24px 0 0">施設</h3>
    <label>施設名<input type="text" name="fname" value="${esc(f.name)}"></label>
    <label>住所<input type="text" name="faddr" value="${esc(f.address)}"></label>
    <div class="row" style="margin-top:8px"><button type="button" class="btn" id="fgeo">${ICON.pin}住所から位置を取得</button><button type="button" class="btn" id="fpick">地図で指定</button></div>
    <div class="hint" id="fpos">位置: ${(+f.lat).toFixed(5)}, ${(+f.lng).toFixed(5)}</div>
    <h3 style="margin:24px 0 0">送迎の条件</h3>
    <div class="grid2">
      <label>迎え: 施設到着期限<input type="time" name="pickupTime" value="${esc(st.pickupTime)}"></label>
      <label>送り: 施設出発時刻<input type="time" name="dropoffTime" value="${esc(st.dropoffTime)}"></label>
      <label>乗降時間(分)<input type="number" name="defaultBoardMin" value="${esc(st.defaultBoardMin)}"></label>
      <label>車椅子の乗降時間(分)<input type="number" name="wheelchairBoardMin" value="${esc(st.wheelchairBoardMin)}"></label>
      <label>施設での乗降(分)<input type="number" name="depotMin" value="${esc(st.depotMin)}"></label>
      <label>便の折返し(分)<input type="number" name="turnaroundMin" value="${esc(st.turnaroundMin)}"></label>
      <label>最大乗車時間(分)<input type="number" name="defaultMaxRideMin" value="${esc(st.defaultMaxRideMin)}"></label>
      <label>計算時間(秒)<input type="number" name="timeSec" min="1" max="30" value="${esc(st.timeSec)}"></label>
    </div>
    <details><summary>最適化の重み（上級）</summary>
      <div class="grid2">
        <label>車両1台の使用コスト(分相当)<input type="number" name="w_vehicle" value="${esc(w.vehicle ?? 30)}"></label>
        <label>最長ルートの偏り<input type="number" step="0.1" name="w_balance" value="${esc(w.balance ?? 0.3)}"></label>
        <label>総乗車時間<input type="number" step="0.01" name="w_rideSum" value="${esc(w.rideSum ?? 0.05)}"></label>
      </div>
      <div class="hint">車両コストを上げると台数を減らし、下げると台数を増やして早く回ります。乗車時間を上げると利用者の乗車時間が短くなります。</div>
    </details>
    <div class="formfoot"><button class="btn fill" type="submit">設定を保存</button></div>
    <h3 style="margin:28px 0 0">データ</h3>
    <div class="formfoot" style="margin-top:8px"><button type="button" class="btn" id="exp" ${DEMO ? 'hidden' : ''}>JSONを書き出し</button><label class="btn" style="margin:0;color:var(--blue);font-size:14px">JSONを読み込み<input type="file" id="imp" accept=".json,application/json" hidden></label><button type="button" class="btn danger" id="rst">サンプルに戻す</button></div>
    <div class="hint">JSONは手元でのバックアップ用です。共有サーバーには30日分の履歴も残ります。</div>
  </form>`;
  const f2 = $('#sf');
  $('#fgeo').onclick = async () => { try { const g = await geocode(f2.faddr.value); Object.assign(S.facility, { lat: g.lat, lng: g.lng }); $('#fpos').textContent = `位置: ${g.lat}, ${g.lng}`; store.save(); renderMap(true); } catch (e) { toast(e.message); } };
  $('#fpick').onclick = () => startPick((p) => { Object.assign(S.facility, p); $('#fpos').textContent = `位置: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`; store.save(); renderMap(false); });
  f2.onsubmit = (e) => {
    e.preventDefault(); const fd = new FormData(f2);
    st.trafficFactor = Math.min(2, Math.max(0.8, +fd.get('trafficFactor') || 1.2));
    for (const k of ['pickupTime', 'dropoffTime']) st[k] = fd.get(k);
    for (const k of ['defaultBoardMin', 'wheelchairBoardMin', 'depotMin', 'turnaroundMin', 'defaultMaxRideMin', 'timeSec']) st[k] = +fd.get(k);
    st.weights = { vehicle: +fd.get('w_vehicle'), balance: +fd.get('w_balance'), rideSum: +fd.get('w_rideSum') };
    S.facility.name = fd.get('fname').trim(); S.facility.address = fd.get('faddr').trim();
    store.save();
    document.activeElement.blur(); renderAll(false); toast('保存しました（条件を変えたら再度最適化してください）');
  };
  $('#exp').onclick = () => {
    const data = JSON.parse(payload());
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `sougei-${dateStr}.json`; a.click();
  };
  $('#imp').onchange = async (e) => {
    try { const d = JSON.parse(await e.target.files[0].text()); if (!d.users || !d.vehicles || !d.facility) throw 0; S = normalize(Object.assign(sampleData(), d)); store.save(); renderAll(true); toast('読み込みました'); }
    catch { toast('読み込めないファイルです'); }
  };
  $('#rst').onclick = () => { const b = $('#rst'); if (!b.dataset.c) { b.dataset.c = 1; b.textContent = 'もう一度押すと初期化'; return; } S = normalize(sampleData()); store.save(); renderAll(true); };
}

function renderMap(fit, editingUser) {
  if (!map) return;
  const res = currentRes(); const byId = new Map(S.users.map((u) => [u.id, u]));
  const pts = []; const seen = new Set(); const routes = [];
  if (res) {
    for (const v of res.vehicles) {
      if (hiddenVehicles.has(v.vehicleId)) continue;
      const c = vColor(v.vehicleId);
      v.trips.forEach((t) => {
        t.stops.forEach((s, i) => {
          const u = byId.get(s.userId); if (!u || !isFinite(u.lat)) return; seen.add(u.id);
          pts.push({ id: u.id, lat: +u.lat, lng: +u.lng, color: c, label: (v.trips.length > 1 ? t.trip + '-' : '') + (i + 1), title: u.name, sub: `${v.vehicleName} ${t.trip}便 ${s.time}${s.wheelchair ? '・車椅子' : ''}`, onClick: () => { switchView('result'); const li = $(`#v-result li.stop[data-u="${CSS.escape(u.id)}"]`); li && li.scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
        });
        routes.push({ vid: v.vehicleId, color: c, pts: [S.facility, ...t.stops.map((s) => byId.get(s.userId)).filter(Boolean), S.facility].map((p) => ({ lat: +p.lat, lng: +p.lng })) });
      });
    }
  }
  const att = res ? [] : attendees();
  for (const u of att) if (isFinite(u.lat) && !seen.has(u.id)) pts.push({ id: u.id, lat: +u.lat, lng: +u.lng, label: '', title: u.name, sub: u.address, onClick: () => { editing = { type: 'user', data: JSON.parse(JSON.stringify(u)) }; switchView('users'); renderUsers(); } });
  if (editingUser && isFinite(editingUser.lat)) { const i = pts.findIndex((p) => p.id === editingUser.id); const p = { id: editingUser.id, lat: editingUser.lat, lng: editingUser.lng, color: '#ea4335', label: '●', title: editingUser.name || '新しい利用者' }; i >= 0 ? pts[i] = p : pts.push(p); }
  map.setData(S.facility, pts);
  // まず直線で描き、Googleのルート形状が取れたら差し替える
  map.drawRoutes(routes.map((r) => ({ color: r.color, path: r.pts, straight: true })));
  if (fit) map.fit([S.facility, ...pts]);
  const token = (renderMap.token = (renderMap.token || 0) + 1);
  if (router.ready && routes.length) Promise.all(routes.map(async (r) => ({ color: r.color, ...(await routePath(r.pts)) }))).then((rs) => { if (token === renderMap.token) map.drawRoutes(rs); });
}

function renderLegend() {
  const res = currentRes(); const el = $('#legend');
  if (!res) { el.innerHTML = ''; return; }
  el.innerHTML = res.vehicles.filter((v) => v.trips.length).map((v) => `<button data-v="${esc(v.vehicleId)}" class="${hiddenVehicles.has(v.vehicleId) ? 'hide' : ''}"><i style="background:${vColor(v.vehicleId)}"></i>${esc(v.vehicleName)}</button>`).join('');
  $$('button', el).forEach((b) => b.onclick = () => { const id = b.dataset.v; hiddenVehicles.has(id) ? hiddenVehicles.delete(id) : hiddenVehicles.add(id); renderLegend(); renderMap(false); });
}

// ---------- 送迎表 ----------
function sheetRows() {
  const res = currentRes(); if (!res) return null; const byId = new Map(S.users.map((u) => [u.id, u]));
  const rows = [];
  for (const v of res.vehicles) for (const t of v.trips) {
    const veh = S.vehicles.find((x) => x.id === v.vehicleId) || {};
    rows.push({ head: true, text: `${v.vehicleName}　${t.trip}便　${t.depart}発 → ${t.arrive}着　${veh.driver ? '運転: ' + veh.driver : ''}` });
    t.stops.forEach((s, i) => { const u = byId.get(s.userId) || {}; rows.push({ no: i + 1, time: s.time, name: s.name, wc: s.wheelchair ? '車椅子' : '', addr: u.address || '', note: [u.note, s.flags.join('・')].filter(Boolean).join(' / '), ride: s.rideMin }); });
  }
  return rows;
}
function openSheet() {
  const rows = sheetRows(); if (!rows) return toast('先に配車を最適化してください');
  const d = new Date(dateStr + 'T00:00:00');
  $('#sheetTitle').textContent = `${S.facility.name}　送迎表　${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]}) ${S.direction === 'pickup' ? '迎え' : '送り'}`;
  $('#sheetBody').innerHTML = `<table class="sheet"><thead><tr><th>順</th><th>${S.direction === 'pickup' ? '迎え' : '到着'}時刻</th><th>氏名</th><th>介助</th><th>住所</th><th>乗車</th><th>メモ</th><th>確認</th></tr></thead><tbody>${rows.map((r) => r.head ? `<tr class="vh"><td colspan="8">${esc(r.text)}</td></tr>` : `<tr><td>${r.no}</td><td class="t">${esc(r.time)}</td><td>${esc(r.name)}</td><td>${esc(r.wc)}</td><td>${esc(r.addr)}</td><td class="t">${r.ride}分</td><td>${esc(r.note)}</td><td style="width:48px"></td></tr>`).join('')}</tbody></table>`;
  $('#sheetModal').classList.add('on');
}
$('#sheetClose').onclick = () => $('#sheetModal').classList.remove('on');
$('#sheetModal').onclick = (e) => { if (e.target.id === 'sheetModal') e.target.classList.remove('on'); };
$('#sheetPrint').onclick = () => window.print();
$('#sheetCopy').onclick = async () => {
  const tsv = sheetRows().map((r) => r.head ? r.text : [r.no, r.time, r.name, r.wc, r.addr, r.ride + '分', r.note].join('\t')).join('\n');
  try { await navigator.clipboard.writeText(tsv); toast('コピーしました（Excel等に貼り付けできます）'); } catch { toast('コピーできませんでした'); }
};

// ---------- 共通UI ----------
let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
function busy(on, msg) { $('#busy').classList.toggle('on', on); if (msg) $('#busyMsg').textContent = msg; }
function switchView(v) { $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); $$('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v)); document.body.classList.remove('collapsed'); }
let pickCb = null;
function startPick(cb) { pickCb = cb; document.body.classList.add('pickmode'); if (innerWidth <= 760) document.body.classList.add('collapsed'); }
function stopPick() { pickCb = null; document.body.classList.remove('pickmode'); }
$('#pickCancel').onclick = stopPick;

$$('.tabs button').forEach((b) => b.onclick = () => { if (editing) { editing = null; } switchView(b.dataset.v); renderAll(false); });
const togglePanel = () => { document.body.classList.toggle('collapsed'); };
$('#ptoggle').onclick = togglePanel; $('#menuBtn').onclick = togglePanel; $('#mobToggle').onclick = togglePanel;
$('#dirPick').onclick = () => { S.direction = 'pickup'; store.save(); renderAll(true); };
$('#dirDrop').onclick = () => { S.direction = 'dropoff'; store.save(); renderAll(true); };
$('#optBtn').onclick = runOptimize;
$('#sheetBtn').onclick = openSheet;
$('#date').value = dateStr;
$('#date').onchange = (e) => { if (e.target.value) { dateStr = e.target.value; renderAll(true); } };

// 検索
const q = $('#q'), sres = $('#sres');
function doSearch() {
  const s = q.value.trim(); if (!s) { sres.classList.remove('on'); userQuery = ''; renderUsers(); return; }
  const hits = S.users.filter((u) => (u.name + u.address).includes(s)).slice(0, 8);
  sres.innerHTML = hits.map((u) => `<button data-id="${esc(u.id)}"><span class="av" style="width:32px;height:32px;font-size:13px">${esc(u.name[0])}</span><span><b style="font-weight:500">${esc(u.name)}</b><small>${esc(u.address)}</small></span></button>`).join('') || `<button disabled><span class="muted">「${esc(s)}」に一致する利用者はいません</span></button>`;
  sres.classList.add('on');
  $$('button[data-id]', sres).forEach((b) => b.onclick = () => {
    const u = S.users.find((x) => x.id === b.dataset.id); sres.classList.remove('on'); q.value = u.name;
    if (isFinite(u.lat)) map.focus(u);
    editing = { type: 'user', data: JSON.parse(JSON.stringify(u)) }; switchView('users'); renderUsers();
  });
}
q.oninput = doSearch; $('#qBtn').onclick = doSearch;
q.onkeydown = (e) => { if (e.key === 'Escape') { q.value = ''; doSearch(); } if (e.key === 'Enter') { const b = $('button[data-id]', sres); b && b.click(); } };
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) sres.classList.remove('on'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#sheetModal').classList.remove('on'); stopPick(); } });

// ---------- 起動 ----------
async function boot() {
  if (!DEMO) await syncLoad();
  const el = $('#map');
  try { if (DEMO || !window.maplibregl) throw new Error('nomap'); map = MapLibreView(el); }
  catch (e) { map = SimpleMapView(el); if (!DEMO) toast('地図を読み込めませんでした。簡易表示にします'); }
  map.onClick((p) => { if (pickCb) { const cb = pickCb; stopPick(); cb(p); toast('位置を設定しました'); } });
  renderBaseSeg();
  renderAll(true);
  if (DEMO) { if (DEMO_AUTO) setTimeout(runOptimize, 400); }
  else initRouter();
}
function renderBaseSeg() {
  const seg = $('#baseSeg'); if (!seg) return; if (!map.setBase) { seg.hidden = true; return; }
  seg.innerHTML = Object.entries(TILES).map(([k, t]) => `<button data-b="${k}" class="${(S.settings.base || 'pale') === k ? 'on' : ''}">${t.name}</button>`).join('');
  $$('button', seg).forEach((b) => b.onclick = () => { S.settings.base = b.dataset.b; map.setBase && map.setBase(b.dataset.b); store.save(); renderBaseSeg(); });
}
window.SougeiApp = { get state() { return S; }, runOptimize };
boot();
})();
