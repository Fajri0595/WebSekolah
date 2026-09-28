// ============================================================
// PORTAL.JS — Login, router, dan modul Guru/Admin
// Bergantung pada: ../js/config.js (GAS_URL), ../js/api.js (Api, esc, fileToBase64, formatTanggal)
// ============================================================

const KATEGORI_KONTEN = [
  ["sejarah", "Profil — Sejarah"], ["visimisi", "Profil — Visi & Misi"], ["sambutan", "Profil — Sambutan Kepala Sekolah"],
  ["struktur", "Profil — Struktur Organisasi"], ["fasilitas", "Profil — Fasilitas"],
  ["kegiatan", "Kesiswaan — Kegiatan Siswa"], ["prestasi", "Kesiswaan — Prestasi"],
  ["berita", "Berita Sekolah"], ["pengumuman", "Pengumuman"], ["agenda", "Agenda"], ["artikel", "Artikel"],
  ["ppdb_info", "PPDB — Informasi Umum"], ["ppdb_persyaratan", "PPDB — Persyaratan"],
  ["ppdb_jadwal", "PPDB — Jadwal"], ["ppdb_alur", "PPDB — Alur Pendaftaran"]
];
const STATUS_PPDB = ["Terkirim", "Sedang Diverifikasi", "Lolos Berkas", "Ditolak"];

let session = { token: null, user: null };
const cache = { konten: [], guru: [], periode: [], ppdb: [], pengaduan: [] };

// ---------- UTIL ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(container, type, msg) {
  container.innerHTML = `<div class="form-msg ${type}">${esc(msg)}</div>`;
}
function badgeFor(status) {
  const ok = ["Publish", "Lolos Berkas", "Aktif", "Buka", "Selesai", "Disetujui"];
  const bad = ["Ditolak", "Nonaktif"];
  return ok.includes(status) ? "badge-success" : bad.includes(status) ? "badge-danger" : "badge-warning";
}
function toInputDate(v) {
  const d = new Date(v);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}
function isAdmin() { return session.user && session.user.role === "Admin"; }
function hasHak(h) { return isAdmin() || (session.user.hakKhusus || "").split(",").map(s => s.trim()).includes(h); }

/** Panggilan API terautentikasi. Jika sesi habis -> otomatis kembali ke login. */
async function authPost(action, payload = {}) {
  try {
    return await Api.post(action, { token: session.token, ...payload });
  } catch (err) {
    if (/Sesi/.test(err.message)) { doLogout(true); }
    throw err;
  }
}

// ---------- MODAL ----------
function openModal(html) { $("#modal-box").innerHTML = html; $("#modal-overlay").classList.add("open"); }
function closeModal() { $("#modal-overlay").classList.remove("open"); }

// ---------- LOGIN / LOGOUT ----------
function saveSession(token, user) {
  session = { token, user };
  localStorage.setItem("sman_session", JSON.stringify(session));
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("sman_session") || "null");
    if (s && s.token && s.user) session = s;
  } catch (e) { /* abaikan */ }
}

$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#login-btn"), msg = $("#login-msg");
  btn.disabled = true; btn.textContent = "Memeriksa...";
  try {
    const res = await Api.post("login", { email: $("#login-email").value.trim(), password: $("#login-password").value });
    saveSession(res.token, res.user);
    showDashboard();
  } catch (err) { toast(msg, "error", err.message); }
  btn.disabled = false; btn.textContent = "Masuk ke Portal";
});

async function doLogout(expired) {
  if (session.token && !expired) { try { await Api.post("logout", { token: session.token }); } catch (e) { /* abaikan */ } }
  localStorage.removeItem("sman_session");
  session = { token: null, user: null };
  $("#dashboard-screen").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
  if (!expired) history.replaceState(null, "", location.pathname + location.search); // logout manual: bersihkan alamat halaman
  if (expired) toast($("#login-msg"), "error", "Sesi berakhir. Silakan login kembali.");
}
$("#btn-logout").addEventListener("click", () => doLogout(false));

