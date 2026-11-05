// Phase 02.6 — kiểm thử nhà nhiều tầng: cấu trúc tầng, nâng cấp dữ liệu cũ, quy tắc đỡ tầng trên, cầu thang, đi lên / xuống.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  floorHoles, levelElevation, normalizeDesign, stairHeightAt, stairLayout, validateLevels, validateStair,
} from '../../shared/levelGeometry.mjs';
import { syncRooms } from '../../shared/roomGeometry.mjs';
import { WALL_DEFAULTS } from '../../shared/wallGeometry.mjs';
import { buildHouseWalk } from '../src/game/building/walkSurfaces.js';
import { ROOF_DEFAULTS, roofParts } from '../../shared/roofGeometry.mjs';
import { useBuildingStore } from '../src/game/building/buildingStore.js';

let n = 0;
const W = (start, end, floor = 0) => ({ id: `wall_l${(++n).toString().padStart(4, '0')}`, type: 'wall', floor, start, end, ...WALL_DEFAULTS, openings: [] });
const loop = (pts, floor = 0) => pts.map((p, i) => W(p, pts[(i + 1) % pts.length], floor));
const rooms = objects => syncRooms({ objects }, () => `room_l${(++n).toString().padStart(4, '0')}`).design.objects;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
// Nhà 2 tầng mẫu: tầng trệt phòng 8 × 6, tầng 2 phòng 8 × 6 trên cùng vị trí; cầu thang thẳng dọc tường trái.
const SQUARE = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
const twoStorey = () => normalizeDesign({
  levels: [{ height: 3 }, { height: 3 }],
  objects: rooms([...loop([[-4, -3], [4, -3], [4, 3], [-4, 3]]), ...loop([[-4, -3], [4, -3], [4, 3], [-4, 3]], 1)]),
});
const stair = (extra = {}) => ({ id: 'stair_t0001', type: 'stair', floor: 0, kind: 'straight', start: [-3, -2.3], dir: 1, width: 1, turn: 'left', ...extra });

describe('Cấu trúc tầng', () => {
  test('nâng cấp nhà một tầng cũ (schema 1) → levels + level_id, không đổi toạ độ', () => {
    const old = { schema: 1, objects: [W([0, 0], [4, 0])] };
    const d = normalizeDesign(old);
    assert.deepEqual(d.levels, [{ id: 'level_0', index: 0, height: 3, elevation: 0 }]);
    assert.equal(d.objects[0].level_id, 'level_0');
    assert.deepEqual(d.objects[0].start, [0, 0]);
    assert.equal(d.schema, 2);
  });
  test('cao độ tầng = tổng chiều cao các tầng dưới; chiều cao tầng cấu hình được (kẹp giới hạn)', () => {
    const d = normalizeDesign({ levels: [{ height: 3.4 }, { height: 9 }], objects: [] });
    assert.deepEqual(d.levels.map(l => [l.height, l.elevation]), [[3.4, 0], [4.5, 3.4]]);
    near(levelElevation(d.levels, 1), 3.4);
  });
  test('quy tắc đỡ: tường tầng trên phải nằm trên sàn tầng dưới; tầng trên không có gì đỡ → lỗi; ban công ≤ 1.5 m', () => {
    assert.deepEqual(validateLevels(twoStorey()), []);
    const floating = normalizeDesign({ levels: [{ height: 3 }, { height: 3 }], objects: rooms([...loop([[-4, -3], [4, -3], [4, 3], [-4, 3]]), W([5, 0], [8, 0], 1)]) });
    assert.deepEqual(validateLevels(floating).map(e => e.code), ['FLOATING_WALL']);
    const noSupport = normalizeDesign({ levels: [{ height: 3 }, { height: 3 }], objects: [W([0, 0], [3, 0], 1)] });
    assert.deepEqual(validateLevels(noSupport).map(e => e.code), ['NO_SUPPORT']);
    const balcony = d => normalizeDesign({ ...twoStorey(), objects: [...twoStorey().objects, { id: 'floor_b1', type: 'floor', floor: 1, polygon: d, thickness: 0.15, material_id: 'wood' }] });
    assert.deepEqual(validateLevels(balcony([[-2, 3], [2, 3], [2, 4.5], [-2, 4.5]])), [], 'ban công 1.5 m được phép');
    assert.deepEqual(validateLevels(balcony([[-2, 3], [2, 3], [2, 5], [-2, 5]])).map(e => e.code), ['BALCONY']);
    assert.deepEqual(validateLevels(balcony([[6, 6], [8, 6], [8, 8], [6, 8]])).map(e => e.code), ['FLOATING_SLAB']);
    // Tường bao ban công được phép đứng trên tấm sàn ban công.
    const withRail = normalizeDesign({ ...balcony([[-2, 3], [2, 3], [2, 4.5], [-2, 4.5]]) });
    withRail.objects.push({ ...W([-2, 4.4], [2, 4.4], 1), level_id: 'level_1' });
    assert.deepEqual(validateLevels(withRail), []);
  });
});

