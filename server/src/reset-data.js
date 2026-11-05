// Seed dữ liệu thế giới.
//   npm run seed -w server        → chạy lại được nhiều lần: chỉ bổ sung world / zone / cấu hình / lô mẫu / điểm xuất hiện còn thiếu,
//                                   không tạo trùng, không đổi toạ độ và không ghi đè chủ sở hữu của lô đã có chủ.
//   npm run seed:reset -w server  → (chỉ chế độ file) xoá file dữ liệu và tạo lại từ đầu với tài khoản demo.
// DB_DRIVER=mysql: chạy migration + seed trên database MySQL (bảng tạo bởi database/schema.sql).
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
dotenv.config();

const reset = process.argv.includes('--reset');
if ((process.env.DB_DRIVER || 'file') === 'mysql') {
  if (reset) { console.error('--reset chỉ dùng cho chế độ file; với MySQL hãy tự xoá database nếu thật sự muốn làm lại.'); process.exit(1); }
  const { createMysqlStore } = await import('./store/mysql.js');
  const store = createMysqlStore({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'life_world',
  });
  await store.ping();
  await store.ensureSeed();
  console.log('MySQL: đã chạy migration + seed (idempotent).');
  process.exit(0);
}

const file = process.env.DATA_FILE || fileURLToPath(new URL('../data/db.json', import.meta.url));
if (reset) fs.rmSync(file, { force: true });
const { createFileStore } = await import('./store/file.js');
const store = createFileStore(file);
await store.ensureSeed();
console.log(reset ? 'Đã tạo lại dữ liệu từ đầu.' : 'Đã bổ sung dữ liệu còn thiếu (không ghi đè dữ liệu hiện có).');
console.log('Tài khoản demo: demo / demo1234 (nông thôn), thanhpho / demo1234 (thành thị)');