// ---------- DASHBOARD SHELL ----------
function showDashboard() {
  $("#login-screen").classList.add("hidden");
  $("#dashboard-screen").classList.remove("hidden");
  $("#topbar-name").textContent = session.user.nama;
  $("#topbar-role").textContent = session.user.role;
  $("#topbar-date").textContent = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Sembunyikan menu sesuai role & hak khusus
  $$("[data-admin-only]").forEach(el => el.classList.toggle("hidden", !isAdmin()));
  $$("[data-hak]").forEach(el => el.classList.toggle("hidden", !hasHak(el.dataset.hak)));
  // Kembali ke menu terakhir (dari URL) jika masih diizinkan untuk peran ini
  const route = (location.hash || "").replace(/^#\/?/, "");
  const btn = document.querySelector(`.portal-nav-item[data-nav="${route}"]`);
  navTo(btn && !btn.classList.contains("hidden") ? route : "dashboard");
}

$$(".portal-nav-item[data-nav]").forEach(btn => btn.addEventListener("click", () => navTo(btn.dataset.nav)));

function navTo(page) {
  if (location.hash !== "#/" + page) history.replaceState(null, "", "#/" + page);
  $$(".portal-page").forEach(p => p.classList.remove("active"));
  $("#pp-" + page).classList.add("active");
  $$(".portal-nav-item[data-nav]").forEach(b => b.classList.toggle("active", b.dataset.nav === page));
  const loaders = {
    dashboard: renderDashboard, konten: renderKonten, galeri: renderGaleriAdmin, verifikasi: renderVerifikasi,
    guru: renderGuru, periode: renderPeriode, dokumen: renderDokumenAdmin, alumni: renderAlumni, pengaduan: renderPengaduan
  };
  if (loaders[page]) loaders[page]();
}

const loading = `<div class="loading">Memuat data...</div>`;

// ============================================================
// DASHBOARD
// ============================================================
function barChart(items, goldLast) {
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="chart-bars">${items.map((i, idx) => `
    <div class="chart-bar">
      <span class="val">${i.value}</span>
      <div class="bar ${goldLast && idx === items.length - 1 ? "gold" : ""}" style="height:${Math.round((i.value / max) * 100)}%"></div>
      <span style="margin-top:4px;text-align:center">${esc(i.label)}</span>
    </div>`).join("")}</div>`;
}

async function renderDashboard() {
  const statsEl = $("#dash-stats"), chartsEl = $("#dash-charts");
  statsEl.innerHTML = loading; chartsEl.innerHTML = "";
  $("#dash-title").textContent = isAdmin() ? "Dashboard Administrator" : "Dashboard Guru";
  try {
    if (isAdmin()) {
      const s = await authPost("getDashboardStats");
      statsEl.innerHTML = [
        ["Total Pendaftar PPDB", s.totalPendaftar], ["Lolos Berkas", s.lolosBerkas],
        ["Konten Published", s.kontenPublished], ["Pengaduan Baru", s.pengaduanBaru]
      ].map(([l, v]) => `<div class="card stat-card"><span class="muted">${l}</span><h3>${v}</h3></div>`).join("");
      const kategori = Object.entries(s.kontenPerKategori).map(([k, v]) => ({ label: k, value: v }));
      chartsEl.innerHTML = `
        <div class="card"><h3>Pendaftar PPDB — 7 Hari Terakhir</h3>${barChart(s.trenPendaftar.map(t => ({ label: t.tanggal, value: t.jumlah })), true)}</div>
        <div class="card"><h3>Konten Published per Kategori</h3>${kategori.length ? barChart(kategori) : `<p class="muted">Belum ada konten published.</p>`}</div>`;
    } else {
      const items = await authPost("getMyContent");
      const pub = items.filter(i => i.Status === "Publish").length;
      statsEl.innerHTML = [["Total Konten Saya", items.length], ["Published", pub], ["Draft", items.length - pub], ["Hak Khusus", session.user.hakKhusus || "—"]]
        .map(([l, v]) => `<div class="card stat-card"><span class="muted">${l}</span><h3 style="font-size:${String(v).length > 6 ? 16 : 30}px">${esc(v)}</h3></div>`).join("");
    }
  } catch (err) { statsEl.innerHTML = `<div class="form-msg error">${esc(err.message)}</div>`; }
}

// ============================================================
// KONTEN (Guru & Admin)
// ============================================================
async function renderKonten() {
  const el = $("#konten-list"); el.innerHTML = loading;
  try {
    cache.konten = await authPost("getMyContent");
    el.innerHTML = cache.konten.length ? `
      <table><thead><tr><th>Judul</th><th>Kategori</th><th>Tanggal</th><th>Status</th><th></th></tr></thead><tbody>
      ${cache.konten.map(k => `<tr>
        <td>${esc(k.Judul)}</td><td>${esc(k.Kategori)}</td><td>${formatTanggal(k.Tanggal)}</td>
        <td><span class="badge ${badgeFor(k.Status)}">${esc(k.Status)}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-outline btn-sm" onclick="openKontenModal('${esc(k.ID)}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="hapusKonten('${esc(k.ID)}')">Hapus</button>
        </td></tr>`).join("")}
      </tbody></table>` : `<div class="loading">Belum ada konten. Klik "+ Tambah Konten".</div>`;
  } catch (err) { el.innerHTML = `<div class="form-msg error">${esc(err.message)}</div>`; }
}

function openKontenModal(id) {
  const k = id ? cache.konten.find(x => String(x.ID) === String(id)) : null;
  openModal(`
    <h2>${k ? "Edit" : "Tambah"} Konten</h2>
    <form id="konten-form">
      <div class="field"><label class="required">Kategori</label>
        <select name="kategori" required>${KATEGORI_KONTEN.map(([v, l]) => `<option value="${v}" ${k && k.Kategori === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label class="required">Judul</label><input name="judul" required value="${esc(k ? k.Judul : "")}"></div>
      <div class="field"><label>Ringkasan (tampil di kartu)</label><input name="ringkasan" value="${esc(k ? k.Ringkasan : "")}"></div>
      <div class="field"><label class="required">Isi (boleh HTML sederhana: &lt;p&gt;, &lt;b&gt;, &lt;ul&gt;)</label>
        <textarea name="isi" required style="min-height:180px">${esc(k ? k.Isi : "")}</textarea></div>
      <div class="field"><label>Link Gambar (Google Drive dibagikan "Anyone with the link")</label><input name="gambarUrl" value="${esc(k ? k.GambarURL : "")}"></div>
      <div class="field"><label class="required">Status</label>
        <select name="status"><option value="Draft" ${k && k.Status === "Draft" ? "selected" : ""}>Draft</option><option value="Publish" ${k && k.Status === "Publish" ? "selected" : ""}>Publish</option></select></div>
      <div id="modal-msg"></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Batal</button><button class="btn btn-primary" type="submit">Simpan</button></div>
    </form>`);
  $("#konten-form").addEventListener("submit", async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await authPost("saveContent", { id: k ? k.ID : undefined, ...d });
      closeModal(); renderKonten();
    } catch (err) { toast($("#modal-msg"), "error", err.message); }
  });
}

