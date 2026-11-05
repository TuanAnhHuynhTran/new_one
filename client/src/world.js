import { mix } from './scene/kit.jsx';
import { serverNow } from './time.js';

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
  ...cityPlots.map(([world_x, world_z], i) => ({ id: i + 1, plot_code: `C-${String(i + 1).padStart(3, '0')}`, world_x, world_z, zone: 'city', status: 'reserved' })),
  ...ruralPlots.map(([world_x, world_z], i) => ({ id: i + 13, plot_code: `R-${String(i + 1).padStart(3, '0')}`, world_x, world_z, zone: 'rural', status: 'reserved' })),
];

// ---------- Lô đất ----------
// Lô có nhà (của người chơi hoặc nhà dân đặt trước); lô available / disabled là đất trống.
export const isBuilt = p => p.status === 'owned' || p.status === 'reserved' || p.status == null;
// Hình học của lô (chấp nhận cả tên trường mới lẫn cũ).
export const plotGeo = p => ({
  x: Number(p.position_x ?? p.world_x), z: Number(p.position_z ?? p.world_z), rot: Number(p.rotation_y || 0),
  width: Number(p.width ?? p.size_x ?? (p.zone === 'rural' ? 22 : 12)), length: Number(p.length ?? p.size_z ?? (p.zone === 'rural' ? 22 : 12)),
});
// Hướng mặt tiền theo la bàn (minimap: +X = Đông, +Z = Nam).
export function facingLabel(rot = 0) {
  const a = ((Math.atan2(Math.sin(rot), Math.cos(rot)) * 180) / Math.PI + 360) % 360; // 0 = +Z
  return ['Nam', 'Đông Nam', 'Đông', 'Đông Bắc', 'Bắc', 'Tây Bắc', 'Tây', 'Tây Nam'][Math.round(a / 45) % 8];
}
// Lô gần nhân vật nhất (đứng trong lô hoặc cách ranh giới ≤ pad mét), bỏ qua lô có id = exceptId.
export function plotNear(plots, x, z, pad = 2, exceptId = null) {
  let best = null, bd = Infinity;
  for (const p of plots) {
    if (p.id === exceptId) continue;
    const g = plotGeo(p), c = Math.cos(-g.rot), s = Math.sin(-g.rot), dx = x - g.x, dz = z - g.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    const d = Math.hypot(Math.max(Math.abs(lx) - g.width / 2, 0), Math.max(Math.abs(lz) - g.length / 2, 0));
    if (d <= pad && d < bd) { bd = d; best = p; }
  }
  return best;
}

// Hộp va chạm AABB (nửa cạnh theo X và Z) cho nhà (chỉ lô đã có nhà) và quán cà phê.
export const houseColliders = plots => [
  ...plots.filter(isBuilt).map(p => ({ x: Number(p.world_x), z: Number(p.world_z), hx: p.zone === 'rural' ? 4.5 : 4.6, hz: p.zone === 'rural' ? 3.7 : 4.6 })),
  { x: CAFE.x, z: CAFE.z, hx: 3.4, hz: 3.4 },
];

// ---------- Thời gian thế giới (giờ server, múi giờ Asia/Ho_Chi_Minh, tỷ lệ 1:1) ----------
// Cấu hình lấy từ GET /api/world/settings (applyWorldSettings); giá trị dưới đây là mặc định khi chưa tải được.
const WORLD = { timezone: 'Asia/Ho_Chi_Minh', day_cycle: { dawn_start: 5, day_start: 7, dusk_start: 17, night_start: 19 }, plot_label_mode: 'both' };
export function applyWorldSettings(s) {
  if (!s) return;
  if (typeof s.timezone === 'string') WORLD.timezone = s.timezone;
  if (s.day_cycle && ['dawn_start', 'day_start', 'dusk_start', 'night_start'].every(k => Number.isFinite(s.day_cycle[k]))) WORLD.day_cycle = { ...s.day_cycle };
  if (['code', 'owner', 'both'].includes(s.plot_label_mode)) WORLD.plot_label_mode = s.plot_label_mode;
}
export const plotLabelMode = () => WORLD.plot_label_mode;

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const pad = n => String(n).padStart(2, '0');
function localParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: WORLD.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const g = t => parts.find(x => x.type === t)?.value;
  return { year: +g('year'), month: +g('month'), day: +g('day'), hour: +g('hour'), minute: +g('minute'), second: +g('second'), weekday: WD[g('weekday')] };
}

// ?gio=20 trên URL để xem thử thế giới vào một giờ bất kỳ (dùng khi phát triển).
const hourOverride = (() => {
  try { const v = new URLSearchParams(location.search).get('gio'); return v == null ? null : Number(v); } catch { return null; }
})();

// Đồng hồ hiển thị: "Thứ Năm, 05/11/2026 — 18:30".
export function clockInfo(ms = serverNow()) {
  const t = localParts(ms);
  return {
    time: `${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}`,
    date: `${WEEKDAYS[t.weekday]}, ${pad(t.day)}/${pad(t.month)}/${t.year}`,
    display: `${WEEKDAYS[t.weekday]}, ${pad(t.day)}/${pad(t.month)}/${t.year} — ${pad(t.hour)}:${pad(t.minute)}`,
  };
}
export const localTime = () => clockInfo().time;

export function vnHour(ms = serverNow()) {
  if (Number.isFinite(hourOverride)) return hourOverride;
  const t = localParts(ms);
  return t.hour + t.minute / 60 + t.second / 3600;
}

// Ánh sáng theo giờ server và mốc cấu hình day_cycle (mặc định: bình minh 5–7h, ngày 7–17h, hoàng hôn 17–19h, đêm 19–5h).
// level: 0.25 (đêm) .. 1 (ngày), chuyển tiếp tuyến tính → ánh sáng, bầu trời, sương mù, đèn đường / đèn nhà đổi mượt.
export function sunState(ms = serverNow()) {
  const h = vnHour(ms), c = WORLD.day_cycle;
  let level, stage;
  if (h >= c.day_start && h < c.dusk_start) { level = 1; stage = 'Ban ngày'; }
  else if (h >= c.dawn_start && h < c.day_start) { level = 0.25 + (0.75 * (h - c.dawn_start)) / (c.day_start - c.dawn_start); stage = 'Bình minh'; }
  else if (h >= c.dusk_start && h < c.night_start) { level = 1 - (0.75 * (h - c.dusk_start)) / (c.night_start - c.dusk_start); stage = 'Hoàng hôn'; }
  else { level = 0.25; stage = 'Ban đêm'; }
  const night = (1 - level) / 0.75;
  const period = h >= 4 && h < 11 ? 'Buổi sáng' : h >= 11 && h < 13 ? 'Buổi trưa' : h >= 13 && h < 18 ? 'Buổi chiều' : 'Buổi tối';
  const icon = stage === 'Bình minh' ? '🌅' : stage === 'Hoàng hôn' ? '🌇' : stage === 'Ban đêm' ? '🌙' : period === 'Buổi trưa' ? '🌞' : period === 'Buổi chiều' ? '🌤️' : '☀️';
  return { hour: h, level, night, stage, period, label: period, icon };
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
