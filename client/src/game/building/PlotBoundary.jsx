// Ranh giới lô đất trong Build Mode (hình chữ nhật hoặc đa giác, xoay theo lô): dải sáng theo từng cạnh, cọc ở mỗi đỉnh,
// mũi tên chỉ mặt tiền (+Z local) và đường nét đứt = khoảng lùi xây dựng (setback). Xanh = được sửa, vàng = chỉ xem.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { offsetPolygon, polygonBounds } from '../../../../shared/buildGeometry.mjs';
import { buildSurfaceY, localBoundary, plotFrame } from './buildingUtils.js';

export function PlotBoundary({ plot, canEdit, setback = 0 }) {
  const f = plotFrame(plot), color = canEdit ? '#3fd0b4' : '#ffd166';
  const poly = useMemo(() => localBoundary(plot), [plot]);
  const b = polygonBounds(poly);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), [color]);
  const post = useMemo(() => new THREE.MeshBasicMaterial({ color, toneMapped: false }), [color]);
  const dashed = useMemo(() => {
    if (!(setback > 0)) return null;
    const pts = offsetPolygon(poly, setback).map(([x, z]) => new THREE.Vector3(x, 0, z));
    const g = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
    const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.9, depthWrite: false }));
    line.computeLineDistances();
    line.raycast = () => null;
    return line;
  }, [poly, setback, color]);
  useEffect(() => () => { mat.dispose(); post.dispose(); }, [mat, post]);
  useEffect(() => () => { if (dashed) { dashed.geometry.dispose(); dashed.material.dispose(); } }, [dashed]);
  const pulse = useRef(0);
  useFrame(({ clock }) => { pulse.current = clock.elapsedTime; mat.opacity = 0.7 + Math.sin(clock.elapsedTime * 3) * 0.2; });
  const y0 = buildSurfaceY(plot);
  return (
    <group position={[f.x, f.y + y0, f.z]} rotation={[0, f.rot, 0]}>
      {poly.map(([x1, z1], i) => {
        const [x2, z2] = poly[(i + 1) % poly.length], len = Math.hypot(x2 - x1, z2 - z1);
        return (
          <mesh key={i} material={mat} position={[(x1 + x2) / 2, 0.06, (z1 + z2) / 2]} rotation={[0, Math.atan2(x2 - x1, z2 - z1), 0]} raycast={() => null}>
            <boxGeometry args={[0.16, 0.1, len + 0.16]} />
          </mesh>
        );
      })}
      {poly.map(([x, z], i) => (
        <mesh key={'p' + i} material={post} position={[x, 0.6, z]} raycast={() => null}><boxGeometry args={[0.22, 1.2, 0.22]} /></mesh>
      ))}
      {dashed && <primitive object={dashed} position={[0, 0.03, 0]} />}
      {/* Mặt tiền */}
      <mesh material={mat} position={[(b.minX + b.maxX) / 2, 0.06, b.maxZ + 1.2]} rotation={[-Math.PI / 2, 0, Math.PI]} raycast={() => null}>
        <circleGeometry args={[0.8, 3]} />
      </mesh>
    </group>
  );
}
