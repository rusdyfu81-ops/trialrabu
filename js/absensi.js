// Halaman Absensi: tab ibadah, tanggal, daftar jemaat, simpan, tambah tanggal/jemaat, profil jemaat.

function ibadahAktif() { return IBADAH[currentService]; }

// Tab ibadah dibangun dari daftar IBADAH (config.js)
function buatTabIbadah() {
  document.getElementById('serviceTabs').innerHTML = IBADAH.map((ib, i) =>
    `<div class="service-tab${i === currentService ? ' active' : ''}" id="svcTab${i}" onclick="setService(${i})">${ikon(ib.ikon)}<span>${esc(ib.label)}</span></div>`
  ).join('');
}

function isiPilihanIbadahTanggal() {
  document.getElementById('newTanggalIbadah').innerHTML =
    IBADAH.map(ib => `<option value="${esc(ib.kode)}">${esc(ib.nama)}</option>`).join('');
}

// Usulan tanggal = hari ibadah terdekat berikutnya (Minggu untuk Ibadah 1/2, Rabu untuk Ibadah Rabu)
function usulkanTanggal() {
  const ib = IBADAH.find(x => x.kode === document.getElementById('newTanggalIbadah').value);
  if (ib) document.getElementById('newTanggal').value = Logic.tanggalBerikutnya(ib.hari);
}

// ── STICKY FILTER BAR: hitung top dinamis di bawah att-header ─
function updateFilterBarTop() {
  const header = document.getElementById('attHeader');
  const filterBar = document.getElementById('filterBar');
  if (header && filterBar) {
    filterBar.style.top = (60 + header.offsetHeight) + 'px';
  }
}

// J-09: Debounce search
let searchTimer;
function debouncedRender() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderMembers, 200);
}

// Kirim pendingChanges ke sesi yang sedang dibuka. Mengembalikan jumlah perubahan yang dikirim.
function kirimPerubahan(sumber) {
  const changes = pendingChanges;
  const n = Object.keys(changes).length;
  if (!n || !selectedDate) return 0;
  const ib = ibadahAktif();
  tulisLatar(DB.saveKehadiran(selectedDate, ib.kode, changes), sumber,
    { n_changes: n, tanggal: selectedDate, ibadah: ib.nama });
  pendingChanges = {};
  updateSubmitBar();
  return n;
}

// Simpan otomatis sebelum pindah halaman / tanggal / ibadah
async function autoSavePending(reason) {
  const n = kirimPerubahan('autoSavePending:' + reason);
  if (n && reason !== 'unload') showToast(`✅ Autosave: ${n} data tersimpan`, 'success');
}

window.addEventListener('beforeunload', () => {
  if (Object.keys(pendingChanges).length > 0) autoSavePending('unload');   // best effort
});

// ── INIT ABSENSI PAGE ─────────────────────────────────────────
function initAttPage() {
  if (!RAW) return;
  const dates   = RAW.tanggals[SERVICES[currentService]] || [];
  const members = getServiceMembers();

  selectedDate = dates[dates.length-1] || '';
  renderDateChips();
  updateDateBanner();

  // Reset non-aktif mode setiap kali halaman absensi di-init
  showNonAktif = false;

  const allKomisi = [...new Set(members.map(m => (m.komisi||'').toUpperCase()).filter(Boolean))].sort();
  const ks = document.getElementById('komisiFilter');
  ks.innerHTML = `<div class="filter-chip active" onclick="setKomisi('',this)">Semua</div>`;
  allKomisi.forEach(k => {
    ks.innerHTML += `<div class="filter-chip" onclick="setKomisi('${esc(k)}',this)">${esc(k)}</div>`;
  });
  komisiFilter = '';

  // Keluarga filter — normalisasi uppercase, deduplicate
  const allKeluarga = [...new Set(members.map(m => u(m.keluarga_nama)).filter(Boolean))].sort();
  const kf = document.getElementById('keluargaFilter');
  kf.innerHTML = `<div class="filter-chip active" onclick="setKeluarga('',this)" style="border-color:var(--purple);color:var(--purple);">${ikon('keluarga')} Semua</div>`;
  kf.innerHTML += `<div class="filter-chip${sortByKeluarga ? ' active' : ''}" onclick="toggleSortKeluarga(this)" style="border-color:var(--blue);${sortByKeluarga ? 'background:var(--blue);color:white;' : 'color:var(--blue);'}" id="sortKeluargaChip">${ikon('urut')} Sort: Keluarga</div>`;
  kf.innerHTML += `<div class="filter-chip" onclick="toggleNonAktif(this)" id="nonAktifChip" style="border-color:var(--amber);color:var(--amber);">${ikon('mata-tutup')} Non-Aktif / Kuliah</div>`;
  allKeluarga.forEach(k => {
    kf.innerHTML += `<div class="filter-chip" onclick="setKeluarga('${esc(k)}',this)">${esc(k)}</div>`;
  });
  keluargaFilterVal = '';

  document.getElementById('searchInput').value = '';
  loadAttState();
}

