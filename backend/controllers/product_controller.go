// backend/controllers/product_controller.go

package controllers

import (
	"backend/database"
	"backend/models"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/gorilla/mux"
)

// Konversi string form ke float64
func parseFloat(s string, defaultValue float64) float64 {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return defaultValue
	}
	return f
}
// GET ALL PRODUCT FROM DATABASE
func GetProducts(w http.ResponseWriter, r *http.Request) {
    category := r.URL.Query().Get("category")
    query := "SELECT id, name, description, price, stock, category, image_url, detail_image_url, is_popular, public_id, border_slice, inset_top, inset_right, inset_bottom, inset_left, render_mode FROM products"
    var args []interface{}
    if r.URL.Path == "/api/products/frames" {
        category = "Frame"
    }
    if category != "" {
        query += " WHERE UPPER(category) = ?"
        args = append(args, strings.ToUpper(category))
    }
    rows, err := database.DB.Query(query, args...)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }
    defer rows.Close()

    var products []models.Product
    for rows.Next() {
        var p models.Product
        var publicID, detailImageURL, renderMode sql.NullString 
        var borderSlice sql.NullInt32
        var insetT, insetR, insetB, insetL sql.NullFloat64 
        
        if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock, &p.Category, &p.ImageURL, &detailImageURL, &p.IsPopular, &publicID, &borderSlice, &insetT, &insetR, &insetB, &insetL, &renderMode); err != nil {
             respondError(w, http.StatusInternalServerError, "Gagal scan data produk: "+err.Error())
             return
        }

        if publicID.Valid { p.PublicID = publicID.String }
        if detailImageURL.Valid { p.DetailImageUrl = detailImageURL.String }
        if borderSlice.Valid { p.BorderSlice = int(borderSlice.Int32) }
        if insetT.Valid { p.InsetTop = insetT.Float64 }
        if insetR.Valid { p.InsetRight = insetR.Float64 }
        if insetB.Valid { p.InsetBottom = insetB.Float64 }
        if insetL.Valid { p.InsetLeft = insetL.Float64 }
        if renderMode.Valid { p.RenderMode = renderMode.String }
        
        products = append(products, p)
    }
    respondJSON(w, http.StatusOK, products)
}

// GetProduct mengambil satu produk berdasarkan ID
func GetProduct(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, _ := strconv.Atoi(vars["id"])
    var p models.Product
    var publicID, detailImageURL sql.NullString
    var borderSlice sql.NullInt32
    var insetT, insetR, insetB, insetL sql.NullFloat64

    err := database.DB.QueryRow("SELECT id, name, description, price, stock, category, image_url, detail_image_url, is_popular, public_id, border_slice, inset_top, inset_right, inset_bottom, inset_left FROM products WHERE id = ?", id).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock, &p.Category, &p.ImageURL, &detailImageURL, &p.IsPopular, &publicID, &borderSlice, &insetT, &insetR, &insetB, &insetL)
    if err != nil {
        if err == sql.ErrNoRows { respondError(w, http.StatusNotFound, "Product not found") } else { respondError(w, http.StatusInternalServerError, err.Error()) }
        return
    }
    
    if publicID.Valid { p.PublicID = publicID.String }
    if detailImageURL.Valid { p.DetailImageUrl = detailImageURL.String }
    if borderSlice.Valid { p.BorderSlice = int(borderSlice.Int32) }
    if insetT.Valid { p.InsetTop = insetT.Float64 }
    if insetR.Valid { p.InsetRight = insetR.Float64 }
    if insetB.Valid { p.InsetBottom = insetB.Float64 }
    if insetL.Valid { p.InsetLeft = insetL.Float64 }
    
    respondJSON(w, http.StatusOK, p)
}


