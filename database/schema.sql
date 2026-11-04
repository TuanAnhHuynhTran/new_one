CREATE DATABASE IF NOT EXISTS life_world CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE life_world;

CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 username VARCHAR(40) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS zones (
 id TINYINT UNSIGNED PRIMARY KEY,
 slug VARCHAR(20) NOT NULL UNIQUE,
 name VARCHAR(60) NOT NULL
);
INSERT INTO zones(id,slug,name) VALUES (1,'city','Thành thị'),(2,'rural','Nông thôn')
 ON DUPLICATE KEY UPDATE name=VALUES(name);
CREATE TABLE IF NOT EXISTS land_plots (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 zone_id TINYINT UNSIGNED NOT NULL,
 plot_code VARCHAR(20) NOT NULL UNIQUE,
 world_x DECIMAL(10,2) NOT NULL,
 world_z DECIMAL(10,2) NOT NULL,
 size_x DECIMAL(10,2) NOT NULL,
 size_z DECIMAL(10,2) NOT NULL,
 owner_id BIGINT UNSIGNED NULL UNIQUE,
 FOREIGN KEY (zone_id) REFERENCES zones(id),
 FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
 INDEX idx_zone_owner(zone_id,owner_id)
);
CREATE TABLE IF NOT EXISTS characters (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 display_name VARCHAR(50) NOT NULL,
 last_x DECIMAL(10,2) NOT NULL DEFAULT 0,
 last_z DECIMAL(10,2) NOT NULL DEFAULT 0,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS houses (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL UNIQUE,
 plot_id BIGINT UNSIGNED NOT NULL UNIQUE,
 wall_color CHAR(7) NOT NULL DEFAULT '#f2ddbc',
 roof_color CHAR(7) NOT NULL DEFAULT '#bd6956',
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(plot_id) REFERENCES land_plots(id)
);
CREATE TABLE IF NOT EXISTS furniture_catalog (
 id INT UNSIGNED PRIMARY KEY,
 name VARCHAR(60) NOT NULL,
 kind VARCHAR(30) NOT NULL,
 price INT UNSIGNED NOT NULL DEFAULT 0
);
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
 rotation_y DECIMAL(7,3) NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE CASCADE,
 FOREIGN KEY(catalog_id) REFERENCES furniture_catalog(id)
);
CREATE TABLE IF NOT EXISTS pets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(40) NOT NULL DEFAULT 'Mochi',
 species ENUM('dog','cat') NOT NULL DEFAULT 'dog',
 hunger TINYINT UNSIGNED NOT NULL DEFAULT 20,
 happiness TINYINT UNSIGNED NOT NULL DEFAULT 90,
 last_fed_at TIMESTAMP NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Mẫu quy hoạch: 12 lô thành thị và 12 lô nông thôn, mỗi plot ở hệ tọa độ X/Z.
-- Thành thị X<0; nông thôn X>0. Tọa độ khớp với client/src/world.js.
INSERT IGNORE INTO land_plots(zone_id,plot_code,world_x,world_z,size_x,size_z) VALUES
 (1,'C-001',-33,-24,12,12),(1,'C-002',-18,-24,12,12),(1,'C-003',-33,-8,12,12),(1,'C-004',-18,-8,12,12),
 (1,'C-005',-33,8,12,12),(1,'C-006',-18,8,12,12),(1,'C-007',-33,24,12,12),(1,'C-008',-18,24,12,12),
 (1,'C-009',-33,40,12,12),(1,'C-010',-18,40,12,12),(1,'C-011',-33,-40,12,12),(1,'C-012',-18,-40,12,12),
 (2,'R-001',20,-32,22,22),(2,'R-002',47,-32,22,22),(2,'R-003',20,-4,22,22),(2,'R-004',47,-4,22,22),
 (2,'R-005',20,24,22,22),(2,'R-006',47,24,22,22),(2,'R-007',20,52,22,22),(2,'R-008',47,52,22,22),
 (2,'R-009',20,-60,22,22),(2,'R-010',47,-60,22,22),(2,'R-011',74,-32,22,22),(2,'R-012',74,-4,22,22);

-- Sân vườn sau nhà: kích thước chỉnh được (width chẵn 6–16 m, depth 4–12 m).
CREATE TABLE IF NOT EXISTS gardens (
 house_id BIGINT UNSIGNED PRIMARY KEY,
 width TINYINT UNSIGNED NOT NULL DEFAULT 10,
 depth TINYINT UNSIGNED NOT NULL DEFAULT 6,
 harvests INT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE CASCADE
);
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
);
