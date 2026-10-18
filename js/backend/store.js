/**
 * Penyimpanan data untuk versi statis.
 *
 * Versi ini tidak memakai server maupun database. Seluruh data disimpan di
 * `localStorage` peramban, sehingga aplikasi dapat diunggah ke Vercel sebagai
 * situs statis biasa.
 *
 * Konsekuensinya: data bersifat lokal per peramban — tidak dibagi antar
 * perangkat maupun antar pengunjung.
 */

import { fail } from '../api-error.js';

const KEY = 'komen:data:v1';

/** Bentuk awal basis data (semua tabel kosong). */
const emptyState = () => ({
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
});

let state = null;
let saveTimer = null;

/* -------------------------------------------------------------------------- */
/* Muat & simpan                                                              */
/* -------------------------------------------------------------------------- */

function readStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Data rusak atau localStorage diblokir — mulai dari awal.
    return null;
  }
}

/** Tulis ke localStorage; digabung agar tidak menulis berulang kali. */
export function save({ immediate = false } = {}) {
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      // Kuota localStorage umumnya 5-10 MB; foto adalah penyebab tersering.
      if (String(err?.name).includes('Quota') || String(err).includes('quota')) {
        fail(
          507,
          'Penyimpanan peramban penuh. Hapus beberapa foto laporan, atau tekan "Reset data demo" pada pita Mode Demo.'
        );
      }
      throw err;
    }
  };

  if (immediate) {
    clearTimeout(saveTimer);
    write();
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(write, 50);
}

/** Akses basis data; memuat dari localStorage pada pemanggilan pertama. */
export function db() {
  if (!state) {
    state = readStorage() || emptyState();
  }
  return state;
}

export const isEmpty = () => db().users.length === 0;

/** Pasang data awal (dipakai oleh seeder). */
export function setState(next) {
  state = next;
  save({ immediate: true });
}

/** Hapus seluruh data demo; data akan dibuat ulang pada muat berikutnya. */
export function resetAll() {
  state = emptyState();
  try {
    localStorage.removeItem(KEY);
  } catch { /* diabaikan */ }
}

/* -------------------------------------------------------------------------- */
/* Id berurutan                                                               */
/* -------------------------------------------------------------------------- */

/** Nomor id berikutnya untuk sebuah tabel, meniru AUTOINCREMENT. */
export function nextId(table) {
  const s = db();
  s.seq[table] = (s.seq[table] || 0) + 1;
  return s.seq[table];
}

/** Setel ulang penghitung id berdasarkan isi tabel saat ini. */
export function syncSeq(table, rows) {
  const s = db();
  s.seq[table] = rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
}

/* -------------------------------------------------------------------------- */
/* Pencarian ringkas                                                          */
/* -------------------------------------------------------------------------- */

export const find = (table, pred) => db()[table].find(pred) || null;
export const filter = (table, pred) => db()[table].filter(pred);
export const byId = (table, id) => find(table, (r) => r.id === Number(id));

export const insert = (table, row) => {
  const record = { id: nextId(table), ...row };
  db()[table].push(record);
  save();
  return record;
};

export const update = (table, id, patch) => {
  const row = byId(table, id);
  if (!row) return null;
  Object.assign(row, patch);
  save();
  return row;
};

export const remove = (table, pred) => {
  const s = db();
  const before = s[table].length;
  s[table] = s[table].filter((r) => !pred(r));
  save();
  return before - s[table].length;
};

/* -------------------------------------------------------------------------- */
/* Sesi login                                                                 */
/* -------------------------------------------------------------------------- */

export function setSession(userId, days = 7) {
  db().session = {
    userId,
    expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
  };
  save({ immediate: true });
}

export function clearSession() {
  db().session = null;
  save({ immediate: true });
}

/** Pengguna yang sedang login, atau null bila sesi habis/tidak ada. */
export function currentUser() {
  const s = db();
  if (!s.session) return null;
  if (new Date(s.session.expiresAt).getTime() < Date.now()) {
    s.session = null;
    save();
    return null;
  }
  return byId('users', s.session.userId);
}
