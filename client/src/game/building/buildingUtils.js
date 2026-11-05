// Hệ toạ độ xây dựng của một lô đất (thống nhất toàn dự án, khớp server/src/plots.js):
//   - Gốc local = TÂM lô đất, trên mặt đất (y = 0).
//   - Trục X local = chiều ngang lô (width), trục Z local = chiều dài lô (length), +Z local = mặt tiền (hướng ra đường).
//   - Trục Y = chiều cao (tầng f nằm ở y = bề mặt xây dựng + elevation của tầng f trong design.levels).
//   - world = position + Ry(rotation_y) · local  (Ry giống rotation.y của three.js).
// Mọi cấu trúc lưu theo toạ độ local → không phụ thuộc camera hay vị trí lô. Phần hình học thuần nằm ở shared/buildGeometry.mjs
// (dùng chung với server để kiểm tra lại khi lưu).
import * as THREE from 'three';
import {
  FLOOR_HEIGHT, footprintInside, localBoundary, localToWorld, objectFootprint, plotFrame, pointInsideWithSetback,
  polygonBounds, rectFootprint, snapPoint, worldToLocal,
} from '../../../../shared/buildGeometry.mjs';
import { MAX_LEVELS, levelElevation } from '../../../../shared/levelGeometry.mjs';

export { FLOOR_HEIGHT, plotFrame, localBoundary, objectFootprint, rectFootprint, footprintInside };
export const MAX_FLOORS = MAX_LEVELS;
// Độ cao (local, so với mặt nền lô) của sàn tầng floor.
export const floorY = (levels, floor = 0) => levelElevation(levels, floor);
export const GRID_SIZES = [0.5, 1, 2];
// Hộp đơn vị dùng chung cho mọi khối tường / bậc thang (đáy ở y = 0, scale theo kích thước).
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
// Khoảng lùi xây dựng mặc định (m) — ghi đè bằng world_settings.build_setback.
export const DEFAULT_SETBACK = 0.5;
// Độ cao bề mặt nền lô (mặt sân phố cao hơn sân quê) — mặt phẳng xây dựng của tầng trệt nằm ngay trên đó.
const SURFACE_Y = { city: 0.14, rural: 0.055 };
export const buildSurfaceY = plot => SURFACE_Y[plot?.zone] ?? 0.06;
// Độ cao mặt phẳng xây dựng (world) của tầng floor.
export const buildPlaneY = (plot, floor = 0, levels = null) => plotFrame(plot).y + buildSurfaceY(plot) + floorY(levels, floor);

export const worldToPlotLocal = (plot, wx, wy, wz) => worldToLocal(plot, wx, wy, wz);
export const plotLocalToWorld = (plot, lx, ly, lz) => localToWorld(plot, lx, ly, lz);

// Khớp lưới theo toạ độ local. mode 'center' = tâm ô (mặc định), 'vertex' = giao điểm đường lưới.
// Lưới căn từ góc nhỏ nhất của ranh giới lô → ô luôn khớp mép lô.
export function snapToGrid(plot, lx, lz, gridSize = 1, enabled = true, mode = 'center') {
  if (!enabled) return { x: lx, z: lz };
  const b = polygonBounds(localBoundary(plot));
  return snapPoint(lx, lz, { x: b.minX, z: b.minZ }, gridSize, mode);
}

// Điểm local có nằm trong ranh giới lô (đa giác) và cách ranh giới ≥ margin mét không.
export function isInsidePlot(plot, lx, lz, margin = 0) {
  return pointInsideWithSetback(lx, lz, localBoundary(plot), margin);
}

// Giao của tia chuột với mặt phẳng xây dựng của tầng đang chọn — CHỈ raycast với mặt phẳng (không raycast cả thế giới).
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
export function getBuildPlaneIntersection(raycaster, plot, floor = 0, levels = null) {
  _plane.constant = -buildPlaneY(plot, floor, levels);
  if (!raycaster.ray.intersectPlane(_plane, _hit)) return null;
  const world = { x: _hit.x, y: _hit.y, z: _hit.z };
  return { world, local: worldToPlotLocal(plot, world.x, world.y, world.z) };
}

// 4 góc ranh giới theo world (lô hình chữ nhật) / các đỉnh đa giác.
export function plotCornersWorld(plot) {
  return localBoundary(plot).map(([x, z]) => { const w = plotLocalToWorld(plot, x, 0, z); return [w.x, w.z]; });
}

export const newObjectId = type => `${type}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
