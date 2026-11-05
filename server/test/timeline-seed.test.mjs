// Kiểm thử Real-Time Timeline (mục 8.2) và seed / migration chạy lại được (7.6).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './helpers.mjs';
import { dayStage, worldTime } from '../src/timeline.js';
import { buildSeed, ensureWorldData, upgradePlots } from '../src/seed.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let S;
before(async () => { S = await startServer(); });
after(async () => { await S?.stop(); });

describe('Timeline — server', () => {
  test('GET /api/world/time: UTC, múi giờ, giờ địa phương, giai đoạn trong ngày; khớp đồng hồ hệ thống', async () => {
    const t0 = Date.now();
    const r = await S.call('/world/time');
    assert.equal(r.status, 200);
    assert.ok(Math.abs(r.body.epoch_ms - t0) < 2000);
    assert.equal(r.body.timezone, 'Asia/Ho_Chi_Minh');
    assert.equal(r.body.time_scale, 1);
    assert.match(r.body.display, /^Thứ (Hai|Ba|Tư|Năm|Sáu|Bảy), \d\d\/\d\d\/\d{4} — \d\d:\d\d$|^Chủ Nhật, /);
    assert.ok(['dawn', 'day', 'dusk', 'night'].includes(r.body.stage));
    assert.ok(['morning', 'noon', 'afternoon', 'evening'].includes(r.body.period));
    const hcmHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hourCycle: 'h23' }).format(new Date(r.body.epoch_ms)));
    assert.equal(r.body.time.hour, hcmHour);
  });
  test('Ví dụ đặc tả: 05/11/2026 18:30 giờ VN = Thứ Năm, hoàng hôn, buổi tối', () => {
    const t = worldTime(undefined, new Date('2026-11-05T11:30:00Z'));
    assert.equal(t.display, 'Thứ Năm, 05/11/2026 — 18:30');
    assert.equal(t.stage, 'dusk');
    assert.equal(t.period_name, 'Buổi tối');
  });
  test('Chuyển ngày đúng lúc 00:00 giờ VN', () => {
    const before = worldTime(undefined, new Date('2026-11-05T16:59:59Z'));
    const afterMidnight = worldTime(undefined, new Date('2026-11-05T17:00:00Z'));
    assert.equal(before.local, '2026-11-05T23:59:59');
    assert.equal(afterMidnight.local, '2026-11-06T00:00:00');
    assert.equal(afterMidnight.date.weekday_name, 'Thứ Sáu');
  });
  test('Ánh sáng theo giờ (mốc cấu hình) và chuyển tiếp mượt', () => {
    assert.equal(dayStage(4).stage, 'night');
    assert.equal(dayStage(6).stage, 'dawn');
    assert.equal(dayStage(12).stage, 'day');
    assert.equal(dayStage(18).stage, 'dusk');
    assert.equal(dayStage(22).stage, 'night');
    let prev = dayStage(5).light_level;
    for (let h = 5; h <= 7; h += 0.1) { const l = dayStage(h).light_level; assert.ok(l >= prev - 1e-9 && l - prev < 0.05); prev = l; }
    // Mốc chỉnh được qua world_settings.day_cycle.
    assert.equal(dayStage(8, { dawn_start: 6, day_start: 9, dusk_start: 16, night_start: 18 }).stage, 'dawn');
  });
  test('GET /api/world/settings và /api/world/zones', async () => {
    const s = (await S.call('/world/settings')).body.settings;
    assert.equal(s.timezone, 'Asia/Ho_Chi_Minh');
    assert.deepEqual(s.day_cycle, { dawn_start: 5, day_start: 7, dusk_start: 17, night_start: 19 });
    const z = (await S.call('/world/zones')).body.zones;
    assert.deepEqual(z.map(x => x.slug), ['city', 'rural']);
  });
});

