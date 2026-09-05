"use client";

/**
 * Site Sale — BẢNG của màn "Leads" (`/sale/leads`, chế độ Bảng).
 *
 * ── BẢN ĐÔI CỦA `LeadsTable` trong
 *    `app/(admin)/admin/leads/_components/leads-table.tsx` ────────────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100%:
 *   · ĐỦ 13 khoá cột của danh mục `lib/tables/lead-columns.ts` — thứ tự và tập
 *     cột đang hiện do SERVER quyết (tuỳ chọn của từng người), bảng không tự chọn.
 *   · Cột "Hành động" luôn có, với "Xem chi tiết lead" cho mọi trạng thái và mọi
 *     vai đọc được lead, và nút "Xoá" khi có `leads:delete`.
 *   · Bấm vào dòng mở NGĂN CHI TIẾT — vẫn là đường xem nhanh như bản admin.
 *   · Dòng rỗng: "Chưa có lead nào".
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bảng gõ class từng ô (`px-4 py-3 text-xs uppercase…`) → `.bang-sale` của
 *    `sale.css`. Mật độ nằm ở CSS thì bảng MỚI tự đúng; nằm trong từng ô thì phải
 *    nhớ chép. Kèm `white-space: nowrap` trên CẢ `th` VÀ `td` — thứ duy nhất chặn
 *    chiều cao dòng nhảy loạn (đo ở admin: 65–71px, không đều).
 * 2. Ô trạng thái đi qua thang màu NGỮ NGHĨA (`o-trang-thai.tsx`) thay vì mười
 *    class Tailwind rời.
 * 3. Ô lọc trạng thái, nút "Tuỳ chọn cột", nút "Xuất Excel" KHÔNG còn nằm lẫn
 *    trong thân bảng — chúng là công cụ của màn, nên lên thanh lọc / dải tiêu đề.
 *
 * ⚠️ MÀU: chỉ cột "Trạng thái" được tô, và tô qua thang ngữ nghĩa. Cột "Sale phụ
 *    trách" giữ đúng MỘT chỗ được tô của bản admin — nhóm "Chưa phân công", vì đó
 *    là việc phải làm chứ không phải một giá trị. Không tô ngày tạo, không tô tên.
 *    `khach-cua-toi/_components/lead-table.tsx` đã trả giá HAI LẦN cho bài học "tô
 *    cả một cột là làm màu mất nghĩa" — không lặp lại ở đây.
 *
 * ⚠️ Mọi giá trị ở đây đã qua che PII Ở SERVER (`maskLeadPiiFields` trong
 *    `lib/sale/leads.ts`) trước khi rời máy chủ. Đừng thêm ô nào đọc nguồn khác.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import { ChonSoDong } from "@/components/ui/chon-so-dong";
import { DieuHuongTrang } from "@/components/ui/dieu-huong-trang";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { formatDateVN } from "@/lib/format/date";
import type { DongLead } from "@/lib/sale/leads";
import { rutGonNguon } from "@/lib/sale/nguon-lead";
import { cn } from "@/lib/utils";
import { ChipDungChung } from "./chip-dung-chung";
import { NganChiTietLead } from "./ngan-lead";
import { NutXoaLead } from "./nut-xoa-lead";
import { OTrangThaiLead } from "./o-trang-thai";

/**
 * ⚠️ NỢ ĐÃ BIẾT — `/leads/{id}` là đường của KHU QUẢN TRỊ.
 *
 * Trên `sale.satarobo.vn`, luật cuối của nhánh Sale trong `lib/auth/route-policy.ts`
 * viết lại mọi đường lạ thành `/sale/<đường>` ⇒ đây thành `/sale/leads/{id}` →
 * **404**. Trỏ sang host admin cũng không cứu được: Sale THUẦN bước vào host admin
 * là bị đá ngược về host Sale.
 *
 * Bản mount cũ đã hỏng đúng như vậy, nên GIỮ NGUYÊN ở đây là KHÔNG tạo hồi quy —
 * chứ không phải là đúng. `/sale/khach-cua-toi/{id}` KHÔNG thay thế được: màn đó
 * dùng `getMyLeadDetail`, trả `notFound()` cho lead không phải của người đang xem,
 * mà màn này lại là màn của vai `leads:view-all` (nhìn lead của cả cơ sở) — đổi
 * sang đó là biến 404-vì-đường thành 404-vì-quyền, cùng một chỗ vỡ, khó hiểu hơn.
 * Lối ra đúng là dựng `/sale/leads/[id]`, tức THÊM MÀN — việc phải hỏi chủ dự án,
 * ngoài phạm vi đợt tách này.
 *
 * Trong lúc chờ, NGĂN CHI TIẾT (bấm vào dòng) vẫn chạy và là đường xem nhanh thật.
 */
