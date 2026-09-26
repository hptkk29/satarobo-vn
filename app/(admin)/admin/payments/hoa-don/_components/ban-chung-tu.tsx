"use client";

// "Bàn chứng từ" — danh sách lần thu + ngăn xử lý đứng CẠNH nhau (docs/ke-toan-hoa-don/PLAN.md §10).
//
// ≥ xl (1280px): lưới hai cột, ngăn là `<aside>` thường — KHÔNG dùng Sheet ở đây: Sheet của repo là
// Dialog modal có lớp phủ, khoá danh sách phía sau (PLAN §10). Ngưỡng là xl chứ không phải md như
// bản vẽ: sidebar cố định rộng 256px, ở md vùng nội dung chỉ còn ~500px — không đủ cho bảng lẫn
// ngăn 400px. Dưới xl: ngăn mở bằng Sheet, danh sách thành thẻ dưới md.
//
// ⚠️ Thân ngăn đặt `key={dong.key}` — đổi dòng là mount lại, mọi ô về rỗng (xem ngan-lan-thu.tsx).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { EmptyState } from "@/components/admin/ui/states";
import { adminTd, adminTh } from "@/components/admin/ui/table";
import { cn } from "@/lib/utils";
import { CAC_NGAN } from "@/lib/finance/hoa-don/ngan-hang-cho";
import type { DongHangCho, NganHangCho } from "@/lib/finance/hoa-don/dong-hang-cho";
import { NganLanThu } from "./ngan-lan-thu";

const tien = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
const NGUON: Record<DongHangCho["nguon"], string> = { CK: "CK", LOI_KHAI: "Khai tay", KHONG_GIAO_DICH: "Tiền mặt" };
// Cột "Nguồn" chỉ hiện từ 2xl: ở 1440px bảng đứng cạnh ngăn 400px chỉ còn ~710px, đủ 4 cột — cột thứ
// năm đẩy "Trạng thái" xuống dưới ngăn (chụp 26/09). Nguồn vẫn in đầy đủ trong ngăn xử lý.
const COT_NGUON = "hidden 2xl:table-cell";

/** `true` từ xl trở lên; `undefined` trước khi đo (SSR) — lúc đó chưa mở Sheet nào. */
function useLaXl(): boolean | undefined {
  const [la, setLa] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const doi = () => setLa(mq.matches);
    doi();
    mq.addEventListener("change", doi);
    return () => mq.removeEventListener("change", doi);
  }, []);
  return la;
}

