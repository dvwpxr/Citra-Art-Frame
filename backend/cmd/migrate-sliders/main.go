package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		mustEnv("DB_USER"),
		mustEnv("DB_PASSWORD"),
		mustEnv("DB_HOST"),
		mustEnv("DB_PORT"),
		mustEnv("DB_NAME"),
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	_, err = db.Exec("ALTER TABLE sliders ADD COLUMN mobile_image_url TEXT DEFAULT NULL, ADD COLUMN mobile_public_id VARCHAR(255) DEFAULT NULL;")
	if err != nil {
		log.Fatal("Error altering table:", err)
	}
	fmt.Println("Migration successful!")
}

func mustEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("%s is required", key)
	}
	return value
}
