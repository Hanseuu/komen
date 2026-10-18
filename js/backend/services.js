/**
 * Layanan pendukung "backend" di peramban: notifikasi, WhatsApp (simulasi),
 * pengumuman, dan pembayaran (QRIS / Virtual Account).
 *
 * Semuanya adalah padanan src/services/* pada versi server, tetapi bekerja
 * langsung di atas data localStorage.
 */

import { fail } from '../api-error.js';
import { toDataURL } from '../vendor/qrcode.js';
import * as S from './store.js';
import { config, PAYMENT_METHODS, ANNOUNCEMENT_TARGETS } from './config.js';
import {
  excerpt, nowSql, todaySql, toSqlDateTime, randomCode, normalizePhone,
  formatRupiah, formatTanggal, formatPeriode, floorFromCode, by,
} from './helpers.js';

/* ========================================================================== */
/* NOTIFIKASI                                                                 */
/* ========================================================================== */

/** Simpan satu notifikasi; ditampilkan sebagai toast + Web Notification. */
export function notify({ userId, title, body, type = 'info', link = null }) {
  if (!userId) return null;
  return S.insert('notifications', {
    userId: Number(userId),
    title: excerpt(title, 120),
    body: excerpt(body, 400),
    type,
    link,
    isRead: 0,
    createdAt: nowSql(),
  }).id;
}

/** Notifikasi yang sama untuk banyak pengguna. */
export function notifyMany(userIds, payload) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  for (const id of unique) notify({ ...payload, userId: id });
  return unique.length;
}

/** Notifikasi ke semua owner (biasanya hanya satu). */
export function notifyOwners(payload) {
  const owners = S.filter('users', (u) => u.role === 'owner' && u.status === 'aktif');
  return notifyMany(owners.map((o) => o.id), payload);
}

export const listNotifications = (userId, { limit = 30, afterId = 0 } = {}) =>
  S.filter('notifications', (n) => n.userId === userId && n.id > afterId)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      link: n.link,
      is_read: n.isRead,
      created_at: n.createdAt,
    }));

export const unreadCount = (userId) =>
  S.filter('notifications', (n) => n.userId === userId && !n.isRead).length;

export function markRead(userId, ids) {
  const wanted = new Set(ids.map(Number));
  let changed = 0;
  for (const n of S.db().notifications) {
    if (n.userId === userId && wanted.has(n.id) && !n.isRead) {
      n.isRead = 1;
      changed += 1;
    }
  }
  S.save();
  return changed;
}

export function markAllRead(userId) {
  let changed = 0;
  for (const n of S.db().notifications) {
    if (n.userId === userId && !n.isRead) {
      n.isRead = 1;
      changed += 1;
    }
  }
  S.save();
  return changed;
}

/* ========================================================================== */
/* WHATSAPP (selalu mode simulasi pada versi statis)                          */
/* ========================================================================== */

const logWa = (entry) => S.insert('waLogs', { ...entry, createdAt: nowSql() }).id;

/**
 * "Kirim" pesan WhatsApp.
 *
 * Versi statis tidak boleh memanggil API luar (tidak ada tempat menyimpan
 * token dengan aman), jadi pesan hanya dicatat di wa_logs supaya owner tetap
 * bisa melihat isi pesan yang akan terkirim pada versi sungguhan.
 */
export function sendWhatsApp({ userId = null, phone, message, kind = 'umum' }) {
  const target = normalizePhone(phone);
  const provider = config.wa.provider;

  if (!target) {
    return {
      ok: false,
      status: 'gagal',
      provider,
      reason: 'Nomor WhatsApp belum diisi',
      logId: logWa({
        userId, phone: String(phone || '-'), kind, message, provider,
        status: 'gagal', response: 'Nomor kosong',
      }),
    };
  }

  const note = 'Mode simulasi (versi statis tanpa server)';
  return {
    ok: true,
    status: 'simulasi',
    provider,
    reason: note,
    logId: logWa({ userId, phone: target, kind, message, provider, status: 'simulasi', response: note }),
  };
}

