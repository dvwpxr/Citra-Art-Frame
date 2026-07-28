package handlers

import (
	"backend/auth"
	"backend/database"
	"backend/models"
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	orderStatusPendingPayment  = "pending_payment"
	orderStatusAwaitingPayment = "awaiting_payment"
	orderStatusPaymentFailed   = "payment_failed"
)

type checkoutError struct {
	status  int
	message string
}

func (e checkoutError) Error() string {
	return e.message
}

type shippingQuote struct {
	CourierCode string `json:"courier_code"`
	CourierName string `json:"courier_name"`
	Price       int    `json:"price"`
	Estimation  string `json:"estimation"`
	IsEstimate  bool   `json:"is_estimate,omitempty"`
}

type flipPaymentRequest struct {
	OrderID         int64
	OrderUID        string
	Amount          int
	ExpiresAt       time.Time
	CustomerName    string
	CustomerEmail   string
	CustomerPhone   string
	CustomerAddress string
	SenderBank      string
	SenderBankType  string
}

type flipPaymentResponse struct {
	LinkID  string
	LinkURL string
}

type pricedOrderItem struct {
	ProductID int
	Name      string
	Category  string
	UnitPrice int
	Quantity  int
	Details   map[string]interface{}
}

type stockReservation struct {
	source    string
	productID int
	quantity  int
}

type flipPaymentMethod struct {
	Code           string
	Label          string
	SenderBank     string
	SenderBankType string
}

var resolveShippingQuoteFunc = resolveShippingQuoteFromAPICoID
var createFlipPaymentFunc = createFlipPaymentWithHTTP
var fetchFlipPaymentStatusFunc = fetchFlipPaymentStatusWithHTTP
var flipHTTPClient = &http.Client{Timeout: 20 * time.Second}

var flipPaymentMethods = map[string]flipPaymentMethod{
	"mandiri_va": {Code: "mandiri_va", Label: "Mandiri Virtual Account", SenderBank: "mandiri", SenderBankType: "virtual_account"},
	"bni_va":     {Code: "bni_va", Label: "BNI Virtual Account", SenderBank: "bni", SenderBankType: "virtual_account"},
	"bri_va":     {Code: "bri_va", Label: "BRI Virtual Account", SenderBank: "bri", SenderBankType: "virtual_account"},
	"bca_va":     {Code: "bca_va", Label: "BCA Virtual Account", SenderBank: "bca", SenderBankType: "virtual_account"},
	"permata_va": {Code: "permata_va", Label: "Permata Virtual Account", SenderBank: "permata", SenderBankType: "virtual_account"},
	"cimb_va":    {Code: "cimb_va", Label: "CIMB Virtual Account", SenderBank: "cimb", SenderBankType: "virtual_account"},
	"qris":       {Code: "qris", Label: "QRIS", SenderBank: "qris", SenderBankType: "wallet_account"},
	"ovo":        {Code: "ovo", Label: "OVO", SenderBank: "ovo", SenderBankType: "wallet_account"},
}