const duongChiTiet = (id: string) => `/leads/${id}`;

/** Cột canh phải + chữ số đều bề ngang, để quét dọc cột thẳng hàng. */
const COT_SO = new Set(["createdAt", "childAge"]);

function ODaiCat({ chu, tua }: { chu: string | null; tua?: string | null; }) {
  return (
    <span className="block max-w-[14rem] truncate" title={tua ?? chu ?? ""}>
      {chu ?? "—"}
    </span>
  );
}

function ONoiDung({
  khoa,
  d,
  laCuaToi,
  doiTrangThaiDuoc,
}: {
  khoa: string;
  d: DongLead;
  laCuaToi: boolean;
  doiTrangThaiDuoc: boolean;
}) {
  switch (khoa) {
    case "parentName":
      return (
        <>
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{d.parentName}</span>
            <ChipDungChung dangChiaSe={d.isSharedWithTeam} cuaToi={laCuaToi} />
          </span>
          {d.childName ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Con: {d.childName}
              {d.childAge ? ` · ${d.childAge} tuổi` : ""}
            </span>
          ) : null}
        </>
      );
    case "phone":
      return <span className="tabular-nums text-foreground">{d.phone}</span>;
    case "course":
      return (
        <>
          <ODaiCat chu={d.courseName} />
          {d.source ? (
            <span className="mt-0.5 block max-w-[14rem] truncate text-xs text-muted-foreground" title={d.source}>
              {rutGonNguon(d.source)}
            </span>
          ) : null}
        </>
      );
    case "status":
      return (
        <OTrangThaiLead
          leadId={d.id}
          tenLead={d.parentName}
          trangThai={d.status as LeadStatus}
          doiDuoc={doiTrangThaiDuoc}
        />
      );
    case "center":
      return <span className="text-muted-foreground">{d.center?.name ?? "—"}</span>;
    case "assignedTo":
      return d.assignedTo?.name ? (
        <span className="text-foreground">{d.assignedTo.name}</span>
      ) : (
        // Chỗ DUY NHẤT của cột này được tô: "chưa phân công" là một việc còn nợ,
        // không phải một giá trị. Giữ đúng như bản admin.
        <span className="font-medium text-[color:var(--state-warning-ink)]">Chưa phân công</span>
      );
    case "createdAt":
      return <span className="text-muted-foreground">{formatDateVN(new Date(d.createdAt))}</span>;
    case "childName":
      return <span className="text-foreground">{d.childName ?? "—"}</span>;
    case "childAge":
      return <span className="text-muted-foreground">{d.childAge ?? "—"}</span>;
    case "email":
      return <ODaiCat chu={d.email} />;
    case "source":
      return <ODaiCat chu={d.source ? rutGonNguon(d.source) : null} tua={d.source} />;
    case "note":
      return <ODaiCat chu={d.note} />;
    case "utmCampaign":
      return <ODaiCat chu={d.utmCampaign} />;
    default:
      // Khoá lạc không bao giờ tới được đây (server đã nắn theo danh mục), nhưng
      // vẽ ô rỗng vẫn tốt hơn là làm lệch số ô so với số `<th>`.
      return null;
  }
}

