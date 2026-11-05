// Cửa & cửa sổ (House Builder Phase 02.5) — hình học thuần, dùng chung client / server.
// Mỗi lỗ mở (opening) gắn vào MỘT đoạn tường (nằm trong wall.openings → luôn có wall_id):
//   { id, type: 'door' | 'window', catalog_id, offset, width, height, sill, swing: 'left' | 'right', swing_dir: 'in' | 'out', color }
//   offset = khoảng cách (m) từ đầu start của tường tới mép lỗ gần start, đo dọc tim tường; sill = độ cao mép dưới (cửa đi = 0).
// Lỗ mở thật trong tường: tường được CHIA THÀNH CÁC KHỐI quanh lỗ (wallPieces) — không dùng CSG.
import { samePoint, pointOnWallInterior, wallLength, projectOnSegment } from './wallGeometry.mjs';

export const DOOR_CATALOG = [
  { id: 'door-single', name: 'Cửa một cánh', kind: 'hinged', width: 0.9, height: 2.1, material: 'wood', color: '#b98552' },
  { id: 'door-double', name: 'Cửa hai cánh', kind: 'double', width: 1.6, height: 2.2, material: 'wood', color: '#8a5a3c' },
  { id: 'door-glass', name: 'Cửa kính', kind: 'glass', width: 1.0, height: 2.2, material: 'glass', color: '#5f7f8c' },
  { id: 'door-sliding', name: 'Cửa trượt', kind: 'sliding', width: 1.8, height: 2.2, material: 'glass', color: '#e8e2d6' },
];
export const WINDOW_CATALOG = [
  { id: 'window-single', name: 'Cửa sổ một cánh', kind: 'single', width: 0.8, height: 1.0, sill: 1.0, frame: '#fff7ec', glass: '#bfe3f0' },
  { id: 'window-double', name: 'Cửa sổ hai cánh', kind: 'double', width: 1.4, height: 1.2, sill: 0.9, frame: '#fff7ec', glass: '#bfe3f0' },
  { id: 'window-picture', name: 'Cửa kính lớn', kind: 'picture', width: 2.4, height: 1.8, sill: 0.4, frame: '#3d3a3a', glass: '#cfe8ef' },
  { id: 'window-sliding', name: 'Cửa sổ trượt', kind: 'sliding', width: 1.6, height: 1.1, sill: 1.0, frame: '#d9d4cc', glass: '#bfe3f0' },
];
export const catalogItem = id => DOOR_CATALOG.find(c => c.id === id) || WINDOW_CATALOG.find(c => c.id === id) || null;
export const OPENING_LIMITS = {
  door: { width: [0.6, 2.4], height: [1.8, 2.6] },
  window: { width: [0.4, 3], height: [0.4, 2.2], sill: [0.2, 1.6] },
  edge: 0.05, // khoảng tối thiểu tới đầu tường / lỗ khác / đỉnh tường (m)
};
export const OPENING_ERRORS = {
  NO_WALL: 'Hãy trỏ vào một đoạn tường',
  OUT_OF_WALL: 'Cửa vượt ra ngoài đoạn tường (hoặc chạm mối nối)',
  OVERLAP: 'Chồng lên cửa / cửa sổ khác',
  TOO_TALL: 'Cửa cao hơn tường',
  LIMITS: 'Kích thước / kiểu cửa ngoài giới hạn',
  NOT_FOUND: 'Không tìm thấy cửa',
};
const r4 = v => Math.round(v * 1e4) / 1e4;

// Mẫu → lỗ mở mới (chưa có offset).
export function openingFromCatalog(catalogId, id) {
  const c = catalogItem(catalogId);
  if (!c) return null;
  const isDoor = DOOR_CATALOG.includes(c);
  return { id, type: isDoor ? 'door' : 'window', catalog_id: c.id, offset: 0, width: c.width, height: c.height, sill: isDoor ? 0 : c.sill, swing: 'left', swing_dir: 'in', color: isDoor ? c.color : c.frame };
}

// Khoảng trống tối thiểu ở hai đầu tường: đầu có tường khác nối vào thì chừa thêm nửa độ dày tường đó (lỗ không cắt vào mối nối).
export function wallEndMargins(wall, walls = []) {
  const m = OPENING_LIMITS.edge;
  const at = p => {
    let t = 0;
    for (const o of walls) {
      if (o.id === wall.id || o.floor !== wall.floor) continue;
      if (samePoint(o.start, p) || samePoint(o.end, p) || pointOnWallInterior(p, o)) t = Math.max(t, o.thickness / 2);
    }
    return t + m;
  };
  return { m0: at(wall.start), m1: at(wall.end) };
}

