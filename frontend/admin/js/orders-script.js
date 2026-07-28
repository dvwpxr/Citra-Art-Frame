document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "/api/admin/orders";

  const tableBody = document.getElementById("orders-table-body");
  const orderModal = document.getElementById("orderModal");
  const closeOrderModalBtn = document.getElementById("closeOrderModalBtn");
  const saveStatusBtn = document.getElementById("saveStatusBtn");
  const notification = document.getElementById("notification");
  const fromDateEl = document.getElementById("fromDate");
  const toDateEl = document.getElementById("toDate");
  const statusFilterEl = document.getElementById("statusFilter");
  const searchInputEl = document.getElementById("searchInput");

  let allOrders = [];
  let currentEditingOrderId = null;

  const formatCurrency = (amount) => `Rp ${amount.toLocaleString("id-ID")}`;
  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    
  const showNotification = (message, isError = false) => {
    notification.textContent = message;
    if(isError) {
        notification.classList.add("error");
    } else {
        notification.classList.remove("error");
    }
    notification.classList.add("show");
    setTimeout(() => {
      notification.classList.remove("show");
    }, 3000);
  };

  const statusBadges = {
    pending_payment: "badge-pending",
    awaiting_payment: "badge-pending",
    payment_failed: "badge-canceled",
    PENDING: "badge-pending",
    PROCESSING: "badge-processing",
    SHIPPED: "badge-shipped",
    DELIVERED: "badge-delivered",
    CANCELED: "badge-canceled",
  };

  const statusLabels = {
    pending_payment: "Menunggu Pembayaran",
    awaiting_payment: "Menunggu Pembayaran",
    payment_failed: "Pembayaran Gagal",
    PENDING: "Pending",
    PROCESSING: "Dikemas",
    SHIPPED: "Dikirim",
    DELIVERED: "Selesai",
    CANCELED: "Dibatalkan",
  };

  const renderTable = (orders) => {
    tableBody.innerHTML = "";
    document.getElementById("orders-count").textContent = `${orders.length} orders`;
    if (orders.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:rgba(255,255,255,0.25)">No orders found with current filters.</td></tr>`;
      return;
    }

    orders.forEach((order) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td style="font-weight:600;color:#c09553">#${order.order_uid.substring(0, 15)}...</td>
        <td>${order.customer_name}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${order.items_summary || "Custom Frame"}</td>
        <td style="font-weight:600">${formatCurrency(order.total_amount)}</td>
        <td><span class="badge ${statusBadges[order.order_status] || "badge-pending"}">${statusLabels[order.order_status] || order.order_status}</span></td>
        <td style="color:rgba(255,255,255,0.4);font-size:0.78rem">${formatDate(order.created_at)}</td>
        <td>
            <button class="btn-icon view view-btn" data-id="${order.id}" title="View Details"><i class="ri-eye-line"></i></button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  };

  const fetchOrders = async () => {
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

  const openOrderModal = async (orderId) => {
    const baseApi = "/api/admin/orders";
    try {
      const res = await fetch(`${baseApi}/${orderId}`);
      if (!res.ok) throw new Error("Failed to fetch order detail");
      const od = await res.json();

      currentEditingOrderId = od.id;

      document.getElementById("orderModalTitle").textContent = `Order Detail #${od.order_uid}`;
      document.getElementById("od-customer").innerHTML = `<strong>${od.customer_name}</strong><br>${od.customer_email}<br>${od.customer_phone}`;
      document.getElementById("od-address").textContent = od.shipping_address;

      const paidLike = ["PROCESSING", "SHIPPED", "DELIVERED"].includes(od.order_status);
      document.getElementById("od-meta").innerHTML = `<strong>Created:</strong> ${formatDate(od.created_at)}<br>
       <strong>Payment:</strong> ${paidLike ? "PAID" : "UNPAID"}`;

      document.getElementById("od-status").value = od.order_status;

      const itemsWrap = document.getElementById("od-items");
      itemsWrap.innerHTML = "";
      if (Array.isArray(od.items) && od.items.length) {
        od.items.forEach((it) => {
          let detailHtml = "";
          let itemImage = "";
          try {
            if (it.details) {
              const j = typeof it.details === "string" ? JSON.parse(it.details) : it.details;
              if (j && typeof j === "object") {
                const keyMap = {
                    hasGlass: "Kaca Akrilik",
                    matWidth: "Lebar Matboard",
                    artworkSize: "Ukuran Karya",
                    imageUrl: "Gambar Desain"
                };
                
                if(j.imageUrl) {
                    itemImage = j.imageUrl;
                }
                
                const lines = Object.entries(j).map(([k, v]) => {
                  if(k === "imageUrl") return "";
                  let displayKey = keyMap[k] || k;
                  let displayVal = v;
                  if(k === "hasGlass") displayVal = v ? "Ya" : "Tidak";
                  if(typeof v === "object") displayVal = JSON.stringify(v);
                  
                  return `<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-top:4px;border-bottom:1px dashed rgba(255,255,255,0.05);padding-bottom:2px">
                    <span style="color:rgba(255,255,255,0.4)">${displayKey}</span>
                    <span style="font-weight:500;text-align:right">${displayVal}</span>
                  </div>`;
                }).filter(Boolean);
                
                if(lines.length > 0) {
                  detailHtml = `<div style="margin-top:8px;background:rgba(0,0,0,0.2);padding:8px 12px;border-radius:6px">${lines.join("")}</div>`;
                }
              }
            }
          } catch (_) {}

          const div = document.createElement("div");
          div.className = "item-row";
          div.style.alignItems = "flex-start";
          div.style.gap = "16px";
          div.innerHTML = `
            <div style="display:flex;gap:12px;flex:1">
              ${itemImage ? `<img src="${itemImage}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.1)">` : `<div style="width:60px;height:60px;background:rgba(255,255,255,0.05);border-radius:6px;display:flex;align-items:center;justify-content:center"><i class="ri-image-2-line" style="color:rgba(255,255,255,0.2);font-size:1.5rem"></i></div>`}
              <div style="flex:1">
                <div class="item-name" style="font-size:0.95rem">${it.name}</div>
                <div class="item-meta" style="color:#c09553">${it.category || "Item"}</div>
                ${detailHtml}
              </div>
            </div>
            <div style="text-align:right;min-width:100px">
              <div style="font-size:0.8rem;color:rgba(255,255,255,0.5)">${it.quantity} &times; ${formatCurrency(it.price)}</div>
              <div style="font-weight:700;font-size:0.95rem;margin-top:4px;color:#fff">${formatCurrency(it.quantity * it.price)}</div>
            </div>
          `;
          itemsWrap.appendChild(div);
        });
      } else {
        itemsWrap.innerHTML = `<div style="padding:16px;color:rgba(255,255,255,0.5)">No items.</div>`;
      }

      document.getElementById("od-subtotal").textContent = formatCurrency(od.subtotal);
      
      const courierName = od.courier_name && od.courier_name.trim() !== "" ? od.courier_name.toUpperCase() : "Kurir Standar";
      const estimation = od.shipping_estimation ? ` (${od.shipping_estimation})` : "";
      document.getElementById("od-courier").textContent = `${courierName}${estimation}`;
      
      document.getElementById("od-shipping").textContent = formatCurrency(od.shipping_cost);
      document.getElementById("od-total").textContent = formatCurrency(od.total_amount);

      orderModal.classList.add("active");
    } catch (e) {
      console.error(e);
      showNotification(e.message, true);
    }
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
      const response = await fetch(`${API_URL}/${currentEditingOrderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error("Failed to update status");

      showNotification("Order status updated successfully!");
      await fetchOrders();
      closeOrderModal();
    } catch (error) {
      console.error(error);
      showNotification(error.message, true);
    } finally {
      saveStatusBtn.disabled = false;
      saveStatusBtn.textContent = "Save";
    }
  };

  tableBody.addEventListener("click", (e) => {
    const viewBtn = e.target.closest(".view-btn");
    if (viewBtn) {
      const orderId = parseInt(viewBtn.dataset.id, 10);
      openOrderModal(orderId);
    }
  });

  closeOrderModalBtn.addEventListener("click", closeOrderModal);
  saveStatusBtn.addEventListener("click", saveOrderStatus);

  [fromDateEl, toDateEl, statusFilterEl].forEach((el) => {
    el.addEventListener("change", fetchOrders);
  });
  let searchTimeout;
  searchInputEl.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(fetchOrders, 500);
  });

  fetchOrders();
});
