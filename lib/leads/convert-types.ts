// lib/leads/convert-types.ts — NHÓM 03 (Việc 4) — Hợp đồng (contract) UI ↔ logic
// convert lead. CHỈ ĐỊNH NGHĨA TYPE — KHÔNG implement `convertLeadV2` thật ở đây.
// Sở hữu: Luân (UI + action wrapper) định nghĩa hợp đồng này để demo UI các nhánh lỗi;
// Kiệt (H3) sở hữu logic transaction/serializable thật.
//
// ⚠️ LƯU Ý QUAN TRỌNG (đọc trước khi dùng file này):
// Repo hiện ĐÃ CÓ một implementation convert lead "v2" đang chạy production:
//   - `lib/crm/convert-lead-v2.ts` → `convertLeadV2()` trả `ConvertV2Result`
//     (đa học viên: `studentIds[]` / `enrollmentIds[]`, mã lỗi PAYMENT_REQUIRED /
//     PARENT_CONFLICT / LEAD_NOT_FOUND / LEAD_NO_CENTER / NO_STUDENT).
//   - UI thật: `app/(admin)/admin/leads/[id]/convert/{page.tsx,convert-form.tsx,actions.ts}`.
//   - Conflict trùng hồ sơ (PARENT_CONFLICT) được Admin xử lý ở trang riêng
//     `/admin/convert-conflicts` (KHÔNG phải dialog chọn ngay tại chỗ).
// Type `ConvertLeadResult` dưới đây là hợp đồng theo đúng mô tả trong
// `03-crm-co-ban/technical.md` §4 (single-student, mã lỗi CLASS_FULL/PREREQ_MISSING/
// PAYMENT_REQUIRED/DUPLICATE_STUDENT/PERMISSION_DENIED + `candidates[]` inline) — ĐÂY LÀ
// MỘT HỢP ĐỒNG KHÁC (không map 1:1) so với `ConvertV2Result` đang chạy thật. File này chỉ
// phục vụ mock/demo UI (xem `convert-dialog-demo.tsx`) để minh hoạ pattern UI cho 4 case
// lỗi; KHÔNG thay thế convert-lead-v2.ts. BGĐ/Kiệt cần chốt: giữ 2 hợp đồng song song,
// map lại 1 bên, hay bỏ hợp đồng này — xem phần "Còn chờ" trong báo cáo bàn giao.

/** Ứng viên hồ sơ học viên đã tồn tại — dùng khi lỗi DUPLICATE_STUDENT. */
export type ConvertLeadDuplicateCandidate = {
  studentId: string;
  fullName: string;
  dob: string;
  centerName: string;
};

export type ConvertLeadErrorCode =
  | "CLASS_FULL" // re-check sĩ số Serializable (H3)
  | "PREREQ_MISSING" // thiếu tiên quyết (H3)
  | "PAYMENT_REQUIRED" // chưa thanh toán CONFIRMED (QĐ R7: chặn convert chưa thanh toán)
  | "DUPLICATE_STUDENT" // trùng hồ sơ → kèm candidates[]
  | "PERMISSION_DENIED";

export type ConvertLeadResult =
  | { ok: true; data: { studentId: string; enrollmentId: string } }
  | {
      ok: false;
      error: {
        code: ConvertLeadErrorCode;
        message: string; // VI
        candidates?: ConvertLeadDuplicateCandidate[]; // cho DUPLICATE_STUDENT
      };
    };