export function BanChungTu({
  ngan,
  dem,
  dongTrongNgan,
  dangChon,
  chonKhongThay,
  thieuCoSo,
  khoOk,
}: {
  ngan: NganHangCho;
  dem: Record<NganHangCho, number>;
  dongTrongNgan: DongHangCho[];
  dangChon: DongHangCho | null;
  chonKhongThay: boolean;
  thieuCoSo: number;
  khoOk: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const laXl = useLaXl();
  // Desktop: chưa chọn gì thì ngăn hiện sẵn dòng ĐẦU của ngăn — kế toán làm theo lô, không phải
  // bấm để bắt đầu. Không đổi URL (dưới xl không tự mở Sheet).
  const trongAside = dangChon ?? dongTrongNgan[0] ?? null;

  function chon(key: string | null) {
    const q = new URLSearchParams({ ngan });
    if (key) q.set("chon", key);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  const moTa = CAC_NGAN.find((n) => n.ngan === ngan)!;

  return (
    <div className="flex flex-col gap-4">
      {!khoOk ? (
        <Bao>
          Kho lưu tệp hoá đơn chưa được cấu hình (biến <code className="font-mono text-xs">R2_INVOICE_BUCKET_NAME</code>) —
          vẫn tải được phiếu thu, nhưng chưa tải hoá đơn lên được. Báo người vận hành.
        </Bao>
      ) : null}
      {thieuCoSo > 0 ? (
        <Bao>
          {thieuCoSo} khoản thu nằm trên đơn chưa gán cơ sở nên chưa lên được danh sách này. Gán cơ sở cho đơn ở trang
          đơn hàng.
        </Bao>
      ) : null}
      {chonKhongThay ? (
        <Bao>Lần thu vừa mở không còn trong danh sách — có thể đã có người xử lý hoặc số tiền vừa đổi.</Bao>
      ) : null}

      <nav aria-label="Ngăn hoá đơn" className="-mx-1 overflow-x-auto px-1">
        <ul className="inline-flex gap-1 rounded-xl bg-muted p-1">
          {CAC_NGAN.map((n) => {
            const dangMo = n.ngan === ngan;
            const so = dem[n.ngan];
            return (
              <li key={n.ngan}>
                <Link
                  href={{ pathname, query: { ngan: n.ngan } }}
                  scroll={false}
                  aria-current={dangMo ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors duration-150",
                    dangMo
                      ? "bg-card font-semibold text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n.nhan}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums",
                      so > 0 && n.ngan === "cho" && "bg-state-warning-soft text-state-warning-ink",
                      so > 0 && n.ngan === "lech" && "bg-state-danger-soft text-state-danger-ink",
                      (so === 0 || (n.ngan !== "cho" && n.ngan !== "lech")) && "bg-background text-muted-foreground",
                    )}
                  >
                    {so}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start xl:gap-5">
        <div className="min-w-0">
          {dongTrongNgan.length === 0 ? (
            <EmptyState
              title={moTa.rong}
              description={
                ngan === "cho"
                  ? "Tiền về sẽ tự lên đây. Hoá đơn đã tải tệp nằm ở ngăn “Đã tải tệp”."
                  : "Đổi ngăn phía trên để xem các lần thu khác."
              }
              action={
                ngan !== "cho" ? (
                  <Link href={{ pathname, query: { ngan: "cho" } }} className="text-sm font-medium text-primary hover:underline">
                    Về ngăn Chờ xuất
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2 md:hidden">
                {dongTrongNgan.map((d) => (
                  <li key={d.key}>
                    <button
                      type="button"
                      onClick={() => chon(d.key)}
                      aria-pressed={dangChon?.key === d.key}
                      className={cn(
                        "flex w-full flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/50",
                        dangChon?.key === d.key && "border-primary/50 bg-primary-soft/40",
                      )}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0 truncate font-medium text-foreground">{d.tenKhach || d.maDon}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">{tien(d.soTien)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate tabular-nums">
                          {d.ngayThuLabel} · {d.maDon}
                          {d.nhanDot ? ` · ${d.nhanDot}` : ""}
                        </span>
                        <StatusPill tone={d.tone}>{d.nhan}</StatusPill>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
                <PhanTrangBang cuonNgang tenDonVi="lần thu" khoaGhiNho="hoa-don" khoaTrang={`hoa-don:${ngan}`} classThanh="px-4 pb-3">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th scope="col" className={adminTh}>
                          Ngày thu
                        </th>
                        <th scope="col" className={adminTh}>
                          Khách · đơn
                        </th>
                        <th scope="col" className={cn(adminTh, "text-right")}>
                          Số tiền
                        </th>
                        <th scope="col" className={cn(adminTh, COT_NGUON)}>
                          Nguồn
                        </th>
                        <th scope="col" className={adminTh}>
                          Trạng thái
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dongTrongNgan.map((d) => {
                        const dangXem = trongAside?.key === d.key;
                        return (
                          <tr
                            key={d.key}
                            aria-selected={dangXem}
                            className={cn(
                              "relative cursor-pointer border-b border-border/60 transition-colors duration-150 last:border-0",
                              dangXem ? "bg-primary-soft/50" : "hover:bg-muted/50",
                            )}
                          >
                            <td className={cn(adminTd, "tabular-nums text-muted-foreground")}>{d.ngayThuLabel}</td>
                            <td className={cn(adminTd, "max-w-[16rem]")}>
                              {/* Vùng bấm phủ cả HÀNG (`after:inset-0`, neo ở `relative` của <tr>) — khuôn /cham-cong. */}
                              <button
                                type="button"
                                onClick={() => chon(d.key)}
                                className="block max-w-full truncate text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                              >
                                <span className="font-medium text-foreground">{d.tenKhach || "—"}</span>
                                <span className="ml-2 text-xs tabular-nums text-muted-foreground">{d.maDon}</span>
                              </button>
                            </td>
                            <td className={cn(adminTd, "text-right font-semibold tabular-nums")}>{tien(d.soTien)}</td>
                            <td className={cn(adminTd, COT_NGUON, "text-muted-foreground")}>
                              {NGUON[d.nguon]}
                              {d.nhanDot ? ` · ${d.nhanDot}` : ""}
                            </td>
                            <td className={adminTd}>
                              <StatusPill tone={d.tone}>{d.nhan}</StatusPill>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </PhanTrangBang>
              </div>
            </>
          )}
        </div>

        <aside
          aria-label="Chứng từ của lần thu"
          className="hidden rounded-xl border border-border bg-card xl:sticky xl:top-4 xl:block xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto"
        >
          {trongAside ? (
            <NganLanThu key={trongAside.key} dong={trongAside} />
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <Inbox className="h-5 w-5" aria-hidden />
              Chọn một lần thu để xem phiếu thu và tải hoá đơn.
            </div>
          )}
        </aside>
      </div>

      <Sheet open={laXl === false && dangChon !== null} onOpenChange={(mo) => (mo ? null : chon(null))}>
        {/* `admin-scope`: Sheet render qua PORTAL ra ngoài khung admin ⇒ không có class này là token
            rơi về `:root` (primary thành cam — chụp 26/09 ở 375px). */}
        <SheetContent side="right" className="admin-scope w-full overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>{dangChon ? `${dangChon.tenKhach || dangChon.maDon}` : "Lần thu"}</SheetTitle>
          </SheetHeader>
          {dangChon ? <NganLanThu key={dangChon.key} dong={dangChon} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Bao({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex gap-2 rounded-lg bg-state-warning-soft px-3.5 py-2.5 text-sm text-state-warning-ink">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
