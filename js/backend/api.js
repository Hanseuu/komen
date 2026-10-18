/**
 * "Backend" yang berjalan di dalam peramban.
 *
 * Modul ini menggantikan server Express pada versi statis: ia menerima
 * (method, url, body) yang sama seperti sebelumnya, lalu menjawab dengan
 * bentuk data yang identik — hanya saja sumbernya localStorage, bukan
 * database. Dengan begitu seluruh halaman di js/pages/* tidak perlu diubah.
 */

import { ApiError, fail } from '../api-error.js';
import * as S from './store.js';
import { seedDemoData } from './seed.js';
import {
  config, PAYMENT_METHODS, ANNOUNCEMENT_TARGETS, COMPLAINT_STATUSES,
  ANNOUNCEMENT_CATEGORIES, COMPLAINT_CATEGORIES, COMPLAINT_LOCATIONS,
  FACILITY_CATEGORIES, BILL_STATUS_META, PAYMENT_STATUS_META,
} from './config.js';
import {
  PLACE_CATEGORIES, placeUrl, directionsUrl, nearbySearchUrl, categoryMeta, formatDistance,
} from './maps.js';
import {
  requireFields, str, int, bool, isEmail, normalizePhone, buildRoomCode,
  nowSql, todaySql, toSqlDateTime, daysUntil, excerpt, by,
  formatRupiah, formatPeriode, formatTanggal,
} from './helpers.js';
import {
  notify, notifyMany, notifyOwners, listNotifications, unreadCount, markRead, markAllRead,
  sendWhatsApp, templates, waStatus, listWaLogs,
  recipientsFor, isRecipient, targetLabel, shapeAnnouncement, publishAnnouncement,
  publishDueAnnouncements,
  refreshOverdueBills, createPayment, getPaymentByRef, settlePayment, expireStalePayments,
  handleSettlement,
} from './services.js';

/* ========================================================================== */
/* Bantuan umum                                                               */
/* ========================================================================== */

const roomOf = (user) => (user?.roomId ? S.byId('rooms', user.roomId) : null);

/** Bentuk data pengguna yang aman dikirim ke halaman. */
function publicUser(user) {
  if (!user) return null;
  const room = roomOf(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    status: user.status,
    roomId: user.roomId || null,
    roomCode: room?.code || null,
    roomFloor: room?.floor || null,
    roomPrice: room?.price || null,
    occupation: user.occupation || '',
    emergencyContact: user.emergencyContact || '',
    checkInDate: user.checkInDate || null,
    avatarColor: user.avatarColor || '#2563eb',
    createdAt: user.createdAt,
  };
}

const OPEN_BILL_STATUSES = ['belum_bayar', 'terlambat', 'menunggu_pembayaran'];

const tenantsActive = () => S.filter('users', (u) => u.role === 'tenant' && u.status === 'aktif');

const primaryOwner = () =>
  S.filter('users', (u) => u.role === 'owner').sort((a, b) => a.id - b.id)[0] || null;

/** Penghuni aktif sebuah kamar (opsional: kecualikan satu pengguna). */
const occupantOf = (roomId, exceptId = null) =>
  S.find(
    'users',
    (u) => u.roomId === roomId && u.role === 'tenant' && u.status === 'aktif' && u.id !== exceptId
  );

const unreadMessagesFor = (userId) =>
  S.filter('messages', (m) => m.receiverId === userId && !m.readAt).length;

/* ========================================================================== */
/* PENYEWA & KAMAR (owner)                                                    */
/* ========================================================================== */

function tenantFinance(tenantId) {
  const open = S.filter('bills', (b) => b.tenantId === tenantId && OPEN_BILL_STATUSES.includes(b.status));
  const nextDueDate = open.length ? open.map((b) => b.dueDate).sort()[0] : null;
  return {
    unpaidBills: open.length,
    unpaidTotal: open.reduce((sum, b) => sum + b.amount, 0),
    nextDueDate,
    daysToDue: daysUntil(nextDueDate),
  };
}

function shapeTenant(user) {
  const room = roomOf(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    waPhone: normalizePhone(user.phone),
    status: user.status,
    occupation: user.occupation || '',
    emergencyContact: user.emergencyContact || '',
    checkInDate: user.checkInDate,
    checkOutDate: user.checkOutDate,
    avatarColor: user.avatarColor,
    room: room
      ? { id: room.id, code: room.code, floor: room.floor, number: room.number, price: room.price }
      : null,
    // "roomCode" mengikuti format XYY: X = lantai, YY = nomor kamar (01-30)
    roomCode: room?.code || null,
    finance: tenantFinance(user.id),
    openComplaints: S.filter('complaints', (c) => c.tenantId === user.id && c.status !== 'selesai').length,
    unreadMessages: S.filter('messages', (m) => m.senderId === user.id && !m.readAt).length,
  };
}

/** Urutan daftar penyewa: yang punya kamar dulu, lalu lantai, nomor, nama. */
const tenantOrder = (a, b) => {
  const ra = roomOf(a);
  const rb = roomOf(b);
  if (!ra !== !rb) return ra ? -1 : 1;
  if (ra && rb) {
    if (ra.floor !== rb.floor) return ra.floor - rb.floor;
    if (ra.number !== rb.number) return ra.number - rb.number;
  }
  return a.name.localeCompare(b.name, 'id');
};

/* ========================================================================== */
/* DENAH, FASILITAS, TEMPAT SEKITAR                                           */
/* ========================================================================== */

function roomLayout(floor) {
  return S.filter('rooms', (r) => r.floor === floor)
    .sort((a, b) => a.number - b.number)
    .map((r) => {
      const tenant = occupantOf(r.id);
      return {
        id: r.id,
        code: r.code,
        number: r.number,
        price: r.price,
        size: r.size || '',
        notes: r.notes || '',
        occupied: Boolean(tenant),
        tenant: tenant ? { id: tenant.id, name: tenant.name, avatarColor: tenant.avatarColor } : null,
      };
    });
}

/** Gabungan data denah: metadata yang diisi owner + susunan kamar. */
function buildFloorplans({ includeTenantNames = true } = {}) {
  return config.building.floors.map((floor) => {
    const meta = S.find('floorplans', (f) => f.floor === floor);
    const layout = roomLayout(floor);
    const rooms = layout.map((r) =>
      includeTenantNames ? r : { ...r, tenant: r.occupied ? { name: 'Terisi' } : null }
    );

    return {
      floor,
      title: meta?.title || `Lantai ${floor}`,
      description: meta?.description || '',
      imagePath: meta?.imagePath || null,
      updatedAt: meta?.updatedAt || null,
      rooms,
      stats: {
        total: rooms.length,
        occupied: rooms.filter((r) => r.occupied).length,
        available: rooms.filter((r) => !r.occupied).length,
      },
    };
  });
}

const shapeFacility = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  category: row.category,
  icon: row.icon,
  location: row.location || '',
  photoPath: row.photoPath || null,
  isPublished: Boolean(row.isPublished),
  sortOrder: row.sortOrder,
  updatedAt: row.updatedAt,
});

const listFacilities = ({ onlyPublished = false } = {}) =>
  S.filter('facilities', (f) => (onlyPublished ? Boolean(f.isPublished) : true))
    .sort(by('sortOrder', 'name'))
    .map(shapeFacility);

const shapePlace = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  address: row.address || '',
  distanceM: row.distanceM,
  distanceLabel: formatDistance(row.distanceM),
  lat: row.lat,
  lng: row.lng,
  isActive: Boolean(row.isActive),
  mapsUrl: placeUrl(row),
  directionsUrl: directionsUrl(row),
});

const listPlaces = ({ onlyActive = false } = {}) =>
  S.filter('places', (p) => (onlyActive ? Boolean(p.isActive) : true))
    .sort(by('category', 'distanceM', 'name'))
    .map(shapePlace);

/* ========================================================================== */
/* KOMPLAIN                                                                   */
/* ========================================================================== */

const complaintStatusLabel = (code) =>
  COMPLAINT_STATUSES.find((s) => s.code === code)?.label || code;

function shapeComplaint(row) {
  const tenant = S.byId('users', row.tenantId);
  const room = row.roomId ? S.byId('rooms', row.roomId) : null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    categoryIcon: COMPLAINT_CATEGORIES.find((c) => c.code === row.category)?.icon || '🧰',
    location: row.location,
    priority: row.priority,
    status: row.status,
    statusLabel: complaintStatusLabel(row.status),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
    tenant: {
      id: row.tenantId,
      name: tenant?.name || '—',
      phone: tenant?.phone || '',
      avatarColor: tenant?.avatarColor || '#64748b',
    },
    roomCode: room?.code || null,
    roomFloor: room?.floor || null,
    photos: S.filter('complaintPhotos', (p) => p.complaintId === row.id)
      .sort((a, b) => a.id - b.id)
      .map((p) => ({
        id: p.id,
        url: p.filePath,
        originalName: p.originalName,
        uploadedAt: p.uploadedAt,
      })),
    updates: S.filter('complaintUpdates', (u) => u.complaintId === row.id)
      .sort((a, b) => a.id - b.id)
      .map((u) => {
        const author = u.authorId ? S.byId('users', u.authorId) : null;
        return {
          id: u.id,
          status: u.status,
          statusLabel: u.status ? complaintStatusLabel(u.status) : null,
          note: u.note,
          createdAt: u.createdAt,
          authorName: author?.name || 'Sistem',
          authorRole: author?.role || 'system',
        };
      }),
  };
}

const complaintCounts = (rows) => ({
  baru: rows.filter((c) => c.status === 'baru').length,
  diproses: rows.filter((c) => c.status === 'diproses').length,
  selesai: rows.filter((c) => c.status === 'selesai').length,
});

const addComplaintUpdate = (complaintId, authorId, status, note) =>
  S.insert('complaintUpdates', { complaintId, authorId, status, note, createdAt: nowSql() });

/* ========================================================================== */
/* TAGIHAN                                                                    */
/* ========================================================================== */

function shapeBill(row) {
  const tenant = S.byId('users', row.tenantId);
  const room = row.roomId ? S.byId('rooms', row.roomId) : null;
  const payments = S.filter('payments', (p) => p.billId === row.id).sort((a, b) => b.id - a.id);

  return {
    id: row.id,
    title: row.title,
    period: row.period,
    periodLabel: formatPeriode(row.period),
    amount: row.amount,
    amountLabel: formatRupiah(row.amount),
    dueDate: row.dueDate,
    dueDateLabel: formatTanggal(row.dueDate),
    daysToDue: daysUntil(row.dueDate),
    status: row.status,
    statusLabel: BILL_STATUS_META[row.status]?.label || row.status,
    statusTone: BILL_STATUS_META[row.status]?.tone || 'muted',
    note: row.note || '',
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    paidMethod: payments.find((p) => p.status === 'berhasil')?.methodLabel || null,
    lastPaymentStatus: payments[0]?.status || null,
    reminderCount: row.reminderCount || 0,
    lastReminderAt: row.lastReminderAt,
    tenant: {
      id: row.tenantId,
      name: tenant?.name || '—',
      phone: tenant?.phone || '',
      avatarColor: tenant?.avatarColor || '#64748b',
      roomCode: room?.code || null,
      roomFloor: room?.floor || null,
    },
  };
}

