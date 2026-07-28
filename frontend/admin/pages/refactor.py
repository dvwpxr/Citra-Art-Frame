import re
import os

layout = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Admin Dashboard - CitraFrame</title>
  <link href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:#0c0c0f;color:#e0e0e0;min-height:100vh;display:flex}
    /* Sidebar */
    .sidebar{width:260px;background:linear-gradient(180deg,#111115 0%,#0c0c0f 100%);border-right:1px solid rgba(255,255,255,0.06);height:100vh;position:fixed;left:0;top:0;z-index:50;display:flex;flex-direction:column;transition:transform 0.3s}
    .sidebar-brand{padding:24px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:10px}
    .sidebar-brand i{font-size:1.5rem;color:#c09553}
    .sidebar-brand span{font-size:1rem;font-weight:800;color:#fff;letter-spacing:2px}
    .sidebar-nav{flex:1;padding:16px 12px;display:flex;flex-direction:column;gap:2px}
    .nav-item{display:flex;align-items:center;gap:12px;padding:11px 16px;border-radius:10px;color:rgba(255,255,255,0.45);font-size:0.85rem;font-weight:500;text-decoration:none;transition:all 0.2s}
    .nav-item:hover{background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.8)}
    .nav-item.active{background:linear-gradient(135deg,rgba(192,149,83,0.15),rgba(192,149,83,0.05));color:#c09553;font-weight:600}
    .nav-item i{font-size:1.15rem;width:20px;text-align:center}
    .nav-section{font-size:0.65rem;font-weight:700;color:rgba(255,255,255,0.2);letter-spacing:2px;padding:20px 16px 8px;text-transform:uppercase}
    /* Main */
    .main{flex:1;margin-left:260px;min-height:100vh}
    .topbar{position:sticky;top:0;z-index:40;padding:16px 28px;background:rgba(12,12,15,0.8);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between}
    .topbar h1{font-size:1.15rem;font-weight:700;color:#fff}
    .topbar-actions{display:flex;align-items:center;gap:12px}
    .btn-logout{display:flex;align-items:center;gap:6px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.2s}
    .btn-logout:hover{background:rgba(239,68,68,0.2)}
    .content{padding:28px}
    /* Stats Grid */
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px}
    .stat-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:22px;transition:all 0.3s;position:relative;overflow:hidden}
    .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:16px 16px 0 0}
    .stat-card.gold::before{background:linear-gradient(90deg,#c09553,#e8b96a)}
    .stat-card.blue::before{background:linear-gradient(90deg,#3b82f6,#60a5fa)}
    .stat-card.green::before{background:linear-gradient(90deg,#22c55e,#4ade80)}
    .stat-card.purple::before{background:linear-gradient(90deg,#8b5cf6,#a78bfa)}
    .stat-card.red::before{background:linear-gradient(90deg,#ef4444,#f87171)}
    .stat-card:hover{border-color:rgba(255,255,255,0.12);transform:translateY(-2px)}
    .stat-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .stat-icon{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.2rem}
    .stat-icon.gold{background:rgba(192,149,83,0.12);color:#c09553}
    .stat-icon.blue{background:rgba(59,130,246,0.12);color:#60a5fa}
    .stat-icon.green{background:rgba(34,197,94,0.12);color:#4ade80}
    .stat-icon.purple{background:rgba(139,92,246,0.12);color:#a78bfa}
    .stat-icon.red{background:rgba(239,68,68,0.12);color:#f87171}
    .stat-label{font-size:0.78rem;color:rgba(255,255,255,0.4);font-weight:500}
    .stat-value{font-size:1.6rem;font-weight:800;color:#fff;margin-bottom:4px}
    .stat-sub{font-size:0.72rem;color:rgba(255,255,255,0.3)}
    /* Card */
    .card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:24px;margin-bottom:24px}
    .card-title{font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:4px}
    .card-subtitle{font-size:0.85rem;color:rgba(255,255,255,0.35);margin-bottom:20px}
    /* Table */
    .table-container{overflow-x:auto; margin-top: 16px;}
    table{width:100%;border-collapse:collapse}
    thead th{text-align:left;padding:12px 16px;font-size:0.75rem;font-weight:600;color:rgba(255,255,255,0.35);border-bottom:1px solid rgba(255,255,255,0.06);text-transform:uppercase;letter-spacing:0.5px}
    tbody td{padding:16px 16px;font-size:0.85rem;border-bottom:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.7)}
    tbody tr:hover{background:rgba(255,255,255,0.02)}
    /* Badges */
    .badge{padding:4px 10px;border-radius:8px;font-size:0.7rem;font-weight:700;letter-spacing:0.3px}
    .badge-pending{background:rgba(250,204,21,0.12);color:#fbbf24;border:1px solid rgba(250,204,21,0.2)}
    .badge-processing{background:rgba(59,130,246,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.2)}
    .badge-shipped{background:rgba(139,92,246,0.12);color:#a78bfa;border:1px solid rgba(139,92,246,0.2)}
    .badge-delivered{background:rgba(34,197,94,0.12);color:#4ade80;border:1px solid rgba(34,197,94,0.2)}
    .badge-canceled{background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.2)}
    /* Forms & Actions */
    .form-group{margin-bottom:16px}
    label{display:block;font-size:0.8rem;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:8px}
    input, select, textarea {
      width: 100%;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.85rem;
      outline: none;
      transition: all 0.2s;
    }
    input:focus, select:focus, textarea:focus {
      border-color: rgba(192,149,83,0.5);
      background: rgba(255,255,255,0.05);
    }
    .btn {
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn-primary { background: #c09553; color: #000; }
    .btn-primary:hover { background: #e8b96a; }
    .btn-secondary { background: rgba(255,255,255,0.05); color: #fff; border: 1px solid rgba(255,255,255,0.1); }
    .btn-secondary:hover { background: rgba(255,255,255,0.1); }
    .btn-danger { background: rgba(239,68,68,0.15); color: #f87171; }
    .btn-danger:hover { background: rgba(239,68,68,0.25); }
    .btn-icon { padding: 8px; border-radius: 8px; font-size: 1.1rem; }
    .btn-icon.edit { color: #60a5fa; background: rgba(59,130,246,0.1); }
    .btn-icon.edit:hover { background: rgba(59,130,246,0.2); }
    .btn-icon.delete { color: #f87171; background: rgba(239,68,68,0.1); }
    .btn-icon.delete:hover { background: rgba(239,68,68,0.2); }
    .btn-icon.view { color: #c09553; background: rgba(192,149,83,0.1); }
    .btn-icon.view:hover { background: rgba(192,149,83,0.2); }
    .header-actions { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
    .filter-group { display: flex; gap: 12px; align-items: center; }
    /* Modal */
    .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100; align-items: center; justify-content: center; backdrop-filter: blur(4px); padding: 20px; }
    .modal.active { display: flex; }
    .modal-content { background: #111115; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
    .modal-content.lg { max-width: 800px; }
    .modal-header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; }
    .modal-header h2 { font-size: 1.2rem; font-weight: 700; color: #fff; }
    .modal-close { background: none; border: none; color: rgba(255,255,255,0.5); font-size: 1.5rem; cursor: pointer; }
    .modal-close:hover { color: #fff; }
    .modal-body { padding: 24px; overflow-y: auto; flex: 1; }
    .modal-footer { padding: 20px 24px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: flex-end; gap: 12px; }
    /* Grid */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; }
    /* Pagination */
    .pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); }
    .page-info { font-size: 0.85rem; color: rgba(255,255,255,0.5); }
    /* Notification */
    .notification { position: fixed; top: 20px; right: 20px; background: #22c55e; color: #fff; padding: 12px 20px; border-radius: 10px; font-weight: 600; font-size: 0.85rem; z-index: 1000; transform: translateX(150%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .notification.show { transform: translateX(0); }
    .notification.error { background: #ef4444; }
    @media(max-width:768px){.sidebar{transform:translateX(-100%)}.sidebar.open{transform:translateX(0)}.main{margin-left:0}}
    .text-sm { font-size: 0.85rem; } .text-xs { font-size: 0.75rem; }
    .text-gray-400 { color: rgba(255,255,255,0.4); }
    .font-semibold { font-weight: 600; } .font-bold { font-weight: 700; }
    .mt-4 { margin-top: 16px; } .mb-2 { margin-bottom: 8px; }
    .flex { display: flex; } .justify-between { justify-content: space-between; }
    /* Modal details specific to orders */
    .detail-section { margin-bottom: 24px; }
    .detail-section h3 { font-size: 0.9rem; font-weight: 700; color: #fff; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; }
    .detail-text { font-size: 0.85rem; color: rgba(255,255,255,0.7); line-height: 1.5; }
    .detail-text strong { color: #fff; }
    .items-list { background: rgba(255,255,255,0.02); border-radius: 8px; padding: 12px; }
    .item-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .item-row:last-child { border-bottom: none; }
    .item-name { font-weight: 600; color: #fff; margin-bottom: 4px; }
    .item-meta { font-size: 0.75rem; color: rgba(255,255,255,0.5); }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 0.85rem; color: rgba(255,255,255,0.7); }
    .totals-row.grand { font-weight: 700; color: #fff; font-size: 1rem; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 8px; padding-top: 12px; }
  </style>
</head>
<body>
  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <i class="ri-camera-lens-line"></i>
      <span>CITRAFRAME</span>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section">Menu</div>
      <a href="/dashboard" class="nav-item"><i class="ri-dashboard-3-line"></i>Dashboard</a>
      <a href="/dashboard/order" class="nav-item {{ORDER_ACTIVE}}"><i class="ri-shopping-bag-3-line"></i>Pesanan</a>
      <a href="/dashboard/product" class="nav-item {{PRODUCT_ACTIVE}}"><i class="ri-archive-2-line"></i>Produk</a>
      <a href="/dashboard/prints" class="nav-item {{PRINTS_ACTIVE}}"><i class="ri-image-2-line"></i>Art Prints</a>
      <div class="nav-section">Pengaturan</div>
      <a href="/dashboard/slider" class="nav-item {{SLIDER_ACTIVE}}"><i class="ri-slideshow-3-line"></i>Hero Slider</a>
      <a href="/dashboard/popular-frames" class="nav-item"><i class="ri-star-line"></i>Popular Frames</a>
    </nav>
  </aside>

  <!-- Main Content -->
  <main class="main">
    <div class="topbar">
      <div>
        <button type="button" id="sidebar-toggle" style="display:none;background:none;border:none;color:#fff;font-size:1.3rem;cursor:pointer;margin-right:12px"><i class="ri-menu-line"></i></button>
        <h1>{{PAGE_TITLE}}</h1>
      </div>
      <div class="topbar-actions">
        <span style="font-size:0.82rem;color:rgba(255,255,255,0.4)">Admin</span>
        <button class="btn-logout" id="logoutBtn"><i class="ri-logout-box-r-line"></i>Logout</button>
      </div>
    </div>

    <div class="content">
      {{PAGE_CONTENT}}
    </div>
  </main>
  
  {{PAGE_MODALS}}
  
  <div id="notification" class="notification">Notification message</div>
  
  <script>
    // Logout
    document.getElementById("logoutBtn")?.addEventListener("click", async()=>{
      await fetch("/api/admin/logout",{method:"POST"});
      document.cookie = "jwt_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      window.location.href = "/login";
    });

    // Mobile sidebar toggle
    if(window.innerWidth<=768){
        const toggle = document.getElementById("sidebar-toggle");
        if(toggle) toggle.style.display="inline-block";
    }
    document.getElementById("sidebar-toggle")?.addEventListener("click",()=>{
        document.getElementById("sidebar").classList.toggle("open");
    });
  </script>
  {{PAGE_SCRIPTS}}
</body>
</html>"""

def wrap_page(title, nav_active, content, modals, scripts):
    page = layout.replace("{{PAGE_TITLE}}", title)
    page = page.replace("{{ORDER_ACTIVE}}", "active" if nav_active == "order" else "")
    page = page.replace("{{PRODUCT_ACTIVE}}", "active" if nav_active == "product" else "")
    page = page.replace("{{PRINTS_ACTIVE}}", "active" if nav_active == "prints" else "")
    page = page.replace("{{SLIDER_ACTIVE}}", "active" if nav_active == "slider" else "")
    page = page.replace("{{PAGE_CONTENT}}", content)
    page = page.replace("{{PAGE_MODALS}}", modals)
    page = page.replace("{{PAGE_SCRIPTS}}", scripts)
    return page

order_content = """
<div class="card">
  <div class="header-actions">
    <div>
      <h2 class="card-title">Order Management</h2>
      <p class="card-subtitle">Kelola seluruh pesanan pelanggan.</p>
    </div>
    <div class="filter-group">
      <input type="date" id="fromDate" style="display:none" />
      <input type="date" id="toDate" style="display:none" />
      <select id="statusFilter" style="width:140px">
        <option value="">All Status</option>
        <option value="PENDING">Pending</option>
        <option value="PROCESSING">Processing</option>
        <option value="SHIPPED">Shipped</option>
        <option value="DELIVERED">Delivered</option>
        <option value="CANCELED">Canceled</option>
      </select>
      <input type="text" id="searchInput" placeholder="Search by customer/order #" style="width:240px" />
    </div>
  </div>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Order #</th>
          <th>Customer</th>
          <th>Items</th>
          <th>Total</th>
          <th>Status</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="orders-table-body">
        <tr><td colspan="7" style="text-align:center;padding:32px;color:rgba(255,255,255,0.25)">Memuat data...</td></tr>
      </tbody>
    </table>
  </div>
  <div class="pagination">
    <div class="page-info" id="orders-count">0 orders</div>
    <div style="display:flex;gap:8px">
      <button id="prevPage" class="btn btn-secondary">Prev</button>
      <button id="nextPage" class="btn btn-secondary">Next</button>
    </div>
  </div>
</div>
"""

order_modals = """
<div id="orderModal" class="modal">
  <div class="modal-content lg">
    <div class="modal-header">
      <h2 id="orderModalTitle">Order Detail</h2>
      <button id="closeOrderModalBtn" class="modal-close"><i class="ri-close-line"></i></button>
    </div>
    <div class="modal-body">
      <div class="grid-2" style="margin-bottom:24px">
        <div class="detail-section">
          <h3>Customer</h3>
          <div class="detail-text" id="od-customer">—</div>
          <h3 style="margin-top:16px">Shipping Address</h3>
          <div class="detail-text" id="od-address">—</div>
        </div>
        <div class="detail-section">
          <h3>Order Info</h3>
          <div class="detail-text" id="od-meta">—</div>
          <h3 style="margin-top:16px">Update Status</h3>
          <div style="display:flex;gap:8px;margin-top:8px">
            <select id="od-status">
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="SHIPPED">Shipped</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELED">Canceled</option>
            </select>
            <button id="saveStatusBtn" class="btn btn-primary">Save</button>
          </div>
        </div>
      </div>
      <div class="detail-section">
        <h3>Items</h3>
        <div class="items-list">
          <div id="od-items"></div>
          <div class="totals-row" style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
            <span>Subtotal</span><span id="od-subtotal">Rp 0</span>
          </div>
          <div class="totals-row">
            <span>Shipping</span><span id="od-shipping">Rp 0</span>
          </div>
          <div class="totals-row grand">
            <span>Total</span><span id="od-total">Rp 0</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
"""

order_scripts = '<script src="/admin/js/orders-script.js"></script>'

with open("order.html", "w") as f:
    f.write(wrap_page("Pesanan", "order", order_content, order_modals, order_scripts))
    
print("order.html refactored")


product_content = """
<div class="card">
  <div class="header-actions">
    <div>
      <h2 class="card-title">Product Management</h2>
      <p class="card-subtitle">Kelola semua produk Anda di sini.</p>
    </div>
    <button id="addProductBtn" class="btn btn-primary"><i class="ri-add-line"></i> Add New Product</button>
  </div>
  <div class="filter-group" style="margin-bottom:16px">
    <input type="text" id="searchInput" placeholder="Search for products..." style="width:300px" />
  </div>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Image</th>
          <th>Product Name</th>
          <th>Category</th>
          <th>Price</th>
          <th>Stock</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="product-table-body">
        <tr><td colspan="6" style="text-align:center;padding:32px;color:rgba(255,255,255,0.25)">Memuat data...</td></tr>
      </tbody>
    </table>
  </div>
</div>
"""

product_modals = """
<div id="productModal" class="modal">
  <div class="modal-content lg">
    <div class="modal-header">
      <h2 id="modalTitle">Add Product</h2>
      <button id="closeModalBtn" type="button" class="modal-close"><i class="ri-close-line"></i></button>
    </div>
    <form id="productForm">
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
        <input type="hidden" id="productId" name="id" />
        <div class="form-group">
          <label for="name">Product Name</label>
          <input type="text" id="name" name="name" required />
        </div>
        <div class="form-group">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="3"></textarea>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label for="price">Price</label>
            <input type="number" id="price" name="price" required />
          </div>
          <div class="form-group">
            <label for="stock">Stock</label>
            <input type="number" id="stock" name="stock" required />
          </div>
        </div>
        <div class="form-group">
          <label for="category">Category</label>
          <input type="text" id="category" name="category" />
        </div>
        <div class="form-group">
          <label for="border_slice">Border Image Slice (px)</label>
          <input type="number" id="border_slice" name="border_slice" placeholder="Contoh: 40" />
          <p class="text-xs text-gray-400" style="margin-top:8px">Nilai untuk 'mengiris' gambar bingkai. Coba antara 80-120 untuk bingkai ukir.</p>
        </div>
        <div class="form-group">
          <div class="grid-4" style="margin-bottom:16px">
            <div><label for="inset_top">Inset Top (%)</label><input type="number" step="0.1" id="inset_top" name="inset_top" /></div>
            <div><label for="inset_right">Inset Right (%)</label><input type="number" step="0.1" id="inset_right" name="inset_right" /></div>
            <div><label for="inset_bottom">Inset Bottom (%)</label><input type="number" step="0.1" id="inset_bottom" name="inset_bottom" /></div>
            <div><label for="inset_left">Inset Left (%)</label><input type="number" step="0.1" id="inset_left" name="inset_left" /></div>
          </div>
          <label for="image">Gambar Produk</label>
          <input type="file" id="image" name="image" style="background:transparent;border:none;padding:0;color:rgba(255,255,255,0.7)" />
          <p class="text-xs text-gray-400" style="margin-top:8px">Kosongkan jika tidak ingin mengubah gambar.</p>
        </div>
        <div id="imagePreviewContainer" class="form-group hidden" style="display:none">
          <label>Gambar Saat Ini:</label>
          <img id="currentImagePreview" src="" alt="Current Product Image" style="width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,0.1)" />
        </div>
        <div class="form-group">
          <label for="detail_image_url">Detail Image URL (optional)</label>
          <input type="text" id="detail_image_url" name="detail_image_url" />
        </div>
      </div>
      <div class="modal-footer">
        <button id="cancelModalBtn" type="button" class="btn btn-secondary">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Product</button>
      </div>
    </form>
  </div>
</div>

<div id="deleteModal" class="modal">
  <div class="modal-content" style="max-width:400px">
    <div class="modal-header">
      <h2>Confirm Deletion</h2>
    </div>
    <div class="modal-body">
      <p style="color:rgba(255,255,255,0.7)">Are you sure you want to delete this product? This action cannot be undone.</p>
    </div>
    <div class="modal-footer">
      <button id="cancelDeleteBtn" class="btn btn-secondary">Cancel</button>
      <button id="confirmDeleteBtn" class="btn btn-danger">Delete</button>
    </div>
  </div>
</div>
"""

product_scripts = '<script src="/admin/js/admin-script.js" defer></script>'

with open("product.html", "w") as f:
    f.write(wrap_page("Produk", "product", product_content, product_modals, product_scripts))
    
print("product.html refactored")

prints_content = """
<div class="card">
  <div class="header-actions">
    <div>
      <h2 class="card-title">Art Prints Management</h2>
      <p class="card-subtitle">Kelola koleksi art prints Anda.</p>
    </div>
    <button id="addPrintBtn" class="btn btn-primary"><i class="ri-add-line"></i> Add Art Print</button>
  </div>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Image</th>
          <th>Title</th>
          <th>Artist</th>
          <th>Category</th>
          <th>Price</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="prints-table-body">
        <tr><td colspan="6" style="text-align:center;padding:32px;color:rgba(255,255,255,0.25)">Memuat data...</td></tr>
      </tbody>
    </table>
  </div>
</div>
"""

prints_modals = """
<div id="printModal" class="modal">
  <div class="modal-content lg">
    <div class="modal-header">
      <h2 id="modalTitle">Add Art Print</h2>
      <button id="closeModalBtn" type="button" class="modal-close"><i class="ri-close-line"></i></button>
    </div>
    <form id="printForm">
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
        <input type="hidden" id="printId" name="id" />
        <div class="form-group">
          <label for="title">Title</label>
          <input type="text" id="title" name="title" required />
        </div>
        <div class="form-group">
          <label for="artist">Artist</label>
          <input type="text" id="artist" name="artist" required />
        </div>
        <div class="form-group">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="3"></textarea>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label for="price">Price</label>
            <input type="number" id="price" name="price" required />
          </div>
          <div class="form-group">
            <label for="stock">Stock</label>
            <input type="number" id="stock" name="stock" required />
          </div>
        </div>
        <div class="form-group">
          <label for="category">Category</label>
          <input type="text" id="category" name="category" />
        </div>
        <div class="form-group">
          <label for="image">Upload Image</label>
          <input type="file" id="image" name="image" style="background:transparent;border:none;padding:0;color:rgba(255,255,255,0.7)" />
        </div>
        <div id="imagePreviewContainer" class="form-group hidden" style="display:none">
          <label>Gambar Saat Ini:</label>
          <img id="currentImagePreview" src="" alt="Current Print Image" style="width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,0.1)" />
        </div>
      </div>
      <div class="modal-footer">
        <button id="cancelModalBtn" type="button" class="btn btn-secondary">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Print</button>
      </div>
    </form>
  </div>
</div>

<div id="deleteModal" class="modal">
  <div class="modal-content" style="max-width:400px">
    <div class="modal-header">
      <h2>Confirm Deletion</h2>
    </div>
    <div class="modal-body">
      <p style="color:rgba(255,255,255,0.7)">Are you sure you want to delete this print? This action cannot be undone.</p>
    </div>
    <div class="modal-footer">
      <button id="cancelDeleteBtn" class="btn btn-secondary">Cancel</button>
      <button id="confirmDeleteBtn" class="btn btn-danger">Delete</button>
    </div>
  </div>
</div>
"""

prints_scripts = '<script src="/admin/js/prints-script.js"></script>'

with open("art_prints.html", "w") as f:
    f.write(wrap_page("Art Prints", "prints", prints_content, prints_modals, prints_scripts))

print("art_prints.html refactored")

slider_content = """
<div class="card">
  <div class="header-actions">
    <div>
      <h2 class="card-title">Hero Slider Management</h2>
      <p class="card-subtitle">Upload dan kelola gambar slider halaman utama.</p>
    </div>
  </div>
  
  <div style="background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);padding:32px;border-radius:12px;margin-bottom:32px">
    <form id="upload-form" enctype="multipart/form-data" style="display:flex;flex-direction:column;align-items:center;gap:16px">
      <div style="text-align:center">
        <i class="ri-upload-cloud-2-line" style="font-size:3rem;color:rgba(255,255,255,0.3)"></i>
        <h3 style="margin-top:8px;font-weight:600;color:#fff">Upload New Image</h3>
        <p style="font-size:0.8rem;color:rgba(255,255,255,0.5);margin-bottom:16px">Ukuran direkomendasikan: 1920x1080 (Landscape)</p>
      </div>
      <input type="file" id="image" name="image" required style="max-width:300px;background:transparent;border:none;padding:0;color:rgba(255,255,255,0.7)" accept="image/*" />
      <button type="submit" class="btn btn-primary" style="margin-top:8px"><i class="ri-add-line"></i> Tambah ke Slider</button>
    </form>
  </div>

  <h3 style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:16px">Current Slider Images</h3>
  <div id="slider-list" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:24px">
    <p style="color:rgba(255,255,255,0.4);text-align:center;padding:32px;grid-column:1/-1">Memuat gambar...</p>
  </div>
</div>
"""

slider_modals = """
<div id="deleteModal" class="modal">
  <div class="modal-content" style="max-width:400px">
    <div class="modal-header">
      <h2>Konfirmasi Hapus</h2>
    </div>
    <div class="modal-body">
      <p style="color:rgba(255,255,255,0.7)">Apakah Anda yakin ingin menghapus gambar ini dari slider?</p>
    </div>
    <div class="modal-footer">
      <button id="cancelDeleteBtn" class="btn btn-secondary">Batal</button>
      <button id="confirmDeleteBtn" class="btn btn-danger">Hapus</button>
    </div>
  </div>
</div>
"""

slider_scripts = '<script src="/admin/js/slider-script.js"></script>'

with open("slider.html", "w") as f:
    f.write(wrap_page("Hero Slider", "slider", slider_content, slider_modals, slider_scripts))

print("slider.html refactored")
