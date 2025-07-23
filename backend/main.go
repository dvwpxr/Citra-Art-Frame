package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
)

// Product struct diperbarui sesuai skema database baru
type Product struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       int       `json:"price"`
	Stock       int       `json:"stock"`
	Category    string    `json:"category"`
	Image       string    `json:"image"`
	DetailImageUrl string    `json:"detail_image_url"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
type CustomOrder struct {
	ID            int    `json:"id"`
	FrameModel    string `json:"frame_model"`
	ArtworkWidth  int    `json:"artwork_width"`
	ArtworkHeight int    `json:"artwork_height"`
	MatWidth      int    `json:"mat_width"`
	MatColor      string `json:"mat_color"`
	TotalPrice    int    `json:"total_price"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

var db *sql.DB

func loadEnv() {
	err := godotenv.Load(".env") // Sesuaikan path jika main.go ada di dalam subfolder
	if err != nil {
		log.Println("Error loading .env file, ensure it exists in the project root")
	}
}

func main() {
	loadEnv()
	dbUser, dbPassword, dbHost, dbPort, dbName := os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_NAME")
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true", dbUser, dbPassword, dbHost, dbPort, dbName)

	var err error
	db, err = sql.Open("mysql", dsn)
	if err != nil { log.Fatal(err) }
	defer db.Close()
	if err = db.Ping(); err != nil { log.Fatal(err) }
	log.Println("Database connected!")

	r := mux.NewRouter()

	// API endpoints untuk CRUD
	api := r.PathPrefix("/api").Subrouter()
	api.HandleFunc("/products", getProducts).Methods("GET")
    // TAMBAHKAN ROUTE BARU DI SINI
	api.HandleFunc("/products/frames", getProducts).Methods("GET") // Menggunakan handler yg sama
	api.HandleFunc("/products", createProduct).Methods("POST")
	api.HandleFunc("/products/{id}", getProduct).Methods("GET")
	api.HandleFunc("/products/{id}", updateProduct).Methods("PUT")
	api.HandleFunc("/products/{id}", deleteProduct).Methods("DELETE")
	api.HandleFunc("/orders", createOrder).Methods("POST")
	api.HandleFunc("/admin/login", handleAdminLogin).Methods("POST")
	api.Use(corsMiddleware) 
	

	// Sajikan file statis dari frontend
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("../frontend")))

	log.Println("Starting server on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}

// Middleware untuk CORS
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// === HANDLER FUNCTIONS ===
func handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	// Ambil data JSON dari request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// --- Logika Pengecekan Username & Password ---
	// Ganti username dan password di bawah ini sesuai keinginan Anda
	const adminUsername = "admin"
	const adminPassword = "password123"

	if req.Username == adminUsername && req.Password == adminPassword {
		// Jika berhasil, kirim status OK (200)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Login successful"})
	} else {
		// Jika gagal, kirim status Unauthorized (401)
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
	}
}

func getProducts(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, name, description, price, stock, category, image, detail_image_url FROM products")
	if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock, &p.Category, &p.Image, &p.DetailImageUrl); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError); return
		}
		products = append(products, p)
	}
	json.NewEncoder(w).Encode(products)
}

func getProduct(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, _ := strconv.Atoi(vars["id"])

    var p Product
    // TAMBAHKAN 'detail_image_url' ke query dan &p.DetailImageUrl ke Scan
    err := db.QueryRow("SELECT id, name, description, price, stock, category, image, detail_image_url FROM products WHERE id = ?", id).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock, &p.Category, &p.Image, &p.DetailImageUrl)
    if err != nil {
        if err == sql.ErrNoRows {
            http.Error(w, "Product not found", http.StatusNotFound)
        } else {
            http.Error(w, err.Error(), http.StatusInternalServerError)
        }
        return
    }
    json.NewEncoder(w).Encode(p)
}

func createProduct(w http.ResponseWriter, r *http.Request) {
    var p Product
    if err := json.NewDecoder(r.Body).Decode(&p); err != nil { http.Error(w, err.Error(), http.StatusBadRequest); return }

    // TAMBAHKAN 'detail_image_url' ke query dan p.DetailImageUrl ke Exec
    stmt, err := db.Prepare("INSERT INTO products(name, description, price, stock, category, image, detail_image_url) VALUES(?, ?, ?, ?, ?, ?, ?)")
    if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }
    
    res, err := stmt.Exec(p.Name, p.Description, p.Price, p.Stock, p.Category, p.Image, p.DetailImageUrl)
    if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }

    id, _ := res.LastInsertId()
    p.ID = int(id)
    
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(p)
}

func updateProduct(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, _ := strconv.Atoi(vars["id"])

    var p Product
    if err := json.NewDecoder(r.Body).Decode(&p); err != nil { http.Error(w, err.Error(), http.StatusBadRequest); return }

    // TAMBAHKAN 'detail_image_url' ke query dan p.DetailImageUrl ke Exec
    stmt, err := db.Prepare("UPDATE products SET name=?, description=?, price=?, stock=?, category=?, image=?, detail_image_url=? WHERE id=?")
    if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }

    _, err = stmt.Exec(p.Name, p.Description, p.Price, p.Stock, p.Category, p.Image, p.DetailImageUrl, id)
    if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }

    p.ID = id
    json.NewEncoder(w).Encode(p)
}

func deleteProduct(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    id, _ := strconv.Atoi(vars["id"])

    stmt, err := db.Prepare("DELETE FROM products WHERE id=?")
    if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }

    _, err = stmt.Exec(id)
    if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }

    w.WriteHeader(http.StatusNoContent)
}

func createOrder(w http.ResponseWriter, r *http.Request) {
    var order CustomOrder
	if err := json.NewDecoder(r.Body).Decode(&order); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	stmt, err := db.Prepare("INSERT INTO custom_orders(frame_model, artwork_width, artwork_height, mat_width, mat_color, total_price) VALUES(?, ?, ?, ?, ?, ?)")
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
