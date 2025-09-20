package models

import "time"

// Product struct merepresentasikan tabel 'products'
type Product struct {
    ID             int       `json:"id"`
    Name           string    `json:"name"`
    Description    string    `json:"description"`
    Price          int       `json:"price"`
    Stock          int       `json:"stock"`
    Category       string    `json:"category"`
    ImageURL       string    `json:"image_url"`
    PublicID       string    `json:"public_id"` 
    DetailImageUrl string    `json:"detail_image_url"`
	BorderSlice    int       `json:"border_slice"`
	InsetTop       float64   `json:"inset_top"`
    InsetRight     float64   `json:"inset_right"`
    InsetBottom    float64   `json:"inset_bottom"`
    InsetLeft      float64   `json:"inset_left"`
    CreatedAt      time.Time `json:"created_at,omitempty"`
    UpdatedAt      time.Time `json:"updated_at,omitempty"`
    IsPopular      bool      `json:"is_popular"`
    RenderMode     string    `json:"render_mode"`
}

// CustomOrder struct merepresentasikan tabel 'custom_orders'
type CustomOrder struct {
	ID            int    `json:"id"`
	FrameModel    string `json:"frame_model"`
	ArtworkWidth  int    `json:"artwork_width"`
	ArtworkHeight int    `json:"artwork_height"`
	MatWidth      int    `json:"mat_width"`
	MatColor      string `json:"mat_color"`
	TotalPrice    int    `json:"total_price"`
}

// LoginRequest struct untuk body request login admin
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}