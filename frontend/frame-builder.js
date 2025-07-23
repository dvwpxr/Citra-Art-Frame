document.addEventListener("DOMContentLoaded", () => {
  // --- KONFIGURASI ---
  const API_BASE_URL = "http://localhost:8080/api";
  const MAX_ARTWORK_DIMENSION_CM = 80; // Atur sisi terpanjang artwork maks 80 cm

  let FRAME_MODELS = [];
  let currentFrameIndex = 0;

  // --- STATE APLIKASI (Default 50x50) ---
  let state = {
    artworkWidth: 50,
    artworkHeight: 50,
    matWidth: 2,
    matColor: "white",
    frameModel: null,
  };

  // --- REFERENSI ELEMEN DOM (Tidak ada perubahan) ---
  const dom = {
    // ... semua referensi DOM Anda tetap sama ...
    builderTitle: document.getElementById("builderTitle"),
    artworkWidthInput: document.getElementById("artworkWidth"),
    artworkHeightInput: document.getElementById("artworkHeight"),
    updateSizeBtn: document.getElementById("updateSizeBtn"),
    uploadImageBtn: document.getElementById("uploadImageBtn"),
    imageUploader: document.getElementById("imageUploader"),
    artworkArea: document.getElementById("artworkArea"),
    frameBorder: document.getElementById("frameBorder"),
    matBorder: document.getElementById("matBorder"),
    frameName: document.getElementById("frameName"),
    priceDisplay: document.getElementById("priceDisplay"),
    finalSize: document.getElementById("finalSize"),
    completionDate: document.getElementById("completionDate"),
    prevFrameBtn: document.getElementById("prevFrame"),
    nextFrameBtn: document.getElementById("nextFrame"),
    matWidthOptions: document.getElementById("matWidthOptions"),
    matColorOptions: document.getElementById("matColorOptions"),
    addToCartBtn: document.getElementById("addToCartBtn"),
  };

  // --- FUNGSI UTAMA ---

  const initializeBuilder = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/frames`);
      if (!response.ok) throw new Error("Failed to fetch frame models.");
      FRAME_MODELS = await response.json();
      if (!FRAME_MODELS || FRAME_MODELS.length === 0) {
        alert("No frame models available.");
        return;
      }
      state.frameModel = FRAME_MODELS[currentFrameIndex];
      // Set nilai input awal sesuai state default
      dom.artworkWidthInput.value = state.artworkWidth;
      dom.artworkHeightInput.value = state.artworkHeight;
      renderAll();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  const renderAll = () => {
    if (!state.frameModel) return;
    renderFramePreview();
    renderInfo();
  };

  const renderFramePreview = () => {
    // ... (Fungsi ini tidak perlu diubah) ...
    const maxPreviewSize = 400;
    const ratio = state.artworkWidth / state.artworkHeight;
    let previewWidth, previewHeight;
    if (ratio > 1) {
      previewWidth = maxPreviewSize;
      previewHeight = maxPreviewSize / ratio;
    } else {
      previewHeight = maxPreviewSize;
      previewWidth = maxPreviewSize * ratio;
    }
    dom.artworkArea.style.width = `${previewWidth}px`;
    dom.artworkArea.style.height = `${previewHeight}px`;
    const matPadding = state.matWidth * 5;
    dom.matBorder.style.padding = `${matPadding}px`;
    dom.matBorder.style.backgroundColor = state.matColor;
    const frame = state.frameModel;
    dom.frameBorder.style.padding = "20px";
    if (frame.image) {
      dom.frameBorder.style.backgroundImage = `url('${frame.image}')`;
      dom.frameBorder.style.backgroundSize = "100% 100%";
      dom.frameBorder.style.backgroundColor = "";
    } else {
      dom.frameBorder.style.backgroundImage = "none";
      dom.frameBorder.style.backgroundColor = "#8B4513";
    }
  };

  const renderInfo = () => {
    // ... (Fungsi ini tidak perlu diubah) ...
    const frame = state.frameModel;
    if (!frame) return;
    const area = state.artworkWidth * state.artworkHeight;
    const basePrice = area * 50;
    const matPrice = state.matWidth * 15000;
    const framePrice = frame.price;
    const totalPrice = basePrice + matPrice + framePrice;
    dom.priceDisplay.textContent = `IDR ${totalPrice.toLocaleString("id-ID")}`;
    const frameBorderWidth = 2.5;
    const finalWidth =
      state.artworkWidth + state.matWidth * 2 + frameBorderWidth * 2;
    const finalHeight =
      state.artworkHeight + state.matWidth * 2 + frameBorderWidth * 2;
    dom.finalSize.textContent = `${finalWidth.toFixed(
      1
    )} x ${finalHeight.toFixed(1)} cm`;
    dom.builderTitle.textContent = `Customizing for ${state.artworkWidth}x${state.artworkHeight}cm Artwork`;
    dom.frameName.textContent = frame.name;
    const date = new Date();
    date.setDate(date.getDate() + 3);
    dom.completionDate.textContent = date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  /** [DIPERBARUI] Menangani upload gambar oleh pengguna */
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      // Tampilkan gambar di preview
      dom.artworkArea.innerHTML = "";
      dom.artworkArea.style.backgroundImage = `url('${e.target.result}')`;
      dom.artworkArea.style.backgroundSize = "cover";
      dom.artworkArea.style.backgroundPosition = "center";

      // Buat objek gambar untuk mendapatkan dimensi aslinya
      const img = new Image();
      img.onload = () => {
        const originalWidth = img.naturalWidth;
        const originalHeight = img.naturalHeight;
        const ratio = originalWidth / originalHeight;

        let newWidth, newHeight;

        // Skalakan ukuran cm berdasarkan sisi terpanjang
        if (ratio > 1) {
          // Gambar landscape
          newWidth = MAX_ARTWORK_DIMENSION_CM;
          newHeight = Math.round(MAX_ARTWORK_DIMENSION_CM / ratio);
        } else {
          // Gambar portrait atau persegi
          newHeight = MAX_ARTWORK_DIMENSION_CM;
          newWidth = Math.round(MAX_ARTWORK_DIMENSION_CM * ratio);
        }

        // Update state dan input fields
        state.artworkWidth = newWidth;
        state.artworkHeight = newHeight;
        dom.artworkWidthInput.value = newWidth;
        dom.artworkHeightInput.value = newHeight;

        // Render ulang semuanya dengan ukuran baru
        renderAll();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleAddToCart = async () => {
    // ... (Fungsi ini tidak perlu diubah) ...
  };

  // --- EVENT LISTENERS (Tidak ada perubahan) ---
  dom.updateSizeBtn.addEventListener("click", () => {
    const width = parseInt(dom.artworkWidthInput.value, 10);
    const height = parseInt(dom.artworkHeightInput.value, 10);
    if (width > 0 && height > 0) {
      state.artworkWidth = width;
      state.artworkHeight = height;
      renderAll();
    } else {
      alert("Please enter valid width and height.");
    }
  });
  dom.uploadImageBtn.addEventListener("click", () => dom.imageUploader.click());
  dom.imageUploader.addEventListener("change", handleImageUpload);
  // --- SALIN DAN TEMPEL BLOK KODE BARU INI ---

  /** Fungsi baru untuk menangani pergantian frame dengan animasi */
  const handleFrameChange = (direction) => {
    if (FRAME_MODELS.length === 0) return;

    // 1. Tambahkan class untuk memulai animasi fade-out
    dom.frameBorder.parentElement.parentElement.classList.add("is-changing");

    // 2. Tunggu sebentar (setengah dari durasi transisi CSS)
    setTimeout(() => {
      // Ganti model frame
      if (direction === "next") {
        currentFrameIndex = (currentFrameIndex + 1) % FRAME_MODELS.length;
      } else {
        currentFrameIndex =
          (currentFrameIndex - 1 + FRAME_MODELS.length) % FRAME_MODELS.length;
      }
      state.frameModel = FRAME_MODELS[currentFrameIndex];

      // Render ulang semua informasi saat frame tidak terlihat
      renderAll();

      // 3. Hapus class untuk memicu animasi fade-in dengan frame baru
      dom.frameBorder.parentElement.parentElement.classList.remove(
        "is-changing"
      );
    }, 150); // Setengah dari 0.3s (300ms) durasi transisi di CSS
  };

  // Gunakan fungsi baru ini untuk event listener
  dom.prevFrameBtn.addEventListener("click", () => handleFrameChange("prev"));
  dom.nextFrameBtn.addEventListener("click", () => handleFrameChange("next"));

  // --- BATAS AKHIR KODE BARU ---
  dom.matWidthOptions.addEventListener("click", (e) => {
    if (e.target.classList.contains("mat-option")) {
      state.matWidth = parseInt(e.target.dataset.width, 10);
      document
        .querySelectorAll("#matWidthOptions .mat-option")
        .forEach((btn) => btn.classList.remove("active"));
      e.target.classList.add("active");
      renderAll();
    }
  });
  dom.matColorOptions.addEventListener("click", (e) => {
    if (e.target.classList.contains("color-option")) {
      state.matColor = e.target.dataset.color;
      document
        .querySelectorAll("#matColorOptions .color-option")
        .forEach((btn) => btn.classList.remove("active"));
      e.target.classList.add("active");
      renderAll();
    }
  });
  dom.addToCartBtn.addEventListener("click", handleAddToCart);

  // --- INISIALISASI ---
  initializeBuilder();
});
