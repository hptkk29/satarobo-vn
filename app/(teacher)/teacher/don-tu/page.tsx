// app/(teacher)/teacher/don-tu/page.tsx — Đơn từ GV (site giáo viên).
//
// Port reference :3001 don-tu: danh sách đơn CỦA MÌNH + form tạo đơn 10 loại/3 nhóm
// (field điều kiện theo loại) + tìm kiếm/lọc. Server fetch đơn của mình + dữ liệu
// dropdown (lớp mình, GV cùng cơ sở, ca sắp tới); client lo form + filter.
// Preset ?type=<kind> / ?swap=<shiftId> mở form + chọn sẵn.
//
// WorkRequest ∉ SCOPED_MODELS → own-scope qua requesterId. ⚠️ Câu 46: đơn từ là dữ
// liệu nhân sự của chính GV — không chạm HV/PH.
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { loadRequestFormOptions } from "@/lib/cham-cong/request-form-data";
import type { WorkRequestKindV } from "@/lib/work-request";
import { DonTuClient, type WorkRequestRow } from "./_components/don-tu-client";

export const metadata = { title: "Đơn từ | Giáo viên Sata Robo" };

const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

export default async function DonTuPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; swap?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const sp = await searchParams;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const [requests, options] = await Promise.all([
    sdb.workRequest.findMany({
      where: { requesterId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    loadRequestFormOptions(session.user.id),
  ]);

  const rows: WorkRequestRow[] = requests.map((r) => ({
    id: r.id,
    kind: r.kind as WorkRequestKindV,
    status: r.status,
    fromLabel: r.fromDate ? dateFmt.format(r.fromDate) : null,
    toLabel: r.toDate ? dateFmt.format(r.toDate) : null,
    startTime: r.startTime,
    endTime: r.endTime,
    hours: r.hours,
    className: r.className,
    detail: r.detail,
    reason: r.reason,
    reviewNote: r.reviewNote,
    createdAtLabel: dateFmt.format(r.createdAt),
  }));

  return (
    <DonTuClient
      rows={rows}
      options={options}
      presetKind={sp.type ?? null}
      presetSwap={sp.swap ?? null}
    />
  );
}
