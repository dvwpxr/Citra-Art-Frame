// File: frontend/assets/js/admin_prints_script.js (Versi Final)

document.addEventListener("DOMContentLoaded", () => {
  // [DIHAPUS] Pengecekan token di localStorage dihapus.
  // Kita sekarang mengandalkan cookie yang diperiksa oleh server.
  // const token = localStorage.getItem("jwt_token");
  // if (!token) {
  //     window.location.href = "/login";
  //     return;
  // }

  const API_BASE_URL = "/api";
  const tableBody = document.getElementById("prints-table-body");
  const modal = document.getElementById("printModal");
  const modalTitle = document.getElementById("modalTitle");
  const form = document.getElementById("printForm");
  const printIdInput = document.getElementById("printId");
  const deleteModal = document.getElementById("deleteModal");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  let deleteId = null;

  const addPrintBtn = document.getElementById("addPrintBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelModalBtn = document.getElementById("cancelModalBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const notification = document.getElementById("notification");
  const imagePreviewContainer = document.getElementById(
    "imagePreviewContainer"
  );
  const currentImagePreview = document.getElementById("currentImagePreview");
  const imageInput = document.getElementById("image");

  const showNotification = (message, isError = false) => {
    notification.textContent = message;
    notification.className = `fixed top-[7%] right-5 text-white py-2 px-4 rounded-lg shadow-md transition-transform duration-300 ${
      isError ? "bg-red-600" : "bg-green-500"
    } translate-x-0`;
    setTimeout(() => {
      notification.className = notification.className.replace(
        "translate-x-0",
        "translate-x-[150%]"
      );
    }, 3000);
  };

  const fetchPrints = async () => {
    try {
      // [DIUBAH] Menambahkan 'credentials: "include"' agar cookie dikirim otomatis
      const response = await fetch(`${API_BASE_URL}/prints`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) window.location.href = "/login"; // Jika cookie tidak valid, redirect
        throw new Error("Gagal mengambil data");
      }
      const prints = await response.json();
      tableBody.innerHTML = "";
      if (prints && prints.length > 0) {
        prints.forEach((p) => {
          const row = document.createElement("tr");
          row.innerHTML = `
                        <td class="p-3"><img src="${
                          p.image_url || "https://via.placeholder.com/100"
                        }" alt="${
            p.title
          }" class="w-16 h-16 object-cover rounded-md"></td>
                        <td class="p-3 font-semibold text-gray-700">${
                          p.title
                        }</td>
                        <td class="p-3 text-gray-600">${p.artist}</td>
                        <td class="p-3 text-gray-600">${p.category}</td>
                        <td class="p-3 text-gray-600">Rp ${p.price.toLocaleString(
                          "id-ID"
                        )}</td>
                        <td class="p-3">
                            <button class="edit-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${
                              p.id
                            }"><i class="ri-pencil-line"></i></button>
                            <button class="delete-btn text-red-500 hover:text-red-700" data-id="${
                              p.id
                            }"><i class="ri-delete-bin-line"></i></button>
                        </td>
                    `;
          tableBody.appendChild(row);
        });
      } else {
        tableBody.innerHTML =
          '<tr><td colspan="6" class="p-3 text-center text-gray-500">Tidak ada data art print.</td></tr>';
      }
    } catch (error) {
      showNotification(error.message, true);
    }
  };

  const openModal = (print = null) => {
    form.reset();
    if (print) {
      modalTitle.textContent = "Edit Art Print";
      printIdInput.value = print.id;
      document.getElementById("title").value = print.title;
      document.getElementById("artist").value = print.artist;
      document.getElementById("category").value = print.category;
      document.getElementById("price").value = print.price;
      document.getElementById("description").value = print.description || "";

      // Tampilkan preview gambar yang sudah ada
      if (print.image_url) {
        currentImagePreview.src = print.image_url;
        imagePreviewContainer.classList.remove("hidden");
      } else {
        imagePreviewContainer.classList.add("hidden");
      }
    } else {
      modalTitle.textContent = "Tambah Art Print";
      printIdInput.value = "";
      imagePreviewContainer.classList.add("hidden"); // Sembunyikan saat tambah baru
    }
    modal.classList.add("active");
  };

  // ... (fungsi closeModal, openDeleteModal, closeDeleteModal tidak berubah) ...
  const closeModal = () => {
    modal.classList.remove("active");
    imagePreviewContainer.classList.add("hidden"); // Sembunyikan juga saat ditutup
  };
  const openDeleteModal = (id) => {
    deleteId = id;
    deleteModal.classList.add("active");
  };
  const closeDeleteModal = () => deleteModal.classList.remove("active");

  addPrintBtn.addEventListener("click", () => openModal());
  closeModalBtn.addEventListener("click", closeModal);
  cancelModalBtn.addEventListener("click", closeModal);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Gunakan FormData untuk mengirim file dan teks
    const formData = new FormData(form);
    const id = document.getElementById("printId").value;
    if (id) {
      formData.append("id", id);
    }

    // Pastikan input file memiliki nama 'image'
    const imageFile = document.getElementById("image").files[0];
    if (imageFile) {
      formData.set("image", imageFile);
    } else {
      formData.delete("image");
    }

    const method = id ? "PUT" : "POST";
    const url = id ? `${API_BASE_URL}/prints/${id}` : `${API_BASE_URL}/prints`;

    try {
      const response = await fetch(url, {
        method: method,
        credentials: "include",
        body: formData, // Kirim sebagai FormData, bukan JSON
      });

      if (!response.ok) {
        if (response.status === 401) window.location.href = "/login";
        throw new Error("Gagal menyimpan data");
      }

      showNotification(
        `Art print berhasil ${id ? "diperbarui" : "ditambahkan"}!`
      );
      closeModal();
      fetchPrints();
    } catch (error) {
      showNotification(error.message, true);
    }
  });

  tableBody.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".edit-btn");
    const deleteBtn = e.target.closest(".delete-btn");

    if (editBtn) {
      const id = editBtn.dataset.id;
      try {
        const response = await fetch(`${API_BASE_URL}/prints/${id}`, {
          credentials: "include",
        });
        const print = await response.json();
        openModal(print);
      } catch (error) {
        showNotification("Gagal mengambil detail print.", true);
      }
    }

    if (deleteBtn) {
      openDeleteModal(deleteBtn.dataset.id);
    }
  });

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      if (!deleteId) return;
      try {
        const response = await fetch(`${API_BASE_URL}/prints/${deleteId}`, {
          method: "DELETE",
          // [DIUBAH] Menggunakan credentials: 'include' dan menghapus header Authorization
          credentials: "include",
        });
        if (!response.ok) {
          if (response.status === 401) window.location.href = "/login";
          throw new Error("Gagal menghapus print.");
        }
        showNotification("Art print berhasil dihapus.");
        closeDeleteModal();
        fetchPrints();
      } catch (error) {
        showNotification(error.message, true);
      }
    });
  }

  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener("click", closeDeleteModal);
  }

  logoutBtn.addEventListener("click", () => {
    // [OPSIONAL TAPI DIREKOMENDASIKAN] Panggil API logout jika ada
    fetch(`${API_BASE_URL}/admin/logout`, {
      method: "POST",
      credentials: "include",
    }).then(() => {
      localStorage.removeItem("jwt_token"); // Hapus juga localStorage
      window.location.href = "/login";
    });
  });

  fetchPrints();
});
