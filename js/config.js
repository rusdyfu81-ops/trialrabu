// Konfigurasi GPBSI Absensi.
// Config web Firebase BUKAN rahasia — data dilindungi oleh firestore.rules + login email.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAvgzpO1rQVCUXqHQMQn54HmXizuXm6nzg',
  authDomain: 'absensigpbsi-cd11b.firebaseapp.com',
  projectId: 'absensigpbsi-cd11b',
  storageBucket: 'absensigpbsi-cd11b.firebasestorage.app',
  messagingSenderId: '546470167379',
  appId: '1:546470167379:web:0f0491a61e8cef73f5d7a6'
};

// DAFTAR IBADAH — satu-satunya tempat ibadah didefinisikan.
//   hari     : 0 = Minggu … 6 = Sabtu (usulan tanggal di "Tambah Tanggal")
//   peserta  : 'pilihan' = sesuai pilihan Ibadah di profil jemaat; 'semua' = semua jemaat
//   followup : ikut dihitung di Follow-up dan "Tidak Hadir Kedua Ibadah"
const IBADAH = [
  { kode: 'IB1',  nama: 'Ibadah 1',    label: 'Ibadah 1', ikon: 'gereja', hari: 0, peserta: 'pilihan', followup: true  },
  { kode: 'IB2',  nama: 'Ibadah 2',    label: 'Ibadah 2', ikon: 'gereja', hari: 0, peserta: 'pilihan', followup: true  },
  { kode: 'RABU', nama: 'Ibadah Rabu', label: 'Rabu',     ikon: 'buku',   hari: 3, peserta: 'semua',   followup: false },
];

if (typeof module !== 'undefined' && module.exports) module.exports = { FIREBASE_CONFIG, IBADAH };
