package auth

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var jwtKey = []byte(os.Getenv("JWT_SECRET"))

type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

func GenerateJWT(username string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtKey)
}

// JwtMiddleware yang sudah diperbaiki dan disempurnakan
func JwtMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var tokenString string

		// 1. Coba dapatkan token dari cookie terlebih dahulu
		// [FIX] Menggunakan nama "jwt_token" yang konsisten
		cookie, err := r.Cookie("jwt_token")
		if err == nil {
			tokenString = cookie.Value
		} else {
			// 2. Jika tidak ada cookie, coba dapatkan dari header (untuk API calls)
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}
			splitToken := strings.Split(authHeader, "Bearer ")
			if len(splitToken) != 2 {
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}
			tokenString = splitToken[1]
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})

		if err != nil || !token.Valid {
			// Jika token tidak valid, hapus cookie yang mungkin salah
			http.SetCookie(w, &http.Cookie{
				Name:    "jwt_token",
				Value:   "",
				Expires: time.Unix(0, 0),
				Path:    "/",
			})
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}

		next.ServeHTTP(w, r)
	})
}