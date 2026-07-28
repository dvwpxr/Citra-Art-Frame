package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"backend/auth"
	"backend/models"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gorilla/mux"
)

func validCheckoutRequest() models.CreateOrderRequest {
	return models.CreateOrderRequest{
		CustomerName:  "Dava Wisda",
		CustomerEmail: "dava@example.test",
		CustomerPhone: "081234567890",
		FullAddress:   "Jl Test No 1",
		VillageCode:   "3171010001",
		CourierCode:   "JNE",
		CourierName:   "JNE REG",
		PaymentMethod: "bca_va",
		ShippingPrice: 1,
		ShippingCost:  1,
		Subtotal:      1,
		TotalPrice:    2,
		Items: []models.OrderItem{{
			ProductID: 7,
			Name:      "Tampered Name",
			Category:  "Art Print",
			Price:     1,
			Quantity:  1,
			Details: map[string]interface{}{
				"size": "Kecil",
			},
		}},
	}
}

func paymentRouter() *mux.Router {
	router := mux.NewRouter()
	router.Handle("/api/create-payment", auth.FirebaseAuthMiddleware(http.HandlerFunc(CreatePaymentHandler))).Methods(http.MethodPost)
	return router
}

func postPaymentRequest(t *testing.T, payload models.CreateOrderRequest) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/create-payment", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer firebase-token")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	paymentRouter().ServeHTTP(rr, req)
	return rr
}

func stubPaymentExternals(t *testing.T, flip func(context.Context, flipPaymentRequest) (flipPaymentResponse, error)) {
	t.Helper()
	previousShipping := resolveShippingQuoteFunc
	previousFlip := createFlipPaymentFunc
	resolveShippingQuoteFunc = func(ctx context.Context, req models.CreateOrderRequest, weight float64) (shippingQuote, error) {
		return shippingQuote{CourierCode: "JNE", CourierName: "JNE REG", Price: 20000, Estimation: "2 hari"}, nil
	}
	createFlipPaymentFunc = flip
	t.Cleanup(func() {
		resolveShippingQuoteFunc = previousShipping
		createFlipPaymentFunc = previousFlip
	})
}

func TestValidateCheckoutRequestRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*models.CreateOrderRequest)
	}{
		{name: "empty items", mutate: func(r *models.CreateOrderRequest) { r.Items = nil }},
		{name: "invalid customer name", mutate: func(r *models.CreateOrderRequest) { r.CustomerName = "A" }},
		{name: "invalid email", mutate: func(r *models.CreateOrderRequest) { r.CustomerEmail = "bad-email" }},
		{name: "invalid phone", mutate: func(r *models.CreateOrderRequest) { r.CustomerPhone = "abc" }},
		{name: "missing address", mutate: func(r *models.CreateOrderRequest) { r.FullAddress = ""; r.ShippingAddress = "" }},
		{name: "missing village", mutate: func(r *models.CreateOrderRequest) { r.VillageCode = "" }},
		{name: "missing shipping choice", mutate: func(r *models.CreateOrderRequest) { r.CourierCode = ""; r.CourierName = "" }},
		{name: "unsupported courier", mutate: func(r *models.CreateOrderRequest) { r.CourierCode = "SICEPAT"; r.CourierName = "SiCepat REG" }},
		{name: "zero quantity", mutate: func(r *models.CreateOrderRequest) { r.Items[0].Quantity = 0 }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := validCheckoutRequest()
			tt.mutate(&req)
			err := validateCheckoutRequest(req)
			if err == nil {
				t.Fatal("expected validation error")
			}
			var checkoutErr checkoutError
			if !errors.As(err, &checkoutErr) || checkoutErr.status != http.StatusBadRequest {
				t.Fatalf("expected 400 checkout error, got %v", err)
			}
		})
	}
}

