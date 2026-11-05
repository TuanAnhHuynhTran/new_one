import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { furnitureSpotOk, gardenInfo } from './store/common.js';
import { API_ERRORS, PLOT_STATUSES } from './plots.js';
import { upgradeDesign } from './houseDesign.js';
import { worldTime } from './timeline.js';
dotenv.config();

const {
  PORT = '3001', CLIENT_ORIGIN = 'http://localhost:5050',
  DB_DRIVER = 'file', DATA_FILE = fileURLToPath(new URL('../data/db.json', import.meta.url)),
  DB_HOST = '127.0.0.1', DB_PORT = '3306', DB_USER = 'root', DB_PASSWORD = '', DB_NAME = 'life_world',
} = process.env;

// DB_DRIVER=file (mặc định): dữ liệu nằm trong file JSON, tự tạo từ src/seed.js — không cần MySQL.
// DB_DRIVER=mysql: dùng MySQL theo database/schema.sql.
let store;
if (DB_DRIVER === 'mysql') {
  const { createMysqlStore } = await import('./store/mysql.js');
  store = createMysqlStore({ host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
} else if (DB_DRIVER === 'file') {
  const { createFileStore } = await import('./store/file.js');
  store = createFileStore(DATA_FILE);
} else {
  console.error(`DB_DRIVER không hợp lệ: "${DB_DRIVER}" (chỉ nhận file hoặc mysql)`); process.exit(1);
}

let JWT_SECRET = process.env.JWT_SECRET || '';
if (JWT_SECRET.length < 32) {
  if (!store.fallbackSecret) { console.error('JWT_SECRET phải có ít nhất 32 ký tự (server/.env)'); process.exit(1); }
  // Chế độ file: dùng secret ngẫu nhiên lưu trong file dữ liệu để chạy được ngay không cần .env.
  JWT_SECRET = store.fallbackSecret();
}

const app = express();
app.use(helmet()); app.use(cors({ origin: CLIENT_ORIGIN })); app.use(express.json({ limit: '512kb' }));
// Express 5 để req.body là undefined khi không có body JSON → chuẩn hóa thành {} để validation trả 400 thay vì 500.
app.use((req, _res, next) => { if (req.body == null || typeof req.body !== 'object') req.body = {}; next(); });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Lỗi thống nhất: { error: thông báo, code: MÃ_LỖI } với HTTP status theo bảng API_ERRORS.
const apiError = (res, code, message, extra = {}) => {
  const [status, msg] = API_ERRORS[code] || [400, 'Yêu cầu không hợp lệ'];
  return res.status(status).json({ error: message || msg, code, ...extra });
};
const auth = (req, res, next) => { try { const token = (req.headers.authorization || '').replace(/^Bearer /, ''); const data = jwt.verify(token, JWT_SECRET); req.userId = data.id; next(); } catch { return apiError(res, 'UNAUTHORIZED'); } };
const sign = id => jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
const limiter = (windowMs, limit) => rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => apiError(res, 'RATE_LIMITED') });
const authLimiter = limiter(15 * 60 * 1000, Number(process.env.AUTH_RATE_LIMIT || 30));

app.get('/api/health', wrap(async (_req, res) => { await store.ping(); res.json({ ok: true, driver: store.driver, time: new Date().toISOString() }); }));

app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const { username, password, zone } = req.body;
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username || '') || typeof password !== 'string' || password.length < 8 || password.length > 72 || !['city', 'rural'].includes(zone)) return apiError(res, ['city', 'rural'].includes(zone) ? 'INVALID_INPUT' : 'INVALID_ZONE', 'Tên đăng nhập 3–30 ký tự, mật khẩu 8–72 ký tự, chọn khu vực hợp lệ');
  const hash = await bcrypt.hash(password, 10);
  const r = await store.register(username, hash, zone);
  if (r.error === 'DUP') return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
  res.status(201).json({ token: sign(r.id) });
}));

