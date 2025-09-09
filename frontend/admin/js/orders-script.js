document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://localhost:8080/api/orders";

  // --- REFERENSI ELEMEN ---
  const tableBody = document.getElementById("orders-table-body");
  const orderModal = document.getElementById("orderModal");
  const closeOrderModalBtn = document.getElementById("closeOrderModalBtn");
  const saveStatusBtn = document.getElementById("saveStatusBtn");
  const notification = document.getElementById("notification");
  // Filter elements
  const fromDateEl = document.getElementById("fromDate");
  const toDateEl = document.getElementById("toDate");
  const statusFilterEl = document.getElementById("statusFilter");
  const searchInputEl = document.getElementById("searchInput");

  // --- STATE ---
  let allOrders = []; // Cache untuk data mentah
  let currentEditingOrderId = null;

  // --- FUNGSI HELPER ---
  const formatCurrency = (amount) => `Rp ${amount.toLocaleString("id-ID")}`;
  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const showNotification = (message, isError = false) => {
    notification.textContent = message;
    notification.className = `fixed top-[7%] right-5 text-white py-2 px-4 rounded-lg shadow-md transition-transform duration-300 ${
      isError ? "bg-red-600" : "bg-green-500"
    } translate-x-0`;
    setTimeout(() => {
      notification.className = notification.className.replace(
        "translate-x-0",
        "translate-x-[150%]"
      );
    }, 3000);
  };

  const statusBadges = {
    PENDING: "bg-yellow-100 text-yellow-800",
    PROCESSING: "bg-blue-100 text-blue-800",
    SHIPPED: "bg-indigo-100 text-indigo-800",
    DELIVERED: "bg-green-100 text-green-800",
    CANCELED: "bg-red-100 text-red-800",
  };

  // --- FUNGSI RENDER & FETCH ---
  const renderTable = (orders) => {
    tableBody.innerHTML = "";
    document.getElementById(
      "orders-count"
    ).textContent = `${orders.length} orders`;
    if (orders.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-gray-500">No orders found with current filters.</td></tr>`;
      return;
    }

    orders.forEach((order) => {
      const row = document.createElement("tr");
      row.className = "border-b hover:bg-gray-50";
      row.innerHTML = `
                <td class="p-3 text-sm font-medium text-gray-700">${order.order_uid.substring(
                  0,
                  15
                )}...</td>
                <td class="p-3 text-sm text-gray-600">${
                  order.customer_name
                }</td>
                <td class="p-3 text-sm text-gray-600">${
                  order.items_summary || "Custom Frame"
                }</td>
                <td class="p-3 text-sm font-semibold text-gray-800">${formatCurrency(
                  order.total_amount
                )}</td>
                <td class="p-3"><span class="badge ${
                  statusBadges[order.order_status] || ""
                }">${order.order_status}</span></td>
                <td class="p-3 text-sm text-gray-500">${formatDate(
                  order.created_at
                )}</td>
                <td class="p-3">
                    <button class="view-btn text-blue-500 hover:text-blue-700" data-id="${
                      order.id
                    }" title="View Details"><i class="ri-eye-line"></i></button>
                </td>
            `;
      tableBody.appendChild(row);
    });
  };

  const fetchOrders = async () => {
    // Bangun URL dengan parameter filter
    const params = new URLSearchParams();
    if (statusFilterEl.value) params.append("status", statusFilterEl.value);
    if (fromDateEl.value) params.append("fromDate", fromDateEl.value);
    if (toDateEl.value) params.append("toDate", toDateEl.value);
    if (searchInputEl.value) params.append("search", searchInputEl.value);

    const fullUrl = `${API_URL}?${params.toString()}`;

    try {
      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error("Failed to fetch orders");
      const orders = await response.json();
      allOrders = orders || [];
      renderTable(allOrders);
    } catch (error) {
      console.error(error);
      showNotification(error.message, true);
    }
  };

  // --- FUNGSI MODAL ---
  const openOrderModal = (orderId) => {
    const order = allOrders.find((o) => o.id === orderId);
    if (!order) return;

    currentEditingOrderId = order.id;
    document.getElementById(
      "orderModalTitle"
    ).textContent = `Order Detail #${order.order_uid}`;
    document.getElementById(
      "od-customer"
    ).innerHTML = `<strong>${order.customer_name}</strong><br>${order.customer_email}<br>${order.customer_phone}`;
    document.getElementById("od-address").textContent = order.shipping_address;
    document.getElementById(
      "od-meta"
    ).innerHTML = `<strong>Created:</strong> ${formatDate(
      order.created_at
    )}<br><strong>Payment:</strong> PAID`;
    document.getElementById("od-status").value = order.order_status;

    document.getElementById("od-items").innerHTML = `<div class="p-4 text-sm">${
      order.items_summary || "Custom Frame"
    }</div>`;
    document.getElementById("od-subtotal").textContent = formatCurrency(
      order.subtotal
    );
    document.getElementById("od-shipping").textContent = formatCurrency(
      order.shipping_cost
    );
    document.getElementById("od-total").textContent = formatCurrency(
      order.total_amount
    );

    orderModal.classList.add("active");
  };

  const closeOrderModal = () => {
    orderModal.classList.remove("active");
    currentEditingOrderId = null;
  };

  const saveOrderStatus = async () => {
    if (!currentEditingOrderId) return;

    saveStatusBtn.disabled = true;
    saveStatusBtn.textContent = "Saving...";

    const newStatus = document.getElementById("od-status").value;
    try {
      const response = await fetch(
        `${API_URL}/${currentEditingOrderId}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (!response.ok) throw new Error("Failed to update status");

      showNotification("Order status updated successfully!");
      await fetchOrders(); // Refresh data dari server
      closeOrderModal();
    } catch (error) {
      console.error(error);
      showNotification(error.message, true);
    } finally {
      saveStatusBtn.disabled = false;
      saveStatusBtn.textContent = "Save";
    }
  };

  // --- EVENT LISTENERS ---
  tableBody.addEventListener("click", (e) => {
    const viewBtn = e.target.closest(".view-btn");
    if (viewBtn) {
      const orderId = parseInt(viewBtn.dataset.id, 10);
      openOrderModal(orderId);
    }
  });

  closeOrderModalBtn.addEventListener("click", closeOrderModal);
  saveStatusBtn.addEventListener("click", saveOrderStatus);

  // Tambahkan event listener untuk filter
  [fromDateEl, toDateEl, statusFilterEl].forEach((el) => {
    el.addEventListener("change", fetchOrders);
  });
  // Debounce search input to avoid too many API calls
  let searchTimeout;
  searchInputEl.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(fetchOrders, 500); // Wait 500ms after user stops typing
  });

  // --- INITIAL LOAD ---
  fetchOrders();
});
