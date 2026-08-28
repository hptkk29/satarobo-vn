// app/(admin)/admin/lop-trial/_lib/permissions.test.ts
//
// Luật cứng Nền Hệ thống #5: story phải có test AUTO-CI. Màn "Lớp Trial" có 15 Server
// Action và cho tới file này KHÔNG có dòng test nào chạm tới ma trận quyền của chúng.
//
// Vì sao test theo KIỂU NÀY (đọc mã nguồn) chứ không gọi thẳng action:
// mỗi action mở đầu bằng `auth()` → Auth.js cần request context, và ngay sau đó là
// `resolveActor()` → Postgres. Gọi thật thì mất cả hai ở lane unit, mà lane e2e thì
// hiện KHÔNG cài trình duyệt (xem memory job-r7-khong-cai-trinh-duyet) nên bài test
// nào cần `page` là đỏ chắc. Kiểm cấu trúc bắt đúng lớp lỗi đã thật sự xảy ra ở dự án
// này: action mới ra đời KHÔNG có cổng, hoặc cổng gắn nhầm khoá (GĐ4 tách điểm danh
// khỏi phiếu đánh giá; GĐ3 chuyển gán giáo viên sang Đào tạo — cả hai đều là đổi khoá).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS, type Action } from "@/lib/auth/permissions";
import { roleDefCodeFor } from "@/lib/auth/legacy-role-map";
import { ROLE_SEED } from "@/prisma/seed-roles";

const SRC = readFileSync(
  join(process.cwd(), "app/(admin)/admin/lop-trial/_actions.ts"),
  "utf8",
);

/**
 * Cổng quyền ĐÚNG của từng action, theo ma trận §8.2 của bản bàn giao.
 *
 * Đây là bản khai TAY có chủ đích — không suy ra từ mã nguồn. Suy ra từ mã thì test
 * luôn xanh dù cổng bị đổi sai, tức là không kiểm gì cả.
 */
const CONG_QUYEN: Record<string, Action> = {
  saveTrialConfigLopTrialAction: "trials:config",
  createLopTrialClassAction: "trials:manage",
  addLopTrialSessionAction: "trials:manage",
  // 28/08 — sửa / huỷ MỘT buổi. Cùng cổng `trials:manage` với thêm buổi: ba thao tác
  // này là một việc (xếp lịch lớp), tách cổng chỉ đẻ ra ma trận không ai nhớ nổi.
  // KHÔNG dùng `trials:attendance`: điểm danh là việc của Sale, còn đổi lịch/huỷ buổi
  // đụng tới lịch dạy của giáo viên.
  updateLopTrialSessionAction: "trials:manage",
  cancelLopTrialSessionAction: "trials:manage",
  enrollLeadChildLopTrialAction: "trials:manage",
  searchLopTrialCandidatesAction: "trials:manage",
  unenrollLeadChildLopTrialAction: "trials:manage",
  // GĐ3 (chốt câu 2) — gán giáo viên là việc của ĐÀO TẠO, không phải Quản lý cơ sở.
  assignLopTrialTeacherAction: "trials:assign-teacher",
  cancelLopTrialClassAction: "trials:manage",
  // GĐ4 — điểm danh là việc của SALE phụ trách khách, KHÁC phiếu đánh giá của giáo
  // viên (`trials:feedback`). Dùng chung một khoá là đảo ngược quy trình đã chốt.
  markLopTrialAttendanceAction: "trials:attendance",
  completeLopTrialSessionAction: "trials:attendance",
};