func CreatePaymentHandler(w http.ResponseWriter, r *http.Request) {
	var req models.CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding request body: %v", err)
		writeJSONError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.FirebaseUID = auth.FirebaseUIDFromRequest(r)
	if req.FirebaseUID == "" {
		writeJSONError(w, http.StatusUnauthorized, "Firebase token is required")
		return
	}

	if err := validateCheckoutRequest(req); err != nil {
		writeCheckoutError(w, err)
		return
	}
	paymentMethod, err := resolveFlipPaymentMethod(req.PaymentMethod)
	if err != nil {
		writeCheckoutError(w, err)
		return
	}

	weight := calculateCheckoutWeight(req.Items)
	quote, err := resolveShippingQuoteFunc(r.Context(), req, weight)
	if err != nil {
		writeCheckoutError(w, err)
		return
	}
	if quote.Price <= 0 {
		writeJSONError(w, http.StatusBadRequest, "Ongkir tidak valid")
		return
	}
	if !isAllowedShippingCourier(quote.CourierCode, quote.CourierName) {
		writeJSONError(w, http.StatusBadRequest, "Ekspedisi hanya tersedia melalui JNE, J&T, atau Lion Parcel")
		return
	}

	orderUID := uuid.New().String()[:12]
	shippingAddr := buildShippingAddress(req)

	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database transaction error")
		return
	}
	defer tx.Rollback()

	pricedItems, reservations, subtotal, err := priceAndReserveItems(tx, req.Items)
	if err != nil {
		writeCheckoutError(w, err)
		return
	}

	totalAmount := subtotal + quote.Price
	orderID, err := insertPendingOrder(tx, req, orderUID, shippingAddr, quote, weight, subtotal, totalAmount)
	if err != nil {
		log.Printf("Failed to save order: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to save order")
		return
	}

	if err := insertOrderItems(tx, orderID, pricedItems); err != nil {
		log.Printf("Failed to save order items: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Gagal menyimpan order item")
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database commit error")
		return
	}

	flipResponse, err := createFlipPaymentFunc(r.Context(), flipPaymentRequest{
		OrderID:         orderID,
		OrderUID:        orderUID,
		Amount:          totalAmount,
		ExpiresAt:       time.Now().Add(24 * time.Hour),
		CustomerName:    req.CustomerName,
		CustomerEmail:   req.CustomerEmail,
		CustomerPhone:   req.CustomerPhone,
		CustomerAddress: shippingAddr,
		SenderBank:      paymentMethod.SenderBank,
		SenderBankType:  paymentMethod.SenderBankType,
	})
	if err != nil || strings.TrimSpace(flipResponse.LinkURL) == "" {
		if err == nil {
			err = errors.New("payment URL tidak diterima dari Flip")
		}
		log.Printf("Failed to create Flip payment for order %d: %v", orderID, err)
		if compErr := markPaymentFailedAndReleaseStock(orderID, reservations); compErr != nil {
			log.Printf("Payment compensation failed for order %d: %v", orderID, compErr)
		}
		writeJSONError(w, http.StatusBadGateway, "Failed to create payment link")
		return
	}

	if err := markOrderAwaitingPayment(orderID, flipResponse); err != nil {
		log.Printf("Failed to save Flip payment URL for order %d: %v", orderID, err)
		if compErr := markPaymentFailedAndReleaseStock(orderID, reservations); compErr != nil {
			log.Printf("Payment compensation failed for order %d: %v", orderID, compErr)
		}
		writeJSONError(w, http.StatusInternalServerError, "Failed to save payment link")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"paymentUrl":   flipResponse.LinkURL,
		"orderUid":     orderUID,
		"orderId":      orderID,
		"subtotal":     subtotal,
		"shippingCost": quote.Price,
		"totalAmount":  totalAmount,
	})
}

func validateCheckoutRequest(req models.CreateOrderRequest) error {
	name := strings.TrimSpace(req.CustomerName)
	if len(name) < 2 || len(name) > 100 {
		return checkoutError{status: http.StatusBadRequest, message: "Nama pelanggan wajib diisi dengan panjang 2-100 karakter"}
	}

	email := strings.TrimSpace(req.CustomerEmail)
	if email == "" || len(email) > 254 || !validEmail(email) {
		return checkoutError{status: http.StatusBadRequest, message: "Email pelanggan tidak valid"}
	}

	phone := strings.TrimSpace(req.CustomerPhone)
	if phone == "" || len(phone) > 20 || !validPhone(phone) {
		return checkoutError{status: http.StatusBadRequest, message: "Nomor telepon tidak valid"}
	}

	if strings.TrimSpace(req.FullAddress) == "" && strings.TrimSpace(req.ShippingAddress) == "" {
		return checkoutError{status: http.StatusBadRequest, message: "Alamat wajib diisi"}
	}
	if strings.TrimSpace(req.VillageCode) == "" {
		return checkoutError{status: http.StatusBadRequest, message: "village_code wajib diisi"}
	}
	if strings.TrimSpace(req.CourierCode) == "" && strings.TrimSpace(req.CourierName) == "" {
		return checkoutError{status: http.StatusBadRequest, message: "Pilihan pengiriman wajib diisi"}
	}
	if !isAllowedShippingCourier(req.CourierCode, req.CourierName) {
		return checkoutError{status: http.StatusBadRequest, message: "Ekspedisi hanya tersedia melalui JNE, J&T, atau Lion Parcel"}
	}
	if len(req.Items) == 0 {
		return checkoutError{status: http.StatusBadRequest, message: "Item pesanan tidak boleh kosong"}
	}

	for _, item := range req.Items {
		if item.Quantity <= 0 {
			return checkoutError{status: http.StatusBadRequest, message: "Jumlah item harus lebih dari nol"}
		}
		switch normalizeOrderCategory(item.Category) {
		case "art_print":
			if item.ProductID <= 0 {
				return checkoutError{status: http.StatusBadRequest, message: "Produk art print wajib dipilih"}
			}
		case "custom_frame":
			details := detailsMap(item.Details)
			if _, _, _, ok := customFrameDimensions(details); !ok {
				return checkoutError{status: http.StatusBadRequest, message: "Detail ukuran custom frame tidak valid"}
			}
		default:
			return checkoutError{status: http.StatusBadRequest, message: "Kategori item tidak valid"}
		}
	}

	return nil
}

