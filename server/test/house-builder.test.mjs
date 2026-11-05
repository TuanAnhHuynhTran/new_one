// Kiểm thử quyền House Builder (Phase 02.1): chỉ chủ lô được lưu cấu trúc; người khác chỉ xem; backend kiểm tra lại dữ liệu.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.mjs';

let S, A, B, plotA, plotB;
const marker = (id, x, z, floor = 0) => ({ id, type: 'marker', floor, position: { x, y: 0, z }, rotation_y: 0 });
before(async () => {
  S = await startServer();
  A = await S.register('rural', 'ba'); B = await S.register('rural', 'bb');
  plotA = await S.plotByCode('R-002'); plotB = await S.plotByCode('R-004');
  await S.call(`/land-plots/${plotA.id}/claim`, { method: 'POST', token: A.token });
  await S.call(`/land-plots/${plotB.id}/claim`, { method: 'POST', token: B.token });
});
after(async () => { await S?.stop(); });

describe('House Builder — quyền và lưu thiết kế', () => {
  test('quyền Build Mode do backend trả: chủ = sửa, người khác = chỉ xem, đất trống = không', async () => {
    const own = (await S.call(`/land-plots/${plotA.id}/build-permission`, { token: A.token })).body;
    assert.deepEqual([own.can_view, own.can_edit], [true, true]);
    const other = (await S.call(`/land-plots/${plotB.id}/build-permission`, { token: A.token })).body;
    assert.deepEqual([other.can_view, other.can_edit], [true, false]);
    const guest = (await S.call(`/land-plots/${plotA.id}/build-permission`)).body;
    assert.equal(guest.can_edit, false);
    const vacant = await S.plotByCode('R-005');
    assert.equal((await S.call(`/land-plots/${vacant.id}/build-permission`, { token: A.token })).body.can_view, false);
  });

  test('chủ lô lưu được thiết kế (toạ độ local, version tăng dần)', async () => {
    const r = await S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token: A.token, body: { version: 0, design: { schema: 1, objects: [marker('marker_aaaa1', 1.5, -2.5), marker('marker_aaaa2', 0.5, 0.5, 1)] } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.version, 1);
    const view = (await S.call(`/land-plots/${plotA.id}/house-design`)).body; // người khác / khách vẫn xem được
    assert.equal(view.design.objects.length, 2);
    assert.equal(view.owner_name, A.username);
  });

  test('người khác KHÔNG thêm / sửa / xoá được cấu trúc trên lô của chủ khác (403)', async () => {
    const cur = (await S.call(`/land-plots/${plotA.id}/house-design`)).body;
    const tries = [
      { ...cur.design, objects: [...cur.design.objects, marker('marker_bbbb1', 2, 2)] }, // thêm
      { ...cur.design, objects: cur.design.objects.map(o => ({ ...o, position: { x: 0, y: 0, z: 0 } })) }, // sửa
      { ...cur.design, objects: [] }, // xoá
    ];
    for (const design of tries) {
      const r = await S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token: B.token, body: { version: cur.version, design } });
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'NOT_PLOT_OWNER');
    }
    assert.equal((await S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', body: { version: cur.version, design: tries[2] } })).status, 401);
    assert.equal((await S.call(`/land-plots/${plotA.id}/house-design`)).body.design.objects.length, 2, 'thiết kế của A không đổi');
  });

  test('backend tự kiểm tra cấu trúc: ngoài ranh giới, tầng sai, loại chưa hỗ trợ, id trùng → 400', async () => {
    const bad = [
      [marker('marker_cccc1', 11.5, 0)], // lô 22 m → |x| ≤ 10.75
      [marker('marker_cccc2', 0, 0, 5)],
      [{ ...marker('wall_cccc3', 0, 0), type: 'wall' }],
      [marker('marker_cccc4', 0, 0), marker('marker_cccc4', 1, 1)],
    ];
    const v = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.version;
    for (const objects of bad) {
      const r = await S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token: A.token, body: { version: v, design: { schema: 1, objects } } });
      assert.equal(r.status, 400, JSON.stringify(objects));
      assert.equal(r.body.code, 'INVALID_DESIGN');
      assert.ok(r.body.details.length >= 1);
    }
  });

  test('chống ghi đè: lưu với version cũ → 409 VERSION_CONFLICT', async () => {
    const r = await S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token: A.token, body: { version: 0, design: { schema: 1, objects: [] } } });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'VERSION_CONFLICT');
    assert.equal(r.body.version, 1);
  });
});

