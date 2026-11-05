// Thiết kế nhà (House Builder) — kiểm tra & chuẩn hoá phía server. KHÔNG tin dữ liệu client:
// mọi cấu trúc phải đúng kiểu, đúng tầng, và TOÀN BỘ footprint nằm trong ranh giới đa giác của lô, cách ranh giới ≥ setback.
// Dùng chung hình học với client (shared/buildGeometry.mjs) → kết quả kiểm tra hai phía giống nhau.
import crypto from 'crypto';
import { footprintInside, localBoundary, objectFootprint, segmentsCross } from '../../shared/buildGeometry.mjs';
import { WALL_ERRORS, cleanWall, validateWallSet } from '../../shared/wallGeometry.mjs';
import { OPENING_ERRORS, validateWallOpenings } from '../../shared/openingGeometry.mjs';
import { LEVEL_ERRORS, LEVEL_LIMITS, MAX_LEVELS, STAIR_ERRORS, cleanStair, levelId, normalizeDesign, validateLevels, validateStair } from '../../shared/levelGeometry.mjs';
import { ROOF_ERRORS, cleanRoof, validateRoof } from '../../shared/roofGeometry.mjs';
import { FLOOR_DEFAULTS, FLOOR_ERRORS, FLOOR_LIMITS, FLOOR_MATERIALS, ROOM_TYPES, detectRooms, sameRegion, signedArea, validateFloor } from '../../shared/roomGeometry.mjs';

export const DESIGN_SCHEMA = 2; // 2 = có design.levels (nhà nhiều tầng); schema 1 (một tầng) được nâng cấp tự động
export const STRUCTURE_TYPES = ['marker', 'zone', 'wall', 'floor', 'door', 'window', 'roof', 'room', 'stair'];
// Đã có công cụ: cọc đánh dấu, vùng phòng. Các loại khác bị từ chối cho tới khi có công cụ tương ứng.
export const ENABLED_TYPES = ['marker', 'zone', 'wall', 'floor', 'room', 'stair', 'roof'];
export const MAX_FLOORS = MAX_LEVELS;
export const MAX_OBJECTS = 300;
export const DEFAULT_SETBACK = 0.5;
export const MIN_ZONE = 0.5;

export const emptyDesign = () => normalizeDesign({ schema: DESIGN_SCHEMA, objects: [] });
// Thiết kế đọc từ database (kể cả nhà một tầng cũ, schema 1) → schema 2 có levels.
export const upgradeDesign = d => (d ? normalizeDesign(d) : emptyDesign());
const num = v => typeof v === 'number' && Number.isFinite(v);

