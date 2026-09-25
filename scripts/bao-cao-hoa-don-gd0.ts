/**
 * scripts/bao-cao-hoa-don-gd0.ts — ĐO TRƯỚC KHI CODE MÀN KẾ TOÁN HOÁ ĐƠN. **CHỈ ĐỌC.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Chạy: KHÔNG chạy tay trên prod. Đi qua workflow `.github/workflows/hoa-don-prod-chi-doc.yml`
 * (workflow_dispatch, chỉ `main` hoặc `test`).
 *
 * Kế hoạch: `docs/ke-toan-hoa-don/PLAN.md` mục 11 (GĐ 0) và bảng "Số đo GĐ 0" ở mục 12.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TÁM CÂU HỎI, VÀ QUYẾT ĐỊNH MỖI CÂU CHI PHỐI
 *
 *   ① Đơn loại nào có tiền thật?            → đơn kit/thi không có ghi danh ⇒ không bao giờ có
 *                                              phiếu RCP (Q-mở 2). Nếu 0 đơn thì khỏi thiết kế.
 *   ② Khoản CHỜ thiếu ghi danh bao nhiêu?   → xác nhận khoản bị từ chối khi thiếu ghi danh; dòng
 *                                              "Cần gắn ghi danh" to hay nhỏ.
 *   ③ Ai giữ quyền xác nhận, có kiêm không? → cổng GHI theo tập cơ sở của đúng quyền (§9); rủi ro
 *                                              AC5 (người ghi tự xác nhận).
 *   ④ Khoản thu thật theo THÁNG             → chọn mốc `billing.hoaDonTuNgay` (Q-mở 6).
 *   ⑤ Đơn có cả LỜI KHAI lẫn tiền ngân hàng → quy mô trạng thái NGHI_TRUNG (§3.3).
 *   ⑥ Giao dịch giả BACKFILL                → có phải ánh xạ ngược / loại khỏi danh sách gắn không.
 *   ⑦ Tiền trên đơn KHÔNG có cơ sở          → bảng hoá đơn đặt `centerId` NOT NULL có kẹt ai không.
 *   ⑧ Tiền thừa chưa rót                    → Q-mở 5.
 *   ⑨ (phát hiện kèm) dòng gốc ĐÃ BỊ ĐẢO mà vẫn chờ / đã xác nhận / đã có RCP.
 *
 * ⚠️ MỌI CON SỐ Ở ĐÂY LÀ SỐ ĐO. Mỗi phần in kèm PHÉP TÍNH sinh ra nó (luật đọc số —
 * `docs/luat-doc-so-va-ket-luan.md`). Chỗ nào không đo được thì nói KHÔNG ĐO ĐƯỢC, không đoán.
 *
 * ⚠️ "Khoản thu thật", "nguồn giao dịch" và "số tiền ròng" KHÔNG định nghĩa lại ở đây — đi qua
 * `lib/finance/hoa-don/nguon-khoan.ts`, đúng hàm mà màn hoá đơn sẽ dùng. Điều kiện "đã xác nhận"
 * đi qua hàm của `lib/finance/debt` (lưới `truc-a` cấm viết lại điều kiện đó ở chỗ khác).
 * Gom nhóm làm ở JS trên các lượt đọc PHẲNG: không vòng lặp nào chứa truy vấn (không N+1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TỆP NÀY KHÔNG CÓ MỘT ĐƯỜNG GHI NÀO (chép khuôn `bao-cao-nguong-thanh-toan.ts`, ba lớp):
 *   · Không lệnh ghi Prisma nào, không đọc tham số dòng lệnh, không cờ bật ghi.
 *   · Mọi truy vấn chạy trong `SET TRANSACTION READ ONLY` rồi ROLLBACK (callback NÉM).
 *   · Workflow kết nối bằng user CHỈ-ĐỌC (`PROD_DATABASE_URL_RO`).
 * Ca `[HDG0-*]` (`lib/finance/bao-cao-hoa-don-gd0.test.ts`) canh lớp thứ nhất bằng cách quét
 * chính tệp này.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHE DỮ LIỆU CÁ NHÂN — báo cáo đi vào job summary + artifact. Không đọc cột cá nhân nào của
 * khách. `Payment.note` CÓ được đọc (đó là nơi duy nhất chứa marker nối khoản với giao dịch),
 * nhưng CHỈ được đưa vào `nguonGiaoDich(...)` — không in, không cắt, không ghép vào chuỗi nào.
 * Ca `[HDG0-03]` khoá điều đó. `userId` chỉ dùng để ĐẾM, không in ra.
 */
