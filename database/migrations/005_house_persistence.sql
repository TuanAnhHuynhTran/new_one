-- Migration 005 — Phase 02.9: lịch sử revision cho thiết kế nhà.
-- Không thay đổi/xóa house_designs hiện có; mỗi lần lưu tạo một snapshot bất biến.
USE life_world;

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

-- Bảo toàn bản mới nhất đang có làm mốc phục hồi đầu tiên. INSERT IGNORE giúp chạy lại an toàn.
INSERT IGNORE INTO house_design_revisions(house_id, plot_id, revision, design, created_by_character_id, created_at)
SELECT house_id, plot_id, version, design, updated_by_character_id, COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM house_designs
WHERE house_id IS NOT NULL AND version > 0;