export function BangLeads({
  dong,
  tong,
  trang,
  soDong,
  cot,
  suaDuoc,
  doiTrangThaiDuoc,
  xoaDuoc,
  nguoiDangXemId,
}: {
  dong: DongLead[];
  tong: number;
  trang: number;
  soDong: number;
  /** Cột đang hiện, ĐÚNG thứ tự — server đã ghép cấu hình của người này với danh mục. */
  cot: { key: string; label: string }[];
  /** `leads:edit` — mở ô ghi chú trong ngăn chi tiết. */
  suaDuoc: boolean;
  /** `leads:change-status` — chỉ Tư vấn viên đẩy bậc phễu. */
  doiTrangThaiDuoc: boolean;
  /** `leads:delete`. */
  xoaDuoc: boolean;
  nguoiDangXemId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dangXem, setDangXem] = useState<DongLead | null>(null);
  const soTrang = Math.max(1, Math.ceil(tong / soDong));

  function sangTrang(p: number) {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.set("page", String(p));
    router.push(`/sale/leads?${sp.toString()}`);
  }

  if (dong.length === 0) {
    return (
      <KhungDuLieu.Rong
        ten="Chưa có lead nào"
        mo="Không có lead nào khớp bộ lọc hiện tại. Thử bỏ bớt điều kiện, hoặc mở rộng khoảng ngày."
      />
    );
  }

  return (
    <>
      {/* ⚠️ KHÔNG bọc `<PhanTrangBang>`: bảng này đã cắt trang Ở MÁY CHỦ
          (`skip`/`take` trong `docTrangBangLead`), y như bản admin. Bọc thêm là
          phân trang HAI LẦN — trang 1 của server lại bị cắt tiếp ở trình duyệt.
          Bộ chuyển trang thật nằm ngay dưới đây (`<DieuHuongTrang>` + `<ChonSoDong>`
          trong dải chân), nên bài kiểm `components/ui/bang-coverage.test.ts` vẫn
          thấy đủ và KHÔNG cần một dòng miễn trừ nào. */}
      <KhungDuLieu.Than>
        <table className="bang-sale">
          <thead>
            <tr>
              {/* Nhãn cột đến từ danh mục (`lib/tables/lead-columns.ts`) — gõ tay ở
                  đây là hai nơi trôi lệch ngay lần thêm trường tiếp theo. */}
              {cot.map((c) => (
                <th key={c.key} scope="col" className={cn(COT_SO.has(c.key) && "o-so")}>
                  {c.label}
                </th>
              ))}
              <th scope="col" className="o-so">
                Hành động
              </th>
            </tr>
          </thead>
          <tbody>
            {dong.map((d) => (
              <tr
                key={d.id}
                onClick={() => setDangXem(d)}
                className="cursor-pointer"
              >
                {cot.map((c) => (
                  <td key={c.key} className={cn(COT_SO.has(c.key) && "o-so")}>
                    {c.key === "parentName" ? (
                      // Đường vào ngăn chi tiết bằng BÀN PHÍM. Bản admin chỉ mở
                      // được ngăn bằng cách bấm chuột vào dòng — không tab tới
                      // được, tức là không dùng được nếu không có chuột.
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDangXem(d);
                        }}
                        aria-label={`Xem nhanh ${d.parentName}`}
                        className="block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40"
                      >
                        <ONoiDung
                          khoa={c.key}
                          d={d}
                          laCuaToi={d.assignedToId === nguoiDangXemId}
                          doiTrangThaiDuoc={doiTrangThaiDuoc}
                        />
                      </button>
                    ) : (
                      <ONoiDung
                        khoa={c.key}
                        d={d}
                        laCuaToi={d.assignedToId === nguoiDangXemId}
                        doiTrangThaiDuoc={doiTrangThaiDuoc}
                      />
                    )}
                  </td>
                ))}
                <td className="o-so" onClick={(e) => e.stopPropagation()}>
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <Link
                      href={duongChiTiet(d.id)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium",
                        "bg-[color:var(--primary-soft)] text-[color:var(--primary-ink)]",
                        "transition-colors hover:bg-[color:var(--primary-soft-hover)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
                      )}
                    >
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                      Xem chi tiết lead
                    </Link>
                    {xoaDuoc ? <NutXoaLead id={d.id} tenLead={d.parentName} /> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </KhungDuLieu.Than>

      <KhungDuLieu.Chan>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <ChonSoDong soDong={soDong} tong={tong} tenDonVi="lead" />
            <span>
              Trang {trang}/{soTrang}
            </span>
          </div>
          <DieuHuongTrang trang={trang} soTrang={soTrang} onDoi={sangTrang} />
        </div>
      </KhungDuLieu.Chan>

      <NganChiTietLead
        key={dangXem?.id ?? "rong"}
        lead={dangXem}
        suaDuoc={suaDuoc}
        doiTrangThaiDuoc={doiTrangThaiDuoc}
        onDong={() => setDangXem(null)}
      />
    </>
  );
}