// Trả { design } (đã chuẩn hoá) hoặc { error: 'INVALID_DESIGN', details: [...] }.
export function validateHouseDesign(design, plot, { setback = DEFAULT_SETBACK } = {}) {
  const details = [];
  if (!design || typeof design !== 'object' || Array.isArray(design)) return { error: 'INVALID_DESIGN', details: ['design phải là object'] };
  const objects = design.objects;
  if (!Array.isArray(objects)) return { error: 'INVALID_DESIGN', details: ['design.objects phải là mảng'] };
  if (objects.length > MAX_OBJECTS) return { error: 'INVALID_DESIGN', details: [`Tối đa ${MAX_OBJECTS} cấu trúc`] };
  const poly = localBoundary(plot);
  // Tầng: 1–2 tầng, chiều cao trong giới hạn. Thiết kế cũ không có levels → coi như một tầng (tự nâng cấp).
  const rawLevels = Array.isArray(design.levels) ? design.levels : [];
  if (rawLevels.length > MAX_LEVELS) return { error: 'INVALID_DESIGN', details: [LEVEL_ERRORS.TOO_MANY] };
  for (const l of rawLevels) if (!(typeof l?.height === 'number' && l.height >= LEVEL_LIMITS.height[0] && l.height <= LEVEL_LIMITS.height[1])) return { error: 'INVALID_DESIGN', details: [LEVEL_ERRORS.HEIGHT] };
  // Dữ liệu cũ (chưa có levels): số tầng suy ra từ floor lớn nhất, tối đa MAX_LEVELS.
  const nLevels = rawLevels.length || Math.min(MAX_LEVELS, 1 + Math.max(0, ...objects.map(o => (Number.isInteger(o?.floor) ? o.floor : 0))));
  const ids = new Set(), out = [];
  objects.forEach((o, i) => {
    const at = `objects[${i}]`;
    if (!o || typeof o !== 'object') { details.push(`${at}: không hợp lệ`); return; }
    if (typeof o.id !== 'string' || !/^[a-z]+_[a-z0-9]{4,24}$/i.test(o.id)) details.push(`${at}.id không hợp lệ`);
    else if (ids.has(o.id)) details.push(`${at}.id bị trùng`);
    else ids.add(o.id);
    if (!STRUCTURE_TYPES.includes(o.type)) { details.push(`${at}.type không hợp lệ`); return; }
    if (!ENABLED_TYPES.includes(o.type)) { details.push(`${at}.type "${o.type}" chưa được hỗ trợ`); return; }
    if (!Number.isInteger(o.floor) || o.floor < 0 || o.floor >= MAX_FLOORS) { details.push(`${at}.floor phải là 0–${MAX_FLOORS - 1}`); return; }
    // Tường: kiểm tra kiểu dữ liệu ở đây, kiểm tra hình học (ranh giới, trùng, chồng, cắt ngang, cửa) cho cả tập ở dưới.
    if (o.type === 'wall') {
      const c = cleanWall(o);
      if (c.error) details.push(`${at}: ${c.error}`); else {
        for (const opening of c.wall.openings || []) {
          if (ids.has(opening.id)) details.push(`${at}.openings: id ${opening.id} bị trùng`);
          else ids.add(opening.id);
        }
        out.push(c.wall);
      }
      return;
    }
    if (o.floor >= nLevels) { details.push(`${at}: ${LEVEL_ERRORS.NO_LEVEL}`); return; }
    if (o.level_id != null && o.level_id !== levelId(o.floor)) { details.push(`${at}.level_id không khớp tầng ${o.floor}`); return; }
    if (o.type === 'roof') {
      const c = cleanRoof(o);
      if (c.error) details.push(`${at}: ${c.error}`); else out.push(c.obj);
      return;
    }
    if (o.type === 'stair') {
      const c = cleanStair(o);
      if (c.error) details.push(`${at}: ${c.error}`); else out.push(c.obj);
      return;
    }
    if (o.type === 'floor' || o.type === 'room') {
      const c = o.type === 'floor' ? cleanFloor(o) : cleanRoom(o);
      if (c.error) details.push(`${at}: ${c.error}`); else out.push(c.obj);
      return;
    }
    const pos = o.position || {};
    if (!num(pos.x) || !num(pos.z)) { details.push(`${at}.position không hợp lệ`); return; }
    const rot = Number(o.rotation_y || 0);
    if (!Number.isFinite(rot) || Math.abs(rot) > 6.284) { details.push(`${at}.rotation_y không hợp lệ`); return; }
    const clean = { id: o.id, type: o.type, floor: o.floor, position: { x: +pos.x.toFixed(3), y: 0, z: +pos.z.toFixed(3) }, rotation_y: +rot.toFixed(4) };
    if (o.type === 'zone') {
      const sz = o.size || {};
      if (!num(sz.w) || !num(sz.d) || sz.w < MIN_ZONE || sz.d < MIN_ZONE) { details.push(`${at}.size phải ≥ ${MIN_ZONE} × ${MIN_ZONE} m`); return; }
      clean.size = { w: +sz.w.toFixed(3), d: +sz.d.toFixed(3) };
    }
    // Kiểm tra cả diện tích footprint (mọi đỉnh + cạnh), không chỉ tâm.
    if (!footprintInside(objectFootprint(clean), poly, setback)) details.push(`${at} nằm ngoài ranh giới lô đất / khoảng lùi ${setback} m`);
    out.push(clean);
  });
  if (!details.length) {
    for (const e of validateWallSet(out.filter(o => o.type === 'wall'), { poly, setback })) details.push(`wall ${e.id}: ${WALL_ERRORS[e.code] || e.code}`);
    // Cửa / cửa sổ: đúng mẫu, nằm trong đoạn tường (trừ mối nối), không chồng nhau, không cao hơn tường.
    for (const e of validateWallOpenings(out.filter(o => o.type === 'wall'))) details.push(`opening ${e.id} (wall ${e.wall_id}): ${OPENING_ERRORS[e.code] || e.code}`);
    // Tấm sàn: trong ranh giới (không cần khoảng lùi), không chồng tấm khác cùng tầng.
    const slabs = out.filter(o => o.type === 'floor');
    for (const f of slabs) {
      const err = validateFloor(f, slabs, { insideFn: q => footprintInside(q, poly, 0) });
      if (err) details.push(`floor ${f.id}: ${FLOOR_ERRORS[err]}`);
    }
    // Phòng: server tự nhận diện lại từ tường — mỗi phòng gửi lên phải khớp đúng một vùng khép kín, mỗi vùng phải có phòng.
    // → không thể lưu phòng giả (tường chưa khép kín) hay sửa polygon / diện tích phòng tuỳ ý.
    const floors = new Set(out.filter(o => o.type === 'wall' || o.type === 'room').map(o => o.floor));
    for (const fl of floors) {
      const found = detectRooms(out.filter(o => o.type === 'wall' && o.floor === fl)), used = new Set();
      for (const r of out.filter(o => o.type === 'room' && o.floor === fl)) {
        // Diện tích tính từ chính polygon client gửi (không tin trường area).
        const own = { polygon: r.polygon, holes: r.holes, area: Math.abs(signedArea(r.polygon)) - r.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0) };
        const i = found.findIndex((f, k) => !used.has(k) && sameRegion(own, f));
        if (i < 0) { details.push(`room ${r.id}: không khớp vùng khép kín nào của tường (tầng ${fl})`); continue; }
        used.add(i);
        Object.assign(r, { polygon: found[i].polygon, holes: found[i].holes, area: found[i].area }); // lấy hình học do server tính
      }
      // Vùng khép kín chưa có phòng (vd. dữ liệu tường cũ) → server tự tạo phòng mặc định.
      found.forEach((f, k) => {
        if (used.has(k)) return;
        out.push({ id: `room_${crypto.randomBytes(6).toString('hex')}`, type: 'room', floor: fl, polygon: f.polygon, holes: f.holes, area: f.area, name: `Phòng ${out.filter(o => o.type === 'room').length + 1}`, room_type: 'other', floor_material_id: FLOOR_DEFAULTS.material_id });
      });
    }
  }
  // Chuẩn hoá (levels + level_id cho mọi đối tượng) rồi kiểm tra cấu trúc tầng và cầu thang.
  const norm = normalizeDesign({ levels: rawLevels.length ? rawLevels : Array.from({ length: nLevels }, () => ({ height: 3 })), objects: out });
  if (!details.length) {
    for (const e of validateLevels(norm)) details.push(`${e.id || 'design'}: ${LEVEL_ERRORS[e.code] || e.code}`);
    for (const st of norm.objects.filter(o => o.type === 'stair')) {
      const err = validateStair(norm, st, { poly, setback });
      if (err) details.push(`stair ${st.id}: ${STAIR_ERRORS[err]}`);
    }
    // Mái: tham số trong giới hạn, mỗi tầng một mái, phần nhô không ra ngoài lô (hình mái do server tự dựng từ phòng).
    for (const rf of norm.objects.filter(o => o.type === 'roof')) {
      const err = validateRoof(norm, rf, { poly });
      if (err) details.push(`roof ${rf.id}: ${ROOF_ERRORS[err]}`);
    }
  }
  if (details.length) return { error: 'INVALID_DESIGN', details: details.slice(0, 20) };
  return { design: { ...norm, schema: DESIGN_SCHEMA } };
}

