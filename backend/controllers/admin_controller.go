package controllers

import (
	"backend/auth"
	"backend/models"
	"encoding/json"
	"net/http"
	"time"
)

// HandleAdminLogin menangani logika login admin
func HandleAdminLogin(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	const adminUsername = "admin"
	const adminPassword = "password123"

	if req.Username == adminUsername && req.Password == adminPassword {
		tokenString, err := auth.GenerateJWT(req.Username)
		if err != nil {
			http.Error(w, "Gagal membuat token", http.StatusInternalServerError)
			return
		}

		// Buat cookie
		expirationTime := time.Now().Add(24 * time.Hour)
		http.SetCookie(w, &http.Cookie{
			Name:     "authToken",
			Value:    tokenString,
			Expires:  expirationTime,
			HttpOnly: true, // Mencegah akses dari JavaScript sisi klien (lebih aman)
			Path:     "/",  // Cookie berlaku untuk seluruh situs
		})

		// Kirim response sukses sederhana
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Login successful",
		})
		// --- AKHIR PERUBAHAN ---
	} else {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
	}
}

// HandleAdminLogout menghapus cookie otentikasi
func HandleAdminLogout(w http.ResponseWriter, r *http.Request) {
	// Buat cookie dengan waktu kedaluwarsa di masa lalu untuk menghapusnya
	http.SetCookie(w, &http.Cookie{
		Name:     "authToken",
		Value:    "",
		Expires:  time.Now().Add(-time.Hour), // Set waktu kedaluwarsa di masa lalu
		HttpOnly: true,
		Path:     "/",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Logout successful",
	})
}