// Chip tanggal untuk ibadah aktif; chip aktif = selectedDate
function renderDateChips() {
  const dates  = RAW.tanggals[SERVICES[currentService]] || [];
  const scroll = document.getElementById('dateScroll');
  scroll.innerHTML = '';
  const todayStr = Logic.isoLokal(new Date());
  dates.forEach(date => {
    const dt   = new Date(date + 'T00:00:00');
    const chip = document.createElement('div');
    chip.className = 'date-chip' + (date === selectedDate ? ' active' : '') + (date === todayStr ? ' today' : '');
    chip.innerHTML = `<span class="day">${dt.getDate()}</span><span class="mon">${BULAN_NAMES[dt.getMonth()+1]}</span>`;
    chip.onclick = () => selectDate(date, chip);
    // Tekan lama untuk hapus tanggal
    let pressTimer;
    chip.addEventListener('touchstart', () => { pressTimer = setTimeout(() => deleteTanggal(date), 800); });
    chip.addEventListener('touchend', () => clearTimeout(pressTimer));
    chip.addEventListener('touchmove', () => clearTimeout(pressTimer));
    chip.addEventListener('contextmenu', (e) => { e.preventDefault(); deleteTanggal(date); });
    scroll.appendChild(chip);
  });
}

// Peserta ibadah aktif. Mode normal: hanya jemaat aktif. Mode Non-Aktif: HANYA yang non-aktif.
function getServiceMembers() {
  if (!RAW) return [];
  const ib = ibadahAktif();
  return RAW.jemaat.filter(m => {
    if (showNonAktif ? Logic.isAktif(m) : !Logic.isAktif(m)) return false;
    return Logic.ikutIbadah(m, ib);
  });
}

function updateDateBanner() {
  if (!selectedDate) {
    document.getElementById('activeDateVal').textContent = 'Belum ada tanggal';
    return;
  }
  const dt = new Date(selectedDate + 'T00:00:00');
  const label = dt.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('activeDateVal').textContent = label;
}

function toggleDatePicker() {
  const wrap = document.getElementById('dateScrollWrap');
  wrap.style.display = wrap.style.display === 'block' ? 'none' : 'block';
  setTimeout(updateFilterBarTop, 50);
}

async function selectDate(date, chip) {
  if (Object.keys(pendingChanges).length > 0) {
    await autoSavePending('date_switch');
  }
  selectedDate = date;
  document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  pendingChanges = {};
  updateSubmitBar();
  updateDateBanner();
  document.getElementById('dateScrollWrap').style.display = 'none';
  loadAttState();
}

function loadAttState() {
  if (!RAW) return;
  if (!selectedDate) {
    // Ibadah ini belum punya tanggal (misal tab Rabu yang baru) — jangan tampilkan daftar ibadah lain
    attState = {};
    ['statHadir', 'statAbsen', 'statTotal'].forEach(id => { document.getElementById(id).textContent = '0'; });
    document.getElementById('navBadge').textContent = '—';
    document.getElementById('memberList').innerHTML =
      '<div class="empty"><div class="empty-icon">' + ikon('kalender') + '</div><div class="empty-text">Belum ada tanggal ibadah. Tekan ＋ → Tanggal Ibadah Baru.</div></div>';
    return;
  }
  const svcName = SERVICES[currentService];
  const members = getServiceMembers();
  attState = {};
  members.forEach(m => {
    const rec = (RAW.absensi_map[m.id] || {})[svcName] || {};
    const entry = rec[selectedDate];
    attState[m.id] = entry
      ? { status: entry.status_hadir, alasan: entry.alasan || '' }
      : { status: 'Absen', alasan: '' };
  });
  renderMembers();
}

