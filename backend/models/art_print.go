package models

import "time"

type ArtPrint struct {
	ID          int       `json:"id"`
	Title       string    `json:"title"`
	Artist      string    `json:"artist"`
	Category    string    `json:"category"`
	Description string    `json:"description,omitempty"`
	Price       int       `json:"price"`
	Stock       int       `json:"stock"`
	ImageURL    string    `json:"image_url"`
	PublicID    string    `json:"public_id"`
	CreatedAt   time.Time `json:"created_at,omitempty"`
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
}
