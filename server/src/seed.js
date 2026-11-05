// Dữ liệu có sẵn cho chế độ lưu trữ file (DB_DRIVER=file) — thay cho việc tạo CSDL MySQL.
// Cấu trúc bám theo database/schema.sql để có thể chuyển qua lại giữa hai chế độ.
// Chạy `npm run seed -w server` để tạo lại server/data/db.json từ dữ liệu này (xóa dữ liệu cũ).
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { WORLD, completePlot, initialStatus, plotTemplates } from './plots.js';
import { DEFAULT_SETTINGS } from './timeline.js';

export const zones = [
  { id: 1, slug: 'city', name: 'Thành thị' },
  { id: 2, slug: 'rural', name: 'Nông thôn' },
];

// Toạ độ, kích thước, trạng thái ban đầu của các lô đất: xem src/plots.js.

export const furnitureCatalog = [
  { id: 1, name: 'Sofa', kind: 'sofa', price: 0 },
  { id: 2, name: 'Bàn gỗ', kind: 'table', price: 0 },
  { id: 3, name: 'Chậu cây', kind: 'plant', price: 0 },
  { id: 4, name: 'Giường', kind: 'bed', price: 0 },
  { id: 5, name: 'Đèn sàn', kind: 'lamp', price: 0 },
  { id: 6, name: 'Kệ sách', kind: 'bookshelf', price: 0 },
  { id: 7, name: 'Thảm', kind: 'rug', price: 0 },
  { id: 8, name: 'Ghế gỗ', kind: 'chair', price: 0 },
  { id: 9, name: 'Tủ lạnh', kind: 'fridge', price: 0 },
];

// Tài khoản demo đăng nhập được ngay.
export const demoAccounts = [
  {
    username: 'demo', password: 'demo1234', zone: 'rural', plotCode: 'R-001',
    pet: { name: 'Mochi', species: 'dog', hunger: 20, happiness: 90 },
    // Nhà 2 lầu: floor 0 = tầng trệt, 1 = lầu 1 (2 phòng ngủ, sảnh, ban công), 2 = sân thượng.
    furniture: [
      // Phòng khách: sofa quay về TV, bàn trà trên thảm, đèn, cây, kệ sách
      { catalogId: 7, x: -5.5, z: 2, rotation: Math.PI / 2, floor: 0 },
      { catalogId: 1, x: -3.5, z: 2, rotation: -Math.PI / 2, floor: 0 },
      { catalogId: 2, x: -5.5, z: 2, rotation: Math.PI / 2, floor: 0 },
      { catalogId: 5, x: -3.5, z: 4, rotation: 0, floor: 0 },
      { catalogId: 3, x: -7.2, z: 4.8, rotation: 0, floor: 0 },
      { catalogId: 6, x: 1, z: -1.1, rotation: 0, floor: 0 },
      // Nhà bếp: tủ lạnh, bàn ăn + 2 ghế
      { catalogId: 9, x: 1.35, z: -4.9, rotation: 0, floor: 0 },
      { catalogId: 2, x: -4.5, z: -3, rotation: 0, floor: 0 },
      { catalogId: 8, x: -5.75, z: -3, rotation: Math.PI / 2, floor: 0 },
      { catalogId: 8, x: -3.25, z: -3, rotation: -Math.PI / 2, floor: 0 },
      // Phòng ngủ 1 & 2
      { catalogId: 4, x: -4.5, z: -4, rotation: 0, floor: 1 },
      { catalogId: 5, x: -6.5, z: -4.9, rotation: 0, floor: 1 },
      { catalogId: 3, x: -2, z: -4.9, rotation: 0, floor: 1 },
      { catalogId: 4, x: 1, z: -4, rotation: 0, floor: 1 },
      { catalogId: 6, x: 2.85, z: -1.5, rotation: -Math.PI / 2, floor: 1 },
      // Sảnh lầu và ban công
      { catalogId: 7, x: -5, z: 3, rotation: 0, floor: 1 },
      { catalogId: 1, x: 0.5, z: 4.85, rotation: Math.PI, floor: 1 },
      { catalogId: 3, x: -7.2, z: 4.8, rotation: 0, floor: 1 },
      { catalogId: 3, x: -5.4, z: 6.5, rotation: 0, floor: 1 },
      { catalogId: 8, x: 0, z: 6.5, rotation: Math.PI, floor: 1 },
      { catalogId: 8, x: 1, z: 6.5, rotation: Math.PI, floor: 1 },
      // Sân thượng: bàn ghế uống trà, đèn, cây
      { catalogId: 2, x: -2.5, z: 1.5, rotation: 0, floor: 2 },
      { catalogId: 8, x: -2.5, z: 2.5, rotation: Math.PI, floor: 2 },
      { catalogId: 8, x: -2.5, z: 0.5, rotation: 0, floor: 2 },
      { catalogId: 5, x: -5, z: 4, rotation: 0, floor: 2 },
      { catalogId: 3, x: 2, z: -4.5, rotation: 0, floor: 2 },
      { catalogId: 3, x: 7, z: 4.5, rotation: 0, floor: 2 },
    ],
    // Sân vườn: age = số phút đã gieo trước lúc tạo dữ liệu (rau cải chín, cà chua đang lớn, cây cam có quả).
    garden: {
      width: 10, depth: 7,
      plots: [
        { kind: 'bed', x: -5, z: 0, w: 3, d: 2, crop: 'cabbage', age: 10 },
        { kind: 'bed', x: -5, z: 3, w: 3, d: 2, crop: 'tomato', age: 2 },
        { kind: 'pond', x: 0, z: 0, w: 3, d: 3, fish: ['goldfish', 'koi', 'koi', 'guppy'] },
        { kind: 'bed', x: 0, z: 4, w: 2, d: 2, crop: 'orange', age: 30 },
        { kind: 'bed', x: 4, z: 0, w: 1, d: 3, crop: 'sunflower', age: 6 },
        { kind: 'bed', x: 3, z: 4, w: 2, d: 2 },
      ],
    },
  },
  {
    username: 'thanhpho', password: 'demo1234', zone: 'city', plotCode: 'C-001',
    pet: { name: 'Mochi', species: 'dog', hunger: 40, happiness: 75 },
    furniture: [
      { catalogId: 1, x: -3.5, z: 2, rotation: -Math.PI / 2, floor: 0 },
      { catalogId: 3, x: -7.2, z: 4.8, rotation: 0, floor: 0 },
      { catalogId: 4, x: -4.5, z: -4, rotation: 0, floor: 1 },
    ],
    garden: { width: 8, depth: 5, plots: [{ kind: 'bed', x: -3, z: 0, w: 2, d: 2, crop: 'carrot', age: 1 }] },
  },
];