describe('Cầu thang', () => {
  test('cầu thang thẳng: số bậc theo chiều cao tầng, footprint, độ cao dốc', () => {
    const lay = stairLayout(stair(), 3);
    assert.equal(lay.steps, 17);
    assert.deepEqual(lay.top, [1.76, -2.3]);
    near(stairHeightAt(lay, -3 + 2.38, -2.3), 1.5);
    assert.equal(stairHeightAt(lay, -3 + 2.38, -1.6), null, 'ra ngoài bề rộng');
  });
  test('cầu thang chữ L: 2 vế + chiếu nghỉ, đầu trên rẽ đúng hướng', () => {
    const L = stairLayout(stair({ kind: 'L', start: [0, 0], dir: 0 }), 3);
    assert.equal(L.parts.length, 3);
    assert.deepEqual(L.topDir, [-1, 0], 'rẽ trái khi đi theo +Z');
    const R = stairLayout(stair({ kind: 'L', start: [0, 0], dir: 0, turn: 'right' }), 3);
    assert.deepEqual(R.topDir, [1, 0]);
    near(stairHeightAt(L, 0, L.parts[1].a[1] + 0.5), L.parts[0].y1);
  });
  test('kiểm tra đặt: hợp lệ / chưa có tầng trên / ra ngoài lô / đè tường / đầu trên không có sàn / đè cầu thang khác', () => {
    const d = twoStorey(), opts = { poly: SQUARE, setback: 0.5 };
    assert.equal(validateStair(d, stair(), opts), null);
    assert.equal(validateStair(normalizeDesign({ objects: d.objects.filter(o => o.floor === 0) }), stair(), opts), 'NO_UPPER');
    assert.equal(validateStair(d, stair({ start: [6, 0] }), opts), 'OUTSIDE');
    assert.equal(validateStair(d, stair({ start: [-3, -3] }), opts), 'WALL', 'đè lên tường dưới');
    assert.equal(validateStair(d, stair({ start: [-1, 0], dir: 1 }), opts), 'NO_LANDING', 'đầu trên đâm ra ngoài sàn tầng 2');
    const withOne = { ...d, objects: [...d.objects, stair()] };
    assert.equal(validateStair(withOne, stair({ id: 'stair_t0002', start: [-3, -2] }), opts), 'OVERLAP');
    assert.equal(floorHoles(withOne, 1).length, 1, 'tạo lỗ sàn tầng trên');
  });
});

