// ============================================================
// API HELPER — komunikasi ke Google Apps Script Web App
// ============================================================
/** Pastikan GAS_URL sudah diisi URL Web App Apps Script yang benar. */
function assertBackendConfigured() {
  if (typeof GAS_URL !== "string" || !/^https:\/\/script\.google\.com\/.+\/exec$/.test(GAS_URL)) {
    throw new Error("URL backend belum diatur. Buka js/config.js, isi GAS_URL dengan URL Web App Apps Script (berakhiran /exec), lalu push ulang.");
  }
}

/** Baca respons sebagai JSON; jika yang kembali HTML (bukan JSON), tampilkan pesan yang bisa dipahami. */
async function readJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch (e) {
    throw new Error("Server backend tidak mengembalikan data yang valid. Periksa GAS_URL di js/config.js dan pastikan deployment Web App diatur 'Who has access: Anyone'.");
  }
}

const Api = {
  /**
   * GET request. actions ringan & read-only (lihat daftar action di Kode.gs)
   */
  async get(action, params = {}) {
    assertBackendConfigured();
    const query = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${GAS_URL}?${query}`);
    const json = await readJson(res);
    if (!json.success) throw new Error(json.message || "Terjadi kesalahan pada server.");
    return json.data;
  },

  /**
   * POST request. Dikirim sebagai text/plain agar tidak memicu CORS
   * preflight (keterbatasan Apps Script Web App terhadap OPTIONS).
   */
  async post(action, payload = {}) {
    assertBackendConfigured();
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload })
    });
    const json = await readJson(res);
    if (!json.success) throw new Error(json.message || "Terjadi kesalahan pada server.");
    return json.data;
  }
};

/**
 * Kompres gambar menggunakan HTML5 Canvas sebelum dikonversi ke Base64.
 * Mengecilkan dimensi (max 1600px) dan kompresi JPEG kualitas 0.75-0.8.
 * Menghasilkan ukuran file jauh lebih kecil (turun 60-85%) dan upload kilat.
 */
function compressImage(file, maxWidth = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) return resolve(file);
    // Lewati SVG atau GIF agar tidak kehilangan animasi/vektor
    if (file.type === "image/svg+xml" || file.type === "image/gif") return resolve(file);

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const outType = file.type === "image/png" ? "image/jpeg" : file.type;
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                type: "image/jpeg",
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              resolve(file); // Jika hasil kompresi malah lebih besar, pertahankan aslinya
            }
          },
          outType,
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * Ubah <input type="file"> menjadi objek {name, type, base64} untuk dikirim ke backend.
 * Otomatis mengompresi berkas gambar jika terdeteksi.
 * Batas default: video hingga 30MB, foto/dokumen 5MB.
 */
async function fileToBase64(file, maxMb) {
  if (!file) return null;
  const isVideo = (file.type && file.type.startsWith("video/")) || /\.(mp4|webm|mkv|mov|avi)$/i.test(file.name || "");
  if (!maxMb) {
    maxMb = isVideo ? 30 : 5;
  }
  // Otomatis kompresi gambar sebelum kirim
  if (file.type && file.type.startsWith("image/")) {
    try {
      file = await compressImage(file);
    } catch (e) {
      console.warn("Kompresi gambar gagal, menggunakan berkas asli:", e);
    }
  }

  return new Promise((resolve, reject) => {
    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return reject(new Error("Ukuran berkas '" + file.name + "' terlalu besar (" + (file.size / (1024 * 1024)).toFixed(1) + " MB). Batas maksimum adalah " + maxMb + " MB."));
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, base64: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatTanggal(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Escape HTML untuk data yang berasal dari input pengguna (mencegah XSS).
 * Wajib dipakai untuk semua teks yang bukan dari editor terpercaya (Guru/Admin).
 */
function esc(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Ubah link berkas Google Drive (…/file/d/ID/view atau …?id=ID) menjadi
 * URL thumbnail yang bisa dipakai di <img>. Link non-Drive dikembalikan apa adanya.
 */
function driveImg(url) {
  if (!url) return "";
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000` : url;
}

/**
 * Ubah link berkas Google Drive menjadi direct download URL
 * sehingga browser langsung mengunduh file secara otomatis tanpa membuka viewer Google Drive.
 */
function driveDownloadUrl(url) {
  if (!url) return "";
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) {
    return `https://drive.usercontent.google.com/download?id=${m[1]}&export=download`;
  }
  return url;
}

