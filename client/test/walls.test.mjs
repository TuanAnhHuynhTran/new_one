// Phase 02.3 — kiểm thử hệ thống tường: hình học, bắt điểm, nối / giao tường (chia đoạn), kiểm tra hợp lệ, dời đầu tường, store.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  WALL_DEFAULTS, addWall, collinearOverlap, crossingPoint, moveWallEndpoint, pointOnWallInterior, snapWallPoint, splitWall,
  updateWall, validateWallSet, wallAngle, wallBox, wallFootprint, wallJoints, wallLength,
} from '../../shared/wallGeometry.mjs';
import { footprintInside } from '../../shared/buildGeometry.mjs';
import { useBuildingStore, wallsOf } from '../src/game/building/buildingStore.js';
import { computePreview } from '../src/game/building/previewLogic.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
let n = 0;
const nid = () => `wall_t${(++n).toString().padStart(4, '0')}`;
const W = (start, end, extra = {}) => ({ id: nid(), type: 'wall', floor: 0, start, end, ...WALL_DEFAULTS, openings: [], ...extra });
const SQUARE = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
const opts = { poly: SQUARE, setback: 0.5 };
const build = list => list.reduce((acc, [a, b]) => { const r = addWall(acc, W(a, b), nid, opts); assert.ok(!r.error, r.error); return r.walls; }, []);

describe('Hình học tường', () => {
  test('chiều dài, góc xoay khớp three.js (trục X của hộp chạy start → end)', () => {
    const w = W([1, 2], [4, 6]);
    near(wallLength(w), 5);
    const o = new THREE.Object3D(); o.rotation.y = wallAngle(w); o.updateMatrixWorld();
    const dir = new THREE.Vector3(1, 0, 0).applyMatrix4(o.matrixWorld);
    near(dir.x, 0.6); near(dir.z, 0.8);
  });
  test('footprint gồm nửa độ dày ở hai đầu; hộp hiển thị kéo dài ở đầu có nối', () => {
    const w = W([0, 0], [4, 0]);
    const fp = wallFootprint(w);
    assert.deepEqual(fp.map(p => p.map(v => Math.round(v * 100) / 100)), [[-0.1, 0.1], [4.1, 0.1], [4.1, -0.1], [-0.1, -0.1]].map(([x, z]) => [x, -z]).reverse().reverse());
    const room = build([[[0, 0], [4, 0]], [[4, 0], [4, 3]], [[4, 3], [0, 3]], [[0, 3], [0, 0]]]);
    const j = wallJoints(room);
    for (const w2 of room) assert.deepEqual(j.get(w2.id), { ext0: 0.1, ext1: 0.1 }, 'phòng kín: mọi đầu đều nối');
    const b = wallBox(room[0], j.get(room[0].id));
    near(b.length, 4.2); near(b.cx, 2); near(b.cz, 0);
    const lone = W([0, 0], [3, 0]);
    assert.deepEqual(wallJoints([lone]).get(lone.id), { ext0: 0, ext1: 0 }, 'đầu tự do không kéo dài');
  });
  test('góc L không có khe hở: hai hộp kéo dài phủ kín ô vuông góc', () => {
    const [a, b] = build([[[0, 0], [4, 0]], [[4, 0], [4, 3]]]);
    const j = wallJoints([a, b]), ba = wallBox(a, j.get(a.id)), bb = wallBox(b, j.get(b.id));
    near(ba.cx + ba.length / 2, 4.1); // tường A chạm mép ngoài của tường B
    near(bb.cz - bb.length / 2, -0.1); // tường B chạm mép ngoài của tường A
  });
});

