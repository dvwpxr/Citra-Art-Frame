package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"backend/auth"
	"backend/database"
	"backend/models"

	_ "github.com/go-sql-driver/mysql"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
)

type bab4SyntheticData struct {
	Prefix     string
	UID        string
	OtherUID   string
	FrameID    int
	ArtPrintID int
	SliderID   int64
}

func TestBAB4BetaCheckoutIntegration(t *testing.T) {
	if os.Getenv("BAB4_INTEGRATION") != "1" {
		t.Skip("set BAB4_INTEGRATION=1 to run beta checkout integration")
	}
	loadHandlersBetaEnv(t)
	db := openHandlersBetaDB(t)
	previousDB := database.DB
	database.DB = db
	defer func() {
		database.DB = previousDB
		_ = db.Close()
	}()

	prefix := os.Getenv("BAB4_TEST_PREFIX")
	if prefix == "" {
		prefix = "TEST_BAB4_" + time.Now().Format("20060102_150405")
	}
	data := createBAB4SyntheticData(t, db, prefix)
	defer cleanupBAB4SyntheticData(t, db, data)

	setupFirebaseVerifier(t, data.UID)

	t.Run("validation rejects empty items", func(t *testing.T) {
		req := bab4ValidRequest(data)
		req.Items = nil
		assertPaymentStatus(t, req, http.StatusBadRequest)
	})
	t.Run("validation rejects incomplete address", func(t *testing.T) {
		req := bab4ValidRequest(data)
		req.FullAddress = ""
		req.ShippingAddress = ""
		assertPaymentStatus(t, req, http.StatusBadRequest)
	})
	t.Run("validation rejects invalid email", func(t *testing.T) {
		req := bab4ValidRequest(data)
		req.CustomerEmail = "invalid-email"
		assertPaymentStatus(t, req, http.StatusBadRequest)
	})
	t.Run("validation rejects invalid phone", func(t *testing.T) {
		req := bab4ValidRequest(data)
		req.CustomerPhone = "abc"
		assertPaymentStatus(t, req, http.StatusBadRequest)
	})
	t.Run("product not found is rejected", func(t *testing.T) {
		withMockQuoteAndFlip(t, shippingQuote{CourierCode: "JNE", CourierName: "JNE REG", Price: 22000, Estimation: "2 hari"}, func(context.Context, flipPaymentRequest) (flipPaymentResponse, error) {
			t.Fatal("Flip must not be called for missing product")
			return flipPaymentResponse{}, nil
		})
		req := bab4ValidRequest(data)
		req.Items[0].ProductID = 999999999
		assertPaymentStatus(t, req, http.StatusBadRequest)
	})
	t.Run("insufficient stock is rejected", func(t *testing.T) {
		withMockQuoteAndFlip(t, shippingQuote{CourierCode: "JNE", CourierName: "JNE REG", Price: 22000, Estimation: "2 hari"}, func(context.Context, flipPaymentRequest) (flipPaymentResponse, error) {
			t.Fatal("Flip must not be called for insufficient stock")
			return flipPaymentResponse{}, nil
		})
		req := bab4ValidRequest(data)
		req.Items[0].Quantity = 99
		assertPaymentStatus(t, req, http.StatusBadRequest)
	})
	t.Run("backend recalculates price and totals", func(t *testing.T) {
		var statusBeforeFlip string
		withMockQuoteAndFlip(t, shippingQuote{CourierCode: "JNE", CourierName: "JNE REG", Price: 22000, Estimation: "2 hari"}, func(ctx context.Context, req flipPaymentRequest) (flipPaymentResponse, error) {
			if req.Amount != 145456 {
				t.Fatalf("expected backend amount 145456, got %d", req.Amount)
			}
			if err := db.QueryRow("SELECT order_status FROM orders WHERE id = ?", req.OrderID).Scan(&statusBeforeFlip); err != nil {
				t.Fatalf("order not visible before Flip call: %v", err)
			}
			return flipPaymentResponse{LinkID: data.Prefix + "_MOCK_FLIP", LinkURL: "https://sandbox.example.test/pay/" + data.Prefix}, nil
		})

		beforeStock := artPrintStock(t, db, data.ArtPrintID)
		req := bab4ValidRequest(data)
		req.CustomerName = data.Prefix + "_PRICE_TEST"
		req.CustomerEmail = "price+" + strings.ToLower(data.Prefix) + "@example.test"
		req.Items[0].Price = 1
		req.Subtotal = 1
		req.ShippingCost = 1
		req.TotalPrice = 2
		rr := postBAB4PaymentRequest(t, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
		if statusBeforeFlip != orderStatusPendingPayment {
			t.Fatalf("expected pending_payment before Flip, got %s", statusBeforeFlip)
		}

		var resp struct {
			OrderID      int64  `json:"orderId"`
			PaymentURL   string `json:"paymentUrl"`
			Subtotal     int    `json:"subtotal"`
			ShippingCost int    `json:"shippingCost"`
			TotalAmount  int    `json:"totalAmount"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		if resp.Subtotal != 123456 || resp.ShippingCost != 22000 || resp.TotalAmount != 145456 {
			t.Fatalf("backend totals not recalculated: %+v", resp)
		}
		if resp.PaymentURL == "" {
			t.Fatal("payment URL missing")
		}

		var status string
		if err := db.QueryRow("SELECT order_status FROM orders WHERE id = ?", resp.OrderID).Scan(&status); err != nil {
			t.Fatal(err)
		}
		if status != orderStatusAwaitingPayment {
			t.Fatalf("expected awaiting_payment, got %s", status)
		}
		if got := artPrintStock(t, db, data.ArtPrintID); got != beforeStock-1 {
			t.Fatalf("expected stock %d, got %d", beforeStock-1, got)
		}
	})
	t.Run("Flip sandbox creates payment link", func(t *testing.T) {
		previousQuote := resolveShippingQuoteFunc
		resolveShippingQuoteFunc = func(context.Context, models.CreateOrderRequest, float64) (shippingQuote, error) {
			return shippingQuote{CourierCode: "JNE", CourierName: "JNE REG", Price: 22000, Estimation: "2 hari"}, nil
		}
		t.Cleanup(func() {
			resolveShippingQuoteFunc = previousQuote
		})

		req := bab4ValidRequest(data)
		req.CustomerName = data.Prefix + "_FLIP_SANDBOX"
		req.CustomerEmail = "sandbox+" + strings.ToLower(data.Prefix) + "@example.test"
		rr := postBAB4PaymentRequest(t, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 from Flip sandbox flow, got %d: %s", rr.Code, rr.Body.String())
		}
		var resp struct {
			OrderID    int64  `json:"orderId"`
			PaymentURL string `json:"paymentUrl"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(resp.PaymentURL, "http") {
			t.Fatalf("expected sandbox payment URL, got %q", resp.PaymentURL)
		}
		var status string
		if err := db.QueryRow("SELECT order_status FROM orders WHERE id = ?", resp.OrderID).Scan(&status); err != nil {
			t.Fatal(err)
		}
		if status != orderStatusAwaitingPayment {
			t.Fatalf("expected awaiting_payment, got %s", status)
		}
	})
	t.Run("Flip failure marks failed and releases stock", func(t *testing.T) {
		withMockQuoteAndFlip(t, shippingQuote{CourierCode: "JNE", CourierName: "JNE REG", Price: 22000, Estimation: "2 hari"}, func(context.Context, flipPaymentRequest) (flipPaymentResponse, error) {
			return flipPaymentResponse{}, fmt.Errorf("synthetic Flip failure")
		})

		beforeStock := artPrintStock(t, db, data.ArtPrintID)
		req := bab4ValidRequest(data)
		req.CustomerName = data.Prefix + "_FLIP_FAIL"
		req.CustomerEmail = "fail+" + strings.ToLower(data.Prefix) + "@example.test"
		rr := postBAB4PaymentRequest(t, req)
		if rr.Code != http.StatusBadGateway {
			t.Fatalf("expected 502, got %d: %s", rr.Code, rr.Body.String())
		}
		if got := artPrintStock(t, db, data.ArtPrintID); got != beforeStock {
			t.Fatalf("expected stock to be restored to %d, got %d", beforeStock, got)
		}

		var status string
		if err := db.QueryRow("SELECT order_status FROM orders WHERE customer_name = ? ORDER BY id DESC LIMIT 1", req.CustomerName).Scan(&status); err != nil {
			t.Fatal(err)
		}
		if status != orderStatusPaymentFailed {
			t.Fatalf("expected payment_failed, got %s", status)
		}
	})
}

func TestBAB4BetaSyntheticDataCleanupVerification(t *testing.T) {
	if os.Getenv("BAB4_INTEGRATION") != "1" {
		t.Skip("set BAB4_INTEGRATION=1 to run beta cleanup verification")
	}
	loadHandlersBetaEnv(t)
	db := openHandlersBetaDB(t)
	defer db.Close()

	prefix := os.Getenv("BAB4_TEST_PREFIX")
	if prefix == "" {
		t.Skip("BAB4_TEST_PREFIX not set")
	}

	checks := []struct {
		table string
		query string
		args  []interface{}
	}{
		{"orders", "SELECT COUNT(*) FROM orders WHERE customer_name LIKE ? OR firebase_uid LIKE ?", []interface{}{prefix + "%", prefix + "%"}},
		{"cart_items", "SELECT COUNT(*) FROM cart_items WHERE name LIKE ? OR firebase_uid LIKE ?", []interface{}{prefix + "%", prefix + "%"}},
		{"user_addresses", "SELECT COUNT(*) FROM user_addresses WHERE label LIKE ? OR firebase_uid LIKE ?", []interface{}{prefix + "%", prefix + "%"}},
		{"sliders", "SELECT COUNT(*) FROM sliders WHERE alt_text LIKE ?", []interface{}{prefix + "%"}},
		{"art_prints", "SELECT COUNT(*) FROM art_prints WHERE title LIKE ?", []interface{}{prefix + "%"}},
		{"products", "SELECT COUNT(*) FROM products WHERE name LIKE ?", []interface{}{prefix + "%"}},
	}
	for _, check := range checks {
		var count int
		if err := db.QueryRow(check.query, check.args...).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("cleanup incomplete for %s: %d rows remain with prefix %s", check.table, count, prefix)
		}
	}
}

func TestBAB4BetaOrderAuthorizationIntegration(t *testing.T) {
	if os.Getenv("BAB4_INTEGRATION") != "1" {
		t.Skip("set BAB4_INTEGRATION=1 to run beta order authorization integration")
	}
	loadHandlersBetaEnv(t)
	db := openHandlersBetaDB(t)
	previousDB := database.DB
	database.DB = db
	defer func() {
		database.DB = previousDB
		_ = db.Close()
	}()

	prefix := os.Getenv("BAB4_TEST_PREFIX")
	if prefix == "" {
		prefix = "TEST_BAB4_" + time.Now().Format("20060102_150405")
	}
	uid := prefix + "_ORDER_OWNER"
	otherUID := prefix + "_ORDER_OTHER"
	orderUID := prefix + "_ORDER_UID"

	res, err := db.Exec(`
		INSERT INTO orders (order_uid, customer_name, customer_email, customer_phone, firebase_uid, total_amount, subtotal, shipping_cost, shipping_address, order_status)
		VALUES (?, ?, ?, '081234567890', ?, 120000, 100000, 20000, ?, ?)`,
		orderUID, prefix+"_ORDER_CUSTOMER", "order+"+strings.ToLower(prefix)+"@example.test", uid, prefix+" address", orderStatusAwaitingPayment,
	)
	if err != nil {
		t.Fatal(err)
	}
	orderID, _ := res.LastInsertId()
	defer func() {
		_, _ = db.Exec("DELETE FROM order_items WHERE order_id = ?", orderID)
		_, _ = db.Exec("DELETE FROM orders WHERE id = ?", orderID)
	}()
	if _, err := db.Exec(`
		INSERT INTO order_items (order_id, product_id, item_name, category, quantity, price, details)
		VALUES (?, 0, ?, 'Art Print', 1, 100000, '{}')`, orderID, prefix+"_ORDER_ITEM"); err != nil {
		t.Fatal(err)
	}

	previousVerifier := auth.VerifyFirebaseIDTokenFunc
	auth.VerifyFirebaseIDTokenFunc = func(ctx context.Context, token string) (string, error) {
		switch token {
		case "owner-token":
			return uid, nil
		case "other-token":
			return otherUID, nil
		default:
			return "", fmt.Errorf("invalid token")
		}
	}
	defer func() {
		auth.VerifyFirebaseIDTokenFunc = previousVerifier
	}()

	router := mux.NewRouter()
	router.Handle("/api/orders/{id}", auth.CustomerOrAdminAuthMiddleware(http.HandlerFunc(GetOrderDetailHandler))).Methods(http.MethodGet)

	assertOrderDetailStatus := func(token string, want int) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/orders/%d", orderID), nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("token %q: expected %d, got %d: %s", token, want, rr.Code, rr.Body.String())
		}
	}

	assertOrderDetailStatus("", http.StatusUnauthorized)
	assertOrderDetailStatus("owner-token", http.StatusOK)
	assertOrderDetailStatus("other-token", http.StatusForbidden)

	adminToken, err := auth.GenerateJWT(os.Getenv("ADMIN_USERNAME"))
	if err != nil {
		t.Fatal(err)
	}
	assertOrderDetailStatus(adminToken, http.StatusOK)
}

