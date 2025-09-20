package models

import "time"

// ArtPrint struct merepresentasikan tabel 'art_prints'
type ArtPrint struct {
	ID          int       `json:"id"`
	Title       string    `json:"title"`
	Artist      string    `json:"artist"`
	Category    string    `json:"category"`
	Description string    `json:"description,omitempty"`
	Price       int       `json:"price"`
	ImageURL    string    `json:"image_url"`
	PublicID    string    `json:"public_id"` 
	CreatedAt   time.Time `json:"created_at,omitempty"`
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
}