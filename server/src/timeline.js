// Real-Time Timeline: thời gian thế giới = thời gian thực của server (tỷ lệ 1:1), hiển thị theo múi giờ Asia/Ho_Chi_Minh.
// Server là nguồn thời gian chuẩn; client đồng bộ qua GET /api/world/time rồi tự nội suy.
// Thế giới không lưu "giờ game" riêng nên không bao giờ bị reset khi đăng xuất / không có ai online:
// mọi trạng thái theo thời gian (ánh sáng, cây lớn, pet đói…) được tính lại từ thời điểm hiện tại + mốc lưu trong database.
import { PLOT_CONFIG } from './plots.js';

// Cấu hình mặc định của thế giới (lưu trong bảng world_settings, chỉnh được).
// day_cycle là mốc cấu hình (giờ địa phương), không phải giờ mặt trời mọc / lặn thực tế.
export const DEFAULT_SETTINGS = {
  timezone: 'Asia/Ho_Chi_Minh',
  time_scale: 1,
  day_cycle: { dawn_start: 5, day_start: 7, dusk_start: 17, night_start: 19 },
  plot_label_mode: 'both', // biển tên lô đã có chủ: 'code' | 'owner' | 'both'
  plot_defaults: Object.fromEntries(Object.entries(PLOT_CONFIG).map(([z, c]) => [z, { width: c.width, length: c.length, rotation_y: c.rotationY }])),
  plot_sample_sizes: { city: [[10, 15], [12, 18]], rural: [[25, 30], [30, 40]] },
  time_sync_interval_sec: 300,
  build_setback: 0.5, // khoảng lùi xây dựng tối thiểu từ ranh giới lô (m)
  build_grid_sizes: [0.5, 1, 2],
};

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const WD_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const pad = n => String(n).padStart(2, '0');

// Ngày giờ địa phương theo múi giờ (không phụ thuộc múi giờ của máy chủ).
export function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value;
  return { year: +get('year'), month: +get('month'), day: +get('day'), hour: +get('hour'), minute: +get('minute'), second: +get('second'), weekday: WD_INDEX[get('weekday')] };
}

// Giai đoạn ánh sáng: bình minh / ban ngày / hoàng hôn / ban đêm; light_level 0.25 (đêm) → 1 (ngày), chuyển tiếp tuyến tính.
export function dayStage(h, c = DEFAULT_SETTINGS.day_cycle) {
  if (h >= c.dawn_start && h < c.day_start) return { stage: 'dawn', stage_name: 'Bình minh', light_level: 0.25 + (0.75 * (h - c.dawn_start)) / (c.day_start - c.dawn_start) };
  if (h >= c.day_start && h < c.dusk_start) return { stage: 'day', stage_name: 'Ban ngày', light_level: 1 };
  if (h >= c.dusk_start && h < c.night_start) return { stage: 'dusk', stage_name: 'Hoàng hôn', light_level: 1 - (0.75 * (h - c.dusk_start)) / (c.night_start - c.dusk_start) };
  return { stage: 'night', stage_name: 'Ban đêm', light_level: 0.25 };
}
// Buổi trong ngày để hiển thị: sáng / trưa / chiều / tối.
export function dayPeriod(h) {
  if (h >= 4 && h < 11) return { period: 'morning', period_name: 'Buổi sáng' };
  if (h >= 11 && h < 13) return { period: 'noon', period_name: 'Buổi trưa' };
  if (h >= 13 && h < 18) return { period: 'afternoon', period_name: 'Buổi chiều' };
  return { period: 'evening', period_name: 'Buổi tối' };
}

// Toàn bộ thông tin thời gian thế giới tại thời điểm now.
export function worldTime(settings = DEFAULT_SETTINGS, now = new Date()) {
  const tz = settings.timezone || DEFAULT_SETTINGS.timezone;
  const t = localParts(now, tz), h = t.hour + t.minute / 60 + t.second / 3600;
  const date = `${t.year}-${pad(t.month)}-${pad(t.day)}`, clock = `${pad(t.hour)}:${pad(t.minute)}`;
  return {
    utc: now.toISOString(), epoch_ms: now.getTime(), timezone: tz, time_scale: settings.time_scale || 1,
    local: `${date}T${clock}:${pad(t.second)}`,
    date: { year: t.year, month: t.month, day: t.day, weekday: t.weekday, weekday_name: WEEKDAYS[t.weekday] },
    time: { hour: t.hour, minute: t.minute, second: t.second },
    display: `${WEEKDAYS[t.weekday]}, ${pad(t.day)}/${pad(t.month)}/${t.year} — ${clock}`,
    ...dayPeriod(h), ...dayStage(h, settings.day_cycle || DEFAULT_SETTINGS.day_cycle),
    day_cycle: settings.day_cycle || DEFAULT_SETTINGS.day_cycle,
  };
}
