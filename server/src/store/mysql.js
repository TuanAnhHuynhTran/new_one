// Lưu trữ MySQL (DB_DRIVER=mysql). Cần chạy database/schema.sql trước.
import mysql from 'mysql2/promise';
import { PLOT_CONFIG, WORLD, completePlot, initialStatus, isSpawnValid, publicLandPlot } from '../plots.js';
import { DEFAULT_SETTINGS } from '../timeline.js';
import { buildPermissionOf, emptyDesign, upgradeDesign, validateHouseDesign } from '../houseDesign.js';
import { GARDEN, MAX_FURNITURE, HUNGER_MINUTES, HAPPY_MINUTES, fishChange, harvestChange, plantChange, plotError, publicPlot, resizeError } from './common.js';

const ELAPSED = 'TIMESTAMPDIFF(MINUTE,COALESCE(last_fed_at,NOW()),NOW())';
const HUNGER_NOW = `LEAST(100,CAST(hunger AS SIGNED)+FLOOR(${ELAPSED}/${HUNGER_MINUTES}))`;
const HAPPY_NOW = `GREATEST(0,CAST(happiness AS SIGNED)-FLOOR(${ELAPSED}/${HAPPY_MINUTES}))`;
const PLOT_SELECT = 'SELECT id,kind,pos_x x,pos_z z,size_w w,size_d d,crop,planted_at,fish FROM garden_plots';
// planted_at lưu dạng DATETIME theo giờ UTC (pool đặt timezone Z) → trả về chuỗi ISO giống chế độ file.
const rowToPlot = r => publicPlot({ ...r, planted_at: r.planted_at ? new Date(r.planted_at).toISOString() : null, fish: r.fish ? r.fish.split(',') : [] });
const toDate = iso => (iso ? new Date(iso) : null);
const PET_SELECT = `SELECT id,name,species,${HUNGER_NOW} hunger,${HAPPY_NOW} happiness FROM pets WHERE user_id=?`;