function shapeMyBill(row) {
  const days = daysUntil(row.dueDate);
  const payments = S.filter('payments', (p) => p.billId === row.id).sort((a, b) => b.id - a.id);
  return {
    id: row.id,
    title: row.title,
    period: row.period,
    periodLabel: formatPeriode(row.period),
    amount: row.amount,
    amountLabel: formatRupiah(row.amount),
    dueDate: row.dueDate,
    dueDateLabel: formatTanggal(row.dueDate),
    daysToDue: days,
    isOverdue: row.status !== 'lunas' && days !== null && days < 0,
    status: row.status,
    statusLabel: BILL_STATUS_META[row.status]?.label || row.status,
    statusTone: BILL_STATUS_META[row.status]?.tone || 'muted',
    note: row.note || '',
    paidAt: row.paidAt,
    paidMethod: payments.find((p) => p.status === 'berhasil')?.methodLabel || null,
    createdAt: row.createdAt,
    payable: row.status !== 'lunas',
    pendingReference: payments.find((p) => p.status === 'pending')?.reference || null,
  };
}

const shapePayment = (p) => ({
  id: p.id,
  reference: p.reference,
  billId: p.billId,
  method: p.method,
  methodLabel: p.methodLabel,
  type: PAYMENT_METHODS.find((m) => m.code === p.method)?.type || 'manual',
  amount: p.amount,
  fee: p.fee,
  total: p.total,
  amountLabel: formatRupiah(p.amount),
  feeLabel: formatRupiah(p.fee),
  totalLabel: formatRupiah(p.total),
  status: p.status,
  statusLabel: PAYMENT_STATUS_META[p.status]?.label || p.status,
  statusTone: PAYMENT_STATUS_META[p.status]?.tone || 'muted',
  qrImage: p.qrImage || null,
  qrPayload: p.qrPayload || null,
  vaNumber: p.vaNumber || null,
  instructions: p.instructions || '',
  failureReason: p.failureReason || null,
  expiresAt: p.expiresAt,
  createdAt: p.createdAt,
  settledAt: p.settledAt,
  // Versi statis selalu mode simulasi, jadi hasil transaksi bisa dipilih di UI.
  canSimulate: p.status === 'pending',
});

/* ========================================================================== */
/* Tabel rute                                                                 */
/* ========================================================================== */

/** role: 'public' | 'any' | 'owner' | 'tenant' */
const routes = [];
const add = (spec, handler, role = 'any') => {
  const [method, pattern] = spec.split(' ');
  routes.push({ method, parts: pattern.split('/').filter(Boolean), handler, role });
};