async function hapusKonten(id) {
  if (!confirm("Hapus konten ini secara permanen?")) return;
  try { await authPost("deleteContent", { id }); renderKonten(); } catch (err) { alert(err.message); }
}

// ============================================================
// GALERI (Guru berhak khusus / Admin)
// ============================================================
async function renderGaleriAdmin() {
  const el = $("#galeri-list"); el.innerHTML = loading;
  try {
    const items = [...await Api.get("galeri", { tipe: "foto" }), ...await Api.get("galeri", { tipe: "video" })];
    el.innerHTML = items.length ? `<div class="grid grid-4">${items.map(i => `
      <div class="card gallery-admin-item">
        ${i.Tipe === "foto" ? `<img class="thumb" src="${esc(driveImg(i.URL))}" alt="">` : `<div class="thumb" style="display:flex;align-items:center;justify-content:center">🎬 Video</div>`}
        <p style="margin:8px 0 2px">${esc(i.Caption)}</p>
        <p class="muted">${esc(i.Kategori || "")} • ${formatTanggal(i.Tanggal)}</p>
        <button class="btn btn-danger btn-sm" onclick="hapusGaleri('${esc(i.ID)}')">Hapus</button>
      </div>`).join("")}</div>` : `<div class="loading">Galeri masih kosong.</div>`;
  } catch (err) { el.innerHTML = `<div class="form-msg error">${esc(err.message)}</div>`; }
}

$("#galeri-form").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#galeri-msg"), file = $("#galeri-file").files[0];
  if (!file) return toast(msg, "error", "Pilih berkas terlebih dahulu.");
  if (file.size > 5 * 1024 * 1024) return toast(msg, "error", "Ukuran berkas maksimal 5MB. Untuk video besar, unggah ke Drive lalu hubungi admin.");
  const d = Object.fromEntries(new FormData(e.target));
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Mengunggah...";
  try {
    const res = await authPost("uploadGaleriGuru", { ...d, file: await fileToBase64(file) });
    toast(msg, "success", res.message); e.target.reset(); renderGaleriAdmin();
  } catch (err) { toast(msg, "error", err.message); }
  btn.disabled = false; btn.textContent = "Unggah ke Galeri";
});

