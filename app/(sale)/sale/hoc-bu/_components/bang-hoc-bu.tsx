"use client";

/**
 * Bảng hàng chờ học bù của site Sale — bản đôi GIAO DIỆN của
 * `app/(admin)/admin/hoc-bu/_components/makeup-row.tsx` (chốt tách bản 04/09/2026).
 *
 * ── Giữ nguyên 100% ─────────────────────────────────────────────────────────
 * Đúng bốn nhãn trạng thái, đúng ba thao tác với đúng từng chữ ("Gợi ý buổi bù",
 * "Đánh dấu đã bù", "Huỷ"), đúng điều kiện hiện từng nút (gợi ý chỉ khi
 * `PENDING`, đánh dấu chỉ khi `SCHEDULED`, huỷ ở cả hai), đúng câu cảnh báo hậu
 * quả trong hộp thoại huỷ, đúng câu "Chưa tìm được buổi bù phù hợp…", đúng nhãn
 * "Cơ sở khác" và đuôi "· còn N chỗ", đúng mọi thông báo.
 *
 * ── Chỉ CÁCH BÀY đổi ────────────────────────────────────────────────────────
 *   1. Danh sách thẻ `<ul>/<li>` → bảng `.bang-sale`. Mỗi dòng ở đây là 5 dữ
 *      kiện có cùng cấu trúc; thẻ rời làm mắt phải đọc lại nhãn "Buổi lỡ:" trên
 *      từng dòng thay vì đọc một lần ở đầu cột.
 *   2. Phân trang `<PhanTrangBang>` — bản admin đổ thẳng 200 dòng ra một trang.
 *   3. Nhãn trạng thái qua `<StatusPill tone={toneTrangThaiHocBu(...)}>`.
 *
 * ⚠️ MỘT MỤC = MỘT `<Fragment>` CHỨA HAI `<tr>` (dòng dữ liệu + dòng gợi ý mở
 *    ra), và điều đó KHÔNG PHẢI ngẫu nhiên. `PhanTrangBang` cắt trang bằng
 *    `Children.toArray(tbody.props.children).slice(...)`, mà `Children.toArray`
 *    KHÔNG duỗi Fragment — nó đếm mỗi Fragment là MỘT phần tử. Nhờ vậy một mục
 *    luôn nằm trọn trong một trang. Trả hai `<tr>` phẳng cạnh nhau thì bộ đếm
 *    thấy 2N dòng và có thể cắt dòng gợi ý sang trang sau, tách khỏi dòng đẻ ra nó.
 *    Đã kiểm bằng tay hành vi này của React trước khi chọn cách bày.
 *
 * ⚠️ MỌI ĐƯỜNG GHI GỌI ĐÚNG SERVER ACTION CỦA KHU QUẢN TRỊ — cả bốn tự kiểm
 *    `parent-requests:manage` + cách ly cơ sở (`makeupNeedInScope`). Chép logic
 *    xếp/huỷ sang đây là nhân đôi một đường GHI đụng vào lịch học thật.
 *
 * ⚠️ `router.refresh()` sau mỗi lần ghi là BẮT BUỘC: bốn action gọi
 *    `revalidatePath("/hoc-bu")` (+ `/attendance`, `/portal/yeu-cau`) — toàn
 *    đường KHÔNG phải của site Sale. Thiếu nó thì bấm xong màn đứng im.
 *
 * ⚠️ Ngày của GỢI Ý định dạng ở CLIENT, khác với ngày của dòng (định dạng ở máy
 *    chủ). Không phải bỏ sót: gợi ý chỉ tồn tại SAU khi người dùng bấm, tức sau
 *    hydration — không có lần vẽ nào của máy chủ để lệch với nó.
 *
 * ⚠️ MỖI LÚC CHỈ MỘT MỤC MỞ GỢI Ý — khác bản admin, nơi mỗi thẻ giữ state riêng
 *    nên mở được nhiều mục cùng lúc. Trong một BẢNG thì nhiều dòng bung ra cùng
 *    lúc đẩy các dòng còn lại đi xa nhau và phá luôn nhịp 44px của `.bang-sale`.
 *    Đây là đổi CÁCH BÀY, không đổi dữ liệu: bấm "Gợi ý buổi bù" ở mục khác vẫn
 *    ra đúng danh sách của mục đó.
 */
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2, SearchX, X } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { formatDateVN } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import type { DongHocBu } from "@/lib/sale/du-lieu-hoc-bu";
import {
  nhanTrangThaiHocBu,
  toneTrangThaiHocBu,
} from "@/lib/sale/trang-thai-hoc-bu";
import {
  cancelMakeupAction,
  completeMakeupAction,
  getMakeupSuggestions,
  scheduleMakeupAction,
} from "@/app/(admin)/admin/hoc-bu/_actions";

