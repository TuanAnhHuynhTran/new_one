// Nhà nhiều tầng (House Builder Phase 02.6) — hình học thuần, dùng chung client / server.
//
// Tầng (level): { id: 'level_0', index: 0, height: 3, elevation: 0 } — elevation = tổng chiều cao các tầng bên dưới.
// Mọi đối tượng (tường, phòng, tấm sàn, cầu thang) có `floor` (= index tầng) và `level_id`; lỗ mở thuộc tường nên thuộc tầng của tường.
// Không lưu toạ độ Y: độ cao luôn tính từ tầng (elevation) — đổi chiều cao tầng thì mọi thứ phía trên tự dịch theo.
//
// Quy tắc xây tầng trên (nhất quán, không mô phỏng kết cấu thật):
//   - Vùng đỡ của tầng L = phòng + tấm sàn của tầng L − 1. Tầng L chỉ được tạo khi vùng đỡ không rỗng.
//   - Tấm sàn tầng L phải chạm vùng đỡ, mọi đỉnh cách vùng đỡ ≤ BALCONY_MAX (ban công nhô ra tối đa 1.5 m).
//   - Tường tầng L phải nằm trên mặt sàn tầng L (vùng đỡ ∪ tấm sàn tầng L) → không có tường / tầng trôi nổi.
// Cầu thang: đặt ở tầng dưới (floor), nối lên floor + 1; tạo lỗ sàn ở tầng trên đúng footprint của cầu thang.
import { distToPolygonEdges, footprintInside, pointInPolygon } from './buildGeometry.mjs';
import { convexOverlap, polygonCentroid } from './roomGeometry.mjs';
import { wallFootprint, wallLength } from './wallGeometry.mjs';

export const MAX_LEVELS = 2;
export const DEFAULT_LEVEL_HEIGHT = 3;
export const LEVEL_LIMITS = { height: [2.6, 4.5] };
export const BALCONY_MAX = 1.5;
export const RISER = 0.18, TREAD = 0.28;
export const STAIR_LIMITS = { width: [0.8, 1.6] };
export const STAIR_DEFAULTS = { kind: 'straight', width: 1, turn: 'left' };
export const LEVEL_ERRORS = {
  TOO_MANY: `Tối đa ${MAX_LEVELS} tầng`,
  NO_SUPPORT: 'Tầng dưới chưa có phòng / sàn để đỡ tầng trên',
  NO_LEVEL: 'Đối tượng thuộc tầng không tồn tại',
  FLOATING_WALL: 'Tường tầng trên không có sàn đỡ bên dưới',
  FLOATING_SLAB: 'Sàn tầng trên không chạm phần đỡ của tầng dưới',
  BALCONY: `Ban công nhô ra quá ${BALCONY_MAX} m`,
  HEIGHT: `Chiều cao tầng ${LEVEL_LIMITS.height[0]}–${LEVEL_LIMITS.height[1]} m`,
};
export const STAIR_ERRORS = {
  NO_UPPER: 'Chưa có tầng phía trên để nối cầu thang',
  OUTSIDE: 'Cầu thang ra ngoài ranh giới / khoảng lùi',
  OVERLAP: 'Đè lên cầu thang khác',
  WALL: 'Cầu thang đè lên tường (tầng dưới hoặc lỗ sàn tầng trên)',
  NO_LANDING: 'Đầu trên cầu thang không có sàn tầng trên',
  NO_ENTRY: 'Chân cầu thang bị chặn',
  BAD: 'Thông số cầu thang không hợp lệ',
};
const r4 = v => Math.round(v * 1e4) / 1e4;
const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));

