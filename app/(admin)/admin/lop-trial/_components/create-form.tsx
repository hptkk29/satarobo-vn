"use client";

// app/(admin)/admin/lop-trial/_components/create-form.tsx
//
// Form tạo lớp trải nghiệm — 28/08/2026: chỉ còn CƠ SỞ + KHOÁ TRẢI NGHIỆM.
//
// ── TÊN LỚP: SỬA ĐƯỢC (đảo chốt 28/08, chủ dự án chốt lại 18/09) ──────────────────────
// Chốt cũ: "Tên lớp KHÔNG có ô nhập… Cho người gõ tên là mời hai lớp trùng tên và mời
// lệch khỏi quy ước — mà tên này đi thẳng vào phiếu gửi phụ huynh."
//
// Nay: "được sửa và tự do điều chỉnh tên lớp". Hai lo ngại cũ được xử lý, không bỏ qua:
//  · LỆCH QUY ƯỚC — ô ĐIỀN SẴN tên theo quy ước và tự cập nhật khi đổi cơ sở/khoá, MIỄN LÀ
//    người dùng chưa tự gõ. Ai không quan tâm thì bấm lưu là ra đúng tên cũ.
//  · TRÙNG TÊN — đã đo: `TrialClassV2.name` KHÔNG `@unique`, chỉ `code` mới unique. Định
//    danh thật của lớp vẫn là `code` do server cấp. Trùng tên là khó nhìn, không phá dữ
//    liệu; chặn cứng sẽ cản đúng thứ vừa được mở ra.
//
// ⚠️ Số thứ tự vẫn do SERVER cấp trong transaction. Ô nhập bày "…" ở chỗ con số để không
// hứa một số mà client không biết — client đoán số là chắc chắn có lúc đoán sai.
//
// Giờ · phòng · giáo viên · sĩ số ĐÃ RỜI khỏi đây: chúng là thuộc tính của TỪNG BUỔI
// (một lớp là slot tái sử dụng, hai buổi khác ngày có thể khác giờ và khác người dạy).
// Chọn ba thứ đó ở khối "Thêm buổi học" trong trang chi tiết lớp.

import type { JSX } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLopTrialClassAction } from "../_actions";
import { tenLopTrial } from "@/lib/trial/lop-moi";
import {
  keKhung,
  khungChoNgay,
  TEN_THU,
  THU_KHOA,
  type CauHinhKhung,
} from "@/lib/trial/khung-gio-mo-lop";
import { vnWeekday } from "@/lib/time/vn";
import type { Option } from "../_lib/types";