function matchRoute(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const route of routes) {
    if (route.method !== method || route.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i += 1) {
      const tpl = route.parts[i];
      if (tpl.startsWith(':')) params[tpl.slice(1)] = decodeURIComponent(parts[i]);
      else if (tpl !== parts[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* AUTENTIKASI                                                                */
/* -------------------------------------------------------------------------- */

add('GET /api/auth/meta', () => ({
  kost: { name: config.kost.name, address: config.kost.address },
  roles: [
    { code: 'owner', label: 'Pemilik Kos', description: 'Kelola penyewa, tagihan, komplain & pengumuman' },
    { code: 'tenant', label: 'Penyewa', description: 'Bayar tagihan, lapor kerusakan & lihat pengumuman' },
  ],
}), 'public');

add('POST /api/auth/login', ({ body }) => {
  requireFields(body, ['email', 'password', 'role']);
  const email = str(body.email, 160).toLowerCase();
  const password = String(body.password);
  const role = str(body.role, 20);

  if (!['owner', 'tenant'].includes(role)) {
    fail(400, 'Peran harus "owner" (pemilik) atau "tenant" (penyewa).');
  }

  const user = S.find('users', (u) => String(u.email).toLowerCase() === email);

  // Pesan error sengaja seragam agar tidak membocorkan email terdaftar.
  if (!user || user.password !== password) fail(401, 'Email atau password salah.');
  if (user.role !== role) {
    const label = user.role === 'owner' ? 'Pemilik Kos' : 'Penyewa';
    fail(403, `Akun ini terdaftar sebagai ${label}. Silakan pilih peran yang sesuai.`);
  }
  if (user.status !== 'aktif') fail(403, 'Akun Anda sudah tidak aktif. Silakan hubungi pemilik kos.');

  S.setSession(user.id, config.sessionTtlDays);

  return {
    user: publicUser(user),
    redirect: user.role === 'owner' ? '/app.html#/owner/beranda' : '/app.html#/penyewa/beranda',
  };
}, 'public');

add('GET /api/auth/me', () => {
  const user = S.currentUser();
  if (!user) fail(401, 'Belum login.');
  return { user: publicUser(user) };
}, 'public');

add('POST /api/auth/logout', () => {
  S.clearSession();
  return { ok: true };
}, 'public');

add('PUT /api/auth/password', ({ user, body }) => {
  requireFields(body, ['currentPassword', 'newPassword']);
  if (user.password !== String(body.currentPassword)) fail(400, 'Password lama tidak sesuai.');
  if (String(body.newPassword).length < 6) fail(400, 'Password baru minimal 6 karakter.');

  S.update('users', user.id, { password: String(body.newPassword), updatedAt: nowSql() });
  return { ok: true, message: 'Password berhasil diperbarui.' };
});

add('PUT /api/auth/profile', ({ user, body }) => {
  const name = str(body.name, 100) || user.name;
  const email = (str(body.email, 160) || user.email).toLowerCase();
  if (!isEmail(email)) fail(400, 'Format email tidak valid.');
  if (S.find('users', (u) => String(u.email).toLowerCase() === email && u.id !== user.id)) {
    fail(409, 'Email tersebut sudah dipakai akun lain.');
  }

  S.update('users', user.id, {
    name,
    email,
    phone: str(body.phone, 30),
    occupation: str(body.occupation, 100),
    emergencyContact: str(body.emergencyContact, 100),
    updatedAt: nowSql(),
  });

  return { user: publicUser(S.byId('users', user.id)), message: 'Profil berhasil diperbarui.' };
});

/* -------------------------------------------------------------------------- */
/* OWNER — DAFTAR PENYEWA                                                     */
/* -------------------------------------------------------------------------- */

add('GET /api/owner/tenants', ({ query }) => {
  const status = str(query.status, 20) || 'aktif'; // aktif | nonaktif | semua
  const floor = int(query.floor, 0);
  const search = str(query.search, 60).toLowerCase();

  let rows = S.filter('users', (u) => u.role === 'tenant');
  if (status !== 'semua') rows = rows.filter((u) => u.status === status);
  if (floor) rows = rows.filter((u) => roomOf(u)?.floor === floor);
  if (search) {
    rows = rows.filter((u) => {
      const haystack = [u.name, u.email, u.phone, roomOf(u)?.code].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }

  const allTenants = S.filter('users', (u) => u.role === 'tenant');
  const perFloor = config.building.floors.map((f) => ({
    floor: f,
    total: tenantsActive().filter((u) => roomOf(u)?.floor === f).length,
  }));

  return {
    tenants: rows.sort(tenantOrder).map(shapeTenant),
    summary: {
      aktif: allTenants.filter((u) => u.status === 'aktif').length,
      nonaktif: allTenants.filter((u) => u.status === 'nonaktif').length,
      totalRooms: S.db().rooms.length,
      perFloor,
    },
  };
}, 'owner');

add('GET /api/owner/tenants/:id', ({ params }) => {
  const user = S.find('users', (u) => u.id === int(params.id) && u.role === 'tenant');
  if (!user) fail(404, 'Penyewa tidak ditemukan.');

  return {
    tenant: shapeTenant(user),
    // Bentuk mentah (snake_case) dipertahankan agar sama dengan versi server.
    bills: S.filter('bills', (b) => b.tenantId === user.id)
      .sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)))
      .slice(0, 12)
      .map((b) => ({
        id: b.id, title: b.title, period: b.period, amount: b.amount,
        due_date: b.dueDate, status: b.status, paid_at: b.paidAt, note: b.note || '',
      })),
    complaints: S.filter('complaints', (c) => c.tenantId === user.id)
      .sort((a, b) => b.id - a.id)
      .slice(0, 10)
      .map((c) => ({ id: c.id, title: c.title, status: c.status, created_at: c.createdAt })),
  };
}, 'owner');

add('POST /api/owner/tenants', ({ body }) => {
  requireFields(body, ['name', 'email', 'password', 'roomId']);
  const name = str(body.name, 100);
  const email = str(body.email, 160).toLowerCase();
  const password = String(body.password);
  const roomId = int(body.roomId);

  if (!isEmail(email)) fail(400, 'Format email tidak valid.');
  if (password.length < 6) fail(400, 'Password minimal 6 karakter.');
  if (S.find('users', (u) => String(u.email).toLowerCase() === email)) {
    fail(409, 'Email tersebut sudah terdaftar.');
  }

  const room = S.byId('rooms', roomId);
  if (!room) fail(404, 'Kamar tidak ditemukan.');

  const occupant = occupantOf(roomId);
  if (occupant) fail(409, `Kamar ${room.code} masih dihuni oleh ${occupant.name}.`);

  const created = S.insert('users', {
    name,
    email,
    phone: str(body.phone, 30),
    password,
    role: 'tenant',
    roomId,
    status: 'aktif',
    occupation: str(body.occupation, 100),
    emergencyContact: str(body.emergencyContact, 100),
    checkInDate: str(body.checkInDate, 10) || todaySql(),
    checkOutDate: null,
    avatarColor: str(body.avatarColor, 20) || '#2563eb',
    createdAt: nowSql(),
  });

  notify({
    userId: created.id,
    title: `Selamat datang di ${config.kost.name}!`,
    body: `Akun Anda untuk kamar ${room.code} sudah aktif. Silakan lengkapi profil dan cek tagihan Anda.`,
    type: 'info',
    link: '#/penyewa/beranda',
  });

  return {
    tenant: shapeTenant(created),
    message: `Penyewa ${name} berhasil ditambahkan ke kamar ${room.code}.`,
  };
}, 'owner');

add('PUT /api/owner/tenants/:id', ({ params, body }) => {
  const id = int(params.id);
  const current = S.find('users', (u) => u.id === id && u.role === 'tenant');
  if (!current) fail(404, 'Penyewa tidak ditemukan.');

  const name = str(body.name, 100) || current.name;
  const email = (str(body.email, 160) || current.email).toLowerCase();
  if (!isEmail(email)) fail(400, 'Format email tidak valid.');
  if (S.find('users', (u) => String(u.email).toLowerCase() === email && u.id !== id)) {
    fail(409, 'Email tersebut sudah dipakai akun lain.');
  }

  const status = ['aktif', 'nonaktif'].includes(body.status) ? body.status : current.status;

  let roomId = current.roomId;
  if (body.roomId !== undefined) {
    roomId = body.roomId === null || body.roomId === '' ? null : int(body.roomId);
    if (roomId) {
      const room = S.byId('rooms', roomId);
      if (!room) fail(404, 'Kamar tidak ditemukan.');
      const occupant = occupantOf(roomId, id);
      if (occupant) fail(409, `Kamar ${room.code} masih dihuni oleh ${occupant.name}.`);
    }
  }

  const patch = {
    name,
    email,
    phone: body.phone !== undefined ? str(body.phone, 30) : current.phone,
    roomId,
    status,
    occupation: body.occupation !== undefined ? str(body.occupation, 100) : current.occupation,
    emergencyContact: body.emergencyContact !== undefined
      ? str(body.emergencyContact, 100) : current.emergencyContact,
    checkInDate: body.checkInDate !== undefined ? str(body.checkInDate, 10) : current.checkInDate,
    checkOutDate: status === 'nonaktif'
      ? (str(body.checkOutDate, 10) || current.checkOutDate || todaySql())
      : null,
    avatarColor: str(body.avatarColor, 20) || current.avatarColor,
    updatedAt: nowSql(),
  };

  // Beri tahu penyewa bila ada perubahan data penting.
  const changes = [];
  if (name !== current.name) changes.push(`nama menjadi "${name}"`);
  if (roomId !== current.roomId) {
    const newRoom = roomId ? S.byId('rooms', roomId) : null;
    changes.push(newRoom ? `kamar menjadi ${newRoom.code}` : 'kamar dikosongkan');
  }

  // Penyewa nonaktif tidak boleh punya sesi aktif.
  if (status === 'nonaktif' && S.db().session?.userId === id) S.clearSession();

  const fresh = S.update('users', id, patch);

  if (changes.length && status === 'aktif') {
    notify({
      userId: id,
      title: 'Data penghunian diperbarui',
      body: `Pemilik kos memperbarui ${changes.join(' dan ')}.`,
      type: 'info',
      link: '#/profil',
    });
  }

  return { tenant: shapeTenant(fresh), message: `Data ${name} berhasil disimpan.` };
}, 'owner');

add('PUT /api/owner/tenants/:id/password', ({ params, body }) => {
  requireFields(body, ['newPassword']);
  const id = int(params.id);
  const tenant = S.find('users', (u) => u.id === id && u.role === 'tenant');
  if (!tenant) fail(404, 'Penyewa tidak ditemukan.');
  if (String(body.newPassword).length < 6) fail(400, 'Password minimal 6 karakter.');

  S.update('users', id, { password: String(body.newPassword), updatedAt: nowSql() });
  if (S.db().session?.userId === id) S.clearSession();

  notify({
    userId: id,
    title: 'Password direset',
    body: 'Pemilik kos mereset password akun Anda. Silakan login dengan password baru.',
    type: 'warning',
  });

  return { ok: true, message: `Password ${tenant.name} berhasil direset.` };
}, 'owner');

add('DELETE /api/owner/tenants/:id', ({ params }) => {
  const id = int(params.id);
  const tenant = S.find('users', (u) => u.id === id && u.role === 'tenant');
  if (!tenant) fail(404, 'Penyewa tidak ditemukan.');

  S.update('users', id, {
    status: 'nonaktif',
    roomId: null,
    checkOutDate: todaySql(),
    updatedAt: nowSql(),
  });
  if (S.db().session?.userId === id) S.clearSession();

  return { ok: true, message: `${tenant.name} ditandai sudah tidak menghuni.` };
}, 'owner');

/* -------------------------------------------------------------------------- */
/* OWNER — KAMAR                                                              */
/* -------------------------------------------------------------------------- */

add('GET /api/owner/rooms', () => ({
  rooms: [...S.db().rooms].sort(by('floor', 'number')).map((r) => {
    const tenant = occupantOf(r.id);
    return {
      id: r.id,
      code: r.code,
      floor: r.floor,
      number: r.number,
      price: r.price,
      size: r.size || '',
      notes: r.notes || '',
      occupied: Boolean(tenant),
      tenant: tenant
        ? {
          id: tenant.id,
          name: tenant.name,
          avatarColor: tenant.avatarColor,
          checkInDate: tenant.checkInDate,
        }
        : null,
    };
  }),
  limits: { floors: config.building.floors, maxRoomsPerFloor: config.building.maxRoomsPerFloor },
}), 'owner');

add('POST /api/owner/rooms', ({ body }) => {
  requireFields(body, ['floor', 'number']);
  const floor = int(body.floor);
  const number = int(body.number);
  const code = buildRoomCode(floor, number); // validasi lantai & rentang 1-30

  if (S.find('rooms', (r) => r.code === code)) fail(409, `Kamar ${code} sudah ada.`);

  const room = S.insert('rooms', {
    floor,
    number,
    code,
    price: int(body.price, 0),
    size: str(body.size, 40),
    notes: str(body.notes, 300),
    createdAt: nowSql(),
  });

  return { room, message: `Kamar ${code} berhasil ditambahkan.` };
}, 'owner');

add('PUT /api/owner/rooms/:id', ({ params, body }) => {
  const id = int(params.id);
  const room = S.byId('rooms', id);
  if (!room) fail(404, 'Kamar tidak ditemukan.');

  const fresh = S.update('rooms', id, {
    price: body.price !== undefined ? int(body.price, room.price) : room.price,
    size: body.size !== undefined ? str(body.size, 40) : room.size,
    notes: body.notes !== undefined ? str(body.notes, 300) : room.notes,
  });

  return { room: fresh, message: `Kamar ${room.code} diperbarui.` };
}, 'owner');

add('DELETE /api/owner/rooms/:id', ({ params }) => {
  const id = int(params.id);
  const room = S.byId('rooms', id);
  if (!room) fail(404, 'Kamar tidak ditemukan.');

  const occupant = S.find('users', (u) => u.roomId === id && u.status === 'aktif');
  if (occupant) {
    fail(409, `Kamar ${room.code} masih dihuni ${occupant.name}. Pindahkan penyewa terlebih dahulu.`);
  }

  S.remove('rooms', (r) => r.id === id);
  return { ok: true, message: `Kamar ${room.code} dihapus.` };
}, 'owner');

/* -------------------------------------------------------------------------- */
/* OWNER — DENAH & FASILITAS                                                  */
/* -------------------------------------------------------------------------- */

add('GET /api/owner/floorplans', () => ({
  floorplans: buildFloorplans(),
  limits: { floors: config.building.floors, maxRoomsPerFloor: config.building.maxRoomsPerFloor },
}), 'owner');

add('PUT /api/owner/floorplans/:floor', ({ params, body, files }) => {
  const floor = int(params.floor);
  if (!config.building.floors.includes(floor)) {
    fail(400, `Lantai tidak valid. Pilih ${config.building.floors.join(', ')}.`);
  }

  const existing = S.find('floorplans', (f) => f.floor === floor);
  const title = str(body.title, 120) || existing?.title || `Lantai ${floor}`;
  const description = body.description !== undefined
    ? str(body.description, 3000)
    : existing?.description || '';

  const upload = files.image?.[0] || null;
  let imagePath = existing?.imagePath || null;
  if (upload) imagePath = upload.dataUrl;
  else if (bool(body.removeImage)) imagePath = null;

  if (existing) {
    S.update('floorplans', existing.id, { title, description, imagePath, updatedAt: nowSql() });
  } else {
    S.insert('floorplans', { floor, title, description, imagePath, updatedAt: nowSql() });
  }

  return { floorplans: buildFloorplans(), message: `Denah lantai ${floor} berhasil disimpan.` };
}, 'owner');

add('GET /api/owner/facilities', () => ({
  facilities: listFacilities(),
  categories: FACILITY_CATEGORIES,
}), 'owner');

add('POST /api/owner/facilities', ({ body, files }) => {
  requireFields(body, ['name']);
  const maxOrder = S.db().facilities.reduce((m, f) => Math.max(m, f.sortOrder || 0), 0);

  const row = S.insert('facilities', {
    name: str(body.name, 100),
    description: str(body.description, 1000),
    category: str(body.category, 40) || 'umum',
    icon: str(body.icon, 10) || '🏠',
    location: str(body.location, 120),
    photoPath: files.photo?.[0]?.dataUrl || null,
    isPublished: body.isPublished === undefined ? 1 : (bool(body.isPublished) ? 1 : 0),
    sortOrder: maxOrder + 1,
    updatedAt: nowSql(),
  });

  return { facility: shapeFacility(row), message: 'Fasilitas berhasil ditambahkan.' };
}, 'owner');

add('PUT /api/owner/facilities/:id', ({ params, body, files }) => {
  const id = int(params.id);
  const current = S.byId('facilities', id);
  if (!current) fail(404, 'Fasilitas tidak ditemukan.');

  const upload = files.photo?.[0] || null;
  let photoPath = current.photoPath;
  if (upload) photoPath = upload.dataUrl;
  else if (bool(body.removePhoto)) photoPath = null;

  const row = S.update('facilities', id, {
    name: str(body.name, 100) || current.name,
    description: body.description !== undefined ? str(body.description, 1000) : current.description,
    category: str(body.category, 40) || current.category,
    icon: str(body.icon, 10) || current.icon,
    location: body.location !== undefined ? str(body.location, 120) : current.location,
    photoPath,
    isPublished: body.isPublished === undefined ? current.isPublished : (bool(body.isPublished) ? 1 : 0),
    updatedAt: nowSql(),
  });

  return { facility: shapeFacility(row), message: 'Fasilitas berhasil diperbarui.' };
}, 'owner');

add('DELETE /api/owner/facilities/:id', ({ params }) => {
  const id = int(params.id);
  const current = S.byId('facilities', id);
  if (!current) fail(404, 'Fasilitas tidak ditemukan.');
  S.remove('facilities', (f) => f.id === id);
  return { ok: true, message: `Fasilitas "${current.name}" dihapus.` };
}, 'owner');

add('PUT /api/owner/facilities-order', ({ body }) => {
  const order = Array.isArray(body.order) ? body.order.map((v) => int(v)) : [];
  if (!order.length) fail(400, 'Daftar urutan kosong.');

  order.forEach((id, idx) => {
    const row = S.byId('facilities', id);
    if (row) row.sortOrder = idx + 1;
  });
  S.save();

  return { facilities: listFacilities(), message: 'Urutan fasilitas disimpan.' };
}, 'owner');

add('POST /api/owner/facilities/publish', () => {
  const tenants = tenantsActive().map((t) => t.id);
  notifyMany(tenants, {
    title: 'Info denah & fasilitas diperbarui',
    body: 'Pemilik kos memperbarui denah dan daftar fasilitas. Lihat di menu Fasilitas.',
    type: 'info',
    link: '#/penyewa/fasilitas',
  });
  return {
    ok: true,
    notified: tenants.length,
    message: `${tenants.length} penyewa aktif diberi tahu.`,
  };
}, 'owner');

/* -------------------------------------------------------------------------- */
/* OWNER — TEMPAT UMUM SEKITAR KOS                                            */
/* -------------------------------------------------------------------------- */

add('GET /api/owner/places', () => ({
  places: listPlaces(),
  categories: PLACE_CATEGORIES,
}), 'owner');

add('POST /api/owner/places', ({ body }) => {
  requireFields(body, ['name', 'category']);
  const row = S.insert('places', {
    name: str(body.name, 120),
    category: str(body.category, 40),
    address: str(body.address, 240),
    distanceM: body.distanceM ? int(body.distanceM) : null,
    lat: body.lat ? Number(body.lat) : null,
    lng: body.lng ? Number(body.lng) : null,
    mapsQuery: str(body.mapsQuery, 240) || null,
    isActive: bool(body.isActive ?? true) ? 1 : 0,
  });
  return { place: shapePlace(row), message: 'Tempat sekitar berhasil ditambahkan.' };
}, 'owner');

add('PUT /api/owner/places/:id', ({ params, body }) => {
  const id = int(params.id);
  const current = S.byId('places', id);
  if (!current) fail(404, 'Tempat tidak ditemukan.');

  const row = S.update('places', id, {
    name: str(body.name, 120) || current.name,
    category: str(body.category, 40) || current.category,
    address: body.address !== undefined ? str(body.address, 240) : current.address,
    distanceM: body.distanceM !== undefined
      ? (body.distanceM === '' ? null : int(body.distanceM))
      : current.distanceM,
    lat: body.lat !== undefined ? (body.lat === '' ? null : Number(body.lat)) : current.lat,
    lng: body.lng !== undefined ? (body.lng === '' ? null : Number(body.lng)) : current.lng,
    mapsQuery: body.mapsQuery !== undefined ? str(body.mapsQuery, 240) : current.mapsQuery,
    isActive: body.isActive === undefined ? current.isActive : (bool(body.isActive) ? 1 : 0),
  });

  return { place: shapePlace(row), message: 'Tempat sekitar diperbarui.' };
}, 'owner');

add('DELETE /api/owner/places/:id', ({ params }) => {
  const id = int(params.id);
  const current = S.byId('places', id);
  if (!current) fail(404, 'Tempat tidak ditemukan.');
  S.remove('places', (p) => p.id === id);
  return { ok: true, message: `"${current.name}" dihapus.` };
}, 'owner');

/* -------------------------------------------------------------------------- */
/* OWNER — PENGUMUMAN                                                         */
/* -------------------------------------------------------------------------- */

const readCountOf = (annId) =>
  S.filter('announcementReads', (r) => r.announcementId === annId).length;

/** Jumlah penerima untuk setiap target, dihitung sekali lalu dipakai ulang. */
const recipientCounts = () =>
  Object.fromEntries(ANNOUNCEMENT_TARGETS.map((t) => [t.code, recipientsFor(t.code).length]));

const annOrder = (a, b) => {
  if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
  const ka = a.publishedAt || a.scheduledAt || a.createdAt || '';
  const kb = b.publishedAt || b.scheduledAt || b.createdAt || '';
  return String(kb).localeCompare(String(ka));
};

add('GET /api/owner/announcements', ({ query }) => {
  const status = str(query.status, 20); // terjadwal | terbit | arsip
  const all = S.db().announcements;
  const rows = (status ? all.filter((a) => a.status === status) : [...all]).sort(annOrder);
  const perTarget = recipientCounts();

  return {
    announcements: rows.map((row) =>
      shapeAnnouncement(row, {
        readCount: readCountOf(row.id),
        recipientCount: perTarget[row.target] ?? 0,
      })
    ),
    targets: ANNOUNCEMENT_TARGETS.map((t) => ({ ...t, recipientCount: perTarget[t.code] ?? 0 })),
    categories: ANNOUNCEMENT_CATEGORIES,
    summary: {
      terbit: all.filter((a) => a.status === 'terbit').length,
      terjadwal: all.filter((a) => a.status === 'terjadwal').length,
      arsip: all.filter((a) => a.status === 'arsip').length,
    },
  };
}, 'owner');

add('POST /api/owner/announcements', ({ user, body }) => {
  requireFields(body, ['title', 'body', 'target']);

  const title = str(body.title, 160);
  const text = str(body.body, 5000);
  const target = str(body.target, 20);
  if (!ANNOUNCEMENT_TARGETS.some((t) => t.code === target)) {
    fail(400, `Target pengumuman tidak valid. Pilihan: ${ANNOUNCEMENT_TARGETS.map((t) => t.code).join(', ')}.`);
  }

  // Jadwal: kosong = terbitkan sekarang.
  let scheduledAt = null;
  let status = 'terbit';
  if (str(body.scheduledAt, 40)) {
    scheduledAt = toSqlDateTime(body.scheduledAt);
    if (!scheduledAt) fail(400, 'Format tanggal jadwal tidak valid.');
    if (scheduledAt > nowSql()) status = 'terjadwal';
    else scheduledAt = null; // jadwal di masa lalu -> langsung terbitkan
  }

  const recipients = recipientsFor(target);
  if (!recipients.length) fail(400, `Tidak ada penyewa aktif pada target "${targetLabel(target)}".`);

  const created = S.insert('announcements', {
    title,
    body: text,
    target,
    category: str(body.category, 40) || 'informasi',
    status,
    isPinned: bool(body.isPinned) ? 1 : 0,
    sendWhatsapp: bool(body.sendWhatsapp) ? 1 : 0,
    scheduledAt,
    publishedAt: null,
    createdBy: user.id,
    createdAt: nowSql(),
    updatedAt: nowSql(),
  });

  const delivery = status === 'terbit' ? publishAnnouncement(created.id) : null;
  const fresh = S.byId('announcements', created.id);

  return {
    announcement: shapeAnnouncement(fresh, {
      readCount: 0,
      recipientCount: recipients.length,
    }),
    delivery,
    message: status === 'terjadwal'
      ? `Pengumuman dijadwalkan dan akan otomatis terbit untuk ${recipients.length} penyewa (${targetLabel(target)}).`
      : `Pengumuman terbit ke ${recipients.length} penyewa (${targetLabel(target)}).`,
  };
}, 'owner');

add('PUT /api/owner/announcements/:id', ({ params, body }) => {
  const id = int(params.id);
  const current = S.byId('announcements', id);
  if (!current) fail(404, 'Pengumuman tidak ditemukan.');

  const target = str(body.target, 20) || current.target;
  if (!ANNOUNCEMENT_TARGETS.some((t) => t.code === target)) fail(400, 'Target pengumuman tidak valid.');

  let scheduledAt = current.scheduledAt;
  if (body.scheduledAt !== undefined) {
    if (!str(body.scheduledAt, 40)) {
      scheduledAt = null;
    } else {
      scheduledAt = toSqlDateTime(body.scheduledAt);
      if (!scheduledAt) fail(400, 'Format tanggal jadwal tidak valid.');
    }
  }

  const status = ['terjadwal', 'terbit', 'arsip'].includes(body.status) ? body.status : current.status;

  const row = S.update('announcements', id, {
    title: str(body.title, 160) || current.title,
    body: body.body !== undefined ? str(body.body, 5000) : current.body,
    target,
    category: str(body.category, 40) || current.category,
    status,
    isPinned: body.isPinned === undefined ? current.isPinned : (bool(body.isPinned) ? 1 : 0),
    sendWhatsapp: body.sendWhatsapp === undefined
      ? current.sendWhatsapp : (bool(body.sendWhatsapp) ? 1 : 0),
    scheduledAt,
    updatedAt: nowSql(),
  });

  return {
    announcement: shapeAnnouncement(row, {
      readCount: readCountOf(id),
      recipientCount: recipientsFor(target).length,
    }),
    message: 'Pengumuman berhasil diperbarui.',
  };
}, 'owner');

add('POST /api/owner/announcements/:id/publish', ({ params }) => {
  const id = int(params.id);
  const current = S.byId('announcements', id);
  if (!current) fail(404, 'Pengumuman tidak ditemukan.');
  if (current.status === 'terbit') fail(409, 'Pengumuman ini sudah terbit.');

  const delivery = publishAnnouncement(id);
  const row = S.byId('announcements', id);

  return {
    announcement: shapeAnnouncement(row, {
      readCount: readCountOf(id),
      recipientCount: delivery.recipients,
    }),
    delivery,
    message: `Pengumuman diterbitkan ke ${delivery.recipients} penyewa.`,
  };
}, 'owner');

add('GET /api/owner/announcements/:id/readers', ({ params }) => {
  const id = int(params.id);
  const ann = S.byId('announcements', id);
  if (!ann) fail(404, 'Pengumuman tidak ditemukan.');

  const reads = S.filter('announcementReads', (r) => r.announcementId === id)
    .sort((a, b) => String(b.readAt).localeCompare(String(a.readAt)));

  const readers = reads.map((r) => {
    const u = S.byId('users', r.userId);
    return { id: r.userId, name: u?.name || '—', roomCode: roomOf(u)?.code || null, readAt: r.readAt };
  });

  const readIds = new Set(readers.map((r) => r.id));
  const pending = recipientsFor(ann.target)
    .filter((r) => !readIds.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, roomCode: r.roomCode }));

  return { readers, pending };
}, 'owner');

add('DELETE /api/owner/announcements/:id', ({ params }) => {
  const id = int(params.id);
  const current = S.byId('announcements', id);
  if (!current) fail(404, 'Pengumuman tidak ditemukan.');

  S.remove('announcements', (a) => a.id === id);
  S.remove('announcementReads', (r) => r.announcementId === id);

  return { ok: true, message: `Pengumuman "${current.title}" dihapus.` };
}, 'owner');

/* -------------------------------------------------------------------------- */
/* OWNER — PUSAT KOMPLAIN                                                     */
/* -------------------------------------------------------------------------- */

const PRIORITY_RANK = { tinggi: 0, sedang: 1, rendah: 2 };
const STATUS_RANK = { baru: 0, diproses: 1, selesai: 2 };

add('GET /api/owner/complaints', ({ query }) => {
  const status = str(query.status, 20);
  const floor = int(query.floor, 0);
  const search = str(query.search, 60).toLowerCase();

  let rows = [...S.db().complaints];
  if (status && status !== 'semua') {
    if (!COMPLAINT_STATUSES.some((s) => s.code === status)) fail(400, 'Status komplain tidak valid.');
    rows = rows.filter((c) => c.status === status);
  }
  if (floor) rows = rows.filter((c) => S.byId('rooms', c.roomId)?.floor === floor);
  if (search) {
    rows = rows.filter((c) => {
      const tenant = S.byId('users', c.tenantId);
      const haystack = [c.title, c.description, tenant?.name, S.byId('rooms', c.roomId)?.code]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }

  rows.sort((a, b) =>
    (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
    (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) ||
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  const complaints = rows.map(shapeComplaint);
  const all = S.db().complaints;
  const counts = complaintCounts(all);

  return {
    complaints,
    board: {
      baru: complaints.filter((c) => c.status === 'baru'),
      diproses: complaints.filter((c) => c.status === 'diproses'),
      selesai: complaints.filter((c) => c.status === 'selesai'),
    },
    summary: { ...counts, total: all.length },
    statuses: COMPLAINT_STATUSES,
    categories: COMPLAINT_CATEGORIES,
  };
}, 'owner');

add('GET /api/owner/complaints/:id', ({ params }) => {
  const row = S.byId('complaints', int(params.id));
  if (!row) fail(404, 'Laporan tidak ditemukan.');
  return { complaint: shapeComplaint(row) };
}, 'owner');

add('PATCH /api/owner/complaints/:id/status', ({ user, params, body }) => {
  requireFields(body, ['status']);
  const id = int(params.id);
  const status = str(body.status, 20);
  const note = str(body.note, 1000);

  if (!COMPLAINT_STATUSES.some((s) => s.code === status)) {
    fail(400, 'Status harus salah satu dari: baru, diproses, selesai.');
  }

  const current = S.byId('complaints', id);
  if (!current) fail(404, 'Laporan tidak ditemukan.');

  const stamp = nowSql();
  S.update('complaints', id, {
    status,
    updatedAt: stamp,
    resolvedAt: status === 'selesai' ? stamp : null,
  });
  addComplaintUpdate(id, user.id, status, note || `Status diubah menjadi "${complaintStatusLabel(status)}".`);

  const tenant = S.byId('users', current.tenantId);
  notify({
    userId: current.tenantId,
    title: `Laporan #${id}: ${complaintStatusLabel(status)}`,
    body: note || `Laporan "${current.title}" sekarang berstatus ${complaintStatusLabel(status)}.`,
    type: status === 'selesai' ? 'success' : 'info',
    link: `#/penyewa/lapor?id=${id}`,
  });

  let wa = null;
  if (bool(body.sendWhatsapp) && tenant?.phone) {
    wa = sendWhatsApp({
      userId: current.tenantId,
      phone: tenant.phone,
      kind: 'komplain',
      message: templates.komplainUpdate({
        tenant: { name: tenant.name },
        complaint: current,
        statusLabel: complaintStatusLabel(status),
        note,
      }),
    });
  }

  return {
    complaint: shapeComplaint(S.byId('complaints', id)),
    whatsapp: wa,
    message: `Laporan #${id} diperbarui ke status "${complaintStatusLabel(status)}".`,
  };
}, 'owner');

add('POST /api/owner/complaints/:id/notes', ({ user, params, body }) => {
  requireFields(body, ['note']);
  const id = int(params.id);
  const current = S.byId('complaints', id);
  if (!current) fail(404, 'Laporan tidak ditemukan.');

  const note = str(body.note, 1000);
  addComplaintUpdate(id, user.id, null, note);
  S.update('complaints', id, { updatedAt: nowSql() });

  notify({
    userId: current.tenantId,
    title: `Catatan baru pada laporan #${id}`,
    body: note,
    type: 'info',
    link: `#/penyewa/lapor?id=${id}`,
  });

  return { complaint: shapeComplaint(S.byId('complaints', id)), message: 'Catatan ditambahkan.' };
}, 'owner');

/* -------------------------------------------------------------------------- */
/* OWNER — KEUANGAN                                                           */
/* -------------------------------------------------------------------------- */

const BILL_STATUS_RANK = { terlambat: 0, belum_bayar: 1, menunggu_pembayaran: 2, lunas: 3 };

add('GET /api/owner/finance', ({ query }) => {
  refreshOverdueBills();

  const status = str(query.status, 30);
  const floor = int(query.floor, 0);
  const period = str(query.period, 10);

  let rows = [...S.db().bills];
  if (status && status !== 'semua') rows = rows.filter((b) => b.status === status);
  if (floor) rows = rows.filter((b) => S.byId('rooms', b.roomId)?.floor === floor);
  if (period) rows = rows.filter((b) => b.period === period);

  rows.sort((a, b) =>
    (BILL_STATUS_RANK[a.status] - BILL_STATUS_RANK[b.status]) ||
    String(a.dueDate).localeCompare(String(b.dueDate))
  );

  const all = S.db().bills;
  const sum = (list) => list.reduce((s, b) => s + b.amount, 0);
  const lunas = all.filter((b) => b.status === 'lunas');
  const belum = all.filter((b) => ['belum_bayar', 'menunggu_pembayaran'].includes(b.status));
  const terlambat = all.filter((b) => b.status === 'terlambat');

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRows = all.filter((b) => b.period === thisMonth);

  return {
    bills: rows.map(shapeBill),
    summary: {
      totalLunas: sum(lunas),
      totalBelum: sum(belum),
      totalTerlambat: sum(terlambat),
      piutang: sum(belum) + sum(terlambat),
      jumlahTagihan: all.length,
      jumlahLunas: lunas.length,
      jumlahBelum: belum.length,
      jumlahTerlambat: terlambat.length,
      bulanIni: {
        period: thisMonth,
        periodLabel: formatPeriode(thisMonth),
        masuk: sum(monthRows.filter((b) => b.status === 'lunas')),
        tertunggak: sum(monthRows.filter((b) => b.status !== 'lunas')),
      },
    },
    periods: [...new Set(all.map((b) => b.period))]
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 12)
      .map((p) => ({ period: p, label: formatPeriode(p) })),
    statuses: Object.entries(BILL_STATUS_META).map(([code, m]) => ({ code, ...m })),
    whatsapp: waStatus(),
  };
}, 'owner');

add('POST /api/owner/bills', ({ user, body }) => {
  requireFields(body, ['title', 'period', 'dueDate', 'scope']);

  const title = str(body.title, 120);
  const period = str(body.period, 10);
  const dueDate = str(body.dueDate, 10);
  const note = str(body.note, 500);
  const scope = str(body.scope, 20);
  const useRoomPrice = bool(body.useRoomPrice);
  const amount = int(body.amount, 0);
  const sendWa = bool(body.sendWhatsapp);

  if (!/^\d{4}-\d{2}$/.test(period)) fail(400, 'Periode harus format YYYY-MM, contoh 2026-03.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) fail(400, 'Tanggal jatuh tempo harus format YYYY-MM-DD.');
  if (!useRoomPrice && amount <= 0) {
    fail(400, 'Nominal tagihan harus lebih dari 0, atau pilih "pakai harga kamar".');
  }

  // Tentukan daftar penyewa penerima tagihan.
  let targets;
  if (scope === 'pilih') {
    const ids = Array.isArray(body.tenantIds) ? body.tenantIds.map((v) => int(v)).filter(Boolean) : [];
    if (!ids.length) fail(400, 'Pilih minimal satu penyewa.');
    targets = tenantsActive().filter((u) => ids.includes(u.id));
  } else {
    if (!['semua', 'lantai_1', 'lantai_2', 'lantai_3'].includes(scope)) {
      fail(400, 'Lingkup penerima tidak valid.');
    }
    const ids = recipientsFor(scope).map((r) => r.id);
    targets = S.filter('users', (u) => ids.includes(u.id));
  }

  if (!targets.length) fail(400, 'Tidak ada penyewa aktif pada lingkup yang dipilih.');

  const created = [];
  const skipped = [];

  for (const t of targets) {
    const room = roomOf(t);
    const billAmount = useRoomPrice ? int(room?.price, 0) : amount;

    if (billAmount <= 0) {
      skipped.push({ tenant: t.name, reason: 'Harga kamar belum diisi' });
      continue;
    }
    if (S.find('bills', (b) => b.tenantId === t.id && b.period === period && b.title === title)) {
      skipped.push({
        tenant: t.name,
        reason: `Tagihan "${title}" periode ${formatPeriode(period)} sudah ada`,
      });
      continue;
    }

    S.insert('bills', {
      tenantId: t.id,
      roomId: t.roomId,
      title,
      period,
      amount: billAmount,
      dueDate,
      status: 'belum_bayar',
      note,
      createdBy: user.id,
      createdAt: nowSql(),
      paidAt: null,
      reminderCount: 0,
      lastReminderAt: null,
    });
    created.push({ tenant: t, room, amount: billAmount });
  }

  for (const item of created) {
    notify({
      userId: item.tenant.id,
      title: `Tagihan baru: ${title}`,
      body: `${formatRupiah(item.amount)} untuk periode ${formatPeriode(period)}. Jatuh tempo ${formatTanggal(dueDate)}.`,
      type: 'bill',
      link: '#/penyewa/tagihan',
    });
  }

  let whatsapp = { attempted: 0, sent: 0, failed: 0, simulated: 0, details: [] };
  if (sendWa && created.length) {
    const withPhone = created.filter((c) => c.tenant.phone);
    const results = withPhone.map((item) => {
      const result = sendWhatsApp({
        userId: item.tenant.id,
        phone: item.tenant.phone,
        kind: 'tagihan',
        message: templates.tagihanBaru({
          tenant: { name: item.tenant.name, roomCode: item.room?.code || null },
          bill: { title, period, amount: item.amount, dueDate },
        }),
      });
      return { tenant: item.tenant.name, ...result };
    });
    whatsapp = {
      attempted: results.length,
      sent: results.filter((r) => r.status === 'terkirim').length,
      simulated: results.filter((r) => r.status === 'simulasi').length,
      failed: results.filter((r) => r.status === 'gagal').length,
      noPhone: created.length - withPhone.length,
      details: results.map((r) => ({ tenant: r.tenant, status: r.status, reason: r.reason || null })),
    };
  }

  return {
    created: created.length,
    skipped,
    whatsapp,
    message:
      `${created.length} tagihan diterbitkan` +
      (skipped.length ? `, ${skipped.length} dilewati` : '') +
      (sendWa ? `, WhatsApp: ${whatsapp.sent + whatsapp.simulated}/${whatsapp.attempted} terkirim` : '') + '.',
  };
}, 'owner');

add('POST /api/owner/bills/reminders', ({ body }) => {
  refreshOverdueBills();
  const onlyOverdue = bool(body.onlyOverdue);
  const sendWa = bool(body.sendWhatsapp ?? true);

  const statuses = onlyOverdue ? ['terlambat'] : OPEN_BILL_STATUSES;
  const bills = S.filter('bills', (b) => statuses.includes(b.status))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  if (!bills.length) return { sent: 0, message: 'Tidak ada tagihan yang perlu diingatkan. 🎉' };

  const results = [];
  for (const bill of bills) {
    const tenant = S.byId('users', bill.tenantId);
    const room = roomOf(tenant);
    const dueInDays = daysUntil(bill.dueDate);

    notify({
      userId: bill.tenantId,
      title: `Pengingat: ${bill.title}`,
      body: `${formatRupiah(bill.amount)} periode ${formatPeriode(bill.period)} belum dibayar.`,
      type: 'bill',
      link: '#/penyewa/tagihan',
    });

    let wa = null;
    if (sendWa && tenant?.phone) {
      wa = sendWhatsApp({
        userId: bill.tenantId,
        phone: tenant.phone,
        kind: 'reminder',
        message: templates.reminderTagihan({
          tenant: { name: tenant.name, roomCode: room?.code || null },
          bill,
          dueInDays,
        }),
      });
    }

    bill.reminderCount = (bill.reminderCount || 0) + 1;
    bill.lastReminderAt = nowSql();

    results.push({
      billId: bill.id,
      tenant: tenant?.name || '—',
      roomCode: room?.code || null,
      whatsapp: wa?.status || 'tidak dikirim',
    });
  }
  S.save();

  return {
    sent: results.length,
    results,
    message: `Pengingat terkirim untuk ${results.length} tagihan.`,
  };
}, 'owner');

add('POST /api/owner/bills/:id/reminder', ({ params, body }) => {
  const id = int(params.id);
  const bill = S.byId('bills', id);
  if (!bill) fail(404, 'Tagihan tidak ditemukan.');
  if (bill.status === 'lunas') fail(409, 'Tagihan ini sudah lunas, tidak perlu pengingat.');

  const tenant = S.byId('users', bill.tenantId);
  const room = roomOf(tenant);
  const dueInDays = daysUntil(bill.dueDate);
  const customMessage = str(body.message, 1000);

  notify({
    userId: bill.tenantId,
    title: `Pengingat: ${bill.title}`,
    body: customMessage ||
      `${formatRupiah(bill.amount)} periode ${formatPeriode(bill.period)} belum dibayar. ` +
      (dueInDays < 0
        ? `Terlambat ${Math.abs(dueInDays)} hari.`
        : dueInDays === 0 ? 'Jatuh tempo hari ini.' : `Jatuh tempo dalam ${dueInDays} hari.`),
    type: 'bill',
    link: '#/penyewa/tagihan',
  });

  let whatsapp = null;
  if (bool(body.sendWhatsapp ?? true)) {
    whatsapp = sendWhatsApp({
      userId: bill.tenantId,
      phone: tenant?.phone,
      kind: 'reminder',
      message: customMessage
        ? `*${config.kost.name}*\n\n${customMessage}`
        : templates.reminderTagihan({
          tenant: { name: tenant?.name, roomCode: room?.code || null },
          bill,
          dueInDays,
        }),
    });
  }

  S.update('bills', id, {
    reminderCount: (bill.reminderCount || 0) + 1,
    lastReminderAt: nowSql(),
  });

  return {
    bill: shapeBill(S.byId('bills', id)),
    whatsapp,
    message: `Pengingat terkirim ke ${tenant?.name || 'penyewa'}` +
      (whatsapp ? ` (WhatsApp: ${whatsapp.status})` : ' (notifikasi web)') + '.',
  };
}, 'owner');

add('PUT /api/owner/bills/:id', ({ params, body }) => {
  const id = int(params.id);
  const current = S.byId('bills', id);
  if (!current) fail(404, 'Tagihan tidak ditemukan.');
  if (current.status === 'lunas') fail(409, 'Tagihan lunas tidak dapat diubah.');

  const amount = body.amount !== undefined ? int(body.amount, current.amount) : current.amount;
  if (amount <= 0) fail(400, 'Nominal tagihan harus lebih dari 0.');
  const dueDate = str(body.dueDate, 10) || current.dueDate;
  const title = str(body.title, 120) || current.title;

  S.update('bills', id, {
    title,
    amount,
    dueDate,
    note: body.note !== undefined ? str(body.note, 500) : current.note,
  });
  refreshOverdueBills();

  notify({
    userId: current.tenantId,
    title: 'Tagihan diperbarui',
    body: `${title} kini ${formatRupiah(amount)}, jatuh tempo ${formatTanggal(dueDate)}.`,
    type: 'bill',
    link: '#/penyewa/tagihan',
  });

  return { bill: shapeBill(S.byId('bills', id)), message: 'Tagihan diperbarui.' };
}, 'owner');

add('POST /api/owner/bills/:id/mark-paid', ({ params, body }) => {
  const id = int(params.id);
  const bill = S.byId('bills', id);
  if (!bill) fail(404, 'Tagihan tidak ditemukan.');
  if (bill.status === 'lunas') fail(409, 'Tagihan ini sudah lunas.');

  const methodLabel = str(body.methodLabel, 60) || 'Tunai / Transfer Manual';
  const stamp = nowSql();

  // Batalkan transaksi pending yang masih menggantung.
  const pendings = S.filter('payments', (row) => row.billId === id && row.status === 'pending');
  for (const pending of pendings) {
    pending.status = 'kedaluwarsa';
    pending.settledAt = stamp;
  }

  S.update('bills', id, { status: 'lunas', paidAt: stamp });
  S.insert('payments', {
    billId: id,
    tenantId: bill.tenantId,
    reference: `MAN-${id}-${Date.now().toString(36).toUpperCase()}`,
    method: 'manual',
    methodLabel,
    amount: bill.amount,
    fee: 0,
    total: bill.amount,
    status: 'berhasil',
    qrPayload: null,
    qrImage: null,
    vaNumber: null,
    instructions: '',
    failureReason: null,
    expiresAt: null,
    createdAt: stamp,
    settledAt: stamp,
  });

  notify({
    userId: bill.tenantId,
    title: 'Pembayaran tercatat ✅',
    body: `${bill.title} periode ${formatPeriode(bill.period)} sebesar ${formatRupiah(bill.amount)} sudah dilunasi (${methodLabel}).`,
    type: 'success',
    link: '#/penyewa/tagihan',
  });

  return { bill: shapeBill(S.byId('bills', id)), message: 'Tagihan ditandai lunas.' };
}, 'owner');

add('DELETE /api/owner/bills/:id', ({ params }) => {
  const id = int(params.id);
  const bill = S.byId('bills', id);
  if (!bill) fail(404, 'Tagihan tidak ditemukan.');
  if (bill.status === 'lunas') fail(409, 'Tagihan yang sudah lunas tidak dapat dihapus.');

  S.remove('bills', (b) => b.id === id);
  S.remove('payments', (p) => p.billId === id);

  return { ok: true, message: 'Tagihan dihapus.' };
}, 'owner');

add('GET /api/owner/payments', ({ query }) => ({
  payments: [...S.db().payments]
    .sort((a, b) => b.id - a.id)
    .slice(0, int(query.limit, 100))
    .map((p) => {
      const tenant = S.byId('users', p.tenantId);
      const bill = S.byId('bills', p.billId);
      return {
        id: p.id,
        reference: p.reference,
        tenantName: tenant?.name || '—',
        roomCode: roomOf(tenant)?.code || null,
        billTitle: bill?.title || '—',
        period: bill?.period || null,
        periodLabel: formatPeriode(bill?.period),
        method: p.method,
        methodLabel: p.methodLabel,
        amount: p.amount,
        fee: p.fee,
        total: p.total,
        totalLabel: formatRupiah(p.total),
        status: p.status,
        failureReason: p.failureReason,
        createdAt: p.createdAt,
        settledAt: p.settledAt,
      };
    }),
}), 'owner');

add('GET /api/owner/wa-logs', ({ query }) => ({
  logs: listWaLogs({ limit: int(query.limit, 50) }).map((l) => ({
    id: l.id,
    userName: l.userName,
    phone: l.phone,
    kind: l.kind,
    message: l.message,
    provider: l.provider,
    status: l.status,
    response: l.response,
    createdAt: l.createdAt,
  })),
  status: waStatus(),
}), 'owner');

/* -------------------------------------------------------------------------- */
/* OWNER — BERANDA                                                            */
/* -------------------------------------------------------------------------- */

add('GET /api/owner/dashboard', ({ user }) => {
  refreshOverdueBills();
  const thisMonth = new Date().toISOString().slice(0, 7);

  const tenants = tenantsActive().length;
  const rooms = S.db().rooms.length;
  const bills = S.db().bills;
  const sum = (list) => list.reduce((s, b) => s + b.amount, 0);

  const dueLimit = new Date();
  dueLimit.setDate(dueLimit.getDate() + 7);
  const dueLimitStr = dueLimit.toISOString().slice(0, 10);

  return {
    kost: config.kost,
    stats: {
      tenantsActive: tenants,
      rooms,
      occupancyRate: rooms ? Math.round((tenants / rooms) * 100) : 0,
      complaints: complaintCounts(S.db().complaints),
      finance: {
        masukBulanIni: sum(bills.filter((b) => b.status === 'lunas' && b.period === thisMonth)),
        piutang: sum(bills.filter((b) => OPEN_BILL_STATUSES.includes(b.status))),
        jumlahTerlambat: bills.filter((b) => b.status === 'terlambat').length,
      },
      unreadChats: unreadMessagesFor(user.id),
    },
    scheduledAnnouncements: S.filter('announcements', (a) => a.status === 'terjadwal')
      .sort(by('scheduledAt'))
      .slice(0, 5)
      .map((a) => ({ id: a.id, title: a.title, target: a.target, scheduled_at: a.scheduledAt })),
    recentComplaints: S.filter('complaints', (c) => c.status !== 'selesai')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        created_at: c.createdAt,
        tenant_name: S.byId('users', c.tenantId)?.name || '—',
        room_code: S.byId('rooms', c.roomId)?.code || null,
      })),
    dueSoon: S.filter('bills', (b) => b.status !== 'lunas' && b.dueDate <= dueLimitStr)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .slice(0, 8)
      .map(shapeBill),
    today: todaySql(),
  };
}, 'owner');

/* -------------------------------------------------------------------------- */
/* PENYEWA — TAGIHAN & PEMBAYARAN                                             */
/* -------------------------------------------------------------------------- */

const myBillsPayload = (user) => {
  const rows = S.filter('bills', (b) => b.tenantId === user.id)
    .sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)));

  const bills = rows.map(shapeMyBill);
  const unpaid = bills.filter((b) => b.status !== 'lunas');
  const overdue = unpaid.filter((b) => b.isOverdue);
  const upcoming = unpaid.filter((b) => !b.isOverdue);
  const totalUnpaid = unpaid.reduce((s, b) => s + b.amount, 0);
  const room = roomOf(user);

  return {
    bills,
    overdue,
    upcoming,
    paid: bills.filter((b) => b.status === 'lunas'),
    summary: {
      totalTagihan: totalUnpaid,
      totalTagihanLabel: formatRupiah(totalUnpaid),
      jumlahBelumBayar: unpaid.length,
      jumlahTerlambat: overdue.length,
      tagihanTerdekat: upcoming[upcoming.length - 1] || null,
      totalDibayar: bills.filter((b) => b.status === 'lunas').reduce((s, b) => s + b.amount, 0),
    },
    methods: PAYMENT_METHODS.map((m) => ({
      code: m.code,
      label: m.label,
      type: m.type,
      issuer: m.issuer,
      fee: m.fee,
      feeLabel: m.fee ? formatRupiah(m.fee) : 'Gratis',
    })),
    payments: S.filter('payments', (p) => p.tenantId === user.id)
      .sort((a, b) => b.id - a.id)
      .slice(0, 20)
      .map(shapePayment),
    room: room ? { code: room.code, floor: room.floor, price: room.price } : null,
  };
};