func validEmail(email string) bool {
	re := regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	return re.MatchString(email)
}

func validPhone(phone string) bool {
	re := regexp.MustCompile(`^\+?[0-9][0-9\s-]{7,19}$`)
	return re.MatchString(phone)
}

func buildShippingAddress(req models.CreateOrderRequest) string {
	if strings.TrimSpace(req.ShippingAddress) != "" {
		return strings.TrimSpace(req.ShippingAddress)
	}

	parts := []string{req.FullAddress, req.Village, req.District, req.City, req.Province}
	var clean []string
	for _, part := range parts {
		if strings.TrimSpace(part) != "" {
			clean = append(clean, strings.TrimSpace(part))
		}
	}
	address := strings.Join(clean, ", ")
	if strings.TrimSpace(req.PostalCode) != "" {
		address += " " + strings.TrimSpace(req.PostalCode)
	}
	return address
}

func priceAndReserveItems(tx *sql.Tx, items []models.OrderItem) ([]pricedOrderItem, []stockReservation, int, error) {
	pricedItems := make([]pricedOrderItem, 0, len(items))
	reservations := make([]stockReservation, 0, len(items))
	subtotal := 0

	for _, item := range items {
		switch normalizeOrderCategory(item.Category) {
		case "art_print":
			priced, reservation, err := priceAndReserveArtPrint(tx, item)
			if err != nil {
				return nil, nil, 0, err
			}
			pricedItems = append(pricedItems, priced)
			reservations = append(reservations, reservation)
			subtotal += priced.UnitPrice * priced.Quantity
		case "custom_frame":
			priced, reservation, err := priceAndReserveCustomFrame(tx, item)
			if err != nil {
				return nil, nil, 0, err
			}
			pricedItems = append(pricedItems, priced)
			reservations = append(reservations, reservation)
			subtotal += priced.UnitPrice * priced.Quantity
		default:
			return nil, nil, 0, checkoutError{status: http.StatusBadRequest, message: "Kategori item tidak valid"}
		}
	}

	return pricedItems, reservations, subtotal, nil
}

func priceAndReserveArtPrint(tx *sql.Tx, item models.OrderItem) (pricedOrderItem, stockReservation, error) {
	var title, artist, imageURL string
	var price, stock int
	err := tx.QueryRow(
		"SELECT title, artist, price, stock, image_url FROM art_prints WHERE id = ? FOR UPDATE",
		item.ProductID,
	).Scan(&title, &artist, &price, &stock, &imageURL)
	if err == sql.ErrNoRows {
		return pricedOrderItem{}, stockReservation{}, checkoutError{status: http.StatusBadRequest, message: "Produk art print tidak ditemukan"}
	}
	if err != nil {
		return pricedOrderItem{}, stockReservation{}, checkoutError{status: http.StatusInternalServerError, message: "Gagal membaca produk art print"}
	}
	if stock < item.Quantity {
		return pricedOrderItem{}, stockReservation{}, checkoutError{status: http.StatusBadRequest, message: "Stok art print tidak mencukupi"}
	}
	if _, err := tx.Exec("UPDATE art_prints SET stock = stock - ? WHERE id = ?", item.Quantity, item.ProductID); err != nil {
		return pricedOrderItem{}, stockReservation{}, checkoutError{status: http.StatusInternalServerError, message: "Gagal update stok art print"}
	}

	details := detailsMap(item.Details)
	details["artist"] = artist
	details["imageUrl"] = imageURL

	return pricedOrderItem{
			ProductID: item.ProductID,
			Name:      title,
			Category:  "Art Print",
			UnitPrice: price,
			Quantity:  item.Quantity,
			Details:   details,
		},
		stockReservation{source: "art_prints", productID: item.ProductID, quantity: item.Quantity},
		nil
}

