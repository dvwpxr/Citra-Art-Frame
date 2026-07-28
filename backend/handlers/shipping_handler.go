package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	shippingCacheFreshTTL = 15 * time.Minute
	shippingCacheStaleTTL = 24 * time.Hour
)

type shippingCacheEntry struct {
	quotes    []shippingQuote
	createdAt time.Time
}

type shippingServiceError struct {
	status     int
	code       string
	message    string
	retryAfter int
}

func (e shippingServiceError) Error() string {
	return e.message
}

var shippingQuoteCache = struct {
	sync.RWMutex
	entries map[string]shippingCacheEntry
}{entries: make(map[string]shippingCacheEntry)}

// API.co.id membatasi jumlah request. Serialisasi request cache-miss mencegah
// beberapa checkout meminta tarif yang sama secara bersamaan.
var shippingProviderMu sync.Mutex

// GetShippingCostHandler — GET /api/shipping/cost?destination_village_code=XX&weight=1
func GetShippingCostHandler(w http.ResponseWriter, r *http.Request) {
	destCode := strings.TrimSpace(r.URL.Query().Get("destination_village_code"))
	weightStr := strings.TrimSpace(r.URL.Query().Get("weight"))

	if destCode == "" {
		writeShippingError(w, shippingServiceError{
			status:  http.StatusBadRequest,
			code:    "DESTINATION_REQUIRED",
			message: "destination_village_code wajib diisi",
		})
		return
	}

	weight := 1.0
	if weightStr != "" {
		if parsedWeight, err := strconv.ParseFloat(weightStr, 64); err == nil && parsedWeight > 0 {
			weight = parsedWeight
		}
	}

	quotes, cacheState, err := loadShippingQuotes(r.Context(), destCode, weight)
	if err != nil {
		if serviceErr, ok := err.(shippingServiceError); ok {
			writeShippingError(w, serviceErr)
			return
		}
		writeShippingError(w, shippingServiceError{
			status:  http.StatusBadGateway,
			code:    "SHIPPING_UNAVAILABLE",
			message: "Gagal memuat opsi pengiriman",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Set("X-Shipping-Cache", cacheState)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"couriers": quotes,
		},
		"cache": strings.ToLower(cacheState),
	})
}

func loadShippingQuotes(ctx context.Context, destinationCode string, weight float64) ([]shippingQuote, string, error) {
	originCode := strings.TrimSpace(os.Getenv("STORE_ORIGIN_VILLAGE_CODE"))
	if originCode == "" {
		return nil, "MISS", shippingServiceError{
			status:  http.StatusInternalServerError,
			code:    "SHIPPING_CONFIG_MISSING",
			message: "Kode asal toko belum dikonfigurasi di server",
		}
	}

	key := fmt.Sprintf("%s:%s:%.2f", originCode, strings.TrimSpace(destinationCode), weight)
	if quotes, ok := getCachedShippingQuotes(key, shippingCacheFreshTTL); ok {
		return quotes, "HIT", nil
	}

	shippingProviderMu.Lock()
	defer shippingProviderMu.Unlock()

	// Request lain mungkin sudah mengisi cache saat goroutine ini menunggu.
	if quotes, ok := getCachedShippingQuotes(key, shippingCacheFreshTTL); ok {
		return quotes, "HIT", nil
	}

	quotes, err := fetchShippingQuotesFromProvider(ctx, originCode, destinationCode, weight)
	if err == nil {
		setCachedShippingQuotes(key, quotes)
		return cloneShippingQuotes(quotes), "MISS", nil
	}

	// Jika provider sementara sibuk/error, tarif terakhir yang pernah berhasil
	// masih lebih aman daripada membuat request berulang atau mengarang harga.
	if staleQuotes, ok := getCachedShippingQuotes(key, shippingCacheStaleTTL); ok {
		return staleQuotes, "STALE", nil
	}

	if shippingFallbackEnabled() && shippingErrorAllowsFallback(err) {
		fallbackQuotes := buildFallbackShippingQuotes(originCode, destinationCode, weight)
		setCachedShippingQuotes(key, fallbackQuotes)
		return cloneShippingQuotes(fallbackQuotes), "FALLBACK", nil
	}

	return nil, "MISS", err
}

