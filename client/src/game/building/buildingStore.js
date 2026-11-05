// Trạng thái House Builder (Zustand) — tách khỏi Game.jsx / App.jsx.
// Thiết kế nhà (design) lưu theo toạ độ local của lô; server là nơi quyết định quyền chỉnh sửa và kiểm tra lại khi lưu.
import { create } from 'zustand';
import { DEFAULT_SETBACK, GRID_SIZES, MAX_FLOORS, localBoundary, newObjectId } from './buildingUtils.js';
import { WALL_DEFAULTS, WALL_ERRORS, WALL_LIMITS, addWall, moveWallEndpoint, updateWall } from '../../../../shared/wallGeometry.mjs';
import { FLOOR_DEFAULTS, FLOOR_ERRORS, FLOOR_LIMITS, FLOOR_MATERIALS, ROOM_TYPES, rectPolygon, roomEventsMessage, syncRooms, validateFloor } from '../../../../shared/roomGeometry.mjs';
import { footprintInside } from '../../../../shared/buildGeometry.mjs';
import { DEFAULT_LEVEL_HEIGHT, LEVEL_ERRORS, LEVEL_LIMITS, MAX_LEVELS, STAIR_DEFAULTS, STAIR_ERRORS, STAIR_LIMITS, levelId, normalizeDesign, supportArea, validateLevels, validateStair } from '../../../../shared/levelGeometry.mjs';
import { OPENING_ERRORS, OPENING_LIMITS, catalogItem, openingFromCatalog, validateOpening } from '../../../../shared/openingGeometry.mjs';
import { ROOF_DEFAULTS, ROOF_ERRORS, ROOF_LIMITS, ROOF_MATERIALS, ROOF_WARNINGS, roofParts, validateRoof } from '../../../../shared/roofGeometry.mjs';
import { validatePlacement } from './BuildValidation.js';

// snap: kiểu khớp lưới riêng của từng công cụ — 'center' (tâm ô) hoặc 'vertex' (giao điểm đường lưới).
export const TOOLS = [
  { id: 'select', label: 'Chọn', icon: '↖', key: '1', group: 'Chỉnh sửa', tip: 'Chọn đối tượng gần camera để xem và sửa thuộc tính', snap: 'center' },
  { id: 'wall', label: 'Tường', icon: '🧱', key: '2', group: 'Cấu trúc', tip: 'Vẽ tường bằng hai điểm; tiếp tục click để nối tường', snap: 'vertex' },
  { id: 'floor', label: 'Sàn', icon: '▰', key: '3', group: 'Cấu trúc', tip: 'Vẽ một tấm sàn hình chữ nhật', snap: 'vertex' },
  { id: 'door', label: 'Cửa', icon: '🚪', key: '4', group: 'Cửa & cửa sổ', tip: 'Gắn cửa vào một đoạn tường', snap: 'center' },
  { id: 'window', label: 'Cửa sổ', icon: '▦', key: '5', group: 'Cửa & cửa sổ', tip: 'Gắn cửa sổ vào một đoạn tường', snap: 'center' },
  { id: 'stair', label: 'Cầu thang', icon: '▟', key: '6', group: 'Tầng & cầu thang', tip: 'Đặt cầu thang nối lên tầng kế tiếp', snap: 'center' },
  { id: 'roof', label: 'Mái', icon: '⌂', key: '7', group: 'Mái', tip: 'Tạo và chỉnh mái cho tầng hiện tại', snap: 'center' },
  { id: 'paint', label: 'Sơn', icon: '◒', key: '8', group: 'Vật liệu', tip: 'Chọn bề mặt rồi đổi màu hoặc vật liệu trong bảng thuộc tính', snap: 'center' },
  { id: 'delete', label: 'Xoá', icon: '⌫', key: 'Del', group: 'Chỉnh sửa', tip: 'Chọn đối tượng cần xoá; đối tượng quan trọng sẽ hỏi xác nhận', snap: 'center' },
];
// Công cụ phác thảo cũ vẫn được store hỗ trợ để tương thích dữ liệu/test, nhưng không chiếm chỗ trên toolbar Phase 02.8.
const AUX_TOOLS = [
  { id: 'marker', snap: 'center' }, { id: 'zone', snap: 'vertex' }, { id: 'measure', snap: 'vertex' }, { id: 'erase', snap: 'center' },
];
export const TOOL_GROUPS = ['Cấu trúc', 'Cửa & cửa sổ', 'Tầng & cầu thang', 'Mái', 'Vật liệu', 'Chỉnh sửa'];
const HISTORY_LIMIT = 100;
export const toolSnapMode = id => [...TOOLS, ...AUX_TOOLS].find(t => t.id === id)?.snap || 'center';
// Công cụ chỉ xem cũng dùng được (không thay đổi thiết kế).
const VIEW_TOOLS = ['select', 'measure'];
const emptyDesign = () => normalizeDesign({ schema: 2, objects: [] });
export const WALL_DISPLAY = [
  { id: 'full', label: 'Đầy đủ' }, { id: 'cutaway', label: 'Cắt góc' }, { id: 'down', label: 'Hạ thấp' }, { id: 'hide', label: 'Ẩn tường' },
];
export const wallsOf = (design, floor = null) => (design?.objects || []).filter(o => o.type === 'wall' && (floor == null || o.floor === floor));
const withWalls = (design, walls) => ({ ...design, objects: [...design.objects.filter(o => o.type !== 'wall'), ...walls] });
const wallMsg = code => WALL_ERRORS[code] || code;
const clampNum = (v, [a, b]) => Math.min(b, Math.max(a, v));

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = Error(data.error || `API ${res.status}`); err.code = data.code; err.status = res.status; throw err; }
  return data;
}

