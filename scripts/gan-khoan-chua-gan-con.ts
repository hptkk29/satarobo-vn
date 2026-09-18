/**
 * GẮN CON CHO NHỮNG KHOẢN THU CHƯA CÓ `orderItemId` — DRY-RUN mặc định.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Chạy:
 *   pnpm exec tsx scripts/gan-khoan-chua-gan-con.ts              # chỉ in bảng, KHÔNG ghi
 *   pnpm exec tsx scripts/gan-khoan-chua-gan-con.ts --apply      # ghi thật
 *
 * ⚠️ `--apply` CHỈ chạy sau khi chủ dự án duyệt bảng dry-run. Đây là luật cứng #4 của repo
 * ("migration/script chạm dữ liệu PROD do người vận hành chạy tay"), không phải thủ tục.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIỆC NÀY GIẢI QUYẾT CÁI GÌ
 *
 * Đo prod 16/09: **18 đơn / 24 khoản / 178.544.000đ** có `Payment` nhưng `orderItemId = NULL`
 * — tiền đã vào đơn mà không biết của bé nào. Công nợ theo con hiện chúng ở ô riêng
 * "chưa gắn con" (`tinhNoTheoCon.chuaGanCon`), cố ý KHÔNG cộng vào bé nào.
 *
 * ⚠️ Script này CHỈ tự gắn ca KHÔNG CÒN GÌ ĐỂ ĐOÁN: đơn có **đúng một** dòng hàng. Đơn từ hai
 * dòng trở lên thì việc chia là quyết định nghiệp vụ (phụ huynh đóng cho bé nào trước), và
 * script đoán hộ là đúng loại sai KHÔNG AI PHÁT HIỆN RA: tổng đơn vẫn khớp, chỉ có bé A hết nợ
 * còn bé B bị gọi đòi tiền. Những đơn ấy được LIỆT KÊ để sale chia tay ở
 * `/admin/bien-dong-so-du`.
 *
 * ⚠️ Không dùng `ganTienTheoCon`: ở đây KHÔNG có `BankTransaction` nào để phân bổ — đây là sổ
 * Ledger-A đã ghi từ trước, chỉ thiếu cột `orderItemId`. Cập nhật một cột trên dòng đã có,
 * không tạo bút toán mới, không đụng `PaymentAllocation`.
 *
 * SĐT in ra CHE còn 4 số cuối (chủ dự án chốt: *"không dán SĐT/tên đầy đủ vào báo cáo"*).
 */
// PHẢI đứng TRƯỚC import lib/db — Prisma đọc DATABASE_URL lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { db } from "../lib/db";

const APPLY = process.argv.includes("--apply");

const vnd = (n: number) => n.toLocaleString("vi-VN");

/** `0905123456` → `••••••3456`. Đủ để đối chiếu, không đủ để là danh sách SĐT. */
function cheSdt(s: string | null): string {
  if (!s) return "—";
  const so = s.replace(/[^\d]/g, "");
  return so.length <= 4 ? "••••" : `••••••${so.slice(-4)}`;
}

function cheTen(s: string | null): string {
  if (!s) return "—";
  const tu = s.trim().split(/\s+/);
  return tu.length === 1 ? tu[0]! : `${tu[0]} … ${tu[tu.length - 1]}`;
}

type DeXuat = {
  orderCode: string;
  orderId: string;
  khoanId: string;
  soTien: number;
  sdt: string;
  ten: string;
  soDong: number;
  /** Dòng hàng sẽ gắn — chỉ có khi đơn đúng một dòng. */
  orderItemId: string | null;
  tenDong: string | null;
};

