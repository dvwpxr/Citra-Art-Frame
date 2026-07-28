import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageNames = [
  "index",
  "prints",
  "products",
  "print-detail",
  "custom-frame",
  "cart",
  "checkout",
  "account",
  "invoice",
  "ar",
  "framing",
];

const pages = Object.fromEntries(
  pageNames.map((name) => [
    name,
    readFileSync(new URL(`../pages/${name}.html`, import.meta.url), "utf8"),
  ]),
);

test("all customer pages declare a responsive viewport and load the final responsive layer", () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0/,
      `${name} must declare the responsive viewport`);
    assert.match(html, /\/assets\/css\/device-responsive\.css/,
      `${name} must load device-responsive.css last`);
  }
});

test("pages with the shared public navbar load its interaction script", () => {
  for (const name of ["index", "prints", "products", "print-detail", "custom-frame", "cart", "framing"]) {
    assert.match(pages[name], /class="[^"]*site-page/);
    assert.match(pages[name], /id="menu-toggle"/);
    assert.match(pages[name], /\/assets\/js\/script\.js/);
  }
});

test("cart uses the same unforced navbar state as the public pages", () => {
  assert.match(pages.cart, /<header class="header" id="main-header">/);
  assert.doesNotMatch(pages.cart, /<header class="header scrolled" id="main-header">/);
  assert.match(pages.cart, /Pesanan Saya/);
  assert.match(pages.cart, /Belanja Bingkai/);
  assert.match(pages.cart, /Custom Frame/);
});

