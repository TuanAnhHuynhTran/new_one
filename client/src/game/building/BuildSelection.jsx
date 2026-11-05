// Cấu trúc đã đặt trong thiết kế (cọc đánh dấu, vùng phòng) + vòng / viền chọn và rê chuột.
import React from 'react';
import { ScreenLabel } from '../../scene/kit.jsx';
import { buildSurfaceY, floorY, plotFrame } from './buildingUtils.js';
import { useBuildingStore } from './buildingStore.js';
import { OpeningModel, WallLayer } from './WallMeshes.jsx';
import { wallAngle } from '../../../../shared/wallGeometry.mjs';
import { FloorLayer, StairMesh } from './FloorMeshes.jsx';
import { RoofLayer } from './RoofMeshes.jsx';
import { wallLength } from '../../../../shared/wallGeometry.mjs';

export function MarkerModel({ color = '#f2727a', ghost = false }) {
  const o = ghost ? 0.6 : 1;
  return (
    <group raycast={() => null}>
      <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.04, 0.05, 1.2, 8]} /><meshStandardMaterial color="#8a5a3c" transparent={ghost} opacity={o} /></mesh>
      <mesh position={[0.2, 1.05, 0]}><boxGeometry args={[0.36, 0.22, 0.02]} /><meshStandardMaterial color={color} transparent={ghost} opacity={o} /></mesh>
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.16, 0.2, 0.06, 12]} /><meshStandardMaterial color="#fff6e6" transparent={ghost} opacity={o} /></mesh>
    </group>
  );
}

function Ring({ color, r = 0.42 }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]} raycast={() => null}>
      <ringGeometry args={[r, r + 0.08, 28]} /><meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
// Vùng phòng: mặt phẳng màu nhạt + viền; nhãn kích thước khi đang chọn.
function ZoneModel({ o, current, state }) {
  const edge = state === 'selected' ? '#3fd0b4' : state === 'hover' ? '#ffffff' : current ? '#f6a27e' : '#c9b7a4';
  const { w, d } = o.size;
  return (
    <group position={[o.position.x, 0, o.position.z]} rotation={[0, o.rotation_y || 0, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} raycast={() => null} renderOrder={3}>
        <planeGeometry args={[w, d]} /><meshBasicMaterial color={current ? '#f6c9a0' : '#e8dccb'} transparent opacity={current ? 0.45 : 0.25} depthWrite={false} />
      </mesh>
      {[[0, d / 2, w, 0.08], [0, -d / 2, w, 0.08], [w / 2, 0, 0.08, d], [-w / 2, 0, 0.08, d]].map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, 0.05, z]} raycast={() => null}><boxGeometry args={[sx + 0.02, 0.04, sz + 0.02]} /><meshBasicMaterial color={edge} toneMapped={false} /></mesh>
      ))}
      {state === 'selected' && <ScreenLabel position={[0, 0.4, 0]} className="build-dim" text={`${w} × ${d} m · ${+(w * d).toFixed(2)} m²`} />}
    </group>
  );
}

