// Mái nhà (House Builder Phase 02.7) — hình học thuần, dùng chung client / server.
//
// Đối tượng mái (một mái cho mỗi tầng, đặt trên tầng `floor`):
//   { id, type: 'roof', floor, level_id, kind: 'flat' | 'gable' | 'hip', pitch (độ), overhang (m), ridge: 'auto' | 'x' | 'z', material_id, color? }
// Chỉ lưu THAM SỐ — hình mái luôn dựng lại từ footprint hiện tại (phòng của tầng đó, trừ phần có tầng trên đè lên),
// nên sửa tường / phòng thì mái tự khớp theo, không bao giờ lệch với tường.
// Footprint có cạnh song song trục (chữ nhật, chữ L, chữ T…) được chia thành các khối chữ nhật → mỗi khối một mái đơn giản.
// Footprint có cạnh xiên: chỉ hỗ trợ mái bằng (mái dốc tự chuyển thành mái bằng + cảnh báo).
// Độ cao chân mái = cao độ tầng + chiều cao tường cao nhất của tầng → mái nằm trên đỉnh tường, không bị tường xuyên qua.
import { footprintInside, pointInPolygon } from './buildGeometry.mjs';
import { floorArea, levelElevation } from './levelGeometry.mjs';
import { roomContains } from './roomGeometry.mjs';

export const ROOF_KINDS = [{ id: 'flat', name: 'Mái bằng' }, { id: 'gable', name: 'Mái hai dốc' }, { id: 'hip', name: 'Mái bốn dốc' }];
export const ROOF_MATERIALS = [
  { id: 'tile-red', name: 'Ngói đỏ', color: '#c4573f', rough: 0.85, metal: 0 },
  { id: 'tile-grey', name: 'Ngói xám', color: '#6f747c', rough: 0.85, metal: 0 },
  { id: 'metal', name: 'Mái tôn', color: '#9fb0bf', rough: 0.4, metal: 0.55 },
  { id: 'concrete', name: 'Mái bê tông', color: '#c9c4bb', rough: 1, metal: 0 },
];
export const ROOF_COLORS = ['#c4573f', '#8a3b2e', '#6f747c', '#3d5a80', '#5f8f6b', '#9fb0bf', '#c9c4bb'];
export const ROOF_LIMITS = { pitch: [10, 50], overhang: [0, 1] };
export const ROOF_DEFAULTS = { kind: 'gable', pitch: 30, overhang: 0.4, ridge: 'auto', material_id: 'tile-red' };
export const ROOF_ERRORS = {
  NO_FOOTPRINT: 'Tầng này chưa có phòng khép kín (hoặc đã bị tầng trên che hết) để đặt mái',
  DUPLICATE: 'Mỗi tầng chỉ có một mái',
  OUTSIDE: 'Phần nhô của mái ra ngoài ranh giới lô',
  LIMITS: 'Thông số mái ngoài giới hạn',
  NO_LEVEL: 'Tầng của mái không tồn tại',
};
export const ROOF_WARNINGS = {
  SPLIT: 'Footprint không phải hình chữ nhật — các mặt mái được nối bằng đường nóc / khe mái',
};
const EPS = 1e-6, r4 = v => Math.round(v * 1e4) / 1e4;
const rad = d => (d * Math.PI) / 180;

