import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Armchair, Compass, Heart, LogOut, RotateCw, X, DoorOpen, Home, Trash2, Video, Sprout, Minus, Plus, Settings, MousePointer2, MapPin, Hammer } from 'lucide-react';
import Game from './Game.jsx';
import { exitPointerLock, justUnlocked, usePointerLockState } from './scene/controls.js';
import { CAFE, MAP, applyWorldSettings, clockInfo, defaultPlots, facingLabel, plotGeo, plotNear, sunState } from './world.js';
import { onTimeStatus, serverNow, startTimeSync } from './time.js';
import { BuildToolbar, useBuildingStore } from './game/building/index.js';
import { doorStateMap, emitDoor, nearestDoor, worldDoors } from './game/building/doors.js';
import { PLOT_COLORS } from './scene/Plots.jsx';

const LoginScene = lazy(() => import('./scene/LoginScene.jsx'));

const request = async (path, { method = 'GET', body, token, keepalive = false } = {}) => {
  const res = await fetch('/api' + path, {
    method, keepalive,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: 'Không đọc được phản hồi API' }));
  if (!res.ok) throw Error(data.error || `API ${res.status}`);
  return data;
};

const EMOJI = { sofa: '🛋️', table: '☕', plant: '🌱', bed: '🛏️', lamp: '💡', bookshelf: '📚', rug: '🧶', chair: '🪑', fridge: '🧊' };
// Sân vườn
const CROP_EMOJI = { cabbage: '🥬', carrot: '🥕', sunflower: '🌻', tomato: '🍅', pumpkin: '🎃', orange: '🍊', apple: '🍎' };
const FISH_EMOJI = { goldfish: '🐠', koi: '🐟', guppy: '🐡' };
const FISH_KEYS = ['Digit8', 'Digit9', 'Digit0'];
const BED_SIZES = [[1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 2], [5, 3]];
const POND_SIZES = [[2, 2], [3, 2], [3, 3], [4, 3], [5, 4], [6, 4]];
const PLOT_NAME = { bed: 'Luống rau', pond: 'Hồ cá' };
const plotGrowth = (plot, crops, now) => {
  const c = plot.crop && crops.find(x => x.id === plot.crop);
  if (!c || !plot.planted_at) return 0;
  return Math.min(1, Math.max(0, (now - Date.parse(plot.planted_at)) / (c.grow * 60000)));
};
const fishCap = p => Math.min(20, p.w * p.d * 2);
const fmtLeft = ms => { const t = Math.max(1, Math.ceil(ms / 1000)), m = Math.floor(t / 60); return m ? `${m} phút ${t % 60}s` : `${t}s`; };

const TILE = { sofa: '#fde1df', table: '#f8e7d3', plant: '#e2f3dc', bed: '#ece5fa', lamp: '#fff1d2', bookshelf: '#e3f1f1', rug: '#f7ecdc', chair: '#f3e3d4', fridge: '#dcf3ef' };

// ---------- Màn hình đăng nhập ----------
function Welcome({ onAuth, loading, error }) {
  const [signup, setSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [zone, setZone] = useState('rural');
  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="pill">✦ Mô phỏng cuộc sống 3D</div>
        <h1>Life <span>World</span></h1>
        <p>Một thế giới nhỏ xinh, một cuộc sống do chính bạn vun đắp.</p>
        <div className="login-scene">
          <Suspense fallback={<div className="scene-fallback">🏡</div>}><LoginScene /></Suspense>
        </div>
        <div className="login-features">
          <span>🏡 Ngôi nhà của riêng bạn</span>
          <span>🐶 Mochi luôn bên cạnh</span>
          <span>🌇 Phố thị & làng quê</span>
        </div>
      </section>
      <form className="auth-card" onSubmit={e => { e.preventDefault(); onAuth({ username, password, zone }, signup); }}>
        <div className="eyebrow">{signup ? 'Bắt đầu cuộc sống mới' : 'Chào mừng trở lại'}</div>
        <h2>{signup ? 'Tạo cư dân mới' : 'Về nhà thôi!'}</h2>
        <p className="muted">{signup ? 'Chọn nơi bạn muốn an cư và nhận một chú cún Mochi.' : 'Đăng nhập để tiếp tục cuộc sống ở Life World.'}</p>
        <label>Tên đăng nhập</label>
        <input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="ten_cua_ban" required minLength={3} maxLength={30} />
        <label>Mật khẩu</label>
        <input type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Ít nhất 8 ký tự" required minLength={8} />
        {signup && (
          <>
            <label>Chọn nơi sinh sống</label>
            <div className="zone-options">
              <button type="button" className={zone === 'city' ? 'selected' : ''} onClick={() => setZone('city')}><span>🏙️</span><strong>Thành thị</strong><small>Nhộn nhịp, tiện nghi</small></button>
              <button type="button" className={zone === 'rural' ? 'selected' : ''} onClick={() => setZone('rural')}><span>🌾</span><strong>Nông thôn</strong><small>Yên bình, có vườn</small></button>
            </div>
          </>
        )}
        {error && <div className="error">{error}</div>}
        <button className="clay-btn primary big" disabled={loading}>{loading ? 'Đang xử lý...' : signup ? 'Bắt đầu cuộc sống →' : 'Vào thế giới →'}</button>
        <button type="button" className="link-btn" onClick={() => setSignup(!signup)}>{signup ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}</button>
        {!signup && <div className="demo-hint">Tài khoản dùng thử: <b>demo</b> / <b>demo1234</b></div>}
      </form>
    </div>
  );
}

// ---------- Lô đất: thông tin, màn hình chọn đất ----------
const ZONE_NAME = { city: 'Thành thị', rural: 'Nông thôn' };
const STATUS_NAME = { available: 'Còn trống', owned: 'Đã có chủ', reserved: 'Đã đặt trước', disabled: 'Đang quy hoạch' };
function PlotFacts({ p }) {
  return (
    <div className="plot-facts">
      <span><small>Mã lô</small><b>{p.plot_code}</b></span>
      <span><small>Khu vực</small><b>{ZONE_NAME[p.zone]}</b></span>
      <span><small>Kích thước</small><b>{p.width} × {p.length} m</b></span>
      <span><small>Diện tích</small><b>{p.width * p.length} m²</b></span>
      <span><small>Mặt tiền</small><b>Hướng {facingLabel(p.rotation_y)}</b></span>
      <span><small>Trạng thái</small><b className={`st-${p.status}`}>{STATUS_NAME[p.status]}</b></span>
    </div>
  );
}
// Lý do không nhận được lô (null = nhận được).
const claimBlock = (p, me) => (me.plot_id ? `Bạn đã sở hữu lô ${me.plot_code} — mỗi nhân vật chỉ có một lô trong MVP.`
  : p.status === 'owned' ? 'Lô này đã có chủ.' : p.status === 'reserved' ? 'Lô này đã được đặt trước (nhà dân).' : p.status === 'disabled' ? 'Lô này đang quy hoạch, tạm khoá.' : null);

function PlotPicker({ plots, me, zone, selId, onZone, onSelect, onClaim, claiming, onClose }) {
  const free = plots.filter(p => p.status === 'available');
  const list = free.filter(p => zone === 'all' || p.zone === zone);
  const sel = plots.find(p => p.id === selId);
  const block = sel && claimBlock(sel, me);
  return (
    <aside className="plot-picker card">
      <div className="pp-head">
        <b>🗺️ Chọn lô đất</b>
        <small>{me.plot_id ? `Bạn đang sở hữu lô ${me.plot_code}` : 'Chọn một lô đất trống để dựng nhà của bạn'}</small>
      </div>
      <div className="segmented">
        {['all', 'city', 'rural'].map(z => (
          <button key={z} className={zone === z ? 'active' : ''} onClick={() => onZone(z)}>
            {z === 'all' ? 'Tất cả' : ZONE_NAME[z]} <i>{free.filter(p => z === 'all' || p.zone === z).length}</i>
          </button>
        ))}
      </div>
      <div className="pp-list">
        {list.length ? list.map(p => (
          <button key={p.id} className={`pp-item ${p.id === selId ? 'sel' : ''}`} onClick={() => onSelect(p.id)}>
            <span className="pp-ico">{p.zone === 'city' ? '🏙️' : '🌾'}</span>
            <span className="pp-txt"><b>{p.plot_code}</b><small>{p.width}×{p.length} m · mặt tiền hướng {facingLabel(p.rotation_y)}</small></span>
          </button>
        )) : <div className="pp-empty">Khu vực này đã hết lô trống</div>}
      </div>
      {sel && (
        <div className="pp-detail">
          <PlotFacts p={sel} />
          {block ? <div className="pp-warn">{block}</div> : (
            <button className="clay-btn primary full" disabled={claiming} onClick={() => onClaim(sel)}>{claiming ? 'Đang xác nhận…' : `🏡 Nhận lô ${sel.plot_code}`}</button>
          )}
        </div>
      )}
      <button className="link-btn" onClick={onClose}>{me.plot_id ? 'Đóng' : 'Đi dạo xem đất trước →'}</button>
    </aside>
  );
}

