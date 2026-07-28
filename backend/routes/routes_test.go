package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func TestAdminStatsRouteRequiresAdminJWT(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("ADMIN_USERNAME", "admin")

	router := mux.NewRouter()
	SetupRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/stats", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated stats route, got %d", rr.Code)
	}
	if got := rr.Header().Get("Location"); got != "" {
		t.Fatalf("expected JSON API error, got redirect to %q", got)
	}
}

func TestHealthRouteIsReady(t *testing.T) {
	router := mux.NewRouter()
	SetupRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected health route status 200, got %d", rr.Code)
	}
	if rr.Body.String() != "ok" {
		t.Fatalf("expected health route body %q, got %q", "ok", rr.Body.String())
	}
}
