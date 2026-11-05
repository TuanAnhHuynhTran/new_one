-- Migration 004 — Nhà nhiều tầng (House Builder Phase 02.6).
-- Thiết kế nhà lưu ở house_designs.design (JSON). Schema 2 thêm:
--   design.levels = [{ id: 'level_0', index: 0, height: 3, elevation: 0 }, …]   (tối đa 2 tầng trong MVP)
--   mọi đối tượng (wall / room / floor / stair / zone / marker) có level_id = 'level_<floor>'; lỗ mở (cửa, cửa sổ) thuộc tường nên thuộc tầng của tường.
-- Không đổi bảng, không xoá dữ liệu, không đổi version của thiết kế.
--
-- Server tự chạy bước nâng cấp này khi khởi động (migratePlots trong server/src/store/mysql.js) và khi chạy `npm run seed -w server`:
-- đọc từng thiết kế schema < 2, chuẩn hoá bằng shared/levelGeometry.mjs (normalizeDesign) rồi ghi lại — xử lý đúng cả dữ liệu có nhiều tầng.
-- Câu lệnh dưới đây chỉ dành cho ai muốn nâng cấp thủ công các nhà MỘT TẦNG (trường hợp phổ biến) mà không khởi động server:
-- thêm levels + schema; level_id cho từng đối tượng sẽ được server điền ở lần đọc / lưu tiếp theo.
USE life_world;
UPDATE house_designs
SET design = JSON_SET(design,
  '$.schema', 2,
  '$.levels', JSON_ARRAY(JSON_OBJECT('id', 'level_0', 'index', 0, 'height', 3, 'elevation', 0)))
WHERE JSON_EXTRACT(design, '$.levels') IS NULL
  AND JSON_SEARCH(JSON_EXTRACT(design, '$.objects[*].floor'), 'one', '1') IS NULL
  AND JSON_CONTAINS(JSON_EXTRACT(design, '$.objects[*].floor'), '1') = 0;
