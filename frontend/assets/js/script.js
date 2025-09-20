document.addEventListener("DOMContentLoaded", function () {
  // === Header & Navigasi ===
  const header = document.getElementById("main-header");
  const menuToggle = document.getElementById("menu-toggle");
  const navMenu = document.getElementById("site-nav");
  const mainContent = document.querySelector("main");

  if (header && mainContent) {
    const initialHeaderHeight = header.offsetHeight;
    mainContent.style.marginTop = `${initialHeaderHeight}px`;
  }

  if (header) {
    window.addEventListener("scroll", () => {
      header.classList.toggle("scrolled", window.scrollY > 50);
    });
  }

  if (menuToggle && navMenu) {
    menuToggle.addEventListener("click", () => {
      navMenu.classList.toggle("active");
    });
  }

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      navMenu?.classList.remove("active");
    });
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
        slide.className =
          "slider-slide absolute inset-0 w-full h-full transition-transform duration-700 ease-in-out";
        slide.innerHTML = `<img src="${slideData.imageUrl}" alt="${slideData.altText}" class="w-full h-full object-cover">`;
        sliderWrapper.appendChild(slide);
      });

      prevBtn.classList.remove("opacity-0");
      nextBtn.classList.remove("opacity-0");

      const slides = document.querySelectorAll(".slider-slide");
      let currentSlide = 0;
      let slideInterval;

      slides.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.className =
          "dot w-3 h-3 bg-white/50 rounded-full transition-all duration-300";
        dot.setAttribute("aria-label", `Go to slide ${index + 1}`);
        dot.addEventListener("click", () => {
          showSlide(index);
          resetInterval();
        });
        dotsContainer.appendChild(dot);
      });

      const dots = document.querySelectorAll(".dot");

      function showSlide(index) {
        if (index >= slides.length) index = 0;
        if (index < 0) index = slides.length - 1;
        slides.forEach((slide, i) => {
          slide.style.transform = `translateX(${(i - index) * 100}%)`;
        });
        dots.forEach((dot, i) => {
          dot.classList.toggle("bg-white", i === index);
          dot.classList.toggle("bg-white/50", i !== index);
        });
        currentSlide = index;
      }

      function nextSlide() {
        showSlide(currentSlide + 1);
      }
      function prevSlide() {
        showSlide(currentSlide - 1);
      }
      function resetInterval() {
        clearInterval(slideInterval);
        slideInterval = setInterval(nextSlide, 5000);
      }

      nextBtn.addEventListener("click", () => {
        nextSlide();
        resetInterval();
      });
      prevBtn.addEventListener("click", () => {
        prevSlide();
        resetInterval();
      });

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