func loadHandlersBetaEnv(t *testing.T) {
	t.Helper()
	if err := godotenv.Load("../.env"); err != nil {
		if err := godotenv.Load(".env"); err != nil {
			t.Fatalf("load .env: %v", err)
		}
	}
}

func openHandlersBetaDB(t *testing.T) *sql.DB {
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
	if err := db.Ping(); err != nil {
		t.Fatal(err)
	}
	return db
}

func createBAB4SyntheticData(t *testing.T, db *sql.DB, prefix string) bab4SyntheticData {
	t.Helper()
	data := bab4SyntheticData{
		Prefix:   prefix,
		UID:      prefix + "_UID_A",
		OtherUID: prefix + "_UID_B",
	}
	originCode := strings.TrimSpace(os.Getenv("STORE_ORIGIN_VILLAGE_CODE"))
	if originCode == "" {
		originCode = "TEST_VILLAGE"
	}

	productRes, err := db.Exec(`
		INSERT INTO products (name, description, price, stock, category, image_url, public_id, detail_image_url, border_slice, inset_top, inset_right, inset_bottom, inset_left, render_mode)
		VALUES (?, ?, ?, ?, 'Frame', ?, ?, ?, 80, 15, 15, 15, 15, 'flat')`,
		prefix+"_FRAME", prefix+" synthetic frame", 99000, 5,
		"https://example.test/"+prefix+"/frame.png", prefix+"_FRAME_PUBLIC", "https://example.test/"+prefix+"/frame-detail.png",
	)
	if err != nil {
		t.Fatal(err)
	}
	frameID, _ := productRes.LastInsertId()
	data.FrameID = int(frameID)

	printRes, err := db.Exec(`
		INSERT INTO art_prints (title, artist, category, description, price, stock, image_url, public_id)
		VALUES (?, ?, 'Test', ?, ?, ?, ?, ?)`,
		prefix+"_PRINT", prefix+"_ARTIST", prefix+" synthetic art print", 123456, 3,
		"https://example.test/"+prefix+"/print.png", prefix+"_PRINT_PUBLIC",
	)
	if err != nil {
		t.Fatal(err)
	}
	printID, _ := printRes.LastInsertId()
	data.ArtPrintID = int(printID)

	sliderRes, err := db.Exec(`
		INSERT INTO sliders (image_url, public_id, mobile_image_url, mobile_public_id, alt_text)
		VALUES (?, ?, ?, ?, ?)`,
		"https://example.test/"+prefix+"/slider.png", prefix+"_SLIDER_PUBLIC",
		"https://example.test/"+prefix+"/slider-mobile.png", prefix+"_SLIDER_MOBILE_PUBLIC", prefix+"_SLIDER",
	)
	if err != nil {
		t.Fatal(err)
	}
	data.SliderID, _ = sliderRes.LastInsertId()

	_, err = db.Exec(`
		INSERT INTO user_addresses (firebase_uid, label, receiver_name, phone, province_code, regency_code, district_code, village_code, province, city, district, village, postal_code, full_address, latitude, longitude, is_default)
		VALUES (?, ?, ?, ?, '', '', '', ?, 'Test Province', 'Test City', 'Test District', 'Test Village', '12345', ?, -6.2, 106.8, true)`,
		data.UID, prefix+"_ADDR", prefix+"_USER", "081234567890", originCode, prefix+" synthetic address",
	)
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.Exec(`
		INSERT INTO cart_items (firebase_uid, item_type, product_id, name, image_url, artist, size, price, quantity, subtotal)
		VALUES (?, 'artprint', ?, ?, ?, ?, 'Kecil', ?, 1, ?)`,
		data.UID, data.ArtPrintID, prefix+"_CART_ITEM", "https://example.test/"+prefix+"/print.png", prefix+"_ARTIST", 123456, 123456,
	)
	if err != nil {
		t.Fatal(err)
	}

	return data
}

