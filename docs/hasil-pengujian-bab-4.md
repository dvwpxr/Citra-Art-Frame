# Hasil Pengujian Bab 4 - CitraFrame

Dokumen ini berisi hasil pengujian aktual pada environment beta CitraFrame. Secret dari `.env` digunakan untuk koneksi, tetapi tidak ditampilkan. Bukti visual Bab IV menggunakan data katalog nyata non-PII yang tersedia pada aplikasi beta, seperti Arcalod Gold, Arcalod Silver, Araclodd, Golden Eagle Sovereign, Golden Bull Power, Black Panther Royale, dan Violet Run of Freedom. Skenario otomatis yang perlu membuat, memperbarui, atau menghapus record tetap memakai data uji terkontrol sementara agar tidak mengganggu data aplikasi.

## Ringkasan Environment

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| ENV-01 | Aiven MySQL | Koneksi database beta | Konfigurasi DB dari `.env` | Koneksi berhasil | `Aiven MySQL: connected` | PASS | `TestBAB4BetaEnvironmentConnectivity` |
| ENV-02 | Firebase | Pemeriksaan konfigurasi proyek | `FIREBASE_PROJECT_ID` dan public cert endpoint | Endpoint Firebase dapat diakses | Public cert endpoint reachable | PASS | `TestBAB4BetaEnvironmentConnectivity` |
| ENV-03 | Flip | Identifikasi mode payment | Konfigurasi Flip dari `.env` | Mode diketahui | Backend memakai endpoint `big_sandbox_api` | PASS | Inspeksi runtime dan `TestBAB4BetaEnvironmentConnectivity` |
| ENV-04 | Cloudinary | Ping admin API | Konfigurasi Cloudinary dari `.env` | Ping berhasil | Admin ping OK | PASS | `TestBAB4BetaEnvironmentConnectivity` |
| ENV-05 | API.co.id | Ongkir | Origin dan destination village dari `.env` | Endpoint shipping-cost merespons 2xx | Shipping-cost endpoint reachable | PASS | `TestBAB4BetaEnvironmentConnectivity` |
| ENV-06 | Frontend | Build frontend | `frontend/package.json` | Build dijalankan bila tersedia | Tidak ada `package.json`; frontend statis | TIDAK BERLAKU | `TestBAB4NoPackageJSON`, `TIDAK_BERLAKU_NO_PACKAGE_JSON` |
| ENV-07 | Frontend | Validasi JavaScript | Semua file `frontend/**/*.js` | Tidak ada syntax error | `node --check` selesai tanpa error | PASS | `find frontend -name '*.js' -print0 \| xargs -0 -n1 node --check` |
| ENV-08 | Backend | Build backend | `go build ./...` | Build berhasil | Build selesai tanpa error | PASS | `go build ./...` |

