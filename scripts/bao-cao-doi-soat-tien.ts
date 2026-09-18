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
import { locDonNhanTien, TRANG_THAI_DON_KHONG_NHAN_TIEN } from "../lib/payments/don-nhan-tien";

/**
 * Số chủ dự án đã ĐO TRỰC TIẾP trên prod — dùng để ĐỐI CHIẾU, không phải để tin.
 *
 * ⚠️ Mốc là thứ PHẢI ĐỔI theo thời gian, và đó là điểm của nó: một con số cứng trong mã buộc
 * người đọc phải GIẢI THÍCH được vì sao nó lệch, thay vì lướt qua một bảng không ai đối chiếu.
 * Lịch sử: A từ 24 (16/09) xuống 22 (17/09) — 2 giao dịch được gắn tay, 1 giao dịch SEPAY mới về.
 *
 * Mốc B vẫn là số đo 16/09 và **nhiều khả năng đã cũ** — hai giao dịch gắn tay ấy cũng rút khỏi
 * tập B nếu chúng được gắn kèm `orderItemId`. Chủ dự án chốt 17/09: **lệch giải thích được
 * thì không phải lỗi** — in số mới kèm lý do, đừng báo đỏ. Đó là lý do khối đối chiếu phân biệt
 * rõ lý do LÀNH với lý do KHÔNG lành, thay vì cảnh báo đều một giọng.
 */
const MOC_GIAO_DICH_UNMATCHED = 22;
// ⚠️ MỐC NÀY ĐÃ ĐỔI 18/09/2026 — backfill đã TIÊU THỤ mốc cũ.
//
// Mốc cũ là **24 khoản / 178.544.000đ** (đo 16/09). Sau khi lệnh backfill
// (`scripts/backfill-orderitem-apply.ts`, run 35296161114) gắn 146 khoản / 119 đơn, tập này
// co lại còn đúng phần **đơn ≥2 con** — thứ mà backfill cố ý KHÔNG chạm vì phải đoán bé nào.
//
// Giữ mốc cũ thì báo cáo in ⚠️ "LỆCH" ở **mọi lượt chạy từ nay**, và lệch ấy do chính lệnh
// mình vừa chạy sinh ra — tức một cảnh báo đúng hình thức mà sai nội dung. Một cảnh báo luôn kêu
// là một cảnh báo sắp bị bỏ qua, kể cả lần nó kêu đúng.
const MOC_KHOAN_CHUA_GAN = 4;
const MOC_TIEN_CHUA_GAN = 4_836_000;

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
  let ketQua: { A: string[]; A2: string[]; B: string[] } | null = null;
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        ketQua = { A: await phanA(tx), A2: await phanA2(tx), B: await phanB(tx) };
        throw new Error(KET);
      },
      // Trần mặc định của transaction TƯƠNG TÁC là 5 giây. Báo cáo này quét vài trăm dòng qua
      // WAN sang Supabase và `goiYDon` còn là N+1 (nợ đang ghim ở CLAUDE.md).
      //
      // ⚠️ Con số này KHÔNG phải bản vá cho N+1 — nâng trần mà giữ N+1 là vá TRIỆU CHỨNG.
      // Nó chỉ để một transaction ĐỌC không bị cắt giữa đường. Bản sao N+1 ở
      // `backfill-orderitem-dry.ts` đã chết `P2028` thật vì thiếu đúng thứ này CỘNG với N+1.
      { timeout: 120_000, maxWait: 15_000 },
    );
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
  // ĐỐI CHIẾU với số chủ dự án đo tay 17/09. Lệch thì NÓI RÕ, đừng im lặng.
  if (txn.length === MOC_GIAO_DICH_UNMATCHED) {
    in_(`✅ Khớp mốc đo 17/09: ${MOC_GIAO_DICH_UNMATCHED} giao dịch UNMATCHED.`);
  } else {
    in_(`⚠️ **LỆCH mốc đo 17/09** (${MOC_GIAO_DICH_UNMATCHED} giao dịch). Nay: ${txn.length}.`);
    in_();
    in_(`Các lý do có thể, theo thứ tự đáng ngờ giảm dần:`);
    in_(`1. sale đã gắn thêm giao dịch tay ⇒ tập này hẹp lại (lành);`);
    in_(`2. tiền mới về sau 17/09 chưa ai gắn ⇒ tập rộng ra (lành);`);
    in_(`3. webhook đối khớp tự động đã chuyển một số giao dịch sang MATCHED;`);
    in_(`4. một giao dịch bị đổi trạng thái tay mà không có bút toán đi kèm — đây là lý do DUY NHẤT không lành, soi \`AuditLog\` trước khi làm tiếp.`);
  }
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
 * PHẦN A2 — phân nhóm các giao dịch UNMATCHED **có SĐT nhưng KHÔNG ra đơn nào đang chờ thu**.
 *
 * Chủ dự án hỏi 18/09/2026: 11 dòng ấy hỏng ở đâu? Ba nhóm, kiểm THEO THỨ TỰ:
 *   1. SĐT có khớp `Order` nào **không kể trạng thái** không ⇒ khớp, nhưng đơn
 *      PAID/CANCELLED/DRAFT/REFUNDED. In trạng thái ra.
 *   2. khớp một đơn đang nhận tiền được, nhưng đơn ấy **không còn phiếu PENDING/PARTIAL**.
 *   3. không khớp **bất kỳ** `Order` / `Lead` / `Student` nào ⇒ nhiều khả năng **SĐT người
 *      chuyển ≠ SĐT đăng ký**. Đây là tập sale phải tra TAY.
 *
 * ⚠️ Thứ tự kiểm là một phần của định nghĩa, không phải chi tiết cài đặt: một giao dịch có thể
 * thoả nhiều nhóm (SĐT khớp cả đơn CANCELLED lẫn đơn PAID). Xếp nó vào nhóm ĐẦU TIÊN thoả, và
 * nói rõ thứ tự ra, thì ba con số cộng lại đúng bằng tổng — không nhóm nào đếm hai lần.
 *
 * ⚠️ MỘT CÂU TRA CHO CẢ LÔ, không N+1. Bản N+1 của `goiYDon` ngay dưới đã làm
 * `backfill-orderitem-dry.ts` chết `P2028` trên prod (xem CLAUDE.md, nợ đang ghim).
 *
 * CHE DỮ LIỆU: mã giao dịch + số tiền + SĐT che 4 số cuối. KHÔNG tên, KHÔNG nội dung CK.
 */