export const waStatus = () => ({
  provider: config.wa.provider,
  configured: true,
  simulated: true,
});

export const listWaLogs = ({ limit = 50 } = {}) =>
  [...S.db().waLogs]
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map((l) => ({
      ...l,
      userName: l.userId ? S.byId('users', l.userId)?.name || null : null,
    }));

/* -------------------------------------------------------------------------- */
/* Template pesan                                                             */
/* -------------------------------------------------------------------------- */

export const templates = {
  tagihanBaru: ({ tenant, bill }) =>
    `*${config.kost.name}*\n\n` +
    `Halo ${tenant.name}, tagihan baru untuk kamar *${tenant.roomCode || '-'}* sudah diterbitkan.\n\n` +
    `Tagihan : ${bill.title}\n` +
    `Periode : ${formatPeriode(bill.period)}\n` +
    `Nominal : *${formatRupiah(bill.amount)}*\n` +
    `Jatuh tempo : ${formatTanggal(bill.dueDate)}\n\n` +
    'Pembayaran dapat dilakukan lewat QRIS atau Virtual Account di menu "Tagihan Saya" pada aplikasi Komen.\n' +
    'Terima kasih 🙏',

  reminderTagihan: ({ tenant, bill, dueInDays }) => {
    const waktu =
      dueInDays === null ? ''
        : dueInDays < 0 ? `Tagihan ini sudah *terlambat ${Math.abs(dueInDays)} hari*.`
          : dueInDays === 0 ? 'Tagihan ini *jatuh tempo hari ini*.'
            : `Jatuh tempo dalam *${dueInDays} hari* lagi.`;
    return (
      `*${config.kost.name}* - Pengingat Pembayaran\n\n` +
      `Halo ${tenant.name} (kamar ${tenant.roomCode || '-'}),\n` +
      `${bill.title} periode ${formatPeriode(bill.period)} sebesar *${formatRupiah(bill.amount)}* belum terbayar.\n` +
      `Jatuh tempo : ${formatTanggal(bill.dueDate)}\n${waktu}\n\n` +
      'Silakan lakukan pembayaran melalui aplikasi Komen (QRIS / Virtual Account).\n' +
      'Abaikan pesan ini bila Anda sudah membayar. Terima kasih 🙏'
    );
  },

  pembayaranBerhasil: ({ tenant, bill, payment }) =>
    `*${config.kost.name}* - Pembayaran Diterima ✅\n\n` +
    `Terima kasih ${tenant.name}, pembayaran Anda sudah kami terima.\n\n` +
    `Tagihan : ${bill.title} (${formatPeriode(bill.period)})\n` +
    `Kamar   : ${tenant.roomCode || '-'}\n` +
    `Nominal : *${formatRupiah(payment.total)}*\n` +
    `Metode  : ${payment.methodLabel}\n` +
    `Ref     : ${payment.reference}\n\n` +
    'Simpan pesan ini sebagai bukti pembayaran.',

  pengumuman: ({ tenant, announcement }) =>
    `*${config.kost.name}* - Pengumuman 📢\n\n` +
    `*${announcement.title}*\n\n${announcement.body}\n\n` +
    `— Untuk: ${tenant.roomCode ? `kamar ${tenant.roomCode}` : 'penyewa'}`,

  komplainUpdate: ({ tenant, complaint, statusLabel, note }) =>
    `*${config.kost.name}* - Update Laporan 🔧\n\n` +
    `Halo ${tenant.name}, laporan "${complaint.title}" (#${complaint.id}) kini berstatus *${statusLabel}*.\n` +
    (note ? `\nCatatan pemilik: ${note}\n` : '') +
    '\nDetail lengkap bisa dilihat di menu "Lapor Kerusakan".',
};

/* ========================================================================== */
/* PENGUMUMAN                                                                 */
/* ========================================================================== */

export const targetLabel = (code) =>
  ANNOUNCEMENT_TARGETS.find((t) => t.code === code)?.label || code;

