document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://localhost:8080/api/products";
  const tableBody = document.getElementById("product-table-body");
  const modal = document.getElementById("productModal");
  const deleteModal = document.getElementById("deleteModal");
  const form = document.getElementById("productForm");
  const modalTitle = document.getElementById("modalTitle");
  const notification = document.getElementById("notification");
  let productToDeleteId = null;

  // --- UTILITY FUNCTIONS ---
  const showNotification = (message, isError = false) => {
    notification.textContent = message;
    notification.className = `fixed top-5 right-5 text-white py-2 px-4 rounded-lg shadow-md transition-transform ${
      isError ? "bg-red-500" : "bg-green-500"
    } translate-x-0`;
    setTimeout(() => {
      notification.className = notification.className.replace(
        "translate-x-0",
        "translate-x-[200%]"
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

  // --- API FUNCTIONS ---
  const fetchProducts = async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error("Failed to fetch products");
      const products = await response.json();

      tableBody.innerHTML = "";
      if (!products) {
        tableBody.innerHTML =
          '<tr><td colspan="5" class="text-center p-4">No products found.</td></tr>';
        return;
      }

      products.forEach((product) => {
        const row = document.createElement("tr");
        row.className = "border-b";
        row.innerHTML = `
                    <td class="p-2">${product.name}</td>
                    <td class="p-2">${product.category}</td>
                    <td class="p-2">Rp ${product.price.toLocaleString(
                      "id-ID"
                    )}</td>
                    <td class="p-2">${product.stock}</td>
                    <td class="p-2">
                        <button class="edit-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${
                          product.id
                        }"><i class="ri-pencil-line"></i></button>
                        <button class="delete-btn text-red-500 hover:text-red-700" data-id="${
                          product.id
                        }"><i class="ri-delete-bin-line"></i></button>
                    </td>
                `;
        tableBody.appendChild(row);
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      showNotification(error.message, true);
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
  document
    .getElementById("addProductBtn")
    .addEventListener("click", () => openModal("Add New Product"));
  document
    .getElementById("closeModalBtn")
    .addEventListener("click", closeModal);

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // Ambil ID, bisa jadi string kosong jika produk baru
    const idValue = document.getElementById("productId").value;

    const productData = {
      // Gunakan parseInt untuk mengubah string menjadi angka
      price: parseInt(document.getElementById("price").value, 10),
      stock: parseInt(document.getElementById("stock").value, 10),

      // Data lain tetap sebagai string
      name: document.getElementById("name").value,
      description: document.getElementById("description").value,
      category: document.getElementById("category").value,
      image: document.getElementById("image").value,
    };

    // Hanya tambahkan ID ke objek jika memang ada (untuk mode edit)
    if (idValue) {
      productData.id = parseInt(idValue, 10);
    }

    saveProduct(productData);
  });

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

  document
    .getElementById("cancelDeleteBtn")
    .addEventListener("click", closeDeleteModal);
  document.getElementById("confirmDeleteBtn").addEventListener("click", () => {
    if (productToDeleteId) {
      deleteProduct(productToDeleteId);
    }
  });

  // Initial fetch
  fetchProducts();
});
