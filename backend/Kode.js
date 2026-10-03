/**
 * ============================================================
 * SMA NEGERI NUSANTARA — BACKEND API (Google Apps Script)
 * FASE 1 + FASE 2 TERGABUNG
 * - Fase 1: Portal Publik + PPDB Online (tanpa login)
 * - Fase 2: Autentikasi token + Dashboard Guru & Admin
 * Arsitektur: Pure REST API (JSON) — frontend terpisah di GitHub Pages
 * ============================================================
 *
 * INSTALASI BARU (belum pernah setup sama sekali):
 * 1. Buat Google Sheet baru, buka Extensions > Apps Script, tempel file ini.
 * 2. Jalankan fungsi setupAppEnvironment() SEKALI. Izinkan semua permission.
 * 3. Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 *
 * UPGRADE DARI FASE 1 (spreadsheet & deployment sudah ada):
 * 1. Ganti seluruh isi Kode.gs lama dengan isi file ini.
 * 2. Jalankan fungsi upgradeToFase2() SEKALI — ini menambah sheet Users,
 *    Sessions, kolom baru, dan folder Drive baru TANPA menghapus data lama.
 * 3. Deploy > Manage deployments > pilih deployment aktif > Edit (pensil) >
 *    Version: New version > Deploy.
 */

// ============================================================
// KONFIGURASI
// ============================================================
function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    SPREADSHEET_ID: props.getProperty('SPREADSHEET_ID'),
    FOLDER_ID: props.getProperty('FOLDER_ID')
  };
}

var SHEET_NAMES = {
  KONTEN: 'Konten',
  GURU: 'GuruPublik',
  ALUMNI: 'Alumni',
  GALERI: 'Galeri',
  DOKUMEN: 'Dokumen',
  PENGADUAN: 'LayananPengaduan',
  PERIODE: 'PPDBPeriode',
  PENDAFTAR: 'PPDBPendaftar',
  USERS: 'Users',
  SESSIONS: 'Sessions'
};

var SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 jam

// ============================================================
// SETUP AWAL — HANYA UNTUK INSTALASI BARU
// ============================================================
function setupAppEnvironment() {
  var ss = SpreadsheetApp.create('DB - SMA Negeri Nusantara Portal');
  var rootFolder = DriveApp.createFolder('SMAN_Nusantara_Portal_Files');
  var uploadsFolder = rootFolder.createFolder('Uploads');
  ['PPDB', 'Pengaduan', 'Galeri', 'Dokumen', 'GuruPublik', 'Konten'].forEach(function (n) { uploadsFolder.createFolder(n); });

  var props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  props.setProperty('FOLDER_ID', rootFolder.getId());

  var headers = {};
  headers[SHEET_NAMES.KONTEN] = ['ID', 'Kategori', 'Judul', 'Ringkasan', 'Isi', 'GambarURL', 'Tanggal', 'Status', 'AuthorID'];
  headers[SHEET_NAMES.GURU] = ['ID', 'Nama', 'NIP', 'Jabatan', 'BidangStudi', 'FotoURL', 'Urutan'];
  headers[SHEET_NAMES.ALUMNI] = ['ID', 'Nama', 'TahunLulus', 'Kontak', 'Pekerjaan', 'Pesan', 'Tanggal', 'StatusApproval'];
  headers[SHEET_NAMES.GALERI] = ['ID', 'Tipe', 'URL', 'Caption', 'Kategori', 'Tanggal', 'UploaderID'];
  headers[SHEET_NAMES.DOKUMEN] = ['ID', 'Kategori', 'NamaDokumen', 'Deskripsi', 'FileURL', 'Tanggal'];
  headers[SHEET_NAMES.PENGADUAN] = ['ID', 'NoTiket', 'Jenis', 'Nama', 'Kontak', 'Email', 'Anonim', 'Pesan', 'LampiranURL', 'Status', 'Tanggal', 'Balasan'];
  headers[SHEET_NAMES.PERIODE] = ['ID', 'TahunAjaran', 'TanggalBuka', 'TanggalTutup', 'Kuota', 'Status'];
  headers[SHEET_NAMES.PENDAFTAR] = ['ID', 'NoRegistrasi', 'PeriodeID', 'NamaSiswa', 'TempatTglLahir', 'Alamat', 'NoHP',
    'NamaAyah', 'NamaIbu', 'PekerjaanOrtu', 'NoHPOrtu', 'DokumenUmumURL', 'KTPOrtuURL', 'KKURL', 'DokumenLainURL',
    'StatusVerifikasi', 'CatatanVerifikator', 'TanggalDaftar'];
  headers[SHEET_NAMES.USERS] = ['ID', 'Nama', 'Email', 'PasswordHash', 'Role', 'HakKhusus', 'Status'];
  headers[SHEET_NAMES.SESSIONS] = ['Token', 'UserID', 'Role', 'Expiry'];

  var defaultSheet = ss.getSheetByName('Sheet1');
  Object.keys(headers).forEach(function (name) {
    var sh = ss.insertSheet(name);
    sh.appendRow(headers[name]);
    styleHeader_(sh, headers[name].length);
  });
  if (defaultSheet) ss.deleteSheet(defaultSheet);

  // Contoh periode PPDB aktif
  var today = new Date();
  var closeDate = new Date(); closeDate.setDate(today.getDate() + 30);
  ss.getSheetByName(SHEET_NAMES.PERIODE).appendRow(['P-0001', '2026/2027 Gelombang 1', today, closeDate, 320, 'Buka']);

  // Akun admin default
  var defaultPass = 'admin123';
  ss.getSheetByName(SHEET_NAMES.USERS).appendRow([generateId_('USR'), 'Administrator Utama',
    'admin@sman-nusantara.sch.id', hashPassword_(defaultPass), 'Admin', '', 'Aktif']);

  Logger.log('SETUP SELESAI.');
  Logger.log('Spreadsheet URL: ' + ss.getUrl());
  Logger.log('=== AKUN ADMIN DEFAULT ===');
  Logger.log('Email: admin@sman-nusantara.sch.id');
  Logger.log('Password: ' + defaultPass + '  (SEGERA GANTI setelah login pertama)');
}

