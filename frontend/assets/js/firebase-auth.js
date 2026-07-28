/**
 * =====================================================
 * CITRA ARTFRAME - FIREBASE AUTH MODULE
 * Mendukung: Login Email/Password, Google Login, Register
 * =====================================================
 */

// Import dulu sebelum kode apapun (ES module best practice)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase Config
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBbKW8bjdh8J4k7ZJNh0z1bV6YBMWPlNHE",
  authDomain: "citraartframe-13ab5.firebaseapp.com",
  projectId: "citraartframe-13ab5",
  storageBucket: "citraartframe-13ab5.firebasestorage.app",
  messagingSenderId: "96864426754",
  appId: "1:96864426754:web:202e3c6a4e6c58771bc01b",
  measurementId: "G-BFTPEZG18N"
};

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// =====================================================
// STATE MANAGEMENT
// =====================================================
let currentUser = null;
const authListeners = [];

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  authListeners.forEach(cb => cb(user));
  updateNavUI(user);
});

export function onAuthChange(callback) {
  authListeners.push(callback);
  // Langsung panggil dengan state saat ini
  if (currentUser !== undefined) callback(currentUser);
}

export function getCurrentUser() {
  return currentUser;
}

export function isLoggedIn() {
  return currentUser !== null;
}

export async function getCurrentUserToken(forceRefresh = false) {
  const user = await waitForAuthUser();
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export async function authFetch(url, options = {}) {
  const token = await getCurrentUserToken();
  if (!token) {
    throw new Error("Login diperlukan untuk mengakses resource ini.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, { ...options, headers });
}

function waitForAuthUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

// =====================================================
// AUTH FUNCTIONS
// =====================================================

export async function registerUser(name, email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(userCredential.user, { displayName: name });
  return userCredential.user;
}

export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logoutUser() {
  await signOut(auth);
}

// =====================================================
// REQUIRE LOGIN GUARD
// Gunakan di halaman yang butuh login (checkout, custom)
// =====================================================
export function requireLogin(redirectTo = null) {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user) {
        // Simpan URL tujuan setelah login
        const target = redirectTo || window.location.href;
        sessionStorage.setItem("cf_redirect_after_login", target);
        // Tampilkan modal login
        openLoginModal();
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// =====================================================
// UPDATE NAVBAR UI
// =====================================================
function updateNavUI(user) {
  const accountBtn = document.getElementById("account-btn");
  const userAvatar = document.getElementById("user-avatar");
  const userDropdown = document.getElementById("user-dropdown");

  if (!accountBtn) return;

  if (user) {
    // Tampilkan avatar / nama
    if (userAvatar) {
      if (user.photoURL) {
        userAvatar.innerHTML = `<img src="${user.photoURL}" alt="${user.displayName}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`;
      } else {
        const initials = (user.displayName || user.email || "U").charAt(0).toUpperCase();
        userAvatar.innerHTML = `<div class="user-initials">${initials}</div>`;
      }
    }
    accountBtn.setAttribute("title", user.displayName || user.email);
    accountBtn.classList.add("logged-in");

    // Update dropdown
    if (userDropdown) {
      document.getElementById("dd-user-name").textContent = user.displayName || "Pengguna";
      document.getElementById("dd-user-email").textContent = user.email;
    }
  } else {
    if (userAvatar) {
      userAvatar.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    }
    accountBtn.classList.remove("logged-in");
  }
}

// =====================================================
// MODAL CONTROL
// =====================================================
export function openLoginModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) {
    modal.classList.add("active");
    showLoginForm();
  }
}

export function closeLoginModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.remove("active");
}

function showLoginForm() {
  document.getElementById("auth-login-form")?.classList.remove("hidden");
  document.getElementById("auth-register-form")?.classList.add("hidden");
  document.getElementById("auth-modal-title").textContent = "Masuk ke Citra Artframe";
}

function showRegisterForm() {
  document.getElementById("auth-login-form")?.classList.add("hidden");
  document.getElementById("auth-register-form")?.classList.remove("hidden");
  document.getElementById("auth-modal-title").textContent = "Buat Akun Baru";
}

// =====================================================
// INIT MODAL EVENTS
// =====================================================
export function initAuthModal() {
  // Toggle tabs
  document.getElementById("tab-login")?.addEventListener("click", showLoginForm);
  document.getElementById("tab-register")?.addEventListener("click", showRegisterForm);

  // Close modal
  document.getElementById("auth-modal-close")?.addEventListener("click", closeLoginModal);
  document.getElementById("auth-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLoginModal();
  });

  // Login form submit
  document.getElementById("auth-login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    const btn = document.getElementById("login-submit-btn");

    try {
      btn.disabled = true;
      btn.textContent = "Masuk...";
      errEl.textContent = "";
      await loginUser(email, password);
      closeLoginModal();
      handleRedirectAfterLogin();
    } catch (err) {
      errEl.textContent = getErrorMessage(err.code);
    } finally {
      btn.disabled = false;
      btn.textContent = "Masuk";
    }
  });

  // Register form submit
  document.getElementById("auth-register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("register-name").value;
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    const errEl = document.getElementById("register-error");
    const btn = document.getElementById("register-submit-btn");

    try {
      btn.disabled = true;
      btn.textContent = "Mendaftar...";
      errEl.textContent = "";
      await registerUser(name, email, password);
      closeLoginModal();
      handleRedirectAfterLogin();
    } catch (err) {
      errEl.textContent = getErrorMessage(err.code);
    } finally {
      btn.disabled = false;
      btn.textContent = "Daftar";
    }
  });

  // Google Login
  document.getElementById("google-login-btn")?.addEventListener("click", async () => {
    const errEl = document.getElementById("login-error");
    try {
      errEl.textContent = "";
      await loginWithGoogle();
      closeLoginModal();
      handleRedirectAfterLogin();
    } catch (err) {
      errEl.textContent = getErrorMessage(err.code);
    }
  });

  document.getElementById("google-register-btn")?.addEventListener("click", async () => {
    const errEl = document.getElementById("register-error");
    try {
      errEl.textContent = "";
      await loginWithGoogle();
      closeLoginModal();
      handleRedirectAfterLogin();
    } catch (err) {
      errEl.textContent = getErrorMessage(err.code);
    }
  });

  // Account button click
  document.getElementById("account-btn")?.addEventListener("click", () => {
    if (currentUser) {
      const dropdown = document.getElementById("user-dropdown");
      dropdown?.classList.toggle("active");
    } else {
      openLoginModal();
    }
  });

  // Logout button
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await logoutUser();
    document.getElementById("user-dropdown")?.classList.remove("active");
    window.location.reload();
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("user-dropdown");
    const accountBtn = document.getElementById("account-btn");
    if (dropdown && !accountBtn?.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove("active");
    }
  });
}

function handleRedirectAfterLogin() {
  const redirect = sessionStorage.getItem("cf_redirect_after_login");
  if (redirect) {
    sessionStorage.removeItem("cf_redirect_after_login");
    window.location.href = redirect;
  }
}

function getErrorMessage(code) {
  const messages = {
    "auth/user-not-found": "Email tidak terdaftar.",
    "auth/wrong-password": "Password salah.",
    "auth/email-already-in-use": "Email sudah digunakan.",
    "auth/weak-password": "Password minimal 6 karakter.",
    "auth/invalid-email": "Format email tidak valid.",
    "auth/popup-closed-by-user": "Login Google dibatalkan.",
    "auth/network-request-failed": "Koneksi bermasalah.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
    "auth/invalid-credential": "Email atau password salah.",
  };
  return messages[code] || "Terjadi kesalahan. Silakan coba lagi.";
}
