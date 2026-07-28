# Pengujian AR Dinding Polos CitraFrame

Dokumen ini dipakai untuk pengujian manual pada smartphone fisik. Jangan mengisi hasil sebelum pengujian dilakukan langsung pada perangkat.

## Prasyarat

- Smartphone Android dengan Chrome dan ARCore.
- Akses aplikasi melalui HTTPS.
- Model frame sudah tampil pada halaman AR.
- Query `?arDebug=1` boleh dipakai untuk mencatat capability dan waktu deteksi.
- Jika memakai mode manual, catat sebagai fallback manual, bukan native plane detection.

## Data Perangkat

| Field | Hasil Aktual |
|---|---|
| Nama perangkat |  |
| Versi Android |  |
| Versi Chrome |  |
| ARCore terpasang/aktif |  |
| Koneksi internet |  |
| URL pengujian |  |
| Tanggal pengujian |  |
| Penguji |  |

## Tabel Pengujian Kondisi Dinding

| No | Kondisi dinding | Perangkat | Versi Android | Versi Chrome | Dukungan ARCore | Depth supported | Waktu hit pertama | Waktu stable reticle | Native detection berhasil/gagal | Fallback manual digunakan | Waktu sampai model ditempatkan | Stabilitas model | Orientasi | Kesesuaian ukuran | Screenshot | Catatan |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Dinding bertekstur |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 2 | Dinding putih polos |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 3 | Dinding polos dengan tepi terlihat |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 4 | Dinding dengan pencahayaan rendah |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 5 | Dinding terkena pantulan |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 6 | Jarak 1 meter dari dinding |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 7 | Jarak 2 meter dari dinding |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 8 | Jarak 3 meter dari dinding |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Langkah Uji Native Detection

1. Buka halaman AR pada smartphone.
2. Pilih mode WebXR.
3. Mulai sesi AR dan izinkan kamera.
4. Arahkan kamera ke dinding.
5. Gerakkan ponsel perlahan ke kiri dan kanan sambil bergerak menyamping.
6. Catat waktu sampai hit pertama muncul.
7. Catat waktu sampai reticle hijau stabil.
8. Tempel bingkai hanya ketika reticle hijau.
9. Periksa orientasi, ukuran, dan stabilitas model.
10. Ambil screenshot bila berhasil ditempatkan.
11. Ulangi dari sudut pandang miring untuk memastikan frame tetap sejajar dinding dan sisi depan menghadap pengguna.
12. Saat reticle hijau, geser titik bidik perlahan ke atas, bawah, kiri, dan kanan pada bidang yang sama. Catat apakah reticle tetap stabil dan mengikuti posisi baru.
13. Hadapkan kamera hampir tegak lurus ke dinding rata. Catat apakah bidang cincin reticle tampak sejajar dengan dinding, bukan miring ke samping.
14. Hapus frame, pindai ulang, lalu keluar dan masuk kembali ke sesi untuk memeriksa cleanup dan listener ganda.

## Langkah Uji Dinding Polos

1. Arahkan kamera ke dinding polos.
2. Tunggu instruksi dinding polos muncul.
3. Arahkan kamera ke tepi dinding, pertemuan dinding dengan lantai, bayangan, atau detail visual sekitar.
4. Setelah reticle stabil, arahkan kembali ke posisi bingkai.
5. Jika tidak stabil sekitar 10 detik, catat bahwa native detection gagal untuk kondisi tersebut.
6. Gunakan mode manual bila diperlukan dan catat sebagai fallback manual.

## Langkah Uji Manual Placement dalam WebXR

1. Ketuk `Tempatkan secara manual`.
2. Arahkan titik tengah kamera ke perkiraan lokasi dinding.
3. Atur jarak antara 0.5 sampai 5 meter.
4. Atur tinggi, kiri/kanan, sudut dinding, dan kemiringan kecil jika diperlukan.
5. Pastikan label `Penempatan manual - posisi merupakan perkiraan` terlihat.
6. Ketuk `Konfirmasi`.
7. Catat waktu sampai model ditempatkan.
8. Jika native detection kemudian stabil, tekan `Gunakan hasil deteksi dinding` hanya jika ingin memindahkan ke hasil native.
9. Bila debug menunjukkan depth aktif, periksa apakah jarak awal manual mengikuti depth terbaru tetapi label tetap menyatakan perkiraan.

