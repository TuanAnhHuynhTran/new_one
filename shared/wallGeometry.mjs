// Hệ thống tường (House Builder Phase 02.3) — hình học thuần, dùng chung client / server.
// Dữ liệu một đoạn tường (toạ độ X/Z local của lô, theo tầng; Y tính từ độ cao tầng):
//   { id, type: 'wall', floor, start: [x, z], end: [x, z], height, thickness, material_id, color?, openings: [{ id, type, offset, width, height?, sill? }] }
// Hình học (start/end/height/thickness/openings) tách khỏi hiển thị (material_id → WALL_MATERIALS, color ghi đè tuỳ chọn).
// openings[].offset = khoảng cách (m) từ start tới mép cửa gần start dọc theo tường.
import { footprintInside, rectFootprint, segmentsCross } from './buildGeometry.mjs';

export const WALL_DEFAULTS = { height: 3, thickness: 0.2, material_id: 'paint-white' };
export const WALL_LIMITS = { minLength: 0.2, height: [1, 5], thickness: [0.1, 0.5], maxOpenings: 20 };
export const WALL_MATERIALS = [
  { id: 'paint-white', name: 'Sơn trắng', color: '#f6efe4', rough: 0.9 },
  { id: 'paint-cream', name: 'Sơn kem', color: '#f2ddbc', rough: 0.9 },
  { id: 'paint-mint', name: 'Sơn bạc hà', color: '#bfe3d6', rough: 0.9 },
  { id: 'paint-pink', name: 'Sơn hồng', color: '#f3c6c2', rough: 0.9 },
  { id: 'brick', name: 'Gạch', color: '#c9704f', rough: 1 },
  { id: 'wood', name: 'Gỗ', color: '#b98552', rough: 0.8 },
  { id: 'stone', name: 'Đá', color: '#a9a39a', rough: 1 },
];
export const WALL_ERRORS = {
  TOO_SHORT: `Tường quá ngắn (tối thiểu ${WALL_LIMITS.minLength} m)`,
  DUPLICATE: 'Trùng hoàn toàn với tường đã có',
  OVERLAP: 'Chồng lên một đoạn tường đã có',
  CROSSING: 'Cắt ngang tường khác (chưa chia đoạn)',
  OUTSIDE: 'Ra ngoài ranh giới / khoảng lùi xây dựng',
  OPENING_SPLIT: 'Điểm nối cắt qua cửa / cửa sổ của tường khác',
  OPENING_FIT: 'Cửa / cửa sổ không còn vừa đoạn tường',
  LIMITS: 'Chiều cao / độ dày / vật liệu ngoài giới hạn',
  NOT_FOUND: 'Không tìm thấy đoạn tường',
};
const EPS = 1e-3;
const r4 = v => Math.round(v * 1e4) / 1e4;
const pt = p => [r4(p[0]), r4(p[1])];

// ---------- Hình học cơ bản ----------
export const wallLength = w => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
// Góc rotation.y (three.js) để trục X của hộp chạy từ start → end.
export const wallAngle = w => Math.atan2(-(w.end[1] - w.start[1]), w.end[0] - w.start[0]);
export const samePoint = (a, b, eps = EPS) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;
export function projectOnSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0;
  const q = [a[0] + t * dx, a[1] + t * dz];
  return { t, point: q, dist: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}