const initial = {
  isBuildMode: false,
  isOpening: false,
  plot: null, // lô đang xây (bản công khai từ server)
  canEdit: false, // do server trả về (GET /build-permission) — chỉ dùng để bật / tắt giao diện
  ownerName: null,
  activeTool: 'select',
  selectedObjectId: null,
  hoveredObjectId: null,
  activeFloor: 0,
  gridSize: 1,
  snapEnabled: true,
  showGrid: true,
  showRoof: true, // Build Mode: hiện / ẩn mái (chỉ ẩn hiển thị, không xoá mái)
  showWalls: false, // mặc định ẩn nhà dựng sẵn của lô khi vào Build Mode
  setback: DEFAULT_SETBACK, // khoảng lùi xây dựng (m), từ world_settings.build_setback
  buildPreview: null, // { local, world, valid, reason, label } — chỉ để hiển thị, không bao giờ lưu
  measure: null, // { a, b, length } — thước đo tạm thời, không lưu
  wallDraft: null, // { start: [x, z] } — điểm đầu của đoạn tường đang vẽ (Esc huỷ)
  floorDraft: null, // { start: [x, z] } — góc đầu của tấm sàn đang vẽ
  floorDefaults: { ...FLOOR_DEFAULTS },
  // Mẫu cửa / cửa sổ sẽ đặt (đã chỉnh kích thước / hướng mở / màu).
  openingDefaults: { door: openingFromCatalog('door-single', 'x'), window: openingFromCatalog('window-double', 'x') },
  showRooms: true, // ranh giới + nhãn phòng
  ghostBelow: true, // tầng dưới tầng đang chọn vẽ mờ
  showAbove: false, // hiện (mờ) các tầng phía trên tầng đang chọn
  stairDraft: null, // { start: [x, z] } — chân cầu thang đang đặt
  stairDefaults: { ...STAIR_DEFAULTS },
  roofDefaults: { ...ROOF_DEFAULTS }, // thông số cho mái mới (khi tầng đang chọn chưa có mái)
  wallDefaults: { ...WALL_DEFAULTS }, // thuộc tính cho tường mới
  wallDisplay: 'full', // chế độ hiển thị — không đổi dữ liệu tường
  design: emptyDesign(),
  version: 0,
  isDirty: false,
  isSaving: false,
  undoStack: [],
  redoStack: [],
  message: null,
  confirmExit: false,
  pendingConfirm: null,
};

const inferCommand = (before, after) => {
  const a = before.objects || [], b = after.objects || [];
  const added = b.find(o => !a.some(x => x.id === o.id)), removed = a.find(o => !b.some(x => x.id === o.id));
  if (added) return ({ wall: 'CREATE_WALL', floor: 'CREATE_FLOOR', stair: 'CREATE_STAIRS', roof: 'CREATE_ROOF' }[added.type] || 'CREATE_OBJECT');
  if (removed) return removed.type === 'wall' ? 'DELETE_WALL' : 'DELETE_OBJECT';
  const openings = xs => xs.filter(o => o.type === 'wall').flatMap(w => w.openings || []);
  const ao = openings(a), bo = openings(b);
  if (bo.length > ao.length) return 'ADD_OPENING';
  if (bo.length === ao.length && JSON.stringify(ao) !== JSON.stringify(bo)) return 'MOVE_OPENING';
  return 'UPDATE_WALL';
};

