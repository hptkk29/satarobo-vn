"use client";

/**
 * Site Sale — biểu mẫu tạo yêu cầu chuyển lớp / chuyển cơ sở.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/chuyen-lop/_components/transfer-form.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Hai đường GHI vẫn gọi ĐÚNG Server Action của khu quản
 *    trị (`listEligibleClassesAction` · `createTransferRequestAction`) — nơi có
 *    kiểm quyền, luật "lớp đích cùng khoá, không vượt tiến độ", và luật đưa vào
 *    danh sách chờ khi hết chỗ. Nhân bản LOGIC chuyển lớp là cách chắc chắn nhất
 *    để hai khu có hai luật chuyển lớp khác nhau.
 *
 * GIỮ NGUYÊN 100%: bốn bước đúng thứ tự đúng nhãn, mọi câu trong ô chọn ("— Chọn
 * cơ sở nguồn trước —", "Đang nạp học viên…", "— Cơ sở chưa có HV đang học —",
 * "— Mọi cơ sở —", "— Chọn lớp đích (để trống = waitlist) —"), dòng "Tiến độ học
 * viên: N bài. Lớp đích không vượt quá mức này.", cảnh báo "Không có lớp phù hợp
 * → tạo yêu cầu sẽ vào danh sách chờ.", ô "Lý do chuyển", hai nút, và mọi toast.
 *
 * ── ĐỔI CÁCH BÀY, KHÔNG ĐỔI HÀNH VI ─────────────────────────────────────────
 * 1. `<select>` GỐC → `<Select>` của kho (cùng lý do đã ghi ở
 *    `dang-ky-hoc/_components/bo-loc.tsx`).
 * 2. Bốn bước xếp lưới 2 cột lộn xộn với nút "Tìm lớp đích" nằm giữa → một cột
 *    dọc có ĐÁNH SỐ: đây là quy trình bốn bước phụ thuộc nhau, không phải bốn ô
 *    lọc độc lập; bày như lưới lọc là mời người dùng bấm sai thứ tự.
 * 3. Phần "lớp đích" chỉ hiện sau khi tìm — giữ nguyên, nhưng nằm trong một tầng
 *    nền chìm để đọc ra là "kết quả của bước vừa bấm".
 *
 * ⚠️ ĐIỀU HƯỚNG `/sale/chuyen-lop`, KHÔNG phải `/chuyen-lop` như bản admin.
 *    Đường trần là clean URL của host quản trị; trên host Sale nó bị viết lại
 *    thành `/sale/chuyen-lop` — đúng đích nhưng bằng rewrite, nên thanh địa chỉ
 *    giữ URL cũ và mục điều hướng không sáng đúng chỗ.
 *
 * ⚠️ PHẢI `router.refresh()` SAU KHI TẠO. Server Action bên admin gọi
 *    `revalidatePath("/admin/chuyen-lop")` — một đường của KHU QUẢN TRỊ. Thiếu
 *    `refresh()` thì bảng "Yêu cầu đang chờ" ngay dưới không mọc thêm dòng vừa
 *    tạo, và người dùng bấm tạo lần thứ hai.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  listEligibleClassesAction,
  createTransferRequestAction,
} from "@/app/(admin)/admin/chuyen-lop/_actions";
import type { MucCoSo, MucHocVienChuyen } from "@/lib/sale/chuyen-lop";

type LopDuDieuKien = {
  classId: string;
  name: string;
  classCode: string | null;
  centerName: string | null;
  coveredLessons: number;
  openSeats: number;
};

/** Giá trị ảo cho "chưa chọn" — chuỗi rỗng là giá trị "chưa chọn gì" của điều khiển. */
const CHUA_CHON = "__chua_chon__";
/** "— Mọi cơ sở —" ở bước 4 là một LỰA CHỌN thật, không phải "chưa chọn". */
const MOI_CO_SO = "__moi_co_so__";
/** "để trống = waitlist" cũng là một lựa chọn thật ở ô lớp đích. */
const CHUA_CO_LOP = "__chua_co_lop__";

const O_DIEU_KHIEN = "h-9 w-full rounded-lg bg-card text-sm";
const NHAN_BUOC = "mb-1 block text-xs font-medium text-muted-foreground";

