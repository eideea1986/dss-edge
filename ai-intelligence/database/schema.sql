-- AI Intelligence System - Database Schema
-- Creates NEW tables without modifying existing ones

-- Tabela pentru obiecte urmărite (Object Tracker)
CREATE TABLE IF NOT EXISTS tracked_objects (
    id VARCHAR(36) PRIMARY KEY,
    camera_id VARCHAR(100) NOT NULL,
    class_name VARCHAR(50) NOT NULL,
    state VARCHAR(20) DEFAULT 'CREATED',
    first_seen DATETIME NOT NULL,
    last_seen DATETIME NOT NULL,
    frame_count INT DEFAULT 1,
    consecutive_frames INT DEFAULT 1,
    trajectory JSON,
    roi_intersections JSON,
    last_bbox JSON,
    last_center JSON,
    total_displacement FLOAT DEFAULT 0,
    event_sent BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_camera_state (camera_id, state),
    INDEX idx_last_seen (last_seen)
);

-- Tabela pentru evenimente inteligente (Event Manager)
CREATE TABLE IF NOT EXISTS intelligence_events (
    id VARCHAR(36) PRIMARY KEY,
    object_id VARCHAR(36),
    camera_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    timestamp DATETIME NOT NULL,
    confidence FLOAT,
    roi_id VARCHAR(50),
    snapshot_path VARCHAR(255),
    priority INT DEFAULT 5,
    sent_to_dispatch BOOLEAN DEFAULT FALSE,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_camera_timestamp (camera_id, timestamp),
    INDEX idx_sent (sent_to_dispatch),
    FOREIGN KEY (object_id) REFERENCES tracked_objects(id) ON DELETE SET NULL
);

-- Tabela pentru zone de detecție falsă (False Detection Filter)
CREATE TABLE IF NOT EXISTS false_detection_zones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    camera_id VARCHAR(100) NOT NULL,
    bbox JSON NOT NULL,
    false_count INT DEFAULT 1,
    last_detection DATETIME NOT NULL,
    ignore_until DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_camera_ignore (camera_id, ignore_until),
    INDEX idx_ignore_until (ignore_until)
);

-- Tabela pentru cooldown-uri (Event Manager Anti-Spam)
CREATE TABLE IF NOT EXISTS event_cooldowns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    camera_id VARCHAR(100) NOT NULL,
    roi_id VARCHAR(50),
    event_type VARCHAR(50) NOT NULL,
    cooldown_until DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_cooldown (camera_id, roi_id, event_type),
    INDEX idx_cooldown_until (cooldown_until)
);

-- Tabela pentru statistici (Performance Monitoring)
CREATE TABLE IF NOT EXISTS intelligence_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    camera_id VARCHAR(100),
    total_detections INT DEFAULT 0,
    valid_objects INT DEFAULT 0,
    events_generated INT DEFAULT 0,
    false_detections_filtered INT DEFAULT 0,
    avg_processing_time_ms FLOAT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_stat (date, camera_id)
);

-- Cleanup old data (run daily)
-- DELETE FROM tracked_objects WHERE state = 'LOST' AND updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
-- DELETE FROM false_detection_zones WHERE ignore_until < DATE_SUB(NOW(), INTERVAL 1 DAY);
-- DELETE FROM event_cooldowns WHERE cooldown_until < DATE_SUB(NOW(), INTERVAL 1 DAY);
