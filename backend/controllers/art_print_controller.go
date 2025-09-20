package controllers

import (
	"backend/database"
	"backend/models"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/gorilla/mux"
)

// === READ ALL: Mendapatkan semua art prints ===
func GetArtPrints(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query("SELECT id, title, artist, category, description, price, image_url, created_at FROM art_prints ORDER BY id DESC")
	if err != nil {
		http.Error(w, "Gagal mengambil data: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var prints []models.ArtPrint
	for rows.Next() {
		var p models.ArtPrint
		if err := rows.Scan(&p.ID, &p.Title, &p.Artist, &p.Category, &p.Description, &p.Price, &p.ImageURL, &p.CreatedAt); err != nil {
			http.Error(w, "Gagal memindai data: "+err.Error(), http.StatusInternalServerError)
			return
		}
		prints = append(prints, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(prints)
}

// === READ ONE: Mendapatkan satu art print berdasarkan ID ===
func GetArtPrint(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "ID tidak valid", http.StatusBadRequest)
		return
	}

	var p models.ArtPrint
	// [FIX] Menggunakan placeholder "?" untuk MySQL
	err = database.DB.QueryRow("SELECT id, title, artist, category, description, price, image_url, created_at FROM art_prints WHERE id = ?", id).Scan(&p.ID, &p.Title, &p.Artist, &p.Category, &p.Description, &p.Price, &p.ImageURL, &p.CreatedAt)
	if err != nil {
		http.Error(w, "Art print tidak ditemukan", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

// === CREATE: Membuat art print baru dengan upload gambar ===
func CreateArtPrint(w http.ResponseWriter, r *http.Request) {
    if err := r.ParseMultipartForm(10 << 20); err != nil { // Limit 10MB
        respondError(w, http.StatusBadRequest, "Ukuran file terlalu besar")
        return
    }

    file, _, err := r.FormFile("image") // Ambil file dari form dengan nama 'image'
    if err != nil {
        respondError(w, http.StatusBadRequest, "File gambar tidak valid")
        return
    }
    defer file.Close()

    uploadResult, err := database.Cld.Upload.Upload(database.Ctx, file, uploader.UploadParams{Folder: "citraframe-artprints"})
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal mengunggah gambar")
        return
    }

    price, _ := strconv.Atoi(r.FormValue("price"))

    p := models.ArtPrint{
        Title:       r.FormValue("title"),
        Artist:      r.FormValue("artist"),
        Category:    r.FormValue("category"),
        Description: r.FormValue("description"),
        Price:       price,
        ImageURL:    uploadResult.SecureURL,
        PublicID:    uploadResult.PublicID,
    }

    result, err := database.DB.Exec(
        "INSERT INTO art_prints (title, artist, category, description, price, image_url, public_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        p.Title, p.Artist, p.Category, p.Description, p.Price, p.ImageURL, p.PublicID,
    )
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal menyimpan data: "+err.Error())
        return
    }

    id, _ := result.LastInsertId()
    p.ID = int(id)

    respondJSON(w, http.StatusCreated, p)
}

// === UPDATE: Memperbarui art print dengan atau tanpa gambar baru ===
func UpdateArtPrint(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, _ := strconv.Atoi(vars["id"])

    if err := r.ParseMultipartForm(10 << 20); err != nil {
        respondError(w, http.StatusBadRequest, "Request error")
        return
    }

    var existingPrint models.ArtPrint
    err := database.DB.QueryRow("SELECT image_url, public_id FROM art_prints WHERE id=?", id).Scan(&existingPrint.ImageURL, &existingPrint.PublicID)
    if err != nil {
        respondError(w, http.StatusNotFound, "Art print tidak ditemukan")
        return
    }

    price, _ := strconv.Atoi(r.FormValue("price"))

    p := models.ArtPrint{
        ID:          id,
        Title:       r.FormValue("title"),
        Artist:      r.FormValue("artist"),
        Category:    r.FormValue("category"),
        Description: r.FormValue("description"),
        Price:       price,
        ImageURL:    existingPrint.ImageURL,
        PublicID:    existingPrint.PublicID,
    }

    file, _, err := r.FormFile("image")
    if err == nil { // Ada file gambar baru
        defer file.Close()
        if p.PublicID != "" {
            database.Cld.Upload.Destroy(database.Ctx, uploader.DestroyParams{PublicID: p.PublicID})
        }
        
        uploadResult, uploadErr := database.Cld.Upload.Upload(database.Ctx, file, uploader.UploadParams{Folder: "citraframe-artprints"})
        if uploadErr != nil {
            respondError(w, http.StatusInternalServerError, "Gagal mengunggah gambar baru")
            return
        }
        p.ImageURL = uploadResult.SecureURL
        p.PublicID = uploadResult.PublicID
    }

    _, err = database.DB.Exec(
        "UPDATE art_prints SET title=?, artist=?, category=?, description=?, price=?, image_url=?, public_id=?, updated_at=NOW() WHERE id=?",
        p.Title, p.Artist, p.Category, p.Description, p.Price, p.ImageURL, p.PublicID, id,
    )
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal memperbarui data: "+err.Error())
        return
    }

    respondJSON(w, http.StatusOK, p)
}

// === DELETE: Menghapus art print dan gambar di Cloudinary ===
func DeleteArtPrint(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, _ := strconv.Atoi(vars["id"])

    var publicID sql.NullString
    err := database.DB.QueryRow("SELECT public_id FROM art_prints WHERE id = ?", id).Scan(&publicID)
    if err != nil && err != sql.ErrNoRows {
        respondError(w, http.StatusInternalServerError, "Gagal mengambil data art print")
        return
    }

    if publicID.Valid && publicID.String != "" {
        _, err = database.Cld.Upload.Destroy(database.Ctx, uploader.DestroyParams{PublicID: publicID.String})
        if err != nil {
            log.Printf("Gagal menghapus gambar dari Cloudinary: %v", err)
        }
    }

    _, err = database.DB.Exec("DELETE FROM art_prints WHERE id = ?", id)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal menghapus data")
        return
    }

    w.WriteHeader(http.StatusNoContent)
}