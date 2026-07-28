// backend/handlers/cart_handler.go
package handlers

import (
	"backend/auth"
	"backend/database"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

// CartItem represents a single item in the user's cart
type CartItem struct {
	ID             int64           `json:"id"`
	FirebaseUID    string          `json:"firebase_uid"`
	ItemType       string          `json:"item_type"` // "artprint" or "custom"
	ProductID      int             `json:"product_id"`
	Name           string          `json:"name"`
	ImageURL       string          `json:"image_url"`
	Artist         string          `json:"artist"`
	Size           string          `json:"size"`
	ArtworkWidth   float64         `json:"artwork_width"`
	ArtworkHeight  float64         `json:"artwork_height"`
	MatWidth       float64         `json:"mat_width"`
	MatColor       string          `json:"mat_color"`
	HasGlass       bool            `json:"has_glass"`
	Dimensions     json.RawMessage `json:"dimensions"`
	PriceBreakdown json.RawMessage `json:"price_breakdown"`
	Price          int             `json:"price"`
	Quantity       int             `json:"quantity"`
	Subtotal       int             `json:"subtotal"`
}

// GetCartHandler — GET /api/user/cart?uid=xxx
func GetCartHandler(w http.ResponseWriter, r *http.Request) {
	uid := auth.FirebaseUIDFromRequest(r)
	if uid == "" {
		http.Error(w, `{"message":"uid is required"}`, http.StatusBadRequest)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, firebase_uid, item_type, product_id, name, image_url,
		       COALESCE(artist,''), COALESCE(size,''),
		       artwork_width, artwork_height, mat_width, COALESCE(mat_color,''),
		       has_glass, COALESCE(dimensions,'{}'), COALESCE(price_breakdown,'{}'),
		       price, quantity, subtotal
		FROM cart_items
		WHERE firebase_uid = ?
		ORDER BY id DESC`, uid)
	if err != nil {
		http.Error(w, `{"message":"Failed to fetch cart: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var items []CartItem
	for rows.Next() {
		var c CartItem
		var dimStr, pbStr string
		if err := rows.Scan(
			&c.ID, &c.FirebaseUID, &c.ItemType, &c.ProductID, &c.Name, &c.ImageURL,
			&c.Artist, &c.Size,
			&c.ArtworkWidth, &c.ArtworkHeight, &c.MatWidth, &c.MatColor,
			&c.HasGlass, &dimStr, &pbStr,
			&c.Price, &c.Quantity, &c.Subtotal,
		); err != nil {
			continue
		}
		c.Dimensions = json.RawMessage(dimStr)
		c.PriceBreakdown = json.RawMessage(pbStr)
		items = append(items, c)
	}

	if items == nil {
		items = []CartItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// AddToCartHandler — POST /api/user/cart
func AddToCartHandler(w http.ResponseWriter, r *http.Request) {
	var c CartItem
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"message":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	c.FirebaseUID = auth.FirebaseUIDFromRequest(r)
	if c.FirebaseUID == "" {
		http.Error(w, `{"message":"firebase_uid is required"}`, http.StatusBadRequest)
		return
	}

	// For art prints, check if same product already in cart — merge quantity
	if c.ItemType == "artprint" && c.ProductID > 0 {
		var existingID int64
		var existingQty int
		err := database.DB.QueryRow(
			"SELECT id, quantity FROM cart_items WHERE firebase_uid = ? AND item_type = 'artprint' AND product_id = ?",
			c.FirebaseUID, c.ProductID,
		).Scan(&existingID, &existingQty)

		if err == nil && existingID > 0 {
			// Merge: update quantity and subtotal
			newQty := existingQty + c.Quantity
			newSubtotal := c.Price * newQty
			_, err = database.DB.Exec(
				"UPDATE cart_items SET quantity = ?, subtotal = ? WHERE id = ?",
				newQty, newSubtotal, existingID,
			)
			if err != nil {
				http.Error(w, `{"message":"Failed to update cart"}`, http.StatusInternalServerError)
				return
			}

			c.ID = existingID
			c.Quantity = newQty
			c.Subtotal = newSubtotal
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(c)
			return
		}
	}

	// Insert new item
	dimJSON, _ := json.Marshal(c.Dimensions)
	pbJSON, _ := json.Marshal(c.PriceBreakdown)
	if string(dimJSON) == "null" {
		dimJSON = []byte("{}")
	}
	if string(pbJSON) == "null" {
		pbJSON = []byte("{}")
	}

	result, err := database.DB.Exec(`
		INSERT INTO cart_items (
			firebase_uid, item_type, product_id, name, image_url,
			artist, size, artwork_width, artwork_height,
			mat_width, mat_color, has_glass, dimensions, price_breakdown,
			price, quantity, subtotal
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.FirebaseUID, c.ItemType, c.ProductID, c.Name, c.ImageURL,
		c.Artist, c.Size, c.ArtworkWidth, c.ArtworkHeight,
		c.MatWidth, c.MatColor, c.HasGlass, string(dimJSON), string(pbJSON),
		c.Price, c.Quantity, c.Subtotal,
	)
	if err != nil {
		http.Error(w, `{"message":"Failed to add to cart: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	c.ID = id

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}

// UpdateCartItemHandler — PUT /api/user/cart/{id}
func UpdateCartItemHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, _ := strconv.ParseInt(vars["id"], 10, 64)
	uid := auth.FirebaseUIDFromRequest(r)

	var body struct {
		Quantity int `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Quantity < 1 {
		http.Error(w, `{"message":"Invalid quantity"}`, http.StatusBadRequest)
		return
	}

	// Get current price
	var price int
	err := database.DB.QueryRow("SELECT price FROM cart_items WHERE id = ? AND firebase_uid = ?", id, uid).Scan(&price)
	if err != nil {
		http.Error(w, `{"message":"Cart item not found"}`, http.StatusNotFound)
		return
	}

	subtotal := price * body.Quantity
	_, err = database.DB.Exec(
		"UPDATE cart_items SET quantity = ?, subtotal = ? WHERE id = ? AND firebase_uid = ?",
		body.Quantity, subtotal, id, uid,
	)
	if err != nil {
		http.Error(w, `{"message":"Failed to update cart item"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":  "Updated",
		"quantity": body.Quantity,
		"subtotal": subtotal,
	})
}

// DeleteCartItemHandler — DELETE /api/user/cart/{id}
func DeleteCartItemHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	uid := auth.FirebaseUIDFromRequest(r)

	_, err := database.DB.Exec("DELETE FROM cart_items WHERE id = ? AND firebase_uid = ?", id, uid)
	if err != nil {
		http.Error(w, `{"message":"Failed to delete cart item"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Deleted"})
}

// ClearCartHandler — DELETE /api/user/cart/clear?uid=xxx
func ClearCartHandler(w http.ResponseWriter, r *http.Request) {
	uid := auth.FirebaseUIDFromRequest(r)
	if uid == "" {
		http.Error(w, `{"message":"uid is required"}`, http.StatusBadRequest)
		return
	}

	_, err := database.DB.Exec("DELETE FROM cart_items WHERE firebase_uid = ?", uid)
	if err != nil {
		http.Error(w, `{"message":"Failed to clear cart"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Cart cleared"})
}
