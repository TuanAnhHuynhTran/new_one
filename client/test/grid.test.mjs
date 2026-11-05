// Phase 02.2 — kiểm thử hình học lưới xây dựng: chuyển toạ độ, snap (tâm ô / giao điểm, 1 m / 0.5 m), polygon, footprint,
// setback, cắt lưới theo polygon, xem trước theo chuột. Chạy: npm test -w client
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  clipAxisLine, distToPolygonEdges, footprintInside, localBoundary, localToWorld, offsetPolygon, pointInPolygon,
  pointInsideWithSetback, polygonArea, rectFootprint, segmentsCross, snapPoint, snapValue, worldToLocal,
} from '../../shared/buildGeometry.mjs';
import { buildPlaneY, getBuildPlaneIntersection, isInsidePlot, snapToGrid } from '../src/game/building/buildingUtils.js';
import { buildGridSegments } from '../src/game/building/gridGeometry.js';
import { computePreview } from '../src/game/building/previewLogic.js';
import { validatePlacement } from '../src/game/building/BuildValidation.js';
import { useBuildingStore } from '../src/game/building/buildingStore.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const deg = d => (d * Math.PI) / 180;
// Lô xoay 30°, 12 × 18 m, có boundary_polygon (world) như dữ liệu server.
const rotPlot = (() => {
  const p = { position_x: 40, position_z: -12, rotation_y: deg(30), width: 12, length: 18, zone: 'rural' };
  p.boundary_polygon = [[-6, -9], [6, -9], [6, 9], [-6, 9]].map(([x, z]) => { const w = localToWorld(p, x, 0, z); return [w.x, w.z]; });
  return p;
})();
// Lô hình chữ L (lõm) theo toạ độ local, không xoay.
const L_LOCAL = [[-6, -6], [6, -6], [6, 0], [0, 0], [0, 6], [-6, 6]];
const lPlot = { position_x: 0, position_z: 0, rotation_y: 0, width: 12, length: 12, zone: 'city', boundary_polygon: L_LOCAL };

describe('Chuyển đổi toạ độ world ↔ local (lô xoay)', () => {
  test('khứ hồi chính xác với nhiều góc xoay', () => {
    for (const rot of [0, deg(30), deg(90), deg(-135), deg(271)]) {
      const plot = { position_x: -7, position_z: 3.5, rotation_y: rot, width: 10, length: 15 };
      for (const [x, z] of [[0, 0], [4.9, 7.4], [-3.25, -6.75]]) {
        const w = localToWorld(plot, x, 0.4, z), l = worldToLocal(plot, w.x, w.y, w.z);
        near(l.x, x); near(l.y, 0.4); near(l.z, z);
      }
    }
  });
  test('khớp ma trận Object3D.rotation.y của three.js (grid / preview xoay đúng cùng lô)', () => {
    const o = new THREE.Object3D(); o.position.set(40, 0, -12); o.rotation.y = deg(30); o.updateMatrixWorld();
    const ref = new THREE.Vector3(5, 0, -8).applyMatrix4(o.matrixWorld), mine = localToWorld(rotPlot, 5, 0, -8);
    near(mine.x, ref.x); near(mine.z, ref.z);
  });
  test('localBoundary lấy lại đúng hình chữ nhật local từ boundary_polygon world của lô xoay', () => {
    const b = localBoundary(rotPlot);
    assert.deepEqual(b.map(([x, z]) => [Math.round(x * 1e4) / 1e4, Math.round(z * 1e4) / 1e4]), [[-6, -9], [6, -9], [6, 9], [-6, 9]]);
  });
});

describe('Snap to Grid', () => {
  test('tâm ô và giao điểm, bước 1 m và 0.5 m', () => {
    assert.equal(snapValue(0.3, -6, 1, 'center'), 0.5);
    assert.equal(snapValue(0.3, -6, 1, 'vertex'), 0);
    assert.equal(snapValue(0.8, -6, 1, 'vertex'), 1);
    assert.equal(snapValue(0.3, -6, 0.5, 'center'), 0.25);
    assert.equal(snapValue(0.3, -6, 0.5, 'vertex'), 0.5);
    assert.equal(snapValue(-6, -6, 1, 'center'), -5.5, 'điểm trên mép lô → ô đầu tiên');
    assert.deepEqual(snapPoint(1.26, -0.74, { x: -6, z: -9 }, 0.5, 'vertex'), { x: 1.5, z: -0.5 });
  });
  test('lưới căn từ góc lô (lô lẻ 11 m vẫn khớp mép), kiểu snap theo công cụ, tắt snap = tự do', () => {
    const odd = { width: 11, length: 7 };
    assert.deepEqual(snapToGrid(odd, 0.1, 0.1, 1, true, 'center'), { x: 0, z: 0 });
    assert.deepEqual(snapToGrid(odd, 0.1, 0.1, 1, true, 'vertex'), { x: 0.5, z: 0.5 });
    assert.deepEqual(snapToGrid(odd, 0.1234, -2.987, 1, false), { x: 0.1234, z: -2.987 });
  });
  test('snap theo toạ độ LOCAL nên lô xoay vẫn ra đúng giao điểm lưới của lô', () => {
    const wanted = { x: 2, z: -3 }, w = localToWorld(rotPlot, wanted.x + 0.2, 0, wanted.z - 0.3);
    const l = worldToLocal(rotPlot, w.x, 0, w.z);
    const sp = snapToGrid(rotPlot, l.x, l.z, 1, true, 'vertex');
    near(sp.x, 2, 1e-6); near(sp.z, -3, 1e-6);
  });
});

