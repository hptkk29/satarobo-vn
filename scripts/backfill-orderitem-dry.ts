// scripts/backfill-orderitem-dry.ts — XEM TRƯỚC backfill `Payment.orderItemId`. KHÔNG GHI GÌ.
//
// ─────────────────────────────────────────────────────────────────────────────
// TỆP NÀY KHÔNG CHỨA MỘT LỆNH GHI NÀO, và đó là lớp khoá thứ nhất.
//
// Không `create`/`update`/`delete`/`upsert`, không đọc `process.argv`, không có cờ `--apply`.
// Đường GHI nằm ở một tệp KHÁC (`scripts/backfill-orderitem-apply.ts`) mà một workflow KHÁC
// gọi, bằng một secret KHÁC. Một cờ thì lật được — kể cả lật nhầm; một tệp không chứa lệnh ghi
// thì không có gì để lật. Lưới canh: `lib/finance/backfill-chi-doc.test.ts`.
//
// Mọi truy vấn nằm trong `SET TRANSACTION READ ONLY` và transaction NÉM một lỗi canh sẵn nên
// không lượt nào commit được — kể cả phép ghi do một `import` nào đó kéo theo.
//
// ─────────────────────────────────────────────────────────────────────────────
// CHE DỮ LIỆU CÁ NHÂN
//
// Bản kê đi vào job summary + artifact, tức nó RỜI KHỎI vòng kiểm soát của DB. Nên: KHÔNG tên
// phụ huynh/con, KHÔNG nội dung CK, SĐT che còn 4 số cuối. Mã đơn + cơ sở + số tiền là đủ để
// quyết định.

// PHẢI đứng TRƯỚC import lib/db — Prisma đọc DATABASE_URL lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { writeFileSync } from "node:fs";
import { db } from "../lib/db";
import { kiemQuyen } from "./_kiem-quyen";
import { quetKhoanCanGan } from "../lib/finance/backfill-orderitem";
import { extractVnPhoneCandidates } from "../lib/payments/sdt-trong-memo";
import { phoneVariants } from "../lib/phone";
import { locDonNhanTien } from "../lib/payments/don-nhan-tien";

/**
 * Mốc ĐỐI CHIẾU — dùng để so, không phải để tin.
 *
 * `MOC_TAP_*` là số chủ dự án đo ĐỘC LẬP bằng SQL trên prod 18/09/2026, trên tập:
 * đơn có ĐÚNG 1 `OrderItem` · `Payment.orderItemId IS NULL` · Payment chưa xoá mềm,
 * **KHÔNG lọc trạng thái đơn**. Nó gồm cả `ORD-260913-000047` (CANCELLED, 8.976.000đ).
 *
 * `MOC_SE_GAN*` là phần trừ đơn ấy ra — tức đúng tập mà lệnh backfill sẽ chạm.
 *
 * ⚠️ Hai mốc, không phải một, và đó là chủ ý: một con số thì không phân biệt được
 * "dữ liệu đổi" với "hai bên đang đo hai tập khác nhau". Đúng bài học của lần lệch
 * 24 → 150 hôm 17/09.
 */
const MOC_TAP_SO = 147;
const MOC_TAP_TIEN = 896_289_000;
const MOC_SE_GAN = 146;
const MOC_SE_GAN_TIEN = 887_313_000;

const vnd = (n: number) => n.toLocaleString("vi-VN");

// KHÔNG có hàm che SĐT ở đây, và đó là chủ ý: bản kê này **không in SĐT nào cả**. Mã đơn +
// cơ sở + số tiền là đủ để duyệt một lệnh backfill. Một hàm `cheSdt` để sẵn mà không ai gọi
// là một lời hứa suông — nó khiến người đọc sau tưởng tệp có in SĐT (đã che), rồi đi tìm.

