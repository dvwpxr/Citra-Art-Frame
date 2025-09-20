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
    notification.className = `notification fixed top-[7%] right-5 text-white py-2 px-4 rounded-lg shadow-md transition-transform duration-300 ${
      isError ? "bg-red-600" : "bg-green-500"
    } translate-x-0`;
    setTimeout(() => {
      notification.className = notification.className.replace(
        "translate-x-0",
        "translate-x-[150%]"
      );
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
          slideElement.className =
            "relative group rounded-lg overflow-hidden shadow-md";
          slideElement.innerHTML = `
            <img src="${slide.imageUrl}" alt="${slide.altText}" class="w-full h-48 object-cover">
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center">
              <button class="delete-btn text-white text-3xl opacity-0 group-hover:opacity-100 transition-opacity" data-id="${slide.id}">
                <i class="ri-delete-bin-line"></i>
              </button>
            </div>
          `;
          sliderList.appendChild(slideElement);
        });
      } else {
        sliderList.innerHTML =
          '<p class="text-gray-500 col-span-full">Belum ada gambar</p>';
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
