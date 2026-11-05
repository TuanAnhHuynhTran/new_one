// Tính kết quả xem trước theo chuột (hàm thuần): khớp lưới theo kiểu của công cụ, kiểm tra hợp lệ, nhãn kích thước / chiều dài.
import { MARKER_SIZE } from '../../../../shared/buildGeometry.mjs';
import { WALL_ERRORS, addWall, moveWallEndpoint, snapWallPoint } from '../../../../shared/wallGeometry.mjs';
import { isInsidePlot, localBoundary, snapToGrid } from './buildingUtils.js';
import { FLOOR_ERRORS, rectPolygon, validateFloor } from '../../../../shared/roomGeometry.mjs';
import { footprintInside } from '../../../../shared/buildGeometry.mjs';
import { STAIR_ERRORS, dirToward, validateStair } from '../../../../shared/levelGeometry.mjs';
import { OPENING_ERRORS, catalogItem, pointAlong, snapOffset, validateOpening, wallAt } from '../../../../shared/openingGeometry.mjs';
import { validatePlacement } from './BuildValidation.js';
import { toolSnapMode, wallsOf } from './buildingStore.js';

const fmt = v => +v.toFixed(2);

// Kết quả xem trước cho trạng thái chuột hiện tại (hàm thuần — dùng chung cho vẽ và khi bấm chuột).
// opts: { shift (khoá góc 45°), endDrag: { id, which } (đang kéo đầu tường) }.
export function computePreview(s, plot, raw, drag, altFree, opts = {}) {
  if (s.activeTool === 'wall' || opts.endDrag) return wallPreview(s, plot, raw, altFree, opts);
  if (s.activeTool === 'floor') return floorPreview(s, plot, raw, altFree);
  if (s.activeTool === 'door' || s.activeTool === 'window') return openingPreview(s, plot, raw, altFree);
  if (s.activeTool === 'stair') return stairPreview(s, plot, raw, altFree);
  const mode = toolSnapMode(s.activeTool), snap = s.snapEnabled && !altFree;
  const p = snapToGrid(plot, raw.x, raw.z, s.gridSize, snap, mode);
  const base = { local: { x: fmt(p.x), z: fmt(p.z) }, raw, tool: s.activeTool };
  if (s.activeTool === 'marker') {
    const v = validatePlacement({ plot, design: s.design, canEdit: s.canEdit, type: 'marker', floor: s.activeFloor, local: p, setback: s.setback });
    return { ...base, kind: 'tile', valid: v.ok, reason: v.reason, size: snap ? { w: s.gridSize, d: s.gridSize } : { w: MARKER_SIZE, d: MARKER_SIZE }, label: `x ${fmt(p.x)} · z ${fmt(p.z)}` };
  }
  if (s.activeTool === 'zone' || s.activeTool === 'measure') {
    const margin = s.activeTool === 'zone' ? s.setback : 0;
    if (!drag) {
      const ok = isInsidePlot(plot, p.x, p.z, margin);
      return { ...base, kind: 'point', valid: ok, reason: ok ? null : s.activeTool === 'zone' ? `Góc vùng phải cách ranh giới ≥ ${s.setback} m` : 'Điểm nằm ngoài lô đất', label: s.activeTool === 'zone' ? 'Kéo để vẽ vùng' : 'Kéo để đo' };
    }
    const a = drag.start;
    if (s.activeTool === 'measure') {
      const len = Math.hypot(p.x - a.x, p.z - a.z), ok = isInsidePlot(plot, p.x, p.z, 0);
      return { ...base, kind: 'line', a, b: base.local, valid: ok, reason: ok ? null : 'Điểm nằm ngoài lô đất', label: `${fmt(len)} m` };
    }
    const center = { x: (a.x + p.x) / 2, z: (a.z + p.z) / 2 }, size = { w: fmt(Math.abs(p.x - a.x)), d: fmt(Math.abs(p.z - a.z)) };
    const v = validatePlacement({ plot, design: s.design, canEdit: s.canEdit, type: 'zone', floor: s.activeFloor, local: center, size, setback: s.setback });
    return { ...base, kind: 'rect', center, size, valid: v.ok, reason: v.reason, label: `${size.w} × ${size.d} m · ${fmt(size.w * size.d)} m²` };
  }
  // Mái: click bất kỳ đâu trên lô → dựng mái cho tầng đang chọn (từ các phòng của tầng); đã có mái thì chọn để chỉnh.
  if (s.activeTool === 'roof') {
    const has = s.design.objects.some(o => o.type === 'roof' && o.floor === s.activeFloor);
    return { ...base, kind: 'none', valid: true, reason: null, label: has ? 'Click để chọn mái của tầng' : 'Click để thêm mái cho tầng' };
  }
  return { ...base, kind: 'none', valid: true, reason: null, label: null };
}

