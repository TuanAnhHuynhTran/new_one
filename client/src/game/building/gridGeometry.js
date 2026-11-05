// Dựng các đoạn lưới (toạ độ local) cắt theo ranh giới đa giác — hàm thuần, không phụ thuộc three.js / React.
import { clipAxisLine, polygonBounds } from '../../../../shared/buildGeometry.mjs';

export function buildGridSegments(poly, step) {
  const b = polygonBounds(poly), minor = [], major = [];
  const isMajor = d => Math.abs(d / 5 - Math.round(d / 5)) < 1e-6;
  for (let i = 0; b.minX + i * step <= b.maxX + 1e-6; i++) {
    const x = b.minX + i * step, arr = isMajor(i * step) ? major : minor;
    for (const [z0, z1] of clipAxisLine(poly, 'x', x === b.maxX ? x - 1e-6 : x + 1e-6)) arr.push(x, 0, z0, x, 0, z1);
  }
  for (let i = 0; b.minZ + i * step <= b.maxZ + 1e-6; i++) {
    const z = b.minZ + i * step, arr = isMajor(i * step) ? major : minor;
    for (const [x0, x1] of clipAxisLine(poly, 'z', z === b.maxZ ? z - 1e-6 : z + 1e-6)) arr.push(x0, 0, z, x1, 0, z);
  }
  return { minor, major };
}
