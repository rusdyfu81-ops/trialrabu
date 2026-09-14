// Halaman Dashboard: kartu kehadiran per ibadah, follow-up, ulang tahun, tren, dan komisi.

const WARNA_IBADAH = ['var(--teal)', 'var(--blue)', 'var(--green)', 'var(--amber)'];
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function anggotaAktif(ib) {
  return RAW.jemaat.filter(m => Logic.isAktif(m) && Logic.ikutIbadah(m, ib));
}

function renderDashboard() {
  if (!RAW) return;
  const bulanIni = new Date().getMonth() + 1;
  const content  = document.getElementById('dashContent');
  const allMembers = RAW.jemaat;

  // ── Kehadiran terakhir & sebelumnya, per ibadah ──
  function getHadirCount(members, svc, dateIndex) {
    const dates = RAW.tanggals[svc] || [];
    if (dates.length <= dateIndex) return null;
    const date = dates[dates.length - 1 - dateIndex];
    return members.filter(m => Logic.hadirPada(RAW, m.id, svc, date)).length;
  }
  const perIbadah = IBADAH.map((ib, i) => {
    const members = anggotaAktif(ib);
    const dates = RAW.tanggals[ib.nama] || [];
    const hadirNow = getHadirCount(members, ib.nama, 0) ?? 0;
    const hadirPrev = getHadirCount(members, ib.nama, 1);
    return {
      ib, members, warna: WARNA_IBADAH[i % WARNA_IBADAH.length],
      lastDate: dates[dates.length - 1] || '',
      hadirNow,
      rateNow: members.length ? Math.round(hadirNow / members.length * 100) : 0,
      ratePrev: (hadirPrev !== null && members.length) ? Math.round(hadirPrev / members.length * 100) : null,
    };
  });

  function deltaBadge(now, prev, hari) {
    if (prev === null) return '';
    const d = now - prev;
    if (d === 0) return `<span style="font-size:11px;color:var(--ink-4);">= sama</span>`;
    const col = d > 0 ? 'var(--green)' : 'var(--red)';
    const lalu = hari === 0 ? 'minggu lalu' : NAMA_HARI[hari] + ' lalu';
    return `<span style="font-size:11px;font-weight:800;color:${col};">${d>0?'▲':'▼'} ${Math.abs(d)}% vs ${lalu}</span>`;
  }

  // ── Follow-up ringkasan (hanya ibadah Minggu) ──
  const fuDates  = [...new Set(IBADAH.filter(ib => ib.followup).flatMap(ib => RAW.tanggals[ib.nama] || []))].sort();
  const refDate  = fuDates[fuDates.length-1] || '';
  const fuData   = refDate ? Logic.hitungFollowup(RAW, refDate, IBADAH) : null;
  const fuTotal  = fuData ? (fuData.absenHariIni.length + fuData.absen2Minggu.length + fuData.absen3Minggu.length + fuData.absen4Minggu.length + fuData.absenLebih4.length + fuData.absenLebih8.length) : 0;
  const fuUrgent = fuData ? (fuData.absen4Minggu.length + fuData.absenLebih4.length + fuData.absenLebih8.length) : 0;

  // ── Ulang tahun bulan ini, urut tanggal ──
  const bdayList = allMembers.filter(m => getBulanLahir(m) === bulanIni)
    .sort((a, b) => Logic.hariLahir(a) - Logic.hariLahir(b));

  // ── Tren kehadiran (% per tanggal) ──
  function buildChartData(members, svc) {
    const dates = RAW.tanggals[svc] || [];
    return dates.map((date, i) => {
      const hadirN = members.filter(m => Logic.hadirPada(RAW, m.id, svc, date)).length;
      const pct    = members.length ? Math.round(hadirN / members.length * 100) : 0;
      const dt     = new Date(date + 'T00:00:00');
      return { label: dt.getDate() + ' ' + BULAN_NAMES[dt.getMonth()+1], val: hadirN, pct, date, isLast: i === dates.length - 1 };
    });
  }
  function renderChart(data) {
    const maxPct = Math.max(...data.map(d => d.pct), 1);
    return data.map(d => `
      <div class="chart-bar-wrap" title="${d.val} hadir · ${d.pct}%">
        <div class="chart-bar-val">${d.pct}%</div>
        <div class="chart-bar ${d.isLast ? 'latest' : ''}" style="height:${Math.round(d.pct/maxPct*80)+4}px"></div>
        <div class="chart-bar-label">${d.label}</div>
      </div>`).join('');
  }

  // ── Kehadiran per komisi (ibadah pertama di daftar = Ibadah 1, seperti sebelumnya) ──
  const ibKomisi = perIbadah[0];
  const komisiMap = {};
  ibKomisi.members.forEach(m => {
    const k = (m.komisi || '').trim() || 'Lainnya';
    if (!komisiMap[k]) komisiMap[k] = { total: 0, hadir: 0 };
    komisiMap[k].total++;
    if (ibKomisi.lastDate && Logic.hadirPada(RAW, m.id, ibKomisi.ib.nama, ibKomisi.lastDate)) komisiMap[k].hadir++;
  });
  const komisiArr = Object.entries(komisiMap)
    .map(([k, v]) => ({ k, total: v.total, hadir: v.hadir, pct: v.total ? Math.round(v.hadir/v.total*100) : 0 }))
    .sort((a,b) => b.pct - a.pct);
  const maxKomPct = Math.max(...komisiArr.map(x => x.pct), 1);

  content.innerHTML = `
    <!-- ── STAT CARDS ── -->
    <div class="dash-section-title" style="margin-top:8px;">Kehadiran Minggu Ini</div>
    <div class="stats-grid" id="dashStatsGrid" style="grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:4px;">

      ${perIbadah.map(x => `
      <div class="stat-card" onclick="dashFilter('ib:${x.ib.kode}')" style="cursor:pointer;" id="dashCard_${x.ib.kode}">
        <div style="display:flex;align-items:baseline;gap:6px;">
          <div class="stat-card-num" style="color:${x.warna}">${x.rateNow}%</div>
          <div style="font-size:13px;font-weight:700;color:var(--ink-3)">${x.hadirNow}/${x.members.length}</div>
        </div>
        <div class="stat-card-label">${esc(x.ib.nama)}</div>
        <div class="stat-card-sub">${deltaBadge(x.rateNow, x.ratePrev, x.ib.hari)}</div>
      </div>`).join('')}

      <div class="stat-card" onclick="dashFilter('followup')" style="cursor:pointer;" id="dashCardFollowup">
        <div style="display:flex;align-items:baseline;gap:6px;">
          <div class="stat-card-num" style="color:var(--red)">${fuTotal}</div>
          ${fuUrgent > 0 ? `<div style="font-size:12px;font-weight:800;color:var(--purple);background:var(--purple-l);padding:1px 7px;border-radius:20px;">${fuUrgent} kritis</div>` : ''}
        </div>
        <div class="stat-card-label">Perlu Follow-up</div>
        <div class="stat-card-sub" style="color:var(--ink-4);">
          ${fuData ? `${fuData.absenHariIni.length} baru · ${fuData.absen2Minggu.length+fuData.absen3Minggu.length} 2-3mg · ${fuData.absen4Minggu.length+fuData.absenLebih4.length+fuData.absenLebih8.length} 4mg+` : '—'}
        </div>
      </div>

      <div class="stat-card" onclick="dashFilter('bday')" style="cursor:pointer;" id="dashCardBday">
        <div class="stat-card-num" style="color:var(--purple)">${bdayList.length}</div>
        <div class="stat-card-label">${ikon('kue')} Ulang Tahun</div>
        <div class="stat-card-sub" style="color:var(--ink-4);">Bulan ini</div>
      </div>
    </div>

    <div id="dashFilterContent"></div>

    <div id="dashDefaultContent">

    <!-- ── FOLLOW-UP RINGKASAN ── -->
    ${fuData ? `
    <div class="dash-section-title">Ringkasan Follow-up</div>
    <div class="chart-wrap" style="padding:12px 16px;">
      ${[
        { label:'Minggu ini', val: fuData.absenHariIni.length, col:'var(--amber)', bg:'var(--amber-l)' },
        { label:'2 Minggu',   val: fuData.absen2Minggu.length, col:'var(--red)',   bg:'var(--red-l)' },
        { label:'3 Minggu',   val: fuData.absen3Minggu.length, col:'var(--red)',   bg:'var(--red-l)' },
        { label:'4 Minggu',   val: fuData.absen4Minggu.length, col:'var(--purple)',bg:'var(--purple-l)' },
        { label:'>4 Minggu',  val: fuData.absenLebih4.length,  col:'var(--purple)',bg:'var(--purple-l)' },
        { label:'>8 Minggu',  val: fuData.absenLebih8.length,  col:'var(--ink-2)', bg:'var(--bg)' },
      ].map(r => r.val === 0 ? '' : `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--bg);">
          <div style="font-size:12px;font-weight:700;color:var(--ink-3);min-width:72px;">${r.label}</div>
          <div style="flex:1;background:var(--bg);border-radius:4px;height:8px;overflow:hidden;">
            <div style="height:100%;border-radius:4px;background:${r.col};width:${Math.round(r.val/fuTotal*100)}%;"></div>
          </div>
          <div style="font-size:13px;font-weight:800;font-family:var(--mono);color:${r.col};min-width:28px;text-align:right;">${r.val}</div>
        </div>`).join('')}
      <div style="padding-top:8px;">
        <button onclick="dashGoToFollowup()" style="width:100%;height:36px;background:var(--teal);color:white;border:none;border-radius:8px;font-size:13px;font-weight:800;font-family:var(--font);cursor:pointer;">Lihat Detail Follow-up →</button>
      </div>
    </div>` : ''}

    <!-- ── TREN KEHADIRAN ── -->
    ${perIbadah.map(x => {
      const data = buildChartData(x.members, x.ib.nama);
      return data.length ? `
    <div class="dash-section-title">Tren Kehadiran ${esc(x.ib.nama)} <span style="font-size:11px;font-weight:500;color:var(--ink-4);">(% hadir)</span></div>
    <div class="chart-wrap">
      <div class="chart-bars">${renderChart(data)}</div>
    </div>` : '';
    }).join('')}

    <!-- ── KEHADIRAN PER KOMISI ── -->
    <div class="dash-section-title">Kehadiran per Komisi <span style="font-size:11px;font-weight:500;color:var(--ink-4);">(${esc(ibKomisi.ib.nama)} · minggu ini)</span></div>
    <div class="chart-wrap">
      <div class="komisi-list">
        ${komisiArr.map(({k, total, hadir, pct}) => {
          const col = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
          return `<div class="komisi-row" onclick="dashFilter('komisi:${esc(k)}')" style="cursor:pointer;padding:4px 0;">
            <div class="komisi-name" style="font-size:12px;">${esc(k)}</div>
            <div class="komisi-bar-wrap">
              <div class="komisi-bar" style="width:${Math.round(pct/maxKomPct*100)}%;background:${col};"></div>
            </div>
            <div style="font-size:12px;font-weight:800;font-family:var(--mono);color:${col};min-width:52px;text-align:right;">${pct}% <span style="color:var(--ink-4);font-size:10px;">${hadir}/${total}</span></div>
          </div>`;
        }).join('')}
      </div>
    </div>

    </div><!-- end dashDefaultContent -->
    <div style="height:20px;"></div>`;

  window._dashData = { perIbadah, ibKomisi, fuData, bdayList, bulanIni };
  window._dashActiveFilter = '';
}

