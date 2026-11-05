// Thanh công cụ Build Mode (giao diện DOM, ngoài Canvas). Đọc / ghi trực tiếp buildingStore.
import React, { useEffect } from 'react';
import { GRID_SIZES, MAX_FLOORS, plotFrame } from './buildingUtils.js';
import { TOOLS, TOOL_GROUPS, WALL_DISPLAY, toolSnapMode, useBuildingStore } from './buildingStore.js';
import { WALL_LIMITS, WALL_MATERIALS, wallLength } from '../../../../shared/wallGeometry.mjs';
import { DOOR_CATALOG, OPENING_LIMITS, WINDOW_CATALOG, catalogItem } from '../../../../shared/openingGeometry.mjs';
import { LEVEL_LIMITS, STAIR_LIMITS } from '../../../../shared/levelGeometry.mjs';
import { ROOF_COLORS, ROOF_KINDS, ROOF_LIMITS, ROOF_MATERIALS } from '../../../../shared/roofGeometry.mjs';
import { FLOOR_LIMITS, FLOOR_MATERIALS, ROOM_TYPES, signedArea } from '../../../../shared/roomGeometry.mjs';

const FLOOR_NAMES = ['Tầng trệt', 'Lầu 1', 'Lầu 2'];

// Thuộc tính tường: chỉnh tường đang chọn, hoặc thuộc tính mặc định cho tường mới khi đang cầm công cụ Tường.
function WallPanel({ s }) {
  const sel = s.design.objects.find(o => o.id === s.selectedObjectId && o.type === 'wall');
  if (!sel && s.activeTool !== 'wall') return null;
  const w = sel || s.wallDefaults, id = sel?.id || null, ro = !s.canEdit;
  const step = (k, d, lim) => s.editWall(id, { [k]: Math.min(lim[1], Math.max(lim[0], +(w[k] + d).toFixed(2))) });
  return (
    <div className="bb-wall">
      <b>{sel ? `🧱 Tường ${+wallLength(sel).toFixed(2)} m` : '🧱 Tường mới'}</b>
      <span className="bb-num">Cao <button disabled={ro} onClick={() => step('height', -0.1, WALL_LIMITS.height)}>−</button><em>{w.height} m</em><button disabled={ro} onClick={() => step('height', 0.1, WALL_LIMITS.height)}>+</button></span>
      <span className="bb-num">Dày <button disabled={ro} onClick={() => step('thickness', -0.05, WALL_LIMITS.thickness)}>−</button><em>{w.thickness} m</em><button disabled={ro} onClick={() => step('thickness', 0.05, WALL_LIMITS.thickness)}>+</button></span>
      <span className="bb-mats">
        {WALL_MATERIALS.map(m => (
          <button key={m.id} disabled={ro} title={m.name} className={w.material_id === m.id ? 'sel' : ''} style={{ background: m.color }} onClick={() => s.editWall(id, { material_id: m.id })} />
        ))}
      </span>
      <label className="bb-color" title="Màu tường"><span>Màu</span><input type="color" disabled={ro} value={w.color || WALL_MATERIALS.find(m => m.id === w.material_id)?.color || '#eadcc8'} onChange={e => s.editWall(id, { color: e.target.value })} /></label>
      {sel && <span className="bb-hint">Kéo chấm tròn ở đầu tường để dời{sel.openings?.length ? ` · ${sel.openings.length} cửa` : ''}</span>}
      {sel && s.canEdit && <button className="clay-btn small danger" onClick={() => s.requestRemove(sel.id)}>Xoá tường</button>}
    </div>
  );
}