/** Penerima pengumuman: hanya penyewa AKTIF, difilter sesuai target. */
export function recipientsFor(target) {
  const tenants = S.filter('users', (u) => u.role === 'tenant' && u.status === 'aktif');
  const withRoom = tenants.map((u) => {
    const room = u.roomId ? S.byId('rooms', u.roomId) : null;
    return { id: u.id, name: u.name, phone: u.phone, roomCode: room?.code || null, floor: room?.floor || null };
  });

  if (target === 'semua') return withRoom;
  const floor = Number(String(target).replace('lantai_', ''));
  return withRoom.filter((u) => u.floor === floor);
}

/** Apakah seorang penyewa termasuk penerima pengumuman tertentu. */
export function isRecipient(user, target) {
  if (target === 'semua') return true;
  const room = user.roomId ? S.byId('rooms', user.roomId) : null;
  if (!room) return false;
  return floorFromCode(room.code) === Number(String(target).replace('lantai_', ''));
}

export const shapeAnnouncement = (row, { readCount, recipientCount, isRead } = {}) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  target: row.target,
  targetLabel: targetLabel(row.target),
  category: row.category,
  status: row.status,
  isPinned: Boolean(row.isPinned),
  sendWhatsapp: Boolean(row.sendWhatsapp),
  scheduledAt: row.scheduledAt,
  publishedAt: row.publishedAt,
  createdAt: row.createdAt,
  authorName: row.createdBy ? S.byId('users', row.createdBy)?.name || null : null,
  readCount: readCount ?? null,
  recipientCount: recipientCount ?? null,
  isRead: isRead === undefined ? undefined : Boolean(isRead),
});

/** Terbitkan pengumuman: ubah status, kirim notifikasi, lalu WhatsApp bila diminta. */
export function publishAnnouncement(id) {
  const ann = S.byId('announcements', id);
  if (!ann) return { ok: false, reason: 'Pengumuman tidak ditemukan' };

  const publishedAt = nowSql();
  S.update('announcements', id, { status: 'terbit', publishedAt, updatedAt: publishedAt });

  const recipients = recipientsFor(ann.target);
  notifyMany(recipients.map((r) => r.id), {
    title: `📢 ${ann.title}`,
    body: excerpt(ann.body, 180),
    type: 'announcement',
    link: `#/penyewa/pengumuman?id=${id}`,
  });

  let waSent = 0;
  let waFailed = 0;
  if (ann.sendWhatsapp) {
    for (const r of recipients.filter((x) => x.phone)) {
      const res = sendWhatsApp({
        userId: r.id,
        phone: r.phone,
        kind: 'pengumuman',
        message: templates.pengumuman({ tenant: r, announcement: ann }),
      });
      if (res.ok) waSent += 1;
      else waFailed += 1;
    }
  }

  return { ok: true, recipients: recipients.length, waSent, waFailed, publishedAt };
}

/**
 * Terbitkan pengumuman terjadwal yang sudah waktunya.
 *
 * Pada versi server ini dikerjakan oleh scheduler. Tanpa server, pengecekan
 * dilakukan setiap kali aplikasi mengirim permintaan — hasilnya sama dari
 * sudut pandang pengguna.
 */
export function publishDueAnnouncements() {
  const now = nowSql();
  const due = S.filter(
    'announcements',
    (a) => a.status === 'terjadwal' && a.scheduledAt && a.scheduledAt <= now
  ).sort(by('scheduledAt'));

  const published = [];
  for (const row of due) {
    const result = publishAnnouncement(row.id);
    if (result.ok) published.push({ id: row.id, ...result });
  }
  return published;
}

/* ========================================================================== */
/* TAGIHAN & PEMBAYARAN                                                       */
/* ========================================================================== */

/** Tandai tagihan yang sudah lewat jatuh tempo sebagai terlambat. */
export function refreshOverdueBills() {
  const today = todaySql();
  let changed = 0;
  for (const b of S.db().bills) {
    if (b.status === 'belum_bayar' && b.dueDate < today) {
      b.status = 'terlambat';
      changed += 1;
    }
  }
  if (changed) S.save();
  return changed;
}