add('GET /api/tenant/bills', ({ user }) => {
  refreshOverdueBills();
  expireStalePayments();
  return myBillsPayload(user);
}, 'tenant');

add('POST /api/tenant/payments', async ({ user, body }) => {
  requireFields(body, ['billId', 'method']);
  const billId = int(body.billId);

  const bill = S.find('bills', (b) => b.id === billId && b.tenantId === user.id);
  if (!bill) fail(404, 'Tagihan tidak ditemukan.');
  if (bill.status === 'lunas') fail(409, 'Tagihan ini sudah lunas.');

  const payment = await createPayment({ bill, tenant: user, methodCode: str(body.method, 20) });

  return {
    payment: shapePayment(payment),
    bill: shapeMyBill(S.byId('bills', billId)),
    message: payment.vaNumber
      ? `Virtual Account dibuat: ${payment.vaNumber}. Selesaikan pembayaran sebelum batas waktu.`
      : 'Kode QRIS siap. Silakan scan untuk membayar.',
  };
}, 'tenant');

add('GET /api/tenant/payments/:reference', ({ user, params }) => {
  expireStalePayments();
  const payment = getPaymentByRef(str(params.reference, 40));
  if (!payment || payment.tenantId !== user.id) fail(404, 'Transaksi tidak ditemukan.');
  return {
    payment: shapePayment(payment),
    bill: shapeMyBill(S.byId('bills', payment.billId)),
  };
}, 'tenant');

