// assets/js/frame-builder.js

document.addEventListener("DOMContentLoaded", () => {
  // --- KONFIGURASI ---
  const API_BASE_URL = "/api";
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
    matInfo: document.getElementById("matInfo"),
    matFeeContainer: document.getElementById("matFeeContainer"),
    matFee: document.getElementById("matFee"),
  };

  const numberOrFallback = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
	  const response = await fetch(`${API_BASE_URL}/products/frames`);
      if (!response.ok)
        throw new Error("Gagal mengambil data frame dari server.");

      const products = (await response.json()) || [];

      FRAME_MODELS = products.map((p) => ({
        id: p.id,
        name: p.name,
        image: p.image_url,
        price: p.price,
		model3d: p.frame_model_id && p.frame_model_url
		  ? {
				  id: p.frame_model_id,
				  name: p.frame_model_name || "Model 3D Frame",
				  fileUrl: p.frame_model_url,
				  frontRotationY: Number(p.frame_model_front_rotation_y) === 180 ? 180 : 0,
				}
		  : null,
        // Nilai ini dikalibrasi per produk melalui dashboard admin.
        insets: {
          top: numberOrFallback(p.inset_top, 15),
          right: numberOrFallback(p.inset_right, 15),
          bottom: numberOrFallback(p.inset_bottom, 15),
          left: numberOrFallback(p.inset_left, 15),
        },
        // API utama memakai border_slice. Nama lama tetap diterima agar data
        // dari cache/deployment sebelumnya tidak merusak preview.
        slice: numberOrFallback(
          p.border_slice ?? p.border_image_slice,
          80,
        ),
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

  const calculateContainedPreviewSize = (ratio, maxWidth, maxHeight) => {
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    let width = Math.max(1, maxWidth);
    let height = width / safeRatio;

    if (height > maxHeight) {
      height = Math.max(1, maxHeight);
      width = height * safeRatio;
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
      ratio: safeRatio,
    };
  };

  const renderFramePreview = () => {
    const previewPanel = dom.framePreviewWrapper.closest(".frame-preview-large");
    const panelStyle = previewPanel ? window.getComputedStyle(previewPanel) : null;
    const horizontalPadding = panelStyle
      ? parseFloat(panelStyle.paddingLeft || "0") +
        parseFloat(panelStyle.paddingRight || "0")
      : 0;
    const panelWidth = previewPanel?.clientWidth || window.innerWidth;
    const availableWidth = Math.max(220, panelWidth - horizontalPadding);
    const availableHeight = Math.max(220, window.innerHeight * 0.68);
    const previewBounds = Math.min(560, availableWidth, availableHeight);
    const previewSize = calculateContainedPreviewSize(
      state.artworkWidth / state.artworkHeight,
      previewBounds,
      previewBounds,
    );

    // Kedua sisi berasal dari rasio yang sama. CSS aspect-ratio menjadi
    // pengaman ketika zoom browser atau breakpoint membatasi ruang preview.
    dom.framePreviewWrapper.style.setProperty(
      "--frame-preview-ratio",
      `${previewSize.width} / ${previewSize.height}`,
    );
    dom.framePreviewWrapper.style.aspectRatio = `${previewSize.width} / ${previewSize.height}`;
    dom.framePreviewWrapper.style.width = `${previewSize.width}px`;
    dom.framePreviewWrapper.style.height = `${previewSize.height}px`;

    const frame = state.frameModel;
    if (frame && frame.image) {
      const { top, right, bottom, left } = frame.insets;
      const borderWidths = {
        top: Math.max(1, Math.round((previewSize.height * top) / 100)),
        right: Math.max(1, Math.round((previewSize.width * right) / 100)),
        bottom: Math.max(1, Math.round((previewSize.height * bottom) / 100)),
        left: Math.max(1, Math.round((previewSize.width * left) / 100)),
      };

      // Frame digambar oleh ::after supaya selalu berada di atas artwork.
      // Border slice memilih bagian sumber gambar, sedangkan empat inset
      // menentukan batas lubang/canvas secara khusus untuk setiap produk.
      Object.assign(dom.frameElement.style, {
        backgroundImage: "none",
        padding: "0",
        borderStyle: "none",
        borderImageSource: "none",
      });
      dom.frameElement.style.setProperty("border-width", "0", "important");
      dom.frameElement.style.setProperty(
        "--frame-border-image",
        `url("${frame.image}")`,
      );
      dom.frameElement.style.setProperty(
        "--frame-border-slice",
        `${frame.slice || 80}`,
      );
      dom.frameElement.style.setProperty("--frame-border-top", `${borderWidths.top}px`);
      dom.frameElement.style.setProperty("--frame-border-right", `${borderWidths.right}px`);
      dom.frameElement.style.setProperty("--frame-border-bottom", `${borderWidths.bottom}px`);
      dom.frameElement.style.setProperty("--frame-border-left", `${borderWidths.left}px`);

      // Inset admin dipakai langsung terhadap kanvas luar. Dengan demikian
      // mengganti frame langsung memakai kalibrasi frame tersebut, bukan
      // mewarisi ukuran border dari frame sebelumnya.
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
      Object.assign(dom.matElement.style, {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      });
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
      1,
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
      "id-ID",
    )}`;

    dom.matFeeContainer.style.display = state.matWidth > 0 ? "flex" : "none";
    dom.matFee.textContent = `IDR ${Math.round(matPrice).toLocaleString(
      "id-ID",
    )}`;

    const glassText = state.hasGlass ? "With Glass" : "Without Glass";
    dom.glassInfo.textContent = glassText;
    dom.glassSummary.textContent = glassText;
    if (dom.matInfo) {
      const activeColor = document.querySelector(
        "#matColorOptions .color-option.active",
      );
      const colorName = activeColor?.getAttribute("title") || state.matColor;
      dom.matInfo.textContent =
        state.matWidth === 0 ? "No Mat" : `${state.matWidth}cm, ${colorName}`;
    }
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
  const handleAddToCart = async () => {
    if (!state.frameModel) {
      alert("Silakan pilih model bingkai terlebih dahulu.");
      return;
    }

    const btn = document.getElementById("addToCartBtn");
    btn.disabled = true;
    btn.textContent = "Menambahkan...";

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

    // Use CartManager to add to cart (async)
    const result = await CartManager.addCustomFrame({
      productId: state.frameModel.id,
      name: state.frameModel.name,
      imageUrl: state.frameModel.image,
      artworkWidth: state.artworkWidth,
      artworkHeight: state.artworkHeight,
      matWidth: state.matWidth,
      matColor: state.matColor,
      hasGlass: state.hasGlass,
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
    });

    btn.disabled = false;
    btn.textContent = "Tambah ke Keranjang";

    if (result) {
      CartManager.showAddedToast(state.frameModel.name);
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    state.artworkImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      const localImageUrl = e.target.result;
      dom.artworkContainer.innerHTML = `<img class="artwork-image" src="${localImageUrl}" alt="Pratinjau artwork yang diunggah">`;
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

  const sanitizeAndLimitInput = (inputEl) => {
    let val = inputEl.value.replace(/[^0-9]/g, "");
    if (val !== "") {
      const num = parseInt(val, 10);
      const maxLimit = 500; // Allow custom dimensions up to 500cm instead of capping at 80cm
      if (num > maxLimit) {
        val = maxLimit.toString();
      }
    }
    inputEl.value = val;
  };

  const autoUpdateSize = () => {
    const width = parseInt(dom.artworkWidthInput.value, 10);
    const height = parseInt(dom.artworkHeightInput.value, 10);
    if (width > 0 && height > 0) {
      state.artworkWidth = width;
      state.artworkHeight = height;
      renderAll();
    }
  };

  dom.artworkWidthInput.addEventListener("input", (e) => {
    sanitizeAndLimitInput(e.target);
    autoUpdateSize();
  });

  dom.artworkHeightInput.addEventListener("input", (e) => {
    sanitizeAndLimitInput(e.target);
    autoUpdateSize();
  });

  const handleKeydown = (e) => {
    if (e.key === "Enter") {
      e.target.blur();
    }
  };
  dom.artworkWidthInput.addEventListener("keydown", handleKeydown);
  dom.artworkHeightInput.addEventListener("keydown", handleKeydown);

  let previewResizeFrame = null;
  const resizePreview = () => {
    if (!state.frameModel) return;
    window.cancelAnimationFrame(previewResizeFrame);
    previewResizeFrame = window.requestAnimationFrame(renderFramePreview);
  };

  // Perubahan zoom browser memicu resize. Hitung kembali dua sisi sekaligus
  // agar preview 50×50 tetap persegi pada zoom 80%, 100%, dan seterusnya.
  window.addEventListener("resize", resizePreview, { passive: true });
  window.visualViewport?.addEventListener("resize", resizePreview, {
    passive: true,
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
  const arBtn = document.getElementById("addToCartBtn").cloneNode(true);
  const arButton = document.getElementById("arBtn");
  if (arButton) {
    arButton.addEventListener("click", () => {
      // Simpan state saat ini ke localStorage (sama seperti handleAddToCart tapi tanpa redirect checkout)
      // Kita gunakan fungsi handleAddToCart logic tapi simpan saja

      // Pastikan state.frameModel ada
      if (!state.frameModel) {
        alert("Pilih frame dulu");
        return;
      }

      const totalAddedDimension = state.matWidth * 1;
      const finalWidth = state.artworkWidth + totalAddedDimension;
      const finalHeight = state.artworkHeight + totalAddedDimension;

      const arData = {
		frameProductId: state.frameModel.id,
        frameModelName: state.frameModel.name,
        frameModelImage: state.frameModel.image,
		model3dId: state.frameModel.model3d?.id || 0,
			model3dName: state.frameModel.model3d?.name || "Model 3D bawaan",
			modelUrl: state.frameModel.model3d?.fileUrl || "/assets/3d/frame.glb",
			modelFrontRotationY: state.frameModel.model3d?.frontRotationY || 0,
        dimensions: {
          finalWidthCm: finalWidth,
          finalHeightCm: finalHeight,
        },
      };

      localStorage.setItem("customFrameOrder", JSON.stringify(arData));

      // Redirect ke halaman AR
      window.location.href = "/ar-view";
    });
  }

  // --- INISIALISASI ---
  initializeBuilder();
});