/**
 * Jalankan SEKALI jika sebelumnya sudah pernah menjalankan setupAppEnvironment()
 * versi Fase 1 (tanpa Users/Sessions). Aman dijalankan berkali-kali — hanya
 * menambah yang belum ada, tidak menghapus data.
 */
function upgradeToFase2() {
  var ss = SpreadsheetApp.openById(getConfig_().SPREADSHEET_ID);
  var root = DriveApp.getFolderById(getConfig_().FOLDER_ID);
  var uploads = root.getFoldersByName('Uploads').next();
  ['Galeri', 'Dokumen', 'GuruPublik', 'Konten'].forEach(function (n) {
    if (!uploads.getFoldersByName(n).hasNext()) uploads.createFolder(n);
  });

  if (!ss.getSheetByName(SHEET_NAMES.USERS)) {
    var shU = ss.insertSheet(SHEET_NAMES.USERS);
    shU.appendRow(['ID', 'Nama', 'Email', 'PasswordHash', 'Role', 'HakKhusus', 'Status']);
    styleHeader_(shU, 7);
    var defaultPass = 'admin123';
    shU.appendRow([generateId_('USR'), 'Administrator Utama', 'admin@sman-nusantara.sch.id',
      hashPassword_(defaultPass), 'Admin', '', 'Aktif']);
    Logger.log('Akun admin default dibuat -> admin@sman-nusantara.sch.id / ' + defaultPass);
  }
  if (!ss.getSheetByName(SHEET_NAMES.SESSIONS)) {
    var shS = ss.insertSheet(SHEET_NAMES.SESSIONS);
    shS.appendRow(['Token', 'UserID', 'Role', 'Expiry']);
    styleHeader_(shS, 4);
  }
  addColumnIfMissing_(ss.getSheetByName(SHEET_NAMES.KONTEN), 'AuthorID');
  addColumnIfMissing_(ss.getSheetByName(SHEET_NAMES.GALERI), 'UploaderID');
  addColumnIfMissing_(ss.getSheetByName(SHEET_NAMES.PENGADUAN), 'Balasan');

  Logger.log('UPGRADE KE FASE 2 SELESAI.');
}

function styleHeader_(sheet, colCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, colCount).setFontWeight('bold').setBackground('#1E3A5F').setFontColor('#FFFFFF');
}

function addColumnIfMissing_(sheet, colName) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf(colName) === -1) {
    sheet.getRange(1, lastCol + 1).setValue(colName).setFontWeight('bold').setBackground('#1E3A5F').setFontColor('#FFFFFF');
  }
}

