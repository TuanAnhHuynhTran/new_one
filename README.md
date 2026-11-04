# Life World MVP 🌿

Game mô phỏng cuộc sống 3D Cozy Low-poly (single-player MVP) — React 19 + Three.js / React Three Fiber 9 + Node.js Express + MySQL 8.

## Yêu cầu
- Node.js 22+, npm 10+
- MySQL 8+ (hoặc MySQL tương thích)
- Chrome/Edge có WebGL2

## Khởi chạy (Windows PowerShell hoặc CMD)

### Cách nhanh — không cần MySQL (mặc định)

```sh
npm install
npm run dev
```

Mở http://localhost:5173 và đăng nhập bằng tài khoản có sẵn:

| Tài khoản | Mật khẩu | Khu | Lô |
|---|---|---|---|
| `demo` | `demo1234` | Nông thôn | R-001 (đã có nội thất) |
| `thanhpho` | `demo1234` | Thành thị | C-001 |

Hoặc đăng ký tài khoản mới, chọn **Thành thị** hoặc **Nông thôn**. Mỗi tài khoản chiếm một trong 24 lô đất mẫu, tự nhận một pet Mochi.

Dữ liệu có sẵn nằm trong [`server/src/seed.js`](server/src/seed.js). Lần chạy đầu server tự tạo `server/data/db.json` từ đó, mọi thay đổi (đăng ký, nội thất, vị trí, pet) được lưu vào file này. Muốn xóa sạch và quay về dữ liệu mẫu: `npm run seed -w server`.

### Dùng MySQL

1. Tạo CSDL: dùng MySQL Workbench mở `database/schema.sql` và chạy toàn bộ, hoặc `mysql -u root -p < database/schema.sql`.
2. Sao chép `server/.env.example` thành `server/.env`, đặt `DB_DRIVER=mysql`, cập nhật `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (ít nhất 32 ký tự ngẫu nhiên).
3. `npm run dev`. Lưu ý: chế độ MySQL không có tài khoản demo.

## Điều khiển
- **WASD / phím mũi tên:** đi bộ (theo hướng camera); **Shift:** chạy; **giữ chuột phải + kéo:** xoay camera quanh nhân vật; **cuộn chuột:** zoom.
- Nhà, cây, hàng rào, luống rau, cột đèn, bàn ô… đều chặn đường đi. Nhà nào che khuất nhân vật sẽ tự mờ đi.
- **E:** vào nhà khi đứng gần nhà mình (hoặc bấm "Trang trí"); **Esc / E:** ra ngoài.
- **Trang trí:** giữ chuột phải để xoay phòng, cuộn để zoom. Chọn món ở thanh nội thất phía dưới, di chuột để xem trước rồi bấm xuống sàn để đặt; **R** xoay 90°.
- **Di chuyển đồ:** bấm vào món đã đặt để nhấc lên, di chuột tới chỗ mới rồi bấm để đặt xuống (**R** xoay, **Esc** hủy, **Delete** hoặc nút "Cất đi" để gỡ khỏi phòng).
- **Minimap** góc phải: nhà bạn (đỏ), quán cà phê (cam), mũi tên là hướng nhân vật.
- Thêm `?gio=20` vào URL để xem thử thế giới vào một giờ bất kỳ (ví dụ ban đêm).
- **Cho Mochi ăn:** cập nhật trạng thái pet trong database. Độ đói tăng 5%/giờ và độ vui giảm 3%/giờ kể từ lần cho ăn gần nhất (tính ở server khi đọc).
- Đồng hồ giờ Việt Nam và ánh sáng ngày/đêm chạy theo thời gian thực.

## API chính
- `POST /api/auth/register`: `{username,password,zone:'city'|'rural'}`
- `POST /api/auth/login`: `{username,password}`
- `GET /api/me` (Bearer JWT)
- `GET /api/world`
- `GET /api/catalog`
- `GET /api/house/furniture` (Bearer JWT)
- `POST /api/house/furniture` (Bearer JWT): `{catalogId,x,z,rotation}` — tọa độ **cục bộ** trong nhà
- `PUT /api/house/furniture/:id` (Bearer JWT): `{x,z,rotation}` — di chuyển/xoay món đã đặt
- `DELETE /api/house/furniture/:id` (Bearer JWT)
- `POST /api/pet/feed` (Bearer JWT)
- `POST /api/character/position` (Bearer JWT): `{x,z}`
- `GET /api/health`

## Kiến trúc
```
client/ (Vite + React + R3F)
    │ HTTP REST (JWT)
    ▼
server/ (Express, validation)
    ▼
store/ ──┬─ file.js  → server/data/db.json (seed từ src/seed.js)   [DB_DRIVER=file]
         └─ mysql.js → database/schema.sql (MySQL, 24 land plots) [DB_DRIVER=mysql]
```

**MVP không có multiplayer.** Về sau thêm Colyseus + room/zone, xử lý tọa độ authoritative ở server, visibility culling theo chunk, Redis cho các node máy chủ. Tránh ghi tọa độ di chuyển từng frame vào MySQL.

## Giới hạn có chủ ý
- Các ngôi nhà được dựng bằng mesh hình học, chưa có GLB. Nhà hiển thị ngoài trời và phòng trang trí là **2 cảnh riêng**, chưa có hệ thống cửa/teleport.
- Pet có AI đi theo đơn giản, chưa có va chạm đầy đủ, pathfinding hoặc NPC. Pet tạo trước bản cập nhật này (`last_fed_at` NULL) chỉ bắt đầu suy giảm sau lần cho ăn đầu tiên.
- Collision nhà chỉ là AABB thô, không có navmesh và không có vật lý đầy đủ. Không có chế độ xây tự do.
- Chưa có quyền riêng tư, chat, multiplayer, tiền tệ, chống bot/anti-cheat sản phẩm hoàn chỉnh.
- Khi đăng ký chọn lô đầu tiên còn trống theo khu, 24 lô demo. Muốn quy mô lớn phải bổ sung world/chunk allocator và bản đồ.
- Bản demo cần HTTPS, rate-limit theo hạ tầng, quản lý secret, backup, log, xác thực email, kiểm thử bảo mật và kiểm thử tải trước khi triển khai công khai.

## Lưu ý
Nếu tài khoản bị chặn bởi lỗi kết nối database, xem console server và thông số MySQL trong `server/.env`. Không commit `.env` lên Git.
