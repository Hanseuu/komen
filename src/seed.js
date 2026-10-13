import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, migrate } from './db.js';
import { config } from './config.js';
import { hashPassword } from './lib/auth.js';
import { buildRoomCode, nowSql } from './lib/helpers.js';
import { makePlaceholderPng } from './lib/placeholder.js';

/**
 * Pembuat data demo.
 *
 * Catatan penting untuk serverless: setiap query ke Turso adalah satu
 * perjalanan jaringan. Karena itu seluruh data disusun dengan **id eksplisit**
 * lalu dikirim dalam beberapa `batch()` saja — bukan ratusan INSERT berurutan.
 * Hasilnya penyemaian hanya butuh ~6 perjalanan, sehingga aman dijalankan
 * di dalam satu permintaan HTTP meski database berada di region lain.
 */

/* -------------------------------------------------------------------------- */
/* Util tanggal relatif terhadap hari ini                                     */
/* -------------------------------------------------------------------------- */

const d = (offsetDays = 0) => {
  const t = new Date();
  t.setDate(t.getDate() + offsetDays);
  return t.toISOString().slice(0, 10);
};
const dt = (offsetHours = 0) => {
  const t = new Date();
  t.setHours(t.getHours() + offsetHours);
  return t.toISOString().slice(0, 19).replace('T', ' ');
};
const period = (monthOffset = 0) => {
  const t = new Date();
  t.setDate(1);
  t.setMonth(t.getMonth() + monthOffset);
  return t.toISOString().slice(0, 7);
};
/** Tanggal ke-5 pada bulan relatif (jatuh tempo standar). */
const dueOn = (monthOffset = 0, day = 5) => {
  const t = new Date();
  t.setDate(1);
  t.setMonth(t.getMonth() + monthOffset);
  t.setDate(day);
  return t.toISOString().slice(0, 10);
};

/* -------------------------------------------------------------------------- */
/* Data demo                                                                  */
/* -------------------------------------------------------------------------- */

const ROOM_PRICES = { 1: 1_200_000, 2: 1_350_000, 3: 1_500_000 };
const ROOMS_PER_FLOOR = 10; // dari maksimum 30 kamar per lantai

const DEMO_TENANT = {
  name: 'Putu Ardana',
  email: 'penyewa@komen.id',
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
    tone: [96, 116, 148],
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
    tone: [84, 124, 132],
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
    tone: [112, 108, 152],
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
    createdAt: dt(-20), photos: 2, tone: [92, 118, 136],
  },
  {
    tenant: 'Maya Anggraini',
    title: 'AC tidak dingin',
    description: 'AC di kamar 204 hanya mengeluarkan angin tanpa dingin, padahal sudah disetel 18 derajat. Kemungkinan perlu isi freon atau cuci filter.',
    category: 'ac', location: 'kamar', priority: 'tinggi', status: 'diproses',
    createdAt: dt(-54), photos: 1, tone: [110, 112, 148],
    updates: [{ note: 'Laporan diterima, teknisi AC akan datang besok pagi sekitar pukul 10.00.', status: 'diproses', at: dt(-40) }],
  },
  {
    tenant: 'Hendra Wijaya',
    title: 'Lampu koridor lantai 3 mati',
    description: 'Dua lampu di koridor dekat kamar 301 mati, jadi gelap kalau pulang malam. Mohon diganti ya.',
    category: 'listrik', location: 'koridor', priority: 'sedang', status: 'diproses',
    createdAt: dt(-70), photos: 1, tone: [84, 96, 124],
    updates: [{ note: 'Lampu LED sudah dibeli, pemasangan menunggu tukang hari Kamis.', status: 'diproses', at: dt(-48) }],
  },
  {
    tenant: 'Rizky Pratama',
    title: 'WiFi lantai 1 sering putus',
    description: 'Koneksi WiFi di kamar 101 sering terputus terutama malam hari sekitar jam 20.00-22.00. Sinyal penuh tapi tidak bisa akses internet.',
    category: 'internet', location: 'kamar', priority: 'sedang', status: 'selesai',
    createdAt: dt(-220), resolvedAt: dt(-150), photos: 0,
    updates: [
      { note: 'Router lantai 1 sudah di-restart dan firmware diperbarui.', status: 'diproses', at: dt(-200) },
      { note: 'Sudah dipasang access point tambahan di tengah koridor. Mohon dicek kembali.', status: 'selesai', at: dt(-150) },
    ],
  },
  {
    tenant: 'Dewi Lestari',
    title: 'Pintu lemari lepas',
    description: 'Engsel atas pintu lemari di kamar 108 lepas sehingga pintu menggantung dan susah ditutup.',
    category: 'furnitur', location: 'kamar', priority: 'rendah', status: 'selesai',
    createdAt: dt(-300), resolvedAt: dt(-260), photos: 1, tone: [120, 104, 112],
    updates: [{ note: 'Engsel sudah diganti dengan yang baru dan pintu disetel ulang.', status: 'selesai', at: dt(-260) }],
  },
  {
    tenant: 'Nabila Rahmawati',
    title: 'Kunci kamar seret',
    description: 'Kunci kamar 306 susah diputar, harus digoyang-goyang dulu. Takutnya nanti macet total atau kuncinya patah di dalam.',
    category: 'kunci', location: 'kamar', priority: 'tinggi', status: 'baru',
    createdAt: dt(-6), photos: 1, tone: [128, 116, 100],
  },
];

