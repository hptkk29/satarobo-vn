"use client";

// Ngăn xử lý MỘT lần thu — docs/ke-toan-hoa-don/PLAN.md §4 + §10.
//
// ⚠️ Người gọi PHẢI đặt `key={dong.key}`: đổi dòng là mount lại từ đầu, mọi ô (tệp đã chọn, số hoá
// đơn) về rỗng. Không có `key` thì PDF của khách A (có MST, CCCD) nằm lại trong ô chọn tệp khi kế
// toán sang khách B — bẫy "router.refresh không reset form" (memory feedback_router_refresh…).
// ⚠️ Nút nào sáng / tắt đọc từ `dong.hanhDong` (luật thuần `hanhDongChoDong`), không tự suy ở đây.

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { cn } from "@/lib/utils";
import { kyHieuTheoNam } from "@/lib/finance/hoa-don/ky-hieu";
import type { DongHangCho } from "@/lib/finance/hoa-don/dong-hang-cho";
import { LY_DO_DA_XUAT_NGOAI, LY_DO_KHONG_XUAT_CO_DINH } from "@/lib/finance/hoa-don/ly-do-khong-xuat";
import { goHoaDonAction, khongXuatHoaDonAction, luuHoaDonNhapAction, xacNhanHoaDonAction } from "../_actions";
import { taiTepHoaDon } from "./tai-tep-hoa-don";

const tien = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
const ddmmyyyy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const homNayVn = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const coTep = (f: File) => `${f.name} · ${Math.max(1, Math.round(f.size / 1024))} KB`;

