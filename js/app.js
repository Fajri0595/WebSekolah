// ============================================================
// APP.JS — Router sederhana + render tiap halaman + form logic
// ============================================================

// ---------- ROUTER ----------
// Halaman aktif disimpan di URL (mis. ...#/profil) sehingga refresh tetap di halaman yang sama.
function currentRoute() {
  const r = (location.hash || "").replace(/^#\/?/, "");
  return document.getElementById("page-" + r) ? r : "beranda";
}
function navigate(pageId) {
  if (currentRoute() === pageId && location.hash === "#/" + pageId) showPage(pageId);
  else location.hash = "/" + pageId; // memicu 'hashchange' -> showPage
}
window.addEventListener("hashchange", () => handleRouteWithParams());

function handleRouteWithParams() {
  const hash = location.hash || "";
  const [routePart, queryPart] = hash.replace(/^#\/?/, "").split("?");
  const pageId = document.getElementById("page-" + routePart) ? routePart : "beranda";
  const params = new URLSearchParams(queryPart || "");
  const contentId = params.get("id");
  const katParam = params.get("kategori");

  if (pageId === "berita") {
    beritaState.activeId = contentId || null;
    if (katParam && ["semua", "berita", "pengumuman", "agenda", "artikel"].includes(katParam)) {
      beritaState.tab = katParam;
      beritaState.page = 1;
    }
    showPage("berita");
    if (loadedPages.has("berita")) renderBeritaPage();
    return;
  }

  showPage(pageId);
  if (contentId) {
    setTimeout(() => openContentDetail(contentId), 400);
  }
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const target = document.getElementById("page-" + pageId);
  if (target) target.classList.add("active");
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
  document.querySelectorAll(`.nav-links a[data-page="${pageId}"]`).forEach(a => a.classList.add("active"));
  window.scrollTo({ top: 0, behavior: "instant" });
  document.querySelector(".nav-links").classList.remove("open");
  loadPage(pageId);
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-page]");
  if (el) { e.preventDefault(); navigate(el.dataset.page); }
});

document.getElementById("hamburger").addEventListener("click", () => {
  document.querySelector(".nav-links").classList.toggle("open");
});

const loadedPages = new Set();
function loadPage(pageId) {
  if (loadedPages.has(pageId)) return; // cache sederhana, cukup untuk konten yang jarang berubah
  loadedPages.add(pageId);
  switch (pageId) {
    case "beranda": renderBeranda(); renderHeroSlideshow(); break;
    case "profil": initTabbedContent("profil-tabs", "profil-content", "profil", "sejarah"); break;
    case "guru": renderGuru(); break;
    case "kesiswaan": initTabbedContent("kesiswaan-tabs", "kesiswaan-content", "kesiswaan", "kegiatan", true); break;
    case "prestasi": renderPrestasi(); break;
    case "berita": initBeritaPage(); break;
    case "galeri": renderGaleri("foto"); break;
    case "ppdb": initTabbedContent("ppdb-tabs", "ppdb-content", "ppdb_info", "info"); loadPpdbBanner(); break;
    case "dokumen": initTabbedContent("dokumen-tabs", "dokumen-content", "dokumen", "formulir", false, true); break;
    case "layanan": break; // statis, tidak perlu fetch
  }
}

// ---------- DETAIL KONTEN (modal untuk Prestasi / Kegiatan) ----------
const contentIndex = {};
function indexItems(items) { items.forEach(i => { contentIndex[i.ID] = i; }); }

const KATEGORI_LABELS = {
  berita: "Berita Sekolah",
  pengumuman: "Pengumuman Resmi",
  agenda: "Agenda Sekolah",
  artikel: "Artikel & Opini",
  prestasi: "Prestasi Siswa",
  kegiatan: "Kegiatan Siswa",
  sejarah: "Sejarah Sekolah",
  visimisi: "Visi & Misi",
  sambutan: "Sambutan Kepala Sekolah",
  struktur: "Struktur Organisasi",
  fasilitas: "Fasilitas Sekolah"
};
function kategoriLabel(k) { return KATEGORI_LABELS[k] || k || "Informasi"; }