func priceAndReserveCustomFrame(tx *sql.Tx, item models.OrderItem) (pricedOrderItem, stockReservation, error) {
	var id, price, stock int
	var name, imageURL string
	var err error
	if item.ProductID > 0 {
		err = tx.QueryRow(
			"SELECT id, name, price, stock, image_url FROM products WHERE id = ? FOR UPDATE",
			item.ProductID,
		).Scan(&id, &name, &price, &stock, &imageURL)
	} else {
		err = tx.QueryRow(
			"SELECT id, name, price, stock, image_url FROM products WHERE name = ? AND UPPER(category) = 'FRAME' LIMIT 1 FOR UPDATE",
			strings.TrimSpace(item.Name),
		).Scan(&id, &name, &price, &stock, &imageURL)
	}
	if err == sql.ErrNoRows {
		return pricedOrderItem{}, stockReservation{}, checkoutError{status: http.StatusBadRequest, message: "Produk frame tidak ditemukan"}
	}
	if err != nil {
		return pricedOrderItem{}, stockReservation{}, checkoutError{status: http.StatusInternalServerError, message: "Gagal membaca produk frame"}
	}
	if stock < item.Quantity {
		return pricedOrderItem{}, stockReservation{}, checkoutError{status: http.StatusBadRequest, message: "Stok frame tidak mencukupi"}
	}

	details := detailsMap(item.Details)
	unitPrice, err := calculateCustomFramePrice(details, price)
	if err != nil {
		return pricedOrderItem{}, stockReservation{}, err
	}
	if _, err := tx.Exec("UPDATE products SET stock = stock - ? WHERE id = ?", item.Quantity, id); err != nil {
		return pricedOrderItem{}, stockReservation{}, checkoutError{status: http.StatusInternalServerError, message: "Gagal update stok frame"}
	}

	details["frameProductID"] = id
	details["framePricePerMeter"] = price
	details["imageUrl"] = imageURL

	return pricedOrderItem{
			ProductID: id,
			Name:      name,
			Category:  "Custom Frame",
			UnitPrice: unitPrice,
			Quantity:  item.Quantity,
			Details:   details,
		},
		stockReservation{source: "products", productID: id, quantity: item.Quantity},
		nil
}

func insertPendingOrder(tx *sql.Tx, req models.CreateOrderRequest, orderUID, shippingAddr string, quote shippingQuote, weight float64, subtotal, totalAmount int) (int64, error) {
	result, err := tx.Exec(`
		INSERT INTO orders (
			order_uid, customer_name, customer_email, customer_phone, firebase_uid,
			total_amount, subtotal, shipping_cost, shipping_address, order_status,
			receiver_name, phone, province, city, district, village, postal_code,
			full_address, village_code,
			courier_code, courier_name, shipping_price, shipping_estimation, weight
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		orderUID,
		strings.TrimSpace(req.CustomerName),
		strings.TrimSpace(req.CustomerEmail),
		strings.TrimSpace(req.CustomerPhone),
		req.FirebaseUID,
		totalAmount,
		subtotal,
		quote.Price,
		shippingAddr,
		orderStatusPendingPayment,
		req.ReceiverName,
		req.Phone,
		req.Province,
		req.City,
		req.District,
		req.Village,
		req.PostalCode,
		req.FullAddress,
		req.VillageCode,
		quote.CourierCode,
		quote.CourierName,
		quote.Price,
		quote.Estimation,
		weight,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func insertOrderItems(tx *sql.Tx, orderID int64, items []pricedOrderItem) error {
	stmt, err := tx.Prepare(`
		INSERT INTO order_items
			(order_id, product_id, item_name, category, quantity, price, details)
		VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, item := range items {
		detailsJSON, err := json.Marshal(item.Details)
		if err != nil {
			return err
		}
		if _, err := stmt.Exec(orderID, item.ProductID, item.Name, item.Category, item.Quantity, item.UnitPrice, string(detailsJSON)); err != nil {
			return err
		}
	}
	return nil
}

func markOrderAwaitingPayment(orderID int64, flipResponse flipPaymentResponse) error {
	_, err := database.DB.Exec(
		"UPDATE orders SET flip_link_id = ?, payment_url = ?, order_status = ? WHERE id = ?",
		flipResponse.LinkID,
		flipResponse.LinkURL,
		orderStatusAwaitingPayment,
		orderID,
	)
	return err
}

func markPaymentFailedAndReleaseStock(orderID int64, reservations []stockReservation) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE orders SET order_status = ? WHERE id = ?", orderStatusPaymentFailed, orderID); err != nil {
		return err
	}

	for _, reservation := range reservations {
		switch reservation.source {
		case "art_prints":
			if _, err := tx.Exec("UPDATE art_prints SET stock = stock + ? WHERE id = ?", reservation.quantity, reservation.productID); err != nil {
				return err
			}
		case "products":
			if _, err := tx.Exec("UPDATE products SET stock = stock + ? WHERE id = ?", reservation.quantity, reservation.productID); err != nil {
				return err
			}
		default:
			return fmt.Errorf("unknown stock source: %s", reservation.source)
		}
	}

	return tx.Commit()
}

