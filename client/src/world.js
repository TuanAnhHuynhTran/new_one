import { mix } from './scene/kit.jsx';

// Tọa độ lô đất — khớp với server/src/seed.js và database/schema.sql.
export const cityPlots = [[-33,-24],[-18,-24],[-33,-8],[-18,-8],[-33,8],[-18,8],[-33,24],[-18,24],[-33,40],[-18,40],[-33,-40],[-18,-40]];
export const ruralPlots = [[20,-32],[47,-32],[20,-4],[47,-4],[20,24],[47,24],[20,52],[47,52],[20,-60],[47,-60],[74,-32],[74,-4]];

// Bố cục cố định của bản đồ (đơn vị: mét trong thế giới).
export const MAP = {
  bounds: { x0: -52, x1: 92, z0: -72, z1: 72 },        // vùng nhân vật đi được
  cityRows: [-40, -24, -8, 8, 24, 40],
  cityStreets: [-48, -32, -16, 0, 16, 32, 48],          // đường ngang giữa các dãy nhà phố
  avenues: [-44, -7],                                   // đại lộ dọc ở hai bên khu phố
  ruralPathsZ: [-46, -18, 10, 38, 66],                  // đường đất ngang
  ruralPathX: 33.5,                                     // đường đất dọc
  streamX: 60.5,                                        // suối
};
export const CAFE = { x: 3, z: -4 };

// Bản đồ dự phòng khi /api/world chưa trả về; nguồn dữ liệu chính là bảng land_plots trên server.
export const defaultPlots = () => [
  ...cityPlots.map(([world_x, world_z], i) => ({ id: i + 1, plot_code: `C-${String(i + 1).padStart(3, '0')}`, world_x, world_z, zone: 'city' })),
  ...ruralPlots.map(([world_x, world_z], i) => ({ id: i + 13, plot_code: `R-${String(i + 1).padStart(3, '0')}`, world_x, world_z, zone: 'rural' })),
];

// Hộp va chạm AABB (nửa cạnh theo X và Z) cho nhà và quán cà phê.
export const houseColliders = plots => [
  ...plots.map(p => ({ x: Number(p.world_x), z: Number(p.world_z), hx: p.zone === 'rural' ? 4.5 : 4.6, hz: p.zone === 'rural' ? 3.7 : 4.6 })),
  { x: CAFE.x, z: CAFE.z, hx: 3.4, hz: 3.4 },
];

export function localTime() {
  return new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// ?gio=20 trên URL để xem thử thế giới vào một giờ bất kỳ (dùng khi phát triển).
const hourOverride = (() => {
  try { const v = new URLSearchParams(location.search).get('gio'); return v == null ? null : Number(v); } catch { return null; }
})();

export function vnHour(date = new Date()) {
  if (Number.isFinite(hourOverride)) return hourOverride;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour').value) + Number(parts.find(p => p.type === 'minute').value) / 60;
}

// Mặt trời mọc 5–7h, lặn 17–19h. level: 0.25 (đêm) .. 1 (ngày).
export function sunState(date = new Date()) {
  const h = vnHour(date);
  let level;
  if (h >= 7 && h < 17) level = 1;
  else if (h >= 5 && h < 7) level = 0.25 + (0.75 * (h - 5)) / 2;
  else if (h >= 17 && h < 19) level = 1 - (0.75 * (h - 17)) / 2;
  else level = 0.25;
  const night = (1 - level) / 0.75;
  const phase =
    h >= 5 && h < 7 ? { label: 'Bình minh', icon: '🌅' } :
    h >= 7 && h < 11 ? { label: 'Buổi sáng', icon: '☀️' } :
    h >= 11 && h < 13 ? { label: 'Buổi trưa', icon: '🌞' } :
    h >= 13 && h < 17 ? { label: 'Buổi chiều', icon: '🌤️' } :
    h >= 17 && h < 19 ? { label: 'Hoàng hôn', icon: '🌇' } :
    { label: 'Buổi tối', icon: '🌙' };
  return { hour: h, level, night, ...phase };
}

export const lightLevel = date => sunState(date).level;

const SKY = {
  day: { top: '#67bdf0', bottom: '#d6f0ff' },
  dusk: { top: '#7f86cf', bottom: '#ffc9a3' },
  night: { top: '#121a40', bottom: '#2f3d73' },
};
export function skyColors(night) {
  if (night <= 0.5) { const t = night * 2; return { top: mix(SKY.day.top, SKY.dusk.top, t), bottom: mix(SKY.day.bottom, SKY.dusk.bottom, t) }; }
  const t = (night - 0.5) * 2;
  return { top: mix(SKY.dusk.top, SKY.night.top, t), bottom: mix(SKY.dusk.bottom, SKY.night.bottom, t) };
}
