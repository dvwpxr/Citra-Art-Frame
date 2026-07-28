// backend/controllers/frame_model_controller.go
// CRUD controller untuk mengelola Frame Model 3D (GLTF/GLB)

package controllers

import (
	"backend/database"
	"backend/models"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/gorilla/mux"
)

// ensureModelDir memastikan direktori uploads/models ada
func ensureModelDir() error {
	dir := "./uploads/models"
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("gagal membuat direktori: %w", err)
	}
	return nil
}

func parseLinkedProductID(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "0" {
		return 0, nil
	}
	productID, err := strconv.Atoi(raw)
	if err != nil || productID < 1 {
		return 0, fmt.Errorf("produk frame yang dipilih tidak valid")
	}
	return productID, nil
}

func nullableProductID(productID int) interface{} {
	if productID < 1 {
		return nil
	}
	return productID
}

func parseFrontRotationY(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	rotation, err := strconv.Atoi(raw)
	if err != nil || (rotation != 0 && rotation != 180) {
		return 0, fmt.Errorf("arah depan model harus Normal atau Balik 180 derajat")
	}
	return rotation, nil
}

func parseFrontRotationX(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	rotation, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("sudut kemiringan (pitch) harus berupa angka valid")
	}
	if rotation < -90 || rotation > 90 {
		return 0, fmt.Errorf("sudut kemiringan (pitch) harus antara -90 dan 90 derajat")
	}
	return rotation, nil
}

// validateFrameProductLink memastikan model hanya ditautkan ke produk Frame dan
// satu produk tidak dipakai oleh lebih dari satu model 3D.
func validateFrameProductLink(productID, excludeModelID int) (string, string, error) {
	if productID < 1 {
		return "", "", nil
	}

	var productName, category string
	var productImage sql.NullString
	err := database.DB.QueryRow(
		"SELECT name, category, image_url FROM products WHERE id = ?", productID,
	).Scan(&productName, &category, &productImage)
	if err == sql.ErrNoRows {
		return "", "", fmt.Errorf("produk frame tidak ditemukan")
	}
	if err != nil {
		return "", "", fmt.Errorf("gagal memeriksa produk frame: %w", err)
	}
	normalizedCategory := strings.ToUpper(strings.TrimSpace(category))
	if normalizedCategory == "ART PRINT" || normalizedCategory == "ARTPRINT" {
		return "", "", fmt.Errorf("model 3D frame tidak dapat ditautkan ke produk Art Print")
	}

	var linkedModelID int
	err = database.DB.QueryRow(
		"SELECT id FROM frame_models WHERE product_id = ? AND id <> ? LIMIT 1",
		productID, excludeModelID,
	).Scan(&linkedModelID)
	if err == nil {
		return "", "", fmt.Errorf("produk %q sudah terhubung ke model 3D lain", productName)
	}
	if err != sql.ErrNoRows {
		return "", "", fmt.Errorf("gagal memeriksa relasi model 3D: %w", err)
	}

	return productName, productImage.String, nil
}

// GetFrameModels mengambil semua frame model dari database
func GetFrameModels(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(
		`SELECT fm.id, COALESCE(fm.product_id, 0), COALESCE(p.name, ''), COALESCE(p.image_url, ''),
		        fm.name, fm.description, fm.file_url, fm.file_name,
		        COALESCE(fm.thumbnail_url,''), COALESCE(fm.thumbnail_public_id,''),
		        fm.file_size, fm.format, COALESCE(fm.front_rotation_x, 0), COALESCE(fm.front_rotation_y, 0),
		        fm.is_active, fm.created_at, fm.updated_at
		 FROM frame_models fm
		 LEFT JOIN products p ON p.id = fm.product_id
		 ORDER BY fm.created_at DESC`,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var items []models.FrameModel
	for rows.Next() {
		var m models.FrameModel
		if err := rows.Scan(
			&m.ID, &m.ProductID, &m.ProductName, &m.ProductImageURL,
			&m.Name, &m.Description, &m.FileURL, &m.FileName,
			&m.ThumbnailURL, &m.ThumbnailPublicID,
			&m.FileSize, &m.Format, &m.FrontRotationX, &m.FrontRotationY,
			&m.IsActive, &m.CreatedAt, &m.UpdatedAt,
		); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal scan data: "+err.Error())
			return
		}
		items = append(items, m)
	}
	if items == nil {
		items = []models.FrameModel{}
	}
	respondJSON(w, http.StatusOK, items)
}

