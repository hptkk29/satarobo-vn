// prisma/seed-uat-lich-hen.ts — dựng dữ liệu cho tab "Lịch hẹn học thử" (UAT).
//
// VÌ SAO CÓ FILE NÀY. Màn Lớp Trial có hai tab. Tab "Lớp trải nghiệm" đã được
// `seed-uat-trial.ts` nạp đủ (lớp · buổi · ca · điểm danh · phiếu). Tab "Lịch hẹn học
// thử" thì đọc hệ V1 (`TrialClass` — một dòng = một cuộc hẹn gắn thẳng vào LEAD) và
// hiện đang RỖNG: từ 26/08 `updateLeadStatus` thôi tự đẻ bản ghi V1, mà bộ seed UAT
// cũng không tạo dòng nào. Mở tab ra là danh sách trắng, không có gì để bấm.
//
// CHẠY:
//   UAT_SEED=1 pnpm exec tsx prisma/seed-uat-lich-hen.ts                  # ghi thật
//   UAT_SEED=1 UAT_HEN_DRY=1 pnpm exec tsx prisma/seed-uat-lich-hen.ts    # chỉ đếm
//
// ⚠️ Ép `DATABASE_URL` = `DIRECT_URL` (session pooler :5432). Qua transaction pooler
// :6543 script rời sẽ đâm `42P05 prepared statement "s0" already exists`.
//
// CHỈ THÊM — không một câu xoá nào. Id sinh TẤT ĐỊNH từ leadId nên chạy lại là ghi đè
// chính nó, không đẻ bản sao.
//
// ĐỂ LẠI VIỆC CHO NGƯỜI NGHIỆM THU — cố ý:
//   · phần lớn hẹn ở "Chờ xếp lịch" và "Đã xác nhận" → còn chỗ để xếp lịch, đổi trạng thái
//   · một phần đã ATTENDED/ENROLLED/REJECTED  → để bộ lọc chip có dữ liệu ở mọi nhánh
//   · MỘT PHẦN CỐ Ý KHÔNG GÁN giáo viên và phòng → đó là việc Sale phải làm trên màn
import { createHash } from "node:crypto";
import { PrismaClient, type TrialClassStatus } from "@prisma/client";

const db = new PrismaClient();
const DRY = process.env.UAT_HEN_DRY === "1";

/** Id tất định: cùng lead → cùng dòng hẹn, chạy lại không đẻ bản sao. */
function uid(...phan: string[]): string {
  return "uat" + createHash("sha1").update(phan.join("|")).digest("hex").slice(0, 22);
}

/** Số giả ngẫu nhiên TẤT ĐỊNH theo khoá — hai lượt chạy ra cùng dữ liệu. */
function rnd(khoa: string): number {
  const h = createHash("sha1").update(khoa).digest();
  return ((h[0]! << 8) | h[1]!) / 65536;
}

/** Mốc hẹn: lệch `ngay` ngày so với hôm nay (giờ VN), đặt vào giờ `gio`. */
function mocHen(ngay: number, gio: number): Date {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  const d = new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + ngay, gio - 7, 0, 0),
  );
  return d;
}

function assertChoPhep(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("Thiếu DATABASE_URL");
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "(không đọc được)";
    }
  })();
  console.log(`\n  Đích ghi: ${host}`);
  if (process.env.UAT_SEED !== "1") {
    throw new Error(
      "Cần UAT_SEED=1 để chạy. Cổng này để không ai lỡ tay bơm dữ liệu giả vào DB thật.",
    );
  }
}

// Bảy trạng thái của hệ V1. Trải đều nhưng LỆCH về hai bậc đầu: đó là nơi Sale còn
// việc phải làm, và cũng là hình dạng thật của một danh sách hẹn đang chạy.
const PHAN_BO: { status: TrialClassStatus; trong: number }[] = [
  { status: "SCHEDULED", trong: 30 },
  { status: "CONFIRMED", trong: 25 },
  { status: "ATTENDED", trong: 15 },
  { status: "MISSED", trong: 8 },
  { status: "POSTPONED", trong: 7 },
  { status: "ENROLLED", trong: 10 },
  { status: "REJECTED", trong: 5 },
];

function chonStatus(khoa: string): TrialClassStatus {
  const tong = PHAN_BO.reduce((a, b) => a + b.trong, 0);
  let x = rnd(khoa) * tong;
  for (const p of PHAN_BO) {
    x -= p.trong;
    if (x <= 0) return p.status;
  }
  return "SCHEDULED";
}

