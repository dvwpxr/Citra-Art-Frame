// backend/handlers/order_detail.go
package handlers

import (
	"backend/auth"
	"backend/database"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

type OrderItemView struct {
	ID       int64           `json:"id"`
	Name     string          `json:"name"`
	Category string          `json:"category"`
	Price    int             `json:"price"`
	Quantity int             `json:"quantity"`
	Details  json.RawMessage `json:"details"` // biar bisa diparse di FE
}

type OrderDetailView struct {
	ID              int64  `json:"id"`
	OrderUID        string `json:"order_uid"`
	CustomerName    string `json:"customer_name"`
	CustomerEmail   string `json:"customer_email"`
	CustomerPhone   string `json:"customer_phone"`
	ShippingAddress string `json:"shipping_address"`
	Subtotal        int    `json:"subtotal"`
	ShippingCost    int    `json:"shipping_cost"`
	TotalAmount     int    `json:"total_amount"`
	OrderStatus     string `json:"order_status"`
	CreatedAt       string `json:"created_at"`

	// Snapshot fields
	ReceiverName       string  `json:"receiver_name"`
	Phone              string  `json:"phone"`
	FullAddress        string  `json:"full_address"`
	CourierName        string  `json:"courier_name"`
	ShippingEstimation string  `json:"shipping_estimation"`
	Weight             float64 `json:"weight"`
	FlipLinkID         string  `json:"flip_link_id"`

	Items []OrderItemView `json:"items"`
}

func GetOrderDetailHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	orderID := vars["id"]
	isAdmin := auth.IsAdminRequest(r)
	firebaseUID := auth.FirebaseUIDFromRequest(r)
	if !isAdmin && firebaseUID == "" {
		writeJSONError(w, http.StatusUnauthorized, "autentikasi diperlukan")
		return
	}

	// Ambil header order
	var ov OrderDetailView
	query := `
		SELECT o.id, o.order_uid, o.customer_name, o.customer_email, o.customer_phone,
		       o.shipping_address, o.subtotal, o.shipping_cost, o.total_amount, o.order_status, DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s'),
		       COALESCE(o.receiver_name, ''), COALESCE(o.phone, ''), COALESCE(o.full_address, ''), COALESCE(o.courier_name, ''), COALESCE(o.shipping_estimation, ''), COALESCE(o.weight, 0), COALESCE(o.flip_link_id, '')
		FROM orders o
		WHERE (o.id = ? OR o.order_uid = ?)`
	args := []interface{}{orderID, orderID}
	if !isAdmin {
		query += " AND o.firebase_uid = ?"
		args = append(args, firebaseUID)
	}
	row := database.DB.QueryRow(query, args...)

	if err := row.Scan(
		&ov.ID, &ov.OrderUID, &ov.CustomerName, &ov.CustomerEmail, &ov.CustomerPhone,
		&ov.ShippingAddress, &ov.Subtotal, &ov.ShippingCost, &ov.TotalAmount, &ov.OrderStatus, &ov.CreatedAt,
		&ov.ReceiverName, &ov.Phone, &ov.FullAddress, &ov.CourierName, &ov.ShippingEstimation, &ov.Weight, &ov.FlipLinkID,
	); err != nil {
		if err == sql.ErrNoRows {
			if isAdmin {
				writeJSONError(w, http.StatusNotFound, "order tidak ditemukan")
				return
			}
			writeJSONError(w, http.StatusForbidden, "order tidak dapat diakses")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to fetch order")
		return
	}
	if shouldSyncFlipStatus(ov.OrderStatus, ov.FlipLinkID) {
		if err := syncOrderPaymentStatus(r.Context(), ov.ID, ov.FlipLinkID); err == nil {
			_ = database.DB.QueryRow("SELECT order_status FROM orders WHERE id = ?", ov.ID).Scan(&ov.OrderStatus)
		}
	}

	// Ambil item-item
	rows, err := database.DB.Query(`
		SELECT id, item_name, COALESCE(category, ''), price, quantity, details
		FROM order_items WHERE order_id = ? ORDER BY id ASC`, ov.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to fetch order items")
		return
	}
	defer rows.Close()

	var items []OrderItemView
	for rows.Next() {
		var it OrderItemView
		var details sql.NullString
		if err := rows.Scan(&it.ID, &it.Name, &it.Category, &it.Price, &it.Quantity, &details); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "failed to scan item")
			return
		}
		if details.Valid {
			it.Details = json.RawMessage([]byte(details.String))
		}
		items = append(items, it)
	}
	ov.Items = items

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ov)
}

func shouldSyncFlipStatus(orderStatus, flipLinkID string) bool {
	if flipLinkID == "" {
		return false
	}
	switch orderStatus {
	case "PENDING", "pending_payment", "awaiting_payment":
		return true
	default:
		return false
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": message})
}
