// Đi lại nhiều tầng trong Explore Mode (nhân vật vẫn điều khiển trên mặt phẳng X/Z, độ cao lấy từ "mặt đứng được").
// Tại mỗi điểm, các mặt có thể đứng: nền đất / tấm sàn tầng trệt, mặt dốc cầu thang, sàn tầng trên (trừ lỗ cầu thang).
// Chọn mặt gần độ cao hiện tại nhất trong phạm vi một bước (STEP) — giống bước lên một bậc:
//   - đi lên / xuống cầu thang theo độ dốc; ra khỏi cầu thang ở đầu trên thì sang sàn tầng trên;
//   - ở tầng trên, ra ngoài mép sàn / đi vào lỗ cầu thang (không đúng độ cao) → không có mặt → bị chặn (không rơi xuyên sàn);
//   - ở tầng trệt, gầm cầu thang (bậc cao hơn một bước) bị chặn → cầu thang có "collider" hai bên.
import { pointInPolygon } from '../../../../shared/buildGeometry.mjs';
import { floorArea, floorHoles, levelElevation, levelHeight, stairLayout, stairHeightAt } from '../../../../shared/levelGeometry.mjs';
import { pointAlong, wallColliderSpans } from '../../../../shared/openingGeometry.mjs';
import { roofHeightAt, roofOutline, roofParts } from '../../../../shared/roofGeometry.mjs';
import { buildSurfaceY, worldToPlotLocal } from './buildingUtils.js';

const STEP = 0.45;
const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
};

// plots: các lô (tìm theo plot_id); designs: thiết kế đã lưu; doorStates: Map plot_id → Set(opening_id đang mở).
export function buildHouseWalk(plots, designs, doorStates = null) {
  const houses = [];
  for (const d of designs) {
    const plot = plots.find(p => p.id === d.plot_id), design = d.design;
    if (!plot || !design?.objects?.length) continue;
    const levels = design.levels || [{ height: 3 }];
    const slabs0 = design.objects.filter(o => o.type === 'floor' && o.floor === 0);
    const stairs = design.objects.filter(o => o.type === 'stair').map(st => ({ st, lay: stairLayout(st, levelHeight(levels, st.floor)), base: levelElevation(levels, st.floor) }));
    const roofs = design.objects.filter(o => o.type === 'roof').map(roof => ({ roof, parts: roofParts(design, roof).parts }));
    if (!slabs0.length && !stairs.length && !roofs.length && levels.length < 2) continue;
    const upper = [];
    for (let L = 1; L < levels.length; L++) upper.push({ L, y: levelElevation(levels, L), area: floorArea(design, L), holes: floorHoles(design, L) });
    // Tường tầng trên → đoạn va chạm (cửa mở để trống), toạ độ local.
    const walls = new Map();
    for (const w of design.objects.filter(o => o.type === 'wall' && o.floor > 0)) {
      const open = doorStates?.get(d.plot_id);
      for (const [s0, s1] of wallColliderSpans(w, id => !!open?.has(id))) {
        if (!walls.has(w.floor)) walls.set(w.floor, []);
        walls.get(w.floor).push({ a: pointAlong(w, s0), b: pointAlong(w, s1), r: w.thickness / 2 });
      }
    }
    // Hộp bao (local) để bỏ qua nhanh các điểm ở xa nhà.
    const pts = [...slabs0.flatMap(s => s.polygon), ...stairs.flatMap(s => s.lay.polys.flat()), ...upper.flatMap(u => u.area.flat()), ...roofs.flatMap(r => r.parts.flatMap(roofOutline))];
    if (!pts.length) continue;
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    houses.push({ plot, sy: buildSurfaceY(plot), slabs0, stairs, upper, roofs, walls, box: [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...zs) - 1, Math.max(...zs) + 1] });
  }
  if (!houses.length) return null;
  const houseAt = (x, z) => {
    for (const h of houses) {
      const l = worldToPlotLocal(h.plot, x, 0, z);
      if (l.x >= h.box[0] && l.x <= h.box[1] && l.z >= h.box[2] && l.z <= h.box[3]) return { h, l };
    }
    return null;
  };
  return {
    // Mặt đứng được gần độ cao y nhất (y tuyệt đối) → { y, level } hoặc null (không có chỗ đứng → bị chặn).
    surface(x, z, y = 0) {
      const hit = houseAt(x, z);
      if (!hit) return { y: 0, level: 0 };
      const { h, l } = hit, cands = [];
      let onStair = false;
      for (const s of h.stairs) {
        const sh = stairHeightAt(s.lay, l.x, l.z);
        if (sh == null) continue;
        onStair = true;
        // Quá nửa chiều cao cầu thang → tính là đang ở tầng trên (va chạm theo tường tầng trên).
        const total = s.lay.parts[s.lay.parts.length - 1].y1;
        cands.push({ y: h.sy + s.base + sh, level: s.st.floor + (sh >= total / 2 ? 1 : 0) });
      }
      // Nền / tấm sàn tầng trệt (không có ở dưới gầm cầu thang).
      if (!onStair) {
        let gy = 0;
        for (const s of h.slabs0) if (pointInPolygon(l.x, l.z, s.polygon)) gy = Math.max(gy, h.sy + s.thickness);
        cands.push({ y: gy, level: 0 });
      }
      for (const u of h.upper) {
        if (u.area.some(p => pointInPolygon(l.x, l.z, p)) && !u.holes.some(p => pointInPolygon(l.x, l.z, p))) cands.push({ y: h.sy + u.y, level: u.L });
      }
      for (const r of h.roofs) for (const part of r.parts) {
        const ry = roofHeightAt(part, l.x, l.z);
        if (ry != null) cands.push({ y: h.sy + ry, level: r.roof.floor + 1 });
      }
      let best = null, bd = STEP;
      for (const c of cands) { const k = Math.abs(c.y - y); if (k <= bd) { bd = k; best = c; } }
      return best;
    },
    // Va chạm với tường tầng trên (tầng ≥ 1); tầng trệt dùng collider thế giới như cũ.
    wallHit(level, x, z, pad = 0.25) {
      const hit = houseAt(x, z);
      if (!hit) return false;
      return (hit.h.walls.get(level) || []).some(s => segDist(hit.l.x, hit.l.z, s.a, s.b) < s.r + pad);
    },
  };
}