async function hapusGaleri(id) {
  if (!confirm("Hapus item galeri ini?")) return;
  try { await authPost("deleteGaleriGuru", { id }); renderGaleriAdmin(); } catch (err) { alert(err.message); }
}

// ============================================================
// VERIFIKASI PPDB (Guru berhak khusus / Admin)
// ============================================================
async function renderVerifikasi() {
  const el = $("#ppdb-list"); el.innerHTML = loading;
  try {
    cache.ppdb = await authPost("getPPDBAntrean");
    drawPpdbList();
  } catch (err) { el.innerHTML = `<div class="form-msg error">${esc(err.message)}</div>`; }
}
$("#ppdb-search").addEventListener("input", () => drawPpdbList());

function drawPpdbList(activeId) {
  const q = ($("#ppdb-search").value || "").toLowerCase();
  const list = cache.ppdb.filter(p => (p.NamaSiswa + p.NoRegistrasi).toLowerCase().includes(q));
  $("#ppdb-list").innerHTML = list.length ? list.map(p => `
    <div class="list-item ${String(p.ID) === String(activeId) ? "active" : ""}" onclick="showPpdbDetail('${esc(p.ID)}')">
      <strong>${esc(p.NamaSiswa)}</strong><br>
      <span class="muted">${esc(p.NoRegistrasi)} • ${formatTanggal(p.TanggalDaftar)}</span><br>
      <span class="badge ${badgeFor(p.StatusVerifikasi)}">${esc(p.StatusVerifikasi)}</span>
    </div>`).join("") : `<div class="loading">Tidak ada pendaftar.</div>`;
}