// ---------- Phase 02.2: footprint / polygon / setback ở server ----------
import { validateHouseDesign } from '../src/houseDesign.js';
describe('House Builder — server kiểm tra footprint theo polygon + khoảng lùi', () => {
  const zone = (id, x, z, w, d, floor = 0) => ({ id, type: 'zone', floor, position: { x, y: 0, z }, size: { w, d }, rotation_y: 0 });
  test('lưu vùng phòng qua API; footprint chạm khoảng lùi bị từ chối dù tâm nằm trong lô', async () => {
    const cur = (await S.call(`/land-plots/${plotA.id}/house-design`)).body;
    const ok = await S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token: A.token, body: { version: cur.version, design: { schema: 1, objects: [zone('zone_ok001', -4, -4, 6, 4)] } } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    // Lô 22 m, khoảng lùi 0.5 m: vùng rộng 21.5 m có tâm ở giữa lô nhưng mép cách ranh giới chỉ 0.25 m.
    const bad = await S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token: A.token, body: { version: ok.body.version, design: { schema: 1, objects: [zone('zone_bad01', 0, 0, 21.5, 4)] } } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.details[0], /khoảng lùi/);
  });
  test('lô đa giác hình L (lõm) và lô xoay', () => {
    const L = { size_x: 12, size_z: 12, world_x: 0, world_z: 0, rotation_y: 0, boundary_polygon: [[-6, -6], [6, -6], [6, 0], [0, 0], [0, 6], [-6, 6]] };
    assert.ok(validateHouseDesign({ objects: [zone('zone_l0001', -3, -3, 4, 4)] }, L, { setback: 0.5 }).design);
    assert.equal(validateHouseDesign({ objects: [zone('zone_l0002', -1, -1, 4, 4)] }, L, { setback: 0 }).error, 'INVALID_DESIGN', 'chồng lên góc lõm');
    assert.equal(validateHouseDesign({ objects: [{ id: 'marker_l0003', type: 'marker', floor: 0, position: { x: 3, z: 3 } }] }, L).error, 'INVALID_DESIGN', 'cọc trong phần khuyết');
    // Lô xoay 90°: ranh giới world → local vẫn là 12 × 18.
    const a = Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const R = { size_x: 12, size_z: 18, world_x: 10, world_z: 5, rotation_y: a,
      boundary_polygon: [[-6, -9], [6, -9], [6, 9], [-6, 9]].map(([x, z]) => [10 + x * c + z * s, 5 - x * s + z * c]) };
    assert.ok(validateHouseDesign({ objects: [zone('zone_r0001', 0, 0, 11, 17)] }, R, { setback: 0.4 }).design);
    assert.equal(validateHouseDesign({ objects: [zone('zone_r0002', 0, 0, 17, 11)] }, R, { setback: 0 }).error, 'INVALID_DESIGN');
  });
});

