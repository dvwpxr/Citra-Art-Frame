package auth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

type adminContextKey struct{}

func SetNoStoreHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
}

func jwtKey() ([]byte, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		return nil, errors.New("JWT_SECRET is not configured")
	}
	return []byte(secret), nil
}

func GenerateJWT(username string) (string, error) {
	key, err := jwtKey()
	if err != nil {
		return "", err
	}

	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(key)
}

func AdminUsernameFromRequest(r *http.Request) string {
	username, _ := r.Context().Value(adminContextKey{}).(string)
	return username
}

func IsAdminRequest(r *http.Request) bool {
	return AdminUsernameFromRequest(r) != ""
}

// JwtMiddleware protects admin-only routes. API requests receive JSON errors;
// page requests keep the existing redirect-to-login behavior.
func JwtMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		SetNoStoreHeaders(w)

		username, status, err := authenticateAdminJWT(r)
		if err != nil {
			if status == http.StatusUnauthorized {
				clearJWTCookie(w)
			}
			respondJWTFailure(w, r, status, err.Error())
			return
		}

		ctx := context.WithValue(r.Context(), adminContextKey{}, username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func CustomerOrAdminAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		SetNoStoreHeaders(w)

		if username, _, err := authenticateAdminJWT(r); err == nil {
			ctx := context.WithValue(r.Context(), adminContextKey{}, username)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		uid, err := VerifyFirebaseIDTokenFunc(r.Context(), bearerToken(r))
		if err != nil {
			writeAuthError(w, http.StatusUnauthorized, "autentikasi diperlukan")
			return
		}

		ctx := context.WithValue(r.Context(), firebaseUIDContextKey{}, uid)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func authenticateAdminJWT(r *http.Request) (string, int, error) {
	tokenString := adminTokenFromRequest(r)
	if tokenString == "" {
		return "", http.StatusUnauthorized, errors.New("autentikasi admin diperlukan")
	}

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return jwtKey()
	})
	if err != nil || token == nil || !token.Valid {
		return "", http.StatusUnauthorized, errors.New("token admin tidak valid")
	}

	adminUsername, err := AdminUsername()
	if err != nil {
		return "", http.StatusInternalServerError, errors.New("konfigurasi admin belum lengkap")
	}
	if claims.Username == "" || claims.Username != adminUsername {
		return "", http.StatusForbidden, errors.New("akses admin ditolak")
	}

	return claims.Username, http.StatusOK, nil
}

func adminTokenFromRequest(r *http.Request) string {
	if cookie, err := r.Cookie("jwt_token"); err == nil {
		return strings.TrimSpace(cookie.Value)
	}
	return bearerToken(r)
}

func respondJWTFailure(w http.ResponseWriter, r *http.Request, status int, message string) {
	if isAPIRequest(r) {
		writeAuthError(w, status, message)
		return
	}
	if status == http.StatusUnauthorized {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	http.Error(w, message, status)
}

func isAPIRequest(r *http.Request) bool {
	if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api" {
		return true
	}
	accept := strings.ToLower(r.Header.Get("Accept"))
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	return strings.Contains(accept, "application/json") || strings.Contains(contentType, "application/json")
}

func clearJWTCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "jwt_token",
		Value:    "",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   os.Getenv("APP_ENV") == "production",
		Path:     "/",
	})
}