export function FormChuyenLop({
  hocVien,
  coSo,
  maCoSoNguon,
}: {
  hocVien: MucHocVienChuyen[];
  coSo: MucCoSo[];
  maCoSoNguon: string;
}) {
  const router = useRouter();
  const [maHocVien, setMaHocVien] = useState(CHUA_CHON);
  const [maLopHienTai, setMaLopHienTai] = useState(CHUA_CHON);
  const [maCoSoDich, setMaCoSoDich] = useState(MOI_CO_SO);
  const [maLopDich, setMaLopDich] = useState(CHUA_CO_LOP);
  const [lyDo, setLyDo] = useState("");
  const [duDieuKien, setDuDieuKien] = useState<LopDuDieuKien[] | null>(null);
  const [tienDo, setTienDo] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [dangNap, startNap] = useTransition();

  const hv = hocVien.find((s) => s.id === maHocVien);

  // FL2-06 (LD-6) — chọn CƠ SỞ NGUỒN trước → máy chủ nạp HV của cơ sở đó (qua
  // tham số URL, RSC dựng lại). Đổi cơ sở thì reset các bước phụ thuộc phía dưới.
  function chonCoSoNguon(giaTri: string) {
    setMaHocVien(CHUA_CHON);
    setMaLopHienTai(CHUA_CHON);
    setDuDieuKien(null);
    startNap(() =>
      router.push(
        giaTri === CHUA_CHON
          ? "/sale/chuyen-lop"
          : `/sale/chuyen-lop?fromCenterId=${encodeURIComponent(giaTri)}`,
      ),
    );
  }

  function timLopDich() {
    if (maHocVien === CHUA_CHON || maLopHienTai === CHUA_CHON) {
      toast.error("Chọn học viên và lớp hiện tại");
      return;
    }
    start(async () => {
      const res = await listEligibleClassesAction({
        studentId: maHocVien,
        fromClassId: maLopHienTai,
        toCenterId: maCoSoDich === MOI_CO_SO ? undefined : maCoSoDich,
      });
      if (res.ok) {
        setDuDieuKien((res.classes as LopDuDieuKien[]) ?? []);
        setTienDo(res.studentCovered ?? null);
        setMaLopDich(CHUA_CO_LOP);
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  function taoYeuCau() {
    if (maHocVien === CHUA_CHON || maLopHienTai === CHUA_CHON) return;
    start(async () => {
      const res = await createTransferRequestAction({
        studentId: maHocVien,
        fromClassId: maLopHienTai,
        toClassId: maLopDich === CHUA_CO_LOP ? "" : maLopDich,
        toCenterId: maCoSoDich === MOI_CO_SO ? "" : maCoSoDich,
        reason: lyDo,
      });
      if (res.ok) {
        toast.success(
          res.waitlisted
            ? "Đã đưa vào danh sách chờ (chưa có lớp)"
            : "Đã tạo yêu cầu chuyển — chờ duyệt",
        );
        setDuDieuKien(null);
        setMaLopDich(CHUA_CO_LOP);
        setLyDo("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  const nhanHocVien = (id: string) => {
    const s = hocVien.find((x) => x.id === id);
    if (!s) return "— Chọn —";
    return s.ma ? `${s.ten} (${s.ma})` : s.ten;
  };

  const nhanLopDich = (id: string) => {
    const c = duDieuKien?.find((x) => x.classId === id);
    if (!c) return "— Chọn lớp đích (để trống = waitlist) —";
    return `${c.name}${c.classCode ? ` (${c.classCode})` : ""} · ${c.centerName ?? "—"}`;
  };

  return (
    <div className="grid gap-4 px-5 py-4 lg:grid-cols-2">
      <label className="block">
        <span className={NHAN_BUOC}>Bước 1 — Cơ sở nguồn</span>
        <Select
          value={maCoSoNguon || CHUA_CHON}
          onValueChange={(v) => {
            if (v !== null) chonCoSoNguon(String(v));
          }}
        >
          <SelectTrigger className={O_DIEU_KHIEN} disabled={dangNap}>
            <SelectValue>
              {(v: string | null) =>
                v && v !== CHUA_CHON
                  ? (coSo.find((c) => c.id === v)?.ten ?? "— Chọn cơ sở —")
                  : "— Chọn cơ sở —"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={CHUA_CHON}>— Chọn cơ sở —</SelectItem>
            {coSo.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.ten}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="block">
        <span className={NHAN_BUOC}>Bước 2 — Học viên</span>
        <Select
          value={maHocVien}
          onValueChange={(v) => {
            if (v === null) return;
            setMaHocVien(String(v));
            setMaLopHienTai(CHUA_CHON);
            setDuDieuKien(null);
          }}
        >
          <SelectTrigger className={O_DIEU_KHIEN} disabled={!maCoSoNguon || dangNap}>
            <SelectValue>
              {(v: string | null) =>
                v && v !== CHUA_CHON
                  ? nhanHocVien(String(v))
                  : !maCoSoNguon
                    ? "— Chọn cơ sở nguồn trước —"
                    : dangNap
                      ? "Đang nạp học viên…"
                      : hocVien.length === 0
                        ? "— Cơ sở chưa có HV đang học —"
                        : "— Chọn —"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-80 min-w-[20rem]">
            <SelectItem value={CHUA_CHON}>— Chọn —</SelectItem>
            {hocVien.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.ma ? `${s.ten} (${s.ma})` : s.ten}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="block">
        <span className={NHAN_BUOC}>Bước 3 — Lớp hiện tại</span>
        <Select
          value={maLopHienTai}
          onValueChange={(v) => {
            if (v === null) return;
            setMaLopHienTai(String(v));
            setDuDieuKien(null);
          }}
        >
          <SelectTrigger className={O_DIEU_KHIEN} disabled={!hv}>
            <SelectValue>
              {(v: string | null) =>
                v && v !== CHUA_CHON
                  ? (hv?.lop.find((c) => c.maLop === v)?.nhan ?? "— Chọn —")
                  : "— Chọn —"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-80 min-w-[20rem]">
            <SelectItem value={CHUA_CHON}>— Chọn —</SelectItem>
            {hv?.lop.map((c) => (
              <SelectItem key={c.maLop} value={c.maLop}>
                {c.nhan}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="block">
        <span className={NHAN_BUOC}>Bước 4 — Cơ sở đích (tuỳ chọn)</span>
        <Select
          value={maCoSoDich}
          onValueChange={(v) => {
            if (v !== null) setMaCoSoDich(String(v));
          }}
        >
          <SelectTrigger className={O_DIEU_KHIEN}>
            <SelectValue>
              {(v: string | null) =>
                v && v !== MOI_CO_SO
                  ? (coSo.find((c) => c.id === v)?.ten ?? "— Mọi cơ sở —")
                  : "— Mọi cơ sở —"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={MOI_CO_SO}>— Mọi cơ sở —</SelectItem>
            {coSo.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.ten}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="lg:col-span-2">
        <button
          type="button"
          onClick={timLopDich}
          disabled={pending}
          className={cn(
            "inline-flex h-9 items-center rounded-lg border border-border bg-card px-4",
            "text-sm font-medium text-foreground transition-colors",
            "hover:bg-[color:var(--surface-chim)] disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
          )}
        >
          Tìm lớp đích phù hợp
        </button>
      </div>

      {duDieuKien ? (
        <div className="space-y-2 rounded-xl bg-[color:var(--surface-chim)] p-3 lg:col-span-2">
          <p className="text-xs text-muted-foreground">
            Tiến độ học viên: {tienDo ?? 0} bài. Lớp đích không vượt quá mức này.
          </p>
          {duDieuKien.length === 0 ? (
            <p className="rounded-lg bg-[color:var(--state-warning-soft)] px-3 py-2 text-sm text-[color:var(--state-warning)]">
              Không có lớp phù hợp → tạo yêu cầu sẽ vào danh sách chờ.
            </p>
          ) : (
            <Select
              value={maLopDich}
              onValueChange={(v) => {
                if (v !== null) setMaLopDich(String(v));
              }}
            >
              <SelectTrigger aria-label="Lớp đích" className={O_DIEU_KHIEN}>
                <SelectValue>
                  {(v: string | null) =>
                    v && v !== CHUA_CO_LOP
                      ? nhanLopDich(String(v))
                      : "— Chọn lớp đích (để trống = waitlist) —"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80 min-w-[26rem]">
                <SelectItem value={CHUA_CO_LOP}>
                  — Chọn lớp đích (để trống = waitlist) —
                </SelectItem>
                {duDieuKien.map((c) => (
                  <SelectItem key={c.classId} value={c.classId} disabled={c.openSeats <= 0}>
                    {c.name}
                    {c.classCode ? ` (${c.classCode})` : ""} · {c.centerName ?? "—"} ·{" "}
                    {c.coveredLessons} bài ·{" "}
                    {c.openSeats > 0 ? `còn ${c.openSeats} chỗ` : "hết chỗ"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ) : null}

      <label className="block lg:col-span-2">
        <span className={NHAN_BUOC}>Lý do chuyển</span>
        <textarea
          value={lyDo}
          onChange={(e) => setLyDo(e.target.value)}
          rows={2}
          className={cn(
            "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm",
            "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
          )}
        />
      </label>

      {duDieuKien ? (
        <div className="lg:col-span-2">
          <button
            type="button"
            onClick={taoYeuCau}
            disabled={pending}
            className={cn(
              "inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium transition-colors",
              "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
              "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
            )}
          >
            Tạo yêu cầu chuyển
          </button>
        </div>
      ) : null}
    </div>
  );
}
