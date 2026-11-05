-- Migration 003 — House Builder (Phase 02.1): bảng thiết kế nhà theo lô đất.
-- Chỉ tạo bảng nếu chưa có; không sửa / xoá dữ liệu khác. Chạy lại được. (Server cũng tự tạo bảng này khi khởi động.)
-- Chạy: mysql -u root -p life_world < database/migrations/003_house_designs.sql
USE life_world;
-- House Builder: thiết kế nhà của mỗi lô (JSON theo toạ độ local của lô: gốc = tâm lô, +Z = mặt tiền, Y = chiều cao).
-- Chỉ chủ lô ghi được (PUT /api/land-plots/:id/house-design kiểm tra owner_character_id trong transaction); version chống ghi đè.
CREATE TABLE IF NOT EXISTS house_designs (
 plot_id BIGINT UNSIGNED PRIMARY KEY,
 house_id BIGINT UNSIGNED NULL,
 design JSON NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 updated_by_character_id BIGINT UNSIGNED NULL,
 created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_design_plot FOREIGN KEY (plot_id) REFERENCES land_plots(id) ON DELETE CASCADE,
 CONSTRAINT fk_design_house FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE SET NULL,
 CONSTRAINT fk_design_character FOREIGN KEY (updated_by_character_id) REFERENCES characters(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;
