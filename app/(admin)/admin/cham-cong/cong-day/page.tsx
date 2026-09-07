// app/(admin)/admin/cham-cong/cong-day/page.tsx — CÔNG DẠY của giáo viên trong kỳ.
//
// Yêu cầu chủ dự án 06/09: "thêm module tính giờ dạy của giáo viên… vẫn phải dev thêm các mục
// linh hoạt công dạy khác để dự phòng BLĐ yêu cầu có công dạy cho trial, bù, vượt… tự tạo tự
// add được qua hệ thống chứ không cần code. Làm là 1 tab bên trong phần chấm công."
//
// ⚠️ HAI ĐIỀU PHẢI BIẾT TRƯỚC KHI SỬA:
//
// 1. Màn này KHÔNG đụng tới tiền. Hệ thống chưa có module lương, và hoa hồng giáo viên dạy
//    trải nghiệm đã có đường RIÊNG tính theo % học phí (`lib/crm/trial-teacher-commission.ts`).
//    Công dạy ở đây đếm theo buổi/giờ — gộp hai thứ đó là trả hai lần cho cùng một buổi.
//
// 2. Buổi ở đây hỏi theo NGƯỜI, không theo cơ sở của lớp. Cột "Dạy" ở màn Kỳ công đếm bằng
//    `class: { centerId }`, nên giáo viên neo CS1 đi dạy lớp CS2 thì buổi đó BIẾN MẤT khỏi cả
//    hai kỳ. Hai màn có thể lệch nhau đúng ở những buổi như vậy — và số ở đây mới là số đủ.
import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Hourglass, Layers, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ASK_WHO, loadModuleScope, type ModuleAction } from "@/lib/cham-cong/module-scope";
import { hrefWith, shiftKy } from "@/lib/cham-cong/scope-href";
import { currentPeriodKey, parsePeriodKey, periodRange } from "@/lib/cham-cong/period";
import { congDayCuaNguoi } from "@/lib/cham-cong/cong-day";
import { loadBuoiDay, loadLoaiCongDay } from "@/lib/cham-cong/cong-day-db";
import { HO_CENTER_ID } from "@/lib/cham-cong/home-center";
import { checkPermission } from "@/lib/auth/check-permission";
import { PageHeader } from "@/components/admin/ui/page-header";
import { PageHelp } from "@/components/admin/ui/page-help";
import { EmptyState, NoPermission } from "@/components/admin/ui/states";
import { BTN_OUTLINE } from "@/components/admin/cham-cong/classes";
import { ModuleNav } from "@/components/admin/cham-cong/module-nav";
import { ScopeBar } from "@/components/admin/cham-cong/scope-bar";
import { KpiStrip } from "@/components/admin/cham-cong/kpi-strip";
import { SectionCard } from "@/components/admin/cham-cong/section-card";
import { LoaiCongDayTable, type LoaiRow } from "./_components/loai-cong-day";
import { CongDayTable, type CongDayRow } from "./_components/cong-day-table";

