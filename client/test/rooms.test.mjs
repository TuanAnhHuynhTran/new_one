// Phase 02.4 — kiểm thử nhận diện phòng (đồ thị phẳng), đa giác, giữ Room ID khi sửa tường, sàn.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalPolygon, convexOverlap, detectRooms, graphFaces, overlapArea, polygonCentroid, reconcileRooms, rectPolygon, roomContains,
  sameRegion, signedArea, simplifyPolygon, syncRooms, validateFloor,
} from '../../shared/roomGeometry.mjs';
import { WALL_DEFAULTS, addWall } from '../../shared/wallGeometry.mjs';
import { useBuildingStore } from '../src/game/building/buildingStore.js';

let n = 0;
const nid = () => `wall_r${(++n).toString().padStart(4, '0')}`;
const rid = () => `room_r${(++n).toString().padStart(4, '0')}`;
const W = (start, end, floor = 0) => ({ id: nid(), type: 'wall', floor, start, end, ...WALL_DEFAULTS, openings: [] });
const loop = (pts, floor = 0) => pts.map((p, i) => W(p, pts[(i + 1) % pts.length], floor));
// Thêm tường qua addWall (giống editor: tự chia đoạn tại T / chữ thập).
const build = (segs, init = []) => segs.reduce((acc, [a, b]) => { const r = addWall(acc, W(a, b), nid, {}); assert.ok(!r.error, r.error); return r.walls; }, init);
const areas = rooms => rooms.map(r => r.area).sort((a, b) => a - b);

describe('Nhận diện phòng (đồ thị phẳng + duyệt mặt)', () => {
  test('4 tường khép kín → đúng 1 phòng, đúng diện tích, đa giác CCW', () => {
    const rooms = detectRooms(loop([[0, 0], [4, 0], [4, 3], [0, 3]]));
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].area, 12);
    assert.ok(signedArea(rooms[0].polygon) > 0);
    assert.deepEqual(rooms[0].polygon, [[0, 0], [4, 0], [4, 3], [0, 3]]);
  });
  test('tường chưa khép kín / chỉ có râu / hai tường song song → không có phòng giả', () => {
    assert.equal(detectRooms([W([0, 0], [4, 0]), W([4, 0], [4, 3]), W([4, 3], [0, 3])]).length, 0);
    assert.equal(detectRooms([W([0, 0], [4, 0]), W([0, 2], [4, 2])]).length, 0);
    assert.equal(detectRooms([W([0, 0], [4, 0]), W([2, 0], [2, 3])]).length, 0, 'chữ T không khép kín');
    assert.equal(detectRooms(loop([[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]])).length, 0, 'nhỏ hơn 0.5 m² bị bỏ');
  });
  test('tường ngăn chia phòng thành hai; chữ thập thành bốn; râu bên trong không tạo phòng', () => {
    const room = loop([[0, 0], [6, 0], [6, 4], [0, 4]]);
    assert.deepEqual(areas(detectRooms([...room, W([3, 0], [3, 4])])), [12, 12], 'T chưa chia vẫn nhận đúng');
    assert.deepEqual(areas(detectRooms(build([[[3, 0], [3, 4]]], room))), [12, 12]);
    assert.deepEqual(areas(detectRooms(build([[[3, 0], [3, 4]], [[0, 2], [6, 2]]], room))), [6, 6, 6, 6]);
    assert.deepEqual(areas(detectRooms([...room, W([3, 0], [3, 2])])), [24], 'tường cụt (râu) không chia phòng');
  });
  test('phòng chữ L (lõm) có đa giác 6 đỉnh, diện tích đúng — không phải bounding box', () => {
    const rooms = detectRooms(loop([[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]]));
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].area, 27, 'bounding box sẽ là 36');
    assert.equal(rooms[0].polygon.length, 6);
    assert.ok(!roomContains(rooms[0], 4.5, 4.5), 'điểm ở phần khuyết không thuộc phòng');
    assert.ok(roomContains(rooms[0], 1.5, 4.5));
  });
  test('hai phòng nối bằng tường cầu; phòng có đảo bên trong → lỗ', () => {
    const two = [...loop([[0, 0], [2, 0], [2, 2], [0, 2]]), ...loop([[5, 0], [7, 0], [7, 2], [5, 2]]), W([2, 1], [5, 1])];
    assert.deepEqual(areas(detectRooms(two)), [4, 4]);
    const island = detectRooms([...loop([[0, 0], [8, 0], [8, 8], [0, 8]]), ...loop([[3, 3], [5, 3], [5, 5], [3, 5]])]);
    assert.deepEqual(areas(island), [4, 60]);
    const big = island.find(r => r.area === 60);
    assert.equal(big.holes.length, 1);
    assert.ok(!roomContains(big, 4, 4) && roomContains(big, 1, 1));
  });
  test('tầng khác nhau tách biệt; điểm chia thẳng hàng được bỏ khỏi đa giác', () => {
    const f = graphFaces(loop([[0, 0], [2, 0], [4, 0], [4, 3], [0, 3]]));
    assert.equal(f.filter(x => x.area > 0).length, 1);
    assert.deepEqual(simplifyPolygon([[0, 0], [2, 0], [4, 0], [4, 3], [0, 3]]), [[0, 0], [4, 0], [4, 3], [0, 3]]);
    assert.deepEqual(canonicalPolygon([[4, 3], [0, 3], [0, 0], [4, 0]]), [[0, 0], [4, 0], [4, 3], [0, 3]]);
  });
});