add('POST /api/tenant/payments/:reference/simulate', ({ user, params, body }) => {
  const reference = str(params.reference, 40);
  const outcome = str(body.outcome, 20) || 'berhasil';

  const existing = getPaymentByRef(reference);
  if (!existing || existing.tenantId !== user.id) fail(404, 'Transaksi tidak ditemukan.');

  const payment = settlePayment(reference, outcome, str(body.reason, 200) || null);
  const result = handleSettlement(payment);

  return {
    payment: shapePayment(payment),
    bill: shapeMyBill(S.byId('bills', payment.billId)),
    ...result,
  };
}, 'tenant');

add('POST /api/tenant/payments/:reference/cancel', ({ user, params }) => {
  const reference = str(params.reference, 40);
  const payment = getPaymentByRef(reference);
  if (!payment || payment.tenantId !== user.id) fail(404, 'Transaksi tidak ditemukan.');
  if (payment.status !== 'pending') fail(409, 'Transaksi ini sudah selesai diproses.');

  payment.status = 'kedaluwarsa';
  payment.failureReason = 'Dibatalkan oleh penyewa';
  payment.settledAt = nowSql();

  const bill = S.byId('bills', payment.billId);
  if (bill && bill.status === 'menunggu_pembayaran') {
    bill.status = bill.dueDate < todaySql() ? 'terlambat' : 'belum_bayar';
  }
  S.save();

  return {
    payment: shapePayment(payment),
    bill: shapeMyBill(bill),
    message: 'Transaksi dibatalkan. Anda dapat memilih metode pembayaran lain.',
  };
}, 'tenant');