app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  const user = await store.findUser(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  res.json({ token: sign(user.id) });
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  const me = await store.getMe(req.userId);
  if (!me) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
  res.json(me);
}));

app.get('/api/world', wrap(async (_req, res) => { res.json({ plots: await store.listPlots(), serverTime: new Date().toISOString() }); }));

// ---------- Lô đất (Land Plot API) ----------
const ZONES = ['city', 'rural'];
const plotIdOf = req => { const id = Number(req.params.id); return Number.isSafeInteger(id) && id > 0 ? id : null; };
// Lọc + phân trang: ?zone=city|rural&status=available|owned|reserved|disabled&page=1&limit=20 (limit tối đa 100).
function pagePlots(req, res, plots, fixedStatus) {
  const { zone, status = fixedStatus } = req.query;
  if (zone && !ZONES.includes(zone)) return apiError(res, 'INVALID_ZONE');
  if (status && !PLOT_STATUSES.includes(status)) return apiError(res, 'INVALID_STATUS');
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '20', 10) || 20));
  const items = plots.filter(p => (!zone || p.zone === zone) && (!status || p.status === status));
  return res.json({ items: items.slice((page - 1) * limit, page * limit), page, limit, total: items.length, total_pages: Math.max(1, Math.ceil(items.length / limit)), serverTime: new Date().toISOString() });
}
app.get('/api/land-plots', wrap(async (req, res) => pagePlots(req, res, await store.listPlots())));
app.get('/api/land-plots/available', wrap(async (req, res) => pagePlots(req, res, await store.listPlots(), 'available')));
// Đặt trước /:id để "my-plot" không bị hiểu là id.
app.get('/api/land-plots/my-plot', auth, wrap(async (req, res) => {
  const r = await store.myPlot(req.userId);
  if (r.error) return apiError(res, r.error);
  res.json(r);
}));
app.get('/api/land-plots/:id', wrap(async (req, res) => {
  const id = plotIdOf(req);
  const plot = id && (await store.listPlots()).find(p => p.id === id);
  if (!plot) return apiError(res, 'PLOT_NOT_FOUND');
  res.json(plot);
}));
// Chủ sở hữu công khai: chỉ tên hiển thị + thời điểm nhận (không lộ tài khoản, vị trí…).
app.get('/api/land-plots/:id/owner', wrap(async (req, res) => {
  const id = plotIdOf(req);
  const r = id && (await store.plotOwner(id));
  if (!r) return apiError(res, 'PLOT_NOT_FOUND');
  res.json(r);
}));
// Nhận lô đất: chủ sở hữu = nhân vật của tài khoản trong JWT; mọi trường chủ sở hữu / toạ độ gửi từ client đều bị bỏ qua.
const claimLimiter = limiter(60 * 1000, Number(process.env.CLAIM_RATE_LIMIT || 20));
const lastPos = new Map(); // userId → { x, z, t }: vị trí server đã xác nhận gần nhất (chống dịch chuyển tuỳ ý)
app.post('/api/land-plots/:id/claim', auth, claimLimiter, wrap(async (req, res) => {
  const id = plotIdOf(req);
  if (!id) return apiError(res, 'PLOT_NOT_FOUND');
  const r = await store.claimPlot(req.userId, id);
  if (r.error) {
    // Kèm trạng thái mới nhất của lô để client cập nhật ngay danh sách / bản đồ.
    const latest = (await store.listPlots()).find(p => p.id === id) || null;
    return apiError(res, r.error, r.error === 'PLAYER_ALREADY_HAS_PLOT' && r.plot ? `Bạn đã sở hữu lô ${r.plot} — mỗi nhân vật chỉ có một lô` : undefined, { plot: latest });
  }
  lastPos.set(req.userId, { x: r.plot.spawn_x, z: r.plot.spawn_z, t: Date.now() });
  res.json({ plot: r.plot, me: await store.getMe(req.userId) });
}));

