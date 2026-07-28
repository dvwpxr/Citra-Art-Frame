// /frontend/assets/js/checkout.js — Server-side cart checkout (multi-item)
document.addEventListener("DOMContentLoaded", () => {
  const API = "/api";
  const fmt = (n) => `IDR ${Number(n || 0).toLocaleString("id-ID")}`;

  // State
  let cartItems = [];
  let selectedAddress = null;
  let allAddresses = [];
  let selectedShipping = null;
  let selectedPaymentMethod = "";
  let currentUID = "";
  let currentUser = null;
  let weight = 0.1;
  let subtotal = 0;
  let shippingRequestSequence = 0;
  let activeShippingRequest = null;
  const SHIPPING_CACHE_TTL_MS = 15 * 60 * 1000;
  const SHIPPING_CACHE_PREFIX = "citraframe_shipping_quote_v2:";
  const selectedCartItemIds = parseSelectedCartItemIds();

  const payBtn = document.getElementById("payNowBtn");
  const payBtnText = payBtn.querySelector(".btn-text");
  const paySpinner = payBtn.querySelector(".spinner");

  function parseSelectedCartItemIds() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("items")) return null;

    const ids = params.get("items")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Number.isFinite);
    return new Set(ids);
  }

  const authFetch = async (url, options = {}) => {
    const token = await currentUser?.getIdToken();
    if (!token) {
      throw new Error("Login diperlukan untuk melanjutkan.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  // Weight calculation
  const KG_PER_M_FRAME = 0.6, KG_PER_M2_GLASS = 2.5, KG_PER_M2_BACKING = 1.5;
  const estimateWeight = (items) => {
    let totalWeight = 0;
    items.forEach((item) => {
      if (item.item_type === "artprint") {
        const sz = String(item.size || "").toLowerCase();
        let base = 0.5;
        if (sz.includes("sedang")) base = 1;
        if (sz.includes("besar")) base = 1.5;
        totalWeight += base * (item.quantity || 1);
      } else {
        let dims = item.dimensions;
        if (typeof dims === "string") { try { dims = JSON.parse(dims); } catch { dims = {}; } }
        const w = dims?.finalWidthCm || 50;
        const h = dims?.finalHeightCm || 50;
        const pM = ((w + h) * 2) / 100;
        const aM2 = (w * h) / 10000;
        let itemW = pM * KG_PER_M_FRAME + aM2 * KG_PER_M2_BACKING;
        if (item.has_glass) itemW += aM2 * KG_PER_M2_GLASS;
        totalWeight += itemW * (item.quantity || 1);
      }
    });
    return Math.max(totalWeight, 0.1);
  };

  // === RENDER PRODUCT SUMMARY (multi-item) ===
  function renderProduct() {
    let html = "";
    cartItems.forEach((item) => {
      if (item.item_type === "artprint") {
        html += `<div class="summary-item-preview" style="margin-bottom:16px;">
          <img src="${item.image_url || 'https://via.placeholder.com/80'}" alt="${item.name}">
          <div class="summary-item-details">
            <p>${item.name} (x${item.quantity || 1})</p>
            <span>${item.artist || "-"}</span>
            <span class="final-size-note">${item.size || ""}</span>
            <span style="color:#B88E5D;font-weight:600;">${fmt(item.subtotal)}</span>
          </div>
        </div>`;
      } else {
        html += `<div class="summary-item-preview" style="margin-bottom:16px;">
          <img src="${item.image_url || 'https://via.placeholder.com/80'}" alt="${item.name}">
          <div class="summary-item-details">
            <p>${item.name || "Custom Frame"}</p>
            <span>Ukuran: ${item.artwork_width}×${item.artwork_height} cm${item.mat_width > 0 ? ' | Mat: ' + item.mat_width + 'cm' : ''}</span>
            ${item.has_glass ? '<span>Dengan Kaca</span>' : ''}
            <span style="color:#B88E5D;font-weight:600;">${fmt(item.subtotal)}</span>
          </div>
        </div>`;
      }
    });

    document.getElementById("summaryContent").innerHTML = html;
    document.getElementById("summaryContent").style.display = "block";
    document.getElementById("summarySkeleton").style.display = "none";
    document.getElementById("subtotalAmount").textContent = fmt(subtotal);
    updateTotal();
  }

  // === TOTAL ===
  function updateTotal() {
    const ship = selectedShipping?.price || 0;
    document.getElementById("shippingFee").textContent = fmt(ship);
    document.getElementById("finalTotal").textContent = fmt(subtotal + ship);
    const ready = selectedAddress && selectedShipping && selectedPaymentMethod;
    payBtn.disabled = !ready;
    payBtnText.textContent = ready ? "Bayar Sekarang" : "Pilih Alamat, Ekspedisi & Pembayaran";
  }

  // === ADDRESS ===
  async function loadAddresses() {
    if (!currentUID) return;
    try {
      const r = await authFetch(`${API}/user/addresses?uid=${currentUID}`);
      allAddresses = await r.json();
      if (!allAddresses || allAddresses.length === 0) {
        renderNoAddress();
        return;
      }
      const def = allAddresses.find((a) => a.is_default) || allAddresses[0];
      selectAddress(def);
    } catch (e) {
      renderNoAddress();
    }
  }

  function renderNoAddress() {
    document.getElementById("addressContent").innerHTML = `
      <div style="text-align:center;padding:20px 0;">
        <p style="color:#666;margin-bottom:16px;">Anda belum memiliki alamat tersimpan.</p>
        <a href="/account" class="btn-pay" style="display:inline-block;text-decoration:none;padding:12px 24px;max-width:300px;">Tambah Alamat di Halaman Akun</a>
      </div>`;
  }

  function selectAddress(addr) {
    selectedAddress = addr;
    selectedShipping = null;
    const noVillage = !addr.village_code;
    document.getElementById("addressContent").innerHTML = `
      <div class="address-selected">
        ${noVillage ? '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.85rem;color:#D97706;">⚠️ Alamat belum lengkap (kelurahan belum diisi). <a href="/account" style="color:#D97706;font-weight:600;">Update di Halaman Akun</a></div>' : ''}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <strong>${addr.label}</strong> — ${addr.receiver_name}<br>
            <span style="color:#666;font-size:0.9rem;">${addr.phone}</span><br>
            <span style="color:#666;font-size:0.9rem;">${addr.full_address}${addr.village ? ', ' + addr.village : ''}${addr.district ? ', ' + addr.district : ''}, ${addr.city}, ${addr.province} ${addr.postal_code}</span>
          </div>
          <button class="btn-outline" id="changeAddrBtn" style="flex-shrink:0;">Ubah</button>
        </div>
      </div>`;
    document.getElementById("changeAddrBtn").addEventListener("click", openAddressPicker);
    if (!noVillage) fetchShippingCost(addr.village_code);
    else {
      document.getElementById("shippingOptions").innerHTML = `<p class="shipping-placeholder">Alamat belum lengkap. Silakan update alamat di halaman akun terlebih dahulu.</p>`;
    }
    updateTotal();
  }

  function openAddressPicker() {
    const modal = document.getElementById("addressPickerModal");
    const list = document.getElementById("addressPickerList");
    list.innerHTML = allAddresses
      .map(
        (a) => `
      <div class="addr-pick-card ${a.id === selectedAddress?.id ? 'active' : ''}" data-id="${a.id}" style="border:1px solid ${a.id === selectedAddress?.id ? '#B88E5D' : '#E5E7EB'};border-radius:10px;padding:16px;margin-bottom:12px;cursor:pointer;transition:all 0.2s;">
        <strong>${a.label}</strong>${a.is_default ? ' <span style="background:#B88E5D;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:4px;margin-left:6px;">UTAMA</span>' : ''}
        <br><span style="font-size:0.9rem;color:#666;">${a.receiver_name} | ${a.phone}</span>
        <br><span style="font-size:0.85rem;color:#999;">${a.full_address}${a.village ? ', ' + a.village : ''}${a.district ? ', ' + a.district : ''}, ${a.city}, ${a.province}</span>
        ${!a.village_code ? '<br><span style="font-size:0.8rem;color:#D97706;">⚠️ Kelurahan belum diisi</span>' : ''}
      </div>`
      )
      .join("");
    list.querySelectorAll(".addr-pick-card").forEach((card) => {
      card.addEventListener("click", () => {
        const addr = allAddresses.find((a) => a.id === parseInt(card.dataset.id));
        if (addr) { selectAddress(addr); modal.classList.remove("active"); }
      });
    });
    modal.classList.add("active");
  }
  document.getElementById("closeAddrPicker").addEventListener("click", () => document.getElementById("addressPickerModal").classList.remove("active"));
  document.getElementById("addressPickerModal").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.target.classList.remove("active"); });

  // === SHIPPING ===
  function normalizeCourierIdentifier(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function isAllowedShippingOption(option) {
    const identities = [
      option?.courier_code,
      option?.code,
      option?.courier_name,
      option?.service_name,
      option?.name,
    ].map(normalizeCourierIdentifier);

    return identities.some((identity) =>
      identity.startsWith("jne") ||
      identity.startsWith("jnt") ||
      identity.startsWith("jtexpress") ||
      identity.startsWith("lionparcel") ||
      identity === "lion" ||
      identity.startsWith("lionreg")
    );
  }

  function filterAllowedShippingOptions(options) {
    return Array.isArray(options) ? options.filter(isAllowedShippingOption) : [];
  }

  function shippingCacheKey(villageCode) {
    return `${String(villageCode).trim()}:${weight.toFixed(2)}`;
  }

  function readShippingCache(key) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(SHIPPING_CACHE_PREFIX + key) || "null");
      if (!cached || !Array.isArray(cached.options) || Date.now() - cached.savedAt > SHIPPING_CACHE_TTL_MS) {
        return null;
      }
      const allowedOptions = filterAllowedShippingOptions(cached.options);
      return allowedOptions.length ? allowedOptions : null;
    } catch {
      return null;
    }
  }

  function writeShippingCache(key, options) {
    try {
      sessionStorage.setItem(SHIPPING_CACHE_PREFIX + key, JSON.stringify({
        savedAt: Date.now(),
        options,
      }));
    } catch {
      // Checkout tetap dapat berjalan jika penyimpanan browser dibatasi.
    }
  }

  function extractShippingOptions(data) {
    let options = [];
    if (data?.data && Array.isArray(data.data.couriers)) options = data.data.couriers;
    else if (Array.isArray(data)) options = data;
    else if (Array.isArray(data?.data)) options = data.data;
    else if (Array.isArray(data?.results)) options = data.results;
    return filterAllowedShippingOptions(options);
  }

  async function requestShippingCost(key, villageCode) {
    if (activeShippingRequest?.key === key) return activeShippingRequest.promise;

    const requestURL = `${API}/shipping/cost?destination_village_code=${encodeURIComponent(villageCode)}&weight=${weight.toFixed(2)}`;
    const promise = (async () => {
      const response = await authFetch(requestURL);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || "Gagal memuat opsi pengiriman");
        error.status = response.status;
        error.code = data.code || "";
        error.retryAfter = Number(data.retry_after || response.headers.get("Retry-After") || 0);
        throw error;
      }
      return data;
    })();

    activeShippingRequest = { key, promise };
    try {
      return await promise;
    } finally {
      if (activeShippingRequest?.promise === promise) activeShippingRequest = null;
    }
  }

  function renderShippingLoadError(villageCode, error) {
    const container = document.getElementById("shippingOptions");
    const temporarilyLimited = error?.status === 429
      || error?.status === 503
      || error?.code === "SHIPPING_RATE_LIMITED";
    const message = temporarilyLimited
      ? "Layanan ongkir sedang sibuk karena batas permintaan. Tunggu sebentar lalu coba lagi."
      : "Gagal memuat opsi pengiriman. Silakan coba lagi.";

    container.innerHTML = `
      <div class="shipping-load-error" role="alert">
        <p class="shipping-placeholder">${message}</p>
        <button type="button" class="btn-outline" id="retryShippingBtn">Coba Muat Lagi</button>
      </div>`;
    document.getElementById("retryShippingBtn")?.addEventListener("click", () => {
      fetchShippingCost(villageCode, { force: true });
    });
  }

  async function fetchShippingCost(villageCode, { force = false } = {}) {
    const container = document.getElementById("shippingOptions");
    const key = shippingCacheKey(villageCode);
    const requestSequence = ++shippingRequestSequence;
    selectedShipping = null;
    updateTotal();

    if (!force) {
      const cachedOptions = readShippingCache(key);
      if (cachedOptions?.length) {
        renderShippingOptions(cachedOptions);
        return;
      }
    }

    container.innerHTML = `<div class="skeleton"><div class="skeleton-text" style="width:70%"></div><div class="skeleton-text" style="width:50%"></div></div>`;
    try {
      const data = await requestShippingCost(key, villageCode);
      if (requestSequence !== shippingRequestSequence || selectedAddress?.village_code !== villageCode) return;

      const options = extractShippingOptions(data);
      if (!options.length) {
        container.innerHTML = `<p class="shipping-placeholder">Tidak ada opsi pengiriman tersedia untuk alamat ini.</p>`;
        return;
      }
      writeShippingCache(key, options);
      renderShippingOptions(options);
    } catch (e) {
      if (requestSequence !== shippingRequestSequence || selectedAddress?.village_code !== villageCode) return;
      renderShippingLoadError(villageCode, e);
    }
  }

  function renderShippingOptions(options) {
    const container = document.getElementById("shippingOptions");
    const allowedOptions = filterAllowedShippingOptions(options);
    if (!allowedOptions.length) {
      container._options = [];
      container.innerHTML = `<p class="shipping-placeholder">JNE, J&amp;T, dan Lion Parcel tidak tersedia untuk alamat ini.</p>`;
      return;
    }

    const isEstimatedFallback = allowedOptions.some((opt) => opt.is_estimate);
    const fallbackNotice = isEstimatedFallback
      ? `<div class="shipping-estimate-notice" role="status">
          <strong>Tarif estimasi sementara</strong>
          <span>Kuota layanan ongkir eksternal sedang habis. Tarif berikut dihitung oleh sistem untuk pengujian checkout lokal.</span>
        </div>`
      : "";
    container.innerHTML = fallbackNotice + allowedOptions
      .map((opt, i) => {
        const name = opt.courier_name || opt.service_name || opt.name || "Ekspedisi";
        const service = opt.service_type || opt.service || "";
        const price = opt.price || opt.cost || opt.shipping_cost || 0;
        const etd = opt.etd || opt.estimation || opt.estimated_day || "-";
        return `
        <label class="shipping-option-card" data-index="${i}">
          <input type="radio" name="shipping" value="${i}" style="accent-color:#B88E5D;width:20px;height:20px;"/>
          <div style="flex:1;">
            <strong>${name}${service ? ' — ' + service : ''}</strong>
            <span style="display:block;color:#666;font-size:0.85rem;">Estimasi: ${etd} hari | Berat: ${weight.toFixed(2)} kg</span>
          </div>
          <strong style="color:#B88E5D;white-space:nowrap;">${fmt(price)}</strong>
        </label>`;
      })
      .join("");

    container._options = allowedOptions;
    container.querySelectorAll('input[name="shipping"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const opt = container._options[parseInt(radio.value)];
        selectedShipping = {
          courier_code: opt.courier_code || opt.code || "",
          courier_name: (opt.courier_name || opt.name || "") + (opt.service_type ? ' — ' + opt.service_type : ''),
          price: opt.price || opt.cost || opt.shipping_cost || 0,
          estimation: opt.etd || opt.estimation || opt.estimated_day || "",
          is_estimate: !!opt.is_estimate,
        };
        updateTotal();
      });
    });
  }

  // === PAYMENT ===
  function setupPaymentMethods() {
    document.querySelectorAll('input[name="payment_method"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        selectedPaymentMethod = radio.value;
        updateTotal();
      });
    });
  }

  payBtn.addEventListener("click", handlePayment);
  setupPaymentMethods();

  async function handlePayment() {
    if (!selectedAddress || !selectedShipping) {
      alert("Pilih alamat dan ekspedisi terlebih dahulu.");
      return;
    }
    if (!selectedPaymentMethod) {
      alert("Pilih metode pembayaran terlebih dahulu.");
      return;
    }
    if (!isAllowedShippingOption(selectedShipping)) {
      alert("Ekspedisi hanya tersedia melalui JNE, J&T, atau Lion Parcel.");
      selectedShipping = null;
      updateTotal();
      return;
    }
    if (!selectedAddress.village_code) {
      alert("Alamat belum lengkap. Silakan update alamat di halaman akun.");
      return;
    }

    payBtn.disabled = true;
    payBtnText.textContent = "Memproses...";
    paySpinner.style.display = "inline-block";

    const finalTotal = subtotal + (selectedShipping.price || 0);

    // Build items array from server cart
    const items = cartItems.map((item) => {
      if (item.item_type === "artprint") {
        return {
          product_id: item.product_id || 0,
          name: item.name || "Art Print",
          category: "Art Print",
          price: item.price,
          quantity: item.quantity || 1,
          details: {
            artist: item.artist || "",
            size: item.size || "",
            imageUrl: item.image_url || "",
          },
        };
      } else {
        return {
          product_id: item.product_id || 0,
          name: item.name || "Custom Frame",
          category: "Custom Frame",
          price: item.price,
          quantity: item.quantity || 1,
          details: {
            artworkSize: `${item.artwork_width}x${item.artwork_height} cm`,
            artworkWidth: item.artwork_width,
            artworkHeight: item.artwork_height,
            matWidth: `${item.mat_width || 0} cm`,
            matWidthValue: item.mat_width || 0,
            hasGlass: !!item.has_glass,
            dimensions: item.dimensions || {},
            imageUrl: item.image_url || "",
          },
        };
      }
    });

    const payload = {
      customer_name: selectedAddress.receiver_name,
      customer_email: currentUser?.email || "",
      customer_phone: selectedAddress.phone,
      firebase_uid: currentUID,
      total_price: finalTotal,
      subtotal: subtotal,
      shipping_cost: selectedShipping.price,
      receiver_name: selectedAddress.receiver_name,
      phone: selectedAddress.phone,
      province: selectedAddress.province,
      city: selectedAddress.city,
      district: selectedAddress.district,
      village: selectedAddress.village || "",
      postal_code: selectedAddress.postal_code,
      full_address: selectedAddress.full_address,
      village_code: selectedAddress.village_code,
      courier_code: selectedShipping.courier_code,
      courier_name: selectedShipping.courier_name,
      shipping_price: selectedShipping.price,
      shipping_estimation: selectedShipping.estimation,
      weight: weight,
      payment_method: selectedPaymentMethod,
      items: items,
    };

    try {
      const res = await authFetch(`${API}/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || "Gagal membuat pembayaran");
      }
      const data = await res.json();
      const url = String(data.paymentUrl || "").trim();
      if (!url) throw new Error("Payment URL tidak diterima dari server.");

      if (selectedCartItemIds) {
        await Promise.allSettled(
          cartItems.map((item) => authFetch(`${API}/user/cart/${item.id}`, { method: "DELETE" }))
        );
        sessionStorage.removeItem("citraframe_selected_cart_item_ids");
      } else {
        await authFetch(`${API}/user/cart/clear?uid=${currentUID}`, { method: "DELETE" });
      }

      const abs = url.startsWith("http") ? url : "https://" + url.replace(/^\/\//, "");
      window.location.replace(abs);
    } catch (e) {
      alert(`Terjadi kesalahan: ${e.message}`);
      payBtn.disabled = false;
      payBtnText.textContent = "Bayar Sekarang";
      paySpinner.style.display = "none";
    }
  }

  // === INIT ===
  async function init() {
    try {
      const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
      const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");

      let app;
      if (getApps().length === 0) {
        app = initializeApp({
          apiKey: "AIzaSyBbKW8bjdh8J4k7ZJNh0z1bV6YBMWPlNHE",
          authDomain: "citraartframe-13ab5.firebaseapp.com",
          projectId: "citraartframe-13ab5",
          storageBucket: "citraartframe-13ab5.firebasestorage.app",
          messagingSenderId: "96864426754",
          appId: "1:96864426754:web:202e3c6a4e6c58771bc01b",
        });
      } else {
        app = getApps()[0];
      }
      const auth = getAuth(app);

      onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUser = user;
          currentUID = user.uid;

          // Fetch cart from server
          const res = await authFetch(`${API}/user/cart?uid=${currentUID}`);
          const fetchedItems = await res.json();
          const allCartItems = Array.isArray(fetchedItems) ? fetchedItems : [];

          if (selectedCartItemIds) {
            cartItems = allCartItems.filter((item) => selectedCartItemIds.has(Number(item.id)));
          } else {
            cartItems = allCartItems;
          }

          if (cartItems.length === 0) {
            const message = selectedCartItemIds
              ? `Item checkout yang dipilih tidak ditemukan. <a href="/cart" style="color:#B88E5D;">Kembali ke keranjang</a>`
              : `Keranjang Anda kosong. <a href="/prints" style="color:#B88E5D;">Belanja sekarang</a>`;
            document.getElementById("summaryContent").innerHTML = `<p class="error-text">${message}</p>`;
            document.getElementById("summaryContent").style.display = "block";
            document.getElementById("summarySkeleton").style.display = "none";
            return;
          }

          // Calculate weight and subtotal
          weight = estimateWeight(cartItems);
          subtotal = cartItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);

          renderProduct();
          loadAddresses();
        } else {
          currentUser = null;
          document.getElementById("addressContent").innerHTML = `<div style="text-align:center;padding:20px 0;"><p style="color:#666;">Silakan login terlebih dahulu untuk checkout.</p><a href="/" class="btn-pay" style="display:inline-block;text-decoration:none;padding:12px 24px;">Login</a></div>`;
          document.getElementById("summaryContent").innerHTML = `<p class="error-text">Silakan login untuk melihat pesanan Anda.</p>`;
          document.getElementById("summaryContent").style.display = "block";
          document.getElementById("summarySkeleton").style.display = "none";
        }
      });
    } catch (e) {
      console.error("Firebase init error:", e);
    }
  }
  init();
});