## Unit Test Mock

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| UT-01 | Auth JWT | API tanpa JWT | `GET /api/admin/stats` tanpa token | 401 JSON, tanpa redirect | 401 JSON, tidak ada `Location` | PASS | `TestJwtMiddlewareAPIUnauthorizedReturnsJSON` |
| UT-02 | Auth JWT | JWT admin salah user | JWT username bukan admin | 403 JSON | 403 JSON | PASS | `TestJwtMiddlewareAPIForbiddenReturnsJSON` |
| UT-03 | Auth JWT | JWT admin valid | JWT username admin | Request diteruskan | Handler menerima konteks admin | PASS | `TestJwtMiddlewareAllowsConfiguredAdmin` |
| UT-04 | Routing | Statistik admin terlindungi | `GET /api/admin/stats` tanpa JWT | 401 | 401 | PASS | `TestAdminStatsRouteRequiresAdminJWT` |
| UT-05 | Order detail | Tanpa autentikasi | `GET /api/orders/{id}` | 401 | 401 | PASS | `TestOrderDetailRequiresAuthentication` |
| UT-06 | Order detail | User melihat order sendiri | Token Firebase mock owner | 200 | 200 | PASS | `TestFirebaseUserCanReadOwnOrder` |
| UT-07 | Order detail | User lain melihat order | Token Firebase mock non-owner | 403 generik | 403, tidak membocorkan order | PASS | `TestFirebaseUserCannotReadOtherOrder` |
| UT-08 | Order detail | Admin melihat order | JWT admin valid | 200 | 200 | PASS | `TestAdminCanReadOrderDetail` |
| UT-09 | Checkout | Item kosong | `items=[]` | 400 | 400 | PASS | `TestValidateCheckoutRequestRejectsInvalidInput/empty_items` |
| UT-10 | Checkout | Nama tidak valid | Nama 1 karakter | 400 | 400 | PASS | `invalid_customer_name` |
| UT-11 | Checkout | Email tidak valid | `bad-email` | 400 | 400 | PASS | `invalid_email` |
| UT-12 | Checkout | Telepon tidak valid | `abc` | 400 | 400 | PASS | `invalid_phone` |
| UT-13 | Checkout | Alamat kosong | `full_address` dan `shipping_address` kosong | 400 | 400 | PASS | `missing_address` |
| UT-14 | Checkout | `village_code` kosong | `village_code=""` | 400 | 400 | PASS | `missing_village` |
| UT-15 | Checkout | Shipping kosong | `courier_code` dan `courier_name` kosong | 400 | 400 | PASS | `missing_shipping_choice` |
| UT-16 | Checkout | Quantity nol | `quantity=0` | 400 | 400 | PASS | `zero_quantity` |
| UT-17 | Checkout | Harga frontend dimanipulasi | Harga payload `1`, harga DB `100000`, ongkir backend `20000` | Total backend `120000` | Flip amount `120000` | PASS | `TestCreatePaymentRecalculatesTotalsFromDatabase` |
| UT-18 | Checkout | Produk tidak ditemukan | `product_id=404` | 400, Flip tidak dipanggil | 400 | PASS | `TestCreatePaymentRejectsMissingProduct` |
| UT-19 | Checkout | Stok tidak cukup | Stock DB `0` | 400, Flip tidak dipanggil | 400 | PASS | `TestCreatePaymentRejectsUnavailableStock` |
| UT-20 | Checkout | Flip gagal | Flip mock error | `payment_failed`, stok kembali | 502, status gagal, stok dikembalikan | PASS | `TestCreatePaymentFailureMarksOrderFailedAndReleasesStock` |
| UT-21 | Migration | Definisi tabel | `migration.sql` | Tabel aktif tersedia | Semua tabel aktif terdefinisi | PASS | `TestMigrationDefinesUsedTablesForEmptyDatabase` |
| UT-22 | Migration | Parser SQL | SQL dengan komentar awal | Statement tetap terbaca | 2 statement terbaca | PASS | `TestSplitSQLStatementsKeepsStatementAfterComment` |
| UT-23 | Asset | Placeholder texture | `styles.css` | Tidak ada `path/to/your/frame-texture.jpg` | Tidak ditemukan | PASS | `TestNoPlaceholderFrameTextureAssetReference` |

