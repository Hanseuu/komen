/**
 * Data demo untuk versi statis.
 *
 * Isinya sama seperti versi server, hanya saja gambar contoh dibuat langsung
 * di peramban memakai canvas lalu disimpan sebagai data URL — tidak ada
 * berkas maupun endpoint gambar.
 */

import { setState, syncSeq, db } from './store.js';
import {
  buildRoomCode, nowSql, dateOffset, timeOffset, periodOffset, dueOn,
} from './helpers.js';

const ROOM_PRICES = { 1: 1_200_000, 2: 1_350_000, 3: 1_500_000 };
const ROOMS_PER_FLOOR = 10;
const FLOORS = [1, 2, 3];

const OWNER_ID = 1;
const DEMO_ID = 2;
const FIRST_TENANT_ID = 3;

const DEMO_TENANT = {
  name: 'Putu Ardana',
  email: 'penyewa@komen.id',
  password: 'penyewa123',
  room: [1, 2],
  phone: '081234567800',
  job: 'Mahasiswa Pascasarjana',
  color: '#1d4ed8',
};

const TENANTS = [
  { name: 'Rizky Pratama',    room: [1, 1],  phone: '081234567801', job: 'Mahasiswa Teknik Informatika', color: '#2563eb' },
  { name: 'Siti Nurhaliza',   room: [1, 3],  phone: '081234567802', job: 'Karyawan Swasta',              color: '#db2777' },
  { name: 'Ahmad Fauzi',      room: [1, 5],  phone: '081234567803', job: 'Barista',                      color: '#059669' },
  { name: 'Dewi Lestari',     room: [1, 8],  phone: '081234567804', job: 'Guru SD',                      color: '#7c3aed' },
  { name: 'Bagus Setiawan',   room: [2, 2],  phone: '081234567805', job: 'Desainer Grafis',              color: '#ea580c' },
  { name: 'Maya Anggraini',   room: [2, 4],  phone: '081234567806', job: 'Mahasiswi Kedokteran',         color: '#0891b2' },
  { name: 'Yoga Permana',     room: [2, 7],  phone: '081234567807', job: 'Programmer',                   color: '#4f46e5' },
  { name: 'Putri Maharani',   room: [2, 10], phone: '081234567808', job: 'Apoteker',                     color: '#be123c' },
  { name: 'Hendra Wijaya',    room: [3, 1],  phone: '081234567809', job: 'Sales Executive',              color: '#15803d' },
  { name: 'Nabila Rahmawati', room: [3, 6],  phone: '081234567810', job: 'Content Creator',              color: '#c026d3' },
  { name: 'Arif Budiman',     room: [3, 9],  phone: '081234567811', job: 'Teknisi Jaringan',             color: '#0d9488' },
];

const FACILITIES = [
  { name: 'WiFi 100 Mbps', icon: '📶', category: 'internet', location: 'Seluruh gedung', description: 'Internet fiber unlimited, satu SSID per lantai. Password dapat diminta ke pemilik lewat chat.' },
  { name: 'Dapur Bersama', icon: '🍳', category: 'dapur', location: 'Lantai 1 belakang', description: 'Dilengkapi kompor gas 2 tungku, kulkas 2 pintu, dispenser, dan rak penyimpanan berlabel nomor kamar.' },
  { name: 'Parkir Motor & Mobil', icon: '🛵', category: 'parkir', location: 'Halaman depan', description: 'Kapasitas 25 motor dan 3 mobil. Beratap, dengan portal otomatis dan kunci akses per penyewa.' },
  { name: 'CCTV 24 Jam', icon: '📹', category: 'keamanan', location: 'Koridor & parkir', description: '8 titik kamera dengan rekaman tersimpan 14 hari. Rekaman dapat diminta bila diperlukan.' },
  { name: 'Area Jemur & Mesin Cuci', icon: '🧺', category: 'kebersihan', location: 'Rooftop lantai 3', description: '2 unit mesin cuci bersama (gratis) dan area jemur beratap. Mohon ambil cucian maksimal 1x24 jam.' },
  { name: 'Ruang Santai & Co-Working', icon: '🛋️', category: 'umum', location: 'Lantai 2 tengah', description: 'Sofa, meja panjang, colokan di tiap sisi, dan AC. Cocok untuk belajar atau kerja remote.' },
  { name: 'Air Panas di Kamar Mandi', icon: '🚿', category: 'kamar', location: 'Semua kamar mandi', description: 'Water heater gas terpusat, air panas tersedia 24 jam di seluruh kamar mandi.' },
  { name: 'Petugas Kebersihan Harian', icon: '🧹', category: 'kebersihan', location: 'Area umum', description: 'Area umum, koridor, dan kamar mandi bersama dibersihkan setiap hari pukul 08.00-10.00.' },
  { name: 'Akses Kartu 24 Jam', icon: '🔑', category: 'keamanan', location: 'Pintu utama', description: 'Pintu gerbang utama memakai kartu akses, bebas jam malam namun mohon jaga ketenangan setelah 22.00.' },
];

