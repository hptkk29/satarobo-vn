"use client";

// Bảng giao nick Zalo — NHIỀU NGƯỜI MỘT NICK, MỖI NGƯỜI MỘT MỨC (24/09/2026).
//
// ── VÌ SAO BẢNG CHỈ TÓM TẮT, CÒN SỬA THÌ TRONG HỘP THOẠI ─────────────────────────────
// Một ô `<Select>` trên dòng bảng diễn tả được "một người". Nó KHÔNG diễn tả được "hai
// người, mỗi người một mức" — và cách duy nhất để nhét vừa là cho dòng cao lên, phá mật
// độ 44px của DESIGN.md ngay trên màn có nhiều bảng khác.
//
// Nên bảng in CÂU TÓM TẮT (đọc lướt được, đúng thứ người ta cần khi mở màn: "nick này ai
// đang giữ"), và nút Sửa mở hộp thoại có đủ chỗ cho danh sách đầy đủ + ba mức.
//
// ── 🔴 HỘP THOẠI ĐẶT CẢ TẬP, KHÔNG PHẢI THÊM/BỚT TỪNG DÒNG ──────────────────────────
// Lưu = gửi TOÀN BỘ danh sách; ai để "Không giao" thì bị gỡ. Đó là vì vế GỠ (người nghỉ
// việc, đổi ca) là vế không ai nhớ bấm, và hỏng thì không có triệu chứng — người không
// còn phận sự vẫn đọc chat khách. Hộp thoại hiện MỌI người hợp lệ của cơ sở, nên trạng
// thái đúng luôn nhìn thấy được, không phải nhớ.
//
// ── 🔴 LỖI ĐÃ SỬA: giá trị nội bộ rò ra ô chọn ───────────────────────────────────────
// Bản 24/09 dùng `<Select value={CHUA_GIAO}>` với `CHUA_GIAO = "__chua-giao__"`, và ô
// hiện đúng chuỗi ấy cho người dùng đọc. Nguyên nhân: `SelectValue` render GIÁ TRỊ khi
// không khớp được nhãn của một `SelectItem`.
//
// Cách sửa KHÔNG phải là đổi chuỗi sentinel cho đẹp hơn — chuỗi nào cũng sai, vì đó là
// mã nội bộ. Ở đây dùng `<SelectValue>` có CON để tự render nhãn: nhãn luôn do ta quyết,
// không bao giờ rơi về giá trị thô. Khoá bằng ca `[NZ-01]`.
//
// ── Mật độ và màu theo DESIGN.md ─────────────────────────────────────────────────────
// `adminTh`/`adminTd`/`adminTr` cho dòng 44px và `whitespace-nowrap` trên CẢ `th` lẫn
// `td` — đó là thứ duy nhất chặn chiều cao dòng nhảy loạn với tên tiếng Việt dài.
// Trạng thái đi qua `StatusPill` (thang ngữ nghĩa riêng, KHÔNG mượn màu thương hiệu).
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill, type PillTone } from "@/components/admin/ui/status-pill";
import { adminTd, adminTh, adminTr } from "@/components/admin/ui/table";
import {
  MUC_QUYEN,
  NHAN_MUC,
  docMucQuyen,
  type MucQuyen,
} from "@/lib/integrations/zalocrm/pham-vi-nick";
import { giaoNickAction } from "../actions";

/** Mã nội bộ cho "không giao". KHÔNG BAO GIỜ được hiện ra màn hình — xem khối trên. */
const KHONG_GIAO = "__khong-giao__";

const NHAN_TRANG_THAI: Record<string, { chu: string; tone: PillTone }> = {
  CONNECTED: { chu: "Đang kết nối", tone: "success" },
  DISCONNECTED: { chu: "Mất kết nối", tone: "danger" },
  UNKNOWN: { chu: "Chưa rõ", tone: "muted" },
};

export type DongNickZalo = {
  zcrmAccountId: string;
  displayName: string | null;
  status: string;
  centerId: string | null;
  centerName: string | null;
  /** Người ĐƯỢC GIAO (không gồm quản lý cơ sở — họ có quyền tự động). */
  giao: { sataUserId: string; ten: string; mucQuyen: string }[];
};

export type NguoiNhan = {
  id: string;
  ten: string;
  email: string | null;
  /** Quản lý cơ sở ⇒ luôn có `admin`, KHÔNG sửa được ở đây. */
  laQuanLy: boolean;
};