describe('Đi lại nhiều tầng (Explore Mode)', () => {
  const plot = { id: 9, position_x: 0, position_z: 0, rotation_y: 0, width: 22, length: 22, zone: 'rural' };
  const design = () => { const d = twoStorey(); d.objects.push(stair()); return d; };
  const sy = 0.055;
  test('đi từ tầng trệt lên tầng 2 theo cầu thang, độ cao liên tục, không nhảy bậc', () => {
    const walk = buildHouseWalk([plot], [{ plot_id: 9, design: design() }]);
    let y = 0, level = 0, prev = 0;
    // Đi thẳng theo +X từ chân cầu thang (-3.4) lên quá đầu trên (1.76) rồi bước lên sàn tầng 2.
    for (let x = -3.4; x <= 2.3; x += 0.05) {
      const s = walk.surface(x, -2.3, y);
      assert.ok(s, `kẹt tại x = ${x.toFixed(2)}`);
      assert.ok(Math.abs(s.y - prev) < 0.2, 'không nhảy bậc');
      prev = s.y; y = s.y; level = s.level;
    }
    near(y, sy + 3, 1e-6);
    assert.equal(level, 1);
    // Đi xuống lại.
    for (let x = 2.3; x >= -3.4; x -= 0.05) { const s = walk.surface(x, -2.3, y); assert.ok(s); y = s.y; }
    near(y, 0, 1e-6);
  });
  test('không rơi xuyên sàn: ở tầng 2 ra ngoài mép sàn / vào lỗ cầu thang → bị chặn', () => {
    const walk = buildHouseWalk([plot], [{ plot_id: 9, design: design() }]);
    const up = sy + 3;
    assert.equal(walk.surface(2, 0, up).level, 1, 'đứng trên sàn tầng 2');
    assert.equal(walk.surface(5, 0, up), null, 'mép sàn tầng 2');
    assert.equal(walk.surface(-2, -2.3, up), null, 'lỗ cầu thang (bậc thấp hơn nhiều)');
    assert.equal(walk.surface(0, -2.3, 0), null, 'gầm cầu thang ở tầng trệt bị chặn');
    assert.equal(walk.surface(0, 1, 0).level, 0, 'tầng trệt bình thường');
  });
  test('tường tầng 2 có va chạm riêng; nhà một tầng cũ không có cầu thang vẫn đi như cũ', () => {
    const walk = buildHouseWalk([plot], [{ plot_id: 9, design: design() }]);
    assert.ok(walk.wallHit(1, 4, 0));
    assert.ok(!walk.wallHit(1, 0, 0));
    assert.equal(buildHouseWalk([plot], [{ plot_id: 9, design: normalizeDesign({ objects: loop([[-4, -3], [4, -3], [4, 3], [-4, 3]]) }) }]), null);
  });
  test('mái là mặt đứng được: có thể bước từ sàn tầng trên sang mái thấp liền kề', () => {
    const d = twoStorey();
    // Tầng trên chỉ che nửa trái; mái tầng trệt phủ nửa phải và tiếp giáp sàn tầng 2 ở cùng cao độ.
    d.objects = d.objects.filter(o => o.floor === 0 || o.type !== 'wall' && o.type !== 'room');
    d.objects.push(...rooms(loop([[-4, -3], [0, -3], [0, 3], [-4, 3]], 1)).filter(o => o.floor === 1));
    const rf = { id: 'roof_walk', type: 'roof', floor: 0, level_id: 'level_0', ...ROOF_DEFAULTS };
    d.objects.push(rf);
    assert.ok(roofParts(d, rf).parts.length);
    const walk = buildHouseWalk([plot], [{ plot_id: 9, design: d }]);
    const edge = walk.surface(0.05, 0, sy + 3);
    assert.ok(edge && edge.level === 1 && edge.y >= sy + 3, 'đứng được trên mái sát sàn tầng 2');
  });
});

describe('Store: tầng & cầu thang', () => {
  const S = useBuildingStore;
  const plot = { position_x: 0, position_z: 0, rotation_y: 0, width: 20, length: 20, zone: 'rural' };
  test('thêm tầng 2 chỉ khi tầng trệt có phòng; chuyển tầng; vẽ tường tầng 2; đặt cầu thang; đổi chiều cao; gỡ tầng', () => {
    S.setState({ ...S.getInitialState(), isBuildMode: true, plot, canEdit: true, setback: 0.5, activeTool: 'wall' });
    const st = () => S.getState();
    assert.ok(st().addLevelBlock(), 'chưa có phòng');
    assert.equal(st().addLevel().ok, false);
    st().startWall({ x: -4, z: -3 });
    for (const p of [{ x: 4, z: -3 }, { x: 4, z: 3 }, { x: -4, z: 3 }, { x: -4, z: -3 }]) st().addWallTo(p);
    st().cancelWall();
    assert.equal(st().addLevelBlock(), null);
    assert.ok(st().addLevel().ok);
    assert.equal(st().activeFloor, 1);
    st().startWall({ x: -4, z: -3 });
    for (const p of [{ x: 4, z: -3 }, { x: 4, z: 3 }, { x: -4, z: 3 }, { x: -4, z: -3 }]) assert.ok(st().addWallTo(p).ok);
    st().cancelWall();
    assert.equal(st().design.objects.filter(o => o.type === 'room' && o.floor === 1).length, 1, 'phòng riêng của tầng 2');
    assert.equal(st().addWallTo({ x: 9, z: 9 }).ok, false);
    st().setFloor(0);
    S.setState({ activeTool: 'stair' });
    st().startStair({ x: -3, z: -2.3 });
    assert.ok(st().placeStair(1).ok);
    st().startStair({ x: 3, z: 2.5 });
    assert.equal(st().placeStair(1).code, 'WALL', 'không đặt sai vị trí (xuyên tường)');
    assert.ok(st().setLevelHeight(0, 3.2).ok);
    assert.equal(st().design.levels[1].elevation, 3.2);
    assert.deepEqual(st().levelIssues(), []);
    assert.equal(st().removeLevel().ok, false, 'tầng trên còn tường');
    assert.ok(st().design.objects.every(o => o.level_id === `level_${o.floor}`));
  });
});
