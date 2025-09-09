package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
)

func UploadImageHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Inisialisasi Cloudinary
	cld, err := cloudinary.NewFromParams(
		os.Getenv("CLOUDINARY_CLOUD_NAME"),
		os.Getenv("CLOUDINARY_API_KEY"),
		os.Getenv("CLOUDINARY_API_SECRET"),
	)
	if err != nil {
		http.Error(w, "Failed to initialize Cloudinary", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second) // Timeout 20 detik
	defer cancel()

	// 2. Ambil file dari request
	r.ParseMultipartForm(10 << 20) // Batas 10MB
	file, _, err := r.FormFile("artworkImage")
	if err != nil {
		http.Error(w, "Invalid image file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// 3. Upload file ke Cloudinary
	uploadResult, err := cld.Upload.Upload(ctx, file, uploader.UploadParams{
		Folder:         "citraframe_artworks/uploads",
		PublicID:       fmt.Sprintf("artwork-%d", time.Now().UnixNano()),
		Transformation: "q_auto,f_auto", // Optimasi kualitas dan format otomatis
	})
	if err != nil {
		http.Error(w, "Failed to upload image to Cloudinary", http.StatusInternalServerError)
		return
	}

	// 4. Kirim kembali respons JSON DENGAN KEY "imageUrl"
	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(map[string]string{
		"imageUrl": uploadResult.SecureURL, // Pastikan key ini "imageUrl"
	})
    if err != nil {
        // Jika ada error saat mengirim JSON, log error tersebut
        http.Error(w, "Failed to encode response", http.StatusInternalServerError)
    }
}