function setKomisi(val, el) {
  komisiFilter = val;
  document.querySelectorAll('#komisiFilter .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderMembers();
}

function setKeluarga(val, el) {
  keluargaFilterVal = val;
  document.querySelectorAll('#keluargaFilter .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  // Keep sort chip state separate
  const sortChip = document.getElementById('sortKeluargaChip');
  if (sortChip && sortByKeluarga) sortChip.classList.add('active');
  renderMembers();
}

function toggleNonAktif(el) {
  showNonAktif = !showNonAktif;
  el.classList.toggle('active', showNonAktif);
  el.style.background   = showNonAktif ? 'var(--amber)' : '';
  el.style.color        = showNonAktif ? 'white' : 'var(--amber)';
  el.style.borderColor  = 'var(--amber)';
  komisiFilter    = '';
  keluargaFilterVal = '';
  // reset komisi chips ke "Semua"
  document.querySelectorAll('#komisiFilter .filter-chip').forEach((c,i) => c.classList.toggle('active', i===0));
  renderMembers();
}

function toggleSortKeluarga(el) {
  sortByKeluarga = !sortByKeluarga;
  el.classList.toggle('active', sortByKeluarga);
  el.innerHTML = ikon('urut') + (sortByKeluarga ? ' Sort: Keluarga' : ' Sort Keluarga');
  el.style.background = sortByKeluarga ? 'var(--blue)' : '';
  el.style.color = sortByKeluarga ? 'white' : 'var(--blue)';
  el.style.borderColor = 'var(--blue)';
  renderMembers();
}

async function setService(idx) {
  if (Object.keys(pendingChanges).length > 0) {
    await autoSavePending('service_switch');
  }
  currentService = idx;
  SERVICES.forEach((_,i) => {
    document.getElementById('svcTab'+i).classList.toggle('active', i===idx);
  });
  pendingChanges = {};
  updateSubmitBar();
  initAttPage();
}

// ── AVATAR COLOR HELPER ───────────────────────────────────────
function avatarClass(nama) {
  const first = (nama || '').trim()[0] || 'A';
  return 'avatar-' + first.toLowerCase().replace(/[^a-z]/g, 'p');
}

// ── RENDER MEMBERS ────────────────────────────────────────────
function renderMembers() {
  if (!RAW) return;
  const members = getServiceMembers();
  const q = document.getElementById('searchInput').value.toLowerCase();
  const svcName = SERVICES[currentService];
  const bulanIni = new Date().getMonth() + 1;

  let filtered = members;
  if (komisiFilter) filtered = filtered.filter(m => (m.komisi||'').toUpperCase() === komisiFilter);
  if (keluargaFilterVal) filtered = filtered.filter(m => u(m.keluarga_nama) === u(keluargaFilterVal));
  if (q) {
    // Cari nama yang cocok, lalu tampilkan seluruh anggota keluarga yang sama
    const matchedFamilies = new Set(
      filtered.filter(m => m.nama.toLowerCase().includes(q) && m.keluarga_nama)
              .map(m => m.keluarga_nama)
    );
    filtered = filtered.filter(m =>
      m.nama.toLowerCase().includes(q) ||
      (m.keluarga_nama && matchedFamilies.has(m.keluarga_nama))
    );
  }

  // Sort by keluarga if enabled
  if (sortByKeluarga) {
    filtered = [...filtered].sort((a, b) => {
      const famA = u(a.keluarga_nama) || 'ZZZ';
      const famB = u(b.keluarga_nama) || 'ZZZ';
      if (famA !== famB) return famA.localeCompare(famB);
      return a.nama.localeCompare(b.nama);
    });
  }

  const hadirCount = members.filter(m => attState[m.id]?.status === 'Hadir').length;
  const totalCount = members.length;
  const hadirPct   = totalCount ? Math.round(hadirCount / totalCount * 100) : 0;
  const absenPct   = totalCount ? Math.round((totalCount - hadirCount) / totalCount * 100) : 0;
  document.getElementById('statHadir').textContent = hadirCount;
  document.getElementById('statAbsen').textContent  = totalCount - hadirCount;
  document.getElementById('statTotal').textContent  = totalCount;
  document.getElementById('navBadge').textContent   = `${hadirCount}/${totalCount}`;
  // Progress bars
  const pbH = document.getElementById('pbHadir'); if (pbH) pbH.style.width = hadirPct + '%';
  const pbA = document.getElementById('pbAbsen'); if (pbA) pbA.style.width = absenPct + '%';

  const list = document.getElementById('memberList');
  updateFilterBarTop();

  // Banner saat mode non-aktif aktif
  const bannerHtml = showNonAktif
    ? `<div style="background:var(--amber-l);border:1.5px solid var(--amber);border-radius:10px;padding:10px 14px;margin-bottom:8px;font-size:12px;font-weight:700;color:var(--amber);">
        ${ikon('mata-tutup')} Mode Non-Aktif — Tap nama untuk Edit → ubah Status ke <b>Aktif</b> untuk mengaktifkan kembali. Tap chip <b>Non-Aktif / Kuliah</b> lagi untuk kembali ke daftar normal.
       </div>`
    : '';

  if (!filtered.length) {
    list.innerHTML = bannerHtml + '<div class="empty"><div class="empty-icon">' + ikon('cari') + '</div><div class="empty-text">Tidak ditemukan</div></div>';
    return;
  }

  let lastKeluarga = '';
  list.innerHTML = bannerHtml + filtered.map((m, idx) => {
    // Keluarga separator when sorted by keluarga
    let keluargaHeader = '';
    if (sortByKeluarga || keluargaFilterVal) {
      const fam = u(m.keluarga_nama) || 'TANPA KELUARGA';
      if (fam !== lastKeluarga) {
        lastKeluarga = fam;
        keluargaHeader = `<div class="fam-head${idx>0?' pisah':''}">${ikon('rumah')} ${esc(fam)}</div>`;
      }
    }

    const state    = attState[m.id] || { status:'Absen', alasan:'' };
    const isHadir  = state.status === 'Hadir';
    const alasan   = state.alasan || '';
    const initials = m.nama.trim().split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
    const safe     = m.nama.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');

    const svcMap = (RAW.absensi_map[m.id] || {})[svcName] || {};
    const dates  = RAW.tanggals[svcName] || [];
    const hadirN = dates.filter(d => svcMap[d]?.status_hadir === 'Hadir').length;
    const rate   = dates.length ? Math.round(hadirN / dates.length * 100) : 0;
    const rateColor = rate>=80?'var(--green)':rate>=50?'var(--amber)':'var(--red)';

    let streak = 0;
    for (let i = dates.length-1; i >= 0; i--) {
      if ((svcMap[dates[i]]?.status_hadir || 'Absen') !== 'Hadir') streak++;
      else break;
    }

    const bulanM = getBulanLahir(m);
    const isBday = bulanM && bulanM === bulanIni;

    const cardClass = [
      'member-card',
      isHadir ? 'is-hadir' : (alasan ? 'is-absen-alasan' : ''),
      streak >= 3 && !isHadir ? 'alert-absen' : ''
    ].filter(Boolean).join(' ');

    return `${keluargaHeader}<div class="${cardClass}">
      <div class="member-avatar ${avatarClass(m.nama)}" onclick="openMemberDetail(${m.id})">${esc(initials)}</div>
      <div class="member-info" onclick="openMemberDetail(${m.id})">
        <div class="member-name">
          ${esc(tc(m.nama))}
          ${isBday ? '<span class="birthday-badge">' + ikon('kue') + '</span>' : ''}
        </div>
        <div class="member-meta">
          <span>${esc(m.komisi)}</span>
          <span style="color:${rateColor}" class="member-rate">${rate}%</span>
          ${showNonAktif && m.status ? `<span class="status-badge ${(m.status||'').toLowerCase().replace('-','')}">${esc(m.status)}</span>` : ''}
          ${streak >= 3 && !isHadir ? `<span class="absen-streak">${ikon('peringatan')} ${streak}x absen</span>` : ''}
        </div>
      </div>
      <div class="toggle-wrap">
        <div class="toggle ${isHadir?'on':''}" onclick="toggleMember(${m.id})"></div>
        ${!isHadir && alasan ? `<div class="alasan-tag">${esc(alasan)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── TOGGLE MEMBER ─────────────────────────────────────────────
function toggleMember(jid) {
  const cur = attState[jid] || { status:'Absen', alasan:'' };
  if (cur.status === 'Hadir') {
    alasanPrevState = { jid, status: cur.status, alasan: cur.alasan };
    attState[jid] = { status: 'Absen', alasan: '' };
    pendingChanges[jid] = { status_hadir: 'Absen', alasan: '' };
    openAlasanModal(jid);
  } else {
    attState[jid] = { status: 'Hadir', alasan: '' };
    pendingChanges[jid] = { status_hadir: 'Hadir', alasan: '' };
  }
  updateSubmitBar();
  renderMembers();
}

// ── ALASAN MODAL ──────────────────────────────────────────────
function openAlasanModal(jid) {
  const m = RAW.jemaat.find(x => x.id === jid);
  alasanTarget   = jid;
  alasanSelected = '';
  document.getElementById('alasanMemberName').textContent = m ? tc(m.nama) : jid;
  document.querySelectorAll('.alasan-opt').forEach(o => o.classList.remove('selected'));
  document.getElementById('modalAlasan').classList.add('open');
}
function selectAlasan(val) {
  alasanSelected = val;
  document.querySelectorAll('.alasan-opt').forEach(o => {
    o.classList.toggle('selected', o.querySelector('.alasan-opt-label').textContent.trim() === val
      || (val === 'Tanpa Keterangan' && o.querySelector('.alasan-opt-label').textContent.includes('Tanpa')));
  });
}
function confirmAlasan() {
  if (alasanTarget) {
    attState[alasanTarget].alasan = alasanSelected;
    if (pendingChanges[alasanTarget]) pendingChanges[alasanTarget].alasan = alasanSelected;
  }
  alasanPrevState = null;
  closeModalAlasan();
  renderMembers();
}
// [FIX] Cancel alasan — revert to previous state
function cancelAlasan() {
  if (alasanPrevState) {
    attState[alasanPrevState.jid] = { status: alasanPrevState.status, alasan: alasanPrevState.alasan };
    delete pendingChanges[alasanPrevState.jid];
    alasanPrevState = null;
    updateSubmitBar();
  }
  closeModalAlasan();
  renderMembers();
}
function closeModalAlasan(e) {
  if (e && e.target !== document.getElementById('modalAlasan')) return;
  // If closing by clicking overlay without confirm, revert
  if (alasanPrevState) {
    cancelAlasan();
    return;
  }
  document.getElementById('modalAlasan').classList.remove('open');
}

// ── MEMBER DETAIL MODAL ───────────────────────────────────────
function openMemberDetail(jid) {
  const svcName = SERVICES[currentService];
  const m = RAW.jemaat.find(x => x.id === jid);
  if (!m) return;

  const svcMap = (RAW.absensi_map[m.id] || {})[svcName] || {};
  const dates  = RAW.tanggals[svcName] || [];
  const hadirN = dates.filter(d => svcMap[d]?.status_hadir === 'Hadir').length;
  const rate   = dates.length ? Math.round(hadirN / dates.length * 100) : 0;
  const rateColor = rate>=80?'var(--green)':rate>=50?'var(--amber)':'var(--red)';
  const initials = m.nama.trim().split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
  const safe     = m.nama.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
  const bulanIni = new Date().getMonth() + 1;
  const bulanM   = getBulanLahir(m);
  const isBday   = bulanM && bulanM === bulanIni;

  const historyRows = dates.slice().reverse().map(date => {
    const dt    = new Date(date + 'T00:00:00');
    const label = dt.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
    const entry = svcMap[date];
    const st    = entry?.status_hadir || 'Absen';
    const al    = entry?.alasan || '';
    const badgeClass = st === 'Hadir' ? 'hadir' : (al ? 'absen-alasan' : 'absen');
    const badgeText  = st === 'Hadir' ? '✓ Hadir' : (al ? '✗ ' + esc(al) : '✗ Absen');
    return `<div class="history-row">
      <div class="history-date">${label}</div>
      <div class="history-badge ${badgeClass}">${badgeText}</div>
    </div>`;
  }).join('');

  const waBtn = m.hp_wa
    ? `<a class="wa-btn" href="https://wa.me/${m.hp_wa.replace(/\D/g,'')}" target="_blank">${ikon('pesan')} WhatsApp ${esc(m.nama.split(' ')[0])}</a>`
    : '';

  const namaLengkap  = m.nama_lengkap && m.nama_lengkap !== m.nama ? esc(m.nama_lengkap) : '';
  const keluargaInfo = m.keluarga_nama ? `${ikon('rumah')} ${esc(m.keluarga_nama)}` : '';
  const tglLahirInfo = m.tgl_lahir ? `${ikon(isBday ? 'kue' : 'kalender')} ${esc(Logic.tampilTglLahir(m.tgl_lahir))}${isBday ? ' — Ulang Tahun Bulan Ini!' : ''}` : '';
  const jenisKel     = m.jenis_kelamin ? ikon('orang') + ' ' + esc(m.jenis_kelamin) : '';

  const statusLabel = m.status && m.status !== 'Aktif' ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:${m.status==='Meninggal'?'var(--ink-4)':m.status==='Kuliah'?'var(--blue-l)':'var(--amber-l)'};color:${m.status==='Meninggal'?'white':m.status==='Kuliah'?'var(--blue)':'var(--amber)'};">${esc(m.status)}</span>` : '';

  document.getElementById('modalMemberBody').innerHTML = `
    <div class="member-detail-header">
      <div class="member-detail-avatar ${isBday?'':''+avatarClass(m.nama)}" style="${isBday?'background:var(--purple)':''}">${isBday?ikon('kue'):esc(initials)}</div>
      <div style="flex:1;min-width:0;">
        <div class="member-detail-name">${esc(tc(m.nama))} ${statusLabel}</div>
        ${namaLengkap ? `<div style="font-size:12px;color:var(--ink-3);margin-top:1px;">${namaLengkap}</div>` : ''}
        <div class="member-detail-komisi">${esc(m.komisi)} · ${esc(m.ibadah)}</div>
      </div>
    </div>
    ${(keluargaInfo||tglLahirInfo||jenisKel) ? `
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:16px;display:flex;flex-direction:column;gap:6px;">
      ${jenisKel ? `<div style="font-size:13px;color:var(--ink-2);">${jenisKel}</div>` : ''}
      ${tglLahirInfo ? `<div style="font-size:13px;color:${isBday?'var(--purple)':'var(--ink-2)'};">${tglLahirInfo}</div>` : ''}
      ${keluargaInfo ? `<div style="font-size:13px;color:var(--ink-2);">${keluargaInfo}</div>` : ''}
    </div>` : ''}
    <div class="member-stats-row">
      <div class="member-stat">
        <div class="member-stat-num" style="color:${rateColor}">${rate}%</div>
        <div class="member-stat-label">Kehadiran</div>
      </div>
      <div class="member-stat">
        <div class="member-stat-num" style="color:var(--green)">${hadirN}</div>
        <div class="member-stat-label">Hadir</div>
      </div>
      <div class="member-stat">
        <div class="member-stat-num" style="color:var(--red)">${dates.length - hadirN}</div>
        <div class="member-stat-label">Absen</div>
      </div>
    </div>
    <div style="font-size:12px;font-weight:800;color:var(--ink-3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Riwayat</div>
    ${historyRows || '<div style="color:var(--ink-4);font-size:13px;padding:12px 0;">Belum ada data</div>'}
    ${waBtn}
    <button onclick="openEditProfile(${m.id})" style="width:100%;height:48px;background:var(--ink);color:white;border-radius:12px;border:none;font-size:15px;font-weight:800;font-family:var(--font);cursor:pointer;margin-top:8px;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;">${ikon('pensil')} Edit Profil</button>
    <div style="height:4px;"></div>`;

  document.getElementById('modalMember').classList.add('open');
}
function closeModalMember(e) {
  if (e && e.target !== document.getElementById('modalMember')) return;
  document.getElementById('modalMember').classList.remove('open');
}

// ── EDIT PROFILE ──────────────────────────────────────────────
function openEditProfile(jid) {
  const m = RAW.jemaat.find(x => x.id === jid);
  if (!m) return;

  closeModalMember();
  document.getElementById('modalMember').classList.remove('open');

  document.getElementById('editNamaKey').value = m.id;
  document.getElementById('editNamaBaru').value = m.nama;
  document.getElementById('editStatus').value = m.status || 'Aktif';
  document.getElementById('editKomisi').value = m.komisi || '';
  document.getElementById('editIbadah').value = m.ibadah || 'Keduanya';
  document.getElementById('editKeluargaNama').value = m.keluarga_nama || '';
  document.getElementById('editHpWa').value = m.hp_wa || '';
  document.getElementById('editJenisKelamin').value = m.jenis_kelamin || '';
  document.getElementById('editTglLahir').value = Logic.tampilTglLahir(m.tgl_lahir || '');

  setTimeout(() => {
    document.getElementById('modalEdit').classList.add('open');
  }, 200);
}

async function saveEditProfile() {
  const jid = parseInt(document.getElementById('editNamaKey').value);
  if (!jid) return;
  const m = RAW.jemaat.find(x => x.id === jid);
  if (!m) return;

  const namaBaru = document.getElementById('editNamaBaru').value.trim().toUpperCase();
  if (!namaBaru) { showToast('Nama tidak boleh kosong', 'error'); return; }

  // Cek apakah nama sudah dipakai jemaat lain
  const namaConflict = RAW.jemaat.find(x => x.id !== jid && x.nama.toUpperCase() === namaBaru);
  if (namaConflict) { showToast('❌ Nama sudah dipakai jemaat lain', 'error'); return; }

  // Tanggal lahir: diinput DD/MM/YYYY, disimpan YYYY-MM-DD.
  // Nilai lama yang tidak terbaca boleh dibiarkan apa adanya selama tidak diubah.
  const tglInput = document.getElementById('editTglLahir').value.trim();
  let tglLahir = '';
  if (tglInput) {
    tglLahir = Logic.normTglLahir(tglInput);
    if (!tglLahir) {
      if (tglInput !== (m.tgl_lahir || '')) { showToast('❌ Tanggal lahir tidak valid. Contoh: 17/04/1980', 'error'); return; }
      tglLahir = tglInput;
    }
  }

  const updates = {
    nama: namaBaru,
    status: document.getElementById('editStatus').value,
    komisi: u(document.getElementById('editKomisi').value),
    ibadah: document.getElementById('editIbadah').value,
    keluarga_nama: u(document.getElementById('editKeluargaNama').value),
    hp_wa: document.getElementById('editHpWa').value.trim(),
    jenis_kelamin: document.getElementById('editJenisKelamin').value,
    tgl_lahir: tglLahir
  };

  tulisLatar(DB.updateJemaat(jid, updates), 'saveEditProfile', { jemaat_id: jid });
  Object.assign(m, updates);   // tampil langsung; data server menyusul lewat realtime
  showToast('✅ Profil berhasil diperbarui', 'success');
  closeModal('modalEdit');
  if (document.getElementById('pageAtt').classList.contains('active')) initAttPage();
}

// Hapus jemaat (catatan kehadirannya di sesi lama dibiarkan, tidak ditampilkan lagi)
function deleteJemaat() {
  const jid = parseInt(document.getElementById('editNamaKey').value);
  if (!jid) return;
  const m = RAW.jemaat.find(x => x.id === jid);
  if (!m) return;

  const confirmName = prompt(`Ketik nama "${m.nama}" untuk konfirmasi hapus:`);
  if (!confirmName || confirmName.trim().toUpperCase() !== m.nama.trim().toUpperCase()) {
    showToast('Nama tidak cocok. Hapus dibatalkan.', 'error');
    return;
  }

  tulisLatar(DB.deleteJemaat(jid), 'deleteJemaat', { jemaat_id: jid });
  RAW.jemaat = RAW.jemaat.filter(x => x.id !== jid);
  delete pendingChanges[jid];
  showToast(`✅ ${m.nama} telah dihapus`, 'success');
  closeModal('modalEdit');
  initAttPage();
}

// Hapus tanggal ibadah (tekan lama / klik kanan chip tanggal)
function deleteTanggal(date) {
  const ib = ibadahAktif();
  const dt = new Date(date + 'T00:00:00');
  const label = dt.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });

  if (!confirm(`Hapus tanggal ${label} (${ib.nama})?\n\nSemua data absensi untuk tanggal ini akan dihapus permanen.`)) return;
  if (!confirm(`YAKIN? Ketik OK untuk konfirmasi.`)) return;

  tulisLatar(DB.deleteSesi(date, ib.kode), 'deleteTanggal', { tanggal: date, ibadah: ib.nama });
  RAW.tanggals[ib.nama] = (RAW.tanggals[ib.nama] || []).filter(t => t !== date);
  if (date === selectedDate) { pendingChanges = {}; updateSubmitBar(); }
  showToast(`✅ Tanggal ${label} dihapus`, 'success');
  initAttPage();
}

// ── SUBMIT BATCH ──────────────────────────────────────────────
function updateSubmitBar() {
  const n   = Object.keys(pendingChanges).length;
  const bar = document.getElementById('submitBar');
  const btn = document.getElementById('submitBtn');
  bar.style.display = n > 0 ? 'block' : 'none';
  btn.innerHTML = `${ikon('simpan')} Simpan ${n} perubahan`;
  btn.title = 'Atau akan tersimpan otomatis saat ganti halaman';
}

function submitBatch() {
  const n = kirimPerubahan('submitBatch');
  if (n) showToast(`✅ ${n} data tersimpan`, 'success');
  renderMembers();
}

// ── FAB MENU ──────────────────────────────────────────────────
function openFabMenu() {
  document.getElementById('modalFab').classList.add('open');
}
function openAddJemaat() {
  closeModal('modalFab');
  // [FIX] Reset form
  document.getElementById('newNama').value = '';
  document.getElementById('newHpWa').value = '';
  document.getElementById('newTglLahir').value = '';
  document.getElementById('newKomisi').selectedIndex = 0;
  document.getElementById('newIbadah').selectedIndex = 0;
  document.getElementById('newJenisKelamin').selectedIndex = 0;
  document.getElementById('modalJemaat').classList.add('open');
}

function openAddTanggal() {
  closeModal('modalFab');
  document.getElementById('newTanggalIbadah').value = ibadahAktif().kode;
  usulkanTanggal();
  document.getElementById('modalTanggal').classList.add('open');
}

async function submitAddTanggal() {
  const tanggal = document.getElementById('newTanggal').value;
  const ib = IBADAH.find(x => x.kode === document.getElementById('newTanggalIbadah').value);
  if (!tanggal) { showToast('Pilih tanggal dulu', 'error'); return; }
  if ((RAW.tanggals[ib.nama] || []).includes(tanggal)) { showToast(`Tanggal ini sudah ada di ${ib.nama}`, 'error'); return; }

  tulisLatar(DB.createSesi(tanggal, ib.kode), 'submitAddTanggal', { tanggal, ibadah: ib.nama });
  closeModal('modalTanggal');

  const tahun = parseInt(tanggal.slice(0, 4), 10);
  if (tahun !== TAHUN_AKTIF) {
    showToast(`✅ Tanggal ditambahkan ke tahun ${tahun}. Ganti Tahun Aktif di Pengaturan untuk melihatnya.`, 'success');
    return;
  }
  showToast('✅ Tanggal ditambahkan!', 'success');
  // Tampilkan langsung (data server menyusul lewat realtime), lalu buka ibadah tanggal baru itu
  RAW.tanggals[ib.nama] = [...(RAW.tanggals[ib.nama] || []), tanggal].sort();
  const idx = IBADAH.indexOf(ib);
  if (idx !== currentService) { await setService(idx); return; }
  if (Object.keys(pendingChanges).length > 0) await autoSavePending('add_date');
  initAttPage();
}

async function submitAddJemaat() {
  const nama = document.getElementById('newNama').value.trim().toUpperCase();
  if (!nama) { showToast('Nama tidak boleh kosong', 'error'); return; }

  // Cek duplikat lokal (Firestore tidak punya aturan nama unik)
  if (RAW && RAW.jemaat.find(m => m.nama.toUpperCase() === nama)) {
    showToast(`❌ "${nama}" sudah terdaftar`, 'error');
    return;
  }

  const btn = document.getElementById('addJemaatBtn');
  btn.disabled = true; btn.textContent = 'Mendaftarkan...';

  const tglInput = document.getElementById('newTglLahir').value;   // input date → YYYY-MM-DD
  try {
    await DB.addJemaat({
      nama,
      nama_lengkap: '',
      nickname: '',
      komisi: u(document.getElementById('newKomisi').value),
      ibadah: document.getElementById('newIbadah').value,
      status: 'Aktif',
      jenis_kelamin: document.getElementById('newJenisKelamin').value,
      hp_wa: document.getElementById('newHpWa').value.trim(),
      keluarga_id: '',
      keluarga_nama: '',
      tgl_lahir: tglInput ? (Logic.normTglLahir(tglInput) || '') : ''
    });
    showToast('✅ Jemaat ditambahkan!', 'success');
    closeModal('modalJemaat');
  } catch (err) {
    appLog('error', 'submitAddJemaat', err.message, err.stack, { nama });
    const pesan = err.code === 'unavailable' ? 'Tambah jemaat butuh koneksi internet.' : pesanError(err);
    showToast('❌ ' + pesan, 'error');
  }
  btn.disabled = false; btn.textContent = 'Tambah Jemaat';
}
