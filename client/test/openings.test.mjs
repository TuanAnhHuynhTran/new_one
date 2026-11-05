// Phase 02.5 — kiểm thử cửa & cửa sổ: gắn vào tường, kiểm tra hợp lệ, lỗ mở (chia khối), va chạm, sửa tường không mất dữ liệu.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOOR_CATALOG, WINDOW_CATALOG, listOpenings, openingAt, openingFromCatalog, snapOffset, validateOpening, validateWallOpenings,
  wallAt, wallColliderSpans, wallEndMargins, wallPieces,
} from '../../shared/openingGeometry.mjs';
import { WALL_DEFAULTS, addWall, moveWallEndpoint, updateWall } from '../../shared/wallGeometry.mjs';
import { useBuildingStore, wallsOf } from '../src/game/building/buildingStore.js';
import { computePreview } from '../src/game/building/previewLogic.js';

const W = (id, start, end, extra = {}) => ({ id, type: 'wall', floor: 0, start, end, ...WALL_DEFAULTS, openings: [], ...extra });
const door = (id, offset, extra = {}) => ({ ...openingFromCatalog('door-single', id), offset, ...extra });
const win = (id, offset, extra = {}) => ({ ...openingFromCatalog('window-double', id), offset, ...extra });

describe('Catalog', () => {
  test('4 mẫu cửa + 4 mẫu cửa sổ, đủ thuộc tính', () => {
    assert.deepEqual(DOOR_CATALOG.map(c => c.kind), ['hinged', 'double', 'glass', 'sliding']);
    assert.deepEqual(WINDOW_CATALOG.map(c => c.kind), ['single', 'double', 'picture', 'sliding']);
    for (const c of DOOR_CATALOG) for (const k of ['id', 'width', 'height', 'material', 'color']) assert.ok(c[k] != null, k);
    const d = openingFromCatalog('door-double', 'door_x1');
    assert.deepEqual([d.type, d.width, d.sill, d.swing, d.swing_dir], ['door', 1.6, 0, 'left', 'in']);
    assert.equal(openingFromCatalog('window-picture', 'window_x1').sill, 0.4);
  });
});

describe('Gắn vào tường & kiểm tra hợp lệ', () => {
  const w = W('wall_a', [0, 0], [5, 0]);
  test('hợp lệ / vượt ra ngoài tường / chồng nhau / cao hơn tường / kích thước sai', () => {
    assert.equal(validateOpening(w, door('d1', 1)), null);
    assert.equal(validateOpening(w, door('d1', -0.2)), 'OUT_OF_WALL');
    assert.equal(validateOpening(w, door('d1', 4.5)), 'OUT_OF_WALL');
    const withDoor = { ...w, openings: [door('d1', 1)] };
    assert.equal(validateOpening(withDoor, win('w1', 1.5)), 'OVERLAP');
    assert.equal(validateOpening(withDoor, win('w1', 2.0)), null, 'cách cửa ≥ 5 cm');
    assert.equal(validateOpening({ ...w, height: 2.1 }, door('d1', 1)), 'TOO_TALL');
    assert.equal(validateOpening(w, win('w1', 1, { sill: 1.6, height: 1.5 })), 'TOO_TALL');
    assert.equal(validateOpening(w, door('d1', 1, { width: 5 })), 'LIMITS');
    assert.equal(validateOpening(w, door('d1', 1, { sill: 0.3 })), 'LIMITS', 'cửa đi phải sát sàn');
    assert.equal(validateOpening(w, { ...door('d1', 1), catalog_id: 'window-single' }), 'LIMITS', 'mẫu không khớp loại');
  });
  test('không cắt vào mối nối: chừa nửa độ dày tường nối ở đầu tường', () => {
    const b = W('wall_b', [0, 0], [0, 4], { thickness: 0.3 });
    assert.deepEqual(wallEndMargins(w, [w, b]), { m0: 0.2, m1: 0.05 });
    assert.equal(validateOpening(w, door('d1', 0.1), [w, b]), 'OUT_OF_WALL');
    assert.equal(validateOpening(w, door('d1', 0.2), [w, b]), null);
  });
  test('tìm Wall ID dưới con trỏ, offset dọc tường (khớp bước, kẹp trong tường), chọn lỗ đã đặt', () => {
    const hit = wallAt([w, W('wall_c', [0, 3], [5, 3])], [2.3, 0.2]);
    assert.equal(hit.wall.id, 'wall_a'); assert.ok(Math.abs(hit.s - 2.3) < 1e-9);
    assert.equal(wallAt([w], [2.3, 1.5]), null, 'xa tường');
    assert.equal(snapOffset(w, 2.3, 0.9, 0.5), 2, 'tâm 2.3 → mép 1.85 → bước 0.5 → 2');
    assert.equal(snapOffset(w, 4.9, 0.9, 0), 4.05, 'kẹp trong tường');
    assert.equal(snapOffset(w, 0, 0.9, 0), 0.05);
    const ww = { ...w, openings: [door('d1', 1)] };
    assert.equal(openingAt([ww], [1.4, 0.05]).opening.id, 'd1');
    assert.equal(openingAt([ww], [3, 0.05]), null);
  });
});

