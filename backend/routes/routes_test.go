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
