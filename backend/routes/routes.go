// backend/routes/routes.go

package routes

import (
	"backend/auth"
	"backend/controllers"
	"backend/handlers"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gorilla/mux"
)

func servePage(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, path)
	}
}

func serveFileNoDir(rootDir, urlPrefix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		relativePath := strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")
		prefix := strings.TrimPrefix(filepath.Clean(urlPrefix), "/")
		relativePath = strings.TrimPrefix(relativePath, prefix)
		relativePath = strings.TrimPrefix(relativePath, "/")
		if relativePath == "." || strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}

		fullPath := filepath.Join(rootDir, relativePath)
		http.ServeFile(w, r, fullPath)
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
	api.HandleFunc("/flip/callback", handlers.FlipWebhookHandler).Methods("POST")

	// --- RUTE CUSTOMER TERPROTEKSI FIREBASE ---
	apiFirebaseProtected := api.PathPrefix("/").Subrouter()
	apiFirebaseProtected.Use(auth.FirebaseAuthMiddleware)

	apiFirebaseProtected.HandleFunc("/create-payment", handlers.CreatePaymentHandler).Methods("POST", "OPTIONS")

	// --- RUTE USER (Alamat & Pesanan) ---
	apiFirebaseProtected.HandleFunc("/user/addresses", handlers.GetAddressesHandler).Methods("GET", "OPTIONS")
	apiFirebaseProtected.HandleFunc("/user/addresses", handlers.CreateAddressHandler).Methods("POST", "OPTIONS")
	apiFirebaseProtected.HandleFunc("/user/addresses/{id:[0-9]+}", handlers.UpdateAddressHandler).Methods("PUT", "OPTIONS")
	apiFirebaseProtected.HandleFunc("/user/addresses/{id:[0-9]+}", handlers.DeleteAddressHandler).Methods("DELETE", "OPTIONS")
	apiFirebaseProtected.HandleFunc("/user/orders", handlers.GetUserOrdersHandler).Methods("GET", "OPTIONS")

	// --- RUTE CART (Keranjang) ---
	apiFirebaseProtected.HandleFunc("/user/cart", handlers.GetCartHandler).Methods("GET", "OPTIONS")
	apiFirebaseProtected.HandleFunc("/user/cart", handlers.AddToCartHandler).Methods("POST", "OPTIONS")
	apiFirebaseProtected.HandleFunc("/user/cart/{id:[0-9]+}", handlers.UpdateCartItemHandler).Methods("PUT", "OPTIONS")
	apiFirebaseProtected.HandleFunc("/user/cart/{id:[0-9]+}", handlers.DeleteCartItemHandler).Methods("DELETE", "OPTIONS")
	apiFirebaseProtected.HandleFunc("/user/cart/clear", handlers.ClearCartHandler).Methods("DELETE", "OPTIONS")

	// Ongkir hanya digunakan pengguna yang sedang checkout. Melindungi endpoint
	// mencegah penyalahgunaan kuota API.co.id dari request anonim.
	apiFirebaseProtected.HandleFunc("/shipping/cost", handlers.GetShippingCostHandler).Methods("GET", "OPTIONS")

	// --- RUTE REGIONAL (Proxy API.co.id) ---
	api.HandleFunc("/regional/provinces", handlers.GetProvincesHandler).Methods("GET", "OPTIONS")
	api.HandleFunc("/regional/regencies", handlers.GetRegenciesHandler).Methods("GET", "OPTIONS")
	api.HandleFunc("/regional/districts", handlers.GetDistrictsHandler).Methods("GET", "OPTIONS")
	api.HandleFunc("/regional/villages", handlers.GetVillagesHandler).Methods("GET", "OPTIONS")

	// --- RUTE DETAIL ORDER CUSTOMER/ADMIN ---
	api.Handle("/orders/{id}", auth.CustomerOrAdminAuthMiddleware(http.HandlerFunc(handlers.GetOrderDetailHandler))).Methods("GET", "OPTIONS")

	productsRouter := api.PathPrefix("/products").Subrouter()
	productsRouter.HandleFunc("", controllers.GetProducts).Methods("GET", "OPTIONS")
	productsRouter.HandleFunc("/frames", controllers.GetProducts).Methods("GET", "OPTIONS")
	productsRouter.HandleFunc("/popular", controllers.GetPopularFrames).Methods("GET", "OPTIONS")
	productsRouter.HandleFunc("/{id:[0-9]+}", controllers.GetProduct).Methods("GET", "OPTIONS")

	// --- RUTE FRAME MODELS (PUBLIK) ---
	api.HandleFunc("/frame-models", controllers.GetFrameModels).Methods("GET", "OPTIONS")
	api.HandleFunc("/frame-models/{id:[0-9]+}", controllers.GetFrameModel).Methods("GET", "OPTIONS")

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
	apiProtected.HandleFunc("/admin/stats", handlers.GetDashboardStatsHandler).Methods("GET", "OPTIONS")
	apiProtected.HandleFunc("/admin/orders", handlers.GetOrdersHandler).Methods("GET", "OPTIONS")
	apiProtected.HandleFunc("/admin/orders/{id:[0-9]+}", handlers.GetOrderDetailHandler).Methods("GET", "OPTIONS")
	apiProtected.HandleFunc("/admin/orders/{id:[0-9]+}/status", handlers.UpdateOrderStatusHandler).Methods("PUT", "OPTIONS")

	// --- RUTE FRAME MODELS (TERPROTEKSI) ---
	apiProtected.HandleFunc("/frame-models", controllers.CreateFrameModel).Methods("POST", "OPTIONS")
	apiProtected.HandleFunc("/frame-models/{id:[0-9]+}", controllers.UpdateFrameModel).Methods("PUT", "OPTIONS")
	apiProtected.HandleFunc("/frame-models/{id:[0-9]+}", controllers.DeleteFrameModel).Methods("DELETE", "OPTIONS")
	apiProtected.HandleFunc("/frame-models/{id:[0-9]+}/toggle", controllers.ToggleFrameModelStatus).Methods("PUT", "OPTIONS")

	// --- RUTE HALAMAN HTML  ---
	r.HandleFunc("/", servePage("../frontend/pages/index.html")).Methods("GET")
	r.HandleFunc("/checkout", servePage("../frontend/pages/checkout.html")).Methods("GET")
	r.HandleFunc("/cart", servePage("../frontend/pages/cart.html")).Methods("GET")
	r.HandleFunc("/products", servePage("../frontend/pages/products.html")).Methods("GET")
	r.HandleFunc("/prints", servePage("../frontend/pages/prints.html")).Methods("GET")
	r.HandleFunc("/print-detail", servePage("../frontend/pages/print-detail.html")).Methods("GET")
	r.HandleFunc("/custom", servePage("../frontend/pages/custom-frame.html")).Methods("GET")
	r.HandleFunc("/ar-view", servePage("../frontend/pages/ar.html")).Methods("GET")
	r.HandleFunc("/account", servePage("../frontend/pages/account.html")).Methods("GET")
	r.HandleFunc("/invoice", servePage("../frontend/pages/invoice.html")).Methods("GET")

	// RUTE LOGIN DAN SIDEBAR ADMIN
	r.HandleFunc("/login", servePage("../frontend/admin/login.html")).Methods("GET")
	r.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/login", http.StatusFound)
	}).Methods("GET")
	r.HandleFunc("/admin/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/login", http.StatusFound)
	}).Methods("GET")

	adminAssets := r.PathPrefix("/admin/").Subrouter()
	adminAssets.Handle("/sidebar.html", auth.JwtMiddleware(http.HandlerFunc(servePage("../frontend/admin/sidebar.html")))).Methods("GET")
	adminAssets.PathPrefix("/js/").Handler(auth.JwtMiddleware(http.HandlerFunc(serveFileNoDir("../frontend/admin", "/admin/")))).Methods("GET")
	adminAssets.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}).Methods("GET")

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
	frameModelsAdminHandler := http.HandlerFunc(servePage("../frontend/admin/pages/frame_models.html"))
	r.Handle("/dashboard/frame-models", auth.JwtMiddleware(frameModelsAdminHandler)).Methods("GET")

	// --- SERVE FILE MODEL 3D (UPLOADS) ---
	uploadsHandler := http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads/")))
	r.PathPrefix("/uploads/").Handler(uploadsHandler).Methods("GET")

	// --- ASET STATIS ---
	assetHandler := http.StripPrefix("/", http.FileServer(http.Dir("../frontend/")))
	r.PathPrefix("/").Handler(assetHandler).Methods("GET")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, ngrok-skip-browser-warning")
		// Bypass ngrok interstitial warning page untuk semua response
		w.Header().Set("ngrok-skip-browser-warning", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