// ---------- House Builder ----------
// Ai cũng xem được thiết kế; quyền chỉnh sửa chỉ do backend xác định (chủ lô = nhân vật của JWT).
const optionalUser = req => { try { return jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), JWT_SECRET).id; } catch { return null; } };
const houseIdOf = req => { const id = Number(req.params.houseId); return Number.isSafeInteger(id) && id > 0 ? id : null; };
const houseResult = (res, r) => {
  if (!r?.error) return false;
  apiError(res, r.error, undefined, { ...(r.details ? { details: r.details } : {}), ...(r.revision != null ? { revision: r.revision } : {}) });
  return true;
};

// Phase 02.9: API theo House ID và optimistic revision. Thiết kế vẫn ở tọa độ local của lô.
app.get('/api/houses/my-house', auth, wrap(async (req, res) => {
  const h = await store.getMyHouse(req.userId);
  if (!h) return apiError(res, 'HOUSE_NOT_FOUND');
  res.json({ house: h });
}));
app.get('/api/houses/:houseId/design', wrap(async (req, res) => {
  const houseId = houseIdOf(req), revision = req.query.revision == null ? null : Number(req.query.revision);
  if (!houseId || (revision != null && (!Number.isSafeInteger(revision) || revision < 1))) return apiError(res, 'INVALID_INPUT');
  const r = await store.getHouseDesignByHouse(houseId, revision);
  if (!r) return apiError(res, 'HOUSE_NOT_FOUND');
  res.json({ ...r, design: upgradeDesign(r.design), revision: r.revision ?? r.version ?? 0 });
}));
app.post('/api/houses/:houseId/validate', auth, wrap(async (req, res) => {
  const houseId = houseIdOf(req);
  if (!houseId) return apiError(res, 'HOUSE_NOT_FOUND');
  const settings = await store.getSettings();
  const r = await store.validateHouseDesignByHouse(req.userId, houseId, req.body.design, { setback: Number(settings.build_setback ?? 0.5) });
  if (houseResult(res, r)) return;
  res.json(r);
}));
app.put('/api/houses/:houseId/design', auth, limiter(60 * 1000, Number(process.env.BUILD_RATE_LIMIT || 60)), wrap(async (req, res) => {
  const houseId = houseIdOf(req), { design, base_revision: baseRevision } = req.body;
  if (!houseId) return apiError(res, 'HOUSE_NOT_FOUND');
  if (!Number.isInteger(baseRevision) || baseRevision < 0) return apiError(res, 'INVALID_INPUT', 'Thiếu base_revision của thiết kế');
  const settings = await store.getSettings();
  const r = await store.saveHouseDesignByHouse(req.userId, houseId, design, baseRevision, { setback: Number(settings.build_setback ?? 0.5) });
  if (houseResult(res, r)) return;
  res.json({ ...r, revision: r.revision ?? r.version });
}));
app.get('/api/houses/:houseId/revisions', auth, wrap(async (req, res) => {
  const houseId = houseIdOf(req);
  if (!houseId) return apiError(res, 'HOUSE_NOT_FOUND');
  const r = await store.listHouseRevisions(req.userId, houseId);
  if (houseResult(res, r)) return;
  res.json(r);
}));
// Mọi thiết kế đã lưu (công khai: chỉ hình học nhà, không có thông tin chủ) — vẽ tường và va chạm trong Explore Mode.
// Nhà một tầng cũ (schema 1) được nâng cấp khi đọc → luôn trả schema 2 có levels.
app.get('/api/house-designs', wrap(async (_req, res) => { res.json({ designs: (await store.listHouseDesigns()).map(d => ({ ...d, design: upgradeDesign(d.design) })) }); }));
app.get('/api/land-plots/:id/build-permission', wrap(async (req, res) => {
  const id = plotIdOf(req);
  const r = id && (await store.buildPermission(optionalUser(req), id));
  if (!r) return apiError(res, 'PLOT_NOT_FOUND');
  res.json(r);
}));
app.get('/api/land-plots/:id/house-design', wrap(async (req, res) => {
  const id = plotIdOf(req);
  const r = id && (await store.getHouseDesign(id));
  if (!r) return apiError(res, 'PLOT_NOT_FOUND');
  res.json({ ...r, design: upgradeDesign(r.design) });
}));
app.put('/api/land-plots/:id/house-design', auth, limiter(60 * 1000, Number(process.env.BUILD_RATE_LIMIT || 60)), wrap(async (req, res) => {
  const id = plotIdOf(req);
  if (!id) return apiError(res, 'PLOT_NOT_FOUND');
  const { design, version } = req.body;
  if (!Number.isInteger(version) || version < 0) return apiError(res, 'INVALID_INPUT', 'Thiếu version của thiết kế');
  // Khoảng lùi xây dựng lấy từ cấu hình thế giới (world_settings.build_setback).
  const settings = await store.getSettings();
  const r = await store.saveHouseDesign(req.userId, id, design, version, { setback: Number(settings.build_setback ?? 0.5) });
  if (r.error) return apiError(res, r.error, undefined, { ...(r.details ? { details: r.details } : {}), ...(r.version != null ? { version: r.version } : {}) });
  res.json(r);
}));