## Integration Test Aiven

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| INT-01 | Migration Aiven | Jalankan migration aman | `ALLOW_NON_TEST_MIGRATION=1 go run ./cmd/migrate` | Hanya tambah schema yang hilang | Menambah `orders.payment_url`, `orders.artwork_image_url`, dan index yang hilang | PASS | Log migration 13 Juli 2026 04:05 |
| INT-02 | Schema Aiven | Verifikasi tabel | `products`, `art_prints`, `orders`, `order_items`, `sliders`, `custom_orders`, `user_addresses`, `cart_items` | Semua tabel/kolom utama ada | Schema required verified | PASS | `TestBAB4BetaSchemaAfterMigration` |
| INT-03 | Testing kosong | Build database testing kosong | Database kosong baru | Migration membangun dari nol | Tidak dibuat DB kosong baru sesuai batasan user | BELUM DIUJI | Tidak ada database kosong terpisah; migration hanya dijalankan ke beta existing |
| INT-04 | Data uji terkontrol | Buat data uji sementara | Record uji terkontrol | Data dibuat minimum | Produk, art print, slider, address, cart, order dibuat selama test | PASS | `TestBAB4BetaCheckoutIntegration`, `TestBAB4BlackboxHTTPIntegration` |
| INT-05 | Cleanup | Hapus data uji sementara | Record sesi uji | Hanya data sesi uji terhapus | Tidak ada sisa row uji | PASS | `TestBAB4BetaSyntheticDataCleanupVerification`, `TestBAB4BlackboxCleanupVerification` |
| INT-06 | Checkout Aiven | Item kosong | Request checkout tanpa item | 400 | 400 | PASS | `validation_rejects_empty_items` |
| INT-07 | Checkout Aiven | Alamat tidak lengkap | Alamat kosong | 400 | 400 | PASS | `validation_rejects_incomplete_address` |
| INT-08 | Checkout Aiven | Email invalid | Email tidak sesuai format | 400 | 400 | PASS | `validation_rejects_invalid_email` |
| INT-09 | Checkout Aiven | Telepon invalid | Telepon huruf | 400 | 400 | PASS | `validation_rejects_invalid_phone` |
| INT-10 | Checkout Aiven | Produk tidak ditemukan | Product ID tidak ada | 400 | 400 | PASS | `product_not_found_is_rejected` |
| INT-11 | Checkout Aiven | Stok tidak cukup | Quantity melebihi stock | 400 | 400 | PASS | `insufficient_stock_is_rejected` |
| INT-12 | Checkout Aiven | Manipulasi harga | Payload subtotal/total/harga `1` | Backend hitung ulang dari DB | Subtotal `123456`, ongkir `22000`, total `145456` | PASS | `backend_recalculates_price_and_totals` |
| INT-13 | Checkout Aiven | Status sebelum Flip | Order baru sebelum callback Flip | `pending_payment` | Terbaca `pending_payment` sebelum Flip mock return | PASS | `backend_recalculates_price_and_totals` |
| INT-14 | Checkout Aiven | Flip sandbox sukses | Request payment sandbox | Link pembayaran tersimpan, status `awaiting_payment` | Payment URL absolut, status `awaiting_payment` | PASS | `Flip_sandbox_creates_payment_link` |
| INT-15 | Checkout Aiven | Flip gagal | Flip mock error | `payment_failed` dan stok kembali | Status `payment_failed`, stok kembali | PASS | `Flip_failure_marks_failed_and_releases_stock` |
| INT-16 | Otorisasi order | Tanpa autentikasi | `GET /api/orders/{id}` | 401 | 401 | PASS | `TestBAB4BetaOrderAuthorizationIntegration` |
| INT-17 | Otorisasi order | Owner akses order sendiri | Token Firebase mock owner | 200 | 200 | PASS | `TestBAB4BetaOrderAuthorizationIntegration` |
| INT-18 | Otorisasi order | User lain akses order | Token Firebase mock user lain | 403 | 403 | PASS | `TestBAB4BetaOrderAuthorizationIntegration` |
| INT-19 | Otorisasi order | Admin akses order | JWT admin valid | 200 | 200 | PASS | `TestBAB4BetaOrderAuthorizationIntegration` |