/**
 * Parse sumber video (Google Drive, YouTube, atau berkas video langsung)
 * untuk diputar langsung di web tanpa harus membuka halaman Google Drive.
 */
function parseVideoSource(url) {
  if (!url) return { type: "unknown", embedUrl: "", thumbUrl: "" };
  const str = String(url).trim();

  // 1. YouTube Video
  const ytMatch = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      type: "youtube",
      id: id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
      thumbUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`
    };
  }

  // 2. Google Drive Video
  const driveMatch = str.match(/\/d\/([a-zA-Z0-9_-]+)/) || str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    const id = driveMatch[1];
    return {
      type: "drive",
      id: id,
      embedUrl: `https://drive.google.com/file/d/${id}/preview`,
      thumbUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w800`
    };
  }

  // 3. Direct HTML5 Video File (mp4, webm, mov, ogg)
  if (/\.(mp4|webm|mov|ogg)($|\?)/i.test(str)) {
    return {
      type: "html5",
      id: "",
      embedUrl: str,
      thumbUrl: ""
    };
  }

  return {
    type: "other",
    id: "",
    embedUrl: str,
    thumbUrl: ""
  };
}

// ============================================================
// CACHE KLIEN — skill gas-instant-ux prinsip #1 & #2
// Data publik disimpan di localStorage + memori supaya perpindahan tab dan
// pemuatan ulang halaman terasa instan: tampilkan cache lama SEKETIKA (0ms),
// lalu diam-diam ambil data terbaru di latar belakang (stale-while-revalidate).
// Baru menunggu server seperti biasa kalau memang belum ada cache sama sekali
// (kunjungan pertama kali).
// ============================================================
const ClientCache = {
  mem: {},
  read(key) {
    if (key in this.mem) return this.mem[key];
    try {
      const raw = localStorage.getItem("sman_cache_" + key);
      if (!raw) return null;
      this.mem[key] = JSON.parse(raw).data;
      return this.mem[key];
    } catch (e) { return null; }
  },
  write(key, data) {
    this.mem[key] = data;
    try { localStorage.setItem("sman_cache_" + key, JSON.stringify({ data, ts: Date.now() })); }
    catch (e) { /* localStorage penuh/nonaktif -> cukup pakai cache memori */ }
  }
};

/**
 * Ambil data dengan pola stale-while-revalidate.
 * - Ada cache -> kembalikan SEKETIKA, lalu perbarui diam-diam di latar belakang
 *   dan panggil onUpdate(freshData) hanya jika datanya benar-benar berubah.
 * - Belum ada cache -> tunggu server seperti biasa (baru pertama kali situs dibuka).
 */
async function cachedGet(cacheKey, action, params, onUpdate) {
  const cached = ClientCache.read(cacheKey);
  if (cached) {
    // Sudah ada cache -> kembalikan SEKETIKA, lalu diam-diam periksa versi
    // terbaru di latar belakang dan panggil onUpdate HANYA jika memang berubah.
    Api.get(action, params).then(fresh => {
      const changed = JSON.stringify(fresh) !== JSON.stringify(cached);
      ClientCache.write(cacheKey, fresh);
      if (changed && onUpdate) onUpdate(fresh);
    }).catch(() => {});
    return cached;
  }
  // Belum ada cache sama sekali (pertama kali) -> ambil seperti biasa, tanpa
  // memicu onUpdate (tidak ada tampilan basi yang perlu dikoreksi).
  const fresh = await Api.get(action, params);
  ClientCache.write(cacheKey, fresh);
  return fresh;
}