## Langkah Uji Tempatkan Manual tanpa WebXR

1. Gunakan perangkat/browser yang tidak mendukung `immersive-ar`, atau nonaktifkan dukungan WebXR hanya untuk pengujian.
2. Pastikan kartu WebXR tidak aktif dan kartu `Tempatkan Manual` tetap dapat dipilih.
3. Izinkan kamera belakang, arahkan ke dinding, lalu tekan `Tempatkan Manual`.
4. Pastikan model yang tampil adalah GLB 3D dan bukan thumbnail produk datar.
5. Geser model pada dinding. Uji juga pinch dua jari; pinch keluar harus membuat jarak lebih dekat dan model lebih besar.
6. Ubah `Jarak`, `Sudut dinding`, `Kemiringan`, dan `Koreksi skala`. Pastikan sisi/ketebalan model terlihat saat sudut dinding diubah.
7. Pastikan rasio lebar-tinggi mengikuti dimensi produk dan tidak dapat didistorsi secara bebas.
8. Tekan `Selesai Atur`, lalu pastikan kontrol ringkas `Atur Ulang` dan `Ambil Foto` tersedia.
9. Ambil foto dan periksa bahwa model GLB yang terlihat ikut masuk ke hasil, bukan gambar produk pengganti.
10. Gerakkan kamera setelah penempatan dan catat bahwa objek tidak memiliki world lock. Hal ini adalah batas yang diharapkan pada fallback non-WebXR.
11. Tolak izin kamera dan pastikan `Gunakan Dinding Virtual` masih memungkinkan alur penempatan diuji.

## Checklist Penerimaan Manual

| Kriteria | Hasil Aktual | Catatan |
|---|---|---|
| Dinding bertekstur tetap bisa dipakai |  |  |
| Reticle tidak langsung hijau dari satu hit |  |  |
| Reticle tidak bergetar berlebihan |  |  |
| Reticle dapat digeser naik/turun pada bidang yang sama selama hit tersedia |  |  |
| Reticle tampak sejajar dengan dinding rata |  |  |
| Bidang horizontal tidak dianggap dinding |  |  |
| Instruksi dinding polos muncul saat sulit dipindai |  |  |
| Fallback manual muncul jika native detection gagal |  |  |
| Manual placement dapat dikonfirmasi dalam sesi AR |  |  |
| Label manual placement terlihat |  |  |
| Ukuran produk sesuai dimensi fisik |  |  |
| Manual placement tidak disebut plane detection |  |  |
| Tempatkan Manual tetap tersedia tanpa WebXR |  |  |
| Fallback non-WebXR menampilkan model GLB 3D |  |  |
| Jarak manual mengubah proyeksi ukuran secara proporsional |  |  |
| Drag, pinch, sudut dinding, kemiringan, dan koreksi skala berfungsi |  |  |
| Screenshot non-WebXR memakai kanvas model 3D |  |  |
| UI non-WebXR menjelaskan bahwa posisi tidak world-locked |  |  |
| Screenshot AR berfungsi pada native placement |  |  |
| Screenshot AR berfungsi pada manual placement |  |  |
| Tidak ada error saat anchors/depth/plane detection tidak tersedia |  |  |
| Tap tombol tips/debug/keluar tidak ikut menempatkan frame |  |  |
| Tombol Keluar AR mengakhiri sesi dan sesi dapat dimulai kembali |  |  |
| Debug panel dapat disembunyikan dan ditampilkan kembali dengan `?arDebug=1` |  |  |
| Instruksi, badge ukuran, bantuan, dan kontrol bawah tidak saling menutup |  |  |

## Catatan Tambahan

Isi bagian ini hanya setelah pengujian smartphone dilakukan.

```text

```
