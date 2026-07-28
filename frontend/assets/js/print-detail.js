// assets/js/print-detail.js — Updated with Cart Integration
document.addEventListener("DOMContentLoaded", () => {
  const detailContainer = document.getElementById("detail-container");
  let currentPrintData = null;

  // Add to cart handler
  const addToCart = async (e) => {
    e.preventDefault();
    const quantity = parseInt(document.getElementById("quantity").value, 10);

    if (quantity > currentPrintData.stock) {
      alert("Stok tidak mencukupi");
      return;
    }

    const btn = document.getElementById("addToCartBtn");
    btn.disabled = true;
    btn.textContent = "Menambahkan...";

    const result = await CartManager.addArtPrint({
      productId: currentPrintData.id,
      name: currentPrintData.title,
      imageUrl: currentPrintData.image_url,
      artist: currentPrintData.artist,
      size: currentPrintData.size || "",
      price: currentPrintData.price,
      quantity,
    });

    btn.disabled = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg> Tambah ke Keranjang`;

    if (result) {
      CartManager.showAddedToast(currentPrintData.title);
    }
  };

  // Buy now handler (add to cart then go to checkout)
  const buyNow = async (e) => {
    e.preventDefault();
    const quantity = parseInt(document.getElementById("quantity").value, 10);

    if (quantity > currentPrintData.stock) {
      alert("Stok tidak mencukupi");
      return;
    }

    const btn = document.getElementById("buyNowBtn");
    btn.disabled = true;
    btn.textContent = "Memproses...";

    // Add to cart first, then redirect to checkout
    await CartManager.addArtPrint({
      productId: currentPrintData.id,
      name: currentPrintData.title,
      imageUrl: currentPrintData.image_url,
      artist: currentPrintData.artist,
      size: currentPrintData.size || "",
      price: currentPrintData.price,
      quantity,
    });

    window.location.href = "/checkout";
  };

  // Render detail produk
  const renderPrintDetails = (print) => {
    currentPrintData = print;

    const isOutOfStock = print.stock <= 0;
    const stockClass = isOutOfStock ? "stock-badge empty" : "stock-badge";
    const stockText = isOutOfStock ? "Habis Terjual" : `Tersedia: ${print.stock} Item`;

    detailContainer.innerHTML = `
    <div class="detail-grid">
      <div class="detail-image-wrapper">
        <img src="${print.image_url || "https://via.placeholder.com/800"}" alt="${print.title}">
      </div>

      <div class="detail-info">
        <h1>${print.title}</h1>
        <p class="artist">Karya oleh <strong>${print.artist}</strong></p>

        <p class="price" id="display-price">
          Rp ${print.price.toLocaleString("id-ID")}
        </p>

        <div class="${stockClass}">
          ${stockText}
        </div>

        <p class="description">
          ${print.description || "Sebuah karya seni menakjubkan yang memberikan sentuhan elegan pada ruangan Anda. Dicetak dengan kualitas premium untuk memastikan warna dan detail yang tahan lama."}
        </p>

        <div class="quantity-selector">
          <label for="quantity">Kuantitas Pembelian</label>
          <input
            type="number"
            id="quantity"
            value="1"
            min="1"
            max="${print.stock > 0 ? print.stock : 1}"
            class="quantity-input"
            ${isOutOfStock ? "disabled" : ""}
          />
        </div>

        <div class="detail-actions" style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button id="addToCartBtn" class="add-to-cart-btn" ${isOutOfStock ? "disabled" : ""} style="flex: 1; min-width: 160px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            ${isOutOfStock ? "Stok Habis" : "Tambah ke Keranjang"}
          </button>
          <button id="buyNowBtn" class="add-to-cart-btn" ${isOutOfStock ? "disabled" : ""} style="flex: 1; min-width: 160px; background: #1a1a1a;">
            ${isOutOfStock ? "Stok Habis" : "Beli Sekarang"}
          </button>
        </div>
      </div>
    </div>
  `;

    const quantityInput = document.getElementById("quantity");
    const addToCartBtn = document.getElementById("addToCartBtn");
    const buyNowBtn = document.getElementById("buyNowBtn");
    const priceDisplay = document.getElementById("display-price");

    // update harga berdasarkan quantity
    const updatePrice = () => {
      const qty = parseInt(quantityInput.value, 10) || 1;
      const total = print.price * qty;
      priceDisplay.textContent = `Rp ${total.toLocaleString("id-ID")}`;
    };

    quantityInput.addEventListener("input", updatePrice);
    addToCartBtn.addEventListener("click", addToCart);
    buyNowBtn.addEventListener("click", buyNow);

    // stok habis
    if (print.stock <= 0) {
      addToCartBtn.disabled = true;
      buyNowBtn.disabled = true;
      quantityInput.disabled = true;
    }
  };

  const getPrintDetails = async () => {
    const params = new URLSearchParams(window.location.search);
    const printId = params.get("id");
    if (!printId) {
      detailContainer.innerHTML = "<p>Produk tidak ditemukan.</p>";
      return;
    }
    try {
      const response = await fetch(`/api/prints/${printId}`);
      if (!response.ok) {
        throw new Error("Produk tidak ditemukan.");
      }
      const print = await response.json();
      renderPrintDetails(print);
    } catch (error) {
      detailContainer.innerHTML = `<p>${error.message}</p>`;
    }
  };

  getPrintDetails();
});