## Black Box HTTP Lokal

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| BB-01 | Halaman publik | Homepage | `GET /` frontend proxy | 200 | 200 | PASS | `public_pages_and_assets` |
| BB-02 | Halaman publik | Katalog produk | `GET /products` | 200 | 200 | PASS | `public_pages_and_assets` |
| BB-03 | Halaman publik | Art print | `GET /prints` | 200 | 200 | PASS | `public_pages_and_assets` |
| BB-04 | Halaman publik | Detail produk/art print | `GET /print-detail` | 200 | 200 | PASS | `public_pages_and_assets` |
| BB-05 | Halaman publik | Custom frame builder | `GET /custom` | 200 | 200 | PASS | `public_pages_and_assets` |
| BB-06 | Halaman publik | Halaman AR | `GET /ar-view` | 200 | 200 | PASS | `public_pages_and_assets` |
| BB-07 | Halaman publik | Login admin | `GET /login` | 200 | 200 | PASS | `public_pages_and_assets` |
| BB-08 | Asset | JavaScript checkout | `GET /assets/js/checkout.js` | 200 | 200 | PASS | `public_pages_and_assets` |
| BB-09 | Asset | CSS utama | `GET /assets/css/styles.css` | 200 | 200 | PASS | `public_pages_and_assets` |
| BB-10 | Asset | `frame.glb` | `GET /assets/3d/frame.glb` | 200 dan file tidak kosong | 200, file exists | PASS | `public_pages_and_assets`, `TestBAB4FrameGLBFileExists` |
| BB-11 | Asset | Placeholder texture | Direct request placeholder | Tidak menjadi referensi runtime | Referensi tidak ada; direct URL 404 | PASS | `public_pages_and_assets`, `rg` no match |
| BB-12 | Auth API | Stats tanpa JWT | `GET /api/admin/stats` | 401 tanpa redirect | 401, `Location` kosong | PASS | `api_auth_responses` |
| BB-13 | Auth API | Invoice/order tanpa auth | `GET /api/orders/1` | 401 tanpa redirect | 401, `Location` kosong | PASS | `api_auth_responses` |
| BB-14 | Auth API | JWT invalid | Bearer invalid | 401 tanpa redirect | 401, `Location` kosong | PASS | `api_auth_responses` |
| BB-15 | Admin login | Login gagal | Password salah | 401 | 401 | PASS | `api_auth_responses` |
| BB-16 | Admin login | Login berhasil | Password admin plaintext | Masuk dan set cookie JWT | Tidak ada password plaintext akun uji di `.env` | BELUM DIUJI | Tidak tersedia kredensial uji login UI |
| BB-17 | Admin JWT | Stats dengan JWT | JWT dibuat dari env runtime | 200 | 200 | PASS | `admin_stats_with_JWT` |
| BB-18 | Admin produk | Create produk | Multipart + image uji terkontrol | 201 | 201 | PASS | `product_CRUD` |
| BB-19 | Admin produk | Update produk | Multipart tanpa image baru | 200 | 200 | PASS | `product_CRUD` |
| BB-20 | Admin produk | Delete produk | ID produk uji terkontrol | 204 | 204 | PASS | `product_CRUD` |
| BB-21 | Admin art print | Create art print | Multipart + image uji terkontrol | 201 | 201 | PASS | `art_print_CRUD` |
| BB-22 | Admin art print | Update art print | Multipart tanpa image baru | 200 | 200 | PASS | `art_print_CRUD` |
| BB-23 | Admin art print | Delete art print | ID art print uji terkontrol | 204 | 204 | PASS | `art_print_CRUD` |
| BB-24 | Admin slider | Create slider | Multipart + image uji terkontrol | 201 | 201 | PASS | `slider_CRUD` |
| BB-25 | Admin slider | Read slider admin | `GET /api/slides/admin` | Slider uji terkontrol ditemukan | Ditemukan berdasarkan `altText` | PASS | `slider_CRUD` |
| BB-26 | Admin slider | Delete slider | ID slider uji terkontrol | 200 | 200 | PASS | `slider_CRUD` |
| BB-27 | Custom order | Simpan custom frame | `POST /api/orders` admin JWT | 201 | 201 | PASS | `custom_order_persistence` |
| BB-28 | Admin order | List order | Search order uji terkontrol | 200 | 200 | PASS | `admin_order_list_detail_and_status_update` |
| BB-29 | Admin order | Detail order | ID order uji terkontrol | 200 | 200 | PASS | `admin_order_list_detail_and_status_update` |
| BB-30 | Admin order | Update status | Status `DELIVERED` | 200 dan DB berubah | 200, status `DELIVERED` | PASS | `admin_order_list_detail_and_status_update` |
| BB-31 | Admin logout | Logout UI | Klik tombol logout | Cookie terhapus | Tidak dijalankan pada sesi screenshot | BELUM DIUJI | Perlu skenario logout UI terpisah |

