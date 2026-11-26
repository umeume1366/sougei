/*!
 * デイサービス送迎 配車最適化エンジン
 * ------------------------------------------------------------
 * 問題: 容量・車椅子枠・時間制約付き 複数便 配車計画問題 (VRP)
 *   - 迎え(pickup): 各車両が施設を出発 → 利用者宅を回る → 施設に到着期限までに到着
 *   - 送り(dropoff): 各車両が施設を出発時刻に出発 → 利用者宅を回る → 施設に戻る
 * 制約(ペナルティ方式):
 *   - 座席数 / 車椅子固定枠
 *   - 施設到着期限(迎え)・車両(運転手)の稼働時間
 *   - 利用者ごとの準備完了時刻(迎え) / 在宅開始時刻(送り)
 *   - 最大乗車時間
 *   - 車両指定 / 車両NG
 *   - 同乗グループ(同一世帯・夫婦など)は同じ便
 *   - 1車両あたりの最大便数
 * 解法: スイープ法 + 最安挿入で初期解 → 焼きなまし法(relocate / swap / 2-opt / グループ移動 / 便交換)
 *
 * ブラウザ: window.SougeiOptimizer / Node: require('./optimizer.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SougeiOptimizer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 時刻ユーティリティ ----------
  const toMin = (s) => {
    if (s === null || s === undefined || s === '') return null;
    if (typeof s === 'number') return s;
    const [h, m] = String(s).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const toHHMM = (m) => {
    if (m === null || m === undefined || !isFinite(m)) return '';
    const r = Math.round(m);
    const h = Math.floor(r / 60), mm = ((r % 60) + 60) % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };

  // ---------- 乱数(再現性のためシード付き) ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 直線距離から所要時間を推定(APIが使えない時の代替) ----------
  function haversineKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  /** points: [{lat,lng}] → {time:[[分]], dist:[[km]]} */
  function estimateMatrix(points, opt = {}) {
    const speed = opt.speedKmh || 22;   // 市街地の平均速度
    const detour = opt.detour || 1.35;  // 道路の迂回係数
    const n = points.length;
    const time = [], dist = [];
    for (let i = 0; i < n; i++) {
      time.push(new Array(n)); dist.push(new Array(n));
      for (let j = 0; j < n; j++) {
        const d = i === j ? 0 : haversineKm(points[i], points[j]) * detour;
        dist[i][j] = d;
        time[i][j] = i === j ? 0 : Math.max(1, (d / speed) * 60);
      }
    }
    return { time, dist };
  }

  // ---------- 既定の重み ----------
  const DEFAULT_WEIGHTS = {
    travel: 1,        // 走行1分
    vehicle: 30,      // 車両を1台使う固定コスト(分換算)
    trip: 15,         // 便を1つ増やすコスト
    late: 200,        // 期限超過1分
    ride: 30,         // 最大乗車時間超過1分
    capacity: 100000, // 定員超過1人 (安全上の絶対条件)
    wheelchair: 100000, // 車椅子枠超過1台 (絶対条件)
    vehicleRule: 5000, // 車両指定/NG違反
    group: 3000,      // 同乗グループ分断
    wait: 0.5,        // 待機1分
    balance: 0.3,     // 最長ルート所要時間(偏り防止)
    rideSum: 0.05     // 総乗車時間(利用者負担の軽減)
  };

  /**
   * 問題を内部表現に変換
   * problem = {
   *   direction: 'pickup' | 'dropoff',
   *   facilityTime: '09:30',         // 迎え:施設到着期限 / 送り:施設出発時刻
   *   matrix: { time:[[分]], dist:[[km]] }  // index 0 = 施設, 1..n = users の順
   *   users: [{ id, name, wheelchair, boardMin, ready, homeFrom, maxRideMin, fixedVehicle, avoidVehicles, group }],
   *   vehicles: [{ id, name, seats, wheelchairSlots, maxTrips, availableFrom, availableUntil }],
   *   settings: { defaultBoardMin, wheelchairBoardMin, depotMin, turnaroundMin, defaultMaxRideMin, weights }
   * }
   */
  function prepare(problem) {
    const s = Object.assign({
      defaultBoardMin: 3, wheelchairBoardMin: 7, depotMin: 5, turnaroundMin: 10, defaultMaxRideMin: 60
    }, problem.settings || {});
    const W = Object.assign({}, DEFAULT_WEIGHTS, s.weights || {});
    const users = problem.users.map((u, i) => ({
      idx: i + 1, id: u.id, name: u.name || u.id,
      wc: !!u.wheelchair,
      board: u.boardMin != null && u.boardMin !== '' ? +u.boardMin : (u.wheelchair ? s.wheelchairBoardMin : s.defaultBoardMin),
      ready: toMin(u.ready), homeFrom: toMin(u.homeFrom),
      maxRide: u.maxRideMin != null && u.maxRideMin !== '' ? +u.maxRideMin : s.defaultMaxRideMin,
      fixed: u.fixedVehicle || null,
      avoid: new Set(u.avoidVehicles || []),
      group: u.group || null
    }));
    const vehicles = problem.vehicles.map((v, k) => ({
      k, id: v.id, name: v.name || v.id,
      seats: +v.seats || 0, wcSlots: +v.wheelchairSlots || 0,
      maxTrips: Math.max(1, +v.maxTrips || 1),
      from: toMin(v.availableFrom), until: toMin(v.availableUntil)
    }));
    const vIndex = new Map(vehicles.map((v) => [v.id, v.k]));
    const groups = new Map();
    users.forEach((u, i) => { if (u.group) { if (!groups.has(u.group)) groups.set(u.group, []); groups.get(u.group).push(i); } });
    return {
      dir: problem.direction === 'dropoff' ? 'dropoff' : 'pickup',
      T: toMin(problem.facilityTime) ?? (problem.direction === 'dropoff' ? 16 * 60 : 9 * 60 + 30),
      time: problem.matrix.time, dist: problem.matrix.dist,
      users, vehicles, vIndex, groups, s, W
    };
  }

  // 解 = routes[k][t] = [userIndex(0-based), ...]   k:車両, t:便
  function emptySolution(P) { return P.vehicles.map((v) => Array.from({ length: v.maxTrips }, () => [])); }
  function clone(sol) { return sol.map((trips) => trips.map((r) => r.slice())); }

  /** 1便の走行時間(施設→…→施設) */
  function tripTravel(P, r) {
    if (!r.length) return { t: 0, d: 0 };
    let t = 0, d = 0, prev = 0;
    for (const ui of r) { const n = P.users[ui].idx; t += P.time[prev][n]; d += P.dist ? P.dist[prev][n] : 0; prev = n; }
    t += P.time[prev][0]; d += P.dist ? P.dist[prev][0] : 0;
    return { t, d };
  }

  /**
   * 車両1台分(全便)のスケジュールを計算
   * 迎え: 最後の便が期限Tに着くよう逆算。前の便は次の便の出発 - 折返し時間 に着くよう逆算。
   * 送り: 1便目がTに出発、以降は帰着 + 折返し時間で出発。
   */
  function scheduleVehicle(P, k, trips, detail) {
    const v = P.vehicles[k], s = P.s;
    const res = { travel: 0, dist: 0, late: 0, ride: 0, wait: 0, cap: 0, wcOver: 0, rule: 0, rideSum: 0, used: 0, tripsUsed: 0, span: 0, trips: [] };
    const used = trips.map((r) => r.length > 0);
    res.tripsUsed = used.filter(Boolean).length;
    if (!res.tripsUsed) return res;
    res.used = 1;

    // 容量・車両ルール
    for (let t = 0; t < trips.length; t++) {
      const r = trips[t]; if (!r.length) continue;
      let wc = 0, seat = 0;
      for (const ui of r) {
        const u = P.users[ui];
        if (u.wc) wc++; else seat++;
        if (u.fixed && u.fixed !== v.id) res.rule++;
        if (u.avoid.has(v.id)) res.rule++;
      }
      // 車椅子枠が足りなければ超過分は座席を2つ使う扱いにはせず違反とする
      res.wcOver += Math.max(0, wc - v.wcSlots);
      res.cap += Math.max(0, seat - v.seats);
    }

    const order = []; for (let t = 0; t < trips.length; t++) if (used[t]) order.push(t);
    const tripInfo = new Array(trips.length);

    if (P.dir === 'pickup') {
      let target = P.T - s.depotMin; // 施設で降車に要する時間を見込む
      for (let oi = order.length - 1; oi >= 0; oi--) {
        const t = order[oi], r = trips[t];
        // 待ちなしの所要時間
        let D = 0, prev = 0;
        for (const ui of r) { const u = P.users[ui]; D += P.time[prev][u.idx] + u.board; prev = u.idx; }
        D += P.time[prev][0];
        let dep = target - D;
        // 前向きシミュレーション(準備完了前なら待つ)
        let cur = dep, wait = 0; prev = 0; const stops = [];
        for (const ui of r) {
          const u = P.users[ui];
          cur += P.time[prev][u.idx];
          if (u.ready != null && cur < u.ready) { wait += u.ready - cur; cur = u.ready; }
          stops.push({ ui, arrive: cur });
          cur += u.board; prev = u.idx;
        }
        cur += P.time[prev][0];
        // 出発は「待ちなしで期限ちょうどに着く最遅時刻」。途中で準備完了待ちが出ると、その分が遅延になる。
        const arriveDepot = cur;
        const late = Math.max(0, arriveDepot - target);
        res.late += late; res.wait += wait;
        for (const st of stops) {
          const u = P.users[st.ui];
          const ride = arriveDepot - st.arrive;
          st.ride = ride; res.rideSum += ride;
          res.ride += Math.max(0, ride - u.maxRide);
        }
        tripInfo[t] = { dep, arrive: arriveDepot, stops };
        target = dep - s.turnaroundMin - s.depotMin;
      }
      const first = tripInfo[order[0]].dep;
      if (P.vehicles[k].from != null && first < v.from) res.late += v.from - first;
      if (v.until != null && P.T > v.until) res.late += P.T - v.until;
      res.span = tripInfo[order[order.length - 1]].arrive - first;
    } else {
      let dep = P.T + s.depotMin; // 施設で乗車に要する時間
      for (const t of order) {
        const r = trips[t];
        let cur = dep, wait = 0, prev = 0; const stops = [];
        for (const ui of r) {
          const u = P.users[ui];
          cur += P.time[prev][u.idx];
          if (u.homeFrom != null && cur < u.homeFrom) { wait += u.homeFrom - cur; cur = u.homeFrom; }
          const ride = cur - dep;
          stops.push({ ui, arrive: cur, ride });
          res.rideSum += ride; res.ride += Math.max(0, ride - u.maxRide);
          cur += u.board; prev = u.idx;
        }
        cur += P.time[prev][0];
        res.wait += wait;
        tripInfo[t] = { dep, arrive: cur, stops };
        dep = cur + s.turnaroundMin + s.depotMin;
      }
      const lastBack = tripInfo[order[order.length - 1]].arrive;
      if (v.until != null && lastBack > v.until) res.late += lastBack - v.until;
      if (v.from != null && P.T < v.from) res.late += v.from - P.T;
      res.span = lastBack - P.T;
    }

    for (const t of order) {
      const tt = tripTravel(P, trips[t]);
      res.travel += tt.t; res.dist += tt.d;
      tripInfo[t].travel = tt.t; tripInfo[t].dist = tt.d;
    }
    if (detail) res.trips = tripInfo;
    return res;
  }

  function groupSplits(P, sol) {
    if (!P.groups.size) return 0;
    const where = new Array(P.users.length);
    sol.forEach((trips, k) => trips.forEach((r, t) => r.forEach((ui) => { where[ui] = k * 100 + t; })));
    let n = 0;
    for (const members of P.groups.values()) {
      const set = new Set(members.map((m) => where[m]));
      n += set.size - 1;
    }
    return n;
  }

  function cost(P, sol, cache) {
    const W = P.W; let c = 0, maxSpan = 0;
    for (let k = 0; k < sol.length; k++) {
      const r = cache && cache[k] ? cache[k] : scheduleVehicle(P, k, sol[k], false);
      if (cache) cache[k] = r;
      c += W.travel * r.travel + W.vehicle * r.used + W.trip * Math.max(0, r.tripsUsed - 1)
        + W.late * r.late + W.ride * r.ride + W.capacity * r.cap + W.wheelchair * r.wcOver
        + W.vehicleRule * r.rule + W.wait * r.wait + W.rideSum * r.rideSum;
      if (r.span > maxSpan) maxSpan = r.span;
    }
    c += W.balance * maxSpan + W.group * groupSplits(P, sol);
    return c;
  }

  // ---------- 初期解: スイープ + 最安挿入 ----------
  function initial(P, rand) {
    const sol = emptySolution(P);
    const n = P.users.length;
    // 施設からの方位角(座標が無いので、行列から近似: 施設からの時間と、最遠点との関係で順序付け)
    // 座標がある場合は angle を使う
    const order = [...Array(n).keys()];
    if (P.coords) {
      const d = P.coords[0];
      order.sort((a, b) => {
        const pa = P.coords[a + 1], pb = P.coords[b + 1];
        return Math.atan2(pa.lat - d.lat, pa.lng - d.lng) - Math.atan2(pb.lat - d.lat, pb.lng - d.lng);
      });
      const off = Math.floor(rand() * n); order.push(...order.splice(0, off));
    } else {
      order.sort((a, b) => P.time[0][P.users[b].idx] - P.time[0][P.users[a].idx]);
    }
    // 指定車両がある人を先に
    order.sort((a, b) => (P.users[b].fixed ? 1 : 0) - (P.users[a].fixed ? 1 : 0));
    const placed = new Set();
    for (const ui of order) {
      if (placed.has(ui)) continue;
      const u = P.users[ui];
      const members = u.group ? P.groups.get(u.group) : [ui];
      insertBest(P, sol, members.filter((m) => !placed.has(m)));
      members.forEach((m) => placed.add(m));
    }
    return sol;
  }

  /** members(同じ便に乗せる人たち)を最もコスト増が小さい位置に挿入 */
  function insertBest(P, sol, members, restrictVehicle) {
    let best = null, bestC = Infinity;
    for (let k = 0; k < sol.length; k++) {
      if (restrictVehicle != null && k !== restrictVehicle) continue;
      for (let t = 0; t < sol[k].length; t++) {
        const r = sol[k][t];
        // 空の便は先頭の空便だけ試す(対称性の削減)
        if (!r.length && sol[k].slice(0, t).some((x) => !x.length)) continue;
        for (let pos = 0; pos <= r.length; pos++) {
          r.splice(pos, 0, ...members);
          const c = cost(P, sol);
          if (c < bestC) { bestC = c; best = [k, t, pos]; }
          r.splice(pos, members.length);
        }
      }
    }
    if (best) sol[best[0]][best[1]].splice(best[2], 0, ...members);
    return bestC;
  }

  // ---------- 焼きなまし法 ----------
  function locate(sol) {
    const loc = [];
    sol.forEach((trips, k) => trips.forEach((r, t) => r.forEach((ui, p) => { loc[ui] = [k, t, p]; })));
    return loc;
  }

  function anneal(P, start, opt, rand) {
    const n = P.users.length;
    let cur = clone(start), curC = cost(P, cur);
    let best = clone(cur), bestC = curC;
    if (n < 2 && P.vehicles.length < 2) return { sol: best, cost: bestC };
    const deadline = Date.now() + opt.timeMs;
    const maxIter = opt.maxIter || Infinity;
    let T0 = opt.T0 || Math.max(5, curC * 0.02), T = T0;
    const Tend = 0.05;
    let it = 0;
    const slots = []; P.vehicles.forEach((v, k) => { for (let t = 0; t < v.maxTrips; t++) slots.push([k, t]); });

    while (it < maxIter) {
      if ((it & 255) === 0) {
        const now = Date.now();
        if (now > deadline) break;
        const prog = 1 - (deadline - now) / opt.timeMs;
        T = T0 * Math.pow(Tend / T0, Math.min(1, Math.max(0, prog)));
      }
      it++;
      const cand = clone(cur);
      const loc = locate(cand);
      const m = rand();
      const touched = new Set();
      if (m < 0.35) { // relocate (グループは丸ごと)
        const ui = Math.floor(rand() * n);
        const u = P.users[ui];
        const members = u.group ? P.groups.get(u.group) : [ui];
        // グループは全員まとめて移動(分かれていたら再結合される)
        const seq = [];
        for (const x of members) {
          const [kx, tx] = loc[x];
          const rx = cand[kx][tx]; const px = rx.indexOf(x);
          rx.splice(px, 1); seq.push(x); touched.add(kx);
        }
        const k0 = loc[ui][0];
        const [k1, t1] = slots[Math.floor(rand() * slots.length)];
        const r1 = cand[k1][t1];
        r1.splice(Math.floor(rand() * (r1.length + 1)), 0, ...seq);
        touched.add(k0); touched.add(k1);
      } else if (m < 0.55) { // swap
        const a = Math.floor(rand() * n), b = Math.floor(rand() * n);
        if (a === b) continue;
        const [ka, ta, pa] = loc[a], [kb, tb, pb] = loc[b];
        cand[ka][ta][pa] = b; cand[kb][tb][pb] = a;
        touched.add(ka); touched.add(kb);
      } else if (m < 0.8) { // 2-opt(区間反転)
        const ui = Math.floor(rand() * n);
        const [k, t] = loc[ui];
        const r = cand[k][t];
        if (r.length < 2) continue;
        let i = Math.floor(rand() * r.length), j = Math.floor(rand() * r.length);
        if (i === j) continue; if (i > j) [i, j] = [j, i];
        const seg = r.slice(i, j + 1).reverse(); r.splice(i, j - i + 1, ...seg);
        touched.add(k);
      } else if (m < 0.92) { // or-opt: 連続区間を別の場所へ
        const ui = Math.floor(rand() * n);
        const [k0, t0, p0] = loc[ui];
        const r0 = cand[k0][t0];
        const len = 1 + Math.floor(rand() * Math.min(3, r0.length - p0));
        const seg = r0.splice(p0, len);
        if (rand() < 0.5) seg.reverse();
        const [k1, t1] = slots[Math.floor(rand() * slots.length)];
        const r1 = cand[k1][t1];
        r1.splice(Math.floor(rand() * (r1.length + 1)), 0, ...seg);
        touched.add(k0); touched.add(k1);
      } else { // cross-exchange: 2つの便の末尾を交換
        const s1 = slots[Math.floor(rand() * slots.length)], s2 = slots[Math.floor(rand() * slots.length)];
        if (s1[0] === s2[0] && s1[1] === s2[1]) continue;
        const r1 = cand[s1[0]][s1[1]], r2 = cand[s2[0]][s2[1]];
        const c1 = Math.floor(rand() * (r1.length + 1)), c2 = Math.floor(rand() * (r2.length + 1));
        const tail1 = r1.splice(c1), tail2 = r2.splice(c2);
        r1.push(...tail2); r2.push(...tail1);
        touched.add(s1[0]); touched.add(s2[0]);
      }
      const cc = cost(P, cand);
      const delta = cc - curC;
      if (delta <= 0 || rand() < Math.exp(-delta / T)) {
        cur = cand; curC = cc;
        if (cc < bestC - 1e-9) { best = clone(cand); bestC = cc; }
      }
    }
    return { sol: best, cost: bestC, iterations: it };
  }

  /** 各便内を2-optで仕上げ */
  function polish(P, sol) {
    let improved = true, base = cost(P, sol);
    while (improved) {
      improved = false;
      for (const trips of sol) for (const r of trips) {
        for (let i = 0; i < r.length - 1; i++) for (let j = i + 1; j < r.length; j++) {
          const seg = r.slice(i, j + 1).reverse(); const old = r.slice(i, j + 1);
          r.splice(i, j - i + 1, ...seg);
          const c = cost(P, sol);
          if (c < base - 1e-9) { base = c; improved = true; } else r.splice(i, j - i + 1, ...old);
        }
      }
    }
    return sol;
  }

  // ---------- 結果の整形 ----------
  function report(P, sol) {
    const vehicles = [];
    const violations = [];
    let totalTravel = 0, totalDist = 0, usedVehicles = 0, maxRide = 0;
    sol.forEach((trips, k) => {
      const v = P.vehicles[k];
      const r = scheduleVehicle(P, k, trips, true);
      if (r.used) usedVehicles++;
      totalTravel += r.travel; totalDist += r.dist;
      const out = { vehicleId: v.id, vehicleName: v.name, trips: [] };
      trips.forEach((route, t) => {
        if (!route.length) return;
        const info = r.trips[t];
        const wc = route.filter((ui) => P.users[ui].wc).length;
        const seat = route.length - wc;
        if (seat > v.seats) violations.push(`${v.name} ${out.trips.length + 1}便: 定員超過 (${seat}/${v.seats}席)`);
        if (wc > v.wcSlots) violations.push(`${v.name} ${out.trips.length + 1}便: 車椅子枠超過 (${wc}/${v.wcSlots}台)`);
        const stops = info.stops.map((st) => {
          const u = P.users[st.ui];
          const flags = [];
          if (st.ride > u.maxRide + 0.5) { flags.push('乗車時間超過'); violations.push(`${u.name}: 乗車時間 ${Math.round(st.ride)}分 (上限${u.maxRide}分)`); }
          if (u.fixed && u.fixed !== v.id) { flags.push('指定車両外'); violations.push(`${u.name}: 指定車両と異なる`); }
          if (u.avoid.has(v.id)) { flags.push('NG車両'); violations.push(`${u.name}: NG車両に配車`); }
          if (st.ride > maxRide) maxRide = st.ride;
          return {
            userId: u.id, name: u.name, wheelchair: u.wc,
            time: toHHMM(st.arrive), timeMin: st.arrive,
            rideMin: Math.round(st.ride), flags
          };
        });
        out.trips.push({
          trip: out.trips.length + 1, slot: t,
          depart: toHHMM(info.dep), arrive: toHHMM(info.arrive),
          departMin: info.dep, arriveMin: info.arrive,
          travelMin: Math.round(info.travel), distKm: +info.dist.toFixed(1),
          seatsUsed: seat, wheelchairsUsed: wc,
          stops
        });
      });
      if (P.dir === 'pickup' && out.trips.length) {
        const last = out.trips[out.trips.length - 1];
        if (last.arriveMin > P.T - P.s.depotMin + 0.5) violations.push(`${v.name}: 施設到着が期限超過 (${last.arrive}着 / 降車時間を見込んだ期限${toHHMM(P.T - P.s.depotMin)})`);
        if (v.from != null && out.trips[0].departMin < v.from - 0.5) violations.push(`${v.name}: 稼働開始(${toHHMM(v.from)})より前に出発が必要 (${out.trips[0].depart})`);
        // 便どうしの重なり
        for (let i = 1; i < out.trips.length; i++) if (out.trips[i - 1].arriveMin > out.trips[i].departMin + 0.5) violations.push(`${v.name}: ${out.trips[i - 1].trip}便の帰着が${out.trips[i].trip}便の出発に間に合わない`);
      }
      if (P.dir === 'dropoff' && out.trips.length) {
        const last = out.trips[out.trips.length - 1];
        if (v.until != null && last.arriveMin > v.until + 0.5) violations.push(`${v.name}: 稼働終了(${toHHMM(v.until)})を超過 (${last.arrive}帰着)`);
      }
      vehicles.push(out);
    });
    const splits = groupSplits(P, sol);
    if (splits) violations.push(`同乗グループが別の便に分かれています (${splits}件)`);
    return {
      direction: P.dir, facilityTime: toHHMM(P.T),
      vehicles, violations: [...new Set(violations)],
      summary: { usedVehicles, totalTravelMin: Math.round(totalTravel), totalDistKm: +totalDist.toFixed(1), maxRideMin: Math.round(maxRide), users: P.users.length },
      cost: cost(P, sol)
    };
  }

  function validate(problem) {
    const errs = [];
    const n = problem.users.length;
    if (!problem.vehicles || !problem.vehicles.length) errs.push('車両が1台もありません');
    if (!problem.matrix || problem.matrix.time.length !== n + 1) errs.push('所要時間行列のサイズが利用者数+1(施設)と一致しません');
    const totalSeats = problem.vehicles.reduce((a, v) => a + (+v.seats || 0) * Math.max(1, +v.maxTrips || 1), 0);
    const totalWc = problem.vehicles.reduce((a, v) => a + (+v.wheelchairSlots || 0) * Math.max(1, +v.maxTrips || 1), 0);
    const wcUsers = problem.users.filter((u) => u.wheelchair).length;
    if (n - wcUsers > totalSeats) errs.push(`座席が不足しています (必要${n - wcUsers} / 最大${totalSeats})`);
    if (wcUsers > totalWc) errs.push(`車椅子枠が不足しています (必要${wcUsers} / 最大${totalWc})`);
    return errs;
  }

  /**
   * メイン: 最適化
   * options = { timeMs: 1500, restarts: 3, seed: 1, coords: [{lat,lng}] (施設+利用者, 初期解用) }
   */
  function optimize(problem, options = {}) {
    const t0 = Date.now();
    const P = prepare(problem);
    P.coords = options.coords || null;
    const warnings = validate(problem);
    if (!P.users.length) return Object.assign(report(P, emptySolution(P)), { warnings, elapsedMs: 0 });
    const restarts = options.restarts || 3;
    const timeMs = options.timeMs || 1500;
    const rand = rng(options.seed || 1);
    let best = null, bestC = Infinity, iters = 0;
    let startSol = null;
    if (options.initialAssignment) startSol = fromAssignment(P, options.initialAssignment);
    for (let i = 0; i < restarts; i++) {
      const init = i === 0 && startSol ? startSol : initial(P, rand);
      const r = anneal(P, init, { timeMs: timeMs / restarts }, rand);
      iters += r.iterations || 0;
      if (r.cost < bestC) { bestC = r.cost; best = r.sol; }
    }
    polish(P, best);
    const rep = report(P, best);
    rep.warnings = warnings;
    rep.iterations = iters;
    rep.elapsedMs = Date.now() - t0;
    rep.assignment = toAssignment(P, best);
    return rep;
  }

  /** 手動調整した割当(順序含む)をそのまま評価 */
  function evaluate(problem, assignment) {
    const P = prepare(problem);
    const sol = fromAssignment(P, assignment);
    const rep = report(P, sol);
    rep.assignment = toAssignment(P, sol);
    return rep;
  }

  /** 1人を指定車両・便の最適位置に移す(他は固定) */
  function moveUser(problem, assignment, userId, vehicleId, trip) {
    const P = prepare(problem);
    const sol = fromAssignment(P, assignment);
    const ui = P.users.findIndex((u) => u.id === userId);
    if (ui < 0) return evaluate(problem, assignment);
    for (const trips of sol) for (const r of trips) { const p = r.indexOf(ui); if (p >= 0) r.splice(p, 1); }
    const k = P.vIndex.get(vehicleId);
    const t = Math.min(Math.max(0, (trip || 1) - 1), P.vehicles[k].maxTrips - 1);
    let bestC = Infinity, bestPos = 0; const r = sol[k][t];
    for (let p = 0; p <= r.length; p++) { r.splice(p, 0, ui); const c = cost(P, sol); if (c < bestC) { bestC = c; bestPos = p; } r.splice(p, 1); }
    r.splice(bestPos, 0, ui);
    const rep = report(P, sol); rep.assignment = toAssignment(P, sol); return rep;
  }

  // assignment = { [vehicleId]: [[userId,...] (1便), [..] (2便)] }
  function toAssignment(P, sol) {
    const a = {};
    sol.forEach((trips, k) => { a[P.vehicles[k].id] = trips.map((r) => r.map((ui) => P.users[ui].id)); });
    return a;
  }
  function fromAssignment(P, a) {
    const sol = emptySolution(P);
    const byId = new Map(P.users.map((u, i) => [u.id, i]));
    const seen = new Set();
    for (const [vid, trips] of Object.entries(a || {})) {
      const k = P.vIndex.get(vid); if (k == null) continue;
      trips.forEach((r, t) => {
        if (t >= sol[k].length) t = sol[k].length - 1;
        r.forEach((id) => { const ui = byId.get(id); if (ui != null && !seen.has(ui)) { sol[k][t].push(ui); seen.add(ui); } });
      });
    }
    // 未割当の利用者は最適位置に挿入
    P.users.forEach((u, i) => { if (!seen.has(i)) insertBest(P, sol, [i]); });
    return sol;
  }

  return { optimize, evaluate, moveUser, estimateMatrix, haversineKm, toMin, toHHMM, DEFAULT_WEIGHTS };
});
