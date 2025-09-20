// frontend/admin/js/popular-script.js
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "/api";
  const popularFramesList = document.getElementById("popular-frames-list");
  const allFramesSelect = document.getElementById("all-frames-select");
  const addPopularBtn = document.getElementById("add-popular-btn");
  const notification = document.getElementById("notification");
  const totalPopularEl = document.getElementById("total-popular-frames");
  const totalFramesEl = document.getElementById("total-frame-products");
  const sidebarContainer = document.getElementById("sidebar-container");
  const logoutBtn = document.getElementById("logoutBtn");

  const showNotification = (message, isError = false) => {
    notification.textContent = message;
    notification.className = `notification fixed top-5 right-5 text-white py-2 px-4 rounded-lg shadow-md transition-transform duration-300 ${
      isError ? "bg-red-600" : "bg-green-500"
    } translate-x-0`;
    setTimeout(() => {
      notification.className = notification.className.replace(
        "translate-x-0",
        "translate-x-[150%]"
      );
    }, 3000);
  };

  const fetchAllFrames = async () => {
    try {
      // --- PERBAIKAN 1: Hapus filter kategori dari URL ---
      // Meminta semua produk, bukan hanya yang kategori 'Frame'
      const response = await fetch(`${API_BASE_URL}/products`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Gagal memuat semua produk");

      const products = (await response.json()) || [];

      if (totalFramesEl) totalFramesEl.textContent = products.length;

      allFramesSelect.innerHTML =
        '<option value="">-- Pilih Produk --</option>';
      products
        // --- PERBAIKAN 2: Hapus filter kategori dari JavaScript ---
        // Sekarang hanya memfilter produk yang belum populer
        .filter((product) => !product.is_popular)
        .forEach((product) => {
          const option = document.createElement("option");
          option.value = product.id;
          option.textContent = product.name;
          allFramesSelect.appendChild(option);
        });
    } catch (error) {
      console.error(error);
      allFramesSelect.innerHTML = '<option value="">Gagal memuat</option>';
    }
  };

  const fetchPopularFrames = async () => {
    try {
      // PASTIKAN URL INI BENAR
      const response = await fetch(`${API_BASE_URL}/products/popular`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) window.location.href = "/login";
        throw new Error("Gagal memuat frame populer");
      }

      const popularFrames = (await response.json()) || [];

      if (totalPopularEl) totalPopularEl.textContent = popularFrames.length;

      popularFramesList.innerHTML = "";
      if (popularFrames && popularFrames.length > 0) {
        popularFrames.forEach((frame) => {
          const frameEl = document.createElement("div");
          frameEl.className =
            "border rounded-lg shadow-sm overflow-hidden bg-white";
          frameEl.innerHTML = `
                        <img src="${frame.image_url}" alt="${frame.name}" class="w-full h-32 object-cover">
                        <div class="p-3">
                            <h3 class="font-semibold text-gray-800 truncate">${frame.name}</h3>
                            <button data-id="${frame.id}" class="remove-popular-btn text-sm text-red-500 hover:text-red-700 mt-2 w-full text-left">Hapus dari Populer</button>
                        </div>
                    `;
          popularFramesList.appendChild(frameEl);
        });
      } else {
        popularFramesList.innerHTML =
          '<p class="text-gray-500 col-span-full">Belum ada frame yang ditandai populer.</p>';
      }
    } catch (error) {
      console.error(error);
      showNotification(error.message, true);
    }
  };

  const setPopularStatus = async (id, isPopular) => {
    const url = isPopular
      ? `${API_BASE_URL}/products/${id}/set-popular`
      : `${API_BASE_URL}/products/${id}/remove-popular`;
    try {
      const response = await fetch(url, {
        method: "PUT",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Gagal mengubah status");
      showNotification("Status frame berhasil diubah!");
      fetchPopularFrames();
      fetchAllFrames();
    } catch (error) {
      showNotification(error.message, true);
    }
  };

  const loadSidebar = async () => {
    try {
      const response = await fetch("/admin/sidebar.html");
      const data = await response.text();
      sidebarContainer.innerHTML = data;

      document
        .querySelector('a[href="/dashboard/popular-frames"]')
        .parentElement.classList.add("active");

      const sidebarToggle = document.getElementById("sidebar-toggle");
      const sidebar = document.getElementById("sidebar");
      if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", () => {
          sidebar.classList.toggle("-translate-x-full");
        });
      }
    } catch (error) {
      console.error("Gagal memuat sidebar:", error);
    }
  };

  addPopularBtn.addEventListener("click", () => {
    const selectedId = allFramesSelect.value;
    if (selectedId) {
      setPopularStatus(selectedId, true);
    } else {
      showNotification("Pilih frame terlebih dahulu.", true);
    }
  });

  popularFramesList.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-popular-btn")) {
      const frameId = e.target.dataset.id;
      setPopularStatus(frameId, false);
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      fetch(`${API_BASE_URL}/admin/logout`, {
        method: "POST",
        credentials: "include",
      }).finally(() => {
        window.location.href = "/login";
      });
    });
  }

  loadSidebar();
  fetchPopularFrames();
  fetchAllFrames();
});
