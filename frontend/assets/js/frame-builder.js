// assets/js/frame-builder.js

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
    hasGlass: false,
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

  // --- FUNGSI KALKULASI HARGA (Tidak Berubah) ---
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

  const getGlassPriceMultiplier = (width, height) => {
    return width <= 70 && height <= 110 ? 15 : 30;
  };

  // --- FUNGSI UTAMA ---

  const initializeBuilder = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      if (!response.ok)
        throw new Error("Gagal mengambil data frame dari server.");

      const products = (await response.json()) || [];

      FRAME_MODELS = products.map((p) => ({
        name: p.name,
        image: p.image_url,
        price: p.price,
        // Fallback jika data insets tidak ada di database
        insets: {
          top: p.inset_top || 15,
          right: p.inset_right || 15,
          bottom: p.inset_bottom || 15,
          left: p.inset_left || 15,
        },
        // Nilai slice untuk border-image. Sesuaikan dengan file gambar frame Anda.
        slice: p.border_image_slice || 80,
      }));

      if (FRAME_MODELS.length === 0) {
        alert("Tidak ada produk frame yang tersedia.");
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
    const maxPreviewSize = 550;
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
      // --- LOGIKA TAMPILAN BARU DAN DIPERBAIKI ---

      // 1. Atur gambar frame sebagai background dari #frameElement
      Object.assign(dom.frameElement.style, {
        /* — BACKGROUND isi (bagian tengah) — */
        backgroundSize: "100% 100%", // penuhi area isi
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundOrigin: "content-box", // hitung bg dari area konten
        backgroundClip: "content-box", // bg tidak melebar ke area border
        padding: "0", // jaga supaya isi benar2 'content-box'

        /* — BORDER sebagai bingkai (9-slice) — */
        borderStyle: "solid",
        // Gunakan persen agar tebal bingkai proporsional terhadap ukuran elemen
        borderWidth: `${frame.insets.top}% ${frame.insets.right}% ${frame.insets.bottom}% ${frame.insets.left}%`,
        borderImageSource: `url('${frame.image}')`,
        // 'fill' mengisi area tengah oleh potongan tengah gambar (agar benar2 full)
        // Sesuaikan 'slice' (px) dengan lebar tebal bingkai pada file PNG Anda
        borderImageSlice: `${frame.slice || 80} fill`,
        borderImageRepeat: "stretch", // bisa 'repeat' bila pola harus diulang
      });

      // 2. Atur posisi #matElement agar pas di dalam "lubang" frame
      const { top, right, bottom, left } = frame.insets;
      Object.assign(dom.matElement.style, {
        position: "absolute",
        top: `${top}%`,
        right: `${right}%`,
        bottom: `${bottom}%`,
        left: `${left}%`,
      });
    } else {
      // Fallback jika tidak ada gambar
      dom.frameElement.style.backgroundImage = "none";
      dom.frameElement.style.borderColor = "#8B4513";
      dom.frameElement.style.borderWidth = "20px";
      dom.frameElement.style.borderStyle = "solid";
    }

    // Atur padding mat (tidak berubah)
    const matPadding = state.matWidth * 7;
    dom.matElement.style.padding = `${matPadding}px`;
    if (state.matWidth === 0) {
      dom.matElement.style.backgroundColor = "transparent";
      dom.matElement.style.boxShadow = "none";
    } else {
      dom.matElement.style.backgroundColor = state.matColor;
      dom.matElement.style.boxShadow = "0 0 10px rgba(0,0,0,0.1) inset";
    }
  };

  const renderInfo = () => {
    const frame = state.frameModel;
    if (!frame) return;

    // === PERBAIKAN PERHITUNGAN UKURAN FINAL ===
    // Matboard menambah ukuran di kedua sisi (kiri-kanan dan atas-bawah)
    const totalAddedDimension = state.matWidth * 1;
    const finalWidth = state.artworkWidth + totalAddedDimension;
    const finalHeight = state.artworkHeight + totalAddedDimension;
    dom.finalSize.textContent = `${finalWidth.toFixed(
      1
    )} x ${finalHeight.toFixed(1)} cm`;

    // Kalkulasi Harga (konsisten dengan handleAddToCart)
    const finalAreaCm2 = finalWidth * finalHeight;
    const glassPrice = state.hasGlass
      ? finalAreaCm2 * getGlassPriceMultiplier(finalWidth, finalHeight)
      : 0;

    const artworkAreaCm2 = state.artworkWidth * state.artworkHeight;
    const matPrice =
      state.matWidth > 0
        ? artworkAreaCm2 * getMatPriceMultiplier(state.matWidth)
        : 0;

    const perimeterM = ((finalWidth + finalHeight) * 2) / 100;
    const framePrice = perimeterM * frame.price;
    const totalPrice = glassPrice + matPrice + framePrice;

    dom.priceDisplay.textContent = `IDR ${Math.round(totalPrice).toLocaleString(
      "id-ID"
    )}`;

    dom.matFeeContainer.style.display = state.matWidth > 0 ? "flex" : "none";
    dom.matFee.textContent = `IDR ${Math.round(matPrice).toLocaleString(
      "id-ID"
    )}`;

    const glassText = state.hasGlass ? "With Glass" : "Without Glass";
    dom.glassInfo.textContent = glassText;
    dom.glassSummary.textContent = glassText;
    dom.builderTitle.textContent = `Customizing for ${state.artworkWidth}x${state.artworkHeight}cm Artwork`;

    document.querySelector(".frame-name-text").textContent = frame.name;
    if (dom.frameSwatchPreview) dom.frameSwatchPreview.src = frame.image;

    const date = new Date();
    date.setDate(date.getDate() + 3);
    dom.completionDate.textContent = date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const handleAddToCart = () => {
    if (!state.frameModel) {
      alert("Silakan pilih model bingkai terlebih dahulu.");
      return;
    }

    // Perhitungan ini SEKARANG sama persis dengan di renderInfo
    const totalAddedDimension = state.matWidth * 1;
    const finalWidth = state.artworkWidth + totalAddedDimension;
    const finalHeight = state.artworkHeight + totalAddedDimension;

    const finalAreaCm2 = finalWidth * finalHeight;
    const glassPrice = state.hasGlass
      ? finalAreaCm2 * getGlassPriceMultiplier(finalWidth, finalHeight)
      : 0;

    const artworkAreaCm2 = state.artworkWidth * state.artworkHeight;
    const matPrice =
      state.matWidth > 0
        ? artworkAreaCm2 * getMatPriceMultiplier(state.matWidth)
        : 0;

    const perimeterM = ((finalWidth + finalHeight) * 2) / 100;
    const framePrice = perimeterM * state.frameModel.price;
    const totalPrice = glassPrice + matPrice + framePrice;

    const orderData = {
      frameModelName: state.frameModel.name,
      frameModelImage: state.frameModel.image,
      artworkWidth: state.artworkWidth,
      artworkHeight: state.artworkHeight,
      matWidth: state.matWidth,
      matColor: state.matColor,
      hasGlass: state.hasGlass,
      artworkImageUrl: state.artworkImageUrl,
      dimensions: {
        finalWidthCm: finalWidth,
        finalHeightCm: finalHeight,
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

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    state.artworkImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      const localImageUrl = e.target.result;
      dom.artworkContainer.innerHTML = `<img src="${localImageUrl}" style="width:100%; height:100%; object-fit:cover;">`;
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

  // --- EVENT LISTENERS ---
  const handleFrameChange = (direction) => {
    if (FRAME_MODELS.length === 0) return;
    dom.framePreviewWrapper.classList.add("is-changing");
    setTimeout(() => {
      currentFrameIndex =
        direction === "next"
          ? (currentFrameIndex + 1) % FRAME_MODELS.length
          : (currentFrameIndex - 1 + FRAME_MODELS.length) % FRAME_MODELS.length;
      state.frameModel = FRAME_MODELS[currentFrameIndex];
      renderAll();
      dom.framePreviewWrapper.classList.remove("is-changing");
    }, 200);
  };

  dom.prevFrameBtn.addEventListener("click", () => handleFrameChange("prev"));
  dom.nextFrameBtn.addEventListener("click", () => handleFrameChange("next"));

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