// ============================================================
// ROUTER UTAMA
// ============================================================
function doGet(e) {
  try {
    var action = e.parameter.action;
    var result;
    switch (action) {
      case 'konten': result = getKonten_(e.parameter.kategori, e.parameter.limit); break;
      case 'kontenSemua': result = getKontenSemua_(); break;
      case 'kontenDetail': result = getKontenDetail_(e.parameter.id); break;
      case 'guru': result = getGuruPublik_(); break;
      case 'alumni': result = getAlumni_(); break;
      case 'galeri': result = getGaleri_(e.parameter.tipe, e.parameter.kategori); break;
      case 'dokumen': result = getDokumen_(e.parameter.kategori); break;
      case 'ppdbPeriodeAktif': result = getPeriodeAktif_(); break;
      case 'ppdbCekStatus': result = cekStatusPPDB_(e.parameter.noRegistrasi, e.parameter.tanggalLahir); break;
      default: return jsonResponse_({ success: false, message: 'Aksi tidak dikenal: ' + action });
    }
    return jsonResponse_({ success: true, data: result });
  } catch (err) {
    return jsonResponse_({ success: false, message: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;
    switch (action) {
      // ---- Publik (Fase 1) ----
      case 'daftarPPDB': result = daftarPPDB_(body); break;
      case 'daftarAlumni': result = daftarAlumni_(body); break;
      case 'kirimPengaduan': result = kirimPengaduan_(body); break;
      case 'cekTiketPengaduan': result = cekTiketPengaduan_(body.noTiket); break;

      // ---- Autentikasi (Fase 2) ----
      case 'login': result = login_(body); break;
      case 'logout': result = logout_(body); break;

      // ---- Guru (Fase 2) ----
      case 'getMyContent': result = getMyContent_(body); break;
      case 'saveContent': result = saveContent_(body); break;
      case 'deleteContent': result = deleteContent_(body); break;
      case 'uploadGaleriGuru': result = uploadGaleriGuru_(body); break;
      case 'editGaleriGuru': result = editGaleriGuru_(body); break;
      case 'deleteGaleriGuru': result = deleteGaleriGuru_(body); break;
      case 'getPPDBAntrean': result = getPPDBAntrean_(body); break;
      case 'updateStatusPPDB': result = updateStatusPPDB_(body); break;

      // ---- Admin (Fase 2) ----
      case 'getDashboardStats': result = getDashboardStats_(body); break;
      case 'listGuru': result = listGuru_(body); break;
      case 'saveGuru': result = saveGuru_(body); break;
      case 'deleteGuru': result = deleteGuru_(body); break;
      case 'saveGuruPublik': result = saveGuruPublik_(body); break;
      case 'deleteGuruPublik': result = deleteGuruPublik_(body); break;
      case 'saveDokumenAdmin': result = saveDokumenAdmin_(body); break;
      case 'deleteDokumenAdmin': result = deleteDokumenAdmin_(body); break;
      case 'listAlumniPending': result = listAlumniPending_(body); break;
      case 'moderateAlumni': result = moderateAlumni_(body); break;
      case 'listPengaduanAdmin': result = listPengaduanAdmin_(body); break;
      case 'replyPengaduan': result = replyPengaduan_(body); break;
      case 'listAllPeriode': result = listAllPeriode_(body); break;
      case 'savePeriode': result = savePeriode_(body); break;

      default: return jsonResponse_({ success: false, message: 'Aksi tidak dikenal: ' + action });
    }
    return jsonResponse_({ success: true, data: result });
  } catch (err) {
    return jsonResponse_({ success: false, message: err.message });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// HELPER SHEET
// ============================================================
function getSheet_(name) {
  var ss = SpreadsheetApp.openById(getConfig_().SPREADSHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + name);
  return sh;
}

function sheetToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  var headers = values.shift();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function generateId_(prefix) {
  return prefix + '-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
}

// ============================================================
// CACHE SERVER (CacheService) — skill gas-instant-ux prinsip #3
// Data publik (Konten, Galeri, Dokumen, Guru, Alumni) dibaca sangat sering
// tapi jarang berubah (hanya saat Guru/Admin menyimpan). Disimpan sebentar
// di cache Apps Script supaya kunjungan berikutnya tidak perlu buka Sheets
// lagi (Sheets API ~500ms-1s vs cache hit ~10-50ms), dan dibersihkan
// otomatis (invalidateCache_) begitu ada perubahan agar tidak basi.
// ============================================================
var CACHE_TTL_SECONDS = 300; // 5 menit

function getCached_(cacheKey, fetchFn) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* rusak/format lama, ambil ulang di bawah */ }
  }
  var data = fetchFn();
  try { cache.put(cacheKey, JSON.stringify(data), CACHE_TTL_SECONDS); } catch (e) { /* data > 100KB, lewati cache, tetap kembalikan data */ }
  return data;
}

function invalidateCache_(cacheKey) {
  try { CacheService.getScriptCache().remove(cacheKey); } catch (e) { /* abaikan */ }
}

function updateRowById_(sheet, id, valuesObj) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('ID');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      headers.forEach(function (h, colIdx) {
        if (valuesObj[h] !== undefined) sheet.getRange(i + 1, colIdx + 1).setValue(valuesObj[h]);
      });
      return true;
    }
  }
  throw new Error('Data dengan ID tersebut tidak ditemukan.');
}

function deleteRowById_(sheet, id) {
  var data = sheet.getDataRange().getValues();
  var idCol = data[0].indexOf('ID');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) { sheet.deleteRow(i + 1); return true; }
  }
  throw new Error('Data tidak ditemukan.');
}

// ============================================================
// AUTENTIKASI (FASE 2)
// ============================================================
function hashPassword_(plain) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain);
  return digest.map(function (b) { return ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0'); }).join('');
}

function login_(body) {
  var user = sheetToObjects_(getSheet_(SHEET_NAMES.USERS))
    .filter(function (u) { return u.Email === body.email && u.Status === 'Aktif'; })[0];
  if (!user || user.PasswordHash !== hashPassword_(body.password)) {
    throw new Error('Email atau password salah.');
  }
  var token = Utilities.getUuid();
  var expiry = new Date(Date.now() + SESSION_DURATION_MS);
  getSheet_(SHEET_NAMES.SESSIONS).appendRow([token, user.ID, user.Role, expiry]);
  return { token: token, user: { id: user.ID, nama: user.Nama, email: user.Email, role: user.Role, hakKhusus: user.HakKhusus || '' } };
}

function logout_(body) {
  try { deleteRowByColumn_(getSheet_(SHEET_NAMES.SESSIONS), 'Token', body.token); } catch (e) { /* abaikan jika sudah tidak ada */ }
  return { message: 'Berhasil logout.' };
}

function deleteRowByColumn_(sheet, colName, value) {
  var data = sheet.getDataRange().getValues();
  var col = data[0].indexOf(colName);
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][col] === value) { sheet.deleteRow(i + 1); return; }
  }
}

