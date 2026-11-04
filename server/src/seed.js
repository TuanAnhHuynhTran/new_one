// Dữ liệu có sẵn cho chế độ lưu trữ file (DB_DRIVER=file) — thay cho việc tạo CSDL MySQL.
// Cấu trúc bám theo database/schema.sql để có thể chuyển qua lại giữa hai chế độ.
// Chạy `npm run seed -w server` để tạo lại server/data/db.json từ dữ liệu này (xóa dữ liệu cũ).
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const zones = [
  { id: 1, slug: 'city', name: 'Thành thị' },
  { id: 2, slug: 'rural', name: 'Nông thôn' },
];

// Khớp với client/src/world.js: thành thị X<0, nông thôn X>0.
const cityXZ = [[-33,-24],[-18,-24],[-33,-8],[-18,-8],[-33,8],[-18,8],[-33,24],[-18,24],[-33,40],[-18,40],[-33,-40],[-18,-40]];
const ruralXZ = [[20,-32],[47,-32],[20,-4],[47,-4],[20,24],[47,24],[20,52],[47,52],[20,-60],[47,-60],[74,-32],[74,-4]];

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
    furniture: [
      { catalogId: 7, x: 0.5, z: 0.5, rotation: 0 },
      { catalogId: 1, x: 0.5, z: -1, rotation: 0 },
      { catalogId: 2, x: 0.5, z: 1, rotation: 0 },
      { catalogId: 6, x: -2.5, z: -3.5, rotation: 0 },
      { catalogId: 3, x: -4, z: -3, rotation: 0 },
      { catalogId: 5, x: -1.5, z: -2.5, rotation: 0 },
      { catalogId: 4, x: 3.5, z: -2.5, rotation: 0 },
      { catalogId: 8, x: 3, z: 2, rotation: -Math.PI / 2 },
      { catalogId: 9, x: -4, z: 1.5, rotation: Math.PI / 2 },
    ],
  },
  {
    username: 'thanhpho', password: 'demo1234', zone: 'city', plotCode: 'C-001',
    pet: { name: 'Mochi', species: 'dog', hunger: 40, happiness: 75 },
    furniture: [
      { catalogId: 1, x: 0, z: 1.5, rotation: 0 },
      { catalogId: 3, x: -4, z: -3, rotation: 0 },
    ],
  },
];

export function buildSeed() {
  const now = new Date().toISOString();
  const land_plots = [
    ...cityXZ.map(([x, z], i) => ({ id: i + 1, zone_id: 1, plot_code: `C-${String(i + 1).padStart(3, '0')}`, world_x: x, world_z: z, size_x: 12, size_z: 12, owner_id: null })),
    ...ruralXZ.map(([x, z], i) => ({ id: i + 13, zone_id: 2, plot_code: `R-${String(i + 1).padStart(3, '0')}`, world_x: x, world_z: z, size_x: 22, size_z: 22, owner_id: null })),
  ];
  const data = {
    meta: { version: 1, created_at: now, jwt_secret: crypto.randomBytes(48).toString('hex') },
    seq: { users: 0, houses: 0, house_furniture: 0, pets: 0 },
    zones, land_plots, furniture_catalog: furnitureCatalog,
    users: [], characters: [], houses: [], house_furniture: [], pets: [],
  };
  for (const acc of demoAccounts) {
    const plot = land_plots.find(p => p.plot_code === acc.plotCode);
    const userId = ++data.seq.users;
    plot.owner_id = userId;
    data.users.push({ id: userId, username: acc.username, password_hash: bcrypt.hashSync(acc.password, 10), created_at: now });
    data.characters.push({ user_id: userId, display_name: acc.username, last_x: plot.world_x + (acc.zone === 'city' ? 7 : 12), last_z: plot.world_z + 8 });
    const houseId = ++data.seq.houses;
    data.houses.push({ id: houseId, user_id: userId, plot_id: plot.id, wall_color: '#f2ddbc', roof_color: '#bd6956' });
    for (const f of acc.furniture) {
      data.house_furniture.push({ id: ++data.seq.house_furniture, house_id: houseId, catalog_id: f.catalogId, pos_x: f.x, pos_z: f.z, rotation_y: Number(f.rotation.toFixed(3)), created_at: now });
    }
    data.pets.push({ id: ++data.seq.pets, user_id: userId, ...acc.pet, last_fed_at: now });
  }
  return data;
}
