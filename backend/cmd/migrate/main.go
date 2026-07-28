package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	dbName := strings.TrimSpace(os.Getenv("DB_NAME"))
	refuseUnsafeDatabase(dbName)

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&multiStatements=true",
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		dbName,
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal("DB connect error:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("DB ping error:", err)
	}

	raw, err := os.ReadFile("database/migration.sql")
	if err != nil {
		log.Fatal("read migration.sql:", err)
	}

	for _, stmt := range splitSQLStatements(string(raw)) {
		if _, err := db.Exec(stmt); err != nil {
			log.Fatalf("migration failed on statement:\n%s\nerror: %v", stmt, err)
		}
	}
	if err := applyAdditiveSchemaFixes(db, dbName); err != nil {
		log.Fatal("additive migration failed:", err)
	}

	log.Printf("Migration completed on database %q", dbName)
}

func refuseUnsafeDatabase(dbName string) {
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	lowerDB := strings.ToLower(dbName)
	if appEnv == "production" || strings.Contains(lowerDB, "prod") {
		log.Fatal("refusing to run migration against a production-like database")
	}
	if !strings.Contains(lowerDB, "test") && os.Getenv("ALLOW_NON_TEST_MIGRATION") != "1" {
		log.Fatal("refusing to run migration outside a testing database; set ALLOW_NON_TEST_MIGRATION=1 for local development")
	}
}

func splitSQLStatements(raw string) []string {
	parts := strings.Split(raw, ";")
	statements := make([]string, 0, len(parts))
	for _, part := range parts {
		stmt := strings.TrimSpace(part)
		if stmt == "" {
			continue
		}
		lines := strings.Split(stmt, "\n")
		kept := make([]string, 0, len(lines))
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "--") {
				continue
			}
			kept = append(kept, line)
		}
		if len(kept) > 0 {
			statements = append(statements, strings.Join(kept, "\n"))
		}
	}
	return statements
}

