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
window.addEventListener("hashchange", () => showPage(currentRoute()));

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
  return `
    <div class="card news-card">
      <img src="${esc(driveImg(item.GambarURL))}" alt="${esc(item.Judul)}" onerror="this.style.background='var(--surface)'">
      <span class="pill" style="margin-top:12px">${item.Kategori}</span>
      <h3 style="margin-top:10px">${item.Judul}</h3>
      <p class="muted">${formatTanggal(item.Tanggal)}</p>
      <p>${(item.Ringkasan || "").slice(0, 120)}...</p>
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
    let items = await Api.get("galeri", { tipe: "foto", kategori: "Beranda" });
    if (!items.length) items = await Api.get("galeri", { tipe: "foto" });
    items = items.slice(0, 6);
    if (!items.length) return; // biarkan gradasi default terlihat

    box.innerHTML = items.map((it, i) => `
      <img class="hero-slide ${i === 0 ? "active" : ""}" src="${esc(driveImg(it.URL))}" alt="${esc(it.Caption || "")}">`).join("");

    if (items.length > 1) {
      let idx = 0;
      setInterval(() => {
        const slides = box.querySelectorAll(".hero-slide");
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
  beritaEl.innerHTML = loadingHtml();
  prestasiEl.innerHTML = loadingHtml();
  try {
    const berita = await Api.get("konten", { kategori: "berita", limit: 3 });
    beritaEl.innerHTML = berita.length ? berita.map(newsCardHtml).join("") : emptyHtml();
  } catch (e) { beritaEl.innerHTML = emptyHtml("Gagal memuat berita."); }
  try {
    const prestasi = await Api.get("konten", { kategori: "prestasi", limit: 4 });
    prestasiEl.innerHTML = prestasi.length ? prestasi.map(p => `
      <div class="card">
        <span class="pill" style="background:var(--gold)">Prestasi</span>
        <h3 style="margin-top:10px">${p.Judul}</h3>
        <p class="muted">${formatTanggal(p.Tanggal)}</p>
      </div>`).join("") : emptyHtml();
  } catch (e) { prestasiEl.innerHTML = emptyHtml("Gagal memuat prestasi."); }
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
  c.innerHTML = loadingHtml();
  try {
    const items = await Api.get("konten", { kategori });
    if (!isLatestSeq(containerId, seq)) return; // tab sudah berpindah lagi, abaikan hasil basi ini
    if (!items.length) return (c.innerHTML = emptyHtml());
    // Kategori naratif tunggal (sejarah/visimisi/sambutan/struktur) tampil sebagai artikel utuh
    if (["sejarah", "visimisi", "sambutan", "struktur", "fasilitas"].includes(kategori)) {
      c.innerHTML = items.map(i => `
        <article class="card" style="margin-bottom:16px">
          <h2>${i.Judul}</h2>
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
  c.innerHTML = loadingHtml();
  try {
    const list = await Api.get("guru");
    c.innerHTML = list.length ? list.map(g => `
      <div class="card text-center">
        <img src="${esc(driveImg(g.FotoURL))}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;margin:0 auto 12px;border:2px solid var(--gold)">
        <h3 style="font-size:16px">${esc(g.Nama)}</h3>
        <p class="muted">NIP. ${g.NIP || '-'}</p>
        <p style="color:var(--navy);font-weight:600">${g.Jabatan}</p>
        <span class="pill">${g.BidangStudi || '-'}</span>
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
    const list = await Api.get("alumni");
    const tableEl = document.getElementById("alumni-table");
    tableEl.innerHTML = list.length ? `
      <table><thead><tr><th>Nama</th><th>Angkatan</th><th>Profesi</th><th>Kontak</th></tr></thead>
      <tbody>${list.map(a => `<tr><td>${esc(a.Nama)}</td><td>${esc(a.TahunLulus)}</td><td>${esc(a.Pekerjaan)}</td><td>${esc(a.Kontak)}</td></tr>`).join("")}</tbody></table>`
      : emptyHtml("Belum ada data alumni terverifikasi.");
  } catch (e) { document.getElementById("alumni-table").innerHTML = emptyHtml(); }
}

// ---------- PRESTASI ----------
async function renderPrestasi() {
  const c = document.getElementById("prestasi-grid");
  c.innerHTML = loadingHtml();
  try {
    const items = await Api.get("konten", { kategori: "prestasi" });
    c.innerHTML = items.length ? items.map(newsCardHtml).join("") : emptyHtml();
  } catch (e) { c.innerHTML = emptyHtml("Gagal memuat prestasi."); }
}

// ---------- GALERI ----------
async function renderGaleri(tipe) {
  document.querySelectorAll("#galeri-toggle button").forEach(b => b.classList.toggle("active", b.dataset.tipe === tipe));
  const c = document.getElementById("galeri-grid");
  const seq = nextSeq("galeri-grid");
  c.innerHTML = loadingHtml();
  try {
    const items = await Api.get("galeri", { tipe });
    if (!isLatestSeq("galeri-grid", seq)) return;
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
    document.getElementById("ppdb-step-3").innerHTML = `
      <div class="form-msg success">
        <h3 style="margin:0 0 8px">${res.message}</h3>
        <p>Nomor Registrasi Anda: <strong style="font-size:18px">${esc(res.noRegistrasi)}</strong></p>
        <p>Simpan nomor ini untuk mengecek status verifikasi berkas.</p>
      </div>
      <a class="btn btn-primary" data-page="ppdb-status">Cek Status Sekarang</a>`;
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
  c.innerHTML = loadingHtml();
  try {
    const items = await Api.get("dokumen", { kategori });
    if (!isLatestSeq(containerId, seq)) return;
    c.innerHTML = items.length ? `
      <table><thead><tr><th>Nama Dokumen</th><th>Tanggal</th><th></th></tr></thead>
      <tbody>${items.map(d => `
        <tr><td>${d.NamaDokumen}<br><span class="muted">${d.Deskripsi || ""}</span></td>
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
      msgEl.innerHTML = `<div class="form-msg success">${res.message} Nomor tiket: <strong>${res.noTiket}</strong></div>`;
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

  // Halaman awal: ikuti alamat di URL (default: beranda)
  showPage(currentRoute());
});