## Integrasi Firebase

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| FB-01 | Firebase | Konfigurasi proyek | Project ID dan cert endpoint | Endpoint reachable | Reachable | PASS | `TestBAB4BetaEnvironmentConnectivity` |
| FB-02 | Firebase Auth | Token invalid | Bearer invalid | 401 | 401 | PASS | `api_auth_responses` |
| FB-03 | Firebase Auth | Login akun uji | Email/password akun uji | Token valid | Tidak ada kredensial akun uji di `.env` | BELUM DIUJI | Tidak tersedia akun uji khusus |
| FB-04 | Firebase Auth | Token valid real | ID token Firebase asli | 200 pada endpoint user | Tidak ada ID token real | BELUM DIUJI | Tidak tersedia akun uji |
| FB-05 | Cart antar-user | User tidak akses cart user lain | Dua token Firebase real | 403/terisolasi | Tidak ada token real | BELUM DIUJI | Perlu akun Firebase uji |

## Integrasi Flip

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| FL-01 | Flip | Mode sandbox | Backend endpoint | Sandbox | `big_sandbox_api` | PASS | Kode runtime dan env check |
| FL-02 | Flip | Payment link sandbox | Checkout data uji terkontrol | Payment URL dan status `awaiting_payment` | Link sandbox dibuat, URL dinormalisasi absolut | PASS | `Flip_sandbox_creates_payment_link` |
| FL-03 | Flip | Bug awal link_id numeric | Respons sandbox `link_id` number | Parser menerima | Awalnya FAIL 502; diperbaiki | PASS | FAIL awal 04:08:51, PASS ulang 04:09:37 |
| FL-04 | Flip | Payment URL tanpa skema | Respons sandbox `flip.id/...` | URL absolut | Awalnya FAIL test; diperbaiki menjadi `https://...` | PASS | PASS ulang `Flip_sandbox_creates_payment_link` |
| FL-05 | Flip | Kegagalan payment | Flip mock error | `payment_failed`, stok kembali | Sesuai | PASS | `Flip_failure_marks_failed_and_releases_stock` |
| FL-06 | Flip webhook | Callback lokal dengan token `.env` | Form webhook uji terkontrol status `SUCCESSFUL` | Status order menjadi `PROCESSING` | Status `PROCESSING` | PASS | `Flip_webhook_callback` |
| FL-07 | Flip webhook sandbox real | Callback asli dari Flip sandbox | Event dari Flip | Order berubah sesuai event | Tidak ada event callback eksternal real | BELUM DIUJI | Membutuhkan callback publik/ngrok |

## Integrasi Cloudinary

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| CL-01 | Cloudinary | Admin ping | Konfigurasi `.env` | Ping OK | Ping OK | PASS | `TestBAB4BetaEnvironmentConnectivity` |
| CL-02 | Cloudinary | Upload folder uji | Raw asset uji terkontrol | Upload berhasil | Upload berhasil | PASS | `TestBAB4CloudinaryDirectUploadCleanup` |
| CL-03 | Cloudinary | Cleanup asset uji | Public ID hasil upload | Destroy berhasil | Destroy result tidak kosong | PASS | `TestBAB4CloudinaryDirectUploadCleanup` |
| CL-04 | Cloudinary via app | Upload produk/art/slider | Multipart image uji terkontrol | Upload + CRUD berhasil | CRUD produk, art print, slider PASS | PASS | `product_CRUD`, `art_print_CRUD`, `slider_CRUD` |

## Integrasi API.co.id

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| API-01 | API.co.id | Ongkir | Origin dan destination dari `.env`, weight 1 kg | Response 2xx valid JSON | Endpoint reachable | PASS | `TestBAB4BetaEnvironmentConnectivity` |
| API-02 | Checkout | Ongkir frontend dimanipulasi | Payload shipping `1`, backend quote `22000` | Backend pakai quote backend | Shipping cost `22000` | PASS | `backend_recalculates_price_and_totals` |