// GetPopularFrames mengambil frame yang populer
func GetPopularFrames(w http.ResponseWriter, r *http.Request) {
    rows, err := database.DB.Query("SELECT id, name, description, image_url, border_slice, inset_top, inset_right, inset_bottom, inset_left FROM products WHERE is_popular = TRUE ORDER BY name ASC")
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }
    defer rows.Close()

    products := []map[string]interface{}{}
    for rows.Next() {
        var p models.Product
        // Scan semua field yang di SELECT
        if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.ImageURL, &p.BorderSlice, &p.InsetTop, &p.InsetRight, &p.InsetBottom, &p.InsetLeft); err != nil {
            respondError(w, http.StatusInternalServerError, err.Error())
            return
        }
        products = append(products, map[string]interface{}{
            "id":           p.ID,
            "name":         p.Name,
            "description":  p.Description,
            "image_url":    p.ImageURL,
            "border_slice": p.BorderSlice,
            "insets": map[string]float64{
                "top":    p.InsetTop,
                "right":  p.InsetRight,
                "bottom": p.InsetBottom,
                "left":   p.InsetLeft,
            },
        })
    }
    respondJSON(w, http.StatusOK, products)
}

// Sisa file tidak berubah
func SetPopular(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id := vars["id"]
    _, err := database.DB.Exec("UPDATE products SET is_popular = TRUE WHERE id = ?", id)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to update product status")
        return
    }
    respondJSON(w, http.StatusOK, map[string]string{"message": "Product marked as popular"})
}
func RemovePopular(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id := vars["id"]
    _, err := database.DB.Exec("UPDATE products SET is_popular = FALSE WHERE id = ?", id)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to update product status")
        return
    }
    respondJSON(w, http.StatusOK, map[string]string{"message": "Product removed from popular"})
}
func CreateProduct(w http.ResponseWriter, r *http.Request) {
    if err := r.ParseMultipartForm(10 << 20); err != nil {
        respondError(w, http.StatusBadRequest, "Ukuran file terlalu besar")
        return
    }
    file, _, err := r.FormFile("image")
    if err != nil {
        respondError(w, http.StatusBadRequest, "File gambar tidak valid")
        return
    }
    defer file.Close()
    uploadResult, err := database.Cld.Upload.Upload(database.Ctx, file, uploader.UploadParams{Folder: "citraframe-products"})
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal mengunggah gambar")
        return
    }
    price, _ := strconv.Atoi(r.FormValue("price"))
    stock, _ := strconv.Atoi(r.FormValue("stock"))
    borderSlice, _ := strconv.Atoi(r.FormValue("border_slice"))
    if borderSlice == 0 {
        borderSlice = 40
    }
    p := models.Product{
        Name:           r.FormValue("name"),
        Description:    r.FormValue("description"),
        Price:          price,
        Stock:          stock,
        Category:       r.FormValue("category"),
        ImageURL:       uploadResult.SecureURL,
        PublicID:       uploadResult.PublicID,
        DetailImageUrl: r.FormValue("detail_image_url"),
        BorderSlice:    borderSlice,
        InsetTop:       parseFloat(r.FormValue("inset_top"), 20.0),
        InsetRight:     parseFloat(r.FormValue("inset_right"), 20.0),
        InsetBottom:    parseFloat(r.FormValue("inset_bottom"), 20.0),
        InsetLeft:      parseFloat(r.FormValue("inset_left"), 20.0),
    }
    stmt, err := database.DB.Prepare("INSERT INTO products(name, description, price, stock, category, image_url, public_id, detail_image_url, border_slice, inset_top, inset_right, inset_bottom, inset_left) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal menyiapkan statement DB")
        return
    }
    res, err := stmt.Exec(p.Name, p.Description, p.Price, p.Stock, p.Category, p.ImageURL, p.PublicID, p.DetailImageUrl, p.BorderSlice, p.InsetTop, p.InsetRight, p.InsetBottom, p.InsetLeft)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal menyimpan produk ke DB")
        return
    }
    id, _ := res.LastInsertId()
    p.ID = int(id)
    respondJSON(w, http.StatusCreated, p)
}
func UpdateProduct(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, _ := strconv.Atoi(vars["id"])
    if err := r.ParseMultipartForm(10 << 20); err != nil {
        respondError(w, http.StatusBadRequest, "Request error")
        return
    }
    var existingProduct models.Product
    err := database.DB.QueryRow("SELECT image_url, public_id FROM products WHERE id=?", id).Scan(&existingProduct.ImageURL, &existingProduct.PublicID)
    if err != nil {
         respondError(w, http.StatusNotFound, "Produk tidak ditemukan")
         return
    }
    price, _ := strconv.Atoi(r.FormValue("price"))
    stock, _ := strconv.Atoi(r.FormValue("stock"))
    borderSlice, _ := strconv.Atoi(r.FormValue("border_slice"))
    if borderSlice == 0 {
        borderSlice = 40
    }
    p := models.Product{
        ID:             id,
        Name:           r.FormValue("name"),
        Description:    r.FormValue("description"),
        Price:          price,
        Stock:          stock,
        Category:       r.FormValue("category"),
        ImageURL:       existingProduct.ImageURL,
        PublicID:       existingProduct.PublicID,
        DetailImageUrl: r.FormValue("detail_image_url"),
        BorderSlice:    borderSlice,
		InsetTop:       parseFloat(r.FormValue("inset_top"), 20.0),
        InsetRight:     parseFloat(r.FormValue("inset_right"), 20.0),
        InsetBottom:    parseFloat(r.FormValue("inset_bottom"), 20.0),
        InsetLeft:      parseFloat(r.FormValue("inset_left"), 20.0),
    }
    file, _, err := r.FormFile("image")
    if err == nil {
        defer file.Close()
        if p.PublicID != "" {
            database.Cld.Upload.Destroy(database.Ctx, uploader.DestroyParams{PublicID: p.PublicID})
        }
        uploadResult, uploadErr := database.Cld.Upload.Upload(database.Ctx, file, uploader.UploadParams{Folder: "citraframe-products"})
        if uploadErr != nil {
            respondError(w, http.StatusInternalServerError, "Gagal mengunggah gambar baru")
            return
        }
        p.ImageURL = uploadResult.SecureURL
        p.PublicID = uploadResult.PublicID
    }
    stmt, err := database.DB.Prepare("UPDATE products SET name=?, description=?, price=?, stock=?, category=?, image_url=?, public_id=?, detail_image_url=?, border_slice=?, inset_top=?, inset_right=?, inset_bottom=?, inset_left=? WHERE id=?")
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal menyiapkan statement update")
        return
    }
    _, err = stmt.Exec(p.Name, p.Description, p.Price, p.Stock, p.Category, p.ImageURL, p.PublicID, p.DetailImageUrl, p.BorderSlice, p.InsetTop, p.InsetRight, p.InsetBottom, p.InsetLeft, id)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal mengupdate produk")
        return
    }
    respondJSON(w, http.StatusOK, p)
}
func DeleteProduct(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, _ := strconv.Atoi(vars["id"])
    var publicID sql.NullString
    err := database.DB.QueryRow("SELECT public_id FROM products WHERE id = ?", id).Scan(&publicID)
    if err != nil && err != sql.ErrNoRows {
        respondError(w, http.StatusInternalServerError, "Gagal mengambil data produk")
        return
    }
    if publicID.Valid && publicID.String != "" {
        _, err = database.Cld.Upload.Destroy(database.Ctx, uploader.DestroyParams{PublicID: publicID.String})
        if err != nil {
            log.Printf("Gagal menghapus gambar dari Cloudinary: %v", err)
        }
    }
    stmt, err := database.DB.Prepare("DELETE FROM products WHERE id=?")
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal menyiapkan statement delete")
        return
    }
    _, err = stmt.Exec(id)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Gagal menghapus produk dari DB")
        return
    }
    w.WriteHeader(http.StatusNoContent)
}

// CreateOrder membuat pesanan custom baru
func CreateOrder(w http.ResponseWriter, r *http.Request) {
    var order models.CustomOrder
    if err := json.NewDecoder(r.Body).Decode(&order); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    stmt, err := database.DB.Prepare("INSERT INTO custom_orders(frame_model, artwork_width, artwork_height, mat_width, mat_color, total_price) VALUES(?, ?, ?, ?, ?, ?)")
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    defer stmt.Close()

    res, err := stmt.Exec(order.FrameModel, order.ArtworkWidth, order.ArtworkHeight, order.MatWidth, order.MatColor, order.TotalPrice)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    id, _ := res.LastInsertId()
    order.ID = int(id)

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(order)
}