const ra: string[] = [];
const in_ = (s = "") => {
  ra.push(s);
  console.log(s);
};

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Phần 1 — kế hoạch backfill. */
async function phanBackfill(tx: Tx): Promise<void> {
  const q = await quetKhoanCanGan(tx as never);

  in_(`## 1 · Kế hoạch backfill \`Payment.orderItemId\``);
  in_();

  // ─── BA DÒNG TỔNG (chủ dự án chốt 18/09) ────────────────────────────────────
  in_(`### Ba dòng tổng`);
  in_();
  in_(`1. **SẼ GẮN: ${q.khoan.length} khoản · ${vnd(q.tongTien)}đ · ${q.soDon} đơn**`);
  in_(
    `2. **Bị loại theo TRẠNG THÁI ĐƠN (DRAFT/CANCELLED/REFUNDED): ` +
      `${q.biLoaiTrangThai.soKhoan} khoản · ${vnd(q.biLoaiTrangThai.tongTien)}đ**`,
  );
  if (q.biLoaiTrangThai.danhSach.length > 0) {
    for (const x of q.biLoaiTrangThai.danhSach) {
      in_(`   - \`${x.orderCode}\` · ${x.trangThaiDon} · ${vnd(x.amount)}đ`);
    }
  } else {
    in_(`   - (không có)`);
  }
  in_(
    `3. **Bị loại vì ĐƠN XOÁ MỀM: ${q.biLoaiXoaMem.soKhoan} khoản · ` +
      `${vnd(q.biLoaiXoaMem.tongTien)}đ**`,
  );
  if (q.biLoaiXoaMem.danhSach.length > 0) {
    for (const x of q.biLoaiXoaMem.danhSach) {
      in_(`   - \`${x.orderCode}\` · ${x.trangThaiDon} · ${vnd(x.amount)}đ`);
    }
  } else {
    in_(`   - (không có)`);
  }

  // ─── ĐỐI CHIẾU với SQL độc lập của chủ dự án ────────────────────────────────
  // SQL ấy: đơn có ĐÚNG 1 OrderItem · `Payment.orderItemId IS NULL` · đơn chưa xoá mềm,
  // KHÔNG lọc trạng thái đơn ⇒ ba nhóm trên cộng lại phải bằng nó.
  const tapSo = q.khoan.length + q.biLoaiTrangThai.soKhoan + q.biLoaiXoaMem.soKhoan;
  const tapTien = q.tongTien + q.biLoaiTrangThai.tongTien + q.biLoaiXoaMem.tongTien;
  in_();
  in_(`### Đối chiếu SQL độc lập (chủ dự án đo 18/09)`);
  in_();
  in_(`Tập đối chiếu = **đơn có ĐÚNG 1 dòng hàng**, không lọc trạng thái đơn.`);
  in_();
  in_(`\`sẽ gắn\` + \`bị loại trạng thái\` + \`bị loại xoá mềm\` = **${tapSo} khoản · ${vnd(tapTien)}đ**`);
  in_();
  if (tapSo === MOC_TAP_SO && tapTien === MOC_TAP_TIEN) {
    in_(`✅ Khớp tuyệt đối mốc SQL: ${MOC_TAP_SO} khoản / ${vnd(MOC_TAP_TIEN)}đ.`);
  } else {
    in_(
      `⚠️ **LỆCH mốc SQL** (${MOC_TAP_SO} khoản / ${vnd(MOC_TAP_TIEN)}đ). ` +
        `Nay: ${tapSo} khoản / ${vnd(tapTien)}đ.`,
    );
    in_();
    in_(`Lệch KHÔNG phải lỗi — lệch KHÔNG GIẢI THÍCH ĐƯỢC mới là. Năm lý do, bốn đầu LÀNH:`);
    in_(`1. tiền mới về / đơn mới tạo sau 18/09 ⇒ tập rộng ra — **lành**;`);
    in_(`2. sale đã gắn tay vài khoản sau 18/09 ⇒ tập hẹp lại — **lành**;`);
    in_(
      `3. một đơn 1 con được thêm dòng hàng thứ hai ⇒ rời sang nhóm "đơn ≥2 con", tức RA KHỎI ` +
        `tập đối chiếu — **lành**;`,
    );
    in_(
      `4. SQL của chủ dự án KHÔNG lọc \`paymentType\`, báo cáo thì có. Nếu lệch đúng bằng ` +
        `**${q.butToanKhac.soKhoan} khoản / ${vnd(q.butToanKhac.tongTien)}đ** (nhóm bút toán ` +
        `điều chỉnh/hoàn dưới đây) thì đây là lý do — **lành**, chỉ là hai thước khác nhau;`,
    );
    in_(
      `5. một khoản bị XOÁ MỀM sau 18/09 ⇒ rơi khỏi cả ba nhóm (câu tra lọc ` +
        `\`Payment.deletedAt IS NULL\`) — **lý do DUY NHẤT không lành**, vì tiền đã về mà dòng ` +
        `sổ thì bị bỏ đi. Soi \`AuditLog\` trước khi chạy thật.`,
    );
    in_();
    in_(`**Chưa đối chiếu được nguyên nhân thì ĐỪNG gõ chuỗi xác nhận.**`);
  }

  // Mốc "sẽ gắn" riêng — đây là con số đi vào `--expect` của bản GHI.
  in_();
  if (q.khoan.length === MOC_SE_GAN && q.tongTien === MOC_SE_GAN_TIEN) {
    in_(`✅ "Sẽ gắn" khớp mốc đã duyệt: ${MOC_SE_GAN} khoản / ${vnd(MOC_SE_GAN_TIEN)}đ.`);
  } else {
    in_(
      `⚠️ "Sẽ gắn" LỆCH mốc đã duyệt (${MOC_SE_GAN} / ${vnd(MOC_SE_GAN_TIEN)}đ) — ` +
        `nay ${q.khoan.length} / ${vnd(q.tongTien)}đ.`,
    );
  }
  in_();
  in_(
    `> Con số đi vào bản GHI: \`--expect=${q.khoan.length}\`. Bản GHI so số dòng bị ảnh hưởng ` +
      `với đúng số này và **ROLLBACK** nếu lệch.`,
  );

  in_();
  in_(`### Ba nhóm NGOÀI tập đối chiếu — liệt kê để không có cap im lặng`);
  in_();
  in_(`| Nhóm | Số khoản | Tổng tiền | Vì sao không gắn |`);
  in_(`|---|---|---|---|`);
  in_(
    `| đơn ≥2 con | ${q.donNhieuCon.soKhoan} (${q.donNhieuCon.soDon} đơn) | ` +
      `${vnd(q.donNhieuCon.tongTien)}đ | phải đoán bé nào ⇒ **sale tự chia** trên màn biến động số dư |`,
  );
  in_(
    `| đơn không có dòng hàng | ${q.donKhongCoDong.soKhoan} | ${vnd(q.donKhongCoDong.tongTien)}đ | ` +
      `không có chỗ nào để gắn |`,
  );
  in_(
    `| bút toán ĐIỀU CHỈNH/HOÀN | ${q.butToanKhac.soKhoan} | ${vnd(q.butToanKhac.tongTien)}đ | ` +
      `\`paymentType ≠ PAYMENT\` — ngoài số đã duyệt, **để lượt sau** |`,
  );

  // Tổng theo CƠ SỞ — chủ dự án dùng để biết backfill dọn xong thì mỗi cơ sở còn lại gì.
  const theoCoSo = new Map<string, { so: number; tien: number }>();
  const ten = new Map<string, string>();
  const ids = [...new Set(q.khoan.map((k) => k.centerId).filter((x): x is string => x !== null))];
  if (ids.length > 0) {
    const cs = await tx.center.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    for (const c of cs) ten.set(c.id, c.name);
  }
  for (const k of q.khoan) {
    const nhan = k.centerId === null ? "(chưa gán cơ sở)" : (ten.get(k.centerId) ?? k.centerId);
    const cum = theoCoSo.get(nhan) ?? { so: 0, tien: 0 };
    cum.so += 1;
    cum.tien += k.amount;
    theoCoSo.set(nhan, cum);
  }
  in_();
  in_(`### Sẽ gắn — tổng theo CƠ SỞ`);
  in_();
  in_(`| Cơ sở | Số khoản | Tổng tiền |`);
  in_(`|---|---|---|`);
  for (const [cs, c] of [...theoCoSo].sort((a, b) => b[1].tien - a[1].tien)) {
    in_(`| ${cs} | ${c.so} | ${vnd(c.tien)}đ |`);
  }

  in_();
  in_(`### 20 dòng đầu (mẫu để soi mắt thường)`);
  in_();
  in_(`| # | Mã đơn | Số tiền | Dòng hàng sẽ gắn |`);
  in_(`|---|---|---|---|`);
  q.khoan.slice(0, 20).forEach((k, i) => {
    in_(`| ${i + 1} | ${k.orderCode} | ${vnd(k.amount)}đ | \`${k.orderItemId.slice(0, 8)}…\` |`);
  });
  if (q.khoan.length > 20) in_();
  if (q.khoan.length > 20) in_(`_(còn ${q.khoan.length - 20} dòng — bản đầy đủ không in ra để bản kê không thành một bản sao dữ liệu)_`);
}