const FLOORPLANS = [
  {
    floor: 1,
    title: 'Lantai 1 — Akses Utama & Dapur',
    tone: ['#5f7494', '#8da3c4'],
    description: [
      'Lantai dasar berisi kamar 101-110, lobi penerima, dapur bersama, dan area parkir.',
      '',
      'Tata letak (dari pintu masuk):',
      '• Kiri  : kamar 101, 102, 103, 104, 105',
      '• Kanan : kamar 106, 107, 108, 109, 110',
      '• Ujung koridor: dapur bersama + 2 kamar mandi',
      '',
      'Jalur evakuasi: koridor tengah menuju pintu depan dan pintu samping dekat dapur.',
      'APAR tersedia di dekat kamar 105 dan di dapur.',
    ].join('\n'),
  },
  {
    floor: 2,
    title: 'Lantai 2 — Kamar & Ruang Santai',
    tone: ['#547c84', '#86b3bb'],
    description: [
      'Kamar 201-210 mengelilingi ruang santai / co-working di bagian tengah.',
      '',
      'Tata letak:',
      '• Sisi timur : kamar 201-205 (jendela menghadap taman)',
      '• Sisi barat : kamar 206-210',
      '• Tengah     : ruang santai, dispenser, dan 3 kamar mandi',
      '',
      'Tangga utama berada di sisi selatan, tangga darurat di sisi utara.',
      'APAR tersedia di depan kamar 205.',
    ].join('\n'),
  },
  {
    floor: 3,
    title: 'Lantai 3 — Kamar & Rooftop',
    tone: ['#706c98', '#a09ccb'],
    description: [
      'Kamar 301-310 dengan akses langsung ke rooftop (area jemur & mesin cuci).',
      '',
      'Tata letak:',
      '• Sisi timur : kamar 301-305',
      '• Sisi barat : kamar 306-310',
      '• Rooftop    : area jemur beratap, 2 mesin cuci, tempat duduk',
      '',
      'Akses rooftop dibuka 05.00-22.00. Mohon tidak menjemur di koridor.',
      'APAR tersedia di dekat pintu rooftop.',
    ].join('\n'),
  },
];