// ---------- Tầng ----------
export const levelElevation = (levels, i) => (levels || []).slice(0, i).reduce((a, l) => a + (Number(l.height) || DEFAULT_LEVEL_HEIGHT), 0) || (levels?.length ? 0 : i * DEFAULT_LEVEL_HEIGHT);
export const levelHeight = (levels, i) => Number(levels?.[i]?.height) || DEFAULT_LEVEL_HEIGHT;
export const levelId = i => `level_${i}`;
// Chuẩn hoá thiết kế (cả dữ liệu cũ một tầng, schema 1 không có levels) → schema 2 có levels, mọi đối tượng có level_id.
export function normalizeDesign(design) {
  const objs = design?.objects || [];
  const maxF = Math.max(0, ...objs.map(o => (Number.isInteger(o.floor) ? o.floor : 0)));
  const given = Array.isArray(design?.levels) ? design.levels : [];
  const n = Math.max(1, given.length, maxF + 1);
  const levels = Array.from({ length: n }, (_, i) => ({ id: levelId(i), index: i, height: r4(clamp(Number(given[i]?.height) || DEFAULT_LEVEL_HEIGHT, LEVEL_LIMITS.height)) }));
  levels.forEach((l, i) => { l.elevation = r4(levelElevation(levels, i)); });
  return { ...design, schema: 2, levels, objects: objs.map(o => ({ ...o, floor: Number.isInteger(o.floor) ? o.floor : 0, level_id: levelId(Number.isInteger(o.floor) ? o.floor : 0) })) };
}

// ---------- Vùng sàn / vùng đỡ ----------
const ofType = (design, type, floor) => (design.objects || []).filter(o => o.type === type && o.floor === floor);
// Mặt sàn của tầng L (đa giác): phòng + tấm sàn tầng L.
export const floorArea = (design, L) => [...ofType(design, 'room', L).map(r => r.polygon), ...ofType(design, 'floor', L).map(s => s.polygon)];
export const supportArea = (design, L) => (L <= 0 ? [] : floorArea(design, L - 1));
// Khoảng cách từ điểm tới tập đa giác (0 nếu nằm trong).
export function distToArea(x, z, polys) {
  let d = Infinity;
  for (const p of polys) { if (pointInPolygon(x, z, p)) return 0; d = Math.min(d, distToPolygonEdges(x, z, p)); }
  return d;
}
const inArea = (x, z, polys, tol = 1e-6) => distToArea(x, z, polys) <= tol;

// Kiểm tra cấu trúc tầng của cả thiết kế → [{ code, id? }].
export function validateLevels(design) {
  const errs = [], levels = design.levels || [];
  if (levels.length > MAX_LEVELS) errs.push({ code: 'TOO_MANY' });
  levels.forEach(l => { if (!(l.height >= LEVEL_LIMITS.height[0] && l.height <= LEVEL_LIMITS.height[1])) errs.push({ code: 'HEIGHT', id: l.id }); });
  for (const o of design.objects || []) if (!(o.floor >= 0 && o.floor < levels.length)) errs.push({ code: 'NO_LEVEL', id: o.id });
  for (let L = 1; L < levels.length; L++) {
    const S = supportArea(design, L);
    // Tầng trên có kết cấu (tường / sàn / cầu thang dẫn lên) mà tầng dưới không có gì đỡ → lỗi. Cọc / vùng phác thảo thì được phép.
    const structural = (design.objects || []).some(o => (o.floor === L && ['wall', 'floor', 'room'].includes(o.type)) || (o.type === 'stair' && o.floor === L - 1));
    if (!S.length) { if (structural) errs.push({ code: 'NO_SUPPORT', id: levels[L].id }); continue; }
    for (const s of ofType(design, 'floor', L)) {
      const touches = s.polygon.some(([x, z]) => inArea(x, z, S)) || inArea(...polygonCentroid(s.polygon), S) || S.some(p => convexOverlap(p, s.polygon));
      if (!touches) errs.push({ code: 'FLOATING_SLAB', id: s.id });
      else if (s.polygon.some(([x, z]) => distToArea(x, z, S) > BALCONY_MAX + 1e-6)) errs.push({ code: 'BALCONY', id: s.id });
    }
    const U = [...S, ...ofType(design, 'floor', L).map(s => s.polygon)];
    for (const w of ofType(design, 'wall', L)) {
      const tol = w.thickness / 2 + 0.05, mid = [(w.start[0] + w.end[0]) / 2, (w.start[1] + w.end[1]) / 2];
      if ([w.start, w.end, mid].some(([x, z]) => distToArea(x, z, U) > tol)) errs.push({ code: 'FLOATING_WALL', id: w.id });
    }
  }
  return errs;
}