// ---------- Phase 02.3: tường ----------
describe('House Builder — tường (server kiểm tra lại)', () => {
  const wall = (id, start, end, extra = {}) => ({ id, type: 'wall', floor: 0, start, end, height: 3, thickness: 0.2, material_id: 'paint-white', openings: [], ...extra });
  const room = [wall('wall_r0001', [-3, -3], [3, -3]), wall('wall_r0002', [3, -3], [3, 2]), wall('wall_r0003', [3, 2], [-3, 2]), wall('wall_r0004', [-3, 2], [-3, -3])];
  const put = async (objects, token = A.token) => {
    const v = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.version;
    return S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token, body: { version: v, design: { schema: 1, objects } } });
  };
  test('lưu phòng 4 tường; danh sách thiết kế công khai cho Explore Mode có tường', async () => {
    const r = await put(room);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.design.objects.filter(o => o.type === 'wall').length, 4);
    const list = (await S.call('/house-designs')).body.designs;
    const objs = list.find(d => d.plot_id === plotA.id).design.objects;
    assert.equal(objs.filter(o => o.type === 'wall').length, 4);
    assert.equal(objs.filter(o => o.type === 'room').length, 1, 'server tự tạo phòng cho 4 tường khép kín');
  });
  test('từ chối: cắt ngang chưa chia, trùng, chồng, ngoài lô, quá ngắn, vật liệu lạ, cửa không vừa', async () => {
    const bad = {
      crossing: [...room, wall('wall_x0001', [0, -4], [0, 3])],
      duplicate: [...room, wall('wall_x0002', [3, -3], [-3, -3])],
      overlap: [...room, wall('wall_x0003', [0, -3], [5, -3])],
      outside: [wall('wall_x0004', [0, 0], [10.7, 0])],
      short: [wall('wall_x0005', [0, 0], [0.05, 0])],
      material: [wall('wall_x0006', [0, 0], [2, 0], { material_id: 'gold' })],
      opening: [wall('wall_x0007', [0, 0], [2, 0], { openings: [{ id: 'o1', type: 'door', offset: 1.5, width: 1 }] })],
      badPoint: [wall('wall_x0008', [0], [2, 0])],
    };
    for (const [name, objects] of Object.entries(bad)) {
      const r = await put(objects);
      assert.equal(r.status, 400, name);
      assert.equal(r.body.code, 'INVALID_DESIGN', name);
    }
  });
  test('người khác không sửa được tường của lô A (403)', async () => {
    const r = await put([], B.token);
    assert.equal(r.status, 403);
  });
});

// ---------- Phase 02.4: sàn & phòng ----------
import { syncRooms } from '../../shared/roomGeometry.mjs';
describe('House Builder — sàn & phòng (server nhận diện lại từ tường)', () => {
  let k = 0;
  const wall = (start, end) => ({ id: `wall_p${(++k).toString().padStart(4, '0')}`, type: 'wall', floor: 0, start, end, height: 3, thickness: 0.2, material_id: 'paint-white', openings: [] });
  const loop = pts => pts.map((p, i) => wall(p, pts[(i + 1) % pts.length]));
  const withRooms = walls => syncRooms({ schema: 1, objects: walls }, () => `room_p${(++k).toString().padStart(4, '0')}`).design.objects;
  const put = async objects => {
    const v = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.version;
    return S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token: A.token, body: { version: v, design: { schema: 1, objects } } });
  };
  test('lưu phòng chữ L + tấm sàn; tải lại (reload) vẫn giữ cấu trúc phòng', async () => {
    const objs = withRooms(loop([[-6, -6], [0, -6], [0, -3], [-3, -3], [-3, 0], [-6, 0]]));
    objs.find(o => o.type === 'room').name = 'Phòng khách';
    objs.push({ id: 'floor_p0001', type: 'floor', floor: 0, shape: 'rect', polygon: [[2, 2], [6, 2], [6, 5], [2, 5]], thickness: 0.1, material_id: 'wood' });
    const r = await put(objs);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const got = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.design.objects;
    const room = got.find(o => o.type === 'room');
    assert.deepEqual([room.name, room.area, room.polygon.length], ['Phòng khách', 27, 6]);
    assert.equal(got.filter(o => o.type === 'floor').length, 1);
  });
  test('từ chối phòng giả (tường chưa khép kín) và polygon phòng sai; vùng khép kín thiếu phòng → server tự tạo; diện tích do server tính', async () => {
    const closed = withRooms(loop([[-6, -6], [-2, -6], [-2, -3], [-6, -3]]));
    const room = closed.find(o => o.type === 'room');
    const open = closed.filter(o => o.type !== 'wall' || !(o.start[0] === -6 && o.end[0] === -6));
    let r = await put(open);
    assert.equal(r.status, 400, 'phòng giả');
    assert.match(r.body.details.join(' '), /không khớp vùng khép kín/);
    r = await put(closed.filter(o => o.type === 'wall'));
    assert.equal(r.status, 200, 'thiếu phòng → tự tạo');
    assert.deepEqual(r.body.design.objects.filter(o => o.type === 'room').map(o => o.area), [12]);
    r = await put([...closed.filter(o => o.type === 'wall'), { ...room, polygon: [[-6, -6], [-1, -6], [-1, -3], [-6, -3]] }]);
    assert.equal(r.status, 400, 'polygon sai');
    r = await put([...closed.filter(o => o.type === 'wall'), { ...room, area: 999 }]);
    assert.equal(r.status, 200, 'diện tích do server tính lại');
    assert.equal(r.body.design.objects.find(o => o.type === 'room').area, 12);
  });
  test('tấm sàn chồng nhau / ngoài lô bị từ chối', async () => {
    const slab = (id, poly) => ({ id, type: 'floor', floor: 0, shape: 'rect', polygon: poly, thickness: 0.1, material_id: 'wood' });
    let r = await put([slab('floor_q0001', [[0, 0], [4, 0], [4, 4], [0, 4]]), slab('floor_q0002', [[2, 2], [6, 2], [6, 6], [2, 6]])]);
    assert.equal(r.status, 400);
    r = await put([slab('floor_q0003', [[8, 8], [12, 8], [12, 12], [8, 12]])]);
    assert.equal(r.status, 400);
  });
});

