package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
)

func TestBAB4BetaEnvironmentConnectivity(t *testing.T) {
	if os.Getenv("BAB4_INTEGRATION") != "1" {
		t.Skip("set BAB4_INTEGRATION=1 to run beta environment checks")
	}
	loadBetaEnv(t)

	db := openBetaDB(t)
	defer db.Close()
	if err := db.Ping(); err != nil {
		t.Fatalf("Aiven MySQL ping failed: %v", err)
	}
	t.Log("Aiven MySQL: connected")

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	projectID := strings.TrimSpace(os.Getenv("FIREBASE_PROJECT_ID"))
	if projectID == "" {
		t.Fatal("Firebase project ID missing")
	}
	firebaseReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com", nil)
	if err != nil {
		t.Fatal(err)
	}
	firebaseResp, err := http.DefaultClient.Do(firebaseReq)
	if err != nil {
		t.Fatalf("Firebase cert endpoint failed: %v", err)
	}
	defer firebaseResp.Body.Close()
	if firebaseResp.StatusCode != http.StatusOK {
		t.Fatalf("Firebase cert endpoint returned %d", firebaseResp.StatusCode)
	}
	t.Log("Firebase: public cert endpoint reachable; project ID configured")

	cld, err := cloudinary.NewFromParams(os.Getenv("CLOUDINARY_CLOUD_NAME"), os.Getenv("CLOUDINARY_API_KEY"), os.Getenv("CLOUDINARY_API_SECRET"))
	if err != nil {
		t.Fatalf("Cloudinary config failed: %v", err)
	}
	if _, err := cld.Admin.Ping(ctx); err != nil {
		t.Fatalf("Cloudinary ping failed: %v", err)
	}
	t.Log("Cloudinary: admin ping OK")

	if strings.TrimSpace(os.Getenv("FLIP_SECRET_KEY")) == "" {
		t.Fatal("Flip secret key missing")
	}
	t.Log("Flip: configured; backend payment code uses sandbox endpoint")

	if _, err := fetchAPICoIDShippingQuote(ctx); err != nil {
		t.Fatalf("API.co.id shipping check failed: %v", err)
	}
	t.Log("API.co.id: shipping-cost endpoint reachable")
}

func TestBAB4BetaSchemaAfterMigration(t *testing.T) {
	if os.Getenv("BAB4_INTEGRATION") != "1" {
		t.Skip("set BAB4_INTEGRATION=1 to run beta schema checks")
	}
	loadBetaEnv(t)

	db := openBetaDB(t)
	defer db.Close()

	required := map[string][]string{
		"products":       {"id", "name", "price", "stock", "category", "image_url", "border_slice", "inset_top", "is_popular", "render_mode"},
		"art_prints":     {"id", "title", "artist", "price", "stock", "image_url", "public_id"},
		"orders":         {"id", "order_uid", "customer_email", "firebase_uid", "subtotal", "shipping_cost", "order_status", "payment_url", "flip_link_id"},
		"order_items":    {"id", "order_id", "product_id", "item_name", "quantity", "price", "details"},
		"sliders":        {"id", "image_url", "public_id", "mobile_image_url", "alt_text"},
		"custom_orders":  {"id", "frame_model", "artwork_width", "artwork_height", "total_price"},
		"user_addresses": {"id", "firebase_uid", "receiver_name", "phone", "full_address", "village_code"},
		"cart_items":     {"id", "firebase_uid", "item_type", "product_id", "name", "quantity", "subtotal"},
	}

	for table, columns := range required {
		exists, err := betaTableExists(db, table)
		if err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("required table %s does not exist", table)
		}
		actual, err := betaColumns(db, table)
		if err != nil {
			t.Fatal(err)
		}
		for _, column := range columns {
			if !actual[column] {
				t.Fatalf("table %s missing column %s", table, column)
			}
		}
	}

	t.Log("Aiven schema: required tables and columns verified")
}

func TestBAB4CloudinaryDirectUploadCleanup(t *testing.T) {
	if os.Getenv("BAB4_INTEGRATION") != "1" {
		t.Skip("set BAB4_INTEGRATION=1 to run Cloudinary upload cleanup check")
	}
	loadBetaEnv(t)
	prefix := os.Getenv("BAB4_TEST_PREFIX")
	if prefix == "" {
		prefix = "TEST_BAB4_" + time.Now().Format("20060102_150405")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cld, err := cloudinary.NewFromParams(os.Getenv("CLOUDINARY_CLOUD_NAME"), os.Getenv("CLOUDINARY_API_KEY"), os.Getenv("CLOUDINARY_API_SECRET"))
	if err != nil {
		t.Fatal(err)
	}
	upload, err := cld.Upload.Upload(ctx, strings.NewReader("BAB4 synthetic upload"), uploader.UploadParams{
		Folder:       "TEST_BAB4",
		PublicID:     prefix + "_cloudinary_text",
		ResourceType: "raw",
	})
	if err != nil {
		t.Fatalf("Cloudinary upload failed: %v", err)
	}
	if upload.PublicID == "" {
		t.Fatal("Cloudinary upload returned empty public ID")
	}
	destroy, err := cld.Upload.Destroy(ctx, uploader.DestroyParams{
		PublicID:     upload.PublicID,
		ResourceType: "raw",
	})
	if err != nil {
		t.Fatalf("Cloudinary destroy failed: %v", err)
	}
	if destroy.Result == "" {
		t.Fatal("Cloudinary destroy returned empty result")
	}
	t.Log("Cloudinary: TEST_BAB4 upload and cleanup OK")
}

func loadBetaEnv(t *testing.T) {
	t.Helper()
	if err := godotenv.Load(".env"); err != nil {
		t.Fatalf("load .env: %v", err)
	}
}

func openBetaDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&multiStatements=true",
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_NAME"),
	)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func fetchAPICoIDShippingQuote(ctx context.Context) (map[string]interface{}, error) {
	apiKey := strings.TrimSpace(os.Getenv("API_CO_ID_KEY"))
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("API_CO_ID_BASE_URL")), "/")
	origin := strings.TrimSpace(os.Getenv("STORE_ORIGIN_VILLAGE_CODE"))
	if apiKey == "" || baseURL == "" || origin == "" {
		return nil, fmt.Errorf("API.co.id config incomplete")
	}
	url := fmt.Sprintf("%s/expedition/shipping-cost?origin_village_code=%s&destination_village_code=%s&weight=1.00", baseURL, origin, origin)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-co-id", apiKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func betaTableExists(db *sql.DB, table string) (bool, error) {
	var count int
	err := db.QueryRow(`
		SELECT COUNT(*)
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, table).Scan(&count)
	return count > 0, err
}

func betaColumns(db *sql.DB, table string) (map[string]bool, error) {
	rows, err := db.Query(`
		SELECT COLUMN_NAME
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		columns[name] = true
	}
	return columns, rows.Err()
}