const PLACES = [
  { name: 'Laundry Kilat Melati', category: 'laundry', address: 'Jl. Melati No. 20', distance: 120, lat: -7.78225, lng: 110.36775 },
  { name: 'Simply Fresh Laundry', category: 'laundry', address: 'Jl. Kenanga No. 5', distance: 450, lat: -7.78410, lng: 110.36920 },
  { name: 'Indomaret Melati', category: 'minimarket', address: 'Jl. Melati No. 31', distance: 180, lat: -7.78255, lng: 110.36650 },
  { name: 'Alfamart Kenanga', category: 'minimarket', address: 'Jl. Kenanga No. 12', distance: 520, lat: -7.78480, lng: 110.36810 },
  { name: 'SPBU Pertamina 44.552.10', category: 'spbu', address: 'Jl. Raya Utama Km 3', distance: 850, lat: -7.78650, lng: 110.37150 },
  { name: 'SPBU Shell Ring Road', category: 'spbu', address: 'Ring Road Utara', distance: 1800, lat: -7.77520, lng: 110.37880 },
  { name: 'Warung Bu Tini (24 jam)', category: 'warung', address: 'Jl. Melati No. 8', distance: 90, lat: -7.78240, lng: 110.36720 },
  { name: 'Ayam Geprek Pak Slamet', category: 'warung', address: 'Jl. Dahlia No. 3', distance: 300, lat: -7.78350, lng: 110.36580 },
  { name: 'Apotek Melati Sehat', category: 'apotek', address: 'Jl. Melati No. 45', distance: 400, lat: -7.78180, lng: 110.36480 },
  { name: 'Klinik Pratama Amanah', category: 'apotek', address: 'Jl. Kenanga No. 2', distance: 650, lat: -7.78520, lng: 110.36990 },
  { name: 'ATM BCA Melati', category: 'atm', address: 'Jl. Melati No. 30', distance: 190, lat: -7.78260, lng: 110.36660 },
  { name: 'ATM Bersama Kenanga', category: 'atm', address: 'Jl. Kenanga No. 10', distance: 540, lat: -7.78470, lng: 110.36830 },
  { name: 'Masjid Al-Hikmah', category: 'masjid', address: 'Jl. Melati No. 2', distance: 150, lat: -7.78210, lng: 110.36690 },
  { name: 'Halte Trans Jogja Melati', category: 'transportasi', address: 'Jl. Raya Utama', distance: 700, lat: -7.78590, lng: 110.37050 },
];

const COMPLAINTS = [
  {
    tenant: DEMO_TENANT.name,
    title: 'Keran kamar mandi bocor',
    description: 'Keran di kamar mandi dalam kamar 102 menetes terus sejak dua hari lalu, lantai jadi selalu basah dan ada genangan di sudut. Sudah dicoba dikencangkan tapi tetap menetes.',
    category: 'air', location: 'kamar_mandi', priority: 'sedang', status: 'baru',
    createdAt: timeOffset(-20), photos: 2, tone: ['#5c7688', '#9fb6c4'],
  },
  {
    tenant: 'Maya Anggraini',
    title: 'AC tidak dingin',
    description: 'AC di kamar 204 hanya mengeluarkan angin tanpa dingin, padahal sudah disetel 18 derajat. Kemungkinan perlu isi freon atau cuci filter.',
    category: 'ac', location: 'kamar', priority: 'tinggi', status: 'diproses',
    createdAt: timeOffset(-54), photos: 1, tone: ['#6e7094', '#a8aacf'],
    updates: [{ note: 'Laporan diterima, teknisi AC akan datang besok pagi sekitar pukul 10.00.', status: 'diproses', at: timeOffset(-40) }],
  },
  {
    tenant: 'Hendra Wijaya',
    title: 'Lampu koridor lantai 3 mati',
    description: 'Dua lampu di koridor dekat kamar 301 mati, jadi gelap kalau pulang malam. Mohon diganti ya.',
    category: 'listrik', location: 'koridor', priority: 'sedang', status: 'diproses',
    createdAt: timeOffset(-70), photos: 1, tone: ['#54607c', '#8e9ab6'],
    updates: [{ note: 'Lampu LED sudah dibeli, pemasangan menunggu tukang hari Kamis.', status: 'diproses', at: timeOffset(-48) }],
  },
  {
    tenant: 'Rizky Pratama',
    title: 'WiFi lantai 1 sering putus',
    description: 'Koneksi WiFi di kamar 101 sering terputus terutama malam hari sekitar jam 20.00-22.00. Sinyal penuh tapi tidak bisa akses internet.',
    category: 'internet', location: 'kamar', priority: 'sedang', status: 'selesai',
    createdAt: timeOffset(-220), resolvedAt: timeOffset(-150), photos: 0,
    updates: [
      { note: 'Router lantai 1 sudah di-restart dan firmware diperbarui.', status: 'diproses', at: timeOffset(-200) },
      { note: 'Sudah dipasang access point tambahan di tengah koridor. Mohon dicek kembali.', status: 'selesai', at: timeOffset(-150) },
    ],
  },
  {
    tenant: 'Dewi Lestari',
    title: 'Pintu lemari lepas',
    description: 'Engsel atas pintu lemari di kamar 108 lepas sehingga pintu menggantung dan susah ditutup.',
    category: 'furnitur', location: 'kamar', priority: 'rendah', status: 'selesai',
    createdAt: timeOffset(-300), resolvedAt: timeOffset(-260), photos: 1, tone: ['#78687a', '#b4a4b6'],
    updates: [{ note: 'Engsel sudah diganti dengan yang baru dan pintu disetel ulang.', status: 'selesai', at: timeOffset(-260) }],
  },
  {
    tenant: 'Nabila Rahmawati',
    title: 'Kunci kamar seret',
    description: 'Kunci kamar 306 susah diputar, harus digoyang-goyang dulu. Takutnya nanti macet total atau kuncinya patah di dalam.',
    category: 'kunci', location: 'kamar', priority: 'tinggi', status: 'baru',
    createdAt: timeOffset(-6), photos: 1, tone: ['#806e58', '#bfae96'],
  },
];

