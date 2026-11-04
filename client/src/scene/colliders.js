// Vật cản tĩnh của thế giới: hộp (nhà, hàng rào, luống rau) và hình tròn (cây, cột đèn, bàn ô).
import { CAFE, houseColliders } from '../world.js';
import { BED_SPOTS, FENCE_SIDES, GATE_POSTS } from './Rural.jsx';
import { CAFE_PLANTERS, UMBRELLAS, cityLampSpots } from './City.jsx';

export const PLAYER_RADIUS = 0.35;

export function buildColliders(nodes, trees) {
  const rects = houseColliders(nodes);
  const circles = [];
  trees.forEach(t => circles.push({ x: t.x, z: t.z, r: t.planter ? 0.8 : 0.5 * t.s }));
  cityLampSpots().forEach(([x, z]) => circles.push({ x, z, r: 0.3 }));
  UMBRELLAS.forEach(([x, z]) => circles.push({ x: CAFE.x + x, z: CAFE.z + z, r: 1.25 }));
  CAFE_PLANTERS.forEach(([x, z]) => rects.push({ x: CAFE.x + x, z: CAFE.z + z, hx: 0.45, hz: 1.3 }));
  nodes.filter(p => p.zone === 'rural').forEach(p => {
    const X = +p.world_x, Z = +p.world_z;
    FENCE_SIDES.forEach(([x0, z0, x1, z1]) => rects.push({ x: X + (x0 + x1) / 2, z: Z + (z0 + z1) / 2, hx: Math.abs(x1 - x0) / 2 + 0.12, hz: Math.abs(z1 - z0) / 2 + 0.12 }));
    BED_SPOTS.forEach(([bx, bz]) => rects.push({ x: X + bx, z: Z + bz, hx: 2.5, hz: 1.5 }));
    GATE_POSTS.forEach(([dx, dz]) => circles.push({ x: X + dx, z: Z + dz, r: 0.22 }));
  });
  return makeHit(rects, circles);
}

// Lưới ô 8 m để mỗi lần kiểm tra chỉ duyệt vài vật cản gần nhân vật.
function makeHit(rects, circles, pad = PLAYER_RADIUS) {
  const CELL = 8, grid = new Map();
  const add = (o, x0, x1, z0, z1) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = i + ':' + j;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(o);
      }
  };
  rects.forEach(h => add({ ...h, t: 0 }, h.x - h.hx - pad, h.x + h.hx + pad, h.z - h.hz - pad, h.z + h.hz + pad));
  circles.forEach(c => add({ ...c, t: 1 }, c.x - c.r - pad, c.x + c.r + pad, c.z - c.r - pad, c.z + c.r + pad));
  return (x, z) => {
    const list = grid.get(Math.floor(x / CELL) + ':' + Math.floor(z / CELL));
    if (!list) return false;
    return list.some(o => (o.t === 0
      ? Math.abs(o.x - x) < o.hx + pad && Math.abs(o.z - z) < o.hz + pad
      : (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + pad) ** 2));
  };
}