export const getMethod = (code) => PAYMENT_METHODS.find((m) => m.code === code) || null;

/* ------------------------------- QRIS (EMVCo) ----------------------------- */

const tlv = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16/CCITT-FALSE sesuai spesifikasi EMVCo tag 63. */
function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildQrisPayload({ amount, reference }) {
  const merchantAccount =
    tlv('00', 'ID.CO.QRIS.WWW') +
    tlv('01', config.payment.merchantId) +
    tlv('02', String(reference).slice(0, 20)) +
    tlv('03', 'UMI');

  let payload =
    tlv('00', '01') +                                      // format indicator
    tlv('01', '12') +                                      // dynamic QR (sekali pakai)
    tlv('26', merchantAccount) +                           // merchant account info
    tlv('52', '5999') +                                    // merchant category code
    tlv('53', '360') +                                     // mata uang: IDR
    tlv('54', String(Math.round(amount))) +                // nominal transaksi
    tlv('58', 'ID') +                                      // negara
    tlv('59', config.payment.merchantName.slice(0, 25)) +
    tlv('60', config.payment.merchantCity.slice(0, 15)) +
    tlv('62', tlv('01', String(reference).slice(0, 25)));   // additional data: bill ref

  payload += '6304';
  return payload + crc16(payload);
}