// ---------- Phase 02.5: cửa & cửa sổ ----------
import { openingFromCatalog } from '../../shared/openingGeometry.mjs';
describe('House Builder — cửa & cửa sổ', () => {
  const op = (cat, id, offset, extra = {}) => ({ ...openingFromCatalog(cat, id), offset, ...extra });
  const wall = (id, start, end, openings = []) => ({ id, type: 'wall', floor: 0, start, end, height: 3, thickness: 0.2, material_id: 'paint-white', openings });
  const put = async (objects, token = A.token) => {
    const v = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.version;
    return S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token, body: { version: v, design: { schema: 1, objects } } });
  };
  test('lưu cửa + cửa sổ vào database; tải lại giữ đúng vị trí / thuộc tính', async () => {
    const r = await put([wall('wall_o0001', [-5, 0], [1, 0], [op('door-single', 'door_o0001', 1, { swing: 'right', swing_dir: 'out', color: '#8a5a3c' }), op('window-double', 'window_o0001', 3)])]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const got = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.design.objects.find(o => o.id === 'wall_o0001');
    assert.deepEqual(got.openings.map(o => [o.id, o.catalog_id, o.offset, o.width, o.height, o.sill, o.swing, o.swing_dir, o.color]), [
      ['door_o0001', 'door-single', 1, 0.9, 2.1, 0, 'right', 'out', '#8a5a3c'],
      ['window_o0001', 'window-double', 3, 1.4, 1.2, 0.9, 'left', 'in', '#fff7ec'],
    ]);
  });
  test('từ chối: chồng nhau, vượt tường, cao hơn tường, mẫu sai', async () => {
    const bad = {
      overlap: [wall('wall_o0002', [-5, 0], [1, 0], [op('door-single', 'door_o0002', 1), op('window-single', 'window_o0002', 1.5)])],
      outside: [wall('wall_o0003', [-5, 0], [1, 0], [op('door-double', 'door_o0003', 5)])],
      tall: [{ ...wall('wall_o0004', [-5, 0], [1, 0], [op('door-single', 'door_o0004', 1)]), height: 2 }],
      catalog: [wall('wall_o0005', [-5, 0], [1, 0], [{ ...op('door-single', 'door_o0005', 1), catalog_id: 'door-gold' }])],
    };
    for (const [name, objects] of Object.entries(bad)) {
      const r = await put(objects);
      assert.equal(r.status, 400, name);
    }
  });
  test('mở / đóng cửa: chủ nhà được, người khác bị khoá (403), cửa chưa lưu → 404; trạng thái server giữ', async () => {
    await put([wall('wall_o0006', [-5, 0], [1, 0], [op('door-single', 'door_o0006', 1)])]);
    let r = await S.call(`/land-plots/${plotA.id}/doors/door_o0006`, { method: 'POST', token: A.token, body: { open: true } });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.open, r.body.wall_id], [true, 'wall_o0006']);
    assert.ok((await S.call('/door-states')).body.doors.some(d => d.opening_id === 'door_o0006' && d.plot_id === plotA.id));
    r = await S.call(`/land-plots/${plotA.id}/doors/door_o0006`, { method: 'POST', token: B.token, body: { open: false } });
    assert.equal(r.status, 403);
    r = await S.call(`/land-plots/${plotA.id}/doors/door_zzzz9`, { method: 'POST', token: A.token, body: { open: true } });
    assert.equal(r.status, 404);
    r = await S.call(`/land-plots/${plotA.id}/doors/door_o0006`, { method: 'POST', body: { open: true } });
    assert.equal(r.status, 401);
  });
});

