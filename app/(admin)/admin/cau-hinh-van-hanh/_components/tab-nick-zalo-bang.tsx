"use client";

// Bảng giao nick Zalo.
//
// ── 🔴 LỖI ĐÃ SỬA: giá trị nội bộ rò ra ô chọn ────────────────────────────────────────
// Bản 24/09 dùng `<Select value={CHUA_GIAO}>` với `CHUA_GIAO = "__chua-giao__"`, và ô
// hiện đúng chuỗi ấy cho người dùng đọc. Nguyên nhân: `SelectValue` render GIÁ TRỊ khi
// không khớp được nhãn của một `SelectItem`.
//
// Cách sửa KHÔNG phải là đổi chuỗi sentinel cho đẹp hơn — chuỗi nào cũng sai, vì đó là
// mã nội bộ. Ở đây dùng `<SelectValue>` có CON để tự render nhãn: nhãn luôn do ta quyết,
// không bao giờ rơi về giá trị thô. Khoá bằng ca `[NZ-01]`.
//
// ── Mật độ và màu theo DESIGN.md ──────────────────────────────────────────────────────
// `adminTh`/`adminTd`/`adminTr` cho dòng 44px và `whitespace-nowrap` trên CẢ `th` lẫn
// `td` — đó là thứ duy nhất chặn chiều cao dòng nhảy loạn với tên tiếng Việt dài.
// Trạng thái đi qua `StatusPill` (thang ngữ nghĩa riêng, KHÔNG mượn màu thương hiệu).
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill, type PillTone } from "@/components/admin/ui/status-pill";
import { adminTd, adminTh, adminTr } from "@/components/admin/ui/table";
import { giaoNickAction } from "../actions";

/** Mã nội bộ cho "chưa giao". KHÔNG BAO GIỜ được hiện ra màn hình — xem khối trên. */
const CHUA_GIAO = "__chua-giao__";

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
  sataUserId: string | null;
  sataUserName: string | null;
};

export type NguoiNhan = { id: string; ten: string; email: string | null };

export function BangNickZalo({
  rows,
  nguoiTheoCoSo,
}: {
  rows: DongNickZalo[];
  nguoiTheoCoSo: Record<string, NguoiNhan[]>;
}) {
  const [dangCho, batDau] = useTransition();
  // Giữ lựa chọn tại chỗ: `revalidatePath` không reset ô của form client, nên nếu không
  // tự quản thì ô "nhảy" về giá trị cũ trong lúc chờ server rồi nhảy lại — trông như lỗi.
  const [tamThoi, datTamThoi] = useState<Record<string, string>>({});

  function doi(nick: DongNickZalo, giaTri: string) {
    const cu = tamThoi[nick.zcrmAccountId] ?? nick.sataUserId ?? CHUA_GIAO;
    datTamThoi((t) => ({ ...t, [nick.zcrmAccountId]: giaTri }));
    batDau(async () => {
      const kq = await giaoNickAction({
        zcrmAccountId: nick.zcrmAccountId,
        sataUserId: giaTri === CHUA_GIAO ? null : giaTri,
      });
      if (kq.ok) {
        toast.success(
          giaTri === CHUA_GIAO
            ? "Đã gỡ giao — cả cơ sở lại thấy nick này."
            : "Đã giao nick. Người được giao thấy trong vòng 5 phút.",
        );
      } else {
        // Trả ô về giá trị CŨ: giữ lựa chọn vừa bấm là nói dối người dùng rằng đã lưu.
        datTamThoi((t) => ({ ...t, [nick.zcrmAccountId]: cu }));
        toast.error(kq.error ?? "Không giao được");
      }
    });
  }

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
              <th className={`${adminTh} w-[300px]`}>Giao cho</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nguoi = r.centerId ? (nguoiTheoCoSo[r.centerId] ?? []) : [];
              const giaTri = tamThoi[r.zcrmAccountId] ?? r.sataUserId ?? CHUA_GIAO;
              const khoa = !r.centerId || nguoi.length === 0;
              const tt = NHAN_TRANG_THAI[r.status] ?? NHAN_TRANG_THAI.UNKNOWN!;
              // Nhãn hiện trong ô — luôn do ta quyết, không để rơi về giá trị thô.
              const nhanDangChon =
                giaTri === CHUA_GIAO
                  ? "Chưa giao"
                  : (nguoi.find((n) => n.id === giaTri)?.ten ?? r.sataUserName ?? "Chưa giao");

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
                  <td className={`${adminTd} whitespace-normal`}>
                    <Select
                      value={giaTri}
                      disabled={khoa || dangCho}
                      onValueChange={(v) => doi(r, v ?? CHUA_GIAO)}
                    >
                      <SelectTrigger aria-label={`Giao nick ${r.displayName ?? r.zcrmAccountId}`}>
                        {/* CON của `SelectValue` — chặn đường rơi về giá trị thô. */}
                        <SelectValue>{nhanDangChon}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CHUA_GIAO}>Chưa giao — cả cơ sở đều thấy</SelectItem>
                        {nguoi.map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.ten}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {khoa && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {r.centerId
                          ? "Cơ sở này chưa có ai giữ vai được dùng nick."
                          : "Nick chưa gắn cơ sở nên chưa giao được."}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
