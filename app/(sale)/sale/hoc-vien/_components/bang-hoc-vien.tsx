/**
 * Bảng học viên của site Sale — bản đôi GIAO DIỆN của khối `<table>` trong
 * `app/(admin)/admin/students/page.tsx` (chốt tách bản 04/09/2026).
 *
 * ── Giữ nguyên 100% ─────────────────────────────────────────────────────────
 * Đúng chín cột, đúng thứ tự, đúng nhãn: Ảnh · Học viên · Lớp · Phụ huynh ·
 * Cơ sở · Khoá · Trạng thái · Ngày tạo · Hành động. Câu rỗng cũng giữ nguyên
 * từng chữ ("Không có học viên trong view này").
 *
 * ── Chỉ CÁCH BÀY đổi ────────────────────────────────────────────────────────
 *   1. `class="bang-sale"` thay cho ~40 lần gõ lại `px-5 py-3.5 whitespace-nowrap`
 *      trên từng ô. Mật độ (dòng 44px) và luật `nowrap` trên CẢ `th` VÀ `td` nằm
 *      trong `sale.css`; bảng mới tự đúng thay vì phải nhớ. Chính chỗ này là lỗi
 *      đã đo được ở admin: chiều cao dòng 65–71px và không đều nhau, vì một nhãn
 *      xuống hai dòng kéo cả hàng cao lên.
 *   2. Nhãn trạng thái đi qua `<StatusPill tone={toneTrangThaiHocVien(...)}>`
 *      thay vì `<span>` ghép class tay. Một thang màu ngữ nghĩa cho cả site.
 *   3. Cột số ("Khoá") dùng `.o-so` — canh phải + chữ số đều bề ngang, để mắt so
 *      được sĩ số giữa các dòng thay vì phải đọc từng ô.
 *   4. Bảng rỗng → `<KhungDuLieu.Rong>` (một khối giữa khung) thay vì một hàng
 *      `colSpan={9}` giả làm dữ liệu.
 *
 * ⚠️ MÀU chỉ dùng ở ĐÚNG MỘT chỗ trong bảng này ngoài nhãn trạng thái: dòng
 *    "Bảo lưu từ …". Đó là thứ có HẠN và cần gọi lại trước khi hết hạn. Tô thêm
 *    cột nào nữa là làm màu mất nghĩa — bài học đã trả giá hai lần ở bảng
 *    "Khách của tôi" (xem `khach-cua-toi/_components/lead-table.tsx`).
 *
 * ⚠️ Dòng bảo lưu bỏ ký tự "🟡" đứng đầu của bản admin. Emoji ở đó là một chấm
 *    trạng thái tự chế — nó mang MÀU nhưng không đọc được bằng trình đọc màn
 *    hình và không đổi theo chủ đề. Nghĩa nó mang nay do token `--state-warning-ink`
 *    của chính dòng chữ mang. Câu chữ không đổi.
 */
import Link from "next/link";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { formatDateDMY } from "@/lib/format/date";
import {
  NHAN_TRANG_THAI_HOC_VIEN,
  toneTrangThaiHocVien,
} from "@/lib/sale/trang-thai-dao-tao";
import type { DongHocVien } from "@/lib/sale/du-lieu-hoc-vien";
import { NutXoaHocVien } from "./nut-xoa-hoc-vien";

export function BangHocVien({
  dong,
  suaDuoc,
  xoaDuoc,
}: {
  dong: DongHocVien[];
  suaDuoc: boolean;
  xoaDuoc: boolean;
}) {
  const coHanhDong = suaDuoc || xoaDuoc;

  if (dong.length === 0) {
    return <KhungDuLieu.Rong ten="Không có học viên trong view này" />;
  }

  return (
    <KhungDuLieu.Than>
      <table className="bang-sale">
        <thead>
          <tr>
            <th scope="col">Ảnh</th>
            <th scope="col">Học viên</th>
            <th scope="col">Lớp</th>
            <th scope="col">Phụ huynh</th>
            <th scope="col">Cơ sở</th>
            <th scope="col" className="o-so">
              Khoá
            </th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Ngày tạo</th>
            {coHanhDong && (
              <th scope="col" className="o-so">
                Hành động
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {dong.map((s) => {
            const baoLuu = s.reserves[0];
            return (
              <tr key={s.id}>
                <td>
                  {s.avatarUrl ? (
                    // Giữ `<img>` như bản admin: ảnh đại diện đến từ R2 qua đường
                    // dẫn ký ngắn hạn, `next/image` đòi khai host trước.
                    <img
                      src={s.avatarUrl}
                      alt={s.name}
                      className="h-9 w-9 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </td>

                <td>
                  <div className="font-medium text-foreground">{s.name}</div>
                  {s.studentCode && (
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {s.studentCode}
                    </div>
                  )}
                  {baoLuu && (
                    <div
                      className="mt-0.5 text-xs text-[color:var(--state-warning-ink)]"
                      title={baoLuu.reason}
                    >
                      Bảo lưu từ {formatDateDMY(baoLuu.startedAt)}
                      {baoLuu.expectedEndAt && ` → ${formatDateDMY(baoLuu.expectedEndAt)}`}
                    </div>
                  )}
                </td>

                <td className="tabular-nums text-muted-foreground">
                  {s.currentGrade ? `Lớp ${s.currentGrade}` : "—"}
                </td>

                {/* `max-w` + `truncate`: `nowrap` làm bảng rộng hơn khung nên cột
                    "Hành động" phải cuộn mới thấy. Cắt CÓ KIỂM SOÁT đúng hai ô dài
                    nhất (phụ huynh, cơ sở) thay vì để trình duyệt tự vỡ dòng.
                    `title` để tên bị cắt vẫn đọc được đầy đủ khi rê chuột. */}
                <td className="text-muted-foreground">
                  <div className="max-w-[15rem] truncate" title={s.parentName ?? undefined}>
                    {s.parentName ?? "—"}
                  </div>
                  {s.parentPhone && (
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {s.parentPhone}
                    </div>
                  )}
                </td>

                <td className="text-muted-foreground">
                  <div
                    className="max-w-[12rem] truncate"
                    title={s.preferredCenter?.name ?? s.center?.name ?? undefined}
                  >
                    {s.preferredCenter?.name ?? s.center?.name ?? "—"}
                  </div>
                </td>

                <td className="o-so text-muted-foreground">{s._count.enrollments}</td>

                <td>
                  <StatusPill tone={toneTrangThaiHocVien(s.status)}>
                    {NHAN_TRANG_THAI_HOC_VIEN[s.status] ?? s.status}
                  </StatusPill>
                </td>

                <td className="tabular-nums text-muted-foreground">
                  {formatDateDMY(s.createdAt)}
                </td>

                {coHanhDong && (
                  <td className="o-so">
                    <div className="flex justify-end gap-2">
                      {suaDuoc && (
                        <Link
                          href={`/students/${s.id}/edit`}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                        >
                          Sửa
                        </Link>
                      )}
                      {/* Cùng điều kiện bản admin: chỉ xoá được học viên ĐÃ NGHỈ. */}
                      {xoaDuoc && s.status === "INACTIVE" && (
                        <NutXoaHocVien studentId={s.id} studentName={s.name} />
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </KhungDuLieu.Than>
  );
}
