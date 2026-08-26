// scripts/gop-trial-v1-sang-v2.ts — GỘP hai hệ Trial: chuyển "Học thử" (TrialClass, V1)
// sang "Lớp trải nghiệm" (TrialClassV2 + TrialClassSession + TrialEnrollment).
//
// Vì sao: hệ đang có HAI khái niệm trial song song, hai màn quản trị, hai kiểu phiếu
// đánh giá — và chúng KHÔNG BAO GIỜ gặp nhau. Bảng Trial của site giáo viên chỉ đọc V2,
// nên mọi lịch học thử đặt qua màn "Học thử" là giáo viên không thấy. Chủ dự án 26/08
// chốt gộp về một.
//
// Chạy (LUÔN xem trước rồi mới chạy thật):
//   pnpm exec dotenv -e .env -- tsx scripts/gop-trial-v1-sang-v2.ts --dry-run
//   pnpm exec dotenv -e .env -- tsx scripts/gop-trial-v1-sang-v2.ts
//
// KHÔNG XOÁ GÌ của V1. Bảng `TrialClass` giữ nguyên, đọc-only, để còn đường lùi —
// đúng nếp 2-phase của repo (additive trước, drop sau khi prod ổn định).
//
// IDEMPOTENT: id của lớp/buổi/ghi danh sinh ra đều suy TẤT ĐỊNH từ dữ liệu V1, chạy lại
// là ghi đè chính nó.
import { db } from "@/lib/db";
import type { TrialClassStatus } from "@prisma/client";

const DRY = process.argv.includes("--dry-run");

