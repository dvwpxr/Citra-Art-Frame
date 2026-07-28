// frontend/admin/js/frame-models-script.js
// CRUD Script untuk Frame Models 3D

document.addEventListener("DOMContentLoaded", () => {
  // ============================================================
  // ELEMENTS
  // ============================================================
  const tableBody       = document.getElementById("model-table-body");
  const modal           = document.getElementById("modelModal");
  const deleteModal     = document.getElementById("deleteModal");
  const viewerModal     = document.getElementById("viewerModal");
  const form            = document.getElementById("modelForm");
  const notification    = document.getElementById("notification");
  const notificationText = document.getElementById("notificationText");
  const searchInput     = document.getElementById("searchInput");
  const filterFormat    = document.getElementById("filterFormat");
  const filterStatus    = document.getElementById("filterStatus");

  // Form fields
  const modelIdField      = document.getElementById("modelId");
  const modelNameField    = document.getElementById("modelName");
  const modelDescField    = document.getElementById("modelDescription");
	const modelProductField = document.getElementById("modelProduct");
  const modelFrontRotationYField = document.getElementById("modelFrontRotationY");
  const modelFrontRotationXField = document.getElementById("modelFrontRotationX");
  const modelIsActiveEl   = document.getElementById("modelIsActive");
  const isActiveLabelEl   = document.getElementById("isActiveLabel");
  const modelFileInput    = document.getElementById("modelFile");
  const thumbnailFileInput = document.getElementById("thumbnailFile");

  // Preview elements
  const fileInfoBox         = document.getElementById("fileInfoBox");
  const existingFileInfo    = document.getElementById("existingFileInfo");
  const existingFileNameEl  = document.getElementById("existingFileName");
  const thumbPreviewContainer = document.getElementById("thumbPreviewContainer");
  const thumbPreviewImg     = document.getElementById("thumbPreviewImg");
  const existingThumbContainer = document.getElementById("existingThumbContainer");
  const existingThumbImg    = document.getElementById("existingThumbImg");
  const previewContainer    = document.getElementById("previewContainer");
  const previewPlaceholder  = document.getElementById("previewPlaceholder");
  const inlineModelViewer   = document.getElementById("inlineModelViewer");

  // ============================================================
  // STATE
  // ============================================================
  const API = "/api/frame-models";
  let allModels      = [];
	let allFrameProducts = [];
  let modelToDelete  = null;
  let isEditMode     = false;

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric"
    });
  };

  const showNotification = (message, type = "success") => {
    const icons = { success: "ri-checkbox-circle-line", error: "ri-error-warning-line", warning: "ri-alert-line" };
    notificationText.textContent = message;
    notification.className = "notification";
    notification.querySelector("i").className = icons[type] || icons.success;
    if (type === "error") notification.classList.add("error");
    if (type === "warning") notification.classList.add("warning");
    notification.classList.add("show");
    setTimeout(() => notification.classList.remove("show"), 3500);
  };

  const getFormatBadge = (fmt) => {
    const cls = fmt === "glb" ? "badge-glb" : "badge-gltf";
    return `<span class="badge ${cls}">${(fmt || "glb").toUpperCase()}</span>`;
  };

  const getStatusBadge = (isActive) => {
    return isActive
      ? `<span class="badge badge-active"><i class="ri-checkbox-circle-line"></i> Aktif</span>`
      : `<span class="badge badge-inactive"><i class="ri-close-circle-line"></i> Nonaktif</span>`;
  };

  const modelViewerOrientation = (rotationY) =>
    Number(rotationY) === 180 ? "0deg 180deg 0deg" : "0deg 0deg 0deg";

	const renderProductOptions = (currentModelId = 0, selectedProductId = 0) => {
		if (!modelProductField) return;
		const linkedProducts = new Map(
			allModels
				.filter((model) => model.product_id && Number(model.id) !== Number(currentModelId))
				.map((model) => [Number(model.product_id), model.name]),
		);
		modelProductField.innerHTML = [
			`<option value="">Belum ditautkan</option>`,
			...allFrameProducts.map((product) => {
				const productId = Number(product.id);
				const linkedModel = linkedProducts.get(productId);
				const disabled = linkedModel ? " disabled" : "";
				const suffix = linkedModel ? ` — dipakai ${escapeHtml(linkedModel)}` : "";
				return `<option value="${productId}"${disabled}>${escapeHtml(product.name)}${suffix}</option>`;
			}),
		].join("");
		modelProductField.value = selectedProductId ? String(selectedProductId) : "";
	};

  // ============================================================
  // STATS
  // ============================================================
  const updateStats = (models) => {
    const total  = models.length;
    const active = models.filter(m => m.is_active).length;
    const glb    = models.filter(m => m.format === "glb").length;
    const gltf   = models.filter(m => m.format === "gltf").length;

    document.getElementById("stat-total").textContent  = total;
    document.getElementById("stat-active").textContent = active;
    document.getElementById("stat-glb").textContent    = glb;
    document.getElementById("stat-gltf").textContent   = gltf;
  };

  // ============================================================
  // RENDER TABLE
  // ============================================================
  const renderTable = (models) => {
    if (!models || models.length === 0) {
      tableBody.innerHTML = `
		<tr><td colspan="8">
          <div class="empty-state">
            <i class="ri-box-3-line"></i>
            <h3>Belum ada Frame Model 3D</h3>
            <p>Klik "Upload Model Baru" untuk menambahkan model GLTF/GLB pertama Anda</p>
          </div>
        </td></tr>`;
      document.getElementById("pagination-info").textContent = "";
      return;
    }

    tableBody.innerHTML = models.map(m => `
      <tr data-id="${m.id}">
        <td>
          ${m.thumbnail_url
            ? `<img src="${m.thumbnail_url}" class="model-thumb" alt="${m.name}" loading="lazy"/>`
            : `<div class="model-thumb-placeholder"><i class="ri-box-3-line"></i></div>`
          }
        </td>
        <td>
          <div style="font-weight:600;color:#fff;margin-bottom:2px">${escapeHtml(m.name)}</div>
          <div style="font-size:0.75rem;color:rgba(255,255,255,0.35);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml(m.description || "—")}
          </div>
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.38);margin-top:5px">
            <i class="ri-compass-3-line"></i>
            ${Number(m.front_rotation_y) === 180 ? "Arah depan dibalik 180°" : "Arah depan normal"}
          </div>
        </td>
		<td>
		  ${m.product_id
			? `<div style="display:flex;align-items:center;gap:9px;min-width:170px">
				${m.product_image_url
				  ? `<img src="${escapeHtml(m.product_image_url)}" alt="" style="width:38px;height:38px;object-fit:contain;border-radius:8px;background:#fff;border:1px solid rgba(255,255,255,.08)"/>`
				  : `<span style="width:38px;height:38px;display:grid;place-items:center;border-radius:8px;background:rgba(192,149,83,.1);color:#c09553"><i class="ri-frame-line"></i></span>`}
				<div>
				  <div style="font-weight:600;color:#fff;font-size:.8rem">${escapeHtml(m.product_name)}</div>
				  <div style="font-size:.68rem;color:#4ade80;margin-top:2px"><i class="ri-link"></i> Aktif di AR</div>
				</div>
			  </div>`
			: `<span style="font-size:.75rem;color:rgba(255,255,255,.3)"><i class="ri-link-unlink-m"></i> Belum ditautkan</span>`}
		</td>
        <td>${getFormatBadge(m.format)}</td>
        <td>
          <span class="file-size-badge">${formatBytes(m.file_size)}</span>
        </td>
        <td>${getStatusBadge(m.is_active)}</td>
        <td style="color:rgba(255,255,255,0.4);font-size:0.78rem">${formatDate(m.created_at)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="btn-icon view view-btn" data-id="${m.id}" title="Preview 3D">
              <i class="ri-eye-line"></i>
            </button>
            <button class="btn-icon edit edit-btn" data-id="${m.id}" title="Edit">
              <i class="ri-pencil-fill"></i>
            </button>
            <button class="btn-icon toggle ${m.is_active ? '' : 'inactive'} toggle-btn"
              data-id="${m.id}" data-active="${m.is_active}"
              title="${m.is_active ? 'Nonaktifkan' : 'Aktifkan'}">
              <i class="ri-${m.is_active ? 'toggle-fill' : 'toggle-line'}"></i>
            </button>
            <button class="btn-icon delete delete-btn" data-id="${m.id}" data-name="${escapeHtml(m.name)}" title="Hapus">
              <i class="ri-delete-bin-5-fill"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join("");

    document.getElementById("pagination-info").textContent =
      `Menampilkan ${models.length} dari ${allModels.length} model`;
  };

  const escapeHtml = (str) => {
    if (!str) return "";
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  };

  // ============================================================
  // FILTER & SEARCH
  // ============================================================
  const applyFilters = () => {
    const search = (searchInput?.value || "").toLowerCase();
    const fmt    = filterFormat?.value || "";
    const status = filterStatus?.value;

    let filtered = allModels.filter(m => {
	  const matchSearch  = !search || m.name.toLowerCase().includes(search) || (m.description || "").toLowerCase().includes(search) || (m.product_name || "").toLowerCase().includes(search);
      const matchFormat  = !fmt || m.format === fmt;
      const matchStatus  = status === "" ? true : String(m.is_active) === status;
      return matchSearch && matchFormat && matchStatus;
    });

    renderTable(filtered);
  };

  // ============================================================
  // FETCH ALL MODELS
  // ============================================================
	const fetchFrameProducts = async () => {
		try {
			const res = await fetch("/api/products/frames");
			if (!res.ok) throw new Error("Gagal mengambil daftar produk frame");
			allFrameProducts = (await res.json()) || [];
			renderProductOptions(
				Number(modelIdField?.value || 0),
				Number(modelProductField?.value || 0),
			);
		} catch (err) {
			console.error(err);
			showNotification(err.message, "error");
		}
	};

  const fetchModels = async () => {
	tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:48px;color:rgba(255,255,255,0.25)">
      <i class="ri-loader-4-line" style="font-size:2rem;animation:spin 1s linear infinite;display:block;margin-bottom:8px"></i>
      Memuat data...
    </td></tr>`;

    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("Gagal mengambil data model");
      allModels = (await res.json()) || [];
      updateStats(allModels);
      applyFilters();
	  renderProductOptions(
		Number(modelIdField?.value || 0),
		Number(modelProductField?.value || 0),
	  );
    } catch (err) {
      console.error(err);
	  tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:48px;color:#f87171">${err.message}</td></tr>`;
      showNotification(err.message, "error");
    }
  };

  // ============================================================
  // OPEN / CLOSE MODALS
  // ============================================================
  const resetModalForm = () => {
    form.reset();
    modelIdField.value = "";
	if (modelProductField) modelProductField.value = "";
    if (modelFrontRotationYField) modelFrontRotationYField.value = "0";
    if (modelFrontRotationXField) modelFrontRotationXField.value = "0";
    isEditMode = false;

    // Reset file info
    fileInfoBox.style.display = "none";
    fileInfoBox.innerHTML = "";
    existingFileInfo.style.display = "none";
    existingFileNameEl.textContent = "";

    // Reset thumbnail
    thumbPreviewContainer.style.display = "none";
    thumbPreviewImg.src = "";
    existingThumbContainer.style.display = "none";
    existingThumbImg.src = "";

    // Reset 3D preview
    previewContainer.style.display = "none";
    previewPlaceholder.style.display = "flex";
    if (inlineModelViewer) inlineModelViewer.src = "";

    // Reset toggle label
    modelIsActiveEl.checked = true;
    updateToggleLabel();
  };

  const openAddModal = () => {
    resetModalForm();
	renderProductOptions();
    document.getElementById("modalTitle").textContent = "Upload Frame Model 3D";
    document.getElementById("saveBtnText").textContent = "Simpan Model";
    modal.classList.add("active");
  };

  const openEditModal = async (id) => {
    resetModalForm();
    isEditMode = true;
    document.getElementById("modalTitle").textContent = "Edit Frame Model 3D";
    document.getElementById("saveBtnText").textContent = "Update Model";

    try {
      const res = await fetch(`${API}/${id}`);
      if (!res.ok) throw new Error("Gagal mengambil detail model");
      const m = await res.json();

      modelIdField.value      = m.id;
      modelNameField.value    = m.name;
      modelDescField.value    = m.description || "";
	  renderProductOptions(m.id, m.product_id || 0);
      if (modelFrontRotationYField) {
        modelFrontRotationYField.value = Number(m.front_rotation_y) === 180 ? "180" : "0";
      }
      if (modelFrontRotationXField) {
        modelFrontRotationXField.value = m.front_rotation_x || 0;
      }
      modelIsActiveEl.checked = m.is_active;
      updateToggleLabel();

      // Tampilkan info file existing
      if (m.file_name) {
        existingFileInfo.style.display = "block";
        existingFileNameEl.textContent = m.file_name;
      }

      // Tampilkan thumbnail existing
      if (m.thumbnail_url) {
        existingThumbContainer.style.display = "block";
        existingThumbImg.src = m.thumbnail_url;
      }

      // Preview 3D jika ada
      if (m.file_url) {
        previewPlaceholder.style.display = "none";
        previewContainer.style.display = "block";
        inlineModelViewer.src = m.file_url;
        inlineModelViewer.setAttribute("orientation", modelViewerOrientation(m.front_rotation_y));
      }

      modal.classList.add("active");
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const closeModal = () => {
    modal.classList.remove("active");
    if (inlineModelViewer) inlineModelViewer.src = "";
  };

  const openViewerModal = (model) => {
    document.getElementById("viewerModelName").textContent = model.name;
    document.getElementById("mainModelViewer").src = model.file_url;
    document.getElementById("mainModelViewer").setAttribute(
      "orientation",
      modelViewerOrientation(model.front_rotation_y),
    );
    document.getElementById("downloadModelBtn").href = model.file_url;
    document.getElementById("downloadModelBtn").download = model.file_name || "model.glb";

    // Info cards
    document.getElementById("viewerModelInfo").innerHTML = `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-bottom:4px">Format</div>
        <div style="font-size:1rem;font-weight:700;color:#c09553">${(model.format || "GLB").toUpperCase()}</div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-bottom:4px">Ukuran File</div>
        <div style="font-size:1rem;font-weight:700;color:#fff">${formatBytes(model.file_size)}</div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-bottom:4px">Status</div>
        <div style="font-size:1rem;font-weight:700;color:${model.is_active ? '#4ade80' : '#f87171'}">${model.is_active ? "Aktif" : "Nonaktif"}</div>
      </div>
    `;

    viewerModal.classList.add("active");
  };

  const closeViewerModal = () => {
    viewerModal.classList.remove("active");
    document.getElementById("mainModelViewer").src = "";
  };

  const openDeleteModal = (id, name) => {
    modelToDelete = id;
    document.getElementById("deleteModelName").textContent = `"${name}"`;
    deleteModal.classList.add("active");
  };

  const closeDeleteModal = () => {
    modelToDelete = null;
    deleteModal.classList.remove("active");
  };

  // ============================================================
  // TOGGLE LABEL
  // ============================================================
  const updateToggleLabel = () => {
    isActiveLabelEl.textContent = modelIsActiveEl.checked
      ? "Aktif — tersedia untuk preview"
      : "Nonaktif — tidak ditampilkan";
    isActiveLabelEl.style.color = modelIsActiveEl.checked
      ? "rgba(74,222,128,0.9)"
      : "rgba(248,113,113,0.9)";
  };

  modelIsActiveEl?.addEventListener("change", updateToggleLabel);
  modelFrontRotationYField?.addEventListener("change", () => {
    const orientation = modelViewerOrientation(modelFrontRotationYField.value);
    inlineModelViewer?.setAttribute("orientation", orientation);
  });

  // ============================================================
  // FILE DROP ZONE
  // ============================================================
  const setupDropZone = (dropZone, fileInput, onSelect) => {
    ["dragenter", "dragover"].forEach(e => {
      dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.add("drag-over"); });
    });
    ["dragleave", "drop"].forEach(e => {
      dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.remove("drag-over"); });
    });
    dropZone.addEventListener("drop", ev => {
      const files = ev.dataTransfer.files;
      if (files[0]) {
        fileInput.files = files; // native assign
        onSelect(files[0]);
      }
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) onSelect(fileInput.files[0]);
    });
  };

  // Drop zone: model file
  setupDropZone(
    document.getElementById("modelDropZone"),
    modelFileInput,
    (file) => {
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext !== "glb" && ext !== "gltf") {
        showNotification("Format tidak valid! Hanya .glb dan .gltf yang diizinkan", "error");
        modelFileInput.value = "";
        return;
      }
      if (file.size > 200 * 1024 * 1024) {
        showNotification("File terlalu besar! Maksimal 200MB", "error");
        modelFileInput.value = "";
        return;
      }
      fileInfoBox.style.display = "block";
      fileInfoBox.innerHTML = `
        <div class="file-info">
          <i class="ri-box-3-line"></i>
          <div class="file-info-text">
            <div class="name">${escapeHtml(file.name)}</div>
            <div class="size">${formatBytes(file.size)} &nbsp;·&nbsp; ${ext.toUpperCase()}</div>
          </div>
        </div>`;

      // Show preview if it's a local file URL
      const url = URL.createObjectURL(file);
      previewPlaceholder.style.display = "none";
      previewContainer.style.display = "block";
      inlineModelViewer.src = url;
    }
  );

  // Drop zone: thumbnail
  setupDropZone(
    document.getElementById("thumbDropZone"),
    thumbnailFileInput,
    (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        thumbPreviewImg.src = e.target.result;
        thumbPreviewContainer.style.display = "block";
      };
      reader.readAsDataURL(file);
    }
  );

  // Remove new thumbnail
  document.getElementById("removeThumbBtn")?.addEventListener("click", () => {
    thumbnailFileInput.value = "";
    thumbPreviewContainer.style.display = "none";
    thumbPreviewImg.src = "";
  });

  // ============================================================
  // SAVE (CREATE / UPDATE)
  // ============================================================
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("saveBtn");
    const saveBtnText = document.getElementById("saveBtnText");

    const id = modelIdField.value;
    const name = modelNameField.value.trim();

    if (!name) { showNotification("Nama model wajib diisi!", "error"); return; }

    // Validasi: new model must have file
    if (!id && !modelFileInput.files[0]) {
      showNotification("File model 3D wajib diupload!", "error");
      return;
    }

    saveBtn.disabled = true;
    saveBtnText.textContent = id ? "Mengupdate..." : "Mengupload...";

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", modelDescField.value || "");
	formData.append("product_id", modelProductField?.value || "");
    formData.append("front_rotation_y", modelFrontRotationYField?.value || "0");
    formData.append("front_rotation_x", modelFrontRotationXField?.value || "0");
    formData.append("is_active", modelIsActiveEl.checked ? "true" : "false");

    if (modelFileInput.files[0]) {
      formData.append("model_file", modelFileInput.files[0]);
    }
    if (thumbnailFileInput.files[0]) {
      formData.append("thumbnail", thumbnailFileInput.files[0]);
    }

    const url    = id ? `${API}/${id}` : API;
    const method = id ? "PUT" : "POST";

    try {
      const res = await fetch(url, { method, body: formData });
      if (!res.ok) {
		const payload = await res.json().catch(() => null);
		throw new Error(payload?.error || `Gagal ${id ? "mengupdate" : "menyimpan"} model`);
      }
      showNotification(`Model berhasil ${id ? "diupdate" : "diupload"}! ✓`, "success");
      closeModal();
      fetchModels();
    } catch (err) {
      console.error(err);
      showNotification(err.message, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtnText.textContent = id ? "Update Model" : "Simpan Model";
    }
  });

  // ============================================================
  // DELETE
  // ============================================================
  const deleteModel = async (id) => {
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Gagal menghapus model");
      showNotification("Model 3D berhasil dihapus", "success");
      closeDeleteModal();
      fetchModels();
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  // ============================================================
  // TOGGLE STATUS
  // ============================================================
  const toggleModelStatus = async (id, currentActive) => {
    const newStatus = !currentActive;
    try {
      const res = await fetch(`${API}/${id}/toggle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newStatus })
      });
      if (!res.ok) throw new Error("Gagal mengubah status");
      showNotification(`Model ${newStatus ? "diaktifkan" : "dinonaktifkan"}`, "success");
      fetchModels();
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  // ============================================================
  // EVENT LISTENERS — TABLE ACTIONS
  // ============================================================
  tableBody?.addEventListener("click", async (e) => {
    const viewBtn   = e.target.closest(".view-btn");
    const editBtn   = e.target.closest(".edit-btn");
    const toggleBtn = e.target.closest(".toggle-btn");
    const deleteBtn = e.target.closest(".delete-btn");

    if (viewBtn) {
      const id = viewBtn.dataset.id;
      try {
        const res = await fetch(`${API}/${id}`);
        if (!res.ok) throw new Error("Gagal mengambil data model");
        const model = await res.json();
        openViewerModal(model);
      } catch (err) {
        showNotification(err.message, "error");
      }
    }

    if (editBtn) {
      openEditModal(editBtn.dataset.id);
    }

    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const currentActive = toggleBtn.dataset.active === "true";
      toggleModelStatus(id, currentActive);
    }

    if (deleteBtn) {
      openDeleteModal(deleteBtn.dataset.id, deleteBtn.dataset.name);
    }
  });

  // ============================================================
  // EVENT LISTENERS — MODALS
  // ============================================================
  document.getElementById("addModelBtn")?.addEventListener("click", openAddModal);
  document.getElementById("closeModalBtn")?.addEventListener("click", closeModal);
  document.getElementById("cancelModalBtn")?.addEventListener("click", closeModal);

  document.getElementById("closeViewerBtn")?.addEventListener("click", closeViewerModal);
  document.getElementById("closeViewerBtn2")?.addEventListener("click", closeViewerModal);

  document.getElementById("closeDeleteBtn")?.addEventListener("click", closeDeleteModal);
  document.getElementById("cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);
  document.getElementById("confirmDeleteBtn")?.addEventListener("click", () => {
    if (modelToDelete) deleteModel(modelToDelete);
  });

  // Close modals on backdrop click
  [modal, deleteModal, viewerModal].forEach(m => {
    m?.addEventListener("click", (e) => {
      if (e.target === m) {
        if (m === modal) closeModal();
        else if (m === deleteModal) closeDeleteModal();
        else if (m === viewerModal) closeViewerModal();
      }
    });
  });

  // Close modals on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeViewerModal();
      closeDeleteModal();
    }
  });

  // ============================================================
  // FILTER EVENTS
  // ============================================================
  searchInput?.addEventListener("input", applyFilters);
  filterFormat?.addEventListener("change", applyFilters);
  filterStatus?.addEventListener("change", applyFilters);

  // ============================================================
  // INIT
  // ============================================================
	Promise.all([fetchFrameProducts(), fetchModels()]);
});
