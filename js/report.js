// Halaman Report: per tanggal, per bulan, per tahun, follow-up; export CSV/WhatsApp.

function renderReport() {
  if (!RAW) return;
  const content = document.getElementById('reportContent');
  const allDates = [...new Set(IBADAH.flatMap(ib => RAW.tanggals[ib.nama] || []))].sort();
  if (!allDates.length) { content.innerHTML = '<div class="empty"><div class="empty-icon">' + ikon('dokumen') + '</div><div class="empty-text">Belum ada data</div></div>'; return; }
  const latestDate = allDates[allDates.length-1];
  // Follow-up hanya untuk tanggal ibadah Minggu
  const fuDates = [...new Set(IBADAH.filter(ib => ib.followup).flatMap(ib => RAW.tanggals[ib.nama] || []))].sort();
  const monthSet = new Set(); allDates.forEach(d => monthSet.add(d.substring(0,7)));
  const months = [...monthSet].sort().reverse();
  const monthOpts = months.map(m => { const [y,mo]=m.split('-'); return `<option value="${m}">${BULAN_FULL[parseInt(mo)]} ${y}</option>`; }).join('');
  const labelTgl = d => new Date(d+'T00:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const dateOpts = allDates.slice().reverse().map(d => `<option value="${d}" ${d===latestDate?'selected':''}>${labelTgl(d)}</option>`).join('');
  const fuOpts = fuDates.slice().reverse().map((d, i) => `<option value="${d}" ${i===0?'selected':''}>${labelTgl(d)}</option>`).join('');
  content.innerHTML = `<div class="report-date-selector"><label>Mode Laporan</label>
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
      <div class="filter-chip active" id="rptModeDate" onclick="setReportMode('date')" style="flex:1;justify-content:center;min-width:80px;">Per Tanggal</div>
      <div class="filter-chip" id="rptModeMonth" onclick="setReportMode('month')" style="flex:1;justify-content:center;min-width:80px;">Per Bulan</div>
      <div class="filter-chip" id="rptModeYear" onclick="setReportMode('year')" style="flex:1;justify-content:center;min-width:80px;">Per Tahun</div>
      <div class="filter-chip" id="rptModeFollowup" onclick="setReportMode('followup')" style="flex:1;justify-content:center;min-width:80px;">${ikon('hati')} Follow-up</div>
    </div>
    <div id="rptSelectorDate"><select onchange="renderReportForDate(this.value)" id="reportDateSelect">${dateOpts}</select>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button onclick="openExportModal()" style="flex:1;height:40px;background:var(--green);color:white;border:none;border-radius:10px;font-size:13px;font-weight:800;font-family:var(--font);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">${ikon('unduh')} Export Laporan</button>
        <button id="rptSortBtn" onclick="toggleReportSort()" style="height:40px;padding:0 14px;background:var(--blue-l);color:var(--blue);border:1.5px solid #bfdbfe;border-radius:10px;font-size:12px;font-weight:800;font-family:var(--font);cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px;">${ikon('rumah')} Per Keluarga</button>
      </div></div>
    <div id="rptSelectorMonth" style="display:none;"><select onchange="renderReportBulanan(this.value)" id="reportMonthSelect">${monthOpts}</select></div>
    <div id="rptSelectorYear" style="display:none;"><div style="font-size:14px;font-weight:700;color:var(--ink-2);padding:8px 0;">Rekap Tahun ${TAHUN_AKTIF}</div></div>
    <div id="rptSelectorFollowup" style="display:none;">
      <select onchange="renderReportFollowup(this.value)" id="reportFollowupSelect">${fuOpts}</select>
      <button onclick="openExportFollowup()" style="width:100%;height:40px;margin-top:10px;background:var(--green);color:white;border:none;border-radius:10px;font-size:13px;font-weight:800;font-family:var(--font);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">${ikon('unduh')} Export Follow-up</button>
    </div>
  </div><div id="reportBody"></div>`;
  renderReportForDate(latestDate);
}
let currentReportMode='date';
let reportSortByFamily = false;

function toggleReportSort() {
  reportSortByFamily = !reportSortByFamily;
  const btn = document.getElementById('rptSortBtn');
  if (btn) {
    btn.style.background   = reportSortByFamily ? 'var(--blue)' : 'var(--blue-l)';
    btn.style.color        = reportSortByFamily ? 'white' : 'var(--blue)';
    btn.style.borderColor  = '#bfdbfe';
    btn.innerHTML          = ikon('rumah') + (reportSortByFamily ? ' Per Keluarga ✓' : ' Per Keluarga');
  }
  // Re-render dengan sort baru
  const sel = document.getElementById('reportDateSelect');
  if (sel && sel.value) renderReportForDate(sel.value);
}
function setReportMode(mode){
  reportSortByFamily = false;
  currentReportMode = mode;
  ['date','month','year','followup'].forEach(m => {
    const tab = document.getElementById('rptMode' + m.charAt(0).toUpperCase() + m.slice(1));
    const sel = document.getElementById('rptSelector' + m.charAt(0).toUpperCase() + m.slice(1));
    if (tab) tab.classList.toggle('active', m === mode);
    if (sel) sel.style.display = m === mode ? '' : 'none';
  });
  if (mode === 'date') {
    const s = document.getElementById('reportDateSelect');
    if (s?.value) renderReportForDate(s.value);
  } else if (mode === 'month') {
    const s = document.getElementById('reportMonthSelect');
    if (s?.value) renderReportBulanan(s.value);
  } else if (mode === 'year') {
    renderReportTahunan();
  } else if (mode === 'followup') {
    const s = document.getElementById('reportFollowupSelect');
    if (s?.value) renderReportFollowup(s.value);
  }
}

function renderReportBulanan(yearMonth) {
  const body = document.getElementById('reportBody');
  const [year, month] = yearMonth.split('-');
  const am = RAW.jemaat.filter(Logic.isAktif);
  const res = {};
  IBADAH.forEach(ib => {
    const svc = ib.nama;
    const dates = (RAW.tanggals[svc] || []).filter(d => d.startsWith(yearMonth));
    const mems = am.filter(m => Logic.ikutIbadah(m, ib));
    let tH = 0, tA = 0;
    const ms = {};
    mems.forEach(m => { ms[m.id] = 0; });
    dates.forEach(date => mems.forEach(m => {
      if (Logic.hadirPada(RAW, m.id, svc, date)) { tH++; ms[m.id]++; } else tA++;
    }));
    const rate = (tH + tA) > 0 ? Math.round(tH / (tH + tA) * 100) : 0;
    res[svc] = { dates, rate, tH, never: mems.filter(m => ms[m.id] === 0), perfect: mems.filter(m => ms[m.id] === dates.length && dates.length > 0) };
  });
  // Ibadah tanpa tanggal di bulan ini tidak ditampilkan
  const svcs = SERVICES.filter(svc => res[svc].dates.length);
  const bl = BULAN_FULL[parseInt(month)] + ' ' + year;
  function mr(list) {
    return [...list].sort((a,b) => a.nama.localeCompare(b.nama)).map((m,i) =>
      `<div class="report-member-row"><div class="report-member-num">${i+1}</div><div class="report-member-name">${esc(m.nama)}</div><div class="report-member-komisi">${esc(m.komisi)}</div></div>`).join('');
  }
  function kartu(judul, list, bg, fg) {
    if (!list.length) return '';
    return `<div class="report-card"><div class="report-card-header" onclick="this.closest('.report-card').classList.toggle('open')"><div class="report-card-title">${judul}<span class="report-card-badge" style="background:${bg};color:${fg};">${list.length}</span></div><div class="report-card-chevron">▼</div></div><div class="report-card-body">${mr(list)}</div></div>`;
  }
  body.innerHTML = `<div class="dash-section-title">Rekap ${esc(bl)}</div>
    <div class="report-summary-grid">
      ${svcs.map(svc => { const r = res[svc]; return `<div class="report-summary-card"><div class="report-summary-num" style="color:var(--teal)">${r.rate}%</div><div class="report-summary-label">${esc(svc)}</div><div class="report-summary-sub">${r.tH} hadir / ${r.dates.length} minggu</div></div>`; }).join('')}
      ${svcs.map(svc => { const r = res[svc]; return `<div class="report-summary-card"><div class="report-summary-num" style="color:var(--green)">${r.perfect.length}</div><div class="report-summary-label">Rajin ${esc(svc)}</div><div class="report-summary-sub">Hadir semua</div></div>`; }).join('')}
    </div>
    ${svcs.map(svc => kartu(`${ikon('x-bulat')} Tidak Hadir ${esc(svc)}`, res[svc].never, 'var(--red-l)', 'var(--red)')).join('')}
    ${svcs.map(svc => kartu(`${ikon('bintang')} Rajin ${esc(svc)}`, res[svc].perfect, 'var(--green-l)', 'var(--green)')).join('')}`;
}

function renderReportTahunan() {
  const body = document.getElementById('reportBody');
  const am = RAW.jemaat.filter(Logic.isAktif);
  const md = [];
  for (let mo = 1; mo <= 12; mo++) {
    const ym = `${TAHUN_AKTIF}-${String(mo).padStart(2,'0')}`;
    const sd = {};
    IBADAH.forEach(ib => {
      const svc = ib.nama;
      const dates = (RAW.tanggals[svc] || []).filter(d => d.startsWith(ym));
      if (!dates.length) { sd[svc] = null; return; }
      const mems = am.filter(m => Logic.ikutIbadah(m, ib));
      let h = 0, t = 0;
      dates.forEach(date => mems.forEach(m => { t++; if (Logic.hadirPada(RAW, m.id, svc, date)) h++; }));
      sd[svc] = { dates: dates.length, h, t, rate: t ? Math.round(h / t * 100) : 0 };
    });
    md.push({ month: mo, label: BULAN_NAMES[mo], ...sd });
  }
  const hd = md.filter(d => SERVICES.some(svc => d[svc]));
  if (!hd.length) { body.innerHTML = '<div class="empty"><div class="empty-icon">' + ikon('dokumen') + '</div><div class="empty-text">Belum ada data</div></div>'; return; }
  let tH = 0, tS = 0;
  hd.forEach(d => SERVICES.forEach(svc => { if (d[svc]) { tH += d[svc].h; tS += d[svc].t; } }));
  const or = tS ? Math.round(tH / tS * 100) : 0;
  const totalIbadah = hd.reduce((s, d) => s + SERVICES.reduce((x, svc) => x + (d[svc] ? d[svc].dates : 0), 0), 0);
  body.innerHTML = `<div class="dash-section-title">Ringkasan Tahun ${TAHUN_AKTIF}</div>
    <div class="report-summary-grid">
      <div class="report-summary-card"><div class="report-summary-num" style="color:var(--teal)">${or}%</div><div class="report-summary-label">Rata-rata Kehadiran</div></div>
      <div class="report-summary-card"><div class="report-summary-num" style="color:var(--green)">${tH}</div><div class="report-summary-label">Total Kehadiran</div></div>
      <div class="report-summary-card"><div class="report-summary-num" style="color:var(--blue)">${totalIbadah}</div><div class="report-summary-label">Total Ibadah</div></div>
      <div class="report-summary-card"><div class="report-summary-num" style="color:var(--purple)">${am.length}</div><div class="report-summary-label">Jemaat Aktif</div></div>
    </div>
    <div class="dash-section-title">Kehadiran Per Bulan</div>
    <div class="chart-wrap"><table style="width:100%;border-collapse:collapse;font-size:12px;">
      <tr style="border-bottom:2px solid var(--border);"><th style="text-align:left;padding:8px 4px;font-weight:800;color:var(--ink-3);">Bulan</th>${SERVICES.map(svc => `<th style="text-align:center;padding:8px 4px;font-weight:800;color:var(--ink-3);">${esc(svc)}</th>`).join('')}</tr>
      ${hd.map(d => `<tr style="border-bottom:1px solid var(--bg);"><td style="padding:8px 4px;font-weight:700;">${d.label}</td>${SERVICES.map(svc => {
        const v = d[svc];
        if (!v) return '<td style="text-align:center;padding:8px 4px;color:var(--ink-4);">—</td>';
        const c = v.rate >= 80 ? 'var(--green)' : v.rate >= 50 ? 'var(--amber)' : 'var(--red)';
        return `<td style="text-align:center;padding:8px 4px;"><span style="font-weight:800;color:${c};font-family:var(--mono);">${v.rate}%</span><span style="color:var(--ink-4);font-size:10px;"> (${v.dates}mg)</span></td>`;
      }).join('')}</tr>`).join('')}
    </table></div>`;
}

function renderReportForDate(date) {
  const body = document.getElementById('reportBody');
  const { perIbadah, gabungan } = Logic.ringkasanTanggal(RAW, date, IBADAH);
  const warna = x => WARNA_IBADAH[IBADAH.indexOf(x.ib) % WARNA_IBADAH.length];
  const warnaMuda = w => w.replace(')', '-l)');   // var(--teal) → var(--teal-l)

  function memberRows(list) {
    if (!list.length) return '<div style="color:var(--ink-4);font-size:13px;padding:8px 0;">Tidak ada</div>';

    if (!reportSortByFamily) {
      // Sort A-Z biasa
      return [...list].sort((a,b) => a.nama.localeCompare(b.nama)).map((m,i) => `
        <div class="report-member-row">
          <div class="report-member-num">${i+1}</div>
          <div class="report-member-name">${esc(tc(m.nama))}</div>
          <div class="report-member-komisi">${esc(m.komisi)}</div>
        </div>`).join('');
    }

    // Sort per keluarga — kelompokkan lalu urutkan nama dalam keluarga
    const families = {};
    const noFamily = [];
    [...list].forEach(m => {
      if (m.keluarga_nama) {
        if (!families[m.keluarga_nama]) families[m.keluarga_nama] = [];
        families[m.keluarga_nama].push(m);
      } else {
        noFamily.push(m);
      }
    });
    // Sort nama dalam tiap keluarga
    Object.keys(families).forEach(f => families[f].sort((a,b) => a.nama.localeCompare(b.nama)));
    noFamily.sort((a,b) => a.nama.localeCompare(b.nama));

    let no = 1;
    let html = '';
    // Keluarga A-Z
    Object.keys(families).sort().forEach(fam => {
      html += `<div style="font-size:11px;font-weight:800;color:var(--purple);padding:10px 0 4px;display:flex;align-items:center;gap:5px;border-top:1px solid var(--purple-l);margin-top:4px;">
        ${ikon('rumah')} ${esc(fam)} <span style="font-weight:500;color:var(--ink-4);">(${families[fam].length})</span>
      </div>`;
      families[fam].forEach(m => {
        html += `<div class="report-member-row">
          <div class="report-member-num">${no++}</div>
          <div class="report-member-name">${esc(tc(m.nama))}</div>
          <div class="report-member-komisi">${esc(m.komisi)}</div>
        </div>`;
      });
    });
    // Yang tidak punya keluarga
    if (noFamily.length) {
      html += `<div style="font-size:11px;font-weight:800;color:var(--ink-4);padding:10px 0 4px;border-top:1px solid var(--border);margin-top:4px;">
        — Tanpa Keluarga (${noFamily.length})
      </div>`;
      noFamily.forEach(m => {
        html += `<div class="report-member-row">
          <div class="report-member-num">${no++}</div>
          <div class="report-member-name">${esc(tc(m.nama))}</div>
          <div class="report-member-komisi">${esc(m.komisi)}</div>
        </div>`;
      });
    }
    return html;
  }

  function kartu(judul, list, bg, fg) {
    return `
    <div class="report-card">
      <div class="report-card-header" onclick="this.closest('.report-card').classList.toggle('open')">
        <div class="report-card-title">
          ${judul}
          <span class="report-card-badge" style="background:${bg};color:${fg};">${list.length}</span>
        </div>
        <div class="report-card-chevron">▼</div>
      </div>
      <div class="report-card-body">${memberRows(list)}</div>
    </div>`;
  }

  body.innerHTML = `
    <div class="report-summary-grid">
      ${gabungan ? `
      <div class="report-summary-card">
        <div class="report-summary-num" style="color:var(--green)">${gabungan.totalHadir}</div>
        <div class="report-summary-label">Total Hadir</div>
        <div class="report-summary-sub">Gabungan kedua ibadah</div>
      </div>
      <div class="report-summary-card">
        <div class="report-summary-num" style="color:var(--red)">${gabungan.tidakHadirSemua.length}</div>
        <div class="report-summary-label">Absen Keduanya</div>
        <div class="report-summary-sub">Tidak hadir sama sekali</div>
      </div>` : ''}
      ${perIbadah.map(x => `
      <div class="report-summary-card">
        <div class="report-summary-num" style="color:${warna(x)}">${x.hadir.length}</div>
        <div class="report-summary-label">Hadir ${esc(x.ib.nama)}</div>
        <div class="report-summary-sub">Anak: ${x.anakHadir.length} · Dewasa: ${x.dewasaHadir.length}</div>
      </div>`).join('')}
    </div>
    ${perIbadah.map(x => kartu(`${ikon('x-bulat')} Absen ${esc(x.ib.nama)}`, x.absen, 'var(--amber-l)', 'var(--amber)')).join('')}
    ${gabungan ? kartu(ikon('x-bulat') + ' Tidak Hadir Kedua Ibadah', gabungan.tidakHadirSemua, 'var(--red-l)', 'var(--red)') : ''}
    ${perIbadah.map(x => kartu(`${ikon('anak')} Anak Hadir ${esc(x.ib.nama)}`, x.anakHadir, 'var(--purple-l)', 'var(--purple)')).join('')}
    ${perIbadah.map(x => kartu(`${ikon('keluarga')} Dewasa Hadir ${esc(x.ib.nama)}`, x.dewasaHadir, warnaMuda(warna(x)), warna(x))).join('')}
    <div style="height:20px;"></div>
  `;
}

// ── REPORT FOLLOW-UP ──────────────────────────────────────────
// Hanya ibadah Minggu (followup:true) yang dihitung — lihat Logic.hitungFollowup
function calcFollowup(refDate) { return Logic.hitungFollowup(RAW, refDate, IBADAH); }

function renderReportFollowup(refDate) {
  const body = document.getElementById('reportBody');
  if (!refDate || !RAW) return;

  const result = calcFollowup(refDate);
  if (!result) return;
  const { absenHariIni, absen2Minggu, absen3Minggu, absen4Minggu, absenLebih4, absenLebih8 } = result;
  // Cache untuk export
  followupExportData = { date: refDate, absenHariIni, absen2Minggu, absen3Minggu, absen4Minggu, absenLebih4, absenLebih8 };

  function memberRowsFollowup(list) {
    if (!list.length) return '<div style="color:var(--green);font-size:13px;padding:8px 0;font-weight:700;">Tidak ada</div>';
    let lastFam = '';
    return list.map((m, i) => {
      let famHeader = '';
      const fam = u(m.keluarga_nama) || '';
      if (fam && fam !== lastFam) {
        lastFam = fam;
        famHeader = `<div style="font-size:11px;font-weight:800;color:var(--purple);padding:10px 0 4px;display:flex;align-items:center;gap:5px;${i>0?'border-top:1px solid var(--purple-l);margin-top:4px;':''}">
          ${ikon('rumah')} ${esc(fam)}</div>`;
      }
      const waBtn = m.hp_wa
        ? `<a href="https://wa.me/${m.hp_wa.replace(/\D/g,'')}" target="_blank" style="width:32px;height:32px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;text-decoration:none;color:#fff;">${ikon('pesan')}</a>`
        : `<div style="width:32px;flex-shrink:0;"></div>`;
      return `${famHeader}<div class="report-member-row" style="align-items:center;">
        <div class="report-member-num">${i+1}</div>
        <div style="flex:1;min-width:0;">
          <div class="report-member-name">${esc(tc(m.nama))}</div>
          <div style="font-size:11px;color:var(--ink-3);">${esc(m.komisi)}${m.keluarga_nama?' · '+esc(tc(m.keluarga_nama)):''}</div>
        </div>
        <div style="font-size:11px;font-weight:800;font-family:var(--mono);color:var(--red);margin-right:8px;">${m.streak}×</div>
        ${waBtn}
      </div>`;
    }).join('');
  }

  const dt = new Date(refDate + 'T00:00:00');
  const tglLabel = dt.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  body.innerHTML = `
    <div class="dash-section-title" style="margin-top:8px;">Follow-up per ${esc(tglLabel)}</div>
    <div style="font-size:12px;color:var(--ink-3);margin-bottom:16px;line-height:1.6;">
      Absen = tidak hadir kedua ibadah. Hadir minimal 1 ibadah = tidak dihitung absen.<br>
      Angka <span style="font-family:var(--mono);color:var(--red);font-weight:700;">N×</span> = jumlah minggu absen berturut-turut.
    </div>

    <div class="report-summary-grid" style="margin-bottom:16px;">
      <div class="report-summary-card">
        <div class="report-summary-num" style="color:var(--amber)">${absenHariIni.length}</div>
        <div class="report-summary-label">Absen Minggu Ini</div>
        <div class="report-summary-sub">1 minggu</div>
      </div>
      <div class="report-summary-card">
        <div class="report-summary-num" style="color:var(--red)">${absen2Minggu.length}</div>
        <div class="report-summary-label">Absen 2 Minggu</div>
        <div class="report-summary-sub">Perlu follow-up</div>
      </div>
      <div class="report-summary-card">
        <div class="report-summary-num" style="color:var(--red)">${absen3Minggu.length}</div>
        <div class="report-summary-label">Absen 3 Minggu</div>
        <div class="report-summary-sub">Perlu follow-up</div>
      </div>
      <div class="report-summary-card">
        <div class="report-summary-num" style="color:var(--purple)">${absen4Minggu.length}</div>
        <div class="report-summary-label">Absen 4 Minggu</div>
        <div class="report-summary-sub">Perlu perhatian</div>
      </div>
      <div class="report-summary-card">
        <div class="report-summary-num" style="color:var(--purple)">${absenLebih4.length}</div>
        <div class="report-summary-label">Absen &gt;4 Minggu</div>
        <div class="report-summary-sub">5–8 minggu</div>
      </div>
      <div class="report-summary-card">
        <div class="report-summary-num" style="color:var(--ink)">${absenLebih8.length}</div>
        <div class="report-summary-label">Absen &gt;8 Minggu</div>
        <div class="report-summary-sub">Perhatian segera</div>
      </div>
    </div>

    <div class="report-card">
      <div class="report-card-header" onclick="this.closest('.report-card').classList.toggle('open')">
        <div class="report-card-title">
          ${ikon('daftar')} Absen Minggu Ini
          <span class="report-card-badge" style="background:var(--amber-l);color:var(--amber);">${absenHariIni.length}</span>
        </div>
        <div class="report-card-chevron">▼</div>
      </div>
      <div class="report-card-body">${memberRowsFollowup(absenHariIni)}</div>
    </div>

    <div class="report-card">
      <div class="report-card-header" onclick="this.closest('.report-card').classList.toggle('open')">
        <div class="report-card-title">
          ${ikon('peringatan')} Absen 2 Minggu
          <span class="report-card-badge" style="background:var(--red-l);color:var(--red);">${absen2Minggu.length}</span>
        </div>
        <div class="report-card-chevron">▼</div>
      </div>
      <div class="report-card-body">${memberRowsFollowup(absen2Minggu)}</div>
    </div>

    <div class="report-card">
      <div class="report-card-header" onclick="this.closest('.report-card').classList.toggle('open')">
        <div class="report-card-title">
          ${ikon('peringatan')} Absen 3 Minggu
          <span class="report-card-badge" style="background:var(--red-l);color:var(--red);">${absen3Minggu.length}</span>
        </div>
        <div class="report-card-chevron">▼</div>
      </div>
      <div class="report-card-body">${memberRowsFollowup(absen3Minggu)}</div>
    </div>

    <div class="report-card">
      <div class="report-card-header" onclick="this.closest('.report-card').classList.toggle('open')">
        <div class="report-card-title">
          ${ikon('peringatan')} Absen 4 Minggu
          <span class="report-card-badge" style="background:var(--purple-l);color:var(--purple);">${absen4Minggu.length}</span>
        </div>
        <div class="report-card-chevron">▼</div>
      </div>
      <div class="report-card-body">${memberRowsFollowup(absen4Minggu)}</div>
    </div>

    <div class="report-card">
      <div class="report-card-header" onclick="this.closest('.report-card').classList.toggle('open')">
        <div class="report-card-title">
          ${ikon('peringatan')} Absen lebih dari 4 Minggu
          <span class="report-card-badge" style="background:var(--purple-l);color:var(--purple);">${absenLebih4.length}</span>
        </div>
        <div class="report-card-chevron">▼</div>
      </div>
      <div class="report-card-body">${memberRowsFollowup(absenLebih4)}</div>
    </div>

    <div class="report-card">
      <div class="report-card-header" onclick="this.closest('.report-card').classList.toggle('open')">
        <div class="report-card-title">
          ${ikon('peringatan')} Absen lebih dari 8 Minggu
          <span class="report-card-badge" style="background:var(--ink-2);color:white;">${absenLebih8.length}</span>
        </div>
        <div class="report-card-chevron">▼</div>
      </div>
      <div class="report-card-body">${memberRowsFollowup(absenLebih8)}</div>
    </div>

    <div style="height:20px;"></div>`;
}

// ── EXPORT FOLLOW-UP ──────────────────────────────────────────
let followupExportData = null; // cache hasil calcFollowup untuk export

function openExportFollowup() {
  const date = document.getElementById('reportFollowupSelect')?.value;
  if (!date) { showToast('Pilih tanggal dulu', 'error'); return; }

  const data = calcFollowup(date);
  if (!data) return;
  followupExportData = { date, ...data };

  const dt = new Date(date + 'T00:00:00');
  document.getElementById('exportDateLabel').textContent =
    dt.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Reset format
  exportFmt = 'csv';
  setExportFmt('csv');

  // Bangun checklist khusus followup
  exportChecked = new Set();
  const list = document.getElementById('exportCategoryList');
  list.innerHTML = '';

  const FOLLOWUP_CATS = [
    { id: 'fu_mingguini', icon: '📋', label: 'Absen Minggu Ini',          data: data.absenHariIni },
    { id: 'fu_2minggu',   icon: '⚠️', label: 'Absen 2 Minggu',            data: data.absen2Minggu },
    { id: 'fu_3minggu',   icon: '⚠️', label: 'Absen 3 Minggu',            data: data.absen3Minggu },
    { id: 'fu_4minggu',   icon: '🚨', label: 'Absen 4 Minggu',            data: data.absen4Minggu },
    { id: 'fu_lebih4',    icon: '🚨', label: 'Absen lebih dari 4 Minggu', data: data.absenLebih4  },
    { id: 'fu_lebih8',    icon: '🔴', label: 'Absen lebih dari 8 Minggu', data: data.absenLebih8  },
  ];

  FOLLOWUP_CATS.forEach(cat => {
    const count = cat.data.length;
    if (count > 0) exportChecked.add(cat.id);

    const el = document.createElement('div');
    el.className = 'export-cat-item' + (count > 0 ? ' checked' : ' disabled');
    el.dataset.catId = cat.id;
    el.innerHTML = `
      <div class="export-cat-check">${count > 0 ? '✓' : ''}</div>
      <div class="export-cat-icon">${ikonDariEmoji(cat.icon)}</div>
      <div class="export-cat-label">${cat.label}</div>
      <div class="export-cat-count">${count}</div>`;
    if (count > 0) el.onclick = () => toggleExportCat(cat.id, el);
    list.appendChild(el);
  });

  // Override tombol run untuk pakai export followup
  const btn = document.getElementById('exportRunBtn');
  btn.onclick = runExportFollowup;

  document.getElementById('modalExport').classList.add('open');
}

function runExportFollowup() {
  if (!followupExportData || exportChecked.size === 0) {
    showToast('Pilih minimal 1 kategori', 'error'); return;
  }

  const { date, absenHariIni, absen2Minggu, absen3Minggu, absen4Minggu, absenLebih4, absenLebih8 } = followupExportData;
  const dt = new Date(date + 'T00:00:00');
  const tglLabel = dt.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const FOLLOWUP_CATS = [
    { id: 'fu_mingguini', icon: '📋', label: 'Absen Minggu Ini',          data: absenHariIni },
    { id: 'fu_2minggu',   icon: '⚠️', label: 'Absen 2 Minggu',            data: absen2Minggu },
    { id: 'fu_3minggu',   icon: '⚠️', label: 'Absen 3 Minggu',            data: absen3Minggu },
    { id: 'fu_4minggu',   icon: '🚨', label: 'Absen 4 Minggu',            data: absen4Minggu },
    { id: 'fu_lebih4',    icon: '🚨', label: 'Absen lebih dari 4 Minggu', data: absenLebih4  },
    { id: 'fu_lebih8',    icon: '🔴', label: 'Absen lebih dari 8 Minggu', data: absenLebih8  },
  ];

  if (exportFmt === 'csv') {
    const rows = [['Kategori','No','Streak','Nama','Komisi','Keluarga','HP_WA']];
    FOLLOWUP_CATS.forEach(cat => {
      if (!exportChecked.has(cat.id) || !cat.data.length) return;
      rows.push([`=== ${cat.label} (${cat.data.length}) ===`,'','','','','','']);
      cat.data.forEach((m, i) => {
        rows.push([
          '', i+1, m.streak + 'x',
          '"' + tc(m.nama).replace(/"/g,'""') + '"',
          m.komisi || '',
          '"' + tc(m.keluarga_nama||'').replace(/"/g,'""') + '"',
          m.hp_wa || ''
        ]);
      });
      rows.push(['','','','','','','']);
    });
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Followup_GPBSI_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    closeModal('modalExport');
    showToast(`✅ Follow-up didownload!`, 'success');

  } else {
    // WA Text
    let lines = [];
    lines.push(`🙏 *Follow-up Jemaat GPBSI*`);
    lines.push(`🗓 ${tglLabel}`);

    FOLLOWUP_CATS.forEach(cat => {
      if (!exportChecked.has(cat.id) || !cat.data.length) return;
      lines.push('');
      lines.push(`${cat.icon} *${cat.label} (${cat.data.length})*`);

      // Kelompokkan per keluarga
      const families = {};
      const noFamily = [];
      cat.data.forEach(m => {
        if (m.keluarga_nama) {
          if (!families[m.keluarga_nama]) families[m.keluarga_nama] = [];
          families[m.keluarga_nama].push(m);
        } else noFamily.push(m);
      });

      let no = 1;
      Object.keys(families).sort().forEach(fam => {
        families[fam].forEach(m => {
          lines.push(`${no}. ${tc(m.nama)} _(${m.streak}×)_`);
          no++;
        });
      });
      noFamily.forEach(m => {
        lines.push(`${no}. ${tc(m.nama)} _(${m.streak}×)_`);
        no++;
      });
    });

    openWAPreview(lines.join('\n'));
  }
}

// ── EXPORT LAPORAN ────────────────────────────────────────────
// Kategori dibangun per tanggal dari ringkasanTanggal (sama persis dengan Report Per Tanggal)
function kategoriExport(date) {
  const { perIbadah, gabungan } = Logic.ringkasanTanggal(RAW, date, IBADAH);
  const cats = [];
  perIbadah.forEach(x => cats.push({ id: 'absen_' + x.ib.kode, icon: '✗', label: 'Absen ' + x.ib.nama, svc: x.ib.nama, status: 'Absen', members: x.absen }));
  if (gabungan) cats.push({ id: 'absen_keduanya', icon: '🚫', label: 'Tidak Hadir Kedua Ibadah', svc: null, status: null, members: gabungan.tidakHadirSemua });
  perIbadah.forEach(x => cats.push({ id: 'hadir_' + x.ib.kode + '_anak', icon: '👶', label: 'Anak Hadir ' + x.ib.nama, svc: x.ib.nama, status: 'Hadir', members: x.anakHadir }));
  perIbadah.forEach(x => cats.push({ id: 'hadir_' + x.ib.kode + '_dewasa', icon: '👥', label: 'Dewasa Hadir ' + x.ib.nama, svc: x.ib.nama, status: 'Hadir', members: x.dewasaHadir }));
  return cats;
}

let exportChecked = new Set();
let exportCurrentDate = '';
let exportFmt = 'csv'; // 'csv' | 'wa'

function setExportFmt(fmt) {
  exportFmt = fmt;
  document.getElementById('fmtCSV').classList.toggle('active', fmt === 'csv');
  document.getElementById('fmtWA').classList.toggle('active', fmt === 'wa');
  const btn = document.getElementById('exportRunBtn');
  if (fmt === 'csv') {
    btn.innerHTML = ikon('unduh') + ' Download CSV';
    btn.style.background = 'var(--green)';
  } else {
    btn.innerHTML = ikon('pesan') + ' Salin Teks WhatsApp';
    btn.style.background = '#25D366';
  }
}

function openExportModal() {
  if (!RAW) return;
  const date = document.getElementById('reportDateSelect')?.value;
  if (!date) { showToast('Pilih tanggal dulu', 'error'); return; }
  exportCurrentDate = date;

  // Pastikan tombol run kembali ke fungsi export laporan biasa
  document.getElementById('exportRunBtn').onclick = runExportLaporan;

  const dt = new Date(date + 'T00:00:00');
  document.getElementById('exportDateLabel').textContent =
    dt.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  exportFmt = 'csv';
  setExportFmt('csv');

  exportChecked = new Set();
  const list = document.getElementById('exportCategoryList');
  list.innerHTML = '';
  kategoriExport(date).forEach(cat => {
    const count = cat.members.length;
    if (count > 0) exportChecked.add(cat.id);   // default: centang yang punya data
    const el = document.createElement('div');
    el.className = 'export-cat-item' + (count > 0 ? ' checked' : '');
    el.id = 'exportCat_' + cat.id;
    el.dataset.catId = cat.id;
    el.innerHTML = `
      <div class="export-cat-check">${count > 0 ? '✓' : ''}</div>
      <div class="export-cat-icon">${ikonDariEmoji(cat.icon)}</div>
      <div class="export-cat-label">${esc(cat.label)}</div>
      <div class="export-cat-count">${count}</div>`;
    el.onclick = () => toggleExportCat(cat.id, el);
    list.appendChild(el);
  });

  document.getElementById('modalExport').classList.add('open');
}

function toggleExportCat(catId, el) {
  if (el.classList.contains('disabled')) return;
  if (exportChecked.has(catId)) {
    exportChecked.delete(catId);
    el.classList.remove('checked');
    el.querySelector('.export-cat-check').textContent = '';
  } else {
    exportChecked.add(catId);
    el.classList.add('checked');
    el.querySelector('.export-cat-check').textContent = '✓';
  }
}

function exportSelectAll(val) {
  document.querySelectorAll('.export-cat-item:not(.disabled)').forEach(el => {
    const catId = el.dataset.catId;
    if (!catId) return;
    if (val) {
      exportChecked.add(catId);
      el.classList.add('checked');
      el.querySelector('.export-cat-check').textContent = '✓';
    } else {
      exportChecked.delete(catId);
      el.classList.remove('checked');
      el.querySelector('.export-cat-check').textContent = '';
    }
  });
}

function runExportLaporan() {
  if (!RAW || !exportCurrentDate) return;
  if (exportChecked.size === 0) { showToast('Pilih minimal 1 kategori', 'error'); return; }

  const date = exportCurrentDate;
  const getAlasan = (jid, svc) => (Logic.catatanPada(RAW, jid, svc, date) || {}).alasan || '';
  const cats = kategoriExport(date).filter(cat => exportChecked.has(cat.id) && cat.members.length);

  if (exportFmt === 'csv') {
    const rows = [['Kategori','No','Nama','Komisi','Keluarga','Ibadah','Status','Alasan']];
    cats.forEach(cat => {
      rows.push([`=== ${cat.label} (${cat.members.length}) ===`, '', '', '', '', '', '', '']);
      cat.members.forEach((m, i) => {
        const svc = cat.svc || '';
        const alasan = svc ? getAlasan(m.id, svc) : '';
        rows.push(['', i+1, '"'+tc(m.nama)+'"', m.komisi||'', '"'+tc(m.keluarga_nama||'')+'"', svc, cat.status||'—', alasan]);
      });
      rows.push(['', '', '', '', '', '', '', '']);
    });
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Laporan_GPBSI_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    closeModal('modalExport');
    showToast(`✅ CSV didownload! ${exportChecked.size} kategori`, 'success');
    return;
  }

  // ── WHATSAPP TEXT ──
  const dt = new Date(date + 'T00:00:00');
  const tglLabel = dt.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const lines = [`📋 *Laporan Ibadah GPBSI*`, `🗓 ${tglLabel}`];
  cats.forEach(cat => {
    lines.push('');
    lines.push(`${cat.icon} *${cat.label} (${cat.members.length})*`);
    // Kelompokkan per keluarga kalau ada keluarga_nama
    const byFamily = {};
    const noFamily = [];
    cat.members.forEach(m => {
      if (m.keluarga_nama) { (byFamily[m.keluarga_nama] = byFamily[m.keluarga_nama] || []).push(m); }
      else noFamily.push(m);
    });
    let no = 1;
    const baris = m => {
      const alasan = cat.svc ? getAlasan(m.id, cat.svc) : '';
      lines.push(`${no++}. ${tc(m.nama)}${alasan ? ` _(${alasan})_` : ''}`);
    };
    Object.keys(byFamily).sort().forEach(fam => byFamily[fam].forEach(baris));
    noFamily.forEach(baris);
  });
  openWAPreview(lines.join('\n'));
}

// ── UTILS ─────────────────────────────────────────────────────
let waTextContent = '';

function openWAPreview(text) {
  waTextContent = text;
  // Render preview: bold (*text*) → <b>, italic (_text_) → <i>
  const html = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*(.*?)\*/g, '<b>$1</b>')
    .replace(/_(.*?)_/g, '<i>$1</i>');
  document.getElementById('waPreviewText').innerHTML = html;
  document.getElementById('waCopyBtn').innerHTML = ikon('salin') + ' Salin Teks';
  document.getElementById('waCopyBtn').style.background = '#25D366';
  closeModal('modalExport');
  document.getElementById('modalWA').classList.add('open');
}

async function copyWAText() {
  try {
    await navigator.clipboard.writeText(waTextContent);
    const btn = document.getElementById('waCopyBtn');
    btn.innerHTML = ikon('cek-bulat') + ' Tersalin';
    btn.style.background = 'var(--green)';
    setTimeout(() => {
      btn.innerHTML = ikon('salin') + ' Salin Teks';
      btn.style.background = '#25D366';
    }, 2000);
  } catch {
    // Fallback untuk browser yang tidak support clipboard API
    const ta = document.createElement('textarea');
    ta.value = waTextContent;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✅ Teks tersalin!', 'success');
  }
}