export function CreateForm({
  centers,
  courses,
  coSoCuaToi = null,
  cauHinhKhung,
  homNay,
}: {
  /** `code` để xem trước tên lớp sẽ sinh ra; thiếu thì rơi về `name`. */
  centers: (Option & { code?: string | null })[];
  /** `slug` là phần MÃ KHOÁ trong tên lớp (`CS2-sata4-…`), không phải `name`. */
  courses: (Option & { slug?: string | null })[];
  /**
   * Cơ sở của CHÍNH người đang mở màn — dùng làm mặc định.
   *
   * ⚠️ Chỉ dùng khi nó CÓ trong `centers`. Người Hội sở có `centerId` trỏ tới bản ghi
   * `Center("hoi-so")` vốn là bản ghi MỒ CÔI (xem CLAUDE.md), và `getCenterOptions` cố ý
   * không bày nó ra — đặt mặc định bằng một id không có trong danh sách thì ô select rơi
   * về rỗng và người dùng thấy "Cơ sở *" trống trơn.
   */
  coSoCuaToi?: string | null;
  /**
   * Bảy khoá `trial.khungGio.<thu>` đã đọc sẵn ở server.
   *
   * Truyền xuống thay vì đóng cứng trong client: ô chọn khung phải bày ĐÚNG thứ server
   * sẽ nhận, nếu không thì người dùng chọn xong mới bị từ chối — ô chọn hứa một việc
   * không làm được (luật 12).
   */
  cauHinhKhung: CauHinhKhung;
  /** Hôm nay theo lịch VN, dạng "YYYY-MM-DD" — server tính, client không đọc đồng hồ máy. */
  homNay: string;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [centerId, setCenterId] = useState(
    () =>
      (coSoCuaToi && centers.some((c) => c.id === coSoCuaToi) ? coSoCuaToi : centers[0]?.id) ?? "",
  );
  const [courseId, setCourseId] = useState("");
  /**
   * Tên lớp người dùng tự gõ. `null` = CHƯA gõ ⇒ ô hiện tên theo quy ước và tự đổi theo
   * cơ sở/khoá. Vừa gõ một chữ là chuyển sang "của người dùng" và thôi tự đổi — nếu không
   * thì đổi cơ sở sẽ xoá mất tên họ vừa đặt.
   */
  const [tenTuGo, setTenTuGo] = useState<string | null>(null);

  // ── NGÀY + KHUNG GIỜ (22/09/2026) ──────────────────────────────────────────────────
  const [ngay, setNgay] = useState(homNay);

  // `new Date("YYYY-MM-DD")` ra nửa đêm UTC; `vnWeekday` cộng +7 rồi đọc ngày ⇒ vẫn đúng
  // thứ VN. Đừng đổi sang `getDay()`: hàm đó đọc múi giờ MÁY NGƯỜI DÙNG.
  const mocNgay = ngay ? new Date(`${ngay}T00:00:00.000Z`) : null;
  const docKhung = mocNgay ? khungChoNgay(mocNgay, cauHinhKhung) : null;
  const khungHopLe = docKhung?.ok ? docKhung.giaTri : [];
  const tenThu = mocNgay ? (TEN_THU[THU_KHOA[vnWeekday(mocNgay)]!] ?? "") : "";

  // Khung đang chọn — mặc định khung ĐẦU TIÊN của ngày đó. `null` = ngày không mở.
  const [gio, setGio] = useState<{ startTime: string; endTime: string } | null>(null);
  const khungDung =
    gio && khungHopLe.some((k) => k.startTime <= gio.startTime && gio.endTime <= k.endTime)
      ? gio
      : (khungHopLe[0] ?? null);

  const center = centers.find((c) => c.id === centerId);
  const course = courses.find((c) => c.id === courseId);
  // Chỉ XEM TRƯỚC phần mã cơ sở + mã khoá: số thứ tự do server cấp trong transaction
  // (cùng bộ đếm với mã lớp), client đoán số là chắc chắn có lúc đoán sai.
  const xemTruocTen = center
    ? tenLopTrial(center.code ?? center.name, course?.slug ?? null, 0)
    : "";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!centerId) {
      toast.error("Chọn cơ sở");
      return;
    }
    if (!ngay) {
      toast.error("Chọn ngày mở lớp");
      return;
    }
    if (!khungDung) {
      toast.error(
        docKhung && !docKhung.ok
          ? docKhung.loi
          : `${tenThu} không mở lớp trải nghiệm — chọn ngày khác hoặc sửa ở Cấu hình vận hành`,
      );
      return;
    }
    startTransition(async () => {
      const res = await createLopTrialClassAction({
        centerId,
        courseId: courseId || undefined,
        // Chỉ gửi khi người dùng THỰC SỰ gõ. Gửi cả tên xem-trước là gửi lên một chuỗi
        // có dấu "…" ở chỗ con số — server sẽ lưu nguyên cái dấu đó vào tên lớp.
        name: tenTuGo?.trim() ? tenTuGo.trim() : undefined,
        date: ngay,
        startTime: khungDung.startTime,
        endTime: khungDung.endTime,
      });
      if (res.ok) {
        toast.success("Đã tạo lớp trải nghiệm");
        router.push(res.id ? `/lop-trial/${res.id}` : "/lop-trial");
        router.refresh();
        return;
      }
      toast.error(res.error);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Tên lớp
        <input
          type="text"
          value={tenTuGo ?? (xemTruocTen ? xemTruocTen.replace(/ 0$/, " …") : "")}
          onChange={(e) => setTenTuGo(e.target.value)}
          maxLength={120}
          disabled={pending}
          placeholder="Để trống để hệ thống tự đặt theo quy ước"
          aria-label="Tên lớp"
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        />
        <span className="text-[11px]">
          {tenTuGo === null ? (
            <>
              Đang theo quy ước <strong>Cơ sở-Khoá-Lớp trial số</strong>; số thứ tự do hệ
              thống cấp khi lưu. Gõ vào ô trên để tự đặt tên khác.
            </>
          ) : (
            <>
              Bạn đang tự đặt tên.{" "}
              <button
                type="button"
                onClick={() => setTenTuGo(null)}
                className="underline underline-offset-2 hover:no-underline"
              >
                Dùng lại tên theo quy ước
              </button>
            </>
          )}
        </span>
      </label>

      {/* ── NGÀY + KHUNG GIỜ (22/09/2026) ──────────────────────────────────────────────
          Chủ dự án: "Tạo lớp Trial theo ngày, thứ, và khung thời gian có GV đi làm".
          Ô chọn khung dựng từ CHÍNH cấu hình mà server sẽ kiểm, nên không bao giờ bày
          ra một khung rồi bị server từ chối. */}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Ngày mở lớp *
        <input
          type="date"
          value={ngay}
          onChange={(e) => {
            setNgay(e.target.value);
            // Đổi ngày ⇒ bỏ khung đã chọn: khung của thứ 3 không có nghĩa gì ở thứ 7, và
            // giữ lại là để người dùng lưu một khung mà server sẽ từ chối.
            setGio(null);
          }}
          disabled={pending}
          required
          aria-label="Ngày mở lớp"
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        />
        {tenThu ? <span className="text-[11px]">{tenThu}</span> : null}
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Khung giờ *
        {khungHopLe.length > 0 ? (
          <select
            value={khungDung ? `${khungDung.startTime}-${khungDung.endTime}` : ""}
            onChange={(e) => {
              const [bd, kt] = e.target.value.split("-");
              setGio(bd && kt ? { startTime: bd, endTime: kt } : null);
            }}
            disabled={pending}
            aria-label="Khung giờ"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
          >
            {khungHopLe.map((k) => (
              <option key={`${k.startTime}-${k.endTime}`} value={`${k.startTime}-${k.endTime}`}>
                {k.startTime}–{k.endTime}
              </option>
            ))}
          </select>
        ) : (
          <span
            role="alert"
            className="rounded-lg border border-state-warning-soft bg-state-warning-soft px-3 py-2 text-xs text-state-warning-ink"
          >
            {docKhung && !docKhung.ok
              ? docKhung.loi
              : `${tenThu || "Ngày này"} không mở lớp trải nghiệm. Chọn ngày khác, hoặc sửa khung giờ của thứ này ở Cấu hình vận hành → tab "Lớp & giáo viên".`}
          </span>
        )}
        {khungHopLe.length > 0 ? (
          <span className="text-[11px]">
            {tenThu} mở {keKhung(khungHopLe)}. Sale thêm case trong lớp này chỉ chọn được
            giờ nằm trong khung đã chọn.
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Cơ sở *
        <select
          value={centerId}
          onChange={(e) => setCenterId(e.target.value)}
          disabled={pending}
          required
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Khoá trải nghiệm
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          disabled={pending}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          <option value="">— chưa chọn khoá —</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-[11px]">Chính là &quot;khoá quan tâm&quot; của khách.</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "Đang tạo…" : "Tạo lớp"}
      </button>

      <p className="text-xs text-muted-foreground">
        Tạo xong nhớ <strong>thêm buổi</strong> (ngày, giờ, phòng, giáo viên) ở trang chi
        tiết lớp — lớp chưa có buổi thì giáo viên không thấy gì trên lịch dạy.
      </p>
    </form>
  );
}
