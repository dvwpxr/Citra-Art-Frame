package database

import (
	"os"
	"strings"
	"testing"
)

func TestMigrationDefinesUsedTablesForEmptyDatabase(t *testing.T) {
	raw, err := os.ReadFile("migration.sql")
	if err != nil {
		t.Fatal(err)
	}
	sql := string(raw)

	requiredTables := []string{
		"products",
		"art_prints",
		"orders",
		"order_items",
		"sliders",
		"custom_orders",
		"user_addresses",
		"cart_items",
		"frame_models",
	}

	if !strings.Contains(sql, "`product_id` INT NULL") ||
		!strings.Contains(sql, "UNIQUE KEY `uk_frame_models_product_id`") ||
		!strings.Contains(sql, "`front_rotation_y` SMALLINT NOT NULL DEFAULT 0") {
		t.Fatal("frame_models migration must define product linking and front orientation used by AR")
	}
	if !strings.Contains(sql, "1784024591829641000-felted_painting_scene.glb") ||
		!strings.Contains(sql, "SET `front_rotation_y` = 180") {
		t.Fatal("migration must correct the legacy model whose back side faced the AR camera")
	}
	for _, table := range requiredTables {
		want := "CREATE TABLE IF NOT EXISTS `" + table + "`"
		if !strings.Contains(sql, want) {
			t.Fatalf("migration missing %s", want)
		}
	}

	if strings.Contains(sql, "\nALTER TABLE") {
		t.Fatalf("migration for an empty database must not depend on standalone ALTER TABLE statements")
	}
}
