// ====== Config ======
const API_BASE = "http://localhost:8080/api"; // sesuaikan dengan backend kamu
const PAGE_SIZE = 10;

// ====== State ======
let ORDERS = [];
let filtered = [];
let currentPage = 1;
let selectedOrder = null;
let deleteTarget = null;
let deleteAction = null; // "DELETE" | "CANCEL"

// ====== Helpers ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const formatIDR = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fromISO = (s) => {
  try {
    return new Date(s);
  } catch {
    return new Date();
  }
};

const formatDateTime = (iso) => {
  const d = fromISO(iso);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
};

const statusBadge = (status) => {
  const base = "badge";
  switch (status) {
    case "PENDING":
      return `${base} bg-yellow-100 text-yellow-700`;
    case "PROCESSING":
      return `${base} bg-blue-100 text-blue-700`;
    case "SHIPPED":
      return `${base} bg-indigo-100 text-indigo-700`;
    case "DELIVERED":
      return `${base} bg-green-100 text-green-700`;
    case "CANCELED":
      return `${base} bg-red-100 text-red-700`;
    default:
      return `${base} bg-gray-100 text-gray-700`;
  }
};

let toastTimer = null;
function showToast(msg, type = "success") {
  const el = $("#notification");
  el.textContent = msg;
  el.classList.remove("bg-green-500", "bg-red-500", "bg-indigo-500");
  el.classList.add(
    type === "error"
      ? "bg-red-500"
      : type === "info"
      ? "bg-indigo-500"
      : "bg-green-500"
  );
  el.style.transform = "translateX(0)";
  el.classList.remove("translate-x-[150%]");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add("translate-x-[150%]");
  }, 2200);
}

function openModal(id) {
  const m = $(id);
  if (m) m.classList.add("active");
}
function closeModal(id) {
  const m = $(id);
  if (m) m.classList.remove("active");
}

// ====== Fetchers ======
async function getOrders() {
  const url = `${API_BASE}/orders`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    // Normalisasi field:
    // id, orderNumber, customerName, customerEmail, address, items[], subtotal, shippingFee, total, status, createdAt
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("Using dummy orders due to fetch error:", e.message);
    // Dummy data for dev
    const now = new Date();
    return [
      {
        id: 101,
        orderNumber: "CF-2025-000101",
        customerName: "Dava Wisda",
        customerEmail: "dava@example.com",
        address: "Jl. Melati No. 1, Jakarta",
        items: [
          { productName: "Frame Kayu Jati 20x30", qty: 1, price: 150000 },
          { productName: "Matboard Pastel", qty: 1, price: 35000 },
        ],
        subtotal: 185000,
        shippingFee: 20000,
        total: 205000,
        status: "PENDING",
        createdAt: now.toISOString(),
      },
      {
        id: 102,
        orderNumber: "CF-2025-000102",
        customerName: "Sinta Putri",
        customerEmail: "sinta@example.com",
        address: "Jl. Anggrek No. 8, Depok",
        items: [
          { productName: "Frame Minimalis 40x60", qty: 1, price: 325000 },
        ],
        subtotal: 325000,
        shippingFee: 25000,
        total: 350000,
        status: "SHIPPED",
        createdAt: new Date(now.getTime() - 86400000).toISOString(),
      },
      {
        id: 103,
        orderNumber: "CF-2025-000103",
        customerName: "Budi Santoso",
        customerEmail: "budi@example.com",
        address: "Jl. Kenanga No. 3, Bandung",
        items: [{ productName: "Frame Premium 50x70", qty: 1, price: 525000 }],
        subtotal: 525000,
        shippingFee: 30000,
        total: 555000,
        status: "DELIVERED",
        createdAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
      },
    ];
  }
}

async function getOrderDetail(id) {
  try {
    const res = await fetch(`${API_BASE}/orders/${id}`);
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    // Fallback to cached item
    return ORDERS.find((o) => o.id == id) || null;
  }
}