describe('Đa giác', () => {
  test('diện tích / tâm / giao gần đúng / cùng vùng', () => {
    const sq = { polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], holes: [], area: 16 };
    assert.equal(signedArea(sq.polygon), 16);
    assert.deepEqual(polygonCentroid(sq.polygon), [2, 2]);
    const half = { polygon: [[2, 0], [6, 0], [6, 4], [2, 4]], holes: [], area: 16 };
    assert.ok(Math.abs(overlapArea(sq, half) - 8) < 0.01);
    assert.ok(sameRegion(sq, { ...sq, polygon: [[4, 4], [0, 4], [0, 0], [4, 0]] }));
    assert.ok(!sameRegion(sq, half));
  });
  test('tấm sàn: chồng (SAT), quá nhỏ, ngoài lô, giới hạn; chạm cạnh không tính chồng', () => {
    const a = { id: 'f1', floor: 0, polygon: rectPolygon([0, 0], [3, 3]), thickness: 0.1, material_id: 'wood' };
    assert.ok(convexOverlap(a.polygon, rectPolygon([2, 2], [5, 5])));
    assert.ok(!convexOverlap(a.polygon, rectPolygon([3, 0], [5, 3])));
    assert.equal(validateFloor({ ...a, id: 'f2', polygon: rectPolygon([1, 1], [4, 4]) }, [a]), 'OVERLAP');
    assert.equal(validateFloor({ ...a, id: 'f2', polygon: rectPolygon([1, 1], [4, 4]), floor: 1 }, [a]), null, 'tầng khác');
    assert.equal(validateFloor({ ...a, polygon: rectPolygon([0, 0], [0.3, 2]) }, []), 'TOO_SMALL');
    assert.equal(validateFloor({ ...a, thickness: 2 }, []), 'LIMITS');
    assert.equal(validateFloor(a, [], { insideFn: () => false }), 'OUTSIDE');
  });
});

describe('Sửa tường → tính lại phòng (giữ Room ID)', () => {
  const sync = objects => syncRooms({ schema: 1, objects }, rid);
  test('tường nhỏ thay đổi (dời 1 cạnh) → phòng giữ id, tên, loại, vật liệu', () => {
    const r1 = sync(loop([[0, 0], [4, 0], [4, 3], [0, 3]]));
    const room = r1.design.objects.find(o => o.type === 'room');
    const named = r1.design.objects.map(o => (o.type === 'room' ? { ...o, name: 'Phòng khách', room_type: 'living', floor_material_id: 'tile-blue' } : o));
    // Kéo cạnh phải ra 4 → 5.
    const walls = named.filter(o => o.type === 'wall').map(w => ({ ...w, start: w.start[0] === 4 ? [5, w.start[1]] : w.start, end: w.end[0] === 4 ? [5, w.end[1]] : w.end }));
    const r2 = syncRooms({ schema: 1, objects: [...walls, ...named.filter(o => o.type === 'room')] }, rid);
    const after = r2.design.objects.filter(o => o.type === 'room');
    assert.equal(after.length, 1);
    assert.deepEqual([after[0].id, after[0].name, after[0].room_type, after[0].floor_material_id, after[0].area], [room.id, 'Phòng khách', 'living', 'tile-blue', 15]);
    assert.deepEqual(r2.events, []);
  });
  test('chia đôi phòng → hai phòng (mảnh lớn giữ id, mảnh kia chép thuộc tính); xoá tường ngăn → hợp nhất', () => {
    let d = sync(loop([[0, 0], [6, 0], [6, 4], [0, 4]])).design;
    const orig = d.objects.find(o => o.type === 'room');
    d.objects = d.objects.map(o => (o.type === 'room' ? { ...o, name: 'Ngủ', room_type: 'bedroom' } : o));
    const walls = build([[[4, 0], [4, 4]]], d.objects.filter(o => o.type === 'wall'));
    const split = syncRooms({ ...d, objects: [...walls, ...d.objects.filter(o => o.type === 'room')] }, rid);
    const rooms = split.design.objects.filter(o => o.type === 'room').sort((a, b) => b.area - a.area);
    assert.deepEqual(areas(rooms), [8, 16]);
    assert.equal(rooms[0].id, orig.id, 'mảnh lớn giữ id');
    assert.deepEqual([rooms[1].name, rooms[1].room_type], ['Ngủ (2)', 'bedroom']);
    assert.deepEqual(split.events.map(e => e.type), ['split']);
    // Xoá tường ngăn (đoạn x = 4) → gộp lại một phòng, giữ id phòng lớn.
    const noDivider = split.design.objects.filter(o => !(o.type === 'wall' && o.start[0] === 4 && o.end[0] === 4));
    const merged = syncRooms({ ...split.design, objects: noDivider }, rid);
    const m = merged.design.objects.filter(o => o.type === 'room');
    assert.equal(m.length, 1);
    assert.equal(m[0].area, 24);
    assert.equal(m[0].id, orig.id);
    assert.deepEqual(merged.events.map(e => e.type), ['merge']);
  });
  test('mở tường (phòng không còn khép kín) → cảnh báo mất vùng sàn; phòng không liên quan giữ nguyên', () => {
    const d = sync([...loop([[0, 0], [3, 0], [3, 3], [0, 3]]), ...loop([[5, 0], [8, 0], [8, 3], [5, 3]])]).design;
    const [a, b] = d.objects.filter(o => o.type === 'room').sort((x, y) => x.polygon[0][0] - y.polygon[0][0]);
    const opened = d.objects.filter(o => !(o.type === 'wall' && o.start[0] === 3 && o.end[0] === 3));
    const r = syncRooms({ ...d, objects: opened }, rid);
    const left = r.design.objects.filter(o => o.type === 'room');
    assert.deepEqual(left.map(o => o.id), [b.id], 'phòng bên phải không bị ảnh hưởng');
    assert.deepEqual(r.events, [{ type: 'removed', id: a.id, name: a.name, area: 9, floor: 0 }]);
  });
  test('reconcile ghép phòng cũ ↔ mới theo diện tích giao', () => {
    const old = [{ id: 'room_a', polygon: rectPolygon([0, 0], [4, 4]), holes: [], area: 16, name: 'A', room_type: 'living', floor_material_id: 'wood' }];
    const r = reconcileRooms(old, [{ polygon: rectPolygon([0, 0], [4, 5]), holes: [], area: 20 }], rid);
    assert.equal(r.rooms[0].id, 'room_a');
  });
});

