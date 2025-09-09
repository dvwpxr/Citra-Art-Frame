package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"

	"backend/database"
)

// Struct untuk menangkap data dari webhook Flip
type FlipWebhookPayload struct {
	Data struct {
		BillKey string `json:"bill_key"` // ID Unik yang kita kirim
		Status  string `json:"status"`
	} `json:"data"`
}

func FlipWebhookHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Verifikasi Tanda Tangan (SANGAT PENTING UNTUK KEAMANAN)
	webhookSecret := os.Getenv("FLIP_WEBHOOK_SECRET")
	flipSignature := r.Header.Get("x-flip-signature")

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Cannot read body", http.StatusBadRequest)
		return
	}

	mac := hmac.New(sha256.New, []byte(webhookSecret))
	mac.Write(bodyBytes)
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(flipSignature), []byte(expectedSignature)) {
		log.Println("Invalid Flip webhook signature")
		http.Error(w, "Invalid signature", http.StatusForbidden)
		return
	}

	// 2. Proses data webhook
	var payload FlipWebhookPayload
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		http.Error(w, "Invalid webhook payload", http.StatusBadRequest)
		return
	}

	log.Printf("Received Flip webhook for Order UID %s with status %s", payload.Data.BillKey, payload.Data.Status)

	// 3. Update status pesanan di database
	if payload.Data.Status == "SUCCESSFUL" {
		_, err := database.DB.Exec(`
			UPDATE orders SET payment_status = 'PAID', order_status = 'PROCESSING'
			WHERE order_uid = ? AND payment_status = 'PENDING'
		`, payload.Data.BillKey)

		if err != nil {
			log.Printf("Failed to update order status for UID %s: %v", payload.Data.BillKey, err)
			// Kirim status error agar Flip bisa mencoba lagi (jika dikonfigurasi)
			http.Error(w, "Failed to update database", http.StatusInternalServerError)
			return
		}
		log.Printf("Order UID %s successfully updated to PAID/PROCESSING.", payload.Data.BillKey)
	}

	// 4. Kirim balasan OK ke Flip
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Webhook received successfully"))
}
