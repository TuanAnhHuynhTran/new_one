// Tạo lại file dữ liệu từ src/seed.js (xóa toàn bộ dữ liệu cũ). Dùng: npm run seed -w server
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
dotenv.config();

const file = process.env.DATA_FILE || fileURLToPath(new URL('../data/db.json', import.meta.url));
fs.rmSync(file, { force: true });
const { createFileStore } = await import('./store/file.js');
createFileStore(file);
console.log('Tài khoản demo: demo / demo1234 (nông thôn), thanhpho / demo1234 (thành thị)');