/* -------------------------------------------------------------------------- */
/* Gambar contoh dibuat dengan canvas                                         */
/* -------------------------------------------------------------------------- */

/**
 * Menggambar placeholder bergradien + grid halus, lalu mengembalikannya
 * sebagai data URL JPEG. Dipakai sebagai "foto" contoh pada data demo.
 */
function placeholderImage(label, [from, to], { width = 400, height = 266 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, to);
  grad.addColorStop(1, from);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Grid tipis agar tidak terlihat seperti blok warna polos.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = 40; x < width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 40; y < height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  // Label kecil di tengah.
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width / 2, height / 2);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('contoh gambar demo', width / 2, height / 2 + 24);

  return canvas.toDataURL('image/jpeg', 0.72);
}

/* -------------------------------------------------------------------------- */
/* Seeder                                                                     */
/* -------------------------------------------------------------------------- */

const roomIdFor = (floor, n) => (floor - 1) * ROOMS_PER_FLOOR + n;

/** Bangun seluruh data demo lalu simpan ke localStorage. */
export function seedDemoData() {
  const s = {
    seq: {},
    session: null,
    rooms: [],
    users: [],
    floorplans: [],
    facilities: [],
    places: [],
    announcements: [],
    announcementReads: [],
    complaints: [],
    complaintPhotos: [],
    complaintUpdates: [],
    bills: [],
    payments: [],
    messages: [],
    notifications: [],
    waLogs: [],
  };

  /* ------------------------------------------------------------- kamar --- */
  for (const floor of FLOORS) {
    for (let n = 1; n <= ROOMS_PER_FLOOR; n += 1) {
      s.rooms.push({
        id: roomIdFor(floor, n),
        floor,
        number: n,
        code: buildRoomCode(floor, n),
        price: ROOM_PRICES[floor],
        size: floor === 3 ? '3.5 x 4 m' : '3 x 4 m',
        notes: n % 5 === 0 ? 'Kamar sudut, jendela ganda' : '',
        createdAt: nowSql(),
      });
    }
  }

  /* --------------------------------------------------------- pengguna --- */
  const makeEmail = (name) =>
    `${name.toLowerCase().split(' ')[0]}.${name.toLowerCase().split(' ').slice(-1)[0]}@mail.com`;

  s.users.push({
    id: OWNER_ID,
    name: 'Bu Sulastri',
    email: 'owner@komen.id',
    phone: '081200001111',
    password: 'owner123',
    role: 'owner',
    roomId: null,
    status: 'aktif',
    occupation: 'Pemilik Kos',
    emergencyContact: '081200002222',
    checkInDate: null,
    checkOutDate: null,
    avatarColor: '#0f766e',
    createdAt: nowSql(),
  });

  s.users.push({
    id: DEMO_ID,
    name: DEMO_TENANT.name,
    email: DEMO_TENANT.email,
    phone: DEMO_TENANT.phone,
    password: DEMO_TENANT.password,
    role: 'tenant',
    roomId: roomIdFor(...DEMO_TENANT.room),
    status: 'aktif',
    occupation: DEMO_TENANT.job,
    emergencyContact: '081299990000',
    checkInDate: dateOffset(-95),
    checkOutDate: null,
    avatarColor: DEMO_TENANT.color,
    createdAt: nowSql(),
  });

  TENANTS.forEach((t, i) => {
    s.users.push({
      id: FIRST_TENANT_ID + i,
      name: t.name,
      email: makeEmail(t.name),
      phone: t.phone,
      password: 'penyewa123',
      role: 'tenant',
      roomId: roomIdFor(...t.room),
      status: 'aktif',
      occupation: t.job,
      emergencyContact: `0812000033${String(i).padStart(2, '0')}`,
      checkInDate: dateOffset(-(30 + i * 17)),
      checkOutDate: null,
      avatarColor: t.color,
      createdAt: nowSql(),
    });
  });

  // Satu mantan penyewa untuk menguji filter daftar penyewa.
  s.users.push({
    id: FIRST_TENANT_ID + TENANTS.length,
    name: 'Ratna Juwita',
    email: 'ratna.juwita@mail.com',
    phone: '081234567899',
    password: 'penyewa123',
    role: 'tenant',
    roomId: null,
    status: 'nonaktif',
    occupation: 'Perawat',
    emergencyContact: '',
    checkInDate: dateOffset(-420),
    checkOutDate: dateOffset(-40),
    avatarColor: '#64748b',
    createdAt: nowSql(),
  });

  const idByName = new Map(s.users.map((u) => [u.name, u.id]));

  /* --------------------------------------------- denah & fasilitas ------ */
  FLOORPLANS.forEach((fp, i) => {
    s.floorplans.push({
      id: i + 1,
      floor: fp.floor,
      title: fp.title,
      description: fp.description,
      imagePath: placeholderImage(`Denah Lantai ${fp.floor}`, fp.tone, { width: 520, height: 340 }),
      updatedAt: nowSql(),
    });
  });

  FACILITIES.forEach((f, i) => {
    s.facilities.push({
      id: i + 1,
      name: f.name,
      description: f.description,
      category: f.category,
      icon: f.icon,
      location: f.location,
      photoPath: i < 3 ? placeholderImage(f.name, ['#4f6b82', '#90a9bd']) : null,
      isPublished: 1,
      sortOrder: i + 1,
      updatedAt: nowSql(),
    });
  });

  PLACES.forEach((p, i) => {
    s.places.push({
      id: i + 1,
      name: p.name,
      category: p.category,
      address: p.address,
      distanceM: p.distance,
      lat: p.lat,
      lng: p.lng,
      mapsQuery: `${p.name} ${p.address}`,
      isActive: 1,
    });
  });

  /* ---------------------------------------------------- pengumuman ------ */
  const anns = [
    [1, 'Pembayaran Kos Bulan Ini',
      `Diinformasikan kepada seluruh penyewa bahwa pembayaran kos untuk bulan ini sudah dapat dilakukan melalui aplikasi Komen.\n\nPembayaran dapat dilakukan dengan QRIS atau Virtual Account pada menu "Tagihan Saya". Batas pembayaran adalah tanggal 5 setiap bulan.\n\nTerima kasih atas kerja samanya.`,
      'semua', 'pembayaran', 'terbit', 1, 0, null, timeOffset(-72)],
    [2, 'Perbaikan Pompa Air Lantai 2',
      `Akan dilakukan perbaikan pompa air di lantai 2 pada hari Sabtu pukul 09.00 - 12.00.\n\nSelama proses perbaikan, aliran air di lantai 2 akan dimatikan sementara. Mohon menyiapkan air secukupnya sebelum jam tersebut.\n\nMohon maaf atas ketidaknyamanannya.`,
      'lantai_2', 'perbaikan', 'terbit', 0, 0, null, timeOffset(-26)],
    [3, 'Kerja Bakti Rooftop Lantai 3',
      `Mengajak seluruh penghuni lantai 3 untuk kerja bakti membersihkan area rooftop dan area jemur pada hari Minggu pukul 07.00.\n\nAlat kebersihan disediakan oleh pemilik kos. Sarapan dan kopi gratis untuk yang hadir!`,
      'lantai_3', 'kebersihan', 'terbit', 0, 0, null, timeOffset(-10)],
    [4, 'Jadwal Semprot Disinfektan Lantai 1',
      `Petugas akan melakukan penyemprotan disinfektan di koridor dan kamar mandi bersama lantai 1.\n\nMohon kamar dalam keadaan tertutup pada jam pelaksanaan. Tidak perlu meninggalkan kamar.`,
      'lantai_1', 'kebersihan', 'terbit', 0, 0, null, timeOffset(-4)],
    [5, 'Pemeriksaan Listrik Berkala',
      `Teknisi akan melakukan pemeriksaan instalasi listrik di seluruh kamar secara berkala.\n\nPemeriksaan berlangsung singkat (±5 menit per kamar). Mohon kesediaannya untuk membukakan pintu saat petugas datang.`,
      'semua', 'informasi', 'terjadwal', 0, 0, timeOffset(48), null],
    [6, 'Pengingat: Jatuh Tempo Pembayaran',
      `Pengingat bahwa batas akhir pembayaran kos bulan ini adalah tanggal 5.\n\nMohon segera melakukan pembayaran melalui aplikasi Komen untuk menghindari denda keterlambatan.`,
      'semua', 'pembayaran', 'terjadwal', 0, 1, timeOffset(96), null],
  ];

  for (const [id, title, body, target, category, status, pinned, wa, scheduledAt, publishedAt] of anns) {
    s.announcements.push({
      id,
      title,
      body,
      target,
      category,
      status,
      isPinned: pinned,
      sendWhatsapp: wa,
      scheduledAt,
      publishedAt,
      createdBy: OWNER_ID,
      createdAt: publishedAt || nowSql(),
      updatedAt: publishedAt || nowSql(),
    });
  }

  // Sebagian penyewa sudah membaca pengumuman pertama.
  for (const uid of [...idByName.values()].slice(2, 8)) {
    s.announcementReads.push({ announcementId: 1, userId: uid, readAt: timeOffset(-60) });
  }

  /* ------------------------------------------------------- tagihan ------ */
  const activeTenants = [
    { id: DEMO_ID, room: DEMO_TENANT.room },
    ...TENANTS.map((t, i) => ({ id: FIRST_TENANT_ID + i, room: t.room })),
  ].sort((a, b) => a.room[0] - b.room[0] || a.room[1] - b.room[1]);

  let billId = 0;
  let demoPaidBillId = null;
  let demoPaidAmount = 0;

  const addBill = (row) => {
    billId += 1;
    s.bills.push({ id: billId, reminderCount: 0, lastReminderAt: null, note: '', ...row });
    return billId;
  };

  activeTenants.forEach((t, i) => {
    const roomId = roomIdFor(...t.room);
    const price = ROOM_PRICES[t.room[0]];

    const lastMonth = addBill({
      tenantId: t.id, roomId, title: 'Sewa Kamar', period: periodOffset(-1),
      amount: price, dueDate: dueOn(-1), status: 'lunas',
      createdBy: OWNER_ID, createdAt: timeOffset(-24 * 35), paidAt: timeOffset(-24 * 32),
    });
    if (t.id === DEMO_ID) {
      demoPaidBillId = lastMonth;
      demoPaidAmount = price;
    }

    addBill(
      i % 4 === 0
        ? {
          tenantId: t.id, roomId, title: 'Sewa Kamar', period: periodOffset(0),
          amount: price, dueDate: dueOn(0), status: 'lunas',
          createdBy: OWNER_ID, createdAt: timeOffset(-24 * 8), paidAt: timeOffset(-24 * 5),
        }
        : {
          tenantId: t.id, roomId, title: 'Sewa Kamar', period: periodOffset(0),
          amount: price, dueDate: dueOn(0), status: 'belum_bayar',
          createdBy: OWNER_ID, createdAt: timeOffset(-24 * 8), paidAt: null,
        }
    );

    if (i % 3 === 1) {
      addBill({
        tenantId: t.id, roomId, title: 'Tambahan Listrik AC', period: periodOffset(0),
        amount: 150_000, dueDate: dueOn(0, 10), status: 'belum_bayar',
        note: 'Pemakaian AC di atas kuota 50 kWh.',
        createdBy: OWNER_ID, createdAt: timeOffset(-24 * 6), paidAt: null,
      });
    }
  });

  for (const t of activeTenants.slice(5, 7)) {
    addBill({
      tenantId: t.id, roomId: roomIdFor(...t.room), title: 'Denda Keterlambatan',
      period: periodOffset(-1), amount: 50_000, dueDate: dateOffset(-12), status: 'terlambat',
      note: 'Pembayaran melewati tanggal 5.',
      createdBy: OWNER_ID, createdAt: timeOffset(-24 * 20), paidAt: null,
    });
  }

  if (demoPaidBillId) {
    s.payments.push({
      id: 1,
      billId: demoPaidBillId,
      tenantId: DEMO_ID,
      reference: `KMN-${new Date().getFullYear()}-DEMO0001`,
      method: 'va_bca',
      methodLabel: 'Virtual Account BCA',
      amount: demoPaidAmount,
      fee: 4000,
      total: demoPaidAmount + 4000,
      status: 'berhasil',
      qrPayload: null,
      qrImage: null,
      vaNumber: '3908100010001',
      instructions: '',
      failureReason: null,
      expiresAt: null,
      createdAt: timeOffset(-24 * 33),
      settledAt: timeOffset(-24 * 32),
    });
  }

  /* ------------------------------------------------------ komplain ------ */
  let photoId = 0;
  let updateId = 0;

  COMPLAINTS.forEach((c, idx) => {
    const tenantId = idByName.get(c.tenant);
    if (!tenantId) return;
    const cid = idx + 1;
    const tenantRoom = c.tenant === DEMO_TENANT.name
      ? DEMO_TENANT.room
      : TENANTS.find((t) => t.name === c.tenant).room;

    s.complaints.push({
      id: cid,
      tenantId,
      roomId: roomIdFor(...tenantRoom),
      title: c.title,
      description: c.description,
      category: c.category,
      location: c.location,
      priority: c.priority,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updates?.at(-1)?.at || c.createdAt,
      resolvedAt: c.resolvedAt || null,
    });

    updateId += 1;
    s.complaintUpdates.push({
      id: updateId, complaintId: cid, authorId: tenantId,
      status: 'baru', note: 'Laporan dibuat oleh penyewa.', createdAt: c.createdAt,
    });
    for (const u of c.updates || []) {
      updateId += 1;
      s.complaintUpdates.push({
        id: updateId, complaintId: cid, authorId: OWNER_ID,
        status: u.status, note: u.note, createdAt: u.at,
      });
    }
    for (let i = 0; i < (c.photos || 0); i += 1) {
      photoId += 1;
      s.complaintPhotos.push({
        id: photoId,
        complaintId: cid,
        filePath: placeholderImage(c.title, c.tone || ['#5c7688', '#9fb6c4']),
        originalName: `foto-kerusakan-${i + 1}.jpg`,
        uploadedAt: c.createdAt,
      });
    }
  });

  /* ----------------------------------------------------------- chat ----- */
  const mayaId = idByName.get('Maya Anggraini');
  const yogaId = idByName.get('Yoga Permana');
  let msgId = 0;
  const addMsg = (senderId, receiverId, body, createdAt, readAt) => {
    msgId += 1;
    s.messages.push({ id: msgId, senderId, receiverId, body, createdAt, readAt });
  };

  addMsg(DEMO_ID, OWNER_ID, 'Selamat pagi Bu, mau tanya apakah boleh menerima paket lewat satpam kalau saya sedang kuliah?', timeOffset(-96), timeOffset(-94));
  addMsg(OWNER_ID, DEMO_ID, 'Pagi Mas Putu. Boleh sekali, nanti paketnya saya simpan di meja lobi ya. Tolong namanya ditulis jelas di paket.', timeOffset(-94), timeOffset(-92));
  addMsg(DEMO_ID, OWNER_ID, 'Siap Bu, terima kasih banyak 🙏', timeOffset(-92), timeOffset(-90));
  addMsg(DEMO_ID, OWNER_ID, 'Bu, untuk keran kamar mandi yang bocor sudah saya laporkan di menu Lapor Kerusakan ya. Mohon dicek kalau ada waktu.', timeOffset(-18), null);
  if (mayaId) addMsg(mayaId, OWNER_ID, 'Bu, teknisi AC kira-kira datang jam berapa besok?', timeOffset(-30), null);
  if (yogaId) {
    addMsg(OWNER_ID, yogaId, 'Mas Yoga, pembayaran bulan ini sudah masuk ya. Terima kasih.', timeOffset(-120), timeOffset(-118));
    addMsg(yogaId, OWNER_ID, 'Baik Bu, terima kasih konfirmasinya.', timeOffset(-117), timeOffset(-116));
  }

  /* ---------------------------------------------------- notifikasi ------ */
  let notifId = 0;
  const addNotif = (userId, title, body, type, link, isRead, createdAt) => {
    notifId += 1;
    s.notifications.push({ id: notifId, userId, title, body, type, link, isRead, createdAt });
  };
  addNotif(OWNER_ID, 'Laporan baru dari kamar 306', 'Kunci kamar seret — prioritas tinggi.', 'warning', '#/owner/komplain', 0, timeOffset(-6));
  addNotif(OWNER_ID, 'Laporan baru dari kamar 102', 'Keran kamar mandi bocor (2 foto terlampir).', 'warning', '#/owner/komplain', 0, timeOffset(-20));
  addNotif(DEMO_ID, 'Tagihan baru: Sewa Kamar', 'Tagihan sewa bulan ini sudah diterbitkan.', 'bill', '#/penyewa/tagihan', 0, timeOffset(-24 * 8));
  addNotif(DEMO_ID, '📢 Pembayaran Kos Bulan Ini', 'Pembayaran sudah dapat dilakukan lewat QRIS atau Virtual Account.', 'announcement', '#/penyewa/pengumuman', 1, timeOffset(-72));

  /* ------------------------------------------------ simpan & sinkron ---- */
  setState(s);

  const store = db();
  syncSeq('rooms', store.rooms);
  syncSeq('users', store.users);
  syncSeq('floorplans', store.floorplans);
  syncSeq('facilities', store.facilities);
  syncSeq('places', store.places);
  syncSeq('announcements', store.announcements);
  syncSeq('complaints', store.complaints);
  syncSeq('complaintPhotos', store.complaintPhotos);
  syncSeq('complaintUpdates', store.complaintUpdates);
  syncSeq('bills', store.bills);
  syncSeq('payments', store.payments);
  syncSeq('messages', store.messages);
  syncSeq('notifications', store.notifications);
  syncSeq('waLogs', store.waLogs);

  return store;
}