const isSimplePolygon = p => {
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
    const adjacent = j === i + 1 || (i === 0 && j === p.length - 1);
    if (!adjacent && segmentsCross(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])) return false;
  }
  return true;
};
const isPoly = (v, max) => Array.isArray(v) && v.length >= 3 && v.length <= max && v.every(q => Array.isArray(q) && q.length === 2 && q.every(n => typeof n === 'number' && Number.isFinite(n))) && isSimplePolygon(v);
const r4 = v => Math.round(v * 1e4) / 1e4;
function cleanFloor(o) {
  if (!isPoly(o.polygon, FLOOR_LIMITS.maxPoints)) return { error: 'polygon không hợp lệ' };
  if (!['rect', 'polygon'].includes(o.shape || 'rect')) return { error: 'shape không hợp lệ' };
  if (typeof o.thickness !== 'number' || !FLOOR_MATERIALS.some(m => m.id === o.material_id)) return { error: 'thickness / material_id không hợp lệ' };
  // Bản MVP chỉ có tấm sàn hình chữ nhật (đa giác lồi) — cấu trúc đã sẵn cho đa giác ở bản sau.
  if (Math.abs(signedArea(o.polygon)) < 1e-6) return { error: 'polygon có diện tích 0' };
  return { obj: { id: o.id, type: 'floor', floor: o.floor, shape: o.shape || 'rect', polygon: o.polygon.map(q => q.map(r4)), thickness: r4(o.thickness), material_id: o.material_id } };
}
function cleanRoom(o) {
  if (!isPoly(o.polygon, 200)) return { error: 'polygon không hợp lệ' };
  if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 40) return { error: 'name 1–40 ký tự' };
  if (!ROOM_TYPES.some(t => t.id === o.room_type)) return { error: 'room_type không hợp lệ' };
  if (!FLOOR_MATERIALS.some(m => m.id === o.floor_material_id)) return { error: 'floor_material_id không hợp lệ' };
  const holes = Array.isArray(o.holes) ? o.holes.filter(h => isPoly(h, 200)) : [];
  return { obj: { id: o.id, type: 'room', floor: o.floor, polygon: o.polygon, holes, area: Number(o.area) || 0, name: o.name.trim(), room_type: o.room_type, floor_material_id: o.floor_material_id } };
}

// Quyền Build Mode cho một người xem (userId có thể null = khách).
export function buildPermissionOf(plot, userId) {
  if (!plot) return null;
  const isOwner = userId != null && plot.owner_character_id != null && Number(plot.owner_character_id) === Number(userId);
  if (isOwner) return { plot_id: plot.id, can_view: true, can_edit: true, reason: null };
  if (plot.status === 'owned') return { plot_id: plot.id, can_view: true, can_edit: false, reason: 'Chỉ chủ lô đất mới được chỉnh sửa — bạn đang ở chế độ xem' };
  return { plot_id: plot.id, can_view: false, can_edit: false, reason: plot.status === 'available' ? 'Lô đất chưa có chủ — hãy nhận lô trước khi xây' : 'Lô đất này không thể xây dựng' };
}