/**
 * Phần 2 — VIỆC 4: tách 10 dòng "có SĐT nhưng không ra đúng một đơn".
 *
 * Chỉ in SỐ ĐẾM (chủ dự án chốt). Không vá cột cơ sở, không thêm câu cảnh báo nào.
 */
async function phanTachA(tx: Tx): Promise<void> {
  const txn = await tx.bankTransaction.findMany({
    where: { status: "UNMATCHED" },
    select: { content: true },
  });

  let khongBocDuoc = 0;
  let khongDonNao = 0;
  let nhieuDon = 0;
  let motDon = 0;
  let dang84 = 0;

  // Bóc SĐT trước cho CẢ LÔ, rồi tra đơn bằng ĐÚNG MỘT câu.
  //
  // ⚠️ Bản đầu tra một câu `order.findMany` cho TỪNG giao dịch — 22 lượt round-trip sang
  // Supabase nằm chung một transaction, và nó chết thật trên prod với `P2028`
  // *"Transaction not found … or was open for longer than the timeout"* (trần mặc định 5 giây
  // của transaction tương tác Prisma).
  //
  // Nâng trần là vá TRIỆU CHỨNG: N+1 vẫn còn, và nó sẽ chết lại vào ngày số giao dịch
  // UNMATCHED tăng. Vá gốc là gộp thành một câu. (`scripts/bao-cao-doi-soat-tien.ts` còn nguyên
  // hình dạng N+1 ấy — nó chạy được ở 22 dòng, nhưng đó là quả bom hẹn giờ cùng loại.)
  const bocDuoc = txn.map((t) => {
    if (/(?:^|\D)\+?84\d{9}(?:\D|$)/.test(t.content ?? "")) dang84 += 1;
    return extractVnPhoneCandidates(t.content);
  });
  const moiBien = bocDuoc.map((sdt) => [...new Set(sdt.flatMap(phoneVariants))]);
  const tatCaBien = [...new Set(moiBien.flat())];

  // Một câu cho mọi biến thể SĐT. `customerPhone` là một giá trị trên mỗi đơn, nên đếm theo
  // SĐT rồi cộng theo biến thể của từng giao dịch cho ra đúng con số mà 22 câu kia cho ra.
  const donTheoSdt = new Map<string, number>();
  if (tatCaBien.length > 0) {
    const don = await tx.order.findMany({
      where: {
        ...locDonNhanTien(),
        customerPhone: { in: tatCaBien },
        paymentRequests: { some: { status: { in: ["PENDING", "PARTIAL"] } } },
      },
      select: { customerPhone: true },
    });
    for (const d of don) {
      if (!d.customerPhone) continue;
      donTheoSdt.set(d.customerPhone, (donTheoSdt.get(d.customerPhone) ?? 0) + 1);
    }
  }

  for (let i = 0; i < txn.length; i += 1) {
    if (bocDuoc[i]!.length === 0) {
      khongBocDuoc += 1;
      continue;
    }
    const soDonKhop = moiBien[i]!.reduce((s, p) => s + (donTheoSdt.get(p) ?? 0), 0);
    if (soDonKhop === 0) khongDonNao += 1;
    else if (soDonKhop > 1) nhieuDon += 1;
    else motDon += 1;
  }

  in_();
  in_(`## 2 · Phần A — tách nhóm "có SĐT nhưng không ra đúng một đơn"`);
  in_();
  in_(`| Nhóm | Số giao dịch |`);
  in_(`|---|---|`);
  in_(`| tổng UNMATCHED | ${txn.length} |`);
  in_(`| không bóc được SĐT từ nội dung CK | ${khongBocDuoc} |`);
  in_(`| có SĐT · **0 đơn** khớp | ${khongDonNao} |`);
  in_(`| có SĐT · **>1 đơn** khớp | ${nhieuDon} |`);
  in_(`| có SĐT · đúng 1 đơn | ${motDon} |`);
  in_(`| nội dung CK chứa SĐT dạng \`84…\`/\`+84…\` | ${dang84} |`);
}

