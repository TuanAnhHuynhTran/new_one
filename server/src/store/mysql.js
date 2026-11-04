// Lưu trữ MySQL (DB_DRIVER=mysql). Cần chạy database/schema.sql trước.
import mysql from 'mysql2/promise';
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
    async ping() { await db.query('SELECT 1'); },

    async register(username, passwordHash, zone) {
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        // FOR UPDATE khóa lô đất được chọn, tránh hai người cùng nhận một lô.
        const [available] = await connection.query('SELECT p.id,p.world_x,p.world_z FROM land_plots p JOIN zones z ON p.zone_id=z.id WHERE z.slug=? AND p.owner_id IS NULL ORDER BY p.id LIMIT 1 FOR UPDATE', [zone]);
        if (!available.length) { await connection.rollback(); return { error: 'NO_PLOT' }; }
        const plot = available[0];
        const [result] = await connection.query('INSERT INTO users(username,password_hash) VALUES (?,?)', [username, passwordHash]);
        const id = result.insertId;
        await connection.query('UPDATE land_plots SET owner_id=? WHERE id=?', [id, plot.id]);
        await connection.query('INSERT INTO characters(user_id,display_name,last_x,last_z) VALUES (?,?,?,?)', [id, username, plot.world_x + (zone === 'city' ? 7 : 12), plot.world_z + 8]);
        await connection.query('INSERT INTO houses(user_id,plot_id) VALUES (?,?)', [id, plot.id]);
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
      const [rows] = await db.query(`SELECT u.id,u.username,c.display_name,c.last_x,c.last_z,h.id house_id,h.wall_color,h.roof_color,p.id plot_id,p.plot_code,p.world_x,p.world_z,p.size_x,p.size_z,z.slug zone
 FROM users u JOIN characters c ON c.user_id=u.id JOIN houses h ON h.user_id=u.id JOIN land_plots p ON p.id=h.plot_id JOIN zones z ON z.id=p.zone_id WHERE u.id=?`, [userId]);
      if (!rows.length) return null;
      const [pets] = await db.query(PET_SELECT, [userId]);
      return { ...rows[0], pets };
    },

    async listPlots() {
      const [plots] = await db.query('SELECT p.id,p.plot_code,p.world_x,p.world_z,p.size_x,p.size_z,p.owner_id,z.slug zone FROM land_plots p JOIN zones z ON z.id=p.zone_id');
      return plots;
    },

    async listCatalog() {
      const [items] = await db.query('SELECT id,name,kind,price FROM furniture_catalog ORDER BY id');
      return items;
    },

    async listFurniture(userId) {
      const [rows] = await db.query('SELECT f.id,f.catalog_id,f.pos_x,f.pos_z,f.rotation_y,c.kind,c.name FROM house_furniture f JOIN houses h ON h.id=f.house_id JOIN furniture_catalog c ON c.id=f.catalog_id WHERE h.user_id=? ORDER BY f.id', [userId]);
      return rows;
    },

    async addFurniture(userId, { catalogId, x, z, rotation }) {
      const [cat] = await db.query('SELECT id,kind,name FROM furniture_catalog WHERE id=?', [catalogId]);
      if (!cat.length) return { error: 'NO_ITEM' };
      const [houses] = await db.query('SELECT id FROM houses WHERE user_id=?', [userId]);
      if (!houses.length) return { error: 'NO_HOUSE' };
      const [cnt] = await db.query('SELECT COUNT(*) cnt FROM house_furniture WHERE house_id=?', [houses[0].id]);
      if (cnt[0].cnt >= MAX_FURNITURE) return { error: 'LIMIT' };
      const [result] = await db.query('INSERT INTO house_furniture(house_id,catalog_id,pos_x,pos_z,rotation_y) VALUES (?,?,?,?,?)', [houses[0].id, catalogId, x, z, rotation]);
      return { id: result.insertId, catalog_id: catalogId, pos_x: x, pos_z: z, rotation_y: rotation, kind: cat[0].kind, name: cat[0].name };
    },

    async moveFurniture(userId, id, { x, z, rotation }) {
      const [r] = await db.query('UPDATE house_furniture f JOIN houses h ON f.house_id=h.id SET f.pos_x=?,f.pos_z=?,f.rotation_y=? WHERE f.id=? AND h.user_id=?', [x, z, rotation, id, userId]);
      if (!r.affectedRows) return null;
      const [rows] = await db.query('SELECT f.id,f.catalog_id,f.pos_x,f.pos_z,f.rotation_y,c.kind,c.name FROM house_furniture f JOIN furniture_catalog c ON c.id=f.catalog_id WHERE f.id=?', [id]);
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