// Phòng đang chọn: đổi tên, loại phòng, vật liệu sàn; hiện diện tích (tính theo tim tường).
function RoomPanel({ s }) {
  const r = s.design.objects.find(o => o.id === s.selectedObjectId && o.type === 'room');
  if (!r) return null;
  const ro = !s.canEdit;
  return (
    <div className="bb-wall">
      <b>🏠</b>
      <input className="bb-name" value={r.name} maxLength={40} disabled={ro} onChange={e => s.editRoom(r.id, { name: e.target.value })} />
      <span className="bb-chips">
        {ROOM_TYPES.map(t => <button key={t.id} disabled={ro} className={r.room_type === t.id ? 'sel' : ''} onClick={() => s.editRoom(r.id, { room_type: t.id })}>{t.name}</button>)}
      </span>
      <span className="bb-mats" title="Vật liệu sàn của phòng">
        {FLOOR_MATERIALS.map(m => <button key={m.id} disabled={ro} title={m.name} className={r.floor_material_id === m.id ? 'sel' : ''} style={{ background: m.color }} onClick={() => s.editRoom(r.id, { floor_material_id: m.id })} />)}
      </span>
      <span className="bb-hint">{r.area} m² (tim tường){r.holes?.length ? ` · ${r.holes.length} lỗ` : ''}</span>
    </div>
  );
}
// Tấm sàn đang chọn, hoặc thuộc tính sàn mới khi cầm công cụ Sàn.
function FloorPanel({ s }) {
  const sel = s.design.objects.find(o => o.id === s.selectedObjectId && o.type === 'floor');
  if (!sel && s.activeTool !== 'floor') return null;
  const f = sel || s.floorDefaults, id = sel?.id || null, ro = !s.canEdit;
  const step = d => s.editFloor(id, { thickness: Math.min(FLOOR_LIMITS.thickness[1], Math.max(FLOOR_LIMITS.thickness[0], +(f.thickness + d).toFixed(2))) });
  return (
    <div className="bb-wall">
      <b>{sel ? `🟫 Sàn ${+Math.abs(signedArea(sel.polygon)).toFixed(2)} m²` : '🟫 Sàn mới'}</b>
      <span className="bb-num">Dày <button disabled={ro} onClick={() => step(-0.05)}>−</button><em>{f.thickness} m</em><button disabled={ro} onClick={() => step(0.05)}>+</button></span>
      <span className="bb-mats">
        {FLOOR_MATERIALS.map(m => <button key={m.id} disabled={ro} title={m.name} className={f.material_id === m.id ? 'sel' : ''} style={{ background: m.color }} onClick={() => s.editFloor(id, { material_id: m.id })} />)}
      </span>
      {sel && s.canEdit && <button className="clay-btn small danger" onClick={() => s.requestRemove(sel.id)}>Xoá sàn</button>}
    </div>
  );
}

// Cửa / cửa sổ: chọn mẫu, chỉnh rộng / cao / mép dưới / hướng mở / màu — cho lỗ đang chọn, hoặc cho lỗ mới khi cầm công cụ.
const OPENING_COLORS = ['#b98552', '#8a5a3c', '#fff7ec', '#3d3a3a', '#8fc6c9', '#f2a3a1', '#5f7f8c'];
function OpeningPanel({ s }) {
  const found = s.selectedObjectId && s.findOpening(s.selectedObjectId);
  const tool = s.activeTool === 'door' || s.activeTool === 'window' ? s.activeTool : null;
  if (!found && !tool) return null;
  const op = found ? found.opening : s.openingDefaults[tool], type = op.type, id = found ? op.id : null, ro = !s.canEdit;
  const lim = OPENING_LIMITS[type], cat = type === 'door' ? DOOR_CATALOG : WINDOW_CATALOG;
  const edit = patch => s.editOpening(id, patch, type);
  const num = (k, label, d) => lim[k] && (
    <span className="bb-num">{label} <button disabled={ro} onClick={() => edit({ [k]: Math.max(lim[k][0], +(op[k] - d).toFixed(2)) })}>−</button><em>{op[k]} m</em><button disabled={ro} onClick={() => edit({ [k]: Math.min(lim[k][1], +(op[k] + d).toFixed(2)) })}>+</button></span>
  );
  return (
    <div className="bb-wall">
      <b>{type === 'door' ? '🚪' : '🪟'} {found ? catalogItem(op.catalog_id)?.name : 'Mẫu mới'}</b>
      <span className="bb-chips">{cat.map(c => <button key={c.id} disabled={ro} className={op.catalog_id === c.id ? 'sel' : ''} onClick={() => found ? edit({ catalog_id: c.id }) : s.setOpeningCatalog(type, c.id)}>{c.name}</button>)}</span>
      {num('width', 'Rộng', 0.1)}{num('height', 'Cao', 0.1)}{type === 'window' && num('sill', 'Mép dưới', 0.1)}
      {found && <span className="bb-num">Vị trí <button disabled={ro} onClick={() => edit({ offset: op.offset - 0.1 })}>◀</button><em>{op.offset} m</em><button disabled={ro} onClick={() => edit({ offset: op.offset + 0.1 })}>▶</button></span>}
      {type === 'door' && (
        <span className="bb-chips">
          <button disabled={ro} className="sel" onClick={() => edit({ swing: op.swing === 'left' ? 'right' : 'left' })}>Bản lề {op.swing === 'left' ? 'trái' : 'phải'}</button>
          <button disabled={ro} className="sel" onClick={() => edit({ swing_dir: op.swing_dir === 'in' ? 'out' : 'in' })}>Mở {op.swing_dir === 'in' ? 'vào' : 'ra'}</button>
        </span>
      )}
      <span className="bb-mats">{OPENING_COLORS.map(c => <button key={c} disabled={ro} className={op.color === c ? 'sel' : ''} style={{ background: c }} onClick={() => edit({ color: c })} />)}</span>
      {found && s.canEdit && <button className="clay-btn small danger" onClick={() => s.requestRemove(op.id)}>Gỡ</button>}
    </div>
  );
}