export const distToWall = (p, w) => projectOnSegment(p, w.start, w.end).dist;
// p nằm trên đoạn tường, KHÔNG trùng hai đầu mút.
export function pointOnWallInterior(p, w, eps = EPS) {
  const L = wallLength(w), pr = projectOnSegment(p, w.start, w.end);
  return pr.dist < eps && pr.t * L > eps && (1 - pr.t) * L > eps;
}
// Footprint hình chữ nhật của tường (gồm nửa độ dày ở hai đầu — phần nối góc) để kiểm tra ranh giới.
export function wallFootprint(w, withCaps = true) {
  const L = wallLength(w), cx = (w.start[0] + w.end[0]) / 2, cz = (w.start[1] + w.end[1]) / 2;
  return rectFootprint(cx, cz, L + (withCaps ? w.thickness : 0), w.thickness, wallAngle(w));
}
// Độ dài phần chồng lên nhau khi hai tường thẳng hàng (0 nếu không thẳng hàng / chỉ chạm đầu).
export function collinearOverlap(a, b) {
  if (distPointSegLine(b.start, a) > EPS || distPointSegLine(b.end, a) > EPS) return 0;
  const L = wallLength(a); if (!L) return 0;
  const ux = (a.end[0] - a.start[0]) / L, uz = (a.end[1] - a.start[1]) / L;
  const s = p => (p[0] - a.start[0]) * ux + (p[1] - a.start[1]) * uz;
  const b0 = Math.min(s(b.start), s(b.end)), b1 = Math.max(s(b.start), s(b.end));
  return Math.max(0, Math.min(L, b1) - Math.max(0, b0));
}
// Khoảng cách từ điểm tới ĐƯỜNG THẲNG chứa tường.
function distPointSegLine(p, w) {
  const dx = w.end[0] - w.start[0], dz = w.end[1] - w.start[1], L = Math.hypot(dx, dz) || 1;
  return Math.abs((p[0] - w.start[0]) * dz - (p[1] - w.start[1]) * dx) / L;
}
// Giao điểm khi hai tường cắt ngang nhau (phần trong cắt phần trong), null nếu không.
export function crossingPoint(a, b) {
  if (!segmentsCross(a.start, a.end, b.start, b.end)) return null;
  const [x1, z1] = a.start, [x2, z2] = a.end, [x3, z3] = b.start, [x4, z4] = b.end;
  const d = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / d;
  return pt([x1 + t * (x2 - x1), z1 + t * (z2 - z1)]);
}

// ---------- Chia đoạn ----------
// Chia tường tại các điểm (trên tường). Cửa / cửa sổ được chuyển sang đoạn chứa nó; điểm chia rơi vào cửa → lỗi.
export function splitWall(w, points, newId) {
  const L = wallLength(w);
  const ts = [...new Set(points.map(p => r4(projectOnSegment(p, w.start, w.end).t * L)))].filter(s => s > EPS && s < L - EPS).sort((a, b) => a - b);
  if (!ts.length) return { parts: [w] };
  for (const o of w.openings || []) if (ts.some(s => s > o.offset + EPS && s < o.offset + o.width - EPS)) return { error: 'OPENING_SPLIT' };
  const ux = (w.end[0] - w.start[0]) / L, uz = (w.end[1] - w.start[1]) / L, at = s => pt([w.start[0] + ux * s, w.start[1] + uz * s]);
  const cuts = [0, ...ts, L], parts = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const s0 = cuts[i], s1 = cuts[i + 1];
    parts.push({
      ...w, id: i === 0 ? w.id : newId(), start: i === 0 ? w.start : at(s0), end: i === cuts.length - 2 ? w.end : at(s1),
      openings: (w.openings || []).filter(o => o.offset >= s0 - EPS && o.offset + o.width <= s1 + EPS).map(o => ({ ...o, offset: r4(o.offset - s0) })),
    });
  }
  return { parts };
}

