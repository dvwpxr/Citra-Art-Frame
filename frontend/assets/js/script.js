document.addEventListener("DOMContentLoaded", function () {
  // --- KODE UNTUK HAMBURGER MENU ---
  // (Pindahkan semua logika hamburger menu ke satu tempat yang bersih)
  const headerContainer = document.querySelector(".header .container");
  const navActions = document.querySelector(".nav-actions");
  const mobileMenuToggle = document.querySelector(".mobile-menu-toggle");
  const navMenu = document.querySelector(".nav-menu");
  const siteNav = document.getElementById("site-nav");

  if (mobileMenuToggle && siteNav) {
    mobileMenuToggle.addEventListener("click", () => {
      const isExpanded =
        mobileMenuToggle.getAttribute("aria-expanded") === "true";
      mobileMenuToggle.setAttribute("aria-expanded", !isExpanded);
      siteNav.classList.toggle("active"); // Anda mungkin perlu menambahkan class 'active' di CSS
    });
  }
  const header = document.querySelector(".header");
  if (header) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 50) {
        header.classList.add("sticky");
      } else {
        header.classList.remove("sticky");
      }
    });
  }

  if (mobileMenuToggle && navMenu) {
    mobileMenuToggle.addEventListener("click", function () {
      navMenu.classList.toggle("active");
    });
  }
  // --- AKHIR DARI KODE HAMBURGER MENU ---

  // Fungsi untuk mengambil dan menampilkan Art Prints
  function loadArtPrints() {
    const container = document.getElementById("prints-grid-container");
    if (!container) return; // Hanya jalankan jika container ada di halaman ini

    // (Logika fetch art prints Anda di sini... tidak ada yang salah)
  }

  // Fungsi untuk mengambil dan menampilkan Products
  function loadProducts() {
    const container = document.getElementById("products-grid-container");
    if (!container) {
      return;
    }
    // (Logika fetch products Anda di sini... tidak ada yang salah)
    fetch("/api/products")
      .then((response) => {
        if (!response.ok)
          throw new Error("Gagal mengambil data produk dari server");
        return response.json();
      })
      .then((products) => {
        container.innerHTML = "";
        if (!products || products.length === 0) {
          container.innerHTML = "<p>Belum ada produk yang tersedia.</p>";
          return;
        }
        products.forEach((product) => {
          const card = document.createElement("div");
          card.className = "product-card";
          const imageUrl =
            product.image ||
            `https://via.placeholder.com/300x200?text=${product.name}`;
          card.innerHTML = `
              <div class="product-image">
                  <img src="${imageUrl}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
              <div class="product-info">
                  <h3>${product.name}</h3>
                  <p class="product-type">${product.description}</p>
              </div>
          `;
          container.appendChild(card);
        });
      })
      .catch((error) => {
        console.error("Error fetching products:", error);
        container.innerHTML = "<p>Terjadi kesalahan saat memuat produk.</p>";
      });
  }

  // Panggil fungsi-fungsi di atas untuk memuat data
  loadArtPrints();
  loadProducts();

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (href && href !== "#") {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
    });
  });

  // Frame showcase carousel functionality
  const frameShowcase = document.querySelector(".frame-showcase");
  const frameItems = document.querySelectorAll(".frame-item");
  let currentIndex = 0;

  // Auto-rotate frames every 3 seconds
  setInterval(() => {
    frameItems.forEach((item, index) => {
      item.style.transform = `translateX(${
        (index - currentIndex) * 140
      }px) scale(${index === currentIndex ? 1.1 : 1})`;
      item.style.zIndex = index === currentIndex ? 10 : 1;
    });
    currentIndex = (currentIndex + 1) % frameItems.length;
  }, 3000);

  // Video placeholder click functionality
  const videoPlaceholder = document.querySelector(".video-placeholder");
  if (videoPlaceholder) {
    videoPlaceholder.addEventListener("click", function () {
      // Simulate video play (in real implementation, this would open a video modal)
      this.style.background = "#000";
      this.innerHTML = '<p style="color: white;">Video would play here</p>';
    });
  }

  // Button click animations
  document.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", function (e) {
      // Create ripple effect
      const ripple = document.createElement("span");
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left = x + "px";
      ripple.style.top = y + "px";
      ripple.style.position = "absolute";
      ripple.style.borderRadius = "50%";
      ripple.style.background = "rgba(255,255,255,0.3)";
      ripple.style.transform = "scale(0)";
      ripple.style.animation = "ripple 0.6s linear";
      ripple.style.pointerEvents = "none";

      this.style.position = "relative";
      this.style.overflow = "hidden";
      this.appendChild(ripple);

      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });

  // Scroll animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
      }
    });
  }, observerOptions);

  // Observe elements for scroll animations
  document
    .querySelectorAll(".frame-card, .feature, .service-card")
    .forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(30px)";
      el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
      observer.observe(el);
    });

  // Header scroll effect
  let lastScrollTop = 0;
  window.addEventListener("scroll", function () {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    if (scrollTop > lastScrollTop && scrollTop > 100) {
      // Scrolling down
      header.style.transform = "translateY(-100%)";
    } else {
      // Scrolling up
      header.style.transform = "translateY(0)";
    }

    // Add shadow when scrolled
    if (scrollTop > 10) {
      header.style.boxShadow = "0 2px 20px rgba(0,0,0,0.15)";
    } else {
      header.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
    }

    lastScrollTop = scrollTop;
  });

  // Form validation for contact forms (if any)
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Basic validation
      const inputs = this.querySelectorAll(
        "input[required], textarea[required]"
      );
      let isValid = true;

      inputs.forEach((input) => {
        if (!input.value.trim()) {
          input.style.borderColor = "#ff4444";
          isValid = false;
        } else {
          input.style.borderColor = "#ddd";
        }
      });

      if (isValid) {
        // Simulate form submission
        alert("Thank you for your message! We will get back to you soon.");
        this.reset();
      }
    });
  });

  // Lazy loading for images
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          observer.unobserve(img);
        }
      }
    });
  });

  document.querySelectorAll("img[data-src]").forEach((img) => {
    imageObserver.observe(img);
  });

  // WhatsApp chat simulation
  document.querySelectorAll(".contact-icon").forEach((icon) => {
    icon.addEventListener("click", function (e) {
      e.preventDefault();
      if (this.textContent === "📱") {
        alert("WhatsApp chat would open here in a real implementation");
      } else if (this.textContent === "✉") {
        alert("Email client would open here");
      } else if (this.textContent === "📷") {
        alert("Instagram would open here");
      }
    });
  });

  // Service card interactions
  document.querySelectorAll(".service-card").forEach((card) => {
    card.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-10px)";
      this.style.boxShadow = "0 20px 40px rgba(0,0,0,0.1)";
    });

    card.addEventListener("mouseleave", function () {
      this.style.transform = "translateY(0)";
      this.style.boxShadow = "none";
    });
  });

  // Frame card hover effects
  document.querySelectorAll(".frame-card").forEach((card) => {
    card.addEventListener("mouseenter", function () {
      const frameImage = this.querySelector(".frame-border");
      frameImage.style.transform = "scale(1.05) rotateY(5deg)";
    });

    card.addEventListener("mouseleave", function () {
      const frameImage = this.querySelector(".frame-border");
      frameImage.style.transform = "scale(1) rotateY(0deg)";
    });
  });
});