function dashGoToFollowup() {
  // Pindah ke halaman Report tab Follow-up
  switchPage('report');
  setTimeout(() => setReportMode('followup'), 100);
}

function dashFilter(type) {
  const d = window._dashData;
  if (!d) return;
  const fc = document.getElementById('dashFilterContent');
  const dc = document.getElementById('dashDefaultContent');
  const allCardIds = [...d.perIbadah.map(x => 'dashCard_' + x.ib.kode), 'dashCardFollowup', 'dashCardBday'];

  // Toggle off jika klik card yang sama
  if (window._dashActiveFilter === type) {
    window._dashActiveFilter = '';
    fc.innerHTML = '';
    dc.style.display = '';
    allCardIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.boxShadow=''; el.style.transform=''; }
    });
    return;
  }

  window._dashActiveFilter = type;
  dc.style.display = 'none';
  fc.innerHTML = '';

  // Highlight card aktif
  const cardAktif = type.startsWith('ib:') ? 'dashCard_' + type.slice(3)
    : type === 'followup' ? 'dashCardFollowup' : type === 'bday' ? 'dashCardBday' : '';
  allCardIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isActive = id === cardAktif;
    el.style.boxShadow = isActive ? '0 0 0 2.5px var(--teal)' : '';
    el.style.transform  = isActive ? 'scale(1.02)' : '';
  });

  // ── Detail satu ibadah ──
  if (type.startsWith('ib:')) {
    const x = d.perIbadah.find(p => p.ib.kode === type.slice(3));
    if (!x) return;
    const hadir = x.members.filter(m => Logic.hadirPada(RAW, m.id, x.ib.nama, x.lastDate));
    const absen = x.members.filter(m => !Logic.hadirPada(RAW, m.id, x.ib.nama, x.lastDate));
    fc.innerHTML = `
      <div class="dash-section-title">${ikon('cek-bulat')} Hadir ${esc(x.ib.nama)} (${hadir.length})</div>
      <div class="alert-list">${memberListHtml(hadir,'var(--green-l)','var(--green)')}</div>
      <div class="dash-section-title">${ikon('x-bulat')} Absen ${esc(x.ib.nama)} (${absen.length})</div>
      <div class="alert-list">${memberListHtml(absen,'var(--red-l)','var(--red)')}</div>`;

  // ── Follow-up detail per kategori ──
  } else if (type === 'followup') {
    if (!d.fuData) { fc.innerHTML = '<div class="empty"><div class="empty-icon">' + ikon('cek-bulat') + '</div><div class="empty-text">Tidak ada yang perlu follow-up</div></div>'; return; }
    const fu = d.fuData;
    function fuSection(label, icon, list, col, bg) {
      if (!list.length) return '';
      return `<div class="dash-section-title">${ikonDariEmoji(icon)} ${label} (${list.length})</div>
        <div class="alert-list">
          ${list.map(m => {
            const init = m.nama.trim().split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
            const wa = m.hp_wa ? `<a class="alert-wa" href="https://wa.me/${m.hp_wa.replace(/\D/g,'')}" target="_blank">${ikon('pesan')}</a>` : '';
            return `<div class="alert-card" style="border-left-color:${col};">
              <div class="alert-avatar" style="background:${bg};color:${col};">${esc(init)}</div>
              <div class="alert-info">
                <div class="alert-name">${esc(tc(m.nama))}</div>
                <div class="alert-detail" style="color:${col};">${m.streak}× absen · ${esc(m.komisi||'')}</div>
              </div>${wa}</div>`;
          }).join('')}
        </div>`;
    }
    fc.innerHTML =
      fuSection('Absen Minggu Ini',        '📋', fu.absenHariIni, 'var(--amber)',  'var(--amber-l)') +
      fuSection('Absen 2 Minggu',          '⚠️', fu.absen2Minggu, 'var(--red)',    'var(--red-l)') +
      fuSection('Absen 3 Minggu',          '⚠️', fu.absen3Minggu, 'var(--red)',    'var(--red-l)') +
      fuSection('Absen 4 Minggu',          '🚨', fu.absen4Minggu, 'var(--purple)', 'var(--purple-l)') +
      fuSection('Absen lebih dari 4 Minggu','🚨', fu.absenLebih4,  'var(--purple)', 'var(--purple-l)') +
      fuSection('Absen lebih dari 8 Minggu','🔴', fu.absenLebih8,  'var(--ink-2)',  'var(--bg)') ||
      '<div class="empty"><div class="empty-icon">' + ikon('cek-bulat') + '</div><div class="empty-text">Tidak ada</div></div>';

  // ── Ulang tahun detail ──
  } else if (type === 'bday') {
    fc.innerHTML = `
      <div class="dash-section-title">${ikon('kue')} Ulang Tahun ${BULAN_FULL[d.bulanIni]} (${d.bdayList.length})</div>
      <div class="bday-list">
        ${d.bdayList.length ? d.bdayList.map(m => {
          const iso = Logic.normTglLahir(m.tgl_lahir);
          const tgl = iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';
          const wa  = m.hp_wa ? `<a class="alert-wa" href="https://wa.me/${m.hp_wa.replace(/\D/g,'')}" target="_blank">${ikon('pesan')}</a>` : '';
          return `<div class="bday-card" style="display:flex;align-items:center;gap:12px;">
            <div class="bday-avatar">${ikon('kue')}</div>
            <div style="flex:1;min-width:0;">
              <div class="bday-name">${esc(tc(m.nama))}</div>
              <div class="bday-komisi">${esc(m.komisi)} · ${tgl}</div>
            </div>
            ${wa}
          </div>`;
        }).join('') : '<div style="color:var(--ink-4);font-size:13px;padding:12px;">Tidak ada ulang tahun bulan ini</div>'}
      </div>`;

  // ── Detail komisi ──
  } else if (type.startsWith('komisi:')) {
    const komisiName = type.slice(7);
    const { ib, members: pool, lastDate } = d.ibKomisi;
    const members  = pool.filter(m => ((m.komisi||'').trim()||'Lainnya') === komisiName);
    const hadir    = members.filter(m => lastDate && Logic.hadirPada(RAW, m.id, ib.nama, lastDate));
    const absen    = members.filter(m => !hadir.includes(m));
    const pct      = members.length ? Math.round(hadir.length/members.length*100) : 0;
    const col      = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
    fc.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div class="dash-section-title" style="margin:0;">Komisi ${esc(komisiName)}</div>
        <div style="font-size:20px;font-weight:900;font-family:var(--mono);color:${col};">${pct}%</div>
      </div>
      <div class="dash-section-title">${ikon('cek-bulat')} Hadir (${hadir.length})</div>
      <div class="alert-list">${memberListHtml(hadir,'var(--green-l)','var(--green)')}</div>
      <div class="dash-section-title">${ikon('x-bulat')} Absen (${absen.length})</div>
      <div class="alert-list">${memberListHtml(absen,'var(--red-l)','var(--red)')}</div>`;
  }
}

function memberListHtml(members, bgColor, textColor) {
  if (!members.length) return '<div style="color:var(--ink-4);font-size:13px;padding:12px;">Tidak ada</div>';
  return members.map(m => {
    const init = m.nama.trim().split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
    return `<div class="alert-card" style="border-left-color:${textColor};">
      <div class="alert-avatar" style="background:${bgColor};color:${textColor};">${esc(init)}</div>
      <div class="alert-info">
        <div class="alert-name">${esc(tc(m.nama))}</div>
        <div class="alert-detail" style="color:var(--ink-3);">${esc(m.komisi)}${m.keluarga_nama ? ' · ' + ikon('rumah') + ' ' + esc(tc(m.keluarga_nama)) : ''}</div>
      </div>
    </div>`;
  }).join('');
}