export function BangNickZalo({
  rows,
  nguoiTheoCoSo,
}: {
  rows: DongNickZalo[];
  nguoiTheoCoSo: Record<string, NguoiNhan[]>;
}) {
  const [dangMo, datDangMo] = useState<string | null>(null);
  const nickDangMo = rows.find((r) => r.zcrmAccountId === dangMo) ?? null;

  return (
    <div className="space-y-3">
      {/* KHÔNG lặp lại câu mô tả của tab. `moTa` trong `TAB_CAU_HINH` đã in ngay phía trên
          bảng này — viết lại nó ở đây là bắt người dùng đọc hai lần cùng một câu. Chỉ giữ
          mẩu tin mà mô tả tab KHÔNG nói: độ trễ có hiệu lực. */}
      <p className="text-sm text-muted-foreground">
        Thay đổi có hiệu lực trong vòng <strong className="font-medium text-foreground">5 phút</strong>.
      </p>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className={adminTh}>Nick</th>
              <th className={adminTh}>Cơ sở</th>
              <th className={adminTh}>Trạng thái</th>
              <th className={adminTh}>Đang giao cho</th>
              <th className={`${adminTh} w-px text-right`}>
                <span className="sr-only">Hành động</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nguoi = r.centerId ? (nguoiTheoCoSo[r.centerId] ?? []) : [];
              const khoa = !r.centerId || nguoi.filter((n) => !n.laQuanLy).length === 0;
              const tt = NHAN_TRANG_THAI[r.status] ?? NHAN_TRANG_THAI.UNKNOWN!;

              return (
                <tr key={r.zcrmAccountId} className={adminTr}>
                  <td className={adminTd}>
                    {r.displayName ? (
                      <span className="font-medium">{r.displayName}</span>
                    ) : (
                      // Nói VÌ SAO trống, không chỉ "(chưa có tên)". Tên về từ Zalo CRM khi
                      // nick kết nối lần đầu; trước đó Sata chỉ có mã tài khoản.
                      <span className="text-muted-foreground">
                        Chưa có tên — nick chưa kết nối lần nào
                      </span>
                    )}
                  </td>
                  <td className={adminTd}>
                    {r.centerName ?? <span className="text-muted-foreground">Chưa gắn cơ sở</span>}
                  </td>
                  <td className={adminTd}>
                    <StatusPill tone={tt.tone}>{tt.chu}</StatusPill>
                  </td>
                  <td className={adminTd}>
                    <TomTat giao={r.giao} />
                  </td>
                  <td className={`${adminTd} text-right`}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={khoa}
                      onClick={() => datDangMo(r.zcrmAccountId)}
                      aria-label={`Sửa người được giao nick ${r.displayName ?? r.zcrmAccountId}`}
                      // Nút xám mà không nói vì sao là câu đố. Nêu ĐÚNG lý do, vì hai lý
                      // do cần hai hành động khác hẳn nhau (ánh xạ cơ sở ↔ gán vai).
                      title={
                        !r.centerId
                          ? "Nick chưa gắn cơ sở nên chưa giao được."
                          : khoa
                            ? "Cơ sở này chưa có ai giữ vai được dùng nick."
                            : undefined
                      }
                    >
                      Sửa
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {nickDangMo ? (
        <HopThoaiGiao
          key={nickDangMo.zcrmAccountId}
          nick={nickDangMo}
          nguoi={nickDangMo.centerId ? (nguoiTheoCoSo[nickDangMo.centerId] ?? []) : []}
          dong={() => datDangMo(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Câu tóm tắt trên dòng bảng.
 *
 * 🔴 Rỗng ra "Cả cơ sở dùng chung", KHÔNG phải "chưa giao" hay một ô trống: đó là SỰ
 * THẬT về hành vi, còn hai cách nói kia đọc như một việc còn bỏ dở và người vận hành sẽ
 * đi "sửa" một thứ đang đúng.
 */
function TomTat({ giao }: { giao: DongNickZalo["giao"] }) {
  if (giao.length === 0) {
    return <span className="text-muted-foreground">Cả cơ sở dùng chung</span>;
  }
  const day = giao.map((g) => `${g.ten} — ${NHAN_MUC[docMucQuyen(g.mucQuyen)]}`).join(", ");
  return (
    // `title` để đọc được đủ khi bị cắt: dòng 44px + `whitespace-nowrap` nghĩa là ba
    // người trở lên chắc chắn tràn, và một câu bị cắt không dấu hiệu là một câu nói dối.
    <span className="block max-w-[320px] truncate" title={day}>
      {giao.map((g, i) => (
        <span key={g.sataUserId}>
          {i > 0 ? ", " : ""}
          {g.ten}
          <span className="text-muted-foreground"> — {NHAN_MUC[docMucQuyen(g.mucQuyen)]}</span>
        </span>
      ))}
    </span>
  );
}

function HopThoaiGiao({
  nick,
  nguoi,
  dong,
}: {
  nick: DongNickZalo;
  nguoi: NguoiNhan[];
  dong: () => void;
}) {
  const [dangCho, batDau] = useTransition();
  const quanLy = nguoi.filter((n) => n.laQuanLy);
  const thuong = nguoi.filter((n) => !n.laQuanLy);

  // Trạng thái ban đầu = đúng thứ đang lưu. Người không có dòng giao ⇒ `KHONG_GIAO`.
  const [chon, datChon] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const n of thuong) m[n.id] = KHONG_GIAO;
    for (const g of nick.giao) {
      if (g.sataUserId in m) m[g.sataUserId] = docMucQuyen(g.mucQuyen);
    }
    return m;
  });

  const soChon = thuong.filter((n) => chon[n.id] !== KHONG_GIAO).length;

  function luu() {
    const giao = thuong
      .filter((n) => chon[n.id] !== KHONG_GIAO)
      .map((n) => ({ sataUserId: n.id, mucQuyen: chon[n.id] as MucQuyen }));
    batDau(async () => {
      const kq = await giaoNickAction({ zcrmAccountId: nick.zcrmAccountId, giao });
      if (kq.ok) {
        toast.success(
          giao.length === 0
            ? "Đã gỡ hết — cả cơ sở lại dùng chung nick này."
            : `Đã giao cho ${giao.length} người. Có hiệu lực trong vòng 5 phút.`,
        );
        dong();
      } else {
        // KHÔNG đóng hộp thoại khi lỗi: đóng là xoá mất thứ người dùng vừa chọn, và họ
        // phải dựng lại từ đầu để thử tiếp.
        toast.error(kq.error ?? "Không lưu được");
      }
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(mo) => {
        if (!mo && !dangCho) dong();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Giao nick {nick.displayName ?? nick.zcrmAccountId}</DialogTitle>
          <DialogDescription>
            {nick.centerName ? `Cơ sở ${nick.centerName}. ` : ""}
            Chọn mức cho từng người. Ai để <strong>Không giao</strong> sẽ bị gỡ khỏi nick
            này.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {thuong.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{n.ten}</div>
                {n.email ? (
                  <div className="truncate text-xs text-muted-foreground">{n.email}</div>
                ) : null}
              </div>
              <Select
                value={chon[n.id] ?? KHONG_GIAO}
                disabled={dangCho}
                onValueChange={(v) =>
                  datChon((c) => ({ ...c, [n.id]: (v as string) ?? KHONG_GIAO }))
                }
              >
                <SelectTrigger className="w-[190px] shrink-0" aria-label={`Mức của ${n.ten}`}>
                  {/* CON của `SelectValue` — chặn đường rơi về giá trị thô. */}
                  <SelectValue>
                    {chon[n.id] && chon[n.id] !== KHONG_GIAO
                      ? NHAN_MUC[docMucQuyen(chon[n.id])]
                      : "Không giao"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KHONG_GIAO}>Không giao</SelectItem>
                  {MUC_QUYEN.map((m) => (
                    <SelectItem key={m} value={m}>
                      {NHAN_MUC[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {/* Quản lý cơ sở: HIỆN nhưng KHÔNG cho sửa. Giấu hẳn thì người dùng tưởng họ
            không có quyền; cho một ô chọn thì hứa một việc không làm được — bấm gỡ xong
            họ vẫn thấy nick, vì `admin` của quản lý là tự động (`pham-vi-nick.ts`). */}
        {quanLy.length > 0 ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <strong className="font-medium text-foreground">
              {quanLy.map((n) => n.ten).join(", ")}
            </strong>{" "}
            đang quản lý cơ sở này nên luôn có quyền {NHAN_MUC.admin.toLowerCase()} —
            không gỡ ở đây được.
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {soChon === 0
            ? "Chưa giao cho ai ⇒ cả cơ sở dùng chung nick này."
            : `Giao cho ${soChon} người ⇒ chỉ họ (và quản lý cơ sở) thấy nick này.`}
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={dong} disabled={dangCho}>
            Huỷ
          </Button>
          <Button type="button" onClick={luu} disabled={dangCho}>
            {dangCho ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