/* -------------------------------------------------------------------------- */
/* PENYEWA — LAPOR KERUSAKAN                                                  */
/* -------------------------------------------------------------------------- */

add('GET /api/tenant/complaints', ({ user }) => {
  const complaints = S.filter('complaints', (c) => c.tenantId === user.id)
    .sort((a, b) => b.id - a.id)
    .map(shapeComplaint);
  const room = roomOf(user);

  return {
    complaints,
    summary: { ...complaintCounts(complaints), total: complaints.length },
    categories: COMPLAINT_CATEGORIES,
    locations: COMPLAINT_LOCATIONS,
    statuses: COMPLAINT_STATUSES,
    room: room ? { code: room.code, floor: room.floor } : null,
    maxPhotos: config.maxImagesPerReport,
  };
}, 'tenant');

add('POST /api/tenant/complaints', ({ user, body, files }) => {
  requireFields(body, ['title', 'description']);

  const title = str(body.title, 160);
  const description = str(body.description, 3000);
  const photos = (files.photos || []).slice(0, config.maxImagesPerReport);
  const room = roomOf(user);

  const complaint = S.insert('complaints', {
    tenantId: user.id,
    roomId: user.roomId,
    title,
    description,
    category: str(body.category, 40) || 'lainnya',
    location: str(body.location, 40) || 'kamar',
    priority: ['rendah', 'sedang', 'tinggi'].includes(body.priority) ? body.priority : 'sedang',
    status: 'baru',
    createdAt: nowSql(),
    updatedAt: nowSql(),
    resolvedAt: null,
  });

  for (const photo of photos) {
    S.insert('complaintPhotos', {
      complaintId: complaint.id,
      filePath: photo.dataUrl,
      originalName: str(photo.name, 160),
      uploadedAt: nowSql(),
    });
  }

  addComplaintUpdate(
    complaint.id,
    user.id,
    'baru',
    `Laporan dibuat oleh penyewa${photos.length ? ` dengan ${photos.length} foto` : ''}.`
  );

  notifyOwners({
    title: `Laporan baru dari kamar ${room?.code || '-'}`,
    body: `${title} — ${excerpt(description, 120)}${photos.length ? ` (${photos.length} foto terlampir)` : ''}`,
    type: body.priority === 'tinggi' ? 'error' : 'warning',
    link: `#/owner/komplain?id=${complaint.id}`,
  });

  return {
    complaint: shapeComplaint(S.byId('complaints', complaint.id)),
    message: `Laporan terkirim ke pemilik kos${photos.length ? ` beserta ${photos.length} foto` : ''}. Status: Baru.`,
  };
}, 'tenant');