func TestCreatePaymentRecalculatesTotalsFromDatabase(t *testing.T) {
	mock, cleanup := setupMockDB(t)
	defer cleanup()
	setupFirebaseVerifier(t, "uid-1")

	var flipAmount int
	stubPaymentExternals(t, func(ctx context.Context, req flipPaymentRequest) (flipPaymentResponse, error) {
		flipAmount = req.Amount
		if req.OrderID != 99 || req.OrderUID == "" || req.ExpiresAt.Before(time.Now()) {
			t.Fatalf("unexpected flip request: %+v", req)
		}
		if req.SenderBank != "bca" || req.SenderBankType != "virtual_account" {
			t.Fatalf("unexpected payment method sent to Flip: %+v", req)
		}
		return flipPaymentResponse{LinkID: "flip-1", LinkURL: "https://pay.test/order"}, nil
	})

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT title, artist, price, stock, image_url FROM art_prints").
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{"title", "artist", "price", "stock", "image_url"}).
			AddRow("DB Print", "DB Artist", 100000, 5, "https://img.test/print.jpg"))
	mock.ExpectExec("UPDATE art_prints SET stock = stock -").
		WithArgs(1, 7).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO orders").
		WithArgs(
			sqlmock.AnyArg(), "Dava Wisda", "dava@example.test", "081234567890", "uid-1",
			120000, 100000, 20000, "Jl Test No 1", orderStatusPendingPayment,
			"", "", "", "", "", "", "", "Jl Test No 1", "3171010001",
			"JNE", "JNE REG", 20000, "2 hari", sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(99, 1))
	mock.ExpectPrepare("INSERT INTO order_items").
		ExpectExec().
		WithArgs(int64(99), 7, "DB Print", "Art Print", 1, 100000, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectExec("UPDATE orders SET flip_link_id = \\?, payment_url = \\?, order_status = \\? WHERE id = \\?").
		WithArgs("flip-1", "https://pay.test/order", orderStatusAwaitingPayment, int64(99)).
		WillReturnResult(sqlmock.NewResult(0, 1))

	rr := postPaymentRequest(t, validCheckoutRequest())
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if flipAmount != 120000 {
		t.Fatalf("expected Flip amount from backend totals 120000, got %d", flipAmount)
	}
	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response["paymentUrl"] != "https://pay.test/order" {
		t.Fatalf("unexpected paymentUrl: %#v", response["paymentUrl"])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCreatePaymentRejectsMissingProduct(t *testing.T) {
	mock, cleanup := setupMockDB(t)
	defer cleanup()
	setupFirebaseVerifier(t, "uid-1")
	stubPaymentExternals(t, func(ctx context.Context, req flipPaymentRequest) (flipPaymentResponse, error) {
		t.Fatal("Flip must not be called when product is missing")
		return flipPaymentResponse{}, nil
	})

	payload := validCheckoutRequest()
	payload.Items[0].ProductID = 404

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT title, artist, price, stock, image_url FROM art_prints").
		WithArgs(404).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()

	rr := postPaymentRequest(t, payload)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCreatePaymentRejectsUnavailableStock(t *testing.T) {
	mock, cleanup := setupMockDB(t)
	defer cleanup()
	setupFirebaseVerifier(t, "uid-1")
	stubPaymentExternals(t, func(ctx context.Context, req flipPaymentRequest) (flipPaymentResponse, error) {
		t.Fatal("Flip must not be called when stock is unavailable")
		return flipPaymentResponse{}, nil
	})

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT title, artist, price, stock, image_url FROM art_prints").
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{"title", "artist", "price", "stock", "image_url"}).
			AddRow("DB Print", "DB Artist", 100000, 0, "https://img.test/print.jpg"))
	mock.ExpectRollback()

	rr := postPaymentRequest(t, validCheckoutRequest())
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCreatePaymentFailureMarksOrderFailedAndReleasesStock(t *testing.T) {
	mock, cleanup := setupMockDB(t)
	defer cleanup()
	setupFirebaseVerifier(t, "uid-1")
	stubPaymentExternals(t, func(ctx context.Context, req flipPaymentRequest) (flipPaymentResponse, error) {
		return flipPaymentResponse{}, errors.New("flip down")
	})

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT title, artist, price, stock, image_url FROM art_prints").
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{"title", "artist", "price", "stock", "image_url"}).
			AddRow("DB Print", "DB Artist", 100000, 5, "https://img.test/print.jpg"))
	mock.ExpectExec("UPDATE art_prints SET stock = stock -").
		WithArgs(1, 7).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO orders").WillReturnResult(sqlmock.NewResult(99, 1))
	mock.ExpectPrepare("INSERT INTO order_items").
		ExpectExec().
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE orders SET order_status = \\? WHERE id = \\?").
		WithArgs(orderStatusPaymentFailed, int64(99)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE art_prints SET stock = stock \\+ \\? WHERE id = \\?").
		WithArgs(1, 7).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	rr := postPaymentRequest(t, validCheckoutRequest())
	if rr.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", rr.Code, rr.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCreateFlipPaymentWithHTTPUsesSelectedPaymentMethod(t *testing.T) {
	t.Setenv("FLIP_SECRET_KEY", "sandbox-secret")
	t.Setenv("FLIP_REDIRECT_URL", "https://example.test/return")

	previousClient := flipHTTPClient
	flipHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", req.Method)
		}
		if req.URL.String() != "https://bigflip.id/big_sandbox_api/v2/pwf/bill" {
			t.Fatalf("unexpected URL: %s", req.URL.String())
		}
		if got := req.Header.Get("Content-Type"); got != "application/x-www-form-urlencoded" {
			t.Fatalf("unexpected content type: %s", got)
		}
		if got := req.Header.Get("idempotency-key"); got != "citraframe-order-order-uid" {
			t.Fatalf("unexpected idempotency key: %s", got)
		}
		if !strings.HasPrefix(req.Header.Get("Authorization"), "Basic ") {
			t.Fatal("missing Basic authorization header")
		}

		body, err := io.ReadAll(req.Body)
		if err != nil {
			t.Fatal(err)
		}
		values, err := url.ParseQuery(string(body))
		if err != nil {
			t.Fatal(err)
		}
		expected := map[string]string{
			"title":                    "Citra Artframe Order #123",
			"amount":                   "150000",
			"type":                     "SINGLE",
			"step":                     "3",
			"sender_name":              "Dava Test",
			"sender_email":             "dava.tag@example.test",
			"sender_phone_number":      "081234567890",
			"sender_address":           "Jl Test",
			"sender_bank":              "bca",
			"sender_bank_type":         "virtual_account",
			"is_address_required":      "0",
			"is_phone_number_required": "0",
			"redirect_url":             "https://example.test/return",
		}
		for key, want := range expected {
			if got := values.Get(key); got != want {
				t.Fatalf("unexpected form value %s: got %q want %q", key, got, want)
			}
		}
		if values.Get("bill_key") != "" {
			t.Fatal("bill_key should not be sent to Flip")
		}

		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body: io.NopCloser(strings.NewReader(`{
				"link_id": 2502091430251230005,
				"link_url": "flip.id/pwf-sandbox/$merchant/#legacy",
				"payment_url": "https://flip.id/pwf-sandbox/transaction/consolidated?redirected_from=internal&id=abc123"
			}`)),
		}, nil
	})}
	t.Cleanup(func() {
		flipHTTPClient = previousClient
	})

	resp, err := createFlipPaymentWithHTTP(context.Background(), flipPaymentRequest{
		OrderID:         123,
		OrderUID:        "order-uid",
		Amount:          150000,
		ExpiresAt:       time.Date(2026, 7, 14, 15, 4, 0, 0, time.UTC),
		CustomerName:    "Dava_Test",
		CustomerEmail:   "dava+tag@example.test",
		CustomerPhone:   "0812-3456-7890",
		CustomerAddress: "Jl Test",
		SenderBank:      "bca",
		SenderBankType:  "virtual_account",
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.LinkID != "2502091430251230005" {
		t.Fatalf("link_id lost precision: %s", resp.LinkID)
	}
	if resp.LinkURL != "https://flip.id/pwf-sandbox/transaction/consolidated?redirected_from=internal&id=abc123" {
		t.Fatalf("expected payment_url to be used, got %q", resp.LinkURL)
	}
}

func TestParseFlipPaymentResponseFallsBackToLinkURL(t *testing.T) {
	resp, err := parseFlipPaymentResponse([]byte(`{
		"link_id": "flip-1",
		"link_url": "flip.id/pwf-sandbox/$merchant/#bill"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if resp.LinkURL != "https://flip.id/pwf-sandbox/$merchant/#bill" {
		t.Fatalf("unexpected normalized link URL: %s", resp.LinkURL)
	}
}

func TestResolveFlipPaymentMethod(t *testing.T) {
	defaultMethod, err := resolveFlipPaymentMethod("")
	if err != nil {
		t.Fatal(err)
	}
	if defaultMethod.SenderBank != "mandiri" || defaultMethod.SenderBankType != "virtual_account" {
		t.Fatalf("unexpected default method: %+v", defaultMethod)
	}

	bca, err := resolveFlipPaymentMethod("bca_va")
	if err != nil {
		t.Fatal(err)
	}
	if bca.SenderBank != "bca" || bca.SenderBankType != "virtual_account" {
		t.Fatalf("unexpected BCA method: %+v", bca)
	}

	if _, err := resolveFlipPaymentMethod("not-supported"); err == nil {
		t.Fatal("expected invalid payment method error")
	}
}

func TestFlipSafeEmail(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "safe email", input: "dava@example.test", want: "dava@example.test"},
		{name: "plus alias sanitized", input: "sandbox+test_bab4@example.test", want: "sandbox.test.bab4@example.test"},
		{name: "fallback", input: "not-an-email", want: "customer.42@example.test"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := flipSafeEmail(tt.input, 42); got != tt.want {
				t.Fatalf("got %q want %q", got, tt.want)
			}
		})
	}
}

func TestParseFlipPaymentStatusPrefersSuccessfulPayment(t *testing.T) {
	status, err := parseFlipPaymentStatus([]byte(`{
		"data": [
			{"status": "PENDING"},
			{"status": "SUCCESSFUL"}
		]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if status != "SUCCESSFUL" {
		t.Fatalf("expected SUCCESSFUL, got %q", status)
	}
}

func TestOrderStatusFromFlipPaymentStatus(t *testing.T) {
	tests := []struct {
		flipStatus  string
		orderStatus string
	}{
		{flipStatus: "SUCCESSFUL", orderStatus: "PROCESSING"},
		{flipStatus: "paid", orderStatus: "PROCESSING"},
		{flipStatus: "EXPIRED", orderStatus: "CANCELED"},
		{flipStatus: "PENDING", orderStatus: ""},
	}

	for _, tt := range tests {
		t.Run(tt.flipStatus, func(t *testing.T) {
			if got := orderStatusFromFlipPaymentStatus(tt.flipStatus); got != tt.orderStatus {
				t.Fatalf("got %q want %q", got, tt.orderStatus)
			}
		})
	}
}

func TestSyncOrderPaymentStatusUpdatesSuccessfulPayment(t *testing.T) {
	mock, cleanup := setupMockDB(t)
	defer cleanup()

	previous := fetchFlipPaymentStatusFunc
	fetchFlipPaymentStatusFunc = func(ctx context.Context, flipLinkID string) (string, error) {
		if flipLinkID != "2502091430251230005" {
			t.Fatalf("unexpected flip link id: %s", flipLinkID)
		}
		return "SUCCESSFUL", nil
	}
	t.Cleanup(func() {
		fetchFlipPaymentStatusFunc = previous
	})

	mock.ExpectExec("UPDATE orders").
		WithArgs("PROCESSING", int64(77)).
		WillReturnResult(sqlmock.NewResult(0, 1))

	if err := syncOrderPaymentStatus(context.Background(), 77, "2502091430251230005"); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestFlipWebhookFallbackPreservesLongBillLinkID(t *testing.T) {
	mock, cleanup := setupMockDB(t)
	defer cleanup()
	t.Setenv("FLIP_WEBHOOK_SECRET", "webhook-secret")

	form := url.Values{}
	form.Set("token", "webhook-secret")
	form.Set("data", `{"status":"SUCCESSFUL","bill_link_id":2502091430251230005}`)

	mock.ExpectExec("UPDATE orders SET order_status = \\? WHERE flip_link_id = \\?").
		WithArgs("PROCESSING", "2502091430251230005").
		WillReturnResult(sqlmock.NewResult(0, 1))

	req := httptest.NewRequest(http.MethodPost, "/api/flip-webhook", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rr := httptest.NewRecorder()

	FlipWebhookHandler(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
