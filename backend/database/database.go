package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/go-sql-driver/mysql" // MySQL driver
	"github.com/joho/godotenv"
)

// DB adalah koneksi database yang akan diekspor untuk digunakan oleh package lain
var DB *sql.DB

// Connect menginisialisasi koneksi ke database
func Connect() {
	loadEnv()

	dbUser := mustEnv("DB_USER")
	dbPass := mustEnv("DB_PASSWORD")
	dbHost := mustEnv("DB_HOST")
	dbPort := mustEnv("DB_PORT")
	dbName := mustEnv("DB_NAME")

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		dbUser, dbPass, dbHost, dbPort, dbName)

	log.Printf("DB cfg -> host=%s port=%s db=%s user=%s", dbHost, dbPort, dbName, dbUser)

	var err error
	DB, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal("Gagal membuka koneksi database:", err)
	}

	if err = DB.Ping(); err != nil {
		log.Fatal("Gagal menghubungkan ke database:", err)
	}

	log.Println("Database terhubung!")
}

func loadEnv() {
	if err := godotenv.Load(); err != nil {
		log.Println("Tidak ada file .env, menggunakan environment variable dari sistem")
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("Environment variable yang dibutuhkan tidak ditemukan: %s", key)
	}
	return v
}