func syncPendingFlipPayments(ctx context.Context, firebaseUID string) {
	rows, err := database.DB.QueryContext(ctx, `
		SELECT id, COALESCE(flip_link_id, '')
		FROM orders
		WHERE firebase_uid = ?
		  AND order_status IN ('PENDING', 'pending_payment', 'awaiting_payment')
		  AND COALESCE(flip_link_id, '') <> ''
		ORDER BY created_at DESC
		LIMIT 20`, firebaseUID)
	if err != nil {
		log.Printf("Flip payment sync query failed: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var orderID int64
		var flipLinkID string
		if err := rows.Scan(&orderID, &flipLinkID); err != nil {
			log.Printf("Flip payment sync scan failed: %v", err)
			continue
		}
		if err := syncOrderPaymentStatus(ctx, orderID, flipLinkID); err != nil {
			log.Printf("Flip payment sync failed for order %d: %v", orderID, err)
		}
	}
}

func syncOrderPaymentStatus(ctx context.Context, orderID int64, flipLinkID string) error {
	flipStatus, err := fetchFlipPaymentStatusFunc(ctx, flipLinkID)
	if err != nil {
		return err
	}
	targetStatus := orderStatusFromFlipPaymentStatus(flipStatus)
	if targetStatus == "" {
		return nil
	}
	_, err = database.DB.ExecContext(ctx, `
		UPDATE orders
		SET order_status = ?
		WHERE id = ?
		  AND order_status IN ('PENDING', 'pending_payment', 'awaiting_payment')`,
		targetStatus, orderID,
	)
	return err
}

func createFlipPaymentWithHTTP(ctx context.Context, req flipPaymentRequest) (flipPaymentResponse, error) {
	flipAPIKey := os.Getenv("FLIP_SECRET_KEY")
	if strings.TrimSpace(flipAPIKey) == "" {
		return flipPaymentResponse{}, errors.New("FLIP_SECRET_KEY is not configured")
	}

	form := url.Values{}
	form.Set("title", "Citra Artframe Order #"+strconv.FormatInt(req.OrderID, 10))
	form.Set("amount", strconv.Itoa(req.Amount))
	form.Set("type", "SINGLE")
	form.Set("expired_date", req.ExpiresAt.Format("2006-01-02 15:04"))
	form.Set("is_address_required", "0")
	form.Set("is_phone_number_required", "0")
	form.Set("step", "3")
	form.Set("sender_name", flipSafeName(req.CustomerName))
	form.Set("sender_email", flipSafeEmail(req.CustomerEmail, req.OrderID))
	form.Set("sender_phone_number", flipSafePhone(req.CustomerPhone))
	form.Set("sender_address", strings.TrimSpace(req.CustomerAddress))
	form.Set("sender_bank", req.SenderBank)
	form.Set("sender_bank_type", req.SenderBankType)
	if redirectURL := strings.TrimSpace(os.Getenv("FLIP_REDIRECT_URL")); redirectURL != "" {
		form.Set("redirect_url", redirectURL)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://bigflip.id/big_sandbox_api/v2/pwf/bill", strings.NewReader(form.Encode()))
	if err != nil {
		return flipPaymentResponse{}, err
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(flipAPIKey+":")))
	httpReq.Header.Set("idempotency-key", "citraframe-order-"+req.OrderUID)

	resp, err := flipHTTPClient.Do(httpReq)
	if err != nil {
		return flipPaymentResponse{}, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return flipPaymentResponse{}, err
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return flipPaymentResponse{}, fmt.Errorf("Flip API returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return parseFlipPaymentResponse(bodyBytes)
}

func fetchFlipPaymentStatusWithHTTP(ctx context.Context, flipLinkID string) (string, error) {
	flipAPIKey := os.Getenv("FLIP_SECRET_KEY")
	if strings.TrimSpace(flipAPIKey) == "" {
		return "", errors.New("FLIP_SECRET_KEY is not configured")
	}
	flipLinkID = strings.TrimSpace(flipLinkID)
	if flipLinkID == "" {
		return "", errors.New("flip link id is empty")
	}

	endpoint := "https://bigflip.id/big_sandbox_api/v2/pwf/" + url.PathEscape(flipLinkID) + "/payment"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(flipAPIKey+":")))

	resp, err := flipHTTPClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Flip Get Payment returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return parseFlipPaymentStatus(bodyBytes)
}

func parseFlipPaymentStatus(bodyBytes []byte) (string, error) {
	var raw struct {
		Data []struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	decoder := json.NewDecoder(bytes.NewReader(bodyBytes))
	decoder.UseNumber()
	if err := decoder.Decode(&raw); err != nil {
		return "", err
	}

	firstStatus := ""
	for _, payment := range raw.Data {
		status := strings.ToUpper(strings.TrimSpace(payment.Status))
		if status == "" {
			continue
		}
		if firstStatus == "" {
			firstStatus = status
		}
		if orderStatusFromFlipPaymentStatus(status) == "PROCESSING" {
			return status, nil
		}
	}
	return firstStatus, nil
}

func orderStatusFromFlipPaymentStatus(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "SUCCESSFUL", "PAID", "DONE", "SUCCESS":
		return "PROCESSING"
	case "FAILED", "EXPIRED", "CANCELED", "CANCELLED":
		return "CANCELED"
	default:
		return ""
	}
}

type flipPaymentAPIResponse struct {
	LinkID     interface{}             `json:"link_id"`
	LinkURL    string                  `json:"link_url"`
	PaymentURL string                  `json:"payment_url"`
	Data       *flipPaymentAPIResponse `json:"data"`
}

func parseFlipPaymentResponse(bodyBytes []byte) (flipPaymentResponse, error) {
	var raw flipPaymentAPIResponse
	decoder := json.NewDecoder(bytes.NewReader(bodyBytes))
	decoder.UseNumber()
	if err := decoder.Decode(&raw); err != nil {
		return flipPaymentResponse{}, err
	}
	if raw.Data != nil && (raw.Data.PaymentURL != "" || raw.Data.LinkURL != "") {
		raw = *raw.Data
	}

	paymentURL := firstPaymentURL(raw.PaymentURL, raw.LinkURL)
	if paymentURL == "" {
		return flipPaymentResponse{}, errors.New("payment URL tidak diterima dari Flip")
	}

	return flipPaymentResponse{LinkID: stringFromAny(raw.LinkID), LinkURL: paymentURL}, nil
}

func firstPaymentURL(candidates ...string) string {
	for _, candidate := range candidates {
		if normalized := normalizePaymentURL(candidate); normalized != "" {
			return normalized
		}
	}
	return ""
}

func normalizePaymentURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") {
		return value
	}
	if strings.HasPrefix(value, "//") {
		return "https:" + value
	}
	return "https://" + strings.TrimLeft(value, "/")
}

