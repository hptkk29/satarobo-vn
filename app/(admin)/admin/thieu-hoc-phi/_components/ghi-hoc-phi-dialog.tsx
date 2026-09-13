"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { computeEnrollmentPrice } from "@/lib/finance/pricing";

import { ghiHocPhiBackfillAction } from "../_actions";
import type { DongThieu } from "./thieu-hoc-phi-client";

/**
 * HỘP THOẠI ghi học phí cũ cho một phụ huynh.
 *
 * ⚠️ VÌ SAO LÀ HỘP THOẠI, KHÔNG PHẢI HÀNG NHẬP TRONG BẢNG: form này có 7 ô (loại đơn,
 * giảm giá, giá niêm yết, đã thu, còn thiếu, ngày đóng, ghi chú). Nhồi vào một hàng
 * bảng thì nhãn đè lên ô và bảng phải cuộn ngang — đã dựng thử và vỡ đúng như vậy.
 *
 * ⚠️ BA SỐ PHẢI TÁCH RIÊNG, không gộp thành một: **giá niêm yết** · **giảm giá** ·
 * **đã thu**. Dữ liệu cũ có đủ kiểu — thu đủ, cọc, trả góp, có khuyến mãi. Nếu chỉ nhận
 * MỘT con số thì mọi dòng thành "thu đủ, không nợ", tức **xoá sạch công nợ cũ**. Đây
 * đúng bài học đã đo trên file thật 04/08 (`lib/lead/import-fee-plan.ts`): suy phần
 * chênh thành giảm giá làm mất ~30 triệu tiền phải đòi.
 *
 * "Còn thiếu" là số SUY RA, hiện ngay khi gõ, và KHÔNG cho nhập tay — người nhập không
 * phải tự trừ, và không thể gõ ra một con số không khớp hai số kia.
 */

const LOAI_DON = [
  { v: "COURSE", l: "Khoá học (ghi danh lớp)" },
  { v: "PACKAGE", l: "Gói khoá học" },
  { v: "EXAM", l: "Lệ phí thi" },
  { v: "PRODUCT", l: "Học cụ / sản phẩm" },
  { v: "COMBO", l: "Combo" },
] as const;

const LOAI_GIAM = [
  { v: "NONE", l: "Không giảm" },
  { v: "PERCENT", l: "Giảm theo % " },
  { v: "AMOUNT", l: "Giảm số tiền" },
  { v: "PROGRAM", l: "Ưu đãi chương trình (số tiền)" },
  { v: "SCHOLARSHIP", l: "Học bổng (%)" },
] as const;

type LoaiGiam = (typeof LOAI_GIAM)[number]["v"];

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
/** Bỏ mọi ký tự không phải số — người nhập hay gõ "9.000.000". */
const soTu = (s: string) => Math.round(Number(s.replace(/[^\d]/g, "")) || 0);