const vaNumber = (method, billId) => {
  const prefix = method.prefix || '88888';
  const tail = String(billId).padStart(4, '0') + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${prefix}${tail}`.slice(0, 16);
};

const instructionsFor = (method, va) => {
  if (method.type === 'qris') {
    return [
      'Buka aplikasi m-banking atau e-wallet Anda (GoPay, OVO, DANA, ShopeePay, dll).',
      'Pilih menu Bayar / Scan QRIS.',
      'Scan kode QR di atas, lalu pastikan nama merchant dan nominal sudah sesuai.',
      'Selesaikan pembayaran. Status tagihan akan otomatis diperbarui.',
    ].join('\n');
  }
  return [
    `Buka aplikasi m-banking ${method.issuer} atau ATM.`,
    'Pilih menu Transfer > Virtual Account.',
    `Masukkan nomor Virtual Account: ${va}`,
    'Pastikan nama penerima dan nominal sudah sesuai, lalu konfirmasi pembayaran.',
    'Status tagihan akan otomatis diperbarui setelah pembayaran diterima.',
  ].join('\n');
};

/** Buat transaksi baru untuk sebuah tagihan. */
export async function createPayment({ bill, tenant, methodCode }) {
  const method = getMethod(methodCode);
  if (!method) fail(400, 'Metode pembayaran tidak dikenali.');
  if (bill.status === 'lunas') fail(409, 'Tagihan ini sudah lunas.');

  // Batalkan transaksi pending sebelumnya untuk tagihan yang sama.
  for (const p of S.db().payments) {
    if (p.billId === bill.id && p.status === 'pending') {
      p.status = 'kedaluwarsa';
      p.failureReason = 'Diganti transaksi baru';
      p.settledAt = nowSql();
    }
  }

  const reference = `KMN-${new Date().getFullYear()}-${randomCode(8)}`;
  const fee = method.fee || 0;
  const total = bill.amount + fee;
  const expiresAt = toSqlDateTime(new Date(Date.now() + config.payment.expiryMinutes * 60000));

  let qrPayload = null;
  let qrImage = null;
  let va = null;

  if (method.type === 'qris') {
    qrPayload = buildQrisPayload({ amount: total, reference });
    qrImage = await toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } else {
    va = vaNumber(method, bill.id);
  }

  const payment = S.insert('payments', {
    billId: bill.id,
    tenantId: tenant.id,
    reference,
    method: method.code,
    methodLabel: method.label,
    amount: bill.amount,
    fee,
    total,
    status: 'pending',
    qrPayload,
    qrImage,
    vaNumber: va,
    instructions: instructionsFor(method, va),
    failureReason: null,
    expiresAt,
    createdAt: nowSql(),
    settledAt: null,
  });

  if (bill.status !== 'lunas') S.update('bills', bill.id, { status: 'menunggu_pembayaran' });

  return payment;
}

export const getPaymentByRef = (reference) => S.find('payments', (p) => p.reference === reference);

/** Status tagihan setelah pembayaran gagal / dibatalkan. */
const fallbackBillStatus = (bill) => (bill.dueDate < todaySql() ? 'terlambat' : 'belum_bayar');

/** Tandai transaksi pending yang sudah melewati batas waktu. */
export function expireStalePayments() {
  const now = nowSql();
  const stale = S.filter('payments', (p) => p.status === 'pending' && p.expiresAt && p.expiresAt < now);
  if (!stale.length) return 0;

  for (const p of stale) {
    p.status = 'kedaluwarsa';
    p.failureReason = 'Batas waktu pembayaran terlampaui';
    p.settledAt = now;

    const bill = S.byId('bills', p.billId);
    if (bill && bill.status === 'menunggu_pembayaran') bill.status = fallbackBillStatus(bill);
  }
  S.save();
  return stale.length;
}

/** Finalisasi transaksi: 'berhasil' atau 'gagal'. */
export function settlePayment(reference, outcome, reason = null) {
  const payment = getPaymentByRef(reference);
  if (!payment) fail(404, 'Transaksi tidak ditemukan.');
  if (payment.status !== 'pending') {
    fail(409, `Transaksi ${reference} sudah berstatus "${payment.status}".`);
  }
  if (!['berhasil', 'gagal'].includes(outcome)) {
    fail(400, 'Hasil transaksi harus "berhasil" atau "gagal".');
  }

  const settledAt = nowSql();
  payment.status = outcome;
  payment.failureReason = outcome === 'gagal' ? (reason || 'Pembayaran tidak berhasil diproses') : null;
  payment.settledAt = settledAt;

  const bill = S.byId('bills', payment.billId);
  if (bill) {
    if (outcome === 'berhasil') {
      bill.status = 'lunas';
      bill.paidAt = settledAt;
    } else if (bill.status !== 'lunas') {
      bill.status = fallbackBillStatus(bill);
    }
  }

  S.save();
  return payment;
}

/**
 * Efek samping setelah transaksi final: notifikasi untuk penyewa & owner,
 * plus struk WhatsApp bila berhasil.
 */
export function handleSettlement(payment) {
  const bill = S.byId('bills', payment.billId);
  const tenantRow = S.byId('users', payment.tenantId);
  const room = tenantRow?.roomId ? S.byId('rooms', tenantRow.roomId) : null;
  const tenant = { ...tenantRow, roomCode: room?.code || null };

  if (payment.status === 'berhasil') {
    notify({
      userId: tenant.id,
      title: 'Pembayaran berhasil ✅',
      body: `${bill.title} (${formatPeriode(bill.period)}) sebesar ${formatRupiah(payment.total)} via ${payment.methodLabel}. Ref: ${payment.reference}`,
      type: 'success',
      link: '#/penyewa/tagihan',
    });
    notifyOwners({
      title: `Pembayaran masuk: ${tenant.roomCode || tenant.name}`,
      body: `${tenant.name} membayar ${bill.title} ${formatPeriode(bill.period)} sebesar ${formatRupiah(payment.total)} via ${payment.methodLabel}.`,
      type: 'success',
      link: '#/owner/keuangan',
    });

    const wa = sendWhatsApp({
      userId: tenant.id,
      phone: tenant.phone,
      kind: 'struk',
      message: templates.pembayaranBerhasil({ tenant, bill, payment }),
    });
    return { message: 'Pembayaran berhasil. Struk dicatat di log WhatsApp.', whatsapp: wa };
  }

  notify({
    userId: tenant.id,
    title: 'Pembayaran gagal ❌',
    body: `${payment.failureReason || 'Transaksi tidak berhasil'}. Ref: ${payment.reference}. Silakan coba lagi.`,
    type: 'error',
    link: '#/penyewa/tagihan',
  });
  return { message: `Pembayaran gagal: ${payment.failureReason || 'transaksi ditolak'}.` };
}