describe('Lỗ mở thật (chia khối tường)', () => {
  test('cửa đi: khối trái + lanh tô + khối phải; tổng diện tích = tường − lỗ', () => {
    const w = W('wall_a', [0, 0], [5, 0], { openings: [door('d1', 1)] });
    const p = wallPieces(w);
    assert.deepEqual(p, [{ s0: 0, s1: 1, y0: 0, y1: 3 }, { s0: 1, s1: 1.9, y0: 2.1, y1: 3 }, { s0: 1.9, s1: 5, y0: 0, y1: 3 }]);
    const area = ps => ps.reduce((a, q) => a + (q.s1 - q.s0) * (q.y1 - q.y0), 0);
    assert.ok(Math.abs(area(p) - (15 - 0.9 * 2.1)) < 1e-9);
  });
  test('cửa sổ có bậu dưới; nhiều lỗ; kéo dài nối góc; chế độ hạ thấp cắt chiều cao', () => {
    const w = W('wall_a', [0, 0], [6, 0], { openings: [win('w1', 3), door('d1', 0.5)] });
    const p = wallPieces(w, { ext0: 0.1, ext1: 0.1 });
    assert.equal(p[0].s0, -0.1); assert.equal(p[p.length - 1].s1, 6.1);
    assert.ok(p.some(q => q.s0 === 3 && q.y0 === 0 && q.y1 === 0.9), 'bậu dưới cửa sổ');
    assert.ok(p.some(q => q.s0 === 3 && q.y0 === 2.1 && q.y1 === 3), 'phía trên cửa sổ');
    const low = wallPieces(w, { cap: 0.6 });
    assert.ok(low.every(q => q.y1 <= 0.6));
    assert.ok(!low.some(q => q.s0 >= 0.5 && q.s1 <= 1.4), 'khoảng cửa đi vẫn trống khi hạ thấp');
  });
  test('va chạm: cửa sổ chặn; cửa đi đóng chặn, mở thì để trống', () => {
    const w = W('wall_a', [0, 0], [5, 0], { openings: [door('d1', 1), win('w1', 3)] });
    assert.deepEqual(wallColliderSpans(w, () => false), [[0, 5]]);
    assert.deepEqual(wallColliderSpans(w, id => id === 'd1'), [[0, 1], [1.9, 5]]);
  });
});