// ---------- Tường ----------
// Bắt điểm: đầu tường → thân tường (nối chữ T) → giao điểm lưới → tự do; Shift khoá hướng 45°.
// Có điểm đầu (wallDraft) → xem trước cả đoạn: hợp lệ khi addWall (cùng hàm dùng để tạo) chấp nhận.
// Kéo đầu tường (endDrag) → xem trước kết quả moveWallEndpoint.
function wallPreview(s, plot, raw, altFree, { shift = false, endDrag = null } = {}) {
  const snap = s.snapEnabled && !altFree, walls = wallsOf(s.design, s.activeFloor);
  const opts = { poly: localBoundary(plot), setback: s.setback };
  const dragged = endDrag && walls.find(w => w.id === endDrag.id);
  const anchor = dragged ? dragged[endDrag.which === 'start' ? 'end' : 'start'] : s.wallDraft?.start || null;
  const sp = snapWallPoint([raw.x, raw.z], walls, {
    gridFn: (x, z) => snapToGrid(plot, x, z, s.gridSize, snap, 'vertex'), anchor, constrain: shift && !!anchor, step: snap ? s.gridSize : 0.01,
    ignorePoint: dragged ? dragged[endDrag.which] : null,
  });
  const local = { x: fmt(sp.x), z: fmt(sp.z) }, base = { local, raw, tool: s.activeTool, snapKind: sp.kind };
  const d = dragged || s.wallDefaults;
  const hint = sp.kind === 'endpoint' ? ' · nối đầu tường' : sp.kind === 'wall' ? ' · nối chữ T' : '';
  if (!anchor) {
    const ok = isInsidePlot(plot, local.x, local.z, s.setback);
    return { ...base, kind: 'point', valid: ok && s.canEdit, reason: !s.canEdit ? 'Chỉ chủ lô mới được xây' : ok ? null : WALL_ERRORS.OUTSIDE, label: 'Click chọn điểm đầu' + hint };
  }
  const a = { x: anchor[0], z: anchor[1] }, len = Math.hypot(local.x - a.x, local.z - a.z);
  let r;
  if (dragged) r = moveWallEndpoint(wallsOf(s.design), dragged.id, endDrag.which, [local.x, local.z], opts);
  else r = addWall(wallsOf(s.design), { id: 'wall_preview', type: 'wall', floor: s.activeFloor, start: anchor, end: [local.x, local.z], height: d.height, thickness: d.thickness, material_id: d.material_id, openings: [] }, () => 'wall_previewx', opts);
  return { ...base, kind: 'wall', a, b: local, height: d.height, thickness: d.thickness, valid: !r.error, reason: r.error ? WALL_ERRORS[r.error] || r.error : null, label: `${fmt(len)} m${hint}` };
}

// ---------- Sàn ----------
// Click góc đầu → rê chuột xem trước hình chữ nhật (diện tích) → click góc đối diện. Khớp giao điểm lưới.
function floorPreview(s, plot, raw, altFree) {
  const snap = s.snapEnabled && !altFree, p = snapToGrid(plot, raw.x, raw.z, s.gridSize, snap, 'vertex');
  const local = { x: fmt(p.x), z: fmt(p.z) }, base = { local, raw, tool: 'floor' };
  if (!s.floorDraft) {
    const ok = isInsidePlot(plot, local.x, local.z, 0);
    return { ...base, kind: 'point', valid: ok && s.canEdit, reason: ok ? null : FLOOR_ERRORS.OUTSIDE, label: 'Click chọn góc đầu của sàn' };
  }
  const [ax, az] = s.floorDraft.start;
  const slab = { id: 'floor_preview', type: 'floor', floor: s.activeFloor, polygon: rectPolygon([ax, az], [local.x, local.z]), ...s.floorDefaults };
  const err = validateFloor(slab, s.design.objects.filter(o => o.type === 'floor'), { insideFn: q => footprintInside(q, localBoundary(plot), 0) });
  const size = { w: fmt(Math.abs(local.x - ax)), d: fmt(Math.abs(local.z - az)) };
  return { ...base, kind: 'rect', center: { x: (ax + local.x) / 2, z: (az + local.z) / 2 }, size, valid: !err, reason: err ? FLOOR_ERRORS[err] : null, label: `Sàn ${size.w} × ${size.d} m · ${fmt(size.w * size.d)} m²` };
}

