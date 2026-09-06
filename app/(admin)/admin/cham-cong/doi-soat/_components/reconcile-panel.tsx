"use client";

// reconcile-panel.tsx — bảng điều khiển của màn Đối soát: chọn file → chạy → đọc kết quả.
//
// Vì sao viết lại: bản cũ chỉ bắn một `toast` rồi để màn trống, nên chạy xong mà 0 lệch thì người
// dùng không biết đã chạy chưa và bấm lại lần nữa. Nay MỌI kết cục đều có panel: 0 lệch ra
// EmptyState nói rõ "không lệch ô nào tới hôm qua", lỗi đọc file ra ErrorState TẠI CHỖ và GIỮ
// file đã chọn để bấm Thử lại, chưa chạy thì nói phải làm gì.
//
// Dễ vỡ: `reconcileAction` CHỈ ĐỌC — chạy lại bao nhiêu lần cũng không đụng dữ liệu; `periodKey`
// gửi kèm chính là tháng trên ScopeBar, nên file không có tab tháng đó sẽ báo lỗi — lúc ấy còn
// đường lùi "So mọi kỳ trong file" thay vì bắt người dùng đoán.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarX2, Loader2, Sigma, TriangleAlert, Upload, UserRoundMinus, UserRoundX } from "lucide-react";
import { SheetFilePicker } from "@/components/cham-cong/ui/sheet-file-picker";
import { SectionCard } from "@/components/admin/cham-cong/section-card";
import { KpiStrip } from "@/components/admin/cham-cong/kpi-strip";
import { StatCard } from "@/components/admin/ui/stat-card";
import { EmptyState, ErrorState } from "@/components/admin/ui/states";
import { TableSkeleton } from "@/components/admin/cham-cong/skeletons";
import { BTN_OUTLINE, BTN_PRIMARY } from "@/components/admin/cham-cong/classes";
import { hrefWith } from "@/lib/cham-cong/scope-href";
import { cn } from "@/lib/utils";
import type { ReconcileReport } from "@/lib/cham-cong/reconcile";
import { reconcileAction } from "../_actions";
import { DiffTable } from "./diff-table";
import { WeekCalendar } from "./week-calendar";

/** Cổng ra L6 (kế hoạch §7): 10 ngày làm việc liên tiếp không lệch thì mới bỏ Sheet. */
const GATE_DAYS = 10;

function kyLabel(ky: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ky);
  return m ? `${m[2]}/${m[1]}` : ky;
}

