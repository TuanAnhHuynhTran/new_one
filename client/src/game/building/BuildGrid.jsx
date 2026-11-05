// Lưới xây dựng: theo toạ độ local của lô (xoay cùng lô, căn từ góc lô), cắt theo ranh giới đa giác, nằm ngay trên mặt phẳng
// xây dựng của tầng đang chọn (+ 1 cm, không ghi depth → không z-fighting với nền). Một BufferGeometry cho đường mảnh, một cho
// đường đậm (mỗi 5 m); chỉ dựng lại khi đổi lô / bước lưới — không phụ thuộc chuột hay camera. Geometry được dispose khi đổi / thoát.
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildGridSegments } from './gridGeometry.js';
import { buildPlaneY, localBoundary, plotFrame } from './buildingUtils.js';

export function BuildGrid({ plot, gridSize = 1, floor = 0, levels = null }) {
  const f = plotFrame(plot);
  const poly = useMemo(() => localBoundary(plot), [plot]);
  const geo = useMemo(() => {
    const { minor, major } = buildGridSegments(poly, gridSize);
    const make = arr => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g; };
    // Mặt nền mờ đúng hình đa giác của lô.
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const fill = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    return { minor: make(minor), major: make(major), fill };
  }, [poly, gridSize]);
  useEffect(() => () => { geo.minor.dispose(); geo.major.dispose(); geo.fill.dispose(); }, [geo]);
  const mats = useMemo(() => ({
    minor: new THREE.LineBasicMaterial({ color: '#2f7f70', transparent: true, opacity: 0.42, depthWrite: false }),
    major: new THREE.LineBasicMaterial({ color: '#1f5f54', transparent: true, opacity: 0.85, depthWrite: false }),
    fill: new THREE.MeshBasicMaterial({ color: '#5fbfae', transparent: true, opacity: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  }), []);
  useEffect(() => () => Object.values(mats).forEach(m => m.dispose()), [mats]);
  mats.fill.opacity = floor ? 0.2 : 0.1;
  return (
    <group position={[f.x, buildPlaneY(plot, floor, levels) + 0.012, f.z]} rotation={[0, f.rot, 0]}>
      <lineSegments geometry={geo.minor} material={mats.minor} raycast={() => null} renderOrder={2} />
      <lineSegments geometry={geo.major} material={mats.major} raycast={() => null} renderOrder={2} />
      <mesh geometry={geo.fill} material={mats.fill} position={[0, -0.006, 0]} raycast={() => null} renderOrder={1} />
    </group>
  );
}
