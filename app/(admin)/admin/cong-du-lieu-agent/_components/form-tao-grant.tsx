"use client";

// Form "Cấp quyền mới" — khuôn `taoGrantSchema`. Mở rộng quyền (thêm công cụ, thêm cơ sở, bật
// xem dữ liệu gốc) = tạo một quyền MỚI đi lại đủ quy trình duyệt; không có đường sửa quyền đang
// hoạt động (spec §5.3).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { taoGrantAction } from "../_actions";
import { congNgay, LOP_O_NHAP, MA_HOI_SO, nhanCoSo, nhanNhayCam, ngayXaNhat } from "./dinh-dang";

type CongCu = { ten: string; moTa: string; nhayCam: string };

export function FormTaoGrant({
  clients,
  congCu,
  maCoSo,
  homNay,
  hanDocNgay,
  hanXemGocNgay,
  chanMa,
}: {
  /** Chỉ ứng dụng CHƯA thu hồi/từ chối — `taoGrant` từ chối các ứng dụng đó. */
  clients: { id: string; ten: string; moiTruong: string; nhanTrangThai: string }[];
  congCu: CongCu[];
  maCoSo: string[];
  homNay: string;
  hanDocNgay: number;
  hanXemGocNgay: number;
  chanMa: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const macDinhHan = congNgay(homNay, Math.min(90, hanDocNgay) - 1);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [tenCongCu, setTenCongCu] = useState(congCu[0]?.ten ?? "");
  const [coSo, setCoSo] = useState<string[]>([]);
  const [xemGoc, setXemGoc] = useState(false);
  const [hanMuc, setHanMuc] = useState("");
  const [hetHan, setHetHan] = useState(macDinhHan);
  const [lyDo, setLyDo] = useState("");
  const [ma, setMa] = useState("");

  const ccDangChon = congCu.find((c) => c.ten === tenCongCu);
  // Chỉ công cụ nhạy cảm CAO mới có "dữ liệu gốc" để xem (spec §5.2 + §6).
  const coTheXemGoc = ccDangChon?.nhayCam === "cao";
  const hanToiDa = xemGoc ? hanXemGocNgay : hanDocNgay;
  const ngayMax = ngayXaNhat(homNay, hanToiDa);
  const hanMucSo = hanMuc.trim() === "" ? null : Number(hanMuc);
  const hanMucHopLe = hanMucSo === null || (Number.isInteger(hanMucSo) && hanMucSo >= 1 && hanMucSo <= 100_000);

  const duDieuKien =
    clientId !== "" &&
    tenCongCu !== "" &&
    coSo.length > 0 &&
    hanMucHopLe &&
    hetHan !== "" &&
    hetHan <= ngayMax &&
    lyDo.trim().length >= 10 &&
    /^\d{6}$/.test(ma) &&
    !chanMa;

  function doiCongCu(ten: string) {
    setTenCongCu(ten);
    if (congCu.find((c) => c.ten === ten)?.nhayCam !== "cao") setXemGoc(false);
  }

  function doiXemGoc(bat: boolean) {
    setXemGoc(bat);
    // Bật xem gốc ⇒ trần hạn tụt xuống; kéo ngày về trong trần thay vì để server từ chối.
    if (bat) {
      const max = ngayXaNhat(homNay, hanXemGocNgay);
      if (hetHan > max) setHetHan(max);
    }
  }

  function doiCoSo(m: string, chon: boolean) {
    setCoSo((cu) => (chon ? [...cu, m] : cu.filter((x) => x !== m)));
  }

  function gui() {
    if (!duDieuKien) return;
    startTransition(async () => {
      const kq = await taoGrantAction({
        clientId,
        congCu: tenCongCu,
        coSo,
        xemDuLieuGoc: xemGoc,
        hanMucNgay: hanMucSo,
        hetHan,
        lyDo: lyDo.trim(),
        maXacThuc: ma,
      });
      if (kq.ok) {
        toast.success("Đã tạo quyền — đang chờ người khác duyệt");
        setCoSo([]);
        setXemGoc(false);
        setHanMuc("");
        setHetHan(macDinhHan);
        setLyDo("");
        setMa("");
        router.refresh();
      } else {
        toast.error(kq.error);
        setMa("");
      }
    });
  }

  if (clients.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có ứng dụng nào còn cấp quyền được.</p>;
  }
  if (congCu.length === 0) {
    return <p className="text-sm text-muted-foreground">Sổ công cụ đang rỗng — chưa có gì để cấp.</p>;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        gui();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Ứng dụng <span className="text-state-danger-ink">*</span>
          </span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={pending}
            className={LOP_O_NHAP}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ten} · {c.moiTruong} · {c.nhanTrangThai}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Công cụ <span className="text-state-danger-ink">*</span>
          </span>
          <select
            value={tenCongCu}
            onChange={(e) => doiCongCu(e.target.value)}
            disabled={pending}
            className={LOP_O_NHAP}
          >
            {congCu.map((c) => (
              <option key={c.ten} value={c.ten}>
                {c.ten} — nhạy cảm {nhanNhayCam(c.nhayCam).nhan.toLowerCase()}
              </option>
            ))}
          </select>
          {ccDangChon && (
            <span
              className={`mt-1 block text-xs ${coTheXemGoc ? "font-semibold text-state-danger-ink" : "text-muted-foreground"}`}
            >
              {ccDangChon.moTa}
              {coTheXemGoc ? " · Công cụ nhạy cảm CAO." : ""}
            </span>
          )}
        </label>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1 block text-sm font-semibold text-foreground">
            Cơ sở <span className="text-state-danger-ink">*</span>
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {maCoSo.map((m) => (
              <label key={m} className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={coSo.includes(m)}
                  onChange={(e) => doiCoSo(m, e.target.checked)}
                  disabled={pending}
                  className="h-4 w-4 accent-primary"
                />
                <span className={m === MA_HOI_SO ? "font-semibold" : undefined}>{nhanCoSo(m)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={xemGoc}
            onChange={(e) => doiXemGoc(e.target.checked)}
            disabled={pending || !coTheXemGoc}
            className="mt-0.5 h-4 w-4 accent-primary disabled:cursor-not-allowed"
          />
          <span className="text-sm">
            <span className={`font-semibold ${xemGoc ? "text-state-danger-ink" : "text-foreground"}`}>
              Xem dữ liệu gốc (không che thông tin cá nhân)
            </span>
            <span className="block text-xs text-muted-foreground">
              {coTheXemGoc
                ? `Chỉ bật khi thật cần. Hạn tối đa ${hanXemGocNgay} ngày.`
                : "Chỉ công cụ nhạy cảm CAO mới có dữ liệu gốc để xem."}
            </span>
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-foreground">Hạn mức bản ghi / ngày</span>
          <Input
            type="number"
            min={1}
            max={100000}
            step={1}
            value={hanMuc}
            onChange={(e) => setHanMuc(e.target.value)}
            placeholder="Để trống = không giới hạn"
            disabled={pending}
          />
          {!hanMucHopLe && (
            <span className="mt-1 block text-xs text-state-warning-ink">Số nguyên từ 1 đến 100.000.</span>
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Hết hạn <span className="text-state-danger-ink">*</span>
          </span>
          <input
            type="date"
            value={hetHan}
            min={homNay}
            max={ngayMax}
            onChange={(e) => setHetHan(e.target.value)}
            disabled={pending}
            className={LOP_O_NHAP}
          />
          <span className="mt-1 block text-xs text-muted-foreground">Tối đa {hanToiDa} ngày kể từ hôm nay.</span>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Lý do <span className="text-state-danger-ink">*</span>
          </span>
          <Textarea
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            rows={2}
            maxLength={500}
            disabled={pending}
            placeholder="Agent cần dữ liệu này để làm việc gì."
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Tối thiểu 10 ký tự · đang có {lyDo.trim().length}
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-foreground">
            Mã xác thực 2 lớp <span className="text-state-danger-ink">*</span>
          </span>
          <Input
            value={ma}
            onChange={(e) => setMa(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 chữ số"
            disabled={pending || !!chanMa}
            className="font-mono tracking-widest"
          />
          {chanMa && <span className="mt-1 block text-xs text-state-warning-ink">{chanMa}</span>}
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Quyền mới ở trạng thái <strong>Chờ duyệt</strong>. Mở rộng quyền (thêm công cụ, thêm cơ sở, bật xem
          dữ liệu gốc) = tạo quyền MỚI — không sửa quyền đang hoạt động.
        </p>
        <Button type="submit" disabled={pending || !duDieuKien} className="shrink-0">
          {pending && <Loader2 className="animate-spin" />}
          Cấp quyền
        </Button>
      </div>
    </form>
  );
}