/**
 * Phần 3 — CHỈ ĐỌC, cho kế toán: khoản PENDING trên một đơn đã HUỶ.
 *
 * Chủ dự án hỏi 18/09: `Payment` PENDING 8.976.000đ trên `ORD-260913-000047` (đơn CANCELLED) —
 * có `PaymentAllocation`/`BankTransaction` THẬT nào trỏ tới không, `method` là gì, ai tạo.
 * Kết luận phải là một trong hai: **tiền thật đã về** hay **dòng tự sinh lúc tạo đơn**.
 *
 * ⚠️ KHÔNG có FK từ `Payment` sang `BankTransaction` trong schema này. Ledger-A (`Payment`) và
 * Ledger-B (`PaymentRequest` + `PaymentAllocation` + `BankTransaction`) là hai sổ song song.
 * Nên bằng chứng "tiền thật" phải tìm ở BA nơi độc lập, và một nơi có là đủ để kết luận:
 *   1. `PaymentAllocation` trỏ vào một `PaymentRequest` CỦA ĐƠN NÀY ⇒ có giao dịch ngân hàng
 *      thật đã được rót vào đơn;
 *   2. marker trong `Payment.note` — `[auto:<cổng>:<id>]` (webhook tự khớp) hoặc
 *      `[gan-tay:<id>]` (kế toán gắn tay). Cả hai đều mang id giao dịch thật;
 *   3. `Payment.evidenceUrl` — ảnh chứng từ do người nhập đính kèm.
 *
 * Không nơi nào có ⇒ dòng ấy do đường TẠO ĐƠN tự sinh, chưa từng có tiền đi kèm.
 */
