"use client";

import { useState } from "react";
import { MessageSquareText, Search, Calendar, User, School } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedbackItem } from "@/lib/portal/feedback";
import { PageHero } from "@/components/portal/page-header";
import { ChildSwitcher } from "@/components/portal/child-switcher";

function fmt(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Nhận xét: comment lưu dạng nhiều dòng "Nhãn: nội dung" → render nhãn cam.
function CommentBody({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;
  const [head, ...rest] = lines;
  return (
    <div className="rounded-xl bg-muted/40 p-4 space-y-2">
      <p className="text-sm font-bold text-foreground">{head}</p>
      {rest.map((l, i) => {
        const m = l.match(/^([^:]+):\s*(.*)$/);
        return (
          <p key={i} className="text-sm leading-relaxed text-muted-foreground">
            {m ? (<><span className="font-bold text-primary">{m[1]}:</span> {m[2]}</>) : l}
          </p>
        );
      })}
    </div>
  );
}

export function NhanXetPageV2({
  kids,
  activeId,
  studentName,
  items,
}: {
  kids: { id: string; name: string }[];
  activeId: string | null;
  studentName: string;
  items: FeedbackItem[];
}) {
  const [selId, setSelId] = useState(items[0]?.id ?? "");
  const sel = items.find((it) => it.id === selId) ?? items[0] ?? null;

  return (
    <div className="portal-v2 mx-auto w-full max-w-6xl space-y-6">
      <ChildSwitcher kids={kids} activeId={activeId} />

      <PageHero
        icon={MessageSquareText}
        title="Nhận xét theo buổi học"
        subtitle={`Nhận xét chi tiết của giáo viên dành cho ${studentName} · ${items.length} nhận xét`}
      />

      {/* Search + filters (hiển thị giống SataUI) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input placeholder="Tìm tên bài học / nội dung nhận xét..." className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/40" />
        </div>
        <select className="rounded-xl border border-border bg-card px-3 py-2 text-sm"><option>Mọi lúc</option></select>
        <select className="rounded-xl border border-border bg-card px-3 py-2 text-sm"><option>Mọi GV</option></select>
        <select className="rounded-xl border border-border bg-card px-3 py-2 text-sm"><option>Tất cả</option></select>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Chưa có nhận xét nào.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
          {/* List */}
          <div className="space-y-2">
            {items.map((it) => {
              const active = it.id === sel?.id;
              return (
                <button
                  key={it.id}
                  onClick={() => setSelId(it.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                    active ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{it.order ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{it.title.replace(/^Buổi \d+: /, "")}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{fmt(it.dateISO)}{it.teacher ? ` · ${it.teacher}` : ""}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          {sel && (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="-m-4 mb-0 rounded-t-2xl bg-gradient-to-br from-accent to-accent/80 p-4 text-white">
                <p className="text-xs font-bold uppercase tracking-wider text-white/70">Báo cáo buổi học</p>
                <p className="text-base font-bold">{sel.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/90">
                  <span className="inline-flex items-center gap-1"><Calendar className="size-3.5" /> {fmt(sel.dateISO)}</span>
                  {sel.teacher && <span className="inline-flex items-center gap-1"><User className="size-3.5" /> {sel.teacher}</span>}
                  {sel.className && <span className="inline-flex items-center gap-1"><School className="size-3.5" /> Lớp: {sel.className}</span>}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                  <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">1</span>
                  Nhận xét của giáo viên
                </h3>
                <CommentBody text={sel.comment} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