// Tầng: chọn tầng, lên / xuống, thêm tầng (khi tầng dưới đủ chỗ đỡ), chiều cao tầng, gỡ tầng trên, mờ / ẩn tầng khác.
function LevelPanel({ s }) {
  const lv = s.design.levels, cur = lv[s.activeFloor], why = s.addLevelBlock(), ro = !s.canEdit;
  const issues = s.levelIssues();
  return (
    <div className="bb-wall bb-levels">
      <b>🏢 Tầng</b>
      <span className="bb-chips">
        <button disabled={s.activeFloor <= 0} onClick={() => s.setFloor(s.activeFloor - 1)} title="Xuống tầng (PageDown)">▼</button>
        {lv.map((l, i) => <button key={l.id} className={s.activeFloor === i ? 'sel' : ''} onClick={() => s.setFloor(i)}>{i === 0 ? 'Tầng trệt' : `Tầng ${i + 1}`} · {l.elevation} m</button>)}
        <button disabled={s.activeFloor >= lv.length - 1} onClick={() => s.setFloor(s.activeFloor + 1)} title="Lên tầng (PageUp)">▲</button>
        {s.canEdit && <button disabled={!!why} title={why || 'Thêm tầng mới phía trên'} onClick={() => s.addLevel()}>＋ Thêm tầng</button>}
        {s.canEdit && lv.length > 1 && <button onClick={() => s.requestRemoveLevel()} title="Gỡ tầng trên cùng (khi trống)">Gỡ tầng trên</button>}
      </span>
      <span className="bb-num">Cao tầng <button disabled={ro} onClick={() => s.setLevelHeight(s.activeFloor, cur.height - 0.1)}>−</button><em>{cur.height} m</em><button disabled={ro} onClick={() => s.setLevelHeight(s.activeFloor, cur.height + 0.1)}>+</button></span>
      <label className="bb-check"><input type="checkbox" checked={s.ghostBelow} onChange={() => s.toggle('ghostBelow')} />Tầng dưới mờ</label>
      <label className="bb-check"><input type="checkbox" checked={s.showAbove} onChange={() => s.toggle('showAbove')} />Hiện tầng trên</label>
      {issues.length > 0 && <span className="bb-bad">⚠ {issues[0].text}{issues.length > 1 ? ` (+${issues.length - 1})` : ''}</span>}
    </div>
  );
}
// Cầu thang: kiểu thẳng / chữ L, chiều rộng, hướng rẽ — cho cầu thang đang chọn hoặc cầu thang mới.
function StairPanel({ s }) {
  const sel = s.design.objects.find(o => o.id === s.selectedObjectId && o.type === 'stair');
  if (!sel && s.activeTool !== 'stair') return null;
  const st = sel || s.stairDefaults, id = sel?.id || null, ro = !s.canEdit;
  return (
    <div className="bb-wall">
      <b>🪜 {sel ? 'Cầu thang' : 'Cầu thang mới'}</b>
      <span className="bb-chips">
        {[['straight', 'Thẳng'], ['L', 'Chữ L']].map(([k, n]) => <button key={k} disabled={ro} className={st.kind === k ? 'sel' : ''} onClick={() => s.editStair(id, { kind: k })}>{n}</button>)}
        {st.kind === 'L' && <button disabled={ro} className="sel" onClick={() => s.editStair(id, { turn: st.turn === 'left' ? 'right' : 'left' })}>Rẽ {st.turn === 'left' ? 'trái' : 'phải'}</button>}
      </span>
      <span className="bb-num">Rộng <button disabled={ro} onClick={() => s.editStair(id, { width: Math.max(STAIR_LIMITS.width[0], st.width - 0.1) })}>−</button><em>{st.width} m</em><button disabled={ro} onClick={() => s.editStair(id, { width: Math.min(STAIR_LIMITS.width[1], st.width + 0.1) })}>+</button></span>
      {!sel && <span className="bb-hint">Click chân cầu thang → rê chuột chọn hướng lên → click đặt</span>}
      {sel && s.canEdit && <button className="clay-btn small danger" onClick={() => s.requestRemove(sel.id)}>Xoá cầu thang</button>}
    </div>
  );
}