test("responsive layer covers phone, tablet, laptop, and short landscape screens", () => {
  const css = readFileSync(new URL("../assets/css/device-responsive.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.match(css, /@media \(min-width: 1025px\) and \(max-width: 1240px\)/);
  assert.match(css, /orientation: landscape/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("mobile checkout summary stays compact instead of stretching from top to bottom", () => {
  const checkoutCss = readFileSync(new URL("../assets/css/checkout.css", import.meta.url), "utf8");
  const mobileCheckout = checkoutCss.match(/@media \(max-width: 576px\) \{[\s\S]*$/)?.[0] ?? "";

  assert.match(mobileCheckout, /\.checkout-right \.checkout-card \{[\s\S]*?position: fixed;/);
  assert.match(mobileCheckout, /top: auto;/,
    "the old sticky top offset must be cleared when the summary becomes fixed");
  assert.match(mobileCheckout, /height: auto;/);
  assert.match(mobileCheckout, /max-width: 100vw;/);
  assert.match(mobileCheckout, /grid-template-columns: minmax\(0, 1fr\) auto;/,
    "the total label must shrink while the amount remains readable");
  assert.match(checkoutCss, /box-sizing: border-box;/,
    "100% wide checkout containers must include their padding in the viewport width");
});

test("checkout shipping handles rate limits without reporting a false empty result", () => {
  const checkoutJs = readFileSync(new URL("../assets/js/checkout.js", import.meta.url), "utf8");

  assert.match(checkoutJs, /authFetch\(requestURL\)/,
    "shipping quotes must use the authenticated, quota-protected endpoint");
  assert.match(checkoutJs, /if \(!response\.ok\)/,
    "non-2xx provider responses must not be parsed as shipping options");
  assert.match(checkoutJs, /SHIPPING_RATE_LIMITED/);
  assert.match(checkoutJs, /filterAllowedShippingOptions/);
  assert.match(checkoutJs, /identity\.startsWith\("jne"\)/);
  assert.match(checkoutJs, /identity\.startsWith\("jnt"\)/);
  assert.match(checkoutJs, /identity\.startsWith\("lionparcel"\)/);
  assert.match(checkoutJs, /retryShippingBtn/);
  assert.match(checkoutJs, /sessionStorage\.setItem\(SHIPPING_CACHE_PREFIX/,
    "successful quotes should be reused while the checkout tab remains open");
  assert.match(checkoutJs, /shipping-estimate-notice/,
    "development fallback rates must be clearly identified as estimates");
  assert.doesNotMatch(checkoutJs, /\[data\]\);/,
    "an API error object must never be wrapped as a fake shipping option");
});

test("popular frames stay compact and proportional on phone screens", () => {
  const css = readFileSync(new URL("../assets/css/device-responsive.css", import.meta.url), "utf8");

  assert.match(css, /\.page-home \.frame-image-container \{[\s\S]*?aspect-ratio: 4 \/ 3;/);
  assert.match(css, /\.page-home \.frames-grid \{[\s\S]*?scroll-snap-type: x mandatory;/);
  assert.match(css, /\.page-home \.frame-card \{[\s\S]*?flex: 0 0 min\(78vw, 300px\);/);
  assert.match(css, /\.page-home \.frame-image-container \{[\s\S]*?height: 230px !important;/);
  assert.match(css, /padding: clamp\(10px, 1\.2vw, 14px\) !important;/,
    "desktop images should use more of each popular-frame card");
  assert.match(css, /height: 230px !important;[\s\S]*?padding: 8px !important;/,
    "phone images should be slightly more prominent without enlarging the whole card");
  assert.doesNotMatch(css, /\.page-home \.frame-image-container \{[\s\S]*?aspect-ratio: 1 \/ 1;/);
});

test("hero slider keeps the active dot synchronized for buttons, auto-slide, and swipe", () => {
  const script = readFileSync(new URL("../assets/js/script.js", import.meta.url), "utf8");
  const baseCss = readFileSync(new URL("../assets/css/base.css", import.meta.url), "utf8");

  assert.match(script, /dotsContainer\.querySelectorAll\("\.dot"\)/,
    "hero dots must be scoped to their own slider");
  assert.match(script, /dot\.classList\.toggle\("active", isActive\)/);
  assert.match(script, /dot\.setAttribute\("aria-current", isActive \? "true" : "false"\)/);
  assert.match(script, /sliderWrapper\.addEventListener\([\s\S]*?"touchstart"/);
  assert.match(script, /sliderWrapper\.addEventListener\([\s\S]*?"touchend"/);
  assert.match(baseCss, /#slider-dots \.dot\.active,[\s\S]*?width: 20px;/,
    "the active state must remain visually distinguishable without Tailwind runtime classes");
});

test("custom frame preview preserves its artwork ratio after browser zoom or resize", () => {
  const frameBuilder = readFileSync(new URL("../assets/js/frame-builder.js", import.meta.url), "utf8");
  const responsiveCss = readFileSync(new URL("../assets/css/device-responsive.css", import.meta.url), "utf8");

  assert.match(frameBuilder, /calculateContainedPreviewSize/);
  assert.match(frameBuilder, /state\.artworkWidth \/ state\.artworkHeight/);
  assert.match(frameBuilder, /style\.aspectRatio = `\$\{previewSize\.width\} \/ \$\{previewSize\.height\}`/);
  assert.match(frameBuilder, /window\.addEventListener\("resize", resizePreview/);
  assert.match(frameBuilder, /visualViewport\?\.addEventListener\("resize", resizePreview/);
  assert.match(responsiveCss, /\.page-custom #framePreviewWrapper \{[\s\S]*?max-height: none !important;[\s\S]*?aspect-ratio: var\(--frame-preview-ratio, 1 \/ 1\);/);
});

test("custom artwork stays inside the visible frame opening", () => {
  const frameBuilder = readFileSync(new URL("../assets/js/frame-builder.js", import.meta.url), "utf8");
  const responsiveCss = readFileSync(new URL("../assets/css/device-responsive.css", import.meta.url), "utf8");
  const adminScript = readFileSync(new URL("../admin/js/admin-script.js", import.meta.url), "utf8");

  assert.match(frameBuilder, /p\.border_slice \?\? p\.border_image_slice/,
    "the builder must read the border_slice field returned by the product API");
  assert.match(frameBuilder, /top: `\$\{top\}%`,[\s\S]*?right: `\$\{right\}%`,[\s\S]*?bottom: `\$\{bottom\}%`,[\s\S]*?left: `\$\{left\}%`/,
    "each frame must use its own four calibrated canvas insets");
  assert.match(responsiveCss, /\.page-custom #frameElement::after \{[\s\S]*?border-image-slice: var\(--frame-border-slice, 80\);[\s\S]*?border-image-width: 1;/,
    "the calibrated frame texture must render above the artwork without bleeding into it");
  assert.match(frameBuilder, /class="artwork-image"/);
  assert.doesNotMatch(frameBuilder, /object-fit:cover/);
  assert.match(responsiveCss, /\.page-custom #framePreviewWrapper \{[\s\S]*?padding: 0 !important;/,
    "wrapper padding must not alter a portrait artwork ratio");
  assert.match(responsiveCss, /\.page-custom #artworkContainer img \{[\s\S]*?object-fit: contain !important;/);
  for (const field of ["border_slice", "inset_top", "inset_right", "inset_bottom", "inset_left"]) {
    assert.match(adminScript, new RegExp(`getElementById\\("${field}"\\)\\.value`),
      `the admin edit form must preserve ${field}`);
  }
});

test("custom frame cart previews remain fully visible and deletion is touch friendly", () => {
  const cartCss = readFileSync(new URL("../assets/css/cart.css", import.meta.url), "utf8");

  assert.match(pages.cart, /cart-item-image--custom/);
  assert.match(pages.cart, /aria-label="Hapus \$\{item\.name\} dari keranjang"/);
  assert.match(cartCss, /\.cart-item-image--custom img \{[\s\S]*?object-fit: contain;/);
  assert.match(cartCss, /\.cart-item-remove \{[\s\S]*?width: 40px;[\s\S]*?height: 40px;/);
  assert.match(cartCss, /@media \(max-width: 576px\) \{[\s\S]*?\.cart-item-remove \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
});

test("account header uses the same restrained Citra Artframe identity", () => {
  const accountCss = readFileSync(new URL("../assets/css/account.css", import.meta.url), "utf8");

  assert.match(pages.account, /class="page-header-inner"/);
  assert.match(pages.account, />CITRA ARTFRAME<\/a>/);
  assert.match(pages.account, /<span>Beranda<\/span>/);
  assert.match(accountCss, /\.page-header \.logo \{[\s\S]*?color: #171717;/);
});

test("address modal hides the account sidebar instead of stacking it above the form", () => {
  const accountCss = readFileSync(new URL("../assets/css/account.css", import.meta.url), "utf8");

  assert.match(pages.account, /document\.body\.classList\.add\("address-modal-open"\)/);
  assert.match(pages.account, /document\.body\.classList\.remove\("address-modal-open"\)/);
  assert.match(accountCss, /body\.address-modal-open > main\.container[\s\S]*?visibility: hidden !important;/);
  assert.match(accountCss, /z-index: 2147483000;/);
});

test("invoice uses mobile cards and offers a direct PDF download", () => {
  const responsiveCss = readFileSync(new URL("../assets/css/device-responsive.css", import.meta.url), "utf8");
  const invoiceJs = readFileSync(new URL("../assets/js/invoice.js", import.meta.url), "utf8");

  assert.match(pages.invoice, /id="downloadInvoicePdf"/);
  assert.match(pages.invoice, /Simpan Invoice PDF/);
  assert.match(pages.invoice, /\.actions \.btn \{[\s\S]*?min-height: 52px !important;/);
  assert.match(pages.invoice, /tbody td::before[\s\S]*?content: attr\(data-label\)/);
  assert.match(invoiceJs, /new Blob\(\[pdf\], \{ type: "application\/pdf" \}\)/);
  assert.match(invoiceJs, /link\.download = `Invoice-/);
  assert.match(invoiceJs, /data-label="Kuantitas"/);
  assert.doesNotMatch(responsiveCss, /\.page-invoice table \{\s*min-width: 620px;/);
});