## WebAR, Browser, Performa, dan SUS

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| AR-01 | WebAR | Halaman AR dapat diakses | `GET /ar-view` | 200 | 200 | PASS | `public_pages_and_assets` |
| AR-02 | WebAR | File GLB dapat dimuat | `GET /assets/3d/frame.glb` | 200 | 200 | PASS | `public_pages_and_assets` |
| AR-03 | WebAR | Mode selector AR browser | Browser desktop | Selector terlihat | Selector mode AR terlihat pada halaman desktop | PASS | `docs/bukti-bab-4/browser/12-ar-mode-selector.png` |
| AR-04 | WebAR | Kamera/markerless di smartphone | Smartphone dengan WebXR | AR berjalan di perangkat | Belum dilakukan pada smartphone | MEMERLUKAN SMARTPHONE | Perlu uji perangkat fisik |
| BR-01 | Browser | Screenshot 01-18 | Browser desktop 1440x900 | File PNG dibuat dan tidak kosong | 18 PNG dibuat dan divalidasi | PASS | `docs/bukti-bab-4/browser/01-homepage.png` s.d. `18-network-glb.png` |
| BR-02 | Browser | Console error | Browser desktop | Tidak ada error fatal | Tidak ada error fatal; terdapat warning Tailwind CDN dan izin kamera desktop | PASS | `homepage-evidence.json`, `screenshot-run-report.json` |
| BR-03 | Browser | Network request gagal | Browser desktop | Tidak ada request kritikal gagal | Tidak ada HTTP 4xx/5xx pada pass screenshot terbaru | PASS | `screenshot-run-report.json`, `payment-sandbox-evidence.json` |
| PERF-01 | Performa | Loading time halaman | Browser/performance tool | Nilai loading tersedia | Belum diukur | BELUM DIUJI | Perlu tool/browser |
| PERF-02 | Performa | Frame rate WebAR | Smartphone/WebXR | FPS tersedia | Belum diukur | MEMERLUKAN SMARTPHONE | Perlu perangkat fisik |
| SUS-01 | Usability | Kuesioner SUS | Responden | Skor SUS tersedia | Belum ada responden | MEMERLUKAN RESPONDEN | Perlu pengumpulan data |

## Bug yang Ditemukan dan Diperbaiki

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| BUG-01 | Flip | `link_id` numeric | Respons Flip sandbox berisi `link_id` number | Backend menerima dan menyimpan ID | Awalnya gagal JSON unmarshal; diperbaiki dengan konversi number/string | PASS | Perubahan `handlers/payment_handler.go` |
| BUG-02 | Flip | URL tanpa skema | Respons Flip sandbox `flip.id/...` | `paymentUrl` absolut | Awalnya test gagal; diperbaiki dengan prefix `https://` | PASS | Perubahan `handlers/payment_handler.go` |
| BUG-03 | Migration | Schema beta lama | `orders` belum punya `payment_url` dan index tertentu | Migration additive menambah tanpa hapus data | Kolom/index ditambahkan | PASS | Perubahan `cmd/migrate/main.go`, log migration |

## Data Pengujian

Bukti visual Bab IV diarahkan ke data katalog nyata non-PII pada Aiven beta, yaitu Arcalod Gold, Arcalod Silver, Araclodd, Golden Eagle Sovereign, Golden Bull Power, Black Panther Royale, dan Violet Run of Freedom. Skenario otomatis CREATE, UPDATE, DELETE, pembayaran, webhook, upload, dan cleanup tetap membuat data uji terkontrol sementara agar tidak merusak data katalog aplikasi. Verifikasi cleanup menyatakan tidak ada sisa row uji pada tabel yang diuji.

## Screenshot

Screenshot otomatis berhasil dibuat menggunakan browser desktop dengan viewport 1440x900. Semua PNG dapat dibuka, tidak kosong, tidak menampilkan loading overlay, serta tidak menampilkan credential atau data pelanggan nyata. Halaman yang memuat identitas pelanggan atau order memakai identitas uji netral, sedangkan item produk dan *art print* memakai data katalog nyata dari aplikasi beta. Bukti payment link sandbox disamarkan agar tidak menampilkan URL unik secara penuh. Pengujian kamera pada desktop menghasilkan warning izin kamera, sehingga keberhasilan WebAR pada smartphone tetap berstatus MEMERLUKAN SMARTPHONE.