// ---------- Cửa (Explore Mode) ----------
// Trạng thái đóng / mở do server giữ (bộ nhớ) — nguồn chuẩn để sau này phát cho mọi người chơi qua multiplayer.
// Chỉ chủ lô được mở / đóng cửa nhà mình (quyền khách / bạn bè sẽ thêm sau).
const doorStates = new Map(); // "plotId:openingId" → { open, by, at }
const doorEvents = []; // nhật ký gần nhất (chuẩn bị đồng bộ multiplayer)
app.get('/api/door-states', wrap(async (_req, res) => {
  res.json({ doors: [...doorStates].filter(([, v]) => v.open).map(([k, v]) => ({ plot_id: Number(k.split(':')[0]), opening_id: k.split(':')[1], ...v })) });
}));
app.post('/api/land-plots/:id/doors/:openingId', auth, limiter(60 * 1000, 120), wrap(async (req, res) => {
  const id = plotIdOf(req), openingId = String(req.params.openingId || '');
  if (!id || !/^[a-z]+_[a-z0-9]{4,24}$/i.test(openingId) || typeof req.body.open !== 'boolean') return apiError(res, 'INVALID_INPUT');
  const perm = await store.buildPermission(req.userId, id);
  if (!perm) return apiError(res, 'PLOT_NOT_FOUND');
  if (!perm.can_edit) return apiError(res, 'NOT_PLOT_OWNER', 'Cửa đã khoá — chỉ chủ nhà mới mở được');
  const d = await store.getHouseDesign(id);
  const door = (d?.design?.objects || []).filter(o => o.type === 'wall').flatMap(w => (w.openings || []).map(o => ({ ...o, wall_id: w.id }))).find(o => o.id === openingId && o.type === 'door');
  if (!door) return apiError(res, 'NOT_FOUND', 'Không tìm thấy cửa (hãy lưu thiết kế trước)');
  const state = { open: req.body.open, by: req.userId, at: new Date().toISOString() };
  doorStates.set(`${id}:${openingId}`, state);
  doorEvents.push({ type: 'door:toggle', plot_id: id, wall_id: door.wall_id, opening_id: openingId, ...state });
  if (doorEvents.length > 200) doorEvents.shift();
  res.json({ plot_id: id, wall_id: door.wall_id, opening_id: openingId, ...state });
}));

// ---------- Thế giới ----------
app.get('/api/world/time', wrap(async (_req, res) => { res.json(worldTime(await store.getSettings())); }));
app.get('/api/world/zones', wrap(async (_req, res) => { res.json({ zones: await store.listZones() }); }));
app.get('/api/world/settings', wrap(async (_req, res) => { res.json({ world_id: 1, settings: await store.getSettings() }); }));
// Về nhà: backend kiểm tra quyền sở hữu và điểm xuất hiện đã lưu; client không gửi toạ độ.
app.post('/api/characters/return-home', auth, limiter(60 * 1000, 20), wrap(async (req, res) => {
  const r = await store.goHome(req.userId);
  if (r.error) return apiError(res, r.error);
  lastPos.set(req.userId, { x: r.x, z: r.z, t: Date.now() });
  res.json(r);
}));

