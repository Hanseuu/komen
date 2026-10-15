# Komen — Kos Manajemen (Vercel + Turso)

Aplikasi web pengelolaan kos dengan **dua peran pengguna** — pemilik kos dan penyewa —
yang siap dijalankan di **Vercel** secara gratis.

```
Vercel (serverless)  ·  Turso / libSQL (database)  ·  Express 5  ·  Frontend vanilla JS
```

> Versi ini adalah hasil penyesuaian untuk arsitektur serverless. Perbedaannya dengan
> versi server biasa dijelaskan di [bagian bawah](#apa-yang-berbeda-dari-versi-server-biasa).

---

## Deploy ke Vercel (gratis, tanpa kartu kredit)

### 1. Buat database Turso

1. Daftar di [turso.tech](https://turso.tech) — gratis, tanpa kartu kredit.
2. Buat database baru (pilih region terdekat, mis. Singapore).
3. Catat dua nilai ini:
   - **Database URL** — `libsql://...` atau `turso://...` (keduanya didukung)
   - **Auth token** — string panjang dimulai `eyJ...`

Lewat [Turso CLI](https://docs.turso.tech/cli/introduction):

```bash
turso db create komen              # database libSQL  -> URL libsql://
turso db show --url komen          # ambil Database URL
turso db tokens create komen       # ambil Auth token
```

> **Dua mesin database.** Turso menyediakan mesin `libsql://` dan mesin baru
> `turso://` (dibuat dengan `--tursodb`). Aplikasi ini **mendukung keduanya** —
> `src/db.js` memilih driver yang tepat berdasarkan skema URL. Yang sudah diuji
> menyeluruh di sini adalah jalur **libSQL**, jadi itu pilihan yang disarankan.

### 2. ⚠️ Samakan region fungsi dengan region database

Vercel menjalankan fungsi di **Washington DC (`iad1`)** secara bawaan. Bila database
Turso Anda berada di Singapura, setiap query harus menyeberangi Pasifik — ini penyebab
umum error `FUNCTION_INVOCATION_TIMEOUT` (504).

[`vercel.json`](vercel.json) di repositori ini sudah menyetel region ke **`sin1`**
(Singapura). **Bila database Turso Anda dibuat di region lain, ubah satu baris ini:**

```json
"regions": ["sin1"]
```

Kode region lain: `iad1` (AS Timur), `sfo1` (AS Barat), `fra1` (Frankfurt),
`syd1` (Sydney). Paket Hobby hanya boleh satu region.

### 3. Import ke Vercel

1. Buka [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. Pilih repositori ini. Vercel membaca `vercel.json` secara otomatis —
   framework preset biarkan **Other**, tidak perlu build command.
3. Pada bagian **Environment Variables**, isi dua variabel berikut:

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://nama-db-anda.turso.io` |
   | `TURSO_AUTH_TOKEN` | token dari langkah 1 |

4. Klik **Deploy**.

Kunjungan pertama ke salah satu halaman akan membuat skema tabel sekaligus mengisi data
demo. Penyemaian hanya butuh **8 perjalanan ke database** (semuanya dikirim dalam
beberapa `batch`), jadi selesai dalam hitungan detik.

> Pemuatan halaman **tidak menyentuh database sama sekali** — hanya permintaan `/api/*`
> yang melakukannya. Jadi situs tetap terbuka meski database sedang bermasalah.

### Menyemai data dari komputer sendiri (opsional)

Bila ingin database sudah terisi sebelum deploy pertama:

```bash
TURSO_DATABASE_URL=libsql://nama-db-anda.turso.io \
TURSO_AUTH_TOKEN=token-anda \
npm run seed
```

### 4. Login

| Peran | Email | Password |
|---|---|---|
| Pemilik Kos | `owner@komen.id` | `owner123` |
| Penyewa | `penyewa@komen.id` | `penyewa123` |

Penyewa demo lain memakai password `penyewa123` dengan email berpola
`nama.belakang@mail.com` (lihat menu Daftar Penyewa).

> **Tips:** buka pemilik di jendela biasa dan penyewa di jendela **Incognito**, supaya
> kedua sesi login tidak saling menimpa.

### Variabel opsional

Semua punya nilai bawaan — isi hanya bila ingin menyesuaikan. Lihat
[`.env.example`](.env.example) untuk daftar lengkap.

| Variabel | Default | Keterangan |
|---|---|---|
| `KOST_NAME` | `Kos Melati Residence` | Nama kos di header & pesan |
| `KOST_ADDRESS` | `Jl. Melati No. 12, Yogyakarta` | Alamat kos |
| `KOST_LAT` / `KOST_LNG` | koordinat Yogyakarta | Titik acuan pencarian Google Maps |
| `WA_PROVIDER` | `mock` | `mock` / `fonnte` / `meta` |
| `PAYMENT_PROVIDER` | `mock` | `mock` / `custom` |
| `MAX_IMAGE_BYTES` | `1500000` | Batas ukuran gambar di server |

---

## Menjalankan di komputer sendiri

Tanpa Turso pun bisa — aplikasi otomatis memakai berkas SQLite lokal, jadi tidak
perlu akun atau internet:

```bash
npm install
npm run check      # periksa kesiapan (versi Node, dependensi, port)
npm start          # http://localhost:3000
```

Database dan data demo dibuat otomatis saat pertama kali dijalankan.

```bash
npm run dev        # muat ulang otomatis saat kode diubah
npm run reset      # bangun ulang data demo dari nol
```

> **Baru pertama kali?** **[SETUP.md](SETUP.md)** memuat panduan langkah demi langkah
> dari nol — memasang Node.js, menjalankan di komputer sendiri, sampai menayangkan
> di Vercel, lengkap dengan solusi masalah yang sering muncul.

---

## Fitur

### Beranda Pemilik Kos — 5 fitur

| Fitur | Isi |
|---|---|
| **Daftar Penyewa** | Penghuni aktif + nomor kamar (XYY), filter lantai/status, pencarian, edit & ganti nama, pindah kamar, reset password, tandai keluar, dan tombol chat |
| **Denah & Fasilitas** | Edit denah tiap lantai (judul, keterangan, unggah gambar) + peta kamar otomatis; kelola fasilitas dan tempat sekitar kos |
| **Buat Pengumuman** | Dropdown target: Semua penyewa / Lantai 1 saja / Lantai 2 saja / Lantai 3 saja; terbit langsung atau terjadwal; opsi kirim WhatsApp; lihat siapa yang sudah membaca |
| **Pusat Komplain** | Papan **Baru · Sedang Diproses · Selesai**, foto bukti dari penyewa, riwayat penanganan, ubah status + catatan |
| **Keuangan** | Terbitkan tagihan (semua / per lantai / pilih penyewa), kirim pengingat satuan & massal lewat notifikasi web + WhatsApp, tandai lunas manual, riwayat transaksi, log WhatsApp |

### Beranda Penyewa — 4 fitur

| Fitur | Isi |
|---|---|
| **Tagihan Saya** | Tagihan jatuh tempo & mendatang; bayar lewat **QRIS** atau **Virtual Account** (BCA/BNI/Mandiri/BRI); status **berhasil/gagal** beserta struk |
| **Lapor Kerusakan** | Laporkan kerusakan dengan **lampiran foto** (maks. 5, dikecilkan otomatis di browser). Foto langsung tampil di Pusat Komplain pemilik |
| **Pengumuman** | Pengumuman untuk lantainya atau semua; yang **terbaru muncul sebagai pop-up** |
| **Fasilitas** | Fasilitas kos, denah lantai (kamar sendiri ditandai), serta laundry/minimarket/SPBU/apotek/ATM sekitar yang membuka **Google Maps** |

### Navigasi kiri atas (kedua peran)

**Home · Chat · Profil** — tersedia di header pada setiap halaman.

---

## Nomor kamar (format XYY)

Kode kamar = **lantai + nomor kamar 2 digit**, maksimal **30 kamar per lantai**.
Nomor satu digit diberi awalan `0`.

| Lantai | Kamar | Kode |
|---|---|---|
| 1 | 5 | `105` |
| 2 | 12 | `212` |
| 3 | 30 | `330` |

Aturan dipusatkan di `buildRoomCode()` (`src/lib/helpers.js`) dan divalidasi di database.

---

## Apa yang berbeda dari versi server biasa

Vercel menjalankan fungsi serverless: tidak ada proses yang hidup terus dan tidak ada
disk permanen. Tiga penyesuaian dilakukan.

### 1. Database → Turso (libSQL)

Turso memakai dialek **SQLite yang sama**, jadi seluruh SQL tidak berubah. Yang berubah
hanya sifatnya: koneksi remote lewat HTTP sehingga setiap query menjadi asinkron.

`src/db.js` menyediakan API bergaya lama (`db.prepare(sql).get/all/run`) dalam bentuk
asinkron, ditambah `db.batch()` untuk banyak pernyataan sekaligus dan `db.tx()` untuk
transaksi. Bila `TURSO_DATABASE_URL` kosong, aplikasi memakai berkas SQLite lokal —
itulah yang dipakai saat pengembangan dan pengujian.

### 2. Gambar → disimpan di database

Foto bukti kerusakan, denah, dan foto fasilitas tidak bisa ditulis ke disk, jadi
disimpan di tabel `images` dan dilayani lewat `GET /api/images/:id` dengan header cache
jangka panjang.

Agar tetap ringan, **browser mengecilkan gambar sebelum mengunggah**
(`shrinkImage()` di `public/js/core.js`): sisi terpanjang maksimal 1600 px dan dikonversi
ke JPEG. Foto ponsel 4 MB biasanya menyusut menjadi ratusan KB.

### 3. Penjadwalan → saat ada kunjungan + cron harian

Tugas berkala (menerbitkan pengumuman terjadwal, menandai tagihan terlambat, menutup
transaksi kedaluwarsa, membersihkan sesi) dijalankan dua cara:

- **Saat ada kunjungan**, dibatasi paling sering sekali per 30 detik
  (`maybeRunTick()` di `src/scheduler.js`).
- **`GET /api/cron/tick`** lewat Vercel Cron sekali sehari sebagai jaring pengaman
  (paket Hobby membatasi cron 1×/hari). Endpoint ini dilindungi `CRON_SECRET`.

---

## Struktur

```
komen-vercel/
├── api/index.js              titik masuk fungsi serverless Vercel
├── vercel.json               rewrites, cron, konfigurasi fungsi
├── src/
│   ├── app.js                menyusun aplikasi Express (tanpa listen)
│   ├── server.js             server biasa untuk lokal & pengujian
│   ├── db.js                 klien libSQL (async) + skema
│   ├── seed.js               data demo
│   ├── scheduler.js          tugas berkala
│   ├── config.js
│   ├── lib/
│   │   ├── auth.js           scrypt, sesi di database, middleware peran
│   │   ├── helpers.js        buildRoomCode (XYY), format tanggal & rupiah
│   │   ├── images.js         unggahan gambar -> database
│   │   └── placeholder.js    generator PNG untuk gambar contoh
│   ├── services/             notifications, whatsapp, payments, announcements, maps
│   └── routes/               auth, images, owner.*, tenant.*, chat, notifications, webhooks
├── public/                   halaman login, shell SPA, CSS, 12 modul halaman
└── tests/
    ├── smoke.js              123 pemeriksaan API end-to-end
    ├── browser.js            122 pemeriksaan UI di Chromium headless
    └── vercel-entry.js       22 pemeriksaan titik masuk serverless
```

---

## Pengujian

```bash
npm run smoke      # 123 pemeriksaan API
npm run browser    # 122 pemeriksaan UI (Chromium headless)
npm run entry      # 22 pemeriksaan titik masuk serverless Vercel
```

Semuanya berjalan pada database sementara, jadi data Anda tidak tersentuh.

Pengujian API dan UI juga dapat dijalankan terhadap **server libSQL sungguhan** —
protokol yang sama dengan Turso — untuk memastikan jalur kode remote benar:

```bash
docker run --rm -p 8099:8080 -e SQLD_NODE=primary ghcr.io/tursodatabase/libsql-server
TURSO_DATABASE_URL=http://127.0.0.1:8099 npm run smoke
```

---

## Catatan keamanan

- Password di-hash dengan **scrypt** (modul `crypto` bawaan Node).
- Sesi memakai token acak 32 byte pada cookie `httpOnly` + `sameSite=lax`, dan `secure`
  otomatis aktif di produksi. Sesi disimpan di database sehingga berlaku di semua
  instance serverless.
- Setiap endpoint dijaga middleware peran: penyewa tidak dapat mengakses area pemilik dan
  sebaliknya; penyewa hanya bisa membuka tagihan dan laporan miliknya sendiri.
- Semua input pengguna di-*escape* sebelum dirender ke HTML; unggahan dibatasi tipe
  gambar dan ukurannya.
- Webhook pembayaran diverifikasi dengan **HMAC-SHA256** dan bersifat idempoten.
- Endpoint cron dilindungi `CRON_SECRET`.

---

## Pemecahan masalah di Vercel

Cek **Vercel → proyek Anda → Logs**, lalu cocokkan dengan tabel berikut.

| Gejala | Penyebab & solusi |
|---|---|
| **504 `FUNCTION_INVOCATION_TIMEOUT`** | Region fungsi jauh dari database. Lihat log: bila tertulis *"Routed to Washington, D.C., USA (iad1)"* sementara database Anda di Singapura, setel `"regions": ["sin1"]` di `vercel.json` lalu **Redeploy** |
| `URL scheme is not supported` | URL dan token tertukar, atau token ditempel ke `TURSO_DATABASE_URL` |
| `401` pada log | Token Turso kedaluwarsa atau tersalin tidak lengkap — buat token baru |
| Halaman terbuka tapi login gagal | Database belum tersemai. Buka `/api/health` untuk memastikan koneksi, atau jalankan `npm run seed` dari komputer |
| Mengubah environment variable tapi tidak berubah | Vercel perlu **Redeploy** agar perubahan env berlaku |

**Pemeriksaan cepat:** buka `https://aplikasi-anda.vercel.app/api/health`. Endpoint ini
tidak menyentuh database, jadi selalu merespons cepat, dan menampilkan region fungsi
serta jenis database yang terdeteksi:

```json
{
  "ok": true,
  "database": "turso (libsql)",
  "region": "sin1",
  "providers": { "whatsapp": "mock", "payment": "mock" }
}
```

Bila `region` tidak sama dengan region database Turso Anda, itulah yang perlu diperbaiki.