describe('Polygon ranh giới', () => {
  test('điểm trong / ngoài / trên cạnh, lô lõm hình L', () => {
    assert.ok(pointInPolygon(-3, 3, L_LOCAL));
    assert.ok(pointInPolygon(3, -3, L_LOCAL));
    assert.ok(!pointInPolygon(3, 3, L_LOCAL), 'phần khuyết của chữ L');
    assert.ok(pointInPolygon(6, -3, L_LOCAL), 'nằm trên cạnh = bên trong');
    assert.ok(!pointInPolygon(6.01, -3, L_LOCAL));
    near(Math.abs(polygonArea(L_LOCAL)), 108);
  });
  test('setback: cách mọi cạnh ≥ d', () => {
    assert.ok(pointInsideWithSetback(-5, 5, L_LOCAL, 0.5));
    assert.ok(!pointInsideWithSetback(-5.7, 5, L_LOCAL, 0.5));
    assert.ok(!pointInsideWithSetback(-0.3, 0.3, L_LOCAL, 0.5), 'gần góc lõm');
    near(distToPolygonEdges(-3, 3, L_LOCAL), 3);
    assert.ok(isInsidePlot(lPlot, -3, 3, 0.5) && !isInsidePlot(lPlot, 3, 3, 0));
  });
  test('footprint: kiểm tra cả diện tích (tâm hợp lệ nhưng footprint tràn ra ngoài → không hợp lệ)', () => {
    assert.ok(footprintInside(rectFootprint(-3, -3, 4, 4), L_LOCAL, 0.5));
    // Tâm (1, 1) nằm trong phần khuyết; tâm (-1, -1) nằm trong nhưng hình 4×4 chồng lên góc lõm.
    assert.ok(!footprintInside(rectFootprint(-1, -1, 4, 4), L_LOCAL, 0));
    // Hình vắt ngang góc lõm: mọi đỉnh nằm trong chữ L nhưng một cạnh cắt qua phần khuyết.
    const bridge = [[-1, -1], [5, -1], [5, -0.5], [-1, 5]];
    assert.ok(bridge.every(([x, z]) => pointInPolygon(x, z, L_LOCAL)));
    assert.ok(!footprintInside(bridge, L_LOCAL, 0));
    assert.ok(!footprintInside(rectFootprint(5.5, -3, 1, 1), L_LOCAL, 0.5), 'vi phạm khoảng lùi');
    assert.ok(footprintInside(rectFootprint(5.5, -3, 1, 1), L_LOCAL, 0), 'không lùi thì vừa khít mép');
  });
  test('lô xoay: footprint local nằm trong ranh giới đúng dù lô xoay 30°', () => {
    const poly = localBoundary(rotPlot);
    assert.ok(footprintInside(rectFootprint(0, 0, 11, 17), poly, 0.4));
    assert.ok(!footprintInside(rectFootprint(0, 0, 11, 17), poly, 0.6));
    assert.ok(!footprintInside(rectFootprint(0, 0, 13, 4), poly, 0));
  });
  test('segmentsCross / offsetPolygon / clipAxisLine', () => {
    assert.ok(segmentsCross([0, 0], [2, 2], [0, 2], [2, 0]));
    assert.ok(!segmentsCross([0, 0], [1, 1], [1, 1], [2, 0]), 'chạm đầu mút không tính là cắt');
    const inset = offsetPolygon([[-6, -9], [6, -9], [6, 9], [-6, 9]], 0.5);
    assert.deepEqual(inset, [[-5.5, -8.5], [5.5, -8.5], [5.5, 8.5], [-5.5, 8.5]]);
    assert.deepEqual(clipAxisLine(L_LOCAL, 'x', 3), [[-6, 0]], 'đường x = 3 chỉ đi trong nửa dưới chữ L');
    assert.deepEqual(clipAxisLine(L_LOCAL, 'z', 3), [[-6, 0]]);
  });
});

