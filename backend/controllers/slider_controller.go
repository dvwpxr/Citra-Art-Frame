// backend/controllers/slider_controller.go
package controllers

import (
	"backend/database"
	"backend/models"
	"database/sql"
	"log"
	"net/http"

	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/gorilla/mux"
)

// GetSlidersAPI untuk halaman utama (publik)
func GetSlidersAPI(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query("SELECT image_url, CASE WHEN mobile_image_url IS NULL OR mobile_image_url = '' THEN image_url ELSE mobile_image_url END as mobile_image_url, alt_text FROM sliders ORDER BY created_at DESC")
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	sliders := []models.SliderPublic{}
	for rows.Next() {
		var s models.SliderPublic
		if err := rows.Scan(&s.ImageURL, &s.MobileImageURL, &s.AltText); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		sliders = append(sliders, s)
	}
	respondJSON(w, http.StatusOK, sliders)
}

// GetSlidersAdmin untuk halaman dashboard admin
func GetSlidersAdmin(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query("SELECT id, image_url, public_id, COALESCE(mobile_image_url, ''), COALESCE(mobile_public_id, ''), alt_text FROM sliders ORDER BY created_at DESC")
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	sliders := []models.Slider{}
	for rows.Next() {
		var s models.Slider
		if err := rows.Scan(&s.ID, &s.ImageURL, &s.PublicID, &s.MobileImageURL, &s.MobilePublicID, &s.AltText); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		sliders = append(sliders, s)
	}
	respondJSON(w, http.StatusOK, sliders)
}

// CreateSlider untuk menambah gambar baru
func CreateSlider(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(20 << 20); err != nil { // 20 MB limit to allow two images
		respondError(w, http.StatusBadRequest, "File too large")
		return
	}

	file, _, err := r.FormFile("image")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid desktop image file")
		return
	}
	defer file.Close()

	uploadParams := uploader.UploadParams{
		Folder:         "citraframe-slider",
		Transformation: "w_1920,h_1080,c_fill",
	}
	uploadResult, err := database.Cld.Upload.Upload(database.Ctx, file, uploadParams)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Handle mobile image (optional)
	var mobileImageURL, mobilePublicID string
	mobileFile, _, mobileErr := r.FormFile("mobile_image")
	if mobileErr == nil {
		defer mobileFile.Close()
		mobileUploadParams := uploader.UploadParams{
			Folder:         "citraframe-slider-mobile",
			Transformation: "w_768,h_1024,c_fill", // Adjust as needed
		}
		mobileUploadResult, err := database.Cld.Upload.Upload(database.Ctx, mobileFile, mobileUploadParams)
		if err == nil {
			mobileImageURL = mobileUploadResult.SecureURL
			mobilePublicID = mobileUploadResult.PublicID
		}
	}

	altText := r.FormValue("altText")
	_, err = database.DB.Exec("INSERT INTO sliders (image_url, public_id, mobile_image_url, mobile_public_id, alt_text) VALUES (?, ?, ?, ?, ?)",
		uploadResult.SecureURL, uploadResult.PublicID, mobileImageURL, mobilePublicID, altText)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, uploadResult)
}

// DeleteSlider untuk menghapus gambar
func DeleteSlider(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var publicID string
	var mobilePublicID sql.NullString
	err := database.DB.QueryRow("SELECT public_id, mobile_public_id FROM sliders WHERE id = ?", id).Scan(&publicID, &mobilePublicID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Slider not found")
		return
	}

	_, err = database.Cld.Upload.Destroy(database.Ctx, uploader.DestroyParams{PublicID: publicID})
	if err != nil {
		// Continue even if cloudinary delete fails
		log.Println("Failed to delete from Cloudinary:", err)
	}

	if mobilePublicID.Valid && mobilePublicID.String != "" {
		_, err = database.Cld.Upload.Destroy(database.Ctx, uploader.DestroyParams{PublicID: mobilePublicID.String})
		if err != nil {
			log.Println("Failed to delete mobile image from Cloudinary:", err)
		}
	}

	_, err = database.DB.Exec("DELETE FROM sliders WHERE id = ?", id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete from database")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "Slider deleted successfully"})
}