describe('Sửa tường không làm mất dữ liệu âm thầm', () => {
  const opts = { poly: [[-10, -10], [10, -10], [10, 10], [-10, 10]], setback: 0 };
  test('chia tường: cửa đi theo đoạn chứa nó; điểm chia rơi vào cửa → từ chối', () => {
    const base = [W('wall_a', [0, 0], [6, 0], { openings: [door('d1', 4)] })];
    const r = addWall(base, W('wall_b', [2, 0], [2, 3]), () => 'wall_c', opts);
    assert.ok(!r.error);
    const host = r.walls.find(x => x.openings.some(o => o.id === 'd1'));
    assert.deepEqual([host.start, host.openings[0].offset], [[2, 0], 2]);
    assert.equal(addWall(base, W('wall_b', [4.5, 0], [4.5, 3]), () => 'wall_c', opts).error, 'OPENING_SPLIT');
  });
  test('rút ngắn / hạ thấp tường khiến cửa không vừa → báo lỗi, dữ liệu giữ nguyên', () => {
    const walls = [W('wall_a', [0, 0], [6, 0], { openings: [door('d1', 4)] })];
    assert.equal(moveWallEndpoint(walls, 'wall_a', 'end', [4.5, 0], opts).error, 'OPENING_FIT');
    assert.equal(updateWall(walls, 'wall_a', { height: 2 }, opts).error, 'OPENING_FIT');
    assert.equal(walls[0].openings.length, 1);
  });
  test('validateWallOpenings + listOpenings (mô hình dữ liệu: wall_id, house_id, opening_type…)', () => {
    const walls = [W('wall_a', [0, 0], [6, 0], { openings: [door('d1', 1), win('w1', 1.2)] })];
    assert.deepEqual(validateWallOpenings(walls).map(e => e.code), ['OVERLAP', 'OVERLAP']);
    const list = listOpenings({ objects: walls }, 7);
    assert.deepEqual(Object.keys(list[0]).filter(k => ['id', 'house_id', 'wall_id', 'opening_type', 'catalog_id', 'offset', 'width', 'height', 'sill', 'swing', 'color'].includes(k)).length, 11);
    assert.equal(list[0].wall_id, 'wall_a'); assert.equal(list[0].house_id, 7);
  });
});

describe('Store: đặt / sửa / gỡ cửa, xoá tường có cửa', () => {
  const S = useBuildingStore;
  const plot = { position_x: 0, position_z: 0, rotation_y: 0, width: 20, length: 20, zone: 'rural' };
  const reset = () => {
    S.setState({ ...S.getInitialState(), isBuildMode: true, plot, canEdit: true, setback: 0.5, activeTool: 'wall' });
    S.getState().startWall({ x: 0, z: 0 }); S.getState().addWallTo({ x: 5, z: 0 }); S.getState().cancelWall();
  };
  test('preview trỏ vào tường → Wall ID + offset; click đặt; chồng bị chặn; sửa / gỡ; undo', () => {
    reset();
    S.setState({ activeTool: 'door' });
    const pv = computePreview(S.getState(), plot, { x: 2.3, z: 0.15 }, null, false);
    assert.deepEqual([pv.kind, pv.valid, pv.opening.offset], ['opening', true, 2]);
    const wall = wallsOf(S.getState().design)[0];
    assert.equal(pv.wallId, wall.id);
    assert.ok(S.getState().placeOpening(pv.wallId, pv.opening.offset).ok);
    assert.equal(S.getState().placeOpening(wall.id, 2.4).code, 'OVERLAP');
    const id = wallsOf(S.getState().design)[0].openings[0].id;
    assert.ok(S.getState().editOpening(id, { swing: 'right', width: 1.0, color: '#8a5a3c' }).ok);
    assert.deepEqual((({ swing, width, color }) => ({ swing, width, color }))(S.getState().findOpening(id).opening), { swing: 'right', width: 1, color: '#8a5a3c' });
    assert.equal(S.getState().editOpening(id, { offset: 4.5 }).code, 'OUT_OF_WALL');
    S.setState({ activeTool: 'window' });
    assert.ok(S.getState().placeOpening(wall.id, 3.4, 'window').ok);
    assert.equal(computePreview(S.getState(), plot, { x: 2.3, z: 3 }, null, false).valid, false, 'không trỏ vào tường');
    S.getState().remove(id);
    assert.equal(wallsOf(S.getState().design)[0].openings.length, 1);
    S.getState().undo();
    assert.equal(wallsOf(S.getState().design)[0].openings.length, 2);
  });
  test('xoá tường có cửa → thông báo rõ số cửa bị gỡ (không âm thầm), Ctrl+Z khôi phục', () => {
    reset();
    const wall = wallsOf(S.getState().design)[0];
    S.getState().placeOpening(wall.id, 1, 'door');
    S.getState().remove(wall.id);
    assert.match(S.getState().message, /kèm 1 cửa/);
    S.getState().undo();
    assert.equal(wallsOf(S.getState().design)[0].openings.length, 1);
  });
});