// Mái của tầng đang chọn (hoặc thông số cho mái mới). Đổi loại / độ dốc / phần nhô / hướng nóc / vật liệu / màu → chỉ đổi tham số.
function RoofPanel({ s }) {
  const sel = s.design.objects.find(o => o.id === s.selectedObjectId && o.type === 'roof');
  const cur = sel || (s.activeTool === 'roof' ? s.roofOf() : null);
  if (!cur && s.activeTool !== 'roof') return null;
  const r = cur || s.roofDefaults, id = cur?.id || null, ro = !s.canEdit, warns = cur ? s.roofWarnings(cur) : [];
  const ed = patch => s.editRoof(id, patch);
  return (
    <div className="bb-wall">
      <b>🏠 {cur ? `Mái tầng ${cur.floor + 1}` : 'Mái mới'}</b>
      <span className="bb-chips">{ROOF_KINDS.map(k => <button key={k.id} disabled={ro} className={r.kind === k.id ? 'sel' : ''} onClick={() => ed({ kind: k.id })}>{k.name}</button>)}</span>
      {r.kind !== 'flat' && <span className="bb-num">Độ dốc <button disabled={ro || r.pitch <= ROOF_LIMITS.pitch[0]} onClick={() => ed({ pitch: r.pitch - 5 })}>−</button><em>{r.pitch}°</em><button disabled={ro || r.pitch >= ROOF_LIMITS.pitch[1]} onClick={() => ed({ pitch: r.pitch + 5 })}>+</button></span>}
      <span className="bb-num">Nhô <button disabled={ro || r.overhang <= ROOF_LIMITS.overhang[0]} onClick={() => ed({ overhang: r.overhang - 0.1 })}>−</button><em>{r.overhang} m</em><button disabled={ro || r.overhang >= ROOF_LIMITS.overhang[1]} onClick={() => ed({ overhang: r.overhang + 0.1 })}>+</button></span>
      {r.kind !== 'flat' && <span className="bb-chips" title="Hướng nóc mái">{[['auto', 'Nóc tự động'], ['x', 'Nóc ↔'], ['z', 'Nóc ↕']].map(([k, n]) => <button key={k} disabled={ro} className={r.ridge === k ? 'sel' : ''} onClick={() => ed({ ridge: k })}>{n}</button>)}</span>}
      <span className="bb-mats">{ROOF_MATERIALS.map(m => <button key={m.id} disabled={ro} title={m.name} className={r.material_id === m.id && !r.color ? 'sel' : ''} style={{ background: m.color }} onClick={() => ed({ material_id: m.id })} />)}</span>
      <span className="bb-mats" title="Màu mái">{ROOF_COLORS.map(c => <button key={c} disabled={ro} className={r.color === c ? 'sel' : ''} style={{ background: c }} onClick={() => ed({ color: c })} />)}</span>
      {!cur && <span className="bb-hint">Click lên lô để dựng mái cho tầng {s.activeFloor + 1} (theo các phòng khép kín)</span>}
      {warns.map(w => <span key={w} className="bb-hint">⚠ {w}</span>)}
      {cur && s.canEdit && <button className="clay-btn small danger" onClick={() => s.requestRemove(cur.id)}>Xoá mái</button>}
    </div>
  );
}

