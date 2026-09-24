"use client";

// Bảng giao nick. Mỗi dòng một nick, một ô chọn người.
//
// KHÔNG có nút "Lưu": chọn xong là gửi luôn. Một nút lưu ở đây chỉ thêm một bước để quên
// — và thứ quên được thì sẽ có người quên, rồi tưởng đã giao mà thật ra chưa.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { giaoNickAction } from "./_actions";

/** Giá trị của mục "chưa giao". Chuỗi rỗng KHÔNG dùng được: Radix Select cấm `value=""`. */
const CHUA_GIAO = "__chua-giao__";

export type DongBang = {
  zcrmAccountId: string;
  displayName: string | null;
  status: string;
  centerId: string | null;
  centerName: string | null;
  sataUserId: string | null;
  sataUserName: string | null;
};

export type NguoiNhan = { id: string; ten: string; email: string | null };

export function BangGiaoNick({
  rows,
  nguoiTheoCoSo,
}: {
  rows: DongBang[];
  nguoiTheoCoSo: Record<string, NguoiNhan[]>;
}) {
  const [dangCho, batDau] = useTransition();
  // Giữ lựa chọn tại chỗ để ô không "nhảy về" giá trị cũ trong lúc chờ server —
  // `router.refresh()` không reset ô nhập của form client, nên phải tự quản.
  const [tamThoi, datTamThoi] = useState<Record<string, string>>({});

  function doi(nick: DongBang, giaTri: string) {
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

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Chưa có nick Zalo nào trong phạm vi của bạn. Nick xuất hiện ở đây sau khi được quét mã QR
        trong Zalo CRM và có tin nhắn đầu tiên.
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nick</TableHead>
            <TableHead>Cơ sở</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="w-[280px]">Giao cho</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const nguoi = r.centerId ? (nguoiTheoCoSo[r.centerId] ?? []) : [];
            const giaTri = tamThoi[r.zcrmAccountId] ?? r.sataUserId ?? CHUA_GIAO;
            // Nick chưa gắn cơ sở thì KHÔNG có danh sách người hợp lệ để chọn. Khoá ô và
            // nói lý do, thay vì đưa một ô rỗng bấm được rồi báo lỗi sau.
            const khoa = !r.centerId || nguoi.length === 0;
            return (
              <TableRow key={r.zcrmAccountId}>
                <TableCell className="font-medium">{r.displayName ?? "(chưa có tên)"}</TableCell>
                <TableCell>{r.centerName ?? "— chưa gắn cơ sở"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.status}</TableCell>
                <TableCell>
                  <Select
                    value={giaTri}
                    disabled={khoa || dangCho}
                    // `onValueChange` của ô này trả `string | null` (bỏ chọn = `null`).
                    // Coi `null` như "chưa giao" thay vì ép kiểu: bỏ chọn và chọn "Chưa
                    // giao" là cùng một ý định của người dùng.
                    onValueChange={(v) => doi(r, v ?? CHUA_GIAO)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chưa giao" />
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.centerId
                        ? "Cơ sở này chưa có ai giữ vai được dùng nick."
                        : "Nick chưa gắn cơ sở nên chưa giao được."}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