| ID | File | Ukuran | Status | Bukti |
|---|---|---:|---|---|
| SS-01 | `01-homepage.png` | 1280496 bytes | PASS | Halaman beranda, hero, produk, footer |
| SS-02 | `02-katalog-produk.png` | 311104 bytes | PASS | Katalog produk nyata: Arcalod Gold, Arcalod Silver, dan Araclodd |
| SS-03 | `03-art-print.png` | 757817 bytes | PASS | Katalog art print nyata: Golden Eagle Sovereign dan karya lain |
| SS-04 | `04-detail-produk.png` | 546548 bytes | PASS | Detail art print nyata: Golden Eagle Sovereign |
| SS-05 | `05-custom-frame-builder.png` | 235658 bytes | PASS | Custom frame builder dengan frame Arcalod Gold |
| SS-06 | `06-cart.png` | 586238 bytes | PASS | Keranjang berisi Golden Eagle Sovereign dan Arcalod Gold |
| SS-07 | `07-address-book.png` | 63373 bytes | PASS | Alamat uji non-PII tanpa prefix data sementara |
| SS-08 | `08-checkout.png` | 162530 bytes | PASS | Checkout berisi Golden Eagle Sovereign dan Arcalod Gold |
| SS-09 | `09-validasi-checkout.png` | 123958 bytes | PASS | Validasi checkout alamat tidak lengkap |
| SS-10 | `10-payment-sandbox.png` | 69228 bytes | PASS | Bukti payment link sandbox disamarkan |
| SS-11 | `11-invoice.png` | 106518 bytes | PASS | Invoice uji non-PII berisi data katalog nyata |
| SS-12 | `12-ar-mode-selector.png` | 129175 bytes | PASS | Mode selector AR |
| SS-13 | `13-admin-login.png` | 314665 bytes | PASS | Login admin |
| SS-14 | `14-admin-dashboard.png` | 314665 bytes | PASS | Dashboard admin |
| SS-15 | `15-admin-produk.png` | 88200 bytes | PASS | Modal produk admin |
| SS-16 | `16-admin-art-print.png` | 82867 bytes | PASS | Modal art print admin |
| SS-17 | `17-admin-order.png` | 118366 bytes | PASS | Detail order admin |
| SS-18 | `18-network-glb.png` | 76885 bytes | PASS | Bukti network GLB |

Hasil network GLB: request `frame.glb` ditemukan, HTTP 200, `content-type` aktual `application/octet-stream`, ukuran response 1.522.172 bytes, dan tidak ada 404 pada asset utama. Detail disimpan pada `docs/bukti-bab-4/browser/network-glb.json`.

## Dokumen Bab 4

| ID | Modul | Skenario | Input | Hasil diharapkan | Hasil aktual | Status | Bukti |
|---|---|---|---|---|---|---|---|
| DOC-01 | Bab 4 | Draft Markdown | Hasil pengujian aktual | File Markdown dibuat tanpa secret | `docs/BAB_4_CitraFrame_DRAFT.md` dibuat | PASS | Struktur 4.1 sampai 4.8 |
| DOC-02 | Bab 4 | Draft DOCX | Markdown Bab 4 + screenshot | File DOCX dibuat | `docs/BAB_4_CitraFrame_DRAFT.docx` diperbarui dengan gambar 4.1-4.18 | PASS | `pandoc`, inspeksi XML |
| DOC-03 | Bab 4 | Pemindaian secret | Markdown dan DOCX | Tidak ada secret/env value tercatat | Tidak ditemukan nama variabel rahasia atau token panjang | PASS | `rg`, inspeksi XML DOCX |
| DOC-04 | Bab 4 | Preview visual DOCX | Quick Look thumbnail | Preview awal tersedia | PNG preview awal dibuat | PASS | `docs/bukti-bab-4/docx-preview/BAB_4_CitraFrame_DRAFT_no_toc.docx.png` |
| DOC-05 | Bab 4 | Render penuh DOCX | `render_docx.py`/LibreOffice | Semua halaman dirender | `soffice` tidak tersedia di PATH; validasi dilakukan dengan batas dimensi gambar dan inspeksi XML | BELUM DIUJI | Render penuh memerlukan dependensi tambahan |

## Catatan Perhitungan

Tidak ada persentase total dihitung dari skenario yang berstatus `BELUM DIUJI`, `TIDAK BERLAKU`, `MEMERLUKAN SMARTPHONE`, atau `MEMERLUKAN RESPONDEN`.
