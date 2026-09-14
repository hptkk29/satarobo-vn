/**
 * CẤP TÀI KHOẢN PHỤ HUYNH cho những ghi danh CÒN NỢ mà học viên chưa có tài khoản.
 *
 *   pnpm parents:provision-debtors                 # DRY-RUN: chỉ liệt kê, KHÔNG ghi
 *   pnpm parents:provision-debtors --apply         # ghi thật (chỉ DB local/test)
 *   pnpm parents:provision-debtors --apply --prod  # ghi lên DB KHÔNG-local (phải cố ý gõ)
 *
 * ── Vì sao cần ──
 * Đo `satarobo_local` 14/09/2026: **97/249 ghi danh còn nợ** thuộc về học viên KHÔNG có
 * `parentUserId` (60 học viên, 80 số điện thoại). Cổng phụ huynh đọc trục A
 * (`accountantStatus = CONFIRMED`) theo `Student.parentUserId`, nên với 39% người đang
 * nợ, mọi con số ta dựng ở phía sau — kế hoạch đợt, QR, nhắc nợ — đều KHÔNG tới được
 * họ. Sale lưu kế hoạch xong, khách không thấy gì, rồi gọi điện hỏi.
 *
 * Vì sao họ chưa có: `ensureParentAccountForOrder` chỉ chạy fire-and-forget ở BA chỗ —
 * đơn chuyển sang CONFIRMED (`orders/_actions.ts`), webhook SePay, và `payos-ingest`.
 * Ghi danh tạo bằng đường khác (seed, bulk-convert, nhập liệu cũ) không đi qua chỗ nào
 * trong ba chỗ đó, nên tài khoản không bao giờ được cấp và KHÔNG có cron nào quét lại.
 *
 * ── DÙNG LẠI, KHÔNG VIẾT LẠI ──
 * Script gọi thẳng `ensureParentAccountForOrder` (lib/parents/provision.ts) chứ không tự
 * tạo `User`. Hàm đó đã mang sẵn: khoá theo SĐT canonical, idempotent (đã có tài khoản
 * thì KHÔNG tạo lại và KHÔNG gửi lại), gắn `Student.parentUserId`, và công tắc ngắt
 * `AUTH_PHONE_PROVISIONING`. Viết bản thứ hai là đẻ một đường cấp tài khoản mà không ai
 * test và không ai nhớ khi sửa luật đăng nhập.
 *
 * ⚠️ NÓ GỬI ZNS. `ensureParentAccountForOrder` gọi `sendZaloNotification` với mẫu "Cấp
 * tài khoản" (gác thêm bởi setting `zalo.znsAccountEnabled`). Chạy `--apply` trên PROD
 * là NHẮN THẬT cho từng phụ huynh. Trên máy không khai creds Zalo thì ZNS chỉ SIMULATED
 * — nhưng đừng lấy đó làm căn cứ cho lượt chạy prod. Dry-run in rõ sẽ nhắn bao nhiêu người.
 *
 * ⚠️ MỘT PHỤ HUYNH NHIỀU CON = MỘT TÀI KHOẢN. Gom theo SĐT canonical trước khi gọi, nếu
 * không thì em thứ hai kích hoạt lần cấp thứ hai — hàm đích idempotent nên không tạo
 * trùng, nhưng ta sẽ đếm sai và (tệ hơn) báo cáo sai số người sắp bị nhắn tin.
 */
// `_cho-phep-server-only` phải chạy TRƯỚC khi nhập `lib/parents/provision` — tệp đó mở
// đầu bằng `import "server-only"`, package do Next cấp lúc build và KHÔNG có trong
// node_modules (đã đo: `ls node_modules/server-only` trống). Vì `import` tĩnh bị HOIST,
// `ensureParentAccountForOrder` phải nhập ĐỘNG ở trong `main` — nếp này lấy nguyên từ
// `scripts/backfill-dong-buoi-thoa.ts`.
import "./_cho-phep-server-only";
// PHẢI đứng TRƯỚC import lib/db — Prisma đọc DATABASE_URL lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { db } from "@/lib/db";
import { canonicalPhone } from "@/lib/phone";
import { KHOAN_DA_XAC_NHAN } from "@/lib/finance/debt";

type Ung = {
  studentId: string;
  studentName: string;
  parentName: string | null;
  phoneCanon: string;
  /** Đơn dùng để cấp — `ensureParentAccountForOrder` nhận orderId, không nhận studentId. */
  orderId: string;
  orderCode: string;
  conNo: number;
};

/**
 * Học viên CÒN NỢ mà chưa có tài khoản phụ huynh, kèm MỘT đơn để cấp qua.
 *
 * "Còn nợ" dùng đúng định nghĩa TRỤC A của `/cong-no` và cổng phụ huynh
 * (`KHOAN_DA_XAC_NHAN`) — không tự chế phép tính thứ hai, vì con số này quyết định ta
 * nhắn tin cho ai.
 */
