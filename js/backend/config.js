/**
 * Konstanta aplikasi untuk versi statis.
 *
 * Pada versi server nilai-nilai ini berasal dari berkas .env. Versi statis
 * tidak punya proses server, jadi nilainya ditulis langsung di sini.
 */

export const config = {
  kost: {
    name: 'Kos Melati Residence',
    address: 'Jl. Melati No. 12, Yogyakarta',
    lat: -7.7829,
    lng: 110.367,
  },

  // Batas fisik gedung: 3 lantai, maksimal 30 kamar per lantai.
  building: {
    floors: [1, 2, 3],
    maxRoomsPerFloor: 30,
  },

  sessionTtlDays: 7,
  maxImagesPerReport: 5,

  // Versi statis selalu berjalan dalam mode simulasi: tidak ada panggilan
  // ke gateway WhatsApp maupun payment gateway sungguhan.
  wa: { provider: 'mock' },

  payment: {
    provider: 'mock',
    expiryMinutes: 60,
    merchantName: 'KOS MELATI RESIDENCE',
    merchantCity: 'YOGYAKARTA',
    merchantId: 'ID1024336612345',
  },
};

/** Metode pembayaran yang didukung di halaman "Tagihan Saya". */
export const PAYMENT_METHODS = [
  { code: 'qris', label: 'QRIS', type: 'qris', fee: 0, issuer: 'Semua e-wallet & m-banking' },
  { code: 'va_bca', label: 'Virtual Account BCA', type: 'va', fee: 4000, issuer: 'BCA', prefix: '39081' },
  { code: 'va_bni', label: 'Virtual Account BNI', type: 'va', fee: 4000, issuer: 'BNI', prefix: '88810' },
  { code: 'va_mandiri', label: 'Virtual Account Mandiri', type: 'va', fee: 4000, issuer: 'Mandiri', prefix: '89508' },
  { code: 'va_bri', label: 'Virtual Account BRI', type: 'va', fee: 4000, issuer: 'BRI', prefix: '26215' },
];

/** Target pengumuman (dropdown di halaman "Buat Pengumuman"). */
export const ANNOUNCEMENT_TARGETS = [
  { code: 'semua', label: 'Semua penyewa' },
  { code: 'lantai_1', label: 'Lantai 1 saja' },
  { code: 'lantai_2', label: 'Lantai 2 saja' },
  { code: 'lantai_3', label: 'Lantai 3 saja' },
];

/** Status komplain pada "Pusat Komplain". */
export const COMPLAINT_STATUSES = [
  { code: 'baru', label: 'Baru' },
  { code: 'diproses', label: 'Sedang Diproses' },
  { code: 'selesai', label: 'Selesai' },
];

export const ANNOUNCEMENT_CATEGORIES = [
  { code: 'informasi', label: 'Informasi', icon: 'ℹ️' },
  { code: 'pembayaran', label: 'Pembayaran', icon: '💰' },
  { code: 'perbaikan', label: 'Perbaikan & Maintenance', icon: '🔧' },
  { code: 'kebersihan', label: 'Kebersihan', icon: '🧹' },
  { code: 'keamanan', label: 'Keamanan', icon: '🔒' },
  { code: 'acara', label: 'Acara / Kegiatan', icon: '🎉' },
  { code: 'penting', label: 'Penting', icon: '⚠️' },
];

export const COMPLAINT_CATEGORIES = [
  { code: 'listrik', label: 'Listrik', icon: '💡' },
  { code: 'air', label: 'Air & Saluran', icon: '🚰' },
  { code: 'furnitur', label: 'Furnitur', icon: '🪑' },
  { code: 'ac', label: 'AC / Kipas', icon: '❄️' },
  { code: 'internet', label: 'Internet / WiFi', icon: '📶' },
  { code: 'kunci', label: 'Kunci & Pintu', icon: '🔑' },
  { code: 'kebersihan', label: 'Kebersihan', icon: '🧹' },
  { code: 'keamanan', label: 'Keamanan', icon: '🔒' },
  { code: 'lainnya', label: 'Lainnya', icon: '🧰' },
];

export const COMPLAINT_LOCATIONS = [
  { code: 'kamar', label: 'Di dalam kamar saya' },
  { code: 'kamar_mandi', label: 'Kamar mandi' },
  { code: 'dapur', label: 'Dapur bersama' },
  { code: 'koridor', label: 'Koridor / tangga' },
  { code: 'parkir', label: 'Area parkir' },
  { code: 'umum', label: 'Area umum kos' },
];

export const FACILITY_CATEGORIES = [
  { code: 'umum', label: 'Area Umum' },
  { code: 'kamar', label: 'Dalam Kamar' },
  { code: 'keamanan', label: 'Keamanan' },
  { code: 'parkir', label: 'Parkir' },
  { code: 'dapur', label: 'Dapur & Makan' },
  { code: 'kebersihan', label: 'Kebersihan' },
  { code: 'internet', label: 'Internet' },
];

export const BILL_STATUS_META = {
  belum_bayar: { label: 'Belum Dibayar', tone: 'warn' },
  menunggu_pembayaran: { label: 'Menunggu Pembayaran', tone: 'info' },
  terlambat: { label: 'Terlambat', tone: 'bad' },
  lunas: { label: 'Lunas', tone: 'ok' },
};

export const PAYMENT_STATUS_META = {
  pending: { label: 'Menunggu Pembayaran', tone: 'warn' },
  berhasil: { label: 'Berhasil', tone: 'ok' },
  gagal: { label: 'Gagal', tone: 'bad' },
  kedaluwarsa: { label: 'Kedaluwarsa', tone: 'muted' },
};

export default config;