func resolveFlipPaymentMethod(code string) (flipPaymentMethod, error) {
	code = strings.TrimSpace(strings.ToLower(code))
	if code == "" {
		code = "mandiri_va"
	}
	method, ok := flipPaymentMethods[code]
	if !ok {
		return flipPaymentMethod{}, checkoutError{status: http.StatusBadRequest, message: "Metode pembayaran tidak valid"}
	}
	return method, nil
}

func flipSafeName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "Pelanggan Citra Artframe"
	}
	re := regexp.MustCompile(`[^\p{L}\p{N} .,'-]+`)
	value = strings.Join(strings.Fields(re.ReplaceAllString(value, " ")), " ")
	if value == "" {
		return "Pelanggan Citra Artframe"
	}
	if runes := []rune(value); len(runes) > 100 {
		return string(runes[:100])
	}
	return value
}

func flipSafeEmail(value string, orderID int64) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if flipEmailAllowed(value) {
		return value
	}

	parts := strings.Split(value, "@")
	if len(parts) == 2 {
		local := regexp.MustCompile(`[^a-z0-9.-]+`).ReplaceAllString(parts[0], ".")
		local = strings.Trim(local, ".-")
		domain := regexp.MustCompile(`[^a-z0-9.-]+`).ReplaceAllString(parts[1], "")
		candidate := local + "@" + domain
		if flipEmailAllowed(candidate) {
			return candidate
		}
	}

	return fmt.Sprintf("customer.%d@example.test", orderID)
}