/** "YYYY-MM-DD" theo giờ VN của một mốc Timestamptz. */
function ymdVN(d: Date): string {
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}
/** "HH:mm" theo giờ VN. */
function hmVN(d: Date): string {
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(11, 16);
}
/** Mốc UTC 00:00 của ngày lịch VN — khớp cột `@db.Date` của TrialClassSession. */
function dateOnlyVN(d: Date): Date {
  return new Date(`${ymdVN(d)}T00:00:00.000Z`);
}
/** Cộng 90 phút cho giờ kết thúc (buổi trải nghiệm chuẩn). */
function plus90(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const t = (h! * 60 + m! + 90) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Ánh xạ trạng thái V1 → ba thứ của V2.
 *
 * V1 gộp cả "buổi đã diễn ra chưa" lẫn "kết cục của lead" vào MỘT cột; V2 tách ra ba
 * chỗ (buổi · ghi danh · sổ học thử). Bảng dưới là chỗ duy nhất quyết định việc tách đó.
 */
function mapStatus(s: TrialClassStatus): {
  session: "SCHEDULED" | "COMPLETED";
  enrollment: "ACTIVE" | "COMPLETED" | "WITHDRAWN";
  outcome: "PENDING" | "ENROLLED" | "LOST";
  attendance: "PRESENT" | "ABSENT" | null;
} {
  switch (s) {
    case "SCHEDULED":
    case "CONFIRMED":
      return { session: "SCHEDULED", enrollment: "ACTIVE", outcome: "PENDING", attendance: null };
    case "POSTPONED":
      // Hoãn = vẫn còn hẹn, chưa học. Dấu vết "đã dời" của V1 không có ngày cũ để chép
      // sang `rescheduledFromSessionId`, nên chỉ giữ ở ghi chú.
      return { session: "SCHEDULED", enrollment: "ACTIVE", outcome: "PENDING", attendance: null };
    case "ATTENDED":
      return { session: "COMPLETED", enrollment: "COMPLETED", outcome: "PENDING", attendance: "PRESENT" };
    case "MISSED":
      return { session: "COMPLETED", enrollment: "COMPLETED", outcome: "PENDING", attendance: "ABSENT" };
    case "ENROLLED":
      return { session: "COMPLETED", enrollment: "COMPLETED", outcome: "ENROLLED", attendance: "PRESENT" };
    case "REJECTED":
      return { session: "COMPLETED", enrollment: "COMPLETED", outcome: "LOST", attendance: "PRESENT" };
    default:
      return { session: "SCHEDULED", enrollment: "ACTIVE", outcome: "PENDING", attendance: null };
  }
}

type Stat = {
  v1: number;
  boQuaKhongCoSo: number;
  lop: number;
  buoi: number;
  ghiDanh: number;
  diemDanh: number;
  soHocThu: number;
  taoCon: number;
};

async function main() {
  console.log(`\n🔀 Gộp Trial V1 → V2${DRY ? "  [DRY-RUN — không ghi gì]" : ""}\n`);

  const rows = await db.trialClass.findMany({
    where: { lead: { deletedAt: null } },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      leadId: true,
      centerId: true,
      teacherId: true,
      roomId: true,
      scheduledAt: true,
      status: true,
      notes: true,
      lead: {
        select: {
          childName: true,
          childAge: true,
          courseId: true,
          children: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
    },
  });

  const st: Stat = {
    v1: rows.length,
    boQuaKhongCoSo: 0,
    lop: 0,
    buoi: 0,
    ghiDanh: 0,
    diemDanh: 0,
    soHocThu: 0,
    taoCon: 0,
  };

  // Gom theo ĐÚNG khung giờ thật: (cơ sở, ngày, giờ) → một lớp trải nghiệm + một buổi.
  // Gom theo ngày thôi thì hai ca sáng/chiều dồn làm một, sai lịch của giáo viên.
  const slotOf = (r: (typeof rows)[number]) =>
    `${r.centerId}|${ymdVN(r.scheduledAt)}|${hmVN(r.scheduledAt)}`;

  const daSinhLop = new Set<string>();

  for (const r of rows) {
    if (!r.centerId) {
      // V2 bắt buộc `centerId` (cách ly cơ sở). Không đoán bừa cơ sở — bỏ qua và báo số.
      st.boQuaKhongCoSo += 1;
      continue;
    }

    const slot = slotOf(r);
    const hm = hmVN(r.scheduledAt);
    const ngay = ymdVN(r.scheduledAt);
    const classId = `gop-tc-${r.centerId}-${ngay}-${hm.replace(":", "")}`;
    const sessionId = `gop-ts-${r.centerId}-${ngay}-${hm.replace(":", "")}`;
    const m = mapStatus(r.status);

    if (!daSinhLop.has(slot)) {
      daSinhLop.add(slot);
      st.lop += 1;
      st.buoi += 1;
      if (!DRY) {
        await db.trialClassV2.upsert({
          where: { id: classId },
          update: { teacherId: r.teacherId, roomId: r.roomId },
          create: {
            id: classId,
            code: `GOP-${ngay}-${hm.replace(":", "")}`.slice(0, 40),
            name: `Trial ${ngay} ${hm}`,
            centerId: r.centerId,
            teacherId: r.teacherId,
            roomId: r.roomId,
            startTime: hm,
            endTime: plus90(hm),
            capacity: 30,
            sessionCount: 1,
            status: m.session === "COMPLETED" ? "COMPLETED" : "OPEN",
          },
        });
        await db.trialClassSession.upsert({
          where: { id: sessionId },
          update: { teacherId: r.teacherId, roomId: r.roomId, status: m.session },
          create: {
            id: sessionId,
            trialClassId: classId,
            seq: 1,
            date: dateOnlyVN(r.scheduledAt),
            startTime: hm,
            endTime: plus90(hm),
            teacherId: r.teacherId,
            roomId: r.roomId,
            status: m.session,
          },
        });
      }
    }

    // Con của lead. V1 chỉ có `Lead.childName` dạng chuỗi, V2 ghi danh theo `LeadChild`.
    let leadChildId = r.lead.children[0]?.id ?? null;
    if (!leadChildId) {
      leadChildId = `gop-child-${r.leadId}`;
      st.taoCon += 1;
      if (!DRY) {
        await db.leadChild.upsert({
          where: { id: leadChildId },
          update: {},
          create: {
            id: leadChildId,
            leadId: r.leadId,
            // Lead cũ nhiều hồ sơ bỏ trống tên con — ghi rõ là suy ra, đừng để trống
            // rồi bảng in ra một dòng không tên.
            fullName: r.lead.childName?.trim() || "(chưa rõ tên con)",
            ageYears: r.lead.childAge ?? null,
            interestedCourseId: r.lead.courseId ?? null,
            trialStatus: m.session === "COMPLETED" ? "ATTENDED" : "SCHEDULED",
          },
        });
      }
    }

    const enrId = `gop-te-${r.id}`;
    st.ghiDanh += 1;
    if (!DRY) {
      await db.trialEnrollment.upsert({
        where: { id: enrId },
        update: { scheduledSessionId: sessionId, status: m.enrollment },
        create: {
          id: enrId,
          trialClassId: classId,
          leadChildId,
          scheduledSessionId: sessionId,
          status: m.enrollment,
          summaryNote: r.notes ?? null,
        },
      });

      if (m.attendance) {
        st.diemDanh += 1;
        await db.trialAttendance.upsert({
          where: {
            trialSessionId_trialEnrollmentId: {
              trialSessionId: sessionId,
              trialEnrollmentId: enrId,
            },
          },
          update: { status: m.attendance },
          create: {
            trialSessionId: sessionId,
            trialEnrollmentId: enrId,
            status: m.attendance,
          },
        });
      }

      st.soHocThu += 1;
      await db.leadTrialHistory.upsert({
        where: { leadChildId_trialClassId: { leadChildId, trialClassId: classId } },
        update: { outcome: m.outcome, attendedCount: m.attendance === "PRESENT" ? 1 : 0 },
        create: {
          leadChildId,
          trialClassId: classId,
          centerId: r.centerId,
          totalSessions: 1,
          attendedCount: m.attendance === "PRESENT" ? 1 : 0,
          outcome: m.outcome,
        },
      });
    } else {
      if (m.attendance) st.diemDanh += 1;
      st.soHocThu += 1;
    }
  }

  console.log(`  Học thử (V1) đọc được:      ${st.v1}`);
  console.log(`  ${DRY ? "SẼ tạo" : "Đã tạo"} lớp trải nghiệm:    ${st.lop}`);
  console.log(`  ${DRY ? "SẼ tạo" : "Đã tạo"} buổi:                ${st.buoi}`);
  console.log(`  ${DRY ? "SẼ tạo" : "Đã tạo"} ghi danh:            ${st.ghiDanh}`);
  console.log(`  ${DRY ? "SẼ tạo" : "Đã tạo"} điểm danh:           ${st.diemDanh}`);
  console.log(`  ${DRY ? "SẼ tạo" : "Đã tạo"} dòng sổ học thử:     ${st.soHocThu}`);
  if (st.taoCon) console.log(`  ⚠️  ${st.taoCon} lead chưa có hồ sơ con → tạo từ Lead.childName`);
  if (st.boQuaKhongCoSo) {
    console.log(
      `  ⚠️  BỎ QUA ${st.boQuaKhongCoSo} dòng KHÔNG có cơ sở — V2 bắt buộc centerId để` +
        ` cách ly, và đoán bừa cơ sở là rò dữ liệu giữa các cơ sở. Gán cơ sở cho lead` +
        ` rồi chạy lại.`,
    );
  }
  if (DRY) console.log(`\n  (chưa ghi gì — bỏ --dry-run để chạy thật)`);
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
