// Inti aplikasi GPBSI: state bersama, login, PIN, data realtime, navigasi, dan utilitas tampilan.

const SERVICES    = IBADAH.map(ib => ib.nama);   // kode tampilan memakai SERVICES[currentService]
const BULAN_NAMES = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const BULAN_FULL  = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const u             = Logic.u;
const isAnak        = Logic.isAnak;
const getBulanLahir = Logic.bulanLahir;

let DB = null;

// ── STATE ────────────────────────────────────────────────────
let PIN = '';
let RAW = null;
let isDataReady = false; // data awal (jemaat + sesi) sudah termuat
let currentService = 0;
let selectedDate   = '';
let attState       = {};
let pendingChanges = {};
let komisiFilter   = '';
let keluargaFilterVal = '';
let sortByKeluarga = true;
let showNonAktif   = false; // tampilkan jemaat non-aktif/kuliah/meninggal
let alasanTarget   = null;
let alasanSelected = '';
let alasanPrevState = null;
let TAHUN_AKTIF    = new Date().getFullYear();

let pinMode = 'masuk';       // 'masuk' | 'buat' | 'ulang'
let pinBaruPertama = '';
let dataJemaat = null, dataSesi = null;
let metaJemaat = null, metaSesi = null;
let berhentiJemaat = null, berhentiSesi = null;

// ── ERROR LOG ────────────────────────────────────────────────
async function appLog(level = 'error', fungsi = '', pesan = '', detail = '', extraKonteks = {}) {
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  consoleFn(`[GPBSI ${level.toUpperCase()}] ${fungsi}: ${pesan}`, detail);
  if (!DB || !DB.emailAktif()) return;
  try {
    const konteks = {
      tanggal: selectedDate || null,
      ibadah: SERVICES[currentService] || null,
      tahun: TAHUN_AKTIF || null,
      url: window.location.href,
      ua: navigator.userAgent.substring(0, 120),
      ...extraKonteks
    };
    await DB.log({ level, fungsi, pesan, detail: String(detail || '').substring(0, 2000), konteks });
  } catch {
    // Logging gagal — jangan sampai ini menyebabkan error baru
  }
}

function pesanError(e) {
  const c = (e && e.code) || '';
  if (c === 'permission-denied') return 'Akun ini tidak punya izin mengakses data.';
  if (c === 'unavailable') return 'Tidak ada koneksi ke server.';
  return (e && e.message) || String(e);
}

// Tulis ke Firestore TANPA menunggu server: Firestore menyimpan di perangkat dulu dan mengirim saat online
// (indikator kuning sampai terkirim). Kalau server menolak (izin/dokumen hilang), pengguna diberi tahu.
function tulisLatar(promise, fungsi, konteks = {}) {
  promise.catch(err => {
    appLog('error', fungsi, err.message, err.stack, konteks);
    showToast('❌ Gagal menyimpan: ' + pesanError(err), 'error');
  });
}

// ── INDIKATOR SINKRON (titik di navbar) ──────────────────────
function realtimeSetDot(state) {
  // state: 'connecting' | 'connected' | 'disconnected'
  const dot = document.getElementById('realtimeDot');
  if (!dot) return;
  const colors = { connecting: '#f59e0b', connected: '#10b981', disconnected: '#6b7280' };
  const titles = { connecting: 'Menunggu sinkron ke server...', connected: 'Tersinkron ✓', disconnected: 'Offline — perubahan disimpan di perangkat' };
  dot.style.background = colors[state] || colors.disconnected;
  dot.title = titles[state] || '';
}

function perbaruiIndikator() {
  if (!navigator.onLine) return realtimeSetDot('disconnected');
  if (!metaJemaat || !metaSesi) return realtimeSetDot('connecting');
  const tertunda = [metaJemaat, metaSesi].some(m => m.hasPendingWrites || m.fromCache);
  realtimeSetDot(tertunda ? 'connecting' : 'connected');
}