function formatTanggalLengkap(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function stripPlainText(raw) {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanExcerpt(item, maxLen = 140) {
  let base = (item.Ringkasan || "").trim();
  if (!base) {
    base = stripPlainText(item.Isi || "");
    // Bersihkan dateline awal bila ada (mis. "SMA Nusantara, 18 September 2026 ")
    base = base.replace(/^(?:JAKARTA|SMA\s+(?:Negeri\s+)?Nusantara)[^a-zA-Z0-9\n]{1,4}[0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}\s*[-–:]?\s*/i, "");
  }
  if (!base) return "";
  if (base.length <= maxLen) return base;
  const cut = base.slice(0, maxLen).replace(/\s+\S*$/, "");
  return (cut || base.slice(0, maxLen)) + "…";
}

function estimateReadMinutes(item) {
  const words = stripPlainText((item.Judul || "") + " " + (item.Isi || "")).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

/**
 * Mengubah teks polos/markdown warisan maupun HTML editor kaya menjadi HTML semantik rapi.
 */
function formatRichContent(raw) {
  const str = String(raw || "").trim();
  if (!str) return "<p class='muted'>Konten belum tersedia.</p>";
  if (/<(p|h[1-6]|ul|ol|li|blockquote|table|div)\b/i.test(str)) {
    return str
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>");
  }
  const inlineFmt = line => esc(line)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>");

  const lines = str.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inOl = false, inUl = false, paraBuf = [];

  const flushPara = () => {
    if (paraBuf.length) {
      out.push("<p>" + paraBuf.join("<br>") + "</p>");
      paraBuf = [];
    }
  };
  const closeLists = () => {
    if (inOl) { out.push("</ol>"); inOl = false; }
    if (inUl) { out.push("</ul>"); inUl = false; }
  };

  for (const rawLine of lines) {
    const t = rawLine.trim();
    if (!t) {
      flushPara();
      closeLists();
      continue;
    }
    if (/^\*\*[^*]+\*\*$/.test(t) && t.length < 80) {
      flushPara(); closeLists();
      out.push("<h3>" + esc(t.slice(2, -2)) + "</h3>");
      continue;
    }
    const olMatch = t.match(/^\d+[.)]\s+(.*)$/);
    if (olMatch) {
      flushPara();
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push("<li>" + inlineFmt(olMatch[1]) + "</li>");
      continue;
    }
    const ulMatch = t.match(/^[-•]\s+(.*)$/);
    if (ulMatch) {
      flushPara();
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push("<li>" + inlineFmt(ulMatch[1]) + "</li>");
      continue;
    }
    closeLists();
    paraBuf.push(inlineFmt(t));
  }
  flushPara();
  closeLists();
  return out.join("\n");
}

function openContentDetail(id) {
  const item = contentIndex[id];
  if (!item) return;
  if (["berita", "pengumuman", "agenda", "artikel"].includes(item.Kategori)) {
    location.hash = "/berita?id=" + encodeURIComponent(item.ID);
    return;
  }
  document.getElementById("detail-box").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
      <span class="pill">${esc(kategoriLabel(item.Kategori))}</span>
      <button type="button" class="btn btn-outline btn-sm" onclick="closeDetailModal()">✕ Tutup</button>
    </div>
    <h2 style="margin:0 0 8px">${esc(item.Judul)}</h2>
    <p class="muted" style="margin-bottom:16px">${formatTanggalLengkap(item.Tanggal)}</p>
    ${item.GambarURL ? `<img src="${esc(driveImg(item.GambarURL))}" style="width:100%;border-radius:10px;margin:0 0 18px;max-height:360px;object-fit:cover" alt="${esc(item.Judul)}">` : ""}
    <div class="rich-content">${formatRichContent(item.Isi)}</div>`;
  document.getElementById("detail-overlay").classList.add("open");
}
function closeDetailModal() { document.getElementById("detail-overlay").classList.remove("open"); }

// ---------- SUMBER DATA (bulk fetch sekali + filter instan di klien) ----------
// Prinsip gas-instant-ux: daripada memanggil server setiap kali pengguna
// berpindah tab (Sejarah/Visi Misi/Berita/dst.), seluruh data publik yang
// relevan diambil SEKALI per jenis lalu disaring di browser -- perpindahan
// tab jadi instan (0ms, tanpa memanggil server sama sekali) dan reload halaman
// pun langsung tampil dari cache localStorage sebelum diperbarui diam-diam.
const bulk = { konten: null, galeri: null, dokumen: null, guru: null, alumni: null };
const onUpdate = { konten: null, galeri: null, dokumen: null, guru: null, alumni: null };

function ensureBulk(type, action, params = {}) {
  if (bulk[type]) return Promise.resolve(bulk[type]);
  return cachedGet(type + "_semua", action, params, fresh => {
    bulk[type] = fresh;
    if (onUpdate[type]) onUpdate[type](); // render ulang tab yang sedang tampil, diam-diam
  }).then(data => { bulk[type] = data; return data; });
}
const ensureKontenAll = () => ensureBulk("konten", "kontenSemua");
const ensureGaleriAll = () => ensureBulk("galeri", "galeri");
const ensureDokumenAll = () => ensureBulk("dokumen", "dokumen");
const ensureGuruAll = () => ensureBulk("guru", "guru");
const ensureAlumniAll = () => ensureBulk("alumni", "alumni");

// ---------- PENJAGA REQUEST BASI ----------
// Jika pengguna berpindah tab dengan cepat sebelum request sebelumnya selesai
// (umum terjadi karena backend Apps Script kadang lambat), hasil yang datang
// belakangan dari tab yang SUDAH DITINGGALKAN akan diabaikan.
const _reqSeq = {};
function nextSeq(key) { _reqSeq[key] = (_reqSeq[key] || 0) + 1; return _reqSeq[key]; }
function isLatestSeq(key, seq) { return _reqSeq[key] === seq; }

// ---------- UTIL RENDER ----------
function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
function loadingHtml() { return `<div class="loading">Memuat data...</div>`; }
function emptyHtml(msg) { return `<div class="loading">${msg || "Belum ada data."}</div>`; }

function newsCardHtml(item) {
  contentIndex[item.ID] = item;
  const isNewsType = ["berita", "pengumuman", "agenda", "artikel"].includes(item.Kategori);
  const excerpt = cleanExcerpt(item, 125);
  const mediaHtml = item.GambarURL
    ? `<img src="${esc(driveImg(item.GambarURL))}" alt="${esc(item.Judul)}" loading="lazy" width="640" height="400" onerror="this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(150deg,#1B3A6B,#08162B)\\'><img src=\\'img/logo-mark.png?v=202611262310\\' alt=\\'\\' style=\\'width:52px;height:52px;object-fit:contain;opacity:.85\\'></div>'">`
    : `<div style="width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(150deg,#1B3A6B,#08162B)"><img src="img/logo-mark.png?v=202611262310" alt="" width="52" height="52" style="width:52px;height:52px;object-fit:contain;opacity:.85"></div>`;

  if (isNewsType) {
    return `
    <a class="card news-card" href="#/berita?id=${encodeURIComponent(item.ID)}">
      <div class="news-media">${mediaHtml}</div>
      <span class="pill" style="margin-top:12px">${esc(kategoriLabel(item.Kategori))}</span>
      <h3 style="margin-top:10px">${esc(item.Judul)}</h3>
      <p class="muted">${formatTanggal(item.Tanggal)} • ${estimateReadMinutes(item)} mnt baca</p>
      ${excerpt ? `<p>${esc(excerpt)}</p>` : ""}
      <span class="read-more">Baca selengkapnya</span>
    </a>`;
  }
  return `
    <div class="card news-card" role="button" tabindex="0" style="cursor:pointer" onclick="openContentDetail('${esc(item.ID)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openContentDetail('${esc(item.ID)}');}">
      <div class="news-media">${mediaHtml}</div>
      <span class="pill" style="margin-top:12px">${esc(kategoriLabel(item.Kategori))}</span>
      <h3 style="margin-top:10px">${esc(item.Judul)}</h3>
      <p class="muted">${formatTanggal(item.Tanggal)}</p>
      ${excerpt ? `<p>${esc(excerpt)}</p>` : ""}
      <span class="read-more">Lihat detail</span>
    </div>`;
}

// ---------- BERANDA : SLIDESHOW HERO ----------
// Mengambil foto dari menu Galeri (portal Guru/Admin). Beri Kategori "Beranda"
// pada foto saat mengunggah agar dikurasi khusus untuk slide ini; jika belum
// ada foto berkategori "Beranda", dipakai foto galeri terbaru apa saja.
// Jika galeri masih kosong, kotak tetap tampil sebagai gradasi polos (default).
async function renderHeroSlideshow() {
  const box = document.getElementById("hero-photo");
  if (!box) return;
  try {
    const all = await ensureGaleriAll();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 1) Video latar: item Galeri bertipe video, kategori "Beranda", berupa YouTube atau tautan .mp4 langsung
    const vid = reduce ? null : all
      .filter(i => i.Tipe === "video" && i.Kategori === "Beranda")
      .map(i => parseVideoSource(i.URL))
      .find(v => v.type === "youtube" || v.type === "html5");
    if (vid) {
      box.classList.add("has-media");
      if (vid.type === "youtube") {
        box.innerHTML = `<iframe class="hero-video" title="" tabindex="-1" aria-hidden="true" allow="autoplay; encrypted-media" src="https://www.youtube-nocookie.com/embed/${vid.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vid.id}&playsinline=1&rel=0&modestbranding=1&disablekb=1"></iframe>`;
        const f = box.firstChild; f.addEventListener("load", () => setTimeout(() => f.classList.add("ready"), 900));
      } else {
        box.innerHTML = `<video class="hero-video" autoplay muted loop playsinline preload="auto" src="${esc(vid.embedUrl)}"></video>`;
        const v = box.firstChild; v.addEventListener("playing", () => v.classList.add("ready"));
      }
      return;
    }
    // 2) Foto latar: kategori "Beranda"; jika belum ada, pakai foto galeri terbaru
    let items = all.filter(i => i.Tipe === "foto" && i.Kategori === "Beranda");
    if (!items.length) items = all.filter(i => i.Tipe === "foto");
    items = items.slice(0, 6);
    if (!items.length) return; // tampil latar bawaan (gradasi + lambang sekolah)
    box.classList.add("has-media");
    box.innerHTML = items.map((it, i) => `
      <img class="hero-slide ${i === 0 ? "active" : ""}" src="${esc(driveImg(it.URL))}" alt="" ${i ? 'loading="lazy"' : ""}>`).join("");
    if (items.length > 1 && !reduce) {
      let idx = 0;
      setInterval(() => {
        const slides = box.querySelectorAll(".hero-slide");
        if (!slides.length) return;
        slides[idx].classList.remove("active");
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add("active");
      }, 6500);
    }
  } catch (e) { /* biarkan latar bawaan jika gagal dimuat */ }
}

// ---------- BERANDA ----------
async function renderBeranda() {
  const beritaEl = document.getElementById("beranda-berita");
  const prestasiEl = document.getElementById("beranda-prestasi");
  onUpdate.konten = renderBeranda; // supaya kartu terbaru ikut ter-refresh diam-diam
  if (!bulk.konten) { beritaEl.innerHTML = loadingHtml(); prestasiEl.innerHTML = loadingHtml(); }
  try {
    const all = await ensureKontenAll();
    const berita = all.filter(i => i.Kategori === "berita").slice(0, 3);
    const prestasi = all.filter(i => i.Kategori === "prestasi").slice(0, 4);
    indexItems(prestasi);
    beritaEl.innerHTML = berita.length ? berita.map(newsCardHtml).join("") : emptyHtml();
    prestasiEl.innerHTML = prestasi.length ? prestasi.map(p => `
      <div class="card" role="button" tabindex="0" style="cursor:pointer" onclick="openContentDetail('${esc(p.ID)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openContentDetail('${esc(p.ID)}');}">
        <span class="pill" style="background:var(--gold)">Prestasi</span>
        <h3 style="margin-top:10px">${esc(p.Judul)}</h3>
        <p class="muted">${formatTanggal(p.Tanggal)}</p>
      </div>`).join("") : emptyHtml();
  } catch (e) {
    beritaEl.innerHTML = emptyHtml("Gagal memuat berita.");
    prestasiEl.innerHTML = emptyHtml("Gagal memuat prestasi.");
  }
}

// ---------- TAB GENERIK (Profil, Kesiswaan, Berita, Dokumen) ----------
function initTabbedContent(tabsContainerId, contentContainerId, kategoriPrefix, defaultTab, isKesiswaan, isDokumen) {
  const tabsEl = document.getElementById(tabsContainerId);
  const buttons = tabsEl.querySelectorAll("button");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      if (isKesiswaan) return renderKesiswaanTab(tab, contentContainerId);
      if (isDokumen) return renderDokumen(tab, contentContainerId);
      renderKategoriList(kategoriPrefix === "ppdb_info" ? "ppdb_" + tab : tab, contentContainerId);
    });
  });
  if (isKesiswaan) return renderKesiswaanTab(defaultTab, contentContainerId);
  if (isDokumen) return renderDokumen(defaultTab, contentContainerId);
  renderKategoriList(kategoriPrefix === "ppdb_info" ? "ppdb_" + defaultTab : defaultTab, contentContainerId);
}

async function renderKategoriList(kategori, containerId) {
  const c = document.getElementById(containerId);
  const seq = nextSeq(containerId);
  onUpdate.konten = () => { if (isLatestSeq(containerId, seq)) renderKategoriList(kategori, containerId); };
  if (!bulk.konten) c.innerHTML = loadingHtml(); // hanya tampil kalau BENAR-BENAR belum ada cache sama sekali
  try {
    const all = await ensureKontenAll();
    if (!isLatestSeq(containerId, seq)) return; // tab sudah berpindah lagi, abaikan hasil basi ini
    const items = all.filter(i => i.Kategori === kategori);
    if (!items.length) return (c.innerHTML = emptyHtml());
    // Kategori naratif tunggal (sejarah/visimisi/sambutan/struktur/fasilitas/ppdb_*) tampil sebagai artikel utuh
    if (["sejarah", "visimisi", "sambutan", "struktur", "fasilitas", "ppdb_info", "ppdb_persyaratan", "ppdb_jadwal", "ppdb_alur"].includes(kategori)) {
      c.innerHTML = items.map(i => `
        <article class="card" style="margin-bottom:16px">
          <h2>${esc(i.Judul)}</h2>
          ${i.GambarURL ? `<img src="${esc(driveImg(i.GambarURL))}" style="width:100%;max-height:420px;object-fit:cover;border-radius:10px;margin-bottom:18px" alt="${esc(i.Judul)}">` : ""}
          <div class="rich-content">${formatRichContent(i.Isi)}</div>
        </article>`).join("");
    } else {
      c.innerHTML = `<div class="grid grid-3">${items.map(newsCardHtml).join("")}</div>`;
    }
  } catch (e) { if (isLatestSeq(containerId, seq)) c.innerHTML = emptyHtml("Gagal memuat konten."); }
}

// ---------- PORTAL BERITA & INFORMASI RESMI ----------
const NEWS_TYPES = ["berita", "pengumuman", "agenda", "artikel"];
const beritaState = { tab: "semua", q: "", year: "", page: 1, activeId: null };

function initBeritaPage() {
  const tabsEl = document.getElementById("berita-tabs");
  if (tabsEl && !tabsEl.dataset.bound) {
    tabsEl.dataset.bound = "1";
    tabsEl.querySelectorAll("button[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        selectBeritaCategory(btn.dataset.tab);
      });
    });
  }
  renderBeritaPage();
}

function selectBeritaCategory(tab) {
  beritaState.tab = tab;
  beritaState.page = 1;
  beritaState.activeId = null;
  if (location.hash !== "#/berita") {
    history.replaceState(null, "", "#/berita");
  }
  renderBeritaPage();
}

function updateBeritaTabUi(counts) {
  const tabsEl = document.getElementById("berita-tabs");
  if (!tabsEl) return;
  const labels = {
    semua: "Semua Informasi",
    berita: "Berita Sekolah",
    pengumuman: "Pengumuman Resmi",
    agenda: "Agenda Sekolah",
    artikel: "Artikel & Opini"
  };
  tabsEl.querySelectorAll("button[data-tab]").forEach(btn => {
    const t = btn.dataset.tab;
    const isActive = beritaState.tab === t && !beritaState.activeId;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    const cnt = counts ? (counts[t] || 0) : null;
    btn.innerHTML = `${esc(labels[t] || t)}${cnt !== null ? ` <span class="cat-count">${cnt}</span>` : ""}`;
  });
}

const INDO_MONTHS = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11
};
function resolveAgendaDate(item) {
  const txt = (item.Ringkasan || "") + " " + stripPlainText(item.Isi || "");
  const m = txt.match(/\b(\d{1,2})(?:\s*(?:s\.d\.|-|sampai)\s*\d{1,2})?\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(20\d{2})\b/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = INDO_MONTHS[m[2].toLowerCase()];
    const yr = parseInt(m[3], 10);
    const parsed = new Date(yr, mon, day, 8, 0, 0);
    if (!isNaN(parsed)) return parsed;
  }
  const fallback = new Date(item.Tanggal);
  return isNaN(fallback) ? null : fallback;
}

function agendaParts(itemOrDate) {
  const d = (itemOrDate && typeof itemOrDate === "object" && "Kategori" in itemOrDate)
    ? resolveAgendaDate(itemOrDate)
    : new Date(itemOrDate);
  if (!d || isNaN(d)) return { day: "--", month: "AGS", year: "", full: "-" };
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d.toLocaleDateString("id-ID", { month: "short" }).toUpperCase(),
    year: String(d.getFullYear()),
    full: d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  };
}

function renderNewsFeedCard(item) {
  const excerpt = cleanExcerpt(item, 175);
  const href = `#/berita?id=${encodeURIComponent(item.ID)}`;
  if (item.Kategori === "agenda") {
    const dt = agendaParts(item);
    return `
      <article class="news-feed-item news-feed-item--agenda">
        <div class="agenda-date-box" aria-hidden="true">
          <span class="ag-month">${esc(dt.month)}</span>
          <span class="ag-day">${esc(dt.day)}</span>
          <span class="ag-year">${esc(dt.year)}</span>
        </div>
        <div class="news-feed-body">
          <div>
            <div class="news-meta-row">
              <span class="news-cat-tag" data-kat="agenda">Agenda Sekolah</span>
              <span>•</span>
              <span>Jadwal Kegiatan: ${esc(dt.full)}</span>
            </div>
            <h3><a href="${href}">${esc(item.Judul)}</a></h3>
            ${excerpt ? `<p class="news-feed-excerpt">${esc(excerpt)}</p>` : ""}
          </div>
          <div class="news-feed-foot">
            <span>Sekretariat &amp; Kurikulum SMA Negeri Nusantara</span>
            <a class="news-read-link" href="${href}">Detail agenda</a>
          </div>
        </div>
      </article>`;
  }

  const hasImg = Boolean(item.GambarURL);
  const thumbHtml = hasImg
    ? `<a class="news-feed-thumb" href="${href}" tabindex="-1" aria-hidden="true">
         <img src="${esc(driveImg(item.GambarURL))}" alt="" loading="lazy" width="448" height="280" onerror="this.parentElement.innerHTML='<div class=\\'thumb-fallback\\'><img src=\\'img/logo-mark.png?v=202611262310\\' alt=\\'\\'></div>'">
       </a>`
    : `<a class="news-feed-thumb" href="${href}" tabindex="-1" aria-hidden="true">
         <div class="thumb-fallback"><img src="img/logo-mark.png?v=202611262310" alt="" width="54" height="54"></div>
       </a>`;

  const bylineLabel = item.Kategori === "pengumuman"
    ? "Pimpinan & Tata Usaha Sekolah"
    : item.Kategori === "artikel"
      ? "Rubrik Opini & Literasi Sivitas"
      : "Tim Humas & Publikasi Resmi";

  return `
    <article class="news-feed-item">
      ${thumbHtml}
      <div class="news-feed-body">
        <div>
          <div class="news-meta-row">
            <span class="news-cat-tag" data-kat="${esc(item.Kategori)}">${esc(kategoriLabel(item.Kategori))}</span>
            <span>•</span>
            <span>${formatTanggal(item.Tanggal)}</span>
            <span>•</span>
            <span>${estimateReadMinutes(item)} menit baca</span>
          </div>
          <h3><a href="${href}">${esc(item.Judul)}</a></h3>
          ${excerpt ? `<p class="news-feed-excerpt">${esc(excerpt)}</p>` : ""}
        </div>
        <div class="news-feed-foot">
          <span>${bylineLabel}</span>
          <a class="news-read-link" href="${href}">Baca selengkapnya</a>
        </div>
      </div>
    </article>`;
}

function renderBeritaSidebar(newsItems, dokumenItems, counts) {
  const sideEl = document.getElementById("berita-sidebar");
  if (!sideEl) return;

  const years = Array.from(new Set(newsItems.map(i => {
    const d = new Date(i.Tanggal);
    return isNaN(d) ? "" : String(d.getFullYear());
  }).filter(Boolean))).sort((a, b) => b - a);

  const agendas = newsItems
    .filter(i => i.Kategori === "agenda")
    .slice()
    .sort((a, b) => (resolveAgendaDate(a) || 0) - (resolveAgendaDate(b) || 0))
    .slice(0, 4);

  const pengumumanTop = newsItems.filter(i => i.Kategori === "pengumuman").slice(0, 2);
  const docsTop = (dokumenItems || []).slice(0, 3);

  sideEl.innerHTML = `
    <div class="news-widget">
      <h4>Cari Warta &amp; Arsip</h4>
      <form class="news-search-form" id="berita-search-form">
        <div class="field">
          <label for="berita-q">Kata Kunci Informasi</label>
          <input id="berita-q" type="search" placeholder="Ketik topik: OSN, PPDB, Rapor..." value="${esc(beritaState.q)}">
        </div>
        <div class="field">
          <label for="berita-year">Tahun Publikasi</label>
          <select id="berita-year">
            <option value="">Semua Tahun</option>
            ${years.map(y => `<option value="${esc(y)}" ${beritaState.year === y ? "selected" : ""}>Tahun ${esc(y)}</option>`).join("")}
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-sm" style="flex:1;justify-content:center">Terapkan Filter</button>
          ${(beritaState.q || beritaState.year) ? `<button type="button" class="btn btn-outline btn-sm" id="berita-reset-btn">Reset</button>` : ""}
        </div>
      </form>
    </div>

    <div class="news-widget">
      <h4>Agenda Sekolah</h4>
      ${agendas.length ? `
        <ul class="sidebar-agenda-list">
          ${agendas.map(a => {
            const dt = agendaParts(a);
            return `<li class="sidebar-agenda-item">
              <a href="#/berita?id=${encodeURIComponent(a.ID)}">
                <div class="mini-cal"><b>${esc(dt.day)}</b><small>${esc(dt.month)}</small></div>
                <div class="ag-info">
                  <strong>${esc(a.Judul)}</strong>
                  <span>${esc(dt.full)}</span>
                </div>
              </a>
            </li>`;
          }).join("")}
        </ul>` : `<p class="muted" style="margin:0">Belum ada jadwal agenda terbaru.</p>`}
    </div>

    <div class="news-widget">
      <h4>Edaran &amp; Dokumen Resmi</h4>
      ${(pengumumanTop.length || docsTop.length) ? `
        <ul class="sidebar-doc-list">
          ${pengumumanTop.map(p => `
            <li class="sidebar-doc-item">
              <a href="#/berita?id=${encodeURIComponent(p.ID)}">
                <span class="doc-badge-info">INFO</span>
                <div>
                  <strong>${esc(p.Judul)}</strong>
                  <small>Pengumuman • ${formatTanggal(p.Tanggal)}</small>
                </div>
              </a>
            </li>`).join("")}
          ${docsTop.map(d => `
            <li class="sidebar-doc-item">
              <a href="${esc(driveDownloadUrl(d.FileURL))}" target="_blank" rel="noopener">
                <span class="doc-badge-pdf">PDF</span>
                <div>
                  <strong>${esc(d.NamaDokumen)}</strong>
                  <small>Unduh berkas resmi • ${formatTanggal(d.Tanggal)}</small>
                </div>
              </a>
            </li>`).join("")}
        </ul>
        <p style="margin:12px 0 0;text-align:right"><a class="news-read-link" href="#/dokumen" data-page="dokumen">Pusat Unduh Dokumen</a></p>
      ` : `<p class="muted" style="margin:0">Belum ada surat edaran terbit.</p>`}
    </div>

    <div class="news-widget">
      <h4>Klasifikasi Informasi</h4>
      <div class="sidebar-cat-list">
        ${[
          ["semua", "Semua Informasi Terpadu"],
          ["berita", "Warta & Berita Sekolah"],
          ["pengumuman", "Pengumuman Resmi"],
          ["agenda", "Agenda Kegiatan"],
          ["artikel", "Artikel & Karya Ilmiah"]
        ].map(([k, lbl]) => `
          <button type="button" class="${!beritaState.activeId && beritaState.tab === k ? "active" : ""}" onclick="selectBeritaCategory('${k}')">
            <span>${lbl}</span>
            <span class="cnt">${counts[k] || 0}</span>
          </button>`).join("")}
        <a href="#/prestasi" data-page="prestasi">
          <span>Arsip Prestasi Siswa</span>
          <span class="cnt">${counts.prestasi || 0}</span>
        </a>
      </div>
    </div>`;

  const form = document.getElementById("berita-search-form");
  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      beritaState.q = document.getElementById("berita-q").value.trim();
      beritaState.year = document.getElementById("berita-year").value;
      beritaState.page = 1;
      beritaState.activeId = null;
      if (location.hash !== "#/berita") history.replaceState(null, "", "#/berita");
      renderBeritaPage();
    });
  }
  const resetBtn = document.getElementById("berita-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      beritaState.q = "";
      beritaState.year = "";
      beritaState.page = 1;
      renderBeritaPage();
    });
  }
}

