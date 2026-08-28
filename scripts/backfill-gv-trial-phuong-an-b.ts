// scripts/backfill-gv-trial-phuong-an-b.ts — ĐẢO backfill giáo viên học thử sang PHƯƠNG ÁN B.
//
// ┌─ Chuyện gì đã xảy ra ────────────────────────────────────────────────────────────┐
// │ Migration `20260825140000_trial_gv_phan_cong_va_doi_lich` backfill theo PHƯƠNG ÁN │
// │ A: mọi ca `ACTIVE` của lớp có giáo viên đều được coi là ĐÃ PHÂN CÔNG. An toàn cho │
// │ vận hành nhưng sai nghiệp vụ ở một chỗ: lớp Sale vừa tạo hôm qua cũng thành "Đào  │
// │ tạo đã duyệt" dù chưa ai duyệt — tức là bước duyệt bị bỏ qua trên toàn bộ tồn kho.│
// │ Chủ dự án chốt 27/08/2026: đổi sang PHƯƠNG ÁN B.                                  │
// └──────────────────────────────────────────────────────────────────────────────────┘
//
// PHƯƠNG ÁN B — phân biệt theo NGƯỜI ĐƯA CA VÀO LỚP:
//   · người đó có quyền quản lý / đào tạo  → giữ `gvPhanCongId` (đã duyệt thật)
//   · người đó là Sale, hoặc không rõ là ai → hạ xuống `gvDeXuatId`, xoá `gvPhanCongId`
//
// ⚠️ VÌ SAO DÙNG `addedById` CHỨ KHÔNG PHẢI AUDIT LOG. Bản rà soát ban đầu đề xuất suy
// người gán từ `AuditLog`. Đo lại thì **không có vết nào**: `assignTrialTeacherAction`
// không ghi audit cho lượt gán giáo viên (chỉ lượt XOÁ lớp mới ghi), và `TrialClassV2`
// không có cột người tạo. Tín hiệu thật duy nhất còn lại là `TrialEnrollment.addedById`
// — người xếp bé vào lớp. Nói thẳng ra đây để lần sau không ai đi tìm audit log đó nữa.
//
// ⚠️ HƯỚNG AN TOÀN LÀ "ĐỀ XUẤT". Không rõ người đưa vào là ai ⇒ hạ về đề xuất, bắt Đào
// tạo bấm duyệt. Chiều ngược lại (không rõ ⇒ coi như đã duyệt) là dựng lại đúng phương
// án A mà ta đang bỏ.
//
// CHẠY (luật cứng #4 — người vận hành chạy tay, xem dry-run trước):
//   pnpm exec tsx scripts/backfill-gv-trial-phuong-an-b.ts --dry-run
//   pnpm exec tsx scripts/backfill-gv-trial-phuong-an-b.ts
//
// ⚠️ Ép `DATABASE_URL` = `DIRECT_URL` (session pooler :5432). Qua transaction pooler
// :6543 script rời sẽ đâm `42P05 prepared statement "s0" already exists`.
//
// IDEMPOTENT: chạy lại chỉ ghi những dòng còn lệch; chạy hai lần ra cùng kết quả.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DRY = process.argv.includes("--dry-run");

/**
 * Vai được coi là ĐÃ DUYỆT khi đưa ca vào lớp.
 *
 * Nhận cả mã enum v1 (`User.role`/`roles[]`) lẫn `RoleDef.code` của v2 — hai bộ chỉ
 * trùng nhau một phần, và dev/test chạy v1 còn prod chạy v2, nên phải nhìn cả hai.
 */
