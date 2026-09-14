"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Coins, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CHINH_SACH_MAC_DINH,
  KIEU_TINH,
  kiemChinhSach,
  LOAI_DON,
  NHAN_KIEU_TINH,
  NHAN_LOAI_DON,
  NHAN_SU_KIEN,
  SU_KIEN,
  tongTiLeTheoSuKien,
  type ChinhSachHoaHong,
  type KieuTinhHoaHong,
  type LoaiDonHoaHong,
  type SuKienHoaHong,
} from "@/lib/crm/chinh-sach-hoa-hong";

import { luuChinhSachHoaHongAction } from "../actions";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
const pct = (n: number) => `${(n * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

const O =
  "min-h-9 w-full min-w-[9rem] rounded-lg border border-border bg-background px-2 text-sm transition-colors duration-150 focus:border-primary focus:outline-none";

/**
 * KHAI CHÍNH SÁCH HOA HỒNG.
 *
 * ⚠️ Ô "Vai nhận" là Ô CHỮ TỰ DO có gợi ý, KHÔNG phải danh sách đóng. Chủ dự án
 * 14/09/2026: "thêm bớt các role nhận hoa hồng riêng chứ không khoá cứng". Danh sách vai
 * có thật chỉ để gợi ý (`<datalist>`) — gõ một mã chưa từng có vẫn lưu được, vì chính
 * sách mới thường ra trước khi vai mới được tạo.
 *
 * ⚠️ Kiểm hợp lệ chạy Ở CẢ HAI ĐẦU bằng CÙNG một hàm `kiemChinhSach`: ở đây để người khai
 * thấy lỗi ngay khi gõ, và ở Server Action vì Server Action là endpoint riêng — gọi thẳng
 * nó thì màn này không đứng chắn được.
 */
export function BangChinhSachHoaHong({
  banDau,
  tranTongTiLe,
  vaiCoThat,
  suaDuoc,
}: {
  banDau: ChinhSachHoaHong[];
  /** `crm.commissionMaxTotalRate` — trần áp cho TỪNG rổ (sự kiện × loại đơn). */
  tranTongTiLe: number;
  /** Mã vai có thật trong hệ thống, chỉ để GỢI Ý. */
  vaiCoThat: string[];
  suaDuoc: boolean;
}) {
  const [ds, setDs] = useState<ChinhSachHoaHong[]>(banDau);
  const [lyDo, setLyDo] = useState("");
  const [dangChay, start] = useTransition();

  const loi = useMemo(() => kiemChinhSach(ds, { tranTongTiLe }), [ds, tranTongTiLe]);
  const doiKhac = useMemo(
    () => JSON.stringify(ds) !== JSON.stringify(banDau),
    [ds, banDau],
  );

  /** Tổng tỉ lệ TỪNG RỔ — cộng chung mọi sự kiện là báo vượt trần giả (xem [CSH-04]). */
  const tongTheoRo = useMemo(
    () =>
      Object.values(SU_KIEN).map((sk) => ({
        suKien: sk,
        khoa: tongTiLeTheoSuKien(ds, sk, "COURSE"),
        sanPham: tongTiLeTheoSuKien(ds, sk, "PRODUCT"),
      })),
    [ds],
  );

  function sua(i: number, vá: Partial<ChinhSachHoaHong>) {
    setDs((c) => c.map((x, j) => (j === i ? { ...x, ...vá } : x)));
  }

  /** Tên → mã: bỏ dấu, viết hoa, nối gạch dưới. Trùng thì thêm hậu tố số. */
  function sinhMa(ten: string, daCo: Set<string>): string {
    const goc =
      ten
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/gi, "d")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "CHINH_SACH";
    if (!daCo.has(goc)) return goc;
    for (let i = 2; i < 999; i++) if (!daCo.has(`${goc}_${i}`)) return `${goc}_${i}`;
    return `${goc}_X`;
  }

  function them() {
    setDs((c) => [
      ...c,
      {
        ma: sinhMa("Chính sách mới", new Set(c.map((x) => x.ma))),
        ten: "Chính sách mới",
        vaiNhan: "",
        suKien: "HOC_VIEN_MOI",
        loaiDon: "COURSE",
        kieuTinh: "PHAN_TRAM",
        giaTri: 0,
        nguon: "",
        bat: false,
      },
    ]);
  }

  function luu() {
    start(async () => {
      const r = await luuChinhSachHoaHongAction({ chinhSach: ds, lyDo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Đã lưu ${ds.length} chính sách hoa hồng`);
      setLyDo("");
    });
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Coins className="h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
          Chính sách hoa hồng
        </h2>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
          Mỗi dòng là <b className="font-semibold text-foreground">một khoản chi</b>, khai
          theo bốn trục: ai nhận · khi nào · loại đơn nào · tính thế nào. Thêm bớt tuỳ ý —
          không cần lập trình viên. Bộ khởi đầu chép từ{" "}
          <b className="font-semibold text-foreground">SR.QD.208</b>; sửa xong thì bản trong
          hệ thống thắng.
        </p>
      </div>

      {/* Tổng theo rổ — con số duy nhất người duyệt chính sách thật sự cần nhìn */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tongTheoRo.map((r) => {
          const vuot = r.khoa > tranTongTiLe + 1e-9 || r.sanPham > tranTongTiLe + 1e-9;
          return (
            <div
              key={r.suKien}
              className={`min-w-0 rounded-xl border px-3 py-2.5 ${
                vuot ? "border-state-danger bg-state-danger-soft" : "border-border bg-background"
              }`}
            >
              <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {NHAN_SU_KIEN[r.suKien]}
              </p>
              <p
                className={`mt-1 truncate text-lg font-bold tabular-nums ${
                  vuot ? "text-state-danger-ink" : "text-foreground"
                }`}
              >
                {pct(r.khoa)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                đơn khoá học · trần {pct(tranTongTiLe)}
              </p>
            </div>
          );
        })}
      </div>

      {loi.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-state-danger bg-state-danger-soft px-4 py-3"
        >
          <p className="flex items-start gap-2 text-xs font-semibold text-state-danger-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Chưa lưu được — {loi.length} lỗi:
          </p>
          <ul className="mt-1.5 space-y-0.5 pl-6 text-xs leading-relaxed text-state-danger-ink">
            {loi.map((l) => (
              <li key={l} className="list-disc">
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        {/* ⚠️ min-w BẮT BUỘC: 9 cột mà cột nào cũng chứa ô nhập, để bảng co theo khung
            thì trình duyệt bóp mỗi ô còn vài chục pixel — đo trên màn 1531px: mã chính
            sách đè lên ô vai nhận, ba ô chọn cụt thành "H", "Đơ", "% trị". Cho bảng một
            bề rộng tối thiểu rồi cuộn ngang là cách duy nhất giữ được mọi ô đọc được. */}
        <Table className="min-w-[86rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
                  Bật
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
                  Tên chính sách
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
                  Vai nhận
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
                  Khi nào
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
                  Loại đơn
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
                  Cách tính
                </TableHead>
                <TableHead className="whitespace-nowrap text-right text-xs font-semibold uppercase tracking-wide">
                  Giá trị
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
                  Nguồn
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
                  <span className="sr-only">Xoá</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ds.map((c, i) => (
                <TableRow key={`${c.ma}-${i}`}>
                  <TableCell className="whitespace-nowrap px-5 py-3.5">
                    <input
                      type="checkbox"
                      checked={c.bat}
                      disabled={!suaDuoc}
                      onChange={(e) => sua(i, { bat: e.target.checked })}
                      aria-label={`Bật chính sách ${c.ten}`}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </TableCell>
                  <TableCell className="min-w-[17rem] px-5 py-3.5">
                    <Input
                      value={c.ten}
                      disabled={!suaDuoc}
                      onChange={(e) => {
                        const ten = e.target.value;
                        // Dòng CHƯA BẬT là dòng đang soạn ⇒ mã bám theo tên. Dòng đã bật
                        // thì GIỮ NGUYÊN mã: nó có thể đã đi vào dòng hoa hồng đã sinh,
                        // và đổi mã lúc đó là làm mồ côi những dòng ấy.
                        sua(
                          i,
                          c.bat
                            ? { ten }
                            : { ten, ma: sinhMa(ten, new Set(ds.filter((_, j) => j !== i).map((x) => x.ma))) },
                        );
                      }}
                      className="w-full"
                      aria-label="Tên chính sách"
                    />
                    {/* MÃ là định danh kỹ thuật, không phải thứ người vận hành cần gõ —
                        nó tự sinh từ tên khi thêm dòng. Để nó thành ô nhập thứ hai trong
                        cùng một ô bảng thì ô tràn sang cột bên cạnh và đè chữ (đo trên
                        màn 1531px). Hiện dạng chữ nhỏ là đủ để đối chiếu khi cần. */}
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {c.ma}
                    </p>
                  </TableCell>
                  <TableCell className="min-w-[15rem] px-5 py-3.5">
                    {/* Ô CHỮ có gợi ý, không phải danh sách đóng — xem chú thích đầu file. */}
                    <Input
                      value={c.vaiNhan}
                      disabled={!suaDuoc}
                      list="vai-nhan-hoa-hong"
                      placeholder="SALES_CSM…"
                      onChange={(e) => sua(i, { vaiNhan: e.target.value })}
                      className="w-full font-mono text-xs"
                      aria-label="Mã vai nhận hoa hồng"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5">
                    <select
                      value={c.suKien}
                      disabled={!suaDuoc}
                      onChange={(e) => sua(i, { suKien: e.target.value as SuKienHoaHong })}
                      className={O}
                      aria-label="Sự kiện sinh hoa hồng"
                    >
                      {Object.values(SU_KIEN).map((k) => (
                        <option key={k} value={k}>
                          {NHAN_SU_KIEN[k]}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5">
                    <select
                      value={c.loaiDon}
                      disabled={!suaDuoc}
                      onChange={(e) => sua(i, { loaiDon: e.target.value as LoaiDonHoaHong })}
                      className={O}
                      aria-label="Loại đơn áp dụng"
                    >
                      {Object.values(LOAI_DON).map((k) => (
                        <option key={k} value={k}>
                          {NHAN_LOAI_DON[k]}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5">
                    <select
                      value={c.kieuTinh}
                      disabled={!suaDuoc}
                      onChange={(e) => sua(i, { kieuTinh: e.target.value as KieuTinhHoaHong })}
                      className={O}
                      aria-label="Cách tính"
                    >
                      {Object.values(KIEU_TINH).map((k) => (
                        <option key={k} value={k}>
                          {NHAN_KIEU_TINH[k]}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5 text-right">
                    {c.kieuTinh === KIEU_TINH.PHAN_TRAM ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          disabled={!suaDuoc}
                          // Người khai gõ theo PHẦN TRĂM (4), lưu theo tỉ lệ (0,04).
                          // Bắt gõ 0,04 là mời nhầm — và nhầm ở đây chi gấp 100 lần.
                          value={Number((c.giaTri * 100).toFixed(4))}
                          onChange={(e) =>
                            sua(i, { giaTri: (Number(e.target.value) || 0) / 100 })
                          }
                          className="w-24 text-right tabular-nums"
                          aria-label="Tỉ lệ phần trăm"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    ) : c.kieuTinh === KIEU_TINH.SO_TIEN_CO_DINH ? (
                      <MoneyInput
                        name={`giaTri-${i}`}
                        value={c.giaTri}
                        min={0}
                        disabled={!suaDuoc}
                        onValueChange={(v) => sua(i, { giaTri: v ?? 0 })}
                      />
                    ) : (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {(c.bac ?? []).length} bậc ·{" "}
                        {(c.bac ?? []).length > 0
                          ? `${vnd(Math.min(...(c.bac ?? []).map((b) => b.thuong)))}–${vnd(
                              Math.max(...(c.bac ?? []).map((b) => b.thuong)),
                            )}`
                          : "chưa khai"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[18rem] px-5 py-3.5">
                    <Input
                      value={c.nguon ?? ""}
                      disabled={!suaDuoc}
                      placeholder="SR.QD.208 · PL…"
                      onChange={(e) => sua(i, { nguon: e.target.value })}
                      className="w-full text-xs"
                      aria-label="Nguồn văn bản"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5">
                    {suaDuoc && (
                      <button
                        type="button"
                        onClick={() => setDs((c2) => c2.filter((_, j) => j !== i))}
                        aria-label={`Xoá chính sách ${c.ten}`}
                        className="inline-flex min-h-9 items-center rounded-md border border-border bg-background px-2 text-xs text-state-danger-ink transition-colors duration-150 hover:bg-state-danger-soft"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
        </Table>

        {ds.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Chưa có chính sách nào</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Không chính sách nào nghĩa là <b className="font-semibold">không chi hoa hồng</b>.
              Đó là một lựa chọn hợp lệ — nhưng nếu không cố ý thì nạp lại bộ theo công văn.
            </p>
          </div>
        )}
      </div>

      {/* Gợi ý vai có thật — chỉ gợi ý, ô vẫn nhập tự do. */}
      <datalist id="vai-nhan-hoa-hong">
        {vaiCoThat.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {suaDuoc && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={them} className="min-h-11">
            <Plus className="h-4 w-4" aria-hidden />
            Thêm chính sách
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDs(CHINH_SACH_MAC_DINH)}
            className="min-h-11"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Nạp lại bộ theo công văn
          </Button>
          <Input
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder="Lý do thay đổi (bắt buộc)"
            className="min-w-0 flex-1 sm:max-w-sm"
            aria-label="Lý do thay đổi"
          />
          <Button
            type="button"
            onClick={luu}
            disabled={dangChay || loi.length > 0 || lyDo.trim().length < 5 || !doiKhac}
            className="min-h-11"
          >
            {dangChay ? "Đang lưu…" : "Lưu chính sách"}
          </Button>
          {!doiKhac && (
            <span className="text-xs text-muted-foreground">Chưa có thay đổi nào.</span>
          )}
        </div>
      )}
    </section>
  );
}
