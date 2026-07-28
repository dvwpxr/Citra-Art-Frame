package models

import "time"

// FrameModel merepresentasikan tabel 'frame_models'
// Menyimpan metadata model 3D berformat GLTF/GLB
type FrameModel struct {
	ID                int       `json:"id"`
	ProductID         int       `json:"product_id,omitempty"`
	ProductName       string    `json:"product_name,omitempty"`
	ProductImageURL   string    `json:"product_image_url,omitempty"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	FileURL           string    `json:"file_url"`
	FileName          string    `json:"file_name"`
	ThumbnailURL      string    `json:"thumbnail_url"`
	ThumbnailPublicID string    `json:"thumbnail_public_id"`
	FileSize          int64     `json:"file_size"`
	Format            string    `json:"format"`
	FrontRotationX    int       `json:"front_rotation_x"`
	FrontRotationY    int       `json:"front_rotation_y"`
	IsActive          bool      `json:"is_active"`
	CreatedAt         time.Time `json:"created_at,omitempty"`
	UpdatedAt         time.Time `json:"updated_at,omitempty"`
}
