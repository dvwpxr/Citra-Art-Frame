package handlers

import (
	"database/sql" // Pastikan 'database/sql' di-import
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"backend/database"

	"github.com/gorilla/mux"
)

// ... (Struct OrderAdminView tetap sama) ...
type OrderAdminView struct {
	ID             int64     `json:"id"`
	OrderUID       string    `json:"order_uid"`
	CustomerName   string    `json:"customer_name"`
	ItemsSummary   string    `json:"items_summary"`
	TotalAmount    int       `json:"total_amount"`
	OrderStatus    string    `json:"order_status"`
	CreatedAt      time.Time `json:"created_at"`
	CustomerEmail  string    `json:"customer_email"`
	CustomerPhone  string    `json:"customer_phone"`
	ShippingAddress string   `json:"shipping_address"`
	Subtotal       int       `json:"subtotal"`
	ShippingCost   int       `json:"shipping_cost"`
}


// UBAH FUNGSI INI
func GetOrdersHandler(w http.ResponseWriter, r *http.Request) {
	// Ambil query parameter dari URL
	queryParams := r.URL.Query()
	status := queryParams.Get("status")
	search := queryParams.Get("search")
	fromDate := queryParams.Get("fromDate")
	toDate := queryParams.Get("toDate")

	// Bangun query SQL secara dinamis
	query := `
		SELECT 
			o.id, o.order_uid, o.customer_name,
			(SELECT GROUP_CONCAT(oi.item_name SEPARATOR ', ') FROM order_items oi WHERE oi.order_id = o.id) as items_summary,
			o.total_amount, o.order_status, o.created_at, o.customer_email, o.customer_phone, o.shipping_address, o.subtotal, o.shipping_cost
		FROM orders o
		WHERE 1=1
	`
	var args []interface{}

	if status != "" {
		query += " AND o.order_status = ?"
		args = append(args, status)
	}
	if search != "" {
		searchTerm := "%" + search + "%"
		query += " AND (o.customer_name LIKE ? OR o.order_uid LIKE ?)"
		args = append(args, searchTerm, searchTerm)
	}
	if fromDate != "" {
		query += " AND o.created_at >= ?"
		args = append(args, fromDate+" 00:00:00")
	}
	if toDate != "" {
		query += " AND o.created_at <= ?"
		args = append(args, toDate+" 23:59:59")
	}

	query += " ORDER BY o.created_at DESC"

	// Eksekusi query dengan argumen yang aman
	rows, err := database.DB.Query(query, args...)
	if err != nil {
		http.Error(w, "Failed to fetch orders: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var orders []OrderAdminView
	for rows.Next() {
		var order OrderAdminView
		var itemsSummary sql.NullString
		if err := rows.Scan(
			&order.ID, &order.OrderUID, &order.CustomerName, &itemsSummary,
			&order.TotalAmount, &order.OrderStatus, &order.CreatedAt, &order.CustomerEmail,
			&order.CustomerPhone, &order.ShippingAddress, &order.Subtotal, &order.ShippingCost,
		); err != nil {
			http.Error(w, "Failed to scan order row", http.StatusInternalServerError)
			return
		}
		order.ItemsSummary = itemsSummary.String
		orders = append(orders, order)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(orders)
}

// ... (Fungsi UpdateOrderStatusHandler tetap sama) ...
func UpdateOrderStatusHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	orderID := vars["id"]

	var payload struct {
		Status string `json:"status"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validasi status
	validStatuses := "PENDING,PROCESSING,SHIPPED,DELIVERED,CANCELED"
	if !strings.Contains(validStatuses, payload.Status) {
		http.Error(w, "Invalid status value", http.StatusBadRequest)
		return
	}

	_, err := database.DB.Exec("UPDATE orders SET order_status = ? WHERE id = ?", payload.Status, orderID)
	if err != nil {
		http.Error(w, "Failed to update order status", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Status updated successfully"})
}

