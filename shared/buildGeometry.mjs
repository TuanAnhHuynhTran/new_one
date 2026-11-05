// Hình học xây dựng dùng chung cho client (Vite) và server (Node) — không phụ thuộc thư viện nào.
// Hệ toạ độ local của lô (thống nhất toàn dự án):
//   gốc = TÂM lô trên mặt đất · X = chiều ngang (width) · Z = chiều dài (length), +Z = mặt tiền · Y = chiều cao
//   world = vị trí lô + Ry(rotation_y) · local   (Ry giống rotation.y của three.js)
// Đa giác (polygon) là mảng [[x, z], ...] theo toạ độ local, không tự cắt; chiều quay bất kỳ.

// Chiều cao tầng mặc định — độ cao thật của mỗi tầng tính từ design.levels (shared/levelGeometry.mjs).
export const FLOOR_HEIGHT = 3;
const EPS = 1e-9;

// ---------- Khung toạ độ của lô ----------
export function plotFrame(plot) {
  return {
    x: Number(plot.position_x ?? plot.world_x ?? 0),
    y: Number(plot.position_y ?? 0),
    z: Number(plot.position_z ?? plot.world_z ?? 0),
    rot: Number(plot.rotation_y || 0),
    width: Number(plot.width ?? plot.size_x ?? 12),
    length: Number(plot.length ?? plot.size_z ?? 12),
  };
}
export function worldToLocal(plot, wx, wy, wz) {
  const f = plotFrame(plot), dx = wx - f.x, dz = wz - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot);
  return { x: dx * c - dz * s, y: wy - f.y, z: dx * s + dz * c };
}
export function localToWorld(plot, lx, ly, lz) {
  const f = plotFrame(plot), c = Math.cos(f.rot), s = Math.sin(f.rot);
  return { x: f.x + lx * c + lz * s, y: f.y + ly, z: f.z - lx * s + lz * c };
}

// Ranh giới lô theo toạ độ local: lấy từ boundary_polygon (toạ độ world, lô hình chữ nhật hoặc đa giác bất kỳ),
// thiếu thì dựng hình chữ nhật width × length.
export function localBoundary(plot) {
  let b = plot.boundary_polygon;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (Array.isArray(b) && b.length >= 3 && b.every(p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite))) {
    return b.map(([x, z]) => { const l = worldToLocal(plot, x, 0, z); return [round(l.x), round(l.z)]; });
  }
  const f = plotFrame(plot), hw = f.width / 2, hl = f.length / 2;
  return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]];
}
const round = v => Math.round(v * 1e6) / 1e6;
export function polygonBounds(poly) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) { minX = Math.min(minX, x); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z); }
  return { minX, minZ, maxX, maxZ };
}
export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length]; a += x1 * z2 - x2 * z1; }
  return a / 2; // có dấu
}

// ---------- Snap ----------
// center: tâm ô lưới · vertex: giao điểm đường lưới. Lưới căn từ góc nhỏ nhất (minX, minZ) của ranh giới lô.
export const SNAP_MODES = ['center', 'vertex'];
export function snapValue(v, origin, step, mode = 'center') {
  const t = (v - origin) / step;
  const k = mode === 'vertex' ? Math.round(t) : Math.floor(t + EPS) + 0.5;
  return round(origin + k * step);
}
export function snapPoint(x, z, origin, step, mode = 'center') {
  return { x: snapValue(x, origin.x, step, mode), z: snapValue(z, origin.z, step, mode) };
}

// ---------- Đa giác ----------
export function distPointSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
// Điểm nằm trong đa giác (điểm nằm đúng trên cạnh tính là bên trong).
export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (distPointSegment(x, z, xi, zi, xj, zj) < 1e-7) return true;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// Khoảng cách nhỏ nhất từ điểm tới các cạnh đa giác.
export function distToPolygonEdges(x, z, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; d = Math.min(d, distPointSegment(x, z, ax, az, bx, bz)); }
  return d;
}
const orient = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
// Hai đoạn thẳng cắt nhau thật sự (cắt ngang nhau, không tính chạm đầu mút / chồng thẳng hàng).
export function segmentsCross(a, b, c, d) {
  const d1 = orient(c[0], c[1], d[0], d[1], a[0], a[1]), d2 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  const d3 = orient(a[0], a[1], b[0], b[1], c[0], c[1]), d4 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}
export function distSegmentSegment(a, b, c, d) {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(distPointSegment(a[0], a[1], c[0], c[1], d[0], d[1]), distPointSegment(b[0], b[1], c[0], c[1], d[0], d[1]),
    distPointSegment(c[0], c[1], a[0], a[1], b[0], b[1]), distPointSegment(d[0], d[1], a[0], a[1], b[0], b[1]));
}
// Một điểm hợp lệ để xây: nằm trong đa giác và cách ranh giới ≥ setback.
export function pointInsideWithSetback(x, z, poly, setback = 0) {
  return pointInPolygon(x, z, poly) && (setback <= 0 || distToPolygonEdges(x, z, poly) >= setback - 1e-9);
}
// Footprint (đa giác lồi / chữ nhật của đối tượng) nằm trọn trong ranh giới, cách ranh giới ≥ setback.
// Kiểm tra mọi đỉnh nằm trong + không cạnh nào cắt ranh giới (đúng cả với lô lõm hình chữ L) + khoảng cách cạnh–cạnh ≥ setback.
export function footprintInside(fp, poly, setback = 0) {
  if (!fp.every(([x, z]) => pointInPolygon(x, z, poly))) return false;
  // Đỉnh của ranh giới (góc lõm) không được lọt vào trong footprint.
  if (poly.some(([x, z]) => pointInConvex(x, z, fp, 1e-7))) return false;
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i], b = fp[(i + 1) % fp.length];
    for (let j = 0; j < poly.length; j++) {
      const c = poly[j], d = poly[(j + 1) % poly.length];
      if (segmentsCross(a, b, c, d)) return false;
      if (setback > 0 && distSegmentSegment(a, b, c, d) < setback - 1e-9) return false;
    }
  }
  return true;
}
// Điểm nằm hẳn bên trong đa giác lồi (cách cạnh > tol).
function pointInConvex(x, z, poly, tol) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const o = orient(ax, az, bx, bz, x, z);
    if (Math.abs(o) <= tol * Math.hypot(bx - ax, bz - az)) return false;
    const sg = Math.sign(o);
    if (sign && sg !== sign) return false;
    sign = sg;
  }
  return true;
}
// Footprint hình chữ nhật tâm (cx, cz), kích thước w × d, xoay rot (local).
export function rectFootprint(cx, cz, w, d, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const x = (sx * w) / 2, z = (sz * d) / 2;
    return [cx + x * c + z * s, cz - x * s + z * c];
  });
}
// Đường lùi xây dựng: đa giác thu vào d mét (nối góc kiểu miter). Dùng để vẽ; kiểm tra hợp lệ dùng khoảng cách thật.
export function offsetPolygon(poly, d) {
  if (!d) return poly.map(p => [...p]);
  const sign = polygonArea(poly) > 0 ? 1 : -1, n = poly.length, out = [];
  const edgeNormal = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [(-dz / L) * sign, (dx / L) * sign]; };
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const n1 = edgeNormal(p0, p1), n2 = edgeNormal(p1, p2);
    const mx = n1[0] + n2[0], mz = n1[1] + n2[1], ml = Math.hypot(mx, mz) || 1;
    const cos = (mx / ml) * n1[0] + (mz / ml) * n1[1];
    const k = d / Math.max(0.2, cos);
    out.push([round(p1[0] + (mx / ml) * k), round(p1[1] + (mz / ml) * k)]);
  }
  return out;
}
// Cắt đường thẳng song song trục (axis: 'x' = đường x = c chạy theo Z; 'z' = đường z = c chạy theo X) theo đa giác
// → các đoạn nằm trong đa giác (để vẽ lưới chỉ bên trong lô hình đa giác).
export function clipAxisLine(poly, axis, c) {
  const ts = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const u0 = axis === 'x' ? ax : az, u1 = axis === 'x' ? bx : bz, v0 = axis === 'x' ? az : ax, v1 = axis === 'x' ? bz : bx;
    if ((u0 <= c && u1 > c) || (u1 <= c && u0 > c)) ts.push(v0 + ((c - u0) / (u1 - u0)) * (v1 - v0));
  }
  ts.sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1e-6) segs.push([ts[i], ts[i + 1]]);
  return segs;
}

// ---------- Footprint của đối tượng thiết kế ----------
export const MARKER_SIZE = 0.4;
export function objectFootprint(o) {
  if (o.type === 'zone') return rectFootprint(o.position.x, o.position.z, o.size.w, o.size.d, o.rotation_y || 0);
  return rectFootprint(o.position.x, o.position.z, MARKER_SIZE, MARKER_SIZE, o.rotation_y || 0);
}
