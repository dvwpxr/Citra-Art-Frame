package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"backend/auth"

	_ "github.com/go-sql-driver/mysql"
)

func TestBAB4BlackboxHTTPIntegration(t *testing.T) {
	if os.Getenv("BAB4_BLACKBOX") != "1" {
		t.Skip("set BAB4_BLACKBOX=1 to run local black-box HTTP checks")
	}
	loadBetaEnv(t)

	backendURL := strings.TrimRight(os.Getenv("BAB4_BACKEND_URL"), "/")
	if backendURL == "" {
		backendURL = "http://127.0.0.1:8080"
	}
	frontendURL := strings.TrimRight(os.Getenv("BAB4_FRONTEND_URL"), "/")
	if frontendURL == "" {
		frontendURL = "http://127.0.0.1:5173"
	}
	prefix := os.Getenv("BAB4_TEST_PREFIX")
	if prefix == "" {
		prefix = "TEST_BAB4_" + time.Now().Format("20060102_150405")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	db := openBetaDB(t)
	defer db.Close()
	defer cleanupBlackboxPrefix(t, db, prefix)

	t.Run("public pages and assets", func(t *testing.T) {
		for _, path := range []string{"/", "/products", "/prints", "/print-detail", "/custom", "/ar-view", "/login"} {
			resp := doRequest(t, client, http.MethodGet, frontendURL+path, nil, nil)
			closeBody(resp)
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("%s expected 200, got %d", path, resp.StatusCode)
			}
		}
		for _, path := range []string{"/assets/js/checkout.js", "/assets/css/styles.css", "/assets/3d/frame.glb"} {
			resp := doRequest(t, client, http.MethodGet, frontendURL+path, nil, nil)
			closeBody(resp)
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("asset %s expected 200, got %d", path, resp.StatusCode)
			}
		}
		resp := doRequest(t, client, http.MethodGet, frontendURL+"/path/to/your/frame-texture.jpg", nil, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("placeholder URL should not be a real referenced asset; direct request expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("api auth responses", func(t *testing.T) {
		resp := doRequest(t, client, http.MethodGet, backendURL+"/api/admin/stats", nil, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusUnauthorized || resp.Header.Get("Location") != "" {
			t.Fatalf("admin stats without JWT expected 401 no redirect, got %d location=%q", resp.StatusCode, resp.Header.Get("Location"))
		}

		resp = doRequest(t, client, http.MethodGet, backendURL+"/api/orders/1", nil, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusUnauthorized || resp.Header.Get("Location") != "" {
			t.Fatalf("order detail without auth expected 401 no redirect, got %d location=%q", resp.StatusCode, resp.Header.Get("Location"))
		}

		resp = doRequest(t, client, http.MethodGet, backendURL+"/api/admin/stats", map[string]string{"Authorization": "Bearer invalid.jwt.token"}, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusUnauthorized || resp.Header.Get("Location") != "" {
			t.Fatalf("invalid JWT expected 401 no redirect, got %d location=%q", resp.StatusCode, resp.Header.Get("Location"))
		}

		resp = doJSON(t, client, http.MethodPost, backendURL+"/api/admin/login", map[string]string{"username": os.Getenv("ADMIN_USERNAME"), "password": "wrong-" + prefix}, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("admin login wrong password expected 401, got %d", resp.StatusCode)
		}
	})

	adminToken, err := auth.GenerateJWT(os.Getenv("ADMIN_USERNAME"))
	if err != nil {
		t.Fatal(err)
	}
	adminHeaders := map[string]string{"Authorization": "Bearer " + adminToken}

	t.Run("admin stats with JWT", func(t *testing.T) {
		resp := doRequest(t, client, http.MethodGet, backendURL+"/api/admin/stats", adminHeaders, nil)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("admin stats with JWT expected 200, got %d: %s", resp.StatusCode, string(body))
		}
	})

	t.Run("product CRUD", func(t *testing.T) {
		body, contentType := multipartBody(t, map[string]string{
			"name":         prefix + "_HTTP_PRODUCT",
			"description":  prefix + " blackbox product",
			"price":        "111000",
			"stock":        "4",
			"category":     "Frame",
			"border_slice": "80",
		}, "image", prefix+"_product.png")
		resp := doRequest(t, client, http.MethodPost, backendURL+"/api/products", mergeHeaders(adminHeaders, map[string]string{"Content-Type": contentType}), body)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("create product expected 201, got %d: %s", resp.StatusCode, string(data))
		}
		var product struct {
			ID int `json:"id"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&product); err != nil {
			t.Fatal(err)
		}
		if product.ID == 0 {
			t.Fatal("created product ID missing")
		}

		updateBody, updateType := multipartBody(t, map[string]string{
			"name":         prefix + "_HTTP_PRODUCT_UPDATED",
			"description":  prefix + " updated product",
			"price":        "112000",
			"stock":        "3",
			"category":     "Frame",
			"border_slice": "80",
		}, "", "")
		resp = doRequest(t, client, http.MethodPut, fmt.Sprintf("%s/api/products/%d", backendURL, product.ID), mergeHeaders(adminHeaders, map[string]string{"Content-Type": updateType}), updateBody)
		closeBody(resp)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("update product expected 200, got %d", resp.StatusCode)
		}
		resp = doRequest(t, client, http.MethodDelete, fmt.Sprintf("%s/api/products/%d", backendURL, product.ID), adminHeaders, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("delete product expected 204, got %d", resp.StatusCode)
		}
	})

	t.Run("art print CRUD", func(t *testing.T) {
		body, contentType := multipartBody(t, map[string]string{
			"title":       prefix + "_HTTP_PRINT",
			"artist":      prefix + "_ARTIST",
			"category":    "Test",
			"description": prefix + " blackbox art print",
			"price":       "88000",
			"stock":       "2",
		}, "image", prefix+"_print.png")
		resp := doRequest(t, client, http.MethodPost, backendURL+"/api/prints", mergeHeaders(adminHeaders, map[string]string{"Content-Type": contentType}), body)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			data, _ := io.ReadAll(resp.Body)
			t.Fatalf("create art print expected 201, got %d: %s", resp.StatusCode, string(data))
		}
		var print struct {
			ID int `json:"id"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&print); err != nil {
			t.Fatal(err)
		}
		updateBody, updateType := multipartBody(t, map[string]string{
			"title":       prefix + "_HTTP_PRINT_UPDATED",
			"artist":      prefix + "_ARTIST",
			"category":    "Test",
			"description": prefix + " updated art print",
			"price":       "89000",
			"stock":       "1",
		}, "", "")
		resp = doRequest(t, client, http.MethodPut, fmt.Sprintf("%s/api/prints/%d", backendURL, print.ID), mergeHeaders(adminHeaders, map[string]string{"Content-Type": updateType}), updateBody)
		closeBody(resp)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("update art print expected 200, got %d", resp.StatusCode)
		}
		resp = doRequest(t, client, http.MethodDelete, fmt.Sprintf("%s/api/prints/%d", backendURL, print.ID), adminHeaders, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("delete art print expected 204, got %d", resp.StatusCode)
		}
	})

	t.Run("slider CRUD", func(t *testing.T) {
		body, contentType := multipartBody(t, map[string]string{"altText": prefix + "_HTTP_SLIDER"}, "image", prefix+"_slider.png")
		resp := doRequest(t, client, http.MethodPost, backendURL+"/api/slides", mergeHeaders(adminHeaders, map[string]string{"Content-Type": contentType}), body)
		closeBody(resp)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("create slider expected 201, got %d", resp.StatusCode)
		}
		resp = doRequest(t, client, http.MethodGet, backendURL+"/api/slides/admin", adminHeaders, nil)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("list admin sliders expected 200, got %d", resp.StatusCode)
		}
		var sliders []struct {
			ID      int    `json:"id"`
			AltText string `json:"altText"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&sliders); err != nil {
			t.Fatal(err)
		}
		var sliderID int
		for _, slider := range sliders {
			if slider.AltText == prefix+"_HTTP_SLIDER" {
				sliderID = slider.ID
				break
			}
		}
		if sliderID == 0 {
			t.Fatal("created slider not found in admin list")
		}
		resp = doRequest(t, client, http.MethodDelete, fmt.Sprintf("%s/api/slides/%d", backendURL, sliderID), adminHeaders, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("delete slider expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("custom order persistence", func(t *testing.T) {
		resp := doJSON(t, client, http.MethodPost, backendURL+"/api/orders", map[string]interface{}{
			"frame_model":    prefix + "_CUSTOM_FRAME",
			"artwork_width":  40,
			"artwork_height": 60,
			"mat_width":      4,
			"mat_color":      "white",
			"total_price":    123000,
		}, adminHeaders)
		closeBody(resp)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("custom order create expected 201, got %d", resp.StatusCode)
		}
	})

	t.Run("admin order list detail and status update", func(t *testing.T) {
		res, err := db.Exec(`
			INSERT INTO orders (order_uid, customer_name, customer_email, customer_phone, firebase_uid, total_amount, subtotal, shipping_cost, shipping_address, order_status)
			VALUES (?, ?, ?, '081234567890', ?, 100000, 80000, 20000, ?, 'awaiting_payment')`,
			prefix+"_ADMIN_ORDER_UID", prefix+"_ADMIN_ORDER_CUSTOMER", "adminorder+"+strings.ToLower(prefix)+"@example.test", prefix+"_ADMIN_ORDER_USER", prefix+" admin order address",
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
			VALUES (?, 0, ?, 'Art Print', 1, 80000, '{}')`, orderID, prefix+"_ADMIN_ORDER_ITEM"); err != nil {
			t.Fatal(err)
		}

		resp := doRequest(t, client, http.MethodGet, backendURL+"/api/admin/orders?search="+prefix+"_ADMIN_ORDER_UID", adminHeaders, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("admin order list expected 200, got %d", resp.StatusCode)
		}
		resp = doRequest(t, client, http.MethodGet, fmt.Sprintf("%s/api/admin/orders/%d", backendURL, orderID), adminHeaders, nil)
		closeBody(resp)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("admin order detail expected 200, got %d", resp.StatusCode)
		}
		resp = doJSON(t, client, http.MethodPut, fmt.Sprintf("%s/api/admin/orders/%d/status", backendURL, orderID), map[string]string{"status": "DELIVERED"}, adminHeaders)
		closeBody(resp)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("admin order status update expected 200, got %d", resp.StatusCode)
		}
		var status string
		if err := db.QueryRow("SELECT order_status FROM orders WHERE id = ?", orderID).Scan(&status); err != nil {
			t.Fatal(err)
		}
		if status != "DELIVERED" {
			t.Fatalf("admin order status expected DELIVERED, got %s", status)
		}
	})

	t.Run("Flip webhook callback", func(t *testing.T) {
		res, err := db.Exec(`
			INSERT INTO orders (order_uid, customer_name, customer_email, customer_phone, firebase_uid, total_amount, subtotal, shipping_cost, shipping_address, order_status)
			VALUES (?, ?, ?, '081234567890', ?, 100000, 80000, 20000, ?, 'awaiting_payment')`,
			prefix+"_WEBHOOK_UID", prefix+"_WEBHOOK_CUSTOMER", "webhook+"+strings.ToLower(prefix)+"@example.test", prefix+"_WEBHOOK_USER", prefix+" webhook address",
		)
		if err != nil {
			t.Fatal(err)
		}
		orderID, _ := res.LastInsertId()
		defer func() {
			_, _ = db.Exec("DELETE FROM order_items WHERE order_id = ?", orderID)
			_, _ = db.Exec("DELETE FROM orders WHERE id = ?", orderID)
		}()

		form := url.Values{}
		form.Set("token", os.Getenv("FLIP_WEBHOOK_SECRET"))
		form.Set("data", fmt.Sprintf(`{"status":"SUCCESSFUL","bill_title":"Citra Artframe Order #%d"}`, orderID))
		resp := doRequest(t, client, http.MethodPost, backendURL+"/api/flip/callback", map[string]string{"Content-Type": "application/x-www-form-urlencoded"}, strings.NewReader(form.Encode()))
		closeBody(resp)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Flip webhook expected 200, got %d", resp.StatusCode)
		}
		var status string
		if err := db.QueryRow("SELECT order_status FROM orders WHERE id = ?", orderID).Scan(&status); err != nil {
			t.Fatal(err)
		}
		if status != "PROCESSING" {
			t.Fatalf("Flip webhook expected PROCESSING, got %s", status)
		}
	})
}