// PHẢI đứng TRƯỚC import lib/db — Prisma đọc DATABASE_URL lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { writeFileSync } from "node:fs";
import { db } from "../lib/db";
import { kiemQuyen } from "./_kiem-quyen";
import { laKhoanDaXacNhan } from "../lib/finance/debt";
import { nguonGiaoDich, soTienRong, type NguonGiaoDich } from "../lib/finance/hoa-don/nguon-khoan";

/** Trần liệt kê mã đơn. Vượt trần thì NÓI RÕ đã bỏ bao nhiêu — không cắt im lặng. */
const TRAN_LIET_KE = 40;

/** Quyền của màn hoá đơn (PLAN §9). */
const QUYEN_XAC_NHAN = "payments:confirm";

const ra: string[] = [];
function in_(s = ""): void {
  ra.push(s);
}

function bang(dong: string[][], dau: string[]): void {
  in_(`| ${dau.join(" | ")} |`);
  in_(`|${dau.map(() => "---").join("|")}|`);
  for (const d of dong) in_(`| ${d.join(" | ")} |`);
}

function tien(n: number): string {
  return `${n.toLocaleString("vi-VN")}đ`;
}

/** Nhánh đang chạy báo cáo — số là dữ liệu PROD, nhưng luật đọc là của nhánh này. */
function nhanhChay(): string {
  return process.env.GITHUB_REF_NAME?.trim() || "(chạy tay, ngoài workflow)";
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// ═══════════════════════════════════════════════════════════════════════════
// TỰ KHAI QUYỀN ĐỌC TRÊN CHÍNH BẢNG MÌNH ĐỌC
// (`kiemQuyen()` dùng chung hỏi trên `ClassSession` — đúng cho vế "ghi được không", sai bảng
// cho vế "đọc được không". Nên vế đọc kiểm tại chỗ, trên đúng các bảng dưới.)
// ═══════════════════════════════════════════════════════════════════════════
const BANG_DOC = [
  "Order",
  "Payment",
  "Receipt",
  "BankTransaction",
  "CreditBalance",
  "UserOrgRole",
  "RoleDef",
  "RolePermission",
  "OrgUnit",
] as const;

async function kiemDocDuoc(tx: Tx): Promise<string[]> {
  const thieu: string[] = [];
  for (const b of BANG_DOC) {
    try {
      const r = await tx.$queryRaw<{ doc_duoc: boolean | null }[]>`
        SELECT has_table_privilege(current_user, ${`public."${b}"`}, 'SELECT') AS doc_duoc
      `;
      if (r[0]?.doc_duoc !== true) thieu.push(b);
    } catch {
      thieu.push(b);
    }
  }
  return thieu;
}

// ═══════════════════════════════════════════════════════════════════════════
// ĐỌC PHẲNG — mọi phần dưới dùng chung các mảng này
// ═══════════════════════════════════════════════════════════════════════════

async function docKhoan(tx: Tx) {
  // Tầng base của `lib/db.ts` tự ẩn dòng đã xoá mềm ở `findMany` TOP-LEVEL — nên ở đây chỉ có
  // dòng còn sống, và dòng đảo đã xoá không được trừ vào gốc (đúng ý `soTienRong`). Quan hệ
  // LỒNG (`receipts`, `order`) KHÔNG được hook ⇒ tự đọc `deletedAt` và tự lọc ở JS.
  return tx.payment.findMany({
    select: {
      id: true,
      amount: true,
      method: true,
      note: true,
      paymentType: true,
      accountantStatus: true,
      enrollmentId: true,
      recordedById: true,
      adjustmentOfId: true,
      paidDate: true,
      deletedAt: true,
      receipts: { select: { status: true, deletedAt: true } },
      order: {
        select: {
          code: true,
          type: true,
          status: true,
          centerId: true,
          leadId: true,
          studentId: true,
          deletedAt: true,
        },
      },
    },
  });
}
type Khoan = Awaited<ReturnType<typeof docKhoan>>[number];

async function docGiaoDich(tx: Tx) {
  return tx.bankTransaction.findMany({
    select: { id: true, provider: true, providerTxnId: true, transferredAt: true, status: true },
  });
}
type GiaoDich = Awaited<ReturnType<typeof docGiaoDich>>[number];

type Ngu = {
  khoan: Khoan[];
  rong: Map<string, number>;
  nguon: Map<string, NguonGiaoDich>;
  /** Khoản THU THẬT còn sống — tập nền của mọi phần dưới (định nghĩa ở `laKhoanThuThat`). */
  thuThat: Khoan[];
  giaoDich: GiaoDich[];
  gdTheoKhoa: Map<string, GiaoDich>;
  gdTheoId: Map<string, GiaoDich>;
};

/**
 * "Khoản thu thật" — tập ứng viên của hàng chờ hoá đơn (PLAN §2.1), TRỪ hai vế chưa đo được ở
 * GĐ 0: mốc ngày (chưa chốt — phần ④ đo để chọn) và trạng thái đơn (in riêng ở từng phần).
 */
function laKhoanThuThat(k: Khoan, rong: Map<string, number>, nguon: NguonGiaoDich): boolean {
  return (
    k.deletedAt == null &&
    k.order.deletedAt == null &&
    k.paymentType === "PAYMENT" &&
    k.amount > 0 &&
    (rong.get(k.id) ?? 0) > 0 &&
    k.accountantStatus !== "REJECTED" &&
    k.method !== "chuyen-noi-bo" &&
    nguon.loai !== "LICH_SU" &&
    nguon.loai !== "CHUYEN_NOI_BO"
  );
}

function khoaGiaoDich(provider: string, providerTxnId: string): string {
  // Marker ghi provider CHỮ THƯỜNG, cột lưu "SEPAY"/"PAYOS" ⇒ so không phân biệt hoa thường.
  return `${provider.toLowerCase()}|${providerTxnId}`;
}

/** Giao dịch mà khoản này trỏ tới, nếu tìm được. */
function giaoDichCua(n: NguonGiaoDich, ngu: Pick<Ngu, "gdTheoKhoa" | "gdTheoId">): GiaoDich | null {
  if (n.loai === "WEBHOOK") return ngu.gdTheoKhoa.get(khoaGiaoDich(n.provider, n.providerTxnId)) ?? null;
  if (n.loai === "GAN_TAY") return ngu.gdTheoId.get(n.bankTransactionId) ?? null;
  return null;
}

/**
 * Tháng thu (YYYY-MM). Có giao dịch ⇒ `transferredAt`, không ⇒ `paidDate`.
 *
 * ⚠️ `transferredAt` của SePay là GIỜ VIỆT NAM mang nhãn UTC (`parseTransferredAt` gọi
 * `new Date("2026-09-24 14:02:00")` trên máy chủ UTC). Nên đọc các trường UTC của nó là đọc
 * đúng lịch VN. `paidDate` là thời điểm thật ⇒ phải cộng 7 giờ mới ra lịch VN.
 */
function thangThu(k: Khoan, gd: GiaoDich | null): string {
  if (gd) return gd.transferredAt.toISOString().slice(0, 7);
  return new Date(k.paidDate.getTime() + 7 * 3600_000).toISOString().slice(0, 7);
}

// ═══════════════════════════════════════════════════════════════════════════
// ① ĐƠN THEO LOẠI CÓ TIỀN THẬT
// ═══════════════════════════════════════════════════════════════════════════
function phan1(ngu: Ngu): void {
  in_(`## ① Khoản thu thật theo LOẠI ĐƠN`);
  in_();
  in_(
    `**Phép tính:** khoản thu thật = \`laKhoanThuThat\` (PAYMENT · \`amount > 0\` · ròng > 0 · ` +
      `không REJECTED · không chuyển nội bộ · không nhập lịch sử · đơn và khoản chưa xoá). ` +
      `Ròng = \`soTienRong\` (lib/finance/hoa-don/nguon-khoan.ts). "Có RCP" = có \`Receipt\` ` +
      `ACTIVE chưa xoá. "Đã xác nhận" = \`laKhoanDaXacNhan\` (lib/finance/debt).`,
  );
  in_();
  const theoLoai = new Map<
    string,
    { don: Set<string>; khoan: number; tong: number; cho: number; daXn: number; coRcp: number }
  >();
  for (const k of ngu.thuThat) {
    const cu = theoLoai.get(k.order.type) ?? { don: new Set(), khoan: 0, tong: 0, cho: 0, daXn: 0, coRcp: 0 };
    cu.don.add(k.order.code);
    cu.khoan += 1;
    cu.tong += ngu.rong.get(k.id) ?? 0;
    if (k.accountantStatus === "PENDING") cu.cho += 1;
    if (laKhoanDaXacNhan(k)) cu.daXn += 1;
    if (k.receipts.some((r) => r.status === "ACTIVE" && r.deletedAt == null)) cu.coRcp += 1;
    theoLoai.set(k.order.type, cu);
  }
  bang(
    [...theoLoai.entries()]
      .sort((a, b) => b[1].khoan - a[1].khoan)
      .map(([loai, v]) => [
        loai,
        String(v.don.size),
        String(v.khoan),
        tien(v.tong),
        String(v.cho),
        String(v.daXn),
        String(v.coRcp),
      ]),
    ["loại đơn", "số đơn", "số khoản", "Σ ròng", "khoản CHỜ", "khoản đã xác nhận", "khoản có RCP"],
  );
  in_();
  in_(
    `**Đọc:** dòng PRODUCT / EXAM có số khoản > 0 ⇒ Q-mở 2 là việc thật (đơn không có ghi danh ` +
      `thì không bao giờ có RCP). Bằng 0 ⇒ bỏ qua được.`,
  );
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ② KHOẢN CHỜ THIẾU GHI DANH
// ═══════════════════════════════════════════════════════════════════════════
function phan2(ngu: Ngu): void {
  in_(`## ② Khoản CHỜ xác nhận mà THIẾU ghi danh`);
  in_();
  in_(
    `**Phép tính:** khoản thu thật · \`accountantStatus = PENDING\` · \`enrollmentId IS NULL\`. ` +
      `\`confirmPayment\` từ chối đúng tập này (\`lib/finance/payment.ts\`). Với đơn COURSE, tách ` +
      `riêng nhóm "đơn lập từ lead chưa chuyển đổi" (\`leadId\` có, \`studentId\` NULL) — nhóm mà ` +
      `\`ganGhiDanhChoKhoanAction\` từ chối.`,
  );
  in_();
  const thieu = ngu.thuThat.filter((k) => k.accountantStatus === "PENDING" && k.enrollmentId == null);
  const choTong = ngu.thuThat.filter((k) => k.accountantStatus === "PENDING").length;
  const theoLoai = new Map<string, { khoan: number; tong: number; tuLead: number }>();
  for (const k of thieu) {
    const cu = theoLoai.get(k.order.type) ?? { khoan: 0, tong: 0, tuLead: 0 };
    cu.khoan += 1;
    cu.tong += ngu.rong.get(k.id) ?? 0;
    if (k.order.leadId != null && k.order.studentId == null) cu.tuLead += 1;
    theoLoai.set(k.order.type, cu);
  }
  if (thieu.length === 0) {
    in_(`**Không có khoản CHỜ nào thiếu ghi danh.**`);
  } else {
    bang(
      [...theoLoai.entries()]
        .sort((a, b) => b[1].khoan - a[1].khoan)
        .map(([loai, v]) => [loai, String(v.khoan), tien(v.tong), String(v.tuLead)]),
      ["loại đơn", "khoản thiếu ghi danh", "Σ ròng", "trong đó: đơn từ lead, chưa có học viên"],
    );
  }
  in_();
  in_(`**${thieu.length}/${choTong} khoản CHỜ đang thiếu ghi danh.**`);
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ AI GIỮ QUYỀN XÁC NHẬN — và có kiêm vai tiền ở cơ sở khác không
// ═══════════════════════════════════════════════════════════════════════════
async function phan3(tx: Tx, ngu: Ngu): Promise<void> {
  in_(`## ③ Người giữ \`${QUYEN_XAC_NHAN}\` (RBAC v2 — đọc từ \`UserOrgRole\`)`);
  in_();
  const now = new Date();
  in_(
    `**Phép tính:** \`UserOrgRole\` \`status = ACTIVE\`, \`effectiveFrom ≤ bây giờ\`, ` +
      `\`effectiveTo\` trống hoặc sau bây giờ, vai \`isActive\`. Quyền đọc từ \`RolePermission\` ` +
      `của vai đó. "Kiêm" = cùng người, có một vai mang quyền \`payments:*\` BẤT KỲ neo ở một đơn vị ` +
      `KHÔNG nằm trong tập đơn vị mà họ giữ \`${QUYEN_XAC_NHAN}\` (PLAN §9). Không tính grant ` +
      `theo người (\`UserPermissionGrant\`). userId chỉ dùng để đếm, không in.`,
  );
  in_();

  const [gan, donVi] = await Promise.all([
    tx.userOrgRole.findMany({
      where: {
        status: "ACTIVE",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        role: { isActive: true },
      },
      select: {
        userId: true,
        orgUnitId: true,
        role: { select: { code: true, permissions: { select: { action: true } } } },
      },
    }),
    tx.orgUnit.findMany({ select: { id: true, code: true, type: true } }),
  ]);
  const maDonVi = new Map(donVi.map((d) => [d.id, `${d.code} (${d.type})`]));

  const giuXacNhan = new Map<string, Set<string>>(); // userId → đơn vị giữ quyền xác nhận
  const giuTien = new Map<string, Set<string>>(); // userId → đơn vị có vai mang payments:*
  const theoVaiDonVi = new Map<string, Set<string>>(); // "vai @ đơn vị" → userId
  for (const g of gan) {
    const actions = g.role.permissions.map((p) => p.action);
    if (actions.some((a) => a.startsWith("payments:"))) {
      const s = giuTien.get(g.userId) ?? new Set();
      s.add(g.orgUnitId);
      giuTien.set(g.userId, s);
    }
    if (actions.includes(QUYEN_XAC_NHAN)) {
      const s = giuXacNhan.get(g.userId) ?? new Set();
      s.add(g.orgUnitId);
      giuXacNhan.set(g.userId, s);
      const khoa = `${g.role.code} @ ${maDonVi.get(g.orgUnitId) ?? "(đơn vị không đọc được)"}`;
      const u = theoVaiDonVi.get(khoa) ?? new Set();
      u.add(g.userId);
      theoVaiDonVi.set(khoa, u);
    }
  }

  if (giuXacNhan.size === 0) {
    in_(`⚠️ **KHÔNG AI giữ \`${QUYEN_XAC_NHAN}\`** theo \`UserOrgRole\` — màn hoá đơn sẽ không ai vào được.`);
    in_();
    return;
  }
  bang(
    [...theoVaiDonVi.entries()].sort().map(([k, u]) => [k, String(u.size)]),
    ["vai @ đơn vị", "số người"],
  );
  in_();
  const kiem = [...giuXacNhan.entries()].filter(([uid, dvXn]) =>
    [...(giuTien.get(uid) ?? [])].some((dv) => !dvXn.has(dv)),
  ).length;
  in_(
    `**${giuXacNhan.size} người** giữ \`${QUYEN_XAC_NHAN}\` · **${kiem}** người trong đó KIÊM vai ` +
      `tiền ở đơn vị khác (⇒ cổng GHI phải tính tập cơ sở theo đúng quyền, PLAN §9).`,
  );
  in_();

  // AC5 — người ghi nhận không được tự xác nhận khoản của mình.
  const tuGhi = ngu.thuThat.filter(
    (k) => k.accountantStatus === "PENDING" && k.recordedById != null && giuXacNhan.has(k.recordedById),
  );
  in_(
    `**Khoản CHỜ do CHÍNH người giữ quyền xác nhận ghi nhận:** **${tuGhi.length}** khoản, ` +
      `Σ ${tien(tuGhi.reduce((s, k) => s + (ngu.rong.get(k.id) ?? 0), 0))} — luật tách nhiệm vụ ` +
      `(AC5) cấm người đó tự xác nhận. Nếu cả hệ chỉ có một kế toán thì các khoản này chỉ ` +
      `SUPER_ADMIN xác nhận được.`,
  );
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ KHOẢN THU THẬT THEO THÁNG — để chọn mốc
// ═══════════════════════════════════════════════════════════════════════════
function phan4(ngu: Ngu): void {
  in_(`## ④ Khoản thu thật theo THÁNG THU — để chọn mốc \`billing.hoaDonTuNgay\``);
  in_();
  in_(
    `**Phép tính:** tháng thu = \`BankTransaction.transferredAt\` (lịch VN) nếu khoản trỏ được ` +
      `tới giao dịch, không thì \`paidDate\` quy về lịch VN. Nguồn theo \`nguonGiaoDich\`: ` +
      `CK = WEBHOOK/GAN_TAY · lời khai = LOI_KHAI · tay = KHONG.`,
  );
  in_();
  const theoThang = new Map<
    string,
    { khoan: number; tong: number; daXn: number; ck: number; khai: number; tay: number }
  >();
  let khongThayGd = 0;
  for (const k of ngu.thuThat) {
    const n = ngu.nguon.get(k.id)!;
    const gd = giaoDichCua(n, ngu);
    if ((n.loai === "WEBHOOK" || n.loai === "GAN_TAY") && gd == null) khongThayGd += 1;
    const t = thangThu(k, gd);
    const cu = theoThang.get(t) ?? { khoan: 0, tong: 0, daXn: 0, ck: 0, khai: 0, tay: 0 };
    cu.khoan += 1;
    cu.tong += ngu.rong.get(k.id) ?? 0;
    if (laKhoanDaXacNhan(k)) cu.daXn += 1;
    if (n.loai === "WEBHOOK" || n.loai === "GAN_TAY") cu.ck += 1;
    else if (n.loai === "LOI_KHAI") cu.khai += 1;
    else cu.tay += 1;
    theoThang.set(t, cu);
  }
  bang(
    [...theoThang.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([t, v]) => [t, String(v.khoan), tien(v.tong), String(v.daXn), String(v.ck), String(v.khai), String(v.tay)]),
    ["tháng", "khoản", "Σ ròng", "đã xác nhận", "CK", "lời khai", "tay/tiền mặt"],
  );
  in_();
  in_(
    `**Khoản mang marker ngân hàng mà KHÔNG tìm thấy giao dịch:** **${khongThayGd}** ` +
      `(khác 0 ⇒ marker lệch hình dạng với \`BankTransaction\` — phải biết trước khi gom "lần thu").`,
  );
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ ĐƠN CÓ CẢ LỜI KHAI LẪN TIỀN NGÂN HÀNG — nghi trùng
// ═══════════════════════════════════════════════════════════════════════════
function phan5(ngu: Ngu): void {
  in_(`## ⑤ Đơn có CẢ khoản lời khai LẪN khoản ngân hàng (nghi trùng — PLAN §3.3)`);
  in_();
  in_(
    `**Phép tính:** trên khoản thu thật, gom theo đơn; đơn có ≥1 khoản \`LOI_KHAI\` ` +
      `(khoản hệ tự sinh khi xác nhận đơn / theo đợt) **và** ≥1 khoản WEBHOOK/GAN_TAY. ` +
      `⚠️ KHÔNG đo được vế "lời khai + giao dịch UNMATCHED cùng SĐT" — việc đó cần đọc SĐT, mà ` +
      `báo cáo này không đọc cột cá nhân.`,
  );
  in_();
  const theoDon = new Map<string, { khai: number; nh: number; tongKhai: number; tongNh: number }>();
  for (const k of ngu.thuThat) {
    const n = ngu.nguon.get(k.id)!;
    const cu = theoDon.get(k.order.code) ?? { khai: 0, nh: 0, tongKhai: 0, tongNh: 0 };
    const r = ngu.rong.get(k.id) ?? 0;
    if (n.loai === "LOI_KHAI") {
      cu.khai += 1;
      cu.tongKhai += r;
    } else if (n.loai === "WEBHOOK" || n.loai === "GAN_TAY") {
      cu.nh += 1;
      cu.tongNh += r;
    }
    theoDon.set(k.order.code, cu);
  }
  const nghi = [...theoDon.entries()].filter(([, v]) => v.khai > 0 && v.nh > 0);
  const chiKhai = [...theoDon.values()].filter((v) => v.khai > 0 && v.nh === 0).length;
  if (nghi.length === 0) {
    in_(`**Không có đơn nào mang cả hai họ.**`);
  } else {
    const dong = nghi.map(([ma, v]) => [ma, String(v.khai), tien(v.tongKhai), String(v.nh), tien(v.tongNh)]);
    bang(dong.slice(0, TRAN_LIET_KE), ["mã đơn", "khoản lời khai", "Σ lời khai", "khoản ngân hàng", "Σ ngân hàng"]);
    in_();
    in_(`**Tổng ${nghi.length} đơn.**`);
    if (dong.length > TRAN_LIET_KE) in_(`⚠️ Chỉ hiện ${TRAN_LIET_KE} dòng đầu — **đã bỏ ${dong.length - TRAN_LIET_KE} dòng**.`);
  }
  in_();
  in_(`**Đơn CHỈ có lời khai (không khoản ngân hàng nào):** **${chiKhai}**.`);
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ GIAO DỊCH GIẢ BACKFILL
// ═══════════════════════════════════════════════════════════════════════════
function phan6(ngu: Ngu): void {
  in_(`## ⑥ \`BankTransaction\` provider \`BACKFILL\` (giao dịch GIẢ)`);
  in_();
  in_(`**Phép tính:** \`provider\` = \`BACKFILL\` (không phân biệt hoa thường), gom theo \`status\`.`);
  in_();
  const gia = ngu.giaoDich.filter((g) => g.provider.toUpperCase() === "BACKFILL");
  if (gia.length === 0) {
    in_(`**Không có giao dịch BACKFILL nào** — bỏ được nhánh ánh xạ ngược trong \`lan-thu.ts\`.`);
  } else {
    const theo = new Map<string, number>();
    for (const g of gia) theo.set(g.status, (theo.get(g.status) ?? 0) + 1);
    bang([...theo.entries()].map(([s, n]) => [s, String(n)]), ["trạng thái", "số giao dịch"]);
    in_();
    in_(`**Tổng ${gia.length}.** Tập UNMATCHED KHÔNG được xuất hiện trong danh sách "gắn thêm cho đủ".`);
  }
  in_();
  const tatCa = new Map<string, number>();
  for (const g of ngu.giaoDich) tatCa.set(g.provider, (tatCa.get(g.provider) ?? 0) + 1);
  in_(`_Mọi provider đang có:_ ${[...tatCa.entries()].map(([p, n]) => `\`${p}\` ${n}`).join(" · ") || "—"}`);
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ TIỀN TRÊN ĐƠN KHÔNG CÓ CƠ SỞ
// ═══════════════════════════════════════════════════════════════════════════
function phan7(ngu: Ngu): void {
  in_(`## ⑦ Khoản thu thật trên đơn KHÔNG có \`centerId\``);
  in_();
  in_(`**Phép tính:** khoản thu thật có \`Order.centerId IS NULL\`. Bảng hoá đơn đặt \`centerId\` NOT NULL.`);
  in_();
  const khong = ngu.thuThat.filter((k) => k.order.centerId == null);
  const don = new Set(khong.map((k) => k.order.code));
  in_(
    `**${khong.length}** khoản · **${don.size}** đơn · Σ ${tien(khong.reduce((s, k) => s + (ngu.rong.get(k.id) ?? 0), 0))}. ` +
      `Khác 0 ⇒ các đơn này hiện "Gán cơ sở cho đơn trước", không vào hàng chờ.`,
  );
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ TIỀN THỪA CHƯA RÓT
// ═══════════════════════════════════════════════════════════════════════════
async function phan8(tx: Tx): Promise<void> {
  in_(`## ⑧ Tiền thừa chưa rót (\`CreditBalance\`)`);
  in_();
  in_(`**Phép tính:** \`CreditBalance\` có \`settledAt IS NULL\`.`);
  in_();
  const r = await tx.creditBalance.aggregate({
    where: { settledAt: null },
    _sum: { amount: true },
    _count: { _all: true },
  });
  in_(`**${r._count._all}** dòng · Σ **${tien(r._sum.amount ?? 0)}** — hiện NGOÀI phạm vi hoá đơn (Q-mở 5).`);
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ PHÁT HIỆN KÈM — dòng gốc đã bị đảo
// ═══════════════════════════════════════════════════════════════════════════
function phan9(ngu: Ngu): void {
  in_(`## ⑨ (phát hiện kèm) Dòng GỐC đã bị đảo trọn`);
  in_();
  in_(
    `**Phép tính:** khoản \`PAYMENT\` còn sống, \`amount > 0\`, mà \`soTienRong ≤ 0\` (tách / gỡ gắn / ` +
      `hoàn toàn phần). Hôm nay \`confirmPayment\` KHÔNG kiểm điều này ⇒ dòng CHỜ trong tập dưới ` +
      `xác nhận được ở \`/payments\`, và được cấp RCP cho tiền đã gỡ. PLAN §4 vá tại \`xacNhanKhoanTrongTx\`.`,
  );
  in_();
  const dao = ngu.khoan.filter(
    (k) => k.deletedAt == null && k.paymentType === "PAYMENT" && k.amount > 0 && (ngu.rong.get(k.id) ?? 0) <= 0,
  );
  const theo = new Map<string, { n: number; rcp: number }>();
  for (const k of dao) {
    const cu = theo.get(k.accountantStatus) ?? { n: 0, rcp: 0 };
    cu.n += 1;
    if (k.receipts.some((r) => r.status === "ACTIVE" && r.deletedAt == null)) cu.rcp += 1;
    theo.set(k.accountantStatus, cu);
  }
  if (dao.length === 0) {
    in_(`**Không có dòng gốc nào bị đảo trọn.**`);
  } else {
    bang(
      [...theo.entries()].map(([s, v]) => [s, String(v.n), String(v.rcp)]),
      ["trạng thái kế toán", "dòng gốc bị đảo trọn", "trong đó có RCP ACTIVE"],
    );
  }
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  in_(`# Báo cáo GĐ 0 — màn kế toán hoá đơn — CHỈ ĐỌC`);
  in_();
  const quyen = await kiemQuyen(db);
  in_(
    `**Kết nối:** \`${currentDbHost()}\` · user \`${quyen.nguoiDung}\` · ` +
      `ghi được: **${quyen.ghiDuoc === null ? "không kiểm được" : quyen.ghiDuoc ? "CÓ QUYỀN GHI ⚠️" : "KHÔNG (chỉ đọc)"}**`,
  );
  in_();
  in_(
    `**Đọc bằng luật của nhánh:** \`${nhanhChay()}\` — số là dữ liệu PROD, nhưng các hàm dùng ` +
      `chung là của nhánh này. Trích lại số thì trích kèm dòng này.`,
  );
  if (quyen.ghiDuoc === true) {
    in_();
    in_(
      `> ⚠️ Kết nối **CÓ QUYỀN GHI**. Tệp này không chứa lệnh ghi và transaction là READ ONLY, ` +
        `nhưng secret đang trỏ nhầm sang chuỗi đầy quyền — xem \`docs/cham-cong/USER-CHI-DOC-PROD.md\`.`,
    );
  }
  in_();
  in_(`Kế hoạch: \`docs/ke-toan-hoa-don/PLAN.md\` · mục 11 (GĐ 0) và 12.`);
  in_();
  in_(`---`);
  in_();

  // ⚠️ READ ONLY + ROLLBACK. `$transaction` chỉ rollback khi callback NÉM — `return` KHÔNG
  // rollback (CLAUDE.md mục "Luật rollback").
  const KET = "__BAO_CAO_XONG__";
  let xong = false;
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;

        const thieu = await kiemDocDuoc(tx);
        if (thieu.length > 0) {
          in_(
            `> ⚠️ **User này KHÔNG có quyền SELECT trên: ${thieu.map((b) => `\`${b}\``).join(", ")}** ` +
              `— mọi số liên quan bên dưới sẽ là 0, và con số 0 đó **KHÔNG phải sự thật**.`,
          );
          in_();
        }

        const [khoan, giaoDich] = await Promise.all([docKhoan(tx), docGiaoDich(tx)]);
        const rong = soTienRong(khoan);
        const nguon = new Map(khoan.map((k) => [k.id, nguonGiaoDich(k.note)]));
        const ngu: Ngu = {
          khoan,
          rong,
          nguon,
          thuThat: khoan.filter((k) => laKhoanThuThat(k, rong, nguon.get(k.id)!)),
          giaoDich,
          gdTheoKhoa: new Map(giaoDich.map((g) => [khoaGiaoDich(g.provider, g.providerTxnId), g])),
          gdTheoId: new Map(giaoDich.map((g) => [g.id, g])),
        };
        in_(
          `**Tập nền:** ${khoan.length} dòng \`Payment\` còn sống · ${ngu.thuThat.length} khoản thu ` +
            `thật · ${giaoDich.length} \`BankTransaction\`.`,
        );
        in_();
        in_(`---`);
        in_();

        phan1(ngu);
        in_(`---`);
        in_();
        phan2(ngu);
        in_(`---`);
        in_();
        await phan3(tx, ngu);
        in_(`---`);
        in_();
        phan4(ngu);
        in_(`---`);
        in_();
        phan5(ngu);
        in_(`---`);
        in_();
        phan6(ngu);
        in_(`---`);
        in_();
        phan7(ngu);
        in_(`---`);
        in_();
        await phan8(tx);
        in_(`---`);
        in_();
        phan9(ngu);
        xong = true;
        throw new Error(KET);
      },
      // Trần mặc định của transaction TƯƠNG TÁC là 5 giây; ~15 câu đọc phẳng qua WAN. Tệp này
      // KHÔNG có N+1 — trần chỉ để một transaction ĐỌC không bị cắt giữa đường.
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!(e instanceof Error) || e.message !== KET) throw e;
  }
  if (!xong) throw new Error("Không dựng được báo cáo");

  in_();
  in_(`---`);
  in_();
  in_(`_Báo cáo CHỈ ĐỌC. Transaction \`READ ONLY\` + rollback. Không cột cá nhân nào được in._`);

  writeFileSync("bao-cao-hoa-don-gd0.md", ra.join("\n"), "utf8");
  console.error("\n[ĐÃ GHI] bao-cao-hoa-don-gd0.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
