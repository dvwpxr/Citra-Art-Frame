// backend/handlers/address_handler.go
package handlers

import (
	"backend/auth"
	"backend/database"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

type Address struct {
	ID           int64   `json:"id"`
	FirebaseUID  string  `json:"firebase_uid"`
	Label        string  `json:"label"`
	ReceiverName string  `json:"receiver_name"`
	Phone        string  `json:"phone"`
	ProvinceCode string  `json:"province_code"`
	RegencyCode  string  `json:"regency_code"`
	DistrictCode string  `json:"district_code"`
	VillageCode  string  `json:"village_code"`
	Province     string  `json:"province"`
	City         string  `json:"city"`
	District     string  `json:"district"`
	Village      string  `json:"village"`
	PostalCode   string  `json:"postal_code"`
	FullAddress  string  `json:"full_address"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	IsDefault    bool    `json:"is_default"`
}

// GetAddresses — GET /api/user/addresses?uid=xxx
func GetAddressesHandler(w http.ResponseWriter, r *http.Request) {
	uid := auth.FirebaseUIDFromRequest(r)
	if uid == "" {
		http.Error(w, "uid is required", http.StatusBadRequest)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, firebase_uid, label, receiver_name, phone,
		       COALESCE(province_code,''), COALESCE(regency_code,''), COALESCE(district_code,''), COALESCE(village_code,''),
		       province, city, district, COALESCE(village,''),
		       postal_code, full_address, latitude, longitude, is_default
		FROM user_addresses
		WHERE firebase_uid = ?
		ORDER BY is_default DESC, id DESC`, uid)
	if err != nil {
		http.Error(w, "Failed to fetch addresses: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var addresses []Address
	for rows.Next() {
		var a Address
		if err := rows.Scan(
			&a.ID, &a.FirebaseUID, &a.Label, &a.ReceiverName, &a.Phone,
			&a.ProvinceCode, &a.RegencyCode, &a.DistrictCode, &a.VillageCode,
			&a.Province, &a.City, &a.District, &a.Village,
			&a.PostalCode, &a.FullAddress,
			&a.Latitude, &a.Longitude, &a.IsDefault,
		); err != nil {
			http.Error(w, "Failed to scan address", http.StatusInternalServerError)
			return
		}
		addresses = append(addresses, a)
	}

	if addresses == nil {
		addresses = []Address{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(addresses)
}

// CreateAddress — POST /api/user/addresses
func CreateAddressHandler(w http.ResponseWriter, r *http.Request) {
	var a Address
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	a.FirebaseUID = auth.FirebaseUIDFromRequest(r)
	if a.FirebaseUID == "" {
		http.Error(w, "firebase_uid is required", http.StatusBadRequest)
		return
	}

	// Jika ini alamat default, reset semua alamat lain
	if a.IsDefault {
		database.DB.Exec("UPDATE user_addresses SET is_default = 0 WHERE firebase_uid = ?", a.FirebaseUID)
	}

	result, err := database.DB.Exec(`
		INSERT INTO user_addresses (firebase_uid, label, receiver_name, phone,
			province_code, regency_code, district_code, village_code,
			province, city, district, village,
			postal_code, full_address, latitude, longitude, is_default)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		a.FirebaseUID, a.Label, a.ReceiverName, a.Phone,
		a.ProvinceCode, a.RegencyCode, a.DistrictCode, a.VillageCode,
		a.Province, a.City, a.District, a.Village,
		a.PostalCode, a.FullAddress,
		a.Latitude, a.Longitude, a.IsDefault)
	if err != nil {
		http.Error(w, "Failed to create address: "+err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	a.ID = id

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(a)
}

// UpdateAddress — PUT /api/user/addresses/{id}
func UpdateAddressHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, _ := strconv.ParseInt(vars["id"], 10, 64)
	uid := auth.FirebaseUIDFromRequest(r)

	var a Address
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if a.IsDefault {
		database.DB.Exec("UPDATE user_addresses SET is_default = 0 WHERE firebase_uid = ?", uid)
	}

	_, err := database.DB.Exec(`
		UPDATE user_addresses SET label=?, receiver_name=?, phone=?,
		province_code=?, regency_code=?, district_code=?, village_code=?,
			province=?, city=?, district=?, village=?,
			postal_code=?, full_address=?, latitude=?, longitude=?, is_default=?
			WHERE id=? AND firebase_uid=?`,
		a.Label, a.ReceiverName, a.Phone,
		a.ProvinceCode, a.RegencyCode, a.DistrictCode, a.VillageCode,
		a.Province, a.City, a.District, a.Village,
		a.PostalCode, a.FullAddress, a.Latitude, a.Longitude, a.IsDefault, id, uid)
	if err != nil {
		http.Error(w, "Failed to update address", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Address updated"})
}

// DeleteAddress — DELETE /api/user/addresses/{id}
func DeleteAddressHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	uid := auth.FirebaseUIDFromRequest(r)

	_, err := database.DB.Exec("DELETE FROM user_addresses WHERE id = ? AND firebase_uid = ?", id, uid)
	if err != nil {
		http.Error(w, "Failed to delete address", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Address deleted"})
}

// GetUserOrders — GET /api/user/orders?uid=xxx
func GetUserOrdersHandler(w http.ResponseWriter, r *http.Request) {
	uid := auth.FirebaseUIDFromRequest(r)
	if uid == "" {
		http.Error(w, "uid is required", http.StatusBadRequest)
		return
	}

	syncPendingFlipPayments(r.Context(), uid)

	rows, err := database.DB.Query(`
		SELECT o.id, o.order_uid, o.customer_name, o.customer_email,
		       o.total_amount, o.order_status, o.created_at, COALESCE(o.payment_url, ''),
		       (SELECT GROUP_CONCAT(oi.item_name SEPARATOR ', ') FROM order_items oi WHERE oi.order_id = o.id) as items_summary,
		       (SELECT JSON_UNQUOTE(JSON_EXTRACT(oi.details, '$.imageUrl')) FROM order_items oi WHERE oi.order_id = o.id AND JSON_EXTRACT(oi.details, '$.imageUrl') IS NOT NULL LIMIT 1) as image_url
		FROM orders o
		WHERE o.firebase_uid = ?
		ORDER BY o.created_at DESC`, uid)
	if err != nil {
		http.Error(w, "Failed to fetch orders: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type UserOrder struct {
		ID           int64  `json:"id"`
		OrderUID     string `json:"order_uid"`
		CustomerName string `json:"customer_name"`
		Email        string `json:"customer_email"`
		TotalAmount  int    `json:"total_amount"`
		Status       string `json:"order_status"`
		CreatedAt    string `json:"created_at"`
		PaymentURL   string `json:"payment_url"`
		ItemsSummary string `json:"items_summary"`
		ImageURL     string `json:"image_url"`
	}

	var orders []UserOrder
	for rows.Next() {
		var o UserOrder
		var items *string
		var imgURL *string
		if err := rows.Scan(&o.ID, &o.OrderUID, &o.CustomerName, &o.Email,
			&o.TotalAmount, &o.Status, &o.CreatedAt, &o.PaymentURL, &items, &imgURL); err != nil {
			continue
		}
		if items != nil {
			o.ItemsSummary = *items
		}
		if imgURL != nil {
			o.ImageURL = *imgURL
		}
		orders = append(orders, o)
	}

	if orders == nil {
		orders = []UserOrder{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(orders)
}
