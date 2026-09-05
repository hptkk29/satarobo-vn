"use client";

/**
 * Site Sale — thanh công cụ + bảng của màn "Tài khoản phụ huynh".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/students/tai-khoan/_components/parent-accounts-client.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Ba hành động vẫn gọi ĐÚNG Server Action của khu quản
 *    trị — nơi có `checkPermission('students:edit')`, có `loadPendingParent()`
 *    lọc theo `actor.visibleCenterIds` (chống thao tác chéo cơ sở), có ghi
 *    `writeAudit`, và có luật "đã kích hoạt thì không thao tác". Nhân bản LOGIC
 *    gửi là cách chắc chắn nhất để hai khu có hai luật gửi tin khác nhau; nhân
 *    bản CÁI NÚT thì tệ nhất chỉ là hai cái nút trông khác nhau.
 *
 * ⚠️ PHẢI `router.refresh()` SAU MỖI HÀNH ĐỘNG. Server Action bên admin gọi
 *    `revalidatePath('/students/tai-khoan')` — một đường của KHU QUẢN TRỊ, không
 *    phải `/sale/tai-khoan-ph`. Thiếu `refresh()` thì cột "ZNS báo cấp TK" đứng
 *    im sau khi gửi và người vận hành bấm gửi lần thứ hai cho cùng một phụ huynh.
 *
 * GIỮ NGUYÊN 100%: sáu cột đúng thứ tự đúng nhãn (Phụ huynh · Học viên · Cơ sở ·
 * Trạng thái · ZNS báo cấp TK · Hành động), ô tìm, đếm "N tài khoản", hai nút
 * "Xuất CSV" / "Gửi ZNS tất cả chưa nhận", ba nút trên dòng, và mọi câu toast.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bảng gõ class từng ô → `.bang-sale` của `sale.css` (dòng 44px, `nowrap` cả
 *    `th` lẫn `td` — thứ duy nhất chặn chiều cao dòng nhảy loạn).
 * 2. Sáu chuỗi `bg-state-*-soft text-state-*-ink` gõ tay → `<StatusPill>` theo
 *    thang ngữ nghĩa. `lib/sale/ky-luat-mau.test.ts` canh đúng chỗ này.
 * 3. Thanh công cụ vào tầng `KhungDuLieu.Loc` (nền chìm) — mắt đọc ra "công cụ"
 *    chứ không phải "dữ liệu", thay vì trôi trên nền trang như bản admin.
 * 4. Cột "Hành động" là ba nút cùng cỡ `h-8`, không còn ba kích thước khác nhau.
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { cn } from "@/lib/utils";
import {
  resendActivationOtpByUser,
  sendAccountZns,
  sendAccountZnsBulk,
} from "@/app/(admin)/admin/students/tai-khoan/_actions";
import type { DongTaiKhoanPh, TinhTrangZns } from "@/lib/sale/tai-khoan-ph";

/**
 * ⚠️ NỢ ĐÃ BIẾT — HỒ SƠ HỌC VIÊN CHƯA CÓ TRÊN HOST SALE.
 *
 * Bản admin trỏ `/students/{id}/edit` (chip học viên + nút "Cấp mã tại quầy").
 * Đó là clean URL của host quản trị; trên `sale.satarobo.vn` luật cuối của nhánh
 * Sale là `rewrite "/sale" + pathname` ⇒ `/sale/students/{id}/edit` → **404**.
 * `/sale/hoc-vien` có danh sách nhưng KHÔNG có màn hồ sơ, nên trỏ sang đó là đổi
 * một liên kết 404 lấy một liên kết SAI ĐÍCH — tệ hơn, vì người dùng không biết
 * mình vừa đi lạc. Giữ nguyên đường cũ là không tạo hồi quy (bản mount trước đợt
 * này hỏng y hệt), KHÔNG phải là đúng. Vá thật = dựng `/sale/hoc-vien/[id]`, đó
 * là việc THÊM MÀN và đã báo lại cho chủ dự án.
 */
const duongHoSoHocVien = (id: string) => `/students/${id}/edit`;

const NUT_PHU =
  "inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs font-medium " +
  "text-foreground transition-colors hover:bg-[color:var(--surface-chim)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30 " +
  "disabled:opacity-50";

