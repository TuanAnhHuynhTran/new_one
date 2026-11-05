// Đồng hồ thế giới phía client: server là nguồn thời gian chuẩn (GET /api/world/time).
// Sau khi đồng bộ, client nội suy bằng performance.now() — đồng hồ đơn điệu, KHÔNG bị ảnh hưởng khi người dùng chỉnh giờ máy.
// Đồng bộ lại: định kỳ, khi quay lại tab, khi có mạng trở lại, và khi phát hiện máy vừa ngủ dậy / giờ hệ thống bị chỉnh
// (khoảng trôi của Date.now() lệch hẳn so với performance.now()).

let base = null; // { server: epoch ms tại thời điểm perf, perf: performance.now() }
let status = { synced: false, error: false, lastSync: 0, rtt: null, offsetMs: 0 };
const listeners = new Set();
let inflight = null;

export function syncWorldTime() {
  if (inflight) return inflight;
  const t0 = performance.now();
  inflight = fetch('/api/world/time', { cache: 'no-store' })
    .then(async r => {
      const j = await r.json();
      const t1 = performance.now();
      if (!r.ok || !Number.isFinite(j.epoch_ms)) throw Error('bad time');
      // Giả định độ trễ đi / về bằng nhau (kiểu NTP): giờ server lúc nhận = epoch_ms + nửa vòng.
      base = { server: j.epoch_ms + (t1 - t0) / 2, perf: t1 };
      status = { synced: true, error: false, lastSync: t1, rtt: Math.round(t1 - t0), offsetMs: Math.round(base.server - Date.now()), timezone: j.timezone };
    })
    .catch(() => { status = { ...status, error: true }; }) // mất mạng: vẫn tiếp tục nội suy từ lần đồng bộ trước
    .finally(() => { inflight = null; listeners.forEach(f => f(status)); });
  return inflight;
}

// Thời điểm hiện tại theo server (ms). Chưa đồng bộ được lần nào → tạm dùng giờ máy.
export const serverNow = () => (base ? base.server + (performance.now() - base.perf) : Date.now());
export const timeStatus = () => status;
export const onTimeStatus = f => { listeners.add(f); return () => listeners.delete(f); };

export function startTimeSync(intervalSec = 300) {
  syncWorldTime();
  let lastWall = Date.now(), lastPerf = performance.now();
  const watch = setInterval(() => {
    const w = Date.now(), p = performance.now();
    // Bình thường hai đồng hồ trôi như nhau; lệch > 2 s = máy ngủ / tab bị treo / người dùng chỉnh giờ → hỏi lại server.
    if (Math.abs((w - lastWall) - (p - lastPerf)) > 2000) syncWorldTime();
    lastWall = w; lastPerf = p;
  }, 5000);
  const periodic = setInterval(syncWorldTime, Math.max(30, intervalSec) * 1000);
  const onVisible = () => { if (document.visibilityState === 'visible') syncWorldTime(); };
  const onOnline = () => syncWorldTime();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  return () => {
    clearInterval(watch); clearInterval(periodic);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };
}