// ---------- Footprint ----------
const roomsOf = (design, floor) => (design.objects || []).filter(o => o.type === 'room' && o.floor === floor);
const rectilinear = poly => poly.every((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.abs(p[0] - q[0]) < EPS || Math.abs(p[1] - q[1]) < EPS; });
// Vùng mái của tầng floor = phòng tầng đó trừ vùng sàn của tầng ngay trên. Trả { rects, polys, rectilinear }.
export function roofFootprint(design, floor) {
  const rooms = roomsOf(design, floor), above = floorArea(design, floor + 1);
  if (!rooms.length) return { rects: [], polys: [], rectilinear: true };
  const isRect = rooms.every(r => rectilinear(r.polygon) && (r.holes || []).every(rectilinear)) && above.every(rectilinear);
  if (!isRect) {
    // Cạnh xiên: không chia khối được → giữ đa giác phòng (không có tầng trên đè) cho mái bằng.
    return { rects: [], polys: rooms.filter(r => !above.length).map(r => r.polygon), rectilinear: false };
  }
  // Chia lưới theo mọi toạ độ đỉnh → ô thuộc mái nếu tâm ô nằm trong phòng và không nằm dưới sàn tầng trên.
  const xs = [...new Set([...rooms, ...above.map(p => ({ polygon: p }))].flatMap(r => r.polygon.map(p => r4(p[0]))))].sort((a, b) => a - b);
  const zs = [...new Set([...rooms, ...above.map(p => ({ polygon: p }))].flatMap(r => r.polygon.map(p => r4(p[1]))))].sort((a, b) => a - b);
  const on = (i, j) => {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    return rooms.some(r => roomContains(r, cx, cz)) && !above.some(p => pointInPolygon(cx, cz, p));
  };
  // Mỗi hàng: các dải liên tiếp; gộp dải giống hệt ở các hàng kề nhau → hình chữ nhật lớn nhất theo hàng.
  const rects = [], open = new Map();
  for (let j = 0; j + 1 < zs.length; j++) {
    const runs = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      if (!on(i, j)) continue;
      if (runs.length && runs[runs.length - 1].i1 === i) runs[runs.length - 1].i1 = i + 1; else runs.push({ i0: i, i1: i + 1 });
    }
    const next = new Map();
    for (const r of runs) {
      const k = `${r.i0}:${r.i1}`, prev = open.get(k);
      if (prev) { prev.z1 = zs[j + 1]; next.set(k, prev); open.delete(k); } else next.set(k, { x0: xs[r.i0], x1: xs[r.i1], z0: zs[j], z1: zs[j + 1] });
    }
    for (const r of open.values()) rects.push(r);
    open.clear(); for (const [k, v] of next) open.set(k, v);
  }
  for (const r of open.values()) rects.push(r);
  return { rects: rects.map(r => ({ x0: r4(r.x0), x1: r4(r.x1), z0: r4(r.z0), z1: r4(r.z1) })), polys: [], rectilinear: true };
}
// Chân mái (cao độ local so với mặt nền lô): đỉnh tường cao nhất của tầng.
export function roofBase(design, floor) {
  const walls = (design.objects || []).filter(o => o.type === 'wall' && o.floor === floor);
  const h = walls.length ? Math.max(...walls.map(w => w.height)) : (design.levels?.[floor]?.height || 3);
  return r4(levelElevation(design.levels, floor) + h);
}

