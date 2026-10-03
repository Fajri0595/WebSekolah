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
  showPage(pageId);
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const contentId = params.get("id");
    if (contentId) {
      // Buka otomatis detail konten jika link memiliki param ?id=...
      setTimeout(() => openContentDetail(contentId), 400);
    }
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
    case "berita": initTabbedContent("berita-tabs", "berita-content", "berita", "berita"); break;
    case "galeri": renderGaleri("foto"); break;
    case "ppdb": initTabbedContent("ppdb-tabs", "ppdb-content", "ppdb_info", "info"); loadPpdbBanner(); break;
    case "dokumen": initTabbedContent("dokumen-tabs", "dokumen-content", "dokumen", "formulir", false, true); break;
    case "layanan": break; // statis, tidak perlu fetch
  }
}

// ---------- DETAIL KONTEN (modal) ----------
// Menyimpan item yang sedang ditampilkan di kartu (Berita/Pengumuman/Artikel/
// Prestasi) agar saat kartu diklik, isi lengkapnya bisa dibuka tanpa fetch ulang.
const contentIndex = {};
function indexItems(items) { items.forEach(i => { contentIndex[i.ID] = i; }); }

function openContentDetail(id) {
  const item = contentIndex[id];
  if (!item) return;
  document.getElementById("detail-box").innerHTML = `
    <button type="button" class="btn btn-outline btn-sm" style="float:right" onclick="closeDetailModal()">✕ Tutup</button>
    <span class="pill">${esc(item.Kategori)}</span>
    <h2 style="margin-top:12px">${esc(item.Judul)}</h2>
    <p class="muted">${formatTanggal(item.Tanggal)}</p>
    ${item.GambarURL ? `<img src="${esc(driveImg(item.GambarURL))}" style="width:100%;border-radius:8px;margin:12px 0" alt="${esc(item.Judul)}">` : ""}
    <div style="margin-top:12px;line-height:1.7">${item.Isi || ""}</div>`;
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
  return `
    <div class="card news-card" style="cursor:pointer" onclick="openContentDetail('${esc(item.ID)}')">
      <img src="${esc(driveImg(item.GambarURL))}" alt="${esc(item.Judul)}" onerror="this.style.background='var(--surface)'">
      <span class="pill" style="margin-top:12px">${esc(item.Kategori)}</span>
      <h3 style="margin-top:10px">${esc(item.Judul)}</h3>
      <p class="muted">${formatTanggal(item.Tanggal)}</p>
      <p>${esc((item.Ringkasan || "").slice(0, 120))}...</p>
      <span style="color:var(--navy);font-weight:600;font-size:13px">Baca selengkapnya →</span>
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
    let items = all.filter(i => i.Tipe === "foto" && i.Kategori === "Beranda");
    if (!items.length) items = all.filter(i => i.Tipe === "foto");
    items = items.slice(0, 6);
    if (!items.length) return; // biarkan gradasi default terlihat

    box.innerHTML = items.map((it, i) => `
      <img class="hero-slide ${i === 0 ? "active" : ""}" src="${esc(driveImg(it.URL))}" alt="${esc(it.Caption || "")}">`).join("");

    if (items.length > 1) {
      let idx = 0;
      setInterval(() => {
        const slides = box.querySelectorAll(".hero-slide");
        if (!slides.length) return;
        slides[idx].classList.remove("active");
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add("active");
      }, 4500);
    }
  } catch (e) { /* biarkan gradasi default jika gagal dimuat */ }
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
      <div class="card" style="cursor:pointer" onclick="openContentDetail('${esc(p.ID)}')">
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
    // Kategori naratif tunggal (sejarah/visimisi/sambutan/struktur) tampil sebagai artikel utuh
    if (["sejarah", "visimisi", "sambutan", "struktur", "fasilitas"].includes(kategori)) {
      c.innerHTML = items.map(i => `
        <article class="card" style="margin-bottom:16px">
          <h2>${esc(i.Judul)}</h2>
          ${i.GambarURL ? `<img src="${esc(driveImg(i.GambarURL))}" style="width:100%;border-radius:8px;margin-bottom:16px" alt="${esc(i.Judul)}">` : ""}
          <div>${i.Isi}</div>
        </article>`).join("");
    } else {
      c.innerHTML = `<div class="grid grid-3">${items.map(newsCardHtml).join("")}</div>`;
    }
  } catch (e) { if (isLatestSeq(containerId, seq)) c.innerHTML = emptyHtml("Gagal memuat konten."); }
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
    c.innerHTML = items.length ? `<div class="grid grid-3">${items.map(i => `
      <div class="card">
        ${tipe === "video"
          ? `<a href="${esc(i.URL)}" target="_blank" rel="noopener"><div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:32px">▶</div></a>`
          : `<img class="thumb" src="${esc(driveImg(i.URL))}" alt="${esc(i.Caption)}">`}
        <p style="margin-top:10px">${esc(i.Caption)}</p>
        <p class="muted">${formatTanggal(i.Tanggal)}</p>
      </div>`).join("")}</div>` : emptyHtml();
  } catch (e) { if (isLatestSeq("galeri-grid", seq)) c.innerHTML = emptyHtml("Gagal memuat galeri."); }
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
    document.getElementById("ppdb-step-3").innerHTML = `
      <div class="form-msg success">
        <h3 style="margin:0 0 8px">${res.message}</h3>
        <p>Nomor Registrasi Anda: <strong style="font-size:20px;color:#1E3A5F">${esc(res.noRegistrasi)}</strong></p>
        <p>Simpan nomor ini untuk mengecek status verifikasi berkas Anda.</p>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <a href="${waLink}" target="_blank" rel="noopener" class="btn" style="background:#25D366;color:#fff;display:inline-flex;align-items:center;gap:6px">
            💬 Konfirmasi ke WhatsApp Panitia
          </a>
          <a class="btn btn-primary" data-page="ppdb-status">Cek Status Sekarang</a>
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
    resultEl.innerHTML = `
      <div class="card">
        <h3>${esc(data.NamaSiswa)}</h3>
        <p class="muted">${data.NoRegistrasi} • Terdaftar ${formatTanggal(data.TanggalDaftar)}</p>
        <span class="badge ${badgeClass}">${esc(data.StatusVerifikasi)}</span>
        ${data.CatatanVerifikator ? `<p style="margin-top:12px"><strong>Catatan Verifikator:</strong> ${esc(data.CatatanVerifikator)}</p>` : ""}
      </div>`;
  } catch (err) { resultEl.innerHTML = `<div class="form-msg error">${err.message}</div>`; }
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
        <td><a class="btn btn-outline" href="${esc(d.FileURL)}" target="_blank" rel="noopener">Unduh</a></td></tr>`).join("")}</tbody></table>`
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

  // Halaman awal: ikuti alamat di URL (default: beranda)
  handleRouteWithParams();
});
