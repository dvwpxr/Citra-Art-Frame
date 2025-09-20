// backend/models/slider.go
package models

import "time"

// Slider merepresentasikan struktur data untuk tabel sliders
type Slider struct {
	ID        int       `json:"id"`
	ImageURL  string    `json:"imageUrl"`
	PublicID  string    `json:"publicId"` // Kirim ke admin, tapi tidak ke publik
	AltText   string    `json:"altText"`
	CreatedAt time.Time `json:"createdAt"`
}

// SliderPublic adalah versi sederhana untuk API publik
type SliderPublic struct {
	ImageURL  string    `json:"imageUrl"`
	AltText   string    `json:"altText"`
}