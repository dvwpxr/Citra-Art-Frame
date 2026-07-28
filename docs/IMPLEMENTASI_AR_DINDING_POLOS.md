# Implementasi AR Dinding Polos CitraFrame

## Diagnosis Akar Masalah

WebXR di browser Android bergantung pada ARCore untuk memahami permukaan melalui feature points. Dinding yang rata, polos, seragam, terlalu gelap, atau terlalu memantul dapat benar-benar gagal menghasilkan hit-test karena tidak ada detail visual yang cukup. Kode aplikasi tidak bisa menjamin native plane detection pada semua dinding polos.

Penyebab dari implementasi lama:

- Reticle dapat muncul dari satu hit-test tanpa menunggu bukti stabil beberapa frame.
- Belum ada klasifikasi bidang vertikal, sehingga hasil horizontal tidak ditolak secara eksplisit untuk penempatan bingkai dinding.
- Smoothing hanya merata-ratakan posisi dan belum memeriksa normal/orientasi.
- Belum ada transient hit-test berbasis input sentuh.
- Hit-test source dibuat dari render loop, bukan alur lifecycle sesi yang lebih jelas.
- Belum ada fallback manual di dalam sesi AR ketika native hit-test tidak stabil.
- Instruksi pemindaian belum cukup menjelaskan kasus dinding polos.

Temuan dari audit dan bukti foto pengujian smartphone yang diberikan pada 14 Juli 2026:

- Tracker lama membandingkan jarak absolut antartitik. Pergeseran reticle ke atas, bawah, kiri, atau kanan pada dinding yang sama dapat memutus stable streak walaupun titik masih berada pada bidang yang sama.
- Normal dari satu hit pose dapat bising pada dinding minim fitur. Akibatnya reticle dapat tampak miring terhadap dinding yang secara visual rata.
- Overlay instruksi, badge ukuran, tombol bantuan, dan panel panduan dapat saling menutup pada viewport ponsel sempit.

Temuan dari rekaman layar pengujian smartphone 16 Juli 2026:

- Dinding pertama yang polos tidak cepat membentuk plane, sedangkan dinding kedua dengan lukisan langsung menghasilkan reticle stabil.
- Source hit-test hanya meminta entitas `plane`, sehingga feature point kecil pada dinding pertama tidak ikut digunakan sebelum ARCore berhasil membentuk plane.
- Satu frame tanpa hit menghapus seluruh stable streak, sehingga hit yang jarang muncul pada dinding polos tidak pernah terkumpul menjadi stabil.
- Hanya hasil hit-test pertama dari setiap ray yang dibaca. Jika hasil terdekat adalah lantai, hasil dinding vertikal berikutnya tidak pernah diperiksa.
- Kedalaman model 40 x 60 cm menjadi sekitar 4,65 cm dan pusat model hanya digeser 6 mm dari bidang. Akibatnya sisi belakang model menembus bidang dinding dan tampak tidak benar-benar menempel saat dilihat dari samping.

Temuan dari rekaman dan foto pengujian lanjutan 16 Juli 2026 pukul 15.12:

- Reticle stabil berada pada dinding, tetapi penempatan final dapat berpindah jauh ke depan saat tombol bawah diketuk.
- Penyebabnya adalah transient touchscreen hit-test mengikuti koordinat sentuhan pada tombol di bawah layar, bukan titik reticle tengah. Toleransi lama masih mengizinkan transient hit yang berbeda kedalaman sampai 45 cm menggantikan stable hit.
- Ketika anchor aktif, kode membaca local Y anchor sebagai normal baru setiap frame. Orientasi anchor tidak perlu dipakai kembali sebagai normal dinding dan dapat membuat frame tidak lagi sejajar dengan plane awal.
- Point hit pada dinding polos dapat membawa normal yang terlihat horizontal. Point mentah tidak cukup aman untuk langsung dianggap bidang dinding.

## File Implementasi

- `frontend/assets/js/ar-logic.js`
  - Mengatur sesi WebXR, hit-test, reticle, placement native, placement manual, screenshot, anchor opsional, depth opsional, dan debug panel.
- `frontend/assets/js/ar-visualizer.js`
  - Mengatur penempatan manual non-WebXR dengan kamera browser, model GLB langsung, proyeksi perspektif berdasarkan ukuran fisik dan jarak, gesture drag/pinch, sudut 3D, kalibrasi skala, dan screenshot komposit.