function safeLink(url) { return /^https:\/\//.test(url || "") ? esc(url) : "#"; }

function showPpdbDetail(id) {
  const p = cache.ppdb.find(x => String(x.ID) === String(id)); if (!p) return;
  drawPpdbList(id);
  const docs = [["Formulir", p.DokumenUmumURL], ["KTP Orang Tua", p.KTPOrtuURL], ["Kartu Keluarga", p.KKURL], ["Dokumen Pendukung", p.DokumenLainURL]]
    .filter(([, u]) => u).map(([n, u]) => `<a class="btn btn-outline btn-sm" href="${safeLink(u)}" target="_blank" rel="noopener">📄 ${n}</a>`).join("");
  $("#ppdb-detail").innerHTML = `
    <div class="card">
      <h2>${esc(p.NamaSiswa)}</h2>
      <p class="muted">${esc(p.NoRegistrasi)} • Terdaftar ${formatTanggal(p.TanggalDaftar)}</p>
      <table><tbody>
        <tr><td>Tempat, Tgl Lahir</td><td>${esc(p.TempatTglLahir)}</td></tr>
        <tr><td>Alamat</td><td>${esc(p.Alamat)}</td></tr>
        <tr><td>No. HP Siswa</td><td>${esc(p.NoHP)}</td></tr>
        <tr><td>Orang Tua</td><td>${esc(p.NamaAyah)} & ${esc(p.NamaIbu)} (${esc(p.PekerjaanOrtu)})</td></tr>
        <tr><td>No. HP Orang Tua</td><td>${esc(p.NoHPOrtu)}</td></tr>
      </tbody></table>
      <h3 style="margin-top:16px">Berkas Terunggah</h3>
      <div class="doc-links">${docs || "<span class='muted'>Tidak ada berkas.</span>"}</div>
      <h3 style="margin-top:16px">Keputusan Verifikasi</h3>
      <div class="field"><label>Status</label>
        <select id="ppdb-status">${STATUS_PPDB.map(s => `<option ${s === p.StatusVerifikasi ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Catatan untuk pendaftar (tampil di Cek Status publik)</label>
        <textarea id="ppdb-catatan" maxlength="300">${esc(p.CatatanVerifikator || "")}</textarea></div>
      <div id="ppdb-msg"></div>
      <button class="btn btn-primary" onclick="simpanStatusPpdb('${esc(p.ID)}')">Simpan Status</button>
    </div>`;
}

async function simpanStatusPpdb(id) {
  try {
    const res = await authPost("updateStatusPPDB", { id, status: $("#ppdb-status").value, catatan: $("#ppdb-catatan").value });
    toast($("#ppdb-msg"), "success", res.message);
    cache.ppdb = await authPost("getPPDBAntrean"); drawPpdbList(id);
  } catch (err) { toast($("#ppdb-msg"), "error", err.message); }
}

// ============================================================
// MANAJEMEN AKUN (Admin)
// ============================================================
async function renderGuru() {
  const el = $("#guru-list"); el.innerHTML = loading;
  try {
    cache.guru = await authPost("listGuru");
    el.innerHTML = `<table><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Hak Khusus</th><th>Status</th><th></th></tr></thead><tbody>
      ${cache.guru.map(u => `<tr>
        <td>${esc(u.Nama)}</td><td>${esc(u.Email)}</td><td>${esc(u.Role)}</td><td>${esc(u.HakKhusus || "—")}</td>
        <td><span class="badge ${badgeFor(u.Status)}">${esc(u.Status)}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-outline btn-sm" onclick="openGuruModal('${esc(u.ID)}')">Edit</button>
          ${u.Status === "Aktif" ? `<button class="btn btn-danger btn-sm" onclick="nonaktifkanGuru('${esc(u.ID)}')">Nonaktifkan</button>` : ""}
        </td></tr>`).join("")}</tbody></table>`;
  } catch (err) { el.innerHTML = `<div class="form-msg error">${esc(err.message)}</div>`; }
}

function openGuruModal(id) {
  const u = id ? cache.guru.find(x => String(x.ID) === String(id)) : null;
  const hak = (u && u.HakKhusus ? u.HakKhusus : "").split(",").map(s => s.trim());
  openModal(`
    <h2>${u ? "Edit" : "Tambah"} Akun</h2>
    <form id="guru-form">
      <div class="field"><label class="required">Nama Lengkap</label><input name="nama" required value="${esc(u ? u.Nama : "")}"></div>
      <div class="field"><label class="required">Email</label><input name="email" type="email" required value="${esc(u ? u.Email : "")}"></div>
      <div class="field"><label ${u ? "" : 'class="required"'}>Password ${u ? "(kosongkan jika tidak diubah)" : ""}</label>
        <input name="password" type="text" ${u ? "" : "required"} minlength="6" placeholder="minimal 6 karakter"></div>
      <div class="form-row">
        <div class="field"><label>Role</label><select name="role">
          <option ${u && u.Role === "Guru" ? "selected" : ""}>Guru</option><option ${u && u.Role === "Admin" ? "selected" : ""}>Admin</option></select></div>
        ${u ? `<div class="field"><label>Status</label><select name="status"><option ${u.Status === "Aktif" ? "selected" : ""}>Aktif</option><option ${u.Status === "Nonaktif" ? "selected" : ""}>Nonaktif</option></select></div>` : ""}
      </div>
      <div class="field"><label>Hak Khusus (untuk role Guru)</label>
        <div class="check-group">
          <label><input type="checkbox" name="hak" value="PPDB" ${hak.includes("PPDB") ? "checked" : ""}> Verifikator PPDB</label>
          <label><input type="checkbox" name="hak" value="Galeri" ${hak.includes("Galeri") ? "checked" : ""}> Pengelola Galeri</label>
        </div></div>
      <div id="modal-msg"></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Batal</button><button class="btn btn-primary" type="submit">Simpan</button></div>
    </form>`);
  $("#guru-form").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const d = Object.fromEntries(fd);
    d.hakKhusus = fd.getAll("hak").join(","); delete d.hak;
    try { await authPost("saveGuru", { id: u ? u.ID : undefined, ...d }); closeModal(); renderGuru(); }
    catch (err) { toast($("#modal-msg"), "error", err.message); }
  });
}

async function nonaktifkanGuru(id) {
  if (!confirm("Nonaktifkan akun ini? Pengguna tidak akan bisa login lagi.")) return;
  try { await authPost("deleteGuru", { id }); renderGuru(); } catch (err) { alert(err.message); }
}

// ============================================================
// PERIODE PPDB (Admin)
// ============================================================
async function renderPeriode() {
  const el = $("#periode-list"); el.innerHTML = loading;
  try {
    cache.periode = await authPost("listAllPeriode");
    el.innerHTML = `<table><thead><tr><th>Tahun Ajaran</th><th>Buka</th><th>Tutup</th><th>Kuota</th><th>Status</th><th></th></tr></thead><tbody>
      ${cache.periode.map(p => `<tr><td>${esc(p.TahunAjaran)}</td><td>${formatTanggal(p.TanggalBuka)}</td><td>${formatTanggal(p.TanggalTutup)}</td>
        <td>${esc(p.Kuota)}</td><td><span class="badge ${badgeFor(p.Status)}">${esc(p.Status)}</span></td>
        <td><button class="btn btn-outline btn-sm" onclick="openPeriodeModal('${esc(p.ID)}')">Edit</button></td></tr>`).join("")}</tbody></table>`;
  } catch (err) { el.innerHTML = `<div class="form-msg error">${esc(err.message)}</div>`; }
}

function openPeriodeModal(id) {
  const p = id ? cache.periode.find(x => String(x.ID) === String(id)) : null;
  openModal(`
    <h2>${p ? "Edit" : "Buat"} Periode PPDB</h2>
    <form id="periode-form">
      <div class="field"><label class="required">Tahun Ajaran / Gelombang</label><input name="tahunAjaran" required value="${esc(p ? p.TahunAjaran : "")}" placeholder="2026/2027 Gelombang 1"></div>
      <div class="form-row">
        <div class="field"><label class="required">Tanggal Buka</label><input type="date" name="tanggalBuka" required value="${p ? toInputDate(p.TanggalBuka) : ""}"></div>
        <div class="field"><label class="required">Tanggal Tutup</label><input type="date" name="tanggalTutup" required value="${p ? toInputDate(p.TanggalTutup) : ""}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label class="required">Kuota</label><input type="number" name="kuota" min="1" required value="${esc(p ? p.Kuota : "")}"></div>
        <div class="field"><label>Status</label><select name="status"><option ${p && p.Status === "Buka" ? "selected" : ""}>Buka</option><option ${!p || p.Status === "Tutup" ? "selected" : ""}>Tutup</option></select></div>
      </div>
      <div id="modal-msg"></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Batal</button><button class="btn btn-primary" type="submit">Simpan</button></div>
    </form>`);
  $("#periode-form").addEventListener("submit", async e => {
    e.preventDefault();
    try { await authPost("savePeriode", { id: p ? p.ID : undefined, ...Object.fromEntries(new FormData(e.target)) }); closeModal(); renderPeriode(); }
    catch (err) { toast($("#modal-msg"), "error", err.message); }
  });
}

// ============================================================
// DOKUMEN PUBLIK (Admin)
// ============================================================
async function renderDokumenAdmin() {
  const el = $("#dokumen-list"); el.innerHTML = loading;
  try {
    const items = await Api.get("dokumen");
    el.innerHTML = items.length ? `<table><thead><tr><th>Nama</th><th>Kategori</th><th>Tanggal</th><th></th></tr></thead><tbody>
      ${items.map(d => `<tr><td>${esc(d.NamaDokumen)}<br><span class="muted">${esc(d.Deskripsi || "")}</span></td><td>${esc(d.Kategori)}</td><td>${formatTanggal(d.Tanggal)}</td>
        <td style="white-space:nowrap"><a class="btn btn-outline btn-sm" href="${safeLink(d.FileURL)}" target="_blank" rel="noopener">Buka</a>
        <button class="btn btn-danger btn-sm" onclick="hapusDokumen('${esc(d.ID)}')">Hapus</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="loading">Belum ada dokumen.</div>`;
  } catch (err) { el.innerHTML = `<div class="form-msg error">${esc(err.message)}</div>`; }
}

$("#dokumen-form").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#dokumen-msg"), file = $("#dokumen-file").files[0];
  if (!file) return toast(msg, "error", "Pilih berkas terlebih dahulu.");
  if (file.size > 10 * 1024 * 1024) return toast(msg, "error", "Ukuran berkas maksimal 10MB.");
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Mengunggah...";
  try {
    const res = await authPost("saveDokumenAdmin", { ...Object.fromEntries(new FormData(e.target)), file: await fileToBase64(file) });
    toast(msg, "success", res.message); e.target.reset(); renderDokumenAdmin();
  } catch (err) { toast(msg, "error", err.message); }
  btn.disabled = false; btn.textContent = "Simpan & Publikasikan";
});

async function hapusDokumen(id) {
  if (!confirm("Hapus dokumen ini dari daftar publik?")) return;
  try { await authPost("deleteDokumenAdmin", { id }); renderDokumenAdmin(); } catch (err) { alert(err.message); }
}

// ============================================================
// MODERASI ALUMNI (Admin)
// ============================================================
async function renderAlumni() {
  const el = $("#alumni-list"); el.innerHTML = loading;
  try {
    const items = await authPost("listAlumniPending");
    el.innerHTML = items.length ? `<table><thead><tr><th>Nama</th><th>Angkatan</th><th>Kontak</th><th>Pekerjaan</th><th>Pesan</th><th></th></tr></thead><tbody>
      ${items.map(a => `<tr><td>${esc(a.Nama)}</td><td>${esc(a.TahunLulus)}</td><td>${esc(a.Kontak)}</td><td>${esc(a.Pekerjaan)}</td><td>${esc(a.Pesan)}</td>
        <td style="white-space:nowrap"><button class="btn btn-primary btn-sm" onclick="moderasiAlumni('${esc(a.ID)}',true)">Setujui</button>
        <button class="btn btn-danger btn-sm" onclick="moderasiAlumni('${esc(a.ID)}',false)">Tolak</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="loading">Tidak ada data alumni yang menunggu moderasi. 🎉</div>`;
  } catch (err) { el.innerHTML = `<div class="form-msg error">${esc(err.message)}</div>`; }
}
async function moderasiAlumni(id, approve) {
  try { await authPost("moderateAlumni", { id, approve }); renderAlumni(); } catch (err) { alert(err.message); }
}

// ============================================================
// LAYANAN PENGADUAN (Admin)
// ============================================================
async function renderPengaduan() {
  const el = $("#pengaduan-list"); el.innerHTML = loading;
  try {
    cache.pengaduan = await authPost("listPengaduanAdmin");
    drawPengaduanList();
  } catch (err) { el.innerHTML = `<div class="form-msg error">${esc(err.message)}</div>`; }
}
function drawPengaduanList(activeId) {
  $("#pengaduan-list").innerHTML = cache.pengaduan.length ? cache.pengaduan.map(p => `
    <div class="list-item ${String(p.ID) === String(activeId) ? "active" : ""}" onclick="showPengaduan('${esc(p.ID)}')">
      <strong>${esc(p.NoTiket)}</strong> <span class="pill">${esc(p.Jenis)}</span><br>
      ${esc(p.Nama)} — <span class="muted">${formatTanggal(p.Tanggal)}</span><br>
      <span class="badge ${badgeFor(p.Status)}">${esc(p.Status)}</span>
    </div>`).join("") : `<div class="loading">Belum ada pengaduan.</div>`;
}
function showPengaduan(id) {
  const p = cache.pengaduan.find(x => String(x.ID) === String(id)); if (!p) return;
  drawPengaduanList(id);
  $("#pengaduan-detail").innerHTML = `
    <div class="card">
      <h2>${esc(p.NoTiket)}</h2>
      <p class="muted">${esc(p.Jenis)} • ${formatTanggal(p.Tanggal)}</p>
      <p><strong>Pengirim:</strong> ${esc(p.Nama)} • ${esc(p.Kontak)} ${p.Email ? "• " + esc(p.Email) : ""}</p>
      <div class="card" style="background:var(--surface)">${esc(p.Pesan)}</div>
      ${p.LampiranURL ? `<p style="margin-top:10px"><a class="btn btn-outline btn-sm" href="${safeLink(p.LampiranURL)}" target="_blank" rel="noopener">📎 Lampiran</a></p>` : ""}
      <div class="field" style="margin-top:16px"><label>Status</label>
        <select id="pgd-status">${["Baru", "Diproses", "Selesai"].map(s => `<option ${s === p.Status ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Balasan resmi sekolah (tampil saat pengirim melacak tiket)</label>
        <textarea id="pgd-balasan">${esc(p.Balasan || "")}</textarea></div>
      <div id="pgd-msg"></div>
      <button class="btn btn-primary" onclick="simpanBalasan('${esc(p.ID)}')">Simpan Balasan</button>
    </div>`;
}
async function simpanBalasan(id) {
  try {
    const res = await authPost("replyPengaduan", { id, status: $("#pgd-status").value, balasan: $("#pgd-balasan").value });
    toast($("#pgd-msg"), "success", res.message);
    cache.pengaduan = await authPost("listPengaduanAdmin"); drawPengaduanList(id);
  } catch (err) { toast($("#pgd-msg"), "error", err.message); }
}

// ---------- INIT ----------
loadSession();
if (session.token) showDashboard();