describe('Timeline — client (client/src/time.js)', () => {
  test('nội suy từ giờ server; người dùng chỉnh đồng hồ máy không làm đổi giờ game', async () => {
    const SERVER_OFFSET = 3 * 3600 * 1000; // server "đi trước" máy 3 giờ
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ epoch_ms: Date.now() + SERVER_OFFSET, timezone: 'Asia/Ho_Chi_Minh' }) });
    const { syncWorldTime, serverNow } = await import('../../client/src/time.js');
    await syncWorldTime();
    assert.ok(Math.abs(serverNow() - (Date.now() + SERVER_OFFSET)) < 500);
    const realNow = Date.now, before = serverNow();
    Date.now = () => realNow() - 5 * 3600 * 1000; // người dùng lùi đồng hồ máy 5 giờ
    try { assert.ok(Math.abs(serverNow() - before) < 500, 'giờ game không bị ảnh hưởng'); } finally { Date.now = realNow; }
    // Mất mạng: vẫn tiếp tục nội suy từ lần đồng bộ trước.
    globalThis.fetch = async () => { throw Error('offline'); };
    await syncWorldTime();
    assert.ok(Math.abs(serverNow() - (Date.now() + SERVER_OFFSET)) < 1000);
  });
});

describe('Seed / migration', () => {
  test('seed chạy lại nhiều lần không tạo trùng, không ghi đè chủ sở hữu', () => {
    const data = buildSeed();
    const owned = data.land_plots.filter(p => p.owner_character_id != null).map(p => [p.plot_code, p.owner_character_id]);
    const count = k => (data[k] || []).length;
    const sizes = () => ['worlds', 'zones', 'land_plots', 'world_settings', 'player_spawn_points'].map(count);
    const first = sizes();
    ensureWorldData(data); ensureWorldData(data);
    assert.deepEqual(sizes(), first);
    assert.deepEqual(data.land_plots.filter(p => p.owner_character_id != null).map(p => [p.plot_code, p.owner_character_id]), owned);
  });
  test('nâng cấp dữ liệu cũ (owner_id) giữ nguyên toạ độ và chủ sở hữu', () => {
    const old = { meta: {}, seq: { users: 1 }, zones: [{ id: 1, slug: 'city', name: 'Thành thị' }, { id: 2, slug: 'rural', name: 'Nông thôn' }],
      users: [{ id: 7 }], characters: [{ user_id: 7, display_name: 'x', last_x: 0, last_z: 0 }],
      land_plots: [{ id: 1, zone_id: 1, plot_code: 'C-001', world_x: -33, world_z: -24, size_x: 12, size_z: 12, owner_id: 7 }, { id: 2, zone_id: 1, plot_code: 'C-003', world_x: -33, world_z: -8, size_x: 12, size_z: 12, owner_id: null }] };
    upgradePlots(old); ensureWorldData(old);
    const [p1, p3] = old.land_plots;
    assert.deepEqual([p1.world_x, p1.world_z, p1.size_x, p1.size_z], [-33, -24, 12, 12]);
    assert.equal(p1.owner_character_id, 7); assert.equal(p1.status, 'owned');
    assert.equal(p3.status, 'reserved');
    assert.equal(old.player_spawn_points.filter(s => s.character_id === 7).length, 1);
    assert.equal(old.land_plots.length, 24, 'bổ sung các lô mẫu còn thiếu theo plot_code');
  });
  test('npm run seed (không --reset) trên dữ liệu đang chạy: không mất dữ liệu', async () => {
    const before = S.readData();
    await S.stop();
    execFileSync(process.execPath, ['src/reset-data.js'], { cwd: SERVER_DIR, env: { ...process.env, DATA_FILE: S.file, DB_DRIVER: 'file' } });
    const afterSeed = JSON.parse(fs.readFileSync(S.file, 'utf8'));
    assert.equal(afterSeed.users.length, before.users.length);
    assert.equal(afterSeed.land_plots.length, before.land_plots.length);
    assert.deepEqual(afterSeed.land_plots.map(p => p.owner_character_id), before.land_plots.map(p => p.owner_character_id));
    S = await startServer({ dataFile: S.file });
  });
});
