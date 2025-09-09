document.addEventListener("DOMContentLoaded", () => {
  // --- KONFIGURASI ---
  const API_BASE_URL = "http://localhost:8080/api";
  const MAX_ARTWORK_DIMENSION_CM = 80;

  let FRAME_MODELS = [];
  let currentFrameIndex = 0;

  // --- STATE APLIKASI ---
  let state = {
    artworkWidth: 50,
    artworkHeight: 50,
    matWidth: 2,
    matColor: "white",
    frameModel: null,
    hasGlass: true,
    artworkImageUrl: null,
  };

  // --- REFERENSI ELEMEN DOM ---
  const dom = {
    builderTitle: document.getElementById("builderTitle"),
    artworkWidthInput: document.getElementById("artworkWidth"),
    artworkHeightInput: document.getElementById("artworkHeight"),
    updateSizeBtn: document.getElementById("updateSizeBtn"),
    uploadImageBtn: document.getElementById("uploadImageBtn"),
    imageUploader: document.getElementById("imageUploader"),
    framePreviewWrapper: document.getElementById("framePreviewWrapper"),
    frameElement: document.getElementById("frameElement"),
    matElement: document.getElementById("matElement"),
    artworkContainer: document.getElementById("artworkContainer"),
    frameName: document.getElementById("frameName"),
    priceDisplay: document.getElementById("priceDisplay"),
    finalSize: document.getElementById("finalSize"),
    completionDate: document.getElementById("completionDate"),
    prevFrameBtn: document.getElementById("prevFrame"),
    nextFrameBtn: document.getElementById("nextFrame"),
    matWidthOptions: document.getElementById("matWidthOptions"),
    matColorOptions: document.getElementById("matColorOptions"),
    addToCartBtn: document.getElementById("addToCartBtn"),
    frameSwatchPreview: document.getElementById("frameSwatchPreview"),
    glassOptions: document.getElementById("glassOptions"),
    glassInfo: document.getElementById("glassInfo"),
    glassSummary: document.getElementById("glassSummary"),
    matFeeContainer: document.getElementById("matFeeContainer"),
    matFee: document.getElementById("matFee"),
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
    const maxPreviewSize = 400;
    const ratio = state.artworkWidth / state.artworkHeight;
    let previewWrapperWidth, previewWrapperHeight;
    if (ratio > 1) {
      previewWrapperWidth = maxPreviewSize;
      previewWrapperHeight = maxPreviewSize / ratio;
    } else {
      previewWrapperHeight = maxPreviewSize;
      previewWrapperWidth = maxPreviewSize * ratio;
    }
    dom.framePreviewWrapper.style.width = `${previewWrapperWidth}px`;
    dom.framePreviewWrapper.style.height = `${previewWrapperHeight}px`;
    const frame = state.frameModel;
    if (frame && frame.image) {
      dom.frameElement.style.borderImageSource = `url('${frame.image}')`;
    } else {
      dom.frameElement.style.borderImageSource = "none";
      dom.frameElement.style.borderColor = "#8B4513";
    }
    const matPadding = state.matWidth * 7;
    dom.matElement.style.padding = `${matPadding}px`;
    if (state.matWidth === 0) {
      dom.matElement.style.backgroundColor = "transparent";
      dom.matElement.style.boxShadow = "none";
    } else {
      dom.matElement.style.backgroundColor = state.matColor;
      dom.matElement.style.boxShadow = "0 0 10px rgba(0,0,0,0.2) inset";
    }
  };

  const renderInfo = () => {
    const frame = state.frameModel;
    if (!frame) return;

    const totalAddedDimension = state.matWidth * 2;
    const finalWidth = state.artworkWidth + totalAddedDimension;
    const finalHeight = state.artworkHeight + totalAddedDimension;

    dom.finalSize.textContent = `${finalWidth.toFixed(
      1
    )} x ${finalHeight.toFixed(1)} cm`;

    const areaCm2 = state.artworkWidth * state.artworkHeight;
    const assemblyPrice = 0;
    const glassPrice = state.hasGlass ? areaCm2 * 20 : 0;

    // === BIAYA MATBOARD DIAKTIFKAN KEMBALI ===
    const matPrice = state.matWidth > 0 ? 20000 : 0;

    const perimeterCm = (finalWidth + finalHeight) * 2;
    const perimeterM = perimeterCm / 100;
    const framePrice = perimeterM * frame.price;

    // Total harga sekarang adalah jumlahan semua komponen
    const totalPrice = assemblyPrice + glassPrice + matPrice + framePrice;

    dom.priceDisplay.textContent = `IDR ${Math.round(totalPrice).toLocaleString(
      "id-ID"
    )}`;

    // Tampilkan atau sembunyikan rincian biaya matboard
    if (state.matWidth > 0) {
      dom.matFeeContainer.style.display = "flex";
      dom.matFee.textContent = `IDR ${matPrice.toLocaleString("id-ID")}`;
    } else {
      dom.matFeeContainer.style.display = "none";
    }

    const glassText = state.hasGlass ? "With Glass" : "Without Glass";
    dom.glassInfo.textContent = glassText;
    dom.glassSummary.textContent = glassText;

    dom.builderTitle.textContent = `Customizing for ${state.artworkWidth}x${state.artworkHeight}cm Artwork`;
    const frameNameText = document.querySelector(".frame-name-text");
    if (frameNameText) frameNameText.textContent = frame.name;
    if (dom.frameSwatchPreview && frame.image) {
      dom.frameSwatchPreview.src = frame.image;
    }
    const date = new Date();
    date.setDate(date.getDate() + 3);
    dom.completionDate.textContent = date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // 1. Simpan file asli ke dalam state untuk di-upload nanti
    state.artworkImageFile = file;

    // 2. Gunakan FileReader untuk membuat URL pratinjau lokal
    const reader = new FileReader();
    reader.onload = (e) => {
      const localImageUrl = e.target.result;
      state.artworkPreviewUrl = localImageUrl; // Simpan URL pratinjau

      // 3. Tampilkan gambar pratinjau di dalam frame
      const container = dom.artworkContainer;
      container.innerHTML = "";
      const previewImage = document.createElement("img");
      previewImage.src = localImageUrl;
      previewImage.style.width = "100%";
      previewImage.style.height = "100%";
      previewImage.style.objectFit = "cover";
      container.appendChild(previewImage);

      // 4. Hitung ulang dimensi berdasarkan gambar pratinjau
      const img = new Image();
      img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight;
        let newWidth, newHeight;
        if (ratio > 1) {
          newWidth = MAX_ARTWORK_DIMENSION_CM;
          newHeight = Math.round(MAX_ARTWORK_DIMENSION_CM / ratio);
        } else {
          newHeight = MAX_ARTWORK_DIMENSION_CM;
          newWidth = Math.round(MAX_ARTWORK_DIMENSION_CM * ratio);
        }
        state.artworkWidth = newWidth;
        state.artworkHeight = newHeight;
        dom.artworkWidthInput.value = newWidth;
        dom.artworkHeightInput.value = newHeight;
        renderAll();
      };
      img.src = localImageUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleAddToCart = () => {
    if (!state.frameModel) {
      alert("Please select a frame model first.");
      return;
    }

    // Kalkulasi ulang semua komponen
    const totalAddedDimension = state.matWidth * 2;
    const finalWidth = state.artworkWidth + totalAddedDimension;
    const finalHeight = state.artworkHeight + totalAddedDimension;
    const areaCm2 = state.artworkWidth * state.artworkHeight;
    const glassPrice = state.hasGlass ? areaCm2 * 20 : 0;
    const matPrice = state.matWidth > 0 ? 20000 : 0;
    const perimeterCm = (finalWidth + finalHeight) * 2;
    const perimeterM = perimeterCm / 100;
    const framePrice = perimeterM * state.frameModel.price;
    const totalPrice = glassPrice + matPrice + framePrice;

    // Buat objek data yang lebih detail untuk dikirim ke checkout
    const orderData = {
      frameModelName: state.frameModel.name,
      frameModelImage: state.frameModel.image,
      artworkWidth: state.artworkWidth,
      artworkHeight: state.artworkHeight,
      matWidth: state.matWidth,
      matColor: state.matColor,
      hasGlass: state.hasGlass,
      artworkImageUrl: state.artworkImageUrl,
      artworkImageUrl: state.artworkImageUrl,
      // TAMBAHAN: Kirim data dimensi untuk estimasi berat
      dimensions: {
        areaM2: areaCm2 / 10000,
        perimeterM: perimeterM,
      },
      priceBreakdown: {
        frame: Math.round(framePrice),
        mat: Math.round(matPrice),
        glass: Math.round(glassPrice),
        total: Math.round(totalPrice),
      },
    };

    localStorage.setItem("customFrameOrder", JSON.stringify(orderData));
    window.location.href = "/checkout";
  };

  // * VERSI UNTUK KALO DIBUKAKAN FRAME + PRINT GAMBAR, * //
  // const handleAddToCart = async () => {
  //   if (!state.frameModel) {
  //     alert("Please select a frame model first.");
  //     return;
  //   }

  //   // Tampilkan status loading di tombol
  //   dom.addToCartBtn.disabled = true;
  //   dom.addToCartBtn.textContent = "Memproses...";

  //   let finalArtworkUrl = null;

  //   // Cek jika ada file baru yang perlu diunggah
  //   if (state.artworkImageFile) {
  //     const formData = new FormData();
  //     formData.append("artworkImage", state.artworkImageFile);

  //     try {
  //       const response = await fetch(`${API_BASE_URL}/upload-image`, {
  //         method: "POST",
  //         body: formData,
  //       });
  //       if (!response.ok) throw new Error("Upload failed before checkout");
  //       const data = await response.json();
  //       finalArtworkUrl = data.imageUrl; // Dapatkan URL permanen dari Cloudinary
  //     } catch (error) {
  //       console.error("Upload Error on Add to Cart:", error);
  //       alert("Gagal mengunggah gambar Anda. Silakan coba lagi.");
  //       dom.addToCartBtn.disabled = false;
  //       dom.addToCartBtn.textContent = "Checkout Now";
  //       return; // Hentikan proses jika upload gagal
  //     }
  //   }

  //   // Lanjutkan dengan kalkulasi harga seperti biasa
  //   const totalAddedDimension = state.matWidth * 2;
  //   const finalWidth = state.artworkWidth + totalAddedDimension;
  //   const finalHeight = state.artworkHeight + totalAddedDimension;
  //   const areaCm2 = state.artworkWidth * state.artworkHeight;
  //   const glassPrice = state.hasGlass ? areaCm2 * 20 : 0;
  //   const matPrice = state.matWidth > 0 ? 20000 : 0;
  //   const perimeterCm = (finalWidth + finalHeight) * 2;
  //   const perimeterM = perimeterCm / 100;
  //   const framePrice = perimeterM * state.frameModel.price;
  //   const totalPrice = glassPrice + matPrice + framePrice;

  //   const orderData = {
  //     frameModelName: state.frameModel.name,
  //     frameModelImage: state.frameModel.image,
  //     artworkWidth: state.artworkWidth,
  //     artworkHeight: state.artworkHeight,
  //     matWidth: state.matWidth,
  //     matColor: state.matColor,
  //     hasGlass: state.hasGlass,
  //     artworkImageUrl: finalArtworkUrl, // Gunakan URL dari Cloudinary
  //     dimensions: { areaM2: areaCm2 / 10000, perimeterM: perimeterM },
  //     priceBreakdown: {
  //       frame: Math.round(framePrice),
  //       mat: Math.round(matPrice),
  //       glass: Math.round(glassPrice),
  //       total: Math.round(totalPrice),
  //     },
  //   };

  //   localStorage.setItem("customFrameOrder", JSON.stringify(orderData));
  //   window.location.href = "/checkout";
  // };

  // --- EVENT LISTENERS ---

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

  const handleFrameChange = (direction) => {
    if (FRAME_MODELS.length === 0) return;
    dom.framePreviewWrapper.classList.add("is-changing");
    setTimeout(() => {
      if (direction === "next") {
        currentFrameIndex = (currentFrameIndex + 1) % FRAME_MODELS.length;
      } else {
        currentFrameIndex =
          (currentFrameIndex - 1 + FRAME_MODELS.length) % FRAME_MODELS.length;
      }
      state.frameModel = FRAME_MODELS[currentFrameIndex];
      renderAll();
      dom.framePreviewWrapper.classList.remove("is-changing");
    }, 200);
  };

  dom.prevFrameBtn.addEventListener("click", () => handleFrameChange("prev"));
  dom.nextFrameBtn.addEventListener("click", () => handleFrameChange("next"));

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

  dom.glassOptions.addEventListener("click", (e) => {
    if (e.target.classList.contains("mat-option")) {
      state.hasGlass = e.target.dataset.glass === "true";
      document
        .querySelectorAll("#glassOptions .mat-option")
        .forEach((btn) => btn.classList.remove("active"));
      e.target.classList.add("active");
      renderAll();
    }
  });

  dom.addToCartBtn.addEventListener("click", handleAddToCart);

  // --- INISIALISASI ---
  initializeBuilder();
});