add('GET /api/tenant/complaints/:id', ({ user, params }) => {
  const row = S.find('complaints', (c) => c.id === int(params.id) && c.tenantId === user.id);
  if (!row) fail(404, 'Laporan tidak ditemukan.');
  return { complaint: shapeComplaint(row) };
}, 'tenant');

add('POST /api/tenant/complaints/:id/notes', ({ user, params, body }) => {
  requireFields(body, ['note']);
  const id = int(params.id);
  const complaint = S.find('complaints', (c) => c.id === id && c.tenantId === user.id);
  if (!complaint) fail(404, 'Laporan tidak ditemukan.');

  const note = str(body.note, 1000);
  addComplaintUpdate(id, user.id, null, note);
  S.update('complaints', id, { updatedAt: nowSql() });

  notifyOwners({
    title: `Keterangan tambahan pada laporan #${id}`,
    body: `${user.name} (kamar ${roomOf(user)?.code || '-'}): ${excerpt(note, 140)}`,
    type: 'info',
    link: `#/owner/komplain?id=${id}`,
  });

  return { complaint: shapeComplaint(S.byId('complaints', id)), message: 'Keterangan tambahan terkirim.' };
}, 'tenant');

add('POST /api/tenant/complaints/:id/photos', ({ user, params, files }) => {
  const id = int(params.id);
  const complaint = S.find('complaints', (c) => c.id === id && c.tenantId === user.id);
  if (!complaint) fail(404, 'Laporan tidak ditemukan.');

  const photos = (files.photos || []).slice(0, config.maxImagesPerReport);
  if (!photos.length) fail(400, 'Tidak ada gambar yang diunggah.');

  for (const photo of photos) {
    S.insert('complaintPhotos', {
      complaintId: id,
      filePath: photo.dataUrl,
      originalName: str(photo.name, 160),
      uploadedAt: nowSql(),
    });
  }
  S.update('complaints', id, { updatedAt: nowSql() });

  notifyOwners({
    title: `Foto baru pada laporan #${id}`,
    body: `${user.name} (kamar ${roomOf(user)?.code || '-'}) menambahkan ${photos.length} foto pada "${complaint.title}".`,
    type: 'info',
    link: `#/owner/komplain?id=${id}`,
  });

  return {
    complaint: shapeComplaint(S.byId('complaints', id)),
    message: `${photos.length} foto ditambahkan.`,
  };
}, 'tenant');

/* -------------------------------------------------------------------------- */
/* PENYEWA — PENGUMUMAN                                                       */
/* -------------------------------------------------------------------------- */

/** Pengumuman terbit yang menyasar lantai penyewa ini. */
const myAnnouncements = (user) => {
  const floor = roomOf(user)?.floor || null;
  return S.filter(
    'announcements',
    (a) => a.status === 'terbit' && (a.target === 'semua' || (floor && a.target === `lantai_${floor}`))
  ).sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
    return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
  });
};

const isReadBy = (annId, userId) =>
  Boolean(S.find('announcementReads', (r) => r.announcementId === annId && r.userId === userId));

add('GET /api/tenant/announcements', ({ user }) => {
  const announcements = myAnnouncements(user).map((row) =>
    shapeAnnouncement(row, { isRead: isReadBy(row.id, user.id) })
  );
  const unread = announcements.filter((a) => !a.isRead);

  return {
    announcements,
    unread,
    // Pengumuman terbaru yang belum dibaca -> dipakai untuk pop-up notifikasi.
    latestUnread: unread[0] || null,
    summary: { total: announcements.length, belumDibaca: unread.length },
  };
}, 'tenant');

add('POST /api/tenant/announcements/:id/read', ({ user, params }) => {
  const id = int(params.id);
  const ann = S.find('announcements', (a) => a.id === id && a.status === 'terbit');
  if (!ann) fail(404, 'Pengumuman tidak ditemukan.');
  if (!isRecipient(user, ann.target)) fail(403, 'Pengumuman ini bukan untuk lantai Anda.');

  if (!isReadBy(id, user.id)) {
    S.db().announcementReads.push({ announcementId: id, userId: user.id, readAt: nowSql() });
    S.save();
  }

  return { ok: true };
}, 'tenant');

add('POST /api/tenant/announcements/read-all', ({ user }) => {
  const rows = myAnnouncements(user);
  let marked = 0;
  for (const a of rows) {
    if (!isReadBy(a.id, user.id)) {
      S.db().announcementReads.push({ announcementId: a.id, userId: user.id, readAt: nowSql() });
      marked += 1;
    }
  }
  if (marked) S.save();

  return { ok: true, marked: rows.length };
}, 'tenant');

/* -------------------------------------------------------------------------- */
/* PENYEWA — FASILITAS & TEMPAT SEKITAR                                       */
/* -------------------------------------------------------------------------- */

add('GET /api/tenant/facilities', ({ user }) => {
  const places = listPlaces({ onlyActive: true });
  const room = roomOf(user);

  // Kelompokkan tempat sekitar per kategori; tiap kategori juga punya tautan
  // pencarian Google Maps generik sebagai fallback.
  const nearby = PLACE_CATEGORIES.map((cat) => ({
    ...cat,
    searchUrl: nearbySearchUrl(cat.keyword),
    places: places.filter((p) => p.category === cat.code),
  }));

  // Kategori di luar daftar standar (bila owner menambah kategori sendiri).
  const extraCats = [...new Set(places.map((p) => p.category))]
    .filter((c) => !PLACE_CATEGORIES.some((pc) => pc.code === c));
  for (const code of extraCats) {
    const meta = categoryMeta(code);
    nearby.push({
      ...meta,
      searchUrl: nearbySearchUrl(meta.keyword),
      places: places.filter((p) => p.category === code),
    });
  }

  return {
    facilities: listFacilities({ onlyPublished: true }),
    // Penyewa melihat denah tanpa nama penghuni lain.
    floorplans: buildFloorplans({ includeTenantNames: false }),
    myFloor: room?.floor || null,
    myRoom: room?.code || null,
    nearby,
    kost: config.kost,
  };
}, 'tenant');

add('GET /api/tenant/places', ({ query }) => {
  const category = str(query.category, 40);
  const places = listPlaces({ onlyActive: true });
  return {
    places: category ? places.filter((p) => p.category === category) : places,
    categories: PLACE_CATEGORIES.map((c) => ({ ...c, searchUrl: nearbySearchUrl(c.keyword) })),
  };
}, 'tenant');

/* -------------------------------------------------------------------------- */
/* PENYEWA — BERANDA                                                          */
/* -------------------------------------------------------------------------- */

