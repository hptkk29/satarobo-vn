/**
 * CHUYỂN TÀI KHOẢN NHẬN TIỀN: IntegrationConfig `VIETQR:*` → PaymentMethod.bank* (31/08/2026)
 *
 * Từ 31/08 tài khoản nhận tiền khai NGAY TRONG phương thức thanh toán loại "Chuyển
 * khoản". Kho cũ (`IntegrationConfig`, khoá `VIETQR:<centerId>` và `VIETQR` trần) đã
 * ngừng là nơi khai — màn /admin/tich-hop gỡ khối đó — nhưng đường đọc vẫn LÙI về nó để
 * dữ liệu khai trước ngày này không mất. Script này dọn nốt cái đuôi đó.
 *
 * CÁCH CHẠY (mặc định là DRY-RUN, không ghi gì):
 *   pnpm exec tsx scripts/pttt-chuyen-tai-khoan-vietqr.ts
 *   pnpm exec tsx scripts/pttt-chuyen-tai-khoan-vietqr.ts --commit
 *
 * ⚠️ TRÊN PROD: chạy qua GitHub workflow, KHÔNG chạy từ máy dev — `.env` ở máy trỏ DB
 * DEV (xem memory "Chạy script trên PROD"). Và luật cứng Nền Hệ thống #4: script đụng dữ
 * liệu prod phải có dry-run + người vận hành chạy tay.
 *
 * VIỆC NÓ LÀM, cho từng khoá `VIETQR:<centerId>`:
 *  1. Tìm phương thức BANK_TRANSFER của đúng cơ sở đó.
 *     · Có rồi mà CHƯA khai tài khoản → điền vào (không đè lên tài khoản đã khai tay).
 *     · Chưa có → TẠO mới, mã `BANK_<CODE-CƠ-SỞ>`, tên "Chuyển khoản — <tên cơ sở>".
 *  2. Khoá `VIETQR` trần (cấu hình chung cũ) → phương thức DÙNG CHUNG (`centerId = null`),
 *     mã `BANK_TRANSFER` nếu chưa có ai chiếm mã đó.
 *
 * KHÔNG xoá dòng IntegrationConfig nào — giữ lại làm bằng chứng đối chiếu. Chạy lại
 * nhiều lần an toàn: bước nào đã xong sẽ báo "bỏ qua".
 */
import { PrismaClient, PaymentMethodType } from "@prisma/client";

const db = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

type Cfg = { bankBin: string; accountNumber: string; accountName: string };

function parseCfg(settings: unknown): Cfg | null {
  const s = (settings ?? null) as Partial<Cfg> | null;
  if (!s?.bankBin || !s.accountNumber || !s.accountName) return null;
  return {
    bankBin: s.bankBin,
    accountNumber: s.accountNumber,
    accountName: s.accountName,
  };
}

/** Mã phương thức từ mã cơ sở: "CS1" → "BANK_CS1". Cơ sở không có code → dùng id rút gọn. */
function methodCodeFor(centerCode: string | null, centerId: string): string {
  const raw = (centerCode ?? centerId).toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `BANK_${raw}`.slice(0, 50);
}

async function main() {
  console.log(COMMIT ? "== GHI THẬT ==" : "== DRY-RUN (thêm --commit để ghi) ==");

  const rows = await db.integrationConfig.findMany({
    where: { provider: { startsWith: "VIETQR" } },
    select: { provider: true, settings: true },
  });
  if (rows.length === 0) {
    console.log("Không có dòng VIETQR nào — không có gì để chuyển.");
    return;
  }

  let taoMoi = 0;
  let dienVao = 0;
  let boQua = 0;

  for (const row of rows) {
    const cfg = parseCfg(row.settings);
    if (!cfg) {
      console.log(`- ${row.provider}: thiếu trường, BỎ QUA`);
      boQua++;
      continue;
    }

    // `VIETQR` trần = cấu hình chung → phương thức dùng chung (centerId null).
    const centerId = row.provider.startsWith("VIETQR:")
      ? row.provider.slice("VIETQR:".length)
      : null;

    const center = centerId
      ? await db.center.findUnique({
          where: { id: centerId },
          select: { id: true, code: true, name: true },
        })
      : null;
    if (centerId && !center) {
      console.log(`- ${row.provider}: cơ sở không còn tồn tại, BỎ QUA`);
      boQua++;
      continue;
    }

    const existing = await db.paymentMethod.findFirst({
      where: { centerId, type: PaymentMethodType.BANK_TRANSFER },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        code: true,
        bankBin: true,
        bankAccountNumber: true,
        bankAccountName: true,
      },
    });

    if (existing) {
      const daKhai =
        existing.bankBin && existing.bankAccountNumber && existing.bankAccountName;
      if (daKhai) {
        console.log(
          `- ${row.provider}: "${existing.code}" đã khai tài khoản rồi, BỎ QUA (không đè)`,
        );
        boQua++;
        continue;
      }
      console.log(
        `- ${row.provider}: điền tài khoản vào "${existing.code}" (${cfg.accountNumber})`,
      );
      if (COMMIT) {
        await db.paymentMethod.update({
          where: { id: existing.id },
          data: {
            bankBin: cfg.bankBin,
            bankAccountNumber: cfg.accountNumber,
            bankAccountName: cfg.accountName,
          },
        });
      }
      dienVao++;
      continue;
    }

    // Chưa có phương thức chuyển khoản nào cho cấp này → tạo mới.
    const code = center ? methodCodeFor(center.code, center.id) : "BANK_TRANSFER";
    const trung = await db.paymentMethod.findUnique({
      where: { code },
      select: { id: true },
    });
    if (trung) {
      console.log(
        `- ${row.provider}: mã "${code}" đã bị dòng khác chiếm — TẠO TAY rồi chạy lại`,
      );
      boQua++;
      continue;
    }

    const name = center ? `Chuyển khoản — ${center.name}` : "Chuyển khoản ngân hàng";
    console.log(`- ${row.provider}: TẠO "${code}" (${name}) · ${cfg.accountNumber}`);
    if (COMMIT) {
      await db.paymentMethod.create({
        data: {
          code,
          name,
          type: PaymentMethodType.BANK_TRANSFER,
          centerId,
          isActive: true,
          canBuyCourse: true,
          canBuyPackage: true,
          canBuyExam: true,
          bankBin: cfg.bankBin,
          bankAccountNumber: cfg.accountNumber,
          bankAccountName: cfg.accountName,
        },
      });
    }
    taoMoi++;
  }

  console.log(
    `\nTổng: ${rows.length} dòng VIETQR → tạo mới ${taoMoi}, điền vào ${dienVao}, bỏ qua ${boQua}.`,
  );
  if (!COMMIT) console.log("DRY-RUN — chưa ghi gì. Thêm --commit để thực hiện.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
