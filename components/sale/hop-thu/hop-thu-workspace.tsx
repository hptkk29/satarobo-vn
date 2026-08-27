"use client";
// components/sale/hop-thu/hop-thu-workspace.tsx — khung hộp thư: bộ lọc · danh sách
// hội thoại · khung đọc · ô soạn trả lời.
//
// 🔴 LUẬT SỐ MỘT CỦA MÀN NÀY: KHÔNG BAO GIỜ báo "đã gửi" khi tin chưa đi.
// Kênh đang mô phỏng thì:
//   • có băng cảnh báo thường trực phía trên ô soạn,
//   • toast dùng nguyên câu server trả về (nói rõ CHƯA gửi và vì sao),
//   • bong bóng tin mang nhãn riêng, KHÔNG phải dấu tích.
// Đợt trước repo vừa phải dẹp hai nút báo thành công giả; đây là chỗ dễ tái phạm nhất.
//
// UI: shadcn THUẦN (ESLint chặn Magic UI / Motion / Recharts ở `components/sale/**`).
// Mobile-first 375px — Sale làm việc trên điện thoại.
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Link2, MessageSquare, Send, UserCheck } from "lucide-react";
import type { InboxChannel } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { HoiThoaiView, TinNhanView } from "@/lib/inbox/view";
import {
  guiTraLoiAction,
  ganNguoiPhuTrachAction,
  doiTrangThaiAction,
} from "@/app/(sale)/sale/hop-thu/actions";

const NHAN_KENH: Record<InboxChannel, string> = {
  ZALO_OA: "Zalo OA",
  MESSENGER: "Messenger",
  LIVECHAT: "Website",
  MANUAL: "Nhập tay",
};

export type TinhTrangKenh = {
  channel: InboxChannel;
  label: string;
  daCoKhoaKetNoi: boolean;
};

export function HopThuWorkspace({
  rows,
  tong,
  canhBaoCat,
  luong,
  tinhTrangKenh,
  coQuyenTraLoi,
  coQuyenGan,
  userId,
}: {
  rows: HoiThoaiView[];
  tong: number;
  canhBaoCat: string | null;
  luong: { hoiThoai: HoiThoaiView; tinNhan: TinNhanView[] } | null;
  tinhTrangKenh: TinhTrangKenh[];
  coQuyenTraLoi: boolean;
  coQuyenGan: boolean;
  userId: string;
}) {
  const chuaNoiKenhNao = tinhTrangKenh.every((k) => !k.daCoKhoaKetNoi);

  return (
    <div className="space-y-4">
      {chuaNoiKenhNao ? <BangChuaNoiKenh tinhTrang={tinhTrangKenh} /> : null}

      <BoLoc />

      {canhBaoCat ? (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {canhBaoCat}
        </p>
      ) : null}

      {/* 1 cột trên điện thoại, 2 cột từ md. Sale dùng điện thoại là chính. */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <DanhSachHoiThoai rows={rows} tong={tong} dangMoId={luong?.hoiThoai.id ?? null} />
        <KhungDoc
          luong={luong}
          coQuyenTraLoi={coQuyenTraLoi}
          coQuyenGan={coQuyenGan}
          userId={userId}
          tinhTrangKenh={tinhTrangKenh}
        />
      </div>
    </div>
  );
}

/** Băng nói thật khi chưa kênh nào có khoá kết nối — trạng thái hôm nay. */
function BangChuaNoiKenh({ tinhTrang }: { tinhTrang: TinhTrangKenh[] }) {
  return (
    <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">Chưa kênh nào được nối.</p>
        <p>
          Hộp thư đã sẵn sàng nhưng chưa có khoá kết nối của nhà cung cấp, nên chưa nhận
          được tin và chưa gửi được tin. Tin soạn ở đây sẽ được lưu vào hội thoại nhưng{" "}
          <strong>KHÔNG tới khách</strong>.
        </p>
        <p className="text-xs">
          Đang chờ:{" "}
          {tinhTrang.map((k) => `${k.label} (${k.daCoKhoaKetNoi ? "đã có khoá" : "chưa có khoá"})`).join(" · ")}
        </p>
      </div>
    </div>
  );
}

/** Bộ lọc đẩy vào URL (`replace`, không `push`) — cùng khuôn `khach-cua-toi/filters`. */
function BoLoc() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  function dat(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Đổi bộ lọc thì hội thoại đang mở có thể không còn trong danh sách — bỏ `id`
    // để tránh khung đọc trỏ vào thứ không thấy trong danh sách bên trái.
    next.delete("id");
    start(() => router.replace(`/sale/hop-thu?${next.toString()}`));
  }

  const dangCo = (k: string, v: string) => sp.get(k) === v;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <select
        aria-label="Lọc theo kênh"
        className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        value={sp.get("kenh") ?? ""}
        onChange={(e) => dat("kenh", e.target.value || null)}
      >
        <option value="">Mọi kênh</option>
        {(Object.keys(NHAN_KENH) as InboxChannel[]).map((c) => (
          <option key={c} value={c}>
            {NHAN_KENH[c]}
          </option>
        ))}
      </select>

      <select
        aria-label="Lọc theo người phụ trách"
        className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        value={sp.get("phutrach") ?? ""}
        onChange={(e) => dat("phutrach", e.target.value || null)}
      >
        <option value="">Mọi người phụ trách</option>
        <option value="toi">Của tôi</option>
        <option value="chua-gan">Chưa gán</option>
      </select>

      <NutLoc bat={dangCo("chuatraloi", "1")} onClick={() => dat("chuatraloi", dangCo("chuatraloi", "1") ? null : "1")}>
        Chưa trả lời
      </NutLoc>
      <NutLoc bat={dangCo("mocoi", "1")} onClick={() => dat("mocoi", dangCo("mocoi", "1") ? null : "1")}>
        Chưa nối khách
      </NutLoc>
      <NutLoc bat={dangCo("dadong", "1")} onClick={() => dat("dadong", dangCo("dadong", "1") ? null : "1")}>
        Đã đóng
      </NutLoc>
    </div>
  );
}

