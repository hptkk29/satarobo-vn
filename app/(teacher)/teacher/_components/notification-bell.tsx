"use client";

// Chuông thông báo site GV — dùng CHUNG nguồn với admin (/api/admin/notifications/bell,
// gate hasStaffRole nên TEACHER qua được). Bắt buộc phải có ở đây: từ khi
// TEACHER_SITE_ENABLED bật (10/07), GV thuần bị route-policy đá khỏi host admin, mà
// mọi StaffNotification nhắm tới GV lại chỉ hiện ở chuông admin — điểm danh bị CSKH
// sửa hồi tố, lịch dạy thay ngày mai, nhắc chốt buổi đều thành thông báo không ai đọc.
//
// href của StaffNotification viết theo đường admin (vd "/attendance?sessionId=…").
// Site GV chạy clean-URL (host giaovien, path không có tiền tố /teacher), nên map
// sang màn tương ứng của site GV; đường nào GV không có màn thì bỏ link (vẫn đọc
// được nội dung) thay vì ném GV sang host admin rồi bị 307 đá ngược.

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { teacherHref } from "@/lib/teacher/notification-href";

type Item = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications/bell", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      /* mạng chập chờn — lần poll sau tự thử lại */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markRead(id: string, href: string | null) {
    await fetch("/api/admin/notifications/bell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)));
    setUnread((u) => Math.max(0, u - 1));
    const to = teacherHref(href);
    if (to) {
      setOpen(false);
      router.push(to);
    }
  }

  async function markAll() {
    await fetch("/api/admin/notifications/bell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setItems((cur) => cur.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    setUnread(0);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Thông báo"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-bold text-foreground">Thông báo</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Đọc hết
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">Không có thông báo.</p>
            ) : (
              items.map((i) => {
                const to = teacherHref(i.href);
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => markRead(i.id, i.href)}
                    className={`block w-full border-b border-border/50 px-3 py-2.5 text-left last:border-0 hover:bg-muted ${
                      i.readAt ? "opacity-60" : "bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!i.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{i.title}</p>
                        <p className="text-xs text-muted-foreground">{i.body}</p>
                        {to && <p className="mt-0.5 text-[11px] text-primary">Xem chi tiết →</p>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