async function updateOrderStatus(id, status) {
  const res = await fetch(`${API_BASE}/orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function deleteOrder(id) {
  const res = await fetch(`${API_BASE}/orders/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

// ====== Renderers ======
function renderStats() {
  const today = new Date().toDateString();
  const newToday = ORDERS.filter(
    (o) => new Date(o.createdAt).toDateString() === today
  ).length;
  const pending = ORDERS.filter((o) => o.status === "PENDING").length;
  const shipped = ORDERS.filter((o) => o.status === "SHIPPED").length;
  const canceled = ORDERS.filter((o) => o.status === "CANCELED").length;

  $("#stat-new-orders").textContent = newToday;
  $("#stat-new-orders-sub").textContent =
    newToday > 0 ? `${newToday} order masuk hari ini` : "Tidak ada order baru";
  $("#stat-pending").textContent = pending;
  $("#stat-shipped").textContent = shipped;
  $("#stat-canceled").textContent = canceled;
}

function renderTable() {
  const tbody = $("#orders-table-body");
  tbody.innerHTML = "";

  // Pagination
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = filtered.slice(start, start + PAGE_SIZE);

  pageData.forEach((o) => {
    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-gray-50";
    const itemsText = `${o.items?.length || 0} item`;
    tr.innerHTML = `
      <td class="p-3 font-medium text-gray-800">${
        o.orderNumber || `#${o.id}`
      }</td>
      <td class="p-3 text-gray-600">
        <div class="font-semibold">${o.customerName || "-"}</div>
        <div class="text-xs text-gray-500">${o.customerEmail || ""}</div>
      </td>
      <td class="p-3 text-gray-600">${itemsText}</td>
      <td class="p-3 text-gray-800">${formatIDR(o.total)}</td>
      <td class="p-3">
        <span class="${statusBadge(o.status)}">${o.status}</span>
      </td>
      <td class="p-3 text-gray-600 text-sm">${formatDateTime(o.createdAt)}</td>
      <td class="p-3">
        <button class="view-btn text-indigo-600 hover:text-indigo-800 mr-3" data-id="${
          o.id
        }" title="View detail"><i class="ri-eye-line"></i></button>
        <button class="status-btn text-blue-600 hover:text-blue-800 mr-3" data-id="${
          o.id
        }" title="Edit status"><i class="ri-edit-2-line"></i></button>
        <button class="delete-btn text-red-600 hover:text-red-800" data-id="${
          o.id
        }" title="Delete order"><i class="ri-delete-bin-6-line"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  $("#orders-count").textContent = `${
    filtered.length
  } orders • page ${currentPage} of ${Math.max(
    1,
    Math.ceil(filtered.length / PAGE_SIZE)
  )}`;
  $("#prevPage").disabled = currentPage <= 1;
  $("#nextPage").disabled = start + PAGE_SIZE >= filtered.length;
}

function applyFilters() {
  const q = $("#searchInput").value.trim().toLowerCase();
  const status = $("#statusFilter").value;
  const from = $("#fromDate").value ? new Date($("#fromDate").value) : null;
  const to = $("#toDate").value
    ? new Date($("#toDate").value + "T23:59:59")
    : null;

  filtered = ORDERS.filter((o) => {
    const hitQ =
      !q ||
      (o.orderNumber || "").toLowerCase().includes(q) ||
      (o.customerName || "").toLowerCase().includes(q) ||
      (o.customerEmail || "").toLowerCase().includes(q);

    const hitStatus = !status || o.status === status;

    const created = new Date(o.createdAt);
    const hitFrom = !from || created >= from;
    const hitTo = !to || created <= to;

    return hitQ && hitStatus && hitFrom && hitTo;
  });

  currentPage = 1;
  renderTable();
}

// ====== Order Modal ======
async function openOrderDetail(id) {
  selectedOrder = await getOrderDetail(id);
  if (!selectedOrder) return;

  $("#orderModalTitle").textContent = `Order ${
    selectedOrder.orderNumber || "#" + selectedOrder.id
  }`;
  $(
    "#od-customer"
  ).textContent = `${selectedOrder.customerName} · ${selectedOrder.customerEmail}`;
  $("#od-address").textContent = selectedOrder.address || "-";
  $("#od-meta").textContent = `Status: ${
    selectedOrder.status
  } • Dibuat: ${formatDateTime(selectedOrder.createdAt)}`;
  $("#od-status").value = selectedOrder.status || "PENDING";

  const itemsWrap = $("#od-items");
  itemsWrap.innerHTML = "";
  (selectedOrder.items || []).forEach((it) => {
    const row = document.createElement("div");
    row.className = "px-4 py-3 grid grid-cols-6 gap-2 items-center";
    row.innerHTML = `
      <div class="col-span-3 text-sm text-gray-800">${it.productName}</div>
      <div class="col-span-1 text-sm text-gray-600">x${it.qty}</div>
      <div class="col-span-2 text-right text-sm text-gray-800">${formatIDR(
        it.price * it.qty
      )}</div>
    `;
    itemsWrap.appendChild(row);
  });

  $("#od-subtotal").textContent = formatIDR(selectedOrder.subtotal || 0);
  $("#od-shipping").textContent = formatIDR(selectedOrder.shippingFee || 0);
  $("#od-total").textContent = formatIDR(selectedOrder.total || 0);

  openModal("#orderModal");
}

// ====== Events ======
function wireEvents() {
  // Sidebar toggle (mobile)
  $("#sidebar-toggle")?.addEventListener("click", () => {
    const s = $("#sidebar");
    if (s.classList.contains("-translate-x-full"))
      s.classList.remove("-translate-x-full");
    else s.classList.add("-translate-x-full");
  });

  // Filters
  $("#searchInput").addEventListener("input", applyFilters);
  $("#statusFilter").addEventListener("change", applyFilters);
  $("#fromDate").addEventListener("change", applyFilters);
  $("#toDate").addEventListener("change", applyFilters);

  // Pagination
  $("#prevPage").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });
  $("#nextPage").addEventListener("click", () => {
    if (currentPage * PAGE_SIZE < filtered.length) {
      currentPage++;
      renderTable();
    }
  });

  // Table actions (event delegation)
  $("#orders-table-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains("view-btn")) {
      openOrderDetail(id);
    } else if (btn.classList.contains("status-btn")) {
      // quick edit: open detail + focus status
      openOrderDetail(id).then(() => $("#od-status").focus());
    } else if (btn.classList.contains("delete-btn")) {
      deleteTarget = id;
      deleteAction = "DELETE";
      $("#deleteModalMsg").textContent =
        "Delete order ini? Tindakan ini tidak bisa dibatalkan.";
      openModal("#deleteModal");
    }
  });

  // Order modal controls
  $("#closeOrderModalBtn").addEventListener("click", () =>
    closeModal("#orderModal")
  );
  $("#saveStatusBtn").addEventListener("click", async () => {
    if (!selectedOrder) return;
    const newStatus = $("#od-status").value;
    try {
      await updateOrderStatus(selectedOrder.id, newStatus);
      // update in-memory
      const idx = ORDERS.findIndex((o) => o.id == selectedOrder.id);
      if (idx >= 0) ORDERS[idx].status = newStatus;
      selectedOrder.status = newStatus;
      showToast("Status updated");
      renderStats();
      applyFilters();
      // refresh modal meta
      $("#od-meta").textContent = `Status: ${
        selectedOrder.status
      } • Dibuat: ${formatDateTime(selectedOrder.createdAt)}`;
    } catch (e) {
      showToast(`Gagal update status: ${e.message}`, "error");
    }
  });

  // Delete/Cancel modal controls
  $("#cancelDeleteBtn").addEventListener("click", () => {
    deleteTarget = null;
    deleteAction = null;
    closeModal("#deleteModal");
  });
  $("#confirmDeleteBtn").addEventListener("click", async () => {
    if (!deleteTarget) return;
    try {
      if (deleteAction === "DELETE") {
        await deleteOrder(deleteTarget);
        ORDERS = ORDERS.filter((o) => o.id != deleteTarget);
        showToast("Order deleted");
      }
      closeModal("#deleteModal");
      applyFilters();
      renderStats();
    } catch (e) {
      showToast(`Gagal hapus: ${e.message}`, "error");
    } finally {
      deleteTarget = null;
      deleteAction = null;
    }
  });
}

// ====== Init ======
(async function init() {
  wireEvents();
  ORDERS = await getOrders();
  filtered = [...ORDERS];
  renderStats();
  renderTable();
})();
