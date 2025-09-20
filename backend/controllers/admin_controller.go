package controllers

import (
	"backend/auth"
	"backend/models"
	"encoding/json"
	"net/http"
	"time"
)

func HandleAdminLogin(w http.ResponseWriter, r *http.Request) {
    var req models.LoginRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        return
    }

    if req.Username != "admin" || req.Password != "password123" {
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
	http.SetCookie(w, &http.Cookie{
		Name:     "jwt_token", 
		Value:    "",
		Expires:  time.Now().Add(-time.Hour),
		HttpOnly: true,
		Path:     "/",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Logout successful",
	})
}