const VAI_DUYET = new Set([
  "SUPER_ADMIN",
  "CENTER_MANAGER",
  "TRAINING",
  "CENTER_CLASS_MANAGER",
]);

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(`\n  Đích ghi: ${(() => { try { return new URL(url).host; } catch { return "(không đọc được)"; } })()}`);
  if (url.includes(":6543")) {
    console.warn("  ⚠ Đang dùng pooler giao dịch :6543 — vấp 42P05 thì đổi sang DIRECT_URL (:5432).");
  }

  const cas = await db.trialEnrollment.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      addedById: true,
      gvDeXuatId: true,
      gvPhanCongId: true,
      trialClass: { select: { teacherId: true, centerId: true } },
    },
  });

  // Vai của những người đã đưa ca vào lớp — tra MỘT lượt.
  const nguoiIds = [...new Set(cas.map((c) => c.addedById).filter((x): x is string => !!x))];
  const nguoi = nguoiIds.length
    ? await db.user.findMany({
        where: { id: { in: nguoiIds } },
        select: { id: true, name: true, role: true, roles: true },
      })
    : [];
  const vaiTheoNguoi = new Map(
    nguoi.map((u) => [u.id, [u.role as string, ...((u.roles as string[]) ?? [])]]),
  );

  // Vai v2 (UserOrgRole → RoleDef.code) — prod enforce v2, nhiều người không có mã v1
  // tương ứng (HO_SALE, CENTER_CLASS_MANAGER cố ý không có mã legacy).
  const uor = nguoiIds.length
    ? await db.userOrgRole.findMany({
        where: { userId: { in: nguoiIds }, status: "ACTIVE" },
        select: { userId: true, role: { select: { code: true } } },
      })
    : [];
  for (const r of uor) {
    const ds = vaiTheoNguoi.get(r.userId) ?? [];
    ds.push(r.role.code);
    vaiTheoNguoi.set(r.userId, ds);
  }

  let haXuongDeXuat = 0;
  let giuPhanCong = 0;
  let khongDoi = 0;
  const viDu: string[] = [];

  for (const ca of cas) {
    const gvLop = ca.trialClass.teacherId;
    if (!gvLop) {
      khongDoi++;
      continue; // lớp chưa có giáo viên — không có gì để phân loại
    }

    const vai = ca.addedById ? (vaiTheoNguoi.get(ca.addedById) ?? []) : [];
    const daDuyet = vai.some((v) => VAI_DUYET.has(v));

    if (daDuyet) {
      // Người đưa vào có quyền duyệt ⇒ giữ nguyên phân công. Bù `gvDeXuatId` nếu trống
      // để hai ô luôn kể được câu chuyện đầy đủ (đề xuất ai → duyệt ai).
      if (ca.gvPhanCongId === gvLop && ca.gvDeXuatId === gvLop) {
        khongDoi++;
        continue;
      }
      if (!DRY) {
        await db.trialEnrollment.update({
          where: { id: ca.id },
          data: { gvPhanCongId: gvLop, gvDeXuatId: gvLop },
        });
      }
      giuPhanCong++;
      continue;
    }

    // Sale hoặc không rõ ⇒ mới ở mức ĐỀ XUẤT, chờ Đào tạo duyệt.
    if (ca.gvPhanCongId === null && ca.gvDeXuatId === gvLop) {
      khongDoi++;
      continue;
    }
    if (!DRY) {
      await db.trialEnrollment.update({
        where: { id: ca.id },
        data: { gvDeXuatId: gvLop, gvPhanCongId: null },
      });
    }
    haXuongDeXuat++;
    if (viDu.length < 5) {
      const ten = ca.addedById ? (nguoi.find((u) => u.id === ca.addedById)?.name ?? ca.addedById) : "(không rõ ai đưa vào)";
      viDu.push(`${ca.id} — người đưa vào: ${ten}`);
    }
  }

  console.log(`\n  🔁 Backfill giáo viên học thử — PHƯƠNG ÁN B ${DRY ? "[DRY-RUN — không ghi gì]" : ""}`);
  console.log(`     ca ACTIVE xét            : ${cas.length}`);
  console.log(`     HẠ xuống "đề xuất"       : ${haXuongDeXuat}   ← chờ Đào tạo duyệt`);
  console.log(`     giữ "đã phân công"       : ${giuPhanCong}`);
  console.log(`     không đổi                : ${khongDoi}`);
  if (viDu.length) {
    console.log(`\n     Vài ca bị hạ (xem thử trước khi chạy thật):`);
    for (const v of viDu) console.log(`       · ${v}`);
  }
  if (DRY) console.log(`\n  (chưa ghi gì — bỏ --dry-run để chạy thật)`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\n  ✗ DỪNG:", e instanceof Error ? e.message : e);
    await db.$disconnect();
    process.exit(1);
  });
