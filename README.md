# Komen — Kos Manajemen (versi statis)

Aplikasi pengelolaan kos untuk **pemilik kos** dan **penyewa**.

Versi ini **tidak memakai server dan tidak memakai database**. Seluruh berkas
hanyalah HTML, CSS, dan JavaScript biasa, sehingga bisa diunggah ke Vercel
(atau GitHub Pages, Netlify, hosting apa pun) tanpa konfigurasi, tanpa
`npm install`, dan tanpa variabel lingkungan.

Data disimpan di **localStorage peramban** masing-masing pengunjung.

---

## Cara menjalankan di komputer sendiri

Karena aplikasi memakai ES module, berkas tidak bisa dibuka lewat `file://` —
perlu disajikan oleh server berkas statis sederhana. Pilih salah satu:

```bash
# Node.js (tanpa instalasi apa pun)
npx serve .

# atau Python 3
python -m http.server 8000
```

Lalu buka `http://localhost:8000`.

### Akun demo

| Peran       | Email              | Password     |
| ----------- | ------------------ | ------------ |
| Pemilik Kos | `owner@komen.id`   | `owner123`   |
| Penyewa     | `penyewa@komen.id` | `penyewa123` |

Tombol akun demo di halaman login mengisi kedua kolom secara otomatis.
Data contoh (30 kamar, 13 penyewa, tagihan, laporan, pengumuman, chat) dibuat
otomatis saat aplikasi pertama kali dibuka.

---

## Cara mengunggah ke Vercel

1. Push repositori ini ke GitHub.
2. Di Vercel: **Add New → Project**, pilih repositori ini.
3. Biarkan semua pengaturan apa adanya:
   - Framework Preset: **Other**
   - Build Command: **kosong**
   - Output Directory: **kosong** (akar repositori)
4. **Deploy.**

Tidak ada Environment Variable yang perlu diisi.

Untuk memperbarui situs, cukup push commit baru — Vercel akan men-deploy ulang
sendiri.

---

## Fitur

### Pemilik Kos

| Menu                 | Isi                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Daftar Penyewa**   | Siapa menghuni kamar mana (kode kamar format `XYY`: lantai + nomor 2 digit, mis. `105`), ubah/ganti nama, pindah kamar, chat |
| **Denah & Fasilitas**| Denah tiap lantai + gambar, status terisi/kosong per kamar, kelola fasilitas dan tempat umum sekitar kos                      |
| **Buat Pengumuman**  | Target lewat dropdown (semua penyewa / lantai 1 / lantai 2 / lantai 3), bisa dijadwalkan, daftar pembaca                      |
| **Pusat Komplain**   | Papan **Baru / Sedang Diproses / Selesai**, foto bukti dari penyewa, catatan penanganan                                       |
| **Keuangan**         | Terbitkan tagihan massal atau per penyewa, pengingat, tandai lunas, riwayat transaksi, log pesan WhatsApp                     |

### Penyewa

| Menu                 | Isi                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| **Tagihan Saya**     | Tagihan terlambat & akan datang, bayar via **QRIS** atau **Virtual Account**, hasil berhasil/gagal     |
| **Lapor Kerusakan**  | Kirim laporan beserta foto — langsung tampil di Pusat Komplain pemilik kos                             |
| **Pengumuman**       | Pengumuman terbaru muncul sebagai pop-up                                                               |
| **Fasilitas**        | Fasilitas kos + kategori sekitar (laundry, minimarket, SPBU, dll) yang membuka **Google Maps**         |

Keduanya memakai navigasi kiri atas: **Home · Chat · Profil**.

---

## Yang berbeda dari versi dengan server

Versi statis sengaja dibuat agar mudah dipasang. Konsekuensinya:

| Hal                 | Versi statis ini                                                                     |
| ------------------- | ------------------------------------------------------------------------------------ |
| Penyimpanan         | localStorage peramban — **tidak dibagi** antar perangkat maupun antar pengunjung     |
| Login               | Hanya alur demo. Password dibandingkan di peramban, jadi **bukan pengamanan nyata**  |
| Kapasitas gambar    | Kuota localStorage ±5-10 MB, jadi foto dikecilkan agresif sebelum disimpan           |
| WhatsApp            | Mode simulasi: isi pesan dicatat di log, tidak dikirim ke nomor sungguhan            |
| Pembayaran          | Mode simulasi: QRIS/VA dibuat lokal, hasil transaksi dipilih sendiri dari UI         |
| Pengumuman terjadwal| Diperiksa saat aplikasi dipakai (bukan oleh penjadwal di server)                     |

Tombol **"Reset data demo"** pada pita di bawah layar mengembalikan semua data
ke kondisi awal.

Butuh data yang benar-benar dibagi antar pengguna beserta login yang aman?
Versi dengan server + database ada di branch **`turso`** (Vercel + Turso).

---

## Struktur berkas

```
index.html              halaman login
app.html                kerangka aplikasi (SPA, routing lewat #hash)
css/style.css           seluruh gaya tampilan
js/
  core.js               utilitas: pemanggil API, format, toast, modal
  app.js                shell aplikasi: sesi, menu, router
  login.js              halaman login
  notifications.js      notifikasi web + polling
  demo-banner.js        pita mode demo & tombol reset
  api-error.js          Error bawa status
  pages/                12 modul halaman
  backend/              "server" yang berjalan di peramban
    api.js              router + seluruh endpoint
    services.js         notifikasi, WhatsApp, pengumuman, pembayaran
    store.js            penyimpanan localStorage
    seed.js             data demo
    helpers.js          validasi, tanggal, format
    config.js           konstanta aplikasi
    maps.js             tautan Google Maps
  vendor/qrcode.js      pembuat gambar QR (bundel pustaka qrcode)
tests/                  pengujian UI (tidak ikut diunggah ke Vercel)
```

Halaman-halaman di `js/pages/` memanggil `api.get('/api/...')` seperti biasa.
Yang berubah hanya `js/core.js`: pemanggilan itu diteruskan ke
`js/backend/api.js` alih-alih ke jaringan.

---

## Pengujian

130 pemeriksaan UI yang menelusuri aplikasi memakai Chromium headless:

```bash
cd tests
npm install
npm test
```