// ── AWAL APLIKASI & LOGIN ────────────────────────────────────
function tampilkanLayar(id) {
  ['setupScreen', 'pinScreen', 'appScreen'].forEach(s =>
    document.getElementById(s).classList.toggle('active', s === id));
}

function initApp() {
  DB = buatDB(firebase, FIREBASE_CONFIG, IBADAH);
  buatTabIbadah();
  isiPilihanIbadahTanggal();
  showLoading('Menghubungkan...');
  DB.onAuth(user => {
    hideLoading();
    if (!user) {
      berhentiDengar();
      RAW = null; isDataReady = false;
      tampilkanLayar('setupScreen');
      return;
    }
    if (document.getElementById('appScreen').classList.contains('active')) return;
    siapkanPin();
  });
  window.addEventListener('online', perbaruiIndikator);
  window.addEventListener('offline', perbaruiIndikator);
}

function pesanLogin(e) {
  const c = (e && e.code) || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(c)) return 'Email atau password salah.';
  if (c === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Tunggu beberapa menit.';
  if (c === 'auth/network-request-failed') return 'Tidak ada koneksi internet.';
  return 'Gagal masuk: ' + ((e && e.message) || e);
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Isi email dan password.'; return; }
  btn.disabled = true;
  btn.textContent = 'Masuk...';
  try {
    await DB.login(email, password);
    document.getElementById('loginPassword').value = '';
    // DB.onAuth akan membuka layar PIN
  } catch (e) {
    errEl.textContent = pesanLogin(e);
  }
  btn.disabled = false;
  btn.textContent = 'Masuk';
}

async function doLogout() {
  if (!confirm('Keluar dari akun? Perangkat ini harus login ulang dengan email & password.')) return;
  if (Object.keys(pendingChanges).length > 0) await autoSavePending('logout');
  closeModal('modalSettings');
  await DB.logout();
}

// ── HELPER ───────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Format nama: huruf kapital hanya di huruf pertama setiap kata
function tc(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, function(c){ return c.toUpperCase(); });
}

// SHA-256 untuk PIN
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── PIN ──────────────────────────────────────────────────────
function setPinMode(mode) {
  pinMode = mode;
  const label = { masuk: 'Masukkan PIN', buat: 'Buat PIN baru (4 digit)', ulang: 'Ulangi PIN baru' }[mode];
  document.getElementById('pinLabel').textContent = label;
}

async function siapkanPin() {
  PIN = '';
  pinBaruPertama = '';
  updatePinDots();
  document.getElementById('pinError').textContent = '';
  showLoading('Memeriksa PIN...');
  try {
    setPinMode((await DB.getPinHash()) ? 'masuk' : 'buat');
  } catch (e) {
    setPinMode('masuk');
    document.getElementById('pinError').textContent = pesanError(e);
  }
  hideLoading();
  tampilkanLayar('pinScreen');
}

function pinInput(d) {
  // Cek kunci setelah 5x salah
  const lockout = parseInt(localStorage.getItem('pinLockoutUntil') || '0');
  if (pinMode === 'masuk' && Date.now() < lockout) {
    const secs = Math.ceil((lockout - Date.now()) / 1000);
    document.getElementById('pinError').textContent = `Terkunci. Coba lagi dalam ${secs} detik.`;
    return;
  }
  if (PIN.length >= 4) return;
  PIN += d;
  updatePinDots();
  if (PIN.length === 4) setTimeout(prosesPin, 200);
}
function pinDel() {
  PIN = PIN.slice(0, -1);
  updatePinDots();
  document.getElementById('pinError').textContent = '';
  document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('error'));
}
function updatePinDots() {
  document.querySelectorAll('.pin-dot').forEach((d,i) => {
    d.classList.toggle('filled', i < PIN.length);
  });
}

