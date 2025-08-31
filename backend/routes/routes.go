package routes

import (
	"backend/auth"
	"backend/controllers"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
)

// servePage adalah fungsi helper untuk menyajikan file HTML
func servePage(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, path)
	}
}

func SetupRoutes(r *mux.Router) {
	r.Use(corsMiddleware)

	// =================================================================
	// BAGIAN 1: RUTE API
	// =================================================================

	api := r.PathPrefix("/api").Subrouter()

	// --- API PUBLIK ---
	api.HandleFunc("/admin/login", controllers.HandleAdminLogin).Methods("POST", "OPTIONS")
	api.HandleFunc("/admin/logout", controllers.HandleAdminLogout).Methods("POST", "OPTIONS")
	// PENTING: Rute yang lebih spesifik (/products/frames) harus di atas rute variabel (/products/{id})
	api.HandleFunc("/products/frames", controllers.GetProducts).Methods("GET", "OPTIONS")
	api.HandleFunc("/products", controllers.GetProducts).Methods("GET", "OPTIONS")
	api.HandleFunc("/products/{id}", controllers.GetProduct).Methods("GET", "OPTIONS")

	// --- API TERPROTEKSI ---
	apiProtected := r.PathPrefix("/api").Subrouter()
	apiProtected.Use(auth.JwtMiddleware)
	apiProtected.HandleFunc("/products", controllers.CreateProduct).Methods("POST", "OPTIONS")
	apiProtected.HandleFunc("/products/{id}", controllers.UpdateProduct).Methods("PUT", "OPTIONS")
	apiProtected.HandleFunc("/products/{id}", controllers.DeleteProduct).Methods("DELETE", "OPTIONS")
	apiProtected.HandleFunc("/orders", controllers.CreateOrder).Methods("POST", "OPTIONS")

	// =================================================================
	// BAGIAN 2: RUTE HALAMAN HTML (MODEL EKSPLISIT & AMAN)
	// =================================================================

	// --- HALAMAN PUBLIK ---
	r.HandleFunc("/", servePage("../frontend/pages/index.html"))
	r.HandleFunc("/products", servePage("../frontend/pages/products.html"))
	r.HandleFunc("/prints", servePage("../frontend/pages/prints.html"))
	// r.HandleFunc("/framing", servePage("../frontend/pages/framing.html"))
	r.HandleFunc("/custom", servePage("../frontend/pages/custom-frame.html"))
	r.HandleFunc("/login", servePage("../frontend/admin/login.html"))

	// --- HALAMAN TERPROTEKSI ---
	dashboardHandler := http.HandlerFunc(servePage("../frontend/admin/dashboard.html"))
	r.Handle("/dashboard", auth.JwtMiddleware(dashboardHandler))
	productsHandler := http.HandlerFunc(servePage("../frontend/admin/pages/product.html"))
	r.Handle("/dashboard/product", auth.JwtMiddleware(productsHandler))
	orderHandler := http.HandlerFunc(servePage("../frontend/admin/pages/order.html"))
	r.Handle("/dashboard/order", auth.JwtMiddleware(orderHandler))

	// =================================================================
	// BAGIAN 3: HANDLER UNTUK ASET (CSS, JS, GAMBAR)
	// =================================================================
	
	// Handler ini harus menjadi yang terakhir dan hanya melayani aset, bukan halaman.
	assetHandler := http.FileServer(http.Dir("../frontend/"))
	r.PathPrefix("/").Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Mencegah handler ini menyajikan file HTML secara langsung.
		// Ini memaksa semua akses halaman melalui rute yang sudah kita definisikan di atas.
		if strings.HasSuffix(r.URL.Path, ".html") {
			http.NotFound(w, r)
			return
		}
		assetHandler.ServeHTTP(w, r)
	}))
}

// ... corsMiddleware tidak berubah ...
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}