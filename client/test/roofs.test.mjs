// Phase 02.7 — kiểm thử mái nhà: footprint, chia khối chữ L, mái bằng / hai dốc / bốn dốc, độ cao theo tầng, không xuyên tường,
// phần nhô chỉ ở cạnh ngoài, kiểm tra hợp lệ, store (đặt / sửa / xoá / undo / redo), hình học render.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOF_DEFAULTS, cleanRoof, roofBase, roofFootprint, roofHeightAt, roofOutline, roofParts, roofTop, roofTriangles, validateRoof,
} from '../../shared/roofGeometry.mjs';
import { normalizeDesign } from '../../shared/levelGeometry.mjs';
import { syncRooms } from '../../shared/roomGeometry.mjs';
import { WALL_DEFAULTS } from '../../shared/wallGeometry.mjs';
import { useBuildingStore } from '../src/game/building/buildingStore.js';
import { roofGeometry } from '../src/game/building/roofMesh.js';

let n = 0;
const W = (start, end, floor = 0) => ({ id: `wall_r${(++n).toString().padStart(4, '0')}`, type: 'wall', floor, start, end, ...WALL_DEFAULTS, openings: [] });
const loop = (pts, floor = 0) => pts.map((p, i) => W(p, pts[(i + 1) % pts.length], floor));
const rooms = objects => syncRooms({ objects }, () => `room_r${(++n).toString().padStart(4, '0')}`).design.objects;
const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const RECT = [[-4, -3], [4, -3], [4, 3], [-4, 3]];
const L_SHAPE = [[-4, -3], [4, -3], [4, 0], [0, 0], [0, 3], [-4, 3]];
const house = (pts = RECT, extra = []) => normalizeDesign({ objects: [...rooms(loop(pts)), ...extra] });
const roof = (extra = {}) => ({ id: 'roof_t0001', type: 'roof', floor: 0, ...ROOF_DEFAULTS, ...extra });
const BIG = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
const allPts = tris => tris.flat();

describe('Footprint mái', () => {
  test('nhà chữ nhật → một khối; chân mái = đỉnh tường tầng', () => {
    const d = house();
    assert.deepEqual(roofFootprint(d, 0).rects, [{ x0: -4, x1: 4, z0: -3, z1: 3 }]);
    near(roofBase(d, 0), WALL_DEFAULTS.height);
  });
  test('chữ L → các mặt mái nối liền bằng khe mái, tổng diện tích đúng', () => {
    const d = house(L_SHAPE), fp = roofFootprint(d, 0);
    assert.equal(fp.rects.length, 2);
    near(fp.rects.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0), 8 * 3 + 4 * 3);
    assert.deepEqual(roofParts(d, roof()).warnings, ['SPLIT']);
  });
  test('cạnh xiên → dựng được mái dốc', () => {
    const d = house([[-4, -3], [4, -3], [0, 3]]), r = roofParts(d, roof({ kind: 'gable' }));
    assert.deepEqual(r.warnings, []);
    assert.equal(r.parts.length, 1);
    assert.equal(r.parts[0].kind, 'gable');
    assert.ok(r.parts[0].rise > 0);
    assert.ok(roofGeometry(r.parts).attributes.position.count > 0);
  });
  test('không có phòng → không có khối mái, không lỗi', () => {
    const d = normalizeDesign({ objects: [W([0, 0], [4, 0])] });
    assert.deepEqual(roofParts(d, roof()).parts, []);
    assert.equal(roofGeometry([]).attributes.position.count, 0);
  });
});

