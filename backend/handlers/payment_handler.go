package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"backend/database" // Pastikan ini adalah package database Anda
)

// Definisikan struct sesuai data yang DIKIRIM dari checkout.js
type CustomerPayload struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	Address     string `json:"address"`
	City        string `json:"city"`
	PostalCode  string `json:"postalCode"`
	Destination string `json:"destination"`
}

type ShippingInfo struct {
	Cost        int     `json:"cost"`
	Destination string  `json:"destination"`
	Weight      float64 `json:"weight"`
}

type PriceBreakdown struct {
	Frame int `json:"frame"`
	Mat   int `json:"mat"`
	Glass int `json:"glass"`
	Total int `json:"total"`
}

type OrderPayload struct {
	FrameModelName string         `json:"frameModelName"`
	ArtworkWidth   float64        `json:"artworkWidth"`
	ArtworkHeight  float64        `json:"artworkHeight"`
	ArtworkImageUrl string         `json:"artworkImageUrl"`
	MatWidth       int            `json:"matWidth"`
	HasGlass       bool           `json:"hasGlass"`
	PriceBreakdown PriceBreakdown `json:"priceBreakdown"`
	Shipping       ShippingInfo   `json:"shipping"`
	Customer       CustomerPayload `json:"customer"`
}

type FlipCreateBillResp struct {
	LinkURL string `json:"link_url"`
}

func CreatePaymentHandler(w http.ResponseWriter, r *http.Request) {
	var order OrderPayload
	if err := json.NewDecoder(r.Body).Decode(&order); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 1. Simpan pesanan ke database DULU dengan status PENDING
	orderUID := fmt.Sprintf("citraframe-%d", time.Now().UnixNano())
	subtotal := order.PriceBreakdown.Total - order.Shipping.Cost
	fullAddress := fmt.Sprintf("%s, %s, %s", order.Customer.Address, order.Customer.City, order.Customer.Destination)

	tx, err := database.DB.Begin()
	if err != nil {
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}

	// Insert into orders table
	res, err := tx.Exec(`
		INSERT INTO orders (order_uid, customer_name, customer_email, customer_phone, shipping_address, subtotal, shipping_cost, total_amount, payment_status, order_status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING')
	`, orderUID, order.Customer.Name, order.Customer.Email, order.Customer.Phone, fullAddress, subtotal, order.Shipping.Cost, order.PriceBreakdown.Total)
	if err != nil {
		tx.Rollback()
		log.Printf("Error inserting order: %v", err)
		http.Error(w, "Failed to save order", http.StatusInternalServerError)
		return
	}

	orderID, _ := res.LastInsertId()
	itemDescription := fmt.Sprintf("%.1f x %.1f cm, Mat: %dcm, Glass: %v", order.ArtworkWidth, order.ArtworkHeight, order.MatWidth, order.HasGlass)

	// Insert into order_items table
	_, err = tx.Exec(`
		INSERT INTO order_items (order_id, item_name, description, price, quantity)
		VALUES (?, ?, ?, ?, 1)
	`, orderID, order.FrameModelName, itemDescription, subtotal)
	if err != nil {
		tx.Rollback()
		log.Printf("Error inserting order item: %v", err)
		http.Error(w, "Failed to save order item", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		http.Error(w, "Failed to finalize order", http.StatusInternalServerError)
		return
	}

	// 2. Jika berhasil disimpan, buat link pembayaran di Flip
	createFlipPaymentLink(w, r, order, orderUID)
}

func createFlipPaymentLink(w http.ResponseWriter, r *http.Request, order OrderPayload, orderUID string) {
	secret := os.Getenv("FLIP_SECRET_KEY")
	if secret == "" {
		http.Error(w, "Flip secret key not configured", http.StatusInternalServerError)
		return
	}
	baseURL := "https://bigflip.id/big_sandbox_api/v2" // Ganti ke live jika sudah siap
	endpoint := baseURL + "/pwf/bill"

	payload := map[string]any{
		"title":        fmt.Sprintf("Pesanan CitraFrame #%s", orderUID),
		"type":         "SINGLE",
		"amount":       order.PriceBreakdown.Total,
		"bill_key":     orderUID, // KIRIM ID UNIK KITA KE FLIP
		"redirect_url": os.Getenv("FLIP_REDIRECT_URL"), // e.g., https://citraframe.com/thank-you
		"expired_date": time.Now().Add(24 * time.Hour).Format("2006-01-02 15:04"),
		"name":         order.Customer.Name,
		"email":        order.Customer.Email,
		"phone":        order.Customer.Phone,
	}

	bodyBytes, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", endpoint, bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(secret+":")))
	req.Header.Set("idempotency-key", orderUID) // Gunakan ID unik kita untuk idempotency

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		http.Error(w, "Failed to contact Flip API", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		log.Printf("Flip API Error: %d -> %s", resp.StatusCode, string(respBody))
		http.Error(w, "Failed to create Flip billing", http.StatusInternalServerError)
		return
	}

	var out FlipCreateBillResp
	json.Unmarshal(respBody, &out)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"paymentUrl": out.LinkURL})
}
