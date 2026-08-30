// lib/tables/lead-columns.ts — DANH MỤC CỘT của bảng Lead (/admin/leads).
//
// Thêm cột mới = thêm MỘT dòng ở đây + MỘT `case` trong `LeadCell`
// (`app/(admin)/admin/leads/_components/leads-table.tsx`). Test `lead-columns.test.ts`
// đỏ nếu thiếu một trong hai — không có nó thì cột hiện trong hộp chọn mà ô luôn trống,
// và người dùng tưởng dữ liệu bị mất.
//
// File THUẦN: không import Prisma/auth, client component kéo theo được.

export type LeadColumn = {
  key: string;
  label: string;
  /** Có nằm trong bộ mặc định không. */
  macDinh: boolean;
  /** Cột KHÔNG tắt được (bỏ đi thì bảng vô nghĩa). */
  batBuoc?: boolean;
};

/**
 * Thứ tự ở đây là thứ tự cột trên bảng — người dùng chọn HIỆN/ẨN, không đổi thứ tự.
 *
 * Cho đổi thứ tự nghe hay nhưng đắt: phải lưu mảng thứ tự, phải xử lý cột mới chèn vào
 * đâu, và hai người mô tả "cột thứ ba" cho nhau sẽ nói về hai cột khác nhau.
 */
export const LEAD_COLUMNS: readonly LeadColumn[] = [
  { key: "parentName", label: "Phụ huynh / học sinh", macDinh: true, batBuoc: true },
  { key: "phone", label: "Số điện thoại", macDinh: true },
  { key: "course", label: "Khóa quan tâm", macDinh: true },
  { key: "status", label: "Trạng thái", macDinh: true },
  { key: "center", label: "Cơ sở", macDinh: true },
  { key: "assignedTo", label: "Sale phụ trách", macDinh: true },
  // 30/08 — đổi tên từ "Ngày đăng ký": lead vào hệ thống chưa phải là đã đăng ký học,
  // gọi vậy làm người đọc tưởng đây là mốc chốt đơn. Có kèm GIỜ vì trong ngày cao
  // điểm, thứ tự nhận lead trong cùng một ngày mới là thứ Sale cần.
  { key: "createdAt", label: "Ngày nhận lead", macDinh: true },
  // 30/08 — MẶC ĐỊNH ẨN (chủ dự án chốt). Cột này chỉ có nghĩa với phiếu khách quay
  // lại; để mặc định thì đa số dòng in ra đúng bằng "Ngày nhận lead", tốn một cột
  // ngang mà không nói thêm gì.
  { key: "lastInboundAt", label: "Lần nhập gần nhất", macDinh: false },
  { key: "childName", label: "Tên con", macDinh: false },
  { key: "childAge", label: "Tuổi con", macDinh: false },
  { key: "email", label: "Email", macDinh: false },
  { key: "source", label: "Nguồn", macDinh: false },
  { key: "note", label: "Ghi chú", macDinh: false },
  { key: "utmCampaign", label: "Chiến dịch (UTM)", macDinh: false },
];

export const LEAD_COLUMN_KEYS: readonly string[] = LEAD_COLUMNS.map((c) => c.key);

/** Khoá lưu lựa chọn trong trình duyệt — mỗi người một bộ, không đụng người khác. */
export const LEAD_COLUMNS_STORAGE_KEY = "satarobo:leads:cols:v1";

export function cotMacDinh(): string[] {
  return LEAD_COLUMNS.filter((c) => c.macDinh).map((c) => c.key);
}

/**
 * Làm sạch danh sách cột đọc từ trình duyệt.
 *
 * Ba việc, việc nào thiếu cũng vỡ bảng: bỏ khoá lạ (cột đã xoá khỏi mã nguồn), luôn
 * kèm cột bắt buộc, và giữ ĐÚNG thứ tự của danh mục chứ không phải thứ tự người dùng
 * bấm. Rỗng hoặc hỏng thì rơi về bộ mặc định — thà thấy bộ mặc định còn hơn bảng trắng.
 */
export function chuanHoaCot(raw: unknown): string[] {
  const batBuoc = LEAD_COLUMNS.filter((c) => c.batBuoc).map((c) => c.key);
  if (!Array.isArray(raw)) return cotMacDinh();
  const chon = new Set(raw.filter((x): x is string => typeof x === "string"));
  for (const k of batBuoc) chon.add(k);
  const ra = LEAD_COLUMN_KEYS.filter((k) => chon.has(k));
  return ra.length > batBuoc.length ? ra : cotMacDinh();
}
