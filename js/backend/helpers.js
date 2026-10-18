/**
 * Fungsi bantu untuk "backend" yang berjalan di browser.
 *
 * Ini adalah padanan src/lib/helpers.js pada versi server, sehingga bentuk
 * data yang dihasilkan sama persis dan seluruh halaman tidak perlu diubah.
 */

import { fail } from '../api-error.js';

/* -------------------------------------------------------------------------- */
/* Kode kamar: format XYY  (X = lantai, YY = nomor kamar dengan leading zero) */
/* -------------------------------------------------------------------------- */

export const FLOORS = [1, 2, 3];
export const MAX_ROOMS_PER_FLOOR = 30;

/**
 * Bentuk kode kamar: lantai + nomor 2 digit.
 * Contoh: lantai 1 kamar 5 -> "105", lantai 3 kamar 30 -> "330"
 */
export function buildRoomCode(floor, number) {
  const f = Number(floor);
  const n = Number(number);
  if (!FLOORS.includes(f)) {
    fail(400, `Lantai tidak valid. Pilih salah satu dari: ${FLOORS.join(', ')}`);
  }
  if (!Number.isInteger(n) || n < 1 || n > MAX_ROOMS_PER_FLOOR) {
    fail(400, `Nomor kamar harus antara 1 sampai ${MAX_ROOMS_PER_FLOOR}`);
  }
  return `${f}${String(n).padStart(2, '0')}`;
}

export const floorFromCode = (code) => Number(String(code).charAt(0));

/* -------------------------------------------------------------------------- */
/* Validasi & sanitasi                                                        */
/* -------------------------------------------------------------------------- */

export function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body?.[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
  if (missing.length) fail(400, `Data wajib belum lengkap: ${missing.join(', ')}`);
}

export const str = (v, max = 5000) =>
  (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

export const int = (v, fallback = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

export const bool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

/** "0812-3456-7890" -> "6281234567890" */
export function normalizePhone(raw) {
  let p = String(raw || '').replace(/[^\d+]/g, '');
  if (!p) return '';
  p = p.replace(/^\+/, '');
  if (p.startsWith('0')) p = `62${p.slice(1)}`;
  else if (p.startsWith('8')) p = `62${p}`;
  return p;
}

/* -------------------------------------------------------------------------- */
/* Tanggal & uang                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Waktu dalam format yang sama seperti SQLite: "YYYY-MM-DD HH:MM:SS" (UTC).
 * Penting agar fungsi format tanggal di core.js menafsirkannya dengan benar.
 */
export const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export const toSqlDateTime = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
};

export const todaySql = () => new Date().toISOString().slice(0, 10);

/** Tanggal relatif dalam hari, format "YYYY-MM-DD". */
export const dateOffset = (days = 0) => {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return t.toISOString().slice(0, 10);
};

/** Waktu relatif dalam jam, format SQLite. */
export const timeOffset = (hours = 0) => {
  const t = new Date();
  t.setHours(t.getHours() + hours);
  return t.toISOString().slice(0, 19).replace('T', ' ');
};

/** Periode "YYYY-MM" relatif dalam bulan. */
export const periodOffset = (months = 0) => {
  const t = new Date();
  t.setDate(1);
  t.setMonth(t.getMonth() + months);
  return t.toISOString().slice(0, 7);
};

/** Tanggal jatuh tempo pada bulan relatif. */
export const dueOn = (months = 0, day = 5) => {
  const t = new Date();
  t.setDate(1);
  t.setMonth(t.getMonth() + months);
  t.setDate(day);
  return t.toISOString().slice(0, 10);
};

/** Selisih hari sampai tanggal tertentu (negatif = sudah lewat). */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  const today = new Date(`${todaySql()}T00:00:00Z`);
  return Math.round((target - today) / 86400000);
}

export const formatRupiah = (amount) => `Rp${Number(amount || 0).toLocaleString('id-ID')}`;

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** "2026-03-05" -> "5 Maret 2026" */
export function formatTanggal(dateStr) {
  if (!dateStr) return '-';
  const [y, m, dd] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !dd) return String(dateStr);
  return `${dd} ${BULAN[m - 1]} ${y}`;
}

/** "2026-03" -> "Maret 2026" */
export function formatPeriode(p) {
  const [y, m] = String(p || '').split('-').map(Number);
  if (!y || !m) return String(p || '-');
  return `${BULAN[m - 1]} ${y}`;
}

export function randomCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const excerpt = (text, len = 120) => {
  const t = str(text).replace(/\s+/g, ' ');
  return t.length > len ? `${t.slice(0, len - 1)}…` : t;
};

/** Urut naik berdasarkan beberapa kunci sekaligus. */
export const by = (...keys) => (a, b) => {
  for (const k of keys) {
    const av = typeof k === 'function' ? k(a) : a[k];
    const bv = typeof k === 'function' ? k(b) : b[k];
    if (av === bv) continue;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return av < bv ? -1 : 1;
  }
  return 0;
};
