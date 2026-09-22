/**
 * scripts/bao-cao-nguong-thanh-toan.ts — ĐO 4 CON SỐ CHO ĐỢT "QUY TRÌNH THANH TOÁN". **CHỈ ĐỌC.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Chạy: KHÔNG chạy tay trên prod. Đi qua workflow
 *       `.github/workflows/nguong-thanh-toan-prod-chi-doc.yml` (workflow_dispatch, chỉ `main`).
 *
 * Kế hoạch: `docs/quy-trinh-thanh-toan-2209.md` mục "GĐ 0 — ĐO TRƯỚC KHI CODE".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BỐN CÂU HỎI, VÀ QUYẾT ĐỊNH MÀ MỖI CÂU CHI PHỐI
 *
 *   ① Đơn đang mở có BAO NHIÊU ĐỢT?       → trần mới là 4 (`TRAN_SO_DOT` hiện là 12). Con số này
 *                                            nói quy mô hàng chờ duyệt, và nói QĐ#7 ("chỉ áp đơn
 *                                            MỚI") có đáng giữ không: nhỏ thì áp cho tất cả, luật
 *                                            gọn hơn; lớn thì phải giữ hai chế độ.
 *   ② Dòng đơn có BAO NHIÊU KHOẢN GIẢM?   → trần mới là 1/dòng (`TRAN_KHOAN_GIAM_MOI_DONG` = 5).
 *   ③ Đơn nào đang treo PENDING_APPROVAL? → bật lại màn duyệt mà không lọc theo TRẠNG THÁI ĐƠN
 *                                            thì QLCS mở ra thấy đơn ĐÃ THU ĐỦ nằm chờ; một cú
 *                                            bấm "Từ chối" chạy `revertInstallmentRequests` trên
 *                                            đơn đang giữ tiền thật.
 *   ④ Khoản thu nào suy được "người thu"? → quy mô backfill `Payment.collectedById`, và quy tắc
 *                                            fallback cho đơn không có lead.
 *
 * ⚠️ MỌI CON SỐ Ở ĐÂY LÀ SỐ ĐO, KHÔNG PHẢI SỐ SUY. Mỗi bảng in kèm PHÉP TÍNH sinh ra nó
 * (luật đọc số — `docs/luat-doc-so-va-ket-luan.md`). Chỗ nào không đo được thì nói KHÔNG ĐO
 * ĐƯỢC, không đoán.
 *
 * ⚠️ DÙNG TẦNG PRISMA, KHÔNG DÙNG SQL THÔ để lọc đơn — điều kiện "đơn nào được tính" đi qua
 * `locDonNhanTien()`, đúng mảnh `where` mà đường tiền thật dùng. Chép lại `status NOT IN (…)`
 * bằng tay là tạo bản thứ hai của một luật đã có chủ, và bản sao sẽ lệch đi khi ai đó thêm
 * trạng thái mới — chính lớp lỗi mà `lib/payments/don-nhan-tien.ts` sinh ra để đóng.
 * Gom nhóm làm ở JS trên MỘT lượt đọc phẳng: không vòng lặp nào chứa truy vấn (không N+1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TỆP NÀY KHÔNG CÓ MỘT ĐƯỜNG GHI NÀO — thiết kế, không phải may mắn (chép khuôn
 * `bao-cao-doi-soat-tien.ts`, ba lớp độc lập):
 *
 *   · Không `create`/`update`/`delete`/`upsert`, không đọc tham số dòng lệnh, không cờ bật ghi.
 *     Một cờ thì lật được; một tệp không chứa lệnh ghi thì không.
 *   · Mọi truy vấn chạy trong `SET TRANSACTION READ ONLY` rồi ROLLBACK (callback NÉM — `return`
 *     KHÔNG rollback, luật ở CLAUDE.md mục "Luật rollback").
 *   · Workflow kết nối bằng user CHỈ-ĐỌC (`PROD_DATABASE_URL_RO`), không biết chuỗi đầy quyền.
 *
 * Ca `[NTT-01]`..`[NTT-04]` (`lib/finance/bao-cao-nguong-thanh-toan.test.ts`) canh lớp thứ nhất
 * bằng cách quét chính tệp này.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHE DỮ LIỆU CÁ NHÂN — báo cáo đi vào job summary + artifact, tức nó RỜI KHỎI vòng kiểm soát
 * của DB. Tệp này KHÔNG đọc và KHÔNG in một cột cá nhân nào: không `customerName`, không
 * `customerPhone`, không `customerEmail`, không tên học viên, không nội dung CK. Mã đơn +
 * trạng thái + số tiền là đủ để quyết định; phần còn lại chỉ thêm rủi ro.
 *
 * ⚠️ Vì thế ở đây KHÔNG có hàm `cheSdt` như báo cáo đối soát — không phải quên, mà vì không có
 * SĐT nào được đọc lên để mà che. Ca `[NTT-03]` canh đúng điều đó.
 */
