document.addEventListener("DOMContentLoaded", function () {
  // === Header & Navigasi ===
  const header = document.getElementById("main-header");
  const menuToggle = document.getElementById("menu-toggle");
  const navMenu = document.getElementById("site-nav");
  const navOverlay = document.getElementById("nav-overlay");

  // Scroll shadow
  if (header) {
    window.addEventListener("scroll", () => {
      header.classList.toggle("scrolled", window.scrollY > 50);
    });
  }

  // Hamburger toggle with overlay & aria
  function openMenu() {
    navMenu?.classList.add("active");
    navOverlay?.classList.add("active");
    document.body.style.overflow = "hidden";
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    navMenu?.classList.remove("active");
    navOverlay?.classList.remove("active");
    document.body.style.overflow = "";
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
  }

  if (menuToggle && navMenu) {
    menuToggle.addEventListener("click", () => {
      navMenu.classList.contains("active") ? closeMenu() : openMenu();
    });
  }

  // Close on overlay click
  navOverlay?.addEventListener("click", closeMenu);

  // Close on any link/button inside nav
  document.querySelectorAll(".nav-link, .btn-ar-nav, .btn-nav-custom, .mobile-nav-link").forEach((el) => {
    el.addEventListener("click", closeMenu);
  });

  // === Animasi Fade ===
  const fadeInObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          fadeInObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll(".fade-in-element").forEach((el) => {
    fadeInObserver.observe(el);
  });

  // === Slider ===
  const sliderWrapper = document.getElementById("slider-wrapper");
  const prevBtn = document.getElementById("prev-slide");
  const nextBtn = document.getElementById("next-slide");
  const dotsContainer = document.getElementById("slider-dots");

  async function initializeDynamicSlider() {
    if (!sliderWrapper || !prevBtn || !nextBtn || !dotsContainer) return;

    try {
      const response = await fetch("/api/slides");
      if (!response.ok) throw new Error("Gagal memuat data slider.");
      const slidesData = await response.json();

      if (!slidesData || slidesData.length === 0) {
        sliderWrapper.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-white"><p>Tidak ada gambar untuk ditampilkan.</p></div>`;
        return;
      }

      sliderWrapper.innerHTML = "";
      dotsContainer.innerHTML = "";

      slidesData.forEach((slideData) => {
        const slide = document.createElement("div");
        slide.className = "slider-slide";
        slide.style.cssText = "position:absolute; inset:0; width:100%; height:100%;";
        slide.innerHTML = `
          <picture style="display:block; width:100%; height:100%;">
            <source media="(max-width: 767px)" srcset="${slideData.mobileImageUrl || slideData.imageUrl}">
            <img src="${slideData.imageUrl}" alt="${slideData.altText || 'Citra Artframe Hero Slide'}" style="width:100%;height:100%;object-fit:cover;object-position:center;">
          </picture>
        `;
        sliderWrapper.appendChild(slide);
      });

      prevBtn.style.opacity = "1";
      nextBtn.style.opacity = "1";

      const slides = sliderWrapper.querySelectorAll(".slider-slide");
      let currentSlide = 0;
      let slideInterval;
      let touchStartX = null;
      let touchStartY = null;

      slides.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.className = "dot";
        dot.type = "button";
        dot.setAttribute("aria-label", `Tampilkan banner ${index + 1}`);
        dot.setAttribute("aria-current", "false");
        dot.addEventListener("click", () => {
          showSlide(index);
          resetInterval();
        });
        dotsContainer.appendChild(dot);
      });

      const dots = dotsContainer.querySelectorAll(".dot");

      function showSlide(index) {
        if (!slides.length) return;

        const normalizedIndex =
          ((index % slides.length) + slides.length) % slides.length;

        slides.forEach((slide, i) => {
          const isActive = i === normalizedIndex;
          slide.style.transform = `translateX(${(i - normalizedIndex) * 100}%)`;
          slide.classList.toggle("active", isActive);
          slide.setAttribute("aria-hidden", isActive ? "false" : "true");
        });

        dots.forEach((dot, i) => {
          const isActive = i === normalizedIndex;
          dot.classList.toggle("active", isActive);
          dot.setAttribute("aria-current", isActive ? "true" : "false");
        });

        currentSlide = normalizedIndex;
      }

      function nextSlide() {
        showSlide(currentSlide + 1);
      }
      function prevSlide() {
        showSlide(currentSlide - 1);
      }
      function resetInterval() {
        clearInterval(slideInterval);
        if (slides.length > 1 && !document.hidden) {
          slideInterval = setInterval(nextSlide, 5000);
        }
      }

      nextBtn.addEventListener("click", () => {
        nextSlide();
        resetInterval();
      });
      prevBtn.addEventListener("click", () => {
        prevSlide();
        resetInterval();
      });

      // Swipe horizontal pada ponsel juga harus memakai showSlide agar dot tetap sinkron.
      sliderWrapper.addEventListener(
        "touchstart",
        (event) => {
          const touch = event.changedTouches[0];
          touchStartX = touch.clientX;
          touchStartY = touch.clientY;
          clearInterval(slideInterval);
        },
        { passive: true }
      );

      sliderWrapper.addEventListener(
        "touchend",
        (event) => {
          if (touchStartX === null || touchStartY === null) return;

          const touch = event.changedTouches[0];
          const distanceX = touch.clientX - touchStartX;
          const distanceY = touch.clientY - touchStartY;
          const swipeThreshold = Math.max(45, sliderWrapper.clientWidth * 0.08);

          if (
            Math.abs(distanceX) >= swipeThreshold &&
            Math.abs(distanceX) > Math.abs(distanceY)
          ) {
            distanceX < 0 ? nextSlide() : prevSlide();
          }

          touchStartX = null;
          touchStartY = null;
          resetInterval();
        },
        { passive: true }
      );

      sliderWrapper.addEventListener("touchcancel", () => {
        touchStartX = null;
        touchStartY = null;
        resetInterval();
      });

      document.addEventListener("visibilitychange", () => {
        document.hidden ? clearInterval(slideInterval) : resetInterval();
      });

      const hasMultipleSlides = slides.length > 1;
      prevBtn.hidden = !hasMultipleSlides;
      nextBtn.hidden = !hasMultipleSlides;
      dotsContainer.hidden = !hasMultipleSlides;

      showSlide(0);
      resetInterval();
    } catch (error) {
      console.error("Error initializing slider:", error);
      sliderWrapper.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-white"><p>Terjadi kesalahan saat memuat gambar.</p></div>`;
    }
  }

  // === FETCH ===
  const framesGrid = document.getElementById("popular-frames-grid");

  async function initializePopularFrames() {
    if (!framesGrid) return;

    try {
      const response = await fetch("/api/products/popular");
      if (!response.ok) throw new Error("Gagal memuat data frame.");

      const framesData = ((await response.json()) || []).slice(0, 3);

      if (!framesData || framesData.length === 0) {
        framesGrid.innerHTML =
          '<p class="text-gray-500 col-span-full text-center">Belum ada frame populer.</p>';
        return;
      }

      framesGrid.innerHTML = "";

      framesData.forEach((frame, index) => {
        const frameCard = document.createElement("div");
        frameCard.className = "frame-card fade-in-element";
        frameCard.style.animationDelay = `${index * 0.1}s`;
        frameCard.innerHTML = `
        <div class="frame-image-container">
          <img src="${frame.image_url}" alt=" ${
          frame.name
        }" class="frame-raw-image">
        </div>
        <h3>${frame.name}</h3>
        <p>${frame.description || "&nbsp;"}</p>
      `;

        framesGrid.appendChild(frameCard);
        fadeInObserver.observe(frameCard);
      });
    } catch (error) {
      console.error("Error initializing popular frames:", error);
      framesGrid.innerHTML =
        '<p class="text-red-500 col-span-full text-center">Terjadi kesalahan saat memuat frame.</p>';
    }
  }

  // INISIALISASI
  initializeDynamicSlider();
  initializePopularFrames();
});
