"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleCheck, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { NHAN_TRANG_THAI, type TrangThaiHocPhi } from "@/lib/finance/thieu-hoc-phi";

import { ghiHocPhiBackfillAction } from "../_actions";

export type DongThieu = {
  leadId: string;
  parentName: string;
  phone: string;
  centerName: string;
  studentNames: string[];
  trangThai: TrangThaiHocPhi;
  soDon: number;
  tongPhaiThu: number;
  tongDaThu: number;
  conThieu: number;
  goiYTenKhoa: string | null;
  daCoKhoanNhapLieu: boolean;
};

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/** Pill trạng thái — `inline-flex whitespace-nowrap` là thứ chặn nhãn xuống 2 dòng. */
function Pill({ t }: { t: TrangThaiHocPhi }) {
  const mau =
    t === "CHUA_CO_DON"
      ? "bg-state-danger-soft text-state-danger-ink"
      : t === "CO_DON_CHUA_THU"
        ? "bg-state-warning-soft text-state-warning-ink"
        : "bg-state-info-soft text-state-info-ink";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${mau}`}
    >
      {NHAN_TRANG_THAI[t]}
    </span>
  );
}

/** Ngày hôm nay dạng `yyyy-mm-dd` theo giờ máy — mặc định cho ô ngày đóng. */
function homNay(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ThieuHocPhiClient({
  rows,
  ghiDuoc,
}: {
  rows: DongThieu[];
  ghiDuoc: boolean;
}) {
  const [moDong, setMoDong] = useState<string | null>(null);
  const [soTien, setSoTien] = useState("");
  const [ngay, setNgay] = useState(homNay());
  const [tenKhoa, setTenKhoa] = useState("");
  const [dangGhi, startTransition] = useTransition();
  const [xong, setXong] = useState<Set<string>>(new Set());

  const conLai = useMemo(() => rows.filter((r) => !xong.has(r.leadId)), [rows, xong]);

  const moForm = (r: DongThieu) => {
    setMoDong(r.leadId);
    setSoTien(r.conThieu > 0 ? String(r.conThieu) : "");
    setNgay(homNay());
    setTenKhoa(r.goiYTenKhoa ?? "Học phí khoá học");
  };

  const ghi = (r: DongThieu) => {
    const amount = Math.round(Number(soTien.replace(/[^\d]/g, "")));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Nhập số tiền lớn hơn 0");
      return;
    }
    startTransition(async () => {
      const res = await ghiHocPhiBackfillAction({
        leadId: r.leadId,
        amount,
        paidDate: ngay,
        itemName: tenKhoa.trim() || "Học phí khoá học",
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Đã ghi ${vnd(amount)} cho ${r.parentName}`);
      setXong((s) => new Set(s).add(r.leadId));
      setMoDong(null);
    });
  };

  // Trạng thái RỖNG — nói rõ VÌ SAO rỗng, không phải một ô trống.
  if (conLai.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-6 py-12 text-center">
        <CircleCheck className="mx-auto h-8 w-8 text-state-success-ink" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-foreground">
          Không có học viên nào thiếu học phí
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Mọi lead đã chốt đều có đơn hàng và đã thu đủ. Nhóm &quot;chưa có đơn&quot; chỉ xuất
          hiện sau các lượt chốt hàng loạt không nhập số tiền.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* `cuonNgang` bọc RIÊNG cái bảng trong vùng cuộn — bọc cả PhanTrangBang thì
          cuộn sang phải là mất thanh phân trang (nếp cũ đã vá 25/08). */}
      <PhanTrangBang tenDonVi="phụ huynh" khoaGhiNho="thieu-hoc-phi" cuonNgang>
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Phụ huynh",
                "Học viên",
                "Cơ sở",
                "Trạng thái",
                "Phải thu",
                "Đã thu",
                "Còn thiếu",
                ...(ghiDuoc ? ["Thao tác"] : []),
              ].map((h, i) => (
                <TableHead
                  key={h}
                  className={`whitespace-nowrap text-xs font-semibold uppercase tracking-wide ${
                    i >= 4 && i <= 6 ? "text-right" : ""
                  }`}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {conLai.map((r) => (
              <>
                <TableRow key={r.leadId}>
                  <TableCell className="whitespace-nowrap px-5 py-3.5 text-sm">
                    <span className="font-medium text-foreground">{r.parentName}</span>
                    <span className="ml-2 tabular-nums text-xs text-muted-foreground">
                      {r.phone}
                    </span>
                  </TableCell>
                  <TableCell className="px-5 py-3.5 text-sm">
                    <span className="line-clamp-1">
                      {r.studentNames.length > 0 ? r.studentNames.join(", ") : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5 text-sm text-muted-foreground">
                    {r.centerName}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5">
                    <Pill t={r.trangThai} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5 text-right text-sm tabular-nums">
                    {r.soDon === 0 ? "—" : vnd(r.tongPhaiThu)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5 text-right text-sm tabular-nums">
                    {vnd(r.tongDaThu)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-state-warning-ink">
                    {r.soDon === 0 ? "chưa rõ" : vnd(r.conThieu)}
                  </TableCell>
                  {ghiDuoc && (
                    <TableCell className="whitespace-nowrap px-5 py-3.5 text-right">
                      {r.daCoKhoanNhapLieu ? (
                        <span className="text-xs text-muted-foreground">Đã có khoản nhập liệu</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={moDong === r.leadId ? "outline" : "default"}
                          onClick={() => (moDong === r.leadId ? setMoDong(null) : moForm(r))}
                          className="min-h-9 transition-colors duration-150"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                          {moDong === r.leadId ? "Đóng" : "Ghi học phí"}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>

                {moDong === r.leadId && (
                  <TableRow key={`${r.leadId}-form`} className="bg-muted/40">
                    <TableCell colSpan={ghiDuoc ? 8 : 7} className="px-5 py-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="min-w-0 flex-1 basis-40 text-xs font-medium text-muted-foreground">
                          Số tiền đã thu
                          <Input
                            inputMode="numeric"
                            value={soTien}
                            onChange={(e) => setSoTien(e.target.value)}
                            placeholder="9000000"
                            className="mt-1 tabular-nums"
                          />
                        </label>
                        <label className="min-w-0 basis-36 text-xs font-medium text-muted-foreground">
                          Ngày đóng
                          <Input
                            type="date"
                            value={ngay}
                            onChange={(e) => setNgay(e.target.value)}
                            className="mt-1"
                          />
                        </label>
                        <label className="min-w-0 flex-1 basis-48 text-xs font-medium text-muted-foreground">
                          Nội dung dòng đơn
                          <Input
                            value={tenKhoa}
                            onChange={(e) => setTenKhoa(e.target.value)}
                            className="mt-1"
                          />
                        </label>
                        <Button
                          onClick={() => ghi(r)}
                          disabled={dangGhi}
                          className="min-h-11 transition-colors duration-150"
                        >
                          {dangGhi && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                          Tạo đơn + ghi khoản
                        </Button>
                      </div>
                      <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
                        Tạo đơn hàng đã xác nhận + khoản thu mang dấu nhập liệu ban đầu. Khoản
                        này ở trạng thái <b className="font-semibold text-foreground">chờ kế
                        toán</b> — muốn vào doanh thu thì xác nhận ở màn Thanh toán.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </PhanTrangBang>
    </div>
  );
}
