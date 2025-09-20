package main

import (
	"backend/database"
	"backend/routes"
	"log"
	"net/http"

	_ "github.com/go-sql-driver/mysql"
	"github.com/gorilla/mux"
)

func main() {
	// 1. Inisialisasi koneksi database
	database.Connect()
	defer database.DB.Close()

	// 2. Buat router baru
	r := mux.NewRouter()

	// 3. Setup semua rute dari package routes
	routes.SetupRoutes(r)

	// 4. Jalankan server
	log.Println("Server dimulai pada port :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}