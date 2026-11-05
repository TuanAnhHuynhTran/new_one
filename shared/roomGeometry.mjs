// Sàn & phòng (House Builder Phase 02.4) — hình học thuần, dùng chung client / server.
//
// Nhận diện phòng = tìm các MẶT bị chặn của đồ thị phẳng tạo bởi tim tường (không dùng bounding box):
//   1. Đỉnh = đầu tường (gộp theo sai số 1 mm); cạnh = đoạn tường, tự chia tại chỗ đầu tường khác chạm thân (nối chữ T).
//   2. Bỏ "râu" (cạnh treo, đỉnh bậc 1) và "cầu" (cạnh không thuộc chu trình nào — thuật toán Tarjan) → chỉ còn chu trình.
//   3. Duyệt mặt: theo mỗi cạnh có hướng u→v, ở v rẽ sang cạnh liền kề theo chiều kim đồng hồ của cạnh v→u
//      → mỗi mặt bị chặn là một đa giác ngược chiều kim đồng hồ (diện tích có dấu > 0), mặt ngoài có diện tích < 0.
//   4. Cụm tường nằm hẳn trong một phòng khác (đảo) → lỗ (hole) của phòng đó, diện tích trừ đi.
// Tường chưa khép kín không tạo mặt nào → không có phòng. Mặt nhỏ hơn MIN_ROOM_AREA bị bỏ (không có phòng giả).
//
// Dữ liệu (toạ độ local X/Z của tầng):
//   phòng: { id, type: 'room', floor, polygon: [[x, z]…] (CCW), holes: [[[x, z]…]], area, name, room_type, floor_material_id }
//   sàn:   { id, type: 'floor', floor, shape: 'rect' | 'polygon', polygon: [[x, z]…], thickness, material_id }
import { pointInPolygon, polygonArea } from './buildGeometry.mjs';
import { crossingPoint } from './wallGeometry.mjs';

