package handlers

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	"backend/database"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/admin"
)

func CleanupCloudinaryHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Memulai proses pembersihan Cloudinary...")

	// 1. Inisialisasi Cloudinary Admin API
	cld, err := cloudinary.NewFromParams(
		os.Getenv("CLOUDINARY_CLOUD_NAME"),
		os.Getenv("CLOUDINARY_API_KEY"),
		os.Getenv("CLOUDINARY_API_SECRET"),
	)
	if err != nil {
		http.Error(w, "Gagal inisialisasi Cloudinary", http.StatusInternalServerError)
		return
	}

	ctx := context.Background()

	// 2. Dapatkan semua URL gambar dari pesanan yang sudah ada di database
	rows, err := database.DB.Query("SELECT artwork_image_url FROM orders WHERE artwork_image_url IS NOT NULL AND artwork_image_url != ''")
	if err != nil {
		http.Error(w, "Gagal query database", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	validImageUrls := make(map[string]bool)
	for rows.Next() {
		var url sql.NullString
		if err := rows.Scan(&url); err == nil && url.Valid {
			validImageUrls[url.String] = true
		}
	}

	// 3. Dapatkan daftar gambar dari folder Cloudinary
	assets, err := cld.Admin.Assets(ctx, admin.AssetsParams{
		Prefix:     "citraframe_artworks/",
		MaxResults: 500,
	})
	if err != nil {
		http.Error(w, "Gagal mengambil daftar aset dari Cloudinary", http.StatusInternalServerError)
		return
	}

	// 4. Bandingkan dan hapus gambar yang tidak terpakai
	deletedCount := 0
	for _, asset := range assets.Assets {
		if _, exists := validImageUrls[asset.SecureURL]; !exists {
			
			// === PERBAIKAN DI SINI ===
			// Kita tidak perlu mem-parsing `asset.CreatedAt` karena sudah bertipe time.Time.
			// Langsung gunakan di dalam kondisi if.
			if time.Since(asset.CreatedAt) > (7 * 24 * time.Hour) {
				log.Printf("Menghapus gambar tidak terpakai: %s (Dibuat pada: %v)", asset.PublicID, asset.CreatedAt)
				
				_, err := cld.Admin.DeleteAssets(ctx, admin.DeleteAssetsParams{
					PublicIDs: []string{asset.PublicID},
				})
				if err != nil {
					log.Printf("Gagal menghapus aset %s: %v", asset.PublicID, err)
				} else {
					deletedCount++
				}
			}
		}
	}

	log.Printf("Proses selesai. %d gambar berhasil dihapus.", deletedCount)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Proses pembersihan selesai."))
}