// ---------- Các khối mái ----------
// → { parts: [{ kind, rect | poly, ridge, base, rise, pitch, oh: {x0, x1, z0, z1} }], warnings: [code] }
// Phần nhô (overhang) chỉ áp cho cạnh NGOÀI: cạnh giáp khối mái khác (chữ L) hay giáp sàn tầng trên thì không nhô
// → mái không đâm vào tường tầng trên, các khối không chồng nhau.
export function roofParts(design, roof) {
  const fp = roofFootprint(design, roof.floor), base = roofBase(design, roof.floor), warnings = [];
  const parts = [];
  if (!fp.rectilinear) {
    // Phòng có cạnh xiên vẫn tạo được mái dốc. Mặt mái hội tụ về một nóc trung tâm,
    // nhờ vậy mọi cạnh tường (kể cả cạnh xiên) đều được phủ kín thay vì bị ép về mái bằng.
    for (const source of fp.polys) {
      const cx = source.reduce((a, p) => a + p[0], 0) / source.length;
      const cz = source.reduce((a, p) => a + p[1], 0) / source.length;
      const pad = ((design.objects || []).filter(o => o.type === 'wall' && o.floor === roof.floor).reduce((m, w) => Math.max(m, w.thickness || 0), 0) / 2) + roof.overhang;
      const poly = source.map(([x, z]) => {
        const dx = x - cx, dz = z - cz, len = Math.hypot(dx, dz) || 1;
        return [r4(x + (dx / len) * pad), r4(z + (dz / len) * pad)];
      });
      const span = Math.min(Math.max(...source.map(p => p[0])) - Math.min(...source.map(p => p[0])), Math.max(...source.map(p => p[1])) - Math.min(...source.map(p => p[1])));
      parts.push({ kind: roof.kind, poly, corePoly: source, center: [r4(cx), r4(cz)], base, rise: roof.kind === 'flat' ? 0 : r4((span / 2) * Math.tan(rad(roof.pitch))), pitch: roof.pitch });
    }
    return { parts, warnings };
  }
  if (fp.rects.length > 1) warnings.push('SPLIT');
  const above = floorArea(design, roof.floor + 1);
  const covered = (x, z) => fp.rects.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) || above.some(p => pointInPolygon(x, z, p));
  // Cạnh ngoài nếu điểm ngay bên ngoài (lấy mẫu vài điểm dọc cạnh) không thuộc mái / tầng trên.
  const outside = (pts) => pts.every(([x, z]) => !covered(x, z));
  const S = 0.05, samples = (a, b) => [0.25, 0.5, 0.75].map(t => a + (b - a) * t);
  // Phòng tính theo tim tường → cạnh ngoài nới thêm nửa bề dày tường để mái phủ kín mặt ngoài tường (tường không xuyên qua mái).
  const walls = (design.objects || []).filter(o => o.type === 'wall' && o.floor === roof.floor);
  const pad = walls.length ? Math.max(...walls.map(w => w.thickness)) / 2 : 0.1;
  for (const core of fp.rects) {
    const o = roof.overhang;
    const ext = {
      x0: outside(samples(core.z0, core.z1).map(z => [core.x0 - S, z])),
      x1: outside(samples(core.z0, core.z1).map(z => [core.x1 + S, z])),
      z0: outside(samples(core.x0, core.x1).map(x => [x, core.z0 - S])),
      z1: outside(samples(core.x0, core.x1).map(x => [x, core.z1 + S])),
    };
    const rect = { x0: r4(core.x0 - (ext.x0 ? pad : 0)), x1: r4(core.x1 + (ext.x1 ? pad : 0)), z0: r4(core.z0 - (ext.z0 ? pad : 0)), z1: r4(core.z1 + (ext.z1 ? pad : 0)) };
    const oh = { x0: ext.x0 ? o : 0, x1: ext.x1 ? o : 0, z0: ext.z0 ? o : 0, z1: ext.z1 ? o : 0 };
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    const ridge = roof.ridge === 'x' || roof.ridge === 'z' ? roof.ridge : w >= d ? 'x' : 'z';
    const span = ridge === 'x' ? d : w;
    const rise = roof.kind === 'flat' ? 0 : r4((span / 2) * Math.tan(rad(roof.pitch)));
    parts.push({ kind: roof.kind, rect, core, ridge, base, rise, pitch: roof.pitch, oh, ...(fp.rects.length > 1 ? { joinedRects: fp.rects } : {}) });
  }
  return { parts, warnings };
}