describe('Hình mái', () => {
  test('mái hai dốc: nóc theo cạnh dài, độ cao nóc = nửa nhịp × tan(độ dốc), tường không xuyên mái', () => {
    const d = house(), [p] = roofParts(d, roof({ kind: 'gable', pitch: 30, overhang: 0.4 })).parts;
    assert.equal(p.ridge, 'x');
    // nhịp tính tới mặt ngoài tường (tim tường ± nửa bề dày)
    near(p.rise, ((6 + WALL_DEFAULTS.thickness) / 2) * Math.tan(Math.PI / 6));
    const pts = allPts(roofTriangles(p));
    near(Math.max(...pts.map(q => q[1])), 3 + p.rise);
    // Mặt ngoài tường dọc (z = ±3.1) nằm dưới mặt mái: tại z = 3.1 mái cao đúng bằng đỉnh tường.
    const t = Math.tan(Math.PI / 6), roofYAt = z => 3 + p.rise - (Math.abs(z)) * t;
    near(roofYAt(3 + WALL_DEFAULTS.thickness / 2), 3);
    assert.ok(roofYAt(3) > 3, 'tim tường nằm dưới mái');
    // Mép mái nhô hạ thấp theo độ dốc.
    near(Math.min(...pts.map(q => q[1])), 3 - 0.4 * t);
  });
  test('hướng nóc chỉnh được (x / z); mái bốn dốc nóc ngắn lại; khối vuông → chóp', () => {
    const d = house();
    assert.equal(roofParts(d, roof({ ridge: 'z' })).parts[0].ridge, 'z');
    const [hip] = roofParts(d, roof({ kind: 'hip', overhang: 0 })).parts;
    const top = allPts(roofTriangles(hip)).filter(q => Math.abs(q[1] - (3 + hip.rise)) < 1e-4);
    const xs = top.map(q => q[0]);
    near(Math.max(...xs) - Math.min(...xs), 8.2 - 6.2, 1e-3);
    const sq = house([[-3, -3], [3, -3], [3, 3], [-3, 3]]), [h2] = roofParts(sq, roof({ kind: 'hip' })).parts;
    const tops = allPts(roofTriangles(h2)).filter(q => Math.abs(q[1] - (3 + h2.rise)) < 1e-4);
    assert.equal(new Set(tops.map(q => q.join())).size, 1, 'một đỉnh chóp');
  });
  test('mái bằng: tấm phủ kín đỉnh tường + phần nhô', () => {
    const d = house(), [p] = roofParts(d, roof({ kind: 'flat', overhang: 0.3 })).parts;
    assert.equal(p.rise, 0);
    assert.deepEqual(roofOutline(p)[0], [-4.1 - 0.3, -3.1 - 0.3]);
    const g = roofGeometry([p]);
    g.computeBoundingBox();
    near(g.boundingBox.min.y, 3); near(g.boundingBox.max.x, 4.4);
  });
  test('chữ L: phần nhô chỉ ở cạnh ngoài (không chồng nhau giữa hai khối)', () => {
    const d = house(L_SHAPE), parts = roofParts(d, roof({ overhang: 0.5 })).parts;
    for (const p of parts) assert.ok(Object.values(p.oh).some(v => v === 0), 'cạnh chung không nhô');
    const at = (part, x, z) => roofTriangles(part).flat().find(p => Math.abs(p[0] - x) < 1e-4 && Math.abs(p[2] - z) < 1e-4);
    const a = at(parts[0], -2, 0), b = at(parts[1], -2, 0);
    assert.ok(a && b && Math.abs(a[1] - b[1]) < 1e-4 && a[1] > parts[0].base, 'hai mặt dùng chung đường khe / nóc, không hở tại chỗ giao');
  });
  test('cao độ mặt mái dùng được làm mặt đi lại', () => {
    const d = house(), [p] = roofParts(d, roof({ kind: 'gable', pitch: 30 })).parts;
    near(roofHeightAt(p, 0, 0), p.base + p.rise);
    near(roofHeightAt(p, 0, p.rect.z1), p.base);
    assert.equal(roofHeightAt(p, 20, 20), null);
  });
  test('nhà 2 tầng: mái tầng 2 nằm trên đỉnh tường tầng 2; mái tầng trệt chỉ phủ phần không có tầng trên và không nhô vào tường tầng trên', () => {
    const d = normalizeDesign({ levels: [{ height: 3 }, { height: 3.2 }], objects: rooms([...loop(RECT), ...loop([[-4, -3], [0, -3], [0, 3], [-4, 3]], 1)]) });
    for (const o of d.objects) if (o.type === 'wall' && o.floor === 1) o.height = 3.2;
    near(roofBase(d, 1), 6.2);
    const up = roofParts(d, roof({ floor: 1 })).parts;
    assert.deepEqual(up.map(p => p.core), [{ x0: -4, x1: 0, z0: -3, z1: 3 }]);
    const low = roofParts(d, roof()).parts;
    assert.deepEqual(low.map(p => p.core), [{ x0: 0, x1: 4, z0: -3, z1: 3 }]);
    assert.equal(low[0].oh.x0, 0, 'cạnh giáp tầng trên không nhô');
    assert.equal(low[0].rect.x0, 0, 'không nới vào tường tầng trên');
    near(roofTop(low), 3 + low[0].rise);
  });
});

describe('Kiểm tra mái', () => {
  test('tham số ngoài giới hạn / sai loại / sai màu → LIMITS; tầng không tồn tại → NO_LEVEL; trùng tầng → DUPLICATE', () => {
    const d = house();
    assert.equal(validateRoof(d, roof(), { poly: BIG }), null);
    assert.equal(validateRoof(d, roof({ pitch: 80 })), 'LIMITS');
    assert.equal(validateRoof(d, roof({ overhang: 2 })), 'LIMITS');
    assert.equal(validateRoof(d, roof({ kind: 'dome' })), 'LIMITS');
    assert.equal(validateRoof(d, roof({ material_id: 'gold' })), 'LIMITS');
    assert.equal(validateRoof(d, roof({ color: 'red' })), 'LIMITS');
    assert.equal(validateRoof(d, roof({ floor: 1 })), 'NO_LEVEL');
    const d2 = { ...d, objects: [...d.objects, roof({ id: 'roof_t0002' })] };
    assert.equal(validateRoof(d2, roof()), 'DUPLICATE');
  });
  test('phần nhô ra ngoài lô → OUTSIDE; footprint trống chỉ lỗi khi đặt mới', () => {
    const d = house();
    assert.equal(validateRoof(d, roof({ overhang: 1 }), { poly: [[-4.5, -10], [10, -10], [10, 10], [-4.5, 10]] }), 'OUTSIDE');
    const empty = normalizeDesign({ objects: [] });
    assert.equal(validateRoof(empty, roof()), null);
    assert.equal(validateRoof(empty, roof(), { requireFootprint: true }), 'NO_FOOTPRINT');
  });
  test('cleanRoof chỉ giữ trường hợp lệ, chuẩn hoá màu', () => {
    const c = cleanRoof({ ...roof({ color: '#AABBCC' }), hack: 1, rise: 99 });
    assert.deepEqual(Object.keys(c.obj).sort(), ['color', 'floor', 'id', 'kind', 'material_id', 'overhang', 'pitch', 'ridge', 'type']);
    assert.equal(c.obj.color, '#aabbcc');
    assert.ok(cleanRoof({ ...roof(), pitch: 'x' }).error);
  });
});