async function timUngVien(): Promise<Ung[]> {
  const ghiDanh = await db.enrollment.findMany({
    where: {
      deletedAt: null,
      finalPrice: { not: null },
      student: { parentUserId: null, parentPhone: { not: null } },
    },
    select: {
      id: true,
      finalPrice: true,
      tuition: true,
      studentId: true,
      student: { select: { id: true, name: true, parentName: true, parentPhone: true } },
      payments: { where: KHOAN_DA_XAC_NHAN, select: { amount: true } },
      orderItems: {
        where: { order: { deletedAt: null } },
        select: { order: { select: { id: true, code: true } } },
        take: 1,
      },
    },
  });

  const ra: Ung[] = [];
  for (const e of ghiDanh) {
    const phaiDong = e.finalPrice ?? e.tuition ?? 0;
    const daXacNhan = e.payments.reduce((s, p) => s + p.amount, 0);
    const conNo = phaiDong - daXacNhan;
    if (conNo <= 0) continue;

    const don = e.orderItems[0]?.order;
    if (!don) continue; // không có đơn thì không có đường cấp — báo riêng ở tổng kết
    const phoneCanon = canonicalPhone(e.student?.parentPhone);
    if (!phoneCanon) continue;

    ra.push({
      studentId: e.studentId,
      studentName: e.student?.name ?? "(không rõ)",
      parentName: e.student?.parentName ?? null,
      phoneCanon,
      orderId: don.id,
      orderCode: don.code,
      conNo,
    });
  }
  return ra;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const allowRemote = process.argv.includes("--prod");
  const host = currentDbHost();
  const laLocal = /localhost|127\.0\.0\.1/.test(host);

  console.log(
    `\n═══ CẤP TÀI KHOẢN PH CHO NGƯỜI CÒN NỢ ${apply ? "(GHI THẬT)" : "(DRY-RUN — không ghi, không nhắn)"} ═══`,
  );
  console.log(`DB: ${host}`);

  if (apply && !laLocal && !allowRemote) {
    console.error(
      `\n⛔ DỪNG: \`--apply\` trên DB KHÔNG-local mà thiếu \`--prod\`.\n` +
        `   Lượt này sẽ TẠO TÀI KHOẢN và NHẮN ZNS cho phụ huynh thật.\n` +
        `   Muốn chạy thì gõ tường minh: --apply --prod`,
    );
    process.exitCode = 1;
    return;
  }

  const ungVien = await timUngVien();

  // Một phụ huynh nhiều con ⇒ MỘT tài khoản. Gom theo SĐT canonical.
  const theoPhone = new Map<string, Ung[]>();
  for (const u of ungVien) {
    const cu = theoPhone.get(u.phoneCanon);
    if (cu) cu.push(u);
    else theoPhone.set(u.phoneCanon, [u]);
  }

  console.log(
    `\nGhi danh còn nợ, chưa có TK phụ huynh: ${ungVien.length}` +
      `\nSố phụ huynh (gom theo SĐT):          ${theoPhone.size}` +
      `\nTổng còn nợ:                          ${ungVien
        .reduce((s, u) => s + u.conNo, 0)
        .toLocaleString("vi-VN")}đ`,
  );

  if (theoPhone.size === 0) {
    console.log("\nKhông có ai để cấp. Xong.");
    return;
  }

  // Nhập ĐỘNG — xem chú thích ở đầu tệp về `server-only` + hoist.
  const { ensureParentAccountForOrder } = await import("@/lib/parents/provision");

  let daTao = 0;
  let daCo = 0;
  let loi = 0;

  for (const [phone, nhom] of theoPhone) {
    const dau = nhom[0]!;
    const nhan = `${dau.parentName ?? "(chưa rõ tên PH)"} · ${phone} · ${nhom.length} con · đơn ${dau.orderCode}`;

    if (!apply) {
      console.log(`  [dry] ${nhan}`);
      continue;
    }

    const kq = await ensureParentAccountForOrder(dau.orderId);
    if (!kq.ok) {
      loi += 1;
      console.log(`  ✗ ${nhan} — ${kq.reason}`);
      continue;
    }
    if (kq.created) {
      daTao += 1;
      console.log(`  ✓ TẠO MỚI  ${nhan}`);
    } else {
      daCo += 1;
      console.log(`  · đã có    ${nhan}`);
    }
  }

  console.log(`\n── Kết quả ──`);
  if (apply) {
    console.log(
      `Tạo mới:   ${daTao}\nĐã có sẵn: ${daCo}\nLỗi:       ${loi}\n` +
        `\n⚠️ Mỗi tài khoản TẠO MỚI đã kích hoạt một lượt gửi ZNS "Cấp tài khoản"` +
        `\n   (SIMULATED nếu máy không khai creds Zalo).`,
    );
  } else {
    console.log(
      `DRY-RUN — chưa ghi gì, chưa nhắn ai.` +
        `\nChạy lại với \`--apply\` để tạo ${theoPhone.size} tài khoản` +
        ` và gửi tối đa ${theoPhone.size} tin ZNS.`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