app.get('/api/catalog', wrap(async (_req, res) => { res.json(await store.listCatalog()); }));
app.get('/api/house/furniture', auth, wrap(async (req, res) => { res.json(await store.listFurniture(req.userId)); }));

app.post('/api/house/furniture', auth, wrap(async (req, res) => {
  const { catalogId, x, z, floor = 0, rotation = 0 } = req.body;
  if (!Number.isInteger(catalogId) || catalogId <= 0 || !furnitureSpotOk({ x, z, floor, rotation })) return res.status(400).json({ error: 'Vật phẩm hoặc tọa độ không hợp lệ' });
  const r = await store.addFurniture(req.userId, { catalogId, x, z, floor, rotation });
  if (r.error === 'NO_ITEM') return res.status(400).json({ error: 'Vật phẩm không tồn tại' });
  if (r.error === 'NO_HOUSE') return res.status(404).json({ error: 'Không có nhà' });
  if (r.error === 'LIMIT') return res.status(409).json({ error: 'Nhà chỉ được đặt tối đa 80 món trong MVP' });
  res.status(201).json(r);
}));

// Di chuyển / xoay một món đồ đã đặt.
app.put('/api/house/furniture/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { x, z, floor = 0, rotation = 0 } = req.body;
  if (!Number.isSafeInteger(id) || id <= 0 || !furnitureSpotOk({ x, z, floor, rotation })) return res.status(400).json({ error: 'Vị trí không hợp lệ' });
  const item = await store.moveFurniture(req.userId, id, { x, z, floor, rotation });
  if (!item) return res.status(404).json({ error: 'Không thấy vật phẩm' });
  res.json(item);
}));

app.delete('/api/house/furniture/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'ID không hợp lệ' });
  if (!(await store.deleteFurniture(req.userId, id))) return res.status(404).json({ error: 'Không thấy vật phẩm' });
  res.json({ ok: true });
}));

// ---------- Sân vườn ----------
const GARDEN_ERRORS = {
  NO_HOUSE: [404, 'Không có nhà'], NOT_FOUND: [404, 'Không thấy khu vườn này'],
  SIZE: [400, 'Kích thước không hợp lệ'], KIND: [400, 'Loại khu không hợp lệ'],
  OUT: [409, 'Khu này nằm ngoài sân vườn'], OVERLAP: [409, 'Chỗ này đã có khu khác'],
  PLOTS: [409, 'Hãy dọn bớt luống / hồ ở mép vườn trước khi thu nhỏ'], LIMIT: [409, 'Vườn chỉ chứa tối đa 30 khu'],
  NOT_BED: [400, 'Chỉ gieo hạt được trên luống rau'], NO_CROP: [400, 'Hạt giống không hợp lệ'], BUSY: [409, 'Luống đã có cây'],
  EMPTY: [409, 'Luống đang trống'], NOT_RIPE: [409, 'Cây chưa chín'],
  NOT_POND: [400, 'Chỉ thả cá được vào hồ'], NO_FISH: [400, 'Loại cá không hợp lệ'], FULL: [409, 'Hồ đã đầy cá'],
};
const gardenReply = (res, r, status = 200) => {
  if (r && r.error) { const [code, msg] = GARDEN_ERRORS[r.error] || [400, 'Không hợp lệ']; return res.status(code).json({ error: msg, code: r.error }); }
  res.status(status).json(r);
};
const plotId = req => { const id = Number(req.params.id); return Number.isSafeInteger(id) && id > 0 ? id : null; };
const isNum = n => typeof n === 'number' && Number.isFinite(n);

