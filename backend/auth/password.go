package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const (
	passwordHashAlgorithm = "pbkdf2_sha256"
	passwordHashRounds    = 310000
	passwordSaltBytes     = 16
	passwordKeyBytes      = 32
)

func AdminUsername() (string, error) {
	username := strings.TrimSpace(os.Getenv("ADMIN_USERNAME"))
	if username == "" {
		return "", errors.New("ADMIN_USERNAME is not configured")
	}
	return username, nil
}

func VerifyAdminPassword(password string) error {
	hash := strings.TrimSpace(os.Getenv("ADMIN_PASSWORD_HASH"))
	if hash == "" {
		return errors.New("ADMIN_PASSWORD_HASH is not configured")
	}
	if !VerifyPassword(password, hash) {
		return errors.New("invalid admin password")
	}
	return nil
}

func HashPassword(password string) (string, error) {
	if strings.TrimSpace(password) == "" {
		return "", errors.New("password cannot be empty")
	}

	salt := make([]byte, passwordSaltBytes)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	key := pbkdf2SHA256([]byte(password), salt, passwordHashRounds, passwordKeyBytes)
	return strings.Join([]string{
		passwordHashAlgorithm,
		strconv.Itoa(passwordHashRounds),
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	}, "$"), nil
}

func VerifyPassword(password, encodedHash string) bool {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 4 || parts[0] != passwordHashAlgorithm {
		return false
	}

	rounds, err := strconv.Atoi(parts[1])
	if err != nil || rounds < 100000 {
		return false
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil || len(salt) < passwordSaltBytes {
		return false
	}

	expected, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil || len(expected) != passwordKeyBytes {
		return false
	}

	actual := pbkdf2SHA256([]byte(password), salt, rounds, len(expected))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func pbkdf2SHA256(password, salt []byte, rounds, keyLen int) []byte {
	hashLen := sha256.Size
	numBlocks := (keyLen + hashLen - 1) / hashLen
	output := make([]byte, 0, numBlocks*hashLen)

	for block := 1; block <= numBlocks; block++ {
		mac := hmac.New(sha256.New, password)
		mac.Write(salt)

		var blockIndex [4]byte
		binary.BigEndian.PutUint32(blockIndex[:], uint32(block))
		mac.Write(blockIndex[:])

		u := mac.Sum(nil)
		t := make([]byte, len(u))
		copy(t, u)

		for i := 1; i < rounds; i++ {
			mac = hmac.New(sha256.New, password)
			mac.Write(u)
			u = mac.Sum(nil)
			for j := range t {
				t[j] ^= u[j]
			}
		}

		output = append(output, t...)
	}

	return output[:keyLen]
}