// ---------- Phase 02.6: nhà nhiều tầng ----------
import { normalizeDesign } from '../../shared/levelGeometry.mjs';
describe('House Builder — nhà nhiều tầng', () => {
  let k = 0;
  const wall = (start, end, floor = 0) => ({ id: `wall_m${(++k).toString().padStart(4, '0')}`, type: 'wall', floor, start, end, height: 3, thickness: 0.2, material_id: 'paint-white', openings: [] });
  const box = floor => [[-4, -3], [4, -3], [4, 3], [-4, 3]].map((p, i, a) => wall(p, a[(i + 1) % 4], floor));
  const stair = { id: 'stair_m0001', type: 'stair', floor: 0, kind: 'straight', start: [-3, -2.3], dir: 1, width: 1, turn: 'left' };
  const put = async (design, token = A.token) => {
    const v = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.version;
    return S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token, body: { version: v, design } });
  };
  test('lưu nhà 2 tầng (phòng riêng mỗi tầng + cầu thang); tải lại đúng cả hai tầng', async () => {
    const objects = withRoomsAll([...box(0), ...box(1), stair]);
    const r = await put({ schema: 2, levels: [{ height: 3 }, { height: 3.2 }], objects });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const got = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.design;
    assert.deepEqual(got.levels.map(l => [l.id, l.height, l.elevation]), [['level_0', 3, 0], ['level_1', 3.2, 3]]);
    assert.deepEqual([0, 1].map(f => got.objects.filter(o => o.type === 'room' && o.floor === f).length), [1, 1]);
    assert.ok(got.objects.every(o => o.level_id === `level_${o.floor}`));
    assert.equal(got.objects.find(o => o.type === 'stair').dir, 1);
  });
  test('từ chối: tường tầng 2 trôi nổi, 3 tầng, cầu thang đè tường / không có tầng trên, level_id sai', async () => {
    const bad = {
      floating: { levels: [{ height: 3 }, { height: 3 }], objects: withRoomsAll([...box(0), wall([6, 0], [9, 0], 1)]) },
      tooMany: { levels: [{ height: 3 }, { height: 3 }, { height: 3 }], objects: withRoomsAll(box(0)) },
      stairWall: { levels: [{ height: 3 }, { height: 3 }], objects: withRoomsAll([...box(0), ...box(1), { ...stair, start: [-3, -3] }]) },
      noUpper: { levels: [{ height: 3 }], objects: withRoomsAll([...box(0), stair]) },
      levelId: { levels: [{ height: 3 }], objects: withRoomsAll(box(0)).map(o => ({ ...o, level_id: 'level_1' })) },
    };
    for (const [name, design] of Object.entries(bad)) {
      const r = await put(design);
      assert.equal(r.status, 400, name);
    }
  });
  test('nhà một tầng cũ (schema 1, không có levels) vẫn lưu / đọc được và được nâng cấp', async () => {
    const r = await put({ schema: 1, objects: withRoomsAll(box(0)) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const got = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.design;
    assert.equal(got.schema, 2);
    assert.equal(got.levels.length, 1);
    const list = (await S.call('/house-designs')).body.designs.find(d => d.plot_id === plotA.id);
    assert.equal(list.design.levels.length, 1);
  });
  function withRoomsAll(objects) { return syncRooms(normalizeDesign({ objects }), () => `room_m${(++k).toString().padStart(4, '0')}`).design.objects; }
});

