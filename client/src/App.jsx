import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Armchair, Compass, Heart, LogOut, RotateCw, X, DoorOpen, Home, Trash2, Video, Sprout, Minus, Plus } from 'lucide-react';
import Game from './Game.jsx';
import { CAFE, MAP, defaultPlots, localTime, sunState } from './world.js';

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

// ---------- Bản đồ nhỏ ----------
const MM = 168, { x0: MX0, x1: MX1, z0: MZ0, z1: MZ1 } = { x0: -56, x1: 96, z0: -76, z1: 76 };
const mx = x => ((x - MX0) / (MX1 - MX0)) * MM, mz = z => ((z - MZ0) / (MZ1 - MZ0)) * MM;
function Minimap({ plots, me, pos }) {
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
          const half = p.zone === 'rural' ? 11 : 6, own = p.id === me.plot_id;
          return <rect key={p.id} x={mx(+p.world_x - half)} y={mz(+p.world_z - half)} width={mx(half) - mx(-half)} height={mz(half) - mz(-half)} rx="2"
            fill={own ? '#f2727a' : p.zone === 'rural' ? '#c6e9a4' : '#f6c9a0'} stroke={own ? '#fff' : 'none'} strokeWidth="1.5" />;
        })}
        <g transform={`translate(${mx(pos.x)} ${mz(pos.z)}) rotate(${(-pos.angle * 180) / Math.PI})`}>
          <circle r="7" fill="#ffffff" opacity=".6" />
          <path d="M0 6 L4.2 -3.5 L0 -1.5 L-4.2 -3.5 Z" fill="#3f6fd8" stroke="#fff" strokeWidth="1.2" />
        </g>
      </svg>
      <div className="minimap-legend"><span><i style={{ background: '#f2727a' }} />Nhà bạn</span><span><i style={{ background: '#f08a3c' }} />Cà phê</span></div>
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
  const [clock, setClock] = useState(localTime());
  const [sun, setSun] = useState(() => sunState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [feedTick, setFeedTick] = useState(0);
  const [confirmItem, setConfirmItem] = useState(null);
  const [moving, setMoving] = useState(null);
  // Góc nhìn thứ 3 (V để bật/tắt), nhớ lựa chọn trên trình duyệt này.
  const [thirdPerson, setThirdPerson] = useState(() => { try { return localStorage.getItem('life_view') === 'tp'; } catch { return false; } });
  const toggleView = useCallback(() => setThirdPerson(v => {
    try { localStorage.setItem('life_view', v ? 'iso' : 'tp'); } catch { /* bỏ qua */ }
    return !v;
  }), []); // món đã đặt đang được nhấc lên để di chuyển
  // Sân vườn: dữ liệu vườn, khu đang cầm để xây / dời, khu trước mặt, hạt giống và loại cá đang chọn.
  const [garden, setGarden] = useState(null);
  const [gHeld, setGHeld] = useState(null);
  const [gTarget, setGTarget] = useState(null);
  const [seed, setSeed] = useState('cabbage');
  const [fishKind, setFishKind] = useState('goldfish');
  const [buildSize, setBuildSize] = useState({ bed: [2, 2], pond: [3, 2] });
  const [confirmPlot, setConfirmPlot] = useState(null);
  const [pos, setPos] = useState({ x: 0, z: 0, angle: 0 });
  const posRef = useRef(null), lastSent = useRef('');

  useEffect(() => { const id = setInterval(() => { setClock(localTime()); setSun(sunState()); }, 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 2600); return () => clearTimeout(id); }, [notice]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([request('/me', { token }), request('/world'), request('/house/furniture', { token }), request('/catalog'), request('/garden', { token }).catch(() => null)])
      .then(([m, w, f, c, g]) => {
        if (cancelled) return;
        setMe(m); setPlots(w.plots); setFurniture(f); setCatalog(c); setGarden(g); setError('');
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
    if (!me || mode !== 'world') return false;
    const rural = me.zone === 'rural';
    return Math.abs(pos.x - Number(me.world_x)) < (rural ? 8 : 7.5) && Math.abs(pos.z - Number(me.world_z)) < (rural ? 8 : 7.5);
  }, [me, pos, mode]);

  const enterHome = useCallback(() => { setMode('interior'); setPlacing(null); setMoving(null); setGHeld(null); setGTarget(null); }, []);
  const leaveHome = useCallback(() => { setMode('world'); setPlacing(null); setMoving(null); setConfirmItem(null); setTarget(null); setGHeld(null); setGTarget(null); setConfirmPlot(null); }, []);
  const enterGarden = useCallback(() => { setMode('garden'); setPlacing(null); setMoving(null); setConfirmItem(null); setTarget(null); }, []);
  const cancelHold = useCallback(() => { setPlacing(null); setMoving(null); }, []);
  const pickItem = useCallback(item => { setPlacing(null); setMoving(item); setRot(Number(item.rotation_y) || 0); }, []);
  const rotate = useCallback(() => setRot(r => (r + Math.PI / 2) % (Math.PI * 2)), []);
  const onBlocked = useCallback(() => setNotice('Chỗ này bị vướng, hãy đứng chỗ khác 🙈'), []);
  // Xoay tại chỗ món đồ đang đứng trước mặt (chuột phải / R khi tay không).
  const rotateItem = useCallback(async item => {
    const rotation = +(((Number(item.rotation_y) || 0) + Math.PI / 2) % (Math.PI * 2)).toFixed(3);
    setFurniture(f => f.map(it => (it.id === item.id ? { ...it, rotation_y: rotation } : it)));
    try {
      const saved = await request('/house/furniture/' + item.id, { method: 'PUT', token, body: { x: Number(item.pos_x), z: Number(item.pos_z), rotation } });
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
      const g = plotGrowth(plot, crops, Date.now());
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
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || e.repeat) return;
      if (e.code === 'KeyV') { toggleView(); return; }
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
    garden, crops, gHeld, gTarget, confirmPlot, enterGarden, startBuild, rotateGHeld]);

  const authenticate = async (body, signup) => {
    setLoading(true); setError('');
    try {
      const data = await request('/auth/' + (signup ? 'register' : 'login'), { method: 'POST', body });
      try { localStorage.setItem('life_token', data.token); } catch { /* bỏ qua */ }
      setToken(data.token);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  const placeHeld = async ({ x, z }) => {
    if (loading) return;
    if (moving) {
      const item = moving;
      // Cập nhật ngay trên màn hình; nếu server từ chối thì trả món đồ về chỗ cũ.
      setFurniture(f => f.map(it => (it.id === item.id ? { ...it, pos_x: x, pos_z: z, rotation_y: rot } : it)));
      setMoving(null);
      try {
        const saved = await request('/house/furniture/' + item.id, { method: 'PUT', token, body: { x, z, rotation: rot } });
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
      const saved = await request('/house/furniture', { method: 'POST', token, body: { catalogId: placing, x, z, rotation: rot } });
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
  const now = Date.now(); // App vẽ lại mỗi giây (đồng hồ) nên cây lớn dần trên màn hình.
  const gardenProps = inGarden ? {
    garden, crops, now, held: gHeld, onPlace: placePlot, onRotateHeld: rotateGHeld, onAction: plotAction, onPickPlot: pickPlot,
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
          onPlace={placeHeld} onPick={pickItem} onRotateHeld={rotate} onRotateItem={rotateItem} onTarget={setTarget} onBlocked={onBlocked} thirdPerson={thirdPerson} garden={gardenProps} onPosition={p => { posRef.current = p; }} feedTick={feedTick} />
      </div>

      <header className="hud-top">
        <div className="hud-group">
          <div className="brand card">🌿 <b>Life World</b></div>
          <div className="player-chip card">
            <span className="avatar-bubble">{(me.display_name || '?').slice(0, 1).toUpperCase()}</span>
            <div><b>{me.display_name}</b><small>{zoneLabel} · Lô {me.plot_code}</small></div>
          </div>
        </div>
        <div className="clock card">
          <span className="clock-icon">{sun.icon}</span>
          <div><b>{clock}</b><small>{sun.label} · Giờ Việt Nam</small></div>
        </div>
        <div className="hud-group">
          <button className={`view-btn card ${thirdPerson ? 'on' : ''}`} title="Đổi góc nhìn (V)" onClick={toggleView}>
            <Video size={17} /><span>{thirdPerson ? 'Góc nhìn thứ 3' : 'Nhìn từ trên cao'}</span><kbd>V</kbd>
          </button>
          <button className="icon-btn card" title="Đăng xuất" onClick={logout}><LogOut size={18} /></button>
        </div>
      </header>

      <aside className="side-card card">
        <div className="card-title"><Home size={16} /> Nhà của bạn</div>
        <p className="muted">Lô <b>{me.plot_code}</b> · {me.zone === 'city' ? 'Khu phố thị' : 'Làng quê'}</p>
        <div className="segmented">
          <button className={!interior && !inGarden ? 'active' : ''} onClick={leaveHome}><Compass size={15} /> Khám phá</button>
          <button className={interior ? 'active' : ''} onClick={enterHome}><Armchair size={15} /> Trang trí</button>
          {garden && <button className={inGarden ? 'active' : ''} onClick={enterGarden}><Sprout size={15} /> Sân vườn</button>}
        </div>
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

      {mode === 'world' && <Minimap plots={plots} me={me} pos={pos} />}

      {mode === 'world' && nearHome && (
        <div className="prompt card home-prompt">
          <button onClick={enterHome}><kbd>E</kbd> Vào nhà <DoorOpen size={16} /></button>
          {garden && <button onClick={enterGarden}><kbd>G</kbd> Ra sân vườn <Sprout size={16} /></button>}
        </div>
      )}

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

      {interior && (
        <div className="dock card">
          {!confirmItem && (held || target) && (
            <div className="prompt card action-prompt">
              {held ? (
                <><span className="ap-emoji">{EMOJI[held.kind] || '📦'}</span><span><kbd>Chuột trái</kbd> Đặt xuống</span><span><kbd>Chuột phải</kbd> Xoay</span>{moving && <span><kbd>Delete</kbd> Cất đi</span>}</>
              ) : (
                <><span className="ap-emoji">{EMOJI[target.kind] || '📦'}</span><b>{target.name}</b><span><kbd>Chuột trái</kbd> Nhấc lên</span><span><kbd>Chuột phải</kbd> Xoay</span></>
              )}
            </div>
          )}
          <div className="dock-head">
            <b>🪑 Nội thất</b>
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
              <div><b>Đang di chuyển {moving.name || 'vật phẩm'}</b><small>Đi tới chỗ mới · Chuột trái đặt xuống · Chuột phải xoay · Delete cất đi</small></div>
              <div className="spacer" />
              <button className="clay-btn small ghost" onClick={cancelHold}>Hủy</button>
              <button className="clay-btn small danger" onClick={() => setConfirmItem(moving)}><Trash2 size={14} /> Cất đi</button>
            </div>
          ) : (
            <div className="dock-tip">{placing ? 'Đi tới chỗ muốn đặt · Chuột trái đặt xuống · Chuột phải xoay · Esc bỏ chọn' : 'Chọn món mới (phím 1–9) · Đi tới gần món đã đặt để nhấc lên hoặc xoay'}</div>
          )}
        </div>
      )}

      <div className="hints card">
        {inGarden ? (
          <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Đi lại</span><span><kbd>B</kbd>/<kbd>P</kbd> Xây luống / hồ</span><span><kbd>Chuột trái</kbd> Thao tác</span><span><kbd>Esc</kbd> Ra ngoài</span></>
        ) : interior ? (
          <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Đi lại</span><span><kbd>Chuột trái</kbd> Nhấc / Đặt</span><span><kbd>Chuột phải</kbd> Xoay đồ</span><span><kbd>1–9</kbd> Chọn đồ</span>{thirdPerson && <span><kbd>Di chuột</kbd> Nhìn quanh</span>}<span><kbd>V</kbd> Góc nhìn</span><span><kbd>Esc</kbd> Ra ngoài</span></>
        ) : (
          <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Chuột trái</kbd> Di chuyển</span><span><kbd>Shift</kbd> Chạy</span><span><kbd>Chuột phải</kbd> Xoay camera</span><span><kbd>Cuộn</kbd> Zoom</span><span><kbd>V</kbd> Góc nhìn</span><span><kbd>E</kbd> Vào nhà</span><span><kbd>G</kbd> Sân vườn</span></>
        )}
      </div>

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