// ---------- Cầu thang ----------
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // dir 0: +Z, 1: +X, 2: −Z, 3: −X
const z0 = v => (v === 0 ? 0 : v); // bỏ -0
const leftOf = u => [z0(-u[1]), z0(u[0])];
// Hình chữ nhật: a = tâm cạnh đầu (chân), đi theo u một đoạn len, rộng wid.
function rect(a, u, len, wid) {
  const p = leftOf(u), hw = wid / 2;
  const q = (s, t) => [r4(a[0] + u[0] * s + p[0] * t), r4(a[1] + u[1] * s + p[1] * t)];
  return [q(0, -hw), q(len, -hw), q(len, hw), q(0, hw)];
}
export function stairSteps(height) { return Math.max(8, Math.round(height / RISER)); }
// Bố cục cầu thang: các vế (flight) + chiếu nghỉ (landing) với độ cao (tương đối so với sàn tầng dưới), footprint, chân / đầu.
export function stairLayout(st, height = DEFAULT_LEVEL_HEIGHT) {
  const n = stairSteps(height), u = DIRS[st.dir] || DIRS[0], w = st.width, rise = height / n, parts = [];
  const a = st.start;
  if (st.kind === 'L') {
    const n1 = Math.floor(n / 2), n2 = n - n1, len1 = n1 * TREAD, y1 = n1 * rise;
    parts.push({ type: 'flight', a, u, len: len1, width: w, y0: 0, y1, steps: n1, poly: rect(a, u, len1, w) });
    const lc = [a[0] + u[0] * (len1 + w / 2), a[1] + u[1] * (len1 + w / 2)];
    parts.push({ type: 'landing', a: [a[0] + u[0] * len1, a[1] + u[1] * len1], u, len: w, width: w, y0: y1, y1, center: lc, poly: rect([a[0] + u[0] * len1, a[1] + u[1] * len1], u, w, w) });
    const v = st.turn === 'right' ? [z0(u[1]), z0(-u[0])] : leftOf(u);
    const a2 = [lc[0] + v[0] * (w / 2), lc[1] + v[1] * (w / 2)], len2 = n2 * TREAD;
    parts.push({ type: 'flight', a: a2, u: v, len: len2, width: w, y0: y1, y1: height, steps: n2, poly: rect(a2, v, len2, w) });
    return { parts, polys: parts.map(p => p.poly), bottom: a, bottomDir: u, top: [r4(a2[0] + v[0] * len2), r4(a2[1] + v[1] * len2)], topDir: v, steps: n };
  }
  const len = n * TREAD;
  parts.push({ type: 'flight', a, u, len, width: w, y0: 0, y1: height, steps: n, poly: rect(a, u, len, w) });
  return { parts, polys: [parts[0].poly], bottom: a, bottomDir: u, top: [r4(a[0] + u[0] * len), r4(a[1] + u[1] * len)], topDir: u, steps: n };
}
// Độ cao mặt bậc (dốc liên tục để đi) tại (x, z) nếu nằm trên cầu thang; null nếu không.
export function stairHeightAt(layout, x, z) {
  for (const p of layout.parts) {
    const dx = x - p.a[0], dz = z - p.a[1], s = dx * p.u[0] + dz * p.u[1], t = dx * -p.u[1] + dz * p.u[0];
    if (s >= -1e-6 && s <= p.len + 1e-6 && Math.abs(t) <= p.width / 2 + 1e-6) return p.y0 + (p.y1 - p.y0) * Math.min(1, Math.max(0, s / p.len));
  }
  return null;
}
export const stairsOf = (design, floor = null) => (design.objects || []).filter(o => o.type === 'stair' && (floor == null || o.floor === floor));
// Lỗ sàn ở tầng L = footprint các cầu thang đặt từ tầng L − 1.
export const floorHoles = (design, L) => stairsOf(design, L - 1).flatMap(st => stairLayout(st, levelHeight(design.levels, st.floor)).polys);