describe('Nối và giao tường', () => {
  test('4 tường thành phòng kín; chữ T và chữ thập tự chia đoạn, không xoá tường', () => {
    const room = build([[[0, 0], [6, 0]], [[6, 0], [6, 4]], [[6, 4], [0, 4]], [[0, 4], [0, 0]]]);
    assert.equal(room.length, 4);
    // Chữ T: tường mới từ giữa cạnh dưới (3, 0) lên (3, 4) → chia cạnh dưới và cạnh trên thành 2.
    let r = addWall(room, W([3, 0], [3, 4]), nid, opts);
    assert.ok(!r.error);
    assert.equal(r.split, 2);
    assert.equal(r.walls.length, 7);
    const total = ws => ws.reduce((s, w) => s + wallLength(w), 0);
    near(total(r.walls), 6 + 4 + 6 + 4 + 4, 1e-6);
    // Chữ thập: tường ngang (0,2) → (6,2) cắt tường giữa → chia cả hai.
    const r2 = addWall(r.walls, W([0, 2], [6, 2]), nid, opts);
    assert.ok(!r2.error);
    assert.equal(r2.added.length, 2, 'tường mới bị chia tại giao điểm');
    assert.ok(r2.walls.some(w => w.start[0] === 3 && w.start[1] === 2 || w.end[0] === 3 && w.end[1] === 2));
    assert.equal(validateWallSet(r2.walls, opts).length, 0, 'tập tường sau khi chia hợp lệ');
  });
  test('không tạo tường độ dài 0 / quá ngắn, trùng hoàn toàn, chồng một phần', () => {
    const base = build([[[0, 0], [5, 0]]]);
    assert.equal(addWall(base, W([1, 1], [1, 1]), nid, opts).error, 'TOO_SHORT');
    assert.equal(addWall(base, W([1, 1], [1.1, 1]), nid, opts).error, 'TOO_SHORT');
    assert.equal(addWall(base, W([5, 0], [0, 0]), nid, opts).error, 'DUPLICATE', 'đảo chiều vẫn là trùng');
    assert.equal(addWall(base, W([3, 0], [8, 0]), nid, opts).error, 'OVERLAP');
    assert.ok(!addWall(base, W([5, 0], [8, 0]), nid, opts).error, 'nối thẳng hàng tại đầu mút được phép');
    assert.ok(!addWall(base, W([0, 0], [5, 0], { floor: 1 }), nid, opts).error, 'tầng khác không trùng');
  });
  test('không vẽ vượt ranh giới / khoảng lùi', () => {
    assert.equal(addWall([], W([0, 0], [9.6, 0]), nid, opts).error, 'OUTSIDE', 'đầu tường + nửa độ dày vào khoảng lùi');
    assert.ok(!addWall([], W([0, 0], [9.3, 0]), nid, opts).error);
  });
  test('chia đoạn giữ cửa / cửa sổ; điểm chia rơi vào cửa → báo lỗi, không làm mất cửa', () => {
    const w = W([0, 0], [6, 0], { openings: [{ id: 'op1', type: 'door', offset: 4, width: 1 }] });
    const ok = splitWall(w, [[2, 0]], nid);
    assert.equal(ok.parts.length, 2);
    assert.deepEqual(ok.parts[1].openings, [{ id: 'op1', type: 'door', offset: 2, width: 1 }]);
    assert.equal(splitWall(w, [[4.5, 0]], nid).error, 'OPENING_SPLIT');
    assert.equal(addWall([w], W([4.5, 0], [4.5, 3]), nid, opts).error, 'OPENING_SPLIT');
  });
  test('hàm nền: điểm trên thân tường, giao điểm, chồng thẳng hàng', () => {
    const a = W([0, 0], [4, 0]);
    assert.ok(pointOnWallInterior([2, 0], a));
    assert.ok(!pointOnWallInterior([0, 0], a), 'đầu mút không tính là thân');
    assert.deepEqual(crossingPoint(a, W([2, -1], [2, 1])), [2, 0]);
    assert.equal(crossingPoint(a, W([4, 0], [4, 2])), null, 'chạm đầu không phải cắt ngang');
    near(collinearOverlap(a, W([3, 0], [6, 0])), 1);
    near(collinearOverlap(a, W([0, 1], [4, 1])), 0);
  });
});

