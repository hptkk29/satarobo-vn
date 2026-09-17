/**
 * scripts/bao-cao-doi-soat-tien.ts — BÁO CÁO ĐỐI SOÁT TIỀN. **CHỈ ĐỌC.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Chạy: KHÔNG chạy tay trên prod. Đi qua workflow
 *       `.github/workflows/doi-soat-tien-prod-chi-doc.yml` (workflow_dispatch, chỉ `main`).
 *
 * ⚠️ TỆP NÀY KHÔNG CÓ MỘT ĐƯỜNG GHI NÀO, và đó là thiết kế chứ không phải may mắn:
 *
 *   · Không có cờ `--apply`, không có tham số nào bật ghi. Chủ dự án chốt 17/09: *"script không
 *     có đường ghi nào khi chạy trong workflow (cờ --dry-run cứng, không tham số tắt)."* Một cờ
 *     thì lật được; một tệp không chứa lệnh ghi thì không.
 *   · Mọi truy vấn chạy trong `SET TRANSACTION READ ONLY` rồi ROLLBACK — Postgres tự từ chối
 *     mọi phép ghi lọt vào, kể cả phép ghi do một `import` nào đó kéo theo.
 *   · Workflow kết nối bằng user CHỈ-ĐỌC (`PROD_DATABASE_URL_RO`), không biết chuỗi đầy quyền.
 *
 * Ba lớp độc lập nhau. Ca `[BCD-01]` canh lớp thứ nhất bằng cách quét chính tệp này.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHE DỮ LIỆU CÁ NHÂN — chủ dự án chốt: *"KHÔNG in tên phụ huynh/con, SĐT che còn 4 số cuối,
 * không in nội dung CK."* Báo cáo này đi vào artifact của GitHub và job summary, tức nó rời khỏi
 * vòng kiểm soát của DB. Mã đơn + cơ sở + số tiền là đủ để quyết định; tên và nội dung CK thì
 * không thêm gì cho quyết định mà thêm rủi ro.
 */
// PHẢI đứng TRƯỚC import lib/db — Prisma đọc DATABASE_URL lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { writeFileSync } from "node:fs";
import { db } from "../lib/db";
import { kiemQuyen } from "./_kiem-quyen";
// ⚠️ DÙNG LẠI phép bóc SĐT của tầng đối khớp, không chép bản thứ hai. Hàm nằm ở module THUẦN
// `sdt-trong-memo.ts` chính vì script không import được `payos-ingest` (server-only).
import { extractVnPhoneCandidates } from "../lib/payments/sdt-trong-memo";
import { phoneVariants } from "../lib/phone";
import { locDonNhanTien } from "../lib/payments/don-nhan-tien";

/** Số chủ dự án đã đo trên prod 16/09 — dùng để ĐỐI CHIẾU, không phải để tin. */
const MOC_KHOAN_CHUA_GAN = 24;
const MOC_TIEN_CHUA_GAN = 178_544_000;

const vnd = (n: number) => n.toLocaleString("vi-VN");

/** `0905123456` → `••••••3456`. Đủ để đối chiếu với sao kê, không đủ để là danh sách SĐT. */
function cheSdt(s: string | null | undefined): string {
  if (!s) return "—";
  const so = String(s).replace(/\D/g, "");
  return so.length <= 4 ? "••••" : `••••••${so.slice(-4)}`;
}

const ra: string[] = [];
const in_ = (s = "") => {
  ra.push(s);
  console.log(s);
};

type DonGoiY = {
  id: string;
  code: string;
  coSo: string;
  soCon: number;
  coDotNull: boolean;
  conThieu: number;
};

