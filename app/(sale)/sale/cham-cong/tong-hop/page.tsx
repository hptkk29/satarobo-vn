/**
 * Site Sale — màn "Tổng hợp công ca" (bảng tuần).
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/cham-cong/lich-ca-nhan-vien/page.tsx` ───
 * Tên đường ở site Sale ngắn hơn theo đúng bảng `PAGE_GATES`
 * (`/sale/cham-cong/tong-hop`), nhưng vẫn là MỘT màn. Tách bản riêng theo chốt
 * 04/09/2026. Bản admin GIỮ NGUYÊN, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng tiêu đề, cùng bộ lọc cơ sở ("Tất cả cơ sở" +
 * nút "Lọc"), cùng hai nút lùi/tiến tuần và nhãn "Tuần … → …", cùng câu chú giải
 * ("Ca chính thức (APPROVED) · giờ vào/ra (GMT+7) · trạng thái · … = có giải
 * trình/yêu cầu chỉnh công."), cùng bảng 8 cột, cùng câu chân trang chỉ hiện khi
 * người xem thấy được người khác ("Chỉ lịch chính thức (đã duyệt qua import
 * Excel) mới tính công.").
 *
 * ⚠️ Hai tham số `date` (mỏ neo tuần) và `centerId` (bộ lọc cơ sở) là thứ làm
 *    chuyển tuần + lọc cơ sở có tác dụng. Nuốt mất là hai nút chết. Hai liên kết
 *    tuần viết TƯỜNG MINH `/sale/cham-cong/tong-hop` — bản admin trỏ
 *    `/cham-cong/lich-ca-nhan-vien`, vừa là đường SẠCH của host quản trị vừa là
 *    tên đường KHÁC trên site này, nên bản mount cũ chuyển tuần là văng 404.
 *
 * ═══ CỔNG QUYỀN ════════════════════════════════════════════════════════════
 *   tầng 1 · `PAGE_GATES["/sale/cham-cong/tong-hop"]` = ["hr_attendance:checkin"]
 *   bản admin gác:  `view(cơ-sở-đang-xem)` HOẶC `checkin(cơ-sở-của-mình)`
 *
 * Vế thứ hai của bản admin CÙNG action với cổng, chỉ thêm target — mà thêm
 * target chỉ nới ra chứ không siết vào (`scopeMatches`, `lib/auth/can.ts`) ⇒ qua
 * cổng là chắc chắn qua vế đó ⇒ chép xuống đây là mã chết. Vế thứ nhất KHÔNG
 * phải cổng vào: nó quyết định người xem thấy CẢ ĐỘI hay chỉ CHÍNH MÌNH. Nên nó
 * ở lại, nhưng dưới dạng một biến (`xemDuocNguoiKhac`) chứ không phải một nhánh
 * `redirect` — không ai bị đá ra khỏi màn này, chỉ khác phạm vi nhìn thấy. Đây
 * đúng là ngoại lệ đã được ghi tường minh trong `GATE_MISMATCH_ALLOWLIST`
 * (`lib/auth/page-gates.ts`): "Gate có TARGET (centerId) nên không quy về so-sánh
 * -tập-hợp: nhân viên thường xem được bảng ca của chính cơ sở mình, đó là thiết kế."
 *
 * ═══ 🔴 SIẾT PHẠM VI SO VỚI BẢN ADMIN — CỐ Ý, BÁO LẠI ĐỂ CÓ DẤU VẾT ════════
 * Bản admin cắt phạm vi bằng MÃ VAI:
 *     const isSuper = hasRole(user, "SUPER_ADMIN");
 *     const isCM    = hasRole(user, "CENTER_MANAGER");
 *     const forcedCenter = isCM && !isSuper ? user.centerId : null;
 *     const filterCenter = forcedCenter ?? (canViewAll ? centerId ?? null : null);
 * Ai KHÔNG khớp hai mã đó rơi vào `filterCenter = null`, tức truy vấn nhân sự
 * **không có mệnh đề cơ sở nào**. Bình thường `scopedDb` sẽ đỡ — nhưng `User` và
 * `Center` KHÔNG thuộc `SCOPED_MODELS` (`lib/db-scope.ts`), nên `sdb.user.findMany`
 * ở đó là đường THẲNG. Hệ quả: một vai có `hr_attendance:view` mà không mang mã
 * `CENTER_MANAGER` sẽ liệt kê **toàn bộ nhân sự của mọi cơ sở**. Trên site Sale
 * không ai mang mã `CENTER_MANAGER` (khung site chỉ cho Sale THUẦN vào), nên bản
 * mount cũ rơi thẳng vào nhánh đó.
 *
 * Bản này bỏ `hasRole` và lấy phạm vi từ ACTOR (`lib/sale/cham-cong.ts` ·
 * `coSoChoPhep`): SUPER_ADMIN và vai neo ở Hội sở giữ nguyên tầm nhìn toàn hệ
 * thống (đúng thiết kế `buildActor`), còn vai cấp cơ sở bị chặn về
 * `actor.visibleCenterIds` — cho cả danh sách nhân sự LẪN danh sách cơ sở trong ô
 * lọc. **Đây là SIẾT, không phải nới.** Hai hệ quả phải biết trước khi nghiệm thu:
 *   1. Nhân sự có `centerId = NULL` không còn hiện với người xem cấp cơ sở (mệnh
 *      đề `centerId IN [...]` loại NULL). Bản admin không lọc nên vẫn thấy họ.
 *   2. `visibleCenterIds` rỗng ⇒ bảng rỗng. Fail-closed, cùng hướng `scopedDb`.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, MessageSquareWarning, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layTongHopCongCa } from "@/lib/sale/cham-cong";
import { BangTongHop } from "./_components/bang-tong-hop";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tổng hợp công ca | Tư vấn tuyển sinh" };

interface ThamSo {
  searchParams: Promise<{ date?: string; centerId?: string }>;
}

const NUT_TUAN =
  "inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card " +
  "text-foreground transition-colors hover:bg-muted focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30";

export default async function ManTongHopCongCaSale({ searchParams }: ThamSo) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fcham-cong%2Ftong-hop");

  const chan = await chanNeuThieuQuyen("/sale/cham-cong/tong-hop", "Tổng hợp công ca");
  if (chan) return chan;

  const { date, centerId } = await searchParams;

  // Target cho phép kiểm `:view`: cơ sở đang lọc, hoặc cơ sở của chính người xem.
  // Thiếu target thì v2 luôn trả FALSE vì `:view` seed ở scope CENTER — cùng bẫy
  // đã ghi ở `lib/auth/page-gates.ts`.
  const xemDuocNguoiKhac = await checkPermission("hr_attendance:view", {
    centerId: centerId ?? session.user.centerId ?? null,
  });

  const actor = await resolveActor(session.user.id);
  const d = await layTongHopCongCa({
    actor,
    userId: session.user.id,
    xemDuocNguoiKhac,
    neo: date,
    locCoSo: centerId,
  });

  const duongTuan = (ngay: string) =>
    `/sale/cham-cong/tong-hop?date=${ngay}${d.locCoSo ? `&centerId=${d.locCoSo}` : ""}`;

  return (
    <KhungDuLieu>
      {/* Bản admin không có câu mô tả nào dưới tiêu đề — không bịa thêm một câu.
          Nhãn tuần nằm ở bộ chuyển tuần bên phải, đúng chỗ bản admin đặt nó. */}
      <KhungDuLieu.Dau
        ten="Tổng hợp công ca"
        hanhDong={
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="mr-1 size-5 text-[color:var(--primary-ink)]" />
            <Link href={duongTuan(d.tuanTruoc)} aria-label="Tuần trước" className={NUT_TUAN}>
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              Tuần {d.ngayTrongTuan[0]} → {d.ngayTrongTuan[6]}
            </span>
            <Link href={duongTuan(d.tuanSau)} aria-label="Tuần sau" className={NUT_TUAN}>
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        }
      />

      <KhungDuLieu.Loc>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Biểu mẫu GET không đặt `action`: nó gửi về CHÍNH đường hiện tại, nên
              không có đường quản trị nào bị chốt cứng ở đây. Ô ẩn `date` giữ mỏ
              neo tuần đang xem — thiếu nó thì lọc cơ sở xong là nhảy về tuần này. */}
          {d.coSo.length > 0 ? (
            <form method="GET" className="flex items-center gap-2">
              <input type="hidden" name="date" value={d.neoTuan} />
              <select
                name="centerId"
                aria-label="Lọc theo cơ sở"
                defaultValue={d.locCoSo ?? ""}
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30"
              >
                <option value="">Tất cả cơ sở</option>
                {d.coSo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-3 text-sm font-medium text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)]"
              >
                Lọc
              </button>
            </form>
          ) : (
            <span />
          )}

          <p className="text-xs text-muted-foreground">
            Ca chính thức (APPROVED) · giờ vào/ra (GMT+7) · trạng thái ·{" "}
            <MessageSquareWarning
              aria-hidden="true"
              className="inline size-3.5 text-[color:var(--state-warning)]"
            />{" "}
            = có giải trình/yêu cầu chỉnh công.
          </p>
        </div>
      </KhungDuLieu.Loc>

      {/* `hienCoSo` bám ĐÚNG điều kiện bản admin (`!filterCenter`), kể cả ở chế độ
          chỉ-xem-mình: ở đó bản admin vẫn hiện tên cơ sở dưới tên người xem. Siết
          thêm một vế `!chiMinh` là âm thầm giấu mất một dòng thông tin. */}
      <BangTongHop dong={d.dong} ngayTrongTuan={d.ngayTrongTuan} hienCoSo={!d.locCoSo} />

      <KhungDuLieu.Chan>
        {d.chiMinh ? (
          "Bạn chỉ xem được công ca của chính mình — cần quyền xem chấm công để thấy cả đội."
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle aria-hidden="true" className="size-3.5" /> Chỉ lịch chính thức (đã
            duyệt qua import Excel) mới tính công.
          </span>
        )}
      </KhungDuLieu.Chan>
    </KhungDuLieu>
  );
}
