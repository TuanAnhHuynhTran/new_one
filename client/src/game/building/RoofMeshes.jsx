// Mái nhà (Phase 02.7): dựng lưới tam giác từ roofParts (shared/roofGeometry.mjs) — luôn khớp với tường / phòng hiện tại.
// Mái bằng: tấm dày ROOF_SLAB phủ cả phần nhô. Mái dốc: mặt dốc + đầu hồi, vật liệu hai mặt (nhìn từ dưới không bị thủng).
// Ẩn / mờ mái chỉ là hiển thị — không đổi dữ liệu.
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ROOF_MATERIALS, roofParts } from '../../../../shared/roofGeometry.mjs';
import { ROOF_SLAB, roofGeometry } from './roofMesh.js';
import { buildSurfaceY, plotFrame } from './buildingUtils.js';

export { ROOF_SLAB, roofGeometry };
const matCache = new Map();
export function roofMaterial(materialId, color, variant = 'normal') {
  const key = `${materialId}|${color || ''}|${variant}`;
  if (!matCache.has(key)) {
    const m = ROOF_MATERIALS.find(x => x.id === materialId) || ROOF_MATERIALS[0];
    const mat = new THREE.MeshStandardMaterial({ color: color || m.color, roughness: m.rough, metalness: m.metal, side: THREE.DoubleSide, flatShading: true });
    if (variant === 'ghost') Object.assign(mat, { transparent: true, opacity: 0.22, depthWrite: false });
    if (variant === 'selected') { mat.emissive = new THREE.Color('#3fd0b4'); mat.emissiveIntensity = 0.35; }
    matCache.set(key, mat);
  }
  return matCache.get(key);
}

function RoofMesh({ design, roof, variant, selectable }) {
  const geo = useMemo(() => roofGeometry(roofParts(design, roof).parts), [design, roof]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (!geo.attributes.position.count) return null;
  return <mesh geometry={geo} material={roofMaterial(roof.material_id, roof.color, variant)} castShadow={variant !== 'ghost'} receiveShadow
    userData={selectable ? { buildObjectId: roof.id, buildObjectType: 'roof', buildFloor: roof.floor } : undefined} raycast={selectable ? undefined : () => null} />;
}

// visibleFn(roof) → 'normal' | 'ghost' | 'selected' | null (ẩn).
export function RoofLayer({ plot, design, visibleFn = () => 'normal', selectable = false }) {
  const f = plotFrame(plot), y0 = buildSurfaceY(plot);
  const roofs = (design?.objects || []).filter(o => o.type === 'roof');
  if (!roofs.length) return null;
  return (
    <group position={[f.x, f.y + y0, f.z]} rotation={[0, f.rot, 0]}>
      {roofs.map(r => { const v = visibleFn(r); return v ? <RoofMesh key={r.id} design={design} roof={r} variant={v} selectable={selectable} /> : null; })}
    </group>
  );
}