async function phanSoiDonHuy(tx: Tx): Promise<void> {
  const MA_DON = "ORD-260913-000047";

  in_();
  in_(`## 3 · CHỈ ĐỌC — khoản PENDING trên đơn đã huỷ \`${MA_DON}\``);
  in_();

  const don = await tx.order.findFirst({
    where: { code: MA_DON },
    select: {
      id: true,
      code: true,
      status: true,
      deletedAt: true,
      totalAmount: true,
      createdAt: true,
      items: { select: { id: true } },
      payments: {
        select: {
          id: true,
          amount: true,
          method: true,
          accountantStatus: true,
          saleStatus: true,
          paymentType: true,
          orderItemId: true,
          enrollmentId: true,
          evidenceUrl: true,
          note: true,
          paidDate: true,
          createdAt: true,
          recordedById: true,
          deletedAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      paymentRequests: {
        select: {
          id: true,
          installmentNo: true,
          amountDue: true,
          status: true,
          allocations: {
            select: {
              amount: true,
              createdAt: true,
              bankTransaction: {
                select: { id: true, provider: true, providerTxnId: true, amount: true, status: true, transferredAt: true },
              },
            },
          },
        },
        orderBy: { installmentNo: "asc" },
      },
    },
  });

  if (!don) {
    in_(`⚠️ Không tìm thấy đơn \`${MA_DON}\` trên prod.`);
    return;
  }

  in_(
    `**Đơn:** \`${don.code}\` · trạng thái **${don.status}**` +
      `${don.deletedAt ? " · **ĐÃ XOÁ MỀM**" : ""} · tổng ${vnd(don.totalAmount)}đ · ` +
      `${don.items.length} dòng hàng · tạo ${don.createdAt.toISOString().slice(0, 10)}`,
  );
  in_();

  // Người tạo — tra tên riêng, KHÔNG in email/SĐT.
  const ids = [...new Set(don.payments.map((p) => p.recordedById).filter((x): x is string => !!x))];
  const ten = new Map<string, string>();
  if (ids.length > 0) {
    const u = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    for (const x of u) ten.set(x.id, x.name ?? "(không tên)");
  }

  in_(`### Các dòng \`Payment\` của đơn`);
  in_();
  in_(`| # | Số tiền | method | kế toán | sale | loại | gắn con | ghi danh | có chứng từ | ai tạo | ngày |`);
  in_(`|---|---|---|---|---|---|---|---|---|---|---|`);
  don.payments.forEach((p, i) => {
    in_(
      `| ${i + 1} | ${vnd(p.amount)}đ | \`${p.method}\` | ${p.accountantStatus} | ${p.saleStatus} | ` +
        `${p.paymentType} | ${p.orderItemId ? "CÓ" : "—"} | ${p.enrollmentId ? "CÓ" : "—"} | ` +
        `${p.evidenceUrl ? "CÓ" : "—"} | ${p.recordedById ? (ten.get(p.recordedById) ?? "(không rõ)") : "**(không ai — hệ thống)**"} | ` +
        `${p.paidDate.toISOString().slice(0, 10)} |`,
    );
  });

  in_();
  in_(`### Ledger-B — phiếu thu và giao dịch ngân hàng ĐÃ RÓT vào đơn`);
  in_();
  const tongRot = don.paymentRequests.reduce(
    (s, r) => s + r.allocations.reduce((t, a) => t + a.amount, 0),
    0,
  );
  if (don.paymentRequests.length === 0) {
    in_(`- Không có phiếu thu nào.`);
  } else {
    for (const r of don.paymentRequests) {
      const rot = r.allocations.reduce((t, a) => t + a.amount, 0);
      in_(
        `- phiếu đợt ${r.installmentNo} · phải thu ${vnd(r.amountDue)}đ · **${r.status}** · ` +
          `đã rót ${vnd(rot)}đ · ${r.allocations.length} phân bổ`,
      );
      for (const a of r.allocations) {
        const b = a.bankTransaction;
        in_(
          `  - ${vnd(a.amount)}đ ← \`${b.provider}\` giao dịch \`${b.providerTxnId}\` · ` +
            `${vnd(b.amount)}đ · ${b.status} · ${b.transferredAt.toISOString().slice(0, 10)}`,
        );
      }
    }
  }

  // ─── KẾT LUẬN ─────────────────────────────────────────────────────────────
  const coMarker = don.payments.some((p) => /\[(?:auto:[^\]]+|gan-tay:[^\]]+)\]/.test(p.note ?? ""));
  const coChungTu = don.payments.some((p) => !!p.evidenceUrl);
  const coRot = tongRot > 0;

  in_();
  in_(`### Kết luận`);
  in_();
  in_(`| Bằng chứng tiền thật | Có? |`);
  in_(`|---|---|`);
  in_(`| \`PaymentAllocation\` từ giao dịch ngân hàng vào phiếu của đơn | ${coRot ? `**CÓ** — ${vnd(tongRot)}đ` : "không"} |`);
  in_(`| marker \`[auto:…]\` / \`[gan-tay:…]\` trong \`Payment.note\` | ${coMarker ? "**CÓ**" : "không"} |`);
  in_(`| \`Payment.evidenceUrl\` (ảnh chứng từ) | ${coChungTu ? "**CÓ**" : "không"} |`);
  in_();
  if (coRot || coMarker || coChungTu) {
    in_(
      `⚠️ **TIỀN THẬT ĐÃ VỀ.** Đơn đang CANCELLED mà vẫn có bằng chứng tiền — đây là việc của ` +
        `kế toán, không phải việc của lệnh backfill. Backfill **không chạm** đơn này (bị loại ` +
        `theo trạng thái), nên nó vẫn nằm nguyên đó chờ xử lý.`,
    );
  } else {
    in_(
      `✅ **DÒNG TỰ SINH LÚC TẠO ĐƠN** — không phân bổ ngân hàng, không marker giao dịch, ` +
        `không ảnh chứng từ. Không có tiền thật nào đi kèm dòng này.`,
    );
    in_();
    in_(
      `Nó vô hại với công nợ hôm nay: \`accountantStatus = PENDING\` nên nó KHÔNG vào "đã thu" ` +
        `(trục A), và đơn CANCELLED thì bị \`locDonNhanTien()\` loại khỏi mọi đường nhận tiền.`,
    );
  }
}

