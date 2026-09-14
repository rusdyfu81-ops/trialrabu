// Lapisan data GPBSI — SATU-SATUNYA file yang memanggil Firebase.
// Browser: window.buatDB   ·   Node (uji): require('./db.js').buatDB
(function (root) {
  'use strict';
  const L = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.Logic;

  function buatDB(firebase, config, daftarIbadah) {
    firebase.initializeApp(config);
    const auth = firebase.auth();
    const fs = firebase.firestore();
    const FV = firebase.firestore.FieldValue;

    // Cache offline: absen tetap tersimpan di perangkat saat sinyal hilang dan terkirim otomatis saat online.
    // Harus dipanggil sebelum operasi Firestore lain.
    fs.enablePersistence({ synchronizeTabs: true })
      .catch(e => console.warn('[GPBSI] Cache offline tidak aktif:', e.code || e.message));

    const jemaatRef = id => fs.collection('jemaat').doc(String(id));
    const sesiRef = (tanggal, kode) => fs.collection('sesi').doc(L.sesiId(tanggal, kode));
    const configRef = () => fs.collection('config').doc('app');
    const bersih = obj => JSON.parse(JSON.stringify(obj));   // Firestore menolak nilai undefined
    function cariIbadah(kode) {
      const ib = daftarIbadah.find(i => i.kode === kode);
      if (!ib) throw new Error('Ibadah tidak dikenal: ' + kode);
      return ib;
    }
    const dengar = (q, onData, onError) =>
      q.onSnapshot({ includeMetadataChanges: true },
        snap => onData(snap.docs.map(d => d.data()), { hasPendingWrites: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache }),
        onError);

    return {
      // ── Akun ──
      onAuth(cb) { return auth.onAuthStateChanged(user => cb(user ? { email: user.email, uid: user.uid } : null)); },
      login(email, password) { return auth.signInWithEmailAndPassword(email, password); },
      logout() { return auth.signOut(); },
      emailAktif() { return auth.currentUser ? auth.currentUser.email : ''; },

      // ── PIN ──
      async getPinHash() {
        const s = await configRef().get();
        return (s.exists && s.data().pin_hash) || '';
      },
      setPinHash(hash) { return configRef().set({ pin_hash: hash }, { merge: true }); },

      // ── Jemaat ──
      listenJemaat(onData, onError) { return dengar(fs.collection('jemaat'), onData, onError); },
      addJemaat(data) {
        return fs.runTransaction(async tx => {
          const cfg = await tx.get(configRef());
          const id = (cfg.exists && cfg.data().next_jemaat_id) || 1;
          tx.set(jemaatRef(id), bersih({ ...data, id }));
          tx.set(configRef(), { next_jemaat_id: id + 1 }, { merge: true });
          return id;
        });
      },
      updateJemaat(id, data) { return jemaatRef(id).update(bersih(data)); },
      deleteJemaat(id) { return jemaatRef(id).delete(); },

      // ── Sesi ibadah ──
      listenSesiTahun(tahun, onData, onError) { return dengar(fs.collection('sesi').where('tahun', '==', tahun), onData, onError); },
      createSesi(tanggal, kode) {
        const ib = cariIbadah(kode);
        // merge: bila sesi sudah ada, isi kehadiran tidak tersentuh
        return sesiRef(tanggal, kode).set({ tanggal, kode, ibadah: ib.nama, tahun: parseInt(tanggal.slice(0, 4), 10) }, { merge: true });
      },
      deleteSesi(tanggal, kode) { return sesiRef(tanggal, kode).delete(); },
      saveKehadiran(tanggal, kode, changes) {
        const upd = {};
        Object.keys(changes).forEach(jid => {
          const nilai = L.entryKeKehadiran(changes[jid]);
          upd['kehadiran.' + jid] = nilai === null ? FV.delete() : nilai;
        });
        if (!Object.keys(upd).length) return Promise.resolve();
        return sesiRef(tanggal, kode).update(upd);
      },

      // ── Error log ──
      log(entry) { return fs.collection('logs').add({ ...bersih(entry), created_at: FV.serverTimestamp() }); },
      async listLogs(n) {
        const s = await fs.collection('logs').orderBy('created_at', 'desc').limit(n).get();
        return s.docs.map(d => {
          const x = d.data();
          const waktu = x.created_at && x.created_at.toDate ? x.created_at.toDate() : new Date();
          return { ...x, created_at: waktu.toISOString() };
        });
      },
      async clearLogs() {
        let total = 0;
        for (;;) {
          const s = await fs.collection('logs').limit(400).get();
          if (s.empty) break;
          const b = fs.batch();
          s.docs.forEach(d => b.delete(d.ref));
          await b.commit();
          total += s.size;
          if (s.size < 400) break;
        }
        return total;
      },

      // ── Backup & import ──
      async exportBackup() {
        const [js, ss] = await Promise.all([fs.collection('jemaat').get(), fs.collection('sesi').get()]);
        return L.buatBackup(js.docs.map(d => d.data()), ss.docs.map(d => d.data()), daftarIbadah, new Date().toISOString());
      },
      async adaData() {
        const s = await fs.collection('jemaat').limit(1).get();
        return !s.empty;
      },
      async importBackup(hasil, onProgress) {
        const cfg = await configRef().get();
        const next = Math.max((cfg.exists && cfg.data().next_jemaat_id) || 1, hasil.maxId + 1);
        const ops = [];
        hasil.jemaat.forEach(m => ops.push(b => b.set(jemaatRef(m.id), bersih(m))));
        hasil.sesi.forEach(s => ops.push(b => b.set(sesiRef(s.tanggal, s.kode),
          { tanggal: s.tanggal, kode: s.kode, ibadah: s.ibadah, tahun: s.tahun, kehadiran: s.kehadiran })));
        ops.push(b => b.set(configRef(), { next_jemaat_id: next }, { merge: true }));
        const PER_BATCH = 450;                    // batas Firestore 500 operasi per batch
        for (let i = 0; i < ops.length; i += PER_BATCH) {
          const b = fs.batch();
          ops.slice(i, i + PER_BATCH).forEach(op => op(b));
          await b.commit();
          if (onProgress) onProgress(Math.min(i + PER_BATCH, ops.length), ops.length);
        }
      },
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { buatDB };
  else root.buatDB = buatDB;
})(typeof window !== 'undefined' ? window : globalThis);
