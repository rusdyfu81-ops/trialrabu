// Pengaturan: akun, ganti PIN, tahun aktif, backup & import, export data jemaat, error log.

function openPengaturan() {
  closeModal('modalFab');
  document.getElementById('displayEmail').textContent = DB.emailAktif() || '—';
  document.getElementById('importPreview').innerHTML = '';
  updateBackupLabel();
  loadLogViewer();
  document.getElementById('modalSettings').classList.add('open');
}

// ── GANTI PIN ─────────────────────────────────────────────────
async function changePin() {
  const oldPin = document.getElementById('settOldPin').value;
  const newPin = document.getElementById('settNewPin').value;
  const confirmPin = document.getElementById('settConfirmPin').value;

  if (!oldPin || !newPin || !confirmPin) { showToast('Isi semua field', 'error'); return; }
  if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { showToast('PIN harus 4 digit angka', 'error'); return; }
  if (newPin !== confirmPin) { showToast('Konfirmasi PIN tidak cocok', 'error'); return; }

  const btn = document.getElementById('changePinBtn');
  btn.disabled = true; btn.textContent = 'Memverifikasi...';

  try {
    const tersimpan = await DB.getPinHash();
    if (!tersimpan || tersimpan !== await sha256(oldPin)) {
      showToast('❌ PIN lama salah', 'error');
      btn.disabled = false; btn.innerHTML = ikon('gembok') + ' Ganti PIN';
      return;
    }
    await DB.setPinHash(await sha256(newPin));
    showToast('✅ PIN berhasil diganti!', 'success');
    document.getElementById('settOldPin').value = '';
    document.getElementById('settNewPin').value = '';
    document.getElementById('settConfirmPin').value = '';
  } catch (err) {
    appLog('error', 'changePin', err.message, err.stack);
    showToast('❌ Gagal: ' + pesanError(err), 'error');
  }
  btn.disabled = false; btn.innerHTML = ikon('gembok') + ' Ganti PIN';
}

// ── TAHUN AKTIF ───────────────────────────────────────────────
function changeTahun() {
  const newTahun = parseInt(document.getElementById('settTahun').value);
  if (!newTahun || newTahun === TAHUN_AKTIF) return;
  if (Object.keys(pendingChanges).length > 0) autoSavePending('ganti_tahun');
  TAHUN_AKTIF = newTahun;
  localStorage.setItem('gpbsi_tahun', String(TAHUN_AKTIF));
  closeModal('modalSettings');
  showToast(`📅 Tahun aktif: ${TAHUN_AKTIF}`, 'success');
  isDataReady = false;           // saatDataBerubah() akan membangun ulang halaman
  showLoading('Memuat data...');
  mulaiDengarSesi();
}

// ── J-11: BACKUP OTOMATIS ─────────────────────────────────────
const BACKUP_INTERVAL_DAYS = 7; // reminder tiap 7 hari

function getLastBackupDate() {
  return localStorage.getItem('gpbsi_last_backup') || null;
}

function setLastBackupDate() {
  const now = new Date().toISOString();
  localStorage.setItem('gpbsi_last_backup', now);
  updateBackupLabel();
  updateFabBackupSub();
}

function updateBackupLabel() {
  const el = document.getElementById('lastBackupLabel');
  if (!el) return;
  const last = getLastBackupDate();
  if (!last) { el.textContent = 'Belum pernah'; el.style.color = 'var(--red)'; return; }
  const d = new Date(last);
  const fmt = d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const daysDiff = Math.floor((Date.now() - d.getTime()) / 86400000);
  el.textContent = fmt;
  el.style.color = daysDiff >= BACKUP_INTERVAL_DAYS ? 'var(--red)' : 'var(--green)';
}

function updateFabBackupSub() {
  const el = document.getElementById('fabBackupSub');
  if (!el) return;
  const last = getLastBackupDate();
  if (!last) { el.textContent = 'Belum pernah backup!'; return; }
  const daysDiff = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  if (daysDiff >= BACKUP_INTERVAL_DAYS) {
    el.textContent = `Terakhir ${daysDiff} hari lalu — segera backup`;
  } else {
    el.textContent = `Terakhir ${daysDiff === 0 ? 'hari ini' : daysDiff + ' hari lalu'}`;
  }
}

