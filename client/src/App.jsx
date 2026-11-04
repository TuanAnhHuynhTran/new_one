import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Armchair, Compass, Heart, LogOut, RotateCw, X, DoorOpen, Home, Trash2 } from 'lucide-react';
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
  const [moving, setMoving] = useState(null); // món đã đặt đang được nhấc lên để di chuyển
  const [pos, setPos] = useState({ x: 0, z: 0, angle: 0 });
  const posRef = useRef(null), lastSent = useRef('');

  useEffect(() => { const id = setInterval(() => { setClock(localTime()); setSun(sunState()); }, 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 2600); return () => clearTimeout(id); }, [notice]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([request('/me', { token }), request('/world'), request('/house/furniture', { token }), request('/catalog')])
      .then(([m, w, f, c]) => {
        if (cancelled) return;
        setMe(m); setPlots(w.plots); setFurniture(f); setCatalog(c); setError('');
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
  const held = useMemo(() => (moving ? { kind: moving.kind, id: moving.id, x: Number(moving.pos_x), z: Number(moving.pos_z) } : heldKind ? { kind: heldKind } : null), [moving, heldKind]);

  const nearHome = useMemo(() => {
    if (!me || mode !== 'world') return false;
    const rural = me.zone === 'rural';
    return Math.abs(pos.x - Number(me.world_x)) < (rural ? 8 : 7.5) && Math.abs(pos.z - Number(me.world_z)) < (rural ? 8 : 7.5);
  }, [me, pos, mode]);

  const enterHome = useCallback(() => { setMode('interior'); setPlacing(null); setMoving(null); }, []);
  const leaveHome = useCallback(() => { setMode('world'); setPlacing(null); setMoving(null); setConfirmItem(null); }, []);
  const cancelHold = useCallback(() => { setPlacing(null); setMoving(null); }, []);
  const pickItem = useCallback(item => { setPlacing(null); setMoving(item); setRot(Number(item.rotation_y) || 0); }, []);
  const rotate = useCallback(() => setRot(r => (r + Math.PI / 2) % (Math.PI * 2)), []);

  useEffect(() => {
    if (!me) return;
    const onKey = e => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || e.repeat) return;
      if (mode === 'world' && e.code === 'KeyE' && nearHome) enterHome();
      else if (mode === 'interior') {
        if (e.code === 'KeyR') rotate();
        else if (e.code === 'Escape') { if (confirmItem) setConfirmItem(null); else if (placing || moving) cancelHold(); else leaveHome(); }
        else if ((e.code === 'Delete' || e.code === 'Backspace') && moving) setConfirmItem(moving);
        else if (e.code === 'KeyE' && !placing && !moving) leaveHome();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [me, mode, nearHome, placing, moving, confirmItem, enterHome, leaveHome, rotate, cancelHold]);

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
  const zoneLabel = me.zone === 'city' ? '🏙️ Thành thị' : '🌾 Nông thôn';
  const interior = mode === 'interior';
  return (
    <div className={`app ${sun.night > 0.6 ? 'is-night' : ''}`}>
      <div className="game-space">
        <Game me={me} plots={plots} mode={mode} furniture={furniture} held={held} rotation={rot}
          onPlace={placeHeld} onPick={pickItem} onPosition={p => { posRef.current = p; }} feedTick={feedTick} />
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
        <button className="icon-btn card" title="Đăng xuất" onClick={logout}><LogOut size={18} /></button>
      </header>

      <aside className="side-card card">
        <div className="card-title"><Home size={16} /> Nhà của bạn</div>
        <p className="muted">Lô <b>{me.plot_code}</b> · {me.zone === 'city' ? 'Khu phố thị' : 'Làng quê'}</p>
        <div className="segmented">
          <button className={!interior ? 'active' : ''} onClick={leaveHome}><Compass size={15} /> Khám phá</button>
          <button className={interior ? 'active' : ''} onClick={enterHome}><Armchair size={15} /> Trang trí</button>
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

      {!interior && <Minimap plots={plots} me={me} pos={pos} />}

      {!interior && nearHome && (
        <button className="prompt card" onClick={enterHome}><kbd>E</kbd> Vào nhà của bạn <DoorOpen size={16} /></button>
      )}

      {interior && (
        <div className="dock card">
          <div className="dock-head">
            <b>🪑 Nội thất</b>
            <small>{furniture.length}/80 món</small>
            <div className="spacer" />
            <button className="clay-btn small" onClick={rotate} title="Xoay món đồ (R)"><RotateCw size={14} /> Xoay {Math.round((rot * 180) / Math.PI)}°</button>
            <button className="clay-btn small peach" onClick={leaveHome} title="Ra ngoài (Esc)"><DoorOpen size={14} /> Ra ngoài</button>
          </div>
          <div className="dock-items">
            {catalog.map(t => (
              <button key={t.id} className={`tile ${placing === t.id ? 'selected' : ''}`} style={{ '--tile': TILE[t.kind] || '#f3ece2' }} onClick={() => { setMoving(null); setPlacing(placing === t.id ? null : t.id); }}>
                <span>{EMOJI[t.kind] || '📦'}</span><small>{t.name}</small>
              </button>
            ))}
          </div>
          {moving ? (
            <div className="moving-bar">
              <span className="moving-emoji" style={{ background: TILE[moving.kind] }}>{EMOJI[moving.kind] || '📦'}</span>
              <div><b>Đang di chuyển {moving.name || 'vật phẩm'}</b><small>Bấm lên sàn để đặt xuống · R xoay · Esc hủy · Delete cất đi</small></div>
              <div className="spacer" />
              <button className="clay-btn small ghost" onClick={cancelHold}>Hủy</button>
              <button className="clay-btn small danger" onClick={() => setConfirmItem(moving)}><Trash2 size={14} /> Cất đi</button>
            </div>
          ) : (
            <div className="dock-tip">{placing ? 'Bấm lên sàn để đặt · R để xoay · Esc để bỏ chọn' : 'Chọn một món đồ để đặt · Bấm vào món đã đặt để di chuyển'}</div>
          )}
        </div>
      )}

      <div className="hints card">
        {interior ? (
          <><span><kbd>Chuột phải</kbd> Xoay</span><span><kbd>Cuộn</kbd> Zoom</span><span><kbd>R</kbd> Xoay đồ</span><span><kbd>Esc</kbd> Ra ngoài</span></>
        ) : (
          <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Di chuyển</span><span><kbd>Shift</kbd> Chạy</span><span><kbd>Chuột phải</kbd> Xoay camera</span><span><kbd>Cuộn</kbd> Zoom</span><span><kbd>E</kbd> Vào nhà</span></>
        )}
      </div>

      {notice && <div className="toast" onClick={() => setNotice('')}>{notice}</div>}

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