// GetFrameModel mengambil satu frame model berdasarkan ID
func GetFrameModel(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])

	var m models.FrameModel
	err := database.DB.QueryRow(
		`SELECT fm.id, COALESCE(fm.product_id, 0), COALESCE(p.name, ''), COALESCE(p.image_url, ''),
		        fm.name, fm.description, fm.file_url, fm.file_name,
		        COALESCE(fm.thumbnail_url,''), COALESCE(fm.thumbnail_public_id,''),
		        fm.file_size, fm.format, COALESCE(fm.front_rotation_x, 0), COALESCE(fm.front_rotation_y, 0),
		        fm.is_active, fm.created_at, fm.updated_at
		 FROM frame_models fm
		 LEFT JOIN products p ON p.id = fm.product_id
		 WHERE fm.id = ?`, id,
	).Scan(
		&m.ID, &m.ProductID, &m.ProductName, &m.ProductImageURL,
		&m.Name, &m.Description, &m.FileURL, &m.FileName,
		&m.ThumbnailURL, &m.ThumbnailPublicID,
		&m.FileSize, &m.Format, &m.FrontRotationX, &m.FrontRotationY,
		&m.IsActive, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Frame model tidak ditemukan")
		} else {
			respondError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	respondJSON(w, http.StatusOK, m)
}

