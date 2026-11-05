// Khởi động một server Life World thật (chế độ file, dữ liệu tạm) cho kiểm thử API.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function startServer({ dataFile, seedDemo = false } = {}) {
  const dir = dataFile ? path.dirname(dataFile) : fs.mkdtempSync(path.join(os.tmpdir(), 'lifeworld-test-'));
  const file = dataFile || path.join(dir, 'db.json');
  const port = 39000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(port), DB_DRIVER: 'file', DATA_FILE: file, SEED_DEMO: seedDemo ? '1' : '0', AUTH_RATE_LIMIT: '10000', CLAIM_RATE_LIMIT: '10000', JWT_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/health')).ok) break; } catch { /* chưa lên */ }
    await new Promise(r => setTimeout(r, 100));
    if (child.exitCode != null) throw Error('Server dừng: ' + log);
  }
  const call = async (p, { method = 'GET', body, token } = {}) => {
    const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  let n = 0;
  const register = async (zone = 'city', prefix = 'user') => {
    const username = `${prefix}${Date.now() % 1e6}${++n}`;
    const r = await call('/auth/register', { method: 'POST', body: { username, password: 'test12345', zone } });
    if (r.status !== 201) throw Error('register ' + JSON.stringify(r.body));
    return { username, token: r.body.token };
  };
  const plotByCode = async code => (await call('/world')).body.plots.find(p => p.plot_code === code);
  const stop = () => new Promise(res => { if (child.exitCode != null) return res(); child.once('exit', res); child.kill(); });
  const readData = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  return { base, call, register, plotByCode, stop, file, dir, readData, log: () => log };
}
