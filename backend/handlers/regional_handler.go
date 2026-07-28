package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

var apiCoIDClient = &http.Client{Timeout: 15 * time.Second}

func proxyAPICoID(w http.ResponseWriter, endpoint string) {
	apiKey := os.Getenv("API_CO_ID_KEY")
	baseURL := os.Getenv("API_CO_ID_BASE_URL")
	if apiKey == "" || baseURL == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "API.co.id tidak dikonfigurasi di server"})
		return
	}

	url := baseURL + endpoint
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Gagal membuat request"})
		return
	}
	req.Header.Set("x-api-co-id", apiKey)

	resp, err := apiCoIDClient.Do(req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": "Gagal menghubungi layanan wilayah"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Gagal membaca response"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}

// GetProvincesHandler — GET /api/regional/provinces
func GetProvincesHandler(w http.ResponseWriter, r *http.Request) {
	proxyAPICoID(w, "/regional/indonesia/provinces")
}

// GetRegenciesHandler — GET /api/regional/regencies?province_code=XX
func GetRegenciesHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("province_code")
	if code == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "province_code wajib diisi"})
		return
	}
	proxyAPICoID(w, fmt.Sprintf("/regional/indonesia/regencies?province_code=%s", code))
}

// GetDistrictsHandler — GET /api/regional/districts?regency_code=XX
func GetDistrictsHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("regency_code")
	if code == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "regency_code wajib diisi"})
		return
	}
	proxyAPICoID(w, fmt.Sprintf("/regional/indonesia/districts?regency_code=%s", code))
}

// GetVillagesHandler — GET /api/regional/villages?district_code=XX
func GetVillagesHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("district_code")
	if code == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "district_code wajib diisi"})
		return
	}
	proxyAPICoID(w, fmt.Sprintf("/regional/indonesia/villages?district_code=%s", code))
}
