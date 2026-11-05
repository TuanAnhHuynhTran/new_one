// Lưu trữ toàn bộ dữ liệu trong một file JSON. Mọi thao tác chạy đồng bộ trong một process Node
// nên không có race condition giữa các request; mỗi lần ghi đều lưu ngay xuống đĩa.
import fs from 'fs';
import path from 'path';
import { HOUSE_VERSION, PLOTS_VERSION, WORLD_DATA_VERSION, buildSeed, ensureWorldData, furnitureCatalog, seedGardens, upgradeHouses, upgradePlots } from '../seed.js';
import { PLOT_CONFIG, WORLD, isSpawnValid, publicLandPlot } from '../plots.js';
import { DEFAULT_SETTINGS } from '../timeline.js';
import { buildPermissionOf, emptyDesign, upgradeDesign, validateHouseDesign } from '../houseDesign.js';
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
    // File dữ liệu từ thời nhà còn 1 phòng: chuyển nội thất sang ngôi nhà 2 lầu mới.
    if ((data.meta.house_version || 1) < HOUSE_VERSION) { upgradeHouses(data); persist(); }
    // File dữ liệu cũ: lô đất chưa có trạng thái / chủ sở hữu theo nhân vật / ranh giới / điểm xuất hiện.
    if ((data.meta.plots_version || 1) < PLOTS_VERSION) { upgradePlots(data); persist(); }
    // Chưa có world_settings / player_spawn_points.
    if ((data.meta.world_version || 0) < WORLD_DATA_VERSION) { ensureWorldData(data); persist(); }
    // Thiết kế nhà một tầng cũ (schema 1) → schema 2 có levels, mọi đối tượng có level_id (giữ nguyên version).
    if ((data.house_designs || []).some(d => (d.design?.schema || 1) < 2)) {
      for (const d of data.house_designs) if ((d.design?.schema || 1) < 2) d.design = upgradeDesign(d.design);
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
  const houseById = houseId => data.houses.find(h => h.id === houseId);
  data.house_design_revisions = data.house_design_revisions || [];
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

    // Đăng ký: tạo tài khoản + nhân vật (xuất hiện ở trung tâm khu vực đã chọn) + pet. Lô đất được chọn sau, qua claimPlot.
    async register(username, passwordHash, zone) {
      if (findUser(username)) return { error: 'DUP' };
      const now = new Date().toISOString();
      const id = ++data.seq.users;
      const [hx, hz] = PLOT_CONFIG[zone].hub;
      data.users.push({ id, username, password_hash: passwordHash, created_at: now });
      data.characters.push({ user_id: id, display_name: username, zone_pref: zone, last_x: hx, last_z: hz });
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
      if (!u || !c) return null;
      const h = houseOf(userId);
      const p = data.land_plots.find(x => x.owner_character_id === c.user_id);
      return {
        id: u.id, character_id: c.user_id, username: u.username, display_name: c.display_name, last_x: c.last_x, last_z: c.last_z, zone_pref: c.zone_pref || 'rural',
        house_id: h?.id ?? null, wall_color: h?.wall_color ?? null, roof_color: h?.roof_color ?? null,
        // Chưa có lô đất → các trường lô là null, zone = khu vực đã chọn khi đăng ký.
        plot_id: p?.id ?? null, plot_code: p?.plot_code ?? null, world_x: p?.world_x ?? null, world_z: p?.world_z ?? null,
        size_x: p?.size_x ?? null, size_z: p?.size_z ?? null, spawn_x: p?.spawn_x ?? null, spawn_z: p?.spawn_z ?? null,
        zone: p ? zoneSlug(p.zone_id) : c.zone_pref || 'rural', pets: petsOf(userId),
      };
    },

    async listPlots() {
      return data.land_plots.map(p => publicLandPlot(p, zoneSlug(p.zone_id), data.characters.find(c => c.user_id === p.owner_character_id)?.display_name || null));
    },

    // Nhận lô đất. Chủ sở hữu luôn là nhân vật của tài khoản đang đăng nhập (không lấy từ client).
    // Node chạy đơn luồng và hàm này đồng bộ từ lúc kiểm tra tới lúc ghi → hai yêu cầu không thể cùng nhận một lô.
    async claimPlot(userId, plotId) {
      const c = data.characters.find(x => x.user_id === userId);
      if (!c) return { error: 'CHARACTER_NOT_FOUND' };
      const mine = data.land_plots.find(x => x.owner_character_id === c.user_id);
      if (mine) return { error: 'PLAYER_ALREADY_HAS_PLOT', plot: mine.plot_code };
      const p = data.land_plots.find(x => x.id === plotId);
      if (!p) return { error: 'PLOT_NOT_FOUND' };
      if (p.status === 'owned' || p.owner_character_id != null) return { error: 'PLOT_ALREADY_OWNED' };
      if (p.status !== 'available') return { error: 'PLOT_NOT_AVAILABLE' };
      // Điểm xuất hiện trước cổng phải nằm ngoài mọi lô đất / vật cản lớn.
      if (!isSpawnValid(Number(p.spawn_x), Number(p.spawn_z), data.land_plots)) return { error: 'INVALID_SPAWN' };
      const now = new Date().toISOString();
      Object.assign(p, { owner_character_id: c.user_id, status: 'owned', updated_at: now });
      const h = houseOf(userId);
      if (h) h.plot_id = p.id; else data.houses.push({ id: ++data.seq.houses, user_id: userId, plot_id: p.id, wall_color: '#f2ddbc', roof_color: '#bd6956' });
      // Lưu điểm xuất hiện "home" của nhân vật và đặt nhân vật ngay trước cổng / mặt tiền.
      const spawn = { x: p.spawn_x, y: 0, z: p.spawn_z, rotation_y: +(Number(p.rotation_y || 0) + Math.PI).toFixed(4), plot_id: p.id, world_id: p.world_id || WORLD.id, updated_at: now };
      const sp = data.player_spawn_points.find(x => x.character_id === c.user_id && x.kind === 'home');
      if (sp) Object.assign(sp, spawn);
      else data.player_spawn_points.push({ id: ++data.seq.player_spawn_points, character_id: c.user_id, kind: 'home', created_at: now, ...spawn });
      c.last_x = p.spawn_x; c.last_z = p.spawn_z;
      persist();
      return { plot: publicLandPlot(p, zoneSlug(p.zone_id), c.display_name, true) };
    },

    // Về nhà: chỉ dùng điểm xuất hiện "home" đã lưu của nhân vật (không nhận toạ độ từ client).
    async goHome(userId) {
      const c = data.characters.find(x => x.user_id === userId);
      if (!c) return { error: 'CHARACTER_NOT_FOUND' };
      const p = data.land_plots.find(x => x.owner_character_id === c.user_id);
      if (!p) return { error: 'NO_PLOT' };
      const sp = data.player_spawn_points.find(x => x.character_id === c.user_id && x.kind === 'home' && x.plot_id === p.id);
      if (!sp || !isSpawnValid(Number(sp.x), Number(sp.z), data.land_plots)) return { error: 'INVALID_SPAWN' };
      c.last_x = sp.x; c.last_z = sp.z;
      persist();
      return { x: sp.x, z: sp.z, rotation_y: sp.rotation_y, plot_code: p.plot_code };
    },

    async myPlot(userId) {
      const c = data.characters.find(x => x.user_id === userId);
      if (!c) return { error: 'CHARACTER_NOT_FOUND' };
      const p = data.land_plots.find(x => x.owner_character_id === c.user_id);
      if (!p) return { plot: null, spawn: null };
      const sp = data.player_spawn_points.find(x => x.character_id === c.user_id && x.kind === 'home');
      return { plot: publicLandPlot(p, zoneSlug(p.zone_id), c.display_name, true), spawn: sp ? { x: sp.x, y: sp.y, z: sp.z, rotation_y: sp.rotation_y } : null };
    },

    // Thông tin chủ sở hữu được phép công khai: chỉ tên hiển thị và thời điểm nhận đất.
    async plotOwner(plotId) {
      const p = data.land_plots.find(x => x.id === plotId);
      if (!p) return null;
      const c = p.owner_character_id != null && data.characters.find(x => x.user_id === p.owner_character_id);
      return { plot_id: p.id, plot_code: p.plot_code, status: p.status, owner: c ? { display_name: c.display_name, since: p.updated_at || null } : null };
    },

    async listZones() {
      return data.zones.map(z => {
        const ps = data.land_plots.filter(p => p.zone_id === z.id);
        return { id: z.id, slug: z.slug, name: z.name, world_id: WORLD.id, total_plots: ps.length, available_plots: ps.filter(p => p.status === 'available').length };
      });
    },

    async getSettings() {
      const out = { ...DEFAULT_SETTINGS };
      for (const r of data.world_settings || []) if (r.world_id === WORLD.id) out[r.key] = r.value;
      return out;
    },

    // ---------- House Builder ----------
    async buildPermission(userId, plotId) {
      return buildPermissionOf(data.land_plots.find(x => x.id === plotId), userId);
    },
    // Thiết kế đã lưu của mọi lô (để vẽ tường + va chạm trong thế giới).
    async listHouseDesigns() {
      return (data.house_designs || []).map(d => ({ house_id: d.house_id || null, plot_id: d.plot_id, version: d.version, revision: d.version, design: d.design }));
    },
    // Ai cũng xem được thiết kế (chế độ xem); chỉ chủ lô mới lưu được (saveHouseDesign).
    async getHouseDesign(plotId) {
      const p = data.land_plots.find(x => x.id === plotId);
      if (!p) return null;
      const d = (data.house_designs || []).find(x => x.plot_id === plotId);
      const owner = p.owner_character_id != null ? data.characters.find(c => c.user_id === p.owner_character_id)?.display_name || null : null;
      return { house_id: d?.house_id || data.houses.find(h => h.plot_id === p.id)?.id || null, plot_id: p.id, plot_code: p.plot_code, owner_name: owner, version: d?.version || 0, revision: d?.version || 0, design: d?.design || emptyDesign(), updated_at: d?.updated_at || null };
    },
    // Lưu thiết kế: chủ sở hữu kiểm tra theo JWT (userId), toàn bộ cấu trúc được kiểm tra lại, chống ghi đè bằng version.
    async saveHouseDesign(userId, plotId, design, version, opts = {}) {
      const p = data.land_plots.find(x => x.id === plotId);
      if (!p) return { error: 'PLOT_NOT_FOUND' };
      if (p.owner_character_id == null || p.owner_character_id !== userId) return { error: 'NOT_PLOT_OWNER' };
      const v = validateHouseDesign(design, p, opts);
      if (v.error) return v;
      data.house_designs = data.house_designs || [];
      let d = data.house_designs.find(x => x.plot_id === plotId);
      if ((d?.version || 0) !== version) return { error: 'VERSION_CONFLICT', version: d?.version || 0 };
      const now = new Date().toISOString();
      if (!d) { d = { plot_id: plotId, house_id: houseOf(userId)?.id ?? null, version: 0 }; data.house_designs.push(d); }
      Object.assign(d, { design: v.design, version: d.version + 1, updated_by_character_id: userId, updated_at: now });
      if (d.house_id) data.house_design_revisions.push({ house_id: d.house_id, plot_id: plotId, revision: d.version, design: v.design, created_by_character_id: userId, created_at: now });
      persist();
      return { house_id: d.house_id, plot_id: plotId, version: d.version, revision: d.version, design: d.design, updated_at: now };
    },

    async getMyHouse(userId) {
      const h = houseOf(userId);
      if (!h) return null;
      const p = data.land_plots.find(x => x.id === h.plot_id);
      const d = (data.house_designs || []).find(x => x.house_id === h.id || x.plot_id === h.plot_id);
      return { id: h.id, plot_id: h.plot_id, plot_code: p?.plot_code || null, revision: d?.version || 0, updated_at: d?.updated_at || null };
    },
    async getHouseDesignByHouse(houseId, revision = null) {
      const h = houseById(houseId);
      if (!h) return null;
      if (revision != null) {
        const r = data.house_design_revisions.find(x => x.house_id === houseId && x.revision === revision);
        return r ? { house_id: houseId, plot_id: h.plot_id, revision: r.revision, version: r.revision, design: r.design, updated_at: r.created_at } : null;
      }
      return this.getHouseDesign(h.plot_id);
    },
    async validateHouseDesignByHouse(userId, houseId, design, opts = {}) {
      const h = houseById(houseId);
      if (!h) return { error: 'HOUSE_NOT_FOUND' };
      if (h.user_id !== userId) return { error: 'NOT_PLOT_OWNER' };
      const p = data.land_plots.find(x => x.id === h.plot_id);
      const r = validateHouseDesign(design, p, opts);
      return r.error ? r : { house_id: h.id, plot_id: h.plot_id, valid: true, design: r.design };
    },
    async saveHouseDesignByHouse(userId, houseId, design, baseRevision, opts = {}) {
      const h = houseById(houseId);
      if (!h) return { error: 'HOUSE_NOT_FOUND' };
      if (h.user_id !== userId) return { error: 'NOT_PLOT_OWNER' };
      const r = await this.saveHouseDesign(userId, h.plot_id, design, baseRevision, opts);
      if (r.error === 'VERSION_CONFLICT') return { ...r, error: 'HOUSE_REVISION_CONFLICT', revision: r.version };
      return r;
    },
    async listHouseRevisions(userId, houseId) {
      const h = houseById(houseId);
      if (!h) return { error: 'HOUSE_NOT_FOUND' };
      if (h.user_id !== userId) return { error: 'NOT_PLOT_OWNER' };
      return { house_id: houseId, revisions: data.house_design_revisions.filter(x => x.house_id === houseId).sort((a, b) => b.revision - a.revision).map(x => ({ revision: x.revision, created_at: x.created_at, created_by_character_id: x.created_by_character_id })) };
    },

    // Seed chạy lại (npm run seed -w server): chỉ bổ sung phần còn thiếu.
    async ensureSeed() { ensureWorldData(data); persist(); },

    async listCatalog() {
      return [...data.furniture_catalog].sort((a, b) => a.id - b.id);
    },

    async listFurniture(userId) {
      const h = houseOf(userId);
      if (!h) return [];
      return data.house_furniture.filter(f => f.house_id === h.id).sort((a, b) => a.id - b.id).map(f => {
        const c = data.furniture_catalog.find(x => x.id === f.catalog_id);
        return { id: f.id, catalog_id: f.catalog_id, pos_x: f.pos_x, pos_z: f.pos_z, floor: f.floor || 0, rotation_y: f.rotation_y, kind: c?.kind, name: c?.name };
      });
    },

    async addFurniture(userId, { catalogId, x, z, floor = 0, rotation }) {
      const cat = data.furniture_catalog.find(c => c.id === catalogId);
      if (!cat) return { error: 'NO_ITEM' };
      const h = houseOf(userId);
      if (!h) return { error: 'NO_HOUSE' };
      if (data.house_furniture.filter(f => f.house_id === h.id).length >= MAX_FURNITURE) return { error: 'LIMIT' };
      // Làm tròn giống DECIMAL(7,2) / DECIMAL(7,3) trong schema MySQL.
      const row = { id: ++data.seq.house_furniture, house_id: h.id, catalog_id: catalogId, pos_x: +x.toFixed(2), pos_z: +z.toFixed(2), floor, rotation_y: +rotation.toFixed(3), created_at: new Date().toISOString() };
      data.house_furniture.push(row);
      persist();
      return { id: row.id, catalog_id: catalogId, pos_x: row.pos_x, pos_z: row.pos_z, floor, rotation_y: row.rotation_y, kind: cat.kind, name: cat.name };
    },

    async moveFurniture(userId, id, { x, z, floor = 0, rotation }) {
      const h = houseOf(userId);
      const f = h && data.house_furniture.find(r => r.id === id && r.house_id === h.id);
      if (!f) return null;
      f.pos_x = +x.toFixed(2); f.pos_z = +z.toFixed(2); f.floor = floor; f.rotation_y = +rotation.toFixed(3);
      persist();
      const c = data.furniture_catalog.find(c => c.id === f.catalog_id);
      return { id: f.id, catalog_id: f.catalog_id, pos_x: f.pos_x, pos_z: f.pos_z, floor: f.floor || 0, rotation_y: f.rotation_y, kind: c?.kind, name: c?.name };
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