export const MIN_ROOM_AREA = 0.5;
export const ROOM_TYPES = [
  { id: 'living', name: 'Phòng khách' }, { id: 'bedroom', name: 'Phòng ngủ' }, { id: 'kitchen', name: 'Nhà bếp' },
  { id: 'bathroom', name: 'Nhà tắm' }, { id: 'other', name: 'Phòng khác' },
];
export const FLOOR_MATERIALS = [
  { id: 'wood', name: 'Gỗ sáng', color: '#e2b588' }, { id: 'wood-dark', name: 'Gỗ tối', color: '#a8744f' },
  { id: 'tile-white', name: 'Gạch trắng', color: '#f1ece3' }, { id: 'tile-blue', name: 'Gạch xanh', color: '#bfdfe6' },
  { id: 'stone', name: 'Đá', color: '#bdb6ab' }, { id: 'carpet-pink', name: 'Thảm hồng', color: '#f2c6c8' },
];
export const FLOOR_DEFAULTS = { thickness: 0.1, material_id: 'wood' };
export const FLOOR_LIMITS = { thickness: [0.05, 0.5], minSide: 0.5, maxPoints: 32 };
export const FLOOR_ERRORS = {
  TOO_SMALL: `Sàn tối thiểu ${FLOOR_LIMITS.minSide} × ${FLOOR_LIMITS.minSide} m`,
  OUTSIDE: 'Sàn ra ngoài ranh giới / khoảng lùi',
  OVERLAP: 'Chồng lên tấm sàn khác cùng tầng',
  LIMITS: 'Độ dày / vật liệu sàn ngoài giới hạn',
};
const EPS = 1e-3, r4 = v => Math.round(v * 1e4) / 1e4;
const key = p => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`;

// ---------- Đa giác ----------
export const signedArea = poly => polygonArea(poly);
export function polygonCentroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length], c = x1 * z2 - x2 * z1;
    a += c; cx += (x1 + x2) * c; cz += (z1 + z2) * c;
  }
  if (Math.abs(a) < 1e-12) return poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
  return [cx / (3 * a), cz / (3 * a)];
}
// Bỏ đỉnh thẳng hàng (các điểm chia tường trên một cạnh thẳng) và đỉnh trùng.
export function simplifyPolygon(poly) {
  let pts = poly.filter((p, i) => Math.hypot(p[0] - poly[(i + 1) % poly.length][0], p[1] - poly[(i + 1) % poly.length][1]) > EPS);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-6) { pts.splice(i, 1); changed = true; break; }
    }
  }
  return pts.map(p => [r4(p[0]), r4(p[1])]);
}
// Đưa đa giác về bắt đầu từ đỉnh nhỏ nhất (so sánh ổn định giữa client / server).
export function canonicalPolygon(poly) {
  let k = 0;
  poly.forEach((p, i) => { if (p[0] < poly[k][0] - 1e-9 || (Math.abs(p[0] - poly[k][0]) < 1e-9 && p[1] < poly[k][1])) k = i; });
  return [...poly.slice(k), ...poly.slice(0, k)];
}
const insideRoom = (x, z, room) => pointInPolygon(x, z, room.polygon) && !(room.holes || []).some(h => pointInPolygon(x, z, h) && !onEdge(x, z, h));
function onEdge(x, z, poly) {
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) < 1e-7) return true;
  }
  return false;
}
export function roomContains(room, x, z) { return insideRoom(x, z, room); }

// ---------- Đồ thị phẳng ----------
export function buildPlanarGraph(walls) {
  const nodes = new Map(); // key → { id, p }
  const nodeOf = p => { const k = key(p); if (!nodes.has(k)) nodes.set(k, { id: k, p: [p[0], p[1]] }); return nodes.get(k); };
  walls.forEach(w => { nodeOf(w.start); nodeOf(w.end); });
  // Hai tường cắt ngang nhau (chưa chia đoạn) → thêm đỉnh tại giao điểm.
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) { const c = crossingPoint(walls[i], walls[j]); if (c) nodeOf(c); }
  const all = [...nodes.values()], edges = new Map();
  for (const w of walls) {
    const a = nodeOf(w.start), b = nodeOf(w.end), dx = b.p[0] - a.p[0], dz = b.p[1] - a.p[1], L2 = dx * dx + dz * dz;
    if (L2 < EPS * EPS) continue;
    // Chia cạnh tại các đỉnh nằm trên thân (nối chữ T chưa được chia trong dữ liệu).
    const mids = all.filter(n => n !== a && n !== b).map(n => ({ n, t: ((n.p[0] - a.p[0]) * dx + (n.p[1] - a.p[1]) * dz) / L2 }))
      .filter(({ n, t }) => t > 1e-6 && t < 1 - 1e-6 && Math.abs((n.p[0] - a.p[0]) * dz - (n.p[1] - a.p[1]) * dx) / Math.sqrt(L2) < EPS)
      .sort((x, y) => x.t - y.t).map(m => m.n);
    const chain = [a, ...mids, b];
    for (let i = 0; i + 1 < chain.length; i++) {
      const u = chain[i], v = chain[i + 1], k = u.id < v.id ? `${u.id}|${v.id}` : `${v.id}|${u.id}`;
      if (!edges.has(k)) edges.set(k, { u: u.id, v: v.id, walls: [] });
      edges.get(k).walls.push(w.id);
    }
  }
  return { nodes, edges };
}
const adjacency = (nodes, edges) => {
  const adj = new Map([...nodes.keys()].map(k => [k, new Set()]));
  for (const e of edges.values()) { adj.get(e.u).add(e.v); adj.get(e.v).add(e.u); }
  return adj;
};
function pruneFilaments(nodes, edges) {
  let adj = adjacency(nodes, edges), again = true;
  while (again) {
    again = false;
    for (const [n, s] of adj) {
      if (s.size === 1) {
        const m = [...s][0];
        edges.delete(n < m ? `${n}|${m}` : `${m}|${n}`);
        adj.get(m).delete(n); s.clear(); again = true;
      }
    }
  }
}
// Cầu (bridge) — Tarjan, lặp (không đệ quy để tránh tràn stack).
function removeBridges(nodes, edges) {
  const adj = adjacency(nodes, edges), disc = new Map(), low = new Map(), bridges = [];
  let time = 0;
  for (const start of adj.keys()) {
    if (disc.has(start)) continue;
    const stack = [[start, null, [...adj.get(start)], 0]];
    disc.set(start, time); low.set(start, time); time++;
    while (stack.length) {
      const top = stack[stack.length - 1], [u, parent, nb] = top;
      if (top[3] < nb.length) {
        const v = nb[top[3]++];
        if (v === parent) continue;
        if (disc.has(v)) low.set(u, Math.min(low.get(u), disc.get(v)));
        else { disc.set(v, time); low.set(v, time); time++; stack.push([v, u, [...adj.get(v)], 0]); }
      } else {
        stack.pop();
        if (parent != null) {
          low.set(parent, Math.min(low.get(parent), low.get(u)));
          if (low.get(u) > disc.get(parent)) bridges.push(parent < u ? `${parent}|${u}` : `${u}|${parent}`);
        }
      }
    }
  }
  bridges.forEach(b => edges.delete(b));
  return bridges.length;
}
// Các mặt (đa giác) của đồ thị: { poly, area (có dấu), comp } — area > 0 = mặt bị chặn (phòng), < 0 = mặt ngoài của một cụm.
export function graphFaces(walls) {
  const { nodes, edges } = buildPlanarGraph(walls);
  pruneFilaments(nodes, edges);
  while (removeBridges(nodes, edges)) pruneFilaments(nodes, edges);
  const adj = adjacency(nodes, edges), P = id => nodes.get(id).p;
  const sorted = new Map();
  for (const [u, s] of adj) sorted.set(u, [...s].sort((a, b) => Math.atan2(P(a)[1] - P(u)[1], P(a)[0] - P(u)[0]) - Math.atan2(P(b)[1] - P(u)[1], P(b)[0] - P(u)[0])));
  // Cụm liên thông (để gắn lỗ cho đúng).
  const comp = new Map();
  let c = 0;
  for (const s of adj.keys()) {
    if (comp.has(s) || !adj.get(s).size) continue;
    const q = [s]; comp.set(s, c);
    while (q.length) { const u = q.pop(); for (const v of adj.get(u)) if (!comp.has(v)) { comp.set(v, c); q.push(v); } }
    c++;
  }
  const used = new Set(), faces = [];
  for (const e of edges.values()) {
    for (const [s, t] of [[e.u, e.v], [e.v, e.u]]) {
      if (used.has(`${s}>${t}`)) continue;
      const loop = [];
      let u = s, v = t, guard = 0;
      while (!used.has(`${u}>${v}`) && guard++ < 10000) {
        used.add(`${u}>${v}`); loop.push(P(u));
        const list = sorted.get(v), i = list.indexOf(u), w = list[(i - 1 + list.length) % list.length];
        u = v; v = w;
      }
      if (loop.length >= 3) faces.push({ poly: loop, area: signedArea(loop), comp: comp.get(s) });
    }
  }
  return faces;
}

// Phòng (chưa có id / thuộc tính) từ tường của MỘT tầng.
export function detectRooms(walls) {
  const faces = graphFaces(walls);
  const rooms = faces.filter(f => f.area > MIN_ROOM_AREA - 1e-9).map(f => {
    const polygon = canonicalPolygon(simplifyPolygon(f.poly));
    return { polygon, holes: [], area: r4(signedArea(polygon)), comp: f.comp };
  });
  // Mặt ngoài của mỗi cụm nằm hẳn trong một phòng của cụm khác → lỗ của phòng nhỏ nhất chứa nó.
  for (const outer of faces.filter(f => f.area < -1e-9)) {
    const hole = simplifyPolygon(outer.poly);
    const host = rooms.filter(r => r.comp !== outer.comp && hole.every(([x, z]) => pointInPolygon(x, z, r.polygon))).sort((a, b) => a.area - b.area)[0];
    if (host) { host.holes.push(hole); host.area = r4(host.area - Math.abs(signedArea(hole))); }
  }
  return rooms.filter(r => r.area > MIN_ROOM_AREA - 1e-9).map(({ comp, ...r }) => r);
}

// ---------- Giữ Room ID ổn định ----------
// Diện tích giao gần đúng bằng lấy mẫu lưới (đủ chính xác để ghép phòng cũ ↔ mới).
export function overlapArea(a, b, step = 0.25) {
  const xs = [...a.polygon, ...b.polygon].map(p => p[0]), zs = [...a.polygon, ...b.polygon].map(p => p[1]);
  const x0 = Math.max(Math.min(...a.polygon.map(p => p[0])), Math.min(...b.polygon.map(p => p[0])));
  const x1 = Math.min(Math.max(...a.polygon.map(p => p[0])), Math.max(...b.polygon.map(p => p[0])));
  const z0 = Math.max(Math.min(...a.polygon.map(p => p[1])), Math.min(...b.polygon.map(p => p[1])));
  const z1 = Math.min(Math.max(...a.polygon.map(p => p[1])), Math.max(...b.polygon.map(p => p[1])));
  if (x1 <= x0 || z1 <= z0 || !xs.length || !zs.length) return 0;
  let n = 0;
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) if (insideRoom(x, z, a) && insideRoom(x, z, b)) n++;
  return n * step * step;
}
// old: phòng đã lưu của một tầng; found: detectRooms. Trả { rooms, events }.
//   - Ghép theo diện tích giao lớn nhất (tham lam). Phòng mới khớp phòng cũ → giữ id + tên + loại + vật liệu sàn.
//   - Một phòng cũ bị chia → mảnh lớn giữ id, mảnh còn lại là phòng mới chép thuộc tính (event 'split').
//   - Nhiều phòng cũ gộp lại → giữ id của phòng giao nhiều nhất (event 'merge'), phòng kia biến mất.
//   - Phòng cũ không còn khớp vùng nào → bị bỏ (event 'removed' — cảnh báo mất vùng sàn).
export function reconcileRooms(old, found, newId, floor = 0) {
  const pairs = [];
  found.forEach((f, i) => old.forEach((o, j) => { const ov = overlapArea(f, o); if (ov > 0.05 * Math.min(f.area, o.area)) pairs.push({ i, j, ov }); }));
  pairs.sort((a, b) => b.ov - a.ov);
  const fTaken = new Map(), oTaken = new Set();
  for (const p of pairs) if (!fTaken.has(p.i) && !oTaken.has(p.j)) { fTaken.set(p.i, p.j); oTaken.add(p.j); }
  // Số thứ tự kế tiếp cho tên mặc định "Phòng N" (không trùng tên phòng đang có).
  const usedNo = new Set(old.map(o => /^Phòng (\d+)$/.exec(o.name || '')?.[1]).filter(Boolean).map(Number));
  const nextNo = () => { let k = 1; while (usedNo.has(k)) k++; usedNo.add(k); return k; };
  const events = [], rooms = found.map((f, i) => {
    const base = { type: 'room', floor, polygon: f.polygon, holes: f.holes, area: f.area };
    if (fTaken.has(i)) { const o = old[fTaken.get(i)]; return { ...o, ...base, id: o.id }; }
    // Không giữ được id: là mảnh tách ra từ phòng cũ nào đó (chép thuộc tính) hay phòng hoàn toàn mới.
    const src = pairs.filter(p => p.i === i).sort((a, b) => b.ov - a.ov)[0];
    if (src) {
      const o = old[src.j];
      events.push({ type: 'split', from: o.id, name: o.name });
      return { ...base, id: newId(), name: `${o.name} (2)`, room_type: o.room_type, floor_material_id: o.floor_material_id };
    }
    events.push({ type: 'created' });
    return { ...base, id: newId(), name: `Phòng ${nextNo()}`, room_type: 'other', floor_material_id: FLOOR_DEFAULTS.material_id };
  });
  old.forEach((o, j) => {
    if (oTaken.has(j)) return;
    const into = pairs.filter(p => p.j === j).sort((a, b) => b.ov - a.ov)[0];
    if (into) events.push({ type: 'merge', from: o.id, name: o.name, into: rooms[into.i].id });
    else events.push({ type: 'removed', id: o.id, name: o.name, area: o.area });
  });
  return { rooms, events };
}

// Đồng bộ phòng của cả thiết kế theo tường hiện tại (mọi tầng). Trả { design, events }.
export function syncRooms(design, newId) {
  const objs = design.objects || [], floors = new Set(objs.filter(o => o.type === 'wall' || o.type === 'room').map(o => o.floor));
  let rooms = [], events = [];
  for (const f of [...floors].sort()) {
    const r = reconcileRooms(objs.filter(o => o.type === 'room' && o.floor === f), detectRooms(objs.filter(o => o.type === 'wall' && o.floor === f)), newId, f);
    rooms = rooms.concat(r.rooms); events = events.concat(r.events.map(e => ({ ...e, floor: f })));
  }
  return { design: { ...design, objects: [...objs.filter(o => o.type !== 'room'), ...rooms] }, events };
}
// Thông báo tiếng Việt cho các sự kiện phòng (cảnh báo khi mất vùng sàn).
export function roomEventsMessage(events) {
  const parts = [];
  const c = t => events.filter(e => e.type === t);
  if (c('created').length) parts.push(`🏠 Nhận diện ${c('created').length} phòng mới`);
  for (const e of c('split')) parts.push(`✂️ Chia "${e.name}" thành hai phòng`);
  for (const e of c('merge')) parts.push(`🔗 Hợp nhất "${e.name}" vào phòng khác`);
  for (const e of c('removed')) parts.push(`⚠ Mất vùng sàn: "${e.name}" (${e.area} m²) không còn khép kín`);
  return parts.join(' · ') || null;
}

// ---------- Tấm sàn ----------
export const rectPolygon = (a, b) => {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(p => [r4(p[0]), r4(p[1])]);
};
// Hai đa giác LỒI chồng lên nhau với diện tích dương (định lý trục tách — SAT). Chạm cạnh không tính.
export function convexOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length], nx = -(z2 - z1), nz = x2 - x1;
      const proj = q => q.map(([x, z]) => x * nx + z * nz);
      const pa = proj(a), pb = proj(b), eps = 1e-6 * Math.hypot(nx, nz);
      if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
    }
  }
  return true;
}
export function validateFloor(slab, others, { insideFn = () => true } = {}) {
  const p = slab.polygon, xs = p.map(q => q[0]), zs = p.map(q => q[1]);
  if (Math.max(...xs) - Math.min(...xs) < FLOOR_LIMITS.minSide - 1e-9 || Math.max(...zs) - Math.min(...zs) < FLOOR_LIMITS.minSide - 1e-9) return 'TOO_SMALL';
  if (!(slab.thickness >= FLOOR_LIMITS.thickness[0] && slab.thickness <= FLOOR_LIMITS.thickness[1]) || !FLOOR_MATERIALS.some(m => m.id === slab.material_id)) return 'LIMITS';
  if (!insideFn(p)) return 'OUTSIDE';
  if (others.some(o => o.id !== slab.id && o.floor === slab.floor && convexOverlap(o.polygon, p))) return 'OVERLAP';
  return null;
}
// So hai phòng có cùng vùng (dùng ở server để chắc phòng client gửi khớp tường).
export function sameRegion(a, b) {
  if (Math.abs(a.area - b.area) > 0.02 + 0.002 * b.area) return false;
  return overlapArea(a, b, 0.125) >= 0.96 * Math.min(a.area, b.area) - 0.05;
}