function homNay(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function GhiHocPhiDialog({
  dong,
  onClose,
  onXong,
}: {
  dong: DongThieu | null;
  onClose: () => void;
  onXong: (leadId: string) => void;
}) {
  const [orderType, setOrderType] = useState<string>("COURSE");
  const [itemName, setItemName] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [loaiGiam, setLoaiGiam] = useState<LoaiGiam>("NONE");
  const [mucGiam, setMucGiam] = useState("");
  const [lyDoGiam, setLyDoGiam] = useState("");
  const [daThu, setDaThu] = useState("");
  const [ngay, setNgay] = useState(homNay());
  const [ghiChu, setGhiChu] = useState("");
  const [dangGhi, startTransition] = useTransition();

  // Nạp giá trị gợi ý mỗi lần mở một dòng khác.
  const [dongDaNap, setDongDaNap] = useState<string | null>(null);
  if (dong && dongDaNap !== dong.leadId) {
    setDongDaNap(dong.leadId);
    setOrderType("COURSE");
    setItemName(dong.goiYTenKhoa ?? "Học phí khoá học");
    setListPrice(dong.tongPhaiThu > 0 ? String(dong.tongPhaiThu) : "");
    setLoaiGiam("NONE");
    setMucGiam("");
    setLyDoGiam("");
    setDaThu(dong.tongDaThu > 0 ? String(dong.tongDaThu) : "");
    setNgay(homNay());
    setGhiChu("");
  }

  // Tính bằng ĐÚNG `computeEnrollmentPrice` mà server dùng — hai bên không được lệch.
  const gia = useMemo(() => {
    const lp = soTu(listPrice);
    const mg = Number(mucGiam.replace(/[^\d.]/g, "")) || 0;
    return computeEnrollmentPrice({
      listPrice: lp,
      discount: loaiGiam === "NONE" ? null : { type: loaiGiam, value: mg },
    });
  }, [listPrice, loaiGiam, mucGiam]);

  const thu = soTu(daThu);
  const conThieu = Math.max(0, gia.finalPrice - thu);
  const thuQuaNhieu = thu > gia.finalPrice && gia.finalPrice > 0;
  const canLyDo = loaiGiam !== "NONE" && gia.discountAmount > 0;

  const ghi = () => {
    if (!dong) return;
    startTransition(async () => {
      const res = await ghiHocPhiBackfillAction({
        leadId: dong.leadId,
        orderType,
        listPrice: soTu(listPrice),
        discountType: loaiGiam === "NONE" ? null : loaiGiam,
        discountValue: loaiGiam === "NONE" ? null : Number(mucGiam.replace(/[^\d.]/g, "")) || 0,
        discountReason: lyDoGiam.trim() || null,
        amount: thu,
        paidDate: ngay,
        itemName,
        note: ghiChu.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.conThieu > 0
          ? `Đã ghi ${vnd(thu)} · còn nợ ${vnd(res.conThieu)}`
          : `Đã ghi ${vnd(thu)} · thu đủ`,
      );
      onXong(dong.leadId);
      onClose();
    });
  };

  return (
    <Dialog open={dong != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Ghi học phí cũ</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {dong ? (
              <>
                <b className="font-semibold text-foreground">{dong.parentName}</b>
                {dong.studentNames.length > 0 && <> · {dong.studentNames.join(", ")}</>}
                {" · "}
                {dong.centerName}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="loaidon" className="text-xs">
              Loại đơn hàng
            </Label>
            <Select value={orderType} onValueChange={(v) => setOrderType(v ?? "COURSE")}>
              <SelectTrigger id="loaidon" className="mt-1">
                {/* `SelectValue` của base-ui in GIÁ TRỊ THÔ ("COURSE") nếu không tra nhãn.
                    Mẫu của repo là RENDER-PROP (xem attendance-class-list.tsx:144). */}
                <SelectValue>
                  {(v: string | null) =>
                    LOAI_DON.find((o) => o.v === v)?.l ?? "Chọn loại đơn"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOAI_DON.map((o) => (
                  <SelectItem key={o.v} value={o.v}>
                    {o.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="noidung" className="text-xs">
              Nội dung dòng đơn
            </Label>
            <Input
              id="noidung"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Sata3 — Ươm Mầm Tài Năng (48 buổi)"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="giagoc" className="text-xs">
              Giá niêm yết (trước giảm)
            </Label>
            <Input
              id="giagoc"
              inputMode="numeric"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
              placeholder="10560000"
              className="mt-1 tabular-nums"
            />
          </div>

          <div>
            <Label htmlFor="ngay" className="text-xs">
              Ngày đóng
            </Label>
            <Input
              id="ngay"
              type="date"
              value={ngay}
              onChange={(e) => setNgay(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="loaigiam" className="text-xs">
              Chính sách giảm giá
            </Label>
            <Select value={loaiGiam} onValueChange={(v) => setLoaiGiam((v ?? "NONE") as LoaiGiam)}>
              <SelectTrigger id="loaigiam" className="mt-1">
                <SelectValue>
                  {(v: string | null) => LOAI_GIAM.find((o) => o.v === v)?.l ?? "Không giảm"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOAI_GIAM.map((o) => (
                  <SelectItem key={o.v} value={o.v}>
                    {o.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="mucgiam" className="text-xs">
              Mức giảm{" "}
              <span className="text-muted-foreground">
                {loaiGiam === "PERCENT" || loaiGiam === "SCHOLARSHIP" ? "(%)" : "(đồng)"}
              </span>
            </Label>
            <Input
              id="mucgiam"
              inputMode="numeric"
              value={mucGiam}
              onChange={(e) => setMucGiam(e.target.value)}
              disabled={loaiGiam === "NONE"}
              placeholder={loaiGiam === "PERCENT" || loaiGiam === "SCHOLARSHIP" ? "25" : "500000"}
              className="mt-1 tabular-nums"
            />
          </div>

          {canLyDo && (
            <div className="sm:col-span-2">
              <Label htmlFor="lydogiam" className="text-xs">
                Lý do giảm giá
              </Label>
              <Input
                id="lydogiam"
                value={lyDoGiam}
                onChange={(e) => setLyDoGiam(e.target.value)}
                placeholder="Giới thiệu · ưu đãi hè 2026 · học bổng…"
                className="mt-1"
              />
            </div>
          )}

          <div>
            <Label htmlFor="dathu" className="text-xs">
              Tiền ĐÃ THU
            </Label>
            <Input
              id="dathu"
              inputMode="numeric"
              value={daThu}
              onChange={(e) => setDaThu(e.target.value)}
              placeholder="9000000"
              className="mt-1 tabular-nums"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="ghichu" className="text-xs">
              Ghi chú
            </Label>
            <Textarea
              id="ghichu"
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              rows={2}
              placeholder="Cọc 1tr, cuối tháng đóng nốt · chuyển khoản 05/07…"
              className="mt-1"
            />
          </div>
        </div>

        {/* Ba số SUY RA — hiện ngay khi gõ, không cho nhập tay. */}
        <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tổng phải đóng
            </p>
            <p className="mt-1 truncate text-xl font-bold tabular-nums text-foreground">
              {vnd(gia.finalPrice)}
            </p>
            {gia.discountAmount > 0 && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                đã giảm {vnd(gia.discountAmount)}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Đã thu
            </p>
            <p className="mt-1 truncate text-xl font-bold tabular-nums text-state-success-ink">
              {vnd(thu)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Còn thiếu
            </p>
            <p
              className={`mt-1 truncate text-xl font-bold tabular-nums ${
                conThieu > 0 ? "text-state-warning-ink" : "text-muted-foreground"
              }`}
            >
              {vnd(conThieu)}
            </p>
          </div>
        </div>

        {thuQuaNhieu && (
          <p
            role="alert"
            className="rounded-xl border border-state-danger bg-state-danger-soft px-4 py-2.5 text-xs leading-relaxed text-state-danger-ink"
          >
            Đã thu lớn hơn tổng phải đóng. Kiểm lại giá niêm yết hoặc mức giảm — ghi thế này
            là tạo ra một khoản thu thừa không có căn cứ.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={dangGhi}>
            Huỷ
          </Button>
          <Button
            onClick={ghi}
            disabled={dangGhi || thu <= 0 || thuQuaNhieu || !itemName.trim()}
            className="min-h-11"
          >
            {dangGhi && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <span className="whitespace-nowrap">Tạo đơn + ghi khoản</span>
          </Button>
        </DialogFooter>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Tạo đơn hàng đã xác nhận + khoản thu mang dấu nhập liệu ban đầu. Khoản ở trạng thái{" "}
          <b className="font-semibold text-foreground">chờ kế toán</b> — muốn vào doanh thu thì
          xác nhận hàng loạt ở màn Thanh toán. Phần còn thiếu ở lại thành công nợ.
        </p>
      </DialogContent>
    </Dialog>
  );
}