// Tam giác của một khối mái dốc (toạ độ local, y tuyệt đối so với mặt nền lô) → mảng [[x, y, z] × 3].
// Hai dốc: 2 mặt dốc + 2 đầu hồi tam giác. Bốn dốc: 2 mặt hình thang + 2 mặt tam giác (nóc ngắn lại; chóp nếu khối vuông).
// Phần nhô kéo dài mặt dốc ra ngoài, mép mái hạ thấp theo độ dốc. Các đỉnh dùng chung giữa các mặt → không hở.
export function roofTriangles(part) {
  if (part.poly) {
    if (part.kind === 'flat') return [];
    const top = part.base + part.rise, c = [part.center[0], top, part.center[1]];
    return part.poly.map((p, i) => {
      const q = part.poly[(i + 1) % part.poly.length];
      const edgeY = part.base - Math.max(0, Math.hypot(p[0] - part.corePoly[i][0], p[1] - part.corePoly[i][1])) * Math.tan(rad(part.pitch));
      const next = (i + 1) % part.poly.length;
      const edgeY2 = part.base - Math.max(0, Math.hypot(q[0] - part.corePoly[next][0], q[1] - part.corePoly[next][1])) * Math.tan(rad(part.pitch));
      return [[p[0], r4(edgeY), p[1]], [q[0], r4(edgeY2), q[1]], c];
    });
  }
  if (part.joinedRects?.length > 1) {
    const rects = part.joinedRects, t = Math.tan(rad(part.pitch));
    const inside = (x, z) => rects.some(r => x > r.x0 + EPS && x < r.x1 - EPS && z > r.z0 + EPS && z < r.z1 - EPS);
    const edges = [];
    const split = (values, a, b) => [...new Set([a, b, ...values.filter(v => v > a + EPS && v < b - EPS)])].sort((u, v) => u - v);
    const allX = rects.flatMap(r => [r.x0, r.x1]), allZ = rects.flatMap(r => [r.z0, r.z1]);
    for (const r of rects) {
      const xs = split(allX, r.x0, r.x1), zs = split(allZ, r.z0, r.z1), candidates = [];
      for (let i = 0; i + 1 < xs.length; i++) candidates.push([xs[i], r.z0, xs[i + 1], r.z0, 0, -1], [xs[i + 1], r.z1, xs[i], r.z1, 0, 1]);
      for (let i = 0; i + 1 < zs.length; i++) candidates.push([r.x1, zs[i], r.x1, zs[i + 1], 1, 0], [r.x0, zs[i + 1], r.x0, zs[i], -1, 0]);
      for (const e of candidates) if (!inside((e[0] + e[2]) / 2 + e[4] * 0.01, (e[1] + e[3]) / 2 + e[5] * 0.01)) edges.push(e);
    }
    const parallel = edges.filter(e => part.ridge === 'x' ? Math.abs(e[1] - e[3]) < EPS : Math.abs(e[0] - e[2]) < EPS);
    const use = part.kind === 'gable' && parallel.length ? parallel : edges;
    const distance = (x, z, e) => {
      const dx = e[2] - e[0], dz = e[3] - e[1], l2 = dx * dx + dz * dz;
      const k = l2 ? Math.max(0, Math.min(1, ((x - e[0]) * dx + (z - e[1]) * dz) / l2)) : 0;
      return Math.hypot(x - e[0] - k * dx, z - e[1] - k * dz);
    };
    const inUnion = (x, z) => rects.some(r => x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS);
    const y = (x, z) => {
      const d = Math.min(...use.map(e => distance(x, z, e)));
      return r4(part.base + (inUnion(x, z) ? d : -d) * t);
    };
    const { x0, x1, z0, z1 } = part.rect, xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    const cuts = (values, a, b) => {
      const raw = [...new Set([a, b, ...values.filter(v => v > a + EPS && v < b - EPS)])].sort((u, v) => u - v);
      return raw.flatMap((v, i) => i + 1 < raw.length ? [v, (v + raw[i + 1]) / 2] : [v]);
    };
    // Chia cạnh theo mọi mốc của footprint để hai khối kề nhau có đúng cùng đỉnh và cao độ.
    // Nhờ đó khe mái là một đường liên tục, không còn hai mặt độc lập hở / xuyên nhau.
    const xc = cuts(rects.flatMap(r => [r.x0, r.x1]), x0, x1);
    const zc = cuts(rects.flatMap(r => [r.z0, r.z1]), z0, z1);
    const ring = [
      ...xc.map(x => [x, z0]), ...zc.slice(1).map(z => [x1, z]),
      ...xc.slice(0, -1).reverse().map(x => [x, z1]), ...zc.slice(1, -1).reverse().map(z => [x0, z]),
    ];
    const center = [xm, y(xm, zm), zm];
    return ring.map((p, i) => { const q = ring[(i + 1) % ring.length]; return [[p[0], y(...p), p[1]], [q[0], y(...q), q[1]], center]; });
  }
  const { rect, ridge, base, rise } = part, t = Math.tan(rad(part.pitch));
  // Đổi trục để luôn tính như nóc chạy theo trục a (a = x nếu ridge = 'x'), b là trục ngang.
  const X = ridge === 'x';
  const A0 = X ? rect.x0 : rect.z0, A1 = X ? rect.x1 : rect.z1, B0 = X ? rect.z0 : rect.x0, B1 = X ? rect.z1 : rect.x1;
  const oa0 = X ? part.oh.x0 : part.oh.z0, oa1 = X ? part.oh.x1 : part.oh.z1, ob0 = X ? part.oh.z0 : part.oh.x0, ob1 = X ? part.oh.z1 : part.oh.x1;
  const P = (a, y, b) => (X ? [r4(a), r4(y), r4(b)] : [r4(b), r4(y), r4(a)]);
  const bm = (B0 + B1) / 2, top = base + rise;
  const a0 = A0 - oa0, a1 = A1 + oa1, b0 = B0 - ob0, b1 = B1 + ob1;
  const tris = [];
  const quad = (p, q, r, s) => { tris.push([p, q, r], [p, r, s]); };
  if (part.kind === 'gable') {
    const e0 = base - ob0 * t, e1 = base - ob1 * t;
    quad(P(a0, e0, b0), P(a1, e0, b0), P(a1, top, bm), P(a0, top, bm));
    quad(P(a1, e1, b1), P(a0, e1, b1), P(a0, top, bm), P(a1, top, bm));
    // Đầu hồi: tam giác đứng trên đỉnh tường ở hai đầu — bịt kín khoảng giữa mái và tường.
    tris.push([P(A0, base, B0), P(A0, base, B1), P(A0, top, bm)], [P(A1, base, B1), P(A1, base, B0), P(A1, top, bm)]);
    return tris;
  }
  // Bốn dốc: nóc ngắn lại mỗi đầu một nửa nhịp (góc hồi 45° trên mặt bằng); góc mái hạ theo phần nhô nhỏ hơn của hai cạnh.
  const h = (B1 - B0) / 2, ra0 = Math.min((A0 + A1) / 2, A0 + h), ra1 = Math.max((A0 + A1) / 2, A1 - h);
  const c = (oa, ob) => base - Math.min(oa, ob) * t;
  const C00 = P(a0, c(oa0, ob0), b0), C10 = P(a1, c(oa1, ob0), b0), C11 = P(a1, c(oa1, ob1), b1), C01 = P(a0, c(oa0, ob1), b1);
  const R0 = P(ra0, top, bm), R1 = P(ra1, top, bm);
  quad(C00, C10, R1, R0);
  quad(C11, C01, R0, R1);
  tris.push([C01, C00, R0], [C10, C11, R1]);
  return tris;
}
// Hình mái trên mặt bằng (kể cả phần nhô) theo toạ độ local — để kiểm tra ranh giới lô.
export const roofOutline = part => (part.rect
  ? [[part.rect.x0 - part.oh.x0, part.rect.z0 - part.oh.z0], [part.rect.x1 + part.oh.x1, part.rect.z0 - part.oh.z0], [part.rect.x1 + part.oh.x1, part.rect.z1 + part.oh.z1], [part.rect.x0 - part.oh.x0, part.rect.z1 + part.oh.z1]]
  : part.poly);
