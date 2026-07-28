package main

import (
	"backend/auth"
	"flag"
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

func main() {
	passwordFlag := flag.String("password", "", "admin password to verify")
	flag.Parse()

	_ = godotenv.Load()

	adminUsername, userErr := auth.AdminUsername()
	adminHash := os.Getenv("ADMIN_PASSWORD_HASH")
	jwtSecret := os.Getenv("JWT_SECRET")

	fmt.Printf("ADMIN_USERNAME configured: %t\n", userErr == nil)
	if userErr == nil {
		fmt.Printf("ADMIN_USERNAME value: %s\n", adminUsername)
	}
	fmt.Printf("ADMIN_PASSWORD_HASH configured: %t\n", adminHash != "")
	fmt.Printf("ADMIN_PASSWORD_HASH format valid: %t\n", auth.VerifyPassword("invalid-password", adminHash) || isHashFormatValid(adminHash))
	fmt.Printf("JWT_SECRET configured: %t\n", jwtSecret != "")

	if *passwordFlag != "" {
		fmt.Printf("Admin password matches hash: %t\n", auth.VerifyPassword(*passwordFlag, adminHash))
	}

	if os.Getenv("FLIP_WEBHOOK_SECRET") == "" {
		fmt.Println("FLIP_WEBHOOK_SECRET is not configured")
		return
	}
	fmt.Println("FLIP_WEBHOOK_SECRET is configured")
}

func isHashFormatValid(hash string) bool {
	parts := 0
	for _, ch := range hash {
		if ch == '$' {
			parts++
		}
	}
	return parts == 3
}
