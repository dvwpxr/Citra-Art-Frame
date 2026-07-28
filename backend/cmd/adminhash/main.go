package main

import (
	"backend/auth"
	"bufio"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
)

func main() {
	passwordFlag := flag.String("password", "", "admin password to hash")
	flag.Parse()

	password := *passwordFlag
	if password == "" {
		fmt.Fprint(os.Stderr, "Admin password: ")
		input, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil {
			log.Fatal(err)
		}
		password = strings.TrimSpace(input)
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(hash)
	fmt.Printf("ADMIN_PASSWORD_HASH='%s'\n", hash)
}
