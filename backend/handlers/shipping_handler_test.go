package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"backend/models"
)

func setupShippingProviderTest(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(handler)
	previousClient := apiCoIDClient
	apiCoIDClient = server.Client()
	t.Setenv("API_CO_ID_KEY", "test-key")
	t.Setenv("API_CO_ID_BASE_URL", server.URL)
	t.Setenv("STORE_ORIGIN_VILLAGE_CODE", "3171010001")

	shippingQuoteCache.Lock()
	shippingQuoteCache.entries = make(map[string]shippingCacheEntry)
	shippingQuoteCache.Unlock()

	t.Cleanup(func() {
		server.Close()
		apiCoIDClient = previousClient
		shippingQuoteCache.Lock()
		shippingQuoteCache.entries = make(map[string]shippingCacheEntry)
		shippingQuoteCache.Unlock()
	})
	return server
}

func shippingRequest(destination string, weight float64) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/shipping/cost?destination_village_code=%s&weight=%.2f", destination, weight), nil)
	rr := httptest.NewRecorder()
	GetShippingCostHandler(rr, req)
	return rr
}

func TestShippingCostCachesProviderResponseAndPaymentReusesQuote(t *testing.T) {
	providerCalls := 0
	setupShippingProviderTest(t, func(w http.ResponseWriter, r *http.Request) {
		providerCalls++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"couriers":[{"courier_code":"JNE","courier_name":"JNE","service_type":"REG","price":18000,"etd":"2-3"}]}}`))
	})

	first := shippingRequest("3172010002", 1.65)
	if first.Code != http.StatusOK {
		t.Fatalf("expected first shipping request 200, got %d: %s", first.Code, first.Body.String())
	}
	if got := first.Header().Get("X-Shipping-Cache"); got != "MISS" {
		t.Fatalf("expected cache MISS, got %q", got)
	}

	second := shippingRequest("3172010002", 1.65)
	if second.Code != http.StatusOK || second.Header().Get("X-Shipping-Cache") != "HIT" {
		t.Fatalf("expected cached shipping response, got %d cache=%q", second.Code, second.Header().Get("X-Shipping-Cache"))
	}

	quote, err := resolveShippingQuoteFromAPICoID(context.Background(), models.CreateOrderRequest{
		VillageCode: "3172010002",
		CourierCode: "JNE",
		CourierName: "JNE - REG",
	}, 1.65)
	if err != nil {
		t.Fatalf("payment verification should reuse cached quote: %v", err)
	}
	if quote.Price != 18000 || providerCalls != 1 {
		t.Fatalf("expected cached price and one provider call, quote=%+v calls=%d", quote, providerCalls)
	}
}

func TestShippingCostOnlyReturnsJNEJNTAndLionParcel(t *testing.T) {
	setupShippingProviderTest(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"couriers":[
			{"courier_code":"JNE","courier_name":"JNE","service_type":"REG","price":18000},
			{"courier_code":"JNT","courier_name":"J&T Express","service_type":"EZ","price":17000},
			{"courier_code":"LION","courier_name":"Lion Parcel","service_type":"REGPACK","price":16000},
			{"courier_code":"SICEPAT","courier_name":"SiCepat","service_type":"REG","price":15000},
			{"courier_code":"POS","courier_name":"Pos Indonesia","service_type":"REG","price":14000}
		]}}`))
	})

	rr := shippingRequest("3172010005", 1)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var payload struct {
		Data struct {
			Couriers []shippingQuote `json:"couriers"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Data.Couriers) != 3 {
		t.Fatalf("expected only three allowed courier quotes, got %+v", payload.Data.Couriers)
	}
	for _, quote := range payload.Data.Couriers {
		if !isAllowedShippingCourier(quote.CourierCode, quote.CourierName) {
			t.Fatalf("unsupported courier leaked into response: %+v", quote)
		}
	}
}

func TestShippingCostTranslatesProviderRateLimit(t *testing.T) {
	setupShippingProviderTest(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "45")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"message":"too many requests"}`))
	})
	t.Setenv("APP_ENV", "production")
	t.Setenv("SHIPPING_FALLBACK_ENABLED", "false")

	rr := shippingRequest("3173010003", 1.65)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", rr.Code, rr.Body.String())
	}
	if rr.Header().Get("Retry-After") != "45" {
		t.Fatalf("expected Retry-After=45, got %q", rr.Header().Get("Retry-After"))
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["code"] != "SHIPPING_RATE_LIMITED" {
		t.Fatalf("unexpected error payload: %#v", payload)
	}
}

func TestShippingCostUsesEstimatedFallbackInDevelopment(t *testing.T) {
	providerCalls := 0
	setupShippingProviderTest(t, func(w http.ResponseWriter, r *http.Request) {
		providerCalls++
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"quota_exceeded"}`))
	})
	t.Setenv("APP_ENV", "development")
	t.Setenv("SHIPPING_FALLBACK_ENABLED", "")

	first := shippingRequest("3174051001", 1.65)
	if first.Code != http.StatusOK {
		t.Fatalf("expected development fallback 200, got %d: %s", first.Code, first.Body.String())
	}
	if got := first.Header().Get("X-Shipping-Cache"); got != "FALLBACK" {
		t.Fatalf("expected FALLBACK source, got %q", got)
	}

	var payload struct {
		Data struct {
			Couriers []shippingQuote `json:"couriers"`
		} `json:"data"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Data.Couriers) != 3 || !payload.Data.Couriers[0].IsEstimate {
		t.Fatalf("expected three estimated couriers, got %+v", payload.Data.Couriers)
	}
	for _, quote := range payload.Data.Couriers {
		if !isAllowedShippingCourier(quote.CourierCode, quote.CourierName) {
			t.Fatalf("fallback returned unsupported courier: %+v", quote)
		}
	}

	second := shippingRequest("3174051001", 1.65)
	if second.Code != http.StatusOK || providerCalls != 1 {
		t.Fatalf("expected fallback to be cached, status=%d providerCalls=%d", second.Code, providerCalls)
	}
}

func TestShippingCostUsesStaleQuoteDuringProviderRateLimit(t *testing.T) {
	rateLimited := false
	setupShippingProviderTest(t, func(w http.ResponseWriter, r *http.Request) {
		if rateLimited {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`{"data":{"couriers":[{"courier_code":"JNE","courier_name":"JNE REG","price":21000,"estimation":"2 hari"}]}}`))
	})

	if rr := shippingRequest("3174010004", 2); rr.Code != http.StatusOK {
		t.Fatalf("expected initial 200, got %d", rr.Code)
	}

	key := "3171010001:3174010004:2.00"
	shippingQuoteCache.Lock()
	entry := shippingQuoteCache.entries[key]
	entry.createdAt = time.Now().Add(-shippingCacheFreshTTL - time.Minute)
	shippingQuoteCache.entries[key] = entry
	shippingQuoteCache.Unlock()
	rateLimited = true

	rr := shippingRequest("3174010004", 2)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected stale quote 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Shipping-Cache"); got != "STALE" {
		t.Fatalf("expected STALE cache, got %q", got)
	}
}
