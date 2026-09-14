import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DebtFilterBar } from "./_components/debt-filter-bar";
import { BangDoiSoat } from "./_components/bang-doi-soat";
import type { DongDoiSoat } from "./_components/types";
// lib/finance/debt.ts — parallel agent owns. Combined typecheck resolves.
import { getDebtRows, overdueBucket, type DebtRow } from "@/lib/finance/debt";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export const metadata = { title: "Công nợ | Admin" };
export const dynamic = "force-dynamic";

type Bucket = "none" | "1-7" | "8-30" | ">30";
const BUCKETS: Bucket[] = ["none", "1-7", "8-30", ">30"];
const BUCKET_LABEL: Record<Bucket, string> = {
  none: "Chưa quá hạn",
  "1-7": "Quá hạn 1-7 ngày",
  "8-30": "Quá hạn 8-30 ngày",
  ">30": "Quá hạn > 30 ngày",
};
const BUCKET_BADGE: Record<Bucket, string> = {
  none: "bg-muted text-foreground hover:bg-muted",
  "1-7": "bg-state-warning-soft text-state-warning-ink hover:bg-state-warning-soft",
  "8-30": "bg-primary-soft text-primary hover:bg-primary-soft",
  ">30": "bg-state-danger-soft text-state-danger-ink hover:bg-state-danger-soft",
};

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + " đ";
}

type GroupKey = "enrollment" | "student" | "center";