/**
 * Validasi token & role. Lempar error jika tidak valid/kadaluarsa/tidak berhak.
 * Mengembalikan objek user (dari sheet Users) jika valid.
 */
function requireAuth_(token, allowedRoles) {
  if (!token) throw new Error('Sesi tidak valid. Silakan login kembali.');
  var session = sheetToObjects_(getSheet_(SHEET_NAMES.SESSIONS)).filter(function (s) { return s.Token === token; })[0];
  if (!session) throw new Error('Sesi tidak valid. Silakan login kembali.');
  if (new Date(session.Expiry) < new Date()) throw new Error('Sesi telah berakhir. Silakan login kembali.');
  if (allowedRoles && allowedRoles.indexOf(session.Role) === -1) throw new Error('Anda tidak memiliki akses ke fitur ini.');
  var user = sheetToObjects_(getSheet_(SHEET_NAMES.USERS)).filter(function (u) { return String(u.ID) === String(session.UserID); })[0];
  if (!user || user.Status !== 'Aktif') throw new Error('Akun tidak aktif.');
  return user;
}

function requireHakKhusus_(user, hak) {
  if (user.Role === 'Admin') return; // admin selalu boleh
  var list = (user.HakKhusus || '').split(',').map(function (s) { return s.trim(); });
  if (list.indexOf(hak) === -1) throw new Error('Anda tidak memiliki hak akses ' + hak + '.');
}

// ============================================================
// KONTEN — PUBLIK (baca) (Fase 1)
// ============================================================
function getKontenSemuaRaw_() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.KONTEN))
    .filter(function (r) { return r.Status === 'Publish'; })
    .sort(function (a, b) { return new Date(b.Tanggal) - new Date(a.Tanggal); });
}

// Dipakai frontend untuk mengambil SEMUA konten publik dalam 1 panggilan saja
// (lalu difilter per kategori/tab di sisi klien) -- jauh lebih cepat daripada
// memanggil server setiap kali pengguna berpindah tab.
function getKontenSemua_() {
  return getCached_('app_konten_semua', getKontenSemuaRaw_);
}

function getKonten_(kategori, limit) {
  if (!kategori) throw new Error('Parameter kategori wajib diisi');
  var items = getKontenSemua_().filter(function (r) { return r.Kategori === kategori; });
  if (limit) items = items.slice(0, parseInt(limit, 10));
  return items;
}

function getKontenDetail_(id) {
  var found = sheetToObjects_(getSheet_(SHEET_NAMES.KONTEN)).filter(function (r) { return String(r.ID) === String(id); })[0];
  if (!found) throw new Error('Konten tidak ditemukan');
  return found;
}

// ============================================================
// KONTEN — GURU/ADMIN (tulis) (Fase 2)
// ============================================================
function getMyContent_(body) {
  var user = requireAuth_(body.token, ['Guru', 'Admin']);
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.KONTEN));
  if (user.Role !== 'Admin') items = items.filter(function (r) { return String(r.AuthorID) === String(user.ID); });
  return items.sort(function (a, b) { return new Date(b.Tanggal) - new Date(a.Tanggal); });
}

function saveContent_(body) {
  var user = requireAuth_(body.token, ['Guru', 'Admin']);
  var sheet = getSheet_(SHEET_NAMES.KONTEN);
  // Jika ada berkas gambar baru diunggah, simpan ke Drive & pakai URL-nya.
  // Jika tidak, pertahankan nilai gambarUrl yang dikirim (bisa tetap URL lama).
  var gambarUrl = body.file ? simpanFile_(body.file, 'Konten', generateId_('KTN')) : (body.gambarUrl || '');
  if (body.id) {
    var existing = sheetToObjects_(sheet).filter(function (r) { return String(r.ID) === String(body.id); })[0];
    if (!existing) throw new Error('Konten tidak ditemukan.');
    if (user.Role !== 'Admin' && String(existing.AuthorID) !== String(user.ID)) throw new Error('Anda tidak memiliki akses mengubah konten ini.');
    updateRowById_(sheet, body.id, {
      Kategori: body.kategori, Judul: body.judul, Ringkasan: body.ringkasan || '',
      Isi: body.isi, GambarURL: gambarUrl || existing.GambarURL, Status: body.status
    });
    invalidateCache_('app_konten_semua');
    return { id: body.id, message: 'Konten berhasil diperbarui.' };
  }
  var id = generateId_('KTN');
  sheet.appendRow([id, body.kategori, body.judul, body.ringkasan || '', body.isi, gambarUrl, new Date(), body.status || 'Draft', user.ID]);
  invalidateCache_('app_konten_semua');
  return { id: id, message: 'Konten berhasil dibuat.' };
}