async function main() {
  in_(`# Xem trước backfill \`Payment.orderItemId\` — CHỈ ĐỌC`);
  in_();
  const quyen = await kiemQuyen(db);
  in_(
    `**Kết nối:** \`${currentDbHost()}\` · user \`${quyen.nguoiDung}\` · ` +
      `ghi được: **${quyen.ghiDuoc === null ? "không kiểm được" : quyen.ghiDuoc ? "CÓ QUYỀN GHI ⚠️" : "KHÔNG (chỉ đọc)"}**`,
  );
  in_();

  // Transaction READ ONLY + NÉM để rollback. `return` KHÔNG rollback (CLAUDE.md mục 7).
  const KET = "__XEM_TRUOC_XONG__";
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await phanBackfill(tx);
        await phanTachA(tx);
        await phanSoiDonHuy(tx);
        throw new Error(KET);
      },
      // Trần mặc định của transaction TƯƠNG TÁC là 5 giây — tuỳ số hợp lý cho một transaction
      // ghi ngắn, nhưng đây là một transaction ĐỌC để dựng báo cáo, quét 150+ khoản kèm quan hệ
      // qua WAN sang Supabase. Nó không giữ tính nguyên tử cho ai; nó tồn tại để có READ ONLY +
      // rollback.
      //
      // ⚠️ Con số này KHÔNG phải bản vá cho `P2028` đã gặp: nguyên nhân gốc là N+1 trong
      // `phanTachA` và nó đã bị gộp thành MỘT câu (xem chú thích ở đó). Nâng trần mà giữ N+1 là
      // vá triệu chứng — nó sẽ chết lại khi số giao dịch tăng.
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!(e instanceof Error) || e.message !== KET) throw e;
  }

  writeFileSync("bao-cao-backfill-orderitem.md", ra.join("\n") + "\n", "utf8");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
