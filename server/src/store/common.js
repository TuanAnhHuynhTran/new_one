export const MAX_FURNITURE = 80;
// Ngôi nhà 2 lầu + sân thượng (16 × 11 m, ban công nhô ra phía trước): giới hạn tâm món đồ và số tầng.
export const HOUSE = { x: 7.9, z0: -5.4, z1: 7.4, floors: 3 };
export const furnitureSpotOk = ({ x, z, floor, rotation }) =>
  [x, z, rotation].every(n => typeof n === 'number' && Number.isFinite(n)) && Number.isInteger(floor) && floor >= 0 && floor < HOUSE.floors
  && Math.abs(x) <= HOUSE.x && z >= HOUSE.z0 && z <= HOUSE.z1 && Math.abs(rotation) <= 6.284;

// Nhu cầu pet suy giảm theo thời gian kể từ lần cho ăn gần nhất: đói +5/giờ (1 điểm/12 phút), vui -3/giờ (1 điểm/20 phút).
export const HUNGER_MINUTES = 12;
export const HAPPY_MINUTES = 20;

export function petNow(pet, now = Date.now()) {
  const minutes = pet.last_fed_at ? Math.max(0, Math.floor((now - Date.parse(pet.last_fed_at)) / 60000)) : 0;
  return {
    hunger: Math.min(100, pet.hunger + Math.floor(minutes / HUNGER_MINUTES)),
    happiness: Math.max(0, pet.happiness - Math.floor(minutes / HAPPY_MINUTES)),
  };
}

// ---------- Sân vườn ----------
// Tọa độ vườn: x từ -width/2 đến width/2 (width luôn chẵn), z từ 0 (sát nhà) đến depth.
// Mỗi khu (luống rau / hồ cá) là hình chữ nhật theo ô 1 m: góc (x, z), kích thước w × d.
export const GARDEN = { minW: 6, maxW: 16, minD: 4, maxD: 12, maxPlots: 30, defaultW: 10, defaultD: 6 };
export const PLOT_SIZE = { bed: { min: 1, max: 5 }, pond: { min: 2, max: 6 } };
// grow: số phút từ lúc gieo tới lúc thu hoạch được.
export const CROPS = [
  { id: 'cabbage', name: 'Rau cải', grow: 3 },
  { id: 'carrot', name: 'Cà rốt', grow: 4 },
  { id: 'sunflower', name: 'Hướng dương', grow: 5 },
  { id: 'tomato', name: 'Cà chua', grow: 6 },
  { id: 'pumpkin', name: 'Bí ngô', grow: 8 },
  { id: 'orange', name: 'Cây cam', grow: 15, tree: true },
  { id: 'apple', name: 'Cây táo', grow: 20, tree: true },
];
export const FISH = [
  { id: 'goldfish', name: 'Cá vàng' },
  { id: 'koi', name: 'Cá koi' },
  { id: 'guppy', name: 'Cá bảy màu' },
];
export const cropOf = id => CROPS.find(c => c.id === id);
export const fishCap = p => Math.min(20, p.w * p.d * 2);
// Cây ăn quả sau khi hái vẫn giữ cây, chỉ chờ quả mọc lại (từ 60% lên 100%).
export const TREE_REGROW = 0.6;

export function growth(plot, now = Date.now()) {
  const c = plot.crop && cropOf(plot.crop);
  if (!c || !plot.planted_at) return 0;
  return Math.min(1, Math.max(0, (now - Date.parse(plot.planted_at)) / (c.grow * 60000)));
}

const isInt = n => Number.isInteger(n);
const fits = (g, p) => p.x >= -g.width / 2 && p.x + p.w <= g.width / 2 && p.z >= 0 && p.z + p.d <= g.depth;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

// Kiểm tra một khu mới / khu được di chuyển; trả về mã lỗi hoặc null.
export function plotError(garden, plots, c, ignoreId = null) {
  const lim = PLOT_SIZE[c.kind];
  if (!lim) return 'KIND';
  if (![c.x, c.z, c.w, c.d].every(isInt) || c.w < lim.min || c.w > lim.max || c.d < lim.min || c.d > lim.max) return 'SIZE';
  if (!fits(garden, c)) return 'OUT';
  if (plots.some(p => p.id !== ignoreId && overlaps(p, c))) return 'OVERLAP';
  return null;
}
export function resizeError(width, depth, plots) {
  if (!isInt(width) || !isInt(depth) || width % 2 || width < GARDEN.minW || width > GARDEN.maxW || depth < GARDEN.minD || depth > GARDEN.maxD) return 'SIZE';
  if (plots.some(p => !fits({ width, depth }, p))) return 'PLOTS';
  return null;
}
export const gardenInfo = { crops: CROPS, fish: FISH, limits: GARDEN, sizes: PLOT_SIZE };

// Các thao tác trên một khu, dùng chung cho hai kiểu lưu trữ: trả về { error } hoặc { changes } cần ghi.
export function plantChange(plot, cropId, now = new Date()) {
  if (plot.kind !== 'bed') return { error: 'NOT_BED' };
  if (!cropOf(cropId)) return { error: 'NO_CROP' };
  if (plot.crop) return { error: 'BUSY' };
  return { changes: { crop: cropId, planted_at: now.toISOString() } };
}
export function harvestChange(plot, now = new Date()) {
  const c = plot.kind === 'bed' && plot.crop && cropOf(plot.crop);
  if (!c) return { error: 'EMPTY' };
  if (growth(plot, now.getTime()) < 1) return { error: 'NOT_RIPE' };
  return { changes: c.tree ? { planted_at: new Date(now.getTime() - TREE_REGROW * c.grow * 60000).toISOString() } : { crop: null, planted_at: null } };
}
export function fishChange(plot, species) {
  if (plot.kind !== 'pond') return { error: 'NOT_POND' };
  if (!FISH.some(f => f.id === species)) return { error: 'NO_FISH' };
  if (plot.fish.length >= fishCap(plot)) return { error: 'FULL' };
  return { changes: { fish: [...plot.fish, species] } };
}
export const publicPlot = p => ({ id: p.id, kind: p.kind, x: p.x, z: p.z, w: p.w, d: p.d, crop: p.crop ?? null, planted_at: p.planted_at ?? null, fish: p.fish || [] });