// Add CSS for ripple animation
const style = document.createElement("style");
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    .mobile-toggle {
        display: none !important;
    }
    
    @media (max-width: 768px) {
        .mobile-toggle {
            display: block !important;
        }
        
        .nav-menu {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            flex-direction: column;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .nav-menu.mobile-active {
            display: flex;
        }
        
        .header {
            transition: transform 0.3s ease;
        }
    }
    
    .service-card {
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    
    .frame-border {
        transition: transform 0.3s ease;
    }
`;
document.head.appendChild(style);

// BACKEND GOLANG

/**
 * Fungsi untuk mengupdate data produk.
 * @param {string} productId - ID dari produk yang akan diupdate.
 * @param {object} updatedData - Objek berisi data baru untuk produk.
 * Contoh: { name: "New Product Name", description: "New Desc" }
 */
function updateProduct(productId, updatedData) {
  fetch(`/api/products/${productId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updatedData),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      console.log("Produk berhasil diupdate:", data);
      alert("Produk berhasil diupdate!");
    })
    .catch((error) => {
      console.error("Error updating product:", error);
      alert("Gagal mengupdate produk.");
    });
}

// ===== KODE BARU UNTUK SLIDESHOW (DENGAN NAVIGASI) ===== //

// Cek dulu apakah ada elemen slideshow di halaman ini
const slideshowElement = document.querySelector(".slideshow-container");
if (slideshowElement) {
  let slideIndex = 1;
  let slideTimer;

  showSlides(slideIndex);

  // Fungsi plusSlides(n) dan showSlides(n) tetap berada di dalam blok 'if' ini
  function plusSlides(n) {
    showSlides((slideIndex += n));
  }

  function showSlides(n) {
    clearTimeout(slideTimer);
    let i;
    let slides = document.getElementsByClassName("slide");
    if (n > slides.length) {
      slideIndex = 1;
    }
    if (n < 1) {
      slideIndex = slides.length;
    }
    for (i = 0; i < slides.length; i++) {
      slides[i].style.display = "none";
    }
    slides[slideIndex - 1].style.display = "block";
    slideTimer = setTimeout(function () {
      plusSlides(1);
    }, 5000);
  }
}
