document.addEventListener("DOMContentLoaded", () => {
  // === PERBAIKAN: Tambahkan baris ini ===
  const API_BASE_URL = "http://localhost:8080/api";

  const getMatPriceMultiplier = (matWidth) => {
    switch (matWidth) {
      case 2:
        return 20;
      case 4:
        return 30;
      case 6:
        return 45;
      case 8:
        return 60;
      default:
        return 0;
    }
  };

  // --- KONFIGURASI PENGIRIMAN ---
  const SHIPPING_RATES = {
    jabodetabek: [
      { maxKg: 1, price: 20000 },
      { maxKg: 3, price: 45000 },
      { maxKg: 5, price: 75000 },
      { maxKg: 7, price: 110000 },
      { maxKg: 10, price: 150000 },
    ],
    jawa: [
      { maxKg: 1, price: 25000 },
      { maxKg: 3, price: 55000 },
      { maxKg: 5, price: 90000 },
      { maxKg: 7, price: 130000 },
      { maxKg: 10, price: 175000 },
    ],
    luar_jawa: [
      { maxKg: 1, price: 35000 },
      { maxKg: 3, price: 80000 },
      { maxKg: 5, price: 130000 },
      { maxKg: 7, price: 180000 },
      { maxKg: 10, price: 250000 },
    ],
  };
  const KG_PER_M_FRAME = 0.6,
    KG_PER_M2_GLASS = 2.5,
    KG_PER_M2_BACKING = 1.5;

  // --- REFERENSI ELEMEN DOM ---
  const summarySkeleton = document.getElementById("summarySkeleton");
  const summaryContentEl = document.getElementById("summaryContent");
  const shippingMethodEl = document.getElementById("shippingMethod");
  const priceDetailsEl = document.getElementById("priceDetails");
  const tujuanSelect = document.getElementById("tujuan");
  const payNowBtn = document.getElementById("payNowBtn");
  const customerForm = document.getElementById("customerForm");
  formInputs = Array.from(customerForm.querySelectorAll("[required]"));

  // --- STATE ---
  let orderData = JSON.parse(localStorage.getItem("customFrameOrder"));
  let currentShippingInfo = { cost: 0, destination: "", weight: 0 };
  const validationState = formInputs.reduce(
    (acc, input) => ({ ...acc, [input.id]: false }),
    {}
  );

  // --- FUNGSI VALIDASI ---
  const checkFormValidity = () => {
    const allValid = Object.values(validationState).every((isValid) => isValid);
    payNowBtn.disabled = !allValid;
    payNowBtnText.textContent = allValid
      ? "Lanjut ke Pembayaran"
      : "Lengkapi Form untuk Membayar";
  };

  // --- FUNGSI INTERAKTIF ---
  const animateCountUp = (element, endValue) => {
    const startValue = parseFloat(element.dataset.value) || 0;
    if (startValue === endValue) return;
    const duration = 600;
    let startTime = null;
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const currentValue = Math.floor(
        progress * (endValue - startValue) + startValue
      );
      element.textContent = formatCurrency(currentValue);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        element.textContent = formatCurrency(endValue);
        element.dataset.value = endValue;
      }
    };
    window.requestAnimationFrame(step);
  };

  const validateField = (input) => {
    const parent = input.closest(".form-group");
    const errorContainer = parent.querySelector(".error-message");
    let errorMessage = "";

    if (input.validity.valueMissing) {
      errorMessage = "Kolom ini wajib diisi.";
    } else if (input.validity.tooShort) {
      errorMessage = `Minimal harus ${input.minLength} karakter.`;
    } else if (input.validity.patternMismatch) {
      if (input.id === "kodePos")
        errorMessage = "Kode pos harus 5 digit angka.";
      else if (input.id === "customerPhone")
        errorMessage = "Nomor telepon harus 9-14 digit angka.";
    } else if (input.type === "email" && input.validity.typeMismatch) {
      errorMessage = "Format email tidak valid.";
    }

    const isValid = errorMessage === "";
    validationState[input.id] = isValid;
    errorContainer.textContent = errorMessage;
    parent.classList.toggle("is-valid", isValid);
    parent.classList.toggle("is-invalid", !isValid);
    checkFormValidity();
  };

  // --- FUNGSI UTAMA ---
  const formatCurrency = (amount) => `IDR ${amount.toLocaleString("id-ID")}`;

  const estimateWeight = () => {
    if (!orderData || !orderData.dimensions) return 0;
    const { finalWidthCm, finalHeightCm } = orderData.dimensions;
    const perimeterM = ((finalWidthCm + finalHeightCm) * 2) / 100;
    const areaM2 = (finalWidthCm * finalHeightCm) / 10000;
    return (
      perimeterM * KG_PER_M_FRAME +
      areaM2 * KG_PER_M2_BACKING +
      (orderData.hasGlass ? areaM2 * KG_PER_M2_GLASS : 0)
    );
  };

  const updateShippingOptions = () => {
    const destination = tujuanSelect.value;
    if (!destination) {
      shippingMethodEl.innerHTML = `<div class="shipping-method"><h3>Metode Pengiriman</h3><p class="shipping-placeholder">Pilih zona pengiriman untuk melihat ongkir.</p></div>`;
      currentShippingInfo.cost = 0;
    } else {
      const weight = currentShippingInfo.weight;
      const rates = SHIPPING_RATES[destination];
      let shippingCost = 0;
      for (const rate of rates) {
        if (weight <= rate.maxKg) {
          shippingCost = rate.price;
          break;
        }
      }
      if (shippingCost === 0 && weight > 0)
        shippingCost = rates[rates.length - 1].price;

      currentShippingInfo.cost = shippingCost;
      currentShippingInfo.destination = destination;

      shippingMethodEl.innerHTML = `
        <div class="shipping-method">
          <h3>Metode Pengiriman</h3>
          <div class="shipping-option">
            <div>
              <p>Flat Rate Ongkir</p>
              <span>Estimasi berat: ${weight.toFixed(2)} kg</span>
            </div>
            <strong data-value="0">${formatCurrency(shippingCost)}</strong>
          </div>
        </div>`;
    }
    updateTotalPrice();
  };

  const updateTotalPrice = () => {
    const productTotal = orderData.priceBreakdown.total;
    const finalTotal = productTotal + currentShippingInfo.cost;
    const shippingFeeEl = priceDetailsEl.querySelector("#shippingFee");
    const finalTotalEl = priceDetailsEl.querySelector("#finalTotal span");
    if (shippingFeeEl) animateCountUp(shippingFeeEl, currentShippingInfo.cost);
    if (finalTotalEl) animateCountUp(finalTotalEl, finalTotal);
  };

  const initializePage = () => {
    if (!orderData) {
      summarySkeleton.innerHTML = `<p class="error-text">Error: Rincian pesanan tidak ditemukan. Silakan kembali dan buat pesanan baru.</p>`;
      payNowBtn.disabled = true;
      return;
    }

    currentShippingInfo.weight = estimateWeight();
    const {
      frameModelName,
      frameModelImage,
      artworkWidth,
      artworkHeight,
      matWidth, // Ambil data matWidth
      priceBreakdown,
      hasGlass,
    } = orderData;

    // --- PERBAIKAN DIMULAI DI SINI ---
    let sizeDescription;

    if (matWidth > 0) {
      // Matboard menambah ukuran di kedua sisi (kiri-kanan & atas-bawah)
      const totalAddedDimension = matWidth * 1;
      const finalWidth = artworkWidth + totalAddedDimension;
      const finalHeight = artworkHeight + totalAddedDimension;

      // Buat teks yang menampilkan kedua ukuran untuk kejelasan
      sizeDescription = `Ukuran Artwork: ${artworkWidth} x ${artworkHeight} cm<br><span class="final-size-note">Total dengan Mat: ${finalWidth} x ${finalHeight} cm</span>`;
    } else {
      // Jika tidak ada mat, tampilkan ukuran artwork saja
      sizeDescription = `Ukuran Artwork: ${artworkWidth} x ${artworkHeight} cm`;
    }

    summaryContentEl.innerHTML = `<div class="summary-item-preview">
        <img src="${
          frameModelImage || "https://via.placeholder.com/80"
        }" alt="${frameModelName}">
        <div class="summary-item-details">
            <p>${frameModelName}</p>
            <span>${sizeDescription}</span>
        </div>
    </div>`;
    // --- AKHIR PERBAIKAN ---

    updateShippingOptions();

    priceDetailsEl.innerHTML = `
      <div class="price-breakdown">
          <div class="price-line"><span>Harga Frame</span><strong>${formatCurrency(
            priceBreakdown.frame
          )}</strong></div>
          ${
            priceBreakdown.mat > 0
              ? `<div class="price-line"><span>Biaya Matboard</span><strong>${formatCurrency(
                  priceBreakdown.mat
                )}</strong></div>`
              : ""
          }
          ${
            hasGlass
              ? `<div class="price-line"><span>Biaya Kaca Pelindung</span><strong>${formatCurrency(
                  priceBreakdown.glass
                )}</strong></div>`
              : ""
          }
          <div class="price-line" id="shippingFeeLine"><span>Ongkos Kirim</span><strong id="shippingFee" data-value="0">${formatCurrency(
            0
          )}</strong></div>
      </div>
      <div class="price-total"><span>Total</span><strong id="finalTotal"><span data-value="${
        priceBreakdown.total
      }">${formatCurrency(priceBreakdown.total)}</span></strong></div>`;

    setTimeout(() => {
      summarySkeleton.style.display = "none";
      ["summaryContent", "shippingMethod", "priceDetails"].forEach(
        (id) => (document.getElementById(id).style.display = "block")
      );
    }, 500);

    formInputs.forEach((input) => {
      input.addEventListener("input", () => validateField(input));
      if (input.tagName === "SELECT")
        input.addEventListener("change", () => validateField(input));
    });
    tujuanSelect.addEventListener("change", updateShippingOptions);
    payNowBtn.addEventListener("click", handlePayment);
    formInputs.forEach((input) => validateField(input));
  };

  const handlePayment = async () => {
    if (!customerForm.checkValidity()) {
      alert("Harap isi semua informasi kontak dan alamat dengan benar.");
      customerForm.reportValidity();
      return;
    }
    if (!tujuanSelect.value) {
      alert("Harap pilih tujuan pengiriman terlebih dahulu.");
      return;
    }

    payNowBtn.disabled = true;
    payNowBtn.textContent = "Memproses...";

    const finalTotal =
      orderData.priceBreakdown.total + currentShippingInfo.cost;

    const payload = {
      ...orderData,
      shipping: currentShippingInfo,
      priceBreakdown: {
        ...orderData.priceBreakdown,
        total: finalTotal,
      },
      customer: {
        name: document.getElementById("customerName").value,
        email: document.getElementById("customerEmail").value,
        phone: document.getElementById("customerPhone").value,
        address: document.getElementById("alamatLengkap").value,
        city: document.getElementById("kota").value,
        postalCode: document.getElementById("kodePos").value,
        destination: tujuanSelect.options[tujuanSelect.selectedIndex].text,
      },
    };

    try {
      const response = await fetch(`${API_BASE_URL}/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to create payment link.");
      }

      const data = await response.json();

      if (data.paymentUrl) {
        // Normalisasi agar selalu absolut
        const raw = String(data.paymentUrl).trim();
        const absoluteUrl =
          raw.startsWith("http://") || raw.startsWith("https://")
            ? raw
            : "https://" + raw.replace(/^\/\//, ""); // dukung URL yg diawali //

        // optional: hapus order dari storage
        localStorage.removeItem("customFrameOrder");

        // redirect
        window.location.replace(absoluteUrl);
      } else {
        throw new Error("Payment URL not received.");
      }
    } catch (error) {
      console.error("Payment Error:", error);
      alert(`Terjadi kesalahan: ${error.message}. Silakan coba lagi.`);
      payNowBtn.disabled = false;
      payNowBtn.textContent = "Lanjut ke Pembayaran";
    }
  };

  // --- Jalankan Inisialisasi ---
  initializePage();
});
