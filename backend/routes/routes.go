// backend/routes/routes.go

package routes

import (
	"backend/auth"
	"backend/controllers"
	"backend/handlers"
	"net/http"

	"github.com/gorilla/mux"
)

func servePage(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, path)
	}
}

func SetupRoutes(r *mux.Router) {
	r.Use(corsMiddleware)
	api := r.PathPrefix("/api").Subrouter()

	// --- RUTE PUBLIK ---
	api.HandleFunc("/admin/login", controllers.HandleAdminLogin).Methods("POST", "OPTIONS")
	api.HandleFunc("/admin/logout", controllers.HandleAdminLogout).Methods("POST", "OPTIONS")
	
	api.HandleFunc("/prints", controllers.GetArtPrints).Methods("GET", "OPTIONS")
	api.HandleFunc("/prints/{id:[0-9]+}", controllers.GetArtPrint).Methods("GET", "OPTIONS")
	api.HandleFunc("/slides", controllers.GetSlidersAPI).Methods("GET", "OPTIONS")
	api.HandleFunc("/upload-image", handlers.UploadImageHandler).Methods("POST", "OPTIONS")
	api.HandleFunc("/orders", handlers.GetOrdersHandler).Methods("GET")
	api.HandleFunc("/orders/{id}/status", handlers.UpdateOrderStatusHandler).Methods("PUT", "OPTIONS")
	api.HandleFunc("/flip/callback", handlers.FlipWebhookHandler).Methods("POST")
	api.HandleFunc("/create-payment", handlers.CreatePaymentHandler).Methods("POST", "OPTIONS")
	
	productsRouter := api.PathPrefix("/products").Subrouter()
	productsRouter.HandleFunc("", controllers.GetProducts).Methods("GET", "OPTIONS")
	productsRouter.HandleFunc("/frames", controllers.GetProducts).Methods("GET", "OPTIONS")
	productsRouter.HandleFunc("/popular", controllers.GetPopularFrames).Methods("GET", "OPTIONS")
	productsRouter.HandleFunc("/{id:[0-9]+}", controllers.GetProduct).Methods("GET", "OPTIONS")

	// --- RUTE TERPROTEKSI ---
	apiProtected := api.PathPrefix("/").Subrouter()
	apiProtected.Use(auth.JwtMiddleware)

	productsProtected := apiProtected.PathPrefix("/products").Subrouter()
	productsProtected.HandleFunc("/popular", controllers.GetPopularFrames).Methods("GET", "OPTIONS")
	productsProtected.HandleFunc("", controllers.CreateProduct).Methods("POST", "OPTIONS")
	productsProtected.HandleFunc("/{id:[0-9]+}/set-popular", controllers.SetPopular).Methods("PUT", "OPTIONS")
	productsProtected.HandleFunc("/{id:[0-9]+}/remove-popular", controllers.RemovePopular).Methods("PUT", "OPTIONS")
	productsProtected.HandleFunc("/{id:[0-9]+}", controllers.UpdateProduct).Methods("PUT", "OPTIONS")
	productsProtected.HandleFunc("/{id:[0-9]+}", controllers.DeleteProduct).Methods("DELETE", "OPTIONS")

	apiProtected.HandleFunc("/prints", controllers.CreateArtPrint).Methods("POST", "OPTIONS")
	apiProtected.HandleFunc("/prints/{id:[0-9]+}", controllers.UpdateArtPrint).Methods("PUT", "OPTIONS")
	apiProtected.HandleFunc("/prints/{id:[0-9]+}", controllers.DeleteArtPrint).Methods("DELETE", "OPTIONS")
	apiProtected.HandleFunc("/slides/admin", controllers.GetSlidersAdmin).Methods("GET", "OPTIONS")
	apiProtected.HandleFunc("/slides", controllers.CreateSlider).Methods("POST", "OPTIONS")
	apiProtected.HandleFunc("/slides/{id:[0-9]+}", controllers.DeleteSlider).Methods("DELETE", "OPTIONS")
	apiProtected.HandleFunc("/orders", controllers.CreateOrder).Methods("POST", "OPTIONS")

	// --- RUTE HALAMAN HTML (BAGIAN YANG DIPERBAIKI) ---
	r.HandleFunc("/", servePage("../frontend/pages/index.html")).Methods("GET")
    r.HandleFunc("/checkout", servePage("../frontend/pages/checkout.html")).Methods("GET")
    r.HandleFunc("/products", servePage("../frontend/pages/products.html")).Methods("GET")
    r.HandleFunc("/prints", servePage("../frontend/pages/prints.html")).Methods("GET")
    r.HandleFunc("/custom", servePage("../frontend/pages/custom-frame.html")).Methods("GET")
	
	// RUTE LOGIN YANG HILANG - SAYA TAMBAHKAN KEMBALI
    r.HandleFunc("/login", servePage("../frontend/admin/login.html")).Methods("GET")
	r.HandleFunc("/admin/sidebar.html", servePage("../frontend/admin/sidebar.html")).Methods("GET")
    
	// Rute halaman admin yang terproteksi
    dashboardHandler := http.HandlerFunc(servePage("../frontend/admin/dashboard.html"))
    r.Handle("/dashboard", auth.JwtMiddleware(dashboardHandler)).Methods("GET")
    productsHandler := http.HandlerFunc(servePage("../frontend/admin/pages/product.html"))
    r.Handle("/dashboard/product", auth.JwtMiddleware(productsHandler)).Methods("GET")
    artPrintsAdminHandler := http.HandlerFunc(servePage("../frontend/admin/pages/art_prints.html"))
    r.Handle("/dashboard/prints", auth.JwtMiddleware(artPrintsAdminHandler)).Methods("GET")
    orderHandler := http.HandlerFunc(servePage("../frontend/admin/pages/order.html"))
    r.Handle("/dashboard/order", auth.JwtMiddleware(orderHandler)).Methods("GET")
    sliderHandler := http.HandlerFunc(servePage("../frontend/admin/pages/slider.html"))
    r.Handle("/dashboard/slider", auth.JwtMiddleware(sliderHandler)).Methods("GET")
    popularFramesHandler := http.HandlerFunc(servePage("../frontend/admin/pages/popular_frames.html"))
    r.Handle("/dashboard/popular-frames", auth.JwtMiddleware(popularFramesHandler)).Methods("GET")

	// --- ASET STATIS ---
	assetHandler := http.StripPrefix("/", http.FileServer(http.Dir("../frontend/")))
	r.PathPrefix("/").Handler(assetHandler).Methods("GET")
}

func corsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        origin := r.Header.Get("Origin")
        if origin == "" { origin = "*" }
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