// lib/agents/gateway/thoi-gian.ts — định dạng thời gian của hợp đồng với xưởng skill (spec §7.2).
// THUẦN. "Thời gian theo ISO 8601 có +07:00, ngày dạng YYYY-MM-DD".
//
// Việt Nam không có giờ mùa hè, nên +07:00 là hằng số — không cần bảng múi giờ.

const LECH_MS = 7 * 60 * 60 * 1000;

function hai(n: number): string {
  return String(n).padStart(2, "0");
}

/** 2026-09-25T02:00:00Z → "2026-09-25T09:00:00+07:00". Bỏ phần mili giây. */
export function gioVN(d: Date): string {
  const v = new Date(d.getTime() + LECH_MS);
  return (
    `${v.getUTCFullYear()}-${hai(v.getUTCMonth() + 1)}-${hai(v.getUTCDate())}` +
    `T${hai(v.getUTCHours())}:${hai(v.getUTCMinutes())}:${hai(v.getUTCSeconds())}+07:00`
  );
}

/** Ngày lịch ở Việt Nam, "YYYY-MM-DD". 23:30Z ngày 24 là ngày 25 ở VN. */
export function ngayVN(d: Date): string {
  return gioVN(d).slice(0, 10);
}

/** Thời điểm 00:00 (giờ VN) của ngày chứa `d` — mốc đếm hạn mức "mỗi ngày". */
export function dauNgayVN(d: Date): Date {
  return new Date(`${ngayVN(d)}T00:00:00+07:00`);
}