export function createMysqlStore({ host, port, user, password, database }) {
  const db = mysql.createPool({ host, port, user, password, database, waitForConnections: true, connectionLimit: 10, decimalNumbers: true, timezone: 'Z' });
  // Vườn của người chơi (tạo mặc định ở lần đầu).
  const gardenOf = async userId => {
    const [h] = await db.query('SELECT id FROM houses WHERE user_id=?', [userId]);
    if (!h.length) return null;
    await db.query('INSERT IGNORE INTO gardens(house_id,width,depth) VALUES (?,?,?)', [h[0].id, GARDEN.defaultW, GARDEN.defaultD]);
    const [g] = await db.query('SELECT house_id,width,depth,harvests FROM gardens WHERE house_id=?', [h[0].id]);
    const [rows] = await db.query(PLOT_SELECT + ' WHERE house_id=? ORDER BY id', [h[0].id]);
    return { ...g[0], plots: rows.map(rowToPlot) };
  };
  const view = g => ({ width: g.width, depth: g.depth, harvests: g.harvests, plots: g.plots });
  // Nâng cấp database tạo từ schema cũ (lô đất chỉ có owner_id theo tài khoản): thêm world_id, trạng thái, chủ sở hữu theo nhân vật,
  // ranh giới, điểm xuất hiện… Giữ nguyên toạ độ và kích thước các lô đã có.
  let plotsReady = null;
  const hasColumn = async (table, col) => (await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [col]))[0].length > 0;
  const migratePlots = () => (plotsReady ??= (async () => {
    await db.query('CREATE TABLE IF NOT EXISTS worlds (id TINYINT UNSIGNED PRIMARY KEY, slug VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(60) NOT NULL)');
    await db.query('INSERT IGNORE INTO worlds(id,slug,name) VALUES (?,?,?)', [WORLD.id, WORLD.slug, WORLD.name]);
    if (!(await hasColumn('characters', 'zone_pref'))) {
      await db.query("ALTER TABLE characters ADD COLUMN zone_pref VARCHAR(10) NOT NULL DEFAULT 'rural'");
      await db.query('UPDATE characters c JOIN houses h ON h.user_id=c.user_id JOIN land_plots p ON p.id=h.plot_id JOIN zones z ON z.id=p.zone_id SET c.zone_pref=z.slug');
    }
    if (!(await hasColumn('land_plots', 'status'))) {
      await db.query(`ALTER TABLE land_plots
        ADD COLUMN world_id TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER id,
        ADD COLUMN position_y DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER world_x,
        ADD COLUMN rotation_y DECIMAL(7,4) NOT NULL DEFAULT 0 AFTER world_z,
        ADD COLUMN boundary_polygon JSON NULL,
        ADD COLUMN spawn_x DECIMAL(10,2) NULL, ADD COLUMN spawn_z DECIMAL(10,2) NULL,
        ADD COLUMN status ENUM('available','owned','reserved','disabled') NOT NULL DEFAULT 'available',
        ADD COLUMN owner_character_id BIGINT UNSIGNED NULL,
        ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        ADD UNIQUE KEY uq_plot_owner_character (owner_character_id),
        ADD INDEX idx_plot_zone_status (zone_id, status),
        ADD CONSTRAINT fk_plot_world FOREIGN KEY (world_id) REFERENCES worlds(id),
        ADD CONSTRAINT fk_plot_owner_character FOREIGN KEY (owner_character_id) REFERENCES characters(user_id) ON DELETE SET NULL`);
      // Chủ cũ theo tài khoản (owner_id) = nhân vật cùng id (mỗi tài khoản một nhân vật).
      await db.query("UPDATE land_plots SET owner_character_id=owner_id, status=IF(owner_id IS NULL,'available','owned')");
    }
    // Điền ranh giới / điểm xuất hiện còn thiếu và trạng thái đặt trước / quy hoạch theo cấu hình.
    const [rows] = await db.query('SELECT p.id,p.plot_code,p.world_x,p.world_z,p.size_x,p.size_z,p.rotation_y,p.status,z.slug zone FROM land_plots p JOIN zones z ON z.id=p.zone_id WHERE p.boundary_polygon IS NULL OR p.spawn_x IS NULL');
    for (const r of rows) {
      const c = completePlot(r, r.zone);
      await db.query('UPDATE land_plots SET boundary_polygon=?,spawn_x=?,spawn_z=?,status=? WHERE id=?', [JSON.stringify(c.boundary_polygon), c.spawn_x, c.spawn_z, r.status === 'available' ? initialStatus(r.plot_code) : r.status, r.id]);
    }
    // Cấu hình thế giới (chỉ thêm khoá còn thiếu — không ghi đè giá trị đã chỉnh).
    await db.query(`CREATE TABLE IF NOT EXISTS world_settings (
      world_id TINYINT UNSIGNED NOT NULL, setting_key VARCHAR(50) NOT NULL, setting_value JSON NOT NULL,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (world_id, setting_key), CONSTRAINT fk_ws_world FOREIGN KEY (world_id) REFERENCES worlds(id)) ENGINE=InnoDB`);
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await db.query('INSERT IGNORE INTO world_settings(world_id,setting_key,setting_value) VALUES (?,?,?)', [WORLD.id, key, JSON.stringify(value)]);
    }
    // Điểm xuất hiện của nhân vật (home = trước cổng lô đất), một điểm mỗi loại cho mỗi nhân vật.
    await db.query(`CREATE TABLE IF NOT EXISTS player_spawn_points (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, character_id BIGINT UNSIGNED NOT NULL, world_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
      plot_id BIGINT UNSIGNED NULL, kind ENUM('home') NOT NULL DEFAULT 'home',
      x DECIMAL(10,2) NOT NULL, y DECIMAL(10,2) NOT NULL DEFAULT 0, z DECIMAL(10,2) NOT NULL, rotation_y DECIMAL(7,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_spawn_character_kind (character_id, kind), INDEX idx_spawn_plot (plot_id),
      CONSTRAINT fk_spawn_character FOREIGN KEY (character_id) REFERENCES characters(user_id) ON DELETE CASCADE,
      CONSTRAINT fk_spawn_plot FOREIGN KEY (plot_id) REFERENCES land_plots(id) ON DELETE SET NULL,
      CONSTRAINT fk_spawn_world FOREIGN KEY (world_id) REFERENCES worlds(id)) ENGINE=InnoDB`);
    await db.query(`INSERT IGNORE INTO player_spawn_points(character_id,world_id,plot_id,kind,x,y,z,rotation_y)
      SELECT owner_character_id,world_id,id,'home',spawn_x,0,spawn_z,ROUND(rotation_y+PI(),4) FROM land_plots WHERE owner_character_id IS NOT NULL AND spawn_x IS NOT NULL`);
    // Thiết kế nhà (House Builder): một bản ghi mỗi lô, lưu JSON theo toạ độ local của lô.
    await db.query(`CREATE TABLE IF NOT EXISTS house_designs (
      plot_id BIGINT UNSIGNED PRIMARY KEY, house_id BIGINT UNSIGNED NULL, design JSON NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
      updated_by_character_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_design_plot FOREIGN KEY (plot_id) REFERENCES land_plots(id) ON DELETE CASCADE,
      CONSTRAINT fk_design_house FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE SET NULL,
      CONSTRAINT fk_design_character FOREIGN KEY (updated_by_character_id) REFERENCES characters(user_id) ON DELETE SET NULL) ENGINE=InnoDB`);
    await db.query(`CREATE TABLE IF NOT EXISTS house_design_revisions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, house_id BIGINT UNSIGNED NOT NULL, plot_id BIGINT UNSIGNED NOT NULL,
      revision INT UNSIGNED NOT NULL, design JSON NOT NULL, created_by_character_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_house_revision (house_id,revision), INDEX idx_revision_plot (plot_id,revision),
      CONSTRAINT fk_revision_house FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE,
      CONSTRAINT fk_revision_plot FOREIGN KEY (plot_id) REFERENCES land_plots(id) ON DELETE CASCADE,
      CONSTRAINT fk_revision_character FOREIGN KEY (created_by_character_id) REFERENCES characters(user_id) ON DELETE SET NULL) ENGINE=InnoDB`);
    await db.query(`INSERT IGNORE INTO house_design_revisions(house_id,plot_id,revision,design,created_by_character_id,created_at)
      SELECT house_id,plot_id,version,design,updated_by_character_id,COALESCE(updated_at,CURRENT_TIMESTAMP)
      FROM house_designs WHERE house_id IS NOT NULL AND version>0`);
    // Nhà nhiều tầng (schema 2): nâng cấp thiết kế cũ — thêm levels, level_id cho mọi tường / phòng / sàn (giữ nguyên version).
    const [old] = await db.query("SELECT plot_id, design FROM house_designs WHERE COALESCE(JSON_EXTRACT(design, '$.schema'), 1) < 2");
    for (const r of old) {
      const d = upgradeDesign(typeof r.design === 'string' ? JSON.parse(r.design) : r.design);
      await db.query('UPDATE house_designs SET design=? WHERE plot_id=?', [JSON.stringify(d), r.plot_id]);
    }
  })().catch(err => { plotsReady = null; throw err; }));
  const PLOT_ROWS = 'SELECT p.*,z.slug zone,c.display_name owner_name FROM land_plots p JOIN zones z ON z.id=p.zone_id LEFT JOIN characters c ON c.user_id=p.owner_character_id';
  // Database tạo từ schema cũ (nhà 1 phòng) chưa có cột floor: thêm cột và dời đồ cũ vào phòng khách tầng trệt của nhà 2 lầu.
  let floorReady = null;
  const ensureFloor = () => (floorReady ??= (async () => {
    const [cols] = await db.query("SHOW COLUMNS FROM house_furniture LIKE 'floor'");
    if (cols.length) return;
    await db.query('ALTER TABLE house_furniture ADD COLUMN floor TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER pos_z');
    await db.query('UPDATE house_furniture SET pos_x=ROUND(GREATEST(-4.4,LEAST(4.4,pos_x))*0.75-2.2,2), pos_z=ROUND(GREATEST(-3.6,LEAST(3.6,pos_z))*0.6+2.2,2)');
  })().catch(err => { floorReady = null; throw err; }));
  const updatePlot = async (userId, id, make) => {
    const g = await gardenOf(userId);
    const p = g && g.plots.find(x => x.id === id);
    if (!p) return { error: 'NOT_FOUND' };
    const r = make(p);
    if (r.error) return r;
    const c = r.changes, sets = [], vals = [];
    if ('crop' in c) { sets.push('crop=?'); vals.push(c.crop); }
    if ('planted_at' in c) { sets.push('planted_at=?'); vals.push(toDate(c.planted_at)); }
    if ('fish' in c) { sets.push('fish=?'); vals.push(c.fish.join(',')); }
    await db.query(`UPDATE garden_plots SET ${sets.join(',')} WHERE id=? AND house_id=?`, [...vals, id, g.house_id]);
    return { g, plot: { ...p, ...c } };
  };
  return {
    driver: 'mysql',
    fallbackSecret: null,
    // ping chạy trước khi server mở cổng → nâng cấp schema lô đất (nếu là database cũ) trước khi nhận request.
    async ping() { await db.query('SELECT 1'); await migratePlots(); },

    // Đăng ký: tài khoản + nhân vật (ở trung tâm khu vực đã chọn) + pet. Lô đất được chọn sau qua claimPlot.
    async register(username, passwordHash, zone) {
      const [hx, hz] = PLOT_CONFIG[zone].hub;
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.query('INSERT INTO users(username,password_hash) VALUES (?,?)', [username, passwordHash]);
        const id = result.insertId;
        await connection.query('INSERT INTO characters(user_id,display_name,zone_pref,last_x,last_z) VALUES (?,?,?,?,?)', [id, username, zone, hx, hz]);
        await connection.query("INSERT INTO pets(user_id,name,species,last_fed_at) VALUES (?,'Mochi','dog',NOW())", [id]);
        await connection.commit();
        return { id };
      } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') return { error: 'DUP' };
        throw err;
      } finally { connection.release(); }
    },

    async findUser(username) {
      const [rows] = await db.query('SELECT id,password_hash FROM users WHERE username=?', [username]);
      return rows[0] || null;
    },

    async getMe(userId) {
      // LEFT JOIN: người chơi chưa nhận lô đất vẫn có hồ sơ (các trường lô đất = null, zone = khu vực đã chọn khi đăng ký).
      const [rows] = await db.query(`SELECT u.id,c.user_id character_id,u.username,c.display_name,c.last_x,c.last_z,c.zone_pref,h.id house_id,h.wall_color,h.roof_color,
 p.id plot_id,p.plot_code,p.world_x,p.world_z,p.size_x,p.size_z,p.spawn_x,p.spawn_z,COALESCE(z.slug,c.zone_pref) zone
 FROM users u JOIN characters c ON c.user_id=u.id LEFT JOIN land_plots p ON p.owner_character_id=c.user_id LEFT JOIN zones z ON z.id=p.zone_id
 LEFT JOIN houses h ON h.user_id=u.id WHERE u.id=?`, [userId]);
      if (!rows.length) return null;
      const [pets] = await db.query(PET_SELECT, [userId]);
      return { ...rows[0], pets };
    },

    async listPlots() {
      const [rows] = await db.query(PLOT_ROWS + ' ORDER BY p.id');
      return rows.map(r => publicLandPlot(r, r.zone, r.owner_name));
    },

    // Nhận lô đất trong một transaction:
    //  - khoá bản ghi nhân vật (FOR UPDATE) → một nhân vật không thể nhận hai lô cùng lúc;
    //  - khoá bản ghi lô đất (FOR UPDATE) → hai người không thể cùng nhận một lô;
    //  - UNIQUE(owner_character_id), UNIQUE(houses.user_id / plot_id), UNIQUE(player_spawn_points.character_id, kind) chặn thêm ở tầng database.
    async claimPlot(userId, plotId) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const fail = async (error, extra) => { await conn.rollback(); return { error, ...extra }; };
        const [chars] = await conn.query('SELECT user_id FROM characters WHERE user_id=? FOR UPDATE', [userId]);
        if (!chars.length) return fail('CHARACTER_NOT_FOUND');
        const [mine] = await conn.query('SELECT plot_code FROM land_plots WHERE owner_character_id=? FOR UPDATE', [userId]);
        if (mine.length) return fail('PLAYER_ALREADY_HAS_PLOT', { plot: mine[0].plot_code });
        const [rows] = await conn.query('SELECT id,world_id,status,owner_character_id,spawn_x,spawn_z,rotation_y FROM land_plots WHERE id=? FOR UPDATE', [plotId]);
        if (!rows.length) return fail('PLOT_NOT_FOUND');
        const p = rows[0];
        if (p.status === 'owned' || p.owner_character_id != null) return fail('PLOT_ALREADY_OWNED');
        if (p.status !== 'available') return fail('PLOT_NOT_AVAILABLE');
        const [all] = await conn.query('SELECT boundary_polygon FROM land_plots');
        if (!isSpawnValid(Number(p.spawn_x), Number(p.spawn_z), all)) return fail('INVALID_SPAWN');
        const [u] = await conn.query("UPDATE land_plots SET owner_character_id=?,status='owned' WHERE id=? AND status='available' AND owner_character_id IS NULL", [userId, plotId]);
        if (u.affectedRows !== 1) return fail('PLOT_ALREADY_OWNED');
        const [h] = await conn.query('SELECT id FROM houses WHERE user_id=?', [userId]);
        if (h.length) await conn.query('UPDATE houses SET plot_id=? WHERE id=?', [plotId, h[0].id]);
        else await conn.query('INSERT INTO houses(user_id,plot_id) VALUES (?,?)', [userId, plotId]);
        // Lưu điểm xuất hiện "home" và đặt nhân vật ngay trước cổng / mặt tiền.
        const rot = +(Number(p.rotation_y || 0) + Math.PI).toFixed(4);
        await conn.query(`INSERT INTO player_spawn_points(character_id,world_id,plot_id,kind,x,y,z,rotation_y) VALUES (?,?,?,'home',?,0,?,?)
          ON DUPLICATE KEY UPDATE world_id=VALUES(world_id),plot_id=VALUES(plot_id),x=VALUES(x),y=VALUES(y),z=VALUES(z),rotation_y=VALUES(rotation_y)`,
        [userId, p.world_id || WORLD.id, plotId, p.spawn_x, p.spawn_z, rot]);
        await conn.query('UPDATE characters SET last_x=?,last_z=? WHERE user_id=?', [p.spawn_x, p.spawn_z, userId]);
        await conn.commit();
      } catch (err) {
        await conn.rollback().catch(() => {});
        if (err.code === 'ER_DUP_ENTRY') return { error: 'PLOT_ALREADY_OWNED' };
        throw err;
      } finally { conn.release(); }
      const [rows] = await db.query(PLOT_ROWS + ' WHERE p.id=?', [plotId]);
      return { plot: publicLandPlot(rows[0], rows[0].zone, rows[0].owner_name, true) };
    },

    // Về nhà: chỉ dùng điểm xuất hiện "home" đã lưu (không nhận toạ độ từ client).
    async goHome(userId) {
      const [plots] = await db.query('SELECT id,plot_code FROM land_plots WHERE owner_character_id=?', [userId]);
      if (!plots.length) return { error: 'NO_PLOT' };
      const [sp] = await db.query("SELECT x,z,rotation_y FROM player_spawn_points WHERE character_id=? AND kind='home' AND plot_id=?", [userId, plots[0].id]);
      const [all] = await db.query('SELECT boundary_polygon FROM land_plots');
      if (!sp.length || !isSpawnValid(Number(sp[0].x), Number(sp[0].z), all)) return { error: 'INVALID_SPAWN' };
      await db.query('UPDATE characters SET last_x=?,last_z=? WHERE user_id=?', [sp[0].x, sp[0].z, userId]);
      return { x: Number(sp[0].x), z: Number(sp[0].z), rotation_y: Number(sp[0].rotation_y), plot_code: plots[0].plot_code };
    },

    async myPlot(userId) {
      const [c] = await db.query('SELECT user_id FROM characters WHERE user_id=?', [userId]);
      if (!c.length) return { error: 'CHARACTER_NOT_FOUND' };
      const [rows] = await db.query(PLOT_ROWS + ' WHERE p.owner_character_id=?', [userId]);
      if (!rows.length) return { plot: null, spawn: null };
      const [sp] = await db.query("SELECT x,y,z,rotation_y FROM player_spawn_points WHERE character_id=? AND kind='home'", [userId]);
      return { plot: publicLandPlot(rows[0], rows[0].zone, rows[0].owner_name, true), spawn: sp[0] ? { x: Number(sp[0].x), y: Number(sp[0].y), z: Number(sp[0].z), rotation_y: Number(sp[0].rotation_y) } : null };
    },

    // Thông tin chủ sở hữu được phép công khai: chỉ tên hiển thị và thời điểm nhận đất.
    async plotOwner(plotId) {
      const [rows] = await db.query('SELECT p.id,p.plot_code,p.status,p.updated_at,c.display_name FROM land_plots p LEFT JOIN characters c ON c.user_id=p.owner_character_id WHERE p.id=?', [plotId]);
      if (!rows.length) return null;
      const r = rows[0];
      return { plot_id: r.id, plot_code: r.plot_code, status: r.status, owner: r.display_name ? { display_name: r.display_name, since: r.updated_at } : null };
    },

    async listZones() {
      const [rows] = await db.query("SELECT z.id,z.slug,z.name,COUNT(p.id) total_plots,COALESCE(SUM(p.status='available'),0) available_plots FROM zones z LEFT JOIN land_plots p ON p.zone_id=z.id GROUP BY z.id ORDER BY z.id");
      return rows.map(r => ({ id: r.id, slug: r.slug, name: r.name, world_id: WORLD.id, total_plots: Number(r.total_plots), available_plots: Number(r.available_plots) }));
    },

    async getSettings() {
      const [rows] = await db.query('SELECT setting_key,setting_value FROM world_settings WHERE world_id=?', [WORLD.id]);
      const out = { ...DEFAULT_SETTINGS };
      for (const r of rows) out[r.setting_key] = typeof r.setting_value === 'string' ? JSON.parse(r.setting_value) : r.setting_value;
      return out;
    },

    async ensureSeed() { plotsReady = null; await migratePlots(); },

    // ---------- House Builder ----------
    async buildPermission(userId, plotId) {
      const [rows] = await db.query('SELECT id,status,owner_character_id FROM land_plots WHERE id=?', [plotId]);
      return buildPermissionOf(rows[0], userId);
    },
    async listHouseDesigns() {
      const [rows] = await db.query("SELECT house_id,plot_id,version,design FROM house_designs");
      return rows.map(r => ({ house_id: r.house_id == null ? null : Number(r.house_id), plot_id: Number(r.plot_id), version: r.version, revision: r.version, design: typeof r.design === 'string' ? JSON.parse(r.design) : r.design }));
    },
    async getHouseDesign(plotId) {
      const [rows] = await db.query('SELECT p.id,p.plot_code,c.display_name owner_name,h.id house_id,d.design,d.version,d.updated_at FROM land_plots p LEFT JOIN characters c ON c.user_id=p.owner_character_id LEFT JOIN houses h ON h.plot_id=p.id LEFT JOIN house_designs d ON d.plot_id=p.id WHERE p.id=?', [plotId]);
      if (!rows.length) return null;
      const r = rows[0];
      return { house_id: r.house_id == null ? null : Number(r.house_id), plot_id: r.id, plot_code: r.plot_code, owner_name: r.owner_name || null, version: r.version || 0, revision: r.version || 0,
        design: r.design ? (typeof r.design === 'string' ? JSON.parse(r.design) : r.design) : emptyDesign(), updated_at: r.updated_at || null };
    },
    // Lưu trong transaction: khoá bản ghi lô (FOR UPDATE) để kiểm tra chủ sở hữu, kiểm tra version, ghi thiết kế đã chuẩn hoá.
    async saveHouseDesign(userId, plotId, design, version, opts = {}) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const fail = async (error, extra) => { await conn.rollback(); return { error, ...extra }; };
        const [rows] = await conn.query('SELECT id,world_x,world_z,rotation_y,size_x,size_z,boundary_polygon,owner_character_id FROM land_plots WHERE id=? FOR UPDATE', [plotId]);
        if (!rows.length) return fail('PLOT_NOT_FOUND');
        if (rows[0].owner_character_id == null || Number(rows[0].owner_character_id) !== Number(userId)) return fail('NOT_PLOT_OWNER');
        const v = validateHouseDesign(design, rows[0], opts);
        if (v.error) return fail(v.error, { details: v.details });
        const [cur] = await conn.query('SELECT version FROM house_designs WHERE plot_id=? FOR UPDATE', [plotId]);
        const curVersion = cur[0]?.version || 0;
        if (curVersion !== version) return fail('VERSION_CONFLICT', { version: curVersion });
        const [h] = await conn.query('SELECT id FROM houses WHERE user_id=? AND plot_id=?', [userId, plotId]);
        if (!h.length) return fail('HOUSE_NOT_FOUND');
        const nextRevision = curVersion + 1;
        await conn.query(`INSERT INTO house_designs(plot_id,house_id,design,version,updated_by_character_id) VALUES (?,?,?,?,?)
          ON DUPLICATE KEY UPDATE design=VALUES(design),version=VALUES(version),updated_by_character_id=VALUES(updated_by_character_id),house_id=VALUES(house_id)`,
        [plotId, h[0].id, JSON.stringify(v.design), nextRevision, userId]);
        await conn.query('INSERT INTO house_design_revisions(house_id,plot_id,revision,design,created_by_character_id) VALUES (?,?,?,?,?)', [h[0].id, plotId, nextRevision, JSON.stringify(v.design), userId]);
        await conn.commit();
        return { house_id: Number(h[0].id), plot_id: plotId, version: nextRevision, revision: nextRevision, design: v.design, updated_at: new Date().toISOString() };
      } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
      } finally { conn.release(); }
    },

    async getMyHouse(userId) {
      const [rows] = await db.query(`SELECT h.id,h.plot_id,p.plot_code,COALESCE(d.version,0) revision,d.updated_at
        FROM houses h JOIN land_plots p ON p.id=h.plot_id LEFT JOIN house_designs d ON d.house_id=h.id OR (d.house_id IS NULL AND d.plot_id=h.plot_id)
        WHERE h.user_id=? LIMIT 1`, [userId]);
      if (!rows.length) return null;
      return { ...rows[0], id: Number(rows[0].id), plot_id: Number(rows[0].plot_id), revision: Number(rows[0].revision) };
    },
    async getHouseDesignByHouse(houseId, revision = null) {
      if (revision != null) {
        const [rows] = await db.query('SELECT house_id,plot_id,revision,design,created_at FROM house_design_revisions WHERE house_id=? AND revision=?', [houseId, revision]);
        if (!rows.length) return null;
        const r = rows[0];
        return { house_id: Number(r.house_id), plot_id: Number(r.plot_id), revision: r.revision, version: r.revision, design: typeof r.design === 'string' ? JSON.parse(r.design) : r.design, updated_at: r.created_at };
      }
      const [h] = await db.query('SELECT plot_id FROM houses WHERE id=?', [houseId]);
      return h.length ? this.getHouseDesign(h[0].plot_id) : null;
    },
    async validateHouseDesignByHouse(userId, houseId, design, opts = {}) {
      const [rows] = await db.query(`SELECT h.id house_id,h.user_id,p.id,p.world_x,p.world_z,p.rotation_y,p.size_x,p.size_z,p.boundary_polygon,p.owner_character_id
        FROM houses h JOIN land_plots p ON p.id=h.plot_id WHERE h.id=?`, [houseId]);
      if (!rows.length) return { error: 'HOUSE_NOT_FOUND' };
      if (Number(rows[0].user_id) !== Number(userId) || Number(rows[0].owner_character_id) !== Number(userId)) return { error: 'NOT_PLOT_OWNER' };
      const r = validateHouseDesign(design, rows[0], opts);
      return r.error ? r : { house_id: Number(houseId), plot_id: Number(rows[0].id), valid: true, design: r.design };
    },
    async saveHouseDesignByHouse(userId, houseId, design, baseRevision, opts = {}) {
      const [rows] = await db.query('SELECT plot_id,user_id FROM houses WHERE id=?', [houseId]);
      if (!rows.length) return { error: 'HOUSE_NOT_FOUND' };
      if (Number(rows[0].user_id) !== Number(userId)) return { error: 'NOT_PLOT_OWNER' };
      const r = await this.saveHouseDesign(userId, rows[0].plot_id, design, baseRevision, opts);
      if (r.error === 'VERSION_CONFLICT') return { ...r, error: 'HOUSE_REVISION_CONFLICT', revision: r.version };
      return r;
    },
    async listHouseRevisions(userId, houseId) {
      const [owner] = await db.query('SELECT user_id FROM houses WHERE id=?', [houseId]);
      if (!owner.length) return { error: 'HOUSE_NOT_FOUND' };
      if (Number(owner[0].user_id) !== Number(userId)) return { error: 'NOT_PLOT_OWNER' };
      const [rows] = await db.query('SELECT revision,created_at,created_by_character_id FROM house_design_revisions WHERE house_id=? ORDER BY revision DESC', [houseId]);
      return { house_id: Number(houseId), revisions: rows };
    },

    async listCatalog() {
      const [items] = await db.query('SELECT id,name,kind,price FROM furniture_catalog ORDER BY id');
      return items;
    },

    async listFurniture(userId) {
      await ensureFloor();
      const [rows] = await db.query('SELECT f.id,f.catalog_id,f.pos_x,f.pos_z,f.floor,f.rotation_y,c.kind,c.name FROM house_furniture f JOIN houses h ON h.id=f.house_id JOIN furniture_catalog c ON c.id=f.catalog_id WHERE h.user_id=? ORDER BY f.id', [userId]);
      return rows;
    },

    async addFurniture(userId, { catalogId, x, z, floor = 0, rotation }) {
      await ensureFloor();
      const [cat] = await db.query('SELECT id,kind,name FROM furniture_catalog WHERE id=?', [catalogId]);
      if (!cat.length) return { error: 'NO_ITEM' };
      const [houses] = await db.query('SELECT id FROM houses WHERE user_id=?', [userId]);
      if (!houses.length) return { error: 'NO_HOUSE' };
      const [cnt] = await db.query('SELECT COUNT(*) cnt FROM house_furniture WHERE house_id=?', [houses[0].id]);
      if (cnt[0].cnt >= MAX_FURNITURE) return { error: 'LIMIT' };
      const [result] = await db.query('INSERT INTO house_furniture(house_id,catalog_id,pos_x,pos_z,floor,rotation_y) VALUES (?,?,?,?,?,?)', [houses[0].id, catalogId, x, z, floor, rotation]);
      return { id: result.insertId, catalog_id: catalogId, pos_x: x, pos_z: z, floor, rotation_y: rotation, kind: cat[0].kind, name: cat[0].name };
    },

    async moveFurniture(userId, id, { x, z, floor = 0, rotation }) {
      await ensureFloor();
      const [r] = await db.query('UPDATE house_furniture f JOIN houses h ON f.house_id=h.id SET f.pos_x=?,f.pos_z=?,f.floor=?,f.rotation_y=? WHERE f.id=? AND h.user_id=?', [x, z, floor, rotation, id, userId]);
      if (!r.affectedRows) return null;
      const [rows] = await db.query('SELECT f.id,f.catalog_id,f.pos_x,f.pos_z,f.floor,f.rotation_y,c.kind,c.name FROM house_furniture f JOIN furniture_catalog c ON c.id=f.catalog_id WHERE f.id=?', [id]);
      return rows[0];
    },

    async deleteFurniture(userId, id) {
      const [result] = await db.query('DELETE f FROM house_furniture f JOIN houses h ON f.house_id=h.id WHERE f.id=? AND h.user_id=?', [id, userId]);
      return result.affectedRows > 0;
    },

    async feedPet(userId) {
      // Chốt giá trị đã suy giảm rồi mới cộng hiệu ứng cho ăn; last_fed_at gán cuối vì MySQL đánh giá SET từ trái sang phải.
      const [r] = await db.query(`UPDATE pets SET hunger=GREATEST(0,${HUNGER_NOW}-30),happiness=LEAST(100,${HAPPY_NOW}+10),last_fed_at=NOW() WHERE user_id=?`, [userId]);
      if (!r.affectedRows) return null;
      const [pets] = await db.query(PET_SELECT, [userId]);
      return pets;
    },

    async getGarden(userId) {
      const g = await gardenOf(userId);
      return g && view(g);
    },

    async resizeGarden(userId, width, depth) {
      const g = await gardenOf(userId);
      if (!g) return { error: 'NO_HOUSE' };
      const error = resizeError(width, depth, g.plots);
      if (error) return { error };
      await db.query('UPDATE gardens SET width=?,depth=? WHERE house_id=?', [width, depth, g.house_id]);
      return view({ ...g, width, depth });
    },

    async addPlot(userId, c) {
      const g = await gardenOf(userId);
      if (!g) return { error: 'NO_HOUSE' };
      if (g.plots.length >= GARDEN.maxPlots) return { error: 'LIMIT' };
      const error = plotError(g, g.plots, c);
      if (error) return { error };
      const [r] = await db.query('INSERT INTO garden_plots(house_id,kind,pos_x,pos_z,size_w,size_d) VALUES (?,?,?,?,?,?)', [g.house_id, c.kind, c.x, c.z, c.w, c.d]);
      return publicPlot({ id: r.insertId, ...c });
    },

    async movePlot(userId, id, { x, z, w, d }) {
      const g = await gardenOf(userId);
      const p = g && g.plots.find(r => r.id === id);
      if (!p) return { error: 'NOT_FOUND' };
      const error = plotError(g, g.plots, { kind: p.kind, x, z, w, d }, id);
      if (error) return { error };
      await db.query('UPDATE garden_plots SET pos_x=?,pos_z=?,size_w=?,size_d=? WHERE id=? AND house_id=?', [x, z, w, d, id, g.house_id]);
      return publicPlot({ ...p, x, z, w, d });
    },

    async deletePlot(userId, id) {
      const [r] = await db.query('DELETE p FROM garden_plots p JOIN houses h ON p.house_id=h.id WHERE p.id=? AND h.user_id=?', [id, userId]);
      return r.affectedRows > 0;
    },

    async plantPlot(userId, id, crop) {
      const r = await updatePlot(userId, id, p => plantChange(p, crop));
      return r.error ? r : publicPlot(r.plot);
    },

    async harvestPlot(userId, id) {
      const r = await updatePlot(userId, id, p => harvestChange(p));
      if (r.error) return r;
      await db.query('UPDATE gardens SET harvests=harvests+1 WHERE house_id=?', [r.g.house_id]);
      return { plot: publicPlot(r.plot), harvests: r.g.harvests + 1 };
    },

    async addFish(userId, id, species) {
      const r = await updatePlot(userId, id, p => fishChange(p, species));
      return r.error ? r : publicPlot(r.plot);
    },

    async savePosition(userId, x, z) {
      await db.query('UPDATE characters SET last_x=?,last_z=? WHERE user_id=?', [x, z, userId]);
    },
  };
}