export const useBuildingStore = create((set, get) => ({
  ...initial,

  // Mở Build Mode cho một lô: hỏi server quyền (chủ lô mới được sửa, người khác chỉ xem) và tải thiết kế hiện có.
  async open(plot, token) {
    const cur = get();
    if (cur.isOpening) return { ok: false };
    if (cur.isBuildMode) {
      if (cur.plot?.id === plot.id) return { ok: true, canEdit: cur.canEdit };
      if (cur.isDirty) {
        set({ pendingConfirm: { kind: 'switch', plot, token, title: 'Chuyển sang bản thiết kế khác?', text: 'Thiết kế hiện tại chưa lưu. Nếu tiếp tục, các thay đổi chưa lưu sẽ bị bỏ.' } });
        return { ok: false, pending: true };
      }
      cur.exit(true);
    }
    set({ isOpening: true });
    try {
      const [perm, house] = await Promise.all([
        api(`/land-plots/${plot.id}/build-permission`, { token }),
        api(`/land-plots/${plot.id}/house-design`),
      ]);
      if (!perm.can_view) { set({ isOpening: false }); return { ok: false, reason: perm.reason }; }
      set({
        ...initial, isBuildMode: true, plot, canEdit: !!perm.can_edit, ownerName: house.owner_name || null,
        design: normalizeDesign(house.design || emptyDesign()), version: house.version || 0,
        activeTool: 'select',
        message: perm.can_edit ? null : perm.reason || 'Chế độ xem — bạn không thể chỉnh sửa lô đất này',
      });
      return { ok: true, canEdit: !!perm.can_edit };
    } catch (e) {
      set({ isOpening: false });
      return { ok: false, reason: e.message };
    }
  },
  // Thoát: có thay đổi chưa lưu thì hỏi lại (force = bỏ thay đổi).
  exit(force = false) {
    if (!force && get().isDirty) { set({ confirmExit: true }); return false; }
    set({ ...initial });
    return true;
  },
  cancelExit: () => set({ confirmExit: false }),

  setTool(id) {
    const t = [...TOOLS, ...AUX_TOOLS].find(x => x.id === id);
    if (!t || (!get().canEdit && !VIEW_TOOLS.includes(id))) return;
    set({ activeTool: id, buildPreview: null, measure: null, wallDraft: null, floorDraft: null, stairDraft: null, selectedObjectId: ['select', 'paint', 'delete'].includes(id) ? get().selectedObjectId : null });
  },
  setFloor: f => set({ activeFloor: Math.max(0, Math.min(get().design.levels.length - 1, f)), stairDraft: null, selectedObjectId: null, buildPreview: null, wallDraft: null, floorDraft: null }),
  setGridSize: g => { if (GRID_SIZES.includes(g)) set({ gridSize: g }); },
  toggle: key => { if (['snapEnabled', 'showGrid', 'showRoof', 'showWalls', 'showRooms', 'ghostBelow', 'showAbove'].includes(key)) set({ [key]: !get()[key] }); },
  // Chỉ cập nhật khi ô / kết quả đổi → không render lại giao diện mỗi lần di chuột trong cùng một ô.
  setPreview(p) {
    const c = get().buildPreview;
    const key = q => (q ? `${q.local.x},${q.local.z},${q.valid},${q.label || ''},${q.reason || ''}` : '');
    if (key(c) !== key(p)) set({ buildPreview: p });
  },
  setSetback: m => { if (Number.isFinite(m) && m >= 0 && m <= 5) set({ setback: m }); },
  setMeasure: m => set({ measure: m }),
  setHovered: id => { if (get().hoveredObjectId !== id) set({ hoveredObjectId: id }); },
  select: id => set({ selectedObjectId: id }),
  setMessage: m => set({ message: m }),

  // Mọi thay đổi thiết kế đi qua đây → ghi lịch sử undo, đánh dấu chưa lưu.
  commit(nextDesign, type = null) {
    const { design, undoStack, version } = get();
    nextDesign = normalizeDesign(nextDesign);
    const command = { type: type || inferCommand(design, nextDesign), before: design, after: nextDesign, version };
    set({ design: nextDesign, undoStack: [...undoStack, command].slice(-HISTORY_LIMIT), redoStack: [], isDirty: true });
  },
  undo() {
    const { undoStack, redoStack, version } = get();
    if (!undoStack.length) return;
    const cmd = undoStack[undoStack.length - 1];
    if (cmd.version !== version) { set({ message: 'Không thể hoàn tác vượt qua phiên bản thiết kế đã lưu' }); return; }
    set({ design: cmd.before, undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, cmd], isDirty: true, selectedObjectId: null, wallDraft: null });
  },
  redo() {
    const { undoStack, redoStack, version } = get();
    if (!redoStack.length) return;
    const cmd = redoStack[redoStack.length - 1];
    if (cmd.version !== version) { set({ message: 'Không thể làm lại lệnh của phiên bản thiết kế khác' }); return; }
    set({ design: cmd.after, redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, cmd], isDirty: true, selectedObjectId: null, wallDraft: null });
  },

  // Đặt một cấu trúc tại vị trí local (đã khớp lưới). Trả { ok, reason }.
  place(type, local) {
    const s = get();
    const v = validatePlacement({ plot: s.plot, design: s.design, canEdit: s.canEdit, type, floor: s.activeFloor, local, setback: s.setback });
    if (!v.ok) { set({ message: v.reason }); return v; }
    const obj = { id: newObjectId(type), type, floor: s.activeFloor, level_id: levelId(s.activeFloor), position: { x: local.x, y: 0, z: local.z }, rotation_y: 0 };
    s.commit({ ...s.design, objects: [...s.design.objects, obj] });
    set({ selectedObjectId: obj.id, message: null });
    return { ok: true, id: obj.id };
  },
  // Vùng phòng hình chữ nhật từ hai góc a, b (toạ độ local, thường đã khớp giao điểm lưới).
  placeZone(a, b) {
    const s = get();
    const local = { x: +((a.x + b.x) / 2).toFixed(4), z: +((a.z + b.z) / 2).toFixed(4) };
    const size = { w: +Math.abs(b.x - a.x).toFixed(4), d: +Math.abs(b.z - a.z).toFixed(4) };
    const v = validatePlacement({ plot: s.plot, design: s.design, canEdit: s.canEdit, type: 'zone', floor: s.activeFloor, local, size, setback: s.setback });
    if (!v.ok) { set({ message: v.reason }); return v; }
    const obj = { id: newObjectId('zone'), type: 'zone', floor: s.activeFloor, level_id: levelId(s.activeFloor), position: { x: local.x, y: 0, z: local.z }, size, rotation_y: 0 };
    s.commit({ ...s.design, objects: [...s.design.objects, obj] });
    set({ selectedObjectId: obj.id, message: `Đã thêm vùng ${size.w} × ${size.d} m` });
    return { ok: true, id: obj.id };
  },
  // ---------- Tường ----------
  geoOpts() { return { poly: localBoundary(get().plot), setback: get().setback }; },
  setWallDisplay: m => { if (WALL_DISPLAY.some(d => d.id === m)) set({ wallDisplay: m }); },
  cycleWallDisplay() { const i = WALL_DISPLAY.findIndex(d => d.id === get().wallDisplay); set({ wallDisplay: WALL_DISPLAY[(i + 1) % WALL_DISPLAY.length].id }); },
  cancelWall: () => set({ wallDraft: null, floorDraft: null, stairDraft: null }),
  // Click 1: chọn điểm đầu.
  startWall(p) { if (get().canEdit) set({ wallDraft: { start: [p.x, p.z] }, message: 'Chọn điểm cuối (Esc để huỷ)' }); },
  // Click 2: tạo đoạn tường; thành công → tiếp tục vẽ nối từ điểm cuối.
  addWallTo(p) {
    const s = get();
    if (!s.canEdit || !s.wallDraft) return { ok: false };
    const d = s.wallDefaults;
    const nw = { id: newObjectId('wall'), type: 'wall', floor: s.activeFloor, level_id: levelId(s.activeFloor), start: s.wallDraft.start, end: [p.x, p.z], height: d.height, thickness: d.thickness, material_id: d.material_id, openings: [] };
    const r = addWall(wallsOf(s.design), nw, () => newObjectId('wall'), s.geoOpts());
    if (r.error) { set({ message: wallMsg(r.error) }); return { ok: false, code: r.error }; }
    const msg = s.commitWalls(withWalls(s.design, r.walls), 'CREATE_WALL');
    set({ wallDraft: { start: [p.x, p.z] }, selectedObjectId: null, message: msg || (r.split ? `Đã nối tường (chia ${r.split} đoạn tại mối nối)` : 'Đã tạo tường — tiếp tục vẽ hoặc Esc để dừng') });
    return { ok: true, ids: r.added };
  },
  moveWallEnd(id, which, p) {
    const s = get();
    if (!s.canEdit) return { ok: false };
    const r = moveWallEndpoint(wallsOf(s.design), id, which, [p.x, p.z], s.geoOpts());
    if (r.error) { set({ message: wallMsg(r.error) }); return { ok: false, code: r.error }; }
    set({ message: s.commitWalls(withWalls(s.design, r.walls)) });
    return { ok: true };
  },
  // Ghi thay đổi tường + nhận diện lại phòng (giữ id / thuộc tính các phòng không bị ảnh hưởng). Trả thông báo sự kiện phòng.
  commitWalls(nextDesign, type = 'UPDATE_WALL') {
    const r = syncRooms(nextDesign, () => newObjectId('room'));
    get().commit(r.design, type);
    return roomEventsMessage(r.events);
  },
  // ---------- Sàn ----------
  floorInside(poly) { return footprintInside(poly, localBoundary(get().plot), 0); },
  startFloor(p) { if (get().canEdit) set({ floorDraft: { start: [p.x, p.z] }, message: 'Chọn góc đối diện của tấm sàn (Esc huỷ)' }); },
  placeFloor(p) {
    const s = get();
    if (!s.canEdit || !s.floorDraft) return { ok: false };
    const slab = { id: newObjectId('floor'), type: 'floor', floor: s.activeFloor, level_id: levelId(s.activeFloor), shape: 'rect', polygon: rectPolygon(s.floorDraft.start, [p.x, p.z]), ...s.floorDefaults };
    const err = validateFloor(slab, s.design.objects.filter(o => o.type === 'floor'), { insideFn: q => s.floorInside(q) });
    if (err) { set({ message: FLOOR_ERRORS[err] }); return { ok: false, code: err }; }
    s.commit({ ...s.design, objects: [...s.design.objects, slab] }, 'CREATE_FLOOR');
    set({ floorDraft: null, selectedObjectId: slab.id, message: 'Đã thêm tấm sàn' });
    return { ok: true, id: slab.id };
  },
  editFloor(id, patch) {
    const s = get(), p = { ...patch };
    if ('thickness' in p) p.thickness = clampNum(+p.thickness.toFixed(2), FLOOR_LIMITS.thickness);
    if (!id) { set({ floorDefaults: { ...s.floorDefaults, ...p } }); return { ok: true }; }
    const cur = s.design.objects.find(o => o.id === id && o.type === 'floor');
    if (!s.canEdit || !cur) return { ok: false };
    const next = { ...cur, ...p };
    const err = validateFloor(next, s.design.objects.filter(o => o.type === 'floor'), { insideFn: q => s.floorInside(q) });
    if (err) { set({ message: FLOOR_ERRORS[err] }); return { ok: false, code: err }; }
    s.commit({ ...s.design, objects: s.design.objects.map(o => (o.id === id ? next : o)) }, p.material_id ? 'CHANGE_MATERIAL' : 'UPDATE_FLOOR');
    return { ok: true };
  },
  // ---------- Cửa & cửa sổ (gắn vào Wall ID) ----------
  // Tìm lỗ mở theo id → { wall, opening }.
  findOpening(id) {
    for (const w of wallsOf(get().design)) { const o = (w.openings || []).find(x => x.id === id); if (o) return { wall: w, opening: o }; }
    return null;
  },
  setOpeningCatalog(type, catalogId) {
    const c = catalogItem(catalogId);
    if (!c) return;
    set({ openingDefaults: { ...get().openingDefaults, [type]: { ...openingFromCatalog(catalogId, 'x'), swing: get().openingDefaults[type].swing, swing_dir: get().openingDefaults[type].swing_dir } } });
  },
  // Đặt lỗ mở vào tường wallId tại offset (m từ đầu start). Kiểm tra trước khi ghi.
  placeOpening(wallId, offset, type = get().activeTool) {
    const s = get(), w = wallsOf(s.design).find(x => x.id === wallId);
    if (!s.canEdit) return { ok: false };
    if (!w) { set({ message: OPENING_ERRORS.NO_WALL }); return { ok: false, code: 'NO_WALL' }; }
    const op = { ...s.openingDefaults[type], id: newObjectId(type), offset: +offset.toFixed(4) };
    const err = validateOpening(w, op, wallsOf(s.design, w.floor));
    if (err) { set({ message: OPENING_ERRORS[err] }); return { ok: false, code: err }; }
    s.commit(withWalls(s.design, wallsOf(s.design).map(x => (x.id === wallId ? { ...x, openings: [...(x.openings || []), op] } : x))), 'ADD_OPENING');
    set({ selectedObjectId: op.id, message: `Đã gắn ${catalogItem(op.catalog_id).name.toLowerCase()} vào tường` });
    return { ok: true, id: op.id };
  },
  // Sửa lỗ mở đã đặt (kích thước, độ cao mép dưới, hướng mở, màu, vị trí) hoặc thuộc tính mẫu khi chưa chọn lỗ nào.
  editOpening(id, patch, type = null) {
    const s = get(), p = { ...patch };
    for (const k of ['width', 'height', 'sill', 'offset']) if (k in p) p[k] = +(+p[k]).toFixed(2);
    if (!id) {
      const t = type || s.activeTool, cur = s.openingDefaults[t];
      if (!cur) return { ok: false };
      const lim = OPENING_LIMITS[t], next = { ...cur, ...p };
      for (const k of ['width', 'height', 'sill']) if (lim[k] && k in p) next[k] = clampNum(next[k], lim[k]);
      set({ openingDefaults: { ...s.openingDefaults, [t]: next } });
      return { ok: true };
    }
    const f = s.findOpening(id);
    if (!s.canEdit || !f) return { ok: false };
    const next = { ...f.opening, ...p };
    const err = validateOpening(f.wall, next, wallsOf(s.design, f.wall.floor));
    if (err) { set({ message: OPENING_ERRORS[err] }); return { ok: false, code: err }; }
    s.commit(withWalls(s.design, wallsOf(s.design).map(x => (x.id === f.wall.id ? { ...x, openings: x.openings.map(o => (o.id === id ? next : o)) } : x))), p.color ? 'CHANGE_MATERIAL' : 'MOVE_OPENING');
    return { ok: true };
  },
  // ---------- Tầng ----------
  // Lý do không thêm được tầng mới (null = thêm được).
  addLevelBlock() {
    const d = get().design;
    if (d.levels.length >= MAX_LEVELS) return LEVEL_ERRORS.TOO_MANY;
    if (!supportArea({ ...d, levels: [...d.levels, {}] }, d.levels.length).length) return LEVEL_ERRORS.NO_SUPPORT + ' (hãy xây ít nhất một phòng khép kín hoặc tấm sàn)';
    return null;
  },
  addLevel() {
    const s = get(), why = s.addLevelBlock();
    if (!s.canEdit) return { ok: false };
    if (why) { set({ message: why }); return { ok: false, reason: why }; }
    const n = s.design.levels.length;
    s.commit(normalizeDesign({ ...s.design, levels: [...s.design.levels, { id: levelId(n), index: n, height: DEFAULT_LEVEL_HEIGHT }] }));
    set({ activeFloor: n, message: `Đã thêm tầng ${n + 1} — vẽ tường trên phần sàn của tầng dưới (ban công nhô tối đa 1.5 m)` });
    return { ok: true };
  },
  // Chỉ gỡ được tầng trên cùng khi tầng đó trống (không có đối tượng, không có cầu thang dẫn lên).
  removeLevel() {
    const s = get(), n = s.design.levels.length;
    if (!s.canEdit || n <= 1) return { ok: false };
    const top = n - 1;
    if (s.design.objects.some(o => o.floor === top || (o.type === 'stair' && o.floor === top - 1))) { set({ message: 'Tầng trên còn tường / sàn / cầu thang / mái — hãy dọn trước khi gỡ tầng' }); return { ok: false }; }
    s.commit(normalizeDesign({ ...s.design, levels: s.design.levels.slice(0, top) }));
    set({ activeFloor: Math.min(s.activeFloor, top - 1) });
    return { ok: true };
  },
  setLevelHeight(index, h) {
    const s = get();
    if (!s.canEdit || !s.design.levels[index]) return { ok: false };
    const height = clampNum(+(+h).toFixed(2), LEVEL_LIMITS.height);
    s.commit(normalizeDesign({ ...s.design, levels: s.design.levels.map((l, i) => (i === index ? { ...l, height } : l)) }));
    return { ok: true };
  },
  // Lỗi cấu trúc tầng hiện tại (tường / sàn trôi nổi, ban công quá sâu…) — để cảnh báo trước khi lưu.
  levelIssues() { return validateLevels(get().design).map(e => ({ ...e, text: LEVEL_ERRORS[e.code] })); },
  // ---------- Cầu thang ----------
  stairOpts() { return { poly: localBoundary(get().plot), setback: get().setback }; },
  startStair(p) { if (get().canEdit) set({ stairDraft: { start: [p.x, p.z] }, message: 'Rê chuột để chọn hướng đi lên, click để đặt (Esc huỷ)' }); },
  placeStair(dir) {
    const s = get();
    if (!s.canEdit || !s.stairDraft) return { ok: false };
    const st = { id: newObjectId('stair'), type: 'stair', floor: s.activeFloor, level_id: levelId(s.activeFloor), start: s.stairDraft.start, dir, ...s.stairDefaults };
    const err = validateStair(s.design, st, s.stairOpts());
    if (err) { set({ message: STAIR_ERRORS[err] }); return { ok: false, code: err }; }
    s.commit({ ...s.design, objects: [...s.design.objects, st] }, 'CREATE_STAIRS');
    set({ stairDraft: null, selectedObjectId: st.id, message: `Đã đặt cầu thang nối tầng ${s.activeFloor + 1} ↔ tầng ${s.activeFloor + 2}` });
    return { ok: true, id: st.id };
  },
  editStair(id, patch) {
    const s = get(), p = { ...patch };
    if ('width' in p) p.width = clampNum(+(+p.width).toFixed(2), STAIR_LIMITS.width);
    if (!id) { set({ stairDefaults: { ...s.stairDefaults, ...p } }); return { ok: true }; }
    const cur = s.design.objects.find(o => o.id === id && o.type === 'stair');
    if (!s.canEdit || !cur) return { ok: false };
    const next = { ...cur, ...p }, err = validateStair(s.design, next, s.stairOpts());
    if (err) { set({ message: STAIR_ERRORS[err] }); return { ok: false, code: err }; }
    s.commit({ ...s.design, objects: s.design.objects.map(o => (o.id === id ? next : o)) });
    return { ok: true };
  },
  // ---------- Mái ----------
  roofOf(floor = get().activeFloor) { return get().design.objects.find(o => o.type === 'roof' && o.floor === floor) || null; },
  // Cảnh báo (không chặn) cho mái: footprint phức tạp bị chia khối, cạnh xiên chỉ hỗ trợ mái bằng, chưa có phòng.
  roofWarnings(roof) {
    if (!roof) return [];
    const r = roofParts(get().design, roof);
    return [...r.warnings.map(c => ROOF_WARNINGS[c]), ...(r.parts.length ? [] : [ROOF_ERRORS.NO_FOOTPRINT + ' — mái tạm thời không hiển thị'])];
  },
  // Đặt mái cho tầng đang chọn (mỗi tầng một mái). Mái dựng tự động từ các phòng của tầng.
  placeRoof(floor = get().activeFloor) {
    const s = get();
    if (!s.canEdit) return { ok: false };
    const cur = s.roofOf(floor);
    if (cur) { set({ selectedObjectId: cur.id, message: 'Tầng này đã có mái — chỉnh trong bảng Mái' }); return { ok: false, code: 'DUPLICATE', id: cur.id }; }
    const roof = { id: newObjectId('roof'), type: 'roof', floor, level_id: levelId(floor), ...s.roofDefaults };
    const err = validateRoof(s.design, roof, { poly: localBoundary(s.plot), requireFootprint: true });
    if (err) { set({ message: ROOF_ERRORS[err] }); return { ok: false, code: err }; }
    s.commit({ ...s.design, objects: [...s.design.objects, roof] }, 'CREATE_ROOF');
    const warn = s.roofWarnings(roof);
    set({ selectedObjectId: roof.id, showRoof: true, message: ['Đã thêm mái cho tầng ' + (floor + 1), ...warn].join(' · ') });
    return { ok: true, id: roof.id };
  },
  // Đổi loại / độ dốc / phần nhô / hướng nóc / vật liệu / màu — chỉ đổi tham số, không đụng tường / phòng.
  editRoof(id, patch) {
    const s = get(), p = {};
    if (['flat', 'gable', 'hip'].includes(patch.kind)) p.kind = patch.kind;
    if (['auto', 'x', 'z'].includes(patch.ridge)) p.ridge = patch.ridge;
    if ('pitch' in patch && Number.isFinite(+patch.pitch)) p.pitch = clampNum(Math.round(+patch.pitch), ROOF_LIMITS.pitch);
    if ('overhang' in patch && Number.isFinite(+patch.overhang)) p.overhang = clampNum(+(+patch.overhang).toFixed(2), ROOF_LIMITS.overhang);
    if (ROOF_MATERIALS.some(m => m.id === patch.material_id)) { p.material_id = patch.material_id; p.color = null; }
    if ('color' in patch) p.color = patch.color && /^#[0-9a-f]{6}$/i.test(patch.color) ? patch.color.toLowerCase() : null;
    if (!id) { set({ roofDefaults: { ...s.roofDefaults, ...p } }); return { ok: true }; }
    const cur = s.design.objects.find(o => o.id === id && o.type === 'roof');
    if (!s.canEdit || !cur) return { ok: false };
    const next = { ...cur, ...p };
    if (next.color == null) delete next.color;
    const err = validateRoof(s.design, next, { poly: localBoundary(s.plot) });
    if (err) { set({ message: ROOF_ERRORS[err] }); return { ok: false, code: err }; }
    s.commit({ ...s.design, objects: s.design.objects.map(o => (o.id === id ? next : o)) }, p.material_id || p.color ? 'CHANGE_MATERIAL' : 'UPDATE_ROOF');
    return { ok: true };
  },
  // ---------- Phòng (tên, loại, vật liệu sàn) ----------
  editRoom(id, patch) {
    const s = get(), cur = s.design.objects.find(o => o.id === id && o.type === 'room');
    if (!s.canEdit || !cur) return { ok: false };
    const p = {};
    if (typeof patch.name === 'string') p.name = patch.name.slice(0, 40);
    if (ROOM_TYPES.some(t => t.id === patch.room_type)) p.room_type = patch.room_type;
    if (FLOOR_MATERIALS.some(m => m.id === patch.floor_material_id)) p.floor_material_id = patch.floor_material_id;
    s.commit({ ...s.design, objects: s.design.objects.map(o => (o.id === id ? { ...o, ...p } : o)) });
    return { ok: true };
  },
  // Đổi chiều cao / độ dày / vật liệu của tường đang chọn, hoặc của tường mới (nếu không chọn tường nào).
  editWall(id, patch) {
    const s = get();
    const p = { ...patch };
    if ('height' in p) p.height = clampNum(+p.height.toFixed(2), WALL_LIMITS.height);
    if ('thickness' in p) p.thickness = clampNum(+p.thickness.toFixed(2), WALL_LIMITS.thickness);
    if (!id) { set({ wallDefaults: { ...s.wallDefaults, ...p } }); return { ok: true }; }
    if (!s.canEdit) return { ok: false };
    const r = updateWall(wallsOf(s.design), id, p, s.geoOpts());
    if (r.error) { set({ message: wallMsg(r.error) }); return { ok: false, code: r.error }; }
    s.commit(withWalls(s.design, r.walls), p.material_id || p.color ? 'CHANGE_MATERIAL' : 'UPDATE_WALL');
    return { ok: true };
  },
  rotateSelected() {
    const s = get(), id = s.selectedObjectId;
    if (!id || !s.canEdit) return false;
    const op = s.findOpening(id);
    if (op?.opening.type === 'door') return s.editOpening(id, { swing: op.opening.swing === 'left' ? 'right' : 'left' }).ok;
    const obj = s.design.objects.find(o => o.id === id);
    if (!obj) return false;
    if (obj.type === 'stair') return s.editStair(id, { dir: ((obj.dir || 0) + 1) % 4 }).ok;
    if (obj.type === 'marker' || obj.type === 'zone') {
      s.commit({ ...s.design, objects: s.design.objects.map(o => o.id === id ? { ...o, rotation_y: (o.rotation_y || 0) + Math.PI / 2 } : o) }, 'UPDATE_OBJECT');
      return true;
    }
    set({ message: 'Đối tượng này không hỗ trợ xoay bằng phím R' });
    return false;
  },
  requestRemove(id) {
    const s = get(), obj = s.design.objects.find(o => o.id === id), opening = !obj && s.findOpening(id)?.opening;
    if (!s.canEdit || (!obj && !opening)) return false;
    let text = null;
    if (obj?.type === 'wall' && obj.openings?.length) text = `Tường này chứa ${obj.openings.length} cửa / cửa sổ. Xoá tường sẽ xoá cả các lỗ mở.`;
    else if (obj?.type === 'stair') text = 'Xoá cầu thang có thể làm tầng trên không còn lối đi.';
    else if (obj?.type === 'roof') text = 'Bạn có chắc muốn xoá mái của tầng này?';
    if (text) { set({ pendingConfirm: { kind: 'remove', id, title: 'Xác nhận xoá', text } }); return false; }
    return s.remove(id);
  },
  requestRemoveLevel() {
    if (!get().canEdit || get().design.levels.length <= 1) return false;
    set({ pendingConfirm: { kind: 'level', title: 'Xoá tầng trên cùng?', text: 'Chỉ tầng đã dọn trống mới có thể xoá. Thao tác này có thể hoàn tác trong phiên hiện tại.' } });
    return true;
  },
  async confirmPending() {
    const p = get().pendingConfirm;
    set({ pendingConfirm: null });
    if (p?.kind === 'remove') return get().remove(p.id);
    if (p?.kind === 'level') return get().removeLevel().ok;
    if (p?.kind === 'switch') { get().exit(true); return (await get().open(p.plot, p.token)).ok; }
    return false;
  },
  cancelPending: () => set({ pendingConfirm: null }),
  remove(id) {
    const s = get();
    const obj = s.design.objects.find(o => o.id === id);
    // Lỗ mở (cửa / cửa sổ) nằm trong tường.
    const fo = !obj && s.findOpening(id);
    if (fo) {
      if (!s.canEdit) return false;
      s.commit(withWalls(s.design, wallsOf(s.design).map(x => (x.id === fo.wall.id ? { ...x, openings: x.openings.filter(o => o.id !== id) } : x))));
      set({ selectedObjectId: null, message: 'Đã gỡ ' + (fo.opening.type === 'door' ? 'cửa' : 'cửa sổ') });
      return true;
    }
    if (!s.canEdit || !obj) return false;
    // Phòng sinh ra từ tường — muốn bỏ phòng thì xoá / sửa tường.
    if (obj.type === 'room') { set({ message: 'Phòng được tạo từ tường — hãy xoá hoặc sửa tường để bỏ phòng' }); return false; }
    const next = { ...s.design, objects: s.design.objects.filter(o => o.id !== id) };
    // Không mất dữ liệu âm thầm: báo rõ số cửa bị gỡ cùng tường (Ctrl+Z để hoàn tác).
    const lost = obj.type === 'wall' ? (obj.openings || []).length : 0;
    if (obj.type === 'wall') set({ message: [s.commitWalls(next, 'DELETE_WALL'), lost ? `⚠ Đã xoá tường kèm ${lost} cửa / cửa sổ — Ctrl+Z để hoàn tác` : 'Đã xoá tường'].filter(Boolean).join(' · ') });
    else { s.commit(next); if (obj.type === 'roof') set({ message: 'Đã xoá mái — Ctrl+Z để hoàn tác' }); }
    if (s.selectedObjectId === id) set({ selectedObjectId: null });
    return true;
  },

  // Lưu lên server (server kiểm tra quyền chủ lô + tính hợp lệ của từng cấu trúc + phiên bản).
  async save(token) {
    const s = get();
    if (!s.canEdit || s.isSaving || !s.plot) return { ok: false };
    set({ isSaving: true, message: 'Đang lưu…' });
    try {
      const r = await api(`/land-plots/${s.plot.id}/house-design`, { method: 'PUT', token, body: { design: s.design, version: s.version } });
      set({ isSaving: false, isDirty: false, version: r.version, design: normalizeDesign(r.design), undoStack: [], redoStack: [], message: 'Đã lưu thiết kế ✓' });
      // Báo cho thế giới (Explore Mode) cập nhật tường + va chạm theo bản đã lưu.
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lw-design-saved', { detail: { plot_id: s.plot.id, version: r.version, design: r.design } }));
      return { ok: true };
    } catch (e) {
      set({ isSaving: false, message: e.message });
      return { ok: false, code: e.code };
    }
  },
}));

export const buildingStore = useBuildingStore;
