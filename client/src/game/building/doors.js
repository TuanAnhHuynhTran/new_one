// Cửa trong Explore Mode: vị trí cửa (world), trạng thái mở / đóng, và bus sự kiện để sau này đồng bộ multiplayer.
import { pointAlong } from '../../../../shared/openingGeometry.mjs';
import { plotLocalToWorld } from './buildingUtils.js';

// Mọi cửa đi ở tầng trệt của các thiết kế đã lưu → [{ plot_id, wall_id, opening_id, x, z, name }].
export function worldDoors(plots, designs) {
  const out = [];
  for (const d of designs) {
    const plot = plots.find(p => p.id === d.plot_id);
    if (!plot) continue;
    for (const w of d.design?.objects || []) {
      if (w.type !== 'wall' || w.floor !== 0) continue;
      for (const o of w.openings || []) {
        if (o.type !== 'door') continue;
        const [lx, lz] = pointAlong(w, o.offset + o.width / 2), p = plotLocalToWorld(plot, lx, 0, lz);
        out.push({ plot_id: d.plot_id, wall_id: w.id, opening_id: o.id, x: p.x, z: p.z, width: o.width });
      }
    }
  }
  return out;
}
export function nearestDoor(doors, x, z, maxDist = 1.6) {
  let best = null, bd = maxDist;
  for (const d of doors) { const k = Math.hypot(d.x - x, d.z - z); if (k < bd) { bd = k; best = d; } }
  return best;
}
// Map plot_id → Set(opening_id đang mở).
export function doorStateMap(list) {
  const m = new Map();
  for (const d of list) if (d.open) { if (!m.has(d.plot_id)) m.set(d.plot_id, new Set()); m.get(d.plot_id).add(d.opening_id); }
  return m;
}
// Sự kiện 'door:toggle' { plot_id, wall_id, opening_id, open, by, at } — hiện phát nội bộ; bản multiplayer sẽ gửi / nhận qua mạng.
export const doorEvents = typeof EventTarget !== 'undefined' ? new EventTarget() : null;
export const emitDoor = detail => doorEvents?.dispatchEvent(new CustomEvent('door:toggle', { detail }));
