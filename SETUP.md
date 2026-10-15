# Panduan Mulai — dari Nol

Panduan langkah demi langkah untuk **menjalankan Komen di komputer sendiri**
(bagian A), lalu **menayangkannya di Vercel** (bagian B).

Bagian A tidak memerlukan akun, internet, maupun database online — cukup dua
program yang dipasang sekali saja.

---

# A. Jalankan di komputer sendiri

## A1. Pasang Node.js

Node.js adalah program yang menjalankan aplikasi ini.

1. Buka **[nodejs.org](https://nodejs.org)**
2. Unduh versi **LTS** (tombol besar di sebelah kiri)
3. Jalankan pemasangnya → **Next** sampai **Finish** (biarkan semua pilihan bawaan)
4. **Tutup semua jendela terminal** yang terbuka, lalu buka yang baru

Versi minimal yang didukung adalah **Node.js 20**.

### Memastikan pemasangan berhasil

Buka terminal:

- **Windows** — tekan `Win`, ketik `powershell`, tekan Enter
- **macOS** — tekan `Cmd + Space`, ketik `terminal`, tekan Enter

Ketik:

```bash
node -v
```

Harus muncul nomor versi seperti `v22.11.0`. Bila muncul pesan
*"command not found"* atau *"bukan merupakan perintah"*, pemasangan belum
berhasil atau terminal belum dibuka ulang.

### ⚠️ Khusus Windows: izinkan npm berjalan di PowerShell

Secara bawaan, PowerShell pada banyak komputer Windows menolak menjalankan
skrip. Karena perintah `npm` sebenarnya berupa skrip (`npm.ps1`), muncul pesan:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because
running scripts is disabled on this system.
```

Ini **bukan** tanda pemasangan Node.js gagal — hanya aturan keamanan PowerShell.
Pilih salah satu solusi berikut.

**Solusi 1 — izinkan sekali, berlaku seterusnya (disarankan).**
Tidak perlu hak administrator, dan hanya berlaku untuk akun Anda:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Ketik `Y` lalu Enter. Tutup PowerShell, buka lagi, dan `npm` bisa dipakai
seperti biasa. `RemoteSigned` adalah setelan yang disarankan Microsoft untuk
komputer pengembang: skrip yang Anda buat sendiri boleh jalan, skrip yang
diunduh dari internet tetap harus bertanda tangan.

**Solusi 2 — pakai `npm.cmd`.**
Tanpa mengubah pengaturan apa pun, tambahkan `.cmd` pada setiap perintah npm:

```powershell
npm.cmd install
npm.cmd start
```

**Solusi 3 — pakai Command Prompt.**
Tekan `Win`, ketik `cmd`, tekan Enter. Di sana `npm` berjalan normal tanpa
perubahan pengaturan.

> **Catatan berguna:** menjalankan aplikasinya sendiri tidak membutuhkan npm.
> `node src/server.js` melakukan hal yang sama dengan `npm start`, dan `node`
> adalah program biasa sehingga tidak pernah diblokir PowerShell. Hanya
> `npm install` yang benar-benar memerlukan npm.

## A2. Ambil kodenya

### Cara cepat — tanpa Git

1. Buka **[github.com/Hanseuu/komen](https://github.com/Hanseuu/komen)**
2. Klik tombol hijau **Code** → **Download ZIP**
3. Ekstrak ZIP-nya, misalnya ke `Documents\komen`

### Cara yang disarankan — dengan Git

Git memudahkan mengambil pembaruan dan mengirim perubahan ke GitHub.
Unduh dari **[git-scm.com](https://git-scm.com)**, pasang dengan pilihan bawaan, lalu:

```bash
git clone https://github.com/Hanseuu/komen.git
cd komen
```

## A3. Masuk ke foldernya di terminal

Cara termudah di **Windows**: buka folder `komen` di File Explorer, klik kanan
pada area kosong → **Open in Terminal** (Windows 11) atau **Buka jendela
PowerShell di sini** (Windows 10).

Atau ketik manual:

```bash
cd Documents\komen          # Windows
cd ~/Documents/komen        # macOS / Linux
```

Pastikan Anda berada di folder yang benar — di dalamnya harus ada berkas
`package.json`:

```bash
dir package.json            # Windows
ls package.json             # macOS / Linux
```

## A4. Pasang dependensi

Sekali saja, perintah ini mengunduh pustaka yang dibutuhkan aplikasi:

```bash
npm install
```

Butuh waktu 1–3 menit. Pesan *warning* boleh diabaikan; yang penting tidak ada
tulisan **error**.

## A5. Periksa kesiapan

```bash
npm run check
```

Perintah ini memeriksa versi Node, dependensi, database, dan port — lalu
memberi tahu bila ada yang perlu dibereskan.

## A6. Jalankan

```bash
npm start
```

Akan muncul:

```
──────────────────────────────────────────────────────────
  Komen — Kos Manajemen
──────────────────────────────────────────────────────────
  URL        : http://localhost:3000
  Database   : data/komen.db
  Data demo  : baru dibuat
──────────────────────────────────────────────────────────
```

Buka **<http://localhost:3000>** di browser dan login:

| Peran | Email | Password |
|---|---|---|
| Pemilik Kos | `owner@komen.id` | `owner123` |
| Penyewa | `penyewa@komen.id` | `penyewa123` |

> **Tips:** buka pemilik di jendela biasa dan penyewa di jendela **Incognito**
> agar kedua sesi login tidak saling menimpa.

**Untuk menghentikan aplikasi:** tekan `Ctrl + C` di terminal.

Database tersimpan di berkas `data/komen.db`, jadi data Anda tetap ada saat
aplikasi dijalankan kembali. Ingin mulai dari data demo yang segar?

```bash
npm run reset
```

## A7. Mengubah tampilan dan isi

Semua perubahan langsung terlihat setelah menyegarkan browser:

| Ingin mengubah | Berkas |
|---|---|
| Warna, ukuran, tata letak | `public/css/style.css` |
| Halaman login | `public/index.html` |
| Isi halaman tertentu | `public/js/pages/` |
| Nama kos, alamat | buat berkas `.env` (lihat `.env.example`) |
| Data demo (penyewa, kamar) | `src/seed.js` lalu `npm run reset` |

Supaya tidak perlu menjalankan ulang server setiap kali mengubah kode di `src/`:

```bash
npm run dev
```

---

# B. Tayangkan di Vercel

Setelah puas dengan versi lokal, aplikasi yang sama bisa ditayangkan online.
Di Vercel aplikasi berjalan tanpa server tetap (*serverless*), sehingga
databasenya perlu berada di layanan terpisah: **Turso**. Keduanya gratis dan
tanpa kartu kredit.

## B1. Buat database Turso

1. Daftar di **[turso.tech](https://turso.tech)** (bisa pakai akun GitHub)
2. **Create Database** → beri nama `komen`
3. Pilih region **terdekat** — untuk Indonesia: **Singapore**
4. Catat dua nilai ini:

| Yang dicari | Bentuknya |
|---|---|
| **Database URL** | `libsql://komen-xxxx.turso.io` |
| **Auth token** | `eyJhbGciOi...` (panjang) |

Token biasanya ada di balik tombol **Generate token** / **Create token**.

> **Penting:** ingat region yang Anda pilih. Nilai ini dipakai di langkah B2.

## B2. Samakan region aplikasi dengan region database

Ini penyebab paling umum error **504 `FUNCTION_INVOCATION_TIMEOUT`**: Vercel
menjalankan aplikasi di Amerika secara bawaan, sedangkan database Anda di
Singapura — setiap permintaan data harus menyeberangi Pasifik.

Buka berkas `vercel.json` dan pastikan barisnya cocok dengan region database:

```json
"regions": ["sin1"]
```

| Region database Turso | Isi `vercel.json` |
|---|---|
| Singapore | `["sin1"]` |
| US East | `["iad1"]` |
| US West | `["sfo1"]` |
| Frankfurt | `["fra1"]` |
| Sydney | `["syd1"]` |

Bawaan di repositori ini sudah `sin1` (Singapura). Bila diubah, simpan lalu:

```bash
git add vercel.json
git commit -m "Set region sesuai database"
git push
```

## B3. Isi database (opsional tapi disarankan)

Mengisi data demo dari komputer sendiri lebih mudah dipantau daripada menunggu
proses otomatis saat kunjungan pertama.

**Windows (PowerShell):**

```powershell
$env:TURSO_DATABASE_URL="libsql://komen-xxxx.turso.io"
$env:TURSO_AUTH_TOKEN="eyJhbGciOi..."
npm run seed
```

**macOS / Linux:**

```bash
TURSO_DATABASE_URL="libsql://komen-xxxx.turso.io" \
TURSO_AUTH_TOKEN="eyJhbGciOi..." \
npm run seed
```

Akan muncul tabel berisi jumlah kamar, penyewa, tagihan, dan seterusnya.

> Perintah ini **tidak** mengubah database lokal Anda — hanya yang di Turso.

## B4. Hubungkan ke Vercel

1. Daftar di **[vercel.com](https://vercel.com)** dengan akun **GitHub**
2. **Add New** → **Project**
3. Pilih repositori **`komen`** → **Import**
4. Biarkan semua pengaturan bawaan:

   | Pengaturan | Nilai |
   |---|---|
   | Framework Preset | **Other** |
   | Build Command | *(kosong)* |
   | Output Directory | *(kosong)* |
   | Root Directory | *(kosong)* |

5. Buka bagian **Environment Variables**, tambahkan dua variabel:

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | URL dari langkah B1 |
   | `TURSO_AUTH_TOKEN` | token dari langkah B1 |

   Nama harus **sama persis** (huruf besar/kecil berpengaruh).

6. Klik **Deploy** dan tunggu 1–2 menit

Aplikasi akan hidup di `https://komen-xxxx.vercel.app`.

## B5. Pastikan berjalan benar

Buka `https://aplikasi-anda.vercel.app/api/health`. Halaman ini tidak menyentuh
database, jadi selalu merespons cepat:

```json
{
  "ok": true,
  "database": "turso (libsql)",
  "region": "sin1"
}
```

Yang perlu diperiksa:

- `database` berisi `turso` → variabel lingkungan sudah terbaca
- `region` **sama** dengan region database Turso Anda → tidak akan timeout

Lalu buka halaman utamanya dan login seperti biasa.

## B6. Memperbarui aplikasi nanti

Setiap kali mengirim perubahan ke GitHub, Vercel otomatis menayangkan versi baru:

```bash
git add .
git commit -m "Perbarui tampilan"
git push
```

> Mengubah **Environment Variables** di Vercel tidak langsung berlaku — perlu
> **Redeploy** dari tab **Deployments**.

---

# Kalau tersangkut

| Gejala | Penyebab & solusi |
|---|---|
| `node: command not found` | Node.js belum terpasang, atau terminal belum dibuka ulang setelah memasang |
| **`npm.ps1 cannot be loaded because running scripts is disabled`** | Aturan keamanan PowerShell di Windows. Jalankan `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`, atau pakai `npm.cmd` sebagai ganti `npm`. Lihat [bagian A1](#%EF%B8%8F-khusus-windows-izinkan-npm-berjalan-di-powershell) |
| `npm install` gagal dengan error jaringan | Koneksi terputus; coba lagi, atau ganti jaringan |
| `Error: listen EADDRINUSE :::3000` | Port 3000 dipakai aplikasi lain. Tutup aplikasi itu, atau jalankan `npx cross-env PORT=3001 npm start` |
| `npm start` jalan tapi browser kosong | Pastikan alamatnya `http://localhost:3000` (bukan `https`) |
| Halaman terbuka tapi login gagal | Jalankan `npm run reset` untuk membuat ulang data demo |
| **504 di Vercel** | Region tidak cocok — lihat langkah **B2**, lalu **Redeploy** |
| Vercel: `URL scheme is not supported` | URL dan token tertukar saat ditempel |
| Perubahan tidak muncul di Vercel | Pastikan sudah `git push`; cek tab **Deployments** apakah build berhasil |

Pemeriksaan cepat kapan saja:

```bash
npm run check
```

---

# Daftar perintah

| Perintah | Fungsi |
|---|---|
| `npm install` | Pasang dependensi (sekali saja) |
| `npm run check` | Periksa kesiapan lingkungan |
| `npm start` | Jalankan aplikasi |
| `npm run dev` | Jalankan dengan muat ulang otomatis saat kode diubah |
| `npm run reset` | Bangun ulang data demo |
| `npm run smoke` | 123 pengujian API |
| `npm run browser` | 122 pengujian antarmuka |
| `npm run entry` | 22 pengujian titik masuk Vercel |
