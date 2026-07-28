-- CitraFrame database migration.
-- Jalankan hanya pada database development/testing kosong, bukan production.

CREATE TABLE IF NOT EXISTS `products` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `price` INT NOT NULL DEFAULT 0,
    `stock` INT NOT NULL DEFAULT 0,
    `category` VARCHAR(100) NOT NULL DEFAULT '',
    `image_url` TEXT,
    `public_id` VARCHAR(255) DEFAULT '',
    `detail_image_url` TEXT,
    `border_slice` INT NOT NULL DEFAULT 80,
    `inset_top` DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    `inset_right` DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    `inset_bottom` DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    `inset_left` DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    `is_popular` BOOLEAN NOT NULL DEFAULT FALSE,
    `render_mode` VARCHAR(50) NOT NULL DEFAULT '',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_products_category` (`category`),
    INDEX `idx_products_popular` (`is_popular`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `art_prints` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL,
    `artist` VARCHAR(255) NOT NULL DEFAULT '',
    `category` VARCHAR(100) NOT NULL DEFAULT '',
    `description` TEXT,
    `price` INT NOT NULL DEFAULT 0,
    `stock` INT NOT NULL DEFAULT 0,
    `image_url` TEXT,
    `public_id` VARCHAR(255) DEFAULT '',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_art_prints_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `orders` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `order_uid` VARCHAR(64) NOT NULL,
    `customer_name` VARCHAR(100) NOT NULL,
    `customer_email` VARCHAR(254) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `firebase_uid` VARCHAR(128) NOT NULL DEFAULT '',
    `total_amount` INT NOT NULL DEFAULT 0,
    `subtotal` INT NOT NULL DEFAULT 0,
    `shipping_cost` INT NOT NULL DEFAULT 0,
    `shipping_address` TEXT NOT NULL,
    `order_status` VARCHAR(32) NOT NULL DEFAULT 'pending_payment',
    `receiver_name` VARCHAR(100) DEFAULT '',
    `phone` VARCHAR(20) DEFAULT '',
    `province` VARCHAR(100) DEFAULT '',
    `city` VARCHAR(100) DEFAULT '',
    `district` VARCHAR(100) DEFAULT '',
    `village` VARCHAR(100) DEFAULT '',
    `postal_code` VARCHAR(10) DEFAULT '',
    `full_address` TEXT,
    `village_code` VARCHAR(20) DEFAULT '',
    `courier_code` VARCHAR(50) DEFAULT '',
    `courier_name` VARCHAR(100) DEFAULT '',
    `shipping_price` INT NOT NULL DEFAULT 0,
    `shipping_estimation` VARCHAR(100) DEFAULT '',
    `weight` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `flip_link_id` VARCHAR(100) DEFAULT '',
    `payment_url` TEXT,
    `artwork_image_url` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_orders_order_uid` (`order_uid`),
    INDEX `idx_orders_firebase_uid` (`firebase_uid`),
    INDEX `idx_orders_status` (`order_status`),
    INDEX `idx_orders_created_at` (`created_at`),
    INDEX `idx_orders_flip_link_id` (`flip_link_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `order_id` INT NOT NULL,
    `product_id` INT NOT NULL DEFAULT 0,
    `item_name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NOT NULL DEFAULT '',
    `quantity` INT NOT NULL DEFAULT 1,
    `price` INT NOT NULL DEFAULT 0,
    `details` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_order_items_order_id` (`order_id`),
    CONSTRAINT `fk_order_items_order`
        FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sliders` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `image_url` TEXT NOT NULL,
    `public_id` VARCHAR(255) NOT NULL DEFAULT '',
    `mobile_image_url` TEXT,
    `mobile_public_id` VARCHAR(255) DEFAULT '',
    `alt_text` VARCHAR(255) NOT NULL DEFAULT '',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_sliders_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `custom_orders` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `frame_model` VARCHAR(255) NOT NULL,
    `artwork_width` INT NOT NULL DEFAULT 0,
    `artwork_height` INT NOT NULL DEFAULT 0,
    `mat_width` INT NOT NULL DEFAULT 0,
    `mat_color` VARCHAR(50) NOT NULL DEFAULT '',
    `total_price` INT NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_addresses` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `firebase_uid` VARCHAR(128) NOT NULL,
    `label` VARCHAR(50) NOT NULL DEFAULT 'Rumah',
    `receiver_name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `province_code` VARCHAR(20) NOT NULL DEFAULT '',
    `regency_code` VARCHAR(20) NOT NULL DEFAULT '',
    `district_code` VARCHAR(20) NOT NULL DEFAULT '',
    `village_code` VARCHAR(20) NOT NULL DEFAULT '',
    `province` VARCHAR(100) NOT NULL DEFAULT '',
    `city` VARCHAR(100) NOT NULL DEFAULT '',
    `district` VARCHAR(100) NOT NULL DEFAULT '',
    `village` VARCHAR(100) NOT NULL DEFAULT '',
    `postal_code` VARCHAR(10) NOT NULL DEFAULT '',
    `full_address` TEXT NOT NULL,
    `latitude` DOUBLE NOT NULL DEFAULT -6.2,
    `longitude` DOUBLE NOT NULL DEFAULT 106.8,
    `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_user_addresses_firebase_uid` (`firebase_uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cart_items` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `firebase_uid` VARCHAR(128) NOT NULL,
    `item_type` ENUM('artprint','custom') NOT NULL DEFAULT 'artprint',
    `product_id` INT NOT NULL DEFAULT 0,
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `image_url` TEXT,
    `artist` VARCHAR(255) DEFAULT '',
    `size` VARCHAR(100) DEFAULT '',
    `artwork_width` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `artwork_height` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `mat_width` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `mat_color` VARCHAR(50) DEFAULT '',
    `has_glass` BOOLEAN NOT NULL DEFAULT FALSE,
    `dimensions` JSON,
    `price_breakdown` JSON,
    `price` INT NOT NULL DEFAULT 0,
    `quantity` INT NOT NULL DEFAULT 1,
    `subtotal` INT NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_cart_firebase_uid` (`firebase_uid`),
    INDEX `idx_cart_item_type` (`item_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `frame_models` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
	`product_id` INT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `file_url` TEXT NOT NULL,
    `file_name` VARCHAR(255) NOT NULL DEFAULT '',
    `thumbnail_url` TEXT,
    `thumbnail_public_id` VARCHAR(255) DEFAULT '',
    `file_size` BIGINT NOT NULL DEFAULT 0,
    `format` VARCHAR(10) NOT NULL DEFAULT 'glb',
    `front_rotation_x` SMALLINT NOT NULL DEFAULT 0,
    `front_rotation_y` SMALLINT NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX `idx_frame_models_active` (`is_active`),
	UNIQUE KEY `uk_frame_models_product_id` (`product_id`),
	CONSTRAINT `fk_frame_models_product`
		FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
		ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Koreksi data aset lama: model Felted Painting Scene diekspor dengan sisi
-- belakang sebagai arah +Z setelah normalisasi sumbu. Nilai ini memastikan
-- sisi depan produk menghadap pengguna pada WebXR dan fallback kamera.
UPDATE `frame_models`
SET `front_rotation_y` = 180
WHERE `file_name` = '1784024591829641000-felted_painting_scene.glb'
  AND `front_rotation_y` = 0;
