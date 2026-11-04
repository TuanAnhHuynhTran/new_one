import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { gardenInfo } from './store/common.js';
dotenv.config();

const {
  PORT = '3001', CLIENT_ORIGIN = 'http://localhost:5173',
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
app.use(helmet()); app.use(cors({ origin: CLIENT_ORIGIN })); app.use(express.json({ limit: '30kb' }));
// Express 5 để req.body là undefined khi không có body JSON → chuẩn hóa thành {} để validation trả 400 thay vì 500.
app.use((req, _res, next) => { if (req.body == null || typeof req.body !== 'object') req.body = {}; next(); });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const auth = (req, res, next) => { try { const token = (req.headers.authorization || '').replace(/^Bearer /, ''); const data = jwt.verify(token, JWT_SECRET); req.userId = data.id; next(); } catch { return res.status(401).json({ error: 'Cần đăng nhập' }); } };
const sign = id => jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

app.get('/api/health', wrap(async (_req, res) => { await store.ping(); res.json({ ok: true, driver: store.driver, time: new Date().toISOString() }); }));

app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const { username, password, zone } = req.body;
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username || '') || typeof password !== 'string' || password.length < 8 || password.length > 72 || !['city', 'rural'].includes(zone)) return res.status(400).json({ error: 'Tên đăng nhập 3–30 ký tự, mật khẩu 8–72 ký tự, chọn khu vực hợp lệ' });
  const hash = await bcrypt.hash(password, 10);
  const r = await store.register(username, hash, zone);
  if (r.error === 'DUP') return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
  if (r.error === 'NO_PLOT') return res.status(409).json({ error: 'Khu vực đã hết lô đất mẫu' });
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
app.get('/api/catalog', wrap(async (_req, res) => { res.json(await store.listCatalog()); }));
app.get('/api/house/furniture', auth, wrap(async (req, res) => { res.json(await store.listFurniture(req.userId)); }));

app.post('/api/house/furniture', auth, wrap(async (req, res) => {
  const { catalogId, x, z, rotation = 0 } = req.body;
  if (!Number.isInteger(catalogId) || catalogId <= 0 || ![x, z, rotation].every(n => typeof n === 'number' && Number.isFinite(n)) || Math.abs(x) > 4.4 || Math.abs(z) > 3.6 || Math.abs(rotation) > 6.284) return res.status(400).json({ error: 'Vật phẩm hoặc tọa độ không hợp lệ' });
  const r = await store.addFurniture(req.userId, { catalogId, x, z, rotation });
  if (r.error === 'NO_ITEM') return res.status(400).json({ error: 'Vật phẩm không tồn tại' });
  if (r.error === 'NO_HOUSE') return res.status(404).json({ error: 'Không có nhà' });
  if (r.error === 'LIMIT') return res.status(409).json({ error: 'Nhà chỉ được đặt tối đa 80 món trong MVP' });
  res.status(201).json(r);
}));

// Di chuyển / xoay một món đồ đã đặt.
app.put('/api/house/furniture/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { x, z, rotation = 0 } = req.body;
  if (!Number.isSafeInteger(id) || id <= 0 || ![x, z, rotation].every(n => typeof n === 'number' && Number.isFinite(n)) || Math.abs(x) > 4.4 || Math.abs(z) > 3.6 || Math.abs(rotation) > 6.284) return res.status(400).json({ error: 'Vị trí không hợp lệ' });
  const item = await store.moveFurniture(req.userId, id, { x, z, rotation });
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
  if (![x, z].every(n => typeof n === 'number' && Number.isFinite(n)) || x < -55 || x > 95 || z < -75 || z > 75) return res.status(400).json({ error: 'Tọa độ không hợp lệ' });
  await store.savePosition(req.userId, x, z);
  res.json({ ok: true });
}));

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ; kiểm tra log API' }); });

try {
  await store.ping();
  app.listen(Number(PORT), () => console.log(`Life World API (${store.driver}): http://localhost:${PORT}`));
} catch (err) {
  console.error(store.driver === 'mysql' ? 'Không thể kết nối MySQL:' : 'Lỗi lưu trữ:', err.message); process.exit(1);
}
