package auth

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const firebaseCertURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

type firebaseUIDContextKey struct{}

type firebaseCertCache struct {
	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	expiresAt time.Time
}

var firebaseCerts = &firebaseCertCache{}
var VerifyFirebaseIDTokenFunc = VerifyFirebaseIDToken

func FirebaseUIDFromRequest(r *http.Request) string {
	uid, _ := r.Context().Value(firebaseUIDContextKey{}).(string)
	return uid
}

func FirebaseAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		SetNoStoreHeaders(w)

		uid, err := VerifyFirebaseIDTokenFunc(r.Context(), bearerToken(r))
		if err != nil {
			writeAuthError(w, http.StatusUnauthorized, "firebase token tidak valid")
			return
		}

		ctx := context.WithValue(r.Context(), firebaseUIDContextKey{}, uid)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func VerifyFirebaseIDToken(ctx context.Context, tokenString string) (string, error) {
	projectID := strings.TrimSpace(os.Getenv("FIREBASE_PROJECT_ID"))
	if projectID == "" {
		return "", errors.New("FIREBASE_PROJECT_ID is not configured")
	}
	if tokenString == "" {
		return "", errors.New("missing bearer token")
	}

	claims := &jwt.RegisteredClaims{}
	parser := jwt.NewParser(
		jwt.WithAudience(projectID),
		jwt.WithIssuer("https://securetoken.google.com/"+projectID),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(2*time.Minute),
	)

	token, err := parser.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %s", token.Method.Alg())
		}

		kid, _ := token.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("missing token kid")
		}

		return firebasePublicKey(ctx, kid)
	})
	if err != nil || token == nil || !token.Valid {
		return "", errors.New("invalid firebase token")
	}
	if claims.Subject == "" || len(claims.Subject) > 128 {
		return "", errors.New("invalid firebase uid")
	}

	return claims.Subject, nil
}

func bearerToken(r *http.Request) string {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if authHeader == "" {
		return ""
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func firebasePublicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	firebaseCerts.mu.RLock()
	if key, ok := firebaseCerts.keys[kid]; ok && time.Now().Before(firebaseCerts.expiresAt) {
		firebaseCerts.mu.RUnlock()
		return key, nil
	}
	firebaseCerts.mu.RUnlock()

	if err := refreshFirebaseCerts(ctx); err != nil {
		return nil, err
	}

	firebaseCerts.mu.RLock()
	defer firebaseCerts.mu.RUnlock()
	key, ok := firebaseCerts.keys[kid]
	if !ok {
		return nil, errors.New("firebase public key not found")
	}
	return key, nil
}

func refreshFirebaseCerts(ctx context.Context) error {
	firebaseCerts.mu.Lock()
	defer firebaseCerts.mu.Unlock()

	if time.Now().Before(firebaseCerts.expiresAt) && len(firebaseCerts.keys) > 0 {
		return nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, firebaseCertURL, nil)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("firebase cert endpoint returned %d", resp.StatusCode)
	}

	var certPEMs map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&certPEMs); err != nil {
		return err
	}

	keys := make(map[string]*rsa.PublicKey, len(certPEMs))
	for kid, certPEM := range certPEMs {
		block, _ := pem.Decode([]byte(certPEM))
		if block == nil {
			continue
		}

		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			continue
		}

		publicKey, ok := cert.PublicKey.(*rsa.PublicKey)
		if !ok {
			continue
		}
		keys[kid] = publicKey
	}
	if len(keys) == 0 {
		return errors.New("no firebase public keys parsed")
	}

	firebaseCerts.keys = keys
	firebaseCerts.expiresAt = time.Now().Add(firebaseCertMaxAge(resp.Header.Get("Cache-Control")))
	return nil
}

func firebaseCertMaxAge(cacheControl string) time.Duration {
	for _, part := range strings.Split(cacheControl, ",") {
		part = strings.TrimSpace(part)
		if !strings.HasPrefix(part, "max-age=") {
			continue
		}

		seconds, err := strconv.Atoi(strings.TrimPrefix(part, "max-age="))
		if err == nil && seconds > 0 {
			return time.Duration(seconds) * time.Second
		}
	}
	return time.Hour
}

func writeAuthError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": message})
}
