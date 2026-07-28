// Konten file ini sudah lengkap dan benar sesuai yang Anda berikan.
document.addEventListener("DOMContentLoaded", () => {
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
    notification.className = "notification";
    if (isError) {
        notification.classList.add("error");
    }
    notification.classList.add("show");
    
    setTimeout(() => {
      notification.classList.remove("show");
    }, 3000);
  };

  const fetchPrints = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/prints`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) window.location.href = "/login";
        throw new Error("Gagal mengambil data");
      }
      const prints = await response.json();
      tableBody.innerHTML = "";
      if (prints && prints.length > 0) {
        prints.forEach((p) => {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td><img src="${
              p.image_url || "https://via.placeholder.com/100"
            }" alt="${
            p.title
          }" style="width:48px;height:48px;object-fit:cover;border-radius:8px"></td>
            <td style="font-weight:600;color:#fff">${
              p.title
            }</td>
            <td>${p.artist}</td>
            <td>${p.category}</td>
            <td style="font-weight:600">Rp ${p.price.toLocaleString(
              "id-ID"
            )}</td>
            <td>
                <button class="btn-icon edit edit-btn" data-id="${
                  p.id
                }"><i class="ri-pencil-line"></i></button>
                <button class="btn-icon delete delete-btn" data-id="${
                  p.id
                }"><i class="ri-delete-bin-line"></i></button>
            </td>
          `;
          tableBody.appendChild(row);
        });
      } else {
        tableBody.innerHTML =
          '<tr><td colspan="6" style="text-align:center;padding:32px;color:rgba(255,255,255,0.25)">Tidak ada data art print.</td></tr>';
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
      document.getElementById("stock").value = print.stock;
      document.getElementById("description").value = print.description || "";

      if (print.image_url) {
        currentImagePreview.src = print.image_url;
        imagePreviewContainer.classList.remove("hidden");
      } else {
        imagePreviewContainer.classList.add("hidden");
      }
    } else {
      modalTitle.textContent = "Tambah Art Print";
      printIdInput.value = "";
      imagePreviewContainer.classList.add("hidden");
    }
    modal.classList.add("active");
  };

  const closeModal = () => {
    modal.classList.remove("active");
    imagePreviewContainer.classList.add("hidden");
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
    const formData = new FormData(form);
    const id = document.getElementById("printId").value;
    const method = id ? "PUT" : "POST";
    const url = id ? `${API_BASE_URL}/prints/${id}` : `${API_BASE_URL}/prints`;

    try {
      const response = await fetch(url, {
        method: method,
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 401) window.location.href = "/login";
        const errorData = await response.json();
        throw new Error(errorData.message || "Gagal menyimpan data");
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

  confirmDeleteBtn.addEventListener("click", async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/prints/${deleteId}`, {
        method: "DELETE",
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

  cancelDeleteBtn.addEventListener("click", closeDeleteModal);

  logoutBtn.addEventListener("click", () => {
    fetch(`${API_BASE_URL}/admin/logout`, {
      method: "POST",
      credentials: "include",
    }).then(() => {
      window.location.href = "/login";
    });
  });

  fetchPrints();
});