// Kiểm tra một lỗ mở trên tường (ignoreId: lỗ đang sửa). Trả mã lỗi hoặc null.
export function validateOpening(wall, op, walls = [], ignoreId = op.id) {
  const lim = OPENING_LIMITS[op.type];
  if (!lim || !catalogItem(op.catalog_id) || catalogItem(op.catalog_id) && (DOOR_CATALOG.includes(catalogItem(op.catalog_id)) ? 'door' : 'window') !== op.type) return 'LIMITS';
  if (![op.offset, op.width, op.height, op.sill].every(Number.isFinite)) return 'LIMITS';
  if (op.width < lim.width[0] - 1e-9 || op.width > lim.width[1] + 1e-9 || op.height < lim.height[0] - 1e-9 || op.height > lim.height[1] + 1e-9) return 'LIMITS';
  if (op.type === 'door' ? op.sill !== 0 : op.sill < lim.sill[0] - 1e-9 || op.sill > lim.sill[1] + 1e-9) return 'LIMITS';
  if (!['left', 'right'].includes(op.swing) || !['in', 'out'].includes(op.swing_dir)) return 'LIMITS';
  const L = wallLength(wall), { m0, m1 } = wallEndMargins(wall, walls);
  if (op.offset < m0 - 1e-9 || op.offset + op.width > L - m1 + 1e-9) return 'OUT_OF_WALL';
  if (op.sill + op.height > wall.height - OPENING_LIMITS.edge + 1e-9) return 'TOO_TALL';
  for (const o of wall.openings || []) {
    if (o.id === ignoreId) continue;
    if (op.offset < o.offset + o.width + OPENING_LIMITS.edge - 1e-9 && o.offset < op.offset + op.width + OPENING_LIMITS.edge - 1e-9) return 'OVERLAP';
  }
  return null;
}
// Kiểm tra mọi lỗ mở của một tập tường → [{ wall_id, id, code }].
export function validateWallOpenings(walls) {
  const errs = [];
  for (const w of walls) for (const o of w.openings || []) {
    const code = validateOpening(w, o, walls);
    if (code) errs.push({ wall_id: w.id, id: o.id, code });
  }
  return errs;
}

// ---------- Gắn vào tường ----------
// Tìm tường gần điểm local (trên mặt phẳng tầng) → { wall, s (m dọc tường từ start), dist }.
export function wallAt(walls, p, maxDist = 0.6) {
  let best = null;
  for (const w of walls) {
    const L = wallLength(w), pr = projectOnSegment(p, w.start, w.end);
    if (pr.dist < Math.min(maxDist, w.thickness / 2 + 0.45) && (!best || pr.dist < best.dist)) best = { wall: w, s: pr.t * L, dist: pr.dist };
  }
  return best;
}
// Vị trí lỗ (offset) khi tâm lỗ ở s: khớp theo bước (0 = tự do), kẹp vào khoảng hợp lệ của tường.
export function snapOffset(wall, s, width, step = 0, walls = []) {
  const L = wallLength(wall), { m0, m1 } = wallEndMargins(wall, walls);
  let off = s - width / 2;
  if (step > 0) off = Math.round(off / step) * step;
  const lo = m0, hi = L - m1 - width;
  if (hi >= lo) off = Math.min(hi, Math.max(lo, off));
  return r4(off);
}
// Lỗ mở tại điểm local (để chọn bằng chuột).
export function openingAt(walls, p) {
  const hit = wallAt(walls, p, 0.5);
  if (!hit) return null;
  const op = (hit.wall.openings || []).find(o => hit.s >= o.offset - 0.05 && hit.s <= o.offset + o.width + 0.05);
  return op ? { wall: hit.wall, opening: op } : null;
}

// ---------- Hình học tường có lỗ ----------
// Chia tường thành các khối hộp (toạ độ dọc tường s, độ cao y) quanh các lỗ mở. ext0 / ext1: phần kéo dài nối góc.
// cap: giới hạn chiều cao hiển thị (chế độ cắt góc / hạ thấp). Trả [{ s0, s1, y0, y1 }].
export function wallPieces(wall, { ext0 = 0, ext1 = 0, cap = Infinity } = {}) {
  const L = wallLength(wall), H = Math.min(wall.height, cap), pieces = [];
  const ops = [...(wall.openings || [])].sort((a, b) => a.offset - b.offset);
  let s = 0 - ext0; // tránh -0
  const push = (s0, s1, y0, y1) => { if (s1 - s0 > 1e-6 && y1 - y0 > 1e-6) pieces.push({ s0: r4(s0), s1: r4(s1), y0: r4(y0), y1: r4(y1) }); };
  for (const o of ops) {
    push(s, o.offset, 0, H); // khối đặc trước lỗ
    push(o.offset, o.offset + o.width, 0, Math.min(H, o.sill)); // bậu dưới (cửa sổ)
    push(o.offset, o.offset + o.width, Math.min(H, o.sill + o.height), H); // lanh tô phía trên
    s = o.offset + o.width;
  }
  push(s, L + ext1, 0, H);
  return pieces;
}

// ---------- Va chạm (Explore Mode) ----------
// Đoạn va chạm dọc tường (toạ độ s): phần tường đặc + cửa sổ (không đi xuyên) + cửa đi đang ĐÓNG. Cửa mở → để trống.
export function wallColliderSpans(wall, isOpen = () => false) {
  const L = wallLength(wall), spans = [];
  let s = 0;
  for (const o of [...(wall.openings || [])].sort((a, b) => a.offset - b.offset)) {
    if (o.type !== 'door' || !isOpen(o.id)) continue;
    if (o.offset > s) spans.push([s, o.offset]);
    s = o.offset + o.width;
  }
  if (L > s) spans.push([s, L]);
  return spans;
}
// Điểm dọc tường → toạ độ local.
export function pointAlong(wall, s) {
  const L = wallLength(wall) || 1, t = s / L;
  return [wall.start[0] + (wall.end[0] - wall.start[0]) * t, wall.start[1] + (wall.end[1] - wall.start[1]) * t];
}
// Danh sách phẳng mọi lỗ mở của thiết kế (theo mô hình dữ liệu: id, house_id, wall_id, …).
export function listOpenings(design, houseId = null) {
  return (design?.objects || []).filter(o => o.type === 'wall').flatMap(w => (w.openings || []).map(o => ({
    ...o, house_id: houseId, wall_id: w.id, floor: w.floor, opening_type: o.type,
  })));
}