- `frontend/assets/js/ar-surface-utils.mjs`
  - Modul testable untuk klasifikasi normal, smoothing, SurfaceTracker, session config, manual placement, dan helper mock WebXR.
- `frontend/pages/ar.html`
  - Menambahkan overlay tips dinding polos, fallback manual, kontrol manual, label manual, tawaran native hit, dan debug panel.
- `frontend/assets/css/ar.css`
  - Styling overlay AR baru.
- `frontend/tests/ar-surface-utils.test.mjs`
  - Unit test matematika dan tracking.
- `frontend/tests/ar-webxr-session.test.mjs`
  - Mock WebXR test untuk session, fallback, transient hit-test, cleanup, dan placement policy.
- `frontend/tests/ar-model-asset.test.mjs`
  - Validasi struktur GLB, mapping sumbu X/Y/Z, dan skala fisik model.

## Alur Native Hit-Test

1. Aplikasi memeriksa dukungan `navigator.xr.isSessionSupported("immersive-ar")` sebelum tombol mulai diaktifkan. Saat tombol diklik, `requestSession()` dipanggil langsung agar transient user activation tidak hilang.
2. Sesi diminta dengan `hit-test` sebagai required feature.
3. Fitur berikut diminta sebagai optional:
   - `dom-overlay`
   - `anchors`
   - `plane-detection`
   - `depth-sensing`
   - `light-estimation`
4. Jika konfigurasi lengkap gagal, aplikasi mencoba satu kali lagi dengan konfigurasi minimum `requiredFeatures: ["hit-test"]`; `dom-overlay` tetap diminta secara optional bila root UI tersedia agar kontrol AR masih dapat dipakai pada browser yang mendukungnya.
5. Setelah sesi aktif, aplikasi membuat viewer hit-test source satu kali.
6. Jika `XRRay` tersedia, aplikasi mencoba empat plane ray kecil di sekitar tengah layar. Point fallback memakai center ray dan empat ray tersendiri dengan sebaran lebih lebar setelah 2,5 detik.
7. Plane dan feature point sekarang diminta melalui source terpisah. Plane hit-test tetap menjadi sumber utama, sedangkan point source baru dibaca setelah 2,5 detik tanpa hasil cepat.
8. Point hit tidak menggunakan normal mentah. Aplikasi mengumpulkan sampai 16 sampel selama 1,4 detik, membuang outlier, membentuk hipotesis plane vertikal dari sedikitnya tiga inlier, lalu memotong ray tengah kamera dengan plane tersebut.
9. Hipotesis point-cloud memerlukan sedikitnya enam frame stabil sebelum penempatan diaktifkan, lebih ketat daripada plane native.
10. Bila `xrFrame.detectedPlanes` tersedia, vertical `XRPlane` dan polygonnya dipakai sebagai sumber paling kuat. Ray tengah hanya diterima bila benar-benar memotong polygon plane.
11. Dari setiap source, aplikasi memeriksa sampai empat hasil dan memprioritaskan hasil vertikal. Hal ini memungkinkan hasil dinding dipakai ketika hasil terdekat pada ray adalah lantai atau bidang horizontal.
12. Transient touchscreen source tidak dipakai oleh halaman AR karena penempatan dilakukan melalui tombol DOM. Posisi final selalu berasal dari reticle tengah yang sudah stabil.
13. Setiap frame membaca hasil hit-test dan menghitung:
   - posisi hit;
   - normal bidang dari local Y axis pose hit-test;
   - quaternion kanonik yang dibangun dari normal permukaan;
   - klasifikasi bidang: vertical, horizontal, inclined, atau unknown.
14. Normal dibalik bila perlu agar mengarah ke viewer. Hal ini mencegah normal `n` dan `-n` pada permukaan yang sama memutus tracking.
15. Untuk hit vertikal, komponen Y normal dihilangkan setelah klasifikasi agar frame dan reticle tetap tegak. Toleransi klasifikasi tetap diterapkan pada normal mentah sehingga bidang miring tidak disamarkan sebagai dinding.
16. Bila sedikitnya tiga hit nyata dari ray yang berbeda konsisten, aplikasi membentuk plane robust, membuang outlier kedalaman, dan memproyeksikan hit kembali ke plane tersebut.
17. Untuk bingkai dinding, hanya bidang vertical yang dapat menjadi kandidat stabil.
18. Jika horizontal terdeteksi, UI memberi instruksi untuk mengarah ke dinding tegak.

