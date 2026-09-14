// Logika murni GPBSI Absensi — tanpa DOM dan tanpa Firebase.
// Browser: window.Logic   ·   Node (uji): require('./logic.js')
(function (root) {
  'use strict';

  const ANAK_KOMISI = ['ANAK'];
  const STATUS_TERSEMBUNYI = ['non-aktif', 'meninggal', 'kuliah'];

  // Normalisasi teks: trim + spasi tunggal + huruf besar
  function u(str) { return (str || '').trim().replace(/\s+/g, ' ').toUpperCase(); }

  function isAktif(m) {
    const st = (m.status || '').toLowerCase();
    return !st || !STATUS_TERSEMBUNYI.includes(st);
  }

  function isAnak(m) { return ANAK_KOMISI.includes((m.komisi || '').toUpperCase()); }

  // Apakah jemaat m peserta ibadah ib (status aktif TIDAK dilihat di sini)
  function ikutIbadah(m, ib) {
    if (ib.peserta === 'semua') return true;
    const pilihan = (m.ibadah || '').toLowerCase();
    return pilihan === ib.nama.toLowerCase() || pilihan === 'keduanya' || pilihan === '';
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function tanggalValid(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1) return false;
    return d <= new Date(y, mo, 0).getDate();
  }

  // '1980-04-17' | '17/04/1980' | '7/9/2015' | '03-11-1975'  →  'YYYY-MM-DD'; selain itu null
  function normTglLahir(str) {
    const s = (str || '').trim();
    let y, mo, d, m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else return null;
    return tanggalValid(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null;
  }

  // 'YYYY-MM-DD' → 'DD/MM/YYYY'; teks lain dikembalikan apa adanya
  function tampilTglLahir(str) {
    const m = (str || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (str || '');
  }

  function bulanLahir(m) {
    const iso = normTglLahir(m.tgl_lahir);
    if (iso) return parseInt(iso.slice(5, 7), 10);
    return m.bulan_lahir ? parseInt(m.bulan_lahir, 10) : 0;
  }

  function hariLahir(m) {
    const iso = normTglLahir(m.tgl_lahir);
    return iso ? parseInt(iso.slice(8, 10), 10) : 99;
  }

  // Tanggal kalender lokal → 'YYYY-MM-DD' (toISOString bisa mundur sehari di WIB)
  function isoLokal(dt) { return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`; }

  // Hari ibadah berikutnya SETELAH `dari` (hari ini Minggu → Minggu depan), sama seperti perilaku lama
  function tanggalBerikutnya(hari, dari) {
    const now = dari || new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    base.setDate(base.getDate() + (((hari - base.getDay() + 7) % 7) || 7));
    return isoLokal(base);
  }

  function sesiId(tanggal, kode) { return `${tanggal}_${kode}`; }

  // Nilai di sesi.kehadiran → {status_hadir, alasan}; kosong → null (= Absen tanpa alasan)
  function kehadiranKeEntry(nilai) {
    if (!nilai) return null;
    return nilai === 'Hadir'
      ? { status_hadir: 'Hadir', alasan: '' }
      : { status_hadir: 'Absen', alasan: String(nilai) };
  }

  // {status_hadir, alasan} → nilai untuk sesi.kehadiran; null = hapus field
  function entryKeKehadiran(entry) {
    if (!entry) return null;
    if (entry.status_hadir === 'Hadir') return 'Hadir';
    return entry.alasan ? String(entry.alasan) : null;
  }

  function urutkanNama(list) { return [...list].sort((a, b) => (a.nama || '').localeCompare(b.nama || '')); }

  // Dokumen jemaat + dokumen sesi → struktur RAW yang dipakai seluruh tampilan
  function bangunRaw(jemaat, sesiList, daftar) {
    const tanggals = {};
    const absensi_map = {};
    daftar.forEach(ib => { tanggals[ib.nama] = []; });
    sesiList.forEach(s => {
      const ib = daftar.find(i => i.kode === s.kode);
      if (!ib) return;
      if (!tanggals[ib.nama].includes(s.tanggal)) tanggals[ib.nama].push(s.tanggal);
      Object.entries(s.kehadiran || {}).forEach(([jid, nilai]) => {
        const e = kehadiranKeEntry(nilai);
        if (!e) return;
        if (!absensi_map[jid]) absensi_map[jid] = {};
        if (!absensi_map[jid][ib.nama]) absensi_map[jid][ib.nama] = {};
        absensi_map[jid][ib.nama][s.tanggal] = e;
      });
    });
    daftar.forEach(ib => tanggals[ib.nama].sort());
    return { jemaat: urutkanNama(jemaat), tanggals, absensi_map };
  }

  const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

  // Backup JSON (aplikasi lama/baru) → data siap ditulis ke Firestore
  function konversiBackup(json, daftar) {
    if (!json || typeof json !== 'object' || !Array.isArray(json.jemaat) || !Array.isArray(json.absensi)) {
      throw new Error('File ini bukan backup GPBSI (tidak ada daftar jemaat/absensi).');
    }
    if (json.meta && json.meta.app && json.meta.app !== 'GPBSI Absensi') {
      throw new Error(`File ini backup dari aplikasi lain: "${json.meta.app}".`);
    }
    const peringatan = [];
    const idJemaat = new Set();
    const jemaat = [];
    let maxId = 0;

    json.jemaat.forEach((m, i) => {
      const id = Number(m.id);
      if (!Number.isInteger(id) || id <= 0) { peringatan.push(`Jemaat urutan ${i + 1} (${m.nama || 'tanpa nama'}) dilewati: ID tidak valid.`); return; }
      if (idJemaat.has(id)) { peringatan.push(`Jemaat ID ${id} dobel — hanya yang pertama dipakai.`); return; }
      idJemaat.add(id);
      maxId = Math.max(maxId, id);
      const bersih = { ...m, id };
      if (m.tgl_lahir) {
        const iso = normTglLahir(m.tgl_lahir);
        if (iso) bersih.tgl_lahir = iso;
        else peringatan.push(`Tanggal lahir "${m.tgl_lahir}" milik ${m.nama} tidak dikenali — disimpan apa adanya.`);
      }
      jemaat.push(bersih);
    });

    const ibadahDariNama = {};
    daftar.forEach(ib => { ibadahDariNama[ib.nama.toLowerCase()] = ib; });
    const sesiMap = {};
    function ambilSesi(tanggal, ib) {
      const id = sesiId(tanggal, ib.kode);
      if (!sesiMap[id]) sesiMap[id] = { id, tanggal, kode: ib.kode, ibadah: ib.nama, tahun: parseInt(tanggal.slice(0, 4), 10), kehadiran: {} };
      return sesiMap[id];
    }

    const ibadahAsing = {};
    let lewatJemaat = 0, lewatTanggal = 0;
    json.absensi.forEach(r => {
      const ib = ibadahDariNama[(r.ibadah || '').toLowerCase()];
      if (!ib) { ibadahAsing[r.ibadah] = (ibadahAsing[r.ibadah] || 0) + 1; return; }
      if (!POLA_TANGGAL.test(r.tanggal || '')) { lewatTanggal++; return; }
      const s = ambilSesi(r.tanggal, ib);          // sesi tetap dibuat walau barisnya "Absen"
      const jid = Number(r.jemaat_id);
      if (!idJemaat.has(jid)) { lewatJemaat++; return; }
      const nilai = entryKeKehadiran({ status_hadir: r.status_hadir, alasan: r.alasan });
      if (nilai) s.kehadiran[String(jid)] = nilai;
    });
    (json.sesi || []).forEach(x => {
      const ib = ibadahDariNama[(x.ibadah || '').toLowerCase()];
      if (ib && POLA_TANGGAL.test(x.tanggal || '')) ambilSesi(x.tanggal, ib);
    });

    Object.entries(ibadahAsing).forEach(([nama, n]) => peringatan.push(`${n} baris absensi dengan ibadah "${nama}" tidak dikenal — dilewati.`));
    if (lewatJemaat) peringatan.push(`${lewatJemaat} baris absensi milik jemaat yang tidak ada di daftar — dilewati.`);
    if (lewatTanggal) peringatan.push(`${lewatTanggal} baris absensi dengan tanggal tidak valid — dilewati.`);

    const sesi = Object.values(sesiMap).sort((a, b) => a.id.localeCompare(b.id));
    return { jemaat, sesi, maxId, peringatan, ringkasan: { jemaat: jemaat.length, absensi: json.absensi.length, sesi: sesi.length } };
  }

  // Dokumen sesi → baris absensi format backup lama
  function sesiKeBarisAbsensi(sesiList, daftar) {
    const rows = [];
    sesiList.forEach(s => {
      const ib = daftar.find(i => i.kode === s.kode);
      if (!ib) return;
      Object.entries(s.kehadiran || {}).forEach(([jid, nilai]) => {
        const e = kehadiranKeEntry(nilai);
        if (e) rows.push({ tanggal: s.tanggal, jemaat_id: Number(jid), ibadah: ib.nama, status_hadir: e.status_hadir, alasan: e.alasan });
      });
    });
    return rows.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.ibadah.localeCompare(b.ibadah) || a.jemaat_id - b.jemaat_id);
  }

  // Isi file Backup JSON (format lama + field opsional `sesi` agar tanggal kosong tidak hilang)
  function buatBackup(jemaat, sesiList, daftar, waktuIso) {
    const absensi = sesiKeBarisAbsensi(sesiList, daftar);
    const sesi = sesiList
      .map(s => { const ib = daftar.find(i => i.kode === s.kode); return ib ? { tanggal: s.tanggal, ibadah: ib.nama } : null; })
      .filter(Boolean)
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.ibadah.localeCompare(b.ibadah));
    const js = urutkanNama(jemaat);
    return {
      meta: { app: 'GPBSI Absensi', exported_at: waktuIso, jemaat_count: js.length, absensi_count: absensi.length },
      jemaat: js, absensi, sesi,
    };
  }

  function catatanPada(RAW, jid, namaIbadah, tanggal) {
    const perJemaat = RAW.absensi_map[jid];
    const e = perJemaat && perJemaat[namaIbadah] && perJemaat[namaIbadah][tanggal];
    return e || null;
  }

  function hadirPada(RAW, jid, namaIbadah, tanggal) {
    const e = catatanPada(RAW, jid, namaIbadah, tanggal);
    return !!e && e.status_hadir === 'Hadir';
  }

  function urutKeluargaNama(arr) {
    return arr.sort((a, b) => (u(a.keluarga_nama) || 'ZZZ').localeCompare(u(b.keluarga_nama) || 'ZZZ') || a.nama.localeCompare(b.nama));
  }

  // Follow-up: minggu absen berturut-turut, hanya ibadah followup:true (Minggu).
  // Seminggu dianggap hadir bila hadir di salah satu ibadah followup pada tanggal itu.
  function hitungFollowup(RAW, refDate, daftar) {
    if (!refDate || !RAW) return null;
    const ibFu = daftar.filter(ib => ib.followup);
    const adaSesi = (ib, d) => (RAW.tanggals[ib.nama] || []).includes(d);
    const semuaTanggal = [...new Set(ibFu.flatMap(ib => RAW.tanggals[ib.nama] || []))].sort();
    const lampau = semuaTanggal.filter(d => d <= refDate).reverse();
    const harusIkut = (m, d) => ibFu.some(ib => ikutIbadah(m, ib) && adaSesi(ib, d));
    const hadirSalahSatu = (m, d) => ibFu.some(ib => hadirPada(RAW, m.id, ib.nama, d));

    const hasil = { absenHariIni: [], absen2Minggu: [], absen3Minggu: [], absen4Minggu: [], absenLebih4: [], absenLebih8: [] };
    RAW.jemaat.filter(isAktif).forEach(m => {
      if (!harusIkut(m, refDate)) return;
      let streak = 0;
      for (const d of lampau) {
        if (hadirSalahSatu(m, d)) break;
        if (harusIkut(m, d)) streak++;
        else break;
      }
      if (streak === 0) return;
      const x = { ...m, streak };
      if (streak === 1) hasil.absenHariIni.push(x);
      else if (streak === 2) hasil.absen2Minggu.push(x);
      else if (streak === 3) hasil.absen3Minggu.push(x);
      else if (streak === 4) hasil.absen4Minggu.push(x);
      else if (streak <= 8) hasil.absenLebih4.push(x);
      else hasil.absenLebih8.push(x);
    });
    Object.values(hasil).forEach(urutKeluargaNama);
    return hasil;
  }

  // Ringkasan satu tanggal — dipakai Report Per Tanggal dan Export laporan.
  // Anggota = peserta ibadah yang aktif, atau yang punya catatan (hadir/alasan) di sesi itu.
  function ringkasanTanggal(RAW, tanggal, daftar) {
    const perIbadah = daftar
      .filter(ib => (RAW.tanggals[ib.nama] || []).includes(tanggal))
      .map(ib => {
        const anggota = RAW.jemaat.filter(m => ikutIbadah(m, ib) && (isAktif(m) || catatanPada(RAW, m.id, ib.nama, tanggal)));
        const hadir = anggota.filter(m => hadirPada(RAW, m.id, ib.nama, tanggal));
        const absen = anggota.filter(m => !hadirPada(RAW, m.id, ib.nama, tanggal));
        return { ib, anggota, hadir, absen, anakHadir: hadir.filter(isAnak), dewasaHadir: hadir.filter(m => !isAnak(m)) };
      });
    const fu = perIbadah.filter(x => x.ib.followup);
    let gabungan = null;
    if (fu.length) {
      const anggotaIds = new Set(fu.flatMap(x => x.anggota.map(m => m.id)));
      const hadirIds = new Set(fu.flatMap(x => x.hadir.map(m => m.id)));
      gabungan = {
        totalHadir: hadirIds.size,
        tidakHadirSemua: RAW.jemaat.filter(m => anggotaIds.has(m.id) && !hadirIds.has(m.id)),
      };
    }
    return { perIbadah, gabungan };
  }

  const api = {
    ANAK_KOMISI, u, isAktif, isAnak, ikutIbadah,
    normTglLahir, tampilTglLahir, bulanLahir, hariLahir, isoLokal, tanggalBerikutnya,
    sesiId, kehadiranKeEntry, entryKeKehadiran, urutkanNama,
    bangunRaw, konversiBackup, sesiKeBarisAbsensi, buatBackup,
    catatanPada, hadirPada, hitungFollowup, ringkasanTanggal,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
