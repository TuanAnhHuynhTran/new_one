// Lưới tam giác của mái (thuần three.js, không React) — dùng cho RoofMeshes.jsx và kiểm thử.
import * as THREE from 'three';
import { roofOutline, roofTriangles } from '../../../../shared/roofGeometry.mjs';

export const ROOF_SLAB = 0.18;
// Hình học của một mái (mọi khối) — toạ độ local của lô.
export function roofGeometry(parts) {
  const pos = [];
  const push = tri => tri.forEach(p => pos.push(p[0], p[1], p[2]));
  for (const part of parts) {
    if (part.kind === 'gable' || part.kind === 'hip') { roofTriangles(part).forEach(push); continue; }
    // Mái bằng: lăng trụ từ đa giác (kể cả phần nhô), đáy = đỉnh tường.
    const poly = roofOutline(part), y0 = part.base, y1 = part.base + ROOF_SLAB;
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z)));
    const idx = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);
    for (const [a, b, c] of idx) { push([[poly[a][0], y1, poly[a][1]], [poly[c][0], y1, poly[c][1]], [poly[b][0], y1, poly[b][1]]]); push([[poly[a][0], y0, poly[a][1]], [poly[b][0], y0, poly[b][1]], [poly[c][0], y0, poly[c][1]]]); }
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length];
      push([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]]]); push([[p[0], y0, p[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]]);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
