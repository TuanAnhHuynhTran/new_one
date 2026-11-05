-- Migration 002 — Land Plot System + Real-Time Timeline (Life World giai đoạn 01, phần 2)
-- Dành cho database MySQL đã tạo từ schema cũ. Database mới: chỉ cần chạy database/schema.sql.
--
-- Nguyên tắc: KHÔNG DROP bảng / cột, KHÔNG xoá dữ liệu, KHÔNG đổi toạ độ / kích thước lô đã có, KHÔNG ghi đè chủ sở hữu.
-- Mỗi bước kiểm tra information_schema trước khi thêm → chạy lại nhiều lần không lỗi, không tạo trùng.
-- (Server cũng tự chạy cùng các bước này khi khởi động — xem migratePlots() trong server/src/store/mysql.js.)
--
-- Chạy: mysql -u root -p life_world < database/migrations/002_land_plots_timeline.sql
-- Ranh giới (boundary_polygon) và điểm xuất hiện (spawn_x/z) của từng lô được server tính và điền ở lần khởi động kế tiếp.

USE life_world;

DROP PROCEDURE IF EXISTS lw_add_column;
DELIMITER //
CREATE PROCEDURE lw_add_column(IN t VARCHAR(64), IN c VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c) THEN
    SET @sql = CONCAT('ALTER TABLE `', t, '` ADD COLUMN ', ddl);
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;
DROP PROCEDURE IF EXISTS lw_add_index;
DELIMITER //
CREATE PROCEDURE lw_add_index(IN t VARCHAR(64), IN i VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND INDEX_NAME = i) THEN
    SET @sql = CONCAT('ALTER TABLE `', t, '` ADD ', ddl);
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;
DROP PROCEDURE IF EXISTS lw_add_fk;
DELIMITER //
CREATE PROCEDURE lw_add_fk(IN t VARCHAR(64), IN fk VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND CONSTRAINT_NAME = fk) THEN
    SET @sql = CONCAT('ALTER TABLE `', t, '` ADD CONSTRAINT ', fk, ' ', ddl);
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