async function main() {
  in_(`# Báo cáo đối soát tiền — CHỈ ĐỌC`);
  in_();
  const quyen = await kiemQuyen(db);
  in_(
    `**Kết nối:** \`${currentDbHost()}\` · user \`${quyen.nguoiDung}\` · ` +
      `ghi được: **${quyen.ghiDuoc === null ? "không kiểm được" : quyen.ghiDuoc ? "CÓ QUYỀN GHI ⚠️" : "KHÔNG (chỉ đọc)"}**`,
  );
  in_();

  // ⚠️ READ ONLY + ROLLBACK. `$transaction` của Prisma rollback khi callback NÉM; ta ném một lỗi
  // canh sẵn ở cuối để không lượt chạy nào commit được, kể cả khi ai đó lỡ thêm phép ghi.
  const KET = "__BAO_CAO_XONG__";
  let ketQua: { A: string[]; B: string[] } | null = null;
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      ketQua = { A: await phanA(tx), B: await phanB(tx) };
      throw new Error(KET);
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== KET) throw e;
  }
  if (!ketQua) throw new Error("Không dựng được báo cáo");

  writeFileSync("bao-cao-doi-soat-tien.md", ra.join("\n"), "utf8");
  console.error("\n[ĐÃ GHI] bao-cao-doi-soat-tien.md");
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// ═══════════════════════════════════════════════════════════════════════════
// PHẦN A — giao dịch UNMATCHED (tiền đã về, chưa gắn vào đơn nào)
// ═══════════════════════════════════════════════════════════════════════════
async function phanA(tx: Tx): Promise<string[]> {
  const txn = await tx.bankTransaction.findMany({
    where: { status: "UNMATCHED" },
    select: {
      id: true,
      provider: true,
      amount: true,
      transferredAt: true,
      content: true,
      centerId: true,
    },
    orderBy: { transferredAt: "asc" },
  });

  in_(`## A · Giao dịch UNMATCHED — tiền đã về, chưa gắn đơn`);
  in_();
  in_(`Tổng: **${txn.length} giao dịch** · **${vnd(txn.reduce((s, t) => s + t.amount, 0))}đ**`);
  in_();
  in_(`| # | Ngày | Cổng | Số tiền | SĐT trong CK | Đơn đề xuất | Cơ sở | Số con | Đợt NULL | Ghi chú |`);
  in_(`|---|---|---|---|---|---|---|---|---|---|`);

  const theoCoSo = new Map<string, { so: number; tien: number; nhieuCon: number }>();

  let i = 0;
  for (const t of txn) {
    i += 1;
    // ⚠️ KHÔNG in `t.content`. Bóc SĐT bằng ĐÚNG hàm mà tầng đối khớp dùng, rồi che.
    const sdt = extractVnPhoneCandidates(t.content);
    const goiY = await goiYDon(tx, sdt);

    const coSo = goiY?.coSo ?? "(chưa rõ)";
    const cum = theoCoSo.get(coSo) ?? { so: 0, tien: 0, nhieuCon: 0 };
    cum.so += 1;
    cum.tien += t.amount;
    if ((goiY?.soCon ?? 0) >= 2) cum.nhieuCon += 1;
    theoCoSo.set(coSo, cum);

    const ghiChu = goiY
      ? goiY.conThieu === t.amount
        ? "khớp đúng số còn thiếu"
        : `lệch số (đơn còn thiếu ${vnd(goiY.conThieu)}đ)`
      : sdt.length === 0
        ? "không bóc được SĐT từ nội dung CK"
        : "SĐT không ra ĐÚNG MỘT đơn đang chờ thu";

    in_(
      `| ${i} | ${t.transferredAt.toISOString().slice(0, 10)} | ${t.provider} | ${vnd(t.amount)}đ | ` +
        `${sdt.length ? sdt.map(cheSdt).join(" ") : "—"} | ${goiY?.code ?? "**không đề xuất**"} | ` +
        `${coSo} | ${goiY?.soCon ?? "—"} | ${goiY ? (goiY.coDotNull ? "CÓ" : "không") : "—"} | ${ghiChu} |`,
    );
  }

  in_();
  in_(`### A · Tổng theo CƠ SỞ`);
  in_();
  in_(`| Cơ sở | Số giao dịch | Tổng tiền | Cần chia nhiều con |`);
  in_(`|---|---|---|---|`);
  for (const [coSo, c] of [...theoCoSo].sort((a, b) => b[1].tien - a[1].tien)) {
    in_(`| ${coSo} | ${c.so} | ${vnd(c.tien)}đ | ${c.nhieuCon} |`);
  }
  in_();
  return ra;
}

