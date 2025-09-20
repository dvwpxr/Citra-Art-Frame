// assets/js/prints.js

document.addEventListener("DOMContentLoaded", () => {
  // Variabel global untuk menyimpan semua data dari API
  let allPrintsData = [];

  // --- VARIABEL KONTROL ---
  let currentPage = 1;
  const itemsPerPage = 8;
  let activeArtist = "Semua";
  let activeCategory = "Semua";

  // --- ELEMEN DOM ---
  const gridContainer = document.getElementById("art-prints-grid");
  const paginationContainer = document.getElementById("pagination");
  const filterSelect = document.getElementById("artist-filter");
  const categoryFilterSelect = document.getElementById("category-filter");

  // Fungsi utama untuk mengambil data dan memulai aplikasi
  const initializePage = async () => {
    try {
      gridContainer.innerHTML =
        '<p class="text-center col-span-full">Memuat data...</p>';
      const response = await fetch("/api/prints");
      if (!response.ok) {
        throw new Error("Gagal mengambil data dari server.");
      }
      allPrintsData = await response.json();

      if (allPrintsData && allPrintsData.length > 0) {
        setupFilters();
        displayItems();
      } else {
        gridContainer.innerHTML =
          '<p class="text-center col-span-full">Belum ada art print yang tersedia.</p>';
      }
    } catch (error) {
      gridContainer.innerHTML = `<p class="text-center col-span-full text-red-500">${error.message}</p>`;
    }
  };

  /** Menampilkan item (art prints) berdasarkan filter dan halaman saat ini */
  function displayItems() {
    gridContainer.innerHTML = "";

    let filteredItems = allPrintsData;

    if (activeArtist !== "Semua") {
      filteredItems = filteredItems.filter(
        (item) => item.artist === activeArtist
      );
    }
    if (activeCategory !== "Semua") {
      filteredItems = filteredItems.filter(
        (item) => item.category === activeCategory
      );
    }

    if (filteredItems.length === 0) {
      gridContainer.innerHTML =
        '<p class="text-center col-span-full text-gray-500">Tidak ada hasil yang cocok dengan filter Anda.</p>';
      setupPagination(filteredItems); // setup pagination untuk menampilkan/menyembunyikan
      return;
    }

    const paginatedItems = filteredItems.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );

    paginatedItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "art-card";
      card.innerHTML = `
                <img src="${
                  item.image_url || "https://via.placeholder.com/300"
                }" alt="${item.title}" class="art-card-img">
                <div class="art-card-info">
                    <div>
                        <h3 class="art-card-title">${item.title}</h3>
                        <p class="art-card-artist">oleh ${item.artist}</p>
                    </div>
                    <p class="art-card-price">Rp ${item.price.toLocaleString(
                      "id-ID"
                    )}</p>
                </div>
            `;
      gridContainer.appendChild(card);
    });
    setupPagination(filteredItems);
  }

  /** Membuat dan menampilkan tombol-tombol pagination */
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

  /** Fungsi bantuan untuk membuat satu tombol pagination */
  function createPageButton(content, onClick) {
    const button = document.createElement("button");
    button.className = "page-btn";
    button.textContent = content;
    button.addEventListener("click", onClick);
    return button;
  }

  /** Membuat dan menampilkan tombol-tombol filter artis */
  function setupFilters() {
    const artists = [
      "Semua",
      ...new Set(allPrintsData.map((item) => item.artist)),
    ];
    filterSelect.innerHTML = "";
    artists.forEach((artist) => {
      const option = document.createElement("option");
      option.value = artist;
      option.textContent = artist;
      filterSelect.appendChild(option);
    });

    const categories = [
      "Semua",
      ...new Set(allPrintsData.map((item) => item.category)),
    ];
    categoryFilterSelect.innerHTML = "";
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categoryFilterSelect.appendChild(option);
    });
  }

  // Event listeners untuk filter
  filterSelect.addEventListener("change", (e) => {
    activeArtist = e.target.value;
    currentPage = 1;
    displayItems();
  });

  categoryFilterSelect.addEventListener("change", (e) => {
    activeCategory = e.target.value;
    currentPage = 1;
    displayItems();
  });

  // --- INISIALISASI ---
  setupFilters();
  displayItems();
  initializePage();
});