describe('Store: tường ↔ phòng, sàn, undo', () => {
  const S = useBuildingStore;
  const plot = { position_x: 0, position_z: 0, rotation_y: 0, width: 20, length: 20, zone: 'rural' };
  const reset = () => S.setState({ ...S.getInitialState(), isBuildMode: true, plot, canEdit: true, setback: 0.5, activeTool: 'wall' });
  const rooms = () => S.getState().design.objects.filter(o => o.type === 'room');
  test('vẽ 4 tường → tự nhận 1 phòng; vẽ tường ngăn → 2 phòng; xoá → 1; undo khôi phục', () => {
    reset();
    const st = () => S.getState();
    st().startWall({ x: -3, z: -2 });
    for (const p of [{ x: 3, z: -2 }, { x: 3, z: 2 }, { x: -3, z: 2 }]) st().addWallTo(p);
    assert.equal(rooms().length, 0, 'chưa khép kín');
    st().addWallTo({ x: -3, z: -2 });
    assert.equal(rooms().length, 1);
    assert.equal(rooms()[0].area, 24);
    assert.match(st().message, /phòng mới/);
    st().cancelWall(); st().startWall({ x: 0, z: -2 }); st().addWallTo({ x: 0, z: 2 });
    assert.deepEqual(areas(rooms()), [12, 12]);
    const divider = st().design.objects.find(o => o.type === 'wall' && o.start[0] === 0 && o.end[0] === 0);
    st().remove(divider.id);
    assert.deepEqual(areas(rooms()), [24]);
    st().undo();
    assert.deepEqual(areas(rooms()), [12, 12]);
  });
  test('đổi tên / loại / vật liệu sàn phòng; không xoá phòng trực tiếp; tấm sàn 2 click + chỉnh độ dày / vật liệu', () => {
    reset();
    const st = () => S.getState();
    st().startWall({ x: 0, z: 0 });
    for (const p of [{ x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }, { x: 0, z: 0 }]) st().addWallTo(p);
    const id = rooms()[0].id;
    st().editRoom(id, { name: 'Bếp', room_type: 'kitchen', floor_material_id: 'tile-white' });
    assert.deepEqual([rooms()[0].name, rooms()[0].room_type, rooms()[0].floor_material_id], ['Bếp', 'kitchen', 'tile-white']);
    assert.equal(st().remove(id), false);
    S.setState({ activeTool: 'floor', wallDraft: null });
    st().startFloor({ x: 5, z: 0 });
    assert.ok(st().placeFloor({ x: 8, z: 2 }).ok);
    const slab = st().design.objects.find(o => o.type === 'floor');
    assert.deepEqual(slab.polygon, [[5, 0], [8, 0], [8, 2], [5, 2]]);
    assert.ok(st().editFloor(slab.id, { thickness: 0.2, material_id: 'stone' }).ok);
    st().startFloor({ x: 6, z: 1 });
    assert.equal(st().placeFloor({ x: 9, z: 3 }).code, 'OVERLAP');
    st().startFloor({ x: 9, z: 0 });
    assert.equal(st().placeFloor({ x: 11, z: 3 }).code, 'OUTSIDE');
  });
});