describe('Bắt điểm (snapping)', () => {
  const walls = [W([0, 0], [4, 0]), W([4, 0], [4, 3])];
  const grid = (x, z) => ({ x: Math.round(x), z: Math.round(z) });
  test('ưu tiên đầu tường → thân tường (chữ T) → lưới → tự do', () => {
    assert.deepEqual(snapWallPoint([3.8, 0.25], walls, { gridFn: grid }), { x: 4, z: 0, kind: 'endpoint' });
    assert.deepEqual(snapWallPoint([2.3, 0.2], walls), { x: 2.3, z: 0, kind: 'wall' }, 'không có lưới → chiếu vuông góc');
    assert.deepEqual(snapWallPoint([2.03, 0.2], walls, { gridFn: grid }), { x: 2, z: 0, kind: 'wall' }, 'có lưới → giao điểm lưới trên thân tường');
    assert.deepEqual(snapWallPoint([1.6, 1.7], walls, { gridFn: grid }), { x: 2, z: 2, kind: 'grid' });
    assert.deepEqual(snapWallPoint([1.6, 1.7], walls), { x: 1.6, z: 1.7, kind: 'free' });
  });
  test('Shift: khoá hướng 45° và làm tròn chiều dài theo bước lưới', () => {
    const p = snapWallPoint([3.1, 2.7], [], { anchor: [0, 0], constrain: true, step: 1 });
    near(Math.atan2(p.z, p.x), Math.PI / 4); near(Math.hypot(p.x, p.z), 4, 1e-3);
  });
  test('kéo đầu tường không tự bắt vào chính vị trí cũ của nó', () => {
    const p = snapWallPoint([4.1, 0.1], walls, { gridFn: grid, ignorePoint: [4, 0] });
    assert.notEqual(p.kind, 'endpoint');
  });
});

describe('Kiểm tra hợp lệ & chỉnh sửa', () => {
  test('validateWallSet: cắt ngang chưa chia, chồng, ngoài lô, giới hạn, cửa không vừa', () => {
    const a = W([0, 0], [4, 0]);
    assert.deepEqual(validateWallSet([a, W([2, -1], [2, 1])], opts).map(e => e.code), ['CROSSING']);
    assert.deepEqual(validateWallSet([a, W([2, 0], [6, 0])], opts).map(e => e.code), ['OVERLAP']);
    assert.deepEqual(validateWallSet([W([0, 0], [12, 0])], opts).map(e => e.code), ['OUTSIDE']);
    assert.deepEqual(validateWallSet([W([0, 0], [3, 0], { height: 9 })], opts).map(e => e.code), ['LIMITS']);
    assert.deepEqual(validateWallSet([W([0, 0], [3, 0], { openings: [{ id: 'o', type: 'window', offset: 2.5, width: 1 }] })], opts).map(e => e.code), ['OPENING_FIT']);
    assert.equal(validateWallSet([a, W([4, 0], [4, 3]), W([2, 0], [2, 3])], opts).length, 0, 'chữ T (đầu chạm thân) được phép');
  });
  test('dời đầu tường: đầu nối chung đi theo, cửa bám đầu cố định, cửa không vừa → báo lỗi', () => {
    const room = build([[[0, 0], [4, 0]], [[4, 0], [4, 3]]]);
    const r = moveWallEndpoint(room, room[0].id, 'end', [5, 0], opts);
    assert.ok(!r.error);
    assert.deepEqual(r.walls.find(w => w.id === room[1].id).start, [5, 0], 'tường nối đi theo');
    const withDoor = [{ ...room[0], openings: [{ id: 'd', type: 'door', offset: 2.5, width: 1 }] }, room[1]];
    assert.equal(moveWallEndpoint(withDoor, room[0].id, 'end', [3, 0], opts).error, 'OPENING_FIT', 'cửa không còn vừa → không làm mất cửa');
    const s = moveWallEndpoint(withDoor, room[0].id, 'start', [-1, 0], opts);
    assert.equal(s.walls[0].openings[0].offset, 3.5, 'dời đầu start: cửa giữ vị trí tuyệt đối');
    assert.equal(moveWallEndpoint(room, room[0].id, 'end', [4, 0.05], opts).error, undefined);
    assert.equal(moveWallEndpoint(room, room[0].id, 'start', [4, 3], opts).error, 'DUPLICATE', 'thành trùng với tường kia');
    assert.equal(moveWallEndpoint(room, room[0].id, 'start', [4, 0], opts).error, 'TOO_SHORT', 'thu tường về 0');
  });
  test('đổi độ dày / chiều cao được kiểm tra lại (dày quá mép khoảng lùi → từ chối)', () => {
    const w = W([0, 9.3], [3, 9.3]);
    assert.ok(!updateWall([w], w.id, { height: 2.5 }, opts).error);
    assert.equal(updateWall([w], w.id, { thickness: 0.5 }, opts).error, 'OUTSIDE');
    assert.ok(footprintInside(wallFootprint(w), SQUARE, 0.5));
  });
});

