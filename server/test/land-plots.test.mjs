// Kiểm thử Land Plot System (mục 8.1) + quy tắc API (7.3–7.5) trên server thật, chế độ file, dữ liệu tạm.
// Chạy: npm test -w server
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.mjs';

let S;
before(async () => { S = await startServer(); });
after(async () => { await S?.stop(); });

describe('Land Plot — mục 8.1', () => {
  let A, B, aId;
  test('Test 1: tài khoản A (thành thị) nhận lô C-001 → quyền sở hữu được lưu', async () => {
    A = await S.register('city', 'a');
    const me0 = (await S.call('/me', { token: A.token })).body;
    assert.equal(me0.plot_id, null, 'mới đăng ký chưa có lô');
    assert.equal(me0.zone_pref, 'city');
    aId = me0.id;
    const c001 = await S.plotByCode('C-001');
    assert.equal(c001.status, 'available');
    // Client cố gửi owner_character_id của người khác → bị bỏ qua.
    const r = await S.call(`/land-plots/${c001.id}/claim`, { method: 'POST', token: A.token, body: { owner_character_id: 999999 } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.plot.plot_code, 'C-001');
    assert.equal(r.body.plot.owner_character_id, aId);
    assert.equal(r.body.me.plot_code, 'C-001');
    // Đã ghi xuống nơi lưu trữ (file JSON — tương đương MySQL ở chế độ mysql).
    const row = S.readData().land_plots.find(p => p.plot_code === 'C-001');
    assert.equal(row.owner_character_id, aId);
    assert.equal(row.status, 'owned');
    const sp = S.readData().player_spawn_points.find(s => s.character_id === aId && s.kind === 'home');
    assert.ok(sp && sp.plot_id === c001.id, 'có điểm xuất hiện home');
  });

  test('Test 2: tài khoản B nhận C-001 → bị từ chối PLOT_ALREADY_OWNED', async () => {
    B = await S.register('city', 'b');
    const c001 = await S.plotByCode('C-001');
    const r = await S.call(`/land-plots/${c001.id}/claim`, { method: 'POST', token: B.token });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'PLOT_ALREADY_OWNED');
    assert.equal(r.body.plot.status, 'owned', 'trả trạng thái mới nhất để client cập nhật');
  });

  test('Test 3: A nhận thêm C-002 → bị từ chối PLAYER_ALREADY_HAS_PLOT', async () => {
    const c002 = await S.plotByCode('C-002');
    const r = await S.call(`/land-plots/${c002.id}/claim`, { method: 'POST', token: A.token });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'PLAYER_ALREADY_HAS_PLOT');
    assert.equal((await S.plotByCode('C-002')).status, 'available');
  });

  test('Test 4: đăng xuất / đăng nhập lại (và khởi động lại server) → lô vẫn thuộc A', async () => {
    const login = await S.call('/auth/login', { method: 'POST', body: { username: A.username, password: 'test12345' } });
    assert.equal(login.status, 200);
    const mine = await S.call('/land-plots/my-plot', { token: login.body.token });
    assert.equal(mine.body.plot.plot_code, 'C-001');
    // Khởi động lại server trên cùng file dữ liệu.
    await S.stop();
    S = await startServer({ dataFile: S.file });
    const login2 = await S.call('/auth/login', { method: 'POST', body: { username: A.username, password: 'test12345' } });
    const me = (await S.call('/me', { token: login2.body.token })).body;
    assert.equal(me.plot_code, 'C-001');
    A.token = login2.body.token;
    const owner = (await S.call(`/land-plots/${me.plot_id}/owner`)).body;
    assert.equal(owner.owner.display_name, A.username);
    assert.equal(owner.owner.username, undefined, 'không lộ thông tin riêng tư');
  });

  test('Test 5: A không chỉnh sửa được nhà / đồ đạc / vườn trên đất của B', async () => {
    const login = await S.call('/auth/login', { method: 'POST', body: { username: B.username, password: 'test12345' } });
    B.token = login.body.token;
    const c004 = await S.plotByCode('C-004');
    assert.equal((await S.call(`/land-plots/${c004.id}/claim`, { method: 'POST', token: B.token })).status, 200);
    const item = await S.call('/house/furniture', { method: 'POST', token: B.token, body: { catalogId: 1, x: -3.5, z: 2, floor: 0, rotation: 0 } });
    assert.equal(item.status, 201);
    // A cố di chuyển / xoá đồ của B → không tìm thấy (mọi thao tác Build Mode chỉ áp dụng cho nhà của chính người gọi).
    const mv = await S.call('/house/furniture/' + item.body.id, { method: 'PUT', token: A.token, body: { x: 0, z: 0, floor: 0, rotation: 0 } });
    assert.equal(mv.status, 404);
    const del = await S.call('/house/furniture/' + item.body.id, { method: 'DELETE', token: A.token });
    assert.equal(del.status, 404);
    const listB = (await S.call('/house/furniture', { token: B.token })).body;
    assert.deepEqual(listB.map(f => [f.id, f.pos_x, f.pos_z]), [[item.body.id, -3.5, 2]]);
    assert.equal((await S.call('/house/furniture', { token: A.token })).body.length, 0);
    // Vườn: A chỉ thao tác được vườn của mình.
    const gB = await S.call('/garden/plots', { method: 'POST', token: B.token, body: { kind: 'bed', x: 0, z: 0, w: 2, d: 2 } });
    assert.equal(gB.status, 201);
    assert.equal((await S.call(`/garden/plots/${gB.body.id}`, { method: 'DELETE', token: A.token })).status, 404);
  });

  test('Test 6: hai tài khoản cùng nhận một lô cùng lúc → chỉ một thành công', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, (_, i) => S.register('city', 'race' + i)));
    const c005 = await S.plotByCode('C-005');
    const rs = await Promise.all(users.map(u => S.call(`/land-plots/${c005.id}/claim`, { method: 'POST', token: u.token })));
    assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join(','));
    assert.ok(rs.filter(r => r.status !== 200).every(r => r.body.code === 'PLOT_ALREADY_OWNED'));
    const owners = S.readData().land_plots.filter(p => p.plot_code === 'C-005');
    assert.equal(owners.length, 1);
  });
});