export const metadata = { title: "Công dạy | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const VIEW: ModuleAction = "hr_attendance:view";
const BASE = "/cham-cong/cong-day";

function kyLabelOf(ky: string): string {
  const p = parsePeriodKey(ky);
  return p ? `${String(p.m).padStart(2, "0")}/${p.y}` : ky;
}

/** "1,5" — dấu phẩy thập phân, bỏ đuôi ",0". */
function so(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

export default async function CongDayPage({
  searchParams,
}: {
  searchParams: Promise<{ ky?: string; coSo?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fcong-day");
  const sp = await searchParams;
  const scope = await loadModuleScope(session.user.id);
  const ky = sp.ky && parsePeriodKey(sp.ky) ? sp.ky : currentPeriodKey();
  const kyLabel = kyLabelOf(ky);

  const visible = scope.blocksWith(VIEW);
  if (visible.length === 0) {
    return (
      <div className="max-w-6xl">
        <PageHeader title={`Công dạy tháng ${kyLabel}`} />
        <ModuleNav active="congday" scope={scope} ctx={{ ky, coSo: sp.coSo ?? null }} />
        <NoPermission permission={VIEW} what="công dạy giáo viên" askWho={ASK_WHO[VIEW]} />
      </div>
    );
  }

  const block = scope.pick(sp.coSo, VIEW) ?? visible[0];
  const coSo = block.id;
  const ctx = { ky, coSo };
  const { from, to } = periodRange(ky);

  const sdb = scopedDb(await resolveActor(session.user.id));
  // Người của khối này trong kỳ = người có ô lưới. Lấy từ lưới (không phải từ bảng công ngày)
  // vì ngày tương lai chưa có dòng công nào, mà lịch dạy thì đã xếp.
  const nguoi = await sdb.shiftAssignment.findMany({
    where: { centerId: coSo, workDate: { gte: from, lte: to }, status: "ACTIVE" },
    select: { userId: true },
    distinct: ["userId"],
  });
  const userIds = nguoi.map((n) => n.userId);

  const [danhMuc, buoi, users, canConfig] = await Promise.all([
    loadLoaiCongDay(),
    loadBuoiDay(userIds, from, to),
    userIds.length
      ? sdb.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, employee: { select: { employeeCode: true } } },
        })
      : Promise.resolve([]),
    checkPermission("hr_attendance:config", { centerId: HO_CENTER_ID }),
  ]);
  const tenCua = new Map(users.map((u) => [u.id, { ten: u.name ?? u.email ?? u.id, ma: u.employee?.employeeCode ?? null }]));

  const buoiCua = new Map<string, typeof buoi>();
  for (const b of buoi) {
    const ds = buoiCua.get(b.userId) ?? [];
    ds.push(b);
    buoiCua.set(b.userId, ds);
  }

  const rows: CongDayRow[] = userIds
    .map((userId) => {
      const t = congDayCuaNguoi(buoiCua.get(userId) ?? [], danhMuc);
      const u = tenCua.get(userId);
      return {
        userId,
        name: u?.ten ?? userId,
        employeeCode: u?.ma ?? null,
        tongCong: t.tongCong,
        tongCongLabel: so(t.tongCong),
        tongBuoi: t.tongBuoi,
        dong: t.dong.map((d) => ({
          code: d.code,
          name: d.name,
          buoi: d.buoi,
          congLabel: so(d.cong),
          tinhVaoKy: d.tinhVaoKy,
          boQuaThieuGio: d.boQuaThieuGio,
        })),
      };
    })
    // Người không dạy buổi nào thì không phải dòng của bảng này — họ đã có mặt ở Kỳ công.
    .filter((r) => r.tongBuoi > 0)
    .sort((a, b) => b.tongCong - a.tongCong || a.name.localeCompare(b.name, "vi"));

  const buoiTheoLoai = new Map<string, number>();
  for (const r of rows) for (const d of r.dong) buoiTheoLoai.set(d.code, (buoiTheoLoai.get(d.code) ?? 0) + d.buoi);

  const loaiRows: LoaiRow[] = danhMuc.map((l) => ({
    code: l.code,
    name: l.name,
    basis: l.basis,
    factor: l.factor,
    countsInPeriod: l.countsInPeriod,
    isActive: l.isActive,
    buoiTrongKy: buoiTheoLoai.get(l.code) ?? 0,
  }));

  const tongCong = rows.reduce((s, r) => s + r.tongCong, 0);
  const tongBuoi = rows.reduce((s, r) => s + r.tongBuoi, 0);
  const thieuGio = rows.reduce((s, r) => s + r.dong.reduce((x, d) => x + d.boQuaThieuGio, 0), 0);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={`Công dạy tháng ${kyLabel} — ${block.label}`}
        subtitle="Đếm buổi đã hoàn tất, quy ra công theo hệ số của từng loại. Đây là số ĐẾM, không phải tiền."
      />

      <ModuleNav active="congday" scope={scope} ctx={ctx} />

      <ScopeBar
        basePath={BASE}
        blocks={visible.map((b) => ({ id: b.id, label: b.label }))}
        coSo={coSo}
        month={{
          ky,
          prevHref: hrefWith(BASE, { ky: shiftKy(ky, -1), coSo }),
          nextHref: hrefWith(BASE, { ky: shiftKy(ky, 1), coSo }),
        }}
        keep={{ ky }}
      />

      <PageHelp guideSlug="nhan-su-giao-vien">
        <p>
          Muốn tính công cho một nhóm buổi (trải nghiệm, trợ giảng…) thì <b>bật dòng đó</b> ở bảng
          “Hệ số đang dùng” bên dưới và đặt hệ số — không cần lập trình viên. Đổi xong bảng trên tính lại
          ngay theo số mới.
        </p>
        <p className="mt-2">
          Số ở đây có thể <em>khác</em> cột “Dạy” bên màn Kỳ công. Cột đó đếm buổi theo <b>cơ sở của lớp</b>,
          nên giáo viên của cơ sở này đi dạy lớp cơ sở khác thì buổi đó không vào đâu cả. Màn này hỏi theo
          <b> người</b> nên buổi luôn về đúng người, dù dạy ở đâu.
        </p>
        <p className="mt-2">
          <b>Chưa làm được:</b> “dạy bù” và “vượt giờ”. Dữ liệu hiện không có cột nào đánh dấu một buổi là
          buổi bù, và giờ dạy thực tế gần như luôn để trống nên không biết buổi nào vượt. Thêm hai loại đó
          bây giờ là thêm hai ô luôn bằng 0 — cần chốt cách ghi nhận trước.
        </p>
      </PageHelp>

      <KpiStrip
        cols={4}
        items={[
          { icon: GraduationCap, label: "Tổng công dạy", value: so(tongCong), hint: "đã nhân hệ số" },
          { icon: Layers, label: "Tổng buổi đã dạy", value: tongBuoi },
          { icon: Users, label: "Người có buổi dạy", value: rows.length },
          {
            icon: Hourglass,
            label: "Buổi chưa suy được giờ",
            value: thieuGio,
            tone: thieuGio ? "warning" : "brand",
            hint: thieuGio ? "loại tính theo giờ bỏ qua" : undefined,
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={`Chưa có buổi dạy nào trong ${block.label} kỳ tháng ${kyLabel}`}
          description="Chỉ buổi đã HOÀN TẤT mới vào đây. Buổi đã dạy mà chưa bấm hoàn tất thì chưa tính công."
          action={
            <Link href={hrefWith("/cham-cong/ky-cong", ctx)} className={BTN_OUTLINE}>
              Sang màn Kỳ công
            </Link>
          }
        />
      ) : (
        <CongDayTable rows={rows} />
      )}

      <div className="mt-5">
        <SectionCard title="Hệ số đang dùng" icon={Layers}>
          <p className="mb-3 text-sm text-muted-foreground">
            {canConfig
              ? "Sửa hệ số hoặc bỏ “Cộng vào kỳ” là số ở bảng trên đổi theo ngay. Tắt “Đang dùng” thì cả nhóm buổi đó rơi khỏi bảng."
              : "Sửa hệ số cần quyền cấu hình tại Hội sở — danh mục này dùng chung mọi cơ sở."}
          </p>
          <LoaiCongDayTable rows={loaiRows} canEdit={canConfig} />
        </SectionCard>
      </div>
    </div>
  );
}