func shippingFallbackEnabled() bool {
	if configured := strings.TrimSpace(os.Getenv("SHIPPING_FALLBACK_ENABLED")); configured != "" {
		enabled, err := strconv.ParseBool(configured)
		return err == nil && enabled
	}

	environment := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	return environment == "development" || environment == "local" || environment == "test"
}

func shippingErrorAllowsFallback(err error) bool {
	serviceErr, ok := err.(shippingServiceError)
	if !ok {
		return false
	}
	switch serviceErr.code {
	case "SHIPPING_RATE_LIMITED", "SHIPPING_UNAVAILABLE", "SHIPPING_PROVIDER_ERROR", "SHIPPING_OPTIONS_EMPTY":
		return true
	default:
		return false
	}
}

func buildFallbackShippingQuotes(originCode, destinationCode string, weight float64) []shippingQuote {
	chargeableWeight := math.Max(1, math.Ceil(weight))
	zoneMultiplier := 1.25
	if regionalPrefix(originCode) != "" && regionalPrefix(originCode) == regionalPrefix(destinationCode) {
		zoneMultiplier = 1
	}

	price := func(base, perAdditionalKg int) int {
		raw := (float64(base) + (chargeableWeight-1)*float64(perAdditionalKg)) * zoneMultiplier
		return int(math.Ceil(raw/500) * 500)
	}

	return []shippingQuote{
		{
			CourierCode: "JNE_REG",
			CourierName: "JNE Regular",
			Price:       price(10000, 5000),
			Estimation:  "2-4",
			IsEstimate:  true,
		},
		{
			CourierCode: "JNT_REG",
			CourierName: "J&T Regular",
			Price:       price(9500, 4500),
			Estimation:  "2-4",
			IsEstimate:  true,
		},
		{
			CourierCode: "LION_REGPACK",
			CourierName: "Lion Parcel REGPACK",
			Price:       price(9000, 4000),
			Estimation:  "2-5",
			IsEstimate:  true,
		},
	}
}

func normalizeCourierIdentifier(value string) string {
	var normalized strings.Builder
	for _, char := range strings.ToLower(strings.TrimSpace(value)) {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			normalized.WriteRune(char)
		}
	}
	return normalized.String()
}

func isAllowedShippingCourier(code, name string) bool {
	for _, identity := range []string{normalizeCourierIdentifier(code), normalizeCourierIdentifier(name)} {
		if strings.HasPrefix(identity, "jne") ||
			strings.HasPrefix(identity, "jnt") ||
			strings.HasPrefix(identity, "jtexpress") ||
			strings.HasPrefix(identity, "lionparcel") ||
			identity == "lion" ||
			strings.HasPrefix(identity, "lionreg") {
			return true
		}
	}
	return false
}

func filterAllowedShippingQuotes(quotes []shippingQuote) []shippingQuote {
	allowed := make([]shippingQuote, 0, len(quotes))
	for _, quote := range quotes {
		if isAllowedShippingCourier(quote.CourierCode, quote.CourierName) {
			allowed = append(allowed, quote)
		}
	}
	return allowed
}

func regionalPrefix(code string) string {
	code = strings.TrimSpace(code)
	if len(code) < 2 {
		return ""
	}
	return code[:2]
}

