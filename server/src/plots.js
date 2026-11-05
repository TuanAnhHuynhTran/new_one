// Cấu hình quy hoạch lô đất (MVP) — chỉnh tại đây, dùng chung cho seed (file JSON), MySQL và API.
// Toạ độ khớp với client/src/world.js: thành thị X < 0, nông thôn X > 0, trục Y hướng lên, mặt tiền mặc định hướng +Z (ra đường).
// Lưu ý: KHÔNG đổi toạ độ / kích thước của lô đã tạo nếu không viết migration kèm theo (nhà, vườn, va chạm đều bám theo).

export const WORLD = { id: 1, slug: 'main', name: 'Life World' };
export const PLOT_STATUSES = ['available', 'owned', 'reserved', 'disabled'];

// Kích thước mặc định theo khu vực. Thành thị: lô sát nhau dọc hai bên đường; nông thôn: lô rộng, cách xa nhau.
// (Bản đồ MVP hiện có lô phố 12 × 12 m và lô quê 22 × 22 m — các mẫu lớn hơn như 12 × 18 / 30 × 40 cần quy hoạch lại bản đồ.)
export const PLOT_CONFIG = {
  city: {
    zoneId: 1, prefix: 'C', width: 12, length: 12, rotationY: 0, spawnGap: 1.6,
    positions: [[-33, -24], [-18, -24], [-33, -8], [-18, -8], [-33, 8], [-18, 8], [-33, 24], [-18, 24], [-33, 40], [-18, 40], [-33, -40], [-18, -40]],
    // Điểm xuất hiện khi chưa có lô (giao lộ giữa khu phố).
    hub: [-25.5, 0],
  },
  rural: {
    zoneId: 2, prefix: 'R', width: 22, length: 22, rotationY: 0, spawnGap: 1.5,
    positions: [[20, -32], [47, -32], [20, -4], [47, -4], [20, 24], [47, 24], [20, 52], [47, 52], [20, -60], [47, -60], [74, -32], [74, -4]],
    hub: [33.5, -18],
  },
};
// Lô có nhà dân sẵn (NPC) để khu phố có hàng xóm — không nhận được. Lô đang quy hoạch — tạm khoá.
export const RESERVED_PLOTS = ['C-003', 'C-006', 'C-008', 'C-011', 'R-003', 'R-006', 'R-008', 'R-011'];
export const DISABLED_PLOTS = ['C-012', 'R-012'];

const r2 = n => Math.round(n * 100) / 100;
const rot = (dx, dz, a) => [dx * Math.cos(a) + dz * Math.sin(a), -dx * Math.sin(a) + dz * Math.cos(a)];

// Ranh giới: 4 góc [x, z] theo chiều kim đồng hồ nhìn từ trên xuống (đã xoay theo rotation_y).
export function boundaryOf({ x, z, width, length, rotationY = 0 }) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const [dx, dz] = rot((sx * width) / 2, (sz * length) / 2, rotationY);
    return [r2(x + dx), r2(z + dz)];
  });
}
// Điểm xuất hiện: giữa mặt tiền, lùi ra ngoài ranh giới một đoạn (ngoài cổng, trên lối đi / vỉa hè — không có vật cản).
export function spawnOf({ x, z, length, rotationY = 0, spawnGap = 1.5 }) {
  const [dx, dz] = rot(0, length / 2 + spawnGap, rotationY);
  return [r2(x + dx), r2(z + dz)];
}
export const initialStatus = code => (DISABLED_PLOTS.includes(code) ? 'disabled' : RESERVED_PLOTS.includes(code) ? 'reserved' : 'available');

// Danh sách lô mẫu ban đầu (dùng cho seed file JSON và để sinh câu lệnh INSERT của MySQL).
export function plotTemplates() {
  const out = [];
  let id = 0;
  for (const [zone, c] of Object.entries(PLOT_CONFIG)) {
    c.positions.forEach(([x, z], i) => {
      const code = `${c.prefix}-${String(i + 1).padStart(3, '0')}`;
      const geo = { x, z, width: c.width, length: c.length, rotationY: c.rotationY, spawnGap: c.spawnGap };
      const [sx, sz] = spawnOf(geo);
      out.push({
        id: ++id, world_id: WORLD.id, zone_id: c.zoneId, zone, plot_code: code,
        world_x: x, position_y: 0, world_z: z, rotation_y: c.rotationY, size_x: c.width, size_z: c.length,
        boundary_polygon: boundaryOf(geo), spawn_x: sx, spawn_z: sz, status: initialStatus(code), owner_character_id: null,
      });
    });
  }
  return out;
}
// Bổ sung các trường mới cho một lô (khi nâng cấp dữ liệu cũ) mà không đổi toạ độ / kích thước đã có.
export function completePlot(p, zoneSlug) {
  const c = PLOT_CONFIG[zoneSlug] || PLOT_CONFIG.rural;
  const geo = { x: Number(p.world_x), z: Number(p.world_z), width: Number(p.size_x), length: Number(p.size_z), rotationY: Number(p.rotation_y || 0), spawnGap: c.spawnGap };
  const [sx, sz] = spawnOf(geo);
  return { boundary_polygon: boundaryOf(geo), spawn_x: sx, spawn_z: sz, rotation_y: geo.rotationY };
}