func doRequest(t *testing.T, client *http.Client, method, url string, headers map[string]string, body io.Reader) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func doJSON(t *testing.T, client *http.Client, method, url string, payload interface{}, headers map[string]string) *http.Response {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	return doRequest(t, client, method, url, mergeHeaders(headers, map[string]string{"Content-Type": "application/json"}), bytes.NewReader(raw))
}

func multipartBody(t *testing.T, fields map[string]string, fileField, fileName string) (io.Reader, string) {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	if fileField != "" {
		part, err := writer.CreateFormFile(fileField, fileName)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(testPNGBytes(t)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return &buf, writer.FormDataContentType()
}

func testPNGBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 12, 12))
	for y := 0; y < 12; y++ {
		for x := 0; x < 12; x++ {
			img.Set(x, y, color.RGBA{R: uint8(10 + x), G: uint8(20 + y), B: 180, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func mergeHeaders(parts ...map[string]string) map[string]string {
	out := map[string]string{}
	for _, part := range parts {
		for key, value := range part {
			out[key] = value
		}
	}
	return out
}

func closeBody(resp *http.Response) {
	if resp != nil && resp.Body != nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

func cleanupBlackboxPrefix(t *testing.T, db *sql.DB, prefix string) {
	t.Helper()
	rows, err := db.Query("SELECT id FROM orders WHERE customer_name LIKE ? OR order_uid LIKE ?", prefix+"%", prefix+"%")
	if err == nil {
		var orderIDs []int64
		for rows.Next() {
			var id int64
			if rows.Scan(&id) == nil {
				orderIDs = append(orderIDs, id)
			}
		}
		rows.Close()
		for _, id := range orderIDs {
			_, _ = db.Exec("DELETE FROM order_items WHERE order_id = ?", id)
			_, _ = db.Exec("DELETE FROM orders WHERE id = ?", id)
		}
	}
	_, _ = db.Exec("DELETE FROM custom_orders WHERE frame_model LIKE ?", prefix+"%")
	_, _ = db.Exec("DELETE FROM cart_items WHERE name LIKE ? OR firebase_uid LIKE ?", prefix+"%", prefix+"%")
	_, _ = db.Exec("DELETE FROM user_addresses WHERE label LIKE ? OR firebase_uid LIKE ?", prefix+"%", prefix+"%")
	_, _ = db.Exec("DELETE FROM sliders WHERE alt_text LIKE ? OR public_id LIKE ? OR mobile_public_id LIKE ?", prefix+"%", prefix+"%", prefix+"%")
	_, _ = db.Exec("DELETE FROM art_prints WHERE title LIKE ? OR public_id LIKE ?", prefix+"%", prefix+"%")
	_, _ = db.Exec("DELETE FROM products WHERE name LIKE ? OR public_id LIKE ?", prefix+"%", prefix+"%")
}

func TestBAB4NoPackageJSON(t *testing.T) {
	if _, err := os.Stat("../frontend/package.json"); err == nil {
		t.Fatal("frontend/package.json unexpectedly exists; run the frontend build script instead of marking it not applicable")
	}
}

func TestBAB4BlackboxCleanupVerification(t *testing.T) {
	if os.Getenv("BAB4_BLACKBOX") != "1" {
		t.Skip("set BAB4_BLACKBOX=1 to run cleanup verification")
	}
	loadBetaEnv(t)
	prefix := os.Getenv("BAB4_TEST_PREFIX")
	if prefix == "" {
		t.Skip("BAB4_TEST_PREFIX not set")
	}
	db := openBetaDB(t)
	defer db.Close()
	checks := []struct {
		name  string
		query string
		args  []interface{}
	}{
		{"orders", "SELECT COUNT(*) FROM orders WHERE customer_name LIKE ? OR firebase_uid LIKE ? OR order_uid LIKE ?", []interface{}{prefix + "%", prefix + "%", prefix + "%"}},
		{"custom_orders", "SELECT COUNT(*) FROM custom_orders WHERE frame_model LIKE ?", []interface{}{prefix + "%"}},
		{"cart_items", "SELECT COUNT(*) FROM cart_items WHERE name LIKE ? OR firebase_uid LIKE ?", []interface{}{prefix + "%", prefix + "%"}},
		{"user_addresses", "SELECT COUNT(*) FROM user_addresses WHERE label LIKE ? OR firebase_uid LIKE ?", []interface{}{prefix + "%", prefix + "%"}},
		{"sliders", "SELECT COUNT(*) FROM sliders WHERE alt_text LIKE ? OR public_id LIKE ? OR mobile_public_id LIKE ?", []interface{}{prefix + "%", prefix + "%", prefix + "%"}},
		{"art_prints", "SELECT COUNT(*) FROM art_prints WHERE title LIKE ? OR public_id LIKE ?", []interface{}{prefix + "%", prefix + "%"}},
		{"products", "SELECT COUNT(*) FROM products WHERE name LIKE ? OR public_id LIKE ?", []interface{}{prefix + "%", prefix + "%"}},
	}
	for _, check := range checks {
		var count int
		if err := db.QueryRow(check.query, check.args...).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s cleanup incomplete: %d rows remain with prefix %s", check.name, count, prefix)
		}
	}
}

func TestBAB4FrameGLBFileExists(t *testing.T) {
	info, err := os.Stat("../frontend/assets/3d/frame.glb")
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() == 0 {
		t.Fatal("frame.glb is empty")
	}
}