func applyAdditiveSchemaFixes(db *sql.DB, dbName string) error {
	requiredColumns := map[string]map[string]string{
		"products": {
			"public_id":        "`public_id` VARCHAR(255) DEFAULT ''",
			"detail_image_url": "`detail_image_url` TEXT",
			"border_slice":     "`border_slice` INT NOT NULL DEFAULT 80",
			"inset_top":        "`inset_top` DECIMAL(10,2) NOT NULL DEFAULT 15.00",
			"inset_right":      "`inset_right` DECIMAL(10,2) NOT NULL DEFAULT 15.00",
			"inset_bottom":     "`inset_bottom` DECIMAL(10,2) NOT NULL DEFAULT 15.00",
			"inset_left":       "`inset_left` DECIMAL(10,2) NOT NULL DEFAULT 15.00",
			"is_popular":       "`is_popular` BOOLEAN NOT NULL DEFAULT FALSE",
			"render_mode":      "`render_mode` VARCHAR(50) NOT NULL DEFAULT ''",
		},
		"art_prints": {
			"public_id": "`public_id` VARCHAR(255) DEFAULT ''",
		},
		"orders": {
			"firebase_uid":        "`firebase_uid` VARCHAR(128) NOT NULL DEFAULT ''",
			"receiver_name":       "`receiver_name` VARCHAR(100) DEFAULT ''",
			"phone":               "`phone` VARCHAR(20) DEFAULT ''",
			"province":            "`province` VARCHAR(100) DEFAULT ''",
			"city":                "`city` VARCHAR(100) DEFAULT ''",
			"district":            "`district` VARCHAR(100) DEFAULT ''",
			"village":             "`village` VARCHAR(100) DEFAULT ''",
			"postal_code":         "`postal_code` VARCHAR(10) DEFAULT ''",
			"full_address":        "`full_address` TEXT",
			"village_code":        "`village_code` VARCHAR(20) DEFAULT ''",
			"courier_code":        "`courier_code` VARCHAR(50) DEFAULT ''",
			"courier_name":        "`courier_name` VARCHAR(100) DEFAULT ''",
			"shipping_price":      "`shipping_price` INT NOT NULL DEFAULT 0",
			"shipping_estimation": "`shipping_estimation` VARCHAR(100) DEFAULT ''",
			"weight":              "`weight` DECIMAL(10,2) NOT NULL DEFAULT 0.00",
			"flip_link_id":        "`flip_link_id` VARCHAR(100) DEFAULT ''",
			"payment_url":         "`payment_url` TEXT",
			"artwork_image_url":   "`artwork_image_url` TEXT",
		},
		"sliders": {
			"mobile_image_url": "`mobile_image_url` TEXT",
			"mobile_public_id": "`mobile_public_id` VARCHAR(255) DEFAULT ''",
			"alt_text":         "`alt_text` VARCHAR(255) NOT NULL DEFAULT ''",
		},
		"frame_models": {
			"product_id":       "`product_id` INT NULL",
			"front_rotation_y": "`front_rotation_y` SMALLINT NOT NULL DEFAULT 0",
		},
		"user_addresses": {
			"province_code": "`province_code` VARCHAR(20) NOT NULL DEFAULT ''",
			"regency_code":  "`regency_code` VARCHAR(20) NOT NULL DEFAULT ''",
			"district_code": "`district_code` VARCHAR(20) NOT NULL DEFAULT ''",
			"village_code":  "`village_code` VARCHAR(20) NOT NULL DEFAULT ''",
			"village":       "`village` VARCHAR(100) NOT NULL DEFAULT ''",
		},
	}

	for table, columns := range requiredColumns {
		existing, err := tableColumns(db, dbName, table)
		if err != nil {
			return err
		}
		if len(existing) == 0 {
			continue
		}
		for column, definition := range columns {
			if existing[column] {
				continue
			}
			stmt := fmt.Sprintf("ALTER TABLE `%s` ADD COLUMN %s", table, definition)
			log.Printf("Applying additive schema fix: %s.%s", table, column)
			if _, err := db.Exec(stmt); err != nil {
				return fmt.Errorf("%s: %w", stmt, err)
			}
		}
	}

	requiredIndexes := map[string]map[string]string{
		"orders": {
			"idx_orders_firebase_uid": "CREATE INDEX `idx_orders_firebase_uid` ON `orders`(`firebase_uid`)",
			"idx_orders_status":       "CREATE INDEX `idx_orders_status` ON `orders`(`order_status`)",
			"idx_orders_created_at":   "CREATE INDEX `idx_orders_created_at` ON `orders`(`created_at`)",
			"idx_orders_flip_link_id": "CREATE INDEX `idx_orders_flip_link_id` ON `orders`(`flip_link_id`)",
		},
		"cart_items": {
			"idx_cart_firebase_uid": "CREATE INDEX `idx_cart_firebase_uid` ON `cart_items`(`firebase_uid`)",
			"idx_cart_item_type":    "CREATE INDEX `idx_cart_item_type` ON `cart_items`(`item_type`)",
		},
		"user_addresses": {
			"idx_user_addresses_firebase_uid": "CREATE INDEX `idx_user_addresses_firebase_uid` ON `user_addresses`(`firebase_uid`)",
		},
		"frame_models": {
			"uk_frame_models_product_id": "CREATE UNIQUE INDEX `uk_frame_models_product_id` ON `frame_models`(`product_id`)",
		},
	}
	for table, indexes := range requiredIndexes {
		existing, err := tableIndexes(db, dbName, table)
		if err != nil {
			return err
		}
		if len(existing) == 0 {
			continue
		}
		for indexName, stmt := range indexes {
			if existing[indexName] {
				continue
			}
			log.Printf("Applying additive index fix: %s.%s", table, indexName)
			if _, err := db.Exec(stmt); err != nil {
				return fmt.Errorf("%s: %w", stmt, err)
			}
		}
	}

	return nil
}

func tableColumns(db *sql.DB, dbName, table string) (map[string]bool, error) {
	rows, err := db.Query(`
		SELECT COLUMN_NAME
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`, dbName, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns := map[string]bool{}
	for rows.Next() {
		var column string
		if err := rows.Scan(&column); err != nil {
			return nil, err
		}
		columns[column] = true
	}
	return columns, rows.Err()
}

func tableIndexes(db *sql.DB, dbName, table string) (map[string]bool, error) {
	rows, err := db.Query(`
		SELECT DISTINCT INDEX_NAME
		FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`, dbName, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	indexes := map[string]bool{}
	for rows.Next() {
		var indexName string
		if err := rows.Scan(&indexName); err != nil {
			return nil, err
		}
		indexes[indexName] = true
	}
	return indexes, rows.Err()
}
