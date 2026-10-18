/**
 * Error dengan kode status, dipakai bersama oleh lapisan pemanggil API
 * dan "backend" yang berjalan di browser.
 *
 * Diletakkan di modul sendiri agar core.js dan js/backend/ tidak perlu
 * saling mengimpor (yang akan membuat impor berputar).
 */
export class ApiError extends Error {
  constructor(status, message, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/** Pintasan untuk melempar error dengan status tertentu. */
export const fail = (status, message) => {
  throw new ApiError(status, message);
};