// CreateFrameModel membuat frame model baru
// Menerima multipart/form-data: name, description, model_file (wajib), thumbnail (opsional)
func CreateFrameModel(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(200 << 20); err != nil { // max 200MB
		respondError(w, http.StatusBadRequest, "Ukuran file terlalu besar (maks 200MB)")
		return
	}

	name := strings.TrimSpace(r.FormValue("name"))
	description := strings.TrimSpace(r.FormValue("description"))
	isActive := r.FormValue("is_active") != "false"
	productID, err := parseLinkedProductID(r.FormValue("product_id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if name == "" {
		respondError(w, http.StatusBadRequest, "Nama frame model wajib diisi")
		return
	}
	frontRotationY, err := parseFrontRotationY(r.FormValue("front_rotation_y"))
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	frontRotationX, err := parseFrontRotationX(r.FormValue("front_rotation_x"))
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	productName, productImageURL, err := validateFrameProductLink(productID, 0)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// === Validasi & simpan file 3D ===
	modelFile, modelHeader, err := r.FormFile("model_file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "File model 3D tidak ditemukan di request")
		return
	}
	defer modelFile.Close()

	// Validasi ekstensi file
	ext := strings.ToLower(filepath.Ext(modelHeader.Filename))
	if ext != ".glb" && ext != ".gltf" {
		respondError(w, http.StatusBadRequest, "Format file tidak valid. Hanya .glb dan .gltf yang diizinkan")
		return
	}

	if err := ensureModelDir(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Generate nama file unik
	timestamp := time.Now().UnixNano()
	safeOrigName := sanitizeFileName(modelHeader.Filename)
	uniqueFileName := fmt.Sprintf("%d-%s", timestamp, safeOrigName)
	savePath := filepath.Join("./uploads/models", uniqueFileName)

	outFile, err := os.Create(savePath)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal membuat file di server")
		return
	}
	defer outFile.Close()

	written, err := io.Copy(outFile, modelFile)
	if err != nil {
		os.Remove(savePath)
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan file model")
		return
	}

	fileURL := "/uploads/models/" + uniqueFileName
	format := strings.TrimPrefix(ext, ".")

	// === Upload thumbnail ke Cloudinary (opsional) ===
	thumbnailURL := ""
	thumbnailPublicID := ""
	thumbFile, _, thumbErr := r.FormFile("thumbnail")
	if thumbErr == nil {
		defer thumbFile.Close()
		uploadResult, upErr := database.Cld.Upload.Upload(
			database.Ctx, thumbFile,
			uploader.UploadParams{Folder: "citraframe-frame-models"},
		)
		if upErr == nil {
			thumbnailURL = uploadResult.SecureURL
			thumbnailPublicID = uploadResult.PublicID
		} else {
			log.Printf("Peringatan: Gagal upload thumbnail: %v", upErr)
		}
	}

	result, err := database.DB.Exec(
		`INSERT INTO frame_models (product_id, name, description, file_url, file_name, thumbnail_url, thumbnail_public_id, file_size, format, front_rotation_x, front_rotation_y, is_active)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		nullableProductID(productID), name, description, fileURL, uniqueFileName, thumbnailURL, thumbnailPublicID, written, format, frontRotationX, frontRotationY, isActive,
	)
	if err != nil {
		os.Remove(savePath)
		respondError(w, http.StatusInternalServerError, "Gagal menyimpan ke database: "+err.Error())
		return
	}

	id, _ := result.LastInsertId()
	m := models.FrameModel{
		ID:                int(id),
		ProductID:         productID,
		ProductName:       productName,
		ProductImageURL:   productImageURL,
		Name:              name,
		Description:       description,
		FileURL:           fileURL,
		FileName:          uniqueFileName,
		ThumbnailURL:      thumbnailURL,
		ThumbnailPublicID: thumbnailPublicID,
		FileSize:          written,
		Format:            format,
		FrontRotationX:    frontRotationX,
		FrontRotationY:    frontRotationY,
		IsActive:          isActive,
	}
	respondJSON(w, http.StatusCreated, m)
}

// UpdateFrameModel mengupdate frame model yang sudah ada
func UpdateFrameModel(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])

	if err := r.ParseMultipartForm(200 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Request error")
		return
	}

	// Ambil data existing
	var existing models.FrameModel
	err := database.DB.QueryRow(
		`SELECT id, file_url, file_name, COALESCE(thumbnail_url,''), COALESCE(thumbnail_public_id,''),
		        file_size, format, COALESCE(product_id, 0), COALESCE(front_rotation_x, 0), COALESCE(front_rotation_y, 0)
		 FROM frame_models WHERE id = ?`, id,
	).Scan(
		&existing.ID, &existing.FileURL, &existing.FileName,
		&existing.ThumbnailURL, &existing.ThumbnailPublicID,
		&existing.FileSize, &existing.Format, &existing.ProductID, &existing.FrontRotationX, &existing.FrontRotationY,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "Frame model tidak ditemukan")
		} else {
			respondError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	name := strings.TrimSpace(r.FormValue("name"))
	description := strings.TrimSpace(r.FormValue("description"))
	isActive := r.FormValue("is_active") != "false"
	productID, parseErr := parseLinkedProductID(r.FormValue("product_id"))
	if parseErr != nil {
		respondError(w, http.StatusBadRequest, parseErr.Error())
		return
	}

	if name == "" {
		respondError(w, http.StatusBadRequest, "Nama frame model wajib diisi")
		return
	}
	frontRotationY, rotationErr := parseFrontRotationY(r.FormValue("front_rotation_y"))
	if rotationErr != nil {
		respondError(w, http.StatusBadRequest, rotationErr.Error())
		return
	}
	frontRotationX, pitchErr := parseFrontRotationX(r.FormValue("front_rotation_x"))
	if pitchErr != nil {
		respondError(w, http.StatusBadRequest, pitchErr.Error())
		return
	}
	productName, productImageURL, linkErr := validateFrameProductLink(productID, id)
	if linkErr != nil {
		respondError(w, http.StatusBadRequest, linkErr.Error())
		return
	}

	// Gunakan data lama sebagai default
	fileURL := existing.FileURL
	fileName := existing.FileName
	thumbnailURL := existing.ThumbnailURL
	thumbnailPublicID := existing.ThumbnailPublicID
	fileSize := existing.FileSize
	format := existing.Format

	// === Cek apakah ada file model baru ===
	newModelFile, newModelHeader, newModelErr := r.FormFile("model_file")
	if newModelErr == nil {
		defer newModelFile.Close()

		ext := strings.ToLower(filepath.Ext(newModelHeader.Filename))
		if ext != ".glb" && ext != ".gltf" {
			respondError(w, http.StatusBadRequest, "Format file tidak valid. Hanya .glb dan .gltf yang diizinkan")
			return
		}

		if err := ensureModelDir(); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// Hapus file lama
		oldPath := filepath.Join("./uploads/models", existing.FileName)
		if _, statErr := os.Stat(oldPath); statErr == nil {
			os.Remove(oldPath)
		}

		// Simpan file baru
		timestamp := time.Now().UnixNano()
		safeOrigName := sanitizeFileName(newModelHeader.Filename)
		uniqueFileName := fmt.Sprintf("%d-%s", timestamp, safeOrigName)
		savePath := filepath.Join("./uploads/models", uniqueFileName)

		outFile, createErr := os.Create(savePath)
		if createErr != nil {
			respondError(w, http.StatusInternalServerError, "Gagal membuat file baru")
			return
		}
		defer outFile.Close()

		written, copyErr := io.Copy(outFile, newModelFile)
		if copyErr != nil {
			os.Remove(savePath)
			respondError(w, http.StatusInternalServerError, "Gagal menyimpan file baru")
			return
		}

		fileURL = "/uploads/models/" + uniqueFileName
		fileName = uniqueFileName
		fileSize = written
		format = strings.TrimPrefix(ext, ".")
	}

	// === Cek apakah ada thumbnail baru ===
	newThumbFile, _, newThumbErr := r.FormFile("thumbnail")
	if newThumbErr == nil {
		defer newThumbFile.Close()

		// Hapus thumbnail lama dari Cloudinary
		if thumbnailPublicID != "" {
			database.Cld.Upload.Destroy(database.Ctx, uploader.DestroyParams{PublicID: thumbnailPublicID})
		}

		// Upload thumbnail baru
		uploadResult, upErr := database.Cld.Upload.Upload(
			database.Ctx, newThumbFile,
			uploader.UploadParams{Folder: "citraframe-frame-models"},
		)
		if upErr == nil {
			thumbnailURL = uploadResult.SecureURL
			thumbnailPublicID = uploadResult.PublicID
		} else {
			log.Printf("Peringatan: Gagal upload thumbnail baru: %v", upErr)
		}
	}

	_, err = database.DB.Exec(
		`UPDATE frame_models
		 SET product_id=?, name=?, description=?, file_url=?, file_name=?, thumbnail_url=?, thumbnail_public_id=?, file_size=?, format=?, front_rotation_x=?, front_rotation_y=?, is_active=?
		 WHERE id=?`,
		nullableProductID(productID), name, description, fileURL, fileName, thumbnailURL, thumbnailPublicID, fileSize, format, frontRotationX, frontRotationY, isActive, id,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal mengupdate database: "+err.Error())
		return
	}

	m := models.FrameModel{
		ID:                id,
		ProductID:         productID,
		ProductName:       productName,
		ProductImageURL:   productImageURL,
		Name:              name,
		Description:       description,
		FileURL:           fileURL,
		FileName:          fileName,
		ThumbnailURL:      thumbnailURL,
		ThumbnailPublicID: thumbnailPublicID,
		FileSize:          fileSize,
		Format:            format,
		FrontRotationX:    frontRotationX,
		FrontRotationY:    frontRotationY,
		IsActive:          isActive,
	}
	respondJSON(w, http.StatusOK, m)
}

// DeleteFrameModel menghapus frame model dari DB dan file lokal
func DeleteFrameModel(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])

	var fileName, thumbnailPublicID string
	err := database.DB.QueryRow(
		"SELECT file_name, COALESCE(thumbnail_public_id,'') FROM frame_models WHERE id = ?", id,
	).Scan(&fileName, &thumbnailPublicID)
	if err != nil && err != sql.ErrNoRows {
		respondError(w, http.StatusInternalServerError, "Gagal mengambil data frame model")
		return
	}

	// Hapus thumbnail dari Cloudinary
	if thumbnailPublicID != "" {
		_, cldErr := database.Cld.Upload.Destroy(database.Ctx, uploader.DestroyParams{PublicID: thumbnailPublicID})
		if cldErr != nil {
			log.Printf("Peringatan: Gagal menghapus thumbnail dari Cloudinary: %v", cldErr)
		}
	}

	// Hapus file model lokal
	if fileName != "" {
		localPath := filepath.Join("./uploads/models", fileName)
		if _, statErr := os.Stat(localPath); statErr == nil {
			if removeErr := os.Remove(localPath); removeErr != nil {
				log.Printf("Peringatan: Gagal menghapus file model lokal: %v", removeErr)
			}
		}
	}

	// Hapus dari database
	_, err = database.DB.Exec("DELETE FROM frame_models WHERE id = ?", id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal menghapus dari database")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// sanitizeFileName menghapus karakter berbahaya dari nama file
func sanitizeFileName(name string) string {
	name = filepath.Base(name)
	// Ganti spasi dan karakter khusus dengan underscore
	safe := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '-' {
			return r
		}
		return '_'
	}, name)
	if safe == "" {
		return "model.glb"
	}
	return safe
}

// ToggleFrameModelStatus mengaktifkan/menonaktifkan frame model
func ToggleFrameModelStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])

	var req struct {
		IsActive bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Request tidak valid")
		return
	}

	_, err := database.DB.Exec("UPDATE frame_models SET is_active = ? WHERE id = ?", req.IsActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal mengupdate status")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"id": id, "is_active": req.IsActive})
}