describe('Store: mái', () => {
  const S = useBuildingStore, st = () => S.getState();
  const plot = { position_x: 0, position_z: 0, rotation_y: 0, width: 20, length: 20, zone: 'rural' };
  test('đặt mái (cần phòng), sửa loại / độ dốc / nhô / màu / vật liệu, ẩn hiện không xoá, xoá, undo / redo', () => {
    S.setState({ ...S.getInitialState(), isBuildMode: true, plot, canEdit: true, setback: 0.5, activeTool: 'roof' });
    assert.equal(st().placeRoof().code, 'NO_FOOTPRINT');
    S.setState({ design: house() });
    const r = st().placeRoof();
    assert.ok(r.ok);
    assert.equal(st().placeRoof().code, 'DUPLICATE');
    const get = () => st().design.objects.find(o => o.type === 'roof');
    assert.equal(get().level_id, 'level_0');
    const walls = JSON.stringify(st().design.objects.filter(o => o.type !== 'roof'));
    assert.ok(st().editRoof(r.id, { kind: 'flat' }).ok); assert.equal(get().kind, 'flat');
    st().editRoof(r.id, { pitch: 99 }); assert.equal(get().pitch, 50, 'kẹp giới hạn');
    st().editRoof(r.id, { overhang: 0.6 }); assert.equal(get().overhang, 0.6);
    st().editRoof(r.id, { color: '#3d5a80' }); assert.equal(get().color, '#3d5a80');
    st().editRoof(r.id, { material_id: 'metal' }); assert.equal(get().material_id, 'metal'); assert.equal(get().color, undefined, 'đổi vật liệu bỏ màu riêng');
    assert.equal(JSON.stringify(st().design.objects.filter(o => o.type !== 'roof')), walls, 'không đụng tường / phòng');
    st().toggle('showRoof'); assert.equal(st().showRoof, false); assert.ok(get(), 'ẩn mái không xoá');
    st().toggle('showRoof');
    st().undo(); assert.equal(get().material_id, 'tile-red'); assert.equal(get().color, '#3d5a80');
    st().redo(); assert.equal(get().material_id, 'metal');
    assert.ok(st().remove(r.id)); assert.equal(get(), undefined);
    st().undo(); assert.ok(get());
    // Đổi thông số mái mới (chưa có mái) → chỉ đổi mặc định.
    st().remove(r.id);
    st().editRoof(null, { kind: 'hip', pitch: 25 });
    assert.equal(st().roofDefaults.kind, 'hip');
    assert.equal(st().placeRoof().ok, true); assert.equal(get().kind, 'hip'); assert.equal(get().pitch, 25);
  });
  test('sửa tường → mái tự khớp theo (không lưu hình mái); cảnh báo khi chia khối / mất footprint', () => {
    S.setState({ ...S.getInitialState(), isBuildMode: true, plot, canEdit: true, setback: 0.5, design: house(L_SHAPE) });
    st().placeRoof();
    const rf = st().roofOf();
    assert.ok(st().roofWarnings(rf).some(w => /khe mái/.test(w)));
    // Xoá một tường → phòng mất → mái giữ tham số, tạm không hiển thị (có cảnh báo), không lỗi.
    const w = st().design.objects.find(o => o.type === 'wall');
    st().remove(w.id);
    assert.ok(st().roofOf());
    assert.equal(roofParts(st().design, st().roofOf()).parts.length, 0);
    assert.ok(st().roofWarnings(st().roofOf()).some(t => /không hiển thị/.test(t)));
  });
  test('không gỡ được tầng trên khi còn mái', () => {
    const d = normalizeDesign({ levels: [{ height: 3 }, { height: 3 }], objects: [...rooms([...loop(RECT), ...loop(RECT, 1)])] });
    S.setState({ ...S.getInitialState(), isBuildMode: true, plot, canEdit: true, setback: 0.5, design: d, activeFloor: 1 });
    assert.ok(st().placeRoof().ok);
    assert.equal(st().roofOf(1).floor, 1);
    assert.equal(st().removeLevel().ok, false);
  });
});
