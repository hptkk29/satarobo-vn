// Hai cổng quanh kỳ công (08/09/2026). THUẦN — chạy trong `pnpm test:unit`, không cần DB.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { chanChotKyThieuBuoi, chanSuaKyDaChot } from "./ky-gac";

const GOC = join(__dirname, "..", "..");
const doc = (p: string) => readFileSync(join(GOC, p), "utf8");

describe("chanChotKyThieuBuoi — chặn chốt kỳ khi chưa buổi nào được chốt", () => {
  it("có buổi mà 0 buổi xong → CHẶN", () => {
    expect(chanChotKyThieuBuoi({ duKien: 287, xong: 0 })).toContain(
      "287 buổi học",
    );
  });

  it("chỉ cần MỘT buổi đã chốt là cho qua — cổng này chống 'trắng trơn', không phải KPI", () => {
    expect(chanChotKyThieuBuoi({ duKien: 287, xong: 1 })).toBeNull();
  });

  // ⚠️ CA QUAN TRỌNG NHẤT của cổng này.
  //
  // Hội sở (`hoi-so`) là Center MỒ CÔI — không lớp nào trỏ tới, nên kỳ nào của nó cũng
  // có `duKien = 0`. Nếu ngưỡng là `xong === 0` thì Hội sở KHOÁ VĨNH VIỄN, không bao
  // giờ chốt được kỳ. Đừng "đơn giản hoá" điều kiện.
  it("kỳ KHÔNG có buổi nào (Hội sở) → cho qua, KHÔNG khoá vĩnh viễn", () => {
    expect(chanChotKyThieuBuoi({ duKien: 0, xong: 0 })).toBeNull();
  });

  it("mọi buổi đều đã chốt → cho qua", () => {
    expect(chanChotKyThieuBuoi({ duKien: 42, xong: 42 })).toBeNull();
  });
});

describe("chanSuaKyDaChot — chặn xếp lại khung ca vào kỳ đã chốt", () => {
  it("LOCKED → CHẶN, và câu chặn nói rõ kỳ nào", () => {
    expect(
      chanSuaKyDaChot({ status: "LOCKED", periodKey: "2026-09" }),
    ).toContain("2026-09");
  });

  it("OPEN / REOPENED / CLOSING / chưa có kỳ → cho qua", () => {
    for (const st of ["OPEN", "REOPENED", "CLOSING", null]) {
      expect(
        chanSuaKyDaChot({ status: st, periodKey: "2026-09" }),
        `status=${st}`,
      ).toBeNull();
    }
  });
});