export function ReconcilePanel({ ky, coSo }: { ky: string; coSo: string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [reports, setReports] = useState<ReconcileReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoped, setScoped] = useState(true);
  const [days, setDays] = useState<Record<string, number | null>>({});
  const [pending, start] = useTransition();

  function run(onlyThisPeriod: boolean) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    if (onlyThisPeriod) fd.set("periodKey", ky);
    setScoped(onlyThisPeriod);
    setError(null);
    start(async () => {
      const r = await reconcileAction(fd);
      if (!r.ok) {
        setError(r.error);
        setReports(null);
        toast.error(r.error);
        return;
      }
      setReports(r.data.reports);
      setDays({});
      const bad = r.data.reports.reduce((n, x) => n + x.cellDiffs.length, 0);
      if (bad === 0) toast.success("Không lệch ô nào");
      else toast.warning(`${bad} ô lệch — xem bảng`);
    });
  }

  const gate = reports?.find((r) => r.periodKey === ky) ?? reports?.[0] ?? null;
  const filled = gate ? Math.min(gate.cleanStreak, GATE_DAYS) : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <SectionCard title="File Sheet đang chạy song song" icon={Upload}>
          <SheetFilePicker
            id="doi-soat-file"
            file={file}
            onChange={(f) => {
              setFile(f);
              setError(null);
            }}
            disabled={pending}
            label="Chọn file Sheet (.xlsx)"
            hint="Cùng file với màn Import lịch — tối đa 2MB"
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Chỉ so tới <b className="text-foreground">hôm qua</b> — hôm nay chưa hết ca nên công
            chưa tính xong. Máy chỉ đọc file, <b className="text-foreground">không ghi</b> gì vào
            hệ thống.
          </p>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={!file || pending}
            className={cn(BTN_PRIMARY, "mt-3 w-full justify-center")}
          >
            {pending ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              <Upload aria-hidden className="h-4 w-4" />
            )}
            {pending ? "Đang so…" : `Đối soát kỳ ${kyLabel(ky)}`}
          </button>
        </SectionCard>

        {gate && (
          <div>
            <StatCard
              icon={CalendarX2}
              value={`${gate.cleanStreak}/${GATE_DAYS}`}
              label="Cổng ra L6: ngày sạch liên tiếp"
              tone={gate.cleanStreak >= GATE_DAYS ? "success" : "warning"}
              hint={`Kỳ ${kyLabel(gate.periodKey)} · đủ ${GATE_DAYS} ngày mới bỏ Sheet`}
            />
            <div
              className="mt-2 grid h-2 grid-cols-10 gap-0.5"
              role="img"
              aria-label={`Chuỗi ngày sạch ${gate.cleanStreak} trên ${GATE_DAYS}`}
            >
              {Array.from({ length: GATE_DAYS }, (_, i) => (
                <span
                  key={i}
                  className={cn("rounded-sm", i < filled ? "bg-state-success" : "bg-muted")}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5 lg:col-span-2">
        {error ? (
          <ErrorState
            title="Không đọc được file Sheet"
            description={
              <>
                <p>{error}</p>
                <p className="mt-2">File bạn chọn vẫn được giữ — sửa lại rồi bấm Thử lại.</p>
              </>
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => run(scoped)}
                  disabled={!file || pending}
                  className={BTN_PRIMARY}
                >
                  Thử lại
                </button>
                {scoped && (
                  <button
                    type="button"
                    onClick={() => run(false)}
                    disabled={!file || pending}
                    className={BTN_OUTLINE}
                  >
                    So mọi kỳ trong file
                  </button>
                )}
              </div>
            }
          />
        ) : pending && !reports ? (
          <TableSkeleton cols={7} />
        ) : !reports ? (
          <EmptyState
            title="Chưa chạy đối soát"
            description="Chọn file Sheet ở cột bên trái rồi bấm Đối soát. Không có gì bị ghi vào hệ thống — chạy thử thoải mái."
          />
        ) : (
          <div aria-busy={pending} className={cn("space-y-5", pending && "opacity-60")}>
            {reports.map((r) => {
              const day = days[r.periodKey] ?? null;
              const rows = day ? r.cellDiffs.filter((d) => d.day === day) : r.cellDiffs;
              return (
                <SectionCard
                  key={r.periodKey}
                  title={`Kỳ ${kyLabel(r.periodKey)} — ${r.people} người · so ${r.daysCompared} ngày`}
                  tone={r.cellDiffs.length === 0 ? "success" : "warning"}
                >
                  <div className="mb-4">
                    <WeekCalendar
                      periodKey={r.periodKey}
                      perDay={r.perDay}
                      selected={day}
                      onSelect={(d) => setDays((s) => ({ ...s, [r.periodKey]: d }))}
                    />
                  </div>

                  <KpiStrip
                    items={[
                      {
                        icon: TriangleAlert,
                        value: r.cellDiffs.length,
                        label: "Ô lệch",
                        tone: r.cellDiffs.length > 0 ? "danger" : "success",
                      },
                      {
                        icon: Sigma,
                        value: r.totalDiffs.length,
                        label: "Lệch tổng tháng",
                        tone: r.totalDiffs.length > 0 ? "warning" : "success",
                        hint: "Chỉ so khi đã hết tháng",
                      },
                      {
                        icon: UserRoundX,
                        value: r.unmapped.length,
                        label: "Chưa ánh xạ",
                        tone: r.unmapped.length > 0 ? "warning" : "success",
                        hint: r.unmapped.length > 0 ? "Ánh xạ ở màn Import lịch" : undefined,
                        href:
                          r.unmapped.length > 0
                            ? hrefWith("/cham-cong/phan-ca/import", { ky: r.periodKey, coSo })
                            : undefined,
                      },
                      {
                        icon: UserRoundMinus,
                        value: r.exempt.length,
                        label: "Miễn chấm công (bỏ qua)",
                        tone: "info",
                      },
                    ]}
                  />

                  {r.unmapped.length > 0 && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      <b className="text-foreground">Chưa ánh xạ:</b> {r.unmapped.join(", ")} — ánh
                      xạ tên Sheet với nhân sự ở màn Import lịch, tới lúc đó những người này không
                      được so.
                    </p>
                  )}
                  {r.exempt.length > 0 && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      <b className="text-foreground">Miễn chấm công:</b> {r.exempt.join(", ")} —
                      Sheet vẫn đếm công cho họ, hệ thống cố ý không đếm nên không tính là lệch.
                    </p>
                  )}

                  {r.cellDiffs.length === 0 ? (
                    <EmptyState
                      title="Không lệch ô nào tới hôm qua"
                      description={`Chuỗi ngày sạch ${r.cleanStreak}/${GATE_DAYS}. Đủ ${GATE_DAYS} ngày liên tiếp thì bỏ được Sheet.`}
                    />
                  ) : rows.length === 0 ? (
                    <EmptyState
                      title={`Ngày ${day} không lệch ô nào`}
                      description="Bấm lại ô ngày đó trên lịch để bỏ lọc và xem toàn kỳ."
                    />
                  ) : (
                    <DiffTable rows={rows} periodKey={r.periodKey} coSo={coSo} />
                  )}

                  {r.totalDiffs.length > 0 && (
                    <div className="mt-4">
                      <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Lệch tổng tháng
                      </h3>
                      <ul className="space-y-1 text-sm">
                        {r.totalDiffs.map((t) => (
                          <li key={t.sheetName} className="tabular-nums">
                            <span className="font-medium">{t.sheetName}</span>: Sheet {t.sheetTotal}{" "}
                            · hệ thống {t.sysTotal}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </SectionCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
