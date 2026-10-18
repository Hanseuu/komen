/**
 * Pita "Mode Demo".
 *
 * Versi statis menyimpan seluruh data di localStorage peramban, jadi penting
 * memberi tahu pengguna dua hal: data hanya ada di perangkat ini, dan login
 * di sini bukan pengamanan sungguhan. Pita ini juga menyediakan tombol untuk
 * mengembalikan data demo ke kondisi awal.
 *
 * Gaya ditulis inline supaya css/style.css tetap sama dengan versi server.
 */

import { resetDemoData } from './backend/api.js';

const BAR_STYLE = [
  'position:fixed',
  'left:0',
  'right:0',
  'bottom:0',
  'z-index:80',
  'display:flex',
  'flex-wrap:wrap',
  'align-items:center',
  'gap:10px',
  'padding:8px 14px',
  'background:#0f172a',
  'color:#e2e8f0',
  'font-size:.78rem',
  'line-height:1.45',
  'box-shadow:0 -2px 12px rgba(15,23,42,.25)',
].join(';');

const BTN_STYLE = [
  'flex-shrink:0',
  'padding:5px 11px',
  'border:1px solid rgba(226,232,240,.35)',
  'border-radius:7px',
  'background:transparent',
  'color:inherit',
  'font:inherit',
  'cursor:pointer',
].join(';');

let mounted = false;

/** Tampilkan pita mode demo di bagian bawah halaman. */
export function mountDemoBanner() {
  if (mounted || document.getElementById('demoBanner')) return;
  mounted = true;

  const bar = document.createElement('div');
  bar.id = 'demoBanner';
  bar.setAttribute('role', 'note');
  bar.style.cssText = BAR_STYLE;
  bar.innerHTML = `
    <span style="flex:1 1 320px">
      <strong>Mode demo.</strong>
      Semua data disimpan di peramban ini saja — tidak dikirim ke server dan tidak
      terlihat oleh pengunjung lain. Login di sini hanya untuk mencoba alur aplikasi,
      bukan pengamanan sungguhan.
    </span>
    <button type="button" id="demoReset" style="${BTN_STYLE}">Reset data demo</button>
    <button type="button" id="demoHide" style="${BTN_STYLE}" aria-label="Sembunyikan pita">Tutup</button>`;

  // Beri ruang agar konten terbawah tidak tertutup pita.
  const spacer = document.createElement('div');
  spacer.id = 'demoBannerSpacer';
  spacer.style.cssText = 'height:62px';

  document.body.append(bar, spacer);

  bar.querySelector('#demoHide').addEventListener('click', () => {
    bar.remove();
    spacer.remove();
  });

  bar.querySelector('#demoReset').addEventListener('click', () => {
    const ok = window.confirm(
      'Kembalikan data demo ke kondisi awal?\n\n' +
      'Semua penyewa, tagihan, laporan, dan pesan yang Anda tambahkan akan hilang.'
    );
    if (!ok) return;

    resetDemoData();
    sessionStorage.clear();
    location.replace('index.html');
  });
}