// ---------- Thêm tường (nối L / T / chữ thập, chia đoạn tại giao điểm) ----------
// walls: mọi tường của thiết kế. Không bao giờ xoá tường có sẵn — chỉ chia đoạn (giữ nguyên thuộc tính, cửa).
// Trả { walls, added: [id], split: n } hoặc { error }.
export function addWall(walls, nw, newId, { poly = null, setback = 0 } = {}) {
  if (wallLength(nw) < WALL_LIMITS.minLength - 1e-9) return { error: 'TOO_SHORT' };
  if (poly && !footprintInside(wallFootprint(nw), poly, setback)) return { error: 'OUTSIDE' };
  const same = walls.filter(w => w.floor === nw.floor);
  for (const w of same) {
    if ((samePoint(w.start, nw.start) && samePoint(w.end, nw.end)) || (samePoint(w.start, nw.end) && samePoint(w.end, nw.start))) return { error: 'DUPLICATE' };
    if (collinearOverlap(w, nw) > EPS || collinearOverlap(nw, w) > EPS) return { error: 'OVERLAP' };
  }
  const newPts = [], oldPts = new Map();
  for (const w of same) {
    const list = [];
    for (const p of [w.start, w.end]) if (pointOnWallInterior(p, nw)) newPts.push(p); // tường cũ chạm vào giữa tường mới (T)
    for (const p of [nw.start, nw.end]) if (pointOnWallInterior(p, w)) list.push(p); // tường mới chạm vào giữa tường cũ (T)
    const c = crossingPoint(w, nw); // chữ thập
    if (c) { newPts.push(c); list.push(c); }
    if (list.length) oldPts.set(w.id, list);
  }
  const out = [];
  let split = 0;
  for (const w of walls) {
    if (!oldPts.has(w.id)) { out.push(w); continue; }
    const r = splitWall(w, oldPts.get(w.id), newId);
    if (r.error) return r;
    split += r.parts.length - 1;
    out.push(...r.parts);
  }
  const r = splitWall({ ...nw, start: pt(nw.start), end: pt(nw.end) }, newPts, newId);
  if (r.error) return r;
  return { walls: [...out, ...r.parts], added: r.parts.map(p => p.id), split };
}

// ---------- Kiểm tra cả tập tường (server khi lưu, client khi sửa / dời đầu tường) ----------
// Trả mảng lỗi [{ id, code }] (rỗng = hợp lệ). Cho phép nối L / T / chữ thập đã chia đoạn; cấm trùng / chồng / cắt ngang.
export function validateWallSet(walls, { poly = null, setback = 0, materials = WALL_MATERIALS } = {}) {
  const errors = [];
  for (const w of walls) {
    const L = wallLength(w);
    if (L < WALL_LIMITS.minLength - 1e-9) errors.push({ id: w.id, code: 'TOO_SHORT' });
    if (!(w.height >= WALL_LIMITS.height[0] && w.height <= WALL_LIMITS.height[1]) || !(w.thickness >= WALL_LIMITS.thickness[0] && w.thickness <= WALL_LIMITS.thickness[1])
      || !materials.some(m => m.id === w.material_id)) errors.push({ id: w.id, code: 'LIMITS' });
    if (poly && L > 0 && !footprintInside(wallFootprint(w), poly, setback)) errors.push({ id: w.id, code: 'OUTSIDE' });
    // Cửa / cửa sổ phải còn vừa tường (theo chiều dài và chiều cao) — chi tiết hơn: openingGeometry.validateWallOpenings.
    if ((w.openings || []).some(o => !(o.offset >= 0.05 - 1e-9) || !(o.width > 0) || o.offset + o.width > L - 0.05 + 1e-9 || (o.sill || 0) + (o.height || 0) > w.height - 0.05 + 1e-9)) errors.push({ id: w.id, code: 'OPENING_FIT' });
  }
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i], b = walls[j];
      if (a.floor !== b.floor) continue;
      if ((samePoint(a.start, b.start) && samePoint(a.end, b.end)) || (samePoint(a.start, b.end) && samePoint(a.end, b.start))) errors.push({ id: b.id, code: 'DUPLICATE' });
      else if (collinearOverlap(a, b) > EPS || collinearOverlap(b, a) > EPS) errors.push({ id: b.id, code: 'OVERLAP' });
      else if (crossingPoint(a, b)) errors.push({ id: b.id, code: 'CROSSING' });
    }
  }
  return errors;
}

