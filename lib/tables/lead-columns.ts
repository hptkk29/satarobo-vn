// lib/tables/lead-columns.ts — G-04: NGUỒN KHAI BÁO DUY NHẤT của danh sách cột
// bảng lead.
//
// ⚠️ Thêm trường mới cho lead (G-01 / G-06 / G-07) thì thêm ĐÚNG MỘT dòng ở đây,
// rồi thêm nhánh vẽ tương ứng trong `_components/leads-table.tsx`. Chép danh sách
// này sang chỗ thứ hai (màn chọn cột, file xuất, …) là ngày mai hai nơi nói hai
// câu khác nhau — test `lead-columns.test.ts` khoá đúng chuyện đó.
//
// ⚠️ Cột gắn `pii: true` KHÔNG tự che gì. Việc che nằm ở tầng đọc
// (`maskLeadPiiFields`, gọi trong `app/(admin)/admin/leads/page.tsx`) và chạy TRƯỚC
// khi dữ liệu rời server. Bật cột lên không mở được dữ liệu thật: tuỳ chọn cột là
// tuỳ chọn HIỂN THỊ, không phải cổng quyền (G-04-4).
//
// ⚠️ Danh mục là hằng số tầng mã, không phải bảng DB — xem lý do ở
// `column-preference.ts`. Nút "Khôi phục mặc định" = XOÁ dòng cấu hình, để mặc
// định luôn là bộ hiện hành chứ không phải bộ bị đóng băng lúc bấm nút.
import type { TableColumnDef } from "./column-preference";

export type { TableColumnDef };

/** Khoá bảng có namespace — bảng thứ hai (học viên, đơn hàng…) chỉ cần khai danh
 *  mục riêng và thêm khoá vào `TABLE_KEYS`, KHÔNG phải đổi schema. */
export const LEAD_TABLE_KEY = "admin.leads.list";

export const TABLE_KEYS = [LEAD_TABLE_KEY] as const;
export type TableKey = (typeof TABLE_KEYS)[number];

/**
 * Bộ mặc định = ĐÚNG 7 cột đang chạy trước G-04 (chốt kỹ thuật 24/08/2026, OQ-G11):
 * bật tính năng KHÔNG được làm giao diện của ai nhảy. Mọi cột thêm sau vào đây với
 * `defaultVisible: false` — ai muốn thì tự bật.
 */
export const LEAD_TABLE_COLUMNS: readonly TableColumnDef[] = [
  // ── 7 cột mặc định (thứ tự y hệt bảng cũ) ────────────────────────────────────
  {
    key: "parentName",
    // Ô này vẽ tên phụ huynh + chip "Dùng chung" + dòng phụ "Con: …" — giữ nguyên
    // hình dạng ô cũ để bảng của mọi người không đổi.
    label: "Phụ huynh / học sinh",
    group: "Phụ huynh",
    defaultVisible: true,
    defaultOrder: 100,
    pii: true,
  },
  {
    key: "phone",
    label: "Số điện thoại",
    group: "Phụ huynh",
    defaultVisible: true,
    defaultOrder: 200,
    pii: true,
  },
  {
    key: "course",
    label: "Khóa quan tâm",
    group: "Nghiệp vụ",
    defaultVisible: true,
    defaultOrder: 300,
  },
  {
    key: "status",
    label: "Trạng thái",
    group: "Nghiệp vụ",
    defaultVisible: true,
    defaultOrder: 400,
  },
  {
    key: "center",
    label: "Cơ sở",
    group: "Nghiệp vụ",
    defaultVisible: true,
    defaultOrder: 500,
  },
  {
    key: "assignedTo",
    label: "Sale phụ trách",
    group: "Nghiệp vụ",
    defaultVisible: true,
    defaultOrder: 600,
  },
  {
    key: "createdAt",
    label: "Ngày đăng ký",
    group: "Nghiệp vụ",
    defaultVisible: true,
    defaultOrder: 700,
  },

  // ── cột TẮT sẵn ─────────────────────────────────────────────────────────────
  // defaultOrder xen kẽ giữa các mốc trăm ở trên = chỗ cột sẽ rơi vào khi người
  // dùng bật nó lên lần đầu (hoặc khi nó được thêm mới cho người đã lưu cấu hình).
  {
    key: "childName",
    label: "Tên học sinh (cột riêng)",
    group: "Học sinh",
    defaultVisible: false,
    defaultOrder: 110,
    pii: true,
  },
  {
    key: "childAge",
    label: "Tuổi học sinh",
    group: "Học sinh",
    defaultVisible: false,
    defaultOrder: 120,
  },
  {
    key: "email",
    label: "Email phụ huynh",
    group: "Phụ huynh",
    defaultVisible: false,
    defaultOrder: 250,
    pii: true,
  },
  {
    key: "source",
    label: "Nguồn lead",
    group: "Nghiệp vụ",
    defaultVisible: false,
    defaultOrder: 550,
  },
  {
    key: "note",
    label: "Ghi chú",
    group: "Nghiệp vụ",
    defaultVisible: false,
    defaultOrder: 650,
    pii: true,
  },
  {
    key: "utmCampaign",
    label: "Chiến dịch (UTM)",
    group: "Theo dõi",
    defaultVisible: false,
    defaultOrder: 800,
  },
];

const CATALOGS: Record<TableKey, readonly TableColumnDef[]> = {
  [LEAD_TABLE_KEY]: LEAD_TABLE_COLUMNS,
};

/** Tra danh mục theo khoá bảng. Khoá lạ → null (client KHÔNG được tự đặt tên bảng). */
export function getTableCatalog(tableKey: string): readonly TableColumnDef[] | null {
  return CATALOGS[tableKey as TableKey] ?? null;
}
