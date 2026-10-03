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
 * Ubah <input type="file"> menjadi objek {name, type, base64} untuk dikirim ke backend.
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
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