// Phiên bản bố cục nhà: 2 = nhà 2 lầu + sân thượng.
export const HOUSE_VERSION = 2;
function addDemoFurniture(data, acc, houseId, now) {
  for (const f of acc.furniture) {
    data.house_furniture.push({ id: ++data.seq.house_furniture, house_id: houseId, catalog_id: f.catalogId, pos_x: f.x, pos_z: f.z, floor: f.floor || 0, rotation_y: Number(f.rotation.toFixed(3)), created_at: now });
  }
}
// Nâng cấp file dữ liệu cũ (nhà 1 phòng 10 × 8 m): tài khoản demo nhận bộ nội thất mẫu mới,
// nhà của người chơi khác được dời đồ vào phòng khách ở tầng trệt (co toạ độ cũ cho vừa).
export function upgradeHouses(data) {
  const now = new Date().toISOString();
  for (const acc of demoAccounts) {
    const user = data.users.find(u => u.username === acc.username);
    const house = user && data.houses.find(h => h.user_id === user.id);
    if (!house) continue;
    data.house_furniture = data.house_furniture.filter(f => f.house_id !== house.id);
    addDemoFurniture(data, acc, house.id, now);
    house.upgraded = true;
  }
  for (const f of data.house_furniture) {
    if (f.floor != null) continue;
    f.floor = 0;
    f.pos_x = +(Math.max(-4.4, Math.min(4.4, f.pos_x)) * 0.75 - 2.2).toFixed(2);
    f.pos_z = +(Math.max(-3.6, Math.min(3.6, f.pos_z)) * 0.6 + 2.2).toFixed(2);
  }
  data.houses.forEach(h => { delete h.upgraded; });
  data.meta.house_version = HOUSE_VERSION;
}

// Phiên bản dữ liệu lô đất: 2 = có world_id, trạng thái, chủ sở hữu theo nhân vật, ranh giới, điểm xuất hiện.
export const PLOTS_VERSION = 2;
// Nâng cấp file dữ liệu cũ (lô chỉ có owner_id): giữ nguyên toạ độ / kích thước, bổ sung các trường mới.
export function upgradePlots(data) {
  const now = new Date().toISOString();
  data.worlds = data.worlds || [WORLD];
  for (const p of data.land_plots) {
    const zone = data.zones.find(z => z.id === p.zone_id)?.slug;
    const owner = p.owner_character_id ?? p.owner_id ?? null;
    Object.assign(p, completePlot(p, zone), {
      world_id: p.world_id || WORLD.id, position_y: p.position_y || 0,
      owner_character_id: owner, status: owner != null ? 'owned' : initialStatus(p.plot_code),
      created_at: p.created_at || now, updated_at: now,
    });
    delete p.owner_id;
  }
  for (const c of data.characters) {
    if (c.zone_pref) continue;
    const plot = data.land_plots.find(p => p.owner_character_id === c.user_id);
    c.zone_pref = data.zones.find(z => z.id === plot?.zone_id)?.slug || 'rural';
  }
  data.meta.plots_version = PLOTS_VERSION;
}

