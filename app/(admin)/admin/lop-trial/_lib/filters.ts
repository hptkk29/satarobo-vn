// app/(admin)/admin/lop-trial/_lib/filters.ts — GĐ2.
//
// Hàm THUẦN dựng mệnh đề `where`. Tách khỏi queries.ts có chủ đích: file này chỉ
// import TYPE từ Prisma (bị xoá lúc biên dịch) nên vitest chạy được mà không cần
// Postgres, đúng quy ước của lib/reports/lead.ts.
import type { Prisma } from "@prisma/client";
import type { TrialClassStatusV2 } from "./types";

const CLASS_STATUSES: readonly TrialClassStatusV2[] = [
  "OPEN",
  "RUNNING",
  "COMPLETED",
  "CANCELLED",
];

export const BOOKING_STATUS_VALUES = [
  "SCHEDULED",
  "CONFIRMED",
  "ATTENDED",
  "MISSED",
  "POSTPONED",
  "ENROLLED",
  "REJECTED",
] as const;

/** Buổi hẹn coi là "đã xong" — mặc định ẩn cho đỡ nhiễu danh sách việc đang làm. */
const BOOKING_TERMINAL = ["ENROLLED", "REJECTED"] as const;

/** Lead đã rời phễu tư vấn thì buổi hẹn cũ của họ không còn là việc đang làm.
 *  GĐ5 — bốn giá trị cũ gộp còn hai: ENROLLED+REGISTERED → DA_DANG_KY (một bậc duy
 *  nhất cho "đã đăng ký"), LOST+DUPLICATE → DA_MAT (bản ghi trùng nay bị chặn ngay lúc
 *  tạo nên không còn là một bậc phễu). Tập lead bị ẩn KHÔNG đổi, chỉ gọn tên lại. */
const BOOKING_LEAD_EXCLUDED = ["DA_DANG_KY", "DA_MAT"] as const;

/**
 * `where` cho danh sách lớp trải nghiệm.
 * - `status` rỗng → "Đang mở": ẩn lớp đã xong và đã huỷ.
 * - `status === "all"` → không lọc trạng thái.
 * - `q` → tìm theo tên hoặc mã lớp.
 */
export function buildClassListWhere(
  status: string | undefined,
  q: string | undefined,
): Prisma.TrialClassV2WhereInput {
  const where: Prisma.TrialClassV2WhereInput = {};
  if (status === "all") {
    // không lọc trạng thái
  } else if (status && (CLASS_STATUSES as readonly string[]).includes(status)) {
    where.status = status as TrialClassStatusV2;
  } else {
    where.status = { notIn: ["COMPLETED", "CANCELLED"] };
  }

  const term = (q ?? "").trim();
  if (term) {
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { code: { contains: term, mode: "insensitive" } },
    ];
  }
  return where;
}

/**
 * `where` cho danh sách buổi hẹn học thử (V1). Chép nguyên luật lọc của màn cũ:
 * luôn ẩn lead đã xoá mềm (soft-delete không cascade nên buổi cũ vẫn còn);
 * chế độ mặc định ẩn thêm buổi đã xong VÀ lead đã rời phễu;
 * giáo viên thuần chỉ thấy buổi của mình.
 *
 * ⚠️ S-1 (26/08/2026) — `canSearchPhone` KHÔNG phải tuỳ chọn trang trí. Ô tìm là
 * đường rò GIÁN TIẾP: nó không in số ra màn hình, nhưng ai gõ đủ số cũng biết
 * được số đó là khách nào. Che cột SĐT mà để ô tìm quét cột đó thì việc che chỉ
 * còn là hình thức. Vai vào được màn này gồm cả Quản lý cơ sở (mất
 * `leads:view-pii` từ Q9), Giáo viên và Đào tạo — ba vai chưa bao giờ có quyền
 * xem SĐT lead.
 *
 * Mặc định `false` (fail-closed): quên truyền cờ thì mất tính năng tìm, chứ
 * không mất dữ liệu cá nhân.
 */
export function buildBookingListWhere(
  status: string | undefined,
  opts: { ownTeacherId?: string | null; q?: string; canSearchPhone?: boolean },
): Prisma.TrialClassWhereInput {
  const where: Prisma.TrialClassWhereInput = { lead: { deletedAt: null } };

  if (status === "all") {
    // "Tất cả" — chỉ còn ràng buộc lead chưa xoá mềm.
  } else if (status && (BOOKING_STATUS_VALUES as readonly string[]).includes(status)) {
    where.status = status as (typeof BOOKING_STATUS_VALUES)[number];
  } else {
    where.status = { notIn: [...BOOKING_TERMINAL] };
    where.lead = {
      deletedAt: null,
      status: { notIn: [...BOOKING_LEAD_EXCLUDED] },
    };
  }

  if (opts.ownTeacherId) where.teacherId = opts.ownTeacherId;

  const term = (opts.q ?? "").trim();
  if (term) {
    where.lead = {
      ...(where.lead as Prisma.LeadWhereInput),
      OR: [
        { parentName: { contains: term, mode: "insensitive" } },
        ...(opts.canSearchPhone === true ? [{ phone: { contains: term } }] : []),
        { children: { some: { fullName: { contains: term, mode: "insensitive" } } } },
      ],
    };
  }
  return where;
}

/**
 * "YYYY-MM-DD" (ngày VN) → mốc UTC 00:00 để ghi vào cột `@db.Date`.
 *
 * KHÔNG dùng `new Date("2026-09-05")` vì hàm đó đọc múi giờ tiến trình: Vercel chạy
 * UTC còn máy dev +07, kết quả lệch một ngày. Cũng KHÔNG dùng `vnDateAt` — hàm đó trả
 * mốc 17:00 UTC hôm trước, đúng cho GIỜ chứ không đúng cho cột chỉ mang nghĩa NGÀY.
 */
export function ngayVnSangUtc(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}