// PHẢI đứng TRƯỚC import lib/db — Prisma đọc DATABASE_URL lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { writeFileSync } from "node:fs";
import { db } from "../lib/db";
import { kiemQuyen } from "./_kiem-quyen";
import { locDonNhanTien } from "../lib/payments/don-nhan-tien";
import { TRAN_SO_DOT } from "../lib/payments/ke-hoach-dot";
import { TRAN_KHOAN_GIAM_MOI_DONG } from "../lib/orders/giam-gia-dong";

/** Ngưỡng ĐANG ĐỀ XUẤT (chốt 22/09/2026) — in ra để bảng đối chiếu tự nói nó đang so với cái gì. */
const NGUONG_DOT_DE_XUAT = 4;
const NGUONG_GIAM_DE_XUAT = 1;

/** Trần liệt kê mã đơn. Vượt trần thì NÓI RÕ đã bỏ bao nhiêu — không cắt im lặng. */
const TRAN_LIET_KE = 40;

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

function ngay(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

/** Gom một mảng khoá thành "khoá → số lần". */
function dem<T>(xs: readonly T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** In bảng phân bố "số đợt → số lượng" + dòng tổng, so với một ngưỡng. */
function inPhanBo(soLuong: readonly number[], nhan: string, nguong: number, donVi: string): void {
  in_(`### ${nhan}`);
  in_();
  if (soLuong.length === 0) {
    in_(`_Không có dòng nào._`);
    in_();
    return;
  }
  const pb = [...dem(soLuong).entries()].sort((a, b) => a[0] - b[0]);
  bang(
    pb.map(([k, n]) => [String(k), String(n), k > nguong ? "**VƯỢT**" : ""]),
    [donVi, "số lượng", `so với trần đề xuất ${nguong}`],
  );
  in_();
  const tong = soLuong.length;
  const vuot = soLuong.filter((n) => n > nguong).length;
  in_(
    `**Tổng: ${tong}** · **vượt trần ${nguong}: ${vuot}** (${Math.round((vuot / tong) * 1000) / 10}%)`,
  );
  in_();
}

/** In danh sách có trần, và NÓI RÕ đã bỏ bao nhiêu dòng. */
function inDanhSach(dong: string[][], dau: string[], tongNhan: string): void {
  const hien = dong.slice(0, TRAN_LIET_KE);
  bang(hien, dau);
  in_();
  in_(`**Tổng ${dong.length} ${tongNhan}.**`);
  if (dong.length > TRAN_LIET_KE) {
    in_(
      `⚠️ Bảng trên chỉ hiện ${TRAN_LIET_KE} dòng đầu — **đã bỏ ${dong.length - TRAN_LIET_KE} dòng**.`,
    );
  }
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// ═══════════════════════════════════════════════════════════════════════════
// TỰ KHAI QUYỀN ĐỌC TRÊN CHÍNH BẢNG MÌNH ĐỌC
//
// ⚠️ `kiemQuyen()` dùng chung hỏi quyền trên `ClassSession` — tên bảng ĐÓNG CỨNG từ đợt chấm
// công (nợ đã ghim ở CLAUDE.md). Nó VẪN đúng việc cho vế "kết nối này có quyền GHI không": một
// vai đầy quyền có UPDATE trên MỌI bảng, nên `ClassSession` đủ để lộ ra secret đặt nhầm.
//
// Nhưng vế "ĐỌC được không" thì nó nói về BẢNG KHÁC với bảng báo cáo này đọc — và một dòng tự
// khai nói về bảng khác thì tệ hơn không có dòng nào. Nên vế đọc kiểm tại chỗ, trên đúng 5 bảng.
//
// KHÔNG sửa `kiemQuyen(db, bang)` ở phiên này: đo được **24 chỗ gọi** (CLAUDE.md ghi "cả hai chỗ
// gọi" — con số đó đã cũ). Thêm tham số bắt buộc là chạm 24 tệp + phải chạy lại cả workflow chấm
// công ⇒ ticket riêng.
// ═══════════════════════════════════════════════════════════════════════════
const BANG_DOC = ["Order", "OrderItem", "Payment", "PaymentRequest", "OrderInstallment"] as const;

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

/**
 * Cột có tồn tại trên DB đang kết nối không.
 *
 * ⚠️ Cần vì báo cáo chạy trên PROD, nơi migration của nhánh feature CHƯA lên. Chọn một cột chưa
 * có thì Prisma ném `P2022` và cả phép đo chết — đúng lỗi gặp 07/09 với `ClassSession.rosterSize`.
 *
 * Bản riêng ở đây (không dùng `coCot` của `_kiem-quyen.ts`) vì hàm đó nhận `PrismaClient`, mà
 * mọi truy vấn của báo cáo này phải nằm TRONG transaction READ ONLY — truyền `db` vào là mở một
 * kết nối thứ hai ngoài transaction, tức phá đúng lớp khoá thứ hai.
 */
async function coCotTrongTx(tx: Tx, bang: string, cot: string): Promise<boolean> {
  try {
    const r = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${bang} AND column_name = ${cot}
    `;
    return Number(r[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ① SỐ ĐỢT — đọc sổ thu THẬT (`PaymentRequest`), không đọc sổ kế hoạch
// ═══════════════════════════════════════════════════════════════════════════
//
// VÌ SAO ĐỌC `PaymentRequest` CHỨ KHÔNG PHẢI `OrderInstallment`: `PaymentRequest` là sổ mà
// QR + đối khớp + công nợ theo con đang đọc (Ledger-B). `OrderInstallment` là sổ kế hoạch cũ
// (Ledger-A), khai `soDot Int // 1 hoặc 2` — nó KHÔNG phản ánh kế hoạch nhiều đợt hiện tại.
// In cả hai để thấy chênh, nhưng con số QUYẾT ĐỊNH là con số của Ledger-B.
//
// `installmentNo = 0` LOẠI RA — số đó nghĩa là phiếu "thu TOÀN ĐƠN", không phải một đợt
// (`schema.prisma`: *"0 = toàn đơn; 1,2,… = số thứ tự đợt"*).
//
// ⚠️ KHÔNG tách được CỌC khỏi ĐỢT: cờ `laCoc` hiện KHÔNG lưu xuống DB (`OrderInstallment` không
// có cột — `order-payment-section.tsx:185-190` tự khai hạn chế này). Nên nếu một kế hoạch có cọc
// thì cọc đang bị ĐẾM NHƯ MỘT ĐỢT ⇒ con số dưới đây là **TRẦN TRÊN** của số đợt học phí thật.
// Báo cáo nói rõ điều đó thay vì im lặng.
async function phan1(tx: Tx): Promise<void> {
  in_(`## ① Số ĐỢT trên đơn đang mở`);
  in_();
  in_(
    `**Phép tính:** đọc \`PaymentRequest\` có \`installmentNo >= 1\` và \`status <> VOID\`, ` +
      `trên đơn lọc bằng \`locDonNhanTien()\` (mảnh \`where\` dùng chung với đường tiền thật: ` +
      `\`deletedAt IS NULL\` + loại DRAFT/CANCELLED/REFUNDED). Gom theo \`orderItemId\` ` +
      `(luồng MỚI — mỗi con một kế hoạch) và theo \`orderId\` (luồng CŨ — \`orderItemId IS NULL\`).`,
  );
  in_();
  in_(
    `⚠️ **Cọc đang bị đếm như một đợt.** Cờ \`laCoc\` không lưu xuống DB, nên số dưới đây là ` +
      `**TRẦN TRÊN** của số đợt học phí thật: kế hoạch "cọc + 1 đợt" hiện ra là "2 đợt".`,
  );
  in_();

  const phieu = await tx.paymentRequest.findMany({
    where: {
      installmentNo: { gte: 1 },
      status: { not: "VOID" },
      order: locDonNhanTien(),
    },
    select: {
      orderId: true,
      orderItemId: true,
      order: { select: { code: true, status: true, totalAmount: true, createdAt: true } },
    },
  });

  // Luồng MỚI: mỗi CON một kế hoạch.
  const theoCon = [...dem(phieu.filter((p) => p.orderItemId != null).map((p) => p.orderItemId!)).values()];
  inPhanBo(theoCon, "Luồng MỚI — gom theo CON (`orderItemId` NOT NULL)", NGUONG_DOT_DE_XUAT, "số đợt");

  // Luồng CŨ: kế hoạch gắn cả ĐƠN.
  const theoDon = [...dem(phieu.filter((p) => p.orderItemId == null).map((p) => p.orderId)).values()];
  inPhanBo(theoDon, "Luồng CŨ — gom theo ĐƠN (`orderItemId IS NULL`)", NGUONG_DOT_DE_XUAT, "số đợt");

  // Sổ kế hoạch cũ (Ledger-A) — để đối chiếu, KHÔNG dùng để quyết định.
  const ledgerA = await tx.orderInstallment.findMany({
    where: { order: locDonNhanTien() },
    select: { orderId: true },
  });
  in_(`### Đối chiếu — sổ kế hoạch CŨ \`OrderInstallment\` (Ledger-A)`);
  in_();
  in_(
    `_Không dùng để quyết định._ Sổ này khai \`soDot Int // 1 hoặc 2\`; in ra để thấy nó lệch bao ` +
      `nhiêu so với sổ thu thật ở trên.`,
  );
  in_();
  const pbA = [...dem(ledgerA.map((r) => r.orderId)).values()];
  if (pbA.length === 0) in_(`_Không có dòng nào._`);
  else
    bang(
      [...dem(pbA).entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => [String(k), String(n)]),
      ["số đợt", "số đơn"],
    );
  in_();

  // Liệt kê đơn vượt trần — gom theo ĐƠN (cộng mọi con).
  const theoDonTatCa = dem(phieu.map((p) => p.orderId));
  const donInfo = new Map(phieu.map((p) => [p.orderId, p.order]));
  const vuot = [...theoDonTatCa.entries()]
    .filter(([, n]) => n > NGUONG_DOT_DE_XUAT)
    .sort((a, b) => b[1] - a[1]);

  in_(`### Đơn vượt trần — liệt kê`);
  in_();
  in_(
    `_Gom theo ĐƠN (cộng mọi con) để trả lời "đơn nào sẽ vào hàng chờ". Một đơn 2 con × 3 đợt ` +
      `hiện ở đây là 6 — đó là số đợt của ĐƠN, không phải của một con._`,
  );
  in_();
  if (vuot.length === 0) {
    in_(`**Không có đơn nào vượt trần ${NGUONG_DOT_DE_XUAT}.**`);
  } else {
    inDanhSach(
      vuot.map(([id, n]) => {
        const o = donInfo.get(id);
        return [o?.code ?? "—", o?.status ?? "—", String(n), tien(o?.totalAmount ?? 0), ngay(o?.createdAt ?? null)];
      }),
      ["mã đơn", "trạng thái", "số đợt (cả đơn)", "tổng tiền", "tạo ngày"],
      "đơn vượt trần",
    );
  }
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ② SỐ KHOẢN GIẢM TRÊN MỘT DÒNG ĐƠN
// ═══════════════════════════════════════════════════════════════════════════
//
// `OrderItem.discounts` là JSONB mang MẢNG các khoản giảm (thêm 15/09,
// `20260915170000_order_item_nhieu_giam_gia`).
//
// ⚠️ Dòng có `discounts IS NULL` nhưng `discountAmount > 0` là dòng đời CŨ (giảm giá khai bằng
// cặp `discountAmount`/`discountPercent` trước khi có mảng). Đếm RIÊNG — chúng có ĐÚNG 1 khoản
// về mặt nghiệp vụ, nên KHÔNG vượt trần 1; gộp chúng vào nhóm "0 khoản" là nói sai.
async function phan2(tx: Tx): Promise<void> {
  in_(`## ② Số KHOẢN GIẢM trên một DÒNG đơn`);
  in_();

  if (!(await coCotTrongTx(tx, "OrderItem", "discounts"))) {
    in_(
      `⚠️ **KHÔNG ĐO ĐƯỢC.** Cột \`OrderItem.discounts\` chưa tồn tại trên DB đang kết nối ` +
        `(migration \`20260915170000_order_item_nhieu_giam_gia\` chưa apply). Không đoán.`,
    );
    in_();
    return;
  }

  in_(
    `**Phép tính:** độ dài mảng \`OrderItem.discounts\` trên đơn lọc bằng \`locDonNhanTien()\`. ` +
      `Ngưỡng đề xuất: **${NGUONG_GIAM_DE_XUAT} khoản/dòng** ` +
      `(hằng hiện tại \`TRAN_KHOAN_GIAM_MOI_DONG = ${TRAN_KHOAN_GIAM_MOI_DONG}\`).`,
  );
  in_();

  const dongDon = await tx.orderItem.findMany({
    where: { order: locDonNhanTien() },
    select: {
      discounts: true,
      discountAmount: true,
      orderId: true,
      order: { select: { code: true, status: true, createdAt: true } },
    },
  });

  const soKhoan = (d: unknown): number | null => (Array.isArray(d) ? d.length : null);

  const coMang = dongDon.filter((r) => soKhoan(r.discounts) != null);
  inPhanBo(
    coMang.map((r) => soKhoan(r.discounts)!),
    "Phân bố",
    NGUONG_GIAM_DE_XUAT,
    "số khoản/dòng",
  );

  const doiCu = dongDon.filter((r) => soKhoan(r.discounts) == null && r.discountAmount > 0).length;
  in_(
    `**Dòng đời CŨ** (\`discounts\` không phải mảng nhưng \`discountAmount > 0\`): **${doiCu}** ` +
      `— mỗi dòng đúng 1 khoản về nghiệp vụ, **không** vượt trần.`,
  );
  in_();

  // Liệt kê đơn có dòng vượt trần — gom theo ĐƠN.
  const vuotTheoDon = new Map<
    string,
    { code: string; status: string; createdAt: Date; maxKhoan: number; soDong: number }
  >();
  for (const r of coMang) {
    const n = soKhoan(r.discounts)!;
    if (n <= NGUONG_GIAM_DE_XUAT) continue;
    const cu = vuotTheoDon.get(r.orderId);
    if (cu) {
      cu.maxKhoan = Math.max(cu.maxKhoan, n);
      cu.soDong += 1;
    } else {
      vuotTheoDon.set(r.orderId, {
        code: r.order.code,
        status: r.order.status,
        createdAt: r.order.createdAt,
        maxKhoan: n,
        soDong: 1,
      });
    }
  }

  in_(`### Đơn có dòng vượt trần — liệt kê`);
  in_();
  if (vuotTheoDon.size === 0) {
    in_(`**Không có đơn nào có dòng vượt trần ${NGUONG_GIAM_DE_XUAT}.**`);
  } else {
    inDanhSach(
      [...vuotTheoDon.values()]
        .sort((a, b) => b.maxKhoan - a.maxKhoan)
        .map((r) => [r.code, r.status, String(r.maxKhoan), String(r.soDong), ngay(r.createdAt)]),
      ["mã đơn", "trạng thái", "khoản nhiều nhất trên 1 dòng", "số dòng vượt", "tạo ngày"],
      "đơn",
    );
  }
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ ĐƠN TREO `PENDING_APPROVAL`
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ ĐÂY LÀ CON SỐ PHẢI ĐO, KHÔNG ĐƯỢC TRÍCH. `lib/orders/bo-duyet.test.ts:16-17` ghi *"9 đơn
// PENDING_APPROVAL đều đã COMPLETED + thu đủ"* — đó là **CHÚ THÍCH**, và chú thích không phải
// bằng chứng (luật đọc số). Bảng dưới gom theo TRẠNG THÁI ĐƠN chính vì câu hỏi thật là
// *"có đơn nào đã thu đủ tiền mà vẫn nằm chờ duyệt không"*.
//
// ⚠️ KHÔNG lọc bằng `locDonNhanTien()` ở đây — câu hỏi là *đơn ở trạng thái NÀO*, nên lọc theo
// trạng thái là tự bịt mắt trước đúng thứ cần nhìn.
//
// ⚠️ `payments` là quan hệ LỒNG: tầng base của `lib/db.ts` KHÔNG hook nested include, nên
// `deletedAt: null` ở đó phải tự khai (chú thích tại `lib/db.ts:67`).
async function phan3(tx: Tx): Promise<void> {
  in_(`## ③ Đơn đang treo \`PENDING_APPROVAL\``);
  in_();
  in_(
    `**Phép tính:** \`Order.discountApprovalStatus = PENDING_APPROVAL\` **hoặc** ` +
      `\`Order.installmentApprovalStatus = PENDING_APPROVAL\`, \`deletedAt IS NULL\`. ` +
      `Cột "đã thu" = Σ \`Payment.amount\` có \`accountantStatus = CONFIRMED\` và chưa xoá mềm.`,
  );
  in_();

  const treo = await tx.order.findMany({
    where: {
      deletedAt: null,
      OR: [
        { discountApprovalStatus: "PENDING_APPROVAL" },
        { installmentApprovalStatus: "PENDING_APPROVAL" },
      ],
    },
    select: {
      code: true,
      status: true,
      totalAmount: true,
      createdAt: true,
      discountApprovalStatus: true,
      installmentApprovalStatus: true,
      payments: {
        where: { accountantStatus: "CONFIRMED", deletedAt: null },
        select: { amount: true },
      },
    },
  });

  if (treo.length === 0) {
    in_(`**Không có đơn nào treo \`PENDING_APPROVAL\`.** Hàng chờ mới sẽ mở ra rỗng.`);
    in_();
    return;
  }

  // Gom theo trạng thái đơn.
  const theoTrangThai = new Map<string, { giam: number; keHoach: number; tong: number }>();
  for (const o of treo) {
    const cu = theoTrangThai.get(o.status) ?? { giam: 0, keHoach: 0, tong: 0 };
    if (o.discountApprovalStatus === "PENDING_APPROVAL") cu.giam += 1;
    if (o.installmentApprovalStatus === "PENDING_APPROVAL") cu.keHoach += 1;
    cu.tong += 1;
    theoTrangThai.set(o.status, cu);
  }
  bang(
    [...theoTrangThai.entries()]
      .sort((a, b) => b[1].tong - a[1].tong)
      .map(([tt, v]) => [tt, String(v.giam), String(v.keHoach), String(v.tong)]),
    ["trạng thái đơn", "chờ duyệt GIẢM GIÁ", "chờ duyệt KẾ HOẠCH", "tổng đơn"],
  );
  in_();
  in_(`**Tổng ${treo.length} đơn đang treo.**`);
  in_();

  const kem = treo
    .map((o) => ({ ...o, daThu: o.payments.reduce((s, p) => s + p.amount, 0) }))
    .sort((a, b) => b.daThu - a.daThu);
  const soThuDu = kem.filter((o) => o.totalAmount > 0 && o.daThu >= o.totalAmount).length;

  in_(`### Liệt kê — kèm số ĐÃ THU`);
  in_();
  in_(
    `⚠️ **Dòng có "đã thu" > 0 là dòng NGUY HIỂM**: bấm "Từ chối" trên đó sẽ chạy ` +
      `\`revertInstallmentRequests\` (VOID phiếu theo đợt + dựng lại phiếu "thu toàn đơn") ` +
      `**trên đơn đang giữ tiền thật**. Phải đóng sổ chúng TRƯỚC khi bật màn duyệt.`,
  );
  in_();
  inDanhSach(
    kem.map((o) => [
      o.code,
      o.status,
      tien(o.totalAmount),
      o.daThu > 0 ? `**${tien(o.daThu)}**` : tien(0),
      o.totalAmount > 0 && o.daThu >= o.totalAmount ? "**THU ĐỦ**" : "",
      ngay(o.createdAt),
    ]),
    ["mã đơn", "trạng thái", "tổng đơn", "đã thu", "", "tạo ngày"],
    "đơn treo",
  );
  in_();
  in_(`**${soThuDu}/${treo.length} đơn treo đã THU ĐỦ** — đây là tập phải đóng sổ trước.`);
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ NGƯỜI THU — quy mô backfill `Payment.collectedById`
// ═══════════════════════════════════════════════════════════════════════════
//
// Ba nhóm, cộng lại = tổng `Payment`:
//   (a) suy được từ lead   — `Order.leadId` có, `Lead.assignedToId` có  → backfill ĐƯỢC
//   (b) lead không có sale — `Order.leadId` có, `assignedToId` NULL     → không suy được
//   (c) đơn không có lead  — `Order.leadId` NULL                        → cần quy tắc fallback
//
// In riêng số khoản `recordedById IS NULL` (tiền về qua webhook ⇒ ô "Người thu" trên phiếu in
// TRỐNG hôm nay) — đó là tập mà bản vá tạo ra khác biệt thấy được ngay.
//
// ⚠️ Chỉ đọc `assignedToId`/`createdById` — KHÔNG đọc tên, KHÔNG đọc SĐT. Câu hỏi là "có suy
// được không", không phải "là ai".
async function phan4(tx: Tx): Promise<void> {
  in_(`## ④ Người thu — quy mô backfill \`Payment.collectedById\``);
  in_();
  in_(
    `**Phép tính:** mọi \`Payment\` chưa xoá mềm, nối \`Order\` rồi \`Lead\`. ` +
      `"Suy được" = \`Order.leadId\` có **và** \`Lead.assignedToId\` có ` +
      `(cột đã chốt 22/09 — người CHĂM, KHÔNG phải \`convertedById\`).`,
  );
  in_();

  const khoan = await tx.payment.findMany({
    where: { deletedAt: null },
    select: {
      amount: true,
      recordedById: true,
      order: {
        select: {
          leadId: true,
          createdById: true,
          lead: { select: { assignedToId: true } },
        },
      },
    },
  });

  const tong = khoan.length;
  if (tong === 0) {
    in_(`_Không có khoản thu nào._`);
    in_();
    return;
  }
  const suyDuoc = khoan.filter((k) => k.order.leadId != null && k.order.lead?.assignedToId != null).length;
  const leadKhongSale = khoan.filter(
    (k) => k.order.leadId != null && k.order.lead?.assignedToId == null,
  ).length;
  const khongLead = khoan.filter((k) => k.order.leadId == null).length;
  const chuaCoNguoiGhi = khoan.filter((k) => k.recordedById == null);

  const pct = (n: number): string => `${Math.round((n / tong) * 1000) / 10}%`;
  bang(
    [
      ["(a) suy được từ `Lead.assignedToId`", String(suyDuoc), pct(suyDuoc), "backfill ĐƯỢC"],
      ["(b) có lead nhưng lead chưa có sale", String(leadKhongSale), pct(leadKhongSale), "không suy được — để trống"],
      ["(c) đơn KHÔNG có lead", String(khongLead), pct(khongLead), "cần quy tắc fallback"],
    ],
    ["nhóm", "số khoản", "tỉ lệ", "xử lý"],
  );
  in_();
  in_(
    `**Tổng \`Payment\`: ${tong}** · kiểm cộng: ${suyDuoc} + ${leadKhongSale} + ${khongLead} = ` +
      `**${suyDuoc + leadKhongSale + khongLead}** ${suyDuoc + leadKhongSale + khongLead === tong ? "✓" : "✗ LỆCH"}`,
  );
  in_();
  in_(
    `**Khoản đang KHÔNG có người ghi** (\`recordedById IS NULL\` — tiền về qua webhook, ô ` +
      `"Người thu tiền" trên phiếu in **TRỐNG** hôm nay): **${chuaCoNguoiGhi.length}** khoản, ` +
      `Σ **${tien(chuaCoNguoiGhi.reduce((s, k) => s + k.amount, 0))}**.`,
  );
  in_();

  const c = khoan.filter((k) => k.order.leadId == null);
  in_(`### Nhóm (c) — đơn không có lead thì còn gì để bám?`);
  in_();
  in_(
    `\`Order.createdById\` có: **${c.filter((k) => k.order.createdById != null).length}** · ` +
      `NULL: **${c.filter((k) => k.order.createdById == null).length}** ` +
      `(đơn tạo trước 31/08/2026 để NULL vĩnh viễn — \`schema.prisma\` tự khai: không nguồn nào suy ngược).`,
  );
  in_();
  in_(
    `⚠️ **Đừng fallback IM LẶNG về \`createdById\`** — đó chính là cái sai đang phải sửa ` +
      `(admin tạo đơn thành "người thu"), chỉ khác là núp dưới một cái tên mới. Nếu dùng, ` +
      `nhãn trên màn phải NÓI THẬT (luật 12 — affordance phải nói thật).`,
  );
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  in_(`# Báo cáo ngưỡng thanh toán — CHỈ ĐỌC`);
  in_();
  const quyen = await kiemQuyen(db);
  in_(
    `**Kết nối:** \`${currentDbHost()}\` · user \`${quyen.nguoiDung}\` · ` +
      `ghi được: **${quyen.ghiDuoc === null ? "không kiểm được" : quyen.ghiDuoc ? "CÓ QUYỀN GHI ⚠️" : "KHÔNG (chỉ đọc)"}**`,
  );
  if (quyen.ghiDuoc === true) {
    in_();
    in_(
      `> ⚠️ Đang chạy ở chế độ ĐO nhưng kết nối **CÓ QUYỀN GHI**. Tệp này không chứa lệnh ghi nào ` +
        `và transaction là READ ONLY, nhưng nếu đây là workflow đo prod thì secret đang trỏ nhầm ` +
        `sang chuỗi đầy quyền — xem \`docs/cham-cong/USER-CHI-DOC-PROD.md\`.`,
    );
  }
  in_();
  in_(
    `**Hằng đang chạy trong mã:** \`TRAN_SO_DOT = ${TRAN_SO_DOT}\` · ` +
      `\`TRAN_KHOAN_GIAM_MOI_DONG = ${TRAN_KHOAN_GIAM_MOI_DONG}\`. ` +
      `**Ngưỡng đề xuất (chốt 22/09):** ${NGUONG_DOT_DE_XUAT} đợt · ${NGUONG_GIAM_DE_XUAT} khoản giảm/dòng.`,
  );
  in_();
  in_(`Kế hoạch: \`docs/quy-trinh-thanh-toan-2209.md\` · mục "GĐ 0 — ĐO TRƯỚC KHI CODE".`);
  in_();
  in_(`---`);
  in_();

  // ⚠️ READ ONLY + ROLLBACK. `$transaction` của Prisma rollback khi callback NÉM; ném một lỗi
  // canh sẵn ở cuối để không lượt chạy nào commit được, kể cả khi ai đó lỡ thêm phép ghi.
  // `return` KHÔNG rollback — luật ở CLAUDE.md mục "Luật rollback".
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

        await phan1(tx);
        in_(`---`);
        in_();
        await phan2(tx);
        in_(`---`);
        in_();
        await phan3(tx);
        in_(`---`);
        in_();
        await phan4(tx);
        xong = true;
        throw new Error(KET);
      },
      // Trần mặc định của transaction TƯƠNG TÁC là 5 giây. Báo cáo này chạy ~10 câu đọc phẳng
      // qua WAN sang Supabase.
      //
      // ⚠️ Con số này KHÔNG phải bản vá cho N+1 — tệp này KHÔNG có N+1: mọi truy vấn nằm ở tầng
      // ngoài cùng của từng phần, không câu nào nằm trong vòng lặp trên dữ liệu, và việc gom
      // nhóm làm ở JS. Trần chỉ để một transaction ĐỌC không bị cắt giữa đường. Tiền lệ `P2028`
      // ở `backfill-orderitem-dry.ts` chết vì THIẾU thứ này CỘNG với N+1.
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!(e instanceof Error) || e.message !== KET) throw e;
  }
  if (!xong) throw new Error("Không dựng được báo cáo");

  in_();
  in_(`---`);
  in_();
  in_(`_Báo cáo CHỈ ĐỌC. Transaction \`READ ONLY\` + rollback. Không cột cá nhân nào được đọc._`);

  writeFileSync("bao-cao-nguong-thanh-toan.md", ra.join("\n"), "utf8");
  console.error("\n[ĐÃ GHI] bao-cao-nguong-thanh-toan.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