func cleanupBAB4SyntheticData(t *testing.T, db *sql.DB, data bab4SyntheticData) {
	t.Helper()
	var orderIDs []int64
	rows, err := db.Query("SELECT id FROM orders WHERE firebase_uid IN (?, ?) OR customer_name LIKE ?", data.UID, data.OtherUID, data.Prefix+"%")
	if err == nil {
		for rows.Next() {
			var id int64
			if rows.Scan(&id) == nil {
				orderIDs = append(orderIDs, id)
			}
		}
		_ = rows.Close()
	}
	for _, orderID := range orderIDs {
		_, _ = db.Exec("DELETE FROM order_items WHERE order_id = ?", orderID)
		_, _ = db.Exec("DELETE FROM orders WHERE id = ?", orderID)
	}
	_, _ = db.Exec("DELETE FROM cart_items WHERE firebase_uid IN (?, ?) OR name LIKE ?", data.UID, data.OtherUID, data.Prefix+"%")
	_, _ = db.Exec("DELETE FROM user_addresses WHERE firebase_uid IN (?, ?) OR label LIKE ?", data.UID, data.OtherUID, data.Prefix+"%")
	_, _ = db.Exec("DELETE FROM sliders WHERE id = ? OR alt_text LIKE ?", data.SliderID, data.Prefix+"%")
	_, _ = db.Exec("DELETE FROM art_prints WHERE id = ? OR title LIKE ?", data.ArtPrintID, data.Prefix+"%")
	_, _ = db.Exec("DELETE FROM products WHERE id = ? OR name LIKE ?", data.FrameID, data.Prefix+"%")
}