function deleteContent_(body) {
  var user = requireAuth_(body.token, ['Guru', 'Admin']);
  var sheet = getSheet_(SHEET_NAMES.KONTEN);
  var existing = sheetToObjects_(sheet).filter(function (r) { return String(r.ID) === String(body.id); })[0];
  if (!existing) throw new Error('Konten tidak ditemukan.');
  if (user.Role !== 'Admin' && String(existing.AuthorID) !== String(user.ID)) throw new Error('Anda tidak memiliki akses menghapus konten ini.');
  deleteRowById_(sheet, body.id);
  invalidateCache_('app_konten_semua');
  return { message: 'Konten dihapus.' };
}

// ============================================================
// GURU & TENAGA KEPENDIDIKAN (PUBLIK)
// ============================================================
function getGuruPublik_() {
  return getCached_('app_guru_publik', function () {
    return sheetToObjects_(getSheet_(SHEET_NAMES.GURU)).sort(function (a, b) { return (a.Urutan || 999) - (b.Urutan || 999); });
  });
}

// ---- Kelola Direktori Guru & Tenaga Kependidikan (Admin) (Fase 2) ----
function saveGuruPublik_(body) {
  requireAuth_(body.token, ['Admin']);
  var sheet = getSheet_(SHEET_NAMES.GURU);
  var fotoUrl = body.file ? simpanFile_(body.file, 'GuruPublik', generateId_('GTK')) : (body.fotoUrl || '');
  if (body.id) {
    var vals = { Nama: body.nama, NIP: body.nip || '', Jabatan: body.jabatan, BidangStudi: body.bidangStudi || '', Urutan: body.urutan || 999 };
    if (fotoUrl) vals.FotoURL = fotoUrl;
    updateRowById_(sheet, body.id, vals);
    invalidateCache_('app_guru_publik');
    return { message: 'Data berhasil diperbarui.' };
  }
  var id = generateId_('GTK');
  sheet.appendRow([id, body.nama, body.nip || '', body.jabatan, body.bidangStudi || '', fotoUrl, body.urutan || 999]);
  invalidateCache_('app_guru_publik');
  return { id: id, message: 'Data berhasil ditambahkan ke direktori publik.' };
}

function deleteGuruPublik_(body) {
  requireAuth_(body.token, ['Admin']);
  deleteRowById_(getSheet_(SHEET_NAMES.GURU), body.id);
  invalidateCache_('app_guru_publik');
  return { message: 'Data dihapus dari direktori publik.' };
}

// ============================================================
// ALUMNI
// ============================================================
function getAlumni_() {
  return getCached_('app_alumni_disetujui', function () {
    return sheetToObjects_(getSheet_(SHEET_NAMES.ALUMNI))
      .filter(function (r) { return r.StatusApproval === 'Disetujui'; })
      .sort(function (a, b) { return b.TahunLulus - a.TahunLulus; });
  });
}

function daftarAlumni_(body) {
  var sheet = getSheet_(SHEET_NAMES.ALUMNI);
  var id = generateId_('ALM');
  sheet.appendRow([id, body.nama, body.tahunLulus, body.kontak, body.pekerjaan, body.pesan || '', new Date(), 'Pending']);
  return { id: id, message: 'Terima kasih, data alumni Anda akan ditinjau sebelum tampil di direktori publik.' };
}

function listAlumniPending_(body) {
  requireAuth_(body.token, ['Admin']);
  return sheetToObjects_(getSheet_(SHEET_NAMES.ALUMNI)).filter(function (a) { return a.StatusApproval === 'Pending'; });
}

function moderateAlumni_(body) {
  requireAuth_(body.token, ['Admin']);
  updateRowById_(getSheet_(SHEET_NAMES.ALUMNI), body.id, { StatusApproval: body.approve ? 'Disetujui' : 'Ditolak' });
  invalidateCache_('app_alumni_disetujui');
  return { message: 'Status alumni diperbarui.' };
}

// ============================================================
// GALERI
// ============================================================
function getGaleri_(tipe, kategori) {
  var items = getCached_('app_galeri_semua', function () {
    return sheetToObjects_(getSheet_(SHEET_NAMES.GALERI)).sort(function (a, b) { return new Date(b.Tanggal) - new Date(a.Tanggal); });
  });
  if (tipe) items = items.filter(function (r) { return r.Tipe === tipe; });
  if (kategori) items = items.filter(function (r) { return r.Kategori === kategori; });
  return items;
}

