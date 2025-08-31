document.addEventListener("DOMContentLoaded", () => {
  // --- ELEMENTS ---
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

  // --- STATE ---
  let productToDeleteId = null;
  let allProducts = []; // Cache untuk menyimpan semua produk dari API

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
    document.getElementById("image").value = product.image || "";
    document.getElementById("detail_image_url").value =
      product.detail_image_url || "";
    modal.classList.add("active");
  };

  const closeModal = () => modal.classList.remove("active");

  const openDeleteModal = (id) => {
    productToDeleteId = id;
    deleteModal.classList.add("active");
  };

  const closeDeleteModal = () => {
    productToDeleteId = null;
    deleteModal.classList.remove("active");
  };

  const renderTable = (products) => {
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
            product.image || "https://via.placeholder.com/40"
          }" alt="${product.name}" class="w-10 h-10 rounded-md object-cover">
        </td>
        <td class="p-3 font-medium text-gray-600">${product.name}</td>
        <td class="p-3 text-gray-600">${product.category}</td>
        <td class="p-3 text-gray-600">Rp ${product.price.toLocaleString(
          "id-ID"
        )}</td>
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
      tableBody.appendChild(row);
    });
  };

  // --- API FUNCTIONS ---
  const fetchProducts = async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error("Failed to fetch products");
      const products = await response.json();
      allProducts = products || []; // Simpan data asli
      totalProductsEl.textContent = allProducts.length; // Update kartu statistik
      renderTable(allProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
      showNotification(error.message, true);
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-red-500">${error.message}</td></tr>`;
    }
  };

  const saveProduct = async (productData) => {
    const id = productData.id;
    const method = id ? "PUT" : "POST";
    const url = id ? `${API_URL}/${id}` : API_URL;

    try {
      const response = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productData),
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
      fetchProducts(); // Refresh data
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
      fetchProducts(); // Refresh data
    } catch (error) {
      console.error("Error deleting product:", error);
      showNotification(error.message, true);
    }
  };

  // --- EVENT LISTENERS ---

  // Sidebar Toggle for mobile
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("-translate-x-full");
  });

  // Modal Buttons
  document
    .getElementById("addProductBtn")
    .addEventListener("click", () => openModal("Add New Product"));
  document
    .getElementById("closeModalBtn")
    .addEventListener("click", closeModal);
  document
    .getElementById("cancelModalBtn")
    .addEventListener("click", closeModal);

  // Form Submission
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const idValue = document.getElementById("productId").value;
    const productData = {
      price: parseInt(document.getElementById("price").value, 10),
      stock: parseInt(document.getElementById("stock").value, 10),
      name: document.getElementById("name").value,
      description: document.getElementById("description").value,
      category: document.getElementById("category").value,
      image: document.getElementById("image").value,
      detail_image_url: document.getElementById("detail_image_url").value,
    };

    if (idValue) {
      productData.id = parseInt(idValue, 10);
    }

    saveProduct(productData);
  });

  // Table Actions (Edit & Delete)
  tableBody.addEventListener("click", async (e) => {
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

  // Delete Confirmation Modal
  document
    .getElementById("cancelDeleteBtn")
    .addEventListener("click", closeDeleteModal);
  document.getElementById("confirmDeleteBtn").addEventListener("click", () => {
    if (productToDeleteId) {
      deleteProduct(productToDeleteId);
    }
  });

  // Search Functionality
  searchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredProducts = allProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.category.toLowerCase().includes(searchTerm)
    );
    renderTable(filteredProducts);
  });

  // Logout
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