func flipEmailAllowed(value string) bool {
	re := regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{0,63}@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$`)
	return re.MatchString(value)
}

func flipSafePhone(value string) string {
	var b strings.Builder
	for _, r := range value {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func resolveShippingQuoteFromAPICoID(ctx context.Context, req models.CreateOrderRequest, weight float64) (shippingQuote, error) {
	quotes, _, err := loadShippingQuotes(ctx, strings.TrimSpace(req.VillageCode), weight)
	if err != nil {
		if serviceErr, ok := err.(shippingServiceError); ok {
			return shippingQuote{}, checkoutError{status: serviceErr.status, message: serviceErr.message}
		}
		return shippingQuote{}, checkoutError{status: http.StatusBadGateway, message: "Gagal memverifikasi ongkir"}
	}
	for _, quote := range quotes {
		if quoteMatchesRequest(quote, req) {
			return quote, nil
		}
	}

	return shippingQuote{}, checkoutError{status: http.StatusBadRequest, message: "Pilihan pengiriman tidak tersedia"}
}

func extractShippingQuotes(payload interface{}) []shippingQuote {
	var quotes []shippingQuote
	switch value := payload.(type) {
	case []interface{}:
		for _, item := range value {
			quotes = append(quotes, extractShippingQuotes(item)...)
		}
	case map[string]interface{}:
		if quote, ok := shippingQuoteFromMap(value); ok {
			quotes = append(quotes, quote)
		}
		for _, key := range []string{"couriers", "data", "results"} {
			if child, ok := value[key]; ok {
				quotes = append(quotes, extractShippingQuotes(child)...)
			}
		}
	}
	return quotes
}

func shippingQuoteFromMap(raw map[string]interface{}) (shippingQuote, bool) {
	price := intFromAny(firstValue(raw, "price", "cost", "shipping_cost"))
	if price <= 0 {
		return shippingQuote{}, false
	}

	name := stringFromAny(firstValue(raw, "courier_name", "service_name", "name"))
	service := stringFromAny(firstValue(raw, "service_type", "service"))
	if name != "" && service != "" && !strings.Contains(strings.ToLower(name), strings.ToLower(service)) {
		name += " - " + service
	}

	return shippingQuote{
		CourierCode: stringFromAny(firstValue(raw, "courier_code", "code")),
		CourierName: name,
		Price:       price,
		Estimation:  stringFromAny(firstValue(raw, "etd", "estimation", "estimated_day")),
	}, true
}

func quoteMatchesRequest(quote shippingQuote, req models.CreateOrderRequest) bool {
	reqCode := strings.TrimSpace(strings.ToLower(req.CourierCode))
	reqName := compactString(req.CourierName)
	quoteName := compactString(quote.CourierName)
	codeMatches := reqCode != "" && strings.TrimSpace(strings.ToLower(quote.CourierCode)) == reqCode
	nameMatches := reqName != "" && quoteName != "" &&
		(strings.Contains(quoteName, reqName) || strings.Contains(reqName, quoteName))

	if reqName != "" {
		return nameMatches && (reqCode == "" || codeMatches)
	}
	return codeMatches
}

func calculateCheckoutWeight(items []models.OrderItem) float64 {
	const (
		kgPerMFrame  = 0.6
		kgPerM2Glass = 2.5
		kgPerM2Back  = 1.5
	)
	totalWeight := 0.0
	for _, item := range items {
		details := detailsMap(item.Details)
		quantity := math.Max(float64(item.Quantity), 1)
		switch normalizeOrderCategory(item.Category) {
		case "art_print":
			size := strings.ToLower(stringFromAny(details["size"]))
			base := 0.5
			if strings.Contains(size, "sedang") {
				base = 1
			}
			if strings.Contains(size, "besar") {
				base = 1.5
			}
			totalWeight += base * quantity
		case "custom_frame":
			artworkWidth, artworkHeight, matWidth, ok := customFrameDimensions(details)
			if !ok {
				totalWeight += 0.5 * quantity
				continue
			}
			finalWidth := artworkWidth + matWidth
			finalHeight := artworkHeight + matWidth
			if dims, ok := details["dimensions"].(map[string]interface{}); ok {
				if v := floatFromAny(dims["finalWidthCm"]); v > 0 {
					finalWidth = v
				}
				if v := floatFromAny(dims["finalHeightCm"]); v > 0 {
					finalHeight = v
				}
			}
			perimeterM := ((finalWidth + finalHeight) * 2) / 100
			areaM2 := (finalWidth * finalHeight) / 10000
			itemWeight := perimeterM*kgPerMFrame + areaM2*kgPerM2Back
			if boolFromAny(details["hasGlass"]) {
				itemWeight += areaM2 * kgPerM2Glass
			}
			totalWeight += itemWeight * quantity
		}
	}
	if totalWeight < 0.1 {
		return 0.1
	}
	return math.Round(totalWeight*100) / 100
}

func calculateCustomFramePrice(details map[string]interface{}, framePricePerMeter int) (int, error) {
	artworkWidth, artworkHeight, matWidth, ok := customFrameDimensions(details)
	if !ok {
		return 0, checkoutError{status: http.StatusBadRequest, message: "Detail ukuran custom frame tidak valid"}
	}
	if framePricePerMeter <= 0 {
		return 0, checkoutError{status: http.StatusBadRequest, message: "Harga produk frame tidak valid"}
	}

	finalWidth := artworkWidth + matWidth
	finalHeight := artworkHeight + matWidth
	finalAreaCm2 := finalWidth * finalHeight
	artworkAreaCm2 := artworkWidth * artworkHeight
	perimeterM := ((finalWidth + finalHeight) * 2) / 100

	matPrice := 0.0
	if matWidth > 0 {
		matPrice = artworkAreaCm2 * float64(matPriceMultiplier(matWidth))
	}
	glassPrice := 0.0
	if boolFromAny(details["hasGlass"]) {
		glassPrice = finalAreaCm2 * float64(glassPriceMultiplier(finalWidth, finalHeight))
	}
	framePrice := perimeterM * float64(framePricePerMeter)

	return int(math.Round(framePrice + matPrice + glassPrice)), nil
}

func customFrameDimensions(details map[string]interface{}) (float64, float64, float64, bool) {
	width := firstPositiveFloat(details, "artworkWidth", "artwork_width")
	height := firstPositiveFloat(details, "artworkHeight", "artwork_height")
	if (width <= 0 || height <= 0) && stringFromAny(details["artworkSize"]) != "" {
		width, height = parseArtworkSize(stringFromAny(details["artworkSize"]))
	}

	matWidth := firstPositiveFloat(details, "matWidthValue", "matWidth", "mat_width")
	if matWidth <= 0 && stringFromAny(details["matWidth"]) != "" {
		matWidth = parseFirstNumber(stringFromAny(details["matWidth"]))
	}
	if width <= 0 || height <= 0 || width > 500 || height > 500 || matWidth < 0 || matWidth > 50 {
		return 0, 0, 0, false
	}
	return width, height, matWidth, true
}

func matPriceMultiplier(matWidth float64) int {
	switch int(math.Round(matWidth)) {
	case 2:
		return 20
	case 4:
		return 30
	case 6:
		return 45
	case 8:
		return 60
	default:
		return 0
	}
}

func glassPriceMultiplier(width, height float64) int {
	if width <= 70 && height <= 110 {
		return 15
	}
	return 30
}

func parseArtworkSize(value string) (float64, float64) {
	re := regexp.MustCompile(`(?i)(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)`)
	matches := re.FindStringSubmatch(value)
	if len(matches) != 3 {
		return 0, 0
	}
	width, _ := strconv.ParseFloat(matches[1], 64)
	height, _ := strconv.ParseFloat(matches[2], 64)
	return width, height
}

func parseFirstNumber(value string) float64 {
	re := regexp.MustCompile(`\d+(?:\.\d+)?`)
	match := re.FindString(value)
	if match == "" {
		return 0
	}
	number, _ := strconv.ParseFloat(match, 64)
	return number
}

func normalizeOrderCategory(category string) string {
	normalized := strings.ToLower(strings.TrimSpace(category))
	switch {
	case strings.Contains(normalized, "art") && strings.Contains(normalized, "print"):
		return "art_print"
	case strings.Contains(normalized, "custom") || strings.Contains(normalized, "frame"):
		return "custom_frame"
	default:
		return ""
	}
}

func detailsMap(value interface{}) map[string]interface{} {
	if value == nil {
		return map[string]interface{}{}
	}
	switch v := value.(type) {
	case map[string]interface{}:
		copyMap := make(map[string]interface{}, len(v))
		for key, item := range v {
			copyMap[key] = item
		}
		return copyMap
	case json.RawMessage:
		var out map[string]interface{}
		if json.Unmarshal(v, &out) == nil && out != nil {
			return out
		}
	case []byte:
		var out map[string]interface{}
		if json.Unmarshal(v, &out) == nil && out != nil {
			return out
		}
	case string:
		var out map[string]interface{}
		if json.Unmarshal([]byte(v), &out) == nil && out != nil {
			return out
		}
	}
	return map[string]interface{}{}
}

func firstValue(raw map[string]interface{}, keys ...string) interface{} {
	for _, key := range keys {
		if value, ok := raw[key]; ok {
			return value
		}
	}
	return nil
}

func firstPositiveFloat(raw map[string]interface{}, keys ...string) float64 {
	for _, key := range keys {
		if value := floatFromAny(raw[key]); value > 0 {
			return value
		}
	}
	return 0
}

func intFromAny(value interface{}) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case json.Number:
		i, _ := v.Int64()
		return int(i)
	case string:
		clean := strings.ReplaceAll(v, ".", "")
		clean = strings.ReplaceAll(clean, ",", "")
		i, _ := strconv.Atoi(strings.TrimSpace(clean))
		return i
	default:
		return 0
	}
}

func floatFromAny(value interface{}) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		f, _ := v.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(v, "cm")), 64)
		return f
	default:
		return 0
	}
}

func stringFromAny(value interface{}) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		if math.Trunc(v) == v {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case json.Number:
		return strings.TrimSpace(v.String())
	case fmt.Stringer:
		return strings.TrimSpace(v.String())
	default:
		return ""
	}
}

func boolFromAny(value interface{}) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		parsed, _ := strconv.ParseBool(strings.TrimSpace(v))
		return parsed
	default:
		return false
	}
}

func compactString(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	replacer := strings.NewReplacer(" ", "", "-", "", "_", "", "—", "")
	return replacer.Replace(value)
}

func writeCheckoutError(w http.ResponseWriter, err error) {
	var checkoutErr checkoutError
	if errors.As(err, &checkoutErr) {
		writeJSONError(w, checkoutErr.status, checkoutErr.message)
		return
	}
	writeJSONError(w, http.StatusInternalServerError, "Terjadi kesalahan server")
}