async function prosesPin() {
  if (pinMode === 'buat') {
    pinBaruPertama = PIN;
    PIN = '';
    updatePinDots();
    setPinMode('ulang');
    return;
  }
  if (pinMode === 'ulang') {
    if (PIN !== pinBaruPertama) {
      pinBaruPertama = '';
      pinError();
      setPinMode('buat');
      document.getElementById('pinError').textContent = 'PIN tidak sama. Ulangi dari awal.';
      return;
    }
    try {
      await DB.setPinHash(await sha256(PIN));
      showToast('✅ PIN berhasil dibuat', 'success');
      onPinOk();
    } catch (e) {
      pinError();
      setPinMode('buat');
      document.getElementById('pinError').textContent = 'Gagal menyimpan PIN: ' + pesanError(e);
    }
    return;
  }
  verifyPin();
}

async function verifyPin() {
  const lockout = parseInt(localStorage.getItem('pinLockoutUntil') || '0');
  if (Date.now() < lockout) {
    pinError();
    return;
  }
  try {
    const hashedInput = await sha256(PIN);
    const tersimpan = await DB.getPinHash();
    if (tersimpan && tersimpan === hashedInput) {
      localStorage.setItem('pinFailCount', '0');
      onPinOk();
    } else {
      let fails = parseInt(localStorage.getItem('pinFailCount') || '0') + 1;
      localStorage.setItem('pinFailCount', String(fails));
      if (fails >= 5) {
        const lockUntil = Date.now() + 60000; // kunci 60 detik
        localStorage.setItem('pinLockoutUntil', String(lockUntil));
        pinError();
        document.getElementById('pinError').textContent = 'Terlalu banyak percobaan. Tunggu 60 detik.';
        const iv = setInterval(() => {
          const remain = Math.ceil((lockUntil - Date.now()) / 1000);
          if (remain <= 0) {
            clearInterval(iv);
            document.getElementById('pinError').textContent = '';
            localStorage.setItem('pinFailCount', '0');
          } else {
            document.getElementById('pinError').textContent = `Terkunci. Coba lagi dalam ${remain} detik.`;
          }
        }, 1000);
      } else {
        pinError();
        document.getElementById('pinError').textContent = `PIN salah. Sisa ${5 - fails}x percobaan.`;
      }
    }
  } catch {
    pinError();
    document.getElementById('pinError').textContent = 'Tidak ada koneksi. Coba lagi.';
  }
}

function onPinOk() {
  tampilkanLayar('appScreen');
  requestAnimationFrame(() => updateNavPill());
  mulaiData();
}
function pinError() {
  document.querySelectorAll('.pin-dot').forEach(d => {
    d.classList.remove('filled');
    d.classList.add('error');
  });
  document.getElementById('pinError').textContent = 'PIN salah. Coba lagi.';
  PIN = '';
  setTimeout(() => {
    document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('error'));
  }, 800);
}

// ── DATA REALTIME (Firestore onSnapshot) ─────────────────────
function mulaiData() {
  const savedTahun = localStorage.getItem('gpbsi_tahun');
  if (savedTahun) TAHUN_AKTIF = parseInt(savedTahun);
  isiPilihanTahun();
  berhentiDengar();
  dataJemaat = null; metaJemaat = null;
  isDataReady = false;
  showLoading('Memuat data jemaat...');
  berhentiJemaat = DB.listenJemaat((docs, meta) => {
    dataJemaat = docs; metaJemaat = meta;
    saatDataBerubah();
  }, gagalDengar);
  mulaiDengarSesi();
}

// Isi pilihan "Tahun Aktif" di Pengaturan (dari loadData lama)
function isiPilihanTahun() {
  const tahunSelect = document.getElementById('settTahun');
  if (!tahunSelect) return;
  const currentYear = new Date().getFullYear();
  tahunSelect.innerHTML = '';
  for (let y = currentYear + 1; y >= 2026; y--) {
    tahunSelect.innerHTML += `<option value="${y}" ${y===TAHUN_AKTIF?'selected':''}>${y}</option>`;
  }
}

// Dipanggil juga saat tahun aktif diganti
function mulaiDengarSesi() {
  if (berhentiSesi) berhentiSesi();
  dataSesi = null; metaSesi = null;
  berhentiSesi = DB.listenSesiTahun(TAHUN_AKTIF, (docs, meta) => {
    dataSesi = docs; metaSesi = meta;
    saatDataBerubah();
  }, gagalDengar);
}