function renderBeritaReader(item, allNews) {
  const related = allNews
    .filter(x => String(x.ID) !== String(item.ID))
    .sort((a, b) => (b.Kategori === item.Kategori ? 1 : 0) - (a.Kategori === item.Kategori ? 1 : 0))
    .slice(0, 3);

  const shareUrl = location.origin + location.pathname + "#/berita?id=" + encodeURIComponent(item.ID);
  const waShare = "https://wa.me/?text=" + encodeURIComponent(item.Judul + " - " + SCHOOL.name + "\n" + shareUrl);
  const highResImg = item.GambarURL ? driveImg(item.GambarURL).replace(/sz=w\d+/, "sz=w1400") : "";

  return `
    <article class="news-reader">
      <div class="reader-topbar">
        <nav class="reader-breadcrumb" aria-label="Breadcrumb">
          <a href="#/beranda" data-page="beranda">Beranda</a>
          <span>/</span>
          <a href="#/berita" onclick="event.preventDefault();selectBeritaCategory('semua')">Berita &amp; Informasi</a>
          <span>/</span>
          <span>${esc(kategoriLabel(item.Kategori))}</span>
        </nav>
        <button type="button" class="btn btn-outline btn-sm" onclick="selectBeritaCategory('${NEWS_TYPES.includes(item.Kategori) ? item.Kategori : "semua"}')">← Kembali ke Indeks</button>
      </div>

      <span class="news-cat-tag" data-kat="${esc(item.Kategori)}">${esc(kategoriLabel(item.Kategori))}</span>
      <h2 class="reader-title">${esc(item.Judul)}</h2>

      <div class="reader-meta-bar">
        <div class="news-byline">
          <div class="byline-avatar">HM</div>
          <div class="byline-text">
            <strong>Humas &amp; Publikasi Resmi ${esc(SCHOOL.name)}</strong>
            <span>Diterbitkan ${formatTanggalLengkap(item.Tanggal)} • Estimasi ${estimateReadMinutes(item)} menit baca</span>
          </div>
        </div>
        <div class="reader-share">
          <a class="btn-share" href="${waShare}" target="_blank" rel="noopener">Bagikan WA</a>
          <button type="button" class="btn-share" id="btn-copy-news-link" onclick="copyNewsLink('${esc(item.ID)}')">Salin Tautan</button>
          <button type="button" class="btn-share" onclick="printNewsArticle('${esc(item.ID)}')">Cetak Berita</button>
        </div>
      </div>

      ${highResImg ? `
        <figure class="reader-cover">
          <img src="${esc(highResImg)}" alt="${esc(item.Judul)}" width="960" height="540" onerror="this.parentElement.style.display='none'">
          <figcaption>Dokumentasi resmi ${esc(SCHOOL.name)} • ${esc(item.Judul)}</figcaption>
        </figure>` : ""}

      <div class="news-article-body">${formatRichContent(item.Isi)}</div>

      ${related.length ? `
        <section class="reader-related" aria-label="Informasi terkait">
          <h3>Informasi &amp; Berita Terkait</h3>
          <div class="related-grid">
            ${related.map(r => `
              <a class="related-card" href="#/berita?id=${encodeURIComponent(r.ID)}">
                <span class="news-cat-tag" data-kat="${esc(r.Kategori)}" style="align-self:flex-start">${esc(kategoriLabel(r.Kategori))}</span>
                <h4>${esc(r.Judul)}</h4>
                <span class="muted">${formatTanggal(r.Tanggal)}</span>
              </a>`).join("")}
          </div>
        </section>` : ""}
    </article>`;
}