// ---------- Phase 02.7: mái nhà ----------
describe('House Builder — mái nhà', () => {
  let k = 0;
  const wall = (start, end, floor = 0) => ({ id: `wall_f${(++k).toString().padStart(4, '0')}`, type: 'wall', floor, start, end, height: 3, thickness: 0.2, material_id: 'paint-white', openings: [] });
  const box = (floor, x1 = 4) => [[-4, -3], [x1, -3], [x1, 3], [-4, 3]].map((p, i, a) => wall(p, a[(i + 1) % 4], floor));
  const roof = (extra = {}) => ({ id: 'roof_f0001', type: 'roof', floor: 0, kind: 'gable', pitch: 30, overhang: 0.3, ridge: 'auto', material_id: 'tile-red', ...extra });
  const put = async (design, token = A.token) => {
    const v = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.version;
    return S.call(`/land-plots/${plotA.id}/house-design`, { method: 'PUT', token, body: { version: v, design } });
  };
  const rooms = objects => syncRooms(normalizeDesign({ objects }), () => `room_f${(++k).toString().padStart(4, '0')}`).design.objects;
  test('lưu mái bằng + mái hai dốc cho nhà 2 tầng; tải lại giữ đúng tham số; danh sách công khai có mái', async () => {
    const objects = [...rooms([...box(0), ...box(1, 0)]), roof({ kind: 'flat', color: '#3D5A80' }), roof({ id: 'roof_f0002', floor: 1, ridge: 'z', material_id: 'metal' })];
    const r = await put({ schema: 2, levels: [{ height: 3 }, { height: 3 }], objects });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const got = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.design;
    const roofs = got.objects.filter(o => o.type === 'roof').sort((a, b) => a.floor - b.floor);
    assert.deepEqual(roofs.map(o => [o.floor, o.level_id, o.kind, o.pitch, o.overhang, o.ridge, o.material_id, o.color]), [
      [0, 'level_0', 'flat', 30, 0.3, 'auto', 'tile-red', '#3d5a80'],
      [1, 'level_1', 'gable', 30, 0.3, 'z', 'metal', undefined],
    ]);
    const list = (await S.call('/house-designs')).body.designs.find(d => d.plot_id === plotA.id);
    assert.equal(list.design.objects.filter(o => o.type === 'roof').length, 2);
  });
  test('từ chối: độ dốc / nhô / loại / vật liệu / màu sai, 2 mái cùng tầng, tầng không tồn tại, nhô ra ngoài lô, level_id sai', async () => {
    const base = rooms(box(0));
    const bad = {
      pitch: [roof({ pitch: 75 })], overhang: [roof({ overhang: 3 })], kind: [roof({ kind: 'dome' })], mat: [roof({ material_id: 'gold' })],
      color: [roof({ color: 'red' })], dup: [roof(), roof({ id: 'roof_f0003' })], level: [roof({ floor: 1 })], levelId: [roof({ level_id: 'level_1' })],
      nan: [roof({ pitch: 'abc' })],
    };
    for (const [name, extra] of Object.entries(bad)) {
      const r = await put({ schema: 2, levels: [{ height: 3 }], objects: [...base, ...extra] });
      assert.equal(r.status, 400, name + ' ' + JSON.stringify(r.body));
    }
  });
  test('phần nhô ra ngoài ranh giới lô → từ chối; nhô ít hơn → hợp lệ', async () => {
    // Nhà sát khoảng lùi 0.5 m bên phải: nhô 1 m (+ nửa bề dày tường) vượt ranh giới lô.
    const xr = plotA.width / 2 - 0.5 - 0.1, objects = rooms(box(0, xr));
    const r = await put({ schema: 2, levels: [{ height: 3 }], objects: [...objects, roof({ overhang: 1 })] });
    assert.equal(r.status, 400);
    assert.match(JSON.stringify(r.body.details), /roof .*ngoài ranh giới lô/);
    assert.ok(!/wall/.test(JSON.stringify(r.body.details)), 'chỉ mái lỗi, tường hợp lệ');
    const ok = await put({ schema: 2, levels: [{ height: 3 }], objects: [...objects, roof({ overhang: 0.3 })] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });
  test('mái giữ được khi tạm thời không có phòng (tường bị xoá) — không lỗi lưu, hình mái dựng lại khi có phòng', async () => {
    const r = await put({ schema: 2, levels: [{ height: 3 }], objects: [wall([-4, -3], [4, -3]), roof()] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const got = (await S.call(`/land-plots/${plotA.id}/house-design`)).body.design;
    assert.equal(got.objects.filter(o => o.type === 'roof').length, 1);
  });
});