function PlotInfo({ p, me, claiming, onClaim, onClose }) {
  const block = claimBlock(p, me);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card plot-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}><X size={16} /></button>
        <div className="modal-emoji" style={{ background: p.status === 'available' ? '#dcf3ef' : '#f7ecdc' }}>{p.status === 'available' ? '🪧' : p.status === 'disabled' ? '🚧' : '🏡'}</div>
        <h3>{p.status === 'available' ? 'Đất chưa có chủ' : p.status === 'owned' ? `Nhà của ${p.owner_name || '?'}` : STATUS_NAME[p.status]}</h3>
        <PlotFacts p={p} />
        {block ? <p className="muted">{block}</p> : <p className="muted">Nhận lô này để xây nhà, trang trí và làm sân vườn. Mỗi nhân vật được sở hữu một lô đất.</p>}
        <div className="modal-actions">
          <button className="clay-btn ghost" onClick={onClose}>Đóng</button>
          {!block && <button className="clay-btn primary" disabled={claiming} onClick={() => onClaim(p)}>{claiming ? 'Đang xác nhận…' : '🏡 Nhận lô đất'}</button>}
        </div>
      </div>
    </div>
  );
}

// ---------- Bản đồ nhỏ ----------
const MM = 168, { x0: MX0, x1: MX1, z0: MZ0, z1: MZ1 } = { x0: -56, x1: 96, z0: -76, z1: 76 };
const mx = x => ((x - MX0) / (MX1 - MX0)) * MM, mz = z => ((z - MZ0) / (MZ1 - MZ0)) * MM;
function Minimap({ plots, me, pos, selectedId }) {
  const nodes = plots.length ? plots : defaultPlots();
  return (
    <div className="minimap card">
      <svg viewBox={`0 0 ${MM} ${MM}`} width={MM} height={MM}>
        <rect width={MM} height={MM} rx="14" fill="#a9dc84" />
        <rect x={mx(-50)} y={mz(-52)} width={mx(-2) - mx(-50)} height={mz(52) - mz(-52)} rx="3" fill="#e6dfd2" />
        {MAP.avenues.map(x => <rect key={x} x={mx(x - 3)} y={mz(-52)} width={mx(3) - mx(0)} height={mz(52) - mz(-52)} fill="#8b929c" />)}
        {MAP.cityStreets.map(z => <rect key={z} x={mx(-47)} y={mz(z - 2)} width={mx(-4) - mx(-47)} height={mz(2) - mz(-2)} fill="#8b929c" />)}
        {MAP.ruralPathsZ.map(z => <rect key={z} x={mx(-4)} y={mz(z - 2)} width={mx(90) - mx(-4)} height={mz(2) - mz(-2)} fill="#e3c899" />)}
        <rect x={mx(MAP.ruralPathX - 2)} y={0} width={mx(2) - mx(-2)} height={MM} fill="#e3c899" />
        <rect x={mx(MAP.streamX - 1.7)} y={0} width={mx(1.7) - mx(-1.7)} height={MM} fill="#7fd0e6" />
        <rect x={mx(CAFE.x - 3)} y={mz(CAFE.z - 3)} width={mx(3) - mx(-3)} height={mz(3) - mz(-3)} rx="1.5" fill="#f08a3c" />
        {nodes.map(p => {
          const g = plotGeo(p), hw = g.width / 2, hl = g.length / 2, own = p.id === me.plot_id, sel = p.id === selectedId;
          const fill = own ? PLOT_COLORS.mine : p.status === 'available' ? '#dff5ea' : p.status === 'disabled' ? '#d7d9dc' : p.zone === 'rural' ? '#c6e9a4' : '#f6c9a0';
          return <rect key={p.id} x={mx(g.x - hw)} y={mz(g.z - hl)} width={mx(hw) - mx(-hw)} height={mz(hl) - mz(-hl)} rx="2" fill={fill}
            stroke={sel ? '#ffb703' : own ? '#fff' : p.status === 'available' ? PLOT_COLORS.available : 'none'} strokeWidth={sel ? 3 : 1.5}
            strokeDasharray={p.status === 'available' && !sel ? '3 2' : undefined} />;
        })}
        <g transform={`translate(${mx(pos.x)} ${mz(pos.z)}) rotate(${(-pos.angle * 180) / Math.PI})`}>
          <circle r="7" fill="#ffffff" opacity=".6" />
          <path d="M0 6 L4.2 -3.5 L0 -1.5 L-4.2 -3.5 Z" fill="#3f6fd8" stroke="#fff" strokeWidth="1.2" />
        </g>
      </svg>
      <div className="minimap-legend"><span><i style={{ background: '#f2727a' }} />Nhà bạn</span><span><i style={{ background: '#dff5ea', outline: '1px dashed #3fb39e' }} />Đất trống</span><span><i style={{ background: '#f08a3c' }} />Cà phê</span></div>
    </div>
  );
}

