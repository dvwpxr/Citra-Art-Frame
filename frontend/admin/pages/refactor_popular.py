from refactor import wrap_page

popular_content = """
<div class="stats-grid">
  <div class="stat-card gold">
    <div class="stat-header">
      <div class="stat-label">Total Frame Populer</div>
      <div class="stat-icon gold"><i class="ri-star-line"></i></div>
    </div>
    <div class="stat-value" id="total-popular-frames">0</div>
    <div class="stat-sub">Frame yang tampil di homepage</div>
  </div>
  <div class="stat-card blue">
    <div class="stat-header">
      <div class="stat-label">Total Produk Frame</div>
      <div class="stat-icon blue"><i class="ri-archive-2-line"></i></div>
    </div>
    <div class="stat-value" id="total-frame-products">0</div>
    <div class="stat-sub">Semua produk dengan kategori 'Frame'</div>
  </div>
</div>

<div class="grid" style="grid-template-columns:1fr 2fr; gap:24px;">
  <div class="card" style="height:fit-content">
    <h2 class="card-title">Tambahkan Frame</h2>
    <p class="card-subtitle">Pilih dari semua frame yang ada untuk ditampilkan di halaman utama.</p>
    <div class="form-group">
      <label for="all-frames-select">Pilih Frame</label>
      <select id="all-frames-select">
        <option value="">Memuat frame...</option>
      </select>
    </div>
    <button id="add-popular-btn" class="btn btn-primary" style="width:100%;justify-content:center"><i class="ri-add-line"></i> Jadikan Populer</button>
  </div>

  <div class="card">
    <h2 class="card-title">Daftar Frame Populer Saat Ini</h2>
    <div id="popular-frames-list" class="grid-3" style="margin-top:24px"></div>
  </div>
</div>
"""

popular_scripts = '<script src="/admin/js/popular-script.js"></script>'

with open("popular_frames.html", "w") as f:
    f.write(wrap_page("Popular Frames", "popular_frames", popular_content, "", popular_scripts))

print("popular_frames.html refactored")
