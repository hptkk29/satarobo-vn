import { describe, it, expect } from "vitest";
import {
  pendingApprovalParts,
  missingApprovalPermissions,
  describeMissingPermissions,
  APPROVAL_PART_PERMISSION,
  type ApprovalPart,
} from "./approval";

// Chốt 20/08/2026 — một nút duyệt cho cả đơn. Phần THUẦN của luật đó nằm ở đây;
// phần đụng DB (transaction, phiếu thu, nhật ký) ở tests/e2e/r7/order-approval-merged.

describe("pendingApprovalParts", () => {
  it("đơn cần cả hai → trả cả hai, đúng thứ tự giảm giá trước", () => {
    expect(
      pendingApprovalParts({
        discountApprovalStatus: "PENDING_APPROVAL",
        installmentApprovalStatus: "PENDING_APPROVAL",
      }),
    ).toEqual<ApprovalPart[]>(["discount", "installment"]);
  });

  it("đơn chỉ có giảm giá / chỉ có kế hoạch → chỉ phần đó", () => {
    expect(
      pendingApprovalParts({
        discountApprovalStatus: "PENDING_APPROVAL",
        installmentApprovalStatus: null,
      }),
    ).toEqual(["discount"]);
    expect(
      pendingApprovalParts({
        discountApprovalStatus: null,
        installmentApprovalStatus: "PENDING_APPROVAL",
      }),
    ).toEqual(["installment"]);
  });

  it("không có gì chờ → rỗng (null, đã duyệt, hoặc thiếu hẳn trường)", () => {
    expect(
      pendingApprovalParts({ discountApprovalStatus: null, installmentApprovalStatus: null }),
    ).toEqual([]);
    expect(
      pendingApprovalParts({
        discountApprovalStatus: "APPROVED",
        installmentApprovalStatus: "APPROVED",
      }),
    ).toEqual([]);
    expect(pendingApprovalParts({})).toEqual([]);
  });

  /**
   * Đơn ĐÃ BỊ TỪ CHỐI không được coi là "đang chờ": nếu tính vào, một cú bấm
   * "Duyệt đơn" cho phần còn lại sẽ lặng lẽ hồi sinh đúng cái giá quản lý vừa bác.
   * Muốn duyệt lại thì sale phải sửa rồi bấm "Yêu cầu duyệt lại".
   */
  it("phần đã BỊ TỪ CHỐI không tự quay lại hàng chờ", () => {
    expect(
      pendingApprovalParts({
        discountApprovalStatus: "REJECTED",
        installmentApprovalStatus: "PENDING_APPROVAL",
      }),
    ).toEqual(["installment"]);
  });
});

describe("missingApprovalPermissions — duyệt nửa vời là lỗ hổng quy trình", () => {
  it("đủ quyền cả hai → không thiếu gì", () => {
    expect(
      missingApprovalPermissions(["discount", "installment"], {
        discount: true,
        installment: true,
      }),
    ).toEqual([]);
  });

  it("chỉ có quyền duyệt trả góp mà đơn cần cả hai → thiếu phần giảm giá", () => {
    expect(
      missingApprovalPermissions(["discount", "installment"], {
        discount: false,
        installment: true,
      }),
    ).toEqual(["discount"]);
  });

  it("chỉ có quyền duyệt giảm giá mà đơn chỉ cần giảm giá → qua", () => {
    expect(
      missingApprovalPermissions(["discount"], { discount: true, installment: false }),
    ).toEqual([]);
  });

  it("quyền không khai (undefined) tính là KHÔNG có — fail-closed", () => {
    expect(missingApprovalPermissions(["discount", "installment"], {})).toEqual([
      "discount",
      "installment",
    ]);
  });
});

describe("describeMissingPermissions", () => {
  it("nói rõ thiếu quyền gì, không phải 'không có quyền' chung chung", () => {
    expect(describeMissingPermissions(["discount"])).toContain("giảm giá");
    const caHai = describeMissingPermissions(["discount", "installment"]);
    expect(caHai).toContain("giảm giá");
    expect(caHai).toContain("kế hoạch thanh toán");
  });
});

describe("APPROVAL_PART_PERMISSION", () => {
  // Đổi tên action ở đây mà quên seed quyền = quản lý cơ sở bấm duyệt không được.
  it("giữ đúng hai action đang seed cho quản lý cơ sở", () => {
    expect(APPROVAL_PART_PERMISSION.discount).toBe("discounts:approve");
    expect(APPROVAL_PART_PERMISSION.installment).toBe("installments:approve");
  });
});