// Dạng công khai của một lô đất trả về cho client (tên trường theo đặc tả; giữ thêm tên cũ world_x/size_x cho tương thích).
// privateView = true chỉ dùng cho chính chủ (GET /api/land-plots/my-plot): kèm owner_character_id.
export function publicLandPlot(p, zone, ownerName = null, privateView = false) {
  const boundary = typeof p.boundary_polygon === 'string' ? JSON.parse(p.boundary_polygon) : p.boundary_polygon;
  return {
    id: Number(p.id), plot_code: p.plot_code, world_id: Number(p.world_id || WORLD.id), zone_id: Number(p.zone_id), zone,
    position_x: Number(p.world_x), position_y: Number(p.position_y || 0), position_z: Number(p.world_z), rotation_y: Number(p.rotation_y || 0),
    width: Number(p.size_x), length: Number(p.size_z), boundary_polygon: boundary,
    spawn_x: p.spawn_x == null ? null : Number(p.spawn_x), spawn_z: p.spawn_z == null ? null : Number(p.spawn_z),
    status: p.status, owner_name: ownerName,
    ...(privateView ? { owner_character_id: p.owner_character_id == null ? null : Number(p.owner_character_id) } : {}),
    created_at: p.created_at || null, updated_at: p.updated_at || null,
    // Tương thích với code cũ
    world_x: Number(p.world_x), world_z: Number(p.world_z), size_x: Number(p.size_x), size_z: Number(p.size_z),
  };
}

// Bản đồ đi được (khớp client/src/world.js MAP.bounds) và các vùng không được đặt điểm xuất hiện.
export const MAP_BOUNDS = { x0: -52, x1: 92, z0: -72, z1: 72 };
const NO_SPAWN = [{ x0: 58.5, x1: 62.5, z0: -200, z1: 200 } /* suối */, { x0: -0.4, x1: 6.4, z0: -7.4, z1: -0.6 } /* quán cà phê */];
// Điểm xuất hiện hợp lệ: trong bản đồ, không nằm trong lô đất nào (nhà, hàng rào) và không ở suối / quán cà phê.
export function isSpawnValid(x, z, plots) {
  if (![x, z].every(Number.isFinite)) return false;
  if (x < MAP_BOUNDS.x0 || x > MAP_BOUNDS.x1 || z < MAP_BOUNDS.z0 || z > MAP_BOUNDS.z1) return false;
  if (NO_SPAWN.some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)) return false;
  return !plots.some(p => {
    const b = typeof p.boundary_polygon === 'string' ? JSON.parse(p.boundary_polygon) : p.boundary_polygon;
    if (!b) return false;
    const xs = b.map(q => q[0]), zs = b.map(q => q[1]);
    return x > Math.min(...xs) + 0.05 && x < Math.max(...xs) - 0.05 && z > Math.min(...zs) + 0.05 && z < Math.max(...zs) - 0.05;
  });
}

// Mã lỗi API thống nhất: code → [HTTP status, thông báo]. Mọi lỗi trả về dạng { error, code }.
export const API_ERRORS = {
  UNAUTHORIZED: [401, 'Cần đăng nhập'],
  INVALID_INPUT: [400, 'Dữ liệu không hợp lệ'],
  INVALID_ZONE: [400, 'Khu vực không hợp lệ (chỉ city hoặc rural)'],
  INVALID_STATUS: [400, 'Trạng thái lô không hợp lệ'],
  INVALID_POSITION: [400, 'Vị trí không hợp lệ'],
  PLOT_NOT_FOUND: [404, 'Không tìm thấy lô đất'],
  CHARACTER_NOT_FOUND: [404, 'Không tìm thấy nhân vật'],
  NO_PLOT: [404, 'Bạn chưa có lô đất'],
  PLOT_ALREADY_OWNED: [409, 'Lô đất này đã có chủ — hãy chọn lô khác'],
  PLOT_NOT_AVAILABLE: [409, 'Lô đất đã được đặt trước hoặc đang quy hoạch, không nhận được'],
  PLAYER_ALREADY_HAS_PLOT: [409, 'Mỗi nhân vật chỉ sở hữu một lô đất trong MVP'],
  INVALID_SPAWN: [409, 'Điểm xuất hiện của lô đất không hợp lệ'],
  RATE_LIMITED: [429, 'Thao tác quá nhanh, hãy thử lại sau ít phút'],
  NOT_PLOT_OWNER: [403, 'Chỉ chủ lô đất mới được thêm / sửa / xoá cấu trúc'],
  INVALID_DESIGN: [400, 'Thiết kế nhà không hợp lệ'],
  VERSION_CONFLICT: [409, 'Thiết kế đã được lưu ở nơi khác — hãy tải lại trước khi lưu'],
  HOUSE_NOT_FOUND: [404, 'Không tìm thấy nhà'],
  HOUSE_REVISION_CONFLICT: [409, 'Thiết kế đã có phiên bản mới hơn — bản đang chỉnh vẫn được giữ để bạn tải lại hoặc thử hợp nhất'],
  NOT_FOUND: [404, 'API không tồn tại'],
  SERVER_ERROR: [500, 'Lỗi máy chủ; kiểm tra log API'],
};