function NutLoc({
  bat,
  onClick,
  children,
}: {
  bat: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={bat}
      onClick={onClick}
      className={cn(
        "h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
        bat
          ? "border-primary bg-primary/10 text-primary"
          : "border-input text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function DanhSachHoiThoai({
  rows,
  tong,
  dangMoId,
}: {
  rows: HoiThoaiView[];
  tong: number;
  dangMoId: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function mo(id: string) {
    const next = new URLSearchParams(sp.toString());
    next.set("id", id);
    router.replace(`/sale/hop-thu?${next.toString()}`);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <MessageSquare className="mx-auto mb-2 h-5 w-5" />
        Chưa có hội thoại nào khớp bộ lọc.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{tong} hội thoại</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => mo(r.id)}
              aria-current={r.id === dangMoId ? "true" : undefined}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                r.id === dangMoId
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-medium">{r.tenHienThi}</span>
                <Badge variant="outline" className="shrink-0 text-[11px]">
                  {NHAN_KENH[r.channel]}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {r.chuaTraLoi ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Chưa trả lời
                  </span>
                ) : null}
                {r.moCoi ? (
                  <span className="rounded bg-muted px-1.5 py-0.5">Chưa nối khách</span>
                ) : null}
                {r.unreadCount > 0 ? <span>{r.unreadCount} tin mới</span> : null}
                {r.lastMessageAt ? <span>{gioNgan(r.lastMessageAt)}</span> : null}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KhungDoc({
  luong,
  coQuyenTraLoi,
  coQuyenGan,
  userId,
  tinhTrangKenh,
}: {
  luong: { hoiThoai: HoiThoaiView; tinNhan: TinNhanView[] } | null;
  coQuyenTraLoi: boolean;
  coQuyenGan: boolean;
  userId: string;
  tinhTrangKenh: TinhTrangKenh[];
}) {
  if (!luong) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Chọn một hội thoại ở danh sách bên trái để đọc.
      </div>
    );
  }
  const { hoiThoai, tinNhan } = luong;
  const kenhDaNoi =
    tinhTrangKenh.find((k) => k.channel === hoiThoai.channel)?.daCoKhoaKetNoi ?? false;

  return (
    <div className="flex min-h-[24rem] flex-col rounded-lg border border-border">
      <DauHoiThoai
        hoiThoai={hoiThoai}
        coQuyenGan={coQuyenGan}
        userId={userId}
      />

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {tinNhan.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Chưa có tin nào.</p>
        ) : (
          tinNhan.map((t) => <BongBongTin key={t.id} tin={t} />)
        )}
      </div>

      {coQuyenTraLoi ? (
        <OSoanTraLoi conversationId={hoiThoai.id} kenhDaNoi={kenhDaNoi} />
      ) : (
        <p className="border-t border-border p-3 text-sm text-muted-foreground">
          Bạn không có quyền trả lời hội thoại.
        </p>
      )}
    </div>
  );
}

