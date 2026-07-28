const API = "/api";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBbKW8bjdh8J4k7ZJNh0z1bV6YBMWPlNHE",
  authDomain: "citraartframe-13ab5.firebaseapp.com",
  projectId: "citraartframe-13ab5",
  storageBucket: "citraartframe-13ab5.firebasestorage.app",
  messagingSenderId: "96864426754",
  appId: "1:96864426754:web:202e3c6a4e6c58771bc01b",
};

function fmtCurrency(val) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);
}

function fmtDate(ds) {
  if (!ds) return "-";
  const d = new Date(ds);
  return d.toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const statusLabels = {
  pending_payment: "MENUNGGU PEMBAYARAN",
  awaiting_payment: "MENUNGGU PEMBAYARAN",
  payment_failed: "PEMBAYARAN GAGAL",
  PENDING: "BELUM BAYAR",
  PROCESSING: "DIPROSES",
  SHIPPED: "DIKIRIM",
  DELIVERED: "SELESAI",
  CANCELED: "DIBATALKAN"
};

let loadedInvoiceData = null;

async function currentFirebaseUser() {
  const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
  const auth = getAuth(app);
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function authFetch(url, options = {}) {
  const user = await currentFirebaseUser();
  const token = await user?.getIdToken();
  if (!token) throw new Error("Login diperlukan untuk melihat invoice.");

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

async function loadInvoice() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("id");
  if (!orderId) {
    document.getElementById("loadingState").innerHTML = "ID Pesanan tidak ditemukan.";
    return;
  }

  try {
    const res = await authFetch(`${API}/orders/${orderId}`);
    if (!res.ok) throw new Error("Gagal mengambil data pesanan.");
    const data = await res.json();

    renderInvoice(data);
  } catch (err) {
    document.getElementById("loadingState").innerHTML = "Terjadi kesalahan saat memuat invoice.";
    console.error(err);
  }
}

function renderInvoice(data) {
  loadedInvoiceData = data;
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("invoiceContent").style.display = "block";

  // Header
  document.getElementById("invOrderUid").textContent = `Pesanan #${data.order_uid || data.id}`;
  document.getElementById("invDate").textContent = `Tanggal: ${fmtDate(data.created_at)}`;
  
  const st = data.order_status || "PENDING";
  const stEl = document.getElementById("invStatus");
  stEl.textContent = statusLabels[st] || st;
  stEl.className = `status-badge status-${st}`;

  // Billing
  document.getElementById("invCustName").textContent = data.customer_name || "-";
  document.getElementById("invCustEmail").textContent = data.customer_email || "-";
  document.getElementById("invCustPhone").textContent = data.customer_phone || "-";

  // Shipping
  document.getElementById("invRecName").textContent = data.receiver_name || data.customer_name || "-";
  document.getElementById("invRecPhone").textContent = data.phone || data.customer_phone || "-";
  document.getElementById("invFullAddress").textContent = data.full_address || data.shipping_address || "-";
  
  let courierText = data.courier_name ? `Ekspedisi: ${data.courier_name}` : "Ekspedisi: -";
  if (data.weight) courierText += ` (${data.weight} kg)`;
  document.getElementById("invCourier").textContent = courierText;

  // Items
  const tbody = document.getElementById("invItems");
  tbody.innerHTML = "";
  if (data.items && data.items.length > 0) {
    data.items.forEach(it => {
      let detailsHTML = "";
      if (it.details) {
        if (it.details.artworkSize) detailsHTML += `<span>Ukuran: ${it.details.artworkSize}</span>`;
        if (it.details.artist) detailsHTML += `<span>Seniman: ${it.details.artist}</span>`;
        if (it.details.size) detailsHTML += `<span>Ukuran: ${it.details.size}</span>`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="item-details" data-label="Item">
          <strong>${it.name || "Item"}</strong>
          <span>${it.category || ""}</span>
          ${detailsHTML}
        </td>
        <td data-label="Kuantitas" style="text-align:center;">${it.quantity}</td>
        <td data-label="Harga" style="text-align:right;">${fmtCurrency(it.price)}</td>
        <td data-label="Total" style="text-align:right; font-weight:500;">${fmtCurrency(it.price * it.quantity)}</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    tbody.innerHTML = `<tr class="invoice-empty-row"><td colspan="4" style="text-align:center;color:#999;">Tidak ada detail item</td></tr>`;
  }

  // Totals
  document.getElementById("invSubtotal").textContent = fmtCurrency(data.subtotal);
  document.getElementById("invShipping").textContent = fmtCurrency(data.shipping_cost);
  document.getElementById("invTotal").textContent = fmtCurrency(data.total_amount);
}

function pdfSafe(value) {
  return String(value ?? "-")
    .replace(/×/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/\u00a0/g, " ")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createInvoicePdf(data) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 44;
  const pages = [];
  let commands = [];
  let cursor = margin;

  const yFromTop = (top) => pageHeight - top;
  const addText = (value, x, top, size = 10, bold = false, color = "0.10 0.13 0.18") => {
    commands.push(`${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${yFromTop(top)} Tm (${pdfSafe(value)}) Tj ET`);
  };
  const addLine = (x1, top1, x2, top2, color = "0.88 0.89 0.91", width = 1) => {
    commands.push(`${color} RG ${width} w ${x1} ${yFromTop(top1)} m ${x2} ${yFromTop(top2)} l S`);
  };
  const wrap = (value, maxWidth, size = 10) => {
    const words = pdfSafe(value).split(/\s+/).filter(Boolean);
    const maxChars = Math.max(8, Math.floor(maxWidth / (size * 0.52)));
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const chunks = word.match(new RegExp(`.{1,${maxChars}}`, "g")) || [word];
      chunks.forEach((chunk) => {
        const candidate = line ? `${line} ${chunk}` : chunk;
        if (candidate.length > maxChars && line) {
          lines.push(line);
          line = chunk;
        } else {
          line = candidate;
        }
      });
    });
    if (line) lines.push(line);
    return lines.length ? lines : ["-"];
  };
  const addWrapped = (value, x, top, maxWidth, size = 10, bold = false, lineHeight = 14) => {
    const lines = wrap(value, maxWidth, size);
    lines.forEach((line, index) => addText(line, x, top + (index * lineHeight), size, bold));
    return top + (lines.length * lineHeight);
  };

  const orderUid = data.order_uid || data.id || "ORDER";
  const startPage = (continued = false) => {
    if (commands.length) pages.push(commands.join("\n"));
    commands = [];
    cursor = margin;
    addText("CITRA ARTFRAME", margin, cursor + 12, 18, true, "0 0 0");
    addText(continued ? "INVOICE - LANJUTAN" : "INVOICE", 410, cursor + 12, continued ? 12 : 19, true);
    addText(`Pesanan #${orderUid}`, 365, cursor + 32, 9, false, "0.42 0.45 0.50");
    addLine(margin, cursor + 48, pageWidth - margin, cursor + 48, "0.86 0.87 0.89", 1.2);
    cursor += 72;
  };
  const ensureSpace = (height) => {
    if (cursor + height > pageHeight - margin) startPage(true);
  };

  startPage(false);
  addText(`Tanggal: ${fmtDate(data.created_at)}`, margin, cursor, 9, false, "0.42 0.45 0.50");
  addText(statusLabels[data.order_status || "PENDING"] || data.order_status || "PENDING", 410, cursor, 9, true, "0.15 0.39 0.85");
  cursor += 32;

  addText("DITAGIHKAN KEPADA", margin, cursor, 10, true, "0.42 0.45 0.50");
  addText("INFORMASI PENGIRIMAN", 305, cursor, 10, true, "0.42 0.45 0.50");
  const billingBottom = addWrapped(
    [data.customer_name, data.customer_email, data.customer_phone].filter(Boolean).join(" | ") || "-",
    margin,
    cursor + 20,
    225,
    10,
    false,
    15
  );
  const shippingBottom = addWrapped(
    [data.receiver_name || data.customer_name, data.phone || data.customer_phone, data.full_address || data.shipping_address].filter(Boolean).join(" | ") || "-",
    305,
    cursor + 20,
    246,
    10,
    false,
    15
  );
  cursor = Math.max(billingBottom, shippingBottom) + 18;
  addText(`Ekspedisi: ${data.courier_name || "-"}${data.weight ? ` (${data.weight} kg)` : ""}`, 305, cursor, 9, false, "0.42 0.45 0.50");
  cursor += 30;
  addLine(margin, cursor, pageWidth - margin, cursor);
  cursor += 24;

  addText("ITEM PESANAN", margin, cursor, 11, true);
  cursor += 18;
  (data.items || []).forEach((item, index) => {
    const detailParts = [item.category];
    if (item.details?.artworkSize) detailParts.push(`Ukuran: ${item.details.artworkSize}`);
    if (item.details?.artist) detailParts.push(`Seniman: ${item.details.artist}`);
    if (item.details?.size) detailParts.push(`Ukuran: ${item.details.size}`);
    const nameLines = wrap(`${index + 1}. ${item.name || "Item"}`, 285, 10);
    const detailLines = wrap(detailParts.filter(Boolean).join(" | ") || "-", 285, 8);
    const rowHeight = Math.max(54, 18 + (nameLines.length * 13) + (detailLines.length * 11));
    ensureSpace(rowHeight + 8);
    nameLines.forEach((line, lineIndex) => addText(line, margin, cursor + (lineIndex * 13), 10, true));
    const detailTop = cursor + (nameLines.length * 13) + 3;
    detailLines.forEach((line, lineIndex) => addText(line, margin, detailTop + (lineIndex * 11), 8, false, "0.42 0.45 0.50"));
    addText(`Qty ${Number(item.quantity || 0)}`, 365, cursor, 9, false, "0.42 0.45 0.50");
    addText(fmtCurrency(Number(item.price || 0) * Number(item.quantity || 0)), 445, cursor, 10, true);
    cursor += rowHeight;
    addLine(margin, cursor, pageWidth - margin, cursor);
    cursor += 12;
  });

  ensureSpace(122);
  cursor += 8;
  const totalX = 330;
  addText("Subtotal", totalX, cursor, 10);
  addText(fmtCurrency(data.subtotal || 0), 455, cursor, 10, true);
  cursor += 22;
  addText("Ongkos Kirim", totalX, cursor, 10);
  addText(fmtCurrency(data.shipping_cost || 0), 455, cursor, 10, true);
  cursor += 18;
  addLine(totalX, cursor, pageWidth - margin, cursor, "0.72 0.56 0.36", 1.2);
  cursor += 24;
  addText("Total Pembayaran", totalX, cursor, 11, true, "0.72 0.56 0.36");
  addText(fmtCurrency(data.total_amount || 0), 445, cursor, 12, true, "0.72 0.56 0.36");
  cursor += 45;
  addText("Terima kasih telah berbelanja di Citra Artframe.", margin, cursor, 9, false, "0.42 0.45 0.50");
  pages.push(commands.join("\n"));

  const objects = [];
  const pageIds = pages.map((_, index) => 5 + (index * 2));
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((content, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = new TextEncoder().encode(pdf).length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Invoice-${String(orderUid).replace(/[^a-z0-9_-]/gi, "-")}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return blob;
}

document.addEventListener("DOMContentLoaded", () => {
  loadInvoice();
  document.getElementById("downloadInvoicePdf")?.addEventListener("click", () => {
    if (!loadedInvoiceData) return;
    createInvoicePdf(loadedInvoiceData);
  });
});
