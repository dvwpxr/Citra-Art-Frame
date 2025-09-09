document.addEventListener("DOMContentLoaded", () => {
  // --- KONFIGURASI API & ZONA ---
  const API_WILAYAH_BASE_URL =
    "https://www.emsifa.com/api-wilayah-indonesia/api";

  // Data untuk memetakan provinsi ke zona pengiriman
  const ZONA_PROVINSI = {
    jabodetabek: ["DKI JAKARTA", "BANTEN", "JAWA BARAT"],
    jawa: [
      "BANTEN",
      "DKI JAKARTA",
      "JAWA BARAT",
      "JAWA TENGAH",
      "DI YOGYAKARTA",
      "JAWA TIMUR",
    ],
  };

  // --- REFERENSI ELEMEN DOM ---
  const tujuanSelect = document.getElementById("tujuan"); // Dropdown Zona Pengiriman
  const provinsiSelect = document.getElementById("provinsi");
  const kotaSelect = document.getElementById("kota");
  const kecamatanSelect = document.getElementById("kecamatan");
  const kodePosInput = document.getElementById("kodePos");

  // --- STATE ---
  let semuaProvinsi = []; // Variabel untuk menyimpan semua data provinsi dari API

  // --- FUNGSI HELPER ---
  const resetDropdown = (dropdown, placeholder) => {
    dropdown.innerHTML = `<option value="" disabled selected>-- ${placeholder} --</option>`;
    dropdown.disabled = true;
  };
  const showLoading = (dropdown, message) => {
    dropdown.innerHTML = `<option value="">${message}</option>`;
    dropdown.disabled = true;
  };

  // --- FUNGSI UTAMA ---

  // 1. Ambil semua data provinsi sekali saja saat halaman dimuat
  const fetchAllProvinces = async () => {
    showLoading(provinsiSelect, "Memuat provinsi...");
    try {
      const response = await fetch(`${API_WILAYAH_BASE_URL}/provinces.json`);
      if (!response.ok) throw new Error("Gagal memuat data provinsi.");
      semuaProvinsi = await response.json();

      // Awalnya, nonaktifkan dropdown provinsi sampai zona dipilih
      resetDropdown(provinsiSelect, "Pilih Zona Pengiriman Dulu");
    } catch (error) {
      console.error(error);
      resetDropdown(provinsiSelect, "Gagal memuat data");
    }
  };

  // 2. Fungsi untuk memfilter dan menampilkan provinsi berdasarkan zona
  const filterAndPopulateProvinsi = (zona) => {
    let provinsiTersaring = [];

    if (zona === "jabodetabek") {
      provinsiTersaring = semuaProvinsi.filter((p) =>
        ZONA_PROVINSI.jabodetabek.includes(p.name.toUpperCase())
      );
    } else if (zona === "jawa") {
      provinsiTersaring = semuaProvinsi.filter((p) =>
        ZONA_PROVINSI.jawa.includes(p.name.toUpperCase())
      );
    } else if (zona === "luar_jawa") {
      provinsiTersaring = semuaProvinsi.filter(
        (p) => !ZONA_PROVINSI.jawa.includes(p.name.toUpperCase())
      );
    }

    // Isi dropdown provinsi dengan data yang sudah difilter
    provinsiSelect.innerHTML = `<option value="" disabled selected>-- Pilih Provinsi --</option>`;
    provinsiTersaring.forEach((provinsi) => {
      const option = document.createElement("option");
      option.value = provinsi.id;
      option.textContent = provinsi.name;
      provinsiSelect.appendChild(option);
    });

    provinsiSelect.disabled = false;
  };

  // --- EVENT LISTENERS UNTUK EFEK CASCADE ---

  // A. Saat Zona Pengiriman dipilih
  tujuanSelect.addEventListener("change", () => {
    const selectedZona = tujuanSelect.value;

    // Reset semua dropdown alamat di bawahnya
    resetDropdown(provinsiSelect, "Pilih Provinsi");
    resetDropdown(kotaSelect, "Pilih Kota / Kabupaten");
    resetDropdown(kecamatanSelect, "Pilih Kecamatan");
    kodePosInput.value = "";

    if (selectedZona) {
      filterAndPopulateProvinsi(selectedZona);
    }
  });

  // B. Saat Provinsi dipilih (logika ini tetap sama)
  provinsiSelect.addEventListener("change", async () => {
    const idProvinsi = provinsiSelect.value;
    resetDropdown(kotaSelect, "Pilih Kota / Kabupaten");
    resetDropdown(kecamatanSelect, "Pilih Kecamatan");
    kodePosInput.value = "";

    if (idProvinsi) {
      showLoading(kotaSelect, "Memuat kota...");
      try {
        const response = await fetch(
          `${API_WILAYAH_BASE_URL}/regencies/${idProvinsi}.json`
        );
        if (!response.ok) throw new Error("Gagal memuat data kota.");
        const kotaData = await response.json();
        kotaSelect.innerHTML = `<option value="" disabled selected>-- Pilih Kota / Kabupaten --</option>`;
        kotaData.forEach((kota) => {
          const option = document.createElement("option");
          option.value = kota.id;
          option.textContent = kota.name;
          kotaSelect.appendChild(option);
        });
        kotaSelect.disabled = false;
      } catch (error) {
        console.error(error);
        resetDropdown(kotaSelect, "Gagal memuat data");
      }
    }
  });

  // C. Saat Kota/Kabupaten dipilih (logika ini tetap sama)
  kotaSelect.addEventListener("change", async () => {
    const idKota = kotaSelect.value;
    resetDropdown(kecamatanSelect, "Pilih Kecamatan");
    kodePosInput.value = "";

    if (idKota) {
      showLoading(kecamatanSelect, "Memuat kecamatan...");
      try {
        const response = await fetch(
          `${API_WILAYAH_BASE_URL}/districts/${idKota}.json`
        );
        if (!response.ok) throw new Error("Gagal memuat data kecamatan.");
        const kecamatanData = await response.json();
        kecamatanSelect.innerHTML = `<option value="" disabled selected>-- Pilih Kecamatan --</option>`;
        kecamatanData.forEach((kecamatan) => {
          const option = document.createElement("option");
          option.value = kecamatan.id;
          option.textContent = kecamatan.name;
          kecamatanSelect.appendChild(option);
        });
        kecamatanSelect.disabled = false;
      } catch (error) {
        console.error(error);
        resetDropdown(kecamatanSelect, "Gagal memuat data");
      }
    }
  });

  // --- INISIALISASI ---
  fetchAllProvinces();
});
