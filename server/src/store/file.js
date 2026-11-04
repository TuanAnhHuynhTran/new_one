// Lưu trữ toàn bộ dữ liệu trong một file JSON. Mọi thao tác chạy đồng bộ trong một process Node
// nên không có race condition giữa các request; mỗi lần ghi đều lưu ngay xuống đĩa.
import fs from 'fs';
import path from 'path';
import { buildSeed, furnitureCatalog, seedGardens } from '../seed.js';
import { GARDEN, MAX_FURNITURE, fishChange, harvestChange, petNow, plantChange, plotError, publicPlot, resizeError } from './common.js';

export function createFileStore(file) {
  let data;
  const persist = () => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    try { fs.renameSync(tmp, file); } catch { fs.writeFileSync(file, JSON.stringify(data, null, 1)); fs.rmSync(tmp, { force: true }); }
  };
  if (fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Danh mục nội thất là dữ liệu tĩnh: luôn lấy bản mới nhất từ seed.js.
    data.furniture_catalog = furnitureCatalog;
    // File dữ liệu tạo từ phiên bản cũ chưa có sân vườn.
    if (!data.gardens) {
      data.gardens = [];
      data.garden_plots = [];
      data.seq.garden_plots = 0;
      seedGardens(data);
      persist();
    }
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    data = buildSeed();
    persist();
    console.log(`Đã tạo dữ liệu mẫu: ${file}`);
  }

  // So khớp không phân biệt hoa/thường, giống collation utf8mb4_unicode_ci của MySQL.
  const findUser = username => data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  const zoneSlug = zoneId => data.zones.find(z => z.id === zoneId)?.slug;
  const houseOf = userId => data.houses.find(h => h.user_id === userId);
  // Vườn được tạo mặc định ở lần đầu mở.
  const gardenOf = userId => {
    const h = houseOf(userId);
    if (!h) return null;
    let g = data.gardens.find(x => x.house_id === h.id);
    if (!g) { g = { house_id: h.id, width: GARDEN.defaultW, depth: GARDEN.defaultD, harvests: 0 }; data.gardens.push(g); persist(); }
    return g;
  };
  const plotsOf = g => data.garden_plots.filter(p => p.house_id === g.house_id);
  const gardenView = g => ({ width: g.width, depth: g.depth, harvests: g.harvests, plots: plotsOf(g).sort((a, b) => a.id - b.id).map(publicPlot) });
  // Áp dụng một thao tác (plantChange / harvestChange / fishChange) lên khu id của người chơi.
  const updatePlot = (userId, id, make) => {
    const g = gardenOf(userId);
    const p = g && data.garden_plots.find(x => x.id === id && x.house_id === g.house_id);
    if (!p) return { error: 'NOT_FOUND' };
    const r = make(p);
    if (r.error) return r;
    Object.assign(p, r.changes);
    return { g, plot: p };
  };
  const petsOf = userId => data.pets.filter(p => p.user_id === userId).map(p => ({ id: p.id, name: p.name, species: p.species, ...petNow(p) }));

  return {
    driver: 'file',
    fallbackSecret: () => data.meta.jwt_secret,
    async ping() {},

    async register(username, passwordHash, zone) {
      if (findUser(username)) return { error: 'DUP' };
      const zoneId = data.zones.find(z => z.slug === zone)?.id;
      const plot = data.land_plots.filter(p => p.zone_id === zoneId && p.owner_id == null).sort((a, b) => a.id - b.id)[0];
      if (!plot) return { error: 'NO_PLOT' };
      const now = new Date().toISOString();
      const id = ++data.seq.users;
      data.users.push({ id, username, password_hash: passwordHash, created_at: now });
      plot.owner_id = id;
      data.characters.push({ user_id: id, display_name: username, last_x: plot.world_x + (zone === 'city' ? 7 : 12), last_z: plot.world_z + 8 });
      data.houses.push({ id: ++data.seq.houses, user_id: id, plot_id: plot.id, wall_color: '#f2ddbc', roof_color: '#bd6956' });
      data.pets.push({ id: ++data.seq.pets, user_id: id, name: 'Mochi', species: 'dog', hunger: 20, happiness: 90, last_fed_at: now });
      persist();
      return { id };
    },

    async findUser(username) {
      const u = findUser(username);
      return u ? { id: u.id, password_hash: u.password_hash } : null;
    },

    async getMe(userId) {
      const u = data.users.find(x => x.id === userId);
      const c = data.characters.find(x => x.user_id === userId);
      const h = houseOf(userId);
      const p = h && data.land_plots.find(x => x.id === h.plot_id);
      if (!u || !c || !h || !p) return null;
      return {
        id: u.id, username: u.username, display_name: c.display_name, last_x: c.last_x, last_z: c.last_z,
        house_id: h.id, wall_color: h.wall_color, roof_color: h.roof_color,
        plot_id: p.id, plot_code: p.plot_code, world_x: p.world_x, world_z: p.world_z, size_x: p.size_x, size_z: p.size_z,
        zone: zoneSlug(p.zone_id), pets: petsOf(userId),
      };
    },

    async listPlots() {
      return data.land_plots.map(p => ({ id: p.id, plot_code: p.plot_code, world_x: p.world_x, world_z: p.world_z, size_x: p.size_x, size_z: p.size_z, owner_id: p.owner_id, zone: zoneSlug(p.zone_id) }));
    },

    async listCatalog() {
      return [...data.furniture_catalog].sort((a, b) => a.id - b.id);
    },

    async listFurniture(userId) {
      const h = houseOf(userId);
      if (!h) return [];
      return data.house_furniture.filter(f => f.house_id === h.id).sort((a, b) => a.id - b.id).map(f => {
        const c = data.furniture_catalog.find(x => x.id === f.catalog_id);
        return { id: f.id, catalog_id: f.catalog_id, pos_x: f.pos_x, pos_z: f.pos_z, rotation_y: f.rotation_y, kind: c?.kind, name: c?.name };
      });
    },

    async addFurniture(userId, { catalogId, x, z, rotation }) {
      const cat = data.furniture_catalog.find(c => c.id === catalogId);
      if (!cat) return { error: 'NO_ITEM' };
      const h = houseOf(userId);
      if (!h) return { error: 'NO_HOUSE' };
      if (data.house_furniture.filter(f => f.house_id === h.id).length >= MAX_FURNITURE) return { error: 'LIMIT' };
      // Làm tròn giống DECIMAL(7,2) / DECIMAL(7,3) trong schema MySQL.
      const row = { id: ++data.seq.house_furniture, house_id: h.id, catalog_id: catalogId, pos_x: +x.toFixed(2), pos_z: +z.toFixed(2), rotation_y: +rotation.toFixed(3), created_at: new Date().toISOString() };
      data.house_furniture.push(row);
      persist();
      return { id: row.id, catalog_id: catalogId, pos_x: row.pos_x, pos_z: row.pos_z, rotation_y: row.rotation_y, kind: cat.kind, name: cat.name };
    },

    async moveFurniture(userId, id, { x, z, rotation }) {
      const h = houseOf(userId);
      const f = h && data.house_furniture.find(r => r.id === id && r.house_id === h.id);
      if (!f) return null;
      f.pos_x = +x.toFixed(2); f.pos_z = +z.toFixed(2); f.rotation_y = +rotation.toFixed(3);
      persist();
      const c = data.furniture_catalog.find(c => c.id === f.catalog_id);
      return { id: f.id, catalog_id: f.catalog_id, pos_x: f.pos_x, pos_z: f.pos_z, rotation_y: f.rotation_y, kind: c?.kind, name: c?.name };
    },

    async deleteFurniture(userId, id) {
      const h = houseOf(userId);
      const i = h ? data.house_furniture.findIndex(f => f.id === id && f.house_id === h.id) : -1;
      if (i < 0) return false;
      data.house_furniture.splice(i, 1);
      persist();
      return true;
    },

    async feedPet(userId) {
      const pets = data.pets.filter(p => p.user_id === userId);
      if (!pets.length) return null;
      const now = new Date().toISOString();
      for (const p of pets) {
        const cur = petNow(p);
        p.hunger = Math.max(0, cur.hunger - 30);
        p.happiness = Math.min(100, cur.happiness + 10);
        p.last_fed_at = now;
      }
      persist();
      return petsOf(userId);
    },

    async getGarden(userId) {
      const g = gardenOf(userId);
      return g && gardenView(g);
    },

    async resizeGarden(userId, width, depth) {
      const g = gardenOf(userId);
      if (!g) return { error: 'NO_HOUSE' };
      const error = resizeError(width, depth, plotsOf(g));
      if (error) return { error };
      g.width = width; g.depth = depth;
      persist();
      return gardenView(g);
    },

    async addPlot(userId, c) {
      const g = gardenOf(userId);
      if (!g) return { error: 'NO_HOUSE' };
      const plots = plotsOf(g);
      if (plots.length >= GARDEN.maxPlots) return { error: 'LIMIT' };
      const error = plotError(g, plots, c);
      if (error) return { error };
      const row = { id: ++data.seq.garden_plots, house_id: g.house_id, kind: c.kind, x: c.x, z: c.z, w: c.w, d: c.d, crop: null, planted_at: null, fish: [] };
      data.garden_plots.push(row);
      persist();
      return publicPlot(row);
    },

    async movePlot(userId, id, { x, z, w, d }) {
      const g = gardenOf(userId);
      const p = g && data.garden_plots.find(r => r.id === id && r.house_id === g.house_id);
      if (!p) return { error: 'NOT_FOUND' };
      const error = plotError(g, plotsOf(g), { kind: p.kind, x, z, w, d }, p.id);
      if (error) return { error };
      Object.assign(p, { x, z, w, d });
      persist();
      return publicPlot(p);
    },

    async deletePlot(userId, id) {
      const g = gardenOf(userId);
      const i = g ? data.garden_plots.findIndex(p => p.id === id && p.house_id === g.house_id) : -1;
      if (i < 0) return false;
      data.garden_plots.splice(i, 1);
      persist();
      return true;
    },

    async plantPlot(userId, id, crop) {
      const r = updatePlot(userId, id, p => plantChange(p, crop));
      if (r.error) return r;
      persist();
      return publicPlot(r.plot);
    },

    async harvestPlot(userId, id) {
      const r = updatePlot(userId, id, p => harvestChange(p));
      if (r.error) return r;
      r.g.harvests += 1;
      persist();
      return { plot: publicPlot(r.plot), harvests: r.g.harvests };
    },

    async addFish(userId, id, species) {
      const r = updatePlot(userId, id, p => fishChange(p, species));
      if (r.error) return r;
      persist();
      return publicPlot(r.plot);
    },

    async savePosition(userId, x, z) {
      const c = data.characters.find(x => x.user_id === userId);
      if (!c) return;
      c.last_x = +x.toFixed(2);
      c.last_z = +z.toFixed(2);
      persist();
    },
  };
}