export function BangTaiKhoanPh({
  dong,
  daCauHinhZns,
}: {
  dong: DongTaiKhoanPh[];
  daCauHinhZns: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dangChay, setDangChay] = useState<string | null>(null);
  const [tim, setTim] = useState("");

  const loc = useMemo(() => {
    const q = tim.trim().toLowerCase();
    if (!q) return dong;
    // ⚠️ `d.sdt` có thể ĐÃ CHE (xem `lib/sale/tai-khoan-ph.ts`). Tìm trên chuỗi đã
    // che thì không khớp — đó là hành vi ĐÚNG: cho dò theo số mà không cho xem số
    // vẫn là một cách moi số ra (nợ "search-oracle", đã ghi ở `dang-ky-hoc.ts`).
    return dong.filter(
      (d) =>
        (d.ten ?? "").toLowerCase().includes(q) ||
        (d.sdt ?? "").includes(q) ||
        d.hocVien.some((s) => s.ten.toLowerCase().includes(q)),
    );
  }, [dong, tim]);

  function guiLaiOtp(id: string) {
    setDangChay(id);
    start(async () => {
      const res = await resendActivationOtpByUser(id);
      if (res.ok && res.warning) toast.warning(res.warning, { duration: 9000 });
      else if (res.ok) toast.success("Đã gửi mã kích hoạt mới");
      else toast.error(res.error ?? "Không gửi được");
      setDangChay(null);
      router.refresh();
    });
  }

  function guiZns(id: string) {
    setDangChay(id);
    start(async () => {
      const res = await sendAccountZns(id);
      if (res.ok) {
        toast.success(
          res.simulated
            ? "ZNS ghi nhận ở chế độ MÔ PHỎNG (ZALO_LIVE chưa bật) — tin KHÔNG thực sự rời hệ thống"
            : "Đã gửi ZNS báo cấp tài khoản",
        );
      } else toast.error(res.error ?? "Gửi ZNS thất bại");
      setDangChay(null);
      router.refresh();
    });
  }

  function guiHangLoat() {
    start(async () => {
      const res = await sendAccountZnsBulk();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // "còn lại" (vượt cap 100/lượt) tách khỏi "đã nhận trước đó" — gộp chung làm
      // người vận hành tưởng đã phủ hết, không bấm gửi tiếp.
      toast[res.failed > 0 || res.remaining > 0 ? "warning" : "success"](
        `ZNS hàng loạt: ${res.sent} gửi · ${res.failed} lỗi · ${res.skipped} đã nhận trước đó${
          res.remaining > 0 ? ` · CÒN ${res.remaining} CHƯA GỬI — bấm lại để gửi tiếp` : ""
        }${res.simulated ? " — CHẾ ĐỘ MÔ PHỎNG (ZALO_LIVE chưa bật)" : ""}`,
        { duration: 12000 },
      );
      router.refresh();
    });
  }

  function xuatCsv() {
    const dau = "Ten phu huynh,SDT,Email,Co so,Trang thai,Ngay tao,Hoc vien";
    const dongCsv = loc.map((d) =>
      [
        oCsv(d.ten ?? ""),
        oCsv(d.sdt ?? ""),
        oCsv(d.email ?? ""),
        oCsv(d.coSo),
        d.trangThai === "PENDING_ACTIVATION" ? "Cho kich hoat" : d.trangThai,
        d.ngayTao,
        oCsv(d.hocVien.map((s) => `${s.ten}${s.ma ? ` (${s.ma})` : ""}`).join(" | ")),
      ].join(","),
    );
    const blob = new Blob(["﻿" + [dau, ...dongCsv].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tai-khoan-phu-huynh-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <KhungDuLieu.Loc>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={tim}
            onChange={(e) => setTim(e.target.value)}
            aria-label="Tìm tài khoản phụ huynh"
            placeholder="Tìm theo tên PH / SĐT / tên học viên…"
            className={cn(
              "h-9 w-72 rounded-lg border border-border bg-card px-3 text-sm",
              "placeholder:text-muted-foreground",
              "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
            )}
          />
          <span className="text-sm text-muted-foreground">{loc.length} tài khoản</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={xuatCsv} className={cn(NUT_PHU, "h-9 px-3 text-sm")}>
              Xuất CSV
            </button>
            <button
              type="button"
              onClick={guiHangLoat}
              disabled={!daCauHinhZns || pending}
              title={
                daCauHinhZns
                  ? "Gửi ZNS báo cấp TK cho mọi tài khoản chờ kích hoạt CHƯA từng nhận (tối đa 100/lượt)"
                  : "Chưa cấu hình mẫu ZNS (chờ 616899 duyệt)"
              }
              className={cn(
                "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
                "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
              )}
            >
              Gửi ZNS tất cả chưa nhận
            </button>
          </div>
        </div>
      </KhungDuLieu.Loc>

      {loc.length === 0 ? (
        <KhungDuLieu.Rong
          ten="Không có tài khoản nào."
          mo={
            tim.trim()
              ? "Không tài khoản nào khớp từ khoá đang tìm."
              : "Tài khoản phụ huynh sinh ra từ đường chuyển đổi lead, chốt hàng loạt và đơn hàng."
          }
        />
      ) : (
        <PhanTrangBang tenDonVi="tài khoản" khoaGhiNho="sale-tai-khoan-ph" cuonNgang>
          <table className="bang-sale">
            <thead>
              <tr>
                <th scope="col">Phụ huynh</th>
                <th scope="col">Học viên</th>
                <th scope="col">Cơ sở</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">ZNS báo cấp TK</th>
                <th scope="col">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loc.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="block font-medium text-foreground">
                      {d.ten ?? "(chưa có tên)"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      <span className="tabular-nums">{d.sdt ?? "không SĐT"}</span>
                      {d.email ? ` · ${d.email}` : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground">Tạo: {d.ngayTao}</span>
                  </td>

                  <td>
                    {d.hocVien.length === 0 ? (
                      <StatusPill tone="warning">Chưa gắn học viên</StatusPill>
                    ) : (
                      <span className="inline-flex flex-wrap gap-1">
                        {d.hocVien.map((s) => (
                          <Link
                            key={s.id}
                            href={duongHoSoHocVien(s.id)}
                            className={cn(
                              "inline-flex rounded-full bg-[color:var(--surface-chim)] px-2 py-0.5",
                              "text-xs text-foreground transition-colors hover:bg-muted",
                            )}
                          >
                            {s.ten}
                            {s.ma ? ` · ${s.ma}` : ""}
                          </Link>
                        ))}
                      </span>
                    )}
                  </td>

                  <td className="text-xs text-muted-foreground">{d.coSo}</td>

                  <td>
                    {d.trangThai === "PENDING_ACTIVATION" ? (
                      <StatusPill tone="warning">Chờ kích hoạt</StatusPill>
                    ) : (
                      <StatusPill tone="success">Đã kích hoạt</StatusPill>
                    )}
                  </td>

                  <td>
                    <NhanZns zns={d.zns} daCauHinh={daCauHinhZns} />
                  </td>

                  <td>
                    {d.trangThai === "PENDING_ACTIVATION" ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {/* Khoá TẤT CẢ nút khi đang có transition (không chỉ dòng
                            đang chạy): `dangChay` reset sớm hơn transition → bấm
                            dòng khác lúc đang gửi sẽ bắn trùng OTP/ZNS cho phụ
                            huynh (review 02/08 bên admin). */}
                        <button
                          type="button"
                          onClick={() => guiLaiOtp(d.id)}
                          disabled={pending}
                          className={NUT_PHU}
                        >
                          {pending && dangChay === d.id ? "Đang gửi…" : "Gửi lại OTP"}
                        </button>
                        <button
                          type="button"
                          onClick={() => guiZns(d.id)}
                          disabled={!daCauHinhZns || !d.guiZnsDuoc || pending}
                          title={
                            daCauHinhZns ? undefined : "Chưa cấu hình mẫu ZNS (chờ 616899 duyệt)"
                          }
                          className={NUT_PHU}
                        >
                          Gửi ZNS báo cấp TK
                        </button>
                        {d.hocVien[0] ? (
                          <Link
                            href={duongHoSoHocVien(d.hocVien[0].id)}
                            title="Cấp mã kích hoạt đọc qua điện thoại (khi ZNS không tới được)"
                            className={NUT_PHU}
                          >
                            Cấp mã tại quầy
                          </Link>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PhanTrangBang>
      )}
    </>
  );
}

/**
 * Nhãn cột "ZNS báo cấp TK". Bốn trạng thái, bốn nghĩa khác nhau — đây đúng là
 * chỗ màu ngữ nghĩa CÓ nghĩa, nên nó được tô; còn "Chưa gửi" và "Mẫu chưa cấu
 * hình" là chữ thường, không phải một nhãn màu (không có gì để cảnh báo).
 */
function NhanZns({ zns, daCauHinh }: { zns: TinhTrangZns; daCauHinh: boolean }) {
  if (!daCauHinh) return <span className="text-xs text-muted-foreground">Mẫu chưa cấu hình</span>;
  if (!zns) return <span className="text-xs text-muted-foreground">Chưa gửi</span>;
  if (zns.trangThai === "SENT" && zns.moPhong) {
    return (
      <StatusPill tone="info" className="font-medium">
        <span title={zns.luc}>Mô phỏng (chưa live)</span>
      </StatusPill>
    );
  }
  if (zns.trangThai === "SENT") {
    return (
      <StatusPill tone="success" className="font-medium">
        <span title={zns.luc}>Đã gửi {zns.luc}</span>
      </StatusPill>
    );
  }
  if (zns.trangThai === "FAILED") {
    return (
      <StatusPill tone="danger" className="font-medium">
        <span title={zns.loi ?? undefined}>Lỗi gửi — rê chuột xem</span>
      </StatusPill>
    );
  }
  return (
    <StatusPill tone="muted" className="font-medium">
      <span title={zns.loi ?? undefined}>{zns.trangThai}</span>
    </StatusPill>
  );
}

/** Escape 1 ô CSV (bọc ngoặc kép khi có dấu phẩy/xuống dòng/ngoặc kép). */
function oCsv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