function berhentiDengar() {
  if (berhentiJemaat) { berhentiJemaat(); berhentiJemaat = null; }
  if (berhentiSesi) { berhentiSesi(); berhentiSesi = null; }
  realtimeSetDot('disconnected');
}

function gagalDengar(err) {
  hideLoading();
  appLog('error', 'listener', err.message, err.stack);
  showToast('❌ Gagal memuat: ' + pesanError(err), 'error');
  realtimeSetDot('disconnected');
}

function saatDataBerubah() {
  perbaruiIndikator();
  if (!dataJemaat || !dataSesi) return;
  RAW = Logic.bangunRaw(dataJemaat, dataSesi, IBADAH);
  if (!isDataReady) {
    isDataReady = true;
    hideLoading();
    initAttPage();
    renderHalamanAktif();
    checkBackupReminder();
    updateFabBackupSub();
    return;
  }
  segarkanTampilan();
}

function renderHalamanAktif() {
  if (document.getElementById('pageDash').classList.contains('active')) renderDashboard();
  if (document.getElementById('pageReport').classList.contains('active')) renderReport();
}

// Perubahan data (dari pengurus lain atau simpanan sendiri) → segarkan halaman Absensi
// tanpa menimpa jemaat yang sedang diubah pengurus ini (pendingChanges).
function segarkanTampilan() {
  const svc = SERVICES[currentService];
  const tanggalSvc = RAW.tanggals[svc] || [];
  if ((selectedDate && !tanggalSvc.includes(selectedDate)) || (!selectedDate && tanggalSvc.length)) {
    // Tanggal yang dibuka dihapus pengurus lain, atau tanggal pertama baru saja dibuat
    pendingChanges = {};
    updateSubmitBar();
    initAttPage();
    return;
  }
  if (!selectedDate) return;   // ibadah ini belum punya tanggal
  renderDateChips();
  getServiceMembers().forEach(m => {
    if (pendingChanges[m.id]) return;
    const e = Logic.catatanPada(RAW, m.id, svc, selectedDate);
    attState[m.id] = e ? { status: e.status_hadir, alasan: e.alasan || '' } : { status: 'Absen', alasan: '' };
  });
  if (document.getElementById('pageAtt').classList.contains('active')) {
    renderMembers();
    updateSubmitBar();
  }
}

// ── NAVIGASI ─────────────────────────────────────────────────
async function switchPage(page) {
  // Autosave jika ada pending changes sebelum pindah halaman
  if (Object.keys(pendingChanges).length > 0) {
    await autoSavePending('tab_switch');
  }
  document.getElementById('tabAtt').classList.toggle('active', page==='att');
  document.getElementById('tabDash').classList.toggle('active', page==='dash');
  document.getElementById('tabReport').classList.toggle('active', page==='report');
  document.getElementById('pageAtt').classList.toggle('active', page==='att');
  document.getElementById('pageDash').classList.toggle('active', page==='dash');
  document.getElementById('pageReport').classList.toggle('active', page==='report');
  document.getElementById('fabBtn').style.display = page==='att' ? 'flex' : 'none';
  if (page === 'dash' && RAW) renderDashboard();
  if (page === 'report' && RAW) renderReport();
  updateNavPill();
}

function updateNavPill() {
  const pill = document.getElementById('navTabPill');
  const activeTab = document.querySelector('.nav-tab.active');
  if (!pill || !activeTab) return;
  pill.style.width  = activeTab.offsetWidth + 'px';
  pill.style.transform = `translateX(${activeTab.offsetLeft - 3}px)`;
}

// ── MODAL, LOADING, TOAST ────────────────────────────────────
function closeModal(id, e) {
  if (e && e.target !== document.getElementById(id)) return;
  document.getElementById(id).classList.remove('open');
}
function showLoading(text='Memuat...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}
let toastTimer;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className='toast', 3000);
}
