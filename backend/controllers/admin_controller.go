package controllers

import (
	"backend/auth"
	"backend/models"
	"encoding/json"
	"net/http"
	"os"
	"time"
)

func HandleAdminLogin(w http.ResponseWriter, r *http.Request) {
	auth.SetNoStoreHeaders(w)

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	adminUsername, err := auth.AdminUsername()
	if err != nil {
		http.Error(w, "Konfigurasi admin belum lengkap", http.StatusInternalServerError)
		return
	}

	if req.Username != adminUsername || auth.VerifyAdminPassword(req.Password) != nil {
		http.Error(w, "Username atau password salah", http.StatusUnauthorized)
		return
	}

	tokenString, err := auth.GenerateJWT(req.Username)
	if err != nil {
		http.Error(w, "Gagal membuat token", http.StatusInternalServerError)
		return
	}

	expirationTime := time.Now().Add(24 * time.Hour)
	http.SetCookie(w, &http.Cookie{
		Name:     "jwt_token",
		Value:    tokenString,
		Expires:  expirationTime,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   os.Getenv("APP_ENV") == "production",
		Path:     "/",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Login berhasil",
		"token":   tokenString,
	})
}

// HandleAdminLogout menghapus cookie otentikasi
func HandleAdminLogout(w http.ResponseWriter, r *http.Request) {
	auth.SetNoStoreHeaders(w)
	w.Header().Set("Clear-Site-Data", "\"cache\"")

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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Logout successful",
	})
}