async function phanA2(tx: Tx): Promise<string[]> {
  // ⚠️ Dùng `in_`/`ra` TOÀN CỤC, y như `phanA`/`phanB`. Bản đầu khai một `ra` cục bộ và trả
  // về nó — chữ in ra KHÔNG BAO GIỜ tới file, vì `main()` ghi từ `ra` toàn cục. Báo cáo vẫn
  // "chạy xong" và vẫn thiếu nguyên một mục: đúng loại lỗi không ném, không đỏ, chỉ mất.
  const txn = await tx.bankTransaction.findMany({
    where: { status: "UNMATCHED" },
    select: { id: true, providerTxnId: true, amount: true, content: true, transferredAt: true },
    orderBy: { transferredAt: "asc" },
  });

  // Bóc SĐT cả lô, gom mọi biến thể — MỘT lần.
  const bien = txn.map((t) => [...new Set(extractVnPhoneCandidates(t.content).flatMap(phoneVariants))]);
  const tatCa = [...new Set(bien.flat())];

  // Ba câu tra cho CẢ LÔ (không phải cho từng giao dịch).
  const [donMoiTrangThai, leadKhop, hocVienKhop] = await Promise.all([
    tatCa.length === 0
      ? Promise.resolve([] as { customerPhone: string | null; code: string; status: string; coPhieuMo: boolean }[])
      : tx.order
          .findMany({
            where: { customerPhone: { in: tatCa }, deletedAt: null },
            select: {
              customerPhone: true,
              code: true,
              status: true,
              paymentRequests: { where: { status: { in: ["PENDING", "PARTIAL"] } }, select: { id: true }, take: 1 },
            },
          })
          .then((ds) =>
            ds.map((d) => ({
              customerPhone: d.customerPhone,
              code: d.code,
              status: d.status as string,
              coPhieuMo: d.paymentRequests.length > 0,
            })),
          ),
    tatCa.length === 0
      ? Promise.resolve([] as { phone: string | null }[])
      : tx.lead.findMany({ where: { phone: { in: tatCa } }, select: { phone: true } }),
    tatCa.length === 0
      ? Promise.resolve([] as { parentPhone: string | null }[])
      : tx.student.findMany({ where: { parentPhone: { in: tatCa } }, select: { parentPhone: true } }),
  ]);

  const donTheoSdt = new Map<string, typeof donMoiTrangThai>();
  for (const d of donMoiTrangThai) {
    if (!d.customerPhone) continue;
    const cum = donTheoSdt.get(d.customerPhone) ?? [];
    cum.push(d);
    donTheoSdt.set(d.customerPhone, cum);
  }
  const sdtCoLead = new Set(leadKhop.map((x) => x.phone).filter((x): x is string => !!x));
  const sdtCoHocVien = new Set(hocVienKhop.map((x) => x.parentPhone).filter((x): x is string => !!x));

  type Dong = { ma: string; tien: number; sdt: string; ghiChu: string };
  const nhom1: Dong[] = []; // khớp đơn nhưng trạng thái không nhận tiền
  const nhom2: Dong[] = []; // khớp đơn nhận tiền được, nhưng hết phiếu mở
  const nhom3: Dong[] = []; // không khớp đơn/lead/học viên nào

  const CAM = new Set<string>(TRANG_THAI_DON_KHONG_NHAN_TIEN);

  for (let i = 0; i < txn.length; i += 1) {
    const t = txn[i]!;
    const bs = bien[i]!;
    if (bs.length === 0) continue; // "không bóc được SĐT" — đã đếm ở phần A, không thuộc 11 dòng này
    const don = bs.flatMap((p) => donTheoSdt.get(p) ?? []);
    if (don.some((d) => d.coPhieuMo)) continue; // ra đơn đang chờ thu ⇒ không thuộc 11 dòng này

    // Dùng LẠI `cheSdt` — đừng viết bản thứ hai của phép che. Hai bản là hai cơ hội để một
    // bản quên che.
    const che = cheSdt(bs[0]!);
    const dong: Dong = { ma: t.providerTxnId, tien: t.amount, sdt: che, ghiChu: "" };

    // THỨ TỰ KIỂM — xem chú thích đầu hàm.
    const donCam = don.filter((d) => CAM.has(d.status));
    if (donCam.length > 0) {
      dong.ghiChu = [...new Set(donCam.map((d) => `${d.code}/${d.status}`))].join(" · ");
      nhom1.push(dong);
      continue;
    }
    if (don.length > 0) {
      dong.ghiChu = [...new Set(don.map((d) => `${d.code}/${d.status}`))].join(" · ");
      nhom2.push(dong);
      continue;
    }
    const coLead = bs.some((p) => sdtCoLead.has(p));
    const coHV = bs.some((p) => sdtCoHocVien.has(p));
    dong.ghiChu = coLead || coHV ? `có ${[coLead ? "lead" : "", coHV ? "học viên" : ""].filter(Boolean).join("+")} nhưng KHÔNG đơn nào` : "không khớp đơn/lead/học viên nào";
    nhom3.push(dong);
  }

  const tong = (ds: Dong[]) => ds.reduce((s, x) => s + x.tien, 0);

  in_(`## A2 · Vì sao "có SĐT nhưng không ra đúng một đơn"`);
  in_();
  in_(`Kiểm THEO THỨ TỰ, mỗi dòng xếp vào nhóm ĐẦU TIÊN thoả ⇒ ba nhóm cộng lại không đếm trùng.`);
  in_();
  in_(`| Nhóm | Số giao dịch | Tổng tiền |`);
  in_(`|---|---|---|`);
  in_(`| 1 · khớp đơn nhưng đơn DRAFT/CANCELLED/REFUNDED | ${nhom1.length} | ${vnd(tong(nhom1))}đ |`);
  in_(`| 2 · khớp đơn nhận tiền được, nhưng **hết phiếu PENDING/PARTIAL** | ${nhom2.length} | ${vnd(tong(nhom2))}đ |`);
  in_(`| 3 · **không khớp đơn/lead/học viên nào** → SALE TRA TAY | ${nhom3.length} | ${vnd(tong(nhom3))}đ |`);
  in_();

  for (const [ten, ds] of [
    ["1 · khớp đơn nhưng trạng thái không nhận tiền", nhom1],
    ["2 · khớp đơn, hết phiếu đang mở", nhom2],
    ["3 · KHÔNG khớp gì — sale tra tay", nhom3],
  ] as const) {
    in_(`### Nhóm ${ten} — ${ds.length} giao dịch · ${vnd(tong(ds))}đ`);
    in_();
    if (ds.length === 0) {
      in_(`- (không có)`);
      in_();
      continue;
    }
    in_(`| Mã giao dịch | Số tiền | SĐT | Ghi chú |`);
    in_(`|---|---|---|---|`);
    for (const d of ds) in_(`| \`${d.ma}\` | ${vnd(d.tien)}đ | ${d.sdt} | ${d.ghiChu} |`);
    in_();
  }

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
    in_(`✅ Khớp mốc SAU BACKFILL 18/09: ${MOC_KHOAN_CHUA_GAN} khoản / ${vnd(MOC_TIEN_CHUA_GAN)}đ (đơn ≥2 con).`);
  } else {
    in_(
      `⚠️ **LỆCH mốc sau backfill 18/09** (${MOC_KHOAN_CHUA_GAN} khoản / ${vnd(MOC_TIEN_CHUA_GAN)}đ). ` +
        `Nay: ${khoan.length} khoản / ${vnd(tong)}đ.`,
    );
    in_();
    in_(`Lệch KHÔNG phải lỗi — lệch KHÔNG GIẢI THÍCH ĐƯỢC mới là. Bốn lý do, ba đầu là LÀNH:`);
    in_(`1. sale đã chia tay các khoản của đơn ≥2 con ⇒ tập hẹp lại — **lành, đó là mục tiêu**;`)
    in_(`2. webhook gắn \`orderItemId\` cho đơn 1 con ⇒ khoản rời khỏi tập — **lành**;`);
    in_(`3. đơn MỚI có ≥2 con vừa nhận tiền ⇒ tập rộng ra — **lành, và đúng việc sale phải chia**;`)
    in_(
      `4. đơn rơi sang DRAFT/CANCELLED/REFUNDED (bị \`locDonNhanTien()\` loại), hoặc khoản bị xoá mềm / đã có ` +
        `bút toán đảo — **đây là lý do duy nhất KHÔNG lành**: tiền đã về mà đơn không còn nhận được nữa. ` +
        `Soi \`AuditLog\` của đơn trước khi làm tiếp.`,
    );
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
