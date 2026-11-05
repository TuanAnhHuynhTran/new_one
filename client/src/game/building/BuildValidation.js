// Quy tắc đặt cấu trúc trên lô đất (client — để báo ngay cho người chơi).
// Server kiểm tra lại toàn bộ khi lưu (server/src/houseDesign.js, cùng hình học shared/buildGeometry.mjs) — client chỉ là
// lớp phản hồi nhanh, không phải lớp bảo vệ.
import { distToWall } from '../../../../shared/wallGeometry.mjs';
import { roomContains } from '../../../../shared/roomGeometry.mjs';
import { pointInPolygon } from '../../../../shared/buildGeometry.mjs';
import { openingAt } from '../../../../shared/openingGeometry.mjs';
import { levelHeight, stairLayout } from '../../../../shared/levelGeometry.mjs';
import { DEFAULT_SETBACK, MAX_FLOORS, footprintInside, localBoundary, objectFootprint, rectFootprint } from './buildingUtils.js';

// Loại cấu trúc. marker = cọc đánh dấu, zone = vùng phác thảo (phòng / khu) hình chữ nhật; còn lại dành cho phase sau.
export const STRUCTURE_TYPES = ['marker', 'zone', 'wall', 'floor', 'door', 'window', 'roof', 'room', 'stair'];
export const MAX_OBJECTS = 300;
export const MIN_ZONE = 0.5;
const MIN_GAP = 0.45; // hai cọc đánh dấu cùng tầng không được chồng lên nhau

// Footprint (đa giác local) của một cấu trúc sắp đặt.
export function footprintFor(type, local, size) {
  if (type === 'zone') return rectFootprint(local.x, local.z, size.w, size.d, 0);
  return objectFootprint({ type, position: local });
}

// Kiểm tra một cấu trúc mới. Trả { ok, reason }. Kiểm tra cả DIỆN TÍCH footprint (mọi đỉnh + cạnh), không chỉ tâm.
export function validatePlacement({ plot, design, canEdit, type, floor, local, size, setback = DEFAULT_SETBACK, ignoreId = null }) {
  if (!canEdit) return { ok: false, reason: 'Bạn chỉ được xem — đây không phải lô đất của bạn' };
  if (!plot) return { ok: false, reason: 'Chưa chọn lô đất' };
  if (!STRUCTURE_TYPES.includes(type)) return { ok: false, reason: 'Loại cấu trúc không hợp lệ' };
  if (!Number.isInteger(floor) || floor < 0 || floor >= MAX_FLOORS) return { ok: false, reason: 'Tầng không hợp lệ' };
  if (!local || ![local.x, local.z].every(Number.isFinite)) return { ok: false, reason: 'Vị trí không hợp lệ' };
  if (type === 'zone' && (!size || !(size.w >= MIN_ZONE) || !(size.d >= MIN_ZONE))) return { ok: false, reason: `Vùng tối thiểu ${MIN_ZONE} × ${MIN_ZONE} m` };
  const fp = footprintFor(type, local, size);
  if (!footprintInside(fp, localBoundary(plot), setback)) {
    return { ok: false, reason: setback > 0 ? `Ra ngoài ranh giới / khoảng lùi ${setback} m` : 'Nằm ngoài ranh giới lô đất' };
  }
  const objects = design?.objects || [];
  if (!ignoreId && objects.length >= MAX_OBJECTS) return { ok: false, reason: `Tối đa ${MAX_OBJECTS} cấu trúc mỗi lô` };
  if (type === 'marker') {
    const clash = objects.find(o => o.id !== ignoreId && o.floor === floor && o.type === 'marker'
      && Math.hypot(o.position.x - local.x, o.position.z - local.z) < MIN_GAP);
    if (clash) return { ok: false, reason: 'Trùng vị trí với cấu trúc khác' };
  }
  return { ok: true, reason: null };
}

// Cấu trúc tại điểm local trên tầng (để chọn / xoá bằng chuột): ưu tiên cọc gần nhất, sau đó vùng chứa điểm.
export function objectAt(design, floor, local, radius = 0.6) {
  let best = null, bd = radius;
  for (const o of design?.objects || []) {
    if (o.floor !== floor || o.type !== 'marker') continue;
    const d = Math.hypot(o.position.x - local.x, o.position.z - local.z);
    if (d < bd) { bd = d; best = o; }
  }
  if (best) return best;
  // Cửa / cửa sổ trên tường (ưu tiên hơn chính tường).
  const op = openingAt((design?.objects || []).filter(o => o.type === 'wall' && o.floor === floor), [local.x, local.z]);
  if (op) return op.opening;
  // Tường gần nhất (trong nửa độ dày + 0.2 m).
  let wd = Infinity;
  for (const o of design?.objects || []) {
    if (o.floor !== floor || o.type !== 'wall') continue;
    const d = distToWall([local.x, local.z], o);
    if (d < o.thickness / 2 + 0.2 && d < wd) { wd = d; best = o; }
  }
  if (best) return best;
  // Vùng nhỏ nhất chứa điểm.
  let area = Infinity;
  for (const o of design?.objects || []) {
    if (o.floor !== floor || o.type !== 'zone') continue;
    if (Math.abs(local.x - o.position.x) <= o.size.w / 2 && Math.abs(local.z - o.position.z) <= o.size.d / 2 && o.size.w * o.size.d < area) { area = o.size.w * o.size.d; best = o; }
  }
  if (best) return best;
  // Cầu thang (đặt từ tầng này), tấm sàn, rồi phòng (đa giác) chứa điểm.
  for (const o of design?.objects || []) if (o.floor === floor && o.type === 'stair' && stairLayout(o, levelHeight(design.levels, o.floor)).polys.some(p => pointInPolygon(local.x, local.z, p))) return o;
  for (const o of design?.objects || []) if (o.floor === floor && o.type === 'floor' && pointInPolygon(local.x, local.z, o.polygon)) return o;
  for (const o of design?.objects || []) if (o.floor === floor && o.type === 'room' && roomContains(o, local.x, local.z)) return o;
  return null;
}
