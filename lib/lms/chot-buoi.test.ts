// lib/lms/chot-buoi.test.ts — cổng D1 (07/09/2026).
//
// Bug đang khoá: nút chốt buổi CHỈ có ở màn admin `/attendance`, mà `decideRoute` đá
// giáo viên thuần khỏi host admin và `attendance` không nằm trong
// `TEACHER_ROUTE_SEGMENTS` ⇒ người thực sự dạy buổi không có đường nào bấm.
// Đo prod 07/09/2026: 2 buổi COMPLETED / 287 SCHEDULED trong 4 tháng.
//
// Test ở đây là CỔNG TĨNH đọc mã nguồn, vì thứ hỏng không phải một hàm mà là "màn nào
// có nút" và "hai site có cùng một luật không" — hai câu mà test hàm không trả lời được.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { TEACHER_ROUTE_SEGMENTS } from "@/lib/auth/route-policy";
import { thieuDanhSach, thieuGi } from "./session-order";

const GOC = join(__dirname, "..", "..");
const doc = (p: string) => readFileSync(join(GOC, p), "utf8");

const ADMIN_ACTION = "app/(admin)/admin/attendance/_actions.ts";
const GV_ACTION = "app/(teacher)/teacher/lop/_actions.ts";
const GV_TAB = "app/(teacher)/teacher/lop/_components/hub-sessions-tab.tsx";
const NUT_CHUNG = "components/lms/chot-buoi-button.tsx";

describe("thieuDanhSach — một nguồn chữ cho cả nút lẫn câu server trả về", () => {
  const du = { attendanceDone: true, feedbackDone: true, photoDone: true };

  it("đủ ba việc thì không thiếu gì", () => {
    expect(thieuDanhSach(du)).toEqual([]);
  });

  it("kể đúng việc đang thiếu, theo thứ tự làm", () => {
    expect(
      thieuDanhSach({ ...du, attendanceDone: false, photoDone: false }),
    ).toEqual(["điểm danh đủ lớp", "ảnh/video cho mọi học viên đi học"]);
  });

  it("câu server dựng TỪ danh sách đó, không ghép chuỗi riêng", () => {
    const w = { ...du, feedbackDone: false };
    expect(thieuGi(w)).toContain(thieuDanhSach(w)[0]);
  });
});

describe("D1 — giáo viên phải có đường bấm chốt buổi", () => {
  it("các file của luồng đều tồn tại (chống test rỗng)", () => {
    for (const f of [ADMIN_ACTION, GV_ACTION, GV_TAB, NUT_CHUNG]) {
      expect(existsSync(join(GOC, f)), `thiếu file ${f}`).toBe(true);
    }
  });

  it("tab Điểm danh của site GV có render nút chốt buổi", () => {
    // Xoá dòng này là quay lại đúng trạng thái prod 07/09: màn có đủ dữ liệu để biết
    // buổi xong rồi, mà không có nút nào đổi được `status`.
    expect(doc(GV_TAB)).toContain("<ChotBuoiGV");
  });

  it("trang chứa nút nằm trong TEACHER_ROUTE_SEGMENTS — nếu không thì nút vô hình", () => {
    // `/teacher/lop`. Thiếu segment thì host admin đá GV về "/" và nút không bao giờ
    // hiện ra — đúng cách `attendance` đang hỏng.
    expect(TEACHER_ROUTE_SEGMENTS.has("lop")).toBe(true);
  });

  it("HAI site đi qua CÙNG một cổng `chotBuoi`, không chép luật", () => {
    for (const f of [ADMIN_ACTION, GV_ACTION]) {
      expect(doc(f), `${f} phải gọi lõi dùng chung`).toContain(
        "@/lib/lms/chot-buoi",
      );
      expect(doc(f)).toContain("chotBuoi({");
    }
  });

  it("nút CHỐT TAY không tự gọi completeSession — phải qua lõi", () => {
    // Gọi thẳng `completeSession` trong action là bỏ qua cổng sở hữu + cổng ba việc.
    // Cắt đúng thân `chotBuoiAction` để phép đo không dính đường TỰ ĐỘNG dưới đây.
    for (const f of [ADMIN_ACTION, GV_ACTION]) {
      const src = doc(f);
      const i = src.indexOf("export async function chotBuoiAction");
      const j = src.indexOf(
        "export async function completeAttendanceSessionAction",
      );
      const than = src.slice(i >= 0 ? i : j);
      expect(than, `${f}: nút chốt tay phải đi qua lõi`).not.toContain(
        "completeSession(",
      );
    }
  });

  // ── Đường ĐÓNG BUỔI TỰ ĐỘNG — ngoại lệ có chủ đích, khoá lại để khỏi trôi ─────
  //
  // 04/09/2026 chủ dự án chốt "mở khoá hoàn thành buổi: chỉ cần điểm danh", nên
  // `saveClassAttendanceAction` tự đóng buổi khi điểm danh phủ đủ sĩ số — MỘT điều
  // kiện, trong khi nút chốt tay đòi BA. Hai luật cùng sống trên cùng một cột
  // `ClassSession.status`.
  //
  // Test này KHÔNG phán xử luật nào đúng; nó chỉ bắt sự tồn tại của cả hai hiện ra khi
  // có người sửa, thay vì để người sau phát hiện bằng cách đọc mã lúc 11 giờ đêm.
  it("đường tự đóng buổi vẫn còn và vẫn chỉ đòi ĐIỂM DANH", () => {
    const src = doc(GV_ACTION);
    expect(src).toContain("quyetDinhTuHoanTat");
    const quyet = doc("lib/lms/tu-hoan-tat-buoi.ts");
    expect(quyet).toContain("DIEM_DANH_THIEU");
    // Nếu dòng dưới đỏ: đường tự động đã đổi điều kiện. Cập nhật cả nút chốt tay cho
    // khớp, đừng chỉ sửa test.
    expect(quyet).not.toContain("feedbackDone");
    expect(quyet).not.toContain("photoDone");
  });

  it("cổng ba việc được kiểm ở LÕI, không tin nút disabled", () => {
    const loi = doc("lib/lms/chot-buoi.ts");
    expect(loi).toContain("isSessionWorkComplete(work)");
    expect(loi).toContain("checkPermission(");
    expect(loi).toContain("passesScope(");
    expect(loi).toContain("assignedClassIds");
  });
});
