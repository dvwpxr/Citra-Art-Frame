// frontend/assets/js/admin-script.js

document.addEventListener("DOMContentLoaded", () => {
  // --- ELEMENTS ---
  // --- PERUBAHAN DI SINI: Menggunakan ID yang benar dari HTML Anda ---
  const tableBody = document.getElementById("product-table-body");
  const modal = document.getElementById("productModal");
  const deleteModal = document.getElementById("deleteModal");
  const form = document.getElementById("productForm");
  const modalTitle = document.getElementById("modalTitle");
  const notification = document.getElementById("notification");
  const searchInput = document.getElementById("searchInput");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const totalProductsEl = document.getElementById("total-products");
  const imagePreviewContainer = document.getElementById(
    "imagePreviewContainer"
  );
  const currentImagePreview = document.getElementById("currentImagePreview");
  const imageInput = document.getElementById("image");

  // --- STATE ---
  let productToDeleteId = null;
  let allProducts = [];

  // --- API CONFIG ---
  const API_URL = "http://localhost:8080/api/products";

  // --- UTILITY & UI FUNCTIONS ---
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

  const openModal = (title, product = {}) => {
    modalTitle.textContent = title;
    form.reset();
    document.getElementById("productId").value = product.id || "";
    document.getElementById("name").value = product.name || "";
    document.getElementById("description").value = product.description || "";
    document.getElementById("price").value = product.price || "";
    document.getElementById("stock").value = product.stock || "";
    document.getElementById("category").value = product.category || "";
    document.getElementById("detail_image_url").value =
      product.detail_image_url || "";

    if (product.image_url) {
      currentImagePreview.src = product.image_url;
      imagePreviewContainer.classList.remove("hidden");
    } else {
      imagePreviewContainer.classList.add("hidden");
    }
    imageInput.value = "";
    modal.classList.add("active");
  };

  const closeModal = () => {
    modal.classList.remove("active");
    imagePreviewContainer.classList.add("hidden");
    currentImagePreview.src = "";
  };

  const openDeleteModal = (id) => {
    productToDeleteId = id;
    deleteModal.classList.add("active");
  };

  const closeDeleteModal = () => {
    productToDeleteId = null;
    deleteModal.classList.remove("active");
  };

  const renderTable = (products) => {
    // --- PERUBAHAN DI SINI: Menggunakan variabel yang benar ---
    tableBody.innerHTML = "";
    if (!products || products.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="6" class="text-center p-4 text-gray-700">No products found.</td></tr>';
      return;
    }

    products.forEach((product) => {
      const row = document.createElement("tr");
      row.className = "border-b hover:bg-gray-200";
      row.innerHTML = `
        <td class="p-3">
          <img src="${
            product.image_url || "https://via.placeholder.com/40"
          }" alt="${product.name}" class="w-10 h-10 rounded-md object-cover">
        </td>
        <td class="p-3 font-medium text-gray-600">${product.name}</td>
        <td class="p-3 text-gray-600">${product.category}</td>
        <td class="p-3 text-gray-600">Rp ${product.price.toLocaleString(
          "id-ID"
        )} / meter</td>
        <td class="p-3 text-gray-600">${product.stock}</td>
        <td class="p-3">
          <button class="edit-btn text-blue-500 hover:text-blue-700 mr-3" data-id="${
            product.id
          }" title="Edit"><i class="ri-pencil-fill"></i></button>
          <button class="delete-btn text-red-500 hover:text-red-700" data-id="${
            product.id
          }" title="Delete"><i class="ri-delete-bin-5-fill"></i></button>
        </td>
      `;
      // --- PERUBAHAN DI SINI: Menggunakan variabel yang benar ---
      tableBody.appendChild(row);
    });
  };

  // --- API FUNCTIONS ---
  const fetchProducts = async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error("Failed to fetch products");
      const products = await response.json();
      allProducts = products || [];
      if (totalProductsEl) totalProductsEl.textContent = allProducts.length;
      renderTable(allProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
      showNotification(error.message, true);
      // --- PERUBAHAN DI SINI: Menggunakan variabel yang benar ---
      if (tableBody)
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-red-500">${error.message}</td></tr>`;
    }
  };

  const saveProduct = async (formData) => {
    const id = formData.get("id");
    const method = id ? "PUT" : "POST";
    const url = id ? `${API_URL}/${id}` : API_URL;

    try {
      const response = await fetch(url, {
        method: method,
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          errorData ||
            `Failed to ${method === "POST" ? "create" : "update"} product`
        );
      }
      showNotification(`Product successfully ${id ? "updated" : "created"}!`);
      closeModal();
      fetchProducts();
    } catch (error) {
      console.error("Error saving product:", error);
      showNotification(error.message, true);
    }
  };

  const deleteProduct = async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete product");
      showNotification("Product deleted successfully!");
      closeDeleteModal();
      fetchProducts();
    } catch (error) {
      console.error("Error deleting product:", error);
      showNotification(error.message, true);
    }
  };

  // --- EVENT LISTENERS ---
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("-translate-x-full");
    });
  }

  document
    .getElementById("addProductBtn")
    ?.addEventListener("click", () => openModal("Add New Product"));
  document
    .getElementById("closeModalBtn")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("cancelModalBtn")
    ?.addEventListener("click", closeModal);

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const idValue = document.getElementById("productId").value;
    if (idValue) formData.append("id", idValue);

    const imageFile = imageInput.files[0];
    if (imageFile) {
      formData.set("image", imageFile);
    } else {
      formData.delete("image");
    }
    saveProduct(formData);
  });

  // --- PERUBAHAN DI SINI: Menggunakan variabel yang benar ---
  tableBody?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".edit-btn");
    const deleteBtn = e.target.closest(".delete-btn");

    if (editBtn) {
      const id = editBtn.dataset.id;
      try {
        const response = await fetch(`${API_URL}/${id}`);
        if (!response.ok) throw new Error("Failed to fetch product details");
        const product = await response.json();
        openModal("Edit Product", product);
      } catch (error) {
        showNotification(error.message, true);
      }
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      openDeleteModal(id);
    }
  });

  document
    .getElementById("cancelDeleteBtn")
    ?.addEventListener("click", closeDeleteModal);
  document.getElementById("confirmDeleteBtn")?.addEventListener("click", () => {
    if (productToDeleteId) {
      deleteProduct(productToDeleteId);
    }
  });

  searchInput?.addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredProducts = allProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.category.toLowerCase().includes(searchTerm)
    );
    renderTable(filteredProducts);
  });

  const logoutButton = document.getElementById("logoutBtn");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      fetch("/api/admin/logout", { method: "POST" })
        .then((response) => {
          if (response.ok) {
            window.location.href = "/login";
          } else {
            showNotification("Logout failed, please try again.", true);
          }
        })
        .catch((error) => {
          console.error("Error during logout:", error);
          showNotification("An error occurred during logout.", true);
        });
    });
  }

  // --- INITIALIZATION ---
  fetchProducts();
});