add('GET /api/tenant/dashboard', ({ user }) => {
  refreshOverdueBills();

  const myBills = S.filter('bills', (b) => b.tenantId === user.id);
  const openBills = myBills
    .filter((b) => b.status !== 'lunas')
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const nextBill = openBills[0] || null;
  const room = roomOf(user);

  const announcements = myAnnouncements(user)
    .slice(0, 5)
    .map((row) => shapeAnnouncement(row, { isRead: isReadBy(row.id, user.id) }));

  const myComplaints = S.filter('complaints', (c) => c.tenantId === user.id);
  const totalBelum = openBills.reduce((s, b) => s + b.amount, 0);

  return {
    kost: config.kost,
    room: room
      ? {
        code: room.code,
        floor: room.floor,
        number: room.number,
        price: room.price,
        priceLabel: formatRupiah(room.price),
      }
      : null,
    checkInDate: user.checkInDate,
    checkInLabel: formatTanggal(user.checkInDate),
    nextBill: nextBill
      ? {
        id: nextBill.id,
        title: nextBill.title,
        amount: nextBill.amount,
        amountLabel: formatRupiah(nextBill.amount),
        period: nextBill.period,
        periodLabel: formatPeriode(nextBill.period),
        dueDate: nextBill.dueDate,
        dueDateLabel: formatTanggal(nextBill.dueDate),
        daysToDue: daysUntil(nextBill.dueDate),
        status: nextBill.status,
        statusLabel: BILL_STATUS_META[nextBill.status]?.label || nextBill.status,
        statusTone: BILL_STATUS_META[nextBill.status]?.tone || 'muted',
      }
      : null,
    stats: {
      totalBelumBayar: totalBelum,
      totalBelumBayarLabel: formatRupiah(totalBelum),
      jumlahTerlambat: myBills.filter((b) => b.status === 'terlambat').length,
      jumlahLunas: myBills.filter((b) => b.status === 'lunas').length,
      complaints: complaintCounts(myComplaints),
      unreadChats: unreadMessagesFor(user.id),
      belumDibacaPengumuman: announcements.filter((a) => !a.isRead).length,
    },
    announcements,
    facilitiesCount: listFacilities({ onlyPublished: true }).length,
  };
}, 'tenant');

/* -------------------------------------------------------------------------- */
/* CHAT                                                                       */
/* -------------------------------------------------------------------------- */

/** Pastikan pasangan chat diizinkan (owner <-> penyewa saja). */
function assertPartner(user, partnerId) {
  const partner = S.byId('users', partnerId);
  if (!partner) fail(404, 'Pengguna tidak ditemukan.');
  if (partner.id === user.id) fail(400, 'Tidak bisa mengirim pesan ke diri sendiri.');
  if (user.role === partner.role) {
    fail(403, 'Percakapan hanya tersedia antara pemilik kos dan penyewa.');
  }
  if (user.role === 'tenant' && partner.role !== 'owner') {
    fail(403, 'Penyewa hanya dapat menghubungi pemilik kos.');
  }
  return partner;
}

const conversation = (a, b) =>
  S.filter('messages', (m) =>
    (m.senderId === a && m.receiverId === b) || (m.senderId === b && m.receiverId === a)
  ).sort((x, y) => x.id - y.id);

add('GET /api/chat/threads', ({ user }) => {
  if (user.role === 'owner') {
    const threads = S.filter('users', (u) => u.role === 'tenant').map((u) => {
      const msgs = conversation(u.id, user.id);
      const last = msgs[msgs.length - 1] || null;
      const room = roomOf(u);
      return {
        partnerId: u.id,
        name: u.name,
        roomCode: room?.code || null,
        roomFloor: room?.floor || null,
        status: u.status,
        avatarColor: u.avatarColor,
        lastMessage: last ? excerpt(last.body, 70) : null,
        lastAt: last?.createdAt || null,
        lastFromMe: last?.senderId === user.id,
        unread: msgs.filter((m) => m.senderId === u.id && !m.readAt).length,
        _floor: room?.floor ?? 99,
        _number: room?.number ?? 99,
      };
    });

    threads.sort((a, b) => {
      if (!a.lastAt !== !b.lastAt) return a.lastAt ? -1 : 1;
      if (a.lastAt && b.lastAt && a.lastAt !== b.lastAt) return b.lastAt.localeCompare(a.lastAt);
      return a._floor - b._floor || a._number - b._number;
    });

    return {
      threads: threads.map(({ _floor, _number, ...t }) => t),
      totalUnread: threads.reduce((s, t) => s + t.unread, 0),
    };
  }

  // Penyewa: satu percakapan dengan owner.
  const owner = primaryOwner();
  if (!owner) return { threads: [], totalUnread: 0 };

  const msgs = conversation(owner.id, user.id);
  const last = msgs[msgs.length - 1] || null;
  const unread = msgs.filter((m) => m.senderId === owner.id && !m.readAt).length;

  return {
    threads: [{
      partnerId: owner.id,
      name: owner.name,
      roomCode: null,
      roleLabel: 'Pemilik Kos',
      status: owner.status,
      avatarColor: owner.avatarColor,
      lastMessage: last ? excerpt(last.body, 70) : null,
      lastAt: last?.createdAt || null,
      lastFromMe: last?.senderId === user.id,
      unread,
    }],
    totalUnread: unread,
  };
});

add('GET /api/chat/messages/:partnerId', ({ user, params }) => {
  const partner = assertPartner(user, int(params.partnerId));
  const msgs = conversation(user.id, partner.id).slice(-500);

  // Tandai pesan masuk sebagai sudah dibaca.
  let changed = false;
  for (const m of msgs) {
    if (m.senderId === partner.id && !m.readAt) {
      m.readAt = nowSql();
      changed = true;
    }
  }
  if (changed) S.save();

  return {
    partner: {
      id: partner.id,
      name: partner.name,
      role: partner.role,
      roleLabel: partner.role === 'owner' ? 'Pemilik Kos' : 'Penyewa',
      roomCode: roomOf(partner)?.code || null,
      avatarColor: partner.avatarColor,
      phone: partner.phone || '',
    },
    messages: msgs.map((m) => ({
      id: m.id,
      body: m.body,
      fromMe: m.senderId === user.id,
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
  };
});

add('POST /api/chat/messages', ({ user, body }) => {
  requireFields(body, ['receiverId', 'body']);
  const partner = assertPartner(user, int(body.receiverId));
  const text = str(body.body, 2000);
  if (!text) fail(400, 'Pesan tidak boleh kosong.');

  const row = S.insert('messages', {
    senderId: user.id,
    receiverId: partner.id,
    body: text,
    createdAt: nowSql(),
    readAt: null,
  });

  const room = roomOf(user);
  const senderLabel = user.role === 'owner'
    ? 'Pemilik Kos'
    : `${user.name}${room ? ` (kamar ${room.code})` : ''}`;

  notify({
    userId: partner.id,
    title: `💬 Pesan dari ${senderLabel}`,
    body: excerpt(text, 140),
    type: 'chat',
    link: `#/chat?partner=${user.id}`,
  });

  return {
    message: { id: row.id, body: row.body, fromMe: true, createdAt: row.createdAt, readAt: null },
  };
});

add('GET /api/chat/unread', ({ user }) => ({ unread: unreadMessagesFor(user.id) }));

/* -------------------------------------------------------------------------- */
/* NOTIFIKASI                                                                 */
/* -------------------------------------------------------------------------- */

add('GET /api/notifications', ({ user, query }) => ({
  notifications: listNotifications(user.id, { limit: int(query.limit, 30) }),
  unread: unreadCount(user.id),
}));

add('GET /api/notifications/poll', ({ user, query }) => {
  const after = int(query.after, 0);
  const fresh = listNotifications(user.id, { limit: 10, afterId: after });
  const latestId = S.filter('notifications', (n) => n.userId === user.id)
    .reduce((max, n) => Math.max(max, n.id), 0);

  return {
    // Dikirim dari lama ke baru supaya urutan toast masuk akal.
    notifications: fresh.reverse(),
    latestId,
    unread: unreadCount(user.id),
    chatUnread: unreadMessagesFor(user.id),
  };
});

add('POST /api/notifications/read', ({ user, body }) => {
  const ids = Array.isArray(body.ids) ? body.ids.map((v) => int(v)).filter(Boolean) : [];
  const changed = ids.length ? markRead(user.id, ids) : markAllRead(user.id);
  return { ok: true, changed, unread: unreadCount(user.id) };
});

add('DELETE /api/notifications', ({ user }) => {
  const deleted = S.remove('notifications', (n) => n.userId === user.id && n.isRead);
  return { ok: true, deleted };
});

/* ========================================================================== */
/* Titik masuk                                                                */
/* ========================================================================== */

const MAX_UPLOAD_BYTES = 1_600_000;

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new ApiError(400, `Gagal membaca berkas "${file.name}".`));
    reader.readAsDataURL(file);
  });

/**
 * Ubah FormData menjadi { fields, files }.
 * Berkas disimpan sebagai data URL karena versi statis tidak punya tempat
 * penyimpanan selain localStorage.
 */
async function readFormData(form) {
  const fields = {};
  const files = {};

  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      fields[key] = value;
      continue;
    }
    // Input berkas yang kosong terkirim sebagai File berukuran 0.
    if (!value || !value.size) continue;
    if (!value.type.startsWith('image/')) {
      throw new ApiError(400, `Berkas "${value.name}" bukan gambar.`);
    }
    if (value.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(413, `Gambar "${value.name}" terlalu besar. Maksimal 1,5 MB setelah dikecilkan.`);
    }
    (files[key] ||= []).push({
      name: value.name,
      type: value.type,
      size: value.size,
      dataUrl: await readAsDataUrl(value),
    });
  }

  return { fields, files };
}

let ready = false;

/** Siapkan data demo pada pemanggilan pertama. */
function ensureReady() {
  if (ready) return;
  if (S.isEmpty()) seedDemoData();
  ready = true;
}

/**
 * Jalankan satu "permintaan" terhadap data di peramban.
 *
 * @param {string} method  GET | POST | PUT | PATCH | DELETE
 * @param {string} url     mis. "/api/owner/tenants?status=aktif"
 * @param {*} body         objek JSON atau FormData
 * @param {boolean} isForm true bila body berupa FormData
 * @returns {Promise<object>} data respons (ApiError bila gagal)
 */
export async function handleLocalRequest(method, url, body, isForm = false) {
  ensureReady();

  const parsed = new URL(url, window.location.origin);
  const found = matchRoute(method.toUpperCase(), parsed.pathname);
  if (!found) throw new ApiError(404, `Endpoint tidak dikenal: ${method} ${parsed.pathname}`);

  const { route, params } = found;
  const query = Object.fromEntries(parsed.searchParams.entries());

  let fields = body || {};
  let files = {};
  if (isForm && body) ({ fields, files } = await readFormData(body));

  // Pengumuman terjadwal: pada versi server ini tugas scheduler.
  if (route.role !== 'public') publishDueAnnouncements();

  let user = null;
  if (route.role !== 'public') {
    user = S.currentUser();
    if (!user) throw new ApiError(401, 'Sesi berakhir. Silakan login kembali.');
    if (user.status !== 'aktif') {
      throw new ApiError(403, 'Akun Anda sudah tidak aktif. Hubungi pemilik kos.');
    }
    if (route.role !== 'any' && user.role !== route.role) {
      throw new ApiError(403, 'Anda tidak punya akses ke halaman ini.');
    }
  }

  const result = await route.handler({ user, params, query, body: fields, files });
  // Simpan segera: pengguna bisa menutup tab tepat setelah aksi selesai.
  S.save({ immediate: true });
  return result ?? { ok: true };
}

/** Hapus seluruh data demo (dipakai tombol "Reset data demo"). */
export function resetDemoData() {
  S.resetAll();
  ready = false;
  ensureReady();
}
