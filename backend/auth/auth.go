package auth

import (
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Ambil kunci rahasia dari environment variable
var jwtKey = []byte(os.Getenv("JWT_SECRET"))

type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// GenerateJWT membuat token baru untuk admin
func GenerateJWT(username string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour) // Token berlaku 24 jam
	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtKey)
}

// JwtMiddleware adalah "penjaga gerbang" untuk rute yang dilindungi
func JwtMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// --- PERUBAHAN UTAMA DI SINI ---
		// Ambil cookie dari request
		cookie, err := r.Cookie("authToken")
		if err != nil {
			if err == http.ErrNoCookie {
				// Jika cookie tidak ada, kirim error Unauthorized
				http.Error(w, "Unauthorized: No token provided", http.StatusUnauthorized)
				return
			}
			// Untuk error lainnya
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		// Ambil value token dari cookie
		tokenString := cookie.Value
		// --- AKHIR PERUBAHAN ---
		
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}