describe('Lưới & xem trước', () => {
  test('lưới cắt theo polygon, không vẽ ra ngoài phần khuyết của chữ L', () => {
    const { minor, major } = buildGridSegments(L_LOCAL, 1);
    const segs = [...minor, ...major];
    for (let i = 0; i < segs.length; i += 6) {
      const mx = (segs[i] + segs[i + 3]) / 2, mz = (segs[i + 2] + segs[i + 5]) / 2;
      assert.ok(pointInPolygon(mx, mz, L_LOCAL), `đoạn lưới ra ngoài lô tại ${mx},${mz}`);
    }
    const half = buildGridSegments(L_LOCAL, 0.5);
    assert.ok(half.minor.length + half.major.length > (minor.length + major.length) * 1.8, 'bước 0.5 m dày gấp ~2');
  });
  test('tia chuột → mặt phẳng xây dựng (đúng độ cao tầng, đúng toạ độ local) khi đổi camera', () => {
    const rc = new THREE.Raycaster(), cam = new THREE.PerspectiveCamera(45, 1.6, 0.1, 500);
    for (const [floor, camOff] of [[0, [9, 14, 11]], [1, [-6, 10, 12]], [2, [12, 20, -4]]]) {
      const tgt = localToWorld(rotPlot, -2.5, 0, 4.5), y = buildPlaneY(rotPlot, floor);
      cam.position.set(tgt.x + camOff[0], y + camOff[1], tgt.z + camOff[2]); cam.lookAt(tgt.x, y, tgt.z); cam.updateMatrixWorld();
      rc.setFromCamera(new THREE.Vector2(0, 0), cam);
      const hit = getBuildPlaneIntersection(rc, rotPlot, floor);
      near(hit.local.x, -2.5, 1e-4); near(hit.local.z, 4.5, 1e-4); near(hit.world.y, y, 1e-9);
    }
  });
  test('computePreview: cọc (tâm ô), vùng (giao điểm, kích thước), thước đo (chiều dài); ngoài ranh giới = đỏ', () => {
    const S = useBuildingStore;
    S.setState({ ...S.getInitialState(), isBuildMode: true, plot: lPlot, canEdit: true, setback: 0.5, gridSize: 1, activeTool: 'marker' });
    let pv = computePreview(S.getState(), lPlot, { x: -2.3, z: 2.2 }, null, false);
    assert.deepEqual([pv.kind, pv.local, pv.valid], ['tile', { x: -2.5, z: 2.5 }, true]);
    pv = computePreview(S.getState(), lPlot, { x: 3.2, z: 3.4 }, null, false);
    assert.equal(pv.valid, false, 'phần khuyết chữ L');
    pv = computePreview(S.getState(), lPlot, { x: -2.34, z: 2.21 }, null, true);
    assert.deepEqual(pv.local, { x: -2.34, z: 2.21 }, 'giữ Alt = tự do');
    S.setState({ activeTool: 'zone' });
    pv = computePreview(S.getState(), lPlot, { x: -1.1, z: 4.9 }, { start: { x: -5, z: 1 } }, false);
    assert.deepEqual([pv.kind, pv.local, pv.size, pv.valid, pv.label], ['rect', { x: -1, z: 5 }, { w: 4, d: 4 }, true, '4 × 4 m · 16 m²']);
    pv = computePreview(S.getState(), lPlot, { x: 3.1, z: 3.1 }, { start: { x: -5, z: -5 } }, false);
    assert.equal(pv.valid, false, 'vùng chồng lên góc lõm');
    S.setState({ activeTool: 'measure' });
    pv = computePreview(S.getState(), lPlot, { x: 2.9, z: -1.1 }, { start: { x: -1, z: -4 } }, false);
    assert.deepEqual([pv.kind, pv.label], ['line', '5 m']);
  });
  test('đặt vùng qua store: footprint ngoài khoảng lùi bị từ chối, trong lô được nhận', () => {
    const S = useBuildingStore;
    S.setState({ ...S.getInitialState(), isBuildMode: true, plot: lPlot, canEdit: true, setback: 0.5 });
    assert.equal(S.getState().placeZone({ x: -6, z: 6 }, { x: -3, z: 3 }).ok, false, 'sát mép, vi phạm khoảng lùi');
    assert.ok(S.getState().placeZone({ x: -5, z: 5 }, { x: -2, z: 2 }).ok);
    const z = S.getState().design.objects[0];
    assert.deepEqual([z.type, z.position.x, z.position.z, z.size.w, z.size.d], ['zone', -3.5, 3.5, 3, 3]);
    assert.equal(validatePlacement({ plot: lPlot, design: S.getState().design, canEdit: true, type: 'zone', floor: 0, local: { x: 2, z: 2 }, size: { w: 2, d: 2 }, setback: 0 }).ok, false);
  });
});
