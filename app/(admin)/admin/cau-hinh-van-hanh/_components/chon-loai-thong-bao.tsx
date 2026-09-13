"use client";

// Bảng chọn "loại thông báo nào được đẩy Web Push".
//
// ── HAI THỨ MÀN NÀY PHẢI NÓI THẬT (luật 12) ─────────────────────────────────────────────
// 1. Bật một loại ở đây KHÔNG có nghĩa là điện thoại sẽ rung. Còn hai cổng nữa phía trên:
//    công tắc tổng `push.webPushEnabled` và khoá VAPID. Trang cha đo cả hai và truyền xuống
//    `canhBao` — nếu có cái nào hỏng thì bảng này phải nói ngay, không để người ta bấm xong
//    rồi ngồi chờ một thông báo không bao giờ tới.
// 2. Lưu xong KHÔNG có hiệu lực tức thì ở mọi nơi. `getGlobalSetting` cache 300 giây, và cron
//    chạy ở tiến trình khác. Nói thẳng con số đó ra; im lặng thì người ta thử 30 giây rồi kết
//    luận "chức năng hỏng".

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bell, BellOff, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { NotiCatalogEntry } from "@/lib/notifications/catalog";
import { luuLoaiDuocDayAction } from "../actions";

export interface CanhBaoKenh {
  /** Câu mô tả vì sao kênh chưa chạy. Rỗng = kênh sẵn sàng. */
  cau: string;
  /** Nơi đi sửa, để người đọc không phải đoán. */
  choSua: string;
}

const MUC_NHAN: Readonly<Record<number, string>> = {
  1: "Khẩn",
  2: "Thường",
  3: "Tham khảo",
};

export function ChonLoaiThongBao({
  danhMuc,
  dangBat,
  choSua,
  canhBao,
}: {
  danhMuc: readonly NotiCatalogEntry[];
  dangBat: readonly string[];
  /** false = chỉ được xem (không phải SUPER_ADMIN). Công tắc phải khoá, không chỉ ẩn nút Lưu. */
  choSua: boolean;
  canhBao: readonly CanhBaoKenh[];
}) {
  const banDau = useMemo(() => new Set(dangBat), [dangBat]);
  const [chon, setChon] = useState<ReadonlySet<string>>(banDau);
  const [lyDo, setLyDo] = useState("");
  const [dangLuu, batDauLuu] = useTransition();

  // So theo NỘI DUNG chứ không theo tham chiếu: bật rồi tắt lại đúng mục đó là KHÔNG có thay
  // đổi, và nút Lưu phải mờ đi. Nút sáng khi chẳng có gì để lưu là một lời hứa suông.
  const coDoi =
    chon.size !== banDau.size || [...chon].some((t) => !banDau.has(t));

  const bat = (prefix: string, moi: boolean) => {
    setChon((truoc) => {
      const s = new Set(truoc);
      if (moi) s.add(prefix);
      else s.delete(prefix);
      return s;
    });
  };

  const luu = () => {
    if (!lyDo.trim()) {
      toast.error("Vui lòng nhập lý do thay đổi");
      return;
    }
    batDauLuu(async () => {
      const res = await luuLoaiDuocDayAction({ tienTo: [...chon], reason: lyDo });
      if (res.ok) {
        toast.success(
          chon.size === 0
            ? "Đã lưu — hiện KHÔNG loại nào được đẩy"
            : `Đã lưu — ${chon.size} loại được đẩy`,
        );
        setLyDo("");
      } else {
        toast.error(res.error.message);
      }
    });
  };

  // Gom theo nhóm, giữ nguyên thứ tự `danhMuc` đã sắp ở server.
  const theoNhom = useMemo(() => {
    const m = new Map<string, NotiCatalogEntry[]>();
    for (const e of danhMuc) {
      const ds = m.get(e.groupLabel);
      if (ds) ds.push(e);
      else m.set(e.groupLabel, [e]);
    }
    return [...m.entries()];
  }, [danhMuc]);

  return (
    <div className="space-y-5">
      {canhBao.map((c) => (
        <div
          key={c.cau}
          className="flex items-start gap-3 rounded-lg border border-state-warning-soft bg-state-warning-soft px-4 py-3 text-sm text-state-warning-ink"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong>{c.cau}</strong> — chọn gì ở bảng dưới cũng chưa ai nhận được. {c.choSua}
          </p>
        </div>
      ))}

      {/* Số đang bật để ngay trên đầu: đây là câu trả lời cho "hiện đang đẩy những gì", và nó
          phải đọc được mà không cần cuộn qua 51 dòng. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3">
        <p className="text-sm text-foreground">
          {chon.size === 0 ? (
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <BellOff className="h-4 w-4" aria-hidden /> Không loại nào được đẩy
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-primary" aria-hidden />
              <strong>{chon.size}</strong>/{danhMuc.length} loại được đẩy
            </span>
          )}
        </p>
        {coDoi && (
          <span className="text-xs font-semibold text-state-warning-ink">
            Có thay đổi chưa lưu
          </span>
        )}
      </div>

      {theoNhom.map(([nhom, ds]) => (
        <section key={nhom} className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2.5 text-sm font-bold text-foreground">
            {nhom}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {ds.filter((e) => chon.has(e.prefix)).length}/{ds.length} bật
            </span>
          </h2>
          <ul className="divide-y divide-border">
            {ds.map((e) => (
              <li key={e.prefix} className="flex items-start gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{e.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {MUC_NHAN[e.priority] ?? `Mức ${e.priority}`} · {e.recipients}
                  </p>
                  {/* Khoá thô vẫn hiện, cỡ nhỏ: khi có người báo "không nhận được thông báo X",
                      thứ tra được trong `WebPushOutbox.dedupeKey` là chuỗi này chứ không phải
                      nhãn tiếng Việt. */}
                  <code className="mt-0.5 block text-[11px] text-muted-foreground/70">
                    {e.prefix}
                  </code>
                </div>
                <Switch
                  checked={chon.has(e.prefix)}
                  onCheckedChange={(v) => bat(e.prefix, v)}
                  disabled={!choSua || dangLuu}
                  aria-label={`Đẩy Web Push cho: ${e.label}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {choSua && (
        <div className="sticky bottom-0 space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg">
          <div>
            <label
              htmlFor="ly-do-doi-loai-push"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Lý do thay đổi (bắt buộc)
            </label>
            <Input
              id="ly-do-doi-loai-push"
              value={lyDo}
              onChange={(ev) => setLyDo(ev.target.value)}
              placeholder="Ví dụ: BGĐ duyệt bật thêm nhắc lịch ca cho giáo viên"
              disabled={dangLuu}
              className="mt-1"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Lưu xong có hiệu lực trong vòng <strong>5 phút</strong> (cấu hình được nhớ đệm),
              không tức thì.
            </p>
            <Button onClick={luu} disabled={!coDoi || dangLuu}>
              {dangLuu ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