function uploadGaleriGuru_(body) {
  var user = requireAuth_(body.token, ['Guru', 'Admin']);
  requireHakKhusus_(user, 'Galeri');
  var url = body.file ? simpanFile_(body.file, 'Galeri', generateId_('GLR')) : body.url;
  if (!url) throw new Error('Berkas galeri wajib diunggah.');
  var id = generateId_('GLR');
  getSheet_(SHEET_NAMES.GALERI).appendRow([id, body.tipe, url, body.caption, body.kategori || '', new Date(), user.ID]);
  invalidateCache_('app_galeri_semua');
  return { id: id, url: url, message: 'Berhasil diunggah ke galeri.' };
}

function deleteGaleriGuru_(body) {
  var user = requireAuth_(body.token, ['Guru', 'Admin']);
  requireHakKhusus_(user, 'Galeri');
  deleteRowById_(getSheet_(SHEET_NAMES.GALERI), body.id);
  invalidateCache_('app_galeri_semua');
  return { message: 'Item galeri dihapus.' };
}

function editGaleriGuru_(body) {
  var user = requireAuth_(body.token, ['Guru', 'Admin']);
  requireHakKhusus_(user, 'Galeri');
  var vals = { Caption: body.caption, Kategori: body.kategori || '' };
  if (body.file) vals.URL = simpanFile_(body.file, 'Galeri', generateId_('GLR'));
  updateRowById_(getSheet_(SHEET_NAMES.GALERI), body.id, vals);
  invalidateCache_('app_galeri_semua');
  return { message: 'Item galeri berhasil diperbarui.' };
}

// ============================================================
// DOKUMEN PUBLIK
// ============================================================
function getDokumen_(kategori) {
  var items = getCached_('app_dokumen_semua', function () {
    return sheetToObjects_(getSheet_(SHEET_NAMES.DOKUMEN)).sort(function (a, b) { return new Date(b.Tanggal) - new Date(a.Tanggal); });
  });
  if (kategori) items = items.filter(function (r) { return r.Kategori === kategori; });
  return items;
}

function saveDokumenAdmin_(body) {
  requireAuth_(body.token, ['Admin']);
  var fileUrl = body.file ? simpanFile_(body.file, 'Dokumen', generateId_('DOK')) : (body.fileUrl || '');
  var id = generateId_('DOK');
  getSheet_(SHEET_NAMES.DOKUMEN).appendRow([id, body.kategori, body.namaDokumen, body.deskripsi || '', fileUrl, new Date()]);
  invalidateCache_('app_dokumen_semua');
  return { id: id, message: 'Dokumen berhasil dipublikasikan.' };
}

function deleteDokumenAdmin_(body) {
  requireAuth_(body.token, ['Admin']);
  deleteRowById_(getSheet_(SHEET_NAMES.DOKUMEN), body.id);
  invalidateCache_('app_dokumen_semua');
  return { message: 'Dokumen dihapus.' };
}

// ============================================================
// LAYANAN & PENGADUAN
// ============================================================
function kirimPengaduan_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_(SHEET_NAMES.PENGADUAN);
  var id = generateId_('PGD');
  var noTiket = 'TKT-' + new Date().getFullYear() + '-' + Utilities.formatString('%04d', sheet.getLastRow());
  var lampiranUrl = body.lampiran && body.lampiran.base64 ? simpanFile_(body.lampiran, 'Pengaduan', noTiket) : '';
  // Urutan kolom sesuai header: ..., Status, Tanggal, Balasan
  sheet.appendRow([id, noTiket, body.jenis, body.anonim ? '(Anonim)' : body.nama, body.kontak, body.email || '',
    body.anonim ? 'Ya' : 'Tidak', body.pesan, lampiranUrl, 'Baru', new Date(), '']);
  return { id: id, noTiket: noTiket, message: 'Pengaduan berhasil dikirim. Simpan nomor tiket Anda untuk melacak status.' };
  } finally {
    lock.releaseLock();
  }
}

function cekTiketPengaduan_(noTiket) {
  var found = sheetToObjects_(getSheet_(SHEET_NAMES.PENGADUAN)).filter(function (r) { return r.NoTiket === noTiket; })[0];
  if (!found) throw new Error('Nomor tiket tidak ditemukan');
  return found;
}

function listPengaduanAdmin_(body) {
  requireAuth_(body.token, ['Admin']);
  return sheetToObjects_(getSheet_(SHEET_NAMES.PENGADUAN)).sort(function (a, b) { return new Date(b.Tanggal) - new Date(a.Tanggal); });
}

function replyPengaduan_(body) {
  requireAuth_(body.token, ['Admin']);
  updateRowById_(getSheet_(SHEET_NAMES.PENGADUAN), body.id, { Status: body.status, Balasan: body.balasan || '' });
  return { message: 'Balasan tersimpan.' };
}

// ============================================================
// PPDB — PUBLIK
// ============================================================
function getPeriodeAktif_() {
  var found = sheetToObjects_(getSheet_(SHEET_NAMES.PERIODE)).filter(function (r) { return r.Status === 'Buka'; })[0];
  if (!found) return null;
  found.TotalMasuk = sheetToObjects_(getSheet_(SHEET_NAMES.PENDAFTAR)).filter(function (r) { return r.PeriodeID === found.ID; }).length;
  return found;
}

