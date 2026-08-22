// Registry quyền — module Tài chính: thanh toán, đơn hàng, trả góp, giảm giá.
// Key GIỮ NGUYÊN format v1 `resource:verb` (TS-01).
import type { ModuleDecl } from "./types";

export const financeModule: ModuleDecl = {
  module: "finance",
  permissions: [
    // --- Payments ---
    { key: "payments:manage", action: "manage" },
    {
      key: "payments:view",
      action: "view",
      description: "Chỉ XEM đối soát (Công nợ, Biến động số dư) — không thao tác.",
    },
    {
      key: "payments:record",
      action: "record",
      description: "Sale ghi nhận khoản thu (chưa phải xác nhận).",
    },
    {
      key: "payments:confirm",
      action: "confirm",
      description: "Kế toán xác nhận khoản thu (tách nhiệm vụ với record).",
    },
    {
      key: "payments:view-pii",
      action: "view-pii",
      // Field thật đang mask: Student.parentNationalId + Student.address
      // (lib/finance/pii-mask.ts — maskNationalId/maskAddress).
      sensitiveFields: ["parentNationalId", "address"],
      description: "Break-glass xem đầy đủ CCCD + địa chỉ PH (reason + audit).",
    },

    // --- Installments / Discounts ---
    {
      key: "installments:approve",
      action: "approve",
      description: "Duyệt kế hoạch trả góp 2 đợt.",
    },
    {
      key: "discounts:approve",
      action: "approve",
      description: "Duyệt giảm giá nhập tay (kèm giải trình).",
    },

    // --- Orders ---
    { key: "orders:view", action: "view" },
    { key: "orders:manage", action: "manage" },
    {
      key: "orders:create",
      action: "create",
      description:
        "Tạo đơn hàng. Ai KHÔNG có orders:manage thì chỉ tạo được đơn gắn lead của chính mình (guard: lib/orders/create-guard.ts).",
    },
    {
      key: "orders:view-pii",
      action: "view-pii",
      // Field thật đang mask trên trang đơn: customerName/customerPhone/customerEmail.
      sensitiveFields: ["customerName", "customerPhone", "customerEmail"],
      description: "Xem đầy đủ liên hệ khách trên đơn hàng (vai khác thấy bản che).",
    },
  ],
};
