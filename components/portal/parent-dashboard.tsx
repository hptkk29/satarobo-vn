import Link from "next/link";
import {
  Users,
  Wallet,
  Pencil,
  CalendarClock,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ParentChildOverview } from "@/lib/portal/dashboard";
import { PageHero, HeroMetric } from "@/components/portal/page-header";

// Portal v2 (merge SataUI) — Dashboard phụ huynh. RSC thuần, nhận data thật từ
// getParentChildrenOverview (KHÔNG mock, KHÔNG zustand). "Cần xử lý" + thẻ từng con
// đều suy từ per-child overview.

type Tone = "primary" | "caution" | "quiz" | "success";

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

function toneBadge(tone: Tone): string {
  return tone === "caution"
    ? "bg-caution/10 text-caution"
    : tone === "quiz"
      ? "bg-quiz/10 text-quiz"
      : tone === "success"
        ? "bg-success/10 text-success"
        : "bg-primary/10 text-primary";
}

export function ParentDashboardV2({
  parentName,
  children: kids,
}: {
  parentName: string;
  children: ParentChildOverview[];
}) {
  const actions: {
    id: string;
    icon: LucideIcon;
    tone: Tone;
    title: string;
    desc: string;
    href: string;
    cta: string;
  }[] = [];

  for (const c of kids) {
    if (c.debt > 0) {
      actions.push({
        id: `fin-${c.id}`,
        icon: Wallet,
        tone: "caution",
        title: "Học phí chưa đóng",
        desc: `${c.name} · ${vnd(c.debt)}`,
        href: "/portal/hoc-phi",
        cta: "Xem học phí",
      });
    }
    if (c.needMakeup > 0) {
      actions.push({
        id: `mk-${c.id}`,
        icon: CalendarClock,
        tone: "quiz",
        title: `${c.needMakeup} buổi cần học bù`,
        desc: `${c.name} · buổi vắng chưa được học bù`,
        href: "/portal/yeu-cau",
        cta: "Đăng ký",
      });
    }
    if (c.pendingHomework > 0) {
      actions.push({
        id: `hw-${c.id}`,
        icon: Pencil,
        tone: "primary",
        title: `${c.pendingHomework} bài chưa nộp`,
        desc: `${c.name} · nhắc con hoàn thành đúng hạn`,
        href: "/portal/bai-tap",
        cta: "Xem",
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHero
        icon={Users}
        overline="Cổng phụ huynh"
        title={`Chào ${parentName} 👋`}
        subtitle={`Đồng hành cùng ${kids.length} con tại Sata Robo.`}
        metric={
          <HeroMetric
            label={actions.length > 0 ? "Việc cần xử lý" : "Số con"}
            value={actions.length > 0 ? `${actions.length}` : `${kids.length}`}
          />
        }
      />

      {/* Cần bạn xử lý */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
            <CheckCircle2 className="size-4" />
          </span>
          Cần bạn xử lý
          {actions.length > 0 && (
            <Badge className="rounded-md border-none bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {actions.length}
            </Badge>
          )}
        </h2>

        {actions.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-4 text-sm font-semibold text-success">
            <CheckCircle2 className="size-5 shrink-0" />
            Mọi việc đều ổn — không có khoản nào cần xử lý ngay.
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map((a) => (
              <Link
                key={a.id}
                href={a.href}
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", toneBadge(a.tone))}>
                  <a.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{a.title}</p>
                  <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{a.desc}</p>
                </div>
                <span className="hidden shrink-0 items-center gap-0.5 text-xs font-bold text-primary sm:inline-flex">
                  {a.cta} <ChevronRight className="size-3.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Các con */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Các con của bạn</h2>

        {kids.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Tài khoản chưa được liên kết với học viên nào. Liên hệ trung tâm Sata Robo để được hỗ trợ.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {kids.map((c) => (
              <div key={c.id} className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                    {c.name.trim().split(" ").slice(-1)[0]?.[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-foreground">{c.name}</h3>
                    <p className="truncate text-xs font-medium text-muted-foreground">
                      {c.studentCode ?? "Chưa có mã HV"}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                    <span className="text-muted-foreground">Chuyên cần</span>
                    <span className="shrink-0 tabular-nums text-primary">
                      {c.attendanceRate}% · {c.attended}/{c.totalSessions}
                    </span>
                  </div>
                  <Progress value={c.attendanceRate} className="h-1.5" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Chuyên cần" value={`${c.attendanceRate}%`} tone={c.attendanceRate >= 90 ? "success" : "caution"} />
                  <MiniStat label="Bài chờ" value={`${c.pendingHomework}`} tone={c.pendingHomework > 0 ? "primary" : "success"} />
                  <MiniStat label="Học phí" value={c.debt > 0 ? "Còn nợ" : "Đủ"} tone={c.debt > 0 ? "caution" : "success"} />
                </div>

                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Link
                    href="/portal/ho-so-con"
                    className="min-w-0 flex-1 truncate rounded-xl border border-border bg-card py-2 text-center text-sm font-bold text-foreground transition-colors hover:bg-muted"
                  >
                    Hồ sơ
                  </Link>
                  <Link
                    href="/portal/hoc-ba"
                    className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <span className="truncate">Học bạ</span>
                    <ArrowRight className="size-4 shrink-0" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "caution"
        ? "text-caution"
        : tone === "quiz"
          ? "text-quiz"
          : "text-primary";
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
      <p className={cn("text-sm font-bold leading-tight tabular-nums", cls)}>{value}</p>
      <p className="mt-0.5 truncate text-xs font-medium leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}