function daftarPPDB_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var periode = getPeriodeAktif_();
  if (!periode) throw new Error('Pendaftaran PPDB sedang tidak dibuka.');

  var sheet = getSheet_(SHEET_NAMES.PENDAFTAR);
  var id = generateId_('PDF');
  var noRegistrasi = 'REG-' + new Date().getFullYear() + '-' + Utilities.formatString('%05d', sheet.getLastRow());

  var files = body.files || {};
  var dokUmumUrl = files.dokumenUmum ? simpanFile_(files.dokumenUmum, 'PPDB', noRegistrasi + '_formulir', false) : '';
  // Berkas KTP & KK diset private (hanya dapat diakses panitia di Google Drive / Portal)
  var ktpUrl = files.ktpOrtu ? simpanFile_(files.ktpOrtu, 'PPDB', noRegistrasi + '_ktp', true) : '';
  var kkUrl = files.kk ? simpanFile_(files.kk, 'PPDB', noRegistrasi + '_kk', true) : '';
  var lainUrl = files.dokumenLain ? simpanFile_(files.dokumenLain, 'PPDB', noRegistrasi + '_pendukung', false) : '';

  if (!dokUmumUrl || !ktpUrl || !kkUrl) throw new Error('Dokumen wajib (Formulir, KTP Orang Tua, KK) belum lengkap.');

  sheet.appendRow([id, noRegistrasi, periode.ID, body.namaSiswa, body.tempatTglLahir, body.alamat, body.noHp,
    body.namaAyah, body.namaIbu, body.pekerjaanOrtu, body.noHpOrtu, dokUmumUrl, ktpUrl, kkUrl, lainUrl,
    'Terkirim', '', new Date()]);

  return { id: id, noRegistrasi: noRegistrasi, message: 'Pendaftaran berhasil! Simpan nomor registrasi Anda untuk mengecek status verifikasi berkas.' };
  } finally {
    lock.releaseLock();
  }
}

function cekStatusPPDB_(noRegistrasi, tanggalLahir) {
  if (!noRegistrasi) throw new Error('Nomor registrasi wajib diisi');
  var found = sheetToObjects_(getSheet_(SHEET_NAMES.PENDAFTAR)).filter(function (r) { return r.NoRegistrasi === noRegistrasi; })[0];
  if (!found) throw new Error('Nomor registrasi tidak ditemukan. Periksa kembali penulisannya.');
  if (tanggalLahir && String(found.TempatTglLahir).indexOf(tanggalLahir) === -1) throw new Error('Tanggal lahir tidak cocok dengan data pendaftar.');
  return {
    NoRegistrasi: found.NoRegistrasi, NamaSiswa: found.NamaSiswa, StatusVerifikasi: found.StatusVerifikasi,
    CatatanVerifikator: found.CatatanVerifikator, TanggalDaftar: found.TanggalDaftar
  };
}

// ============================================================
// PPDB — VERIFIKASI (Guru berhak khusus / Admin) (Fase 2)
// ============================================================
function getPPDBAntrean_(body) {
  var user = requireAuth_(body.token, ['Guru', 'Admin']);
  requireHakKhusus_(user, 'PPDB');
  return sheetToObjects_(getSheet_(SHEET_NAMES.PENDAFTAR)).sort(function (a, b) { return new Date(b.TanggalDaftar) - new Date(a.TanggalDaftar); });
}

function updateStatusPPDB_(body) {
  var user = requireAuth_(body.token, ['Guru', 'Admin']);
  requireHakKhusus_(user, 'PPDB');
  updateRowById_(getSheet_(SHEET_NAMES.PENDAFTAR), body.id, { StatusVerifikasi: body.status, CatatanVerifikator: body.catatan || '' });
  return { message: 'Status berhasil diperbarui.' };
}

// ============================================================
// PPDB — PENGATURAN PERIODE (Admin) (Fase 2)
// ============================================================
function listAllPeriode_(body) {
  requireAuth_(body.token, ['Admin']);
  return sheetToObjects_(getSheet_(SHEET_NAMES.PERIODE));
}

function savePeriode_(body) {
  requireAuth_(body.token, ['Admin']);
  var sheet = getSheet_(SHEET_NAMES.PERIODE);
  if (body.id) {
    updateRowById_(sheet, body.id, {
      TahunAjaran: body.tahunAjaran, TanggalBuka: new Date(body.tanggalBuka),
      TanggalTutup: new Date(body.tanggalTutup), Kuota: body.kuota, Status: body.status
    });
    return { message: 'Periode diperbarui.' };
  }
  var id = generateId_('PRD');
  sheet.appendRow([id, body.tahunAjaran, new Date(body.tanggalBuka), new Date(body.tanggalTutup), body.kuota, body.status || 'Tutup']);
  return { id: id, message: 'Periode baru dibuat.' };
}

// ============================================================
// MANAJEMEN GURU/ADMIN (Fase 2)
// ============================================================
function listGuru_(body) {
  requireAuth_(body.token, ['Admin']);
  // Jangan kirim hash password ke browser
  return sheetToObjects_(getSheet_(SHEET_NAMES.USERS)).map(function (u) {
    delete u.PasswordHash;
    return u;
  });
}