func fetchShippingQuotesFromProvider(ctx context.Context, originCode, destinationCode string, weight float64) ([]shippingQuote, error) {
	apiKey := strings.TrimSpace(os.Getenv("API_CO_ID_KEY"))
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("API_CO_ID_BASE_URL")), "/")
	if apiKey == "" || baseURL == "" {
		return nil, shippingServiceError{
			status:  http.StatusInternalServerError,
			code:    "SHIPPING_CONFIG_MISSING",
			message: "API.co.id tidak dikonfigurasi di server",
		}
	}

	query := url.Values{}
	query.Set("origin_village_code", strings.TrimSpace(originCode))
	query.Set("destination_village_code", strings.TrimSpace(destinationCode))
	query.Set("weight", fmt.Sprintf("%.2f", weight))
	endpoint := baseURL + "/expedition/shipping-cost?" + query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, shippingServiceError{
			status:  http.StatusInternalServerError,
			code:    "SHIPPING_REQUEST_INVALID",
			message: "Gagal membuat request ongkir",
		}
	}
	req.Header.Set("x-api-co-id", apiKey)

	resp, err := apiCoIDClient.Do(req)
	if err != nil {
		return nil, shippingServiceError{
			status:     http.StatusServiceUnavailable,
			code:       "SHIPPING_UNAVAILABLE",
			message:    "Layanan ongkir sedang tidak dapat dihubungi. Silakan coba lagi.",
			retryAfter: 15,
		}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, shippingServiceError{
			status:  http.StatusBadGateway,
			code:    "SHIPPING_RESPONSE_INVALID",
			message: "Gagal membaca respons layanan ongkir",
		}
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, shippingServiceError{
			status:     http.StatusServiceUnavailable,
			code:       "SHIPPING_RATE_LIMITED",
			message:    "Layanan ongkir sedang membatasi permintaan. Tunggu sebentar lalu coba lagi.",
			retryAfter: retryAfterSeconds(resp.Header.Get("Retry-After")),
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, shippingServiceError{
			status:     http.StatusBadGateway,
			code:       "SHIPPING_PROVIDER_ERROR",
			message:    "Layanan ongkir menolak permintaan. Silakan coba lagi.",
			retryAfter: 15,
		}
	}

	var payload interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, shippingServiceError{
			status:  http.StatusBadGateway,
			code:    "SHIPPING_RESPONSE_INVALID",
			message: "Respons layanan ongkir tidak valid",
		}
	}

	quotes := filterAllowedShippingQuotes(extractShippingQuotes(payload))
	if len(quotes) == 0 {
		return nil, shippingServiceError{
			status:  http.StatusBadGateway,
			code:    "SHIPPING_OPTIONS_EMPTY",
			message: "JNE, J&T, dan Lion Parcel tidak tersedia untuk alamat ini",
		}
	}
	return quotes, nil
}

func getCachedShippingQuotes(key string, maxAge time.Duration) ([]shippingQuote, bool) {
	shippingQuoteCache.RLock()
	entry, ok := shippingQuoteCache.entries[key]
	shippingQuoteCache.RUnlock()
	if !ok || time.Since(entry.createdAt) > maxAge {
		return nil, false
	}
	quotes := filterAllowedShippingQuotes(entry.quotes)
	if len(quotes) == 0 {
		return nil, false
	}
	return cloneShippingQuotes(quotes), true
}

func setCachedShippingQuotes(key string, quotes []shippingQuote) {
	quotes = filterAllowedShippingQuotes(quotes)
	if len(quotes) == 0 {
		return
	}
	shippingQuoteCache.Lock()
	defer shippingQuoteCache.Unlock()

	if len(shippingQuoteCache.entries) >= 512 {
		cutoff := time.Now().Add(-shippingCacheStaleTTL)
		for cacheKey, entry := range shippingQuoteCache.entries {
			if entry.createdAt.Before(cutoff) {
				delete(shippingQuoteCache.entries, cacheKey)
			}
		}
	}
	shippingQuoteCache.entries[key] = shippingCacheEntry{
		quotes:    cloneShippingQuotes(quotes),
		createdAt: time.Now(),
	}
}

func cloneShippingQuotes(quotes []shippingQuote) []shippingQuote {
	return append([]shippingQuote(nil), quotes...)
}

func retryAfterSeconds(value string) int {
	seconds, err := strconv.Atoi(strings.TrimSpace(value))
	if err == nil && seconds > 0 && seconds <= 300 {
		return seconds
	}
	return 30
}

func writeShippingError(w http.ResponseWriter, serviceErr shippingServiceError) {
	w.Header().Set("Content-Type", "application/json")
	if serviceErr.retryAfter > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(serviceErr.retryAfter))
	}
	w.WriteHeader(serviceErr.status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"error":       serviceErr.message,
		"code":        serviceErr.code,
		"retry_after": serviceErr.retryAfter,
	})
}
