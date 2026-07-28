// backend/handlers/dashboard_handler.go
package handlers

import (
	"encoding/json"
	"net/http"

	"backend/database"
)

type DashboardStats struct {
	TotalOrders   int `json:"total_orders"`
	TotalRevenue  int `json:"total_revenue"`
	TotalProducts int `json:"total_products"`
	TotalPrints   int `json:"total_prints"`
	Pending       int `json:"pending"`
	Processing    int `json:"processing"`
	Shipped       int `json:"shipped"`
	Delivered     int `json:"delivered"`
	Canceled      int `json:"canceled"`
	TodayOrders   int `json:"today_orders"`
	TodayRevenue  int `json:"today_revenue"`
}

func GetDashboardStatsHandler(w http.ResponseWriter, r *http.Request) {
	var stats DashboardStats

	// Total orders & revenue
	database.DB.QueryRow("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders").Scan(&stats.TotalOrders, &stats.TotalRevenue)

	// Products count
	database.DB.QueryRow("SELECT COUNT(*) FROM products").Scan(&stats.TotalProducts)

	// Art Prints count
	database.DB.QueryRow("SELECT COUNT(*) FROM art_prints").Scan(&stats.TotalPrints)

	// Status counts
	database.DB.QueryRow("SELECT COUNT(*) FROM orders WHERE order_status IN ('PENDING', 'pending_payment', 'awaiting_payment')").Scan(&stats.Pending)
	database.DB.QueryRow("SELECT COUNT(*) FROM orders WHERE order_status = 'PROCESSING'").Scan(&stats.Processing)
	database.DB.QueryRow("SELECT COUNT(*) FROM orders WHERE order_status = 'SHIPPED'").Scan(&stats.Shipped)
	database.DB.QueryRow("SELECT COUNT(*) FROM orders WHERE order_status = 'DELIVERED'").Scan(&stats.Delivered)
	database.DB.QueryRow("SELECT COUNT(*) FROM orders WHERE order_status IN ('CANCELED', 'payment_failed')").Scan(&stats.Canceled)

	// Today's orders
	database.DB.QueryRow("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders WHERE DATE(created_at) = CURDATE()").Scan(&stats.TodayOrders, &stats.TodayRevenue)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