function DauHoiThoai({
  hoiThoai,
  coQuyenGan,
  userId,
}: {
  hoiThoai: HoiThoaiView;
  coQuyenGan: boolean;
  userId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function chay(fn: () => Promise<{ ok: boolean; thongBao?: string; error?: string }>) {
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.thongBao ?? "Xong");
      else toast.error(res.error ?? "Lỗi");
      // Action `revalidatePath` dùng đường sạch của host admin, không khớp đường
      // của site Sale — phải tự làm mới (bài học `touch-panel.tsx`).
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{hoiThoai.tenHienThi}</p>
        <p className="text-xs text-muted-foreground">
          {NHAN_KENH[hoiThoai.channel]}
          {hoiThoai.sdtKhach ? ` · ${hoiThoai.sdtKhach}` : ""}
          {hoiThoai.moCoi ? " · chưa nối phiếu khách" : ""}
        </p>
      </div>

      {coQuyenGan ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              chay(() =>
                ganNguoiPhuTrachAction(
                  hoiThoai.id,
                  hoiThoai.assigneeId === userId ? null : userId,
                ),
              )
            }
          >
            <UserCheck className="mr-1 h-3.5 w-3.5" />
            {hoiThoai.assigneeId === userId ? "Bỏ nhận" : "Nhận việc"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              chay(() =>
                doiTrangThaiAction(
                  hoiThoai.id,
                  hoiThoai.status === "CLOSED" ? "OPEN" : "CLOSED",
                ),
              )
            }
          >
            {hoiThoai.status === "CLOSED" ? "Mở lại" : "Đóng"}
          </Button>
          {hoiThoai.moCoi ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" />
              Nối phiếu khách: mở hồ sơ khách rồi dán mã hội thoại
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bong bóng tin. Tin đi ra mang NHÃN TRẠNG THÁI GIAO, không mang dấu tích:
 * một dấu tích cho tin chưa đi là nói dối bằng biểu tượng.
 */
function BongBongTin({ tin }: { tin: TinNhanView }) {
  const raNgoai = tin.direction === "OUT";
  return (
    <div className={cn("flex", raNgoai ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          raNgoai ? "bg-primary/10" : "bg-muted",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{tin.body ?? "(không có nội dung)"}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{gioNgan(tin.sentAt)}</span>
          {raNgoai ? <NhanGiao tin={tin} /> : null}
        </p>
      </div>
    </div>
  );
}

function NhanGiao({ tin }: { tin: TinNhanView }) {
  if (tin.sentOutsideSystem) {
    return <span className="rounded bg-muted px-1 py-0.5">Gửi ngoài hệ thống</span>;
  }
  switch (tin.deliveryStatus) {
    case "SENT":
      return <span className="text-emerald-700 dark:text-emerald-400">Đã gửi tới khách</span>;
    case "PENDING":
      return <span>Đang gửi…</span>;
    case "SIMULATED":
      return (
        <span className="rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          CHƯA gửi — chế độ mô phỏng
        </span>
      );
    case "SKIPPED":
      return (
        <span className="rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          CHƯA gửi{tin.errorCode ? ` (${tin.errorCode})` : ""}
        </span>
      );
    case "FAILED":
      return (
        <span className="rounded bg-red-100 px-1 py-0.5 font-medium text-red-900 dark:bg-red-950 dark:text-red-200">
          Gửi hỏng{tin.errorCode ? ` (${tin.errorCode})` : ""}
        </span>
      );
    default:
      return null;
  }
}

function OSoanTraLoi({
  conversationId,
  kenhDaNoi,
}: {
  conversationId: string;
  kenhDaNoi: boolean;
}) {
  const router = useRouter();
  const [noiDung, setNoiDung] = useState("");
  const [pending, start] = useTransition();
  // Một khoá cho một nội dung: bấm đúp / hai tab cùng gửi sẽ va vào UNIQUE ở DB
  // thay vì gửi hai tin cho khách. Đổi khoá khi nội dung đổi.
  const outboundKey = useMemo(
    () => `${conversationId}:${hashNhanh(noiDung)}`,
    [conversationId, noiDung],
  );

  function gui() {
    const noi = noiDung.trim();
    if (!noi) return;
    start(async () => {
      const res = await guiTraLoiAction(conversationId, noi, outboundKey);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Dùng NGUYÊN câu server trả về. Rút gọn thành "Đã gửi" là tái tạo đúng lỗi
      // mà đợt trước phải đi dẹp.
      if (res.daGui) toast.success(res.thongBao);
      else toast.warning(res.thongBao, { duration: 8000 });
      setNoiDung("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 border-t border-border p-3">
      {!kenhDaNoi ? (
        <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Kênh này <strong>chưa nối</strong>. Tin sẽ được lưu vào hội thoại để giữ vết,
            nhưng <strong>khách KHÔNG nhận được</strong>. Hãy trả lời khách trực tiếp trên
            ứng dụng của kênh cho tới khi nối xong.
          </span>
        </p>
      ) : null}

      <Textarea
        value={noiDung}
        onChange={(e) => setNoiDung(e.target.value)}
        placeholder="Nhập nội dung trả lời…"
        rows={3}
        maxLength={4000}
        disabled={pending}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={gui} disabled={pending || !noiDung.trim()}>
          <Send className="mr-1 h-3.5 w-3.5" />
          {pending ? "Đang xử lý…" : kenhDaNoi ? "Gửi" : "Lưu (chưa gửi được)"}
        </Button>
      </div>
    </div>
  );
}

function gioNgan(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Băm rẻ tiền cho khoá chống bấm đúp — không cần chống va chạm mật mã. */
function hashNhanh(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