function copyNewsLink(id) {
  const url = location.origin + location.pathname + "#/berita?id=" + encodeURIComponent(id);
  const btn = document.getElementById("btn-copy-news-link");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      if (btn) { btn.textContent = "✓ Tautan Tersalin"; setTimeout(() => { btn.textContent = "Salin Tautan"; }, 2200); }
    });
  }
}

function printNewsArticle(id) {
  const item = contentIndex[id];
  if (!item) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${esc(item.Judul)} | ${esc(SCHOOL.name)}</title>
    <style>
      @page { size: A4 portrait; margin: 20mm; }
      body { font-family: Georgia, 'Times New Roman', serif; color: #111827; line-height: 1.7; max-width: 720px; margin: 0 auto; padding: 20px; }
      .kop { border-bottom: 3px double #0F172A; padding-bottom: 10px; margin-bottom: 20px; font-family: Arial, sans-serif; }
      .kop h2 { margin: 0; font-size: 15pt; color: #1B3A6B; }
      .kop p { margin: 3px 0 0; font-size: 9.5pt; color: #475569; }
      .kat { display: inline-block; font-family: Arial, sans-serif; font-size: 9pt; font-weight: bold; text-transform: uppercase; color: #1B3A6B; margin-bottom: 6px; }
      h1 { font-size: 19pt; line-height: 1.28; margin: 0 0 8px; }
      .meta { font-family: Arial, sans-serif; font-size: 9.5pt; color: #64748B; margin-bottom: 18px; padding-bottom: 10px; border-bottom: 1px solid #CBD5E1; }
      img { max-width: 100%; border-radius: 6px; margin-bottom: 16px; }
      blockquote { margin: 14px 0; padding: 10px 16px; border-left: 3px solid #C4932A; background: #F8FAFC; font-style: italic; }
      @media print { .no-print { display: none; } body { padding: 0; } }
    </style></head><body>
    <div class="no-print" style="text-align:right;margin-bottom:14px"><button onclick="window.print()" style="padding:8px 16px;background:#1B3A6B;color:#fff;border:0;border-radius:6px;cursor:pointer">Cetak / Simpan PDF</button></div>
    <div class="kop"><h2>${esc(SCHOOL.name).toUpperCase()}</h2><p>${esc(SCHOOL.address)} • Telp: ${esc(SCHOOL.phone)} • ${esc(SCHOOL.email)}</p></div>
    <span class="kat">${esc(kategoriLabel(item.Kategori))}</span>
    <h1>${esc(item.Judul)}</h1>
    <div class="meta">Diterbitkan: ${formatTanggalLengkap(item.Tanggal)} • Humas &amp; Publikasi Resmi ${esc(SCHOOL.name)}</div>
    ${item.GambarURL ? `<img src="${esc(driveImg(item.GambarURL))}" alt="">` : ""}
    <div>${formatRichContent(item.Isi)}</div>
  </body></html>`);
  win.document.close();
}

async function renderBeritaPage() {
  const mainEl = document.getElementById("berita-content");
  const filterWrap = document.getElementById("berita-filter-wrap");
  const metaBanner = document.getElementById("berita-edition-meta");
  if (!mainEl) return;

  const seq = nextSeq("berita-page");
  onUpdate.konten = () => { if (isLatestSeq("berita-page", seq)) renderBeritaPage(); };
  onUpdate.dokumen = () => { if (isLatestSeq("berita-page", seq)) renderBeritaPage(); };

  if (!bulk.konten) mainEl.innerHTML = loadingHtml();

  try {
    const [allKonten, allDokumen] = await Promise.all([
      ensureKontenAll(),
      ensureDokumenAll().catch(() => [])
    ]);
    if (!isLatestSeq("berita-page", seq)) return;

    indexItems(allKonten);
    const newsItems = allKonten.filter(i => NEWS_TYPES.includes(i.Kategori));
    const counts = {
      semua: newsItems.length,
      berita: newsItems.filter(i => i.Kategori === "berita").length,
      pengumuman: newsItems.filter(i => i.Kategori === "pengumuman").length,
      agenda: newsItems.filter(i => i.Kategori === "agenda").length,
      artikel: newsItems.filter(i => i.Kategori === "artikel").length,
      prestasi: allKonten.filter(i => i.Kategori === "prestasi").length
    };

    if (metaBanner) {
      const latestDate = newsItems.length ? formatTanggal(newsItems[0].Tanggal) : formatTanggal(new Date().toISOString());
      metaBanner.innerHTML = `
        <span class="news-meta-chip">Terbitan Aktif: <strong>${counts.semua} Informasi</strong></span>
        <span class="news-meta-chip">Pembaruan: <strong>${latestDate}</strong></span>`;
    }

    updateBeritaTabUi(counts);
    renderBeritaSidebar(newsItems, allDokumen, counts);

    // Mode 1: Pembaca Artikel Lengkap (#/berita?id=...)
    if (beritaState.activeId) {
      let target = contentIndex[beritaState.activeId];
      if (!target) {
        try {
          target = await Api.get("kontenDetail", { id: beritaState.activeId });
          if (target) contentIndex[target.ID] = target;
        } catch (e) { target = null; }
      }
      if (filterWrap) filterWrap.style.display = "none";
      if (!target) {
        mainEl.innerHTML = `<div class="card">${emptyHtml("Berita atau informasi yang Anda cari tidak ditemukan.")}<div class="text-center"><button type="button" class="btn btn-primary btn-sm" onclick="selectBeritaCategory('semua')">Kembali ke Indeks Berita</button></div></div>`;
        return;
      }
      mainEl.innerHTML = renderBeritaReader(target, newsItems);
      return;
    }

    // Mode 2: Ruang Redaksi / Indeks Informasi
    if (filterWrap) filterWrap.style.display = "";

    let filtered = beritaState.tab === "semua"
      ? newsItems
      : newsItems.filter(i => i.Kategori === beritaState.tab);

    if (beritaState.year) {
      filtered = filtered.filter(i => {
        const d = new Date(i.Tanggal);
        return !isNaN(d) && String(d.getFullYear()) === beritaState.year;
      });
    }
    if (beritaState.q) {
      const qLow = beritaState.q.toLowerCase();
      filtered = filtered.filter(i =>
        ((i.Judul || "") + " " + (i.Ringkasan || "") + " " + stripPlainText(i.Isi || "")).toLowerCase().includes(qLow)
      );
    }

    if (!filtered.length) {
      mainEl.innerHTML = `
        <div class="card text-center" style="padding:48px 24px">
          <h3 style="margin-bottom:8px">Belum ada informasi yang sesuai</h3>
          <p class="muted" style="margin-bottom:18px">${beritaState.q || beritaState.year ? "Tidak ditemukan arsip yang cocok dengan kata kunci atau filter tahun tersebut." : "Belum ada terbitan pada kategori ini."}</p>
          ${(beritaState.q || beritaState.year || beritaState.tab !== "semua") ? `<button type="button" class="btn btn-outline btn-sm" onclick="beritaState.q='';beritaState.year='';selectBeritaCategory('semua')">Tampilkan Semua Informasi</button>` : ""}
        </div>`;
      return;
    }

    const isDefaultFeed = !beritaState.q && !beritaState.year && beritaState.page === 1 && beritaState.tab !== "agenda";
    const heroItem = isDefaultFeed ? (filtered.find(i => i.GambarURL) || filtered[0]) : null;
    const listPool = heroItem ? filtered.filter(i => i.ID !== heroItem.ID) : filtered;

    const PER_PAGE = 5;
    const totalPages = Math.max(1, Math.ceil(listPool.length / PER_PAGE));
    if (beritaState.page > totalPages) beritaState.page = totalPages;
    const startIdx = (beritaState.page - 1) * PER_PAGE;
    const pageItems = listPool.slice(startIdx, startIdx + PER_PAGE);

    const urgentNotice = (beritaState.tab === "semua" && !beritaState.q && !beritaState.year && beritaState.page === 1)
      ? newsItems.find(i => i.Kategori === "pengumuman" && (!heroItem || i.ID !== heroItem.ID))
      : null;

    const parts = [];

    if (heroItem) {
      const heroHref = `#/berita?id=${encodeURIComponent(heroItem.ID)}`;
      const heroExcerpt = cleanExcerpt(heroItem, 230);
      const heroMedia = heroItem.GambarURL
        ? `<img src="${esc(driveImg(heroItem.GambarURL).replace(/sz=w\d+/, "sz=w1200"))}" alt="${esc(heroItem.Judul)}" width="960" height="540" onerror="this.style.display='none'">`
        : "";
      parts.push(`
        <article class="news-hero-card">
          <a class="news-hero-media" href="${heroHref}">
            ${heroMedia}
            <div class="news-hero-badges">
              <span class="badge-headline">★ Sorotan Utama</span>
              <span class="badge-cat-overlay">${esc(kategoriLabel(heroItem.Kategori))}</span>
            </div>
            <div class="news-hero-meta-overlay">
              <span>${formatTanggalLengkap(heroItem.Tanggal)} • ${estimateReadMinutes(heroItem)} menit baca</span>
              <span>Baca Lengkap →</span>
            </div>
          </a>
          <div class="news-hero-body">
            <h2><a href="${heroHref}">${esc(heroItem.Judul)}</a></h2>
            ${heroExcerpt ? `<p class="news-hero-excerpt">${esc(heroExcerpt)}</p>` : ""}
            <div class="news-hero-foot">
              <div class="news-byline">
                <div class="byline-avatar">HM</div>
                <div class="byline-text">
                  <strong>Biro Humas &amp; Komunikasi Publik</strong>
                  <span>${esc(SCHOOL.name)} • Publikasi Resmi</span>
                </div>
              </div>
              <a class="btn btn-primary btn-sm" href="${heroHref}">Baca Berita Lengkap</a>
            </div>
          </div>
        </article>`);
    }

    if (urgentNotice) {
      const noticeHref = `#/berita?id=${encodeURIComponent(urgentNotice.ID)}`;
      parts.push(`
        <aside class="news-notice-strip" aria-label="Sorotan pengumuman resmi">
          <div class="notice-strip-left">
            <div class="notice-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div>
              <div><span class="notice-kicker">Pengumuman Resmi</span><span class="muted">${formatTanggal(urgentNotice.Tanggal)}</span></div>
              <h3><a href="${noticeHref}">${esc(urgentNotice.Judul)}</a></h3>
              <p>${esc(cleanExcerpt(urgentNotice, 150))}</p>
            </div>
          </div>
          <a class="btn btn-accent btn-sm" href="${noticeHref}" style="flex-shrink:0">Lihat Edaran</a>
        </aside>`);
    }

    if (pageItems.length) {
      const headingTitle = beritaState.q
        ? `Hasil Pencarian: "${beritaState.q}"`
        : beritaState.tab === "semua"
          ? "Warta & Terbitan Terkini"
          : `Daftar ${kategoriLabel(beritaState.tab)}`;

      parts.push(`
        <div>
          <div class="news-list-head">
            <h3>${esc(headingTitle)}</h3>
            <span class="muted">Menampilkan ${pageItems.length + (heroItem ? 1 : 0)} dari ${filtered.length} terbitan</span>
          </div>
          <div class="news-feed-list" style="margin-top:16px">
            ${pageItems.map(renderNewsFeedCard).join("")}
          </div>
        </div>`);
    }

    if (totalPages > 1) {
      parts.push(`
        <nav class="news-pagination" aria-label="Navigasi halaman berita">
          <button type="button" class="news-page-btn" ${beritaState.page <= 1 ? "disabled" : ""} onclick="goBeritaPage(${beritaState.page - 1})">← Sebelumnya</button>
          <div class="news-page-nums">
            ${Array.from({ length: totalPages }, (_, idx) => idx + 1).map(n => `
              <button type="button" class="news-page-btn ${n === beritaState.page ? "active" : ""}" onclick="goBeritaPage(${n})">${n}</button>`).join("")}
          </div>
          <button type="button" class="news-page-btn" ${beritaState.page >= totalPages ? "disabled" : ""} onclick="goBeritaPage(${beritaState.page + 1})">Berikutnya →</button>
        </nav>`);
    }

    mainEl.innerHTML = parts.join("");
  } catch (e) {
    if (isLatestSeq("berita-page", seq)) {
      mainEl.innerHTML = `<div class="card text-center" style="padding:40px"><p class="muted">Gagal memuat berita dari server.</p><button type="button" class="btn btn-outline btn-sm" onclick="renderBeritaPage()">Muat Ulang</button></div>`;
    }
  }
}

function goBeritaPage(p) {
  beritaState.page = p;
  renderBeritaPage();
  const topEl = document.getElementById("berita-filter-wrap");
  if (topEl) topEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- GURU & TENAGA KEPENDIDIKAN ----------
async function renderGuru() {
  const c = document.getElementById("guru-grid");
  onUpdate.guru = renderGuru;
  if (!bulk.guru) c.innerHTML = loadingHtml();
  try {
    const list = await ensureGuruAll();
    c.innerHTML = list.length ? list.map(g => `
      <div class="card guru-card">
        <div class="guru-photo">
          ${g.FotoURL ? `<img src="${esc(driveImg(g.FotoURL))}" alt="${esc(g.Nama)}">` : `<div class="guru-photo-placeholder">👤</div>`}
        </div>
        <h3 class="guru-name">${esc(g.Nama)}</h3>
        <p class="guru-meta">NIP. ${esc(g.NIP || '-')}</p>
        <p class="guru-jabatan">${esc(g.Jabatan)}</p>
        <span class="pill">${esc(g.BidangStudi || '-')}</span>
      </div>`).join("") : emptyHtml();
  } catch (e) { c.innerHTML = emptyHtml("Gagal memuat data guru."); }
}

// ---------- KESISWAAN (Kegiatan & Alumni) ----------
function renderKesiswaanTab(tab, containerId) {
  if (tab === "alumni") return renderAlumniTab(containerId);
  renderKategoriList("kegiatan", containerId);
}

async function renderAlumniTab(containerId) {
  const c = document.getElementById(containerId);
  c.innerHTML = `
    <div class="card" style="margin-bottom:24px">
      <h3>Daftarkan Data Alumni Anda</h3>
      <form id="form-alumni">
        <div class="form-row">
          <div class="field"><label class="required">Nama Lengkap</label><input required name="nama"></div>
          <div class="field"><label class="required">Tahun Lulus</label><input required name="tahunLulus" type="number" min="1980" max="2030"></div>
        </div>
        <div class="form-row">
          <div class="field"><label class="required">Kontak (Email/No. HP)</label><input required name="kontak"></div>
          <div class="field"><label class="required">Pekerjaan / Institusi Saat Ini</label><input required name="pekerjaan"></div>
        </div>
        <div class="field"><label>Pesan untuk Almamater (opsional)</label><textarea name="pesan"></textarea></div>
        <div id="alumni-msg"></div>
        <button class="btn btn-primary" type="submit">Kirim Data Alumni</button>
      </form>
    </div>
    <div id="alumni-table">${loadingHtml()}</div>`;

  document.getElementById("form-alumni").addEventListener("submit", async e => {
    e.preventDefault();
    const msgEl = document.getElementById("alumni-msg");
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const res = await Api.post("daftarAlumni", data);
      msgEl.innerHTML = `<div class="form-msg success">${res.message}</div>`;
      e.target.reset();
    } catch (err) { msgEl.innerHTML = `<div class="form-msg error">${err.message}</div>`; }
  });

  try {
    const list = await ensureAlumniAll();
    onUpdate.alumni = async () => { document.getElementById("alumni-table").innerHTML = renderAlumniTable(await ensureAlumniAll()); };
    const tableEl = document.getElementById("alumni-table");
    tableEl.innerHTML = renderAlumniTable(list);
  } catch (e) { document.getElementById("alumni-table").innerHTML = emptyHtml(); }
}
function renderAlumniTable(list) {
  return list.length ? `
      <table><thead><tr><th>Nama</th><th>Angkatan</th><th>Profesi</th><th>Kontak</th></tr></thead>
      <tbody>${list.map(a => `<tr><td>${esc(a.Nama)}</td><td>${esc(a.TahunLulus)}</td><td>${esc(a.Pekerjaan)}</td><td>${esc(a.Kontak)}</td></tr>`).join("")}</tbody></table>`
    : emptyHtml("Belum ada data alumni terverifikasi.");
}

// ---------- PRESTASI ----------
async function renderPrestasi() {
  const c = document.getElementById("prestasi-grid");
  onUpdate.konten = renderPrestasi;
  if (!bulk.konten) c.innerHTML = loadingHtml();
  try {
    const all = await ensureKontenAll();
    const items = all.filter(i => i.Kategori === "prestasi");
    c.innerHTML = items.length ? items.map(newsCardHtml).join("") : emptyHtml();
  } catch (e) { c.innerHTML = emptyHtml("Gagal memuat prestasi."); }
}

// ---------- GALERI ----------
async function renderGaleri(tipe) {
  document.querySelectorAll("#galeri-toggle button").forEach(b => b.classList.toggle("active", b.dataset.tipe === tipe));
  const c = document.getElementById("galeri-grid");
  const seq = nextSeq("galeri-grid");
  onUpdate.galeri = () => { if (isLatestSeq("galeri-grid", seq)) renderGaleri(tipe); };
  if (!bulk.galeri) c.innerHTML = loadingHtml();
  try {
    const all = await ensureGaleriAll();
    if (!isLatestSeq("galeri-grid", seq)) return;
    const items = all.filter(i => i.Tipe === tipe);
    c.innerHTML = items.length ? `<div class="grid grid-3">${items.map(i => {
      if (tipe === "video") {
        const v = parseVideoSource(i.URL);
        return `
        <div class="card">
          <div class="thumb" style="position:relative;background:#0F172A;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;border-radius:6px" onclick="playGalleryVideo('${esc(i.URL)}', '${esc(i.Caption)}')">
            ${v.thumbUrl ? `<img src="${esc(v.thumbUrl)}" alt="${esc(i.Caption)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : ""}
            <div style="position:absolute;inset:0;background:rgba(15,23,42,0.45);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:background 0.2s">
              <div style="width:52px;height:52px;border-radius:50%;background:#D97706;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 6px 18px rgba(0,0,0,0.4);padding-left:4px">▶</div>
              <span style="color:#fff;font-size:12px;font-weight:600;margin-top:8px;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Putar Video</span>
            </div>
          </div>
          <p style="margin-top:10px;font-weight:600">${esc(i.Caption)}</p>
          <p class="muted">${formatTanggal(i.Tanggal)}</p>
          <button class="btn btn-outline btn-sm" style="margin-top:8px;width:100%" onclick="playGalleryVideo('${esc(i.URL)}', '${esc(i.Caption)}')">▶ Tonton Video</button>
        </div>`;
      }
      return `
      <div class="card">
        <img class="thumb" src="${esc(driveImg(i.URL))}" alt="${esc(i.Caption)}">
        <p style="margin-top:10px">${esc(i.Caption)}</p>
        <p class="muted">${formatTanggal(i.Tanggal)}</p>
      </div>`;
    }).join("")}</div>` : emptyHtml();
  } catch (e) { if (isLatestSeq("galeri-grid", seq)) c.innerHTML = emptyHtml("Gagal memuat galeri."); }
}

function playGalleryVideo(url, caption) {
  const v = parseVideoSource(url);
  const overlay = document.getElementById("video-overlay");
  const player = document.getElementById("video-modal-player");
  const title = document.getElementById("video-modal-title");
  if (!overlay || !player) return;

  if (title) title.textContent = caption || "Pemutar Video Galeri";
  if (v.type === "youtube" || v.type === "drive") {
    player.innerHTML = `<iframe src="${esc(v.embedUrl)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:none"></iframe>`;
  } else {
    player.innerHTML = `<video controls autoplay playsinline style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;background:#000"><source src="${esc(v.embedUrl)}">Browser Anda tidak mendukung pemutar video.</video>`;
  }
  overlay.classList.add("open");
}

function closeVideoModal(e) {
  if (e && e.target && e.target.id !== "video-overlay" && !e.target.closest("button")) return;
  const overlay = document.getElementById("video-overlay");
  const player = document.getElementById("video-modal-player");
  if (overlay) overlay.classList.remove("open");
  if (player) player.innerHTML = "";
}

// ---------- PPDB : Banner Periode Aktif ----------
async function loadPpdbBanner() {
  const c = document.getElementById("ppdb-banner");
  try {
    const periode = await Api.get("ppdbPeriodeAktif");
    if (!periode) { c.innerHTML = `<p>Pendaftaran PPDB saat ini <strong>ditutup</strong>.</p>`; return; }
    c.innerHTML = `
      <span class="badge badge-success">PENDAFTARAN DIBUKA</span>
      <h2 style="color:#fff;margin-top:10px">PPDB ${periode.TahunAjaran}</h2>
      <p style="color:rgba(255,255,255,0.8)">Ditutup pada ${formatTanggal(periode.TanggalTutup)} • Kuota ${periode.Kuota} siswa • Pendaftar masuk: ${periode.TotalMasuk}</p>
      <div class="hero-actions">
        <a class="btn btn-accent" data-page="ppdb-daftar">Daftar Sekarang</a>
        <a class="btn btn-on-dark" data-page="ppdb-status">Cek Status Pendaftaran</a>
      </div>`;
  } catch (e) { c.innerHTML = `<p>Gagal memuat status PPDB.</p>`; }
}

// ---------- PPDB : FORM PENDAFTARAN (multi-step) ----------
let ppdbStep = 1;
const ppdbData = {};

function ppdbGoStep(step) {
  ppdbStep = step;
  document.querySelectorAll("#ppdb-form-page .form-step").forEach(s => s.classList.remove("active"));
  document.getElementById("ppdb-step-" + step).classList.add("active");
  document.querySelectorAll("#ppdb-stepper .step").forEach((s, i) => {
    s.classList.toggle("done", i + 1 < step);
    s.classList.toggle("active", i + 1 === step);
  });
}

function ppdbNext(fromStep) {
  const stepEl = document.getElementById("ppdb-step-" + fromStep);
  const inputs = stepEl.querySelectorAll("input, select, textarea");
  for (const inp of inputs) {
    if (inp.required && !inp.value.trim()) { inp.reportValidity(); return; }
  }
  inputs.forEach(inp => { if (inp.name) ppdbData[inp.name] = inp.value.trim(); });
  // Gabungkan tempat & tanggal lahir (format tersimpan: "Jakarta, 2010-05-14")
  if (ppdbData.tempatLahir && ppdbData.tanggalLahir) {
    ppdbData.tempatTglLahir = ppdbData.tempatLahir + ", " + ppdbData.tanggalLahir;
  }
  ppdbGoStep(fromStep + 1);
}

async function ppdbSubmit(e) {
  e.preventDefault();
  const msgEl = document.getElementById("ppdb-submit-msg");
  const btn = document.getElementById("ppdb-submit-btn");
  btn.disabled = true; btn.textContent = "Mengirim...";
  try {
    const dokumenUmum = await fileToBase64(document.getElementById("f-dokumen-umum").files[0]);
    const ktpOrtu = await fileToBase64(document.getElementById("f-ktp-ortu").files[0]);
    const kk = await fileToBase64(document.getElementById("f-kk").files[0]);
    const dokumenLain = await fileToBase64(document.getElementById("f-dokumen-lain").files[0]);
    if (!dokumenUmum || !ktpOrtu || !kk) throw new Error("Dokumen wajib (Formulir, KTP Orang Tua, KK) belum diunggah semua.");
    for (const id of ["f-dokumen-umum", "f-ktp-ortu", "f-kk", "f-dokumen-lain"]) {
      const f = document.getElementById(id).files[0];
      if (f && f.size > 2 * 1024 * 1024) throw new Error("Ukuran berkas \"" + f.name + "\" melebihi 2MB. Kompres terlebih dahulu.");
    }

    const res = await Api.post("daftarPPDB", { ...ppdbData, files: { dokumenUmum, ktpOrtu, kk, dokumenLain } });
    const waText = encodeURIComponent("Halo Panitia PPDB " + SCHOOL.name + ", saya telah mendaftar PPDB Online.\\n\\nNama Siswa: " + ppdbData.namaSiswa + "\\nNo. Registrasi: " + res.noRegistrasi + "\\n\\nMohon info verifikasi berkas selanjutnya. Terima kasih!");
    const waLink = "https://wa.me/" + SCHOOL.whatsapp.replace(/[^0-9]/g, "") + "?text=" + waText;
    const dataStr = encodeURIComponent(JSON.stringify({
      noRegistrasi: res.noRegistrasi,
      namaSiswa: ppdbData.namaSiswa,
      tempatTglLahir: ppdbData.tempatTglLahir || "-",
      alamat: ppdbData.alamat || "-",
      noHp: ppdbData.noHp || "-",
      namaAyah: ppdbData.namaAyah || "-",
      namaIbu: ppdbData.namaIbu || "-",
      pekerjaanOrtu: ppdbData.pekerjaanOrtu || "-",
      noHpOrtu: ppdbData.noHpOrtu || "-",
      tanggalDaftar: new Date().toISOString(),
      statusVerifikasi: "Terkirim",
      catatanVerifikator: ""
    }));

    document.getElementById("ppdb-step-3").innerHTML = `
      <div class="form-msg success">
        <h3 style="margin:0 0 8px">${res.message}</h3>
        <p>Nomor Registrasi Anda: <strong style="font-size:20px;color:#1E3A5F">${esc(res.noRegistrasi)}</strong></p>
        <p>Simpan nomor ini untuk mengecek status verifikasi berkas Anda.</p>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" onclick="cetakBuktiPPDB(decodeURIComponent('${dataStr}'))">
            🖨️ Cetak Bukti Pendaftaran
          </button>
          <a href="${waLink}" target="_blank" rel="noopener" class="btn" style="background:#25D366;color:#fff;display:inline-flex;align-items:center;gap:6px">
            💬 Konfirmasi ke WhatsApp Panitia
          </a>
          <a class="btn btn-outline" data-page="ppdb-status">Cek Status Pendaftaran</a>
        </div>
      </div>`;
  } catch (err) {
    msgEl.innerHTML = `<div class="form-msg error">${err.message}</div>`;
    btn.disabled = false; btn.textContent = "Kirim Pendaftaran";
  }
}

function bindUploadPreview(inputId, boxId) {
  document.getElementById(inputId).addEventListener("change", e => {
    const box = document.getElementById(boxId);
    if (e.target.files[0]) { box.classList.add("valid"); box.querySelector(".upload-label").textContent = "✓ " + e.target.files[0].name; }
  });
}
["f-dokumen-umum", "f-ktp-ortu", "f-kk", "f-dokumen-lain"].forEach(id => {
  document.addEventListener("DOMContentLoaded", () => bindUploadPreview(id, id + "-box"));
});

// ---------- PPDB : CEK STATUS ----------
async function ppdbCekStatus(e) {
  e.preventDefault();
  const noRegistrasi = document.getElementById("cek-no-reg").value.trim();
  const tanggalLahir = document.getElementById("cek-tgl-lahir").value;
  const resultEl = document.getElementById("cek-status-result");
  resultEl.innerHTML = loadingHtml();
  try {
    const data = await Api.get("ppdbCekStatus", { noRegistrasi, tanggalLahir });
    const badgeClass = data.StatusVerifikasi === "Lolos Berkas" ? "badge-success"
      : data.StatusVerifikasi === "Ditolak" ? "badge-danger" : "badge-warning";
    const dataStr = encodeURIComponent(JSON.stringify(data));
    resultEl.innerHTML = `
      <div class="card">
        <h3>${esc(data.NamaSiswa)}</h3>
        <p class="muted">${esc(data.NoRegistrasi)} • Terdaftar ${formatTanggal(data.TanggalDaftar)}</p>
        <span class="badge ${badgeClass}">${esc(data.StatusVerifikasi)}</span>
        ${data.CatatanVerifikator ? `<p style="margin-top:12px"><strong>Catatan Verifikator:</strong> ${esc(data.CatatanVerifikator)}</p>` : ""}
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);display:flex;gap:10px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" onclick="cetakBuktiPPDB(decodeURIComponent('${dataStr}'))">
            🖨️ Cetak Kartu / Bukti Pendaftaran
          </button>
        </div>
      </div>`;
  } catch (err) { resultEl.innerHTML = `<div class="form-msg error">${err.message}</div>`; }
}

function cetakBuktiPPDB(raw) {
  const p = typeof raw === "string" ? JSON.parse(raw) : raw;
  const win = window.open("", "_blank");
  if (!win) {
    alert("Popup diblokir oleh browser. Harap izinkan pop-up untuk mencetak bukti pendaftaran.");
    return;
  }
  const tglDaftar = p.TanggalDaftar || p.tanggalDaftar;
  const noReg = p.NoRegistrasi || p.noRegistrasi;
  const nama = p.NamaSiswa || p.namaSiswa;
  const ttl = p.TempatTglLahir || p.tempatTglLahir || "-";
  const alamat = p.Alamat || p.alamat || "-";
  const noHp = p.NoHP || p.noHp || "-";
  const ortu = (p.NamaAyah || p.namaAyah || "-") + " & " + (p.NamaIbu || p.namaIbu || "-");
  const pekerjaan = p.PekerjaanOrtu || p.pekerjaanOrtu || "-";
  const status = p.StatusVerifikasi || p.statusVerifikasi || "Terkirim";
  const catatan = p.CatatanVerifikator || p.catatanVerifikator || "-";

  win.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Bukti Pendaftaran PPDB - ${esc(noReg)}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; line-height: 1.4; margin: 0; padding: 20px; }
    .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 12px; margin-bottom: 20px; position: relative; }
    .header h2 { margin: 0; font-size: 16pt; text-transform: uppercase; letter-spacing: 1px; }
    .header h3 { margin: 4px 0 0; font-size: 14pt; }
    .header p { margin: 4px 0 0; font-size: 10pt; font-family: Arial, sans-serif; }
    .doc-title { text-align: center; font-size: 13pt; font-weight: bold; margin: 20px 0 16px; text-decoration: underline; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 10.5pt; }
    table td { padding: 6px 8px; vertical-align: top; }
    table td.label { width: 32%; font-weight: bold; }
    table td.colon { width: 2%; }
    .table-bordered { border: 1px solid #000; margin-top: 10px; }
    .table-bordered td, .table-bordered th { border: 1px solid #000; padding: 8px; }
    .footer-box { margin-top: 30px; display: flex; justify-content: space-between; page-break-inside: avoid; }
    .ttd-box { width: 45%; text-align: center; font-family: Arial, sans-serif; font-size: 10.5pt; }
    .ttd-space { height: 75px; }
    .status-stamp { display: inline-block; padding: 4px 14px; border: 2px solid #1E3A8A; color: #1E3A8A; font-weight: bold; border-radius: 4px; font-family: Arial, sans-serif; text-transform: uppercase; font-size: 11pt; }
    .print-actions { margin-bottom: 20px; text-align: right; }
    @media print { .print-actions { display: none; } body { padding: 0; } }
    .btn-print { background: #1E3A8A; color: #fff; border: none; padding: 8px 18px; font-size: 12pt; border-radius: 6px; cursor: pointer; font-family: Arial, sans-serif; }
  </style>
</head>
<body>
  <div class="print-actions">
    <button class="btn-print" onclick="window.print()">🖨️ Cetak / Simpan sebagai PDF</button>
  </div>
  <div class="header">
    <h2>PEMERINTAH PROVINSI DAERAH KHUSUS IBUKOTA JAKARTA</h2>
    <h3>DINAS PENDIDIKAN</h3>
    <h2>${esc(SCHOOL.name).toUpperCase()}</h2>
    <p>${esc(SCHOOL.address)} • Telp: ${esc(SCHOOL.phone)} • Email: ${esc(SCHOOL.email)}</p>
  </div>

  <div class="doc-title">TANDA BUKTI PENDAFTARAN PPDB ONLINE</div>

  <table>
    <tr><td class="label">Nomor Registrasi</td><td class="colon">:</td><td><strong style="font-size:12pt;letter-spacing:1px">${esc(noReg)}</strong></td></tr>
    <tr><td class="label">Nama Lengkap Siswa</td><td class="colon">:</td><td><strong>${esc(nama)}</strong></td></tr>
    <tr><td class="label">Tempat, Tanggal Lahir</td><td class="colon">:</td><td>${esc(ttl)}</td></tr>
    <tr><td class="label">Alamat Domisili</td><td class="colon">:</td><td>${esc(alamat)}</td></tr>
    <tr><td class="label">Nomor HP Siswa</td><td class="colon">:</td><td>${esc(noHp)}</td></tr>
    <tr><td class="label">Nama Orang Tua (Ayah / Ibu)</td><td class="colon">:</td><td>${esc(ortu)}</td></tr>
    <tr><td class="label">Pekerjaan Orang Tua</td><td class="colon">:</td><td>${esc(pekerjaan)}</td></tr>
    <tr><td class="label">Tanggal Registrasi</td><td class="colon">:</td><td>${formatTanggal(tglDaftar)}</td></tr>
    <tr><td class="label">Status Verifikasi Saat Ini</td><td class="colon">:</td><td><span class="status-stamp">${esc(status)}</span></td></tr>
    ${catatan && catatan !== "-" ? `<tr><td class="label">Catatan Panitia</td><td class="colon">:</td><td><em>${esc(catatan)}</em></td></tr>` : ""}
  </table>

  <div style="font-family:Arial,sans-serif;font-size:9.5pt;background:#f5f5f5;padding:10px;border-left:4px solid #1E3A8A;margin-top:16px">
    <strong>Petunjuk Penting Bagi Pendaftar:</strong>
    <ol style="margin:4px 0 0;padding-left:18px">
      <li>Simpan lembar bukti pendaftaran ini dengan baik sebagai bukti resmi verifikasi.</li>
      <li>Pantau pengumuman hasil seleksi berkas melalui menu <em>Cek Status Pendaftaran</em> di website sekolah.</li>
      <li>Bawalah lembar bukti ini beserta berkas fisik asli pada saat jadwal verifikasi ulang/wawancara di sekolah.</li>
    </ol>
  </div>

  <div class="footer-box">
    <div class="ttd-box">
      <p>Calon Peserta Didik / Orang Tua,</p>
      <div class="ttd-space"></div>
      <p>( <strong>${esc(nama)}</strong> )</p>
    </div>
    <div class="ttd-box">
      <p>Panitia PPDB ${esc(SCHOOL.name)},</p>
      <div class="ttd-space"></div>
      <p>( <strong>Panitia Penerimaan</strong> )</p>
    </div>
  </div>
</body>
</html>`);
  win.document.close();
}

// ---------- DOKUMEN ----------
async function renderDokumen(kategori, containerId) {
  const c = document.getElementById(containerId);
  const seq = nextSeq(containerId);
  onUpdate.dokumen = () => { if (isLatestSeq(containerId, seq)) renderDokumen(kategori, containerId); };
  if (!bulk.dokumen) c.innerHTML = loadingHtml();
  try {
    const all = await ensureDokumenAll();
    if (!isLatestSeq(containerId, seq)) return;
    const items = all.filter(i => i.Kategori === kategori);
    c.innerHTML = items.length ? `
      <table><thead><tr><th>Nama Dokumen</th><th>Tanggal</th><th></th></tr></thead>
      <tbody>${items.map(d => `
        <tr><td>${esc(d.NamaDokumen)}<br><span class="muted">${esc(d.Deskripsi || "")}</span></td>
        <td>${formatTanggal(d.Tanggal)}</td>
        <td><a class="btn btn-outline" href="${esc(driveDownloadUrl(d.FileURL))}" download="${esc(d.NamaDokumen)}" target="_blank" rel="noopener">Unduh</a></td></tr>`).join("")}</tbody></table>`
      : emptyHtml();
  } catch (e) { if (isLatestSeq(containerId, seq)) c.innerHTML = emptyHtml("Gagal memuat dokumen."); }
}

// ---------- LAYANAN : PENGADUAN ----------
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("form-pengaduan");
  if (form) form.addEventListener("submit", async e => {
    e.preventDefault();
    const msgEl = document.getElementById("pengaduan-msg");
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.anonim = fd.get("anonim") === "on";
    try {
      const lampiran = await fileToBase64(document.getElementById("f-lampiran-pengaduan").files[0]);
      if (lampiran) data.lampiran = lampiran;
      const res = await Api.post("kirimPengaduan", data);
      const waPengaduanText = encodeURIComponent("Halo Layanan Pengaduan " + SCHOOL.name + ", saya telah mengirim tiket pengaduan.\\n\\nNo. Tiket: " + res.noTiket + "\\nNama: " + (data.anonim ? "Anonim" : data.nama) + "\\nJenis: " + data.jenis + "\\n\\nMohon ditindaklanjuti. Terima kasih!");
      const waPengaduanLink = "https://wa.me/" + SCHOOL.whatsapp.replace(/[^0-9]/g, "") + "?text=" + waPengaduanText;
      msgEl.innerHTML = `
        <div class="form-msg success">
          ${res.message}<br>
          Nomor tiket Anda: <strong style="font-size:18px">${res.noTiket}</strong>
          <div style="margin-top:12px">
            <a href="${waPengaduanLink}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#25D366;color:#fff;display:inline-flex;align-items:center;gap:6px">
              💬 Simpan Bukti Tiket ke WhatsApp
            </a>
          </div>
        </div>`;
      e.target.reset();
    } catch (err) { msgEl.innerHTML = `<div class="form-msg error">${err.message}</div>`; }
  });

  const cekTiketForm = document.getElementById("form-cek-tiket");
  if (cekTiketForm) cekTiketForm.addEventListener("submit", async e => {
    e.preventDefault();
    const noTiket = document.getElementById("input-no-tiket").value.trim();
    const resultEl = document.getElementById("tiket-result");
    resultEl.innerHTML = loadingHtml();
    try {
      const data = await Api.post("cekTiketPengaduan", { noTiket });
      resultEl.innerHTML = `
        <div class="card">
          <p class="muted">${data.NoTiket} • ${formatTanggal(data.Tanggal)}</p>
          <span class="badge badge-warning">${esc(data.Status)}</span>
          <p style="margin-top:10px">${esc(data.Pesan)}</p>
          ${data.Balasan ? `<p><strong>Balasan sekolah:</strong> ${esc(data.Balasan)}</p>` : ""}
        </div>`;
    } catch (err) { resultEl.innerHTML = `<div class="form-msg error">${err.message}</div>`; }
  });

  // Klik di luar kotak detail konten -> tutup (aman karena hanya menampilkan, bukan form isian)
  document.getElementById("detail-overlay").addEventListener("click", e => {
    if (e.target.id === "detail-overlay") closeDetailModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeDetailModal();
      closeVideoModal();
    }
  });

  // Muat pengaturan dinamis sekolah dari admin
  loadSchoolSettings();

  // Halaman awal: ikuti alamat di URL (default: beranda)
  handleRouteWithParams();
});

// ---------- PENGATURAN WEBSITE DINAMIS ----------
function applySchoolSettings(cfg) {
  if (!cfg) return;
  if (cfg.namaSekolah) {
    SCHOOL.name = cfg.namaSekolah;
    document.title = cfg.namaSekolah + " | Portal Resmi";
    const brandEl = document.getElementById("navbar-brand-name");
    if (brandEl) brandEl.textContent = cfg.namaSekolah;
    const footerName = document.getElementById("footer-school-name");
    if (footerName) footerName.textContent = cfg.namaSekolah;
    const copyrightEl = document.getElementById("footer-copyright");
    if (copyrightEl) copyrightEl.textContent = `© ${new Date().getFullYear()} ${cfg.namaSekolah}. Hak Cipta Dilindungi Undang-Undang.`;
  }
  if (cfg.telepon) {
    SCHOOL.phone = cfg.telepon;
    const tPhone = document.getElementById("topbar-phone");
    if (tPhone) tPhone.textContent = cfg.telepon;
    const fPhone = document.getElementById("footer-phone");
    if (fPhone) fPhone.textContent = cfg.telepon;
    const lPhone = document.getElementById("layanan-phone");
    if (lPhone) lPhone.textContent = cfg.telepon;
  }
  if (cfg.whatsapp) {
    SCHOOL.whatsapp = cfg.whatsapp;
    const fWa = document.getElementById("footer-wa");
    if (fWa) fWa.textContent = cfg.whatsapp;
    const lWa = document.getElementById("layanan-wa");
    if (lWa) lWa.textContent = cfg.whatsapp;
  }
  if (cfg.email) {
    SCHOOL.email = cfg.email;
    const tEmail = document.getElementById("topbar-email");
    if (tEmail) tEmail.textContent = cfg.email;
    const fEmail = document.getElementById("footer-email");
    if (fEmail) fEmail.textContent = cfg.email;
  }
  if (cfg.jamOperasional) {
    const tHours = document.getElementById("topbar-hours");
    if (tHours) tHours.textContent = cfg.jamOperasional;
    const lHours = document.getElementById("layanan-hours");
    if (lHours) lHours.textContent = "🕒 " + cfg.jamOperasional;
  }
  if (cfg.alamat) {
    SCHOOL.address = cfg.alamat;
    const fAddr = document.getElementById("footer-address");
    if (fAddr) fAddr.textContent = cfg.alamat;
    const lAddr = document.getElementById("layanan-alamat");
    if (lAddr) lAddr.textContent = "📍 " + cfg.alamat;
  }
  if (cfg.akreditasi) {
    const hBadge = document.getElementById("hero-badge");
    if (hBadge) hBadge.innerHTML = `<span class="badge-dot"></span> ${esc(cfg.akreditasi)} • Portal Resmi`;
  }
  if (cfg.tagline) {
    const hTag = document.getElementById("hero-tagline");
    if (hTag) hTag.textContent = cfg.tagline;
  }
  if (cfg.slogan) {
    SCHOOL.tagline = cfg.slogan;
  }
}

async function loadSchoolSettings() {
  try {
    await cachedGet("app_pengaturan", "pengaturan", {}, applySchoolSettings);
  } catch (e) {
    console.warn("Gagal memuat pengaturan dinamis, menggunakan konfigurasi default:", e);
  }
}