type GoiY = {
  sessionId: string;
  className: string;
  date: string;
  lessonOrder: number | null;
  lessonTitle: string | null;
  // R7-08 — ưu tiên cơ sở nhà + còn chỗ.
  isHomeCenter?: boolean;
  capacityLeft?: number;
};

const NUT = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold",
  "transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50",
);

export function BangHocBu({ dong }: { dong: DongHocBu[] }) {
  const router = useRouter();
  const [dang, start] = useTransition();
  // Gợi ý của MỘT mục đang mở. `null` = chưa bấm; `[]` = đã bấm và không có gì —
  // hai trạng thái khác nhau, và bản admin phân biệt đúng như vậy (QA 20/07:
  // người dùng từng tưởng nút hỏng vì "bấm không thấy gì").
  const [goiY, setGoiY] = useState<{ id: string; ds: GoiY[] } | null>(null);
  const [dichHuy, setDichHuy] = useState<DongHocBu | null>(null);

  function xinGoiY(item: DongHocBu) {
    start(async () => {
      const res = await getMakeupSuggestions(item.id);
      setGoiY({ id: item.id, ds: res });
    });
  }

  function xepBu(makeupNeedId: string, sessionId: string) {
    start(async () => {
      const res = await scheduleMakeupAction(makeupNeedId, sessionId);
      if (res.ok) {
        toast.success("Đã xếp buổi bù");
        // T4.1 — buổi đích đang trùng phòng/GV với lớp khác → báo để theo dõi.
        if (res.warning) toast.warning(res.warning);
        setGoiY(null);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function danhDauDaBu(makeupNeedId: string) {
    start(async () => {
      const res = await completeMakeupAction(makeupNeedId);
      if (res.ok) {
        toast.success("Đã hoàn tất bù — số buổi cập nhật");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  // QA 20/07 — Huỷ là hành động phá huỷ (mất yêu cầu bù, không có undo) → bắt buộc
  // xác nhận qua hộp thoại thay vì huỷ ngay một nhịp.
  function huy() {
    const dich = dichHuy;
    if (!dich) return;
    start(async () => {
      const res = await cancelMakeupAction(dich.id);
      if (!res.ok) {
        toast.error(res.error ?? "Không huỷ được yêu cầu bù");
        setDichHuy(null);
        return;
      }
      toast.success("Đã huỷ nhu cầu bù");
      setDichHuy(null);
      router.refresh();
    });
  }

  return (
    <>
      <PhanTrangBang
        cuonNgang
        tenDonVi="yêu cầu"
        khoaGhiNho="sale-hoc-bu"
        // Chỉ THANH PHÂN TRANG được đệm ngang, KHÔNG phải vùng cuộn — xem ghi chú
        // dài ở `lop-hoc/_components/bang-lop-hoc.tsx`.
        className="[&>div:nth-child(2)]:px-5 [&>div:nth-child(2)]:pb-3"
      >
        <table className="bang-sale">
          <thead>
            <tr>
              <th scope="col">Học viên</th>
              <th scope="col">Buổi lỡ</th>
              <th scope="col">Buổi bù</th>
              <th scope="col">Trạng thái</th>
              <th scope="col" className="o-so">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody>
            {dong.map((item) => {
              const dangMo = goiY?.id === item.id;
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td>
                      <div className="font-medium text-foreground">{item.tenHocVien}</div>
                      <div className="text-xs text-muted-foreground">{item.tenLop}</div>
                    </td>

                    <td className="o-dai">
                      <div className="tabular-nums text-foreground">{item.ngayLo}</div>
                      {item.baiLo && (
                        <div className="text-xs text-muted-foreground">{item.baiLo}</div>
                      )}
                    </td>

                    <td className="tabular-nums">
                      {item.ngayBu ?? <span className="text-muted-foreground">—</span>}
                    </td>

                    <td>
                      <StatusPill tone={toneTrangThaiHocBu(item.status)}>
                        {nhanTrangThaiHocBu(item.status)}
                      </StatusPill>
                    </td>

                    <td className="o-so">
                      <div className="flex items-center justify-end gap-2">
                        {item.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() => xinGoiY(item)}
                            disabled={dang}
                            aria-expanded={dangMo}
                            className={cn(
                              NUT,
                              "border-[color:var(--primary)]/35 text-[color:var(--primary-ink)]",
                              "hover:bg-[color:var(--primary-soft)]",
                              "focus-visible:ring-[color:var(--primary)]/40",
                            )}
                          >
                            <CalendarPlus aria-hidden="true" className="size-4" />
                            Gợi ý buổi bù
                          </button>
                        )}
                        {item.status === "SCHEDULED" && (
                          <button
                            type="button"
                            onClick={() => danhDauDaBu(item.id)}
                            disabled={dang}
                            className={cn(
                              NUT,
                              "border-[color:var(--state-success-soft)] bg-[color:var(--state-success-soft)]",
                              "text-[color:var(--state-success-ink)]",
                              "hover:text-[color:var(--state-success-ink-hover)]",
                              "focus-visible:ring-[color:var(--state-success)]/40",
                            )}
                          >
                            <CheckCircle2 aria-hidden="true" className="size-4" />
                            Đánh dấu đã bù
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDichHuy(item)}
                          disabled={dang}
                          className={cn(
                            NUT,
                            "border-[color:var(--state-danger-soft)] text-[color:var(--state-danger-ink)]",
                            "hover:bg-[color:var(--state-danger-soft)]",
                            "focus-visible:ring-[color:var(--state-danger)]/40",
                          )}
                        >
                          <X aria-hidden="true" className="size-4" />
                          Huỷ
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Dòng gợi ý — chỉ tồn tại sau khi bấm, và chỉ cho mục PENDING. */}
                  {dangMo && item.status === "PENDING" && (
                    <tr>
                      <td colSpan={5} className="!whitespace-normal bg-[color:var(--surface-chim)]">
                        {goiY.ds.length === 0 ? (
                          <div className="flex items-center gap-2 text-sm text-state-warning-ink">
                            <SearchX aria-hidden="true" className="size-4 shrink-0" />
                            Chưa tìm được buổi bù phù hợp (cần cùng khoá/bài học, chưa vượt
                            tiến độ, còn chỗ). Thử lại sau khi có lịch buổi mới.
                          </div>
                        ) : (
                          <ul className="space-y-1">
                            {goiY.ds.map((s) => (
                              <li key={s.sessionId}>
                                <button
                                  type="button"
                                  onClick={() => xepBu(item.id, s.sessionId)}
                                  disabled={dang}
                                  className={cn(
                                    "flex w-full items-center justify-between gap-3 rounded-lg",
                                    "border border-border bg-card px-3 py-2 text-left text-sm",
                                    "transition-colors hover:border-[color:var(--primary)]/40",
                                    "focus-visible:outline-none focus-visible:ring-2",
                                    "focus-visible:ring-[color:var(--primary)]/40",
                                    "disabled:opacity-50",
                                  )}
                                >
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate text-foreground">
                                      {s.className}
                                      {s.lessonTitle
                                        ? ` · Bài ${s.lessonOrder}: ${s.lessonTitle}`
                                        : ""}
                                    </span>
                                    {s.isHomeCenter === false && (
                                      <StatusPill
                                        tone="info"
                                        className="px-1.5 py-0 text-[10px]"
                                      >
                                        Cơ sở khác
                                      </StatusPill>
                                    )}
                                  </span>
                                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {formatDateVN(s.date)}
                                    {typeof s.capacityLeft === "number"
                                      ? ` · còn ${s.capacityLeft} chỗ`
                                      : ""}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </PhanTrangBang>

      <ConfirmDialog
        open={dichHuy !== null}
        onOpenChange={(o) => {
          if (!o) setDichHuy(null);
        }}
        pending={dang}
        title={dichHuy ? `Huỷ yêu cầu học bù của ${dichHuy.tenHocVien}?` : ""}
        description={
          dichHuy ? (
            <>
              Yêu cầu bù cho buổi lỡ
              {dichHuy.ngayLo !== "—" ? ` ngày ${dichHuy.ngayLo}` : ""} (lớp{" "}
              <strong>{dichHuy.tenLop}</strong>) sẽ bị huỷ. Không có danh sách đã huỷ và
              không hoàn tác được — nếu cần bù lại phải tạo yêu cầu mới từ điểm danh.
            </>
          ) : undefined
        }
        confirmLabel="Huỷ yêu cầu bù"
        onConfirm={huy}
      />
    </>
  );
}
