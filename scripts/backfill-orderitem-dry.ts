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

/** Số chủ dự án duyệt từ bảng đối soát 17/09 — dùng để ĐỐI CHIẾU, không phải để tin. */
const MOC_KHOAN = 146;
const MOC_TIEN = 887_313_000;

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
  in_(`**SẼ GẮN: ${q.khoan.length} khoản / ${q.soDon} đơn / ${vnd(q.tongTien)}đ**`);
  in_();
  if (q.khoan.length === MOC_KHOAN && q.tongTien === MOC_TIEN) {
    in_(`✅ Khớp mốc bảng đối soát 17/09: ${MOC_KHOAN} khoản / ${vnd(MOC_TIEN)}đ.`);
  } else {
    in_(
      `⚠️ **LỆCH mốc 17/09** (${MOC_KHOAN} khoản / ${vnd(MOC_TIEN)}đ). ` +
        `Nay: ${q.khoan.length} khoản / ${vnd(q.tongTien)}đ.`,
    );
    in_();
    in_(`Lệch KHÔNG phải lỗi — lệch KHÔNG GIẢI THÍCH ĐƯỢC mới là. Bốn lý do, ba đầu LÀNH:`);
    in_(`1. sale đã gắn tay vài khoản sau 17/09 ⇒ tập hẹp lại — **lành**;`);
    in_(`2. tiền mới về + đơn mới tạo sau 17/09 ⇒ tập rộng ra — **lành**;`);
    in_(`3. một đơn được thêm dòng hàng thứ hai ⇒ rời sang nhóm "đơn ≥2 con" — **lành**;`);
    in_(
      `4. đơn rơi sang DRAFT/CANCELLED/REFUNDED hoặc bị xoá mềm ⇒ rời sang nhóm ` +
        `"ngoài lọc đơn nhận tiền" — **lý do DUY NHẤT không lành**, vì tiền đã về mà đơn ` +
        `không còn nhận được nữa. Soi \`AuditLog\` của đơn trước khi chạy thật.`,
    );
    in_();
    in_(`**Chưa đối chiếu được nguyên nhân thì ĐỪNG gõ chuỗi xác nhận.**`);
  }

  in_();
  in_(`### Bốn nhóm KHÔNG backfill — liệt kê để không có cap im lặng`);
  in_();
  in_(`| Nhóm | Số khoản | Tổng tiền | Vì sao không gắn |`);
  in_(`|---|---|---|---|`);
  in_(
    `| bút toán ĐIỀU CHỈNH/HOÀN | ${q.butToanKhac.soKhoan} | ${vnd(q.butToanKhac.tongTien)}đ | ` +
      `\`paymentType ≠ PAYMENT\` — ngoài số 146 đã duyệt, **để lượt sau** |`,
  );
  in_(
    `| đơn ≥2 con | ${q.donNhieuCon.soKhoan} (${q.donNhieuCon.soDon} đơn) | ` +
      `${vnd(q.donNhieuCon.tongTien)}đ | phải đoán bé nào ⇒ **sale tự chia** trên màn biến động số dư |`,
  );
  in_(
    `| đơn không có dòng hàng | ${q.donKhongCoDong.soKhoan} | ${vnd(q.donKhongCoDong.tongTien)}đ | ` +
      `không có chỗ nào để gắn |`,
  );
  in_(
    `| ngoài \`locDonNhanTien()\` | ${q.ngoaiLocDonNhanTien.soKhoan} | ` +
      `${vnd(q.ngoaiLocDonNhanTien.tongTien)}đ | đơn DRAFT/CANCELLED/REFUNDED hoặc xoá mềm |`,
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

  for (const t of txn) {
    const sdt = extractVnPhoneCandidates(t.content);
    // Dạng `84…`/`+84…` đếm THEO NỘI DUNG THÔ, không theo kết quả bóc: đây chính là tập mà
    // MỤC 3 (chuẩn hoá SĐT) sẽ chạm tới.
    if (/(?:^|\D)\+?84\d{9}(?:\D|$)/.test(t.content ?? "")) dang84 += 1;
    if (sdt.length === 0) {
      khongBocDuoc += 1;
      continue;
    }
    const bien = [...new Set(sdt.flatMap(phoneVariants))];
    const don = await tx.order.findMany({
      where: {
        ...locDonNhanTien(),
        customerPhone: { in: bien },
        paymentRequests: { some: { status: { in: ["PENDING", "PARTIAL"] } } },
      },
      select: { id: true },
      take: 2,
    });
    if (don.length === 0) khongDonNao += 1;
    else if (don.length > 1) nhieuDon += 1;
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
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await phanBackfill(tx);
      await phanTachA(tx);
      throw new Error(KET);
    });
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