-- 1. worlds
CREATE TABLE IF NOT EXISTS worlds (
 id TINYINT UNSIGNED PRIMARY KEY,
 slug VARCHAR(20) NOT NULL UNIQUE,
 name VARCHAR(60) NOT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO worlds(id,slug,name) VALUES (1,'main','Life World');

-- 2. characters: khu vực chọn khi đăng ký
CALL lw_add_column('characters', 'zone_pref', "zone_pref VARCHAR(10) NOT NULL DEFAULT 'rural'");
UPDATE characters c JOIN houses h ON h.user_id = c.user_id JOIN land_plots p ON p.id = h.plot_id JOIN zones z ON z.id = p.zone_id
  SET c.zone_pref = z.slug WHERE c.zone_pref = 'rural' AND z.slug <> 'rural';

-- 3. land_plots: world_id, độ cao, hướng, ranh giới, điểm xuất hiện, trạng thái, chủ sở hữu theo nhân vật, thời gian
CALL lw_add_column('land_plots', 'world_id', 'world_id TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER id');
CALL lw_add_column('land_plots', 'position_y', 'position_y DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER world_x');
CALL lw_add_column('land_plots', 'rotation_y', 'rotation_y DECIMAL(7,4) NOT NULL DEFAULT 0 AFTER world_z');
CALL lw_add_column('land_plots', 'boundary_polygon', 'boundary_polygon JSON NULL');
CALL lw_add_column('land_plots', 'spawn_x', 'spawn_x DECIMAL(10,2) NULL');
CALL lw_add_column('land_plots', 'spawn_z', 'spawn_z DECIMAL(10,2) NULL');
-- Trạng thái mới thêm → điền theo chủ cũ (owner_id = id tài khoản = id nhân vật trong MVP).
SET @had_status = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'land_plots' AND COLUMN_NAME = 'status');
CALL lw_add_column('land_plots', 'status', "status ENUM('available','owned','reserved','disabled') NOT NULL DEFAULT 'available'");
CALL lw_add_column('land_plots', 'owner_character_id', 'owner_character_id BIGINT UNSIGNED NULL');
CALL lw_add_column('land_plots', 'created_at', 'created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP');
CALL lw_add_column('land_plots', 'updated_at', 'updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
SET @has_owner_id = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'land_plots' AND COLUMN_NAME = 'owner_id');
SET @sql = IF(@had_status = 0 AND @has_owner_id = 1,
  "UPDATE land_plots SET owner_character_id = owner_id, status = IF(owner_id IS NULL, 'available', 'owned') WHERE owner_character_id IS NULL",
  'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
-- Lô nhà dân / đang quy hoạch (chỉ áp cho lô còn trống, không đụng lô đã có chủ).
UPDATE land_plots SET status = 'reserved' WHERE owner_character_id IS NULL AND status = 'available' AND plot_code IN ('C-003','C-006','C-008','C-011','R-003','R-006','R-008','R-011') AND boundary_polygon IS NULL;
UPDATE land_plots SET status = 'disabled' WHERE owner_character_id IS NULL AND status = 'available' AND plot_code IN ('C-012','R-012') AND boundary_polygon IS NULL;
-- Ràng buộc: một nhân vật chỉ có một lô; một lô chỉ có một chủ (cột đơn trị).
CALL lw_add_index('land_plots', 'uq_plot_owner_character', 'UNIQUE KEY uq_plot_owner_character (owner_character_id)');
CALL lw_add_index('land_plots', 'idx_plot_zone_status', 'INDEX idx_plot_zone_status (zone_id, status)');
CALL lw_add_fk('land_plots', 'fk_plot_world', 'FOREIGN KEY (world_id) REFERENCES worlds(id)');
CALL lw_add_fk('land_plots', 'fk_plot_owner_character', 'FOREIGN KEY (owner_character_id) REFERENCES characters(user_id) ON DELETE SET NULL');

-- 4. house_furniture: tầng của món đồ (nhà 2 lầu + sân thượng)
CALL lw_add_column('house_furniture', 'floor', 'floor TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER pos_z');

-- 5. world_settings
CREATE TABLE IF NOT EXISTS world_settings (
 world_id TINYINT UNSIGNED NOT NULL,
 setting_key VARCHAR(50) NOT NULL,
 setting_value JSON NOT NULL,
 updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (world_id, setting_key),
 CONSTRAINT fk_ws_world FOREIGN KEY (world_id) REFERENCES worlds(id)
) ENGINE=InnoDB;
INSERT IGNORE INTO world_settings(world_id,setting_key,setting_value) VALUES
 (1,'timezone','"Asia/Ho_Chi_Minh"'),
 (1,'time_scale','1'),
 (1,'day_cycle','{"dawn_start":5,"day_start":7,"dusk_start":17,"night_start":19}'),
 (1,'plot_label_mode','"both"'),
 (1,'plot_defaults','{"city":{"width":12,"length":12,"rotation_y":0},"rural":{"width":22,"length":22,"rotation_y":0}}'),
 (1,'plot_sample_sizes','{"city":[[10,15],[12,18]],"rural":[[25,30],[30,40]]}'),
 (1,'time_sync_interval_sec','300');

-- 6. player_spawn_points (điểm "home" được tạo khi nhận đất; điền cho các lô đã có chủ ở bước khởi động server khi đã có spawn_x/z)
CREATE TABLE IF NOT EXISTS player_spawn_points (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 character_id BIGINT UNSIGNED NOT NULL,
 world_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
 plot_id BIGINT UNSIGNED NULL,
 kind ENUM('home') NOT NULL DEFAULT 'home',
 x DECIMAL(10,2) NOT NULL,
 y DECIMAL(10,2) NOT NULL DEFAULT 0,
 z DECIMAL(10,2) NOT NULL,
 rotation_y DECIMAL(7,4) NOT NULL DEFAULT 0,
 created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_spawn_character_kind (character_id, kind),
 INDEX idx_spawn_plot (plot_id),
 CONSTRAINT fk_spawn_character FOREIGN KEY (character_id) REFERENCES characters(user_id) ON DELETE CASCADE,
 CONSTRAINT fk_spawn_plot FOREIGN KEY (plot_id) REFERENCES land_plots(id) ON DELETE SET NULL,
 CONSTRAINT fk_spawn_world FOREIGN KEY (world_id) REFERENCES worlds(id)
) ENGINE=InnoDB;
INSERT IGNORE INTO player_spawn_points(character_id,world_id,plot_id,kind,x,y,z,rotation_y)
  SELECT owner_character_id, world_id, id, 'home', spawn_x, 0, spawn_z, ROUND(rotation_y + PI(), 4)
  FROM land_plots WHERE owner_character_id IS NOT NULL AND spawn_x IS NOT NULL;

DROP PROCEDURE IF EXISTS lw_add_column;
DROP PROCEDURE IF EXISTS lw_add_index;
DROP PROCEDURE IF EXISTS lw_add_fk;
