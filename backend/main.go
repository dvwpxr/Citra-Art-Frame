package main

import (
	"backend/database"
	"backend/routes"
	"log"
	"net"
	"net/http"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("Peringatan: Tidak dapat menemukan file .env")
	}
	// 1. Inisialisasi koneksi database
	database.Connect()
	defer database.DB.Close()

	// 2. Buat router baru
	r := mux.NewRouter()

	// 3. Setup semua rute dari package routes
	routes.SetupRoutes(r)

	// 4. Jalankan server
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}
	address := net.JoinHostPort("0.0.0.0", port)
	log.Printf("Server dimulai pada %s", address)
	log.Fatal(http.ListenAndServe(address, enableCORS(r)))
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