/**
 * Gợi ý đơn từ SĐT — **GỢI Ý**, không phải đối khớp.
 *
 * ⚠️ Fail-closed và cố ý hẹp: ra ĐÚNG MỘT đơn mới đề xuất. Nhiều đơn ⇒ không đề xuất, vì đoán
 * hộ ở một bản báo cáo là gieo một con số sai vào đầu người đọc, rồi họ quyết theo nó. Luật
 * "đơn nào được nhận tiền" dùng lại `locDonNhanTien()` — cùng mảnh lọc với tầng đối khớp.
 */
async function goiYDon(tx: Tx, sdt: string[]): Promise<DonGoiY | null> {
  if (sdt.length === 0) return null;
  const bien = [...new Set(sdt.flatMap(phoneVariants))];
  const don = await tx.order.findMany({
    where: {
      ...locDonNhanTien(),
      paymentRequests: { some: { status: { in: ["PENDING", "PARTIAL"] } } },
      OR: [
        { customerPhone: { in: bien } },
        { student: { parentPhone: { in: bien } } },
        { student: { parentUser: { phone: { in: bien } } } },
      ],
    },
    select: {
      id: true,
      code: true,
      center: { select: { name: true } },
      _count: { select: { items: true } },
      paymentRequests: {
        where: { status: { in: ["PENDING", "PARTIAL"] } },
        select: { orderItemId: true, amountDue: true, allocations: { select: { amount: true } } },
      },
    },
    take: 2,
  });
  if (don.length !== 1) return null;
  const d = don[0]!;
  return {
    id: d.id,
    code: d.code,
    coSo: d.center?.name ?? "(chưa gán cơ sở)",
    soCon: d._count.items,
    coDotNull: d.paymentRequests.some((r) => r.orderItemId === null),
    conThieu: d.paymentRequests.reduce(
      (s, r) => s + Math.max(0, r.amountDue - r.allocations.reduce((x, a) => x + a.amount, 0)),
      0,
    ),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHẦN B — khoản thu CHƯA GẮN CON (`Payment.orderItemId` NULL)
// ═══════════════════════════════════════════════════════════════════════════
async function phanB(tx: Tx): Promise<string[]> {
  const khoan = await tx.payment.findMany({
    where: {
      orderItemId: null,
      deletedAt: null,
      paymentType: "PAYMENT",
      order: locDonNhanTien(),
    },
    select: {
      id: true,
      amount: true,
      orderId: true,
      order: {
        select: {
          code: true,
          customerPhone: true,
          center: { select: { name: true } },
          items: { select: { id: true, itemName: true }, orderBy: { createdAt: "asc" } },
          paymentRequests: {
            where: { status: { in: ["PENDING", "PARTIAL"] } },
            select: { orderItemId: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  in_(`## B · Khoản thu CHƯA GẮN CON (\`Payment.orderItemId\` NULL)`);
  in_();
  in_(`| # | Mã đơn | Cơ sở | SĐT | Số con | Đợt NULL | Số tiền | Đề xuất |`);
  in_(`|---|---|---|---|---|---|---|---|`);

  const theoCoSo = new Map<string, { tuDong: number; tienTuDong: number; sale: number; tienSale: number }>();
  let i = 0;
  let tuDong = 0;
  let tienTuDong = 0;
  let choSale = 0;
  let tienChoSale = 0;

  for (const k of khoan) {
    i += 1;
    const dong = k.order.items;
    const coSo = k.order.center?.name ?? "(chưa gán cơ sở)";
    const coDotNull = k.order.paymentRequests.some((r) => r.orderItemId === null);
    const cum = theoCoSo.get(coSo) ?? { tuDong: 0, tienTuDong: 0, sale: 0, tienSale: 0 };

    let deXuat: string;
    if (dong.length === 1) {
      deXuat = `gắn dòng duy nhất (\`${dong[0]!.id.slice(0, 8)}…\`)`;
      tuDong += 1;
      tienTuDong += k.amount;
      cum.tuDong += 1;
      cum.tienTuDong += k.amount;
    } else if (dong.length === 0) {
      deXuat = "**không đề xuất** — đơn không có dòng hàng nào";
    } else {
      deXuat = `**cần sale chia** — đơn ${dong.length} con`;
      choSale += 1;
      tienChoSale += k.amount;
      cum.sale += 1;
      cum.tienSale += k.amount;
    }
    theoCoSo.set(coSo, cum);

    in_(
      `| ${i} | ${k.order.code} | ${coSo} | ${cheSdt(k.order.customerPhone)} | ${dong.length} | ` +
        `${coDotNull ? "CÓ" : "không"} | ${vnd(k.amount)}đ | ${deXuat} |`,
    );
  }

  const tong = khoan.reduce((s, k) => s + k.amount, 0);
  const soDon = new Set(khoan.map((k) => k.orderId)).size;

  in_();
  in_(`### B · Tổng`);
  in_();
  in_(`- **${khoan.length} khoản / ${soDon} đơn / ${vnd(tong)}đ**`);
  in_(`- gắn tự động (đơn 1 con): **${tuDong} khoản · ${vnd(tienTuDong)}đ**`);
  in_(`- cần sale chia (đơn ≥2 con): **${choSale} khoản · ${vnd(tienChoSale)}đ**`);
  const khac = khoan.length - tuDong - choSale;
  if (khac > 0) in_(`- không đề xuất (đơn không có dòng hàng): **${khac} khoản**`);

  // ĐỐI CHIẾU với con số chủ dự án đã đo 16/09. Lệch thì NÓI RÕ, đừng im lặng.
  in_();
  if (khoan.length === MOC_KHOAN_CHUA_GAN && tong === MOC_TIEN_CHUA_GAN) {
    in_(`✅ Khớp mốc đo 16/09: ${MOC_KHOAN_CHUA_GAN} khoản / ${vnd(MOC_TIEN_CHUA_GAN)}đ.`);
  } else {
    in_(
      `⚠️ **LỆCH mốc đo 16/09** (${MOC_KHOAN_CHUA_GAN} khoản / ${vnd(MOC_TIEN_CHUA_GAN)}đ). ` +
        `Nay: ${khoan.length} khoản / ${vnd(tong)}đ.`,
    );
    in_();
    in_(`Các lý do có thể, theo thứ tự đáng ngờ giảm dần:`);
    in_(`1. webhook đã gắn \`orderItemId\` cho đơn 1 con từ khi PHIÊN B lên prod — khoản rời khỏi tập này;`);
    in_(`2. tiền mới về sau 16/09 làm tập này rộng ra;`);
    in_(`3. đơn đổi trạng thái sang DRAFT/CANCELLED/REFUNDED ⇒ bị \`locDonNhanTien()\` loại khỏi báo cáo;`);
    in_(`4. khoản bị xoá mềm hoặc đã có bút toán đảo.`);
    in_();
    in_(`**Chưa đối chiếu được nguyên nhân thì đừng chạy \`--apply\` của script gắn con.**`);
  }

  in_();
  in_(`### B · Tổng theo CƠ SỞ`);
  in_();
  in_(`| Cơ sở | Gắn tự động | Tiền | Cần sale chia | Tiền |`);
  in_(`|---|---|---|---|---|`);
  for (const [coSo, c] of [...theoCoSo].sort((a, b) => b[1].tienSale - a[1].tienSale)) {
    in_(`| ${coSo} | ${c.tuDong} | ${vnd(c.tienTuDong)}đ | ${c.sale} | ${vnd(c.tienSale)}đ |`);
  }
  in_();
  return ra;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