export default async function CongNoPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; search?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // 03/08 — Quản lý cơ sở được ĐỐI SOÁT nhưng chỉ XEM: `payments:view` mở màn này,
  // mọi thao tác tiền vẫn đòi `payments:manage`/`payments:confirm`.
  const [canManagePayments, canViewPayments] = await Promise.all([
    checkPermission("payments:manage"),
    checkPermission("payments:view"),
  ]);
  if (!canManagePayments && !canViewPayments) {
    redirect("/dashboard?error=unauthorized");
  }
  const uid = session.user.id;
  if (!uid) redirect("/login");

  const sp = await searchParams;
  const groupBy = (
    ["enrollment", "student", "center"].includes(sp.groupBy ?? "")
      ? sp.groupBy
      : "enrollment"
  ) as GroupKey;
  const search = (sp.search ?? "").trim();

  const actor = await resolveActor(uid);
  const sdb = scopedDb(actor);

  // ── Debt rows (CHỈ Payment CONFIRMED) — lib getDebtRows. Cast tránh so kiểu
  // sâu giữa Prisma client mở rộng và DebtScopedDb hẹp của lib. ──
  //
  // ⚠️ HAI LƯỢT TRA, HAI PHẠM VI KHÁC NHAU — cố ý, không phải thừa:
  //   · `rows` (dưới) giữ nguyên phạm vi cũ để KHỐI TUỔI NỢ + nhóm tổng không đổi số.
  //   · `dongDoiSoat` mở thêm nhóm CHƯA CHỐT GIÁ và không lọc `debt > 0`, vì màn đối soát
  //     phải hiện cả em đã đóng đủ (để người nhập biết đã xong) lẫn em chưa chốt giá
  //     (nhóm mà bộ lọc cũ giấu mất hẳn).
  const [rowsGoc, rowsDoiSoat] = await Promise.all([
    getDebtRows(sdb as unknown as Parameters<typeof getDebtRows>[0]),
    getDebtRows(sdb as unknown as Parameters<typeof getDebtRows>[0], {
      keCaChuaChotGia: true,
    }),
  ]);
  let rows = rowsGoc;
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.studentName ?? "").toLowerCase().includes(s) ||
        r.enrollmentId.toLowerCase().includes(s),
    );
  }
  // Chỉ hiện đăng ký còn nợ (> 0).
  rows = rows.filter((r) => r.debt > 0);

  const dongDoiSoat: DongDoiSoat[] = rowsDoiSoat.map((r) => ({
    enrollmentId: r.enrollmentId,
    hocVien: r.studentName,
    khoa: r.courseName,
    hocPhi: r.finalPrice,
    daGhiNhan: r.recordedPaid,
    daXacNhan: r.confirmedPaid,
    chuaChotGia: r.chuaChotGia,
  }));
  // Nút "Sửa học phí" chỉ hiện khi thật sự bấm được — nhãn/nút là LỜI HỨA (luật 12
  // docs/luat-doc-so-va-ket-luan.md); hiện nút rồi để action từ chối là hứa suông.
  // Server action vẫn tự gác độc lập.
  const suaDuoc = await checkPermission("enrollments:edit");

  // ── Aging buckets từ installment PENDING của các đơn trong scope ──
  const now = new Date();
  const orders = await sdb.order.findMany({
    where: { installments: { some: { status: "PENDING" } } },
    select: {
      installments: {
        where: { status: "PENDING" },
        select: { amount: true, dueDate: true },
      },
    },
  });
  const bucketTotals: Record<Bucket, number> = {
    none: 0,
    "1-7": 0,
    "8-30": 0,
    ">30": 0,
  };
  for (const o of orders) {
    for (const inst of o.installments) {
      const b = overdueBucket(inst.dueDate, now) as Bucket;
      bucketTotals[b] += inst.amount;
    }
  }

  // ── Center name map (Center không scoped — chỉ để gắn nhãn) ──
  const centerNames = new Map<string, string>();
  if (groupBy === "center") {
    const centerIds = [
      ...new Set(rows.map((r) => r.centerId).filter((c): c is string => !!c)),
    ];
    if (centerIds.length) {
      const centers = await sdb.center.findMany({
        where: { id: { in: centerIds } },
        select: { id: true, name: true },
      });
      for (const c of centers) centerNames.set(c.id, c.name);
    }
  }

  // ── Gom nhóm theo dimension ──
  const totalDebt = rows.reduce((s, r) => s + r.debt, 0);
  // 03/09/2026 — GOM NHÓM THEO ID, HIỂN THỊ THEO TÊN.
  //
  // Bản cũ dùng chính chuỗi hiển thị (`groupLabel`) làm KHOÁ của Map. Hai học
  // viên TRÙNG TÊN — chuyện rất thường ở dữ liệu thật — bị gộp thành một dòng và
  // nợ CỘNG LẠI. Đây là chỗ duy nhất trong màn này cho ra SỐ TIỀN SAI: người xem
  // thấy "Nguyễn Minh Khoa nợ 12.000.000đ" trong khi đó là nợ của hai em khác
  // nhau, và không có gì để lần ra.
  //
  // Nhãn vẫn lấy từ dòng ĐẦU TIÊN của nhóm (mọi dòng cùng id đều cùng tên).
  const groups = new Map<string, { label: string; debt: number; count: number }>();
  for (const r of rows) {
    const key = groupKey(r, groupBy);
    const g = groups.get(key) ?? {
      label: groupLabel(r, groupBy, centerNames),
      debt: 0,
      count: 0,
    };
    g.debt += r.debt;
    g.count += 1;
    groups.set(key, g);
  }
  const groupList = [...groups.values()].sort((a, b) => b.debt - a.debt);

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Công nợ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nợ học phí (đã xác nhận thu) &amp; phân nhóm tuổi nợ quá hạn
          </p>
        </div>
      </div>

      {/* Aging summary từ installment quá hạn */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Tổng nợ (đăng ký)</div>
          <div className="mt-1 text-lg font-bold text-foreground">
            {vnd(totalDebt)}
          </div>
        </div>
        {BUCKETS.map((b) => (
          <div
            key={b}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="text-xs text-muted-foreground">{BUCKET_LABEL[b]}</div>
            <div className="mt-1 text-lg font-bold text-foreground">
              {vnd(bucketTotals[b])}
            </div>
          </div>
        ))}
      </div>
      {/* Hai cách đo KHÁC phạm vi — không phải lỗi khi tổng lệch nhau: */}
      <p className="mb-6 -mt-3 text-xs text-muted-foreground">
        “Tổng nợ (đăng ký)” tính theo <b>ghi danh</b> = học phí − khoản kế toán ĐÃ xác
        nhận. Các ô tuổi nợ tính theo <b>đợt thanh toán đơn hàng có hạn</b> (chỉ đơn có
        lịch trả góp) — hai phạm vi khác nhau nên có thể không bằng nhau.
      </p>

      {/* ── ĐỐI SOÁT TỪNG HỌC VIÊN ───────────────────────────────────────
          Đặt TRƯỚC bảng gom nhóm: câu hỏi "em nào đủ, em nào thiếu" là việc hằng ngày
          sau đợt nhập liệu, còn bảng gom nhóm là báo cáo. Và trước hôm nay màn này
          KHÔNG có một thao tác nào — chủ dự án 14/09: "màn này cũng chỉ vào xem công nợ
          chứ không có thao tác gì". */}
      <div className="mb-6">
        <BangDoiSoat dong={dongDoiSoat} suaDuoc={suaDuoc} />
      </div>

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Gom nhóm công nợ
      </h2>
      <DebtFilterBar groupBy={groupBy} search={search} />

      <div className="overflow-hidden rounded-lg border border-border">
        <PhanTrangBang cuonNgang>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhóm</TableHead>
                <TableHead className="text-right">Số đăng ký</TableHead>
                <TableHead className="text-right">Tổng nợ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupList.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Không có công nợ phù hợp bộ lọc
                  </TableCell>
                </TableRow>
              )}
              {groupList.map((g) => (
                <TableRow key={g.label}>
                  <TableCell className="font-medium">{g.label}</TableCell>
                  <TableCell className="text-right">{g.count}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {vnd(g.debt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PhanTrangBang>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Ô tuổi nợ tổng hợp từ các đợt thanh toán còn hạn/quá hạn (
        <Badge className={BUCKET_BADGE[">30"]}>{BUCKET_LABEL[">30"]}</Badge> ưu
        tiên xử lý trước).
      </p>
    </div>
  );
}

/**
 * KHOÁ gom nhóm — luôn là một ID BỀN, không bao giờ là tên.
 *
 * Tách khỏi `groupLabel` (chuỗi cho người đọc) vì hai thứ đó có yêu cầu ngược
 * nhau: nhãn phải dễ đọc và có thể trùng nhau; khoá phải phân biệt được và không
 * bao giờ trùng khi thực thể khác nhau. Gộp làm một là cộng nợ của hai người
 * trùng tên vào một dòng.
 *
 * Thiếu id thì rơi về một khoá RIÊNG cho từng dòng (`enrollmentId`) chứ không
 * gộp hết vào một rổ "(không rõ)" — thà thấy nhiều dòng lẻ còn hơn một con số
 * tổng không ai kiểm được.
 */
function groupKey(row: DebtRow, key: GroupKey): string {
  switch (key) {
    case "student":
      return row.studentId ?? `enrollment:${row.enrollmentId}`;
    case "center":
      return row.centerId ?? "center:(khong-ro)";
    case "enrollment":
    default:
      return row.enrollmentId;
  }
}

function groupLabel(
  row: DebtRow,
  key: GroupKey,
  centerNames: Map<string, string>,
): string {
  switch (key) {
    case "student":
      return row.studentName || row.studentId || "(Không rõ học viên)";
    case "center":
      return row.centerId
        ? (centerNames.get(row.centerId) ?? row.centerId)
        : "(Không rõ cơ sở)";
    case "enrollment":
    default:
      // Tên HV + khoá (thay vì cuid thô "luancon · cmqz5if8").
      return row.studentName
        ? `${row.studentName}${row.courseName ? ` · ${row.courseName}` : ""}`
        : (row.courseName ?? "(Không rõ ghi danh)");
  }
}