// ---------- Dời đầu tường ----------
// Dời đầu `which` ('start' | 'end') của tường id tới p; mọi đầu tường khác trùng vị trí cũ (cùng tầng) đi theo để giữ mối nối.
// Cửa / cửa sổ bám vào đầu KHÔNG dời; nếu không còn vừa → báo lỗi, không làm mất cửa. Không tự chia đoạn — cắt ngang → lỗi.
export function moveWallEndpoint(walls, id, which, p, opts = {}) {
  const w = walls.find(x => x.id === id);
  if (!w) return { error: 'NOT_FOUND' };
  const old = w[which], np = pt(p);
  const out = walls.map(x => {
    if (x.floor !== w.floor) return x;
    const ms = samePoint(x.start, old), me = samePoint(x.end, old);
    if (!ms && !me) return x;
    const before = wallLength(x), next = { ...x, start: ms ? np : x.start, end: me ? np : x.end };
    const after = wallLength(next);
    // Dời đầu start → cửa giữ vị trí so với đầu end (offset cộng phần dài thêm).
    if (ms && !me && x.openings?.length) next.openings = x.openings.map(o => ({ ...o, offset: r4(o.offset + (after - before)) }));
    return next;
  });
  const changed = out.filter((x, i) => x !== walls[i]);
  const errs = validateWallSet(out.filter(x => x.floor === w.floor), opts).filter(e => changed.some(c => c.id === e.id) || ['DUPLICATE', 'OVERLAP', 'CROSSING'].includes(e.code));
  if (errs.length) return { error: errs[0].code, errors: errs };
  return { walls: out, moved: changed.map(c => c.id) };
}

// Đổi thuộc tính (chiều cao, độ dày, vật liệu, màu) — kiểm tra lại (độ dày thay đổi footprint).
export function updateWall(walls, id, patch, opts = {}) {
  const w = walls.find(x => x.id === id);
  if (!w) return { error: 'NOT_FOUND' };
  const allowed = {};
  for (const k of ['height', 'thickness', 'material_id', 'color']) if (k in patch) allowed[k] = patch[k];
  if ('height' in allowed) allowed.height = r4(allowed.height);
  if ('thickness' in allowed) allowed.thickness = r4(allowed.thickness);
  const out = walls.map(x => (x.id === id ? { ...x, ...allowed } : x));
  const errs = validateWallSet(out.filter(x => x.floor === w.floor), opts).filter(e => e.id === id);
  if (errs.length) return { error: errs[0].code };
  return { walls: out };
}

// ---------- Hiển thị: nối góc kín khít ----------
// Đầu tường nối với tường khác (đầu trùng nhau hoặc chạm thân tường) được kéo dài nửa độ dày → góc L / T / chữ thập không hở.
// Trả Map id → { ext0, ext1 } (m kéo dài ở start / end).
export function wallJoints(walls) {
  const res = new Map();
  for (const w of walls) {
    const conn = p => walls.some(o => o !== w && o.floor === w.floor && (samePoint(o.start, p) || samePoint(o.end, p) || pointOnWallInterior(p, o)));
    res.set(w.id, { ext0: conn(w.start) ? w.thickness / 2 : 0, ext1: conn(w.end) ? w.thickness / 2 : 0 });
  }
  return res;
}
// Hộp hiển thị của tường: tâm, chiều dài (gồm phần kéo dài), góc.
export function wallBox(w, j = { ext0: 0, ext1: 0 }) {
  const L = wallLength(w), ux = (w.end[0] - w.start[0]) / (L || 1), uz = (w.end[1] - w.start[1]) / (L || 1);
  const s0 = -j.ext0, s1 = L + j.ext1, mid = (s0 + s1) / 2;
  return { cx: w.start[0] + ux * mid, cz: w.start[1] + uz * mid, length: s1 - s0, angle: wallAngle(w) };
}