// Kiểm tra một cầu thang. opts: { poly (ranh giới lô local), setback }. Trả mã lỗi hoặc null.
export function validateStair(design, st, { poly = null, setback = 0 } = {}) {
  if (!['straight', 'L'].includes(st.kind) || !(st.dir >= 0 && st.dir <= 3) || !Number.isInteger(st.dir) || !['left', 'right'].includes(st.turn || 'left')) return 'BAD';
  if (!(st.width >= STAIR_LIMITS.width[0] && st.width <= STAIR_LIMITS.width[1]) || !Array.isArray(st.start) || !st.start.every(Number.isFinite)) return 'BAD';
  const levels = design.levels || [];
  if (!(st.floor >= 0) || st.floor + 1 >= levels.length) return 'NO_UPPER';
  const lay = stairLayout(st, levelHeight(levels, st.floor));
  if (poly && !lay.polys.every(p => footprintInside(p, poly, setback))) return 'OUTSIDE';
  for (const o of stairsOf(design)) {
    if (o.id === st.id || (o.floor !== st.floor && o.floor !== st.floor + 1 && o.floor + 1 !== st.floor)) continue;
    if (o.floor === st.floor && stairLayout(o, levelHeight(levels, o.floor)).polys.some(a => lay.polys.some(b => convexOverlap(a, b)))) return 'OVERLAP';
  }
  // Không đè tường tầng dưới, không có tường tầng trên đi qua lỗ sàn.
  for (const w of (design.objects || []).filter(o => o.type === 'wall' && (o.floor === st.floor || o.floor === st.floor + 1))) {
    if (wallLength(w) <= 0) continue;
    const fp = wallFootprint(w, false);
    if (lay.polys.some(p => convexOverlap(p, fp))) return 'WALL';
  }
  // Đầu trên phải bước ra sàn tầng trên (ngoài lỗ sàn của chính nó / cầu thang khác).
  const ex = [lay.top[0] + lay.topDir[0] * 0.35, lay.top[1] + lay.topDir[1] * 0.35];
  const holes = floorHoles({ ...design, objects: [...stairsOf(design).filter(o => o.id !== st.id), st] }, st.floor + 1);
  if (!inArea(ex[0], ex[1], floorArea(design, st.floor + 1)) || holes.some(h => pointInPolygon(ex[0], ex[1], h))) return 'NO_LANDING';
  // Chân cầu thang không bị tường chặn và còn trong lô.
  const en = [lay.bottom[0] - lay.bottomDir[0] * 0.35, lay.bottom[1] - lay.bottomDir[1] * 0.35];
  if (poly && !pointInPolygon(en[0], en[1], poly)) return 'NO_ENTRY';
  for (const w of (design.objects || []).filter(o => o.type === 'wall' && o.floor === st.floor)) {
    const fp = wallFootprint(w, true);
    if (pointInPolygon(en[0], en[1], fp)) return 'NO_ENTRY';
  }
  return null;
}
export function cleanStair(o) {
  if (!Array.isArray(o.start) || o.start.length !== 2 || !o.start.every(n => typeof n === 'number' && Number.isFinite(n))) return { error: 'start phải là [x, z]' };
  if (!['straight', 'L'].includes(o.kind) || !Number.isInteger(o.dir) || o.dir < 0 || o.dir > 3 || typeof o.width !== 'number') return { error: 'kind / dir / width không hợp lệ' };
  return { obj: { id: o.id, type: 'stair', floor: o.floor, level_id: levelId(o.floor), kind: o.kind, start: o.start.map(r4), dir: o.dir, width: r4(o.width), turn: o.turn === 'right' ? 'right' : 'left' } };
}
// Hướng (0..3) gần nhất từ chân cầu thang tới điểm chuột.
export function dirToward(start, p) {
  const dx = p[0] - start[0], dz = p[1] - start[1];
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz >= 0 ? 0 : 2;
}