export function NganLanThu({ dong }: { dong: DongHangCho }) {
  const hd = dong.hoaDon;
  const lech = [
    dong.thieu > 0 && `Thiếu ${tien(dong.thieu)} so với ${dong.nhanDot ?? "đợt"}`,
    dong.traTruoc > 0 && `${tien(dong.traTruoc)} trả trước cho đợt sau`,
    dong.ngoaiDot > 0 && `${tien(dong.ngoaiDot)} không thuộc đợt nào`,
    dong.tienTha > 0 && `Dung sai làm tròn được tha ${tien(dong.tienTha)}`,
  ].filter((x): x is string => Boolean(x));

  return (
    <div className="flex flex-col gap-5 p-5">
      <section aria-label="Lần thu">
        <div className="flex items-start justify-between gap-3">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{tien(dong.soTien)}</p>
          <StatusPill tone={dong.tone}>{dong.nhan}</StatusPill>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {[dong.nhanDot, dong.ngayThuLabel, dong.nguonLabel].filter(Boolean).join(" · ")}
        </p>

        <dl className="mt-4 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Khách</dt>
          <dd className="min-w-0 truncate font-medium text-foreground">
            {dong.tenKhach || "—"}
            {dong.sdt ? <span className="font-normal text-muted-foreground"> · {dong.sdt}</span> : null}
          </dd>
          <dt className="text-muted-foreground">Đơn hàng</dt>
          <dd className="min-w-0 truncate">
            <Link href={`/orders/${dong.orderId}`} className="font-medium text-primary hover:underline">
              {dong.maDon}
            </Link>
          </dd>
          <dt className="text-muted-foreground">Cơ sở</dt>
          <dd className="min-w-0 truncate text-foreground">{dong.coSo.ten || "—"}</dd>
          <dt className="text-muted-foreground">Email nhận</dt>
          <dd className="min-w-0 truncate text-foreground">
            {dong.emailNhan ?? <span className="text-muted-foreground">Khách chưa có email</span>}
          </dd>
        </dl>
        {dong.coTtHoaDon ? (
          <p className="mt-3">
            <StatusPill tone="info">Có TT hoá đơn</StatusPill>
            <span className="ml-2 text-xs text-muted-foreground">Phụ huynh đã khai người mua trên đơn</span>
          </p>
        ) : null}
      </section>

      {lech.length + dong.hanhDong.canhBao.length > 0 ? (
        <section aria-label="Cần lưu ý" className="rounded-lg bg-state-warning-soft px-3.5 py-3">
          <ul className="flex flex-col gap-1.5 text-sm text-state-warning-ink">
            {[...lech, ...dong.hanhDong.canhBao].map((c) => (
              <li key={c} className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dong.ngan === "da-xuat" && hd ? (
        <HoaDonDaXuat hd={hd} />
      ) : dong.ngan === "khong-xuat" && hd ? (
        <DaDanhDauKhongXuat dong={dong} hoaDonId={hd.id} />
      ) : (
        <ol className="flex flex-col gap-5">
          <Buoc so={1} ten="Phiếu thu">
            <p className="text-sm text-muted-foreground">
              Bản chờ xác nhận để làm hoá đơn ở MISA. Số phiếu cấp khi kế toán xác nhận khoản thu.
            </p>
            {dong.hanhDong.taiPhieu ? (
              <a
                href={`/payments/hoa-don/phieu-cho?don=${encodeURIComponent(dong.orderId)}&chon=${encodeURIComponent(dong.key)}`}
                target="_blank"
                rel="noopener"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2.5")}
              >
                <Download aria-hidden /> Tải phiếu thu
              </a>
            ) : (
              <p className="mt-2 text-sm text-state-warning-ink">{dong.hanhDong.taiLen.lyDo}</p>
            )}
          </Buoc>

          <Buoc so={2} ten="Hoá đơn">
            {dong.ngan === "don-huy" ? (
              <p className="text-sm text-muted-foreground">
                {dong.hanhDong.xacNhan.lyDo ?? "Đơn đã huỷ — không tải hoá đơn cho lần thu này."}
              </p>
            ) : (
              // Mount lại khi bản nháp ra đời / đổi: ô số + ô tệp đọc giá trị MỚI, không giữ tệp đã gửi.
              <FormHoaDon key={dong.hoaDonNhap?.id ?? "moi"} dong={dong} />
            )}
          </Buoc>

          {dong.ngan === "nhap" && dong.hoaDonNhap ? (
            <Buoc so={3} ten="Xác nhận">
              <NutXacNhan key={dong.hoaDonNhap.id} dong={dong} hoaDonId={dong.hoaDonNhap.id} />
            </Buoc>
          ) : null}
        </ol>
      )}

      {dong.hanhDong.khongXuat && (dong.ngan === "cho" || dong.ngan === "lech" || dong.ngan === "don-huy") ? (
        <KhongXuat dong={dong} />
      ) : null}
    </div>
  );
}

function Buoc({ so, ten, children }: { so: number; ten: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
      >
        {so}
      </span>
      <div className="min-w-0">
        <h3 className="flex h-7 items-center text-sm font-semibold text-foreground">{ten}</h3>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}

type TienDo = { viec: string; pct: number | null } | null;

function FormHoaDon({ dong }: { dong: DongHangCho }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const id = useId();
  const nhap = dong.hoaDonNhap;
  const taiLen = dong.hanhDong.taiLen;

  const [pdf, setPdf] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [boXml, setBoXml] = useState(false);
  const [ngay, setNgay] = useState(nhap?.ngayPhatHanh ?? "");
  const [kyHieu, setKyHieu] = useState(nhap?.kyHieu ?? dong.kyHieuMau ?? "");
  const [kyHieuTay, setKyHieuTay] = useState(Boolean(nhap?.kyHieu));
  const [soHoaDon, setSoHoaDon] = useState(nhap?.soHoaDon ?? "");
  const [guiEmail, setGuiEmail] = useState(nhap?.guiEmailKhach ?? true);
  const [tienDo, setTienDo] = useState<TienDo>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [goLan1, setGoLan1] = useState(false);
  const refPdf = useRef<HTMLInputElement>(null);

  const dangGui = tienDo !== null;
  const khongDuocTai = !taiLen.bat;

  function doiNgay(v: string) {
    setNgay(v);
    // Ký hiệu mang HAI SỐ CỦA NĂM phát hành: kế toán chưa tự gõ thì đổi theo ngày vừa chọn.
    if (!kyHieuTay && dong.kyHieuMau && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      setKyHieu(kyHieuTheoNam(dong.kyHieuMau, new Date(`${v}T00:00:00Z`)));
    }
  }

  function chonPdf(f: File | null) {
    setLoi(null);
    if (f && !/\.pdf$/i.test(f.name)) return setLoi("Chỉ nhận tệp PDF của hoá đơn");
    setPdf(f);
  }

  async function luu() {
    if (!nhap && !pdf) return setLoi("Chọn tệp PDF hoá đơn trước");
    setLoi(null);
    try {
      const tepPdf = pdf
        ? await taiTepHoaDon({ orderId: dong.orderId, loai: "pdf", file: pdf, onPct: (pct) => setTienDo({ viec: "Đang tải PDF", pct }) })
        : undefined;
      const tepXml =
        xml && !boXml
          ? await taiTepHoaDon({ orderId: dong.orderId, loai: "xml", file: xml, onPct: (pct) => setTienDo({ viec: "Đang tải XML", pct }) })
          : undefined;
      setTienDo({ viec: "Đang lưu", pct: null });
      const r = await luuHoaDonNhapAction({
        orderId: dong.orderId,
        lanThuKey: dong.key,
        hoaDonId: nhap?.id,
        pdf: tepPdf,
        xml: boXml ? null : tepXml,
        kyHieu,
        soHoaDon,
        ngayPhatHanh: ngay || undefined,
        guiEmailKhach: guiEmail,
      });
      if (!r.ok) return setLoi(r.error);
      toast.success(nhap ? "Đã lưu thay đổi hoá đơn" : "Đã lưu hoá đơn — lần thu chuyển sang “Đã tải tệp”");
      startTransition(() => router.refresh());
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Không lưu được — thử lại");
    } finally {
      setTienDo(null);
    }
  }

  async function go() {
    if (!nhap) return;
    if (!goLan1) {
      setGoLan1(true);
      setTimeout(() => setGoLan1(false), 4000);
      return;
    }
    setTienDo({ viec: "Đang gỡ", pct: null });
    const r = await goHoaDonAction({ orderId: dong.orderId, hoaDonId: nhap.id });
    setTienDo(null);
    if (!r.ok) return setLoi(r.error);
    toast.success("Đã gỡ bản nháp — lần thu về lại hàng chờ");
    startTransition(() => router.refresh());
  }

  if (khongDuocTai && !nhap) {
    return <p className="text-sm text-state-warning-ink">{taiLen.lyDo}</p>;
  }

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void luu();
      }}
    >
      {nhap ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm">
          <TepDaCo hoaDonId={nhap.id} ten={nhap.tepPdfTen} loai="pdf" />
          {nhap.tepXmlTen && !boXml ? <TepDaCo hoaDonId={nhap.id} ten={nhap.tepXmlTen} loai="xml" /> : null}
        </div>
      ) : null}

      <div>
        <Label htmlFor={`${id}-pdf`} className="text-sm font-medium">
          {nhap ? "Thay tệp PDF" : "Tệp PDF hoá đơn"}
        </Label>
        <label
          htmlFor={`${id}-pdf`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            chonPdf(e.dataTransfer.files?.[0] ?? null);
          }}
          className={cn(
            "mt-1.5 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input px-3.5 py-3 text-sm transition-colors duration-150 hover:border-primary hover:bg-primary-soft/40",
            pdf && "border-solid border-primary/60 bg-primary-soft/30",
          )}
        >
          {pdf ? (
            <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          ) : (
            <Upload className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className={cn("min-w-0 truncate", pdf ? "font-medium text-foreground" : "text-muted-foreground")}>
            {pdf ? coTep(pdf) : "Chọn hoặc kéo tệp PDF vào đây"}
          </span>
        </label>
        <input
          ref={refPdf}
          id={`${id}-pdf`}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={dangGui}
          onChange={(e) => chonPdf(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="text-sm">
        {xml ? (
          <p className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 truncate">{coTep(xml)}</span>
            <button type="button" className="shrink-0 text-muted-foreground underline-offset-2 hover:underline" onClick={() => setXml(null)}>
              Bỏ
            </button>
          </p>
        ) : nhap?.tepXmlTen && !boXml ? (
          <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setBoXml(true)}>
            Gỡ tệp XML
          </button>
        ) : (
          <label className="cursor-pointer text-primary underline-offset-2 hover:underline">
            {nhap?.tepXmlTen ? "Tải lại tệp XML" : "Thêm tệp XML (không bắt buộc)"}
            <input
              type="file"
              accept=".xml,application/xml,text/xml"
              className="sr-only"
              disabled={dangGui}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setLoi(null);
                if (f && !/\.xml$/i.test(f.name)) return setLoi("Chỉ nhận tệp XML");
                setXml(f);
                setBoXml(false);
              }}
            />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor={`${id}-ngay`} className="text-sm font-medium">
            Ngày phát hành
          </Label>
          <Input
            id={`${id}-ngay`}
            type="date"
            className="mt-1.5"
            value={ngay}
            max={homNayVn()}
            disabled={dangGui}
            onChange={(e) => doiNgay(e.target.value)}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor={`${id}-kh`} className="text-sm font-medium">
            Ký hiệu
          </Label>
          <Input
            id={`${id}-kh`}
            className="mt-1.5 uppercase tabular-nums"
            value={kyHieu}
            maxLength={10}
            disabled={dangGui}
            autoComplete="off"
            onChange={(e) => {
              setKyHieu(e.target.value.toUpperCase());
              setKyHieuTay(true);
            }}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor={`${id}-so`} className="text-sm font-medium">
            Số hoá đơn
          </Label>
          <Input
            id={`${id}-so`}
            className="mt-1.5 tabular-nums"
            inputMode="numeric"
            placeholder="Ví dụ 127"
            value={soHoaDon}
            maxLength={8}
            disabled={dangGui}
            autoComplete="off"
            onChange={(e) => setSoHoaDon(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--primary)]"
          checked={guiEmail}
          disabled={dangGui}
          onChange={(e) => setGuiEmail(e.target.checked)}
        />
        <span>
          Gửi hoá đơn tới email khách khi xác nhận
          <span className="block text-xs text-muted-foreground">
            {dong.emailNhan
              ? `Tới ${dong.emailNhan}. Bỏ chọn nếu MISA đã gửi khách rồi.`
              : "Khách chưa có email — sale tải hoá đơn trên trang đơn để gửi qua Zalo."}
          </span>
        </span>
      </label>

      {tienDo ? (
        <div aria-live="polite" className="text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {tienDo.viec}
            {tienDo.pct != null ? ` · ${tienDo.pct}%` : "…"}
          </p>
          {tienDo.pct != null ? (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${tienDo.pct}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}
      {loi ? (
        <p role="alert" className="text-sm text-state-danger-ink">
          {loi}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={dangGui || khongDuocTai || (!nhap && !pdf)}>
          {nhap ? "Lưu thay đổi" : "Lưu hoá đơn"}
        </Button>
        {nhap ? (
          <Button type="button" variant="ghost" size="sm" disabled={dangGui} onClick={() => void go()}>
            {goLan1 ? "Bấm lần nữa để gỡ bản nháp" : "Gỡ bản nháp"}
          </Button>
        ) : null}
      </div>
      {khongDuocTai ? <p className="text-sm text-state-warning-ink">{taiLen.lyDo}</p> : null}
    </form>
  );
}

/**
 * ③ Xác nhận — CHỐT hoá đơn (phương án (b), PLAN §0.1): khoản còn chờ mà đủ điều kiện thì cấp RCP
 * trong cùng lượt; không đủ thì giữ chờ và báo lại. Xong ⇒ sang dòng KẾ TIẾP do server tính.
 * Nhãn nút + lý do tắt đọc từ `hanhDongChoDong` — không tự suy ở đây.
 */
function NutXacNhan({ dong, hoaDonId }: { dong: DongHangCho; hoaDonId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const xn = dong.hanhDong.xacNhan;

  async function bam() {
    setDangGui(true);
    setLoi(null);
    const r = await xacNhanHoaDonAction({ orderId: dong.orderId, hoaDonId });
    setDangGui(false);
    if (!r.ok) return setLoi(r.error);
    const phieu = r.data.daXacNhan > 0 ? ` · cấp ${r.data.daXacNhan} phiếu thu` : "";
    toast.success(`Đã xác nhận hoá đơn${phieu}`);
    if (r.data.conCho.length > 0) {
      toast.warning(`${r.data.conCho.length} khoản vẫn chờ kế toán xác nhận: ${r.data.conCho[0]}`);
    }
    const q = new URLSearchParams({ ngan: dong.ngan });
    if (r.data.keKe) q.set("chon", r.data.keKe);
    startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-col gap-2">
      {xn.bat ? (
        <p className="flex items-start gap-2 text-sm text-state-success-ink">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Đủ tệp và số hoá đơn.
        </p>
      ) : null}
      <div>
        <Button type="button" size="sm" disabled={!xn.bat || dangGui} onClick={() => void bam()}>
          {dangGui ? (
            <>
              <Loader2 className="animate-spin" aria-hidden /> Đang xác nhận…
            </>
          ) : (
            (xn.nhan ?? "Xác nhận")
          )}
        </Button>
      </div>
      {!xn.bat && xn.lyDo ? <p className="text-sm text-muted-foreground">{xn.lyDo}</p> : null}
      {loi ? (
        <p role="alert" className="text-sm text-state-danger-ink">
          {loi}
        </p>
      ) : null}
    </div>
  );
}

function TepDaCo({ hoaDonId, ten, loai }: { hoaDonId: string; ten: string | null; loai: "pdf" | "xml" }) {
  return (
    <p className="flex items-center gap-2">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{ten ?? `hoa-don.${loai}`}</span>
      <a
        href={`/payments/hoa-don/${hoaDonId}/tai-ve?loai=${loai}`}
        target="_blank"
        rel="noopener"
        className="shrink-0 font-medium text-primary underline-offset-2 hover:underline"
      >
        Xem
      </a>
    </p>
  );
}

function HoaDonDaXuat({ hd }: { hd: NonNullable<DongHangCho["hoaDon"]> }) {
  return (
    <section aria-label="Hoá đơn đã xuất" className="flex flex-col gap-3">
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Ký hiệu · số</dt>
        <dd className="font-medium tabular-nums text-foreground">
          {hd.kyHieu ?? "—"} · {hd.soHoaDon ?? "—"}
        </dd>
        <dt className="text-muted-foreground">Ngày phát hành</dt>
        <dd className="tabular-nums text-foreground">{ddmmyyyy(hd.ngayPhatHanh)}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        {hd.coPdf ? (
          <a
            href={`/payments/hoa-don/${hd.id}/tai-ve?loai=pdf`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download aria-hidden /> Tải PDF
          </a>
        ) : null}
        {hd.coXml ? (
          <a
            href={`/payments/hoa-don/${hd.id}/tai-ve?loai=xml`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download aria-hidden /> Tải XML
          </a>
        ) : null}
      </div>
    </section>
  );
}

function DaDanhDauKhongXuat({ dong, hoaDonId }: { dong: DongHangCho; hoaDonId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [lan1, setLan1] = useState(false);
  const [dangGui, setDangGui] = useState(false);

  async function go() {
    if (!lan1) {
      setLan1(true);
      setTimeout(() => setLan1(false), 4000);
      return;
    }
    setDangGui(true);
    const r = await goHoaDonAction({ orderId: dong.orderId, hoaDonId });
    setDangGui(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Đã gỡ dấu — lần thu về lại hàng chờ");
    startTransition(() => router.refresh());
  }

  return (
    <section aria-label="Không xuất hoá đơn" className="flex flex-col gap-3">
      <p className="text-sm text-foreground">
        <span className="text-muted-foreground">Lý do: </span>
        {dong.lyDoKhongXuat ?? "—"}
      </p>
      <div>
        <Button type="button" variant="outline" size="sm" disabled={dangGui} onClick={() => void go()}>
          {lan1 ? "Bấm lần nữa để gỡ" : "Gỡ dấu không xuất"}
        </Button>
      </div>
    </section>
  );
}

const LY_DO = [...LY_DO_KHONG_XUAT_CO_DINH, "Khác"] as const;

function KhongXuat({ dong }: { dong: DongHangCho }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const id = useId();
  const [mo, setMo] = useState(false);
  const [lyDo, setLyDo] = useState<(typeof LY_DO)[number]>(LY_DO_DA_XUAT_NGOAI);
  const [ghiChu, setGhiChu] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  if (!mo) {
    return (
      <div className="border-t border-border pt-4">
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setMo(true)}
        >
          Không xuất hoá đơn cho lần thu này…
        </button>
      </div>
    );
  }

  async function gui() {
    setLoi(null);
    setDangGui(true);
    const r = await khongXuatHoaDonAction({ orderId: dong.orderId, lanThuKey: dong.key, lyDo, ghiChu });
    setDangGui(false);
    if (!r.ok) return setLoi(r.error);
    toast.success("Đã đánh dấu không xuất hoá đơn");
    startTransition(() => router.refresh());
  }

  return (
    <fieldset className="flex flex-col gap-3 border-t border-border pt-4" disabled={dangGui}>
      <legend className="sr-only">Không xuất hoá đơn</legend>
      <p className="text-sm font-semibold text-foreground">Không xuất hoá đơn</p>
      <div className="flex flex-col gap-2 text-sm">
        {LY_DO.map((l) => (
          <label key={l} className="flex items-center gap-2.5">
            <input
              type="radio"
              name={`${id}-ly-do`}
              className="h-4 w-4 accent-[color:var(--primary)]"
              checked={lyDo === l}
              onChange={() => setLyDo(l)}
            />
            {l === "Khác" ? "Lý do khác…" : l}
          </label>
        ))}
      </div>
      {lyDo === "Khác" ? (
        <Textarea
          aria-label="Ghi rõ lý do không xuất"
          placeholder="Ghi rõ lý do (ít nhất 5 ký tự)"
          value={ghiChu}
          rows={2}
          onChange={(e) => setGhiChu(e.target.value)}
        />
      ) : null}
      {loi ? (
        <p role="alert" className="text-sm text-state-danger-ink">
          {loi}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void gui()}>
          Đánh dấu không xuất
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setMo(false)}>
          Thôi
        </Button>
      </div>
    </fieldset>
  );
}