describe('Land Plot API — quy tắc & lỗi', () => {
  test('danh sách có phân trang + bộ lọc zone/status, không lộ id chủ', async () => {
    const r = await S.call('/land-plots?zone=rural&page=1&limit=5');
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 5);
    assert.equal(r.body.total, 12);
    assert.equal(r.body.total_pages, 3);
    assert.ok(r.body.items.every(p => p.zone === 'rural' && !('owner_character_id' in p)));
    const av = await S.call('/land-plots/available?zone=city&limit=100');
    assert.ok(av.body.items.every(p => p.status === 'available' && p.zone === 'city'));
    for (const k of ['id', 'plot_code', 'world_id', 'zone_id', 'position_x', 'position_y', 'position_z', 'rotation_y', 'width', 'length', 'boundary_polygon', 'status', 'created_at', 'updated_at']) {
      assert.ok(k in r.body.items[0], 'thiếu trường ' + k);
    }
  });
  test('INVALID_ZONE, PLOT_NOT_FOUND, UNAUTHORIZED, lô đặt trước / quy hoạch', async () => {
    assert.equal((await S.call('/land-plots?zone=moon')).body.code, 'INVALID_ZONE');
    assert.equal((await S.call('/auth/register', { method: 'POST', body: { username: 'zz_bad1', password: 'test12345', zone: 'moon' } })).body.code, 'INVALID_ZONE');
    assert.equal((await S.call('/land-plots/99999')).body.code, 'PLOT_NOT_FOUND');
    const u = await S.register('rural', 'err');
    assert.equal((await S.call('/land-plots/99999/claim', { method: 'POST', token: u.token })).body.code, 'PLOT_NOT_FOUND');
    const noAuth = await S.call(`/land-plots/1/claim`, { method: 'POST' });
    assert.equal(noAuth.status, 401);
    assert.equal(noAuth.body.code, 'UNAUTHORIZED');
    for (const code of ['R-003', 'R-012']) {
      const p = await S.plotByCode(code);
      const r = await S.call(`/land-plots/${p.id}/claim`, { method: 'POST', token: u.token });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'PLOT_NOT_AVAILABLE');
    }
  });
  test('Về nhà: backend dùng điểm xuất hiện đã lưu, bỏ qua toạ độ client; chặn dịch chuyển tuỳ ý', async () => {
    const u = await S.register('rural', 'home');
    const none = await S.call('/characters/return-home', { method: 'POST', token: u.token });
    assert.equal(none.body.code, 'NO_PLOT');
    const r005 = await S.plotByCode('R-005');
    await S.call(`/land-plots/${r005.id}/claim`, { method: 'POST', token: u.token });
    const home = await S.call('/characters/return-home', { method: 'POST', token: u.token, body: { x: 0, z: 0 } });
    assert.equal(home.status, 200);
    assert.deepEqual([home.body.x, home.body.z], [r005.spawn_x, r005.spawn_z]);
    // Spawn nằm ngoài mọi lô đất (không trong nhà / hàng rào).
    const plots = (await S.call('/world')).body.plots;
    assert.ok(plots.every(p => { const b = p.boundary_polygon, xs = b.map(q => q[0]), zs = b.map(q => q[1]); return !(home.body.x > Math.min(...xs) && home.body.x < Math.max(...xs) && home.body.z > Math.min(...zs) && home.body.z < Math.max(...zs)); }));
    // Lưu vị trí nhảy 80 m ngay lập tức → bị từ chối.
    const jump = await S.call('/character/position', { method: 'POST', token: u.token, body: { x: home.body.x - 80, z: home.body.z } });
    assert.equal(jump.status, 400);
    assert.equal(jump.body.code, 'INVALID_POSITION');
    const step = await S.call('/character/position', { method: 'POST', token: u.token, body: { x: home.body.x + 2, z: home.body.z } });
    assert.equal(step.status, 200);
  });
  test('API cũ vẫn hoạt động (me, catalog, garden, furniture nhiều tầng, pet)', async () => {
    const u = await S.register('rural', 'old');
    const r007 = await S.plotByCode('R-007');
    await S.call(`/land-plots/${r007.id}/claim`, { method: 'POST', token: u.token });
    assert.equal((await S.call('/catalog')).status, 200);
    assert.equal((await S.call('/garden', { token: u.token })).status, 200);
    assert.equal((await S.call('/house/furniture', { method: 'POST', token: u.token, body: { catalogId: 4, x: -4.5, z: -4, floor: 1, rotation: 0 } })).status, 201);
    assert.equal((await S.call('/pet/feed', { method: 'POST', token: u.token })).status, 200);
    const me = (await S.call('/me', { token: u.token })).body;
    assert.equal(me.pets.length, 1, 'pet vẫn còn');
    assert.equal(me.house_id != null, true, 'có nhà sau khi nhận đất');
  });
});
