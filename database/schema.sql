CREATE DATABASE IF NOT EXISTS life_world CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE life_world;

CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 username VARCHAR(40) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS zones (
 id TINYINT UNSIGNED PRIMARY KEY,
 slug VARCHAR(20) NOT NULL UNIQUE,
 name VARCHAR(60) NOT NULL
) ENGINE=InnoDB;
INSERT INTO zones(id,slug,name) VALUES (1,'city','Thành thị'),(2,'rural','Nông thôn')
 ON DUPLICATE KEY UPDATE name=VALUES(name);
CREATE TABLE IF NOT EXISTS worlds (
 id TINYINT UNSIGNED PRIMARY KEY,
 slug VARCHAR(20) NOT NULL UNIQUE,
 name VARCHAR(60) NOT NULL
) ENGINE=InnoDB;
INSERT INTO worlds(id,slug,name) VALUES (1,'main','Life World') ON DUPLICATE KEY UPDATE name=VALUES(name);
-- Nhân vật: mỗi tài khoản một nhân vật trong MVP (id nhân vật = user_id).
CREATE TABLE IF NOT EXISTS characters (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 display_name VARCHAR(50) NOT NULL,
 zone_pref VARCHAR(10) NOT NULL DEFAULT 'rural', -- khu vực chọn khi đăng ký (city / rural)
 last_x DECIMAL(10,2) NOT NULL DEFAULT 0,
 last_z DECIMAL(10,2) NOT NULL DEFAULT 0,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- Lô đất. world_x / world_z = position_x / position_z (tâm lô), size_x / size_z = width / length (giữ tên cột cũ để không phải migrate toạ độ).
-- Quyền sở hữu chỉ do backend ghi (POST /api/plots/:id/claim, transaction + SELECT ... FOR UPDATE).
CREATE TABLE IF NOT EXISTS land_plots (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 world_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
 zone_id TINYINT UNSIGNED NOT NULL,
 plot_code VARCHAR(20) NOT NULL UNIQUE,
 world_x DECIMAL(10,2) NOT NULL,
 position_y DECIMAL(10,2) NOT NULL DEFAULT 0,
 world_z DECIMAL(10,2) NOT NULL,
 rotation_y DECIMAL(7,4) NOT NULL DEFAULT 0, -- hướng mặt tiền (0 = hướng +Z, ra đường)
 size_x DECIMAL(10,2) NOT NULL,
 size_z DECIMAL(10,2) NOT NULL,
 boundary_polygon JSON NULL, -- [[x,z],...] 4 góc ranh giới
 spawn_x DECIMAL(10,2) NULL, -- điểm xuất hiện trước cổng / mặt tiền
 spawn_z DECIMAL(10,2) NULL,
 status ENUM('available','owned','reserved','disabled') NOT NULL DEFAULT 'available',
 owner_character_id BIGINT UNSIGNED NULL,
 created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 -- Một lô chỉ có một chủ (cột đơn trị) và một nhân vật chỉ có một lô (UNIQUE).
 UNIQUE KEY uq_plot_owner_character (owner_character_id),
 INDEX idx_plot_zone_status (zone_id, status),
 CONSTRAINT fk_plot_world FOREIGN KEY (world_id) REFERENCES worlds(id),
 FOREIGN KEY (zone_id) REFERENCES zones(id),
 CONSTRAINT fk_plot_owner_character FOREIGN KEY (owner_character_id) REFERENCES characters(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS houses (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL UNIQUE,
 plot_id BIGINT UNSIGNED NOT NULL UNIQUE,
 wall_color CHAR(7) NOT NULL DEFAULT '#f2ddbc',
 roof_color CHAR(7) NOT NULL DEFAULT '#bd6956',
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(plot_id) REFERENCES land_plots(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS furniture_catalog (
 id INT UNSIGNED PRIMARY KEY,
 name VARCHAR(60) NOT NULL,
 kind VARCHAR(30) NOT NULL,
 price INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
INSERT INTO furniture_catalog (id,name,kind,price) VALUES
 (1,'Sofa','sofa',0),(2,'Bàn gỗ','table',0),(3,'Chậu cây','plant',0),(4,'Giường','bed',0),(5,'Đèn sàn','lamp',0),
 (6,'Kệ sách','bookshelf',0),(7,'Thảm','rug',0),(8,'Ghế gỗ','chair',0),(9,'Tủ lạnh','fridge',0)
 ON DUPLICATE KEY UPDATE name=VALUES(name),kind=VALUES(kind),price=VALUES(price);
CREATE TABLE IF NOT EXISTS house_furniture (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 house_id BIGINT UNSIGNED NOT NULL,
 catalog_id INT UNSIGNED NOT NULL,
 pos_x DECIMAL(7,2) NOT NULL,
 pos_z DECIMAL(7,2) NOT NULL,
 floor TINYINT UNSIGNED NOT NULL DEFAULT 0, -- 0 tầng trệt, 1 lầu 1, 2 sân thượng
 rotation_y DECIMAL(7,3) NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE CASCADE,
 FOREIGN KEY(catalog_id) REFERENCES furniture_catalog(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(40) NOT NULL DEFAULT 'Mochi',
 species ENUM('dog','cat') NOT NULL DEFAULT 'dog',
 hunger TINYINT UNSIGNED NOT NULL DEFAULT 20,
 happiness TINYINT UNSIGNED NOT NULL DEFAULT 90,
 last_fed_at TIMESTAMP NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- Sân vườn sau nhà: kích thước chỉnh được (width chẵn 6–16 m, depth 4–12 m).
CREATE TABLE IF NOT EXISTS gardens (
 house_id BIGINT UNSIGNED PRIMARY KEY,
 width TINYINT UNSIGNED NOT NULL DEFAULT 10,
 depth TINYINT UNSIGNED NOT NULL DEFAULT 6,
 harvests INT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- Các khu trong vườn: luống rau (bed) hoặc hồ cá (pond); góc (pos_x, pos_z) và kích thước theo ô 1 m.
CREATE TABLE IF NOT EXISTS garden_plots (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 house_id BIGINT UNSIGNED NOT NULL,
 kind ENUM('bed','pond') NOT NULL,
 pos_x TINYINT NOT NULL,
 pos_z TINYINT NOT NULL,
 size_w TINYINT UNSIGNED NOT NULL,
 size_d TINYINT UNSIGNED NOT NULL,
 crop VARCHAR(20) NULL,
 planted_at DATETIME(3) NULL,
 fish VARCHAR(400) NOT NULL DEFAULT '',
 FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE CASCADE,
 INDEX idx_house(house_id)
) ENGINE=InnoDB;

-- Cấu hình thế giới (múi giờ, mốc ngày/đêm, nhãn lô đất, kích thước lô mặc định…). Giá trị JSON, chỉnh được.
CREATE TABLE IF NOT EXISTS world_settings (
 world_id TINYINT UNSIGNED NOT NULL,
 setting_key VARCHAR(50) NOT NULL,
 setting_value JSON NOT NULL,
 updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (world_id, setting_key),
 CONSTRAINT fk_ws_world FOREIGN KEY (world_id) REFERENCES worlds(id)
) ENGINE=InnoDB;
-- INSERT IGNORE: chạy lại không ghi đè giá trị đã chỉnh.
INSERT IGNORE INTO world_settings(world_id,setting_key,setting_value) VALUES
 (1,'timezone','"Asia/Ho_Chi_Minh"'),
 (1,'time_scale','1'),
 (1,'day_cycle','{"dawn_start":5,"day_start":7,"dusk_start":17,"night_start":19}'),
 (1,'plot_label_mode','"both"'),
 (1,'plot_defaults','{"city":{"width":12,"length":12,"rotation_y":0},"rural":{"width":22,"length":22,"rotation_y":0}}'),
 (1,'plot_sample_sizes','{"city":[[10,15],[12,18]],"rural":[[25,30],[30,40]]}'),
 (1,'time_sync_interval_sec','300');
-- Điểm xuất hiện của nhân vật: home = trước cổng / mặt tiền lô đất (server tính và kiểm tra, client không gửi toạ độ).
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

-- Lịch sử snapshot theo lần Save (Phase 02.9). house_designs vẫn là bản mới nhất để tương thích ngược.
CREATE TABLE IF NOT EXISTS house_design_revisions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 house_id BIGINT UNSIGNED NOT NULL,
 plot_id BIGINT UNSIGNED NOT NULL,
 revision INT UNSIGNED NOT NULL,
 design JSON NOT NULL,
 created_by_character_id BIGINT UNSIGNED NULL,
 created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_house_revision (house_id, revision),
 INDEX idx_revision_plot (plot_id, revision),
 CONSTRAINT fk_revision_house FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE,
 CONSTRAINT fk_revision_plot FOREIGN KEY (plot_id) REFERENCES land_plots(id) ON DELETE CASCADE,
 CONSTRAINT fk_revision_character FOREIGN KEY (created_by_character_id) REFERENCES characters(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Đặt cuối file: với database cũ, hãy khởi động server một lần (tự nâng cấp bảng land_plots) trước khi chạy lại file này.
-- Mẫu quy hoạch (sinh từ server/src/plots.js): 12 lô thành thị 12 × 12 m và 12 lô nông thôn 22 × 22 m, mặt tiền hướng +Z.
-- Thành thị X<0; nông thôn X>0. Toạ độ khớp với client/src/world.js. reserved = nhà dân có sẵn, disabled = đang quy hoạch.
INSERT IGNORE INTO land_plots(world_id,zone_id,plot_code,world_x,position_y,world_z,rotation_y,size_x,size_z,boundary_polygon,spawn_x,spawn_z,status) VALUES
(1,1,'C-001',-33,0,-24,0,12,12,'[[-39,-30],[-27,-30],[-27,-18],[-39,-18]]',-33,-16.4,'available'),(1,1,'C-002',-18,0,-24,0,12,12,'[[-24,-30],[-12,-30],[-12,-18],[-24,-18]]',-18,-16.4,'available'),
 (1,1,'C-003',-33,0,-8,0,12,12,'[[-39,-14],[-27,-14],[-27,-2],[-39,-2]]',-33,-0.4,'reserved'),(1,1,'C-004',-18,0,-8,0,12,12,'[[-24,-14],[-12,-14],[-12,-2],[-24,-2]]',-18,-0.4,'available'),
 (1,1,'C-005',-33,0,8,0,12,12,'[[-39,2],[-27,2],[-27,14],[-39,14]]',-33,15.6,'available'),(1,1,'C-006',-18,0,8,0,12,12,'[[-24,2],[-12,2],[-12,14],[-24,14]]',-18,15.6,'reserved'),
 (1,1,'C-007',-33,0,24,0,12,12,'[[-39,18],[-27,18],[-27,30],[-39,30]]',-33,31.6,'available'),(1,1,'C-008',-18,0,24,0,12,12,'[[-24,18],[-12,18],[-12,30],[-24,30]]',-18,31.6,'reserved'),
 (1,1,'C-009',-33,0,40,0,12,12,'[[-39,34],[-27,34],[-27,46],[-39,46]]',-33,47.6,'available'),(1,1,'C-010',-18,0,40,0,12,12,'[[-24,34],[-12,34],[-12,46],[-24,46]]',-18,47.6,'available'),
 (1,1,'C-011',-33,0,-40,0,12,12,'[[-39,-46],[-27,-46],[-27,-34],[-39,-34]]',-33,-32.4,'reserved'),(1,1,'C-012',-18,0,-40,0,12,12,'[[-24,-46],[-12,-46],[-12,-34],[-24,-34]]',-18,-32.4,'disabled'),
 (1,2,'R-001',20,0,-32,0,22,22,'[[9,-43],[31,-43],[31,-21],[9,-21]]',20,-19.5,'available'),(1,2,'R-002',47,0,-32,0,22,22,'[[36,-43],[58,-43],[58,-21],[36,-21]]',47,-19.5,'available'),
 (1,2,'R-003',20,0,-4,0,22,22,'[[9,-15],[31,-15],[31,7],[9,7]]',20,8.5,'reserved'),(1,2,'R-004',47,0,-4,0,22,22,'[[36,-15],[58,-15],[58,7],[36,7]]',47,8.5,'available'),
 (1,2,'R-005',20,0,24,0,22,22,'[[9,13],[31,13],[31,35],[9,35]]',20,36.5,'available'),(1,2,'R-006',47,0,24,0,22,22,'[[36,13],[58,13],[58,35],[36,35]]',47,36.5,'reserved'),
 (1,2,'R-007',20,0,52,0,22,22,'[[9,41],[31,41],[31,63],[9,63]]',20,64.5,'available'),(1,2,'R-008',47,0,52,0,22,22,'[[36,41],[58,41],[58,63],[36,63]]',47,64.5,'reserved'),
 (1,2,'R-009',20,0,-60,0,22,22,'[[9,-71],[31,-71],[31,-49],[9,-49]]',20,-47.5,'available'),(1,2,'R-010',47,0,-60,0,22,22,'[[36,-71],[58,-71],[58,-49],[36,-49]]',47,-47.5,'available'),
 (1,2,'R-011',74,0,-32,0,22,22,'[[63,-43],[85,-43],[85,-21],[63,-21]]',74,-19.5,'reserved'),(1,2,'R-012',74,0,-4,0,22,22,'[[63,-15],[85,-15],[85,7],[63,7]]',74,8.5,'disabled');