## SurfaceTracker dan Reticle

State tracker:

- `searching`
- `candidate`
- `stable`
- `lost`
- `manual`

Aturan stabilisasi:

- Hit pertama menjadi `candidate`, bukan `stable`.
- Reticle menjadi `stable` setelah beberapa hit berurutan yang konsisten terhadap bidang, normal, dan quaternion.
- Gerakan di sepanjang bidang dinding diperbolehkan dengan batas lompatan realistis. Gerakan menembus bidang tetap memutus stable streak.
- Jeda hit singkat sampai 360 ms pada kandidat dinding tidak lagi membuang progres stabilisasi. Reticle berubah merah dan penempatan tetap dinonaktifkan sampai hit nyata kembali.
- Bidang horizontal langsung membuang streak kandidat lama agar lantai tidak mewarisi progres dinding.
- Posisi, normal, dan quaternion dismoothing dengan exponential moving average ringan.
- Jika hit hilang sebentar, reticle tidak langsung dibuang; tracker masuk `lost` selama grace period.
- Setelah grace period habis, state kembali ke `searching`.
- Tombol penempatan native aktif hanya ketika tracker `stable` dan hit belum melewati maximum hit age.

Konfigurasi utama berada di `SURFACE_TRACKING_CONFIG`:

- `stableFrameCount`
- `planeDistanceToleranceM`
- `tangentialJumpToleranceM`
- `normalAngleToleranceDeg`
- `quaternionAngleToleranceDeg`
- `candidateMissGracePeriodMs`
- `lostGracePeriodMs`
- `maximumHitAgeMs`
- `maximumViewerPoseAgeMs`
- `verticalNormalYMax`
- `horizontalNormalYMin`
- `manualFallbackAfterMs`
- `maximumDepthAgeMs`
- `movementSmoothingAlpha`
- `movementSmoothingThresholdM`

Nilai hasil kalibrasi rekaman 16 Juli 2026: 4 hit konsisten, toleransi perpindahan menembus bidang 0.07 m, batas lompatan sepanjang bidang 0.55 m per hit, toleransi normal 24 derajat, sparse-hit grace 360 ms, lost grace 800 ms, maximum hit age 900 ms, dan timeout fallback 10 detik. Perpindahan tangensial yang disengaja memakai smoothing lebih responsif.

Warna reticle:

- Kuning: candidate.
- Hijau: stable.
- Merah: lost.
- Tidak tampil: searching, manual preview, atau setelah frame ditempatkan.

## Penempatan Manual dalam WebXR

Fallback muncul jika tidak ada bidang stabil sekitar 10 detik setelah pemindaian dimulai.

Mode manual:

1. Pengguna mengarahkan titik tengah kamera ke perkiraan posisi dinding.
2. Pengguna memilih jarak dinding 0.5 sampai 5 meter, default 2 meter. Depth CPU yang valid dan masih segar dapat mengisi nilai awal jarak, tetapi posisi tetap diberi label perkiraan.
3. Aplikasi mengambil forward vector kamera.
4. Komponen vertikal forward dihilangkan agar virtual wall tetap tegak.
5. Posisi plane manual dihitung dari posisi kamera + forward horizontal x jarak.
6. Offset tinggi, kiri/kanan, sudut dinding, dan kemiringan kecil diterapkan dari kontrol pengguna.
7. Model ditempatkan menghadap pengguna dengan local +Z frame ke arah kamera.
8. Pusat model digeser setengah kedalaman fisik ditambah gap 1 mm agar sisi belakang bingkai menempel pada plane tanpa menembus dinding.
9. Label selalu ditampilkan: `Penempatan manual - posisi merupakan perkiraan`.

Manual placement tidak disebut sebagai plane detection dan tidak dilaporkan sebagai keberhasilan deteksi bidang.

Jika native hit-test kemudian menjadi stabil saat mode manual aktif atau setelah frame manual ditempatkan, aplikasi hanya menampilkan tombol `Gunakan hasil deteksi dinding`. Model tidak dipindahkan tiba-tiba.

## Penempatan Manual tanpa WebXR