/** Tên mọi hàm `export async function` trong file action. */
function cacActionXuatRa(): string[] {
  return [...SRC.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
}

/** Thân hàm `ten` — từ chỗ khai báo tới `export` kế tiếp (hoặc hết file). */
function thanHam(ten: string): string {
  const bat = SRC.indexOf(`export async function ${ten}`);
  expect(bat, `không tìm thấy hàm ${ten}`).toBeGreaterThan(-1);
  const sau = SRC.indexOf("\nexport ", bat + 1);
  return SRC.slice(bat, sau === -1 ? SRC.length : sau);
}

describe("Lớp Trial — cổng quyền của Server Action", () => {
  it("bảng khai phủ ĐÚNG danh sách action đang có (không thừa, không thiếu)", () => {
    // Vế "không thiếu" mới là vế quan trọng: action MỚI thêm vào mà quên khai ở đây
    // sẽ làm đỏ ngay, thay vì lặng lẽ ra đời không cổng.
    expect(cacActionXuatRa().sort()).toEqual(Object.keys(CONG_QUYEN).sort());
  });

  it.each(Object.entries(CONG_QUYEN))(
    "%s gác bằng checkPermission(%s)",
    (ten, khoa) => {
      const than = thanHam(ten);
      expect(than).toContain(`checkPermission("${khoa}")`);
    },
  );

  it("mọi action đều CHẶN khi thiếu quyền, không chỉ gọi checkPermission rồi bỏ qua", () => {
    // `await checkPermission(...)` mà không dùng kết quả là lỗi đã từng gặp thật.
    // Rào phải ở dạng phủ định: `if (!(await checkPermission(...)))`.
    for (const ten of Object.keys(CONG_QUYEN)) {
      const than = thanHam(ten);
      expect(
        /if \(!\(await checkPermission\(/.test(than),
        `${ten} gọi checkPermission nhưng không chặn theo kết quả`,
      ).toBe(true);
    }
  });

  it("mọi action đều đòi đăng nhập TRƯỚC khi kiểm quyền", () => {
    for (const ten of Object.keys(CONG_QUYEN)) {
      const than = thanHam(ten);
      const iAuth = than.indexOf("await requireActor()");
      const iQuyen = than.indexOf("checkPermission(");
      expect(iAuth, `${ten} không gọi requireActor()`).toBeGreaterThan(-1);
      expect(iQuyen, `${ten} không kiểm quyền`).toBeGreaterThan(-1);
      expect(iAuth, `${ten} kiểm quyền trước khi biết là ai`).toBeLessThan(iQuyen);
    }
  });

  it("vượt sĩ số là quyền RIÊNG — không đi nhờ trials:manage", () => {
    // Cờ `allowOverride` đi thẳng từ client; thiếu cổng riêng thì bất kỳ ai xếp được
    // học viên cũng nhồi được lớp quá sức chứa.
    expect(thanHam("enrollLeadChildLopTrialAction")).toContain(
      'checkPermission("trials:override-capacity")',
    );
  });
});

describe("Lớp Trial — v1 (matrix tĩnh) và v2 (seed vai) phải khớp", () => {
  // Vì sao phải có bài này: prod chạy v2 (RBAC_V2_ENABLED=true), còn local/dev/CI chạy
  // v1. Hai bảng lệch nhau thì lỗi quyền KHÔNG bao giờ hiện ở máy dev — đúng cách mà
  // lỗi "Đào tạo bị đá về /dashboard" (thiếu TRAINING ở `trials:view` bên v1) lọt ra.
  //
  // ⚠️ So MỘT CHIỀU (v1 ⊆ v2), không so hai chiều. Danh mục vai v2 là BỘI của enum v1:
  // HO_SALE, CENTER_CLASS_MANAGER, ASSISTANT_TEACHER, AUDITOR không có vai v1 nào ánh
  // xạ tới. Bắt hai chiều bằng nhau là đòi v2 phải nghèo đi bằng v1 — sai hướng, và
  // sẽ đỏ mỗi lần ai đó cấp quyền cho một vai chỉ-có-ở-v2.
  const KHOA_TRIAL = [
    ...new Set<Action>([
      ...Object.values(CONG_QUYEN),
      "trials:view",
      "trials:feedback",
      "trials:override-capacity",
    ]),
  ];

  /** RoleDef.code (v2) có khai `khoa` không. */
  function v2Co(code: string, khoa: string): boolean {
    return (
      ROLE_SEED.find((r) => r.code === code)?.perms.some((p) => p.action === khoa) ??
      false
    );
  }

  it.each(KHOA_TRIAL)("%s: vai nào có ở v1 thì vai tương ứng bên v2 cũng phải có", (khoa) => {
    const thieu: string[] = [];
    for (const legacy of PERMISSIONS[khoa] ?? []) {
      // SUPER_ADMIN bypass toàn bộ quyền trong can() v2 (lib/auth/can.ts) — khai hay
      // không đều như nhau ở đó, nên không so.
      if (legacy === "SUPER_ADMIN") continue;
      const base = roleDefCodeFor(legacy, false);
      const atCenter = roleDefCodeFor(legacy, true);
      // Vai neo-theo-cơ-sở có hai biến thể (HR→CENTER_HR, ACCOUNTANT→CENTER_ACCOUNTANT);
      // có ở một trong hai là đủ — người dùng thật chỉ mang một biến thể.
      const co =
        (base !== null && v2Co(base, khoa)) ||
        (atCenter !== null && v2Co(atCenter, khoa));
      if (!co) thieu.push(`${legacy} → ${base}${atCenter !== base ? `/${atCenter}` : ""}`);
    }
    expect(thieu, `v1 cấp ${khoa} cho vai mà seed v2 không cấp`).toEqual([]);
  });
});
