// assets/js/cart.js — Cart Manager Module for Citra Artframe
// Server-side cart tied to Firebase user accounts

const CartManager = (() => {
  const API = "/api/user/cart";
  let _uid = null;
  let _auth = null;
  let _cache = []; // local cache for quick reads

  // Firebase config (same as used in firebase-auth.js)
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBbKW8bjdh8J4k7ZJNh0z1bV6YBMWPlNHE",
    authDomain: "citraartframe-13ab5.firebaseapp.com",
    projectId: "citraartframe-13ab5",
    storageBucket: "citraartframe-13ab5.firebasestorage.app",
    messagingSenderId: "96864426754",
    appId: "1:96864426754:web:202e3c6a4e6c58771bc01b",
  };

  // Dispatch custom event so UI components can react
  const dispatchCartUpdate = (count) => {
    window.dispatchEvent(
      new CustomEvent("cart:updated", { detail: { count } })
    );
  };

  // Get current user UID (blocking cache)
  const getUID = () => _uid;

  const setUID = (uid) => {
    _uid = uid;
    if (uid) {
      // Load cart from server when user logs in
      fetchCart();
    } else {
      _cache = [];
      dispatchCartUpdate(0);
    }
  };

  const authFetch = async (url, options = {}) => {
    const token = await _auth?.currentUser?.getIdToken();
    if (!token) {
      throw new Error("missing firebase token");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  /**
   * Fetch cart from server
   */
  const fetchCart = async () => {
    if (!_uid) { _cache = []; dispatchCartUpdate(0); return []; }
    try {
      const res = await authFetch(`${API}?uid=${_uid}`);
      if (!res.ok) throw new Error("fetch failed");
      _cache = await res.json();
      if (!Array.isArray(_cache)) _cache = [];
      dispatchCartUpdate(_cache.length);
      return _cache;
    } catch (e) {
      console.error("CartManager.fetchCart error:", e);
      return _cache;
    }
  };

  /**
   * Get cart items (returns cached items, fetches if empty)
   */
  const getCart = () => ({ items: _cache });

  /**
   * Get all items (async, always fresh from server)
   */
  const getCartAsync = async () => {
    const items = await fetchCart();
    return { items };
  };

  /**
   * Add an Art Print item to the cart
   */
  const addArtPrint = async ({ productId, name, imageUrl, artist, size, price, quantity = 1 }) => {
    if (!_uid) { promptLogin(); return null; }
    try {
      const res = await authFetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firebase_uid: _uid,
          item_type: "artprint",
          product_id: productId,
          name,
          image_url: imageUrl,
          artist: artist || "",
          size: size || "",
          price,
          quantity,
          subtotal: price * quantity,
        }),
      });
      if (!res.ok) throw new Error("add failed");
      await fetchCart();
      return _cache;
    } catch (e) {
      console.error("CartManager.addArtPrint error:", e);
      return null;
    }
  };

  /**
   * Add a Custom Frame item to the cart
   */
  const addCustomFrame = async ({
    productId, name, imageUrl, artworkWidth, artworkHeight,
    matWidth, matColor, hasGlass, dimensions, priceBreakdown,
  }) => {
    if (!_uid) { promptLogin(); return null; }
    try {
      const res = await authFetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firebase_uid: _uid,
          item_type: "custom",
          product_id: productId || 0,
          name,
          image_url: imageUrl,
          artwork_width: artworkWidth,
          artwork_height: artworkHeight,
          mat_width: matWidth || 0,
          mat_color: matColor || "white",
          has_glass: !!hasGlass,
          dimensions: dimensions || {},
          price_breakdown: priceBreakdown || {},
          price: priceBreakdown?.total || 0,
          quantity: 1,
          subtotal: priceBreakdown?.total || 0,
        }),
      });
      if (!res.ok) throw new Error("add failed");
      await fetchCart();
      return _cache;
    } catch (e) {
      console.error("CartManager.addCustomFrame error:", e);
      return null;
    }
  };

  /**
   * Remove an item from the cart by server ID
   */
  const removeItem = async (itemId) => {
    try {
      await authFetch(`${API}/${itemId}`, { method: "DELETE" });
      await fetchCart();
      return _cache;
    } catch (e) {
      console.error("CartManager.removeItem error:", e);
      return null;
    }
  };

  /**
   * Update the quantity for a specific item
   */
  const updateQuantity = async (itemId, newQuantity) => {
    try {
      await authFetch(`${API}/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQuantity }),
      });
      await fetchCart();
      return _cache;
    } catch (e) {
      console.error("CartManager.updateQuantity error:", e);
      return null;
    }
  };

  /**
   * Get total item count in the cart
   */
  const getCount = () => _cache.reduce((sum, item) => sum + (item.quantity || 1), 0);

  /**
   * Get the grand total price of all items
   */
  const getTotal = () => _cache.reduce((sum, item) => sum + (item.subtotal || 0), 0);

  /**
   * Clear the entire cart
   */
  const clearCart = async () => {
    if (!_uid) return;
    try {
      await authFetch(`${API}/clear?uid=${_uid}`, { method: "DELETE" });
      _cache = [];
      dispatchCartUpdate(0);
    } catch (e) {
      console.error("CartManager.clearCart error:", e);
    }
  };

  /**
   * Estimate total weight for shipping calculation
   */
  const estimateTotalWeight = () => {
    const KG_PER_M_FRAME = 0.6;
    const KG_PER_M2_GLASS = 2.5;
    const KG_PER_M2_BACKING = 1.5;
    let totalWeight = 0;

    _cache.forEach((item) => {
      if (item.item_type === "artprint") {
        let base = 0.5;
        const sz = String(item.size || "").toLowerCase();
        if (sz.includes("sedang")) base = 1;
        if (sz.includes("besar")) base = 1.5;
        totalWeight += base * (item.quantity || 1);
      } else if (item.item_type === "custom") {
        let dims = item.dimensions;
        if (typeof dims === "string") { try { dims = JSON.parse(dims); } catch { dims = {}; } }
        const w = dims?.finalWidthCm || 50;
        const h = dims?.finalHeightCm || 50;
        const pM = ((w + h) * 2) / 100;
        const aM2 = (w * h) / 10000;
        let itemWeight = pM * KG_PER_M_FRAME + aM2 * KG_PER_M2_BACKING;
        if (item.has_glass) itemWeight += aM2 * KG_PER_M2_GLASS;
        totalWeight += itemWeight * (item.quantity || 1);
      }
    });

    return Math.max(totalWeight, 0.1);
  };

  /**
   * Prompt user to login
   */
  const promptLogin = () => {
    // Try to open auth modal if it exists
    const modal = document.getElementById("auth-modal");
    if (modal) {
      modal.classList.add("active");
    } else {
      alert("Silakan login terlebih dahulu untuk menambahkan item ke keranjang.");
    }
  };

  /**
   * Initialize cart badge on page load + listen for auth state
   */
  const initBadge = () => {
    updateBadgeUI(0);
    window.addEventListener("cart:updated", (e) => {
      updateBadgeUI(e.detail.count);
    });

    // Init Firebase and listen for auth state
    initFirebaseAuth();
  };

  const updateBadgeUI = (count) => {
    const badges = document.querySelectorAll(".cart-badge");
    badges.forEach((badge) => {
      if (count > 0) {
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    });
  };

  /**
   * Initialize Firebase Auth listener
   */
  const initFirebaseAuth = async () => {
    try {
      const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
      const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");

      let app;
      if (getApps().length === 0) {
        app = initializeApp(FIREBASE_CONFIG);
      } else {
        app = getApps()[0];
      }
      const auth = getAuth(app);
      _auth = auth;

      onAuthStateChanged(auth, (user) => {
        if (user) {
          setUID(user.uid);
        } else {
          setUID(null);
        }
      });
    } catch (e) {
      console.warn("CartManager: Firebase auth init skipped:", e.message);
    }
  };

  /**
   * Show a toast notification when item is added
   */
  const showAddedToast = (itemName) => {
    const existing = document.getElementById("cart-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "cart-toast";
    toast.innerHTML = `
      <div class="cart-toast-inner">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span><strong>${itemName}</strong> ditambahkan ke keranjang</span>
        <a href="/cart" class="cart-toast-link">Lihat Keranjang</a>
      </div>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  };

  return {
    getCart,
    getCartAsync,
    fetchCart,
    addArtPrint,
    addCustomFrame,
    removeItem,
    updateQuantity,
    getCount,
    getTotal,
    clearCart,
    estimateTotalWeight,
    initBadge,
    showAddedToast,
    getUID,
    setUID,
  };
})();

// Auto-init badge when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => CartManager.initBadge());
} else {
  CartManager.initBadge();
}