Perangkat yang tidak menyediakan `navigator.xr` atau tidak mendukung sesi `immersive-ar` tetap memperoleh fitur `Tempatkan Manual`. Mode ini tidak menjalankan WebXR dan tidak disebut sebagai keberhasilan markerless plane detection.

Alur non-WebXR:

1. Kamera belakang dibuka melalui `getUserMedia` sebagai latar visual. Bila izin kamera tidak tersedia, pengguna dapat mencoba alur dengan dinding virtual.
2. Model yang ditampilkan tetap `frame.glb`, bukan thumbnail atau gambar produk yang diperbesar.
3. Dimensi produk dalam sentimeter diproyeksikan ke piksel menggunakan perspective camera model, vertical field-of-view referensi 55 derajat, dan jarak pilihan pengguna 0,5 sampai 5 meter.
4. Pengguna menekan `Tempatkan Manual`, menggeser model ke posisi dinding, dan dapat memakai pinch dua jari untuk mengubah estimasi jarak.
5. Kontrol `Sudut dinding` memutar model pada sumbu vertikal sehingga sisi dan ketebalan GLB terlihat. Kontrol `Kemiringan` merapikan orientasi bingkai, sedangkan `Koreksi skala` mengompensasi perbedaan field-of-view kamera antarperangkat.
6. Ukuran produk tetap ditampilkan dalam sentimeter. Jika proyeksi terlalu besar untuk area kontrol, tampilan dibatasi dan UI menjelaskan bahwa jarak tetap berupa perkiraan.
7. Setelah `Selesai Atur`, posisi dikunci pada koordinat layar. Tombol `Atur Ulang` membuka kembali semua kontrol.
8. Screenshot menggabungkan frame video dengan kanvas WebGL model 3D yang sedang terlihat. Implementasi lama yang mengambil thumbnail produk tidak lagi dipakai.

Batas akademik mode ini:

- tidak mendeteksi plane;
- tidak memiliki world coordinate atau world anchor;
- tidak mempertahankan posisi pada dinding ketika kamera dipindahkan;
- dicatat sebagai fallback penempatan manual berbasis kamera, bukan hasil pengujian utama markerless WebXR.

## Orientasi dan Skala Model

Model tetap memakai `frontend/assets/3d/frame.glb`.

Inspeksi GLB:

- Asset GLB valid versi glTF 2.0.
- Node berasal dari Sketchfab `Frame03`.
- Model memiliki sumbu visual utama pada X sebagai lebar, Y sebagai tinggi, dan Z sebagai kedalaman setelah transform Three.js.

Mapping ukuran:

- Input produk dalam sentimeter dikonversi ke meter; nilai nol, negatif, atau tidak valid memakai fallback 40 x 60 cm.
- Lebar frame memakai dimensi X model.
- Tinggi frame memakai dimensi Y model.
- Skala X dan Y menghasilkan lebar dan tinggi fisik yang tepat dalam meter.
- Kedalaman fisik Z dibatasi maksimum 2,5 cm agar model 40 x 60 cm tidak lagi menjadi sekitar 4,65 cm tebal.
- Posisi pusat model digeser sebesar setengah kedalaman fisik ditambah gap 1 mm. Dengan demikian sisi belakang bingkai berada pada bidang dinding dan seluruh geometri tetap berada di depan dinding.
- Penempatan final tidak lagi mengambil posisi transient dari tombol. Stable hit reticle menjadi satu-satunya kedalaman penempatan.
- Jika native anchor berhasil dibuat pada posisi hit mentah, aplikasi menyimpan selisih lengkap antara anchor dan transform model. Selisih ini diterapkan kembali setiap frame sehingga smoothing, koreksi plane, dan offset kontak tidak hilang saat anchor mulai aktif.
- Arah frame dikunci dari normal plane saat penempatan. Pose anchor berikutnya hanya memperbarui translasi dan tidak boleh mengubah normal dinding.
- Kontrol manual tidak mengubah skala produk.
- Koreksi skala pada mode non-WebXR hanya mengkalibrasi proyeksi layar karena browser kamera biasa tidak memberikan registrasi spasial yang setara dengan WebXR.

Orientasi:

- Native placement memakai posisi hit-test asli.
- Local Y pose hit-test dipakai sebagai normal sesuai WebXR Hit Test specification. Twist pose di sekitar normal tidak dipakai karena sumbu lain tidak dijamin konsisten lintas runtime.
- Arah hadap frame memakai normal dinding yang telah diarahkan ke viewer dan diproyeksikan horizontal, sehingga frame tegak, sejajar dinding, dan sisi lokal +Z menghadap pengguna.
- Manual placement memakai forward kamera horizontal dan normal kebalikannya untuk menghadap pengguna.

## Optional Feature

Fitur optional hanya dianggap tersedia setelah sesi aktif dan ada bukti API dapat digunakan:

- DOM overlay: true jika session memiliki `domOverlayState`.
- Transient hit-test tidak diaktifkan pada halaman AR karena kontrol penempatan berada di DOM overlay dan ray sentuhnya tidak sama dengan reticle tengah.
- Anchors: true jika `hitResult.createAnchor()` berhasil.
- Plane detection: true jika `xrFrame.detectedPlanes` terlihat.
- Depth sensing: true jika `xrFrame.getDepthInformation(view)` mengembalikan depth info.
- Light estimation: true jika `session.requestLightProbe()` berhasil.

Depth sensing tidak menjadi dependency utama dan sesi hanya meminta penggunaan `cpu-optimized`, sesuai implementasi pembacaan `XRCPUDepthInformation`. Jika depth tersedia, nilai tengah frame yang masih segar dapat menjadi nilai awal jarak manual dan tetap dicatat di debug panel. Jika tidak tersedia, AR tetap memakai hit-test biasa dan default manual 2 meter.

Source hit-test dan listener dibuat satu kali per sesi. Token sesi mencegah hasil async dari sesi lama masuk ke sesi baru. Semua source dibatalkan saat sesi berakhir; anchor dihapus saat frame dilepas, diganti, atau sesi selesai. Tap pada kontrol DOM overlay juga dicegah agar tidak sekaligus memicu event placement WebXR. Manual placement menolak konfirmasi bila viewer pose tidak tersedia atau sudah kedaluwarsa.

Overlay WebXR memakai baris atas terpisah untuk keluar dan ukuran, status di bawahnya, panel panduan ringkas di atas kontrol utama, serta layout kontrol khusus saat frame sudah terpasang. Susunan ini mencegah teks status tertutup badge ukuran dan menjaga tombol hapus, rotasi, serta foto tetap muat pada ponsel sempit.

## Debug Mode

Debug panel aktif hanya dengan query parameter:

```text
?arDebug=1
```

Panel menampilkan capability, status source, anchor, plane/depth/light support, jumlah point sample, jumlah vertical detected plane, hit count per frame, stable streak, klasifikasi surface, normal, state reticle, waktu first hit, waktu first stable, mode placement, estimasi jarak manual/depth, FPS, dan error terakhir.

Panel tidak menampilkan token, secret, data pelanggan, atau log per frame ke console.

## Batasan Tersisa

- Dinding putih polos tanpa feature points tetap bisa gagal dideteksi oleh ARCore/WebXR.
- Reticle hanya dapat mengikuti gerakan selama WebXR masih menghasilkan hit nyata. Saat seluruh hit hilang, aplikasi hanya mempertahankan pose terakhir selama grace period dan tidak mengizinkan penempatan dari pose lama.
- Koreksi normal multi-ray memerlukan setidaknya tiga hit konsisten. Pada perangkat yang hanya menyediakan satu hit, aplikasi tetap memakai normal hit pose yang sudah dibuat tegak dan dismoothing.
- Depth sensing belum tersedia konsisten pada semua browser/perangkat.
- Anchors digunakan hanya jika browser menyediakan `createAnchor` pada hit result.
- Screenshot WebXR perlu diverifikasi pada perangkat karena compositor passthrough kamera tidak wajib ikut terbaca oleh `canvas.toDataURL()`.
- Penempatan manual non-WebXR terkunci pada layar, bukan pada koordinat dinding. Pengguna perlu mengatur kembali jika posisi kamera berubah.
- Arah depan model lokal +Z telah dipertahankan berdasarkan preview/model saat ini, tetapi hasil visual sisi depan/belakang tetap harus dikonfirmasi pada smartphone setelah placement native dan manual.
- Pengujian smartphone fisik tetap diperlukan untuk mengukur waktu first hit, stable reticle, dan stabilitas model nyata.

## Perintah Test

```bash
node --test frontend/tests/ar-*.test.mjs
find frontend \( -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n 1 node --check
cd backend && go test ./...
```