// ---------- Bắt điểm khi vẽ ----------
// Ưu tiên: đầu tường gần (≤ radius) → thân tường gần (≤ radius·0.7, chiếu vuông góc) → lưới (gridFn) → tự do.
// anchor + constrain: khoá hướng theo bội số 45° tính từ anchor, chiều dài làm tròn theo step.
export function snapWallPoint(raw, walls, { gridFn = (x, z) => ({ x, z }), radius = 0.4, anchor = null, constrain = false, step = 1, ignorePoint = null } = {}) {
  let p = [raw[0], raw[1]];
  const usable = q => !ignorePoint || !samePoint(q, ignorePoint);
  let best = null, bd = radius;
  for (const w of walls) for (const q of [w.start, w.end]) {
    if (!usable(q)) continue;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) { bd = d; best = q; }
  }
  if (best) return { x: best[0], z: best[1], kind: 'endpoint' };
  if (anchor && constrain) {
    const dx = p[0] - anchor[0], dz = p[1] - anchor[1], a = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.max(step, Math.round(Math.hypot(dx, dz) / step) * step);
    return { x: r4(anchor[0] + Math.cos(a) * len), z: r4(anchor[1] + Math.sin(a) * len), kind: 'angle' };
  }
  let near = null, nearWall = null, nd = radius * 0.7;
  for (const w of walls) {
    if (ignorePoint && (samePoint(w.start, ignorePoint) || samePoint(w.end, ignorePoint))) continue;
    const pr = projectOnSegment(p, w.start, w.end);
    if (pr.dist < nd) { nd = pr.dist; near = pr.point; nearWall = w; }
  }
  if (near) {
    // Ưu tiên giao điểm lưới nằm trên chính thân tường đó (nối chữ T đúng ô lưới, không lệch vài cm).
    const g = gridFn(near[0], near[1]);
    if (projectOnSegment([g.x, g.z], nearWall.start, nearWall.end).dist < 1e-3 && Math.hypot(g.x - p[0], g.z - p[1]) < radius) return { x: g.x, z: g.z, kind: 'wall' };
    return { x: r4(near[0]), z: r4(near[1]), kind: 'wall' };
  }
  const g = gridFn(p[0], p[1]);
  return { x: g.x, z: g.z, kind: g.x === p[0] && g.z === p[1] ? 'free' : 'grid' };
}

// Kiểm tra một đoạn tường riêng lẻ có dữ liệu hợp lệ (kiểu dữ liệu) — dùng ở server trước khi kiểm tra tập.
export function cleanWall(o, { materials = WALL_MATERIALS } = {}) {
  const isPt = v => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n));
  if (!isPt(o.start) || !isPt(o.end)) return { error: 'start / end phải là [x, z]' };
  if (typeof o.height !== 'number' || typeof o.thickness !== 'number') return { error: 'height / thickness phải là số' };
  if (!materials.some(m => m.id === o.material_id)) return { error: 'material_id không hợp lệ' };
  if (o.color != null && !/^#[0-9a-f]{6}$/i.test(o.color)) return { error: 'color phải dạng #rrggbb' };
  const openings = o.openings ?? [];
  if (!Array.isArray(openings) || openings.length > WALL_LIMITS.maxOpenings) return { error: 'openings không hợp lệ' };
  for (const op of openings) {
    if (!op || typeof op.id !== 'string' || !['door', 'window'].includes(op.type) || ![op.offset, op.width].every(n => typeof n === 'number' && Number.isFinite(n))) return { error: 'opening không hợp lệ' };
  }
  return {
    wall: {
      id: o.id, type: 'wall', floor: o.floor, start: pt(o.start), end: pt(o.end), height: r4(o.height), thickness: r4(o.thickness), material_id: o.material_id,
      ...(o.color ? { color: o.color } : {}),
      openings: openings.map(op => ({
        id: op.id, type: op.type, offset: r4(op.offset), width: r4(op.width), ...(Number.isFinite(op.height) ? { height: r4(op.height) } : {}), ...(Number.isFinite(op.sill) ? { sill: r4(op.sill) } : {}),
        ...(typeof op.catalog_id === 'string' ? { catalog_id: op.catalog_id } : {}), ...(op.swing ? { swing: op.swing } : {}), ...(op.swing_dir ? { swing_dir: op.swing_dir } : {}),
        ...(typeof op.color === 'string' && /^#[0-9a-f]{6}$/i.test(op.color) ? { color: op.color } : {}),
      })),
    },
  };
}