// Phiên bản dữ liệu thế giới: 3 = có world_settings và player_spawn_points.
export const WORLD_DATA_VERSION = 3;
// Seed chạy lại được nhiều lần (idempotent): bổ sung world, zone, cấu hình, lô mẫu còn thiếu (theo plot_code) và điểm xuất hiện
// cho các lô đã có chủ. KHÔNG sửa toạ độ / chủ sở hữu của lô đã có, không tạo trùng.
export function ensureWorldData(data) {
  const now = new Date().toISOString();
  data.worlds = data.worlds || [];
  if (!data.worlds.some(w => w.id === WORLD.id)) data.worlds.push({ ...WORLD });
  for (const z of zones) if (!data.zones.some(x => x.id === z.id)) data.zones.push({ ...z });
  data.world_settings = data.world_settings || [];
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!data.world_settings.some(s => s.world_id === WORLD.id && s.key === key)) data.world_settings.push({ world_id: WORLD.id, key, value, updated_at: now });
  }
  let maxId = Math.max(0, ...data.land_plots.map(p => p.id));
  for (const { zone, ...row } of plotTemplates()) {
    if (data.land_plots.some(p => p.plot_code === row.plot_code)) continue;
    data.land_plots.push({ ...row, id: ++maxId, created_at: now, updated_at: now });
  }
  data.player_spawn_points = data.player_spawn_points || [];
  data.seq.player_spawn_points = data.seq.player_spawn_points || Math.max(0, ...data.player_spawn_points.map(s => s.id));
  for (const p of data.land_plots) {
    if (p.owner_character_id == null || data.player_spawn_points.some(s => s.character_id === p.owner_character_id && s.kind === 'home')) continue;
    data.player_spawn_points.push({ id: ++data.seq.player_spawn_points, character_id: p.owner_character_id, world_id: p.world_id || WORLD.id, plot_id: p.id, kind: 'home',
      x: p.spawn_x, y: 0, z: p.spawn_z, rotation_y: +(Number(p.rotation_y || 0) + Math.PI).toFixed(4), created_at: now, updated_at: now });
  }
  data.meta.world_version = WORLD_DATA_VERSION;
}

export function buildSeed() {
  const now = new Date().toISOString();
  const land_plots = plotTemplates().map(({ zone, ...row }) => ({ ...row, created_at: now, updated_at: now }));
  const data = {
    meta: { version: 1, house_version: HOUSE_VERSION, plots_version: PLOTS_VERSION, created_at: now, jwt_secret: crypto.randomBytes(48).toString('hex') },
    seq: { users: 0, houses: 0, house_furniture: 0, pets: 0, garden_plots: 0 },
    worlds: [WORLD], zones, land_plots, furniture_catalog: furnitureCatalog,
    users: [], characters: [], houses: [], house_furniture: [], pets: [], gardens: [], garden_plots: [],
  };
  // SEED_DEMO=0: không tạo tài khoản demo (dùng cho kiểm thử — mọi lô mẫu đều còn trống).
  for (const acc of (process.env.SEED_DEMO === '0' ? [] : demoAccounts)) {
    const plot = land_plots.find(p => p.plot_code === acc.plotCode);
    const userId = ++data.seq.users;
    // Nhân vật có id trùng với id tài khoản (mỗi tài khoản một nhân vật trong MVP).
    Object.assign(plot, { owner_character_id: userId, status: 'owned' });
    data.users.push({ id: userId, username: acc.username, password_hash: bcrypt.hashSync(acc.password, 10), created_at: now });
    data.characters.push({ user_id: userId, display_name: acc.username, zone_pref: acc.zone, last_x: plot.spawn_x, last_z: plot.spawn_z });
    const houseId = ++data.seq.houses;
    data.houses.push({ id: houseId, user_id: userId, plot_id: plot.id, wall_color: '#f2ddbc', roof_color: '#bd6956' });
    addDemoFurniture(data, acc, houseId, now);
    data.pets.push({ id: ++data.seq.pets, user_id: userId, ...acc.pet, last_fed_at: now });
  }
  seedGardens(data);
  ensureWorldData(data);
  return data;
}

// Thêm vườn mẫu cho các tài khoản demo chưa có vườn (dùng cả khi nâng cấp file dữ liệu cũ).
export function seedGardens(data) {
  for (const acc of demoAccounts) {
    const user = data.users.find(u => u.username === acc.username);
    const house = user && data.houses.find(h => h.user_id === user.id);
    if (!house || !acc.garden || data.gardens.some(g => g.house_id === house.id)) continue;
    data.gardens.push({ house_id: house.id, width: acc.garden.width, depth: acc.garden.depth, harvests: 0 });
    for (const p of acc.garden.plots) {
      const planted = p.crop ? new Date(Date.now() - (p.age || 0) * 60000).toISOString() : null;
      data.garden_plots.push({ id: ++data.seq.garden_plots, house_id: house.id, kind: p.kind, x: p.x, z: p.z, w: p.w, d: p.d, crop: p.crop || null, planted_at: planted, fish: p.fish || [] });
    }
  }
}