describe('Store + preview (2 click, vẽ tiếp, undo/redo, Esc)', () => {
  const S = useBuildingStore;
  const plot = { position_x: 0, position_z: 0, rotation_y: 0, width: 20, length: 20, zone: 'rural' };
  const reset = () => S.setState({ ...S.getInitialState(), isBuildMode: true, plot, canEdit: true, setback: 0.5, activeTool: 'wall' });
  test('vẽ 4 tường thành phòng bằng click nối tiếp, Esc huỷ đoạn đang vẽ', () => {
    reset();
    const st = () => S.getState();
    st().startWall({ x: -2, z: -2 });
    for (const p of [{ x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }, { x: -2, z: -2 }]) assert.ok(st().addWallTo(p).ok);
    assert.equal(wallsOf(st().design).length, 4);
    assert.deepEqual(st().wallDraft, { start: [-2, -2] }, 'tiếp tục vẽ từ điểm cuối');
    assert.equal(st().addWallTo({ x: 2, z: -2 }).code, 'DUPLICATE');
    st().cancelWall();
    assert.equal(st().wallDraft, null);
    assert.equal(validateWallSet(wallsOf(st().design), { poly: SQUARE, setback: 0.5 }).length, 0);
  });
  test('undo / redo / sửa / xoá tường', () => {
    reset();
    const st = () => S.getState();
    st().startWall({ x: 0, z: 0 }); st().addWallTo({ x: 3, z: 0 }); st().addWallTo({ x: 3, z: 2 });
    assert.equal(wallsOf(st().design).length, 2);
    st().undo(); assert.equal(wallsOf(st().design).length, 1);
    st().redo(); assert.equal(wallsOf(st().design).length, 2);
    const id = wallsOf(st().design)[0].id;
    assert.ok(st().editWall(id, { height: 2.4, material_id: 'brick' }).ok);
    assert.deepEqual([wallsOf(st().design)[0].height, wallsOf(st().design)[0].material_id], [2.4, 'brick']);
    assert.ok(st().moveWallEnd(id, 'start', { x: -1, z: 0 }).ok);
    st().remove(id); assert.equal(wallsOf(st().design).length, 1);
    st().undo(); st().undo(); st().undo();
    assert.equal(wallsOf(st().design)[0].height, 3, 'undo khôi phục thuộc tính');
    st().editWall(null, { thickness: 0.3 });
    assert.equal(st().wallDefaults.thickness, 0.3, 'chỉnh thuộc tính cho tường mới');
  });
  test('preview: điểm đầu, đoạn đang vẽ (chiều dài), không hợp lệ khi trùng; chế độ xem không vẽ được', () => {
    reset();
    let pv = computePreview(S.getState(), plot, { x: 1.2, z: 0.1 }, null, false);
    assert.deepEqual([pv.kind, pv.local, pv.valid], ['point', { x: 1, z: 0 }, true]);
    S.getState().startWall({ x: 1, z: 0 });
    pv = computePreview(S.getState(), plot, { x: 4.9, z: 0.2 }, null, false);
    assert.deepEqual([pv.kind, pv.b, pv.label, pv.valid], ['wall', { x: 5, z: 0 }, '4 m', true]);
    S.getState().addWallTo({ x: 5, z: 0 });
    S.getState().cancelWall();
    S.getState().startWall({ x: 5, z: 0 });
    pv = computePreview(S.getState(), plot, { x: 1.1, z: 0.1 }, null, false);
    assert.equal(pv.valid, false, 'trùng tường vừa vẽ');
    S.setState({ canEdit: false, wallDraft: null });
    assert.equal(computePreview(S.getState(), plot, { x: 0, z: 0 }, null, false).valid, false);
  });
  test('chế độ hiển thị không đổi dữ liệu tường', () => {
    reset();
    S.getState().startWall({ x: 0, z: 0 }); S.getState().addWallTo({ x: 3, z: 0 });
    const before = JSON.stringify(S.getState().design);
    for (const m of ['cutaway', 'down', 'hide', 'full']) S.getState().setWallDisplay(m);
    S.getState().cycleWallDisplay();
    assert.equal(JSON.stringify(S.getState().design), before);
    assert.equal(S.getState().wallDisplay, 'cutaway');
  });
});