function saveGuru_(body) {
  requireAuth_(body.token, ['Admin']);
  var sheet = getSheet_(SHEET_NAMES.USERS);
  if (body.id) {
    var vals = { Nama: body.nama, Email: body.email, Role: body.role, HakKhusus: body.hakKhusus || '', Status: body.status || 'Aktif' };
    if (body.password) vals.PasswordHash = hashPassword_(body.password);
    updateRowById_(sheet, body.id, vals);
    return { message: 'Akun berhasil diperbarui.' };
  }
  var emailSudahAda = sheetToObjects_(sheet).some(function (u) { return u.Email === body.email; });
  if (emailSudahAda) throw new Error('Email sudah terdaftar.');
  var id = generateId_('USR');
  sheet.appendRow([id, body.nama, body.email, hashPassword_(body.password || 'ganti123'), body.role || 'Guru', body.hakKhusus || '', 'Aktif']);
  return { id: id, message: 'Akun berhasil dibuat.' };
}

function deleteGuru_(body) {
  var admin = requireAuth_(body.token, ['Admin']);
  if (String(admin.ID) === String(body.id)) throw new Error('Anda tidak dapat menonaktifkan akun Anda sendiri.');
  updateRowById_(getSheet_(SHEET_NAMES.USERS), body.id, { Status: 'Nonaktif' });
  return { message: 'Akun dinonaktifkan.' };
}

// ============================================================
// DASHBOARD ADMIN — STATISTIK RINGKAS (Fase 2)
// ============================================================
function getDashboardStats_(body) {
  requireAuth_(body.token, ['Admin']);
  var pendaftar = sheetToObjects_(getSheet_(SHEET_NAMES.PENDAFTAR));
  var konten = sheetToObjects_(getSheet_(SHEET_NAMES.KONTEN));
  var guru = sheetToObjects_(getSheet_(SHEET_NAMES.USERS)).filter(function (u) { return u.Status === 'Aktif'; });
  var pengaduanBaru = sheetToObjects_(getSheet_(SHEET_NAMES.PENGADUAN)).filter(function (p) { return p.Status === 'Baru'; });

  // Tren pendaftar 7 hari terakhir (untuk grafik)
  var tren = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    var next = new Date(d); next.setDate(d.getDate() + 1);
    tren.push({
      tanggal: Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd MMM'),
      jumlah: pendaftar.filter(function (p) { var t = new Date(p.TanggalDaftar); return t >= d && t < next; }).length
    });
  }
  // Distribusi konten per kategori (published)
  var perKategori = {};
  konten.filter(function (k) { return k.Status === 'Publish'; }).forEach(function (k) {
    perKategori[k.Kategori] = (perKategori[k.Kategori] || 0) + 1;
  });

  return {
    totalPendaftar: pendaftar.length,
    lolosBerkas: pendaftar.filter(function (p) { return p.StatusVerifikasi === 'Lolos Berkas'; }).length,
    kontenPublished: konten.filter(function (k) { return k.Status === 'Publish'; }).length,
    guruAktif: guru.length,
    pengaduanBaru: pengaduanBaru.length,
    trenPendaftar: tren,
    kontenPerKategori: perKategori
  };
}

// ============================================================
// UPLOAD FILE (base64 dari browser -> Google Drive)
// ============================================================
function simpanFile_(fileObj, subfolderName, fileNamePrefix, isPrivate) {
  if (!fileObj || !fileObj.base64) return '';
  var rawBase64 = fileObj.base64.split(',').pop();
  if (rawBase64.length > 11 * 1024 * 1024) {
    throw new Error('Ukuran file terlalu besar (maksimal 8MB). Silakan kompres berkas terlebih dahulu.');
  }
  var root = DriveApp.getFolderById(getConfig_().FOLDER_ID);
  var uploads = root.getFoldersByName('Uploads').next();
  var target = uploads.getFoldersByName(subfolderName).next();

  var contentType = fileObj.type || 'application/octet-stream';
  var bytes = Utilities.base64Decode(fileObj.base64.split(',').pop());
  var blob = Utilities.newBlob(bytes, contentType, fileNamePrefix + '_' + (fileObj.name || 'file'));
  var file = target.createFile(blob);
  if (!isPrivate) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  return file.getUrl();
}

/**
 * Pembersih sesi kadaluarsa di sheet Sessions secara otomatis
 */
function cleanupExpiredSessions() {
  try {
    var sheet = getSheet_(SHEET_NAMES.SESSIONS);
    var data = sheet.getDataRange().getValues();
    var expiryCol = data[0].indexOf('Expiry');
    if (expiryCol === -1) return;
    var now = new Date();
    for (var i = data.length - 1; i >= 1; i--) {
      var exp = new Date(data[i][expiryCol]);
      if (exp < now) {
        sheet.deleteRow(i + 1);
      }
    }
  } catch (e) {
    Logger.log('Gagal membersihkan sesi: ' + e.message);
  }
}