// Đỉnh mái cao nhất (để camera / hiển thị).
export const roofTop = parts => Math.max(0, ...parts.map(p => p.base + p.rise));

// Cao độ mặt mái tại một điểm local. Dùng chung cho va chạm / đi lại trong Explore Mode.
export function roofHeightAt(part, x, z, slab = 0.18) {
  if (!pointInPolygon(x, z, roofOutline(part))) return null;
  if (part.kind === 'flat') return part.base + slab;
  if (part.poly) {
    const c = part.center, maxD = Math.max(...part.corePoly.map(p => Math.hypot(p[0] - c[0], p[1] - c[1]))) || 1;
    const d = Math.hypot(x - c[0], z - c[1]);
    return part.base + part.rise * Math.max(0, 1 - d / maxD);
  }
  const t = Math.tan(rad(part.pitch)), X = part.ridge === 'x';
  const a = X ? x : z, b = X ? z : x;
  const A0 = X ? part.rect.x0 : part.rect.z0, A1 = X ? part.rect.x1 : part.rect.z1;
  const B0 = X ? part.rect.z0 : part.rect.x0, B1 = X ? part.rect.z1 : part.rect.x1;
  if (part.kind === 'gable') return part.base + part.rise - Math.abs(b - (B0 + B1) / 2) * t;
  return part.base + Math.min(part.rise / t, a - A0, A1 - a, b - B0, B1 - b) * t;
}

