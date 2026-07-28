package handlers

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/auth"
	"backend/database"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gorilla/mux"
)

func setupMockDB(t *testing.T) (sqlmock.Sqlmock, func()) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	previous := database.DB
	database.DB = db
	return mock, func() {
		database.DB = previous
		_ = db.Close()
	}
}

func setupFirebaseVerifier(t *testing.T, uid string) {
	t.Helper()
	previous := auth.VerifyFirebaseIDTokenFunc
	auth.VerifyFirebaseIDTokenFunc = func(ctx context.Context, token string) (string, error) {
		if token == "firebase-token" {
			return uid, nil
		}
		return "", errors.New("invalid token")
	}
	t.Cleanup(func() {
		auth.VerifyFirebaseIDTokenFunc = previous
	})
}

func orderDetailRouter() *mux.Router {
	router := mux.NewRouter()
	router.Handle("/api/orders/{id}", auth.CustomerOrAdminAuthMiddleware(http.HandlerFunc(GetOrderDetailHandler))).Methods(http.MethodGet)
	return router
}

func orderHeaderRows() *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "order_uid", "customer_name", "customer_email", "customer_phone",
		"shipping_address", "subtotal", "shipping_cost", "total_amount", "order_status", "created_at",
		"receiver_name", "phone", "full_address", "courier_name", "shipping_estimation", "weight", "flip_link_id",
	}).AddRow(
		int64(55), "ORD-55", "Dava", "dava@example.test", "081234567890",
		"Jl Test", 100000, 20000, 120000, "PROCESSING", "2026-07-13 10:00:00",
		"Dava", "081234567890", "Jl Test", "JNE REG", "2 hari", 0.5, "flip-1",
	)
}

func TestOrderDetailRequiresAuthentication(t *testing.T) {
	setupFirebaseVerifier(t, "uid-1")

	req := httptest.NewRequest(http.MethodGet, "/api/orders/55", nil)
	rr := httptest.NewRecorder()
	orderDetailRouter().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestFirebaseUserCanReadOwnOrder(t *testing.T) {
	mock, cleanup := setupMockDB(t)
	defer cleanup()
	setupFirebaseVerifier(t, "uid-1")

	mock.ExpectQuery("SELECT o.id, o.order_uid").
		WithArgs("55", "55", "uid-1").
		WillReturnRows(orderHeaderRows())
	mock.ExpectQuery("SELECT id, item_name").
		WithArgs(int64(55)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "item_name", "category", "price", "quantity", "details"}).
			AddRow(int64(1), "Print A", "Art Print", 100000, 1, sql.NullString{String: `{"size":"Kecil"}`, Valid: true}))

	req := httptest.NewRequest(http.MethodGet, "/api/orders/55", nil)
	req.Header.Set("Authorization", "Bearer firebase-token")
	rr := httptest.NewRecorder()
	orderDetailRouter().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestFirebaseUserCannotReadOtherOrder(t *testing.T) {
	mock, cleanup := setupMockDB(t)
	defer cleanup()
	setupFirebaseVerifier(t, "uid-1")

	mock.ExpectQuery("SELECT o.id, o.order_uid").
		WithArgs("55", "55", "uid-1").
		WillReturnError(sql.ErrNoRows)

	req := httptest.NewRequest(http.MethodGet, "/api/orders/55", nil)
	req.Header.Set("Authorization", "Bearer firebase-token")
	rr := httptest.NewRecorder()
	orderDetailRouter().ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rr.Code)
	}
	if rr.Body.String() == "order not found\n" {
		t.Fatalf("response leaks order existence")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAdminCanReadOrderDetail(t *testing.T) {
	mock, cleanup := setupMockDB(t)
	defer cleanup()
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("ADMIN_USERNAME", "admin")

	token, err := auth.GenerateJWT("admin")
	if err != nil {
		t.Fatal(err)
	}

	mock.ExpectQuery("SELECT o.id, o.order_uid").
		WithArgs("ORD-55", "ORD-55").
		WillReturnRows(orderHeaderRows())
	mock.ExpectQuery("SELECT id, item_name").
		WithArgs(int64(55)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "item_name", "category", "price", "quantity", "details"}))

	req := httptest.NewRequest(http.MethodGet, "/api/orders/ORD-55", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	orderDetailRouter().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
