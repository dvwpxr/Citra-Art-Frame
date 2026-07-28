// frontend/assets/js/admin_slider_script.js

document.addEventListener("DOMContentLoaded", () => {
  // Pengecekan token menggunakan cookie, sama seperti contoh Anda
  const API_BASE_URL = "/api";
  const sliderList = document.getElementById("slider-list");
  const uploadForm = document.getElementById("upload-form");

  const deleteModal = document.getElementById("deleteModal");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
  const notification = document.getElementById("notification");
  const logoutBtn = document.getElementById("logoutBtn");

  let deleteId = null;

  // Fungsi Notifikasi (sama persis)
  const showNotification = (message, isError = false) => {
    notification.textContent = message;
    notification.className = "notification";
    if (isError) {
        notification.classList.add("error");
    }
    notification.classList.add("show");
    
    setTimeout(() => {
      notification.classList.remove("show");
    }, 3000);
  };

  // Mengambil dan menampilkan gambar slider
  const fetchSliders = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/slides/admin`, {
        credentials: "include", // Mengirim cookie secara otomatis
      });
      if (!response.ok) {
        if (response.status === 401) window.location.href = "/login";
        throw new Error("Gagal mengambil data slider");
      }
      const sliders = await response.json();
      sliderList.innerHTML = "";
      if (sliders && sliders.length > 0) {
        sliders.forEach((slide) => {
          const slideElement = document.createElement("div");
          slideElement.style.position = "relative";
          slideElement.style.borderRadius = "8px";
          slideElement.style.overflow = "hidden";
          slideElement.className = "group";
          slideElement.innerHTML = `
            <div style="display:flex; height:200px; width:100%; position:relative">
              <img src="${slide.imageUrl}" alt="${slide.altText}" style="width:100%;height:100%;object-fit:cover;display:block">
              ${slide.mobileImageUrl && slide.mobileImageUrl !== slide.imageUrl ? 
                `<div style="position:absolute;bottom:10px;right:10px;border:2px solid #fff;border-radius:6px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
                  <img src="${slide.mobileImageUrl}" style="height:60px;width:auto;display:block">
                </div>` : ''
              }
            </div>
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0);display:flex;align-items:center;justify-content:center;transition:background 0.3s" class="slider-overlay">
              <button class="btn-icon delete delete-btn" data-id="${slide.id}" style="opacity:0;transform:scale(0.8);transition:all 0.3s" class="slider-del-btn">
                <i class="ri-delete-bin-line"></i>
              </button>
            </div>
          `;
          
          // Hover effects using JS since we can't easily inline group-hover
          slideElement.addEventListener("mouseenter", () => {
            slideElement.querySelector(".slider-overlay").style.background = "rgba(0,0,0,0.5)";
            const btn = slideElement.querySelector(".delete-btn");
            btn.style.opacity = "1";
            btn.style.transform = "scale(1)";
          });
          slideElement.addEventListener("mouseleave", () => {
            slideElement.querySelector(".slider-overlay").style.background = "rgba(0,0,0,0)";
            const btn = slideElement.querySelector(".delete-btn");
            btn.style.opacity = "0";
            btn.style.transform = "scale(0.8)";
          });
          
          sliderList.appendChild(slideElement);
        });
      } else {
        sliderList.innerHTML =
          '<p style="color:rgba(255,255,255,0.4);text-align:center;padding:32px;grid-column:1/-1">Belum ada gambar</p>';
      }
    } catch (error) {
      showNotification(error.message, true);
    }
  };

  // Modal Hapus (logika sama persis)
  const openDeleteModal = (id) => {
    deleteId = id;
    deleteModal.classList.add("active");
  };
  const closeDeleteModal = () => deleteModal.classList.remove("active");

  cancelDeleteBtn.addEventListener("click", closeDeleteModal);

  // Event listener untuk tombol hapus di setiap gambar
  sliderList.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".delete-btn");
    if (deleteBtn) {
      openDeleteModal(deleteBtn.dataset.id);
    }
  });

  // Konfirmasi Hapus (logika sama persis, hanya endpoint berbeda)
  confirmDeleteBtn.addEventListener("click", async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/slides/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) window.location.href = "/login";
        throw new Error("Gagal menghapus gambar.");
      }
      showNotification("Gambar berhasil dihapus");
      closeDeleteModal();
      fetchSliders(); // Muat ulang daftar
    } catch (error) {
      showNotification(error.message, true);
    }
  });

  // Event listener untuk form upload
  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(uploadForm);

    // Menampilkan loading sederhana pada tombol
    const submitButton = uploadForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML =
      '<i class="ri-loader-4-line animate-spin mr-2"></i> Mengunggah...';

    try {
      const response = await fetch(`${API_BASE_URL}/slides`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(
          "Gagal mengunggah gambar. Pastikan file adalah gambar."
        );
      }

      uploadForm.reset();
      showNotification("Gambar berhasil ditambahkan ke slider!");
      fetchSliders(); // Muat ulang daftar
    } catch (error) {
      showNotification(error.message, true);
    } finally {
      // Kembalikan tombol ke keadaan semula
      submitButton.disabled = false;
      submitButton.innerHTML =
        '<i class="ri-add-line mr-2"></i> Tambah ke Slider';
    }
  });

  // Tombol Logout (logika sama persis)
  logoutBtn.addEventListener("click", () => {
    fetch(`${API_BASE_URL}/admin/logout`, {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      // Hapus localStorage jika masih ada (untuk kebersihan)
      localStorage.removeItem("jwt_token");
      window.location.href = "/login";
    });
  });

  // Sidebar Toggle untuk mobile (opsional, jika Anda ingin fungsional)
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("-translate-x-full");
    });
  }

  // Panggil fungsi untuk memuat data saat halaman dibuka
  fetchSliders();
});
