package routes

import (
	"backend/auth"
	"backend/controllers"
	"backend/handlers"
	"net/http"

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
    api.HandleFunc("/products/frames", controllers.GetProducts).Methods("GET", "OPTIONS")
    api.HandleFunc("/products", controllers.GetProducts).Methods("GET", "OPTIONS")
    api.HandleFunc("/products/{id}", controllers.GetProduct).Methods("GET", "OPTIONS")
    api.HandleFunc("/upload-image", handlers.UploadImageHandler).Methods("POST", "OPTIONS")
    // Rute Pembayaran Flip
    api.HandleFunc("/orders", handlers.GetOrdersHandler).Methods("GET")
    api.HandleFunc("/orders/{id}/status", handlers.UpdateOrderStatusHandler).Methods("PUT", "OPTIONS")
    api.HandleFunc("/flip/callback", handlers.FlipWebhookHandler).Methods("POST")
    api.HandleFunc("/create-payment", handlers.CreatePaymentHandler).Methods("POST", "OPTIONS")
     // Upload

    // --- API TERPROTEKSI ---
    apiProtected := api.PathPrefix("/").Subrouter()
    apiProtected.Use(auth.JwtMiddleware)
    apiProtected.HandleFunc("/products", controllers.CreateProduct).Methods("POST", "OPTIONS")
    apiProtected.HandleFunc("/products/{id}", controllers.UpdateProduct).Methods("PUT", "OPTIONS")
    apiProtected.HandleFunc("/products/{id}", controllers.DeleteProduct).Methods("DELETE", "OPTIONS")
    apiProtected.HandleFunc("/orders", controllers.CreateOrder).Methods("POST", "OPTIONS")

    // =================================================================
    // BAGIAN 2: RUTE HALAMAN HTML
    // =================================================================
    r.HandleFunc("/", servePage("../frontend/pages/index.html")).Methods("GET")
	r.HandleFunc("/checkout", servePage("../frontend/pages/checkout.html")).Methods("GET")
    r.HandleFunc("/products", servePage("../frontend/pages/products.html")).Methods("GET")
    r.HandleFunc("/prints", servePage("../frontend/pages/prints.html")).Methods("GET")
    r.HandleFunc("/custom", servePage("../frontend/pages/custom-frame.html")).Methods("GET")
    r.HandleFunc("/login", servePage("../frontend/admin/login.html")).Methods("GET")
    
    dashboardHandler := http.HandlerFunc(servePage("../frontend/admin/dashboard.html"))
    r.Handle("/dashboard", auth.JwtMiddleware(dashboardHandler)).Methods("GET")
    productsHandler := http.HandlerFunc(servePage("../frontend/admin/pages/product.html"))
    r.Handle("/dashboard/product", auth.JwtMiddleware(productsHandler)).Methods("GET")
    orderHandler := http.HandlerFunc(servePage("../frontend/admin/pages/order.html"))
    r.Handle("/dashboard/order", auth.JwtMiddleware(orderHandler)).Methods("GET")

    // =================================================================
    // BAGIAN 3: HANDLER UNTUK ASET (CSS, JS, GAMBAR)
    // =================================================================
    uploadsHandler := http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads")))
	r.PathPrefix("/uploads/").Handler(uploadsHandler).Methods("GET")

	// Sajikan semua file dari folder 'frontend/assets' di URL '/assets/'
	assetHandler := http.StripPrefix("/assets/", http.FileServer(http.Dir("../frontend/assets")))
	r.PathPrefix("/assets/").Handler(assetHandler).Methods("GET")
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