func bab4ValidRequest(data bab4SyntheticData) models.CreateOrderRequest {
	return models.CreateOrderRequest{
		CustomerName:  data.Prefix + "_CUSTOMER",
		CustomerEmail: "customer+" + strings.ToLower(data.Prefix) + "@example.test",
		CustomerPhone: "081234567890",
		FirebaseUID:   data.UID,
		Subtotal:      1,
		ShippingCost:  1,
		TotalPrice:    2,
		FullAddress:   data.Prefix + " synthetic address",
		VillageCode:   strings.TrimSpace(os.Getenv("STORE_ORIGIN_VILLAGE_CODE")),
		CourierCode:   "JNE",
		CourierName:   "JNE REG",
		ShippingPrice: 1,
		Items: []models.OrderItem{{
			ProductID: data.ArtPrintID,
			Name:      "Tampered Art Print",
			Category:  "Art Print",
			Price:     1,
			Quantity:  1,
			Details: map[string]interface{}{
				"size": "Kecil",
			},
		}},
	}
}

func withMockQuoteAndFlip(t *testing.T, quote shippingQuote, flip func(context.Context, flipPaymentRequest) (flipPaymentResponse, error)) {
	t.Helper()
	previousQuote := resolveShippingQuoteFunc
	previousFlip := createFlipPaymentFunc
	resolveShippingQuoteFunc = func(context.Context, models.CreateOrderRequest, float64) (shippingQuote, error) {
		return quote, nil
	}
	createFlipPaymentFunc = flip
	t.Cleanup(func() {
		resolveShippingQuoteFunc = previousQuote
		createFlipPaymentFunc = previousFlip
	})
}

func postBAB4PaymentRequest(t *testing.T, payload models.CreateOrderRequest) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/create-payment", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer firebase-token")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	auth.FirebaseAuthMiddleware(http.HandlerFunc(CreatePaymentHandler)).ServeHTTP(rr, req)
	return rr
}

func assertPaymentStatus(t *testing.T, payload models.CreateOrderRequest, status int) {
	t.Helper()
	rr := postBAB4PaymentRequest(t, payload)
	if rr.Code != status {
		t.Fatalf("expected %d, got %d: %s", status, rr.Code, rr.Body.String())
	}
}

func artPrintStock(t *testing.T, db *sql.DB, id int) int {
	t.Helper()
	var stock int
	if err := db.QueryRow("SELECT stock FROM art_prints WHERE id = ?", id).Scan(&stock); err != nil {
		t.Fatal(err)
	}
	return stock
}
