package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJwtMiddlewareAPIUnauthorizedReturnsJSON(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("ADMIN_USERNAME", "admin")

	handler := JwtMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/stats", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
	if got := rr.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected JSON content type, got %q", got)
	}
	if got := rr.Header().Get("Location"); got != "" {
		t.Fatalf("expected no redirect location, got %q", got)
	}
}

func TestJwtMiddlewareAPIForbiddenReturnsJSON(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("ADMIN_USERNAME", "admin")

	token, err := GenerateJWT("not-admin")
	if err != nil {
		t.Fatal(err)
	}

	handler := JwtMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/stats", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rr.Code)
	}
	if got := rr.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected JSON content type, got %q", got)
	}
}

func TestJwtMiddlewareAllowsConfiguredAdmin(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("ADMIN_USERNAME", "admin")

	token, err := GenerateJWT("admin")
	if err != nil {
		t.Fatal(err)
	}

	handler := JwtMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := AdminUsernameFromRequest(r); got != "admin" {
			t.Fatalf("expected admin context, got %q", got)
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/stats", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rr.Code)
	}
}