// ---------- Cửa & cửa sổ ----------
// Tìm tường dưới con trỏ (Wall ID) → vị trí dọc tường → offset (khớp bước nửa ô lưới, kẹp trong đoạn tường) → kiểm tra hợp lệ.
function openingPreview(s, plot, raw, altFree) {
  const type = s.activeTool, walls = wallsOf(s.design, s.activeFloor), local = { x: fmt(raw.x), z: fmt(raw.z) };
  const hit = wallAt(walls, [raw.x, raw.z]);
  if (!hit) return { local, raw, tool: type, kind: 'point', valid: false, reason: OPENING_ERRORS.NO_WALL, label: 'Trỏ vào một đoạn tường' };
  const d = s.openingDefaults[type], step = s.snapEnabled && !altFree ? s.gridSize / 2 : 0;
  const op = { ...d, id: `${type}_preview`, offset: snapOffset(hit.wall, hit.s, d.width, step, walls) };
  const err = !s.canEdit ? 'LIMITS' : validateOpening(hit.wall, op, walls);
  const p = pointAlong(hit.wall, op.offset + op.width / 2);
  return {
    local: { x: fmt(p[0]), z: fmt(p[1]) }, raw, tool: type, kind: 'opening', wallId: hit.wall.id, opening: op, valid: !err,
    reason: err ? (s.canEdit ? OPENING_ERRORS[err] : 'Chỉ chủ lô mới được xây') : null,
    label: `${catalogItem(op.catalog_id).name} ${op.width}×${op.height} m · cách đầu tường ${fmt(op.offset)} m`,
  };
}

// ---------- Cầu thang ----------
// Click chân cầu thang → rê chuột chọn hướng đi lên (4 hướng) → xem trước footprint → click đặt.
const DIR_NAME = ['+Z (mặt tiền)', '+X', '−Z (phía sau)', '−X'];
function stairPreview(s, plot, raw, altFree) {
  const snap = s.snapEnabled && !altFree, p = snapToGrid(plot, raw.x, raw.z, s.gridSize / 2, snap, 'vertex');
  const local = { x: fmt(p.x), z: fmt(p.z) }, base = { local, raw, tool: 'stair' };
  if (s.activeFloor + 1 >= s.design.levels.length) return { ...base, kind: 'point', valid: false, reason: STAIR_ERRORS.NO_UPPER + ' (thêm tầng 2 trước)', label: 'Cần có tầng phía trên' };
  if (!s.stairDraft) {
    const ok = isInsidePlot(plot, local.x, local.z, s.setback);
    return { ...base, kind: 'point', valid: ok && s.canEdit, reason: ok ? null : STAIR_ERRORS.OUTSIDE, label: 'Click chọn chân cầu thang' };
  }
  const start = s.stairDraft.start, dir = dirToward(start, [raw.x, raw.z]);
  const st = { id: 'stair_preview', type: 'stair', floor: s.activeFloor, start, dir, ...s.stairDefaults };
  const err = validateStair(s.design, st, { poly: localBoundary(plot), setback: s.setback });
  return { ...base, local: { x: start[0], z: start[1] }, kind: 'stair', stair: st, valid: !err, reason: err ? STAIR_ERRORS[err] : null, label: `${st.kind === 'L' ? 'Cầu thang chữ L' : 'Cầu thang thẳng'} · lên hướng ${DIR_NAME[dir]}` };
}