// ── Cổng TĨNH: hai cổng phải được CẮM ĐÚNG CHỖ ────────────────────────────────
//
// Hàm thuần đúng mà cắm sai chỗ thì vô dụng — và "sai chỗ" ở đây có một hình dạng cụ
// thể: đặt SAU bước ghi, thành "chặn nhưng vẫn ghi".
describe("hai cổng được cắm đúng chỗ", () => {
  it("chốt kỳ: cổng đứng TRƯỚC recomputeRange", () => {
    const src = doc("lib/cham-cong/period.ts");
    const iGate = src.indexOf("chanChotKyThieuBuoi({");
    const iWrite = src.indexOf("await recomputeRange(");
    expect(iGate, "cổng phải tồn tại").toBeGreaterThan(-1);
    // Đặt sau `recomputeRange` là đã tính lại + ghi đè hàng loạt StaffAttendanceDay
    // rồi mới báo lỗi — chặn nhưng vẫn ghi.
    expect(iGate).toBeLessThan(iWrite);
  });

  it("chốt kỳ: KHÔNG gác bằng summary.totals.teachingSessions", () => {
    // Số đó cộng theo HÀNG nên rụng buổi của giáo viên không có ca trong kỳ, và truy
    // vấn sinh ra nó bị bỏ hẳn khi danh sách người rỗng.
    const src = doc("lib/cham-cong/period.ts");
    const than = src.slice(
      src.indexOf("if (!input.boQuaBuoiChuaChot)"),
      src.indexOf("await recomputeRange("),
    );
    expect(than).toContain("classSession.count");
    expect(than).not.toContain("teachingSessions");
  });

  it("xếp lại khung ca: cổng đứng TRƯỚC generateMonthAssignments", () => {
    const src = doc("app/(admin)/admin/cham-cong/khung-ca/_actions.ts");
    const iGate = src.indexOf("chanSuaKyDaChot({");
    const iWrite = src.indexOf("await generateMonthAssignments({");
    expect(iGate).toBeGreaterThan(-1);
    expect(iGate).toBeLessThan(iWrite);
  });

  // Cổng chặn mà không có đường vượt là tự khoá mình; đường vượt ở cấp CƠ SỞ thì cổng
  // không tồn tại. Cả hai phải là HO + lý do bắt buộc, cùng khuôn `reopenPeriodAction`.
  it("cả hai đường vượt đều ở cấp HỘI SỞ và bắt buộc lý do", () => {
    for (const f of [
      "app/(admin)/admin/cham-cong/ky-cong/_actions.ts",
      "app/(admin)/admin/cham-cong/khung-ca/_actions.ts",
    ]) {
      const src = doc(f);
      expect(src, `${f}: đường vượt phải hỏi quyền tại HO`).toContain(
        "centerId: HO_CENTER_ID",
      );
      expect(src, `${f}: đường vượt phải bắt buộc lý do`).toContain(
        "tối thiểu 5 ký tự",
      );
    }
  });

  // ── CỔNG THỨ BA: DUYỆT đơn vào kỳ đã chốt (09/09/2026) ────────────────────
  //
  // Hai cổng cũ canh đường GHI của quản lý (chốt kỳ, xếp lại khung ca). Đường thứ ba đi
  // qua ĐƠN TỪ và trước 09/09 KHÔNG ai canh: `createRequest` chặn NỘP vào kỳ đã chốt,
  // nhưng `decideRequest` không kiểm gì. Đơn nộp TRƯỚC khi chốt, duyệt SAU khi chốt thì
  // nhánh TIMESHEET_FIX `createMany` thẳng `StaffTimeLog` vào kỳ đã đóng băng.
  //
  // Hỏng câm: `summaryJson` là ảnh chụp lúc khoá nên số trên màn Kỳ công KHÔNG đổi — sổ
  // đã chốt và dữ liệu sống lệch nhau mà không có gì báo.
  it("decideRequest có cổng kỳ đã chốt, và nó đứng TRƯỚC mọi đường ghi", () => {
    const src = doc("lib/cham-cong/requests.ts");
    const iGate = src.indexOf(
      'if (input.decision === "APPROVED" && req.fromDate',
    );
    expect(iGate, "phải có cổng trong decideRequest").toBeGreaterThan(-1);
    // Ba đường ghi hệ quả nằm sau cổng.
    for (const dau of [
      "setAssignmentCell({",
      "tx.staffTimeLog.createMany(",
      "markAttendanceDayDirty(",
    ]) {
      const i = src.indexOf(dau);
      expect(i, `${dau} phải tồn tại`).toBeGreaterThan(-1);
      expect(iGate, `cổng phải đứng trước ${dau}`).toBeLessThan(i);
    }
  });

  it("chỉ chặn khi DUYỆT — TỪ CHỐI đơn cũ vẫn làm được", () => {
    // Từ chối không ghi gì vào kỳ; chặn cả từ chối là khoá luôn hàng chờ của quản lý.
    expect(doc("lib/cham-cong/requests.ts")).toContain(
      'input.decision === "APPROVED" && req.fromDate',
    );
  });

  it("đơn LỚP không đi qua cổng này — hệ quả của nó không nằm trong kỳ công", () => {
    // CLASS_OFF/SUB_TEACH ghi vào `lib/classes/adjust.ts`, không đụng StaffAttendanceDay.
    const src = doc("lib/cham-cong/requests.ts");
    const i = src.indexOf('input.decision === "APPROVED" && req.fromDate');
    expect(src.slice(i, i + 200)).toContain("!isClassKind(req.kind)");
  });

  it("đường vượt của đơn từ cũng ở cấp HỘI SỞ và bắt buộc lý do", () => {
    const src = doc("lib/cham-cong/request-actions.ts");
    expect(src).toContain("centerId: HO_CENTER_ID");
    expect(src).toContain("tối thiểu 5 ký tự");
    // Quyền phải kiểm ở ACTION, không ở lib — lib tự hỏi quyền là cơ sở tự vượt cổng.
    expect(doc("lib/cham-cong/requests.ts")).not.toContain("checkPermission");
  });

  it("audit ghi rõ lượt duyệt có VƯỢT cổng hay không", () => {
    // Không ghi thì sau này không trả lời được "ai đã ghi vào kỳ đã chốt, vì sao".
    expect(doc("lib/cham-cong/request-actions.ts")).toContain(
      "boQuaKyDaChot: boQua",
    );
  });
});