app.get('/api/garden', auth, wrap(async (req, res) => {
  const g = await store.getGarden(req.userId);
  if (!g) return res.status(404).json({ error: 'Không có nhà' });
  res.json({ ...g, ...gardenInfo, serverTime: new Date().toISOString() });
}));
app.put('/api/garden', auth, wrap(async (req, res) => {
  const { width, depth } = req.body;
  if (!isNum(width) || !isNum(depth)) return res.status(400).json({ error: 'Kích thước không hợp lệ' });
  gardenReply(res, await store.resizeGarden(req.userId, width, depth));
}));
app.post('/api/garden/plots', auth, wrap(async (req, res) => {
  const { kind, x, z, w, d } = req.body;
  if (typeof kind !== 'string' || ![x, z, w, d].every(isNum)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  gardenReply(res, await store.addPlot(req.userId, { kind, x, z, w, d }), 201);
}));
app.put('/api/garden/plots/:id', auth, wrap(async (req, res) => {
  const id = plotId(req), { x, z, w, d } = req.body;
  if (!id || ![x, z, w, d].every(isNum)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  gardenReply(res, await store.movePlot(req.userId, id, { x, z, w, d }));
}));
app.delete('/api/garden/plots/:id', auth, wrap(async (req, res) => {
  const id = plotId(req);
  if (!id) return res.status(400).json({ error: 'ID không hợp lệ' });
  if (!(await store.deletePlot(req.userId, id))) return res.status(404).json({ error: 'Không thấy khu vườn này' });
  res.json({ ok: true });
}));
app.post('/api/garden/plots/:id/plant', auth, wrap(async (req, res) => {
  const id = plotId(req);
  if (!id || typeof req.body.crop !== 'string') return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  gardenReply(res, await store.plantPlot(req.userId, id, req.body.crop));
}));
app.post('/api/garden/plots/:id/harvest', auth, wrap(async (req, res) => {
  const id = plotId(req);
  if (!id) return res.status(400).json({ error: 'ID không hợp lệ' });
  gardenReply(res, await store.harvestPlot(req.userId, id));
}));
app.post('/api/garden/plots/:id/fish', auth, wrap(async (req, res) => {
  const id = plotId(req);
  if (!id || typeof req.body.species !== 'string') return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  gardenReply(res, await store.addFish(req.userId, id, req.body.species));
}));

app.post('/api/pet/feed', auth, wrap(async (req, res) => {
  const pets = await store.feedPet(req.userId);
  if (!pets) return res.status(404).json({ error: 'Chưa có pet' });
  res.json(pets);
}));

app.post('/api/character/position', auth, wrap(async (req, res) => {
  const { x, z } = req.body;
  if (![x, z].every(n => typeof n === 'number' && Number.isFinite(n)) || x < -55 || x > 95 || z < -75 || z > 75) return apiError(res, 'INVALID_POSITION', 'Tọa độ không hợp lệ');
  const prev = lastPos.get(req.userId), now = Date.now();
  if (prev && Math.hypot(x - prev.x, z - prev.z) > 12 * ((now - prev.t) / 1000) + 25) return apiError(res, 'INVALID_POSITION', 'Vị trí thay đổi bất thường — hãy dùng nút Về nhà để dịch chuyển');
  lastPos.set(req.userId, { x, z, t: now });
  await store.savePosition(req.userId, x, z);
  res.json({ ok: true });
}));

app.use('/api', (_req, res) => apiError(res, 'NOT_FOUND'));
app.use((err, _req, res, _next) => { console.error(err); apiError(res, 'SERVER_ERROR'); });

try {
  await store.ping();
  app.listen(Number(PORT), () => console.log(`Life World API (${store.driver}): http://localhost:${PORT}`));
} catch (err) {
  console.error(store.driver === 'mysql' ? 'Không thể kết nối MySQL:' : 'Lỗi lưu trữ:', err.message); process.exit(1);
}
