// backend/controllers/slider_controller.go
package controllers

import (
	"backend/database"
	"backend/models"
	"net/http"

	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/gorilla/mux"
)

// GetSlidersAPI untuk halaman utama (publik)
func GetSlidersAPI(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query("SELECT image_url, alt_text FROM sliders ORDER BY created_at DESC")
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	sliders := []models.SliderPublic{}
	for rows.Next() {
		var s models.SliderPublic
		if err := rows.Scan(&s.ImageURL, &s.AltText); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		sliders = append(sliders, s)
	}
	respondJSON(w, http.StatusOK, sliders)
}

// GetSlidersAdmin untuk halaman dashboard admin
func GetSlidersAdmin(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query("SELECT id, image_url, public_id, alt_text FROM sliders ORDER BY created_at DESC")
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	sliders := []models.Slider{}
	for rows.Next() {
		var s models.Slider
		if err := rows.Scan(&s.ID, &s.ImageURL, &s.PublicID, &s.AltText); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		sliders = append(sliders, s)
	}
	respondJSON(w, http.StatusOK, sliders)
}

// CreateSlider untuk menambah gambar baru
func CreateSlider(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB limit
		respondError(w, http.StatusBadRequest, "File too large")
		return
	}

	file, _, err := r.FormFile("image")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid image file")
		return
	}
	defer file.Close()

	uploadParams := uploader.UploadParams{
		Folder: "citraframe-slider",
		Transformation: "w_1920,h_1080,c_fill",
	}
	uploadResult, err := database.Cld.Upload.Upload(database.Ctx, file, uploadParams)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	altText := r.FormValue("altText")
	_, err = database.DB.Exec("INSERT INTO sliders (image_url, public_id, alt_text) VALUES (?, ?, ?)",
		uploadResult.SecureURL, uploadResult.PublicID, altText)
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
	err := database.DB.QueryRow("SELECT public_id FROM sliders WHERE id = ?", id).Scan(&publicID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Slider not found")
		return
	}

	_, err = database.Cld.Upload.Destroy(database.Ctx, uploader.DestroyParams{PublicID: publicID})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete from Cloudinary")
		return
	}

	_, err = database.DB.Exec("DELETE FROM sliders WHERE id = ?", id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete from database")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "Slider deleted successfully"})
}