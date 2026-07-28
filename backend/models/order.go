// backend/models/order.go
package models

import "time"

type OrderItem struct {
	ProductID int         `json:"product_id"`
	Name      string      `json:"name"`
	Category  string      `json:"category"`
	Price     int         `json:"price"`
	Quantity  int         `json:"quantity"`
	Details   interface{} `json:"details"`
}

type Order struct {
	ID            int       `json:"id"`
	CustomerName  string    `json:"customer_name"`
	CustomerEmail string    `json:"customer_email"`
	CustomerPhone string    `json:"customer_phone"`
	TotalPrice    int       `json:"total_price"`
	Status        string    `json:"status"` // PENDING, PAID, FAILED, SHIPPED, COMPLETED
	FlipLinkID    string    `json:"flip_link_id,omitempty"`
	Items         string    `json:"items"` // JSON string dari []OrderItem
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Struct untuk request dari frontend
type CreateOrderRequest struct {
	CustomerName    string      `json:"customer_name"`
	CustomerEmail   string      `json:"customer_email"`
	CustomerPhone   string      `json:"customer_phone"`
	FirebaseUID     string      `json:"firebase_uid"`
	TotalPrice      int         `json:"total_price"` // total_amount di DB
	Subtotal        int         `json:"subtotal"`
	ShippingCost    int         `json:"shipping_cost"`
	ShippingAddress string      `json:"shipping_address"`
	Items           []OrderItem `json:"items"`

	// Address snapshot fields
	ReceiverName string `json:"receiver_name"`
	Phone        string `json:"phone"`
	Province     string `json:"province"`
	City         string `json:"city"`
	District     string `json:"district"`
	Village      string `json:"village"`
	PostalCode   string `json:"postal_code"`
	FullAddress  string `json:"full_address"`
	VillageCode  string `json:"village_code"`

	// Shipping/courier fields
	CourierCode        string  `json:"courier_code"`
	CourierName        string  `json:"courier_name"`
	ShippingPrice      int     `json:"shipping_price"`
	ShippingEstimation string  `json:"shipping_estimation"`
	Weight             float64 `json:"weight"`

	// Payment method selected by customer in checkout UI.
	PaymentMethod string `json:"payment_method"`
}
