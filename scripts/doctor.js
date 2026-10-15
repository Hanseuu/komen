/**
 * Pemeriksa kesiapan lingkungan.
 *
 * Jalankan: npm run check
 *
 * Memeriksa versi Node, dependensi, konfigurasi database, dan ketersediaan
 * port — lalu memberi tahu langkah berikutnya. Dibuat agar tidak perlu
 * menebak-nebak saat ada yang belum siap.
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  d: (s) => `\x1b[90m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

const ok = (m, d = '') => console.log(`  ${C.g('✓')} ${m}${d ? C.d(`  ${d}`) : ''}`);
const bad = (m, d = '') => console.log(`  ${C.r('✗')} ${m}${d ? C.d(`  ${d}`) : ''}`);
const warn = (m, d = '') => console.log(`  ${C.y('!')} ${m}${d ? C.d(`  ${d}`) : ''}`);

const problems = [];

console.log(C.b('\nKomen — pemeriksaan kesiapan\n'));

/* ------------------------------------------------------------- Node.js --- */
const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) {
  ok(`Node.js ${process.versions.node}`);
} else {
  bad(`Node.js ${process.versions.node} terlalu lama`, 'butuh versi 20 atau lebih baru');
  problems.push('Pasang Node.js versi LTS dari https://nodejs.org lalu jalankan ulang perintah ini.');
}

/* -------------------------------------------------------- dependensi ----- */
const hasModules = fs.existsSync(path.join(ROOT, 'node_modules'));
if (hasModules) {
  const missing = ['express', '@libsql/client', 'multer', 'qrcode', 'cookie-parser', 'dotenv']
    .filter((p) => !fs.existsSync(path.join(ROOT, 'node_modules', p)));
  if (missing.length) {
    bad('Beberapa dependensi belum lengkap', missing.join(', '));
    problems.push('Jalankan: npm install');
  } else {
    ok('Dependensi lengkap');
  }
} else {
  bad('Dependensi belum dipasang');
  problems.push('Jalankan: npm install');
}

/* ------------------------------------------------------------ database --- */
const tursoUrl = (process.env.TURSO_DATABASE_URL || '').trim();
if (tursoUrl) {
  const engine = tursoUrl.startsWith('turso://') ? 'Turso' : 'libSQL';
  ok(`Database: Turso (${engine})`, tursoUrl.replace(/\/\/.*@/, '//'));
  if (!(process.env.TURSO_AUTH_TOKEN || '').trim() && !tursoUrl.startsWith('http://')) {
    warn('TURSO_AUTH_TOKEN kosong', 'biasanya diperlukan untuk database Turso');
  }
} else {
  const dbPath = process.env.DB_PATH || 'data/komen.db';
  const exists = fs.existsSync(path.join(ROOT, dbPath));
  ok('Database: berkas SQLite lokal', `${dbPath}${exists ? '' : ' (akan dibuat otomatis)'}`);
  console.log(C.d('      Tidak perlu akun atau internet untuk menjalankan di komputer sendiri.'));
}

/* ----------------------------------------------------------------- .env --- */
if (fs.existsSync(path.join(ROOT, '.env'))) {
  ok('Berkas .env ditemukan');
} else {
  ok('Tanpa berkas .env', 'memakai nilai bawaan — ini normal');
}

/* ----------------------------------------------------------------- port --- */
const port = Number(process.env.PORT || 3000);
const portFree = await new Promise((resolve) => {
  const srv = net.createServer();
  srv.once('error', () => resolve(false));
  srv.once('listening', () => srv.close(() => resolve(true)));
  srv.listen(port, '127.0.0.1');
});

if (portFree) {
  ok(`Port ${port} tersedia`);
} else {
  warn(`Port ${port} sedang dipakai`, 'mungkin aplikasi sudah berjalan di jendela lain');
  problems.push(`Tutup aplikasi yang memakai port ${port}, atau jalankan: npx cross-env PORT=3001 npm start`);
}

/* --------------------------------------------------------------- berkas --- */
const required = ['src/server.js', 'src/app.js', 'public/index.html', 'vercel.json'];
const missingFiles = required.filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missingFiles.length) {
  bad('Ada berkas penting yang hilang', missingFiles.join(', '));
  problems.push('Unduh ulang / clone ulang repositori ini.');
} else {
  ok('Struktur berkas lengkap');
}

/* --------------------------------------------------------------- ringkas -- */
console.log();
if (problems.length) {
  console.log(C.b(C.y('Yang perlu dilakukan:')));
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log();
  process.exit(1);
}

console.log(C.b(C.g('Semuanya siap.')));
console.log(`\n  Jalankan aplikasi:  ${C.b('npm start')}`);
console.log(`  Lalu buka        :  ${C.b(`http://localhost:${port}`)}`);
console.log(C.d('\n  Login demo:'));
console.log(C.d('    Pemilik  owner@komen.id   / owner123'));
console.log(C.d('    Penyewa  penyewa@komen.id / penyewa123'));
console.log();