// ---------- Kiểm tra ----------
// Lỗi chặn lưu: tham số sai, tầng không tồn tại, trùng mái, phần nhô ra ngoài lô.
// Footprint trống (vd. vừa xoá tường) KHÔNG phải lỗi lưu: mái giữ tham số và tự hiện lại khi tầng có phòng (chỉ cảnh báo).
export function validateRoof(design, roof, { poly = null, requireFootprint = false } = {}) {
  if (!ROOF_KINDS.some(k => k.id === roof.kind) || !['auto', 'x', 'z'].includes(roof.ridge) || !ROOF_MATERIALS.some(m => m.id === roof.material_id)) return 'LIMITS';
  if (!(roof.pitch >= ROOF_LIMITS.pitch[0] && roof.pitch <= ROOF_LIMITS.pitch[1]) || !(roof.overhang >= ROOF_LIMITS.overhang[0] && roof.overhang <= ROOF_LIMITS.overhang[1])) return 'LIMITS';
  if (roof.color != null && !/^#[0-9a-f]{6}$/i.test(roof.color)) return 'LIMITS';
  if (!(Number.isInteger(roof.floor) && roof.floor >= 0 && roof.floor < (design.levels?.length || 1))) return 'NO_LEVEL';
  if ((design.objects || []).some(o => o.type === 'roof' && o.id !== roof.id && o.floor === roof.floor)) return 'DUPLICATE';
  const { parts } = roofParts(design, roof);
  if (!parts.length) return requireFootprint ? 'NO_FOOTPRINT' : null;
  if (poly && parts.some(p => !footprintInside(roofOutline(p), poly, 0))) return 'OUTSIDE';
  return null;
}
export function cleanRoof(o) {
  if (typeof o.pitch !== 'number' || typeof o.overhang !== 'number' || !Number.isFinite(o.pitch) || !Number.isFinite(o.overhang)) return { error: 'pitch / overhang phải là số' };
  if (o.color != null && typeof o.color !== 'string') return { error: 'color không hợp lệ' };
  return { obj: { id: o.id, type: 'roof', floor: o.floor, kind: o.kind, pitch: r4(o.pitch), overhang: r4(o.overhang), ridge: o.ridge || 'auto', material_id: o.material_id, ...(o.color ? { color: o.color.toLowerCase() } : {}) } };
}
export const roofsOf = (design, floor) => (design.objects || []).filter(o => o.type === 'roof' && (floor == null || o.floor === floor));
