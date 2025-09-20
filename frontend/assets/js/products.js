// assets/js/products.js

document.addEventListener("DOMContentLoaded", () => {
  let allProductsData = [];
  let currentPage = 1;
  const itemsPerPage = 8;
  let activeCategory = "Semua";

  const gridContainer = document.getElementById("products-grid");
  const paginationContainer = document.getElementById("pagination");
  const categoryFilterSelect = document.getElementById("category-filter");

  const initializePage = async () => {
    try {
      gridContainer.innerHTML =
        '<p class="text-center col-span-full">Memuat produk...</p>';
      const response = await fetch("/api/products");
      if (!response.ok) {
        throw new Error("Gagal mengambil data produk dari server.");
      }
      allProductsData = await response.json();

      if (allProductsData && allProductsData.length > 0) {
        setupFilters();
        displayItems();
      } else {
        gridContainer.innerHTML =
          '<p class="text-center col-span-full">Belum ada produk yang tersedia.</p>';
      }
    } catch (error) {
      gridContainer.innerHTML = `<p class="text-center col-span-full text-red-500">${error.message}</p>`;
    }
  };

  function displayItems() {
    gridContainer.innerHTML = "";
    let filteredItems = allProductsData;

    if (activeCategory !== "Semua") {
      filteredItems = filteredItems.filter(
        (item) => item.category === activeCategory
      );
    }

    if (filteredItems.length === 0) {
      gridContainer.innerHTML =
        '<p class="text-center col-span-full text-gray-500">Tidak ada produk yang cocok dengan filter Anda.</p>';
      setupPagination(filteredItems);
      return;
    }

    const paginatedItems = filteredItems.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );

    paginatedItems.forEach((product) => {
      const card = document.createElement("div");
      card.className = "art-card";

      // --- PERUBAHAN DI SINI ---
      // Menggunakan `product.image_url` agar cocok dengan data dari backend Go
      card.innerHTML = `
        <img src="${
          product.image_url || "https://via.placeholder.com/300"
        }" alt="${product.name}" class="art-card-img">
        <div class="art-card-info">
            <div>
                <h3 class="art-card-title">${product.name}</h3>
                <p class="text-sm text-gray-500">${product.category}</p>
            </div>
            <p class="art-card-price">Rp ${product.price.toLocaleString(
              "id-ID"
            )}</p>
        </div>
      `;
      gridContainer.appendChild(card);
    });

    setupPagination(filteredItems);
  }

  function setupFilters() {
    const categories = [
      "Semua",
      ...new Set(allProductsData.map((item) => item.category).filter(Boolean)),
    ];
    categoryFilterSelect.innerHTML = "";
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categoryFilterSelect.appendChild(option);
    });
  }

  categoryFilterSelect.addEventListener("change", (e) => {
    activeCategory = e.target.value;
    currentPage = 1;
    displayItems();
  });

  function setupPagination(filteredItems) {
    paginationContainer.innerHTML = "";
    const pageCount = Math.ceil(filteredItems.length / itemsPerPage);
    if (pageCount <= 1) return;

    const prevButton = createPageButton("Sebelumnya", () => {
      if (currentPage > 1) {
        currentPage--;
        displayItems();
      }
    });
    if (currentPage === 1) prevButton.disabled = true;
    paginationContainer.appendChild(prevButton);

    for (let i = 1; i <= pageCount; i++) {
      const pageButton = createPageButton(i, () => {
        currentPage = i;
        displayItems();
      });
      if (i === currentPage) {
        pageButton.classList.add("active");
      }
      paginationContainer.appendChild(pageButton);
    }

    const nextButton = createPageButton("Berikutnya", () => {
      if (currentPage < pageCount) {
        currentPage++;
        displayItems();
      }
    });
    if (currentPage === pageCount) nextButton.disabled = true;
    paginationContainer.appendChild(nextButton);
  }

  function createPageButton(content, onClick) {
    const button = document.createElement("button");
    button.className = "page-btn";
    button.textContent = content;
    button.addEventListener("click", onClick);
    return button;
  }

  initializePage();
});