function checkBackupReminder() {
  const last = getLastBackupDate();
  if (!last) {
    setTimeout(() => showToast('💾 Belum pernah backup! Buka menu + untuk backup.', 'warn'), 2000);
    return;
  }
  const daysDiff = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  if (daysDiff >= BACKUP_INTERVAL_DAYS) {
    setTimeout(() => showToast(`💾 Sudah ${daysDiff} hari tidak backup. Segera backup data!`, 'warn'), 2000);
  }
}

async function doBackup() {
  if (!RAW) {
    showToast('⚠️ Data belum dimuat. Buka app dulu.', '');
    return;
  }
  showLoading('Menyiapkan backup...');
  try {
    // Semua tahun, langsung dari Firestore
    const backup = await DB.exportBackup();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GPBSI_Backup_${Logic.isoLokal(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    setLastBackupDate();
    hideLoading();
    showToast(`✅ Backup berhasil! ${backup.jemaat.length} jemaat, ${backup.absensi.length} absensi.`, 'success');
  } catch (e) {
    hideLoading();
    appLog('error', 'doBackup', e.message, e.stack);
    showToast('❌ Backup gagal: ' + pesanError(e), '');
  }
}

// ── IMPORT BACKUP (migrasi dari aplikasi lama) ────────────────
let hasilImport = null;

function bacaFileImport(input) {
  const file = input.files && input.files[0];
  input.value = '';   // agar file yang sama bisa dipilih lagi
  if (!file) return;
  const el = document.getElementById('importPreview');
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      hasilImport = Logic.konversiBackup(JSON.parse(reader.result), IBADAH);
    } catch (e) {
      hasilImport = null;
      const pesan = e instanceof SyntaxError ? 'File bukan JSON yang valid.' : e.message;
      el.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px 0;display:flex;gap:6px;align-items:center;">${ikon('x-bulat')} ${esc(pesan)}</div>`;
      return;
    }
    let sudahAda = false;
    try { sudahAda = await DB.adaData(); } catch { /* anggap kosong */ }
    const r = hasilImport.ringkasan;
    const p = hasilImport.peringatan;
    el.innerHTML = `
      <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-top:10px;font-size:13px;line-height:1.7;">
        <div style="font-weight:800;margin-bottom:4px;display:flex;gap:6px;align-items:center;">${ikon('dokumen')} ${esc(file.name)}</div>
        <div style="display:flex;gap:6px;align-items:center;">${ikon('keluarga')} ${r.jemaat} jemaat</div>
        <div style="display:flex;gap:6px;align-items:center;">${ikon('daftar')} ${r.absensi} baris absensi → ${r.sesi} tanggal ibadah</div>
        ${p.length ? `<div style="margin-top:8px;color:var(--amber);font-weight:700;display:flex;gap:6px;align-items:center;">${ikon('peringatan')} ${p.length} peringatan:</div>
          <ul style="margin:4px 0 0 18px;color:var(--ink-3);font-size:12px;">${p.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${sudahAda ? `<div style="margin-top:8px;color:var(--red);font-weight:700;">Firebase sudah berisi data. Jemaat & tanggal yang ada di file ini akan MENGGANTIKAN data yang sama di Firebase.</div>` : ''}
        <button class="form-btn" id="importRunBtn" style="margin-top:10px;" onclick="jalankanImport()">${ikon('unggah')} Import Sekarang</button>
      </div>`;
  };
  reader.readAsText(file);
}

async function jalankanImport() {
  if (!hasilImport) return;
  const r = hasilImport.ringkasan;
  if (!confirm(`Import ${r.jemaat} jemaat dan ${r.sesi} tanggal ibadah ke Firebase?`)) return;
  const btn = document.getElementById('importRunBtn');
  btn.disabled = true;
  btn.textContent = 'Mengimport...';
  try {
    await DB.importBackup(hasilImport, (a, b) => { btn.textContent = `Mengimport... ${a}/${b}`; });
    hasilImport = null;
    document.getElementById('importPreview').innerHTML =
      '<div style="color:var(--green);font-size:13px;font-weight:700;padding:10px 0;display:flex;gap:6px;align-items:center;">' + ikon('cek-bulat') + ' Import selesai. Data tampil otomatis.</div>';
    showToast('✅ Import selesai', 'success');
  } catch (e) {
    appLog('error', 'jalankanImport', e.message, e.stack);
    showToast('❌ Import gagal: ' + pesanError(e), 'error');
    btn.disabled = false;
    btn.innerHTML = ikon('unggah') + ' Import Sekarang';
  }
}

// ── EXPORT DATA JEMAAT ────────────────────────────────────────
function exportJemaat() {
  if (!RAW) { showToast('Data belum dimuat', 'error'); return; }

  const cols = ['ID','NAMA','NAMA_LENGKAP','NICKNAME','KOMISI','IBADAH','STATUS',
                'JENIS_KELAMIN','HP_WA','KELUARGA_ID','KELUARGA_NAMA','TGL_LAHIR'];

  const rows = [cols];
  [...RAW.jemaat]
    .sort((a,b) => (a.keluarga_nama||'').localeCompare(b.keluarga_nama||'') || a.nama.localeCompare(b.nama))
    .forEach(m => {
      rows.push([
        m.id,
        '"' + (m.nama         ||'').replace(/"/g,'""') + '"',
        '"' + (m.nama_lengkap ||'').replace(/"/g,'""') + '"',
        '"' + (m.nickname     ||'').replace(/"/g,'""') + '"',
        '"' + (m.komisi       ||'').replace(/"/g,'""') + '"',
        '"' + (m.ibadah       ||'').replace(/"/g,'""') + '"',
        '"' + (m.status       ||'').replace(/"/g,'""') + '"',
        '"' + (m.jenis_kelamin||'').replace(/"/g,'""') + '"',
        '"' + (m.hp_wa        ||'').replace(/"/g,'""') + '"',
        '"' + (m.keluarga_id  ||'').replace(/"/g,'""') + '"',
        '"' + (m.keluarga_nama||'').replace(/"/g,'""') + '"',
        '"' + Logic.tampilTglLahir(m.tgl_lahir).replace(/"/g,'""') + '"',
      ]);
    });

  const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  const date = Logic.isoLokal(new Date());
  a.href = URL.createObjectURL(blob);
  a.download = `GPBSI_Jemaat_${date}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`✅ ${RAW.jemaat.length} jemaat diexport`, 'success');
}

// ── ERROR LOG ─────────────────────────────────────────────────
async function loadLogViewer() {
  const el = document.getElementById('logViewer');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--ink-4);font-size:13px;text-align:center;padding:16px 0;">Memuat...</div>';
  try {
    const logs = await DB.listLogs(50);
    if (!logs.length) {
      el.innerHTML = '<div style="color:var(--ink-4);font-size:13px;text-align:center;padding:20px 0;">Tidak ada error tercatat</div>';
      return;
    }
    el.innerHTML = logs.map(log => {
      const dt = new Date(log.created_at);
      const tgl = dt.toLocaleDateString('id-ID', { day:'2-digit', month:'short' });
      const jam = dt.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const detailHtml = log.detail
        ? `<div class="log-detail" onclick="this.classList.toggle('expanded')">${esc(log.detail)}</div>`
        : '';
      const konteksStr = log.konteks && Object.keys(log.konteks).length
        ? Object.entries(log.konteks).filter(([,v]) => v !== null).map(([k,v]) => `${k}: ${v}`).join(' · ')
        : '';
      return `<div class="log-entry ${esc(log.level)}">
        <div class="log-entry-header">
          <span class="log-level ${esc(log.level)}">${esc(log.level)}</span>
          <span class="log-fungsi">${esc(log.fungsi || '—')}</span>
          <span class="log-time">${tgl} ${jam}</span>
        </div>
        <div class="log-pesan">${esc(log.pesan)}</div>
        ${konteksStr ? `<div style="font-size:10px;color:var(--ink-4);margin-bottom:3px;">${esc(konteksStr)}</div>` : ''}
        ${detailHtml}
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div style="color:var(--red);font-size:13px;padding:12px 0;">Gagal muat log: ${esc(pesanError(e))}</div>`;
  }
}

async function clearLogs() {
  if (!confirm('Hapus semua error log?')) return;
  try {
    await DB.clearLogs();
    await loadLogViewer();
    showToast('✅ Log dihapus', 'success');
  } catch (e) {
    showToast('❌ Gagal hapus log: ' + pesanError(e), 'error');
  }
}