// Vẽ các cấu trúc của tầng đang chọn (tầng dưới vẽ mờ).
// Đầu tường của tường đang chọn: tay nắm để kéo dời (công cụ Chọn).
function WallHandles({ w, levels }) {
  const L = wallLength(w), mid = [(w.start[0] + w.end[0]) / 2, (w.start[1] + w.end[1]) / 2];
  return (
    <group position={[0, floorY(levels, w.floor), 0]}>
      {[w.start, w.end].map((p, i) => (
        <mesh key={i} position={[p[0], w.height + 0.15, p[1]]} raycast={() => null}><sphereGeometry args={[0.18, 14, 10]} /><meshBasicMaterial color="#3fd0b4" toneMapped={false} /></mesh>
      ))}
      {[w.start, w.end].map((p, i) => (
        <mesh key={'r' + i} position={[p[0], 0.06, p[1]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}><ringGeometry args={[0.22, 0.3, 24]} /><meshBasicMaterial color="#3fd0b4" toneMapped={false} /></mesh>
      ))}
      <ScreenLabel position={[mid[0], w.height + 0.5, mid[1]]} className="build-dim" text={`${+L.toFixed(2)} m · cao ${w.height} m · dày ${w.thickness} m`} />
    </group>
  );
}

// Cửa / cửa sổ xem trước trên tường dưới con trỏ (xanh = đặt được, đỏ = không). Chỉ vẽ lại khi vị trí / kết quả đổi.
function OpeningGhost({ design }) {
  const pv = useBuildingStore(s => s.buildPreview);
  const w = pv?.opening && design.objects.find(o => o.id === pv.wallId);
  if (!w) return null;
  return (
    <group position={[w.start[0], floorY(design.levels, w.floor), w.start[1]]} rotation={[0, wallAngle(w), 0]}>
      <OpeningModel op={pv.opening} thickness={w.thickness} ghost tint={pv.valid ? '#3fd0b4' : '#f2727a'} />
    </group>
  );
}

// Cầu thang xem trước (xanh / đỏ) theo hướng chuột.
function StairGhost({ design }) {
  const pv = useBuildingStore(s => s.buildPreview);
  if (!pv?.stair) return null;
  return <StairMesh st={pv.stair} levels={design.levels} tint={pv.valid ? '#3fd0b4' : '#f2727a'} />;
}

export function BuildSelection({ plot }) {
  const design = useBuildingStore(s => s.design);
  const floor = useBuildingStore(s => s.activeFloor);
  const selected = useBuildingStore(s => s.selectedObjectId);
  const hovered = useBuildingStore(s => s.hoveredObjectId);
  const tool = useBuildingStore(s => s.activeTool);
  const wallDisplay = useBuildingStore(s => s.wallDisplay);
  const showRooms = useBuildingStore(s => s.showRooms);
  const f = plotFrame(plot), y0 = buildSurfaceY(plot);
  const showAbove = useBuildingStore(s => s.showAbove), ghostBelow = useBuildingStore(s => s.ghostBelow);
  const walls = React.useMemo(() => design.objects.filter(o => o.type === 'wall' && (o.floor <= floor || showAbove)), [design, floor, showAbove]);
  const selWall = walls.find(w => w.id === selected);
  const showRoof = useBuildingStore(s => s.showRoof);
  const selectable = tool === 'select' || tool === 'paint' || tool === 'delete';
  // Mái: nút Ẩn mái → ẩn hết. Đang chỉnh tầng dưới mái → ẩn (hoặc mờ nếu bật "Hiện tầng trên").
  // Mái của chính tầng đang chỉnh: đầy đủ khi dùng công cụ Mái / đang chọn mái, còn lại vẽ mờ để thao tác tường bên dưới.
  const roofVis = r => {
    if (!showRoof) return null;
    if (r.id === selected) return 'selected';
    if (r.floor > floor) return showAbove ? 'ghost' : null;
    if (r.floor === floor && tool !== 'roof') return 'ghost';
    return 'normal';
  };
  return (
    <>
    <WallLayer plot={plot} walls={walls} mode={wallDisplay} selectedId={selected} hoveredId={hovered} activeFloor={floor} levels={design.levels} ghostBelow={ghostBelow} selectable={selectable} />
    <RoofLayer plot={plot} design={design} visibleFn={roofVis} selectable={selectable} />
    <FloorLayer plot={plot} objects={design.objects} levels={design.levels} activeFloor={showAbove ? null : floor} labelFloor={floor} selectedId={selected} hoveredId={hovered} showRooms={showRooms} selectable={selectable} />
    <group position={[f.x, f.y + y0, f.z]} rotation={[0, f.rot, 0]}>
      {selWall && <WallHandles w={selWall} levels={design.levels} />}
      <OpeningGhost design={design} />
      <StairGhost design={design} />
      {design.objects.filter(o => o.floor <= floor && (o.type === 'marker' || o.type === 'zone')).map(o => {
        const state = o.id === selected ? 'selected' : o.id === hovered ? 'hover' : null;
        return (
          <group key={o.id} position={[0, floorY(design.levels, o.floor), 0]}>
            {o.type === 'zone' ? <ZoneModel o={o} current={o.floor === floor} state={state} /> : (
              <group position={[o.position.x, 0, o.position.z]}>
                <MarkerModel color={o.floor === floor ? '#f2727a' : '#c9b7a4'} ghost={o.floor !== floor} />
                {state === 'selected' && <Ring color="#3fd0b4" />}
                {state === 'hover' && <Ring color={tool === 'delete' || tool === 'erase' ? '#f2727a' : '#ffffff'} r={0.36} />}
              </group>
            )}
          </group>
        );
      })}
    </group>
    </>
  );
}