async function main() {
  console.log(`[DB] ${currentDbHost()}`);
  console.log(APPLY ? "[CHẾ ĐỘ] GHI THẬT (--apply)" : "[CHẾ ĐỘ] DRY-RUN — không ghi gì");

  const khoan = await db.payment.findMany({
    where: {
      orderItemId: null,
      deletedAt: null,
      // Bút toán điều chỉnh bám theo dòng gốc, không tự gắn con.
      paymentType: "PAYMENT",
      // Đơn phải còn sống và còn nhận tiền — cùng danh sách trạng thái với tầng đối khớp.
      order: { deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED", "REFUNDED"] } },
    },
    select: {
      id: true,
      amount: true,
      orderId: true,
      order: {
        select: {
          code: true,
          customerName: true,
          customerPhone: true,
          items: { select: { id: true, itemName: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const deXuat: DeXuat[] = khoan.map((k) => {
    const dong = k.order.items;
    return {
      orderCode: k.order.code,
      orderId: k.orderId,
      khoanId: k.id,
      soTien: k.amount,
      sdt: cheSdt(k.order.customerPhone),
      ten: cheTen(k.order.customerName),
      soDong: dong.length,
      orderItemId: dong.length === 1 ? (dong[0]?.id ?? null) : null,
      tenDong: dong.length === 1 ? (dong[0]?.itemName ?? null) : null,
    };
  });

  const tuDong = deXuat.filter((d) => d.orderItemId != null);
  const choSale = deXuat.filter((d) => d.orderItemId == null && d.soDong >= 2);
  // Đơn KHÔNG có dòng hàng nào: không gắn được vào đâu, và cũng không phải việc của sale.
  const khongCoDong = deXuat.filter((d) => d.soDong === 0);

  const donTuDong = new Set(tuDong.map((d) => d.orderId)).size;
  const donChoSale = new Set(choSale.map((d) => d.orderId)).size;

  console.log("");
  console.log("═══ TỔNG ═══");
  console.log(
    `khoản chưa gắn con: ${deXuat.length} · tiền: ${vnd(deXuat.reduce((s, d) => s + d.soTien, 0))}đ · đơn: ${new Set(deXuat.map((d) => d.orderId)).size}`,
  );
  console.log(
    `  · GẮN TỰ ĐỘNG (đơn 1 con): ${tuDong.length} khoản / ${donTuDong} đơn / ${vnd(tuDong.reduce((s, d) => s + d.soTien, 0))}đ`,
  );
  console.log(
    `  · ĐỂ SALE CHIA (đơn ≥2 con): ${choSale.length} khoản / ${donChoSale} đơn / ${vnd(choSale.reduce((s, d) => s + d.soTien, 0))}đ`,
  );
  if (khongCoDong.length > 0) {
    console.log(`  · ⚠️ ĐƠN KHÔNG CÓ DÒNG HÀNG NÀO: ${khongCoDong.length} khoản — cần xem tay`);
  }

  const inBang = (ten: string, ds: DeXuat[]) => {
    if (ds.length === 0) return;
    console.log("");
    console.log(`═══ ${ten} ═══`);
    console.log(
      ["MÃ ĐƠN".padEnd(20), "SỐ TIỀN".padStart(14), "SĐT".padEnd(12), "NGƯỜI MUA".padEnd(22), "ĐỀ XUẤT"].join("  "),
    );
    for (const d of ds) {
      console.log(
        [
          d.orderCode.padEnd(20),
          `${vnd(d.soTien)}đ`.padStart(14),
          d.sdt.padEnd(12),
          d.ten.slice(0, 22).padEnd(22),
          d.orderItemId ? `gắn "${d.tenDong}"` : `${d.soDong} con — sale chia tay`,
        ].join("  "),
      );
    }
  };

  inBang("GẮN TỰ ĐỘNG — đơn đúng MỘT con", tuDong);
  inBang("ĐỂ SALE CHIA — đơn từ HAI con", choSale);
  inBang("KHÔNG GẮN ĐƯỢC — đơn không có dòng hàng", khongCoDong);

  if (!APPLY) {
    console.log("");
    console.log("DRY-RUN: chưa ghi gì. Duyệt bảng xong thì chạy lại với --apply.");
    return;
  }

  let daGan = 0;
  for (const d of tuDong) {
    // Ghi có ĐIỀU KIỆN: `orderItemId: null` trong `where` để hai lượt chạy không đè lên nhau,
    // và để một khoản đã được gắn tay ở màn đối soát không bị script ghi lại.
    const r = await db.payment.updateMany({
      where: { id: d.khoanId, orderItemId: null },
      data: { orderItemId: d.orderItemId },
    });
    daGan += r.count;
  }
  console.log("");
  console.log(`[ĐÃ GHI] gắn con cho ${daGan}/${tuDong.length} khoản.`);
  console.log(`[CÒN LẠI] ${choSale.length} khoản của ${donChoSale} đơn — sale chia ở /admin/bien-dong-so-du.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
