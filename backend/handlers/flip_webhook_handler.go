// backend/handlers/flip_webhook.go
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"backend/database"
)

type flipBillEvent struct {
	Event string `json:"event"`
	Bill  struct {
		LinkID  string `json:"link_id"`
		BillKey string `json:"bill_key"`
		Status  string `json:"status"`
		Amount  int    `json:"amount"`
		Title   string `json:"title"`
	} `json:"bill"`
}

func verifyFlipToken(r *http.Request) bool {
	secret := os.Getenv("FLIP_WEBHOOK_SECRET")
	if secret == "" {
		log.Println("WARN: FLIP_WEBHOOK_SECRET is empty")
		return false
	}

	// Flip Accept Payment webhook sends token in form data
	token := r.FormValue("token")
	if token == "" {
		// Fallback to headers
		token = r.Header.Get("X-Callback-Token")
		if token == "" {
			token = r.Header.Get("x-callback-token")
		}
	}
	return token != "" && token == secret
}

func FlipWebhookHandler(w http.ResponseWriter, r *http.Request) {
	// Parse form data because Flip sends application/x-www-form-urlencoded
	if err := r.ParseForm(); err != nil {
		log.Printf("Flip webhook error parsing form: %v", err)
		http.Error(w, "cannot parse form", http.StatusBadRequest)
		return
	}

	// Verifikasi token
	if !verifyFlipToken(r) {
		log.Printf("Flip webhook rejected: bad token, headers=%v form=%v", r.Header, r.Form)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	dataJSON := r.FormValue("data")
	if dataJSON == "" {
		log.Printf("Flip webhook empty data")
		http.Error(w, "empty data", http.StatusBadRequest)
		return
	}

	var payload map[string]interface{}
	decoder := json.NewDecoder(strings.NewReader(dataJSON))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		log.Printf("Flip webhook bad json in data: %v", err)
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}

	statusStr, _ := payload["status"].(string)
	status := strings.ToUpper(strings.TrimSpace(statusStr))

	targetStatus := orderStatusFromFlipPaymentStatus(status)
	if targetStatus == "" {
		targetStatus = "PENDING"
	}

	// Flip Accept Payment sends bill_title which we set as "Citra Artframe Order #123".
	// Prefix lama "CitraFrame Order #" tetap diterima untuk pesanan yang
	// dibuat sebelum rebranding dan belum selesai dibayar.
	billTitle, _ := payload["bill_title"].(string)
	var orderID string
	if strings.HasPrefix(billTitle, "Citra Artframe Order #") {
		orderID = strings.TrimPrefix(billTitle, "Citra Artframe Order #")
	} else if strings.HasPrefix(billTitle, "CitraFrame Order #") {
		orderID = strings.TrimPrefix(billTitle, "CitraFrame Order #")
	}

	if orderID != "" {
		_, err := database.DB.Exec("UPDATE orders SET order_status = ? WHERE id = ?", targetStatus, orderID)
		if err != nil {
			log.Printf("Flip webhook: update error: %v", err)
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
	} else {
		log.Printf("Flip webhook: could not extract order ID from payload: %v", payload)
		// Try to fallback to flip_link_id if possible
		if linkIDStr := stringFromAny(payload["bill_link_id"]); linkIDStr != "" {
			database.DB.Exec("UPDATE orders SET order_status = ? WHERE flip_link_id = ?", targetStatus, linkIDStr)
		} else {
			http.Error(w, "bad payload", http.StatusBadRequest)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"ok":true}`))
}
