import { Users, ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ParentChildOverview } from "@/lib/portal/dashboard";
import { PageHero, HeroMetric } from "@/components/portal/page-header";
import { ChildDetailLink } from "@/components/portal/child-detail-link";

// Portal v2 (merge SataUI) — trang "Các con". RSC, data thật getParentChildrenOverview.

type Tone = "primary" | "caution" | "success";
const AVATAR_COLORS = [
  "oklch(0.748 0.169 56.8)",
  "oklch(0.62 0.18 250)",
  "oklch(0.62 0.17 150)",
  "oklch(0.6 0.2 300)",
  "oklch(0.62 0.2 20)",
];
function initials(name: string): string {
  const w = name.trim().split(/\s+/);
  return (
    w
      .slice(-2)
      .map((x) => x[0])
      .join("") ||
    w[0]?.[0] ||
    "?"
  ).toUpperCase();
}
function nextLabel(iso: string | null): string {
  if (!iso) return "Chưa có";
  const d = new Date(iso);
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = new Date();
  const t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const diff = Math.round((dd.getTime() - t0.getTime()) / 86400000);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Ngày mai";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function ChildrenPageV2({ kids }: { kids: ParentChildOverview[] }) {
  return (
    <div className="portal-v2 mx-auto w-full max-w-6xl space-y-6">
      <PageHero
        icon={Users}
        overline="Cổng phụ huynh"
        title="Các con"
        subtitle="Chọn một con để xem hồ sơ chi tiết hoặc chuyển sang Cổng học sinh của con."
        metric={<HeroMetric label="Đang học" value={`${kids.length} con`} />}
      />

      {kids.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Tài khoản chưa được liên kết với học viên nào. Liên hệ trung tâm Sata
          Robo để được hỗ trợ.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {kids.map((c, i) => (
            <div
              key={c.id}
              className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                  style={{
                    backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
                  }}
                >
                  {initials(c.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-foreground">
                    {c.name}
                  </h3>
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {[c.courseName, c.className].filter(Boolean).join(" · ") ||
                      c.studentCode ||
                      "Chưa xếp lớp"}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="text-muted-foreground">
                    Tiến độ khóa học
                  </span>
                  <span className="shrink-0 tabular-nums text-primary">
                    {c.attendanceRate}% · {c.attended}/{c.totalSessions}
                  </span>
                </div>
                <Progress value={c.attendanceRate} className="h-1.5" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Stat
                  value={`${c.attendanceRate}%`}
                  label="Chuyên cần"
                  tone={c.attendanceRate >= 90 ? "success" : "caution"}
                />
                <Stat
                  value={`${c.pendingHomework}`}
                  label="Bài chờ"
                  tone={c.pendingHomework > 0 ? "primary" : "success"}
                />
                <Stat
                  value={c.debt > 0 ? "Còn nợ" : "Đủ"}
                  label="Học phí"
                  tone={c.debt > 0 ? "caution" : "success"}
                />
                <Stat
                  value={nextLabel(c.nextSessionDate)}
                  label="Buổi tiếp theo"
                  tone="primary"
                />
              </div>

              <div className="mt-auto flex items-center gap-2 pt-1">
                <ChildDetailLink
                  studentId={c.id}
                  className="min-w-0 flex-1 truncate rounded-xl border border-border bg-card py-2 text-center text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  Xem hồ sơ
                </ChildDetailLink>
                {/* Vào Cổng học sinh của ĐÚNG con này: đổi active student rồi mới
                    điều hướng — trước đây link tĩnh trỏ nhầm /portal/hoc-ba. */}
                <ChildDetailLink
                  studentId={c.id}
                  href="/portal/hoc-sinh"
                  errorMessage="Không vào được Cổng học sinh"
                  className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <span className="truncate">Cổng học sinh</span>{" "}
                  <ArrowRight className="size-4 shrink-0" />
                </ChildDetailLink>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: Tone;
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "caution"
        ? "text-caution"
        : "text-primary";
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2 text-center">
      <p className={cn("text-sm font-bold leading-tight tabular-nums", cls)}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs font-medium leading-tight text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