export function BuildToolbar({ token }) {
  const s = useBuildingStore();
  // Ctrl + S (gửi từ HouseBuilder) → lưu.
  useEffect(() => {
    const onSave = () => useBuildingStore.getState().save(token);
    window.addEventListener('lw-build-save', onSave);
    return () => window.removeEventListener('lw-build-save', onSave);
  }, [token]);
  if (!s.isBuildMode || !s.plot) return null;
  const f = plotFrame(s.plot), p = s.buildPreview;
  const markers = s.design.objects.filter(o => o.type === 'marker').length, zones = s.design.objects.filter(o => o.type === 'zone').length;
  const walls = s.design.objects.filter(o => o.type === 'wall').length;
  const rooms = s.design.objects.filter(o => o.type === 'room' && o.floor === s.activeFloor);
  const snapName = toolSnapMode(s.activeTool) === 'vertex' ? 'giao điểm lưới' : 'tâm ô';
  const selected = s.design.objects.find(o => o.id === s.selectedObjectId) || s.findOpening(s.selectedObjectId)?.opening || null;
  const selectedName = selected ? ({ wall: 'Tường', floor: 'Sàn', room: 'Phòng', door: 'Cửa', window: 'Cửa sổ', stair: 'Cầu thang', roof: 'Mái' }[selected.type] || 'Đối tượng') : null;
  return (
    <>
      <div className="build-topbar card">
        <div className="bb-head">
          <b>⌂ {s.canEdit ? 'Build Editor' : 'Xem thiết kế'}</b>
          <span className="bb-plot">{s.plot.plot_code} · {f.width}×{f.length} m</span>
          {!s.canEdit && <span className="bb-readonly">Chỉ xem{s.ownerName ? ` · ${s.ownerName}` : ''}</span>}
          <div className="build-floor-tabs">{s.design.levels.map((l, i) => <button key={l.id} className={s.activeFloor === i ? 'sel' : ''} onClick={() => s.setFloor(i)}>{i === 0 ? 'Tầng trệt' : `Tầng ${i + 1}`}</button>)}</div>
          <button className={`build-toggle ${s.showGrid ? 'on' : ''}`} onClick={() => s.toggle('showGrid')} title="Bật/tắt lưới (G)"># Grid</button>
          <div className="spacer" />
          {s.canEdit && <>
            <button className="clay-btn small ghost" onClick={s.undo} disabled={!s.undoStack.length} title={s.undoStack.length ? `Undo ${s.undoStack.at(-1).type} (Ctrl+Z)` : 'Không có thao tác để Undo'}>↶</button>
            <button className="clay-btn small ghost" onClick={s.redo} disabled={!s.redoStack.length} title={s.redoStack.length ? `Redo ${s.redoStack.at(-1).type} (Ctrl+Y / Ctrl+Shift+Z)` : 'Không có thao tác để Redo'}>↷</button>
            <button className="clay-btn small primary" onClick={() => s.save(token)} disabled={!s.isDirty || s.isSaving}>{s.isSaving ? 'Đang lưu…' : s.isDirty ? '💾 Lưu' : '✓ Đã lưu'}</button>
          </>}
          <button className="clay-btn small peach" onClick={() => s.exit()} title="Thoát Build Mode (B)">Thoát</button>
        </div>
      </div>

      <nav className="build-tool-rail card" aria-label="Công cụ xây dựng">
        {TOOL_GROUPS.map(group => {
          const tools = TOOLS.filter(t => t.group === group);
          return <section key={group} className="build-tool-group"><h4>{group}</h4>{tools.map(t => (
            <button key={t.id} className={`bb-tool ${s.activeTool === t.id ? 'on' : ''}`} disabled={!s.canEdit && t.id !== 'select'} onClick={() => s.setTool(t.id)} title={`${t.tip}${t.key ? ` · Phím ${t.key}` : ''}`} aria-pressed={s.activeTool === t.id}>
              <span>{t.icon}</span><small>{t.label}</small>{t.key && <i>{t.key}</i>}
            </button>
          ))}</section>;
        })}
      </nav>

      <aside className="build-inspector card">
        <header><div><small>THUỘC TÍNH</small><h3>{selectedName || (s.activeTool === 'paint' ? 'Chọn bề mặt để sơn' : 'Thiết lập công cụ')}</h3></div>{selected && <button className="inspector-close" onClick={() => s.select(null)} title="Bỏ chọn">×</button>}</header>
        {!selected && s.activeTool === 'select' && <div className="inspector-empty"><span>↖</span><p>Click một đối tượng trong viewport để chỉnh sửa.</p></div>}
        <WallPanel s={s} />
        <FloorPanel s={s} />
        <OpeningPanel s={s} />
        <StairPanel s={s} />
        <RoofPanel s={s} />
        <RoomPanel s={s} />
        <details className="inspector-levels"><summary>Tầng & hiển thị</summary><LevelPanel s={s} /></details>
        <details className="inspector-view"><summary>Tuỳ chọn viewport</summary>
          <div className="bb-opts"><div className="bb-group">{GRID_SIZES.map(g => <button key={g} className={s.gridSize === g ? 'sel' : ''} onClick={() => s.setGridSize(g)}>{g} m</button>)}</div>
          <div className="bb-group">{WALL_DISPLAY.map(d => <button key={d.id} className={s.wallDisplay === d.id ? 'sel' : ''} onClick={() => s.setWallDisplay(d.id)}>{d.label}</button>)}</div>
          {[['snapEnabled', 'Khớp lưới'], ['showRooms', 'Phòng'], ['showWalls', 'Nhà dựng sẵn'], ['showRoof', 'Mái']].map(([k, label]) => <label key={k} className="bb-check"><input type="checkbox" checked={s[k]} onChange={() => s.toggle(k)} />{label}</label>)}</div>
        </details>
      </aside>

      <div className="build-statusbar card">
        <div className="bb-status">
          <span>{p ? `x ${p.local.x.toFixed(2)} · z ${p.local.z.toFixed(2)} m (local)` : 'Rê chuột trên lô đất'}</span>
          <span>Khớp: {s.snapEnabled ? snapName : 'tự do'} · lùi {s.setback} m</span>
          {p?.label && s.activeTool !== 'marker' && <span>📐 {p.label}</span>}
          {s.measure && <span>📏 {s.measure.length} m</span>}
          {p && !p.valid && <span className="bb-bad">⚠ {p.reason}</span>}
          <span>🏠 {rooms.length} phòng ({+rooms.reduce((a, r) => a + r.area, 0).toFixed(2)} m²) · 🧱 {walls} tường · 🚩 {markers} cọc · ⬛ {zones} vùng{s.isDirty ? ' · chưa lưu' : ''}</span>
          {s.message && <span className="bb-msg">{s.message}</span>}
        </div>
        <div className="bb-help">Click: đặt / chọn · Esc: huỷ · Delete: xoá · R: xoay · G: grid · PageUp/PageDown: đổi tầng</div>
      </div>
      {s.pendingConfirm && <div className="modal-backdrop" onClick={s.cancelPending}><div className="modal card" onClick={e => e.stopPropagation()}><div className="modal-emoji" style={{ background: '#ffe4db' }}>⚠</div><h3>{s.pendingConfirm.title}</h3><p className="muted">{s.pendingConfirm.text}</p><div className="modal-actions"><button className="clay-btn ghost" onClick={s.cancelPending}>Huỷ</button><button className="clay-btn danger" onClick={s.confirmPending}>Xác nhận</button></div></div></div>}
      {s.confirmExit && (
        <div className="modal-backdrop" onClick={s.cancelExit}>
          <div className="modal card" onClick={e => e.stopPropagation()}>
            <div className="modal-emoji" style={{ background: '#fff1d2' }}>💾</div>
            <h3>Thiết kế chưa được lưu</h3>
            <p className="muted">Bạn có muốn lưu thay đổi trước khi thoát Build Mode?</p>
            <div className="modal-actions">
              <button className="clay-btn ghost" onClick={() => s.exit(true)}>Bỏ thay đổi</button>
              <button className="clay-btn primary" onClick={async () => { const r = await s.save(token); if (r.ok) useBuildingStore.getState().exit(true); }}>Lưu &amp; thoát</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