// ---------- Ứng dụng ----------
export default function App() {
  const [token, setToken] = useState(() => { try { return localStorage.getItem('life_token') || ''; } catch { return ''; } });
  const [me, setMe] = useState(null);
  const [plots, setPlots] = useState([]);
  const [furniture, setFurniture] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [mode, setMode] = useState('world');
  const [placing, setPlacing] = useState(null);
  const [rot, setRot] = useState(0);
  const [clock, setClock] = useState(() => clockInfo());
  const [timeOk, setTimeOk] = useState(true);
  const [sun, setSun] = useState(() => sunState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [feedTick, setFeedTick] = useState(0);
  const [confirmItem, setConfirmItem] = useState(null);
  const [moving, setMoving] = useState(null);
  // Góc nhìn thứ 3 (mặc định, V để bật/tắt), nhớ lựa chọn trên trình duyệt này.
  const [thirdPerson, setThirdPerson] = useState(() => { try { return localStorage.getItem('life_view') !== 'iso'; } catch { return true; } });
  // Cài đặt chuột: độ nhạy Mouse Look và đảo trục dọc.
  const [mouseCfg, setMouseCfg] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem('life_mouse') || '{}'); return { sens: Number(c.sens) > 0 ? Number(c.sens) : 1, invertY: !!c.invertY }; } catch { return { sens: 1, invertY: false }; }
  });
  const saveMouse = patch => setMouseCfg(c => { const n = { ...c, ...patch }; try { localStorage.setItem('life_mouse', JSON.stringify(n)); } catch { /* bỏ qua */ } return n; });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lock = usePointerLockState();
  const toggleView = useCallback(() => setThirdPerson(v => {
    try { localStorage.setItem('life_view', v ? 'iso' : 'tp'); } catch { /* bỏ qua */ }
    return !v;
  }), []); // món đã đặt đang được nhấc lên để di chuyển
  // Sân vườn: dữ liệu vườn, khu đang cầm để xây / dời, khu trước mặt, hạt giống và loại cá đang chọn.
  const [garden, setGarden] = useState(null);
  // Thiết kế nhà đã lưu của mọi lô (tường + va chạm trong Explore Mode); cập nhật khi Build Mode lưu xong.
  const [designs, setDesigns] = useState([]);
  useEffect(() => {
    if (!token) return undefined;
    request('/house-designs').then(r => setDesigns(r.designs || [])).catch(() => {});
    const onSaved = e => setDesigns(ds => [...ds.filter(d => d.plot_id !== e.detail.plot_id), e.detail]);
    window.addEventListener('lw-design-saved', onSaved);
    return () => window.removeEventListener('lw-design-saved', onSaved);
  }, [token]);
  // Cửa đang mở (server giữ trạng thái, chỉ chủ nhà được mở / đóng).
  const [doorList, setDoorList] = useState([]);
  useEffect(() => { if (token) request('/door-states').then(r => setDoorList(r.doors || [])).catch(() => {}); }, [token]);
  const doorStates = useMemo(() => doorStateMap(doorList), [doorList]);
  const [gHeld, setGHeld] = useState(null);
  const [gTarget, setGTarget] = useState(null);
  const [seed, setSeed] = useState('cabbage');
  const [fishKind, setFishKind] = useState('goldfish');
  const [buildSize, setBuildSize] = useState({ bed: [2, 2], pond: [3, 2] });
  const [confirmPlot, setConfirmPlot] = useState(null);
  const [pos, setPos] = useState({ x: 0, z: 0, angle: 0 });
  // Lô đất: màn hình chọn đất { zone, sel }, lô đang xem thông tin, đang gửi yêu cầu nhận đất, lệnh dịch chuyển nhân vật.
  const [picker, setPicker] = useState(null);
  const [plotInfoId, setPlotInfoId] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [teleport, setTeleport] = useState(null);
  const posRef = useRef(null), lastSent = useRef('');

  useEffect(() => { const id = setInterval(() => { setClock(clockInfo()); setSun(sunState()); }, 1000); return () => clearInterval(id); }, []);
  // Thời gian thế giới: đồng bộ với server ngay khi mở trang, rồi tự nội suy + đồng bộ lại định kỳ (xem time.js).
  useEffect(() => {
    let stop = startTimeSync(300);
    const off = onTimeStatus(st => setTimeOk(!st.error));
    request('/world/settings').then(r => {
      applyWorldSettings(r.settings);
      if (Number.isFinite(r.settings?.build_setback)) useBuildingStore.getState().setSetback(r.settings.build_setback);
      setClock(clockInfo()); setSun(sunState());
      if (r.settings?.time_sync_interval_sec && r.settings.time_sync_interval_sec !== 300) { stop(); stop = startTimeSync(r.settings.time_sync_interval_sec); }
    }).catch(() => { /* dùng cấu hình mặc định */ });
    return () => { stop(); off(); };
  }, []);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 2600); return () => clearTimeout(id); }, [notice]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([request('/me', { token }), request('/world'), request('/house/furniture', { token }), request('/catalog'), request('/garden', { token }).catch(() => null)])
      .then(([m, w, f, c, g]) => {
        if (cancelled) return;
        setMe(m); setPlots(w.plots); setFurniture(f); setCatalog(c); setGarden(g); setError('');
        // Chưa có lô đất (vừa đăng ký) → mở màn hình chọn đất, lọc sẵn theo khu vực đã chọn khi đăng ký.
        if (!m.plot_id) setPicker({ zone: m.zone_pref || 'all', sel: null });
        setPos({ x: Number(m.last_x), z: Number(m.last_z), angle: 0 });
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message);
        if (e.message.includes('đăng nhập')) { try { localStorage.removeItem('life_token'); } catch { /* bỏ qua */ } setToken(''); }
      });
    return () => { cancelled = true; };
  }, [token]);

  // Lưu vị trí định kỳ, khi ẩn tab và khi đóng trang (keepalive để request không bị hủy); bỏ qua nếu vị trí không đổi.
  useEffect(() => {
    if (!token || !me) return;
    const save = () => {
      const p = posRef.current;
      if (!p) return;
      const key = p.x.toFixed(2) + ',' + p.z.toFixed(2);
      if (key === lastSent.current) return;
      lastSent.current = key;
      request('/character/position', { method: 'POST', token, body: { x: p.x, z: p.z }, keepalive: true }).catch(() => { lastSent.current = ''; });
    };
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    const id = setInterval(save, 10000);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', save); save(); };
  }, [token, me?.id]);

  // Cập nhật minimap ~6 lần/giây thay vì mỗi frame.
  useEffect(() => {
    if (!me) return;
    const id = setInterval(() => { const p = posRef.current; if (p) setPos(prev => (prev.x === p.x && prev.z === p.z && prev.angle === p.angle ? prev : { x: p.x, z: p.z, angle: p.angle })); }, 160);
    return () => clearInterval(id);
  }, [me?.id]);

  const heldKind = catalog.find(c => c.id === placing)?.kind || null;
  const held = useMemo(() => (moving ? { kind: moving.kind, id: moving.id } : heldKind ? { kind: heldKind } : null), [moving, heldKind]);
  const [target, setTarget] = useState(null); // món đồ trước mặt nhân vật trong nhà

  const nearHome = useMemo(() => {
    if (!me?.plot_id || mode !== 'world') return false;
    const rural = me.zone === 'rural';
    return Math.abs(pos.x - Number(me.world_x)) < (rural ? 8 : 7.5) && Math.abs(pos.z - Number(me.world_z)) < (rural ? 8 : 7.5);
  }, [me, pos, mode]);

  // ---------- Build Mode (House Builder) ----------
  const buildMode = useBuildingStore(st => st.isBuildMode);
  const openBuild = useBuildingStore(st => st.open);
  // Lô nhân vật đang đứng (trong ranh giới, nới 0.3 m).
  // Cửa gần nhân vật (tầng trệt của nhà đã lưu) → "Nhấn E để mở cửa".
  const doors = useMemo(() => worldDoors(plots, designs), [plots, designs]);
  const nearDoor = useMemo(() => (me && mode === 'world' ? nearestDoor(doors, pos.x, pos.z) : null), [me, mode, doors, pos]);
  const nearDoorOpen = !!(nearDoor && doorStates.get(nearDoor.plot_id)?.has(nearDoor.opening_id));
  const nearDoorMine = !!(nearDoor && nearDoor.plot_id === me?.plot_id);
  const toggleDoor = useCallback(async () => {
    if (!nearDoor) return;
    try {
      const r = await request(`/land-plots/${nearDoor.plot_id}/doors/${nearDoor.opening_id}`, { method: 'POST', token, body: { open: !nearDoorOpen } });
      setDoorList(list => [...list.filter(d => !(d.plot_id === r.plot_id && d.opening_id === r.opening_id)), r]);
      emitDoor({ type: 'door:toggle', ...r }); // chuẩn bị đồng bộ multiplayer
    } catch (e) { setNotice(e.message); }
  }, [nearDoor, nearDoorOpen, token]);
  const standingPlot = useMemo(() => (me && mode === 'world' ? plotNear(plots, pos.x, pos.z, 0.3) : null), [me, mode, plots, pos]);
  const onOwnPlot = !!(standingPlot && me?.plot_id && standingPlot.id === me.plot_id);
  // B: mở Build Mode cho lô đang đứng. Server quyết định quyền: chủ lô → chỉnh sửa, người khác → chỉ xem.
  const tryBuild = useCallback(async () => {
    if (!me) return;
    if (!standingPlot) { setNotice(me.plot_id ? 'Hãy đứng trên lô đất của bạn để xây nhà (nhấn H để về nhà)' : 'Bạn chưa có lô đất — hãy chọn một lô trước'); return; }
    if (standingPlot.id !== me.plot_id && standingPlot.status !== 'owned') { setNotice('Lô này chưa có chủ — không có nhà để xem'); return; }
    const r = await openBuild(standingPlot, token);
    if (!r.ok) setNotice(r.reason || 'Không mở được Build Mode');
    else if (!r.canEdit) setNotice('👀 Chế độ xem — chỉ chủ lô đất mới được chỉnh sửa');
  }, [me, standingPlot, openBuild, token]);
  // B / Esc trong Build Mode: Esc bỏ công cụ đang cầm trước, lần nữa mới thoát; có thay đổi chưa lưu thì hỏi lại.
  const buildEscape = useCallback(code => {
    const st = useBuildingStore.getState();
    if (st.pendingConfirm) st.cancelPending();
    else if (st.confirmExit) st.cancelExit();
    // Esc khi đang vẽ tường: huỷ đoạn đang xem trước, giữ công cụ Tường.
    else if (code === 'Escape' && (st.wallDraft || st.floorDraft || st.stairDraft)) st.cancelWall();
    else if (code === 'Escape' && st.canEdit && st.activeTool !== 'select') st.setTool('select');
    else st.exit();
  }, []);

  // Lô đất (không phải của mình) mà nhân vật đang đứng trong / sát ranh giới → "Nhấn E để xem lô đất".
  const nearPlot = useMemo(() => (me && mode === 'world' && !picker && !nearHome ? plotNear(plots, pos.x, pos.z, 1.5, me.plot_id) : null), [me, mode, picker, nearHome, plots, pos]);
  const plotInfo = plots.find(p => p.id === plotInfoId) || null;
  const refreshPlots = useCallback(async () => { try { const w = await request('/world'); setPlots(w.plots); } catch { /* giữ dữ liệu cũ */ } }, []);
  // Đang chọn / xem lô → cập nhật trạng thái lô từ server mỗi 8 giây (người khác có thể vừa nhận mất).
  const watchingPlots = !!(picker || plotInfoId);
  useEffect(() => { if (!watchingPlots) return undefined; const id = setInterval(refreshPlots, 8000); return () => clearInterval(id); }, [watchingPlots, refreshPlots]);
  // Màn hình chọn đất: luôn có một lô đang chọn; lô đang chọn vừa có chủ → báo và chọn lô khác.
  useEffect(() => {
    if (!picker) return;
    const list = plots.filter(p => p.status === 'available' && (picker.zone === 'all' || p.zone === picker.zone));
    const cur = plots.find(p => p.id === picker.sel);
    if (cur && list.includes(cur)) return;
    if (cur && cur.status !== 'available' && cur.id !== me?.plot_id) setNotice(`Lô ${cur.plot_code} vừa có chủ — hãy chọn lô khác`);
    const next = list[0]?.id ?? null;
    if (next !== picker.sel) setPicker(pk => ({ ...pk, sel: next }));
  }, [picker, plots, me?.plot_id]);
  const openPicker = useCallback(() => {
    setMode('world'); setPlacing(null); setMoving(null); setPlotInfoId(null);
    setPicker({ zone: me?.plot_id ? 'all' : me?.zone_pref || 'all', sel: null });
  }, [me?.plot_id, me?.zone_pref]);
  // Nhận lô đất: backend quyết định quyền sở hữu; lỗi (lô vừa có chủ…) → báo và cập nhật lại danh sách.
  const claimPlot = async plot => {
    if (claiming) return;
    setClaiming(true);
    try {
      const r = await request(`/land-plots/${plot.id}/claim`, { method: 'POST', token });
      setMe(r.me);
      const [w, f, g] = await Promise.all([request('/world'), request('/house/furniture', { token }).catch(() => []), request('/garden', { token }).catch(() => null)]);
      setPlots(w.plots); setFurniture(f); setGarden(g);
      setPicker(null); setPlotInfoId(null);
      setTeleport({ x: r.plot.spawn_x, z: r.plot.spawn_z, angle: Math.PI + Number(r.plot.rotation_y || 0), seq: Date.now() });
      setNotice(`🎉 Chúc mừng! Lô ${r.plot.plot_code} giờ là của bạn`);
    } catch (e) {
      setNotice(e.message);
      refreshPlots();
    } finally { setClaiming(false); }
  };
  // Về nhà: server đặt lại vị trí về trước cổng lô đất của mình.
  const goHome = useCallback(async () => {
    if (!me?.plot_id) return;
    try {
      // Backend kiểm tra quyền sở hữu và trả điểm xuất hiện đã lưu — client không gửi toạ độ.
      const spot = await request('/characters/return-home', { method: 'POST', token });
      setTeleport({ x: spot.x, z: spot.z, angle: Number.isFinite(spot.rotation_y) ? spot.rotation_y : Math.PI, seq: Date.now() });
      setNotice('🏠 Đã về trước cổng nhà');
    } catch (e) { setNotice(e.message); }
  }, [me?.plot_id, token]);

  // Vào nhà từ ngoài đường → cửa chính; từ sân vườn → cửa sau. Ra vườn từ trong nhà → đứng ngay trước cửa sau.
  const [houseEntry, setHouseEntry] = useState('front');
  const [gardenEntry, setGardenEntry] = useState('yard');
  const [houseLevel, setHouseLevel] = useState(0);
  // Ngắm cảnh trên sân thượng: góc nhìn thứ 3 + khoá chuột để nhìn sang các toà nhà bên cạnh. Rời sân thượng / ra khỏi nhà thì tắt.
  const [roofView, setRoofView] = useState(false);
  useEffect(() => { if (mode !== 'interior' || houseLevel !== 2) setRoofView(false); }, [mode, houseLevel]);
  useEffect(() => { if (roofView) { setPlacing(null); setMoving(null); } }, [roofView]);
  const enterHome = useCallback(() => {
    setHouseEntry(mode === 'garden' ? 'back' : 'front'); setHouseLevel(0);
    setMode('interior'); setPlacing(null); setMoving(null); setGHeld(null); setGTarget(null); setConfirmPlot(null);
  }, [mode]);
  const leaveHome = useCallback(() => { setMode('world'); setPlacing(null); setMoving(null); setConfirmItem(null); setTarget(null); setGHeld(null); setGTarget(null); setConfirmPlot(null); }, []);
  const enterGarden = useCallback(() => { setGardenEntry(mode === 'interior' ? 'house' : 'yard'); setMode('garden'); setPlacing(null); setMoving(null); setConfirmItem(null); setTarget(null); }, [mode]);
  // Nhân vật đi qua cửa chính / cửa sau trong nhà.
  const exitHouse = useCallback(to => { if (to === 'garden' && garden) enterGarden(); else leaveHome(); }, [garden, enterGarden, leaveHome]);
  const cancelHold = useCallback(() => { setPlacing(null); setMoving(null); }, []);
  const pickItem = useCallback(item => { setPlacing(null); setMoving(item); setRot(Number(item.rotation_y) || 0); }, []);
  const rotate = useCallback(() => setRot(r => (r + Math.PI / 2) % (Math.PI * 2)), []);
  const onBlocked = useCallback(() => setNotice('Chỗ này bị vướng, hãy đứng chỗ khác 🙈'), []);
  // Xoay tại chỗ món đồ đang đứng trước mặt (chuột phải / R khi tay không).
  const rotateItem = useCallback(async item => {
    const rotation = +(((Number(item.rotation_y) || 0) + Math.PI / 2) % (Math.PI * 2)).toFixed(3);
    setFurniture(f => f.map(it => (it.id === item.id ? { ...it, rotation_y: rotation } : it)));
    try {
      const saved = await request('/house/furniture/' + item.id, { method: 'PUT', token, body: { x: Number(item.pos_x), z: Number(item.pos_z), floor: Number(item.floor || 0), rotation } });
      setFurniture(f => f.map(it => (it.id === item.id ? saved : it)));
    } catch (e) {
      setFurniture(f => f.map(it => (it.id === item.id ? item : it)));
      setNotice('Lỗi: ' + e.message);
    }
  }, [token]);

  // ---------- Sân vườn ----------
  const crops = garden?.crops || [];
  const updatePlot = useCallback(plot => setGarden(g => ({ ...g, plots: g.plots.map(p => (p.id === plot.id ? plot : p)) })), []);
  const startBuild = useCallback((kind, size) => {
    const [w, d] = size || buildSize[kind];
    if (size) setBuildSize(b => ({ ...b, [kind]: size }));
    setGHeld(h => (h && !h.id && h.kind === kind && (!size || (h.w === w && h.d === d)) ? null : { kind, w, d }));
  }, [buildSize]);
  const rotateGHeld = useCallback(() => setGHeld(h => (h ? { ...h, w: h.d, d: h.w } : h)), []);
  const pickPlot = useCallback(plot => setGHeld({ ...plot }), []);
  const placePlot = useCallback(async ({ x, z }) => {
    const h = gHeld;
    if (!h) return;
    if (h.id) {
      const old = garden.plots.find(p => p.id === h.id);
      updatePlot({ ...old, x, z, w: h.w, d: h.d });
      setGHeld(null);
      try { updatePlot(await request('/garden/plots/' + h.id, { method: 'PUT', token, body: { x, z, w: h.w, d: h.d } })); }
      catch (e) { if (old) updatePlot(old); setNotice('Lỗi: ' + e.message); }
      return;
    }
    try {
      const saved = await request('/garden/plots', { method: 'POST', token, body: { kind: h.kind, x, z, w: h.w, d: h.d } });
      setGarden(g => ({ ...g, plots: [...g.plots, saved] }));
      setNotice(`Đã xây ${PLOT_NAME[h.kind].toLowerCase()} ${h.w}×${h.d} ✨`);
    } catch (e) { setNotice('Lỗi: ' + e.message); }
  }, [gHeld, garden, token, updatePlot]);
  // Chuột trái lên một khu: gieo hạt / thu hoạch / thả cá.
  const plotAction = useCallback(async plot => {
    try {
      if (plot.kind === 'pond') {
        if (plot.fish.length >= fishCap(plot)) { setNotice('Hồ đã đầy cá — hãy xây hồ to hơn 🐟'); return; }
        updatePlot(await request(`/garden/plots/${plot.id}/fish`, { method: 'POST', token, body: { species: fishKind } }));
        setNotice(`Đã thả ${garden.fish.find(f => f.id === fishKind)?.name || 'cá'} ${FISH_EMOJI[fishKind]}`);
        return;
      }
      if (!plot.crop) {
        updatePlot(await request(`/garden/plots/${plot.id}/plant`, { method: 'POST', token, body: { crop: seed } }));
        setNotice(`Đã gieo ${crops.find(c => c.id === seed)?.name} ${CROP_EMOJI[seed]}`);
        return;
      }
      const c = crops.find(x => x.id === plot.crop);
      const g = plotGrowth(plot, crops, serverNow());
      if (g < 1) { setNotice(`${c?.name} đang lớn ${Math.floor(g * 100)}% · còn ${fmtLeft((1 - g) * c.grow * 60000)} ⏳`); return; }
      const r = await request(`/garden/plots/${plot.id}/harvest`, { method: 'POST', token });
      updatePlot(r.plot);
      setGarden(gd => ({ ...gd, harvests: r.harvests }));
      setNotice(`Thu hoạch ${c?.name} ${CROP_EMOJI[plot.crop]} ${c?.tree ? '· quả sẽ mọc lại' : ''}`);
    } catch (e) { setNotice(e.message); }
  }, [token, seed, fishKind, crops, garden, updatePlot]);
  const removePlot = async () => {
    const plot = confirmPlot;
    setConfirmPlot(null);
    try {
      await request('/garden/plots/' + plot.id, { method: 'DELETE', token });
      setGarden(g => ({ ...g, plots: g.plots.filter(p => p.id !== plot.id) }));
      setGHeld(h => (h?.id === plot.id ? null : h));
      setNotice(`Đã dọn ${PLOT_NAME[plot.kind].toLowerCase()}`);
    } catch (e) { setNotice(e.message); }
  };
  const resizeGarden = async (dw, dd) => {
    const width = garden.width + dw, depth = garden.depth + dd, l = garden.limits;
    if (width < l.minW || width > l.maxW || depth < l.minD || depth > l.maxD) { setNotice(`Vườn rộng ${l.minW}–${l.maxW} m, sâu ${l.minD}–${l.maxD} m`); return; }
    try { const g = await request('/garden', { method: 'PUT', token, body: { width, depth } }); setGarden(old => ({ ...old, ...g })); }
    catch (e) { setNotice(e.message); }
  };

  useEffect(() => {
    if (!me) return;
    const onKey = e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || e.repeat) return;
      // Esc khi đang khoá chuột chỉ để thả chuột (trình duyệt xử lý), không thoát khỏi cảnh.
      if (e.code === 'Escape' && (document.pointerLockElement || justUnlocked())) return;
      if (e.code === 'Escape' && settingsOpen) { setSettingsOpen(false); return; }
      if (e.code === 'KeyV') { if (mode !== 'interior') toggleView(); else if (houseLevel === 2) setRoofView(v => !v); return; }
      // Build Mode: chỉ nhận B / Esc để thoát; các phím khác do HouseBuilder / BuildCamera xử lý.
      if (buildMode) { if (e.code === 'KeyB' || e.code === 'Escape') buildEscape(e.code); return; }
      if (e.code === 'Escape' && plotInfoId) { setPlotInfoId(null); return; }
      if (e.code === 'Escape' && picker) { setPicker(null); return; }
      if (picker || plotInfoId) return;
      if (mode === 'world' && e.code === 'KeyH' && me.plot_id) { goHome(); return; }
      if (mode === 'world' && e.code === 'KeyB') { tryBuild(); return; }
      if (mode === 'world' && e.code === 'KeyE' && nearDoor) { toggleDoor(); return; }
      if (mode === 'world' && e.code === 'KeyE' && !nearHome && nearPlot) { setPlotInfoId(nearPlot.id); return; }
      if (mode === 'world' && e.code === 'KeyE' && nearHome) enterHome();
      else if (mode === 'world' && e.code === 'KeyG' && nearHome && garden) enterGarden();
      else if (mode === 'garden') {
        const digit = /^Digit([1-7])$/.exec(e.code), fi = FISH_KEYS.indexOf(e.code);
        if (digit && crops[digit[1] - 1]) setSeed(crops[digit[1] - 1].id);
        else if (fi >= 0 && garden.fish[fi]) setFishKind(garden.fish[fi].id);
        else if (e.code === 'KeyB') startBuild('bed');
        else if (e.code === 'KeyP') startBuild('pond');
        else if (e.code === 'KeyR' && gHeld) rotateGHeld();
        else if (e.code === 'Escape') { if (confirmPlot) setConfirmPlot(null); else if (gHeld) setGHeld(null); else leaveHome(); }
        else if (e.code === 'Delete' || e.code === 'Backspace') { if (gHeld?.id) setConfirmPlot(gHeld); else if (!gHeld && gTarget) setConfirmPlot(gTarget); }
        else if (e.code === 'KeyE' && !gHeld) leaveHome();
      } else if (mode === 'interior' && roofView) {
        if (e.code === 'Escape') setRoofView(false);
      } else if (mode === 'interior') {
        if (e.code === 'KeyG' && !placing && !moving && garden) { enterGarden(); return; }
        const digit = /^Digit([1-9])$/.exec(e.code);
        if (digit && catalog[digit[1] - 1]) { const id = catalog[digit[1] - 1].id; setMoving(null); setPlacing(p => (p === id ? null : id)); setRot(0); }
        else if (e.code === 'KeyR') { if (placing || moving) rotate(); else if (target) rotateItem(target); }
        else if (e.code === 'Escape') { if (confirmItem) setConfirmItem(null); else if (placing || moving) cancelHold(); else leaveHome(); }
        else if ((e.code === 'Delete' || e.code === 'Backspace') && moving) setConfirmItem(moving);
        else if (e.code === 'KeyE' && !placing && !moving) leaveHome();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [me, mode, nearHome, placing, moving, confirmItem, target, catalog, enterHome, leaveHome, rotate, rotateItem, cancelHold, toggleView,
    garden, crops, gHeld, gTarget, confirmPlot, enterGarden, startBuild, rotateGHeld, settingsOpen, houseLevel, roofView, picker, plotInfoId, nearPlot, goHome, buildMode, buildEscape, tryBuild, nearDoor, toggleDoor]);

  // Mở menu / hộp thoại / cài đặt hoặc vào chế độ trang trí → tự thả chuột để dùng giao diện.
  // Build Mode cũng tính là "giao diện đang mở" → thả Pointer Lock, hiện con trỏ.
  const menuOpen = !!(confirmItem || confirmPlot || settingsOpen || picker || plotInfoId || buildMode);
  useEffect(() => { if (menuOpen || (mode === 'interior' && !roofView)) exitPointerLock(); }, [menuOpen, mode, roofView]);

  const authenticate = async (body, signup) => {
    setLoading(true); setError('');
    try {
      const data = await request('/auth/' + (signup ? 'register' : 'login'), { method: 'POST', body });
      try { localStorage.setItem('life_token', data.token); } catch { /* bỏ qua */ }
      setToken(data.token);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  const placeHeld = async ({ x, z, floor = 0 }) => {
    if (loading) return;
    if (moving) {
      const item = moving;
      // Cập nhật ngay trên màn hình; nếu server từ chối thì trả món đồ về chỗ cũ.
      setFurniture(f => f.map(it => (it.id === item.id ? { ...it, pos_x: x, pos_z: z, floor, rotation_y: rot } : it)));
      setMoving(null);
      try {
        const saved = await request('/house/furniture/' + item.id, { method: 'PUT', token, body: { x, z, floor, rotation: rot } });
        setFurniture(f => f.map(it => (it.id === item.id ? saved : it)));
      } catch (e) {
        setFurniture(f => f.map(it => (it.id === item.id ? item : it)));
        setNotice('Lỗi: ' + e.message);
      }
      return;
    }
    if (!placing) return;
    setLoading(true);
    try {
      const saved = await request('/house/furniture', { method: 'POST', token, body: { catalogId: placing, x, z, floor, rotation: rot } });
      setFurniture(f => [...f, saved]);
      setNotice(`Đã đặt ${saved.name || 'vật phẩm'} ✨`);
    } catch (e) { setNotice('Lỗi: ' + e.message); } finally { setLoading(false); }
  };
  const deleteFurniture = async () => {
    const item = confirmItem;
    setConfirmItem(null);
    try {
      await request('/house/furniture/' + item.id, { method: 'DELETE', token });
      setFurniture(f => f.filter(x => x.id !== item.id));
      setMoving(m => (m?.id === item.id ? null : m));
      setNotice(`Đã cất ${item.name || 'vật phẩm'}`);
    } catch (e) { setNotice(e.message); }
  };
  const feed = async () => {
    try {
      const pets = await request('/pet/feed', { method: 'POST', token });
      setMe(m => ({ ...m, pets }));
      setFeedTick(t => t + 1);
      setNotice('Mochi đã ăn no! 🐶');
    } catch (e) { setNotice(e.message); }
  };
  const logout = () => {
    useBuildingStore.getState().exit(true);
    try { localStorage.removeItem('life_token'); } catch { /* bỏ qua */ }
    setToken(''); setMe(null); setPlots([]); setFurniture([]); setMode('world'); setNotice(''); setPlacing(null); posRef.current = null;
  };

  if (!me) {
    if (!token) return <Welcome onAuth={authenticate} loading={loading} error={error} />;
    return (
      <div className="loading-screen">
        <div className="loader-house">🏡</div>
        <b>Đang tải Life World...</b>
        {error && <><div className="error">{error}</div><button className="clay-btn" onClick={logout}>Quay lại đăng nhập</button></>}
      </div>
    );
  }

  const pet = me.pets?.[0];
  const inGarden = mode === 'garden' && !!garden;
  const now = serverNow(); // giờ server; App vẽ lại mỗi giây (đồng hồ) nên cây lớn dần trên màn hình.
  const gardenProps = inGarden ? {
    garden, crops, now, held: gHeld, onPlace: placePlot, onRotateHeld: rotateGHeld, onAction: plotAction, onPickPlot: pickPlot,
    entry: gardenEntry, onEnterHouse: enterHome,
    onTarget: setGTarget, onBlocked: () => setNotice('Chỗ này không đặt được — hãy đứng chỗ khác trong vườn 🙈'),
  } : null;
  const tgtInfo = (() => {
    const p = gTarget;
    if (!inGarden || !p) return null;
    if (p.kind === 'pond') return { emoji: '🐟', title: `Hồ cá ${p.w}×${p.d}`, detail: `${p.fish.length}/${fishCap(p)} con`, action: p.fish.length < fishCap(p) ? `Thả ${garden.fish.find(f => f.id === fishKind)?.name} ${FISH_EMOJI[fishKind]}` : 'Hồ đã đầy' };
    if (!p.crop) return { emoji: '🟫', title: `Luống trống ${p.w}×${p.d}`, detail: '', action: `Gieo ${crops.find(c => c.id === seed)?.name} ${CROP_EMOJI[seed]}` };
    const c = crops.find(x => x.id === p.crop), g = plotGrowth(p, crops, now);
    return g >= 1
      ? { emoji: CROP_EMOJI[p.crop], title: c?.name, detail: 'Đã chín!', action: 'Thu hoạch', ripe: true }
      : { emoji: CROP_EMOJI[p.crop], title: c?.name, detail: `${Math.floor(g * 100)}% · còn ${fmtLeft((1 - g) * c.grow * 60000)}`, action: null, g };
  })();
  const zoneLabel = me.zone === 'city' ? '🏙️ Thành thị' : '🌾 Nông thôn';
  const interior = mode === 'interior';
  return (
    <div className={`app ${sun.night > 0.6 ? 'is-night' : ''}`}>
      <div className="game-space">
        <Game me={me} plots={plots} mode={mode} furniture={furniture} held={held} rotation={rot}
          onPlace={placeHeld} onPick={pickItem} onRotateHeld={rotate} onRotateItem={rotateItem} onTarget={setTarget} onBlocked={onBlocked} thirdPerson={thirdPerson} sensitivity={mouseCfg.sens} invertY={mouseCfg.invertY} lockAllowed={!menuOpen} garden={gardenProps} designs={designs} doorStates={doorStates} houseEntry={houseEntry} onExitHouse={exitHouse} onHouseLevel={setHouseLevel} roofView={roofView} focusPlot={picker ? plots.find(p => p.id === picker.sel) || null : null} teleport={teleport} onPosition={p => { posRef.current = p; }} feedTick={feedTick} />
      </div>

      <header className="hud-top">
        <div className="hud-group">
          <div className="brand card">🌿 <b>Life World</b></div>
          <div className="player-chip card">
            <span className="avatar-bubble">{(me.display_name || '?').slice(0, 1).toUpperCase()}</span>
            <div><b>{me.display_name}</b><small>{zoneLabel} · {me.plot_code ? `Lô ${me.plot_code}` : 'Chưa có lô đất'}</small></div>
          </div>
        </div>
        <div className="clock card">
          <span className="clock-icon">{sun.icon}</span>
          <div title={`${clock.display} · ${sun.stage} · giờ server (Asia/Ho_Chi_Minh)`}><b>{clock.time}</b><small>{clock.date} · {sun.label}</small></div>
          {!timeOk && <span className="clock-warn" title="Mất kết nối máy chủ — đồng hồ đang tự tính tiếp, sẽ đồng bộ lại khi có mạng">⚠</span>}
        </div>
        <div className="hud-group">
          <button className={`view-btn card ${(thirdPerson && !interior) || roofView ? 'on' : ''}`}
            title={interior ? (houseLevel === 2 ? 'Ngắm cảnh khu phố từ sân thượng (V)' : 'Chế độ trang trí luôn nhìn từ trên xuống — lên sân thượng để ngắm cảnh') : 'Đổi góc nhìn (V)'}
            onClick={() => (interior ? setRoofView(v => !v) : toggleView())} disabled={interior && houseLevel !== 2}>
            <Video size={17} /><span>{interior ? (roofView ? '🔭 Đang ngắm cảnh' : houseLevel === 2 ? '🔭 Ngắm cảnh' : 'Trang trí · nhìn từ trên') : thirdPerson ? 'Góc nhìn thứ 3' : 'Nhìn từ trên cao'}</span>{(!interior || houseLevel === 2) && <kbd>V</kbd>}
          </button>
          <div className="settings-wrap">
            <button className={`icon-btn card ${settingsOpen ? 'on' : ''}`} title="Cài đặt chuột" onClick={() => setSettingsOpen(o => !o)}><Settings size={18} /></button>
            {settingsOpen && (
              <div className="settings-pop card">
                <b>🖱️ Điều khiển chuột</b>
                <label className="set-row">
                  <span>Độ nhạy chuột</span><output>{mouseCfg.sens.toFixed(1)}×</output>
                  <input type="range" min="0.2" max="3" step="0.1" value={mouseCfg.sens} onChange={e => saveMouse({ sens: Number(e.target.value) })} />
                </label>
                <label className="set-check">
                  <input type="checkbox" checked={mouseCfg.invertY} onChange={e => saveMouse({ invertY: e.target.checked })} />
                  <span>Đảo trục dọc</span>
                </label>
                <button className="clay-btn small full" onClick={() => setSettingsOpen(false)}>Xong</button>
              </div>
            )}
          </div>
          <button className="icon-btn card" title="Đăng xuất" onClick={logout}><LogOut size={18} /></button>
        </div>
      </header>

      {picker && (
        <PlotPicker plots={plots} me={me} zone={picker.zone} selId={picker.sel} claiming={claiming} onClaim={claimPlot}
          onZone={zone => setPicker(pk => ({ ...pk, zone, sel: null }))} onSelect={sel => setPicker(pk => ({ ...pk, sel }))} onClose={() => setPicker(null)} />
      )}

      <aside className="side-card card" hidden={!!picker || buildMode}>
        <div className="card-title"><Home size={16} /> Nhà của bạn</div>
        {me.plot_id ? (
          <>
            <p className="muted">Lô <b>{me.plot_code}</b> · {me.zone === 'city' ? 'Khu phố thị' : 'Làng quê'}</p>
            <div className="segmented">
              <button className={!interior && !inGarden ? 'active' : ''} onClick={leaveHome}><Compass size={15} /> Khám phá</button>
              <button className={interior ? 'active' : ''} onClick={() => enterHome()}><Armchair size={15} /> Trang trí</button>
              {garden && <button className={inGarden ? 'active' : ''} onClick={() => enterGarden()}><Sprout size={15} /> Sân vườn</button>}
            </div>
            {mode === 'world' && (
              <div className="plot-actions">
                <button className="clay-btn small" onClick={goHome} title="Về trước cổng nhà (H)"><Home size={14} /> Về nhà <kbd>H</kbd></button>
                <button className="clay-btn small ghost" onClick={openPicker}><MapPin size={14} /> Các lô đất</button>
              </div>
            )}
          </>
        ) : (
          <div className="no-plot">
            <p className="muted">Bạn chưa có lô đất. Hãy chọn một lô trống ở {me.zone === 'city' ? 'khu phố thị' : 'làng quê'} hoặc khu khác để dựng nhà.</p>
            <button className="clay-btn primary full" onClick={openPicker}><MapPin size={15} /> Chọn lô đất</button>
            <small>Hoặc đi dạo tới lô có biển <b>"Đất chưa có chủ"</b> rồi nhấn <kbd>E</kbd>.</small>
          </div>
        )}
        <div className="pet-card">
          <div className="pet-face">🐶</div>
          <div className="pet-info">
            <b>{pet?.name || 'Mochi'}</b>
            <small>Cún con · Rất quấn chủ</small>
          </div>
        </div>
        <Meter label="Vui vẻ" icon="❤️" value={pet?.happiness ?? 90} color="#f2727a" />
        <Meter label="No bụng" icon="🍖" value={100 - (pet?.hunger ?? 20)} color="#f6b04f" />
        <button className="clay-btn mint full" onClick={feed}><Heart size={15} /> Cho Mochi ăn</button>
      </aside>

      {mode === 'world' && <Minimap plots={plots} me={me} pos={pos} selectedId={picker?.sel} />}

      {mode === 'world' && nearDoor && !menuOpen && (
        <div className="prompt card home-prompt door-prompt">
          <button onClick={toggleDoor}><kbd>E</kbd> {nearDoorMine ? (nearDoorOpen ? 'Đóng cửa' : 'Mở cửa') : nearDoorOpen ? 'Cửa đang mở' : '🔒 Cửa nhà hàng xóm'}</button>
        </div>
      )}

      {mode === 'world' && nearPlot && !nearDoor && !menuOpen && (
        <div className="prompt card home-prompt">
          {nearPlot.status === 'owned' && standingPlot?.id === nearPlot.id && <button onClick={tryBuild}><kbd>B</kbd> Xem nhà</button>}
          <button onClick={() => setPlotInfoId(nearPlot.id)}><kbd>E</kbd> Xem lô đất {nearPlot.plot_code} <small className={`st-${nearPlot.status}`}>{nearPlot.status === 'owned' ? nearPlot.owner_name : STATUS_NAME[nearPlot.status]}</small></button>
        </div>
      )}

      {plotInfo && <PlotInfo p={plotInfo} me={me} claiming={claiming} onClaim={claimPlot} onClose={() => setPlotInfoId(null)} />}

      {mode === 'world' && (nearHome || onOwnPlot) && !nearDoor && !menuOpen && (
        <div className="prompt card home-prompt">
          {nearHome && <button onClick={enterHome}><kbd>E</kbd> Vào nhà <DoorOpen size={16} /></button>}
          {nearHome && garden && <button onClick={enterGarden}><kbd>G</kbd> Ra sân vườn <Sprout size={16} /></button>}
          {onOwnPlot && <button onClick={tryBuild}><kbd>B</kbd> Xây nhà <Hammer size={16} /></button>}
        </div>
      )}

      <BuildToolbar token={token} />

      {inGarden && (
        <div className="dock card garden-dock">
          {!confirmPlot && (gHeld || tgtInfo) && (
            <div className="prompt card action-prompt">
              {gHeld ? (
                <><span className="ap-emoji">{gHeld.kind === 'pond' ? '🐟' : '🟫'}</span><b>{PLOT_NAME[gHeld.kind]} {gHeld.w}×{gHeld.d}</b><span><kbd>Chuột trái</kbd> {gHeld.id ? 'Đặt xuống' : 'Xây ở đây'}</span><span><kbd>Chuột phải</kbd> Xoay</span>{gHeld.id && <span><kbd>Delete</kbd> Dọn đi</span>}</>
              ) : (
                <>
                  <span className="ap-emoji">{tgtInfo.emoji}</span><b>{tgtInfo.title}</b>
                  {tgtInfo.detail && <span className={tgtInfo.ripe ? 'ripe' : ''}>{tgtInfo.detail}</span>}
                  {tgtInfo.g != null && <span className="grow-bar"><i style={{ width: `${tgtInfo.g * 100}%` }} /></span>}
                  {tgtInfo.action && <span><kbd>Chuột trái</kbd> {tgtInfo.action}</span>}
                  <span><kbd>Chuột phải</kbd> Dời</span><span><kbd>Delete</kbd> Dọn</span>
                </>
              )}
            </div>
          )}
          <div className="dock-head">
            <b>🌱 Sân vườn</b>
            <small>{garden.plots.length}/{garden.limits.maxPlots} khu · 🧺 {garden.harvests}</small>
            <div className="spacer" />
            <div className="sizer" title="Chiều rộng vườn">
              <span>Rộng</span>
              <button onClick={() => resizeGarden(-2, 0)} disabled={garden.width <= garden.limits.minW}><Minus size={13} /></button>
              <b>{garden.width} m</b>
              <button onClick={() => resizeGarden(2, 0)} disabled={garden.width >= garden.limits.maxW}><Plus size={13} /></button>
            </div>
            <div className="sizer" title="Chiều sâu vườn">
              <span>Sâu</span>
              <button onClick={() => resizeGarden(0, -1)} disabled={garden.depth <= garden.limits.minD}><Minus size={13} /></button>
              <b>{garden.depth} m</b>
              <button onClick={() => resizeGarden(0, 1)} disabled={garden.depth >= garden.limits.maxD}><Plus size={13} /></button>
            </div>
            <button className="clay-btn small peach" onClick={leaveHome} title="Ra ngoài (Esc)"><DoorOpen size={14} /> Ra ngoài</button>
          </div>
          <div className="garden-grid">
            <div className="build-box">
              {[['bed', '🟫', BED_SIZES, 'B'], ['pond', '🐟', POND_SIZES, 'P']].map(([kind, icon, sizes, key]) => (
                <div key={kind} className={`build-row ${gHeld && !gHeld.id && gHeld.kind === kind ? 'on' : ''}`}>
                  <button className="build-kind" onClick={() => startBuild(kind)}><span>{icon}</span><b>{PLOT_NAME[kind]}</b><kbd>{key}</kbd></button>
                  <div className="chips">
                    {sizes.map(sz => (
                      <button key={sz.join('x')} className={buildSize[kind][0] === sz[0] && buildSize[kind][1] === sz[1] ? 'sel' : ''} onClick={() => startBuild(kind, sz)}>{sz[0]}×{sz[1]}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="seed-box">
              <small>Hạt giống <kbd>1–7</kbd></small>
              <div className="mini-tiles">
                {crops.map((c, i) => (
                  <button key={c.id} className={seed === c.id ? 'sel' : ''} onClick={() => setSeed(c.id)} title={`${c.name} · ${c.grow} phút`}>
                    <span>{CROP_EMOJI[c.id]}</span><small>{c.name}</small><i>{i + 1}</i>
                  </button>
                ))}
              </div>
              <small>Cá <kbd>8–0</kbd></small>
              <div className="mini-tiles">
                {garden.fish.map((f, i) => (
                  <button key={f.id} className={fishKind === f.id ? 'sel' : ''} onClick={() => setFishKind(f.id)}>
                    <span>{FISH_EMOJI[f.id]}</span><small>{f.name}</small><i>{(i + 8) % 10}</i>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="dock-tip">{gHeld ? 'Đi tới chỗ muốn đặt trong vườn · Chuột trái đặt · Chuột phải xoay · Esc hủy' : 'Chọn kích thước để xây luống / hồ · Đi tới luống để gieo hạt, thu hoạch · Đi tới hồ để thả cá'}</div>
        </div>
      )}

      {interior && houseLevel === 2 && !roofView && (
        <div className="prompt card roof-prompt">
          <button onClick={() => setRoofView(true)}><kbd>V</kbd> 🔭 Ngắm cảnh khu phố từ sân thượng</button>
        </div>
      )}

      {interior && !roofView && (
        <div className="dock card">
          {!confirmItem && (held || target) && (
            <div className="prompt card action-prompt">
              {held ? (
                <><span className="ap-emoji">{EMOJI[held.kind] || '📦'}</span><span><kbd>Click</kbd> Đặt xuống</span><span><kbd>Chuột phải</kbd> Xoay</span>{moving && <span><kbd>Delete</kbd> Cất đi</span>}</>
              ) : (
                <><span className="ap-emoji">{EMOJI[target.kind] || '📦'}</span><b>{target.name}</b><span><kbd>Click</kbd> Nhấc lên</span><span><kbd>Kéo thả</kbd> Dời</span><span><kbd>Chuột phải</kbd> Xoay</span></>
              )}
            </div>
          )}
          <div className="dock-head">
            <b>🪑 Nội thất</b>
            <span className="level-chip">🏠 {['Tầng trệt', 'Lầu 1', 'Sân thượng'][houseLevel]}</span>
            <small>{furniture.length}/80 món</small>
            <div className="spacer" />
            <button className="clay-btn small" onClick={rotate} title="Xoay món đồ (R)"><RotateCw size={14} /> Xoay {Math.round((rot * 180) / Math.PI)}°</button>
            <button className="clay-btn small peach" onClick={leaveHome} title="Ra ngoài (Esc)"><DoorOpen size={14} /> Ra ngoài</button>
          </div>
          <div className="dock-items">
            {catalog.map(t => (
              <button key={t.id} className={`tile ${placing === t.id ? 'selected' : ''}`} style={{ '--tile': TILE[t.kind] || '#f3ece2' }} onClick={() => { setMoving(null); setPlacing(placing === t.id ? null : t.id); setRot(0); }}>
                <span>{EMOJI[t.kind] || '📦'}</span><small>{t.name}</small><i className="tile-key">{catalog.indexOf(t) + 1}</i>
              </button>
            ))}
          </div>
          {moving ? (
            <div className="moving-bar">
              <span className="moving-emoji" style={{ background: TILE[moving.kind] }}>{EMOJI[moving.kind] || '📦'}</span>
              <div><b>Đang di chuyển {moving.name || 'vật phẩm'}</b><small>Đưa chuột tới chỗ mới · Click đặt xuống · Chuột phải xoay · Delete cất đi</small></div>
              <div className="spacer" />
              <button className="clay-btn small ghost" onClick={cancelHold}>Hủy</button>
              <button className="clay-btn small danger" onClick={() => setConfirmItem(moving)}><Trash2 size={14} /> Cất đi</button>
            </div>
          ) : (
            <div className="dock-tip">{placing ? 'Đưa chuột tới chỗ muốn đặt · Click đặt xuống · Chuột phải xoay · Esc bỏ chọn' : 'Chọn món mới (phím 1–9) · Rê chuột lên món đã đặt: click để nhấc, kéo thả để dời, chuột phải để xoay · Đồ được đặt ở tầng bạn đang đứng'}</div>
          )}
        </div>
      )}

      <div className="hints card" hidden={buildMode}>
        {inGarden ? (
          <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Đi lại</span>{thirdPerson && <span><kbd>Di chuột</kbd> Nhìn quanh</span>}<span><kbd>B</kbd>/<kbd>P</kbd> Xây luống / hồ</span><span><kbd>Chuột trái</kbd> Thao tác</span>{thirdPerson && <span><kbd>Esc</kbd> Hiện chuột</span>}<span><kbd>E</kbd> Ra ngoài</span></>
        ) : interior && roofView ? (
          <><span><kbd>Di chuột</kbd> Nhìn quanh</span><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Đi dạo sân thượng</span><span><kbd>Cuộn</kbd> Zoom</span><span><kbd>Esc</kbd> Hiện chuột</span><span><kbd>V</kbd> Quay lại trang trí</span></>
        ) : interior ? (
          <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Đi lại</span><span><kbd>Click</kbd> Chọn / Đặt đồ</span><span><kbd>Kéo thả</kbd> Dời đồ</span><span><kbd>Chuột phải</kbd> Xoay đồ</span><span><kbd>1–9</kbd> Đồ mới</span><span>🪜 Cầu thang lên lầu</span><span>🚪 Qua cửa: ra ngoài / ra vườn</span></>
        ) : (
          <>{thirdPerson ? <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Di chuyển</span><span><kbd>Di chuột</kbd> Nhìn quanh</span><span><kbd>Esc</kbd> Hiện chuột</span></> : <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Chuột phải</kbd> Di chuyển</span><span><kbd>Alt</kbd>+<kbd>Kéo chuột phải</kbd> Xoay góc nhìn</span></>}<span><kbd>Shift</kbd> Chạy</span><span><kbd>Cuộn</kbd> Zoom</span><span><kbd>V</kbd> Góc nhìn</span><span><kbd>E</kbd> Vào nhà</span><span><kbd>G</kbd> Sân vườn</span></>
        )}
      </div>

      {((thirdPerson && (mode === 'world' || inGarden)) || (interior && roofView)) && !menuOpen && !lock.locked && (
        <div className="lock-hint">
          <MousePointer2 size={22} />
          <b>{lock.error ? 'Trình duyệt chưa cho khoá chuột — hãy click lại' : 'Click vào màn hình để điều khiển camera'}</b>
          <small>Di chuột để nhìn quanh · WASD để đi · Esc để hiện lại chuột</small>
        </div>
      )}

      {notice && <div className="toast" onClick={() => setNotice('')}>{notice}</div>}

      {confirmPlot && (
        <div className="modal-backdrop" onClick={() => setConfirmPlot(null)}>
          <div className="modal card" onClick={e => e.stopPropagation()}>
            <button className="modal-x" onClick={() => setConfirmPlot(null)}><X size={16} /></button>
            <div className="modal-emoji" style={{ background: confirmPlot.kind === 'pond' ? '#dcf3ef' : '#f7ecdc' }}>{confirmPlot.kind === 'pond' ? '🐟' : '🟫'}</div>
            <h3>Dọn {PLOT_NAME[confirmPlot.kind].toLowerCase()} {confirmPlot.w}×{confirmPlot.d}?</h3>
            <p className="muted">{confirmPlot.kind === 'pond' ? `${confirmPlot.fish.length} con cá sẽ được thả về suối.` : confirmPlot.crop ? 'Cây đang trồng trên luống sẽ mất.' : 'Luống sẽ được gỡ khỏi vườn.'}</p>
            <div className="modal-actions">
              <button className="clay-btn ghost" onClick={() => setConfirmPlot(null)}>Giữ lại</button>
              <button className="clay-btn danger" onClick={removePlot}>Dọn đi</button>
            </div>
          </div>
        </div>
      )}

      {confirmItem && (
        <div className="modal-backdrop" onClick={() => setConfirmItem(null)}>
          <div className="modal card" onClick={e => e.stopPropagation()}>
            <button className="modal-x" onClick={() => setConfirmItem(null)}><X size={16} /></button>
            <div className="modal-emoji" style={{ background: TILE[confirmItem.kind] }}>{EMOJI[confirmItem.kind] || '📦'}</div>
            <h3>Cất {confirmItem.name || 'vật phẩm'}?</h3>
            <p className="muted">Món đồ sẽ được gỡ khỏi phòng của bạn.</p>
            <div className="modal-actions">
              <button className="clay-btn ghost" onClick={() => setConfirmItem(null)}>Giữ lại</button>
              <button className="clay-btn danger" onClick={deleteFurniture}>Cất đi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meter({ label, icon, value, color }) {
  return (
    <div className="meter">
      <div className="meter-row"><span>{icon} {label}</span><b>{value}%</b></div>
      <div className="meter-track"><div style={{ width: `${value}%`, background: color }} /></div>
    </div>
  );
}