/* -------------------------------------------------------------------------- */
/* Seeder                                                                     */
/* -------------------------------------------------------------------------- */

let seededThisProcess = false;
export const wasSeeded = () => seededThisProcess;

/** id kamar dapat dihitung karena diisi berurutan: lantai 1..3 × kamar 1..10 */
const roomIdFor = (floor, n) => (floor - 1) * ROOMS_PER_FLOOR + n;

const OWNER_ID = 1;
const DEMO_ID = 2;
const FIRST_TENANT_ID = 3; // TENANTS[i] -> FIRST_TENANT_ID + i
const EX_TENANT_ID = FIRST_TENANT_ID + TENANTS.length;

export async function seed({ reset = false } = {}) {
  if (reset) {
    // Urutan penting agar tidak melanggar foreign key.
    const tables = [
      'announcement_reads', 'announcements', 'complaint_updates', 'complaint_photos',
      'complaints', 'payments', 'bills', 'messages', 'notifications', 'wa_logs',
      'sessions', 'nearby_places', 'facilities', 'floorplans', 'images', 'users', 'rooms',
    ];
    await db.batch([
      ...tables.map((t) => ({ sql: `DELETE FROM ${t}`, args: [] })),
      { sql: "DELETE FROM settings WHERE key = 'seeding'", args: [] },
    ]);
  }

  /* --------------------------------------------- 1) kamar & pengguna ------ */
  const tenantIdByName = new Map([[DEMO_TENANT.name, DEMO_ID]]);
  TENANTS.forEach((t, i) => tenantIdByName.set(t.name, FIRST_TENANT_ID + i));

  const userSql = `
    INSERT INTO users (id, name, email, phone, password_hash, role, room_id, status,
                       occupation, emergency_contact, check_in_date, check_out_date, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  // scrypt mahal secara CPU, jadi hash untuk penyewa dibuat sekali lalu dipakai ulang.
  const tenantHash = hashPassword('penyewa123');
  const makeEmail = (name) =>
    `${name.toLowerCase().split(' ')[0]}.${name.toLowerCase().split(' ').slice(-1)[0]}@mail.com`;

  const batch1 = [];

  for (const floor of config.building.floors) {
    for (let n = 1; n <= ROOMS_PER_FLOOR; n += 1) {
      batch1.push({
        sql: 'INSERT INTO rooms (id, floor, number, code, price, size, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [
          roomIdFor(floor, n), floor, n,
          buildRoomCode(floor, n), // format XYY, mis. 1 + 05 -> "105"
          ROOM_PRICES[floor],
          floor === 3 ? '3.5 x 4 m' : '3 x 4 m',
          n % 5 === 0 ? 'Kamar sudut, jendela ganda' : '',
        ],
      });
    }
  }

  batch1.push({
    sql: userSql,
    args: [
      OWNER_ID, 'Bu Sulastri', 'owner@komen.id', '081200001111',
      hashPassword('owner123'), 'owner', null, 'aktif',
      'Pemilik Kos', '081200002222', null, null, '#0f766e',
    ],
  });

  batch1.push({
    sql: userSql,
    args: [
      DEMO_ID, DEMO_TENANT.name, DEMO_TENANT.email, DEMO_TENANT.phone,
      tenantHash, 'tenant', roomIdFor(...DEMO_TENANT.room), 'aktif',
      DEMO_TENANT.job, '081299990000', d(-95), null, DEMO_TENANT.color,
    ],
  });

  TENANTS.forEach((t, i) => {
    batch1.push({
      sql: userSql,
      args: [
        FIRST_TENANT_ID + i, t.name, makeEmail(t.name), t.phone,
        tenantHash, 'tenant', roomIdFor(...t.room), 'aktif',
        t.job, `0812000033${String(i).padStart(2, '0')}`, d(-(30 + i * 17)), null, t.color,
      ],
    });
  });

  // Satu mantan penyewa (nonaktif) untuk menguji filter daftar penyewa.
  batch1.push({
    sql: userSql,
    args: [
      EX_TENANT_ID, 'Ratna Juwita', 'ratna.juwita@mail.com', '081234567899',
      tenantHash, 'tenant', null, 'nonaktif',
      'Perawat', null, d(-420), d(-40), '#64748b',
    ],
  });

  /* -------------------------------- 2) gambar, denah, fasilitas, tempat --- */
  let imageId = 0;
  const batch2 = [];

  /** Buat gambar contoh dengan id eksplisit, kembalikan URL publiknya. */
  const addImage = (kind, name, base) => {
    imageId += 1;
    const png = makePlaceholderPng({ width: 420, height: 280, base });
    batch2.push({
      sql: 'INSERT INTO images (id, kind, mime, bytes, data, original_name) VALUES (?, ?, ?, ?, ?, ?)',
      args: [imageId, kind, 'image/png', png.length, png.toString('base64'), name],
    });
    return `/api/images/${imageId}`;
  };

  FLOORPLANS.forEach((fp, i) => {
    const url = addImage('floorplan', `denah-lantai-${fp.floor}.png`, fp.tone);
    batch2.push({
      sql: 'INSERT INTO floorplans (id, floor, title, description, image_path, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [i + 1, fp.floor, fp.title, fp.description, url, nowSql()],
    });
  });

  FACILITIES.forEach((f, i) => {
    // Tiga fasilitas pertama diberi foto contoh.
    const photo = i < 3
      ? addImage('facility', `fasilitas-${i + 1}.png`, [100 + i * 12, 118, 140 - i * 8])
      : null;
    batch2.push({
      sql: `INSERT INTO facilities (id, name, description, category, icon, location, photo_path, is_published, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      args: [i + 1, f.name, f.description, f.category, f.icon, f.location, photo, i + 1],
    });
  });

  PLACES.forEach((p, i) => {
    batch2.push({
      sql: `INSERT INTO nearby_places (id, name, category, address, distance_m, lat, lng, maps_query, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [i + 1, p.name, p.category, p.address, p.distance, p.lat, p.lng, `${p.name} ${p.address}`],
    });
  });

  /* ------------------------------ 3) pengumuman, tagihan, pembayaran ----- */
  const batch3 = [];
  const annSql = `
    INSERT INTO announcements (id, title, body, target, category, status, is_pinned, send_whatsapp,
                               scheduled_at, published_at, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const announcements = [
    [1, 'Pembayaran Kos Bulan Ini',
      `Diinformasikan kepada seluruh penyewa bahwa pembayaran kos untuk bulan ini sudah dapat dilakukan melalui aplikasi Komen.\n\nPembayaran dapat dilakukan dengan QRIS atau Virtual Account pada menu "Tagihan Saya". Batas pembayaran adalah tanggal 5 setiap bulan.\n\nTerima kasih atas kerja samanya.`,
      'semua', 'pembayaran', 'terbit', 1, 0, null, dt(-72)],
    [2, 'Perbaikan Pompa Air Lantai 2',
      `Akan dilakukan perbaikan pompa air di lantai 2 pada hari Sabtu pukul 09.00 - 12.00.\n\nSelama proses perbaikan, aliran air di lantai 2 akan dimatikan sementara. Mohon menyiapkan air secukupnya sebelum jam tersebut.\n\nMohon maaf atas ketidaknyamanannya.`,
      'lantai_2', 'perbaikan', 'terbit', 0, 0, null, dt(-26)],
    [3, 'Kerja Bakti Rooftop Lantai 3',
      `Mengajak seluruh penghuni lantai 3 untuk kerja bakti membersihkan area rooftop dan area jemur pada hari Minggu pukul 07.00.\n\nAlat kebersihan disediakan oleh pemilik kos. Sarapan dan kopi gratis untuk yang hadir!`,
      'lantai_3', 'kebersihan', 'terbit', 0, 0, null, dt(-10)],
    [4, 'Jadwal Semprot Disinfektan Lantai 1',
      `Petugas akan melakukan penyemprotan disinfektan di koridor dan kamar mandi bersama lantai 1.\n\nMohon kamar dalam keadaan tertutup pada jam pelaksanaan. Tidak perlu meninggalkan kamar.`,
      'lantai_1', 'kebersihan', 'terbit', 0, 0, null, dt(-4)],
    // Pengumuman terjadwal: akan otomatis terbit oleh scheduler.
    [5, 'Pemeriksaan Listrik Berkala',
      `Teknisi akan melakukan pemeriksaan instalasi listrik di seluruh kamar secara berkala.\n\nPemeriksaan berlangsung singkat (±5 menit per kamar). Mohon kesediaannya untuk membukakan pintu saat petugas datang.`,
      'semua', 'informasi', 'terjadwal', 0, 0, dt(48), null],
    [6, 'Pengingat: Jatuh Tempo Pembayaran',
      `Pengingat bahwa batas akhir pembayaran kos bulan ini adalah tanggal 5.\n\nMohon segera melakukan pembayaran melalui aplikasi Komen untuk menghindari denda keterlambatan.`,
      'semua', 'pembayaran', 'terjadwal', 0, 1, dt(96), null],
  ];

  for (const [id, title, body, target, category, status, pinned, wa, scheduled, published] of announcements) {
    batch3.push({
      sql: annSql,
      args: [id, title, body, target, category, status, pinned, wa, scheduled, published, OWNER_ID, published || nowSql()],
    });
  }

  // Sebagian penyewa sudah membaca pengumuman pertama.
  for (const uid of [...tenantIdByName.values()].slice(2, 8)) {
    batch3.push({
      sql: `INSERT INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)
            ON CONFLICT DO NOTHING`,
      args: [1, uid, dt(-60)],
    });
  }

  // Penyewa aktif diurutkan seperti tampilan daftar penyewa (lantai, nomor).
  const activeTenants = [
    { id: DEMO_ID, room: DEMO_TENANT.room },
    ...TENANTS.map((t, i) => ({ id: FIRST_TENANT_ID + i, room: t.room })),
  ].sort((a, b) => a.room[0] - b.room[0] || a.room[1] - b.room[1]);

  const billSql = `
    INSERT INTO bills (id, tenant_id, room_id, title, period, amount, due_date, status, note,
                       created_by, created_at, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  let billId = 0;
  let demoPaidBillId = null;
  let demoPaidAmount = 0;

  activeTenants.forEach((t, i) => {
    const roomId = roomIdFor(...t.room);
    const price = ROOM_PRICES[t.room[0]];

    // Bulan lalu: sudah lunas.
    billId += 1;
    if (t.id === DEMO_ID) {
      demoPaidBillId = billId;
      demoPaidAmount = price;
    }
    batch3.push({
      sql: billSql,
      args: [billId, t.id, roomId, 'Sewa Kamar', period(-1), price, dueOn(-1), 'lunas', '', OWNER_ID, dt(-24 * 35), dt(-24 * 32)],
    });

    // Bulan ini: sebagian lunas, sebagian belum.
    billId += 1;
    batch3.push(
      i % 4 === 0
        ? {
          sql: billSql,
          args: [billId, t.id, roomId, 'Sewa Kamar', period(0), price, dueOn(0), 'lunas', '', OWNER_ID, dt(-24 * 8), dt(-24 * 5)],
        }
        : {
          sql: billSql,
          args: [billId, t.id, roomId, 'Sewa Kamar', period(0), price, dueOn(0), 'belum_bayar', '', OWNER_ID, dt(-24 * 8), null],
        }
    );

    // Tagihan tambahan listrik untuk beberapa kamar.
    if (i % 3 === 1) {
      billId += 1;
      batch3.push({
        sql: billSql,
        args: [
          billId, t.id, roomId, 'Tambahan Listrik AC', period(0), 150_000, dueOn(0, 10),
          'belum_bayar', 'Pemakaian AC di atas kuota 50 kWh.', OWNER_ID, dt(-24 * 6), null,
        ],
      });
    }
  });

  // Tunggakan untuk dua penyewa -> status terlambat.
  for (const t of activeTenants.slice(5, 7)) {
    billId += 1;
    batch3.push({
      sql: billSql,
      args: [
        billId, t.id, roomIdFor(...t.room), 'Denda Keterlambatan', period(-1), 50_000, d(-12),
        'terlambat', 'Pembayaran melewati tanggal 5.', OWNER_ID, dt(-24 * 20), null,
      ],
    });
  }

  // Satu riwayat pembayaran berhasil untuk akun demo.
  if (demoPaidBillId) {
    batch3.push({
      sql: `INSERT INTO payments (id, bill_id, tenant_id, reference, method, method_label, amount, fee, total,
                                  status, va_number, instructions, created_at, settled_at)
            VALUES (1, ?, ?, ?, 'va_bca', 'Virtual Account BCA', ?, 4000, ?, 'berhasil', ?, '', ?, ?)`,
      args: [
        demoPaidBillId, DEMO_ID, `KMN-${new Date().getFullYear()}-DEMO0001`,
        demoPaidAmount, demoPaidAmount + 4000, '3908100010001',
        dt(-24 * 33), dt(-24 * 32),
      ],
    });
  }

  /* --------------------- 4) komplain, chat, dan notifikasi --------------- */
  const batch4 = [];

  COMPLAINTS.forEach((c, idx) => {
    const tenantId = tenantIdByName.get(c.tenant);
    if (!tenantId) return;
    const cid = idx + 1;
    const tenantRoom = c.tenant === DEMO_TENANT.name
      ? DEMO_TENANT.room
      : TENANTS.find((t) => t.name === c.tenant).room;

    batch4.push({
      sql: `INSERT INTO complaints (id, tenant_id, room_id, title, description, category, location,
                                    priority, status, created_at, updated_at, resolved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        cid, tenantId, roomIdFor(...tenantRoom), c.title, c.description, c.category, c.location,
        c.priority, c.status, c.createdAt, c.updates?.at(-1)?.at || c.createdAt, c.resolvedAt || null,
      ],
    });

    batch4.push({
      sql: 'INSERT INTO complaint_updates (complaint_id, author_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [cid, tenantId, 'baru', 'Laporan dibuat oleh penyewa.', c.createdAt],
    });
    for (const u of c.updates || []) {
      batch4.push({
        sql: 'INSERT INTO complaint_updates (complaint_id, author_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [cid, OWNER_ID, u.status, u.note, u.at],
      });
    }
    for (let i = 0; i < (c.photos || 0); i += 1) {
      // Gambar komplain ikut masuk batch2 (tabel images diisi lebih dulu).
      const url = addImage('complaint', `foto-kerusakan-${i + 1}.jpg`, c.tone || [100, 110, 130]);
      batch4.push({
        sql: 'INSERT INTO complaint_photos (complaint_id, file_path, original_name) VALUES (?, ?, ?)',
        args: [cid, url, `foto-kerusakan-${i + 1}.jpg`],
      });
    }
  });

  const mayaId = tenantIdByName.get('Maya Anggraini');
  const yogaId = tenantIdByName.get('Yoga Permana');
  const msgSql = 'INSERT INTO messages (sender_id, receiver_id, body, created_at, read_at) VALUES (?, ?, ?, ?, ?)';

  batch4.push(
    { sql: msgSql, args: [DEMO_ID, OWNER_ID, 'Selamat pagi Bu, mau tanya apakah boleh menerima paket lewat satpam kalau saya sedang kuliah?', dt(-96), dt(-94)] },
    { sql: msgSql, args: [OWNER_ID, DEMO_ID, 'Pagi Mas Putu. Boleh sekali, nanti paketnya saya simpan di meja lobi ya. Tolong namanya ditulis jelas di paket.', dt(-94), dt(-92)] },
    { sql: msgSql, args: [DEMO_ID, OWNER_ID, 'Siap Bu, terima kasih banyak 🙏', dt(-92), dt(-90)] },
    { sql: msgSql, args: [DEMO_ID, OWNER_ID, 'Bu, untuk keran kamar mandi yang bocor sudah saya laporkan di menu Lapor Kerusakan ya. Mohon dicek kalau ada waktu.', dt(-18), null] },
    { sql: msgSql, args: [mayaId, OWNER_ID, 'Bu, teknisi AC kira-kira datang jam berapa besok?', dt(-30), null] },
    { sql: msgSql, args: [OWNER_ID, yogaId, 'Mas Yoga, pembayaran bulan ini sudah masuk ya. Terima kasih.', dt(-120), dt(-118)] },
    { sql: msgSql, args: [yogaId, OWNER_ID, 'Baik Bu, terima kasih konfirmasinya.', dt(-117), dt(-116)] }
  );

  const notifSql =
    'INSERT INTO notifications (user_id, title, body, type, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
  batch4.push(
    { sql: notifSql, args: [OWNER_ID, 'Laporan baru dari kamar 306', 'Kunci kamar seret — prioritas tinggi.', 'warning', '#/owner/komplain', 0, dt(-6)] },
    { sql: notifSql, args: [OWNER_ID, 'Laporan baru dari kamar 102', 'Keran kamar mandi bocor (2 foto terlampir).', 'warning', '#/owner/komplain', 0, dt(-20)] },
    { sql: notifSql, args: [DEMO_ID, 'Tagihan baru: Sewa Kamar', 'Tagihan sewa bulan ini sudah diterbitkan.', 'bill', '#/penyewa/tagihan', 0, dt(-24 * 8)] },
    { sql: notifSql, args: [DEMO_ID, '📢 Pembayaran Kos Bulan Ini', 'Pembayaran sudah dapat dilakukan lewat QRIS atau Virtual Account.', 'announcement', '#/penyewa/pengumuman', 1, dt(-72)] }
  );

  /* ------------------------------------------------- kirim dalam 4 batch -- */
  // batch2 harus dikirim setelah selesai dibangun (gambar komplain ikut
  // ditambahkan saat menyusun batch4), dan sebelum batch4 yang merujuknya.
  await db.batch(batch1);
  await db.batch(batch2);
  await db.batch(batch3);
  await db.batch(batch4);

  seededThisProcess = true;

  // Satu query untuk semua jumlah, bukan delapan query terpisah.
  const stats = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM rooms)         AS rooms,
         (SELECT COUNT(*) FROM users)         AS users,
         (SELECT COUNT(*) FROM bills)         AS bills,
         (SELECT COUNT(*) FROM complaints)    AS complaints,
         (SELECT COUNT(*) FROM announcements) AS announcements,
         (SELECT COUNT(*) FROM facilities)    AS facilities,
         (SELECT COUNT(*) FROM nearby_places) AS places,
         (SELECT COUNT(*) FROM images)        AS images`
    )
    .get();

  return stats;
}

/**
 * Jalankan seed hanya bila database masih kosong.
 *
 * Beberapa instance serverless bisa start bersamaan, jadi pekerjaan seeding
 * "diklaim" lewat baris di tabel settings agar tidak berjalan dua kali.
 */
export async function ensureSeed() {
  const existing = await db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (existing.n > 0) return false;

  const claim = await db
    .prepare("INSERT INTO settings (key, value) VALUES ('seeding', ?) ON CONFLICT(key) DO NOTHING")
    .run(nowSql());
  if (claim.changes === 0) return false; // instance lain sudah/sedang menyemai

  await seed();
  return true;
}

/* -------------------------------------------------------------------------- */
/* CLI: node src/seed.js [--reset]                                            */
/* -------------------------------------------------------------------------- */
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const reset = process.argv.includes('--reset');
  const t0 = Date.now();
  await migrate();
  const existing = await db.prepare('SELECT COUNT(*) AS n FROM users').get();

  if (existing.n > 0 && !reset) {
    console.log('Database sudah berisi data. Gunakan "npm run reset" untuk menimpa data demo.');
    process.exit(0);
  }

  const stats = await seed({ reset });
  console.log(`\nData demo Komen berhasil dibuat dalam ${((Date.now() - t0) / 1000).toFixed(1)} detik:`);
  console.table(stats);
  console.log('\nAkun untuk login:');
  console.table([
    { peran: 'Pemilik (owner)', email: 'owner@komen.id', password: 'owner123' },
    { peran: 'Penyewa (tenant)', email: 'penyewa@komen.id', password: 'penyewa123' },
    { peran: 'Penyewa lain', email: 'rizky.pratama@mail.com', password: 'penyewa123' },
  ]);
  console.log('');
  process.exit(0);
}
