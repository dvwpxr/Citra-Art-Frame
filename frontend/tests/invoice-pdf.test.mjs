import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("invoice PDF generator creates a downloadable vector PDF", async () => {
  const source = readFileSync(new URL("../assets/js/invoice.js", import.meta.url), "utf8");
  let capturedBlob = null;
  let clicked = false;

  const context = {
    Blob,
    TextEncoder,
    Intl,
    console,
    setTimeout: () => 0,
    URL: {
      createObjectURL(blob) {
        capturedBlob = blob;
        return "blob:invoice-test";
      },
      revokeObjectURL() {},
    },
    document: {
      addEventListener() {},
      createElement() {
        return {
          href: "",
          download: "",
          click() { clicked = true; },
          remove() {},
        };
      },
      body: { appendChild() {} },
    },
  };

  vm.runInNewContext(source, context, { filename: "invoice.js" });
  const blob = context.createInvoicePdf({
    id: 42,
    order_uid: "TEST-42",
    created_at: "2026-07-22T04:46:00Z",
    order_status: "PROCESSING",
    customer_name: "Pila",
    customer_email: "pila@example.com",
    customer_phone: "085180904344",
    receiver_name: "Pila",
    phone: "085180904344",
    full_address: "Universitas Esa Unggul, Kebon Jeruk, Jakarta Barat",
    courier_name: "JNE Cargo",
    weight: 1.65,
    subtotal: 299600,
    shipping_cost: 40000,
    total_amount: 339600,
    items: [{
      name: "Arcalod Gold",
      category: "Custom Frame",
      quantity: 1,
      price: 299600,
      details: { artworkSize: "50x50 cm" },
    }],
  });

  assert.equal(blob.type, "application/pdf");
  assert.equal(capturedBlob, blob);
  assert.equal(clicked, true);

  const pdf = await blob.text();
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/Type \/Catalog/);
  assert.match(pdf, /\/BaseFont \/Helvetica-Bold/);
  assert.match(pdf, /CITRA ARTFRAME/);
  assert.match(pdf, /Arcalod Gold/);
  assert.match(pdf, /xref\n0 \d+/);
  assert.match(pdf, /%%EOF$/);
});
