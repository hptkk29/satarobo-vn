// scripts/backfill-media-assets.ts — dựng hàng chờ duyệt kiểu mới từ ảnh đã có.
//
// MEDIA-REVIEW (26/08) đổi kho + hàng duyệt sang `MediaAsset`. Ảnh CŨ nằm ở
// `ClassSessionMedia` nên màn /duyet-media mở ra trống trơn dù DB đầy ảnh — không có gì
// để nghiệm thu. Script này tạo dòng `MediaAsset` song sinh cho ảnh cũ CÓ GẮN BUỔI.
//
// Chạy TAY (luật cứng Nền Hệ thống #4 — không migration nào tự đụng dữ liệu đang chạy):
//   pnpm exec tsx scripts/backfill-media-assets.ts --dry-run
//   pnpm exec tsx scripts/backfill-media-assets.ts
//   pnpm exec tsx scripts/backfill-media-assets.ts --reset   # xoá dòng do script tạo
//
// Idempotent: `legacyMediaId` là UNIQUE, chạy lại chỉ bỏ qua dòng đã có.
//
// ⚠️ Ánh xạ trạng thái CỐ Ý giữ nguyên kết luận cũ, KHÔNG bắt QLCS duyệt lại từ đầu:
//     ClassSessionMedia.APPROVED → MediaAsset.APPROVED  (+ đóng SessionMediaReview)
//     ClassSessionMedia.REJECTED → MediaAsset.REJECTED
//     DRAFT / PENDING            → MediaAsset.PENDING   (vào hàng chờ duyệt)
//   Đẩy hết về PENDING là dựng lại vài trăm việc đã làm xong.
import { PrismaClient, type MediaAssetStatus } from "@prisma/client";
import { deadlineFor } from "../lib/media-review/deadline";

// DIRECT_URL (session pooler) chứ không DATABASE_URL (transaction pooler): pgbouncer ở
// chế độ transaction dùng lại tên prepared statement giữa các kết nối ⇒ script chạy dài
// đâm ngay `42P05 prepared statement "s0" already exists`.
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

const DRY = process.argv.includes("--dry-run");
const RESET = process.argv.includes("--reset");
/** Giờ chốt mặc định — script chạy tay, không đọc SystemSetting để khỏi phụ thuộc seed. */
const GIO_CHOT = 10;

function mapStatus(s: string): MediaAssetStatus {
  if (s === "APPROVED") return "APPROVED";
  if (s === "REJECTED") return "REJECTED";
  return "PENDING";
}

async function main() {
  if (RESET) {
    if (DRY) {
      const n = await db.mediaAsset.count({ where: { legacyMediaId: { not: null } } });
      console.log(`[dry-run] sẽ xoá ${n} MediaAsset có legacyMediaId`);
      return;
    }
    const r = await db.mediaAsset.deleteMany({ where: { legacyMediaId: { not: null } } });
    console.log(`Đã xoá ${r.count} MediaAsset (chỉ dòng backfill, không đụng dòng upload thật)`);
    return;
  }

  // Chỉ ảnh CÓ BUỔI: cây duyệt xếp theo ngày→lớp, ảnh không biết buổi thì không có chỗ.
  const rows = await db.classSessionMedia.findMany({
    where: { classSessionId: { not: null } },
    select: {
      id: true,
      classId: true,
      classSessionId: true,
      fileUrl: true,
      status: true,
      uploadedById: true,
      uploadedByName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // ClassSessionMedia KHÔNG khai quan hệ tới ClassSession (chỉ có cột id trần), nên
  // phải nạp buổi thành một lượt riêng rồi tra bảng — không include được.
  const sessions = await db.classSession.findMany({
    where: {
      id: {
        in: [...new Set(rows.map((r) => r.classSessionId).filter((x): x is string => Boolean(x)))],
      },
    },
    select: { id: true, date: true, centerId: true, orgUnitId: true },
  });
  const sesOf = new Map(sessions.map((s) => [s.id, s]));

  const daCo = new Set(
    (
      await db.mediaAsset.findMany({
        where: { legacyMediaId: { not: null } },
        select: { legacyMediaId: true },
      })
    )
      .map((a) => a.legacyMediaId)
      .filter((x): x is string => Boolean(x)),
  );

  let tao = 0;
  let boQua = 0;
  const buoiDaDuyet = new Set<string>();
  const buoiCoViec = new Set<string>();

  for (const r of rows) {
    if (daCo.has(r.id)) {
      boQua++;
      continue;
    }
    const ses = r.classSessionId ? sesOf.get(r.classSessionId) : undefined;
    // centerId thiếu = dòng hỏng của hệ cũ; tạo dòng mới không centerId là tạo ảnh vô
    // hình với chính người phải duyệt nó. Bỏ qua và đếm.
    if (!ses || !ses.centerId || !r.classSessionId || !r.uploadedById) {
      boQua++;
      continue;
    }

    const status = mapStatus(r.status);
    if (status === "APPROVED") buoiDaDuyet.add(ses.id);
    else if (status === "PENDING") buoiCoViec.add(ses.id);

    if (!DRY) {
      await db.mediaAsset.create({
        data: {
          centerId: ses.centerId,
          orgUnitId: ses.orgUnitId,
          classId: r.classId,
          classSessionId: r.classSessionId,
          sessionDate: ses.date,
          legacyMediaId: r.id,
          uploadedById: r.uploadedById,
          uploadedByName: r.uploadedByName,
          type: "IMAGE",
          r2Key: r.fileUrl,
          status,
          createdAt: r.createdAt,
        },
      });
    }
    tao++;
  }

  // Buổi mà MỌI ảnh đều đã duyệt ở hệ cũ ⇒ đóng luôn kết luận, đừng bắt duyệt lại.
  const dongLai = [...buoiDaDuyet].filter((id) => !buoiCoViec.has(id));
  if (!DRY) {
    for (const id of dongLai) {
      const ses = await db.classSession.findUnique({
        where: { id },
        select: { id: true, date: true, centerId: true, orgUnitId: true },
      });
      if (!ses?.centerId) continue;
      await db.sessionMediaReview.upsert({
        where: { classSessionId: ses.id },
        update: {},
        create: {
          classSessionId: ses.id,
          centerId: ses.centerId,
          orgUnitId: ses.orgUnitId,
          sessionDate: ses.date,
          status: "APPROVED",
          decidedByName: "Backfill 26/08 (kết luận cũ)",
          decidedAt: new Date(),
          deadlineAt: deadlineFor(ses.date, GIO_CHOT),
        },
      });
    }
  }

  console.log(
    `${DRY ? "[dry-run] " : ""}Tạo ${tao} MediaAsset · bỏ qua ${boQua} · ` +
      `đóng sẵn ${dongLai.length} buổi đã duyệt xong ở hệ cũ · ` +
      `còn ${buoiCoViec.size} buổi vào hàng chờ duyệt`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