async function main(): Promise<void> {
  assertChoPhep();

  // Lead có cơ sở — hệ V1 lọc danh sách theo `centerId`, lead không cơ sở sẽ không
  // hiện ở bất kỳ tài khoản cấp cơ sở nào, seed vào đó là seed vào chỗ không ai thấy.
  const leads = await db.lead.findMany({
    where: { deletedAt: null, centerId: { not: null } },
    select: { id: true, centerId: true, status: true },
    orderBy: { createdAt: "asc" },
    take: 60,
  });
  if (leads.length === 0) {
    console.log("  Không có lead nào có cơ sở — chạy bộ seed UAT trước.");
    return;
  }

  // Phòng và giáo viên theo cơ sở, để gán cho MỘT PHẦN các hẹn.
  const [rooms, teachers] = await Promise.all([
    db.room.findMany({ select: { id: true, centerId: true } }),
    db.user.findMany({
      where: { deletedAt: null, roles: { has: "TEACHER" } },
      select: { id: true, centerId: true },
      take: 40,
    }),
  ]);

  let them = 0;
  let coGv = 0;
  let coPhong = 0;
  const demTheoStatus = new Map<string, number>();

  for (const [i, lead] of leads.entries()) {
    const id = uid("hen", lead.id);
    const status = chonStatus(`st|${lead.id}`);
    // Hẹn đã diễn ra thì mốc phải ở QUÁ KHỨ, hẹn chưa diễn ra thì ở tương lai — nếu
    // không, danh sách sắp theo `scheduledAt` sẽ đọc như một cái lịch vô lý.
    const daXong = status === "ATTENDED" || status === "MISSED" || status === "ENROLLED";
    const lech = daXong ? -1 - Math.floor(rnd(`d|${lead.id}`) * 20) : Math.floor(rnd(`d|${lead.id}`) * 14);
    const gio = 8 + Math.floor(rnd(`h|${lead.id}`) * 10); // 08:00–17:00 giờ VN
    const scheduledAt = mocHen(lech, gio);

    // Cố ý CHỈ gán giáo viên/phòng cho khoảng 60% — phần còn lại là việc Sale phải
    // làm trên màn (xếp lịch: chọn giờ, giáo viên, phòng).
    const gan = rnd(`gan|${lead.id}`) < 0.6;
    const phongCungCs = rooms.filter((r) => r.centerId === null || r.centerId === lead.centerId);
    const gvCungCs = teachers.filter((t) => t.centerId === lead.centerId);
    const roomId = gan && phongCungCs.length
      ? phongCungCs[Math.floor(rnd(`r|${lead.id}`) * phongCungCs.length)]!.id
      : null;
    const teacherId = gan && gvCungCs.length
      ? gvCungCs[Math.floor(rnd(`t|${lead.id}`) * gvCungCs.length)]!.id
      : null;

    demTheoStatus.set(status, (demTheoStatus.get(status) ?? 0) + 1);
    if (teacherId) coGv++;
    if (roomId) coPhong++;
    them++;

    if (DRY) continue;
    await db.trialClass.upsert({
      where: { id },
      // KHÔNG đụng `classId`: cột đó là kết quả của thao tác "xếp con vào lớp trải
      // nghiệm" trên màn, seed gán bừa là xoá mất đúng việc cần nghiệm thu.
      update: { scheduledAt, status, roomId, teacherId },
      create: {
        id,
        leadId: lead.id,
        centerId: lead.centerId,
        scheduledAt,
        status,
        roomId,
        teacherId,
        notes: i % 5 === 0 ? "Phụ huynh dặn gọi trước 30 phút." : null,
        ...(daXong ? { attendedAt: scheduledAt } : {}),
      },
    });
  }

  console.log(`\n  ${DRY ? "[XEM TRƯỚC] " : ""}Lịch hẹn học thử: ${them} dòng`);
  for (const [st, n] of [...demTheoStatus.entries()].sort()) {
    console.log(`    ${st.padEnd(10)} ${n}`);
  }
  console.log(`    có giáo viên: ${coGv} · có phòng: ${coPhong}`);
  console.log(
    `    ${them - coGv} hẹn CHƯA gán giáo viên — cố ý, đó là việc để bấm thử